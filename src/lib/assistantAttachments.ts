export interface AssistantImageItem {
  id: string;
  kind: 'image';
  name: string;
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp';
  base64Data: string;
  previewUrl: string;
  sizeLabel: string;
}

export interface AssistantDocumentItem {
  id: string;
  kind: 'document';
  name: string;
  textContent: string;
  pages?: number;
  sizeLabel: string;
}

export type AssistantAttachment = AssistantImageItem | AssistantDocumentItem;

export const MAX_IMAGE_ATTACHMENTS = 3;
export const MAX_RAW_FILE_BYTES = 15 * 1024 * 1024; // 15 MB
const MAX_IMAGE_DIMENSION = 1568; // Optimal high-res tile size for GPT-4o & Gemini Vision

const IMAGE_MIME_SET = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/pjpeg',
  'image/webp',
]);

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function isSupportedImageFile(file: File): boolean {
  const mime = (file.type || '').toLowerCase();
  const name = (file.name || '').toLowerCase();
  if (IMAGE_MIME_SET.has(mime)) return true;
  if (/\.(png|jpe?g|webp)$/i.test(name)) return true;
  // Allow mobile Safari / Android gallery HEIC/HEIF photos when browser decodes them natively to JPEG via canvas
  if (mime === 'image/heic' || mime === 'image/heif' || /\.(heic|heif)$/i.test(name)) {
    return typeof navigator !== 'undefined' && !/jsdom/i.test(navigator.userAgent);
  }
  return false;
}

export function isUnsupportedImageFormat(file: File): boolean {
  const mime = (file.type || '').toLowerCase();
  const name = (file.name || '').toLowerCase();
  return (
    (mime.startsWith('image/') && !isSupportedImageFile(file)) ||
    /\.(heic|heif|gif|bmp|tiff?|svg)$/i.test(name)
  );
}

function normalizeImageMime(file: File): 'image/png' | 'image/jpeg' | 'image/webp' {
  const mime = (file.type || '').toLowerCase();
  const name = (file.name || '').toLowerCase();
  if (mime === 'image/png' || name.endsWith('.png')) return 'image/png';
  if (mime === 'image/webp' || name.endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Görsel dosyası okunamadı.'));
    reader.readAsDataURL(file);
  });
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    if (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent)) {
      reject(new Error('Headless ortamda doğrudan base64 kullanılır.'));
      return;
    }
    const img = new Image();
    const timer = setTimeout(() => {
      reject(new Error('Görsel çözümleme zaman aşımına uğradı.'));
    }, 4000);
    img.onload = () => {
      clearTimeout(timer);
      resolve(img);
    };
    img.onerror = () => {
      clearTimeout(timer);
      reject(new Error('Görsel çözümlenemedi.'));
    };
    img.src = src;
  });
}

function makeId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Optimizes PNG / JPG / WebP gallery photos cleanly on HTML5 Canvas:
 * - Uses URL.createObjectURL first to avoid large RAM spikes on mobile Safari/Chrome
 * - Fills pure #ffffff background so transparent-background PNG equations stay crisp dark-on-white
 * - Keeps payload compact (~200-550 KB) so Edge Function gateways never reject for body size
 */
