import { AssistantImageItem } from '@/lib/assistantAttachments';

type TesseractWorkerInstance = {
  recognize: (image: string) => Promise<{ data?: { text?: string; confidence?: number } }>;
  terminate: () => Promise<void>;
};

declare global {
  interface Window {
    Tesseract?: {
      createWorker: (
        langs?: string | string[],
        oem?: number,
        options?: { logger?: (m: { status?: string; progress?: number }) => void },
      ) => Promise<TesseractWorkerInstance>;
    };
  }
}

export type OcrProgressHandler = (pct: number, statusText: string) => void;

const TESSERACT_CDN_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';

let tesseractScriptPromise: Promise<void> | null = null;
let sharedWorkerPromise: Promise<TesseractWorkerInstance> | null = null;
let activeProgressListener: ((m: { status?: string; progress?: number }) => void) | null = null;
let workerQueue: Promise<unknown> = Promise.resolve();

const ocrCache = new Map<string, Promise<string>>();

function isHeadlessTestEnv(): boolean {
  return typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent);
}

function loadTesseractScript(): Promise<void> {
  if (typeof window === 'undefined' || typeof document === 'undefined' || isHeadlessTestEnv()) {
    return Promise.reject(new Error('Tarayıcı ortamı bulunamadı.'));
  }
  if (window.Tesseract) {
    return Promise.resolve();
  }
  if (tesseractScriptPromise) {
    return tesseractScriptPromise;
  }

  tesseractScriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${TESSERACT_CDN_URL}"]`,
    );
    if (existing && window.Tesseract) {
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = TESSERACT_CDN_URL;
    script.async = true;
    script.crossOrigin = 'anonymous';

    const timer = window.setTimeout(() => {
      tesseractScriptPromise = null;
      reject(new Error('Görsel okuma motoru yükleme zaman aşımına uğradı.'));
    }, 15_000);

    script.onload = () => {
      window.clearTimeout(timer);
      if (window.Tesseract) {
        resolve();
      } else {
        tesseractScriptPromise = null;
        reject(new Error('Görsel okuma motoru başlatılamadı.'));
      }
    };

    script.onerror = () => {
      window.clearTimeout(timer);
      tesseractScriptPromise = null;
      reject(new Error('Görsel okuma kütüphanesi yüklenemedi.'));
    };

    document.head.appendChild(script);
  });

  return tesseractScriptPromise;
}

/**
 * Returns a persistent singleton Tesseract worker loaded ONLY with `'tur'` (2.1 MB on jsDelivr,
 * already includes Turkish + Latin A-Z + numbers + math operators), avoiding 404/duplicate packs
 * and giving 0ms startup on all subsequent images.
 */
async function getSharedOcrWorker(onProgress?: OcrProgressHandler): Promise<TesseractWorkerInstance> {
  if (!sharedWorkerPromise) {
    sharedWorkerPromise = (async () => {
      onProgress?.(12, 'Görsel okuma motoru başlatılıyor...');
      await loadTesseractScript();
      if (!window.Tesseract) {
        throw new Error('Görsel okuma motoru hazır değil.');
      }
      const worker = await window.Tesseract.createWorker('tur', 1, {
        logger: (m) => {
          activeProgressListener?.(m);
        },
      });
      return worker;
    })().catch((err) => {
      sharedWorkerPromise = null;
      throw err;
    });
  }
  return sharedWorkerPromise;
}

/**
 * Fast canvas contrast optimization capped at 1180px JPEG (0.88) so Tesseract scans
 * full textbook pages in ~2-3 seconds instead of 15-20 seconds.
 */
