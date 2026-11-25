import JSZip from 'jszip';
import { supabase, SUPABASE_URL } from '@/integrations/supabase/client';
import { NOTE_SELECT } from '@/lib/noteColumns';
import {
  extractStoragePathCandidates,
  NOTES_BUCKET,
  signedNoteUrlWithDetail,
} from '@/lib/storageUrl';

export type PreviewFileKind =
  | 'pdf'
  | 'pptx'
  | 'ppt_legacy'
  | 'docx'
  | 'doc_legacy'
  | 'image'
  | 'text'
  | 'unsupported';

export interface ParsedPptxSlide {
  slideNumber: number;
  title: string;
  paragraphs: string[];
  tables: string[][][];
  images: Array<{ url: string; name: string }>;
  extras: string[];
  speakerNotes: string;
}

export interface ParsedPptxDocument {
  slides: ParsedPptxSlide[];
  slideCount: number;
  revokeUrls: () => void;
}

export type ParsedDocxBlock =
  | { type: 'heading'; level: 1 | 2 | 3; text: string }
  | { type: 'paragraph'; text: string; isBullet?: boolean }
  | { type: 'table'; rows: string[][] }
  | { type: 'image'; url: string; name: string };

export interface ParsedDocxDocument {
  blocks: ParsedDocxBlock[];
  wordCount: number;
  revokeUrls: () => void;
}

export interface AdminNotePreviewResolution {
  ok: boolean;
  fileKind: PreviewFileKind;
  signedUrl: string | null;
  blobUrl: string | null;
  arrayBuffer: ArrayBuffer | null;
  fileName: string;
  fileType: string | null;
  fileSize: number | null;
  resolvedPath: string | null;
  source:
    | 'edge_function'
    | 'storage_signed_url'
    | 'storage_direct_download'
    | 'legacy_external_url'
    | 'none';
  freshNote: Record<string, any> | null;
  error: string | null;
  errorCode: string | null;
  dispose: () => void;
}

export function formatFileSizeLabel(bytes?: number | null): string {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function getPreviewFileKindLabel(kind: PreviewFileKind): string {
  switch (kind) {
    case 'pdf':
      return 'PDF Belgesi';
    case 'pptx':
      return 'PowerPoint Sunumu (.pptx)';
    case 'ppt_legacy':
      return 'Eski PowerPoint (.ppt)';
    case 'docx':
      return 'Word Belgesi (.docx)';
    case 'doc_legacy':
      return 'Eski Word (.doc)';
    case 'image':
      return 'Görsel';
    case 'text':
      return 'Metin Belgesi';
    default:
      return 'Dosya';
  }
}

function getExtension(str?: string | null): string {
  if (!str) return '';
  const clean = str.split('?')[0].split('#')[0].trim().toLowerCase();
  const lastDot = clean.lastIndexOf('.');
  if (lastDot < 0 || lastDot === clean.length - 1) return '';
  return clean.slice(lastDot + 1);
}

function detectKindFromMagicBytes(bytes: Uint8Array, extHint: string, mimeHint: string): PreviewFileKind | null {
  if (bytes.length < 4) return null;

  // PDF: "%PDF-" (25 50 44 46 2D)
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
    return 'pdf';
  }

  // PNG: 89 50 4E 47
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return 'image';
  }

  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image';
  }

  // GIF: "GIF8"
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) {
    return 'image';
  }

  // WEBP: "RIFF"...."WEBP"
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'image';
  }

  // OLE2 legacy Office binary (D0 CF 11 E0)
  if (bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) {
    if (extHint === 'ppt' || mimeHint.includes('ms-powerpoint')) return 'ppt_legacy';
    if (extHint === 'doc' || mimeHint.includes('msword')) return 'doc_legacy';
  }

  return null;
}