export async function processImageAttachment(
  file: File,
  onProgress?: (pct: number, label: string) => void,
): Promise<AssistantImageItem> {
  if (file.size > MAX_RAW_FILE_BYTES) {
    throw new Error('Görsel boyutu 15 MB sınırını aşıyor. Lütfen daha küçük bir görsel seçin.');
  }
  if (!isSupportedImageFile(file)) {
    throw new Error('Lütfen galeriden PNG veya JPG/JPEG formatında bir resim seçin.');
  }

  onProgress?.(20, `${file.name || 'Soru görseli'} okunuyor...`);
  const originalMime = normalizeImageMime(file);
  const isHeicLike = /\.(heic|heif)$/i.test(file.name || '') || /heic|heif/i.test(file.type || '');

  // Prefer lightweight ObjectURL decode in real browsers
  let objectUrl: string | null = null;
  try {
    if (
      typeof URL !== 'undefined' &&
      typeof URL.createObjectURL === 'function' &&
      !(typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent))
    ) {
      objectUrl = URL.createObjectURL(file);
    }

    const decodeSrc = objectUrl || (await readFileAsDataUrl(file));
    onProgress?.(50, 'Görsel netliği ve boyutu optimize ediliyor...');
    const img = await loadImageElement(decodeSrc);
    const width = img.naturalWidth || img.width;
    const height = img.naturalHeight || img.height;

    if (width && height && typeof document !== 'undefined') {
      const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(width, height));
      const targetW = Math.max(1, Math.round(width * scale));
      const targetH = Math.max(1, Math.round(height * scale));

      const canvas = document.createElement('canvas');
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d');

      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, targetW, targetH);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, targetW, targetH);

        let outputMime: 'image/png' | 'image/jpeg' =
          originalMime === 'image/png' && targetW * targetH <= 700_000 ? 'image/png' : 'image/jpeg';

        let finalDataUrl =
          outputMime === 'image/png'
            ? canvas.toDataURL('image/png')
            : canvas.toDataURL('image/jpeg', 0.85);

        if (finalDataUrl.length > 720_000) {
          outputMime = 'image/jpeg';
          finalDataUrl = canvas.toDataURL('image/jpeg', 0.74);
        }

        if (finalDataUrl.startsWith('data:image/')) {
          const base64Data = finalDataUrl.split(',')[1] || '';
          if (base64Data.length > 0) {
            const approxBytes = Math.round((base64Data.length * 3) / 4);
            return {
              id: makeId(),
              kind: 'image',
              name: file.name || (outputMime === 'image/png' ? 'soru.png' : 'soru.jpg'),
              mimeType: outputMime,
              base64Data,
              previewUrl: finalDataUrl,
              sizeLabel: formatFileSize(approxBytes),
            };
          }
        }
      }
    }
  } catch {
    if (isHeicLike) {
      throw new Error('Bu fotoğraf biçimi tarayıcınızda çözümlenemedi. Lütfen PNG veya JPG formatında seçin.');
    }
    // Fall back to direct FileReader base64 below
  } finally {
    if (objectUrl && typeof URL.revokeObjectURL === 'function') {
      URL.revokeObjectURL(objectUrl);
    }
  }

  const rawDataUrl = await readFileAsDataUrl(file);
  const fallbackBase64 = rawDataUrl.includes(',') ? rawDataUrl.split(',')[1] : rawDataUrl;
  if (!fallbackBase64) {
    throw new Error('Görsel verisi okunamadı. Lütfen başka bir PNG veya JPG seçin.');
  }

  return {
    id: makeId(),
    kind: 'image',
    name: file.name || 'soru-gorseli.png',
    mimeType: originalMime,
    base64Data: fallbackBase64,
    previewUrl: `data:${originalMime};base64,${fallbackBase64}`,
    sizeLabel: formatFileSize(file.size),
  };
}

/**
 * Combines 1..N attached images vertically onto a single crisp sheet when calling
 * single-document vision endpoints.
 */
export async function combineImagesForSingleDocument(
  images: AssistantImageItem[],
): Promise<{ data: string; mimeType: string }> {
  if (images.length === 1) {
    return { data: images[0].base64Data, mimeType: images[0].mimeType };
  }

  try {
    const loaded = await Promise.all(images.map((item) => loadImageElement(item.previewUrl)));
    const maxWidth = Math.min(
      MAX_IMAGE_DIMENSION,
      Math.max(...loaded.map((im) => im.naturalWidth || im.width || 800)),
    );
    const gap = 18;
    const scaledHeights = loaded.map((im) => {
      const w = im.naturalWidth || im.width || maxWidth;
      const h = im.naturalHeight || im.height || 600;
      return Math.max(1, Math.round(h * (maxWidth / w)));
    });
    const totalHeight = scaledHeights.reduce((acc, h) => acc + h, 0) + gap * (loaded.length - 1);

    const canvas = document.createElement('canvas');
    canvas.width = maxWidth;
    canvas.height = Math.min(totalHeight, 3600);
    const yScale = canvas.height / totalHeight;

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      let y = 0;
      loaded.forEach((im, idx) => {
        const drawH = Math.round(scaledHeights[idx] * yScale);
        ctx.drawImage(im, 0, y, canvas.width, drawH);
        y += drawH + Math.round(gap * yScale);
      });
      const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
      const b64 = dataUrl.split(',')[1];
      if (b64) {
        return { data: b64, mimeType: 'image/jpeg' };
      }
    }
  } catch {
    // Fallback to first image if stitching fails
  }

  return { data: images[0].base64Data, mimeType: images[0].mimeType };
}

