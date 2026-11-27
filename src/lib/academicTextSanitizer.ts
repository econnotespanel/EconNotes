/**
 * EconNotes Academic Text, OOXML/XML & HTML Markup Sanitizer
 *
 * Single source of truth for stripping raw Office Open XML (PPTX/DOCX/XLSX), XML,
 * and HTML markup across extraction, AI synthesis, tables, preview rendering, and PDF export
 * while strictly preserving Turkish Unicode letters, Markdown formatting, LaTeX math,
 * and mathematical comparison operators (e.g. `P < MC`, `|E_d| < 1`, `p < 0.05`).
 */

import type { ComparativeMatrix, SummaryContent, SummarySection } from '@/types/study';

// Known OOXML / XML namespace prefixes produced by PowerPoint, Word, Excel, and Office suites
const OOXML_TAG_RE =
  /<\/?(?:a|p|w|c|r|mc|xdr|pic|wp|v|o|dgm|dsp|m|rel|cp|dc|dcterms|vt|sl|cx|xr|w14|w15|a14|a16|p14|p15|xml|xmlns|svg):[a-zA-Z_][\w.-]*(?:\s+[^<>]*)?\/?>/gi;

// Truncated/unclosed OOXML tags that may appear if an LLM or legacy text clipped mid-tag
const OOXML_UNCLOSED_TAG_RE =
  /<\/?(?:a|p|w|c|r|mc|xdr|pic|wp|v|o|dgm|dsp|m|w14|w15|a14|a16|p14|p15):[a-zA-Z_][\w.-]*(?:\s+[a-zA-Z_:][\w.-]*=(?:"[^"]*"|'[^']*'))*\s*\/?>?/gi;

// Entity-encoded OOXML tags (e.g. &lt;a:br&gt;, &lt;/a:r&gt;)
const ESCAPED_OOXML_TAG_RE =
  /&lt;\/?(?:a|p|w|c|r|mc|xdr|pic|wp|v|o|dgm|dsp|m|w14|w15|a14|a16|p14|p15):[a-zA-Z_][\w.-]*(?:\s+[^&<>]*)?\/?&gt;/gi;

// OOXML line-break & tab elements converted to semantic whitespace before stripping
const OOXML_BR_RE = /<(?:\w+):(?:br|cr)\b[^>]*>(?:[\s\S]*?<\/(?:\w+):(?:br|cr)>)?|<(?:\w+):(?:br|cr)\b[^>]*\/>/gi;
const OOXML_TAB_RE = /<(?:\w+):tab\b[^>]*\/?>(?:<\/(?:\w+):tab>)?/gi;

// Strict HTML tag detection — multi-letter tags + constrained single-letter tags so math like `P < MC` or `x<a` is NEVER corrupted
const HTML_MULTI_TAG_NAMES =
  'html|head|body|title|meta|link|script|style|noscript|div|span|br|hr|h[1-6]|ul|ol|li|dl|dt|dd|table|thead|tbody|tfoot|tr|th|td|caption|colgroup|col|img|figure|figcaption|blockquote|pre|code|strong|em|sub|sup|small|mark|del|ins|section|article|aside|header|footer|nav|main|form|input|button|select|option|textarea|label|iframe|object|embed|svg|path|rect|circle|font|center';

const HTML_DANGEROUS_BLOCK_RE = /<(script|style|noscript|iframe|object)\b[^>]*>[\s\S]*?<\/\1>/gi;
const HTML_BR_RE = /<br\s*\/?>/gi;
const HTML_BLOCK_END_RE = /<\/(?:p|div|li|tr|h[1-6]|blockquote|section|article)\s*>/gi;
const HTML_MULTI_TAG_RE = new RegExp(`</?(?:${HTML_MULTI_TAG_NAMES})(?:\\s+[^<>]*)?/?>`, 'gi');
// Single-letter HTML tags only when immediately closed (</p>, <p>, <b>, </b>) or carrying explicit HTML attributes (<a href="...">, <p class="...">)
const HTML_SINGLE_TAG_RE = /<\/(?:a|b|i|p|s|u|g)\s*>|<(?:a|b|i|p|s|u|g)(?:\s+[a-zA-Z][\w:-]*\s*=\s*(?:"[^"]*"|'[^']*'|[^\s<>]+))*\s*\/?>/gi;

const XML_DECL_OR_COMMENT_RE = /<\?xml[\s\S]*?\?>|<!--[\s\S]*?-->|<!DOCTYPE[\s\S]*?>/gi;

// Stray OOXML attribute fragments left behind by broken legacy extractions (e.g. `lang="tr-TR" sz="1800" dirty="0">`)
const STRAY_OOXML_ATTR_RE =
  /\b(?:(?:lang|altLang|dirty|smtClean|err|sz|b|i|u|cap|spc|baseline|kumimoji|noProof|xml:space)\s*=\s*"[^"]*"\s*){2,}\/?>?/gi;

export const TECHNICAL_MARKUP_LEAK_PATTERNS: RegExp[] = [
  /<\/?(?:a|p|w|c|r|mc|xdr|pic|wp|v|o|dgm|dsp|m):[a-zA-Z_][\w.-]*/i,
  /&lt;\/?(?:a|p|w|c|r|mc):[a-zA-Z_][\w.-]*/i,
  /<\?xml\b/i,
  /<\/?(?:script|style|iframe|div|span|br|table|thead|tbody|tr|td|th|font|center)\b[^>]*>/i,
  /<\/(?:p|b|i|u|strong|em)\s*>/i,
  /<(?:p|div|span|a)\s+[a-zA-Z][\w:-]*\s*=\s*["'][^"']*["'][^>]*>/i,
  /\blang="tr-TR"\s+(?:dirty|sz|altLang|smtClean|b|i)=/i,
];

/**
 * Returns every distinct technical XML/HTML markup leak sample found in `raw`.
 * Safe against legitimate math expressions (`P < MC`, `|E_d| < 1`, `p < 0.05`) and Markdown blockquotes (`> ...`).
 */
export function findTechnicalMarkupLeaks(raw: string): string[] {
  const input = String(raw || '');
  if (!input) return [];

  // Mask fenced code blocks only when explicitly displaying code (never mask XML/HTML leaks in study prose/tables)
  const leaks = new Set<string>();

  const ooxmlMatches = input.match(OOXML_TAG_RE) || [];
  for (const m of ooxmlMatches) leaks.add(m.slice(0, 80));

  const escapedOoxml = input.match(ESCAPED_OOXML_TAG_RE) || [];
  for (const m of escapedOoxml) leaks.add(m.slice(0, 80));

  const htmlMulti = input.match(HTML_MULTI_TAG_RE) || [];
  for (const m of htmlMulti) leaks.add(m.slice(0, 80));

  const htmlSingle = input.match(HTML_SINGLE_TAG_RE) || [];
  for (const m of htmlSingle) leaks.add(m.slice(0, 80));

  const xmlDecl = input.match(XML_DECL_OR_COMMENT_RE) || [];
  for (const m of xmlDecl) leaks.add(m.slice(0, 80));

  const strayAttrs = input.match(STRAY_OOXML_ATTR_RE) || [];
  for (const m of strayAttrs) leaks.add(m.slice(0, 80));

  // Catch unclosed OOXML fragments like `<a:rPr lang="tr-TR"`
  const unclosedOoxml = input.match(/<\/?(?:a|p|w|c|r|mc):[a-zA-Z_][\w.-]*/gi) || [];
  for (const m of unclosedOoxml) leaks.add(m.slice(0, 80));

  return Array.from(leaks);
}

/**
 * Returns true if the text contains ANY raw OOXML, XML, or HTML tag leak.
 */
export function containsTechnicalMarkupLeak(raw: string): boolean {
  if (!raw || typeof raw !== 'string') return false;
  return TECHNICAL_MARKUP_LEAK_PATTERNS.some((re) => re.test(raw)) || findTechnicalMarkupLeaks(raw).length > 0;
}

/**
 * Strips all OOXML/XML/HTML markup from academic text while keeping semantic line breaks,
 * Markdown headings/lists/tables, LaTeX math, math inequalities, and Turkish UTF-8 intact.
 */
export function stripTechnicalMarkup(raw: string, options?: { singleLine?: boolean }): string {
  if (!raw) return '';
  let out = String(raw)
    .split('\0')
    .join('')
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ');

  // 1. Strip dangerous HTML blocks, XML comments/declarations first
  out = out.replace(HTML_DANGEROUS_BLOCK_RE, ' ');
  out = out.replace(XML_DECL_OR_COMMENT_RE, ' ');

  // 2. Convert semantic OOXML & HTML breaks/tabs before tag removal so words never glue together
  out = out.replace(OOXML_BR_RE, options?.singleLine ? ' ' : '\n');
  out = out.replace(OOXML_TAB_RE, ' ');
  out = out.replace(HTML_BR_RE, options?.singleLine ? ' ' : '\n');
  out = out.replace(HTML_BLOCK_END_RE, options?.singleLine ? ' ' : '\n');

  // 3. Remove OOXML / XML namespaced tags (both well-formed, entity-escaped, and unclosed fragments)
  out = out.replace(OOXML_TAG_RE, '');
  out = out.replace(ESCAPED_OOXML_TAG_RE, '');
  out = out.replace(OOXML_UNCLOSED_TAG_RE, '');
  out = out.replace(STRAY_OOXML_ATTR_RE, '');

  // 4. Remove raw HTML tags without disturbing math inequalities (`P < MC`, `|E_d| < 1`, `p < 0.05`)
  out = out.replace(HTML_MULTI_TAG_RE, '');
  out = out.replace(HTML_SINGLE_TAG_RE, '');

  // 5. Decode harmless XML entities if they survived extraction
  out = out
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&amp;/g, '&');

  // 6. Normalize whitespace cleanly
  if (options?.singleLine) {
    return out.replace(/\s+/g, ' ').trim();
  }

  return out
    .split('\n')
    .map((line) => line.replace(/[ \t]{2,}/g, ' ').trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Cleans a single Markdown table cell so XML tags, raw HTML, newlines, and unescaped pipes
 * never corrupt table layout or leak markup into UI or PDF.
 */
export function sanitizeMarkdownTableCell(raw: string): string {
  const clean = stripTechnicalMarkup(raw, { singleLine: true })
    .replace(/\|/g, '/')
    .replace(/\s+/g, ' ')
    .trim();
  return clean;
}

/**
 * Normalizes and repairs Markdown tables inside section content:
 * - Strips XML/HTML from every cell
 * - Ensures consistent column counts per table
 * - Drops broken/empty separator-only tables
 */
export function sanitizeMarkdownContent(raw: string): string {
  const cleaned = stripTechnicalMarkup(raw);
  if (!cleaned) return '';

  const lines = cleaned.split('\n');
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith('|') && i + 1 < lines.length && lines[i + 1].trim().startsWith('|')) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        tableLines.push(lines[i].trim());
        i++;
      }

      const splitRow = (rowLine: string): string[] =>
        rowLine
          .replace(/^\|/, '')
          .replace(/\|$/, '')
          .split('|')
          .map((cell) => sanitizeMarkdownTableCell(cell));

      const isSeparatorLine = (rowLine: string): boolean => {
        const cells = rowLine
          .replace(/^\|/, '')
          .replace(/\|$/, '')
          .split('|')
          .map((c) => c.trim());
        return cells.length >= 2 && cells.every((c) => /^:?-{2,}:?$/.test(c));
      };

      const parsedHeader = splitRow(tableLines[0]);
      const hasSep = tableLines.length >= 2 && isSeparatorLine(tableLines[1]);
      const rawBodyLines = hasSep ? tableLines.slice(2) : tableLines.slice(1);
      const parsedBody = rawBodyLines
        .filter((r) => !isSeparatorLine(r))
        .map(splitRow)
        .filter((row) => row.some((cell) => cell.length > 0 && cell !== '—' && cell !== '-'));

      const colCount = Math.max(
        parsedHeader.length,
        ...parsedBody.map((r) => r.length),
      );

      if (colCount >= 2 && parsedHeader.some((h) => h.length > 0) && parsedBody.length >= 1) {
        const normHeader = Array.from({ length: colCount }, (_, ci) => parsedHeader[ci] || `Sütun ${ci + 1}`);
        const normSep = Array.from({ length: colCount }, () => '---');
        out.push(`| ${normHeader.join(' | ')} |`);
        out.push(`| ${normSep.join(' | ')} |`);
        for (const r of parsedBody) {
          const normRow = Array.from({ length: colCount }, (_, ci) => r[ci] || '—');
          out.push(`| ${normRow.join(' | ')} |`);
        }
      } else {
        // Degrade malformed 1-col or empty table gracefully into clean prose bullets
        const flat = [...parsedHeader, ...parsedBody.flat()].filter(Boolean);
        if (flat.length > 0) out.push(`- ${flat.join(' — ')}`);
      }
      continue;
    }

    out.push(lines[i]);
    i++;
  }

  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function sanitizeComparativeMatrix(
  matrix?: ComparativeMatrix | null,
): ComparativeMatrix | undefined {
  if (!matrix || !Array.isArray(matrix.columns) || !Array.isArray(matrix.rows)) {
    return undefined;
  }
  const columns = matrix.columns
    .map((c) => sanitizeMarkdownTableCell(String(c || '')))
    .filter((c) => c.length > 0);
  if (columns.length < 2) return undefined;

  const colCount = columns.length;
  const rows = matrix.rows
    .filter((r) => Array.isArray(r))
    .map((r) => Array.from({ length: colCount }, (_, ci) => sanitizeMarkdownTableCell(String(r[ci] || '')) || '—'))
    .filter((r) => r.some((cell) => cell !== '—' && cell.length > 0));

  if (rows.length === 0) return undefined;

  return {
    title: stripTechnicalMarkup(matrix.title || 'Karşılaştırma Tablosu', { singleLine: true }) || 'Karşılaştırma Tablosu',
    columns,
    rows,
  };
}