export function detectPreviewFileKind(params: {
  fileName?: string | null;
  fileType?: string | null;
  fileUrl?: string | null;
  bytes?: ArrayBuffer | Uint8Array | null;
}): PreviewFileKind {
  const mime = String(params.fileType || '').toLowerCase().trim();
  const ext = getExtension(params.fileName) || getExtension(params.fileUrl);

  if (params.bytes) {
    const u8 = params.bytes instanceof Uint8Array ? params.bytes : new Uint8Array(params.bytes);
    const byMagic = detectKindFromMagicBytes(u8, ext, mime);
    if (byMagic) return byMagic;
  }

  if (mime === 'application/pdf' || ext === 'pdf') return 'pdf';

  if (
    mime.includes('openxmlformats-officedocument.presentationml') ||
    ext === 'pptx'
  ) {
    return 'pptx';
  }
  if (mime === 'application/vnd.ms-powerpoint' || ext === 'ppt') {
    return 'ppt_legacy';
  }

  if (
    mime.includes('openxmlformats-officedocument.wordprocessingml') ||
    ext === 'docx'
  ) {
    return 'docx';
  }
  if (mime === 'application/msword' || ext === 'doc') {
    return 'doc_legacy';
  }

  // SECURITY: Never classify SVG or HTML/XML as active previewable image/text (prevents same-origin blob: XSS)
  if (
    ext === 'svg' ||
    ext === 'html' ||
    ext === 'htm' ||
    ext === 'xhtml' ||
    ext === 'xml' ||
    mime.includes('svg') ||
    mime.includes('html')
  ) {
    return 'unsupported';
  }

  if (
    mime.startsWith('image/') ||
    ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'].includes(ext)
  ) {
    return 'image';
  }

  if (
    mime === 'text/plain' ||
    ['txt', 'md', 'csv', 'json'].includes(ext)
  ) {
    return 'text';
  }

  return 'unsupported';
}

async function refineZipFileKind(
  currentKind: PreviewFileKind,
  arrayBuffer: ArrayBuffer,
): Promise<PreviewFileKind> {
  if (currentKind !== 'unsupported' && currentKind !== 'ppt_legacy' && currentKind !== 'doc_legacy') {
    return currentKind;
  }
  const u8 = new Uint8Array(arrayBuffer);
  const isZip = u8.length >= 4 && u8[0] === 0x50 && u8[1] === 0x4b && u8[2] === 0x03 && u8[3] === 0x04;
  if (!isZip) return currentKind;

  try {
    const zip = await JSZip.loadAsync(arrayBuffer);
    const keys = Object.keys(zip.files);
    if (keys.some((k) => /^ppt\/slides\/slide\d+\.xml$/i.test(k) || k === 'ppt/presentation.xml')) {
      return 'pptx';
    }
    if (keys.includes('word/document.xml')) {
      return 'docx';
    }
  } catch {
    // Not a valid OOXML archive
  }
  return currentKind;
}

function decodeXmlEntities(input: string): string {
  return input
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
      const code = parseInt(hex, 16);
      return Number.isFinite(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
    })
    .replace(/&#(\d+);/g, (_, dec) => {
      const code = parseInt(dec, 10);
      return Number.isFinite(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
    });
}

function guessMediaMime(fileName: string): string {
  const ext = getExtension(fileName);
  switch (ext) {
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'gif':
      return 'image/gif';
    case 'webp':
      return 'image/webp';
    case 'bmp':
      return 'image/bmp';
    default:
      return 'application/octet-stream';
  }
}

function isPreviewableMedia(fileName: string): boolean {
  const ext = getExtension(fileName);
  // Strictly raster image formats only (never SVG)
  return ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'].includes(ext);
}

function extractDrawingParagraphs(xml: string): string[] {
  const paragraphs: string[] = [];
  const pBlocks = xml.match(/<a:p\b[\s\S]*?<\/a:p>/g) || [];
  for (const pBlock of pBlocks) {
    const runs = Array.from(pBlock.matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g))
      .map((m) => decodeXmlEntities(m[1]))
      .join('');
    const trimmed = runs.replace(/\s+/g, ' ').trim();
    if (trimmed) paragraphs.push(trimmed);
  }
  if (paragraphs.length === 0) {
    const loose = Array.from(xml.matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g))
      .map((m) => decodeXmlEntities(m[1]).trim())
      .filter(Boolean)
      .join(' ');
    if (loose) paragraphs.push(loose);
  }
  return paragraphs;
}

/**
 * Parses a real `.pptx` PowerPoint archive in-browser using JSZip,
 * extracting ordered slides, titles, bullet paragraphs, tables, embedded slide images,
 * SmartArt/chart texts, and speaker notes.
 */
