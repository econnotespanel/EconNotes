import * as pdfjsLib from 'pdfjs-dist';
// @ts-expect-error Vite resolves worker asset URL natively
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.js?url';
import JSZip from 'jszip';

// Guarantee worker script resolves locally in production and development without external CDN calls
if (typeof window !== 'undefined' && pdfjsLib.GlobalWorkerOptions) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
}

export interface ExtractedImagePage {
  data: string;
  mimeType: string;
  pageLabel?: string;
}

export type Extracted =
  | {
      kind: 'text';
      text: string;
      pages?: number;
      images?: ExtractedImagePage[];
      isScannedOcr?: boolean;
    }
  | { kind: 'image'; data: string; mime: string }
  | { kind: 'audio'; data: string; mime: string };

export const ACCEPTED_FILES =
  '.txt,.md,.pdf,.pptx,.docx,.mp3,.wav,.m4a,.ogg,.webm,.png,.jpg,.jpeg,.webp';

function decodeXmlEntities(input: string): string {
  return input
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, dec) => {
      const code = Number(dec);
      return Number.isFinite(code) ? String.fromCodePoint(code) : _;
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
      const code = parseInt(hex, 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : _;
    });
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      resolve(result.split(',')[1] || '');
    };
    reader.onerror = () => reject(new Error('Dosya okunamadı.'));
    reader.readAsDataURL(file);
  });
}

async function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  if (typeof file.arrayBuffer === 'function') {
    return file.arrayBuffer();
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(new Error('Dosya arabelleği okunamadı.'));
    reader.readAsArrayBuffer(file);
  });
}

interface PdfTextItemLike {
  str?: string;
  hasEOL?: boolean;
  transform?: number[];
}

interface PdfPageLike {
  getTextContent(): Promise<{ items: PdfTextItemLike[] }>;
  getViewport(opts: { scale: number }): { width: number; height: number };
  render(opts: { canvasContext: CanvasRenderingContext2D; viewport: unknown }): {
    promise: Promise<unknown>;
  };
}

interface PdfDocumentLike {
  numPages: number;
  getPage(pageNumber: number): Promise<PdfPageLike>;
}

function formatPdfItemsToText(items: PdfTextItemLike[]): string {
  const lines: string[] = [];
  let currentLine = '';
  let lastY: number | null = null;

  for (const it of items) {
    if (!it || typeof it !== 'object' || !('str' in it)) continue;
    const str = String(it.str || '');
    const y = Array.isArray(it.transform) ? Number(it.transform[5]) : null;

    if (lastY !== null && y !== null && Math.abs(y - lastY) > 4) {
      if (currentLine.trim()) lines.push(currentLine.trim());
      currentLine = str;
    } else {
      const needsSpace =
        currentLine.length > 0 &&
        str.length > 0 &&
        !currentLine.endsWith(' ') &&
        !str.startsWith(' ') &&
        !currentLine.endsWith('-');
      currentLine += (needsSpace ? ' ' : '') + str;
    }

    if (it.hasEOL && currentLine.trim()) {
      lines.push(currentLine.trim());
      currentLine = '';
    }
    if (y !== null) lastY = y;
  }

  if (currentLine.trim()) lines.push(currentLine.trim());
  return lines.join('\n');
}

async function renderPdfPagesAsImages(
  pdf: PdfDocumentLike,
  totalPages: number,
  maxImages = 8,
): Promise<ExtractedImagePage[]> {
  if (typeof document === 'undefined') return [];
  const step = totalPages <= maxImages ? 1 : totalPages / maxImages;
  const pageIndices: number[] = [];
  for (let i = 0; i < Math.min(maxImages, totalPages); i++) {
    const p = Math.min(totalPages, Math.max(1, Math.round(1 + i * step)));
    if (!pageIndices.includes(p)) pageIndices.push(p);
  }

  const images: ExtractedImagePage[] = [];
  for (const pageNum of pageIndices) {
    try {
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1.45 });
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.floor(viewport.width));
      canvas.height = Math.max(1, Math.floor(viewport.height));
      const ctx = canvas.getContext('2d');
      if (!ctx) continue;

      await page.render({ canvasContext: ctx, viewport }).promise;
      const dataUrl = canvas.toDataURL('image/jpeg', 0.78);
      const b64 = dataUrl.split(',')[1] || '';
      if (b64) {
        images.push({
          data: b64,
          mimeType: 'image/jpeg',
          pageLabel: `Sayfa ${pageNum}`,
        });
      }
      canvas.width = 0;
      canvas.height = 0;
    } catch {
      // Skip unrenderable page cleanly
    }
  }
  return images;
}

