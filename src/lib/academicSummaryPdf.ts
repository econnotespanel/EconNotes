/**
 * EconNotes Publication-Grade Turkish Unicode Binary PDF Generator
 *
 * Generates real, self-contained, vector-text `.pdf` documents using `pdf-lib` + `@pdf-lib/fontkit`
 * and bundled Liberation Sans TrueType fonts (full Turkish UTF-8: ÇçĞğİıÖöŞşÜü + math symbols).
 *
 * Guarantees:
 * - Zero popup blockers, zero browser print-dialog failures — direct binary `.pdf` download & device save
 * - Accurate Table of Contents (İçindekiler) with resolved PDF page numbers and source page references
 * - Running header + page numbers (`Sayfa X / Y`) on every page
 * - Strict word-wrapping and table column sizing so text NEVER overflows page margins
 * - Clean formatting for headings, subheadings, formulas, comparison tables, callout boxes,
 *   examples, exam tips, section recaps, glossary, and quality/coverage report
 */

import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import regularFontUrl from '@/assets/fonts/LiberationSans-Regular.ttf?url';
import boldFontUrl from '@/assets/fonts/LiberationSans-Bold.ttf?url';
import italicFontUrl from '@/assets/fonts/LiberationSans-Italic.ttf?url';
import { ECONNOTES_LOGO_LIGHT_URI } from '@/components/study/video/econnotesBrandLogo';
import { APP_VERSION_LABEL } from '@/lib/version';
import type { SummaryContent } from '@/types/study';

export interface AcademicSummaryPdfInput {
  title: string;
  course?: string | null;
  university?: string | null;
  department?: string | null;
  sourceFileNames?: string[];
  createdAt?: string;
  summary: SummaryContent;
}

function decodeBase64DataUriToBytes(dataUri: string): Uint8Array | null {
  try {
    const commaIdx = dataUri.indexOf(',');
    const b64 = commaIdx !== -1 ? dataUri.slice(commaIdx + 1) : dataUri;
    if (typeof atob === 'function') {
      const bin = atob(b64);
      const out = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
      return out;
    }
    if (typeof Buffer !== 'undefined') {
      return new Uint8Array(Buffer.from(b64, 'base64'));
    }
  } catch {
    return null;
  }
  return null;
}

interface LoadedFonts {
  regular: Uint8Array;
  bold: Uint8Array;
  italic: Uint8Array;
}

let cachedFontBytes: LoadedFonts | null = null;

async function readFontAssetBytes(assetUrl: string, fileName: string): Promise<Uint8Array> {
  // Node / Vitest fallback: read bundled font directly from disk when fetch isn't serving Vite assets
  if (typeof process !== 'undefined' && process.versions?.node) {
    try {
      const fsSpecifier = ['node', 'fs'].join(':');
      const pathSpecifier = ['node', 'path'].join(':');
      const fs = (await import(/* @vite-ignore */ fsSpecifier)) as typeof import('node:fs');
      const path = (await import(/* @vite-ignore */ pathSpecifier)) as typeof import('node:path');
      const candidates = [
        path.resolve(process.cwd(), 'src/assets/fonts', fileName),
        path.resolve(process.cwd(), 'node_modules/pdfjs-dist/standard_fonts', fileName),
      ];
      for (const p of candidates) {
        if (fs.existsSync(p)) {
          return new Uint8Array(fs.readFileSync(p));
        }
      }
    } catch {
      // Fall through to fetch
    }
  }

  const resp = await fetch(assetUrl);
  if (!resp.ok) {
    throw new Error(`PDF Türkçe yazı tipi yüklenemedi (${fileName}).`);
  }
  return new Uint8Array(await resp.arrayBuffer());
}

async function getBundledFontBytes(): Promise<LoadedFonts> {
  if (cachedFontBytes) return cachedFontBytes;
  const [regular, bold, italic] = await Promise.all([
    readFontAssetBytes(regularFontUrl, 'LiberationSans-Regular.ttf'),
    readFontAssetBytes(boldFontUrl, 'LiberationSans-Bold.ttf'),
    readFontAssetBytes(italicFontUrl, 'LiberationSans-Italic.ttf'),
  ]);
  cachedFontBytes = { regular, bold, italic };
  return cachedFontBytes;
}

/**
 * Normalizes Markdown & LaTeX formulas into crisp, readable Unicode text fully supported by
 * Liberation Sans (preserves ALL Turkish characters: Ç, ç, Ğ, ğ, İ, ı, Ö, ö, Ş, ş, Ü, ü).
 */
export function formatAcademicTextForPdf(raw: string): string {
  let s = String(raw || '')
    .replace(/\r\n/g, '\n')
    .replace(/\t/g, '  ');

  // Convert LaTeX commands to clean Unicode academic notation
  s = s
    .replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, '($1) / ($2)')
    .replace(/\\sqrt\{([^{}]+)\}/g, '√($1)')
    .replace(/\\sum\b/g, 'Σ')
    .replace(/\\prod\b/g, 'Π')
    .replace(/\\int\b/g, '∫')
    .replace(/\\partial\b/g, '∂')
    .replace(/\\infty\b/g, '∞')
    .replace(/\\alpha\b/g, 'α')
    .replace(/\\beta\b/g, 'β')
    .replace(/\\gamma\b/g, 'γ')
    .replace(/\\delta\b/g, 'δ')
    .replace(/\\Delta\b/g, 'Δ')
    .replace(/\\epsilon\b/g, 'ε')
    .replace(/\\lambda\b/g, 'λ')
    .replace(/\\mu\b/g, 'μ')
    .replace(/\\sigma\b/g, 'σ')
    .replace(/\\Sigma\b/g, 'Σ')
    .replace(/\\pi\b/g, 'π')
    .replace(/\\rho\b/g, 'ρ')
    .replace(/\\theta\b/g, 'θ')
    .replace(/\\chi\b/g, 'χ')
    .replace(/\\leq?\b/g, '≤')
    .replace(/\\geq?\b/g, '≥')
    .replace(/\\neq\b/g, '≠')
    .replace(/\\approx\b/g, '≈')
    .replace(/\\pm\b/g, '±')
    .replace(/\\times\b/g, '×')
    .replace(/\\cdot\b/g, '·')
    .replace(/\\div\b/g, '÷')
    .replace(/\\rightarrow\b|\\to\b/g, '→')
    .replace(/\\leftarrow\b/g, '←')
    .replace(/\\leftrightarrow\b/g, '↔')
    .replace(/\\Rightarrow\b/g, '⇒')
    .replace(/\\bar\{([^{}]+)\}/g, '$1̄')
    .replace(/\\hat\{([^{}]+)\}/g, '$1̂')
    .replace(/\\text\{([^{}]+)\}/g, '$1')
    .replace(/\\mathrm\{([^{}]+)\}/g, '$1')
    .replace(/\\left|\\right/g, '')
    .replace(/\$\$([\s\S]*?)\$\$/g, '$1')
    .replace(/\$([^$\n]+)\$/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*\n]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\\([a-zA-Z]+)/g, '$1')
    .replace(/[{}]/g, '');

  // Strip astral emoji characters not present in Liberation Sans while keeping Latin, Turkish, Greek, Math & Punctuation
  s = Array.from(s)
    .filter((ch) => {
      const cp = ch.codePointAt(0) ?? 0;
      if (cp === 10 || cp === 13) return true;
      if (cp < 32) return false;
      if (cp > 0xffff) return false;
      // Exclude symbol/emoji ranges that show missing tofu boxes
      if (cp >= 0x2600 && cp <= 0x27bf) return false;
      return true;
    })
    .join('');

  return s.replace(/[ ]{2,}/g, ' ').trim();
}

