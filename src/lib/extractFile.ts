import * as pdfjsLib from 'pdfjs-dist';
// @ts-expect-error Vite resolves worker asset URL natively
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.js?url';
import JSZip from 'jszip';
import { sanitizeMarkdownTableCell, stripTechnicalMarkup } from '@/lib/academicTextSanitizer';

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
      totalPages?: number;
      unreadablePages?: number[];
      warnings?: string[];
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
      return Number.isFinite(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
      const code = parseInt(hex, 16);
      return Number.isFinite(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
    });
}

function parseXmlSafely(xml: string): Document | null {
  if (typeof DOMParser === 'undefined' || !xml) return null;
  try {
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    if (!doc || doc.getElementsByTagName('parsererror').length > 0) return null;
    return doc;
  } catch {
    return null;
  }
}

function xmlLocalName(node: Node): string {
  const el = node as Element;
  if (typeof el.localName === 'string' && el.localName.length > 0) {
    return el.localName.toLowerCase();
  }
  const raw = String(node.nodeName || '').toLowerCase();
  const idx = raw.indexOf(':');
  return idx >= 0 ? raw.slice(idx + 1) : raw;
}

const IGNORED_OOXML_NODES = new Set([
  'rpr',
  'endpararpr',
  'ppr',
  'fldpr',
  'lststyle',
  'bodypr',
  'tblpr',
  'tblgrid',
  'tcpr',
  'trpr',
  'nvsppr',
  'sppr',
  'nvgraphicframepr',
  'xfrm',
  'extlst',
  'defrpr',
  'txstyles',
  'instrtext',
  'fldchar',
  'del',
  'deltext',
  'prooferr',
  'bookmarkstart',
  'bookmarkend',
  'commentreference',
  'footnoteReference',
]);

function collectDrawingParagraphTextFromNode(pNode: Element): string {
  let buf = '';
  const walk = (node: Node) => {
    if (node.nodeType !== 1) return;
    const el = node as Element;
    const local = xmlLocalName(el);
    if (IGNORED_OOXML_NODES.has(local)) return;
    if (local === 't') {
      buf += el.textContent || '';
      return;
    }
    if (local === 'br' || local === 'cr') {
      buf += '\n';
      return;
    }
    if (local === 'tab') {
      buf += ' ';
      return;
    }
    for (let i = 0; i < el.childNodes.length; i++) {
      walk(el.childNodes[i]);
    }
  };
  for (let i = 0; i < pNode.childNodes.length; i++) {
    walk(pNode.childNodes[i]);
  }
  return buf
    .split('\n')
    .map((line) => stripTechnicalMarkup(line, { singleLine: true }))
    .filter(Boolean)
    .join('\n');
}

function isDescendantOfLocalName(node: Node, targetLocal: string): boolean {
  let cur: Node | null = node.parentNode;
  while (cur) {
    if (cur.nodeType === 1 && xmlLocalName(cur) === targetLocal) return true;
    cur = cur.parentNode;
  }
  return false;
}

function extractDrawingParagraphsRegexFallback(xml: string): string[] {
  const extractRunsFromBlock = (block: string): string => {
    // Strictly require tag-name boundary after `a:t` so `<a:tab/>`, `<a:txBody>`, `<a:tbl>`, `<a:tc>` are NEVER matched!
    const tokenRe =
      /<a:t(?:\s[^<>]*)?>([\s\S]*?)<\/a:t>|<a:br\b[^<>]*>(?:[\s\S]*?<\/a:br>)?|<a:br\b[^<>]*\/>|<a:tab\b[^<>]*\/?>(?:<\/a:tab>)?/g;
    let buf = '';
    let m: RegExpExecArray | null;
    while ((m = tokenRe.exec(block)) !== null) {
      if (m[1] !== undefined) {
        buf += decodeXmlEntities(m[1]);
      } else if (m[0].startsWith('<a:br')) {
        buf += '\n';
      } else {
        buf += ' ';
      }
    }
    return buf
      .split('\n')
      .map((line) => stripTechnicalMarkup(line, { singleLine: true }))
      .filter(Boolean)
      .join('\n');
  };

  const paragraphs: string[] = [];
  const pBlocks = xml.match(/<a:p(?:\s[^<>]*)?>[\s\S]*?<\/a:p>/g) || [];
  if (pBlocks.length > 0) {
    for (const pBlock of pBlocks) {
      const cleaned = extractRunsFromBlock(pBlock);
      if (cleaned) paragraphs.push(cleaned);
    }
  } else {
    const cleaned = extractRunsFromBlock(xml);
    if (cleaned) paragraphs.push(cleaned);
  }
  return paragraphs;
}

