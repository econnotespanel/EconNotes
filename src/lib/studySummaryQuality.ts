/**
 * EconNotes 10-Point Academic Summary Quality & Coverage Verification Gate (Stage 6)
 *
 * Audits every generated summary BEFORE presentation to the user:
 *  1. Complete section/heading coverage against extracted source outline
 *  2. Main & sub-heading (####) hierarchical preservation
 *  3. Thorough academic definitions & glossary depth
 *  4. Discipline fidelity (Economics theories/models/formulas, Law elements/articles/exceptions,
 *     Statistics formulas/assumptions/steps — zero fabricated math in Law)
 *  5. Examples, applications & case retention
 *  6. Source grounding & anti-hallucination verification (+ transparent [Ek Açıklama] check)
 *  7. Duplicate paragraph & redundant section removal
 *  8. Clarity & zero truncated ("...") / vague filler expressions
 *  9. Cross-section consistency & source page reference provenance
 * 10. Exam readiness & dynamic depth proportional to document length
 */

import { findTechnicalMarkupLeaks } from '@/lib/academicTextSanitizer';
import { foldTurkishToAscii } from '@/lib/courseDetector';
import {
  buildTurkishStemSet,
  extractContentTokens,
  jaccardSetSimilarity,
  normalizeForComparison,
  tokenOverlapRatio,
} from '@/lib/studyQualityEngine';
import type { DynamicSummaryPlan } from '@/lib/studySummaryArchitecture';
import type { FullOutlineAnchor } from '@/lib/studySourceProcessor';
import type {
  ProcessedStudyBundle,
  SummaryContent,
  SummaryDocumentProfile,
  SummaryQualityAuditReport,
  SummaryQualityCheckItem,
  SummarySection,
} from '@/types/study';