async function prepareFastHighContrastJpeg(srcUrl: string): Promise<string> {
  if (typeof document === 'undefined' || isHeadlessTestEnv()) {
    return srcUrl;
  }

  return new Promise((resolve) => {
    const img = new Image();
    const timer = window.setTimeout(() => resolve(srcUrl), 3000);

    img.onload = () => {
      window.clearTimeout(timer);
      try {
        const rawW = img.naturalWidth || img.width;
        const rawH = img.naturalHeight || img.height;
        if (!rawW || !rawH) {
          resolve(srcUrl);
          return;
        }

        const maxDim = Math.max(rawW, rawH);
        const scale = maxDim > 1180 ? 1180 / maxDim : maxDim < 760 ? Math.min(1.6, 980 / maxDim) : 1;
        const pad = 16;
        const targetW = Math.max(1, Math.round(rawW * scale));
        const targetH = Math.max(1, Math.round(rawH * scale));

        const canvas = document.createElement('canvas');
        canvas.width = targetW + pad * 2;
        canvas.height = targetH + pad * 2;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(srcUrl);
          return;
        }

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, pad, pad, targetW, targetH);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const px = imageData.data;

        let minLum = 255;
        let maxLum = 0;
        let lumSum = 0;
        let samples = 0;
        for (let i = 0; i < px.length; i += 32) {
          const lum = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
          if (lum < minLum) minLum = lum;
          if (lum > maxLum) maxLum = lum;
          lumSum += lum;
          samples++;
        }

        const avgLum = samples > 0 ? lumSum / samples : 200;
        const isDarkTheme = avgLum < 95;
        const range = Math.max(45, maxLum - minLum);

        for (let i = 0; i < px.length; i += 4) {
          let lum = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
          if (isDarkTheme) lum = 255 - lum;
          let norm = ((lum - (isDarkTheme ? 255 - maxLum : minLum)) / range) * 255;
          norm = norm < 142 ? Math.max(0, norm * 0.76) : Math.min(255, norm * 1.08 + 14);
          const v = norm < 0 ? 0 : norm > 255 ? 255 : norm | 0;
          px[i] = v;
          px[i + 1] = v;
          px[i + 2] = v;
        }

        ctx.putImageData(imageData, 0, 0);
        resolve(canvas.toDataURL('image/jpeg', 0.88));
      } catch {
        resolve(srcUrl);
      }
    };

    img.onerror = () => {
      window.clearTimeout(timer);
      resolve(srcUrl);
    };

    img.src = srcUrl;
  });
}

function cleanOcrMathText(raw: string): string {
  return raw
    .replace(/\r\n/g, '\n')
    .replace(/[—–]/g, '-')
    .replace(/[×✕]/g, '*')
    .replace(/÷/g, '/')
    .replace(/[“”]/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function recognizeSingleImageCached(
  img: AssistantImageItem,
  onProgress?: OcrProgressHandler,
): Promise<string> {
  const existing = ocrCache.get(img.id);
  if (existing) {
    onProgress?.(55, `Görsel metni tamamlanıyor (${img.name})...`);
    return existing;
  }

  const task = new Promise<string>((resolve, reject) => {
    workerQueue = workerQueue.then(async () => {
      try {
        activeProgressListener = (m) => {
          if (typeof m.progress === 'number') {
            if (m.status?.includes('loading') || m.status?.includes('initializing')) {
              const p = 15 + Math.round(m.progress * 20);
              onProgress?.(p, `Görsel okuma dil paketi hazırlanıyor (%${p})...`);
            } else if (m.status === 'recognizing text') {
              const p = 35 + Math.round(m.progress * 60);
              onProgress?.(p, `Görseldeki soru, tablo ve denklemler okunuyor (%${p})...`);
            }
          }
        };

        const worker = await getSharedOcrWorker(onProgress);
        const enhancedUrl = await prepareFastHighContrastJpeg(img.previewUrl);
        onProgress?.(38, `Görseldeki soru ve sayılar taranıyor (${img.name})...`);
        const result = await worker.recognize(enhancedUrl);
        onProgress?.(96, 'Görsel okuma tamamlandı.');
        resolve(cleanOcrMathText(result?.data?.text || ''));
      } catch (err) {
        ocrCache.delete(img.id);
        reject(err);
      } finally {
        activeProgressListener = null;
      }
    });
  });

  ocrCache.set(img.id, task);
  return task;
}

/**
 * Starts OCR immediately in the background as soon as the user selects a gallery image,
 * so by the time they press Send, the question text is already extracted or nearly done!
 */
export function prewarmAndCacheImageOcr(images: AssistantImageItem[]): void {
  if (!images.length || isHeadlessTestEnv()) return;
  for (const img of images) {
    void recognizeSingleImageCached(img).catch(() => {
      // Ignore background prewarm failures; foreground call will handle if needed
    });
  }
}

/**
 * Extracts Turkish + Mathematical text from 1..N attached gallery PNG/JPG images,
 * reusing any background pre-OCR already started when the user selected the file.
 */
export async function extractMathTextFromImages(
  images: AssistantImageItem[],
  onProgress?: OcrProgressHandler,
): Promise<string> {
  if (!images.length || isHeadlessTestEnv()) return '';

  const extractedParts: string[] = [];

  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    const cleaned = await recognizeSingleImageCached(img, (pct, label) => {
      const scaledPct = Math.round(((i + pct / 100) / images.length) * 100);
      onProgress?.(
        Math.min(99, Math.max(8, scaledPct)),
        images.length > 1 ? `[Görsel ${i + 1}/${images.length}] ${label}` : label,
      );
    });

    if (cleaned) {
      extractedParts.push(
        images.length > 1 ? `[Görsel ${i + 1} - ${img.name}]:\n${cleaned}` : cleaned,
      );
    }
  }

  return extractedParts.join('\n\n').trim();
}