export async function parsePptxForPreview(arrayBuffer: ArrayBuffer): Promise<ParsedPptxDocument> {
  const zip = await JSZip.loadAsync(arrayBuffer);
  const slideFiles = Object.keys(zip.files)
    .filter((k) => /^ppt\/slides\/slide\d+\.xml$/i.test(k))
    .sort((a, b) => {
      const na = parseInt(a.match(/\d+/)?.[0] || '0', 10);
      const nb = parseInt(b.match(/\d+/)?.[0] || '0', 10);
      return na - nb;
    });

  const createdObjectUrls: string[] = [];
  const slides: ParsedPptxSlide[] = [];

  for (let i = 0; i < slideFiles.length; i++) {
    const slidePath = slideFiles[i];
    const slideNumStr = slidePath.match(/\d+/)?.[0] || String(i + 1);
    const slideNumber = parseInt(slideNumStr, 10) || i + 1;
    const xml = await zip.files[slidePath].async('text');

    // 1. Extract tables cleanly before extracting normal text paragraphs
    const tables: string[][][] = [];
    const xmlWithoutTables = xml.replace(/<a:tbl\b[\s\S]*?<\/a:tbl>/g, (tblXml) => {
      const rowXmls = tblXml.match(/<a:tr\b[\s\S]*?<\/a:tr>/g) || [];
      const rows: string[][] = [];
      for (const rowXml of rowXmls) {
        const cellXmls = rowXml.match(/<a:tc\b[\s\S]*?<\/a:tc>/g) || [];
        const cells = cellXmls.map((tc) => extractDrawingParagraphs(tc).join(' '));
        if (cells.some((c) => c.length > 0)) rows.push(cells);
      }
      if (rows.length > 0) tables.push(rows);
      return '';
    });

    // 2. Detect explicit title placeholder shape (<p:ph type="title"|"ctrTitle"/>)
    let title = '';
    const spBlocks = xmlWithoutTables.match(/<p:sp\b[\s\S]*?<\/p:sp>/g) || [];
    for (const sp of spBlocks) {
      if (/<p:ph[^>]*type="(?:title|ctrTitle)"/i.test(sp)) {
        const titleLines = extractDrawingParagraphs(sp);
        if (titleLines.length > 0) {
          title = titleLines.join(' ');
          break;
        }
      }
    }

    const allParagraphs = extractDrawingParagraphs(xmlWithoutTables);
    if (!title && allParagraphs.length > 0) {
      title = allParagraphs[0];
    }
    const paragraphs = title
      ? allParagraphs.filter((p, idx) => !(idx === 0 && p === title) && p !== title)
      : allParagraphs;

    // 3. Resolve embedded slide images + SmartArt diagrams + Chart data via slide rels
    const images: Array<{ url: string; name: string }> = [];
    const extras: string[] = [];
    const seenMedia = new Set<string>();
    const relsPath = `ppt/slides/_rels/slide${slideNumStr}.xml.rels`;

    if (zip.files[relsPath]) {
      try {
        const relsXml = await zip.files[relsPath].async('text');
        const targets = Array.from(relsXml.matchAll(/Target="([^"]+)"/g)).map((m) => m[1]);
        for (const rawTarget of targets) {
          if (/^https?:\/\//i.test(rawTarget)) continue;
          const normalized = rawTarget.startsWith('../')
            ? `ppt/${rawTarget.slice(3)}`
            : rawTarget.replace(/^\/+/, '');

          if (/^ppt\/media\//i.test(normalized) && zip.files[normalized] && !seenMedia.has(normalized)) {
            if (isPreviewableMedia(normalized)) {
              seenMedia.add(normalized);
              const imgBuf = await zip.files[normalized].async('arraybuffer');
              const blob = new Blob([imgBuf], { type: guessMediaMime(normalized) });
              const objUrl = URL.createObjectURL(blob);
              createdObjectUrls.push(objUrl);
              images.push({ url: objUrl, name: normalized.split('/').pop() || `gorsel-${images.length + 1}` });
            }
          } else if (/^ppt\/diagrams\/data\d+\.xml$/i.test(normalized) && zip.files[normalized]) {
            const diagXml = await zip.files[normalized].async('text');
            const diagLines = extractDrawingParagraphs(diagXml);
            if (diagLines.length > 0) {
              extras.push(`Diyagram / SmartArt: ${diagLines.join(' · ')}`);
            }
          } else if (/^ppt\/charts\/chart\d+\.xml$/i.test(normalized) && zip.files[normalized]) {
            const chartXml = await zip.files[normalized].async('text');
            const chartVals = Array.from(chartXml.matchAll(/<(?:a:t|c:v)[^>]*>([\s\S]*?)<\/(?:a:t|c:v)>/g))
              .map((m) => decodeXmlEntities(m[1]).trim())
              .filter(Boolean)
              .slice(0, 40);
            if (chartVals.length > 0) {
              extras.push(`Grafik Verisi: ${chartVals.join(' · ')}`);
            }
          }
        }
      } catch {
        // Ignore malformed rels
      }
    }

    // 4. Extract speaker notes when present
    let speakerNotes = '';
    const notesPath = `ppt/notesSlides/notesSlide${slideNumStr}.xml`;
    if (zip.files[notesPath]) {
      try {
        const notesXml = await zip.files[notesPath].async('text');
        const notesLines = extractDrawingParagraphs(notesXml).filter(
          (line) => line !== slideNumStr && line.length > 1,
        );
        speakerNotes = notesLines.join('\n');
      } catch {
        // ignore
      }
    }

    slides.push({
      slideNumber,
      title: title || `Slayt ${slideNumber}`,
      paragraphs,
      tables,
      images,
      extras,
      speakerNotes,
    });
  }

  return {
    slides,
    slideCount: slides.length,
    revokeUrls: () => {
      for (const u of createdObjectUrls) {
        try {
          URL.revokeObjectURL(u);
        } catch {
          // ignore
        }
      }
    },
  };
}

/**
 * Parses a real `.docx` Word archive in-browser using JSZip,
 * preserving document reading order across headings, paragraphs, tables, and embedded images.
 */
export async function parseDocxForPreview(arrayBuffer: ArrayBuffer): Promise<ParsedDocxDocument> {
  const zip = await JSZip.loadAsync(arrayBuffer);
  const docEntry = zip.files['word/document.xml'];
  if (!docEntry) {
    throw new Error('Word belgesinin içeriği (word/document.xml) bulunamadı.');
  }

  const docXml = await docEntry.async('text');
  const createdObjectUrls: string[] = [];

  // Map relationship IDs -> embedded image Blob URLs
  const relImageMap = new Map<string, { url: string; name: string }>();
  const relsEntry = zip.files['word/_rels/document.xml.rels'];
  if (relsEntry) {
    try {
      const relsXml = await relsEntry.async('text');
      const relMatches = Array.from(relsXml.matchAll(/<Relationship\b[^>]*>/g));
      for (const rm of relMatches) {
        const tag = rm[0];
        const idMatch = tag.match(/Id="([^"]+)"/);
        const targetMatch = tag.match(/Target="([^"]+)"/);
        if (!idMatch || !targetMatch) continue;
        const target = targetMatch[1].replace(/^\/+/, '');
        const fullMediaPath = target.startsWith('word/') ? target : `word/${target}`;
        if (zip.files[fullMediaPath] && isPreviewableMedia(fullMediaPath)) {
          const imgBuf = await zip.files[fullMediaPath].async('arraybuffer');
          const blob = new Blob([imgBuf], { type: guessMediaMime(fullMediaPath) });
          const objUrl = URL.createObjectURL(blob);
          createdObjectUrls.push(objUrl);
          relImageMap.set(idMatch[1], {
            url: objUrl,
            name: fullMediaPath.split('/').pop() || 'gorsel',
          });
        }
      }
    } catch {
      // ignore rels error
    }
  }

  const extractWordParagraphText = (pXml: string): string =>
    Array.from(pXml.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g))
      .map((m) => decodeXmlEntities(m[1]))
      .join('')
      .replace(/\s+/g, ' ')
      .trim();

  const blocks: ParsedDocxBlock[] = [];
  let wordCount = 0;

  // Extract body content preserving top-level <w:p> and <w:tbl> order
  const bodyMatch = docXml.match(/<w:body\b[^>]*>([\s\S]*?)<\/w:body>/);
  const bodyXml = bodyMatch ? bodyMatch[1] : docXml;

  // Replace tables with indexed placeholders so we can walk sequentially
  const extractedTables: string[][][] = [];
  const markedBody = bodyXml.replace(/<w:tbl\b[\s\S]*?<\/w:tbl>/g, (tblXml) => {
    const rowXmls = tblXml.match(/<w:tr\b[\s\S]*?<\/w:tr>/g) || [];
    const rows: string[][] = [];
    for (const rowXml of rowXmls) {
      const cellXmls = rowXml.match(/<w:tc\b[\s\S]*?<\/w:tc>/g) || [];
      const cells = cellXmls.map((tc) => {
        const pList = tc.match(/<w:p\b[\s\S]*?<\/w:p>/g) || [];
        return pList.map(extractWordParagraphText).filter(Boolean).join(' ');
      });
      if (cells.some((c) => c.length > 0)) rows.push(cells);
    }
    const idx = extractedTables.length;
    extractedTables.push(rows);
    return `<w:p><w:t>__ECON_TABLE_${idx}__</w:t></w:p>`;
  });

  const pBlocks = markedBody.match(/<w:p\b[\s\S]*?<\/w:p>/g) || [];
  for (const pXml of pBlocks) {
    // Check for embedded images inside this paragraph
    const embedMatches = Array.from(pXml.matchAll(/r:embed="([^"]+)"/g));
    for (const em of embedMatches) {
      const media = relImageMap.get(em[1]);
      if (media) {
        blocks.push({ type: 'image', url: media.url, name: media.name });
      }
    }

    const text = extractWordParagraphText(pXml);
    if (!text) continue;

    const tblToken = text.match(/^__ECON_TABLE_(\d+)__$/);
    if (tblToken) {
      const rows = extractedTables[Number(tblToken[1])];
      if (rows && rows.length > 0) {
        blocks.push({ type: 'table', rows });
        wordCount += rows.flat().join(' ').split(/\s+/).filter(Boolean).length;
      }
      continue;
    }

    wordCount += text.split(/\s+/).filter(Boolean).length;

    const styleMatch = pXml.match(/<w:pStyle[^>]*w:val="([^"]+)"/i);
    const styleVal = (styleMatch?.[1] || '').toLowerCase();
    const isBullet = /<w:numPr\b/.test(pXml);

    if (styleVal.includes('title') || styleVal === 'heading1' || styleVal === 'baslik1' || styleVal === 'başlık1') {
      blocks.push({ type: 'heading', level: 1, text });
    } else if (styleVal === 'heading2' || styleVal === 'baslik2' || styleVal === 'başlık2') {
      blocks.push({ type: 'heading', level: 2, text });
    } else if (styleVal.includes('heading') || styleVal.includes('baslik') || styleVal.includes('başlık')) {
      blocks.push({ type: 'heading', level: 3, text });
    } else {
      blocks.push({ type: 'paragraph', text, isBullet });
    }
  }

  return {
    blocks,
    wordCount,
    revokeUrls: () => {
      for (const u of createdObjectUrls) {
        try {
          URL.revokeObjectURL(u);
        } catch {
          // ignore
        }
      }
    },
  };
}