async function ocrExtractedImages(
  images: ExtractedImagePage[],
  onProgress?: (pct: number, label: string) => void,
): Promise<string> {
  if (images.length === 0) return '';
  const assistantImages = images.map((img, idx) => ({
    id: `pdf-page-${idx + 1}`,
    name: img.pageLabel || `Sayfa ${idx + 1}`,
    mimeType: img.mimeType,
    dataUrl: `data:${img.mimeType};base64,${img.data}`,
  }));

  try {
    onProgress?.(68, 'Taranmış sayfalar görsel zekâ ile taranıyor...');
    const { extractHandwrittenLatexViaVisionOcr } = await import('@/lib/multimodalVisionClient');
    const visionText = await Promise.race([
      extractHandwrittenLatexViaVisionOcr(assistantImages, () => {}),
      new Promise<string>((resolve) => setTimeout(() => resolve(''), 18_000)),
    ]);
    if (visionText && visionText.trim().length > 60) {
      return visionText.trim();
    }
  } catch {
    // Fallback to local Tesseract OCR below
  }

  try {
    onProgress?.(78, 'Yerel OCR ile taranmış sayfalar metne dönüştürülüyor...');
    const { extractMathTextFromImages } = await import('@/lib/imageMathOcr');
    const tessText = await extractMathTextFromImages(assistantImages, () => {});
    return (tessText || '').trim();
  } catch {
    return '';
  }
}

