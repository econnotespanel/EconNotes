import { stripTechnicalMarkup } from '@/lib/academicTextSanitizer';
import {
  detectCourseIdentity,
  isGenericCoursePlaceholder,
  type CourseDetectionResult,
  type CourseDomainMode,
} from '@/lib/courseDetector';
import {
  extractFullDocumentOutline,
  type FullOutlineAnchor,
} from '@/lib/studySourceProcessor';
import type {
  CourseDetectionConfidence,
  ExtractedSourceItem,
  ProcessedStudyBundle,
  SourceCourseBreakdownItem,
  StudyMaterial,
} from '@/types/study';

export interface AnalyzedSourceProfile {
  source: ExtractedSourceItem;
  detection: CourseDetectionResult;
  resolvedCourse: string | null;
  resolvedDiscipline: string | null;
  domainMode: CourseDomainMode;
  confidence: CourseDetectionConfidence;
  needsConfirmation: boolean;
  headings: FullOutlineAnchor[];
  formulas: string[];
  tablesCount: number;
  unreadablePages: number[];
  warnings: string[];
}

export interface MasterOutlineItem {
  heading: string;
  pageHint?: string;
  sourceName: string;
  course: string | null;
  excerpt: string;
}

export interface CanonicalSourceAnalysis {
  fingerprint: string;
  profiles: AnalyzedSourceProfile[];
  /** Distinct non-null courses detected/confirmed across active sources */
  distinctCourses: string[];
  /** Single resolved course name, or multi-course summary label, or null if all unconfirmed */
  primaryCourseLabel: string | null;
  isMultiCourse: boolean;
  unconfirmedSources: AnalyzedSourceProfile[];
  hasUnconfirmedCourses: boolean;
  totalWords: number;
  totalPagesOrSlides: number;
  masterOutline: MasterOutlineItem[];
  extractedFormulas: string[];
  extractionWarnings: string[];
  sourceCourseBreakdown: SourceCourseBreakdownItem[];
  /** Existing generated summary for the exact same active source set, if any */
  syncedSummaryMaterial: StudyMaterial | null;
  /** Compact canonical digest injected into Quiz, Flashcards, Video, Tutor, and MindMap */
  canonicalDigest: string;
}

function hashStringSimple(input: string): string {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `srcfp_${(h >>> 0).toString(36)}`;
}