export function buildSummaryPdfFileName(
  course?: string | null,
  title?: string | null,
  createdAt?: string,
): string {
  const trDate = (() => {
    try {
      const d = createdAt ? new Date(createdAt) : new Date();
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/Istanbul',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).formatToParts(d);
      const y = parts.find((p) => p.type === 'year')?.value || '2026';
      const m = parts.find((p) => p.type === 'month')?.value || '01';
      const day = parts.find((p) => p.type === 'day')?.value || '01';
      return `${y}-${m}-${day}`;
    } catch {
      return new Date().toISOString().slice(0, 10);
    }
  })();

  const slugify = (val: string) =>
    val
      .toLocaleLowerCase('tr-TR')
      .replace(/ç/g, 'c')
      .replace(/ğ/g, 'g')
      .replace(/ı/g, 'i')
      .replace(/ö/g, 'o')
      .replace(/ş/g, 's')
      .replace(/ü/g, 'u')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 42);

  const courseSlug = slugify(course || '');
  const titleSlug = slugify(title || 'calisma-ozeti');
  const base =
    courseSlug && titleSlug && !titleSlug.includes(courseSlug) && !courseSlug.includes(titleSlug)
      ? `${courseSlug}-${titleSlug}`
      : courseSlug.length >= titleSlug.length
      ? courseSlug || titleSlug || 'ders-ozeti'
      : titleSlug || courseSlug || 'ders-ozeti';
  return `econnotes-${base}-ozet-${trDate}.pdf`;
}

// A4 dimensions in PDF points
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN_X = 46;
const MARGIN_TOP = 64;
const MARGIN_BOTTOM = 54;
const CONTENT_W = PAGE_W - MARGIN_X * 2;

const COLORS = {
  brandDark: rgb(0 / 255, 42 / 255, 114 / 255), // #002a72
  brandBlue: rgb(0 / 255, 55 / 255, 145 / 255), // #003791
  brandAccent: rgb(14 / 255, 116 / 255, 204 / 255), // #0e74cc
  textMain: rgb(15 / 255, 23 / 255, 42 / 255), // #0f172a
  textBody: rgb(30 / 255, 41 / 255, 59 / 255), // #1e293b
  textMuted: rgb(100 / 255, 116 / 255, 139 / 255), // #64748b
  borderLight: rgb(203 / 255, 213 / 255, 225 / 255), // #cbd5e1
  softBlueBg: rgb(239 / 255, 246 / 255, 255 / 255), // #eff6ff
  softSlateBg: rgb(248 / 255, 250 / 255, 252 / 255), // #f8fafc
  amberBg: rgb(255 / 255, 251 / 255, 235 / 255), // #fffbeb
  amberBorder: rgb(217 / 255, 119 / 255, 6 / 255), // #d97706
  greenBg: rgb(236 / 255, 253 / 255, 245 / 255), // #ecfdf5
  greenBorder: rgb(5 / 255, 150 / 255, 105 / 255), // #059669
  white: rgb(1, 1, 1),
};

function safeMeasure(font: PDFFont, text: string, size: number): number {
  try {
    return font.widthOfTextAtSize(text, size);
  } catch {
    return text.length * size * 0.54;
  }
}

function wrapTextToLines(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const clean = formatAcademicTextForPdf(text);
  if (!clean) return [];
  const paragraphs = clean.split('\n');
  const lines: string[] = [];

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;
    const words = trimmed.split(/\s+/);
    let current = '';

    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (safeMeasure(font, candidate, size) <= maxWidth) {
        current = candidate;
      } else {
        if (current) lines.push(current);
        if (safeMeasure(font, word, size) <= maxWidth) {
          current = word;
        } else {
          // Break unusually long token (e.g. URL or long formula) safely so it never overflows
          let slice = '';
          for (const ch of word) {
            if (safeMeasure(font, slice + ch, size) > maxWidth && slice) {
              lines.push(slice);
              slice = ch;
            } else {
              slice += ch;
            }
          }
          current = slice;
        }
      }
    }
    if (current) lines.push(current);
  }
  return lines;
}

interface TocEntry {
  title: string;
  pageRange?: string;
  contentPageIndex: number; // 0-based index among content pages
  level: 1 | 2;
}

interface ParsedMdBlock {
  kind: 'subheading' | 'paragraph' | 'bullet' | 'quote' | 'formula' | 'table';
  text?: string;
  items?: string[];
  columns?: string[];
  rows?: string[][];
}