/**
 * Renders up to the first `maxPages` of a scanned PDF as crisp JPEG images
 * so scanned math/engineering exam PDFs can still be solved visually.
 */
async function renderScannedPdfToImages(
  file: File,
  maxPages = 3,
  onProgress?: (pct: number, label: string) => void,
): Promise<AssistantImageItem[]> {
  onProgress?.(25, 'Taranmış PDF sayfaları görüntüye aktarılıyor...');
  const [pdfjsLib, pdfWorkerMod] = await Promise.all([
    import('pdfjs-dist/legacy/build/pdf.js'),
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    import('pdfjs-dist/legacy/build/pdf.worker.min.js?url'),
  ]);
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerMod.default;

  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  const pageCount = Math.min(pdf.numPages, maxPages);
  const rendered: AssistantImageItem[] = [];

  for (let i = 1; i <= pageCount; i++) {
    onProgress?.(
      30 + Math.round((i / pageCount) * 65),
      `Taranmış PDF sayfası hazırlanıyor (${i}/${pageCount})...`,
    );
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 1.6 });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) continue;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;

    const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
    const base64Data = dataUrl.split(',')[1] || '';
    if (base64Data) {
      rendered.push({
        id: makeId(),
        kind: 'image',
        name: `${file.name} (Sayfa ${i})`,
        mimeType: 'image/jpeg',
        base64Data,
        previewUrl: dataUrl,
        sizeLabel: formatFileSize(Math.round((base64Data.length * 3) / 4)),
      });
    }
  }

  return rendered;
}

/**
 * Processes a non-image document (.pdf, .docx, .pptx, .txt, .md, .csv).
 * Returns either extracted text document OR rendered page images if the PDF is scanned.
 */
export async function processDocumentOrScannedPdf(
  file: File,
  onProgress?: (pct: number, label: string) => void,
): Promise<{ document?: AssistantDocumentItem; scannedImages?: AssistantImageItem[] }> {
  if (file.size > MAX_RAW_FILE_BYTES) {
    throw new Error('Dosya boyutu 15 MB sınırını aşıyor.');
  }

  const lowerName = file.name.toLowerCase();
  onProgress?.(10, `${file.name} okunuyor...`);

  if (lowerName.endsWith('.csv') || file.type === 'text/csv') {
    const text = (await file.text()).slice(0, 35_000);
    if (!text.trim()) throw new Error('CSV dosyası boş görünüyor.');
    onProgress?.(100, 'Tablo verisi hazır.');
    return {
      document: {
        id: makeId(),
        kind: 'document',
        name: file.name,
        textContent: text,
        sizeLabel: formatFileSize(file.size),
      },
    };
  }

  const isPdf = file.type === 'application/pdf' || lowerName.endsWith('.pdf');

  try {
    const { extractFile } = await import('@/lib/extractFile');
    const extracted = await extractFile(file, onProgress);
    if (extracted.kind === 'text') {
      const stripped = extracted.text.replace(/---\s*Sayfa\s*\d+\s*---/g, '').trim();
      if (isPdf && stripped.length < 25) {
        const scannedImages = await renderScannedPdfToImages(file, MAX_IMAGE_ATTACHMENTS, onProgress);
        if (scannedImages.length > 0) {
          onProgress?.(100, 'Taranmış ders notu hazır.');
          return { scannedImages };
        }
      }
      onProgress?.(100, 'Ders notu hazır.');
      return {
        document: {
          id: makeId(),
          kind: 'document',
          name: file.name,
          textContent: extracted.text.slice(0, 35_000),
          pages: extracted.pages,
          sizeLabel: formatFileSize(file.size),
        },
      };
    }
    if (extracted.kind === 'image') {
      const imgItem = await processImageAttachment(file, onProgress);
      onProgress?.(100, 'Görsel hazır.');
      return { scannedImages: [imgItem] };
    }
  } catch (err: any) {
    if (isPdf) {
      try {
        const scannedImages = await renderScannedPdfToImages(file, MAX_IMAGE_ATTACHMENTS, onProgress);
        if (scannedImages.length > 0) {
          onProgress?.(100, 'Taranmış ders notu hazır.');
          return { scannedImages };
        }
      } catch {
        // fall through
      }
    }
    throw new Error(err?.message || 'Dosya içeriği okunamadı.');
  }

  throw new Error('Desteklenmeyen dosya biçimi. PNG, JPG, PDF, DOCX, PPTX veya TXT yükleyebilirsiniz.');
}
