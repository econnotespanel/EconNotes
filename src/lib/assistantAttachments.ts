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
const MAX_IMAGE_DIMENSION = 2048;

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
  return /\.(png|jpe?g|webp)$/i.test(name);
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
    }, 2500);
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
 * Optimizes PNG / JPG / WebP images selected from mobile gallery, camera, or clipboard
 * while keeping mathematical subscripts, exponents, matrices, and circuit diagrams crisp.
 */
export async function processImageAttachment(file: File): Promise<AssistantImageItem> {
  if (file.size > MAX_RAW_FILE_BYTES) {
    throw new Error('Görsel boyutu 15 MB sınırını aşıyor. Lütfen daha küçük bir görsel seçin.');
  }
  if (!isSupportedImageFile(file)) {
    throw new Error('Lütfen PNG veya JPG/JPEG formatında bir resim seçin.');
  }

  const rawDataUrl = await readFileAsDataUrl(file);
  const originalMime = normalizeImageMime(file);
  const fallbackBase64 = rawDataUrl.includes(',') ? rawDataUrl.split(',')[1] : rawDataUrl;

  try {
    const img = await loadImageElement(rawDataUrl);
    const width = img.naturalWidth || img.width;
    const height = img.naturalHeight || img.height;

    if (!width || !height || typeof document === 'undefined') {
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

    const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(width, height));
    const targetW = Math.max(1, Math.round(width * scale));
    const targetH = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
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

    // Fill pure white background so transparent-background PNG equations remain dark-on-white
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, targetW, targetH);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, targetW, targetH);

    // Keep lossless PNG for sharp screenshots when compact; use high-quality JPEG for large photos
    let outputMime: 'image/png' | 'image/jpeg' =
      originalMime === 'image/png' && targetW * targetH <= 1_400_000 ? 'image/png' : 'image/jpeg';
    let finalDataUrl =
      outputMime === 'image/png'
        ? canvas.toDataURL('image/png')
        : canvas.toDataURL('image/jpeg', 0.9);

    // If PNG export is still heavy (> 1.8 MB base64) or canvas fell back, re-encode as crisp JPEG
    if (outputMime === 'image/png' && finalDataUrl.length > 1_800_000) {
      outputMime = 'image/jpeg';
      finalDataUrl = canvas.toDataURL('image/jpeg', 0.9);
    }

    if (!finalDataUrl.startsWith('data:image/')) {
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

    const base64Data = finalDataUrl.split(',')[1] || fallbackBase64;
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
  } catch {
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
}

/**
 * Renders up to the first `maxPages` of a scanned PDF as crisp JPEG images
 * so scanned math/engineering exam PDFs can still be solved visually.
 */
async function renderScannedPdfToImages(file: File, maxPages = 3): Promise<AssistantImageItem[]> {
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
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 1.75 });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) continue;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;

    const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
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
): Promise<{ document?: AssistantDocumentItem; scannedImages?: AssistantImageItem[] }> {
  if (file.size > MAX_RAW_FILE_BYTES) {
    throw new Error('Dosya boyutu 15 MB sınırını aşıyor.');
  }

  const lowerName = file.name.toLowerCase();

  if (lowerName.endsWith('.csv') || file.type === 'text/csv') {
    const text = (await file.text()).slice(0, 35_000);
    if (!text.trim()) throw new Error('CSV dosyası boş görünüyor.');
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
    const extracted = await extractFile(file);
    if (extracted.kind === 'text') {
      // Check if PDF had only page headers and virtually no real text (scanned exam sheet)
      const stripped = extracted.text.replace(/---\s*Sayfa\s*\d+\s*---/g, '').trim();
      if (isPdf && stripped.length < 25) {
        const scannedImages = await renderScannedPdfToImages(file, MAX_IMAGE_ATTACHMENTS);
        if (scannedImages.length > 0) {
          return { scannedImages };
        }
      }
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
      const imgItem = await processImageAttachment(file);
      return { scannedImages: [imgItem] };
    }
  } catch (err: any) {
    if (isPdf) {
      try {
        const scannedImages = await renderScannedPdfToImages(file, MAX_IMAGE_ATTACHMENTS);
        if (scannedImages.length > 0) {
          return { scannedImages };
        }
      } catch {
        // fall through to original error
      }
    }
    throw new Error(err?.message || 'Dosya içeriği okunamadı.');
  }

  throw new Error('Desteklenmeyen dosya biçimi. PNG, JPG, PDF, DOCX, PPTX veya TXT yükleyebilirsiniz.');
}