function parseMarkdownForPdf(markdown: string): ParsedMdBlock[] {
  const lines = String(markdown || '').replace(/\r\n/g, '\n').split('\n');
  const blocks: ParsedMdBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const trimmed = lines[i].trim();
    if (!trimmed) {
      i++;
      continue;
    }

    // Display formula block $$...$$
    if (trimmed.startsWith('$$')) {
      const eqLines = [trimmed.replace(/^\$\$/, '')];
      if (!trimmed.endsWith('$$') || trimmed === '$$') {
        i++;
        while (i < lines.length && !lines[i].trim().endsWith('$$')) {
          eqLines.push(lines[i].trim());
          i++;
        }
        if (i < lines.length) {
          eqLines.push(lines[i].trim().replace(/\$\$$/, ''));
        }
      } else {
        eqLines[0] = eqLines[0].replace(/\$\$$/, '');
      }
      i++;
      const eqText = eqLines.join(' ').trim();
      if (eqText) blocks.push({ kind: 'formula', text: eqText });
      continue;
    }

    // Markdown table
    if (trimmed.startsWith('|') && i + 1 < lines.length && lines[i + 1].trim().startsWith('|')) {
      const tblLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        tblLines.push(lines[i].trim());
        i++;
      }
      const parseRow = (r: string) =>
        r
          .replace(/^\|/, '')
          .replace(/\|$/, '')
          .split('|')
          .map((c) => c.trim());
      const cols = parseRow(tblLines[0]);
      const dataRows = tblLines
        .slice(1)
        .filter((r) => !/^\|[\s:|-]+\|$/.test(r))
        .map(parseRow);
      if (cols.length >= 2 && dataRows.length >= 1) {
        blocks.push({ kind: 'table', columns: cols, rows: dataRows });
      }
      continue;
    }

    // Subheading
    const hMatch = trimmed.match(/^#{1,4}\s+(.+)$/);
    if (hMatch) {
      blocks.push({ kind: 'subheading', text: hMatch[1].trim() });
      i++;
      continue;
    }

    // Unordered or numbered list
    if (/^(?:[-•*]|\d+\.)\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^(?:[-•*]|\d+\.)\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^(?:[-•*]|\d+\.)\s+/, '').trim());
        i++;
      }
      blocks.push({ kind: 'bullet', items });
      continue;
    }

    // Blockquote / Exam highlight
    if (trimmed.startsWith('>')) {
      const qLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        qLines.push(lines[i].trim().replace(/^>\s?/, '').trim());
        i++;
      }
      const joined = qLines.join(' ').trim();
      if (joined) {
        const looksFormula =
          joined.length <= 130 &&
          (/[=±≤≥∑√]/.test(joined) || /\$[^$]+\$/.test(joined)) &&
          !/sınav|ipucu|dikkat/i.test(joined);
        blocks.push({ kind: looksFormula ? 'formula' : 'quote', text: joined });
      }
      continue;
    }

    // Regular paragraph
    const para: string[] = [trimmed];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{1,4}\s+|[-•*]\s+|\d+\.\s+|\||>|\$\$)/.test(lines[i].trim())
    ) {
      para.push(lines[i].trim());
      i++;
    }
    blocks.push({ kind: 'paragraph', text: para.join(' ') });
  }

  return blocks;
}

/**
 * Generates a real, downloadable, Turkish-character-compliant binary PDF (`Uint8Array`)
 * with cover metadata, Table of Contents page with real page numbers, full sections,
 * formulas, tables, callout boxes, glossary, and quality audit summary.
 */
