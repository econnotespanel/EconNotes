/**
 * EconNotes Next-Generation Document Structural Analyzer (Stages 1, 2, 3)
 *
 * Inspects uploaded PDF/PPTX/DOCX/Text lecture materials in full:
 * - Detects file formats, total pages/slides, density, main & sub-headings with page provenance
 * - Catalogs formulas, tables, charts/figures, and unreadable/image-only pages
 * - Builds page-aware, heading-aware, boundary-overlapping logical chunks so 100% of the document
 *   from page 1 to the final page is analyzed without dropping trailing chapters or severing concepts.
 */

import { extractFormulasFromText } from '@/lib/studySourceAnalysis';
import { classifyStudyDomain, extractFullDocumentOutline, type FullOutlineAnchor } from '@/lib/studySourceProcessor';
import {
  computeDynamicSummaryPlan,
  getDisciplineSummaryGuidance,
  splitDocumentIntoLogicalChunks,
  type DisciplineSummaryGuidance,
  type DynamicSummaryPlan,
  type LogicalDocumentChunk,
} from '@/lib/studySummaryArchitecture';
import type {
  ProcessedStudyBundle,
  StudioGenerationSettings,
  SummaryDocumentProfile,
} from '@/types/study';

export interface AnalyzedDocumentPlan {
  profile: SummaryDocumentProfile;
  guidance: DisciplineSummaryGuidance;
  summaryPlan: DynamicSummaryPlan;
  outline: FullOutlineAnchor[];
  formulas: string[];
  chunks: LogicalDocumentChunk[];
}

function inferFileKinds(bundle: ProcessedStudyBundle): string[] {
  const kinds = new Set<string>();
  for (const src of bundle.sources || []) {
    const n = (src.name || '').toLowerCase();
    if (n.endsWith('.pdf') || /---\s*Sayfa\s+\d+\s*---/i.test(src.text || '')) kinds.add('PDF');
    else if (n.endsWith('.pptx') || /---\s*Slayt\s+\d+\s*---/i.test(src.text || '')) kinds.add('PowerPoint (PPTX)');
    else if (n.endsWith('.docx')) kinds.add('Word (DOCX)');
    else if (src.audio) kinds.add('Ses Kaydı');
    else if (src.images?.length && src.isScannedOcr) kinds.add('Taranmış Görsel / OCR');
    else if (src.kind === 'pasted') kinds.add('Yapıştırılan Metin');
    else if (src.kind === 'note') kinds.add('EconNotes Ders Notu');
    else kinds.add('Metin Belgesi');
  }
  return kinds.size > 0 ? Array.from(kinds) : ['Ders Materyali'];
}