function getEffectiveMimeForBlob(kind: PreviewFileKind, rawType?: string | null, fileName?: string | null): string {
  if (kind === 'pdf') return 'application/pdf';
  if (kind === 'pptx') return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
  if (kind === 'docx') return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (kind === 'image') {
    const clean = (rawType || '').split(';')[0].trim().toLowerCase();
    if (/^image\/(png|jpe?g|webp|gif|bmp)$/.test(clean)) return clean;
    return guessMediaMime(fileName || 'image.png');
  }
  if (kind === 'text') return 'text/plain; charset=utf-8';
  return 'application/octet-stream';
}

function isLegacyExternalHostUrl(rawUrl: string): boolean {
  if (!/^https?:\/\//i.test(rawUrl)) return false;
  try {
    const parsedUrl = new URL(rawUrl);
    const currentHost = new URL(SUPABASE_URL).host;
    return parsedUrl.host !== currentHost;
  } catch {
    return false;
  }
}

async function getFreshAccessToken(): Promise<string | null> {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    let token = sessionData.session?.access_token ?? null;
    const expiresAtMs = (sessionData.session?.expires_at ?? 0) * 1000;
    if (!token || (expiresAtMs > 0 && expiresAtMs - Date.now() < 60_000)) {
      const refreshed = await supabase.auth.refreshSession().catch(() => ({ data: { session: null } }));
      token = refreshed.data.session?.access_token ?? token;
    }
    return token;
  } catch {
    return null;
  }
}

