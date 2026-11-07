import { AssistantImageItem } from '@/lib/assistantAttachments';

declare global {
  interface Window {
    Tesseract?: {
      createWorker: (
        langs?: string | string[],
        oem?: number,
        options?: { logger?: (m: { status?: string; progress?: number }) => void },
      ) => Promise<{
        recognize: (image: string) => Promise<{ data?: { text?: string; confidence?: number } }>;
        terminate: () => Promise<void>;
      }>;
    };
  }
}

const TESSERACT_CDN_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';

let tesseractScriptPromise: Promise<void> | null = null;

function loadTesseractScript(): Promise<void> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
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
      reject(new Error('OCR motoru yükleme zaman aşımına uğradı.'));
    }, 20_000);

    script.onload = () => {
      window.clearTimeout(timer);
      if (window.Tesseract) {
        resolve();
      } else {
        tesseractScriptPromise = null;
        reject(new Error('OCR motoru başlatılamadı.'));
      }
    };

    script.onerror = () => {
      window.clearTimeout(timer);
      tesseractScriptPromise = null;
      reject(new Error('OCR kütüphanesi yüklenemedi.'));
    };

    document.head.appendChild(script);
  });

  return tesseractScriptPromise;
}

/**
 * Enhances contrast, adds clean white padding, and upscales small crops on an offscreen canvas
 * so superscripts, subscripts, fractions, and Turkish characters are read accurately by OCR.
 */
async function prepareHighContrastOcrDataUrl(srcUrl: string): Promise<string> {
  if (
    typeof document === 'undefined' ||
    (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent))
  ) {
    return srcUrl;
  }

  return new Promise((resolve) => {
    const img = new Image();
    const timer = window.setTimeout(() => resolve(srcUrl), 3500);

    img.onload = () => {
      window.clearTimeout(timer);
      try {
        const rawW = img.naturalWidth || img.width;
        const rawH = img.naturalHeight || img.height;
        if (!rawW || !rawH) {
          resolve(srcUrl);
          return;
        }

        // Upscale smaller screenshots so exponents & subscripts are >= 24px tall
        const scale = rawW < 1000 ? Math.min(2.0, 1300 / rawW) : 1;
        const pad = 24;
        const targetW = Math.round(rawW * scale);
        const targetH = Math.round(rawH * scale);

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

        // Compute min/max luminance for gentle adaptive contrast stretching
        let minLum = 255;
        let maxLum = 0;
        for (let i = 0; i < px.length; i += 16) {
          const lum = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
          if (lum < minLum) minLum = lum;
          if (lum > maxLum) maxLum = lum;
        }

        // Invert dark-mode screenshots automatically so ink is dark on white paper
        let sumBorderLum = 0;
        let borderSamples = 0;
        const innerStart = (pad * canvas.width + pad) * 4;
        if (innerStart < px.length) {
          for (let x = pad; x < pad + targetW; x += Math.max(1, Math.floor(targetW / 25))) {
            const topIdx = (pad * canvas.width + x) * 4;
            sumBorderLum += 0.299 * px[topIdx] + 0.587 * px[topIdx + 1] + 0.114 * px[topIdx + 2];
            borderSamples++;
          }
        }
        const isDarkThemeImage = borderSamples > 0 && sumBorderLum / borderSamples < 95;
        const range = Math.max(40, maxLum - minLum);

        for (let i = 0; i < px.length; i += 4) {
          let lum = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
          if (isDarkThemeImage) {
            lum = 255 - lum;
          }
          let norm = ((lum - (isDarkThemeImage ? 255 - maxLum : minLum)) / range) * 255;
          // Mild S-curve contrast boost
          norm = norm < 145 ? Math.max(0, norm * 0.78) : Math.min(255, norm * 1.08 + 12);
          const v = Math.round(Math.max(0, Math.min(255, norm)));
          px[i] = v;
          px[i + 1] = v;
          px[i + 2] = v;
          px[i + 3] = 255;
        }

        ctx.putImageData(imageData, 0, 0);
        resolve(canvas.toDataURL('image/png'));
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

/**
 * Extracts Turkish + English + Mathematical text from 1..N attached gallery PNG/JPG images
 * directly in the browser when cloud Vision endpoints are temporarily unavailable.
 */
export async function extractMathTextFromImages(
  images: AssistantImageItem[],
  onStatus?: (status: string) => void,
): Promise<string> {
  if (!images.length) return '';
  if (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent)) {
    return '';
  }

  onStatus?.('Görsel okuma motoru hazırlanıyor...');
  await loadTesseractScript();

  if (!window.Tesseract) {
    throw new Error('Görsel okuma motoru yüklenemedi.');
  }

  let worker: Awaited<ReturnType<NonNullable<Window['Tesseract']>['createWorker']>> | null = null;

  try {
    try {
      worker = await window.Tesseract.createWorker(['tur', 'eng', 'equ'], 1, {
        logger: (m) => {
          if (m.status === 'recognizing text' && typeof m.progress === 'number') {
            const pct = Math.min(99, Math.max(5, Math.round(m.progress * 100)));
            onStatus?.(`Görseldeki soru ve denklemler taranıyor (%${pct})...`);
          }
        },
      });
    } catch {
      worker = await window.Tesseract.createWorker(['tur', 'eng'], 1);
    }

    const extractedParts: string[] = [];

    for (let i = 0; i < images.length; i++) {
      const img = images[i];
      onStatus?.(
        images.length > 1
          ? `Görsel ${i + 1}/${images.length} okunuyor (${img.name})...`
          : `Görseldeki soru ve semboller okunuyor (${img.name})...`,
      );
      const enhancedUrl = await prepareHighContrastOcrDataUrl(img.previewUrl);
      const result = await worker.recognize(enhancedUrl);
      const cleaned = cleanOcrMathText(result?.data?.text || '');
      if (cleaned) {
        extractedParts.push(
          images.length > 1 ? `[Görsel ${i + 1} - ${img.name}]:\n${cleaned}` : cleaned,
        );
      }
    }

    return extractedParts.join('\n\n').trim();
  } finally {
    if (worker) {
      try {
        await worker.terminate();
      } catch {
        // ignore worker cleanup errors
      }
    }
  }
}