export function sanitizeSummarySection(sec: SummarySection, fallbackIndex = 0): SummarySection {
  const cleanHeading = stripTechnicalMarkup(sec.heading || '', { singleLine: true }) || `Bölüm ${fallbackIndex + 1}`;
  const cleanContent = sanitizeMarkdownContent(sec.content || '');
  const cleanPageRange = sec.pageRange
    ? stripTechnicalMarkup(sec.pageRange, { singleLine: true })
    : undefined;
  const cleanTakeaways = Array.isArray(sec.takeaways)
    ? sec.takeaways
        .map((t) => stripTechnicalMarkup(String(t || ''), { singleLine: true }))
        .filter(Boolean)
    : undefined;
  const cleanPitfalls = Array.isArray(sec.commonPitfalls)
    ? sec.commonPitfalls
        .map((p) => stripTechnicalMarkup(String(p || ''), { singleLine: true }))
        .filter(Boolean)
    : undefined;
  const cleanDeepResearch = sec.deepResearchNote
    ? sanitizeMarkdownContent(sec.deepResearchNote)
    : undefined;
  const cleanCheckpoint =
    sec.checkpointQuestion &&
    typeof sec.checkpointQuestion.question === 'string' &&
    Array.isArray(sec.checkpointQuestion.options) &&
    sec.checkpointQuestion.options.length >= 2
      ? {
          question: stripTechnicalMarkup(sec.checkpointQuestion.question, { singleLine: true }),
          options: sec.checkpointQuestion.options.map((o) =>
            stripTechnicalMarkup(String(o || ''), { singleLine: true }),
          ),
          correctIndex: sec.checkpointQuestion.correctIndex,
          explanation: sec.checkpointQuestion.explanation
            ? stripTechnicalMarkup(sec.checkpointQuestion.explanation, { singleLine: true })
            : undefined,
        }
      : undefined;

  return {
    ...sec,
    index: typeof sec.index === 'number' ? sec.index : fallbackIndex,
    heading: cleanHeading,
    pageRange: cleanPageRange || undefined,
    content: cleanContent,
    takeaways: cleanTakeaways,
    commonPitfalls: cleanPitfalls && cleanPitfalls.length > 0 ? cleanPitfalls : undefined,
    deepResearchNote: cleanDeepResearch || undefined,
    checkpointQuestion: cleanCheckpoint,
  };
}