export async function generateAcademicSummaryPdfBytes(
  input: AcademicSummaryPdfInput,
): Promise<Uint8Array> {
  const fontBytes = await getBundledFontBytes();
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);

  const fontRegular = await pdfDoc.embedFont(fontBytes.regular, { subset: true });
  const fontBold = await pdfDoc.embedFont(fontBytes.bold, { subset: true });
  const fontItalic = await pdfDoc.embedFont(fontBytes.italic, { subset: true });

  const courseLabel = formatAcademicTextForPdf(
    input.course || input.summary.disciplineTag || 'Akademik Çalışma Notu',
  );
  const docTitle = formatAcademicTextForPdf(input.title || 'Ayrıntılı Çalışma Özeti');
  const dateLabel = (() => {
    try {
      return new Date(input.createdAt || Date.now()).toLocaleDateString('tr-TR', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      });
    } catch {
      return new Date().toISOString().slice(0, 10);
    }
  })();

  pdfDoc.setTitle(`${docTitle} — EconNotes`);
  pdfDoc.setAuthor('EconNotes Çalışma Stüdyosu');
  pdfDoc.setSubject(`${courseLabel} Akademik Ders Özeti`);
  pdfDoc.setCreator(`EconNotes ${APP_VERSION_LABEL}`);

  const summary = input.summary;
  const sections = Array.isArray(summary.sections) ? summary.sections : [];

  // ==================== PAGE 1: COVER & OVERVIEW ====================
  const coverPage = pdfDoc.addPage([PAGE_W, PAGE_H]);

  // Top Royal-Blue Academic Header Banner with embedded real EconNotes PNG Logo
  const bannerH = 166;
  coverPage.drawRectangle({
    x: 0,
    y: PAGE_H - bannerH,
    width: PAGE_W,
    height: bannerH,
    color: COLORS.brandBlue,
  });
  coverPage.drawRectangle({
    x: 0,
    y: PAGE_H - bannerH,
    width: PAGE_W,
    height: 6,
    color: COLORS.brandAccent,
  });

  // Embed crisp white EconNotes brand logo on top-left of Page 1 cover
  let logoEmbedded = false;
  const logoBytes = decodeBase64DataUriToBytes(ECONNOTES_LOGO_LIGHT_URI);
  if (logoBytes) {
    try {
      const logoImg = await pdfDoc.embedPng(logoBytes);
      const targetH = 22;
      const aspect = logoImg.width > 0 && logoImg.height > 0 ? logoImg.width / logoImg.height : 4.58;
      const targetW = Math.min(130, targetH * aspect);
      coverPage.drawImage(logoImg, {
        x: MARGIN_X,
        y: PAGE_H - 42,
        width: targetW,
        height: targetH,
      });
      coverPage.drawText(formatAcademicTextForPdf(`ÇALIŞMA STÜDYOSU  •  AKADEMİK DERS ÖZETİ (${APP_VERSION_LABEL})`), {
        x: MARGIN_X + targetW + 14,
        y: PAGE_H - 35,
        size: 8.2,
        font: fontBold,
        color: rgb(186 / 255, 230 / 255, 253 / 255),
      });
      logoEmbedded = true;
    } catch {
      logoEmbedded = false;
    }
  }

  if (!logoEmbedded) {
    coverPage.drawText(`ECONNOTES ÇALIŞMA STÜDYOSU  •  AKADEMİK DERS NOTU (${APP_VERSION_LABEL})`, {
      x: MARGIN_X,
      y: PAGE_H - 36,
      size: 8.5,
      font: fontBold,
      color: rgb(186 / 255, 230 / 255, 253 / 255),
    });
  }

  const coverTitleLines = wrapTextToLines(docTitle, fontBold, 19.5, CONTENT_W).slice(0, 2);
  let titleY = PAGE_H - 76;
  for (const tl of coverTitleLines) {
    coverPage.drawText(tl, {
      x: MARGIN_X,
      y: titleY,
      size: 19.5,
      font: fontBold,
      color: COLORS.white,
    });
    titleY -= 24;
  }

  const academicContextParts = [
    `Ders: ${courseLabel}`,
    `Tarih: ${dateLabel}`,
    `${sections.length} Bölüm`,
  ];
  coverPage.drawText(formatAcademicTextForPdf(academicContextParts.join('   |   ')), {
    x: MARGIN_X,
    y: PAGE_H - bannerH + 34,
    size: 9.4,
    font: fontBold,
    color: rgb(224 / 255, 242 / 255, 254 / 255),
  });

  const uniDeptParts = [input.university, input.department]
    .map((v) => (v || '').trim())
    .filter(Boolean);
  if (uniDeptParts.length > 0) {
    coverPage.drawText(
      formatAcademicTextForPdf(uniDeptParts.join('  •  ')).slice(0, 96),
      {
        x: MARGIN_X,
        y: PAGE_H - bannerH + 18,
        size: 8.6,
        font: fontRegular,
        color: rgb(186 / 255, 230 / 255, 253 / 255),
      },
    );
  }

  let coverY = PAGE_H - bannerH - 22;

  // Document metadata summary box (includes source file names, pages, terms & quality score)
  const sourceFilesClean = (
    input.sourceFileNames && input.sourceFileNames.length > 0
      ? input.sourceFileNames
      : (summary.sourceCourseBreakdown || []).map((b) => b.sourceName)
  )
    .map((n) => formatAcademicTextForPdf(n))
    .filter(Boolean);

  const statsParts = [
    `Kaynak Sayfası: ${summary.documentProfile?.totalPagesOrSlides || summary.metadata?.sourceStats?.pagesOrSlides || 1} sayfa/slayt`,
    `Bölüm: ${sections.length}`,
    `Sözlük: ${summary.keyTerms?.length || 0} terim`,
  ];
  if (summary.qualityAudit) {
    statsParts.push(`Kalite & Kapsam: %${summary.qualityAudit.overallScore} (Başlık: %${summary.qualityAudit.headingCoveragePct})`);
  }

  const metaLineText = [
    statsParts.join('  •  '),
    sourceFilesClean.length > 0
      ? `Kaynak Belge${sourceFilesClean.length > 1 ? 'ler' : ''}: ${sourceFilesClean.slice(0, 3).join(', ')}${sourceFilesClean.length > 3 ? ` (+${sourceFilesClean.length - 3})` : ''}`
      : null,
  ]
    .filter(Boolean)
    .join('\n');

  const metaLines = wrapTextToLines(metaLineText, fontBold, 8.6, CONTENT_W - 22).slice(0, 3);
  const metaBoxH = Math.max(42, 16 + metaLines.length * 13.5);
  coverPage.drawRectangle({
    x: MARGIN_X,
    y: coverY - metaBoxH,
    width: CONTENT_W,
    height: metaBoxH,
    color: COLORS.softBlueBg,
    borderColor: COLORS.borderLight,
    borderWidth: 0.8,
  });
  metaLines.forEach((ml, idx) => {
    coverPage.drawText(ml, {
      x: MARGIN_X + 11,
      y: coverY - 17 - idx * 13.5,
      size: 8.6,
      font: idx === 0 ? fontBold : fontRegular,
      color: idx === 0 ? COLORS.brandDark : COLORS.textBody,
    });
  });
  coverY -= metaBoxH + 18;

  // Executive Overview on Cover Page
  coverPage.drawText('GENEL ÇERÇEVE VE YÖNETİCİ ÖZETİ', {
    x: MARGIN_X,
    y: coverY,
    size: 11,
    font: fontBold,
    color: COLORS.brandBlue,
  });
  coverY -= 16;

  const overviewLines = wrapTextToLines(summary.overview || '', fontRegular, 10, CONTENT_W);
  for (const line of overviewLines) {
    if (coverY < MARGIN_BOTTOM + 140) break;
    coverPage.drawText(line, {
      x: MARGIN_X,
      y: coverY,
      size: 10,
      font: fontRegular,
      color: COLORS.textBody,
    });
    coverY -= 14.5;
  }

  // Key Points preview on cover page
  if (summary.keyPoints && summary.keyPoints.length > 0 && coverY > MARGIN_BOTTOM + 90) {
    coverY -= 12;
    coverPage.drawText('TEMEL AKADEMİK ÇIKARIMLAR', {
      x: MARGIN_X,
      y: coverY,
      size: 10.5,
      font: fontBold,
      color: COLORS.brandBlue,
    });
    coverY -= 15;

    for (const kp of summary.keyPoints.slice(0, 8)) {
      const kpLines = wrapTextToLines(kp, fontRegular, 9.4, CONTENT_W - 16);
      if (coverY - kpLines.length * 13.2 < MARGIN_BOTTOM + 20) break;
      coverPage.drawText('•', {
        x: MARGIN_X + 3,
        y: coverY,
        size: 10,
        font: fontBold,
        color: COLORS.brandAccent,
      });
      for (const l of kpLines) {
        coverPage.drawText(l, {
          x: MARGIN_X + 14,
          y: coverY,
          size: 9.4,
          font: fontRegular,
          color: COLORS.textBody,
        });
        coverY -= 13.2;
      }
      coverY -= 3;
    }
  }

  // ==================== CONTENT PAGES ENGINE ====================
  const contentPages: PDFPage[] = [];
  const tocEntries: TocEntry[] = [];
  let page: PDFPage = pdfDoc.addPage([PAGE_W, PAGE_H]);
  contentPages.push(page);
  let cursorY = PAGE_H - MARGIN_TOP;

  const newContentPage = () => {
    page = pdfDoc.addPage([PAGE_W, PAGE_H]);
    contentPages.push(page);
    cursorY = PAGE_H - MARGIN_TOP;
  };

  const ensureSpace = (neededHeight: number) => {
    if (cursorY - neededHeight < MARGIN_BOTTOM) {
      newContentPage();
    }
  };

  const drawLines = (
    lines: string[],
    opts: {
      font?: PDFFont;
      size?: number;
      lineHeight?: number;
      x?: number;
      color?: ReturnType<typeof rgb>;
    } = {},
  ) => {
    const f = opts.font || fontRegular;
    const size = opts.size ?? 9.8;
    const lh = opts.lineHeight ?? size * 1.44;
    const x = opts.x ?? MARGIN_X;
    const color = opts.color ?? COLORS.textBody;

    for (const ln of lines) {
      ensureSpace(lh + 2);
      page.drawText(ln, { x, y: cursorY, size, font: f, color });
      cursorY -= lh;
    }
  };

  const drawCalloutBox = (params: {
    title: string;
    bodyLines: string[];
    bgColor: ReturnType<typeof rgb>;
    borderColor: ReturnType<typeof rgb>;
    titleColor: ReturnType<typeof rgb>;
    italicBody?: boolean;
  }) => {
    if (params.bodyLines.length === 0) return;
    const lineH = 13.2;
    const boxH = 26 + params.bodyLines.length * lineH + 8;
    if (boxH <= PAGE_H - MARGIN_TOP - MARGIN_BOTTOM - 20) {
      ensureSpace(boxH + 8);
      const topY = cursorY;
      page.drawRectangle({
        x: MARGIN_X,
        y: topY - boxH,
        width: CONTENT_W,
        height: boxH,
        color: params.bgColor,
        borderColor: COLORS.borderLight,
        borderWidth: 0.6,
      });
      page.drawRectangle({
        x: MARGIN_X,
        y: topY - boxH,
        width: 3.5,
        height: boxH,
        color: params.borderColor,
      });
      page.drawText(formatAcademicTextForPdf(params.title), {
        x: MARGIN_X + 12,
        y: topY - 16,
        size: 9.2,
        font: fontBold,
        color: params.titleColor,
      });
      let innerY = topY - 31;
      for (const bl of params.bodyLines) {
        page.drawText(bl, {
          x: MARGIN_X + 12,
          y: innerY,
          size: 9.1,
          font: params.italicBody ? fontItalic : fontRegular,
          color: COLORS.textBody,
        });
        innerY -= lineH;
      }
      cursorY = topY - boxH - 10;
    } else {
      // Very long callout spans pages cleanly without clipping
      ensureSpace(26);
      page.drawText(formatAcademicTextForPdf(params.title), {
        x: MARGIN_X + 6,
        y: cursorY,
        size: 9.5,
        font: fontBold,
        color: params.titleColor,
      });
      cursorY -= 15;
      drawLines(params.bodyLines, {
        font: params.italicBody ? fontItalic : fontRegular,
        size: 9.1,
        lineHeight: 13.2,
        x: MARGIN_X + 10,
      });
      cursorY -= 8;
    }
  };

  const drawTable = (columns: string[], rows: string[][], tableTitle?: string) => {
    const colCount = Math.max(2, Math.min(5, columns.length));
    const normCols = columns.slice(0, colCount).map((c) => formatAcademicTextForPdf(c));
    const colW = CONTENT_W / colCount;
    const cellPadX = 6;
    const cellPadY = 5;
    const fontSize = colCount >= 4 ? 8.2 : 8.8;
    const lineH = fontSize * 1.35;

    if (tableTitle) {
      ensureSpace(36);
      page.drawText(formatAcademicTextForPdf(tableTitle), {
        x: MARGIN_X,
        y: cursorY,
        size: 10.5,
        font: fontBold,
        color: COLORS.brandDark,
      });
      cursorY -= 16;
    }

    const drawHeaderRow = () => {
      const wrappedCols = normCols.map((c) => wrapTextToLines(c, fontBold, fontSize, colW - cellPadX * 2));
      const maxLines = Math.max(1, ...wrappedCols.map((w) => w.length));
      const rowH = maxLines * lineH + cellPadY * 2;
      ensureSpace(rowH + 16);
      const topY = cursorY;
      page.drawRectangle({
        x: MARGIN_X,
        y: topY - rowH,
        width: CONTENT_W,
        height: rowH,
        color: COLORS.softBlueBg,
        borderColor: COLORS.borderLight,
        borderWidth: 0.7,
      });
      for (let c = 0; c < colCount; c++) {
        const cx = MARGIN_X + c * colW;
        if (c > 0) {
          page.drawLine({
            start: { x: cx, y: topY },
            end: { x: cx, y: topY - rowH },
            thickness: 0.5,
            color: COLORS.borderLight,
          });
        }
        wrappedCols[c].forEach((ln, li) => {
          page.drawText(ln, {
            x: cx + cellPadX,
            y: topY - cellPadY - fontSize - li * lineH + 1,
            size: fontSize,
            font: fontBold,
            color: COLORS.brandDark,
          });
        });
      }
      cursorY = topY - rowH;
    };

    drawHeaderRow();

    rows.forEach((rawRow, rIdx) => {
      const cells = Array.from({ length: colCount }, (_, ci) =>
        wrapTextToLines(rawRow[ci] || '—', fontRegular, fontSize, colW - cellPadX * 2),
      );
      const maxLines = Math.max(1, ...cells.map((c) => c.length));
      const rowH = maxLines * lineH + cellPadY * 2;

      if (cursorY - rowH < MARGIN_BOTTOM) {
        newContentPage();
        drawHeaderRow();
      }

      const topY = cursorY;
      page.drawRectangle({
        x: MARGIN_X,
        y: topY - rowH,
        width: CONTENT_W,
        height: rowH,
        color: rIdx % 2 === 1 ? COLORS.softSlateBg : COLORS.white,
        borderColor: COLORS.borderLight,
        borderWidth: 0.5,
      });
      for (let c = 0; c < colCount; c++) {
        const cx = MARGIN_X + c * colW;
        if (c > 0) {
          page.drawLine({
            start: { x: cx, y: topY },
            end: { x: cx, y: topY - rowH },
            thickness: 0.5,
            color: COLORS.borderLight,
          });
        }
        cells[c].forEach((ln, li) => {
          page.drawText(ln, {
            x: cx + cellPadX,
            y: topY - cellPadY - fontSize - li * lineH + 1,
            size: fontSize,
            font: c === 0 ? fontBold : fontRegular,
            color: COLORS.textBody,
          });
        });
      }
      cursorY = topY - rowH;
    });

    cursorY -= 12;
  };

  // Extraction warnings notice (if any) at start of content
  if (summary.extractionNotices && summary.extractionNotices.length > 0) {
    const noticeLines = summary.extractionNotices.flatMap((n) =>
      wrapTextToLines(`• ${n}`, fontRegular, 9.1, CONTENT_W - 24),
    );
    drawCalloutBox({
      title: 'BELGE OKUMA VE EKSIK / GÖRSEL SAYFA BİLDİRİMİ',
      bodyLines: noticeLines,
      bgColor: COLORS.amberBg,
      borderColor: COLORS.amberBorder,
      titleColor: COLORS.amberBorder,
    });
  }

  // ==================== RENDER ALL SECTIONS ====================
  sections.forEach((sec, idx) => {
    if (idx > 0 && cursorY < MARGIN_BOTTOM + 130) {
      newContentPage();
    } else if (idx > 0) {
      cursorY -= 8;
    }

    const headingClean = formatAcademicTextForPdf(`${idx + 1}. ${sec.heading}`);
    tocEntries.push({
      title: headingClean,
      pageRange: sec.pageRange ? formatAcademicTextForPdf(sec.pageRange) : undefined,
      contentPageIndex: contentPages.length - 1,
      level: 1,
    });

    // Section Banner Bar
    const hLines = wrapTextToLines(headingClean, fontBold, 12.5, CONTENT_W - 18);
    const barH = Math.max(28, hLines.length * 16 + (sec.pageRange ? 18 : 10));
    ensureSpace(barH + 24);
    const barTop = cursorY;

    page.drawRectangle({
      x: MARGIN_X,
      y: barTop - barH,
      width: CONTENT_W,
      height: barH,
      color: COLORS.softBlueBg,
      borderColor: COLORS.borderLight,
      borderWidth: 0.7,
    });
    page.drawRectangle({
      x: MARGIN_X,
      y: barTop - barH,
      width: 4,
      height: barH,
      color: COLORS.brandBlue,
    });

    hLines.forEach((hl, hi) => {
      page.drawText(hl, {
        x: MARGIN_X + 12,
        y: barTop - 17 - hi * 15.5,
        size: 12.5,
        font: fontBold,
        color: COLORS.brandDark,
      });
    });

    if (sec.pageRange) {
      page.drawText(formatAcademicTextForPdf(`Kaynak Referansı: ${sec.pageRange}`), {
        x: MARGIN_X + 12,
        y: barTop - barH + 6,
        size: 8.2,
        font: fontItalic,
        color: COLORS.textMuted,
      });
    }
    cursorY = barTop - barH - 12;

    // Parse and render rich section blocks
    const blocks = parseMarkdownForPdf(sec.content || '');
    for (const blk of blocks) {
      if (blk.kind === 'subheading' && blk.text) {
        cursorY -= 4;
        const shLines = wrapTextToLines(blk.text, fontBold, 10.6, CONTENT_W);
        ensureSpace(shLines.length * 15 + 16);
        drawLines(shLines, { font: fontBold, size: 10.6, lineHeight: 14.8, color: COLORS.brandBlue });
        cursorY -= 3;
      } else if (blk.kind === 'paragraph' && blk.text) {
        const pLines = wrapTextToLines(blk.text, fontRegular, 9.7, CONTENT_W);
        drawLines(pLines, { font: fontRegular, size: 9.7, lineHeight: 14.2 });
        cursorY -= 5;
      } else if (blk.kind === 'bullet' && blk.items) {
        for (const item of blk.items) {
          const bLines = wrapTextToLines(item, fontRegular, 9.5, CONTENT_W - 18);
          if (bLines.length === 0) continue;
          ensureSpace(15);
          page.drawText('•', {
            x: MARGIN_X + 4,
            y: cursorY,
            size: 10,
            font: fontBold,
            color: COLORS.brandAccent,
          });
          drawLines(bLines, { font: fontRegular, size: 9.5, lineHeight: 13.8, x: MARGIN_X + 16 });
          cursorY -= 2.5;
        }
        cursorY -= 4;
      } else if (blk.kind === 'formula' && blk.text) {
        const fLines = wrapTextToLines(blk.text, fontBold, 9.6, CONTENT_W - 26);
        drawCalloutBox({
          title: 'FORMÜL / MODEL İFADESİ',
          bodyLines: fLines,
          bgColor: COLORS.softSlateBg,
          borderColor: COLORS.brandAccent,
          titleColor: COLORS.brandDark,
        });
      } else if (blk.kind === 'quote' && blk.text) {
        const qLines = wrapTextToLines(blk.text, fontRegular, 9.2, CONTENT_W - 26);
        drawCalloutBox({
          title: 'ÖNEMLİ NOT / SINAV VURGUSU',
          bodyLines: qLines,
          bgColor: COLORS.softBlueBg,
          borderColor: COLORS.brandBlue,
          titleColor: COLORS.brandBlue,
        });
      } else if (blk.kind === 'table' && blk.columns && blk.rows) {
        drawTable(blk.columns, blk.rows);
      }
    }

    // Section pitfalls box
    if (sec.commonPitfalls && sec.commonPitfalls.length > 0) {
      const pitLines = sec.commonPitfalls.flatMap((p) =>
        wrapTextToLines(`• ${p}`, fontRegular, 9.1, CONTENT_W - 26),
      );
      drawCalloutBox({
        title: 'SINAVDA DİKKAT EDİLECEK NOKTALAR VE KAVRAM TUZAKLARI',
        bodyLines: pitLines,
        bgColor: COLORS.amberBg,
        borderColor: COLORS.amberBorder,
        titleColor: COLORS.amberBorder,
      });
    }

    // Section end recap
    if (sec.takeaways && sec.takeaways.length > 0) {
      const tkLines = sec.takeaways.flatMap((t) =>
        wrapTextToLines(`• ${t}`, fontRegular, 9.1, CONTENT_W - 26),
      );
      drawCalloutBox({
        title: 'BÖLÜM SONU KISA TEKRAR',
        bodyLines: tkLines,
        bgColor: COLORS.greenBg,
        borderColor: COLORS.greenBorder,
        titleColor: COLORS.greenBorder,
      });
    }
  });

  // ==================== APPENDIX: COMPARATIVE MATRIX ====================
  if (summary.comparativeMatrix?.columns?.length && summary.comparativeMatrix?.rows?.length) {
    ensureSpace(90);
    tocEntries.push({
      title: formatAcademicTextForPdf(summary.comparativeMatrix.title || 'Karşılaştırmalı Tablo'),
      contentPageIndex: contentPages.length - 1,
      level: 1,
    });
    drawTable(
      summary.comparativeMatrix.columns,
      summary.comparativeMatrix.rows,
      summary.comparativeMatrix.title || 'Karşılaştırmalı Akademik Tablo',
    );
  }

  // ==================== APPENDIX: KEY TERMS GLOSSARY ====================
  if (summary.keyTerms && summary.keyTerms.length > 0) {
    ensureSpace(80);
    tocEntries.push({
      title: 'Kavram ve Formül Sözlüğü',
      contentPageIndex: contentPages.length - 1,
      level: 1,
    });
    page.drawText('KAVRAM VE FORMÜL SÖZLÜĞÜ', {
      x: MARGIN_X,
      y: cursorY,
      size: 11.5,
      font: fontBold,
      color: COLORS.brandBlue,
    });
    cursorY -= 16;

    const termRows = summary.keyTerms.slice(0, 36).map((kt) => [
      kt.term,
      kt.formula ? `${kt.definition} [Formül: ${kt.formula}]` : kt.definition,
    ]);
    drawTable(['Kavram / Terim', 'Akademik Tanım ve Kapsam'], termRows);
  }

  // ==================== APPENDIX: MEMORIZE VS INTERPRET & EXAM EMPHASIS ====================
  if (
    summary.memorizeVsInterpret &&
    (summary.memorizeVsInterpret.memorize?.length || summary.memorizeVsInterpret.interpret?.length)
  ) {
    ensureSpace(80);
    tocEntries.push({
      title: 'Sınav Stratejisi: Ezberlenecekler vs. Yorumlanacaklar',
      contentPageIndex: contentPages.length - 1,
      level: 1,
    });
    const maxLen = Math.max(
      summary.memorizeVsInterpret.memorize?.length || 0,
      summary.memorizeVsInterpret.interpret?.length || 0,
    );
    const mviRows = Array.from({ length: maxLen }, (_, i) => [
      summary.memorizeVsInterpret?.memorize?.[i] || '—',
      summary.memorizeVsInterpret?.interpret?.[i] || '—',
    ]);
    drawTable(
      ['Doğrudan Bilinmesi / Ezberlenmesi Gerekenler', 'Yorumlanması ve İlişkilendirilmesi Gerekenler'],
      mviRows,
      'Ezberlenecekler ve Yorumlanacaklar Ayrımı',
    );
  }

  if (summary.teacherEmphasis && summary.teacherEmphasis.length > 0) {
    ensureSpace(70);
    const empLines = summary.teacherEmphasis.flatMap((e) =>
      wrapTextToLines(
        `• ${e.point}${e.examProbability ? ` (${e.examProbability})` : ''}: ${e.whyImportant}`,
        fontRegular,
        9.1,
        CONTENT_W - 26,
      ),
    );
    drawCalloutBox({
      title: 'SINAVDA SORULABİLECEK KRİTİK AYRINTILAR',
      bodyLines: empLines,
      bgColor: COLORS.amberBg,
      borderColor: COLORS.amberBorder,
      titleColor: COLORS.amberBorder,
    });
  }

  // ==================== APPENDIX: SYNTHESIS & QUALITY AUDIT ====================
  if (summary.summarySynthesis) {
    ensureSpace(70);
    tocEntries.push({
      title: 'Bütüncül Konu Değerlendirmesi ve Kalite Denetimi',
      contentPageIndex: contentPages.length - 1,
      level: 1,
    });
    const synLines = wrapTextToLines(summary.summarySynthesis, fontRegular, 9.5, CONTENT_W - 26);
    drawCalloutBox({
      title: 'BÜTÜNCÜL KONU DEĞERLENDİRMESİ',
      bodyLines: synLines,
      bgColor: COLORS.softBlueBg,
      borderColor: COLORS.brandBlue,
      titleColor: COLORS.brandDark,
    });
  }

  if (summary.qualityAudit) {
    const qaLines = [
      `Genel Kalite Puanı: %${summary.qualityAudit.overallScore}  |  Başlık Kapsamı: %${summary.qualityAudit.headingCoveragePct}  |  Kaynak Örtüşmesi: %${summary.qualityAudit.groundingScorePct}`,
      ...summary.qualityAudit.checks.map(
        (ck, ci) => `${ci + 1}. ${ck.label}: ${ck.detail}`,
      ),
    ].flatMap((l) => wrapTextToLines(l, fontRegular, 8.7, CONTENT_W - 26));
    drawCalloutBox({
      title: 'ECONNOTES 10 MADDELİK AKADEMİK KALİTE VE KAPSAM DENETİMİ',
      bodyLines: qaLines,
      bgColor: COLORS.softSlateBg,
      borderColor: COLORS.brandAccent,
      titleColor: COLORS.brandDark,
    });
  }

  // ==================== INSERT DEDICATED TABLE OF CONTENTS PAGE(S) AFTER COVER ====================
  const entriesPerTocPage = 26;
  const tocPageCount = Math.max(1, Math.ceil(tocEntries.length / entriesPerTocPage));
  const tocPages: PDFPage[] = [];

  for (let tp = 0; tp < tocPageCount; tp++) {
    const tocPage = pdfDoc.insertPage(1 + tp, [PAGE_W, PAGE_H]);
    tocPages.push(tocPage);
    let ty = PAGE_H - MARGIN_TOP;

    tocPage.drawText(tp === 0 ? 'İÇİNDEKİLER' : 'İÇİNDEKİLER (DEVAM)', {
      x: MARGIN_X,
      y: ty,
      size: 15,
      font: fontBold,
      color: COLORS.brandBlue,
    });
    tocPage.drawLine({
      start: { x: MARGIN_X, y: ty - 8 },
      end: { x: PAGE_W - MARGIN_X, y: ty - 8 },
      thickness: 1.4,
      color: COLORS.brandBlue,
    });
    ty -= 28;

    const slice = tocEntries.slice(tp * entriesPerTocPage, (tp + 1) * entriesPerTocPage);
    for (const entry of slice) {
      // Final 1-based PDF page number: cover (1) + tocPageCount + contentPageIndex + 1
      const finalPageNum = 1 + tocPageCount + entry.contentPageIndex + 1;
      const rightLabel = entry.pageRange
        ? `${entry.pageRange}  •  s. ${finalPageNum}`
        : `Sayfa ${finalPageNum}`;
      const rightW = safeMeasure(fontBold, rightLabel, 9.2);
      const maxLeftW = Math.max(120, CONTENT_W - rightW - 22);
      const titleLine = wrapTextToLines(entry.title, fontBold, 9.6, maxLeftW)[0] || entry.title;

      tocPage.drawText(titleLine, {
        x: MARGIN_X,
        y: ty,
        size: 9.6,
        font: fontBold,
        color: COLORS.textMain,
      });
      tocPage.drawText(rightLabel, {
        x: PAGE_W - MARGIN_X - rightW,
        y: ty,
        size: 9.2,
        font: fontBold,
        color: COLORS.brandBlue,
      });
      tocPage.drawLine({
        start: { x: MARGIN_X, y: ty - 5 },
        end: { x: PAGE_W - MARGIN_X, y: ty - 5 },
        thickness: 0.4,
        color: COLORS.borderLight,
      });
      ty -= 22;
    }
  }

  // ==================== STAMP RUNNING HEADER & PAGE NUMBERS ON ALL PAGES ====================
  const allPages = pdfDoc.getPages();
  const totalPdfPages = allPages.length;
  const headerLeft = formatAcademicTextForPdf(`EconNotes Çalışma Stüdyosu  •  ${courseLabel}`).slice(0, 82);
  const footerLeft = formatAcademicTextForPdf(`EconNotes  •  ${docTitle}`).slice(0, 76);

  allPages.forEach((p, pageIdx) => {
    const pageNum = pageIdx + 1;

    // Skip running header on Cover page (page 1 has the full royal-blue banner)
    if (pageIdx > 0) {
      p.drawText(headerLeft, {
        x: MARGIN_X,
        y: PAGE_H - 34,
        size: 8.2,
        font: fontBold,
        color: COLORS.textMuted,
      });
      p.drawLine({
        start: { x: MARGIN_X, y: PAGE_H - 42 },
        end: { x: PAGE_W - MARGIN_X, y: PAGE_H - 42 },
        thickness: 0.6,
        color: COLORS.borderLight,
      });
    }

    // Footer with page number on every page
    p.drawLine({
      start: { x: MARGIN_X, y: 36 },
      end: { x: PAGE_W - MARGIN_X, y: 36 },
      thickness: 0.6,
      color: COLORS.borderLight,
    });
    p.drawText(footerLeft, {
      x: MARGIN_X,
      y: 22,
      size: 8.2,
      font: fontRegular,
      color: COLORS.textMuted,
    });
    const pageStr = `Sayfa ${pageNum} / ${totalPdfPages}`;
    const pageStrW = safeMeasure(fontBold, pageStr, 8.4);
    p.drawText(pageStr, {
      x: PAGE_W - MARGIN_X - pageStrW,
      y: 22,
      size: 8.4,
      font: fontBold,
      color: COLORS.brandBlue,
    });
  });

  return pdfDoc.save();
}