function extractDrawingTextAndTables(xml: string): { paragraphs: string[]; markdownTables: string[] } {
  const doc = parseXmlSafely(xml);
  if (doc) {
    const markdownTables: string[] = [];
    const allElements = Array.from(doc.getElementsByTagName('*'));
    const tblNodes = allElements.filter((el) => xmlLocalName(el) === 'tbl');

    for (const tbl of tblNodes) {
      const rows: string[][] = [];
      const rowNodes = Array.from(tbl.childNodes).filter(
        (n): n is Element => n.nodeType === 1 && xmlLocalName(n) === 'tr',
      );
      for (const tr of rowNodes) {
        const cellNodes = Array.from(tr.childNodes).filter(
          (n): n is Element => n.nodeType === 1 && xmlLocalName(n) === 'tc',
        );
        const cellTexts = cellNodes.map((tc) => {
          const pNodes = Array.from(tc.getElementsByTagName('*')).filter((el) => xmlLocalName(el) === 'p');
          const joined = pNodes
            .map((p) => collectDrawingParagraphTextFromNode(p))
            .filter(Boolean)
            .join(' ');
          return sanitizeMarkdownTableCell(joined);
        });
        if (cellTexts.some((c) => c.length > 0)) rows.push(cellTexts);
      }

      if (rows.length >= 2) {
        const colCount = Math.max(...rows.map((r) => r.length));
        const normalized = rows.map((r) => Array.from({ length: colCount }, (_, ci) => r[ci] || '—'));
        const header = `| ${normalized[0].join(' | ')} |`;
        const sep = `| ${Array.from({ length: colCount }, () => '---').join(' | ')} |`;
        const body = normalized.slice(1).map((r) => `| ${r.join(' | ')} |`).join('\n');
        markdownTables.push(`${header}\n${sep}\n${body}`);
      } else if (rows.length === 1) {
        markdownTables.push(rows[0].filter(Boolean).join(' — '));
      }
    }

    const paragraphs: string[] = [];
    const pNodes = allElements.filter(
      (el) => xmlLocalName(el) === 'p' && !isDescendantOfLocalName(el, 'tbl'),
    );
    for (const pNode of pNodes) {
      const cleaned = collectDrawingParagraphTextFromNode(pNode);
      if (cleaned) paragraphs.push(cleaned);
    }

    return { paragraphs, markdownTables };
  }

  // Fallback for malformed XML fragments lacking namespace declarations
  const markdownTables: string[] = [];
  const xmlWithoutTables = xml.replace(/<a:tbl\b[\s\S]*?<\/a:tbl>/g, (tblXml) => {
    const rows = tblXml.match(/<a:tr\b[\s\S]*?<\/a:tr>/g) || [];
    const parsedRows: string[][] = [];
    for (const rowXml of rows) {
      const cells = rowXml.match(/<a:tc\b[\s\S]*?<\/a:tc>/g) || [];
      const cellTexts = cells.map((tc) =>
        sanitizeMarkdownTableCell(extractDrawingParagraphsRegexFallback(tc).join(' ')),
      );
      if (cellTexts.some((c) => c.length > 0)) parsedRows.push(cellTexts);
    }
    if (parsedRows.length >= 2) {
      const colCount = Math.max(...parsedRows.map((r) => r.length));
      const normalized = parsedRows.map((r) =>
        Array.from({ length: colCount }, (_, ci) => r[ci] || '—'),
      );
      const header = `| ${normalized[0].join(' | ')} |`;
      const sep = `| ${Array.from({ length: colCount }, () => '---').join(' | ')} |`;
      const body = normalized.slice(1).map((r) => `| ${r.join(' | ')} |`).join('\n');
      markdownTables.push(`${header}\n${sep}\n${body}`);
    } else if (parsedRows.length === 1) {
      markdownTables.push(parsedRows[0].filter(Boolean).join(' — '));
    }
    return '';
  });

  return {
    paragraphs: extractDrawingParagraphsRegexFallback(xmlWithoutTables),
    markdownTables,
  };
}