export async function extractFile(
  file: File,
  onProgress?: (pct: number, label: string) => void,
): Promise<Extracted> {
  const name = file.name.toLowerCase();
  const mime = file.type || '';
  onProgress?.(5, 'Dosya okunuyor...');

  if (mime.startsWith('image/') || /\.(png|jpe?g|webp)$/.test(name)) {
    const data = await fileToBase64(file);
    onProgress?.(90, 'Görsel hazır.');
    return { kind: 'image', data, mime: mime || 'image/jpeg' };
  }

  if (mime.startsWith('audio/') || /\.(mp3|wav|m4a|ogg|webm)$/.test(name)) {
    if (file.size > 15 * 1024 * 1024) {
      throw new Error('Ses dosyası 15 MB sınırını aşıyor. Daha kısa bir kayıt yükleyin.');
    }
    const data = await fileToBase64(file);
    onProgress?.(90, 'Ses dosyası hazır.');
    return { kind: 'audio', data, mime: mime || 'audio/mpeg' };
  }

  if (name.endsWith('.txt') || name.endsWith('.md')) {
    const text = (await file.text()).slice(0, 350_000);
    if (!text.trim()) throw new Error('Dosya boş.');
    onProgress?.(95, 'Metin dosyası hazır.');
    return { kind: 'text', text };
  }

  if (name.endsWith('.pdf') || mime === 'application/pdf') {
    onProgress?.(12, 'PDF ayrıştırılıyor...');
    const buf = await readFileAsArrayBuffer(file);
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    const total = pdf.numPages;
    const maxPages = Math.min(total, 120);
    const parts: string[] = new Array(maxPages).fill('');
    let meaningfulChars = 0;

    onProgress?.(20, `PDF taranıyor (${maxPages} sayfa)...`);

    const BATCH = 10;
    for (let start = 1; start <= maxPages; start += BATCH) {
      const end = Math.min(maxPages, start + BATCH - 1);
      await Promise.all(
        Array.from({ length: end - start + 1 }, async (_, offset) => {
          const pageNum = start + offset;
          try {
            const page = await pdf.getPage(pageNum);
            const content = await page.getTextContent();
            const pageText = formatPdfItemsToText(content.items || []);
            if (pageText.trim().length > 0) {
              meaningfulChars += pageText.replace(/\s+/g, '').length;
              parts[pageNum - 1] = `--- Sayfa ${pageNum} ---\n${pageText}`;
            }
          } catch {
            // Skip unreadable page without crashing entire PDF
          }
        }),
      );
      const pct = Math.min(58, Math.round(20 + (end / maxPages) * 38));
      onProgress?.(pct, `PDF işleniyor... (${end}/${maxPages} sayfa)`);
    }

    const extractedText = parts.filter(Boolean).join('\n\n').slice(0, 350_000);
    const avgCharsPerPage = meaningfulChars / Math.max(1, maxPages);

    // Scanned or image-heavy PDF detection: trigger visual page rendering + OCR
    if (!extractedText.trim() || avgCharsPerPage < 28) {
      onProgress?.(62, 'PDF taranmış/görsel yoğunluklu tespit edildi — sayfa görselleri hazırlanıyor...');
      const renderedImages = await renderPdfPagesAsImages(pdf, maxPages, 8);
      if (renderedImages.length > 0) {
        const ocrText = await ocrExtractedImages(renderedImages, onProgress);
        const combined = [extractedText.trim(), ocrText.trim()].filter(Boolean).join('\n\n');
        onProgress?.(95, 'Taranmış PDF sayfa görselleri ve OCR metni hazır.');
        return {
          kind: 'text',
          text:
            combined ||
            `[Taranmış PDF (${maxPages} sayfa): Görsel zekâ analizi için ${renderedImages.length} sayfa karesi eklendi.]`,
          pages: maxPages,
          images: renderedImages,
          isScannedOcr: true,
        };
      }
      if (!extractedText.trim()) {
        throw new Error(
          'PDF metin içermiyor (taranmış olabilir) ve sayfalar görüntüye dönüştürülemedi. Sayfaları görsel olarak yüklemeyi deneyin.',
        );
      }
    }

    onProgress?.(95, 'PDF ders notu hazır.');
    return { kind: 'text', text: extractedText, pages: maxPages };
  }

  if (name.endsWith('.pptx')) {
    onProgress?.(20, 'PowerPoint slaytları ve konuşmacı notları okunuyor...');
    const zip = await JSZip.loadAsync(await readFileAsArrayBuffer(file));
    const slideFiles = Object.keys(zip.files)
      .filter((k) => /^ppt\/slides\/slide\d+\.xml$/.test(k))
      .sort((a, b) => {
        const na = parseInt(a.match(/\d+/)?.[0] || '0', 10);
        const nb = parseInt(b.match(/\d+/)?.[0] || '0', 10);
        return na - nb;
      });

    const extractXmlParagraphs = (xml: string): string => {
      const paragraphs: string[] = [];
      const pBlocks = xml.match(/<a:p\b[\s\S]*?<\/a:p>/g) || [];
      if (pBlocks.length > 0) {
        for (const pBlock of pBlocks) {
          const runs = Array.from(pBlock.matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g))
            .map((m) => decodeXmlEntities(m[1]))
            .join('');
          if (runs.trim()) paragraphs.push(runs.trim());
        }
      } else {
        const runs = Array.from(xml.matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g))
          .map((m) => decodeXmlEntities(m[1]))
          .join(' ');
        if (runs.trim()) paragraphs.push(runs.trim());
      }
      return paragraphs.join('\n');
    };

    const slides: string[] = [];
    for (let i = 0; i < slideFiles.length; i++) {
      const sf = slideFiles[i];
      const slideNum = sf.match(/\d+/)?.[0] || String(i + 1);
      const xml = await zip.files[sf].async('text');
      const slideBody = extractXmlParagraphs(xml);

      // Include speaker notes when available (ppt/notesSlides/notesSlideN.xml)
      const notesPath = `ppt/notesSlides/notesSlide${slideNum}.xml`;
      let notesBody = '';
      if (zip.files[notesPath]) {
        const notesXml = await zip.files[notesPath].async('text');
        notesBody = extractXmlParagraphs(notesXml)
          // Filter trailing standalone slide-number strings common in notes footer
          .split('\n')
          .filter((l) => l.trim() !== slideNum)
          .join('\n')
          .trim();
      }

      if (slideBody || notesBody) {
        const block = notesBody
          ? `--- Slayt ${slideNum} ---\n${slideBody}\n[Hoca / Konuşmacı Notu]: ${notesBody}`
          : `--- Slayt ${slideNum} ---\n${slideBody}`;
        slides.push(block);
      }
      if (i % 10 === 0) {
        onProgress?.(25 + Math.round((i / Math.max(1, slideFiles.length)) * 65), `Slaytlar (${i + 1}/${slideFiles.length})`);
      }
    }

    const text = slides.join('\n\n').slice(0, 350_000);
    if (!text.trim()) throw new Error('Sunum dosyasında metin bulunamadı.');
    onProgress?.(95, 'Sunum slaytları hazır.');
    return { kind: 'text', text, pages: slideFiles.length };
  }

  if (name.endsWith('.docx')) {
    onProgress?.(30, 'Word belgesi okunuyor...');
    const zip = await JSZip.loadAsync(await readFileAsArrayBuffer(file));
    const docXml = await zip.files['word/document.xml']?.async('text');
    if (!docXml) throw new Error('Word belgesi okunamadı.');

    const paragraphs: string[] = [];
    const pBlocks = docXml.match(/<w:p\b[\s\S]*?<\/w:p>/g) || [];
    for (const pBlock of pBlocks) {
      const runs = Array.from(pBlock.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g))
        .map((m) => decodeXmlEntities(m[1]))
        .join('');
      if (runs.trim()) paragraphs.push(runs.trim());
    }

    const text = paragraphs.join('\n').slice(0, 350_000);
    if (!text.trim()) throw new Error('Word belgesi boş.');
    onProgress?.(95, 'Belge hazır.');
    return { kind: 'text', text };
  }

  throw new Error('Desteklenmeyen dosya formatı. PDF, PPTX, DOCX, TXT/MD, Görsel veya Ses yükleyin.');
}