function triggerBlobDownload(bytes: Uint8Array, fileName: string): void {
  const blob = new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/**
 * Direct binary PDF download to the user's device.
 */
export async function downloadAcademicSummaryPdf(
  input: AcademicSummaryPdfInput,
  precomputedBytes?: Uint8Array | null,
): Promise<{ fileName: string; bytes: Uint8Array }> {
  const bytes =
    precomputedBytes && precomputedBytes.byteLength > 200
      ? precomputedBytes
      : await generateAcademicSummaryPdfBytes(input);
  const fileName = buildSummaryPdfFileName(input.course, input.title, input.createdAt);
  triggerBlobDownload(bytes, fileName);
  return { fileName, bytes };
}

/**
 * Saves the generated PDF to the user's device using the native File System Access API
 * (`showSaveFilePicker`) when available, falling back seamlessly to direct binary PDF download.
 */
export async function saveAcademicSummaryPdfToDevice(
  input: AcademicSummaryPdfInput,
  precomputedBytes?: Uint8Array | null,
): Promise<{ fileName: string; method: 'picker' | 'download'; bytes: Uint8Array }> {
  const bytes =
    precomputedBytes && precomputedBytes.byteLength > 200
      ? precomputedBytes
      : await generateAcademicSummaryPdfBytes(input);
  const fileName = buildSummaryPdfFileName(input.course, input.title, input.createdAt);

  const picker = (window as unknown as {
    showSaveFilePicker?: (opts: {
      suggestedName?: string;
      types?: Array<{ description: string; accept: Record<string, string[]> }>;
    }) => Promise<{
      createWritable: () => Promise<{ write: (data: Blob) => Promise<void>; close: () => Promise<void> }>;
    }>;
  }).showSaveFilePicker;

  if (typeof picker === 'function') {
    try {
      const handle = await picker({
        suggestedName: fileName,
        types: [{ description: 'PDF Belgesi', accept: { 'application/pdf': ['.pdf'] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' }));
      await writable.close();
      return { fileName, method: 'picker', bytes };
    } catch (err) {
      // User explicitly cancelled picker -> do not force fallback download
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw err;
      }
    }
  }

  triggerBlobDownload(bytes, fileName);
  return { fileName, method: 'download', bytes };
}