/**
 * Resolves and loads the REAL file for an Admin Panel note preview.
 *
 * Security & Reliability flow:
 * 1. Primary: Invokes the server-side `admin-note-preview` Edge Function which validates
 *    the admin JWT + `public.is_admin`, reads the authoritative `notes` record (regardless
 *    of pending / 72h-expired revision / archived status), and issues a short-lived signed URL.
 * 2. Fallback (if Edge Function is not yet deployed): Uses `admin_get_note_for_preview` RPC /
 *    fresh DB note query + authenticated Storage `createSignedUrl` + authenticated `storage.download()`.
 * 3. Fetches actual file bytes so PDF/PPTX/DOCX/Images render reliably even if uploaded with
 *    empty or `application/octet-stream` MIME types, and NEVER hides real errors.
 */
export async function resolveAdminNotePreviewFile(
  note: Record<string, any>,
): Promise<AdminNotePreviewResolution> {
  const emptyFail = (
    error: string,
    errorCode: string,
    extra?: Partial<AdminNotePreviewResolution>,
  ): AdminNotePreviewResolution => ({
    ok: false,
    fileKind: detectPreviewFileKind({
      fileName: extra?.fileName ?? note?.file_name,
      fileType: extra?.fileType ?? note?.file_type,
      fileUrl: note?.file_url,
    }),
    signedUrl: extra?.signedUrl ?? null,
    blobUrl: null,
    arrayBuffer: null,
    fileName: extra?.fileName ?? note?.file_name ?? 'Belge',
    fileType: extra?.fileType ?? note?.file_type ?? null,
    fileSize: extra?.fileSize ?? null,
    resolvedPath: extra?.resolvedPath ?? null,
    source: extra?.source ?? 'none',
    freshNote: extra?.freshNote ?? note ?? null,
    error,
    errorCode,
    dispose: () => {},
  });

  if (!note?.id) {
    return emptyFail('Geçersiz not kaydı.', 'INVALID_NOTE');
  }

  let activeNote: Record<string, any> = note;
  let signedUrl: string | null = null;
  let resolvedPath: string | null = null;
  let fileSize: number | null = null;
  let fileName: string = note.file_name || 'Belge';
  let fileType: string | null = note.file_type || null;
  let source: AdminNotePreviewResolution['source'] = 'none';
  let directBlob: Blob | null = null;
  let lastDiagnosticError = '';

  const accessToken = await getFreshAccessToken();
  if (!accessToken) {
    return emptyFail(
      'Yönetici oturumu doğrulanamadı. Lütfen çıkış yapıp yönetici hesabınızla yeniden giriş yapın.',
      'UNAUTHORIZED',
    );
  }

  // ==================== LAYER 1: SERVER-SIDE ADMIN EDGE FUNCTION ====================
  try {
    const { data: efData, error: efErr } = await supabase.functions.invoke('admin-note-preview', {
      body: { noteId: note.id, expiresIn: 900 },
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!efErr && efData && typeof efData === 'object') {
      const payload = efData as Record<string, any>;
      if (payload.note && typeof payload.note === 'object') {
        activeNote = { ...activeNote, ...payload.note };
      }
      if (typeof payload.signedUrl === 'string' && payload.signedUrl) {
        signedUrl = payload.signedUrl;
        resolvedPath = typeof payload.resolvedPath === 'string' ? payload.resolvedPath : null;
        fileName = typeof payload.fileName === 'string' && payload.fileName ? payload.fileName : fileName;
        fileType = typeof payload.fileType === 'string' && payload.fileType ? payload.fileType : fileType;
        fileSize = typeof payload.fileSize === 'number' ? payload.fileSize : null;
        source = payload.isExternalLegacyUrl ? 'legacy_external_url' : 'edge_function';
      } else if (payload.error) {
        if (payload.code === 'FORBIDDEN' || payload.code === 'UNAUTHORIZED') {
          return emptyFail(String(payload.error), String(payload.code), { freshNote: activeNote });
        }
        if (payload.code === 'NO_FILE_URL' || payload.code === 'OBJECT_NOT_FOUND' || payload.code === 'NOTE_NOT_FOUND') {
          return emptyFail(String(payload.error), String(payload.code), { freshNote: activeNote });
        }
        lastDiagnosticError = String(payload.error);
      }
    } else if (efErr) {
      // Check if Edge Function returned a structured HTTP 403/404 response vs unavailable function
      const errCtx = (efErr as { context?: Response }).context;
      if (errCtx && typeof errCtx.status === 'number') {
        try {
          const errJson = (await errCtx.clone().json()) as Record<string, any>;
          if (errCtx.status === 403 || errCtx.status === 401) {
            return emptyFail(
              String(errJson.error || 'Bu işlem için yetkili yönetici oturumu gerekir.'),
              String(errJson.code || 'FORBIDDEN'),
              { freshNote: activeNote },
            );
          }
          if (
            errCtx.status === 404 &&
            errJson.code &&
            ['NO_FILE_URL', 'OBJECT_NOT_FOUND', 'NOTE_NOT_FOUND'].includes(String(errJson.code))
          ) {
            return emptyFail(
              String(errJson.error || 'Belge depolama alanında bulunamadı.'),
              String(errJson.code),
              { freshNote: activeNote },
            );
          }
        } catch {
          // Edge function itself returned 404/non-JSON (not deployed yet) -> proceed to Layer 2
        }
      }
    }
  } catch {
    // Edge Function unavailable/network fallback -> proceed to Layer 2
  }

  // ==================== LAYER 2: AUTHORITATIVE DB / RPC + AUTHENTICATED STORAGE ====================
  if (!signedUrl) {
    let rpcResolvedPath: string | null = null;

    // 2a. Try admin-only SECURITY DEFINER RPC (if migration is applied)
    try {
      const { data: rpcData, error: rpcErr } = await (supabase as any).rpc(
        'admin_get_note_for_preview',
        { _note_id: note.id },
      );
      if (!rpcErr && Array.isArray(rpcData) && rpcData[0]) {
        const row = rpcData[0] as Record<string, any>;
        activeNote = {
          ...activeNote,
          file_url: row.file_url ?? activeNote.file_url,
          file_name: row.file_name ?? activeNote.file_name,
          file_type: row.file_type ?? activeNote.file_type,
          status: row.status ?? activeNote.status,
        };
        if (typeof row.resolved_storage_path === 'string' && row.resolved_storage_path) {
          rpcResolvedPath = row.resolved_storage_path;
        }
        if (typeof row.storage_file_size === 'number' && row.storage_file_size > 0) {
          fileSize = row.storage_file_size;
        }
        if (typeof row.storage_mime_type === 'string' && row.storage_mime_type && !fileType) {
          fileType = row.storage_mime_type;
        }
      }
    } catch {
      // RPC not yet migrated -> fallback to direct notes select
    }

    // 2b. Always verify fresh DB row if file_url is missing
    if (!activeNote.file_url) {
      const { data: dbRow } = await supabase
        .from('notes')
        .select(NOTE_SELECT)
        .eq('id', note.id)
        .maybeSingle();
      if (dbRow) {
        activeNote = { ...activeNote, ...(dbRow as Record<string, any>) };
      }
    }

    fileName = activeNote.file_name || fileName;
    fileType = activeNote.file_type || fileType;

    const rawFileUrl = typeof activeNote.file_url === 'string' ? activeNote.file_url.trim() : '';
    if (!rawFileUrl && !rpcResolvedPath) {
      return emptyFail(
        'Bu not kaydına bağlı yüklenmiş bir dosya yolu (file_url) bulunmuyor.',
        'NO_FILE_URL',
        { freshNote: activeNote, fileName, fileType },
      );
    }

    const candidates = [
      ...(rpcResolvedPath ? [rpcResolvedPath] : []),
      ...extractStoragePathCandidates(rawFileUrl, NOTES_BUCKET),
    ].filter((v, idx, arr) => Boolean(v) && arr.indexOf(v) === idx);

    // 2c. Authenticated signed URL via Supabase Storage
    for (const cand of candidates) {
      const res = await signedNoteUrlWithDetail(cand, 900);
      if (res.signedUrl) {
        signedUrl = res.signedUrl;
        resolvedPath = res.path || cand;
        source = 'storage_signed_url';
        break;
      }
      if (res.error) lastDiagnosticError = res.error;
    }

    // 2d. Direct authenticated Storage download() fallback (uses admin JWT directly)
    if (!signedUrl) {
      for (const cand of candidates) {
        const { data: dlBlob, error: dlErr } = await supabase.storage
          .from(NOTES_BUCKET)
          .download(cand);
        if (!dlErr && dlBlob) {
          directBlob = dlBlob;
          resolvedPath = cand;
          fileSize = dlBlob.size || fileSize;
          if (!fileType && dlBlob.type) fileType = dlBlob.type;
          source = 'storage_direct_download';
          break;
        }
        if (dlErr?.message) lastDiagnosticError = dlErr.message;
      }
    }

    // 2e. Legacy external host URL fallback (e.g., notes migrated from older project host)
    if (!signedUrl && !directBlob && isLegacyExternalHostUrl(rawFileUrl)) {
      signedUrl = rawFileUrl;
      resolvedPath = candidates[0] || rawFileUrl;
      source = 'legacy_external_url';
    }
  }

  if (!signedUrl && !directBlob) {
    const isPermissionErr = /permission|policy|rls|forbidden|unauthorized|not authorized|403/i.test(
      lastDiagnosticError,
    );
    const isMissingErr = /not found|object not found|404/i.test(lastDiagnosticError);
    const friendlyError = isPermissionErr
      ? `Yönetici Storage erişim yetkisi doğrulanamadı (${lastDiagnosticError}). Supabase Storage RLS politikası ve yönetici rolünüzü (user_roles) kontrol edin.`
      : isMissingErr
      ? 'Bu nota ait dosya Supabase Storage deposunda bulunamadı. Dosya yükleme sırasında yarıda kesilmiş veya depodan silinmiş olabilir.'
      : lastDiagnosticError
      ? `Dosya bağlantısı oluşturulamadı: ${lastDiagnosticError}`
      : 'Dosya bağlantısı oluşturulamadı.';

    return emptyFail(friendlyError, isPermissionErr ? 'STORAGE_FORBIDDEN' : isMissingErr ? 'OBJECT_NOT_FOUND' : 'STORAGE_ERROR', {
      freshNote: activeNote,
      fileName,
      fileType,
      resolvedPath,
    });
  }

  // ==================== LAYER 3: FETCH ACTUAL BYTES FOR RELIABLE IN-BROWSER RENDERING ====================
  let arrayBuffer: ArrayBuffer | null = null;
  let fetchedMime: string | null = null;

  if (directBlob) {
    arrayBuffer = await directBlob.arrayBuffer();
    fetchedMime = directBlob.type || null;
    fileSize = directBlob.size || arrayBuffer.byteLength;
  } else if (signedUrl) {
    try {
      const resp = await fetch(signedUrl, { credentials: 'omit' });
      if (resp.ok) {
        fetchedMime = resp.headers.get('content-type')?.split(';')[0]?.trim() || null;
        arrayBuffer = await resp.arrayBuffer();
        fileSize = arrayBuffer.byteLength || fileSize;
      } else {
        lastDiagnosticError = `HTTP ${resp.status} ${resp.statusText}`.trim();
      }
    } catch (fetchErr) {
      lastDiagnosticError = fetchErr instanceof Error ? fetchErr.message : 'Dosya indirilemedi.';
    }

    // If fetch(signedUrl) failed (e.g. CORS or token race), fall back to authenticated storage.download()
    if (!arrayBuffer && resolvedPath && source !== 'legacy_external_url') {
      const { data: fallbackBlob, error: fbErr } = await supabase.storage
        .from(NOTES_BUCKET)
        .download(resolvedPath);
      if (!fbErr && fallbackBlob) {
        arrayBuffer = await fallbackBlob.arrayBuffer();
        fetchedMime = fallbackBlob.type || fetchedMime;
        fileSize = fallbackBlob.size || arrayBuffer.byteLength;
        source = 'storage_direct_download';
      } else if (fbErr?.message) {
        lastDiagnosticError = fbErr.message;
      }
    }
  }

  // If bytes couldn't be fetched at all, report real error (while preserving signedUrl if available for fallback download)
  if (!arrayBuffer || arrayBuffer.byteLength === 0) {
    return emptyFail(
      lastDiagnosticError
        ? `Dosya içeriği sunucudan okunamadı (${lastDiagnosticError}).`
        : 'Dosya boş görünüyor veya sunucudan okunamadı.',
      'FETCH_FAILED',
      {
        signedUrl,
        freshNote: activeNote,
        fileName,
        fileType,
        fileSize,
        resolvedPath,
        source,
      },
    );
  }

  const effectiveMimeInput =
    fileType && fileType !== 'application/octet-stream'
      ? fileType
      : fetchedMime && fetchedMime !== 'application/octet-stream'
      ? fetchedMime
      : fileType || fetchedMime;

  let fileKind = detectPreviewFileKind({
    fileName,
    fileType: effectiveMimeInput,
    fileUrl: activeNote.file_url,
    bytes: arrayBuffer,
  });
  fileKind = await refineZipFileKind(fileKind, arrayBuffer);

  const blobMime = getEffectiveMimeForBlob(fileKind, effectiveMimeInput, fileName);
  const typedBlob = new Blob([arrayBuffer], { type: blobMime });
  const blobUrl = URL.createObjectURL(typedBlob);

  return {
    ok: true,
    fileKind,
    signedUrl,
    blobUrl,
    arrayBuffer,
    fileName,
    fileType: blobMime || effectiveMimeInput || null,
    fileSize: fileSize ?? arrayBuffer.byteLength,
    resolvedPath,
    source,
    freshNote: activeNote,
    error: null,
    errorCode: null,
    dispose: () => {
      try {
        URL.revokeObjectURL(blobUrl);
      } catch {
        // ignore
      }
    },
  };
}