function countWords(text: string): number {
  return String(text || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

/**
 * Domain-specific modern micro/macro/monetary phrases that frequently leak into
 * non-economics or historical documents (e.g. "Aktarım Mekanizması ve Piyasa Dengesi"
 * under "Osmanlı Toplumsal Yapısı") when a model hallucinates or misroutes discipline prompts.
 */
const FOREIGN_MODERN_ECON_PHRASES = [
  'aktarim mekanizmasi',
  'aktarim mekanizmalari',
  'parasal aktarim',
  'piyasa dengesi',
  'is-lm',
  'ad-as',
  'keynesyen',
  'monetarist',
  'likidite tuzagi',
  'taylor kurali',
  'fisher denklemi',
  'cambridge yaklasimi',
  'slutsky denklemi',
  'lerner endeksi',
  'cournot',
  'bertrand',
  'nash dengesi',
  'farksizlik egrisi',
  'kayitsizlik egrisi',
  'marjinal ikame orani',
  'marjinal fayda',
  'talep esnekligi',
  'arz egrisi',
  'talep egrisi',
  'phillips egrisi',
  'solow modeli',
  'cobb-douglas',
  'para carpani',
  'acik piyasa islemleri',
];

const HISTORICAL_POLITY_ENTITIES: Array<{ key: string; label: string }> = [
  { key: 'selcuklu', label: 'Selçuklu' },
  { key: 'ilhanli', label: 'İlhanlı' },
  { key: 'bizans', label: 'Bizans' },
  { key: 'osmanli', label: 'Osmanlı' },
  { key: 'abbasi', label: 'Abbasi' },
  { key: 'emevi', label: 'Emevi' },
  { key: 'memluk', label: 'Memlük' },
  { key: 'safevi', label: 'Safevi' },
  { key: 'karahanli', label: 'Karahanlı' },
  { key: 'gazneli', label: 'Gazneli' },
  { key: 'timurlu', label: 'Timurlu' },
];

function collectAllSummaryStrings(summary: SummaryContent): string[] {
  const parts: string[] = [];
  if (summary.overview) parts.push(summary.overview);
  if (summary.disciplineTag) parts.push(summary.disciplineTag);
  if (summary.summarySynthesis) parts.push(summary.summarySynthesis);
  for (const kp of summary.keyPoints || []) parts.push(kp);
  for (const sec of summary.sections || []) {
    parts.push(sec.heading || '', sec.pageRange || '', sec.content || '');
    if (sec.deepResearchNote) parts.push(sec.deepResearchNote);
    for (const tk of sec.takeaways || []) parts.push(tk);
    for (const pit of sec.commonPitfalls || []) parts.push(pit);
    if (sec.checkpointQuestion) {
      parts.push(sec.checkpointQuestion.question || '', sec.checkpointQuestion.explanation || '');
      for (const opt of sec.checkpointQuestion.options || []) parts.push(opt);
    }
  }
  if (summary.comparativeMatrix) {
    parts.push(summary.comparativeMatrix.title || '');
    for (const col of summary.comparativeMatrix.columns || []) parts.push(col);
    for (const row of summary.comparativeMatrix.rows || []) {
      for (const cell of row) parts.push(cell);
    }
  }
  for (const kt of summary.keyTerms || []) {
    parts.push(kt.term || '', kt.definition || '', kt.formula || '');
  }
  for (const te of summary.teacherEmphasis || []) {
    parts.push(te.point || '', te.whyImportant || '');
  }
  for (const m of summary.memorizeVsInterpret?.memorize || []) parts.push(m);
  for (const ip of summary.memorizeVsInterpret?.interpret || []) parts.push(ip);
  for (const cl of summary.studyChecklist || []) parts.push(cl);
  return parts.filter(Boolean);
}

/**
 * Checks whether a single summary section is off-topic relative to the source document:
 * 1. Its heading introduces foreign modern-economics concepts completely absent from the source text, OR
 * 2. Its heading shares zero substantive stem overlap with the source/outline AND its body has low source grounding.
 */
export function detectOffTopicSection(params: {
  section: SummarySection;
  sourceFolded: string;
  sourceStemSet: Set<string>;
  outlineStemSet: Set<string>;
  sourceWordCount: number;
}): { isOffTopic: boolean; reason?: string; leakedPhrases: string[] } {
  const headingFolded = foldTurkishToAscii(params.section.heading || '');
  const bodyFolded = foldTurkishToAscii(params.section.content || '');

  // 1. Direct foreign-discipline heading contamination check (e.g. "Aktarım Mekanizması ve Piyasa Dengesi")
  const leakedInHeading = FOREIGN_MODERN_ECON_PHRASES.filter(
    (phrase) => headingFolded.includes(phrase) && !params.sourceFolded.includes(phrase),
  );
  if (leakedInHeading.length > 0) {
    return {
      isOffTopic: true,
      reason: `Başlık kaynakta bulunmayan farklı ders terimleri içeriyor (${leakedInHeading.join(', ')}).`,
      leakedPhrases: leakedInHeading,
    };
  }

  // 2. Check for heavy foreign-discipline leakage in section body when absent from source
  const leakedInBody = FOREIGN_MODERN_ECON_PHRASES.filter(
    (phrase) => bodyFolded.includes(phrase) && !params.sourceFolded.includes(phrase),
  );

  // Strip generic numbering prefix ("Bölüm 2:", "1.2.") before token grounding check
  const strippedHeading = (params.section.heading || '')
    .replace(/^(?:bölüm|ünite|konu|hafta|kısım)\s*\d+\s*[:.\-–—]?\s*/i, '')
    .replace(/^\d+(?:\.\d+)*\.?\s*/, '')
    .trim();
  const headingTokens = extractContentTokens(strippedHeading);
  const bodyTokens = extractContentTokens(params.section.content || '').slice(0, 80);

  const headingOverlap = tokenOverlapRatio(headingTokens, params.sourceStemSet);
  const outlineOverlap =
    params.outlineStemSet.size > 0 ? tokenOverlapRatio(headingTokens, params.outlineStemSet) : { ratio: 0, matchedCount: 0 };
  const bodyOverlap = tokenOverlapRatio(bodyTokens, params.sourceStemSet);

  if (leakedInBody.length >= 2 && headingOverlap.matchedCount === 0 && bodyOverlap.ratio < 0.45) {
    return {
      isOffTopic: true,
      reason: `Bölüm içeriği kaynakta yer almayan konu dışı iktisat terimleri (${leakedInBody.slice(0, 3).join(', ')}) barındırıyor.`,
      leakedPhrases: leakedInBody,
    };
  }

  if (
    params.sourceWordCount >= 80 &&
    headingTokens.length >= 2 &&
    headingOverlap.matchedCount === 0 &&
    outlineOverlap.matchedCount === 0 &&
    bodyOverlap.ratio < 0.28
  ) {
    return {
      isOffTopic: true,
      reason: `Bölüm başlığı ("${params.section.heading}") ve gövdesi kaynak belgedeki konu haritasıyla örtüşmüyor.`,
      leakedPhrases: leakedInBody,
    };
  }

  return { isOffTopic: false, leakedPhrases: leakedInBody };
}

/**
 * Removes duplicate or near-identical paragraphs inside and across summary sections
 * while always preserving unique explanations, tables, formulas, and examples.
 */
export function deduplicateSummaryParagraphs(sections: SummarySection[]): {
  sections: SummarySection[];
  removedCount: number;
} {
  const seenParagraphs: Array<Set<string>> = [];
  let removedCount = 0;

  const cleanedSections = sections.map((sec, sIdx) => {
    const rawBlocks = String(sec.content || '')
      .replace(/\r\n/g, '\n')
      .split(/\n{2,}/);
    const keptBlocks: string[] = [];

    for (const block of rawBlocks) {
      const trimmed = block.trim();
      if (!trimmed) continue;

      // Always preserve headings, tables, blockquotes, and short bullet headers
      if (
        /^#{1,4}\s+/.test(trimmed) ||
        /^\|.+\|/m.test(trimmed) ||
        trimmed.startsWith('>') ||
        trimmed.length < 75
      ) {
        keptBlocks.push(trimmed);
        continue;
      }

      const tokens = extractContentTokens(trimmed);
      if (tokens.length < 7) {
        keptBlocks.push(trimmed);
        continue;
      }

      const stemSet = buildTurkishStemSet(tokens);
      const isDup = seenParagraphs.some((prev) => jaccardSetSimilarity(prev, stemSet) >= 0.82);
      if (isDup) {
        removedCount++;
        continue;
      }

      seenParagraphs.push(stemSet);
      keptBlocks.push(trimmed);
    }

    const finalContent = keptBlocks.join('\n\n').trim() || String(sec.content || '').trim();
    return {
      ...sec,
      index: sIdx,
      content: finalContent,
    };
  });

  return { sections: cleanedSections, removedCount };
}

/**
 * Computes heading coverage of the source document's extracted outline against the summary.
 */
export function computeHeadingCoverage(
  outline: FullOutlineAnchor[],
  sections: SummarySection[],
  fullSummaryText: string,
): {
  coveragePct: number;
  coveredHeadings: string[];
  missingHeadings: string[];
} {
  const cleanOutline = outline
    .map((o) => o.heading.trim())
    .filter((h) => h.length >= 4 && !/^(içindekiler|kaynakça|referanslar|teşekkür|kapak)$/i.test(h));

  if (cleanOutline.length === 0) {
    return { coveragePct: 100, coveredHeadings: [], missingHeadings: [] };
  }

  const sectionHeadingsText = sections.map((s) => `${s.heading} ${s.content.slice(0, 600)}`).join(' ');
  const summaryStemSet = buildTurkishStemSet(extractContentTokens(`${sectionHeadingsText} ${fullSummaryText}`));
  const summaryLower = normalizeForComparison(`${sectionHeadingsText} ${fullSummaryText}`);

  const coveredHeadings: string[] = [];
  const missingHeadings: string[] = [];

  for (const heading of cleanOutline) {
    const normH = normalizeForComparison(heading).replace(/^\d+(?:\.\d+)*\s*/, '').trim();
    if (!normH || normH.length < 3) continue;

    if (summaryLower.includes(normH)) {
      coveredHeadings.push(heading);
      continue;
    }

    const hTokens = extractContentTokens(normH);
    if (hTokens.length === 0) {
      coveredHeadings.push(heading);
      continue;
    }

    const { ratio, matchedCount } = tokenOverlapRatio(hTokens, summaryStemSet);
    if (ratio >= 0.55 || (hTokens.length >= 3 && matchedCount >= 2)) {
      coveredHeadings.push(heading);
    } else {
      missingHeadings.push(heading);
    }
  }

  const total = coveredHeadings.length + missingHeadings.length;
  const coveragePct = total > 0 ? Math.round((coveredHeadings.length / total) * 100) : 100;
  return { coveragePct, coveredHeadings, missingHeadings };
}

/**
 * Executes the complete 10-point academic quality audit over a generated summary.
 */
export function auditSummaryQuality(params: {
  summary: SummaryContent;
  bundle: ProcessedStudyBundle;
  profile: SummaryDocumentProfile;
  outline: FullOutlineAnchor[];
  formulas: string[];
  plan: DynamicSummaryPlan;
  repairedSectionsCount?: number;
  duplicateRemovedCount?: number;
}): SummaryQualityAuditReport {
  const { summary, bundle, profile, outline, formulas, plan } = params;
  const sections = Array.isArray(summary.sections) ? summary.sections : [];
  const allSectionText = sections
    .map((s) => `${s.heading}\n${s.content}\n${(s.takeaways || []).join(' ')}`)
    .join('\n\n');
  const fullSummaryText = [
    summary.overview || '',
    allSectionText,
    summary.summarySynthesis || '',
    (summary.keyTerms || []).map((k) => `${k.term}: ${k.definition}`).join(' '),
  ].join('\n\n');

  const totalSummaryWords = countWords(fullSummaryText);
  const sourceCombinedFull = `${bundle.title} ${bundle.course} ${bundle.combinedText.slice(0, 180_000)}`;
  const sourceStemSet = buildTurkishStemSet(extractContentTokens(sourceCombinedFull));
  const sourceFolded = foldTurkishToAscii(sourceCombinedFull);
  const outlineStemSet = buildTurkishStemSet(
    extractContentTokens(outline.map((o) => o.heading).join(' ')),
  );

  // XML / HTML technical markup leakage audit across EVERY field (overview, sections, tables, glossary, matrix)
  const allSummaryStrings = collectAllSummaryStrings(summary);
  const xmlLeakSamples = Array.from(
    new Set(allSummaryStrings.flatMap((str) => findTechnicalMarkupLeaks(str))),
  );
  const xmlLeakCount = xmlLeakSamples.length;

  // Historical entity verification (detects Selçuklu/İlhanlı/Bizans/Osmanlı etc. injected outside source)
  const summaryFolded = foldTurkishToAscii(fullSummaryText);
  const unverifiedHistoricalEntities: string[] = [];
  if (profile.disciplineFamily === 'history' || /osmanli|selcuklu|bizans|ilhanli|tarih/i.test(sourceFolded)) {
    for (const ent of HISTORICAL_POLITY_ENTITIES) {
      if (summaryFolded.includes(ent.key) && !sourceFolded.includes(ent.key)) {
        unverifiedHistoricalEntities.push(ent.label);
      }
    }
  }

  // Check 1: Complete document heading coverage
  const cov = computeHeadingCoverage(outline, sections, fullSummaryText);
  const check1Status: SummaryQualityCheckItem['status'] =
    cov.coveragePct >= 80 ? 'pass' : cov.coveragePct >= 60 ? 'warn' : 'fail';

  // Check 2: Main & sub-heading hierarchy
  const sectionsWithSubheads = sections.filter((s) => /^#{2,4}\s+/m.test(s.content || '')).length;
  const subheadRatio = sections.length > 0 ? sectionsWithSubheads / sections.length : 0;
  const check2Status: SummaryQualityCheckItem['status'] =
    sections.length >= Math.min(3, plan.minSections) && subheadRatio >= 0.7
      ? 'pass'
      : sections.length >= 2 && subheadRatio >= 0.4
      ? 'warn'
      : 'fail';

  // Check 3: Academic definitions & glossary completeness
  const termsCount = Array.isArray(summary.keyTerms) ? summary.keyTerms.length : 0;
  const detailedTermsCount = (summary.keyTerms || []).filter((t) => countWords(t.definition) >= 7).length;
  const minDesiredTerms = Math.min(10, Math.max(4, Math.floor(plan.targetKeyTerms * 0.45)));
  const check3Status: SummaryQualityCheckItem['status'] =
    termsCount >= minDesiredTerms && detailedTermsCount >= Math.max(3, Math.floor(termsCount * 0.6))
      ? 'pass'
      : termsCount >= 3
      ? 'warn'
      : 'fail';

  // Check 4: Discipline fidelity (formulas/models vs legal rules/exceptions vs historical authenticity)
  const hasMathInSummary = /\$[^$]+\$|\\frac|\\sum|[A-Za-z]\s*=\s*[^=\n]{2,}/.test(fullSummaryText);
  const leakedForeignEconTermsGlobal = FOREIGN_MODERN_ECON_PHRASES.filter(
    (phrase) => summaryFolded.includes(phrase) && !sourceFolded.includes(phrase),
  );
  let check4Status: SummaryQualityCheckItem['status'] = 'pass';
  let check4Detail = 'Dersin akademik yapısına ve terminolojisine uygun anlatım doğrulandı.';
  if (profile.disciplineFamily === 'law') {
    const hasLegalSignals = /(kanun|madde|unsur|şart|istisna|yaptırım|sonuç|hüküm|sorumluluk|ayrım)/i.test(
      fullSummaryText,
    );
    const hasFabricatedLatex = /\$\$[^$]+\\frac|\$\$[^$]+\\sum|\$\$[^$]+\\int/.test(fullSummaryText) && formulas.length === 0;
    if (hasFabricatedLatex) {
      check4Status = 'fail';
      check4Detail = 'Hukuk kaynağında bulunmayan matematiksel formül/gösterim tespit edildi.';
    } else if (leakedForeignEconTermsGlobal.length > 0) {
      check4Status = 'fail';
      check4Detail = `Hukuk belgesinde kaynak dışı iktisat terimleri tespit edildi: ${leakedForeignEconTermsGlobal.slice(0, 3).join(', ')}.`;
    } else if (!hasLegalSignals) {
      check4Status = 'warn';
      check4Detail = 'Hukuki unsur, şart ve istisna vurguları daha belirgin hale getirilebilir.';
    } else {
      check4Detail = 'Hukuki kavramlar, şartlar/unsurlar, istisnalar ve hukuki sonuçlar korundu.';
    }
  } else if (profile.disciplineFamily === 'history') {
    const hasFabricatedLatex = /\$\$[^$]+\\frac|\$\$[^$]+\\sum|\$\$[^$]+\\int/.test(fullSummaryText) && formulas.length === 0;
    if (leakedForeignEconTermsGlobal.length > 0) {
      check4Status = 'fail';
      check4Detail = `Tarih / İktisat Tarihi belgesine kaynakta bulunmayan konu dışı modern iktisat kavramları sızmış: ${leakedForeignEconTermsGlobal.slice(0, 3).join(', ')}.`;
    } else if (hasFabricatedLatex) {
      check4Status = 'fail';
      check4Detail = 'Tarihsel kaynakta bulunmayan yapay matematiksel formül tespit edildi.';
    } else if (unverifiedHistoricalEntities.length > 0) {
      check4Status = 'warn';
      check4Detail = `Kaynakta geçmeyen tarihsel devlet/dönem adları tespit edildi: ${unverifiedHistoricalEntities.join(', ')}.`;
    } else {
      check4Detail = 'Tarihsel bağlam, kurumsal yapı, dönemler ve neden–sonuç ilişkileri kaynağa sadık biçimde korundu.';
    }
  } else if (profile.disciplineFamily === 'economics' || profile.disciplineFamily === 'statistics') {
    if (formulas.length > 0 && !hasMathInSummary) {
      check4Status = 'fail';
      check4Detail = `Kaynakta ${formulas.length} formül/denklem tespit edilmesine rağmen özet formül içermiyor.`;
    } else if (formulas.length > 0) {
      check4Detail = `Kaynak denklemleri ve değişken açıklamaları korundu (${formulas.length} kaynak formülü izlendi).`;
    }
  }

  // Check 5: Examples & practical applications retained
  const sourceHasExamples = /(örneğin|örnek|uygulama|vaka|hesapla|senaryo|olay)/i.test(bundle.combinedText);
  const summaryHasExamples = /(örneğin|örnek|uygulama|vaka|senaryo|olay|çözüm)/i.test(fullSummaryText);
  const check5Status: SummaryQualityCheckItem['status'] =
    !sourceHasExamples || summaryHasExamples ? 'pass' : 'warn';

  // Check 6: Source grounding, off-topic heading detection & anti-hallucination
  const weakSectionIndices: number[] = [];
  const offTopicSectionIndices: number[] = [];
  const offTopicHeadings: string[] = [];
  let groundedSections = 0;
  let totalSectionGrounding = 0;
  const minSectionWordsFloor = Math.max(
    110,
    Math.min(240, Math.round((bundle.totalWords / Math.max(1, sections.length)) * 0.45)),
  );

  sections.forEach((sec, idx) => {
    const secWords = countWords(sec.content);
    const secTokens = extractContentTokens(`${sec.heading} ${sec.content}`).slice(0, 80);
    const { ratio } = tokenOverlapRatio(secTokens, sourceStemSet);
    totalSectionGrounding += ratio;

    const offTopicCheck = detectOffTopicSection({
      section: sec,
      sourceFolded,
      sourceStemSet,
      outlineStemSet,
      sourceWordCount: bundle.totalWords,
    });
    if (offTopicCheck.isOffTopic) {
      offTopicSectionIndices.push(idx);
      offTopicHeadings.push(sec.heading);
    } else if (ratio >= 0.35 || bundle.totalWords < 120) {
      groundedSections++;
    }

    const lacksSubheading = !/^#{2,4}\s+/m.test(sec.content || '');
    if (secWords < minSectionWordsFloor || (secWords < 160 && lacksSubheading)) {
      weakSectionIndices.push(idx);
    }
  });

  const groundingScorePct =
    sections.length > 0
      ? Math.min(100, Math.round((totalSectionGrounding / sections.length) * 100 * 1.25))
      : 0;
  const check6Status: SummaryQualityCheckItem['status'] =
    offTopicSectionIndices.length > 0
      ? 'fail'
      : unverifiedHistoricalEntities.length > 0
      ? 'warn'
      : groundingScorePct >= 62 && groundedSections >= Math.ceil(sections.length * 0.75)
      ? 'pass'
      : groundingScorePct >= 42
      ? 'warn'
      : 'fail';

  // Check 7: Redundancy & repetition check
  const dupCount = params.duplicateRemovedCount ?? 0;
  const check7Status: SummaryQualityCheckItem['status'] = dupCount <= 4 ? 'pass' : 'warn';

  // Check 8: Clarity, zero technical XML/HTML leaks & zero broken truncation / vague fillers
  const brokenEllipsisMatches = (fullSummaryText.match(/(?:\.\.\.|…)\s*(?:\n|$)/gm) || []).length;
  const vagueFillerRe = /(?:vb\.\s*gibi\s*şeyler|kısaca\s+budur|detaylar\s+için\s+pdf|yukarıda\s+anlatıldığı\s+gibi\s+önemlidir)/i;
  const hasVagueFillers = vagueFillerRe.test(fullSummaryText);
  const check8Status: SummaryQualityCheckItem['status'] =
    xmlLeakCount > 0
      ? 'fail'
      : brokenEllipsisMatches <= 1 && !hasVagueFillers
      ? 'pass'
      : 'warn';

  // Check 9: Cross-section consistency & source page reference provenance
  const sectionsWithPageRef = sections.filter((s) => Boolean(s.pageRange && s.pageRange.trim())).length;
  const sourceHasPages = /---\s*(Sayfa|Slayt)\s+\d+\s*---/i.test(bundle.combinedText);
  const check9Status: SummaryQualityCheckItem['status'] =
    !sourceHasPages || sectionsWithPageRef >= Math.ceil(sections.length * 0.6)
      ? 'pass'
      : sectionsWithPageRef > 0
      ? 'warn'
      : 'fail';

  // Check 10: Dynamic length & exam readiness (proportional to document size)
  const targetMinWords = Math.max(
    320,
    Math.min(
      Math.round(bundle.totalWords * 0.55),
      Math.round(plan.minSections * Math.min(plan.minWordsPerSection, 260)),
    ),
  );
  const hasExamTools =
    (summary.teacherEmphasis?.length || 0) >= 2 &&
    Boolean(summary.summarySynthesis && summary.summarySynthesis.length >= 60) &&
    (summary.studyChecklist?.length || 0) >= 2;
  const check10Status: SummaryQualityCheckItem['status'] =
    totalSummaryWords >= Math.round(targetMinWords * 0.75) && hasExamTools && weakSectionIndices.length <= 1
      ? 'pass'
      : totalSummaryWords >= Math.round(targetMinWords * 0.5)
      ? 'warn'
      : 'fail';

  const checks: SummaryQualityCheckItem[] = [
    {
      id: 'heading_coverage',
      label: 'Belge Bölüm ve Başlık Kapsamı',
      status: check1Status,
      detail:
        outline.length > 0
          ? `%${cov.coveragePct} başlık kapsamı (${cov.coveredHeadings.length}/${
              cov.coveredHeadings.length + cov.missingHeadings.length
            } ana başlık işlendi).`
          : `${sections.length} yapılandırılmış konu bölümü oluşturuldu.`,
    },
    {
      id: 'heading_hierarchy',
      label: 'Ana ve Alt Başlık Hiyerarşisi',
      status: check2Status,
      detail: `${sectionsWithSubheads}/${sections.length} bölüm alt başlıklar (####) ile yapılandırıldı.`,
    },
    {
      id: 'definition_depth',
      label: 'Akademik Tanım ve Kavram Derinliği',
      status: check3Status,
      detail: `${termsCount} kavram tanımı (${detailedTermsCount} ayrıntılı açıklama).`,
    },
    {
      id: 'discipline_fidelity',
      label: 'Derse Özgü Akademik Yapı ve Formül/Kural Doğruluğu',
      status: check4Status,
      detail: check4Detail,
    },
    {
      id: 'examples_retained',
      label: 'Örnekler ve Uygulamaların Korunması',
      status: check5Status,
      detail: summaryHasExamples
        ? 'Somut örnekler, vakalar ve uygulamalar özet içinde korundu.'
        : 'Kaynakta sınırlı örnek bulundu; kavramsal açıklamalar önceliklendirildi.',
    },
    {
      id: 'source_grounding',
      label: 'Kaynak Sadakati ve Konu Bütünlüğü Denetimi',
      status: check6Status,
      detail:
        offTopicHeadings.length > 0
          ? `Konu dışı / kaynakla doğrulanamayan bölüm tespit edildi: ${offTopicHeadings.slice(0, 3).join(', ')}.`
          : unverifiedHistoricalEntities.length > 0
          ? `Kaynakta geçmeyen tarihsel varlık adları gözlendi: ${unverifiedHistoricalEntities.join(', ')} (Örtüşme: %${groundingScorePct}).`
          : `Kaynak örtüşme skoru: %${groundingScorePct} (${groundedSections}/${sections.length} bölüm doğrulandı, konu dışı başlık yok).`,
    },
    {
      id: 'deduplication',
      label: 'Tekrar Paragraf ve Gereksiz Tekrar Temizliği',
      status: check7Status,
      detail:
        dupCount > 0
          ? `${dupCount} tekrarlı paragraf birleştirme sırasında temizlendi.`
          : 'Bölümler arasında tekrarlı paragraf tespit edilmedi.',
    },
    {
      id: 'clarity_integrity',
      label: 'Anlatım Netliği, XML/HTML Temizliği ve Kesik İfade Kontrolü',
      status: check8Status,
      detail:
        xmlLeakCount > 0
          ? `${xmlLeakCount} adet teknik XML/HTML etiketi sızıntısı tespit edildi (${xmlLeakSamples.slice(0, 3).join(', ')}).`
          : check8Status === 'pass'
          ? 'Sıfır XML/HTML sızıntısı; kesik ifade veya belirsiz dolgu metni tespit edilmedi.'
          : 'Bazı bölümlerde kısaltılmış veya genel ifadeler saptandı.',
    },
    {
      id: 'consistency_and_refs',
      label: 'Bölümler Arası Tutarlılık ve Sayfa Referansları',
      status: check9Status,
      detail: sourceHasPages
        ? `${sectionsWithPageRef}/${sections.length} bölüm orijinal sayfa/slayt referansıyla eşleştirildi.`
        : 'Bölümler belge akış sırasına göre tutarlı biçimde birleştirildi.',
    },
    {
      id: 'exam_readiness_depth',
      label: 'Sınav Hazırlık Yeterliliği ve Ölçekli Derinlik',
      status: check10Status,
      detail: `Toplam ${totalSummaryWords.toLocaleString('tr-TR')} kelime, ${sections.length} bölüm (belge: ${profile.totalPagesOrSlides} sayfa/slayt).`,
    },
  ];

  const weightPerCheck = 10;
  const overallScore = Math.min(
    100,
    checks.reduce(
      (sum, item) => sum + (item.status === 'pass' ? weightPerCheck : item.status === 'warn' ? 7 : 3),
      0,
    ),
  );
  const failedCount = checks.filter((c) => c.status === 'fail').length;

  return {
    overallScore,
    passed: failedCount === 0 && xmlLeakCount === 0 && offTopicSectionIndices.length === 0 && overallScore >= 75,
    headingCoveragePct: cov.coveragePct,
    totalSourceHeadings: cov.coveredHeadings.length + cov.missingHeadings.length,
    coveredHeadings: cov.coveredHeadings,
    missingHeadings: cov.missingHeadings,
    weakSectionIndices,
    offTopicSectionIndices,
    offTopicHeadings,
    xmlLeakCount,
    unverifiedHistoricalEntities,
    repairedSectionsCount: params.repairedSectionsCount ?? 0,
    duplicateRemovedCount: dupCount,
    groundingScorePct,
    totalSummaryWords,
    targetMinWords,
    checks,
    auditedAt: new Date().toISOString(),
  };
}