/**
 * Recursively sanitizes an entire SummaryContent payload before QA, persistence,
 * UI rendering, HTML export, or PDF generation so preview & PDF always match 1:1
 * with ZERO OOXML/XML/HTML tag leakage.
 */
export function sanitizeSummaryContent(summary: SummaryContent): SummaryContent {
  const sections = Array.isArray(summary.sections)
    ? summary.sections.map((s, idx) => sanitizeSummarySection(s, idx)).filter((s) => s.content.length > 0)
    : [];

  return {
    ...summary,
    overview: sanitizeMarkdownContent(summary.overview || ''),
    disciplineTag: summary.disciplineTag
      ? stripTechnicalMarkup(summary.disciplineTag, { singleLine: true })
      : undefined,
    keyPoints: Array.isArray(summary.keyPoints)
      ? summary.keyPoints
          .map((kp) => stripTechnicalMarkup(String(kp || ''), { singleLine: true }))
          .filter(Boolean)
      : [],
    sections,
    comparativeMatrix: sanitizeComparativeMatrix(summary.comparativeMatrix),
    keyTerms: Array.isArray(summary.keyTerms)
      ? summary.keyTerms
          .map((kt) => ({
            term: stripTechnicalMarkup(String(kt?.term || ''), { singleLine: true }),
            definition: stripTechnicalMarkup(String(kt?.definition || ''), { singleLine: true }),
            formula: kt?.formula ? stripTechnicalMarkup(String(kt.formula), { singleLine: true }) : undefined,
          }))
          .filter((kt) => kt.term.length >= 2 && kt.definition.length >= 6)
      : [],
    teacherEmphasis: Array.isArray(summary.teacherEmphasis)
      ? summary.teacherEmphasis
          .map((te) => ({
            point: stripTechnicalMarkup(String(te?.point || ''), { singleLine: true }),
            whyImportant: stripTechnicalMarkup(String(te?.whyImportant || ''), { singleLine: true }),
            examProbability: te?.examProbability
              ? stripTechnicalMarkup(String(te.examProbability), { singleLine: true })
              : undefined,
          }))
          .filter((te) => te.point.length > 0)
      : [],
    deepResearchTopics: Array.isArray(summary.deepResearchTopics)
      ? summary.deepResearchTopics
          .map((dt) => ({
            topic: stripTechnicalMarkup(String(dt?.topic || ''), { singleLine: true }),
            literatureContext: sanitizeMarkdownContent(String(dt?.literatureContext || '')),
            realWorldApplication: dt?.realWorldApplication
              ? stripTechnicalMarkup(String(dt.realWorldApplication), { singleLine: true })
              : undefined,
          }))
          .filter((dt) => dt.topic.length > 0)
      : undefined,
    memorizeVsInterpret: summary.memorizeVsInterpret
      ? {
          memorize: Array.isArray(summary.memorizeVsInterpret.memorize)
            ? summary.memorizeVsInterpret.memorize
                .map((m) => stripTechnicalMarkup(String(m || ''), { singleLine: true }))
                .filter(Boolean)
            : [],
          interpret: Array.isArray(summary.memorizeVsInterpret.interpret)
            ? summary.memorizeVsInterpret.interpret
                .map((it) => stripTechnicalMarkup(String(it || ''), { singleLine: true }))
                .filter(Boolean)
            : [],
        }
      : undefined,
    summarySynthesis: summary.summarySynthesis
      ? sanitizeMarkdownContent(summary.summarySynthesis)
      : undefined,
    studyChecklist: Array.isArray(summary.studyChecklist)
      ? summary.studyChecklist
          .map((item) => stripTechnicalMarkup(String(item || ''), { singleLine: true }))
          .filter(Boolean)
      : undefined,
    studyPriorityMap: Array.isArray(summary.studyPriorityMap)
      ? summary.studyPriorityMap.map((item) => ({
          ...item,
          topic: stripTechnicalMarkup(String(item.topic || ''), { singleLine: true }),
          reason: stripTechnicalMarkup(String(item.reason || ''), { singleLine: true }),
          focusConcepts: Array.isArray(item.focusConcepts)
            ? item.focusConcepts
                .map((fc) => stripTechnicalMarkup(String(fc || ''), { singleLine: true }))
                .filter(Boolean)
            : [],
        }))
      : undefined,
    extractionNotices: Array.isArray(summary.extractionNotices)
      ? summary.extractionNotices
          .map((n) => stripTechnicalMarkup(String(n || ''), { singleLine: true }))
          .filter(Boolean)
      : undefined,
  };
}