export function extractFormulasFromText(text: string, maxFormulas = 24): string[] {
  const formulas: string[] = [];
  const seen = new Set<string>();
  const lines = (text || '').split('\n');

  const pushFormula = (raw: string) => {
    const clean = raw.replace(/\s+/g, ' ').trim();
    if (clean.length < 4 || clean.length > 160) return;
    if (/^---\s*(Sayfa|Slayt)\s+\d+/i.test(clean) || /^===/.test(clean)) return;
    const key = clean.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    formulas.push(clean);
  };

  for (const rawLine of lines) {
    if (formulas.length >= maxFormulas) break;
    const line = rawLine.trim();
    if (!line) continue;

    // 1. LaTeX blocks (even inside longer prose paragraphs)
    const latexMatches = line.match(/\$\$[^$]{3,140}\$\$|\$[^$\n]{3,120}\$/g);
    if (latexMatches) {
      for (const m of latexMatches) {
        if (formulas.length >= maxFormulas) break;
        pushFormula(m);
      }
      if (line.length > 180) continue;
    }

    // 2. Inline equations embedded inside longer academic paragraphs
    if (line.length > 180) {
      const inlineEqRe =
        /\b([A-Za-z][A-Za-z0-9_*']{0,8}\s*=\s*(?:[A-Za-z0-9_*'().^√Σ∑πθαβγδσμλ]+(?:\s*[+\-*/^·×÷]\s*[A-Za-z0-9_*'().^√Σ∑πθαβγδσμλ]+)+))/g;
      let m: RegExpExecArray | null;
      while ((m = inlineEqRe.exec(line)) !== null) {
        if (formulas.length >= maxFormulas) break;
        pushFormula(m[1]);
      }
      continue;
    }

    // 3. Explicit standalone mathematical / statistical / econometric / physics equations
    const hasEquationStructure =
      /(?:^|\s)[A-Za-zÇĞİÖŞÜα-ωΑ-ΩσμχβλΣ∑√][A-Za-z0-9_'\-(),\s]{0,18}\s*=\s*[^=]{2,90}/.test(line) &&
      /[+\-*/^()∑∫√σμχβλ0-9]/.test(line);
    const hasStatsNotation =
      /(?:H[₀0]|H[₁1]|χ²|σ²|s²|x̄|μ|∑|√|P\([A-Za-z|]+\)|E\([A-Za-z]+\)|Var\([A-Za-z]+\)|Cov\([A-Za-z,\s]+\))/.test(
        line,
      );

    if (hasEquationStructure || (hasStatsNotation && /[=<>≤≥±/()]/.test(line))) {
      pushFormula(line);
    }
  }

  return formulas;
}

export function analyzeSingleSource(rawSrc: ExtractedSourceItem): AnalyzedSourceProfile {
  const cleanText = stripTechnicalMarkup(rawSrc.text || '');
  const src: ExtractedSourceItem =
    cleanText !== (rawSrc.text || '')
      ? {
          ...rawSrc,
          text: cleanText,
          wordCount: cleanText.trim() ? cleanText.trim().split(/\s+/).filter(Boolean).length : rawSrc.wordCount,
          charCount: cleanText.length,
        }
      : rawSrc;
  // Strictly avoid recycling unconfirmed/cached `src.course` from older sessions onto uploaded files or pasted notes.
  // Only treat `src.course` as an explicit signal when explicitly confirmed by user OR originating from a catalog note
  // (where `detectCourseIdentity` still cross-checks it against the document's real title and content!).
  const shouldUseExplicit =
    Boolean(src.courseConfirmedByUser) ||
    (src.kind === 'note' && !isGenericCoursePlaceholder(src.course));

  const detection = detectCourseIdentity({
    text: src.text || '',
    fileNameOrTitle: src.name,
    explicitCourse: shouldUseExplicit && !isGenericCoursePlaceholder(src.course) ? src.course : undefined,
    confirmedByUser: Boolean(src.courseConfirmedByUser),
  });

  const headings = extractFullDocumentOutline(src.text || '', 28);
  const formulas = extractFormulasFromText(src.text || '', 20);
  const tablesCount = ((src.text || '').match(/^\|.+\|.+\|$/gm) || []).length >= 2
    ? ((src.text || '').match(/^\|[\s:-]+\|/gm) || []).length
    : 0;

  const unreadablePages = Array.isArray(src.unreadablePages) ? src.unreadablePages : [];
  const warnings = [...(src.extractionWarnings || [])];
  if (
    unreadablePages.length > 0 &&
    !warnings.some((w) => w.includes('okunabilir metin') || w.includes('yalnızca görsel'))
  ) {
    warnings.push(
      `"${src.name}" kaynağında metin katmanı eksik/görsel olan ${unreadablePages.length} sayfa/slayt var (${unreadablePages
        .slice(0, 10)
        .join(', ')}).`,
    );
  }
  if (src.isScannedOcr && warnings.length === 0) {
    warnings.push(
      `"${src.name}" taranmış/görsel kaynak olarak işlendi; okunamayan veya silik bölümler varsa özet içinde belirtilecektir.`,
    );
  }

  const resolvedCourse = src.courseConfirmedByUser && !isGenericCoursePlaceholder(src.course)
    ? src.course!.trim()
    : detection.course;

  return {
    source: {
      ...src,
      course: resolvedCourse,
      detectedCourse: detection.course,
      detectedDiscipline: detection.discipline,
      courseConfidence: detection.confidence,
      courseNeedsConfirmation: src.courseConfirmedByUser ? false : detection.needsConfirmation,
      courseCandidates: detection.candidates,
      courseEvidence: detection.evidence,
    },
    detection,
    resolvedCourse,
    resolvedDiscipline: detection.discipline,
    domainMode: detection.domainMode,
    confidence: src.courseConfirmedByUser ? 'high' : detection.confidence,
    needsConfirmation: src.courseConfirmedByUser ? false : detection.needsConfirmation,
    headings,
    formulas,
    tablesCount,
    unreadablePages,
    warnings,
  };
}

/**
 * Enriches a freshly extracted/added source item with its independent per-source course detection.
 * NEVER uses notebook-level course or previously uploaded sources.
 */
export function enrichSourceWithCourseDetection(src: ExtractedSourceItem): ExtractedSourceItem {
  const profile = analyzeSingleSource(src);
  return profile.source;
}

/**
 * Builds the single canonical analysis object shared by ALL Study Studio tools:
 * Ayrıntılı Özet, Videolu Ders, Deneme Sınavı, Çalışma Kartları, Kavram Haritası, Sınav Planı, AI Öğretmen.
 */
export function buildCanonicalSourceAnalysis(params: {
  sources: ExtractedSourceItem[];
  allMaterials?: StudyMaterial[];
  /** When false (used for fresh summary generation), prior AI summaries are NEVER injected into canonicalDigest. */
  includePriorSummarySync?: boolean;
}): CanonicalSourceAnalysis {
  const validSources = params.sources.filter(
    (s) => (s.text && s.text.trim().length > 0) || (s.images?.length || 0) > 0 || Boolean(s.audio),
  );

  const profiles = validSources.map(analyzeSingleSource);

  const distinctCourses = Array.from(
    new Set(
      profiles
        .map((p) => p.resolvedCourse)
        .filter((c): c is string => Boolean(c && !isGenericCoursePlaceholder(c))),
    ),
  );

  const isMultiCourse = distinctCourses.length > 1;
  const primaryCourseLabel =
    distinctCourses.length === 1
      ? distinctCourses[0]
      : distinctCourses.length > 1
      ? distinctCourses.join(' · ')
      : null;

  const unconfirmedSources = profiles.filter((p) => p.needsConfirmation);

  const fingerprintSeed = profiles
    .map((p) => `${p.source.id}:${p.resolvedCourse || 'unconfirmed'}:${p.source.charCount}`)
    .sort()
    .join('|');
  const fingerprint = hashStringSimple(fingerprintSeed || 'empty');

  const masterOutline: MasterOutlineItem[] = [];
  const seenHeadings = new Set<string>();
  for (const prof of profiles) {
    for (const h of prof.headings) {
      const key = `${prof.resolvedCourse || ''}::${h.heading.toLocaleLowerCase('tr-TR')}`;
      if (seenHeadings.has(key)) continue;
      seenHeadings.add(key);
      masterOutline.push({
        heading: h.heading,
        pageHint: h.pageHint,
        sourceName: prof.source.name,
        course: prof.resolvedCourse,
        excerpt: h.excerpt,
      });
    }
  }

  const extractedFormulas = Array.from(
    new Set(profiles.flatMap((p) => p.formulas)),
  ).slice(0, 32);

  const extractionWarnings = Array.from(
    new Set(profiles.flatMap((p) => p.warnings)),
  );

  const sourceCourseBreakdown: SourceCourseBreakdownItem[] = profiles.map((p) => ({
    sourceName: p.source.name,
    course: p.resolvedCourse || 'Ders Belirtilmedi',
    pagesOrSlides: p.source.pagesOrSlides,
  }));

  const totalWords = profiles.reduce((sum, p) => sum + (p.source.wordCount || 0), 0);
  const totalPagesOrSlides = profiles.reduce((sum, p) => sum + (p.source.pagesOrSlides || 0), 0);

  // Locate an already-generated AI Summary matching the exact active source fingerprint.
  // Never reuse local/fallback or low-grounding summaries so a faulty tool output cannot poison sibling tools.
  const rawSourceTokenSet = new Set(
    profiles
      .flatMap((p) =>
        `${p.source.name} ${p.source.text.slice(0, 12_000)}`
          .toLocaleLowerCase('tr-TR')
          .replace(/[^\p{L}\p{N}\s]/gu, ' ')
          .split(/\s+/),
      )
      .filter((w) => w.length >= 4),
  );

  const allowPriorSummarySync = params.includePriorSummarySync !== false;
  const candidateSummary = allowPriorSummarySync
    ? (params.allMaterials || []).find(
        (m) =>
          m.material_type === 'summary' &&
          (m.content?.metadata?.sourceMode !== 'local' || Boolean(m.content?.qualityAudit?.passed)) &&
          (m.content?.metadata?.sourceFingerprint === fingerprint ||
            (m.exam_profile as Record<string, unknown> | null | undefined)?.sourceFingerprint ===
              fingerprint),
      ) || null
    : null;

  const isSummaryGroundedInSource = (mat: StudyMaterial | null): boolean => {
    if (!mat?.content?.sections || mat.content.sections.length === 0) return false;
    if (rawSourceTokenSet.size < 10) return true;
    const summaryHeadingWords = mat.content.sections
      .map((s) => String(s.heading || ''))
      .join(' ')
      .toLocaleLowerCase('tr-TR')
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 4);
    if (summaryHeadingWords.length === 0) return false;
    const matched = summaryHeadingWords.filter((w) => rawSourceTokenSet.has(w)).length;
    return matched / summaryHeadingWords.length >= 0.35;
  };

  const syncedSummaryMaterial = isSummaryGroundedInSource(candidateSummary) ? candidateSummary : null;

  // Build shared canonical analysis digest for all sibling tools (raw source truth is ALWAYS primary)
  const digestLines: string[] = [];
  if (profiles.length > 0) {
    digestLines.push(
      `AKTİF KAYNAK HARİTASI (${profiles.length} kaynak, ~${totalPagesOrSlides} sayfa/slayt, ~${totalWords} kelime):`,
    );
    profiles.forEach((p, idx) => {
      digestLines.push(
        `- Kaynak ${idx + 1}: "${p.source.name}" | Gerçek Ders: ${
          p.resolvedCourse || 'Kullanıcı Onayı Bekleniyor'
        } | ~${p.source.pagesOrSlides} syf`,
      );
    });
  }
  if (isMultiCourse) {
    digestLines.push(
      `ÇOKLU DERS İZOLASYON KURALI: Bu oturumda ${distinctCourses.length} FARKLI DERS (${distinctCourses.join(
        ', ',
      )}) seçili. Her bir dersin kavramlarını, tanımlarını, formüllerini ve sorularını KESİNLİKLE kendi dersi/kaynağı altında tut; farklı derslerin bilgilerini asla birbirine karıştırma!`,
    );
  }
  if (masterOutline.length > 0) {
    digestLines.push(
      `BAŞTAN SONA KONU BAŞLIKLARI:\n${masterOutline
        .slice(0, 30)
        .map(
          (m, idx) =>
            `${idx + 1}. ${m.heading}${m.pageHint ? ` (${m.pageHint})` : ''}${
              isMultiCourse && m.course ? ` [${m.course}]` : ''
            }`,
        )
        .join('\n')}`,
    );
  }
  if (extractedFormulas.length > 0) {
    digestLines.push(
      `KAYNAKTAN ÇIKARILAN FORMÜL / İFADELER (ATLAMADAN AÇIKLA):\n${extractedFormulas
        .slice(0, 18)
        .map((f) => `- ${f}`)
        .join('\n')}`,
    );
  }
  if (extractionWarnings.length > 0) {
    digestLines.push(
      `EKSİK / OKUNAMAYAN KISIM UYARILARI (ÇIKTIDA AÇIKÇA BELİRT):\n${extractionWarnings
        .map((w) => `- ${w}`)
        .join('\n')}`,
    );
  }
  if (syncedSummaryMaterial?.content?.sections && syncedSummaryMaterial.content.sections.length > 0) {
    const summaryHeadings = syncedSummaryMaterial.content.sections
      .map((s) => s.heading)
      .filter(Boolean)
      .slice(0, 14);
    const summaryTerms = (syncedSummaryMaterial.content.keyTerms || [])
      .map((t) => t.term)
      .filter(Boolean)
      .slice(0, 16);
    digestLines.push(
      `DOĞRULANMIŞ ÖZET İLE EŞLENEN ÇEKİRDEK BAŞLIKLAR (YALNIZCA HAM KAYNAKLA ÖRTÜŞTÜĞÜ ÖLÇÜDE):\n- Ana Bölümler: ${summaryHeadings.join(
        ' | ',
      )}${summaryTerms.length > 0 ? `\n- Anahtar Terimler: ${summaryTerms.join(', ')}` : ''}`,
    );
  }

  return {
    fingerprint,
    profiles,
    distinctCourses,
    primaryCourseLabel,
    isMultiCourse,
    unconfirmedSources,
    hasUnconfirmedCourses: unconfirmedSources.length > 0,
    totalWords,
    totalPagesOrSlides,
    masterOutline,
    extractedFormulas,
    extractionWarnings,
    sourceCourseBreakdown,
    syncedSummaryMaterial,
    canonicalDigest: digestLines.join('\n\n'),
  };
}

/**
 * Converts a CanonicalSourceAnalysis into a unified ProcessedStudyBundle
 * so Summary, Video, Quiz, and Flashcards all operate on identical, uncontaminated source data.
 */
export function buildBundleFromCanonicalAnalysis(
  analysis: CanonicalSourceAnalysis,
  explicitTitle?: string,
): ProcessedStudyBundle {
  const validSources = analysis.profiles.map((p) => p.source);
  if (validSources.length === 0) {
    return {
      title: explicitTitle?.trim() || 'Çalışma Seti',
      course: '',
      detectedCourse: null,
      courseConfidence: 'uncertain',
      sourceCourses: [],
      isMultiCourse: false,
      extractionWarnings: [],
      canonicalAnalysisDigest: '',
      sourceFingerprint: analysis.fingerprint,
      sourceIds: [],
      combinedText: '',
      totalWords: 0,
      totalChars: 0,
      totalPagesOrSlides: 0,
      sourceCount: 0,
      detectedDiscipline: 'Genel Akademik Çalışma',
      outlinePreview: [],
      images: [],
      sources: [],
      hasScannedOcr: false,
    };
  }

  // Always label each source cleanly with its own verified/detected course when multi-source
  const combinedText =
    analysis.profiles.length === 1
      ? analysis.profiles[0].source.text
      : analysis.profiles
          .map(
            (prof, idx) =>
              `=== KAYNAK ${idx + 1} | DERS: ${
                prof.resolvedCourse || 'Belirtilmedi'
              } | BELGE: ${prof.source.name} ===\n${prof.source.text}`,
          )
          .join('\n\n');

  const images = validSources.flatMap((s) => s.images || []).slice(0, 10);
  const audio = validSources.find((s) => s.audio)?.audio;

  const isGenericNbTitle =
    !explicitTitle ||
    explicitTitle.trim() === 'Çalışma Defterim' ||
    explicitTitle.trim() === 'Yeni Çalışma Defteri';

  const inferredTitle =
    !isGenericNbTitle && explicitTitle
      ? explicitTitle.trim()
      : validSources.length === 1
      ? validSources[0].name
      : `${validSources[0].name} + ${validSources.length - 1} Kaynak`;

  const resolvedDiscipline =
    analysis.isMultiCourse
      ? `Çoklu Ders (${analysis.distinctCourses.join(', ')})`
      : analysis.profiles[0]?.resolvedCourse ||
        analysis.profiles[0]?.resolvedDiscipline ||
        'Genel Akademik Çalışma';

  return {
    title: inferredTitle,
    course: analysis.primaryCourseLabel || '',
    detectedCourse: analysis.primaryCourseLabel,
    courseConfidence: analysis.hasUnconfirmedCourses
      ? 'uncertain'
      : analysis.profiles.every((p) => p.confidence === 'high')
      ? 'high'
      : 'medium',
    sourceCourses: analysis.distinctCourses,
    isMultiCourse: analysis.isMultiCourse,
    extractionWarnings: analysis.extractionWarnings,
    canonicalAnalysisDigest: analysis.canonicalDigest,
    sourceFingerprint: analysis.fingerprint,
    sourceIds: validSources.map((s) => s.id),
    combinedText,
    totalWords: analysis.totalWords,
    totalChars: combinedText.length,
    totalPagesOrSlides: analysis.totalPagesOrSlides,
    sourceCount: validSources.length,
    detectedDiscipline: resolvedDiscipline,
    outlinePreview: analysis.masterOutline.slice(0, 24).map((m) => m.heading),
    images,
    audio,
    sources: validSources,
    hasScannedOcr: validSources.some((s) => Boolean(s.isScannedOcr)),
  };
}