function collectWordParagraphInfoFromNode(pNode: Element): {
  text: string;
  headingLevel: number;
  isListItem: boolean;
} {
  let headingLevel = 0;
  let isListItem = false;
  let buf = '';

  const walk = (node: Node) => {
    if (node.nodeType !== 1) return;
    const el = node as Element;
    const local = xmlLocalName(el);
    if (local === 'ppr') {
      const pPrChildren = Array.from(el.getElementsByTagName('*'));
      for (const child of pPrChildren) {
        const cLocal = xmlLocalName(child);
        if (cLocal === 'pstyle') {
          const val = (child.getAttribute('w:val') || child.getAttribute('val') || '').toLowerCase();
          if (/^(heading|baslik|başlık|title)[\s_-]*1$|^(title)$/.test(val)) headingLevel = 1;
          else if (/^(heading|baslik|başlık)[\s_-]*2$|^(subtitle)$/.test(val)) headingLevel = 2;
          else if (/^(heading|baslik|başlık)[\s_-]*[3-6]$/.test(val)) headingLevel = 3;
        } else if (cLocal === 'numpr') {
          isListItem = true;
        }
      }
      return;
    }
    if (IGNORED_OOXML_NODES.has(local)) return;
    if (local === 't') {
      buf += el.textContent || '';
      return;
    }
    if (local === 'br' || local === 'cr') {
      buf += '\n';
      return;
    }
    if (local === 'tab') {
      buf += ' ';
      return;
    }
    for (let i = 0; i < el.childNodes.length; i++) {
      walk(el.childNodes[i]);
    }
  };

  for (let i = 0; i < pNode.childNodes.length; i++) {
    walk(pNode.childNodes[i]);
  }

  const text = buf
    .split('\n')
    .map((line) => stripTechnicalMarkup(line, { singleLine: true }))
    .filter(Boolean)
    .join('\n');

  return { text, headingLevel, isListItem };
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
    const rawText = (await file.text()).slice(0, 900_000);
    const text = stripTechnicalMarkup(rawText);
    if (!text.trim()) throw new Error('Dosya boş.');
    onProgress?.(95, 'Metin dosyası hazır.');
    return { kind: 'text', text };
  }

  if (name.endsWith('.pdf') || mime === 'application/pdf') {
    onProgress?.(12, 'PDF ayrıştırılıyor...');
    const buf = await readFileAsArrayBuffer(file);
    // SECURITY (CVE-2024-4367): strictly disable PDF.js eval font compilation
    const pdf = await pdfjsLib.getDocument({ data: buf, isEvalSupported: false, disableFontFace: true }).promise;
    const total = pdf.numPages;
    const maxPages = Math.min(total, 500);
    const parts: string[] = new Array(maxPages).fill('');
    const unreadablePages: number[] = [];
    const warnings: string[] = [];
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
            const pageText = stripTechnicalMarkup(formatPdfItemsToText(content.items || []));
            const nonWs = pageText.replace(/\s+/g, '').length;
            if (nonWs >= 15) {
              meaningfulChars += nonWs;
              parts[pageNum - 1] = `--- Sayfa ${pageNum} ---\n${pageText}`;
            } else if (pageText.trim().length > 0) {
              meaningfulChars += nonWs;
              unreadablePages.push(pageNum);
              parts[pageNum - 1] = `--- Sayfa ${pageNum} ---\n${pageText.trim()}\n[UYARI: Bu sayfada çok az metin tespit edildi; tablo, grafik veya taranmış görsel içerik olabilir.]`;
            } else {
              unreadablePages.push(pageNum);
            }
          } catch {
            unreadablePages.push(pageNum);
          }
        }),
      );
      const pct = Math.min(58, Math.round(20 + (end / maxPages) * 38));
      onProgress?.(pct, `PDF işleniyor... (${end}/${maxPages} sayfa)`);
    }

    unreadablePages.sort((a, b) => a - b);
    const extractedText = parts.filter(Boolean).join('\n\n').slice(0, 2_400_000);
    const avgCharsPerPage = meaningfulChars / Math.max(1, maxPages);

    if (total > maxPages) {
      warnings.push(
        `Belge toplam ${total} sayfadır; ilk ${maxPages} sayfa işlendi (sayfa ${maxPages + 1}-${total} kapsam dışı kaldı).`,
      );
    }

    // Scanned or image-heavy PDF detection: trigger visual page rendering + OCR
    if (!extractedText.trim() || avgCharsPerPage < 28) {
      onProgress?.(62, 'PDF taranmış/görsel yoğunluklu tespit edildi — sayfa görselleri hazırlanıyor...');
      const renderedImages = await renderPdfPagesAsImages(pdf, maxPages, 12);
      if (renderedImages.length > 0) {
        const ocrText = await ocrExtractedImages(renderedImages, onProgress);
        const combined = [extractedText.trim(), ocrText.trim()].filter(Boolean).join('\n\n');
        if (maxPages > renderedImages.length) {
          warnings.push(
            `Bu PDF taranmış/görsel formatında (${maxPages} sayfa). ${renderedImages.length} temsilî sayfa görsel OCR ile okundu; tüm sayfaların eksiksiz analizi için metin katmanlı PDF önerilir.`,
          );
        }
        onProgress?.(95, 'Taranmış PDF sayfa görselleri ve OCR metni hazır.');
        return {
          kind: 'text',
          text:
            combined ||
            `[Taranmış PDF (${maxPages} sayfa): Görsel zekâ analizi için ${renderedImages.length} sayfa karesi eklendi.]`,
          pages: maxPages,
          totalPages: total,
          unreadablePages,
          warnings,
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

    if (unreadablePages.length > 0) {
      const samplePages = unreadablePages.slice(0, 12).join(', ');
      warnings.push(
        `PDF içinde okunabilir metin katmanı olmayan veya yalnızca görsel/grafik içeren ${unreadablePages.length} sayfa tespit edildi (Sayfa: ${samplePages}${unreadablePages.length > 12 ? '...' : ''}).`,
      );
    }

    onProgress?.(95, 'PDF ders notu hazır.');
    return {
      kind: 'text',
      text: extractedText,
      pages: maxPages,
      totalPages: total,
      unreadablePages: unreadablePages.length > 0 ? unreadablePages : undefined,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  if (name.endsWith('.pptx')) {
    onProgress?.(20, 'PowerPoint slaytları, tablolar, diyagramlar ve konuşmacı notları okunuyor...');
    const zip = await JSZip.loadAsync(await readFileAsArrayBuffer(file));
    const slideFiles = Object.keys(zip.files)
      .filter((k) => /^ppt\/slides\/slide\d+\.xml$/.test(k))
      .sort((a, b) => {
        const na = parseInt(a.match(/\d+/)?.[0] || '0', 10);
        const nb = parseInt(b.match(/\d+/)?.[0] || '0', 10);
        return na - nb;
      });

    const extractXmlParagraphs = (xml: string): string =>
      extractDrawingTextAndTables(xml).paragraphs.join('\n');

    const extractRelatedExtras = async (slideNum: string): Promise<string[]> => {
      const extras: string[] = [];
      const relsPath = `ppt/slides/_rels/slide${slideNum}.xml.rels`;
      if (!zip.files[relsPath]) return extras;
      try {
        const relsXml = await zip.files[relsPath].async('text');
        const targets = Array.from(relsXml.matchAll(/Target="([^"]+)"/g)).map((m) => m[1]);
        for (const rawTarget of targets) {
          const normalizedPath = rawTarget.startsWith('../')
            ? `ppt/${rawTarget.slice(3)}`
            : rawTarget.replace(/^\/+/, '');
          if (/^ppt\/diagrams\/data\d+\.xml$/i.test(normalizedPath) && zip.files[normalizedPath]) {
            const diagXml = await zip.files[normalizedPath].async('text');
            const diagText = extractXmlParagraphs(diagXml);
            if (diagText.trim()) extras.push(`[Diyagram / SmartArt]:\n${diagText.trim()}`);
          } else if (/^ppt\/charts\/chart\d+\.xml$/i.test(normalizedPath) && zip.files[normalizedPath]) {
            const chartXml = await zip.files[normalizedPath].async('text');
            const chartDoc = parseXmlSafely(chartXml);
            const chartLabels = chartDoc
              ? Array.from(chartDoc.getElementsByTagName('*'))
                  .filter((el) => {
                    const ln = xmlLocalName(el);
                    return ln === 't' || ln === 'v';
                  })
                  .map((el) => stripTechnicalMarkup(el.textContent || '', { singleLine: true }))
                  .filter(Boolean)
                  .slice(0, 60)
              : Array.from(chartXml.matchAll(/<(?:a:t|c:v)(?:\s[^<>]*)?>([\s\S]*?)<\/(?:a:t|c:v)>/g))
                  .map((m) => stripTechnicalMarkup(decodeXmlEntities(m[1]), { singleLine: true }))
                  .filter(Boolean)
                  .slice(0, 60);
            if (chartLabels.length > 0) {
              extras.push(`[Grafik Verisi]: ${chartLabels.join(' · ')}`);
            }
          }
        }
      } catch {
        // Ignore malformed rels gracefully
      }
      return extras;
    };

    const slides: string[] = [];
    const unreadableSlides: number[] = [];
    const warnings: string[] = [];

    for (let i = 0; i < slideFiles.length; i++) {
      const sf = slideFiles[i];
      const slideNum = sf.match(/\d+/)?.[0] || String(i + 1);
      const slideIndexNum = parseInt(slideNum, 10) || i + 1;
      const xml = await zip.files[sf].async('text');
      const { paragraphs: slideParagraphs, markdownTables } = extractDrawingTextAndTables(xml);
      const slideBody = slideParagraphs.join('\n');
      const relatedExtras = await extractRelatedExtras(slideNum);

      // Include speaker notes when available (ppt/notesSlides/notesSlideN.xml)
      const notesPath = `ppt/notesSlides/notesSlide${slideNum}.xml`;
      let notesBody = '';
      if (zip.files[notesPath]) {
        const notesXml = await zip.files[notesPath].async('text');
        notesBody = extractXmlParagraphs(notesXml)
          .split('\n')
          .filter((l) => l.trim() !== slideNum)
          .join('\n')
          .trim();
      }

      const contentParts = [
        slideBody,
        ...markdownTables.map((t) => `[Slayt Tablosu]\n${t}`),
        ...relatedExtras,
        notesBody ? `[Hoca / Konuşmacı Notu]: ${notesBody}` : '',
      ].filter((p) => p && p.trim().length > 0);

      if (contentParts.length > 0) {
        slides.push(`--- Slayt ${slideNum} ---\n${contentParts.join('\n\n')}`);
      } else {
        unreadableSlides.push(slideIndexNum);
        slides.push(
          `--- Slayt ${slideNum} ---\n[UYARI: Bu slaytta yalnızca görsel/şekil bulunuyor; okunabilir metin katmanı yok.]`,
        );
      }

      if (i % 8 === 0) {
        onProgress?.(
          25 + Math.round((i / Math.max(1, slideFiles.length)) * 65),
          `Slaytlar işleniyor (${i + 1}/${slideFiles.length})`,
        );
      }
    }

    const text = stripTechnicalMarkup(slides.join('\n\n').slice(0, 600_000));
    const hasRealContent = slides.some((s) => !s.includes('[UYARI: Bu slaytta yalnızca görsel/şekil bulunuyor'));
    if (!text.trim() || !hasRealContent) {
      throw new Error('Sunum dosyasında metin bulunamadı.');
    }
    if (unreadableSlides.length > 0) {
      warnings.push(
        `Sunumda yalnızca görsel/şekil içeren ${unreadableSlides.length} slayt tespit edildi (Slayt: ${unreadableSlides.slice(0, 12).join(', ')}${unreadableSlides.length > 12 ? '...' : ''}).`,
      );
    }
    onProgress?.(95, 'Sunum slaytları hazır.');
    return {
      kind: 'text',
      text,
      pages: slideFiles.length,
      totalPages: slideFiles.length,
      unreadablePages: unreadableSlides.length > 0 ? unreadableSlides : undefined,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  if (name.endsWith('.docx')) {
    onProgress?.(30, 'Word belgesi başlıklar, paragraflar ve tablolar sırayla okunuyor...');
    const zip = await JSZip.loadAsync(await readFileAsArrayBuffer(file));
    const docXml = await zip.files['word/document.xml']?.async('text');
    if (!docXml) throw new Error('Word belgesi okunamadı.');

    const formatDocxParagraph = (info: { text: string; headingLevel: number; isListItem: boolean }): string => {
      if (!info.text) return '';
      if (info.headingLevel === 1) return `# ${info.text}`;
      if (info.headingLevel === 2) return `## ${info.text}`;
      if (info.headingLevel === 3) return `### ${info.text}`;
      if (info.isListItem && !/^[-•*]\s/.test(info.text)) return `- ${info.text}`;
      return info.text;
    };

    const formatRowsToMarkdown = (parsedRows: string[][]): string => {
      if (parsedRows.length >= 2) {
        const colCount = Math.max(...parsedRows.map((r) => r.length));
        const norm = parsedRows.map((r) => Array.from({ length: colCount }, (_, ci) => r[ci] || '—'));
        return [
          `| ${norm[0].join(' | ')} |`,
          `| ${Array.from({ length: colCount }, () => '---').join(' | ')} |`,
          ...norm.slice(1).map((r) => `| ${r.join(' | ')} |`),
        ].join('\n');
      }
      if (parsedRows.length === 1) {
        return parsedRows[0].filter(Boolean).join(' — ');
      }
      return '';
    };

    const orderedBlocks: string[] = [];
    const parsedDoc = parseXmlSafely(docXml);

    if (parsedDoc) {
      const bodyEl =
        Array.from(parsedDoc.getElementsByTagName('*')).find((el) => xmlLocalName(el) === 'body') ||
        parsedDoc.documentElement;

      const walkBodyContainer = (container: Element) => {
        for (let i = 0; i < container.childNodes.length; i++) {
          const child = container.childNodes[i];
          if (child.nodeType !== 1) continue;
          const el = child as Element;
          const local = xmlLocalName(el);
          if (local === 'p') {
            const formatted = formatDocxParagraph(collectWordParagraphInfoFromNode(el));
            if (formatted) orderedBlocks.push(formatted);
          } else if (local === 'tbl') {
            const rows: string[][] = [];
            const trNodes = Array.from(el.childNodes).filter(
              (n): n is Element => n.nodeType === 1 && xmlLocalName(n) === 'tr',
            );
            for (const tr of trNodes) {
              const tcNodes = Array.from(tr.childNodes).filter(
                (n): n is Element => n.nodeType === 1 && xmlLocalName(n) === 'tc',
              );
              const cellTexts = tcNodes.map((tc) => {
                const pNodes = Array.from(tc.getElementsByTagName('*')).filter((n) => xmlLocalName(n) === 'p');
                const joined = pNodes
                  .map((p) => collectWordParagraphInfoFromNode(p).text)
                  .filter(Boolean)
                  .join(' ');
                return sanitizeMarkdownTableCell(joined);
              });
              if (cellTexts.some((c) => c.length > 0)) rows.push(cellTexts);
            }
            const mdTable = formatRowsToMarkdown(rows);
            if (mdTable) orderedBlocks.push(mdTable);
          } else if (local === 'sdt' || local === 'sdtcontent') {
            walkBodyContainer(el);
          }
        }
      };

      walkBodyContainer(bodyEl);
    } else {
      // Tag-boundary-safe regex fallback for malformed Word XML
      const extractParagraphTextRegex = (
        pXml: string,
      ): { text: string; headingLevel: number; isListItem: boolean } => {
        const styleMatch = pXml.match(/<w:pStyle\b[^>]*w:val="([^"]+)"/i);
        const styleVal = (styleMatch?.[1] || '').toLowerCase();
        let headingLevel = 0;
        if (/^(heading|baslik|başlık|title)[\s_-]*1$|^(title)$/.test(styleVal)) headingLevel = 1;
        else if (/^(heading|baslik|başlık)[\s_-]*2$|^(subtitle)$/.test(styleVal)) headingLevel = 2;
        else if (/^(heading|baslik|başlık)[\s_-]*[3-6]$/.test(styleVal)) headingLevel = 3;

        const isListItem = /<w:numPr\b/.test(pXml);
        const tokenRe =
          /<w:t(?:\s[^<>]*)?>([\s\S]*?)<\/w:t>|<w:(?:br|cr)\b[^<>]*\/?>|<w:tab\b[^<>]*\/?>/g;
        let buf = '';
        let tm: RegExpExecArray | null;
        while ((tm = tokenRe.exec(pXml)) !== null) {
          if (tm[1] !== undefined) buf += decodeXmlEntities(tm[1]);
          else if (tm[0].startsWith('<w:tab')) buf += ' ';
          else buf += '\n';
        }
        const text = buf
          .split('\n')
          .map((line) => stripTechnicalMarkup(line, { singleLine: true }))
          .filter(Boolean)
          .join('\n');
        return { text, headingLevel, isListItem };
      };

      const bodyMatch = docXml.match(/<w:body\b[^>]*>([\s\S]*?)<\/w:body>/i);
      const bodyXml = bodyMatch ? bodyMatch[1] : docXml;
      const tokenRe = /<w:tbl\b[\s\S]*?<\/w:tbl>|<w:p(?:\s[^<>]*)?>[\s\S]*?<\/w:p>/g;
      let m: RegExpExecArray | null;
      while ((m = tokenRe.exec(bodyXml)) !== null) {
        const frag = m[0];
        if (frag.startsWith('<w:tbl')) {
          const rows = frag.match(/<w:tr\b[\s\S]*?<\/w:tr>/g) || [];
          const parsedRows: string[][] = [];
          for (const rowXml of rows) {
            const cells = rowXml.match(/<w:tc\b[\s\S]*?<\/w:tc>/g) || [];
            const cellTexts = cells.map((tc) => {
              const pBlocks = tc.match(/<w:p(?:\s[^<>]*)?>[\s\S]*?<\/w:p>/g) || [];
              const joined = pBlocks
                .map((p) => extractParagraphTextRegex(p).text)
                .filter(Boolean)
                .join(' ');
              return sanitizeMarkdownTableCell(joined);
            });
            if (cellTexts.some((c) => c.length > 0)) parsedRows.push(cellTexts);
          }
          const mdTable = formatRowsToMarkdown(parsedRows);
          if (mdTable) orderedBlocks.push(mdTable);
        } else {
          const formatted = formatDocxParagraph(extractParagraphTextRegex(frag));
          if (formatted) orderedBlocks.push(formatted);
        }
      }
    }

    const text = stripTechnicalMarkup(orderedBlocks.join('\n\n').slice(0, 1_200_000));
    if (!text.trim()) throw new Error('Word belgesi boş.');
    const wordCount = text.split(/\s+/).filter(Boolean).length;
    const estPages = Math.max(1, Math.ceil(wordCount / 320));
    onProgress?.(95, 'Word belgesi başlık ve tablolarıyla hazır.');
    return { kind: 'text', text, pages: estPages, totalPages: estPages };
  }

  throw new Error('Desteklenmeyen dosya formatı. PDF, PPTX, DOCX, TXT/MD, Görsel veya Ses yükleyin.');
}