function countTablesAndFigures(text: string): { tablesCount: number; figuresCount: number; subheadingsCount: number } {
  const raw = text || '';
  const mdTableSeps = (raw.match(/^\|[\s:-]+\|/gm) || []).length;
  const tabloMentions = (raw.match(/\b(?:Tablo|Çizelge|Table)\s+\d+/gi) || []).length;
  const tablesCount = Math.max(mdTableSeps, tabloMentions);

  const figMentions = (
    raw.match(/\b(?:Şekil|Grafik|Diyagram|Şema|Figure|Chart|Graph)\s*\d*/gi) || []
  ).length;
  const pptxChartMarkers = (raw.match(/\[(?:Grafik Verisi|Diyagram \/ SmartArt)\]/gi) || []).length;
  const figuresCount = Math.max(figMentions, pptxChartMarkers);

  const subheadingsCount = (
    raw.match(/^(?:###|####|\d+\.\d+(?:\.\d+)?)\s+\S+/gm) || []
  ).length;

  return { tablesCount, figuresCount, subheadingsCount };
}

function computeDensity(totalWords: number, totalPages: number): SummaryDocumentProfile['density'] {
  const wordsPerPage = totalWords / Math.max(1, totalPages);
  if (totalWords >= 22_000 || wordsPerPage >= 420) return 'very_high';
  if (totalWords >= 8_000 || wordsPerPage >= 250) return 'high';
  if (totalWords >= 1_800 || wordsPerPage >= 110) return 'medium';
  return 'low';
}

/**
 * Stage 1–3: Full structural document recognition, complete outline extraction,
 * dynamic length calibration, and contextual overlap chunking.
 */
export function analyzeDocumentForSummary(
  bundle: ProcessedStudyBundle,
  settings: StudioGenerationSettings,
): AnalyzedDocumentPlan {
  const combined = (bundle.combinedText || '').trim();
  const domain = classifyStudyDomain(combined, bundle.course, bundle.title, settings.faculty);
  const resolvedCourse =
    bundle.course?.trim() ||
    bundle.detectedCourse?.trim() ||
    domain.detectedCourse ||
    domain.discipline ||
    bundle.title;

  const guidance = getDisciplineSummaryGuidance(resolvedCourse, domain.mode);
  const totalPages = Math.max(
    1,
    bundle.totalPagesOrSlides ||
      (combined.match(/---\s*(Sayfa|Slayt)\s+\d+\s*---/gi) || []).length ||
      Math.ceil((bundle.totalWords || 1) / 280),
  );
  const totalWords =
    bundle.totalWords || combined.split(/\s+/).filter(Boolean).length;

  // Capture ALL headings across the entire document (up to 64 for long textbooks)
  const outline = extractFullDocumentOutline(combined, totalPages >= 40 ? 64 : 36);
  const formulas = extractFormulasFromText(combined, 48);
  const { tablesCount, figuresCount, subheadingsCount } = countTablesAndFigures(combined);

  const unreadablePageSet = new Set<number>(
    (bundle.sources || [])
      .flatMap((s) => s.unreadablePages || [])
      .filter((n) => Number.isFinite(n)),
  );
  // Also detect inline scanned/unreadable page notices inside extracted page markers
  const pageSectionRe = /---\s*(?:Sayfa|Slayt)\s+(\d+)\s*---([\s\S]*?)(?=---\s*(?:Sayfa|Slayt)\s+\d+\s*---|$)/gi;
  let pageMatch: RegExpExecArray | null;
  while ((pageMatch = pageSectionRe.exec(combined)) !== null) {
    const pNum = Number(pageMatch[1]);
    const pBody = (pageMatch[2] || '').trim();
    if (
      Number.isFinite(pNum) &&
      (pBody.length < 25 || /taranmış\s+sayfa|okunabilir\s+metin\s+yetersiz|metin\s+çıkarılamadı/i.test(pBody))
    ) {
      unreadablePageSet.add(pNum);
    }
  }
  const unreadablePages = Array.from(unreadablePageSet).sort((a, b) => a - b);

  const warnings = Array.from(
    new Set([
      ...(bundle.extractionWarnings || []),
      ...(bundle.sources || []).flatMap((s) => s.extractionWarnings || []),
      ...(unreadablePages.length > 0
        ? [
            `${unreadablePages.length} sayfa/slayt görsel ağırlıklı veya taranmış içerik barındırdığı için metin katmanı sınırlı okundu (Sayfa: ${unreadablePages.slice(0, 10).join(', ')}).`,
          ]
        : []),
    ]),
  );

  const summaryPlan = computeDynamicSummaryPlan({
    totalWords,
    totalPagesOrSlides: totalPages,
    summaryDepth: settings.summaryDepth || 'comprehensive',
    examMode: settings.examMode || (totalPages >= 30 ? 'large_note' : 'balanced'),
  });

  // Always split medium/long/multi-section documents into meaningful logical chunks with context overlap.
  // Ensures 14–50+ page notes get genuine multi-chunk analysis with overlap instead of a single coarse pass.
  const effectiveChunkBudget =
    totalPages >= 80
      ? 18_000
      : totalPages >= 30
      ? 11_000
      : totalPages >= 14 && combined.length >= 4_500
      ? Math.min(8_000, Math.max(3_200, Math.ceil(combined.length / 2.3)))
      : combined.length > 9_000
      ? 8_000
      : Math.max(6_000, Math.ceil(combined.length / 2));

  const chunks =
    combined.length > 6_500 || (totalPages >= 14 && combined.length >= 4_500)
      ? splitDocumentIntoLogicalChunks(combined, effectiveChunkBudget, summaryPlan.maxChunks, 520)
      : splitDocumentIntoLogicalChunks(combined, Math.max(combined.length + 100, 12_000), 1, 0);

  const profile: SummaryDocumentProfile = {
    fileKinds: inferFileKinds(bundle),
    totalPagesOrSlides: totalPages,
    totalWords,
    totalChars: combined.length,
    density: computeDensity(totalWords, totalPages),
    headingsCount: outline.length,
    subheadingsCount,
    formulasCount: formulas.length,
    tablesCount,
    figuresOrChartsCount: figuresCount,
    unreadablePages,
    warnings,
    disciplineFamily: guidance.disciplineFamily,
    courseName: resolvedCourse,
    sourceNames: (bundle.sources || []).map((s) => s.name).filter(Boolean),
  };

  return {
    profile,
    guidance,
    summaryPlan,
    outline,
    formulas,
    chunks,
  };
}
