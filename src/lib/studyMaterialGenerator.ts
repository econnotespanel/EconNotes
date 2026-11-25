/**
 * Deterministic High-Quality Local Study Material Synthesizer
 * Acts both as instant offline fallback and structured domain-faithful parser
 * without injecting foreign-domain boilerplate into user notes.
 */

import {
  buildTopicPriorityGuide,
  classifyStudyDomain,
  type AcademicDomainMode,
} from './studySourceProcessor';
import {
  computeDynamicSummaryPlan,
  getDisciplineSummaryGuidance,
  type DisciplineSummaryGuidance,
} from './studySummaryArchitecture';
import {
  computeDifficultyQuota,
  hashCompact,
  normalizeForComparison,
  resolveVideoThemeForCourse,
  validateAndRepairVideoContent,
  validateFlashcardsBatch,
  validateQuizBatch,
  type DifficultyQuota,
  type FlashcardHistoryEntry,
  type QuestionHistoryEntry,
} from './studyQualityEngine';
import type { ExamStudyMode, FlashcardItem, QuizQuestion, SummarySection } from '@/types/study';

export interface GeneratePayload {
  materialType: 'flashcards' | 'quiz' | 'summary' | 'video';
  noteTitle?: string;
  course?: string;
  noteContext?: string;
  totalPagesOrSlides?: number;
  examMode?: ExamStudyMode;
  customPrompt?: string;
  extractionWarnings?: string[];
  detailLevel?: 'concise' | 'standard' | 'deep' | 'textbook';
  summaryDepth?: 'short' | 'standard' | 'comprehensive' | 'textbook';
  deepResearch?: boolean;
  pedagogicalStyle?: string;
  questionCount?: number;
  cardCount?: number;
  difficulty?: 'easy' | 'medium' | 'hard' | 'mixed';
  quizFormat?: 'multiple_choice' | 'open_ended' | 'mixed';
  examFocus?: string;
  sourceFingerprint?: string;
  generationNonce?: string;
  avoidHistory?: QuestionHistoryEntry[];
  avoidFlashcardHistory?: FlashcardHistoryEntry[];
  preferredTopics?: string[];
  preferredDifficultyQuota?: DifficultyQuota;
}

interface ParsedUnit {
  heading: string;
  pageRange?: string;
  paragraphs: string[];
  sentences: string[];
  bullets: string[];
  formulas: string[];
}

const STOPWORDS = new Set([
  've', 'veya', 'ile', 'için', 'gibi', 'olan', 'olarak', 'bir', 'bu', 'şu', 'o',
  'da', 'de', 'ki', 'mi', 'mı', 'mu', 'mü', 'ancak', 'fakat', 'lakin', 'çünkü',
  'dolayı', 'üzerine', 'göre', 'kadar', 'daha', 'en', 'çok', 'az', 'her', 'bazı',
  'tüm', 'bütün', 'kendi', 'hem', 'ya', 'ne', 'nasıl', 'neden', 'hangi', 'tarafından',
  'arasında', 'hakkında', 'içinde', 'sonra', 'önce', 'üzere', 'böylece', 'ise',
  'var', 'yok', 'ayrıca', 'dolayısıyla', 'şekilde', 'durumda', 'yönelik', 'ilgili',
  'kapsamında', 'açısından', 'ortaya', 'vardır', 'olduğu', 'edilir', 'yapılır',
  'sağlar', 'bulunur', 'olur', 'olabilir', 'olanlar', 'bununla', 'birlikte',
  'bugün', 'dün', 'yarın', 'şimdi', 'burada', 'dersimizde', 'genellikle', 'örneğin',
  'özellikle', 'the', 'and', 'for', 'with', 'that', 'this',
  'from', 'into', 'are', 'sayfa', 'slayt', 'bölüm', 'ders', 'konu', 'not', 'notlar',
]);

const GREETING_RE =
  /^\s*(?:merhaba|hoş\s+geldiniz|selam|günaydın|iyi\s+günler|bugünkü\s+dersimizde|sevgili\s+arkadaşlar|dinlediğiniz\s+için\s+teşekkürler)\b/i;

function normalizeSourceText(raw: string): string {
  return String(raw || '')
    .split('\0')
    .join('')
    .replace(/\r\n/g, '\n')
    // PDF satır sonu tirelemelerini birleştir (örn. "merkez-\nlemiş" -> "merkezlemiş")
    .replace(/([A-Za-zÇĞİÖŞÜçğıöşü])-\n([a-zçğıöşü])/g, '$1$2')
    // Yalnızca tek başına duran slayt/sayfa numarası ve tekrarlı altbilgi satırlarını ayıkla
    .split('\n')
    .filter((line) => {
      const t = line.trim();
      if (!t) return true;
      if (/^\d{1,3}\s*(\/\s*\d{1,3})?$/.test(t)) return false;
      if (/^(sayfa|slayt|page|slide)\s*:?\s*\d{1,3}(\s*\/\s*\d{1,3})?$/i.test(t)) return false;
      return true;
    })
    .join('\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function splitIntoSentences(text: string): string[] {
  const cleaned = text
    .replace(/---\s*(Sayfa|Slayt)\s*\d+\s*---/gi, '\n')
    .replace(/===\s*KAYNAK\s*\d+:[^=]+===/gi, '\n')
    .trim();

  const rawSegments = cleaned
    .split(/(?<=[.!?])\s+|\n{1,}/)
    .map((s) => s.replace(/^[-•*#]+\s*/, '').trim())
    .filter((s) => s.length >= 24 && s.length <= 520);

  const nonGreeting = rawSegments.filter((s) => !GREETING_RE.test(s));
  const pool = nonGreeting.length >= 2 ? nonGreeting : rawSegments;

  const unique: string[] = [];
  const seen = new Set<string>();
  for (const seg of pool) {
    const key = seg.toLowerCase().slice(0, 90);
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(seg);
    }
  }
  return unique;
}

function extractKeyTerms(
  text: string,
  sentences: string[],
  course?: string,
  maxTerms = 14,
): Array<{
  term: string;
  definition: string;
  formula?: string;
}> {
  const cap = Math.max(8, Math.min(48, maxTerms));
  const terms: Array<{ term: string; definition: string; formula?: string }> = [];
  const seen = new Set<string>();
  const usedDefKeys = new Set<string>();

  const findBestHostSentence = (needleLower: string): string | undefined => {
    const cleanMatches = sentences.filter(
      (st) => st.toLocaleLowerCase('tr-TR').includes(needleLower) && !GREETING_RE.test(st),
    );
    const fresh = cleanMatches.find((st) => !usedDefKeys.has(st.slice(0, 50)));
    return fresh || cleanMatches[0] || sentences.find((st) => st.toLocaleLowerCase('tr-TR').includes(needleLower));
  };

  const pushTerm = (rawTerm: string, rawDef: string) => {
    // Trim leading non-domain stop words (e.g. "Bugün Para Teorisi" -> "Para Teorisi")
    let cleanedWords = rawTerm.replace(/^[*"'«»]+|[*"'«».,:;]+$/g, '').trim().split(/\s+/);
    while (cleanedWords.length > 1 && STOPWORDS.has(cleanedWords[0].toLocaleLowerCase('tr-TR'))) {
      cleanedWords = cleanedWords.slice(1);
    }
    const term = cleanedWords.join(' ').trim();
    const def = rawDef.replace(/^#+\s*/, '').trim();
    const key = term.toLocaleLowerCase('tr-TR');
    if (
      term.length < 3 ||
      term.length > 48 ||
      def.length < 18 ||
      seen.has(key) ||
      STOPWORDS.has(key) ||
      /^\d+$/.test(term)
    ) {
      return;
    }
    seen.add(key);
    usedDefKeys.add(def.slice(0, 50));
    terms.push({ term, definition: def.slice(0, 220) });
  };

  // 1. Explicit colon / definition patterns (e.g. "Marjinal Fayda: ..." or "Anayasa Hukuku — ...")
  for (const s of sentences) {
    if (terms.length >= cap) break;
    const match = s.match(/^([A-ZÇĞİÖŞÜ][^\n:–—-]{2,44})\s*[:–—]\s*(.{18,240})$/);
    if (match) {
      pushTerm(match[1], match[2]);
    }
  }

  // 2. Turkish academic copula / verbal definition patterns ("X ... anlamına gelir / denir / ifade eder")
  for (const s of sentences) {
    if (terms.length >= cap) break;
    const copula = s.match(
      /^([A-ZÇĞİÖŞÜ][A-Za-zÇĞİÖŞÜçğıöşü\s-]{2,38}?)(?:\s+(?:kavramı|ilkesi|kuramı|teorisi|yaklaşımı))?(?:,\s*|\s+)(?:denir|denmektedir|anlamına\s+gelir|ifade\s+eder|olarak\s+tanımlanır|olarak\s+adlandırılır|demektir)(?![\p{L}\p{N}])/iu,
    );
    if (copula) {
      pushTerm(copula[1], s);
      continue;
    }
    const boldMention = s.match(/\*\*([^*\n]{3,42})\*\*/);
    if (boldMention) {
      pushTerm(boldMention[1], s.replace(/\*\*/g, ''));
    }
  }

  // 3. Multi-word capitalized concepts frequent in Turkish texts (Unicode-safe boundaries so -ı/-ü suffixes are preserved)
  if (terms.length < cap) {
    const phraseFreq = new Map<string, number>();
    const phraseMatches =
      text.match(
        /(?<![\p{L}\p{N}])[A-ZÇĞİÖŞÜ][a-zçğıöşü]{2,}(?:\s+[A-ZÇĞİÖŞÜ][a-zçğıöşü]{2,}){1,2}(?![\p{L}\p{N}])/gu,
      ) || [];
    for (const ph of phraseMatches) {
      const cleanPh = ph.trim();
      if (cleanPh.length >= 6 && cleanPh.length <= 42 && !GREETING_RE.test(cleanPh)) {
        phraseFreq.set(cleanPh, (phraseFreq.get(cleanPh) || 0) + 1);
      }
    }
    const rankedPhrases = Array.from(phraseFreq.entries()).sort((a, b) => b[1] - a[1]);
    for (const [phrase] of rankedPhrases) {
      if (terms.length >= cap) break;
      const lowerPh = phrase.toLocaleLowerCase('tr-TR');
      if (seen.has(lowerPh)) continue;
      const host = findBestHostSentence(lowerPh);
      if (host) pushTerm(phrase, host);
    }
  }

  // 4. Frequency-scored domain words not already part of an extracted multi-word concept
  if (terms.length < Math.min(cap, 12)) {
    const freq = new Map<string, number>();
    const words = text
      .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 5 && !STOPWORDS.has(w.toLocaleLowerCase('tr-TR')));

    for (const w of words) {
      const lower = w.toLocaleLowerCase('tr-TR');
      if (/^\d+$/.test(lower)) continue;
      freq.set(lower, (freq.get(lower) || 0) + 1);
    }

    const existingTermsLower = Array.from(seen);
    const sortedWords = Array.from(freq.entries())
      .filter(([w]) => !seen.has(w) && !existingTermsLower.some((et) => et.includes(w)))
      .sort((a, b) => b[1] - a[1])
      .slice(0, Math.min(cap, 16));

    for (const [word] of sortedWords) {
      if (terms.length >= cap) break;
      if (seen.has(word)) continue;
      const hostSentence = findBestHostSentence(word);
      if (hostSentence) {
        pushTerm(word.charAt(0).toLocaleUpperCase('tr-TR') + word.slice(1), hostSentence);
      }
    }
  }

  if (terms.length === 0 && course) {
    terms.push({
      term: course,
      definition: sentences[0] || `${course} dersi kapsamında ele alınan temel kavram.`,
    });
  }

  return terms;
}

function splitDocumentIntoUnits(text: string, fallbackTitle: string, targetSections: number): ParsedUnit[] {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const rawBlocks: Array<{ heading: string; pageRange?: string; sourceTag?: string; lines: string[] }> = [];

  let currentHeading = '';
  let currentPageRange: string | undefined;
  let currentSourceTag: string | undefined;
  let currentLines: string[] = [];

  const isHeadingCandidate = (line: string): boolean => {
    if (line.length < 4 || line.length > 90) return false;
    if (/^#{1,4}\s+/.test(line)) return true;
    if (/^(\d+(\.\d+){0,2}|[IVX]+\.)\s+[A-ZÇĞİÖŞÜ]/.test(line)) return true;
    if (/^[A-ZÇĞİÖŞÜ][^.!?]{3,55}:$/.test(line)) return true;
    if (
      line.length >= 6 &&
      line.length <= 60 &&
      line === line.toUpperCase() &&
      /[A-ZÇĞİÖŞÜ]{3}/.test(line)
    ) {
      return true;
    }
    return false;
  };

  for (const line of lines) {
    const pageMatch = line.match(/^---\s*(Sayfa|Slayt)\s+(\d+)\s*---$/i);
    if (pageMatch) {
      if (!currentPageRange) currentPageRange = `${pageMatch[1]} ${pageMatch[2]}`;
      else {
        const start = currentPageRange.split('-')[0].trim();
        currentPageRange = `${start}-${pageMatch[2]}`;
      }
      continue;
    }
    if (/^===\s*KAYNAK/i.test(line)) {
      if (currentLines.length > 0) {
        rawBlocks.push({
          heading: currentHeading || `${fallbackTitle} — Bölüm ${rawBlocks.length + 1}`,
          pageRange: currentPageRange,
          sourceTag: currentSourceTag,
          lines: currentLines,
        });
        currentLines = [];
      }
      const cleanedSrc = line.replace(/^===\s*|\s*===$/g, '').trim();
      currentSourceTag = cleanedSrc;
      currentHeading = cleanedSrc;
      currentPageRange = undefined;
      continue;
    }
    if (isHeadingCandidate(line) && currentLines.length >= 1) {
      rawBlocks.push({
        heading: currentHeading || `${fallbackTitle} — Bölüm ${rawBlocks.length + 1}`,
        pageRange: currentPageRange,
        sourceTag: currentSourceTag,
        lines: currentLines,
      });
      currentHeading = line.replace(/^#{1,4}\s+/, '').replace(/:$/, '').trim();
      currentPageRange = undefined;
      currentLines = [];
      continue;
    }
    if ((!currentHeading || currentHeading === currentSourceTag) && isHeadingCandidate(line)) {
      currentHeading = line.replace(/^#{1,4}\s+/, '').replace(/:$/, '').trim();
      continue;
    }
    currentLines.push(line);
  }

  if (currentLines.length > 0) {
    rawBlocks.push({
      heading: currentHeading || `${fallbackTitle} — Bölüm ${rawBlocks.length + 1}`,
      pageRange: currentPageRange,
      sourceTag: currentSourceTag,
      lines: currentLines,
    });
  }

  // Merge tiny blocks or split overly large block evenly across targetSections
  let normalizedBlocks = rawBlocks.filter((b) => b.lines.join(' ').trim().length > 35);

  if (normalizedBlocks.length <= 1) {
    const allSentences = splitIntoSentences(text);
    const globalTerms = extractKeyTerms(text, allSentences);
    const groupCount = Math.min(
      targetSections,
      Math.max(2, Math.ceil(allSentences.length / 4)),
    );
    const perGroup = Math.max(1, Math.ceil(allSentences.length / groupCount));
    normalizedBlocks = Array.from({ length: groupCount }, (_, i) => {
      const slice = allSentences.slice(i * perGroup, (i + 1) * perGroup);
      const sliceText = slice.join(' ').toLocaleLowerCase('tr-TR');
      const matchedTerm = globalTerms.find(
        (gt) => sliceText.includes(gt.term.toLocaleLowerCase('tr-TR')) && gt.term.length >= 4,
      );
      const colonHead = slice[0]?.match(/^([A-ZÇĞİÖŞÜ][^:–—.!?]{3,38})\s*[:–—]/)?.[1]?.trim();
      const firstWords = (slice[0] || '')
        .split(/\s+/)
        .filter((w) => !STOPWORDS.has(w.toLocaleLowerCase('tr-TR')))
        .slice(0, 4)
        .join(' ')
        .replace(/[,.;:!?]$/, '');
      const topicLabel = colonHead || matchedTerm?.term || firstWords;
      return {
        heading: topicLabel
          ? `Bölüm ${i + 1}: ${topicLabel}`
          : `${fallbackTitle} — Bölüm ${i + 1}`,
        lines: slice,
      };
    });
  } else if (normalizedBlocks.length > targetSections + 3) {
    // Coalesce excess tiny blocks ONLY within the same sourceTag so different courses never merge!
    const step = Math.ceil(normalizedBlocks.length / targetSections);
    const merged: typeof normalizedBlocks = [];
    let i = 0;
    while (i < normalizedBlocks.length) {
      const base = normalizedBlocks[i];
      const group = [base];
      i += 1;
      while (
        i < normalizedBlocks.length &&
        group.length < step &&
        normalizedBlocks[i].sourceTag === base.sourceTag
      ) {
        group.push(normalizedBlocks[i]);
        i += 1;
      }
      const firstRange = group.find((g) => g.pageRange)?.pageRange;
      const lastRange = [...group].reverse().find((g) => g.pageRange)?.pageRange;
      const combinedRange =
        firstRange && lastRange && firstRange !== lastRange
          ? `${firstRange.split('-')[0].trim()}-${lastRange.split('-').pop()?.trim()}`
          : firstRange;
      merged.push({
        heading: group[0].heading,
        pageRange: combinedRange,
        sourceTag: base.sourceTag,
        lines: group.flatMap((g) => g.lines),
      });
    }
    normalizedBlocks = merged;
  }

  return normalizedBlocks.map((b) => {
    const joined = b.lines.join('\n');
    const sentences = splitIntoSentences(joined);
    const bullets = b.lines
      .filter((l) => /^[-•*]\s+/.test(l))
      .map((l) => l.replace(/^[-•*]\s+/, '').trim());
    const formulas = b.lines
      .filter(
        (l) =>
          l.length > 3 &&
          l.length < 160 &&
          (/[=$\\]/.test(l) || /(?:H[₀0]|H[₁1]|χ²|σ²|s²|x̄|μ|∑|√|Var\(|Cov\(|E\(|P\()/.test(l)) &&
          !/^\|.*\|$/.test(l),
      )
      .slice(0, 8);

    const paragraphs: string[] = [];
    for (let i = 0; i < sentences.length; i += 3) {
      paragraphs.push(sentences.slice(i, i + 3).join(' '));
    }
    return {
      heading: b.heading,
      pageRange: b.pageRange,
      paragraphs: paragraphs.length > 0 ? paragraphs : [joined.slice(0, 1200)],
      sentences,
      bullets,
      formulas,
    };
  });
}

function cleanCompleteSentence(raw: string, maxLen = 175): string {
  const cleaned = String(raw || '')
    .replace(/…|\.{3,}/g, '')
    .replace(/\*\*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return '';
  if (cleaned.length <= maxLen) {
    return /[.!?]$/.test(cleaned) ? cleaned : `${cleaned}.`;
  }
  const firstSent = cleaned.split(/(?<=[.!?])\s+/)[0] || cleaned;
  if (firstSent.length >= 28 && firstSent.length <= maxLen + 15) {
    return /[.!?]$/.test(firstSent) ? firstSent : `${firstSent}.`;
  }
  const words = cleaned.slice(0, maxLen - 4).split(' ');
  words.pop();
  const joined = words.join(' ').replace(/[,;:\-–—]+$/, '').trim();
  return joined ? `${joined}.` : `${cleaned.slice(0, maxLen)}.`;
}

function stripTermSubjectToPredicate(sentence: string, term: string): string {
  const clean = cleanCompleteSentence(sentence, 165);
  const esc = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Remove leading "Term, ..." or "Term: ..." or "Term kavramı ..." so the predicate does not leak the term name
  const stripped = clean
    .replace(new RegExp(`^${esc}(?:[a-zçğıöşü']*)?(?:\\s+(?:kavramı|ilkesi|teorisi|kuramı|sistemi|yaklaşımı))?\\s*[,:\\-–—]?\\s*`, 'iu'), '')
    .trim();
  if (stripped.length >= 24) {
    return stripped.charAt(0).toLocaleUpperCase('tr-TR') + stripped.slice(1);
  }
  return clean;
}

function maskConceptInText(sentence: string, term: string): { masked: string; didMask: boolean } {
  const clean = cleanCompleteSentence(sentence, 210);
  const esc = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(?<![\\p{L}\\p{N}])${esc}[a-zçğıöşü']*(?![\\p{L}\\p{N}])`, 'giu');
  if (!re.test(clean)) return { masked: clean, didMask: false };
  return { masked: clean.replace(re, '_____'), didMask: true };
}

const LOGICAL_INVERSION_PAIRS: Array<[RegExp, string]> = [
  [/\bartırır\b/gi, 'azaltır'],
  [/\bazaltır\b/gi, 'artırır'],
  [/\bartar\b/gi, 'azalır'],
  [/\bazalır\b/gi, 'artar'],
  [/\byükselir\b/gi, 'düşer'],
  [/\bdüşer\b/gi, 'yükselir'],
  [/\bteşvik\s+edilir/gi, 'yasaklanır'],
  [/\bsınırlandırılmıştır/gi, 'tamamen serbest bırakılmıştır'],
  [/\bzorunludur\b/gi, 'gereksiz ve geçersizdir'],
  [/\bserbest\s+dış\s+ticareti\b/gi, 'ağır gümrük korumacılığını'],
  [/\bpozitif\b/gi, 'negatif'],
  [/\bnegatif\b/gi, 'pozitif'],
  [/\bkısa\s+dönemde\b/gi, 'yalnızca uzun dönemde sabit kalarak'],
  [/\buzun\s+dönemde\b/gi, 'yalnızca kısa dönemde geçici olarak'],
  [/\breddedilir\b/gi, 'koşulsuz kabul edilir'],
  [/\bkabul\s+edilir\b/gi, 'kesin olarak reddedilir'],
  [/\bgeçerlidir\b/gi, 'hükümsüzdür'],
  [/\bsorumludur\b/gi, 'hiçbir sorumluluk taşımaz'],
  [/\bdoğrudan\s+belirler\b/gi, 'hiçbir biçimde etkilemez'],
  [/\bsavunur\b/gi, 'tümüyle reddeder'],
  [/\bkarşı\s+çıkmış/gi, 'koşulsuz desteklemiş'],
  [/\bdışsal\b/gi, 'tamamen içsel'],
  [/\biçsel\b/gi, 'tamamen dışsal'],
  [/\bpasif\s+kalemidir\b/gi, 'aktif kalemidir'],
  [/\baktif\s+kalemidir\b/gi, 'pasif kalemidir'],
  [/\balacaklı\b/gi, 'borçlu'],
  [/\bborçlu\b/gi, 'alacaklı'],
];

function createLogicalInversion(
  sentence: string,
  otherTerm?: { term: string; definition: string },
  subjectTerm?: string,
): { statement: string; reason: string } | null {
  const clean = cleanCompleteSentence(sentence, 160);
  for (const [pattern, replacement] of LOGICAL_INVERSION_PAIRS) {
    pattern.lastIndex = 0;
    if (pattern.test(clean)) {
      pattern.lastIndex = 0;
      const inverted = clean.replace(pattern, replacement);
      if (inverted !== clean) {
        return {
          statement: inverted,
          reason: `Kaynak metindeki gerçek ilişki tersine çevrilmiştir. Doğrusu: "${clean}"`,
        };
      }
    }
  }
  if (subjectTerm && otherTerm && normalizeForComparison(subjectTerm) !== normalizeForComparison(otherTerm.term)) {
    const wrongPred = stripTermSubjectToPredicate(otherTerm.definition, otherTerm.term);
    if (wrongPred.length >= 24) {
      const lowerPred = wrongPred.charAt(0).toLocaleLowerCase('tr-TR') + wrongPred.slice(1);
      return {
        statement: `${subjectTerm}, ${lowerPred}`,
        reason: `Bu tanım/özellik "${subjectTerm}" kavramına değil, kaynak metindeki "${otherTerm.term}" kavramına aittir.`,
      };
    }
  }
  return null;
}

function rotateArrayBySeed<T>(items: T[], seedStr: string): T[] {
  if (items.length <= 1) return [...items];
  const offset = parseInt(hashCompact(seedStr).slice(0, 4), 36) % items.length;
  return [...items.slice(offset), ...items.slice(0, offset)];
}

/**
 * Builds a single academically valid concept-pinned multiple-choice question
 * with strictly 1 correct answer and 3 genuinely wrong, plausible domain distractors.
 */
function buildValidConceptPinnedQuestion(params: {
  term: string;
  definition: string;
  sectionHeading: string;
  pageRange?: string;
  otherTerms: Array<{ term: string; definition: string }>;
  seedIndex: number;
}): {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
} | null {
  const correctPred = stripTermSubjectToPredicate(params.definition, params.term);
  if (correctPred.length < 22) return null;

  const wrongPreds: string[] = [];
  const seenNorm = new Set<string>([normalizeForComparison(correctPred)]);
  for (const ot of params.otherTerms) {
    if (normalizeForComparison(ot.term) === normalizeForComparison(params.term)) continue;
    const pred = stripTermSubjectToPredicate(ot.definition, ot.term);
    const norm = normalizeForComparison(pred);
    if (pred.length >= 22 && !seenNorm.has(norm) && !norm.includes(normalizeForComparison(params.term))) {
      seenNorm.add(norm);
      wrongPreds.push(pred);
    }
    if (wrongPreds.length >= 3) break;
  }

  // If the document is very short and has fewer than 3 other terms, create a clean logical inversion as distractor
  if (wrongPreds.length < 3) {
    const inv = createLogicalInversion(params.definition);
    if (inv) {
      const invPred = stripTermSubjectToPredicate(inv.statement, params.term);
      const norm = normalizeForComparison(invPred);
      if (invPred.length >= 22 && !seenNorm.has(norm)) {
        seenNorm.add(norm);
        wrongPreds.push(invPred);
      }
    }
  }

  if (wrongPreds.length < 3) return null;

  const correctIndex = params.seedIndex % 4;
  const options = wrongPreds.slice(0, 3);
  options.splice(correctIndex, 0, correctPred);

  return {
    question: `${params.sectionHeading} bağlamında "${params.term}" kavramı için aşağıdakilerden hangisi doğrudur?`,
    options,
    correctIndex,
    explanation: `Kaynak metne (${params.sectionHeading}${params.pageRange ? `, ${params.pageRange}` : ''}) göre ${params.term}: ${correctPred}`,
  };
}

/**
 * Generates a rich, diverse, non-repeating candidate quiz bank across all document sections
 * spanning 4 cognitive archetypes (Bilgi/Kavrama, Yorumlama/Uygulama, Analiz/Karşılaştırma)
 * with strictly 1 correct answer per multiple-choice question.
 */
function buildLocalQuizCandidates(params: {
  units: ParsedUnit[];
  keyTerms: Array<{ term: string; definition: string; formula?: string }>;
  sentences: string[];
  title: string;
  course: string;
  quizFormat: 'multiple_choice' | 'open_ended' | 'mixed';
  generationNonce?: string;
  preferredTopics?: string[];
  requestedCount: number;
}): QuizQuestion[] {
  const { units, keyTerms, sentences, title, course, quizFormat } = params;
  const nonce = params.generationNonce || 'default';

  // Augment term pool with clean heading/subject concepts if keyTerms is small
  const enrichedTerms: Array<{ term: string; definition: string; section: string; pageRange?: string }> = [];
  const seenTermKey = new Set<string>();

  const findUnitForText = (text: string): ParsedUnit | undefined => {
    const lower = text.toLocaleLowerCase('tr-TR');
    return units.find(
      (u) =>
        u.heading.toLocaleLowerCase('tr-TR').includes(lower.slice(0, 20)) ||
        u.sentences.some((s) => s.toLocaleLowerCase('tr-TR').includes(lower.slice(0, 24))),
    );
  };

  for (const kt of keyTerms) {
    const k = normalizeForComparison(kt.term);
    if (!k || seenTermKey.has(k)) continue;
    seenTermKey.add(k);
    const hostUnit = findUnitForText(kt.term) || findUnitForText(kt.definition) || units[0];
    enrichedTerms.push({
      term: kt.term,
      definition: cleanCompleteSentence(kt.definition, 180),
      section: hostUnit?.heading || title,
      pageRange: hostUnit?.pageRange,
    });
  }

  // Also extract section-level concepts from colon or capitalized subjects in each unit
  for (const u of units) {
    for (const s of u.sentences) {
      const m = s.match(/^([A-ZÇĞİÖŞÜ][A-Za-zÇĞİÖŞÜçğıöşü\s-]{2,36}?)(?:\s*[:–—]|,\s+)/);
      if (m) {
        const candTerm = m[1].trim();
        const k = normalizeForComparison(candTerm);
        if (candTerm.length >= 4 && !seenTermKey.has(k) && !STOPWORDS.has(candTerm.toLocaleLowerCase('tr-TR'))) {
          seenTermKey.add(k);
          enrichedTerms.push({
            term: candTerm,
            definition: cleanCompleteSentence(s, 180),
            section: u.heading,
            pageRange: u.pageRange,
          });
        }
      }
    }
  }

  // Prioritize sections in preferredTopics (least tested in prior runs) + nonce rotation
  const preferredSet = new Set((params.preferredTopics || []).map(normalizeForComparison));
  const orderedUnits = [...units].sort((a, b) => {
    const aPref = preferredSet.has(normalizeForComparison(a.heading)) ? 0 : 1;
    const bPref = preferredSet.has(normalizeForComparison(b.heading)) ? 0 : 1;
    return aPref - bPref;
  });
  const rotatedUnits = rotateArrayBySeed(orderedUnits, `${nonce}:units`);
  const rotatedTerms = rotateArrayBySeed(enrichedTerms, `${nonce}:terms`);

  const candidates: QuizQuestion[] = [];

  // Open-ended questions if requested
  if (quizFormat === 'open_ended' || quizFormat === 'mixed') {
    const openTarget = quizFormat === 'open_ended' ? params.requestedCount + 4 : Math.max(2, Math.ceil(params.requestedCount * 0.25));
    const openStemTemplates: Array<(term: string, section: string) => string> = [
      (term, section) => `"${term}" kavramı nedir ve ${section} içindeki işlevi nasıl tanımlanır?`,
      (term) => `${term} hangi durumlarda ortaya çıkar ve model ya da sistem üzerinde ne gibi sonuçlar doğurur?`,
      (term, section) => `${section} kapsamında "${term}" olgusunun temel varsayım ve mekanizmasını açıklayınız.`,
      (term) => `Sınav perspektifinden "${term}" kavramının ayırt edici özelliği ve uygulama etkileri nelerdir?`,
      (term) => `"${term}" konusundaki nedensellik ilişkisini kendi cümlelerinizle örneklendirerek değerlendiriniz.`,
      (term, section) => `${term} ile ilişkili kritik sınır veya test koşullarını ${section} bağlamında tartışınız.`,
    ];
    for (let i = 0; i < Math.min(openTarget, rotatedTerms.length); i++) {
      const t = rotatedTerms[i];
      const stemBuilder = openStemTemplates[i % openStemTemplates.length];
      candidates.push({
        type: 'short_answer',
        question: stemBuilder(t.term, t.section),
        options: [],
        sampleAnswer: t.definition,
        rubric: [
          `${t.term} kavramının doğru ve eksiksiz tanımlanması`,
          `${t.section} bağlamındaki mekanizma veya neden-sonuç ilişkisinin kurulması`,
        ],
        explanation: `Kaynak metne (${t.section}) göre: ${t.definition}`,
        topic: t.section,
        sourceSection: t.section,
        sourcePage: t.pageRange,
        difficulty: i % 2 === 0 ? 'hard' : 'medium',
        bloomLevel: i % 2 === 0 ? 'Analiz ve Karşılaştırma' : 'Yorumlama ve Uygulama',
      });
    }
    if (quizFormat === 'open_ended') return candidates;
  }

  // ARCHETYPE 1 (EASY — Bilgi ve Kavrama): Masked Concept Identification (Definition -> Term)
  if (rotatedTerms.length >= 4) {
    for (let i = 0; i < rotatedTerms.length; i++) {
      const target = rotatedTerms[i];
      const { masked, didMask } = maskConceptInText(target.definition, target.term);
      const otherNames = rotatedTerms
        .filter((ot) => normalizeForComparison(ot.term) !== normalizeForComparison(target.term))
        .map((ot) => ot.term);
      const distinctDistractors = Array.from(new Set(otherNames)).slice(0, 3);
      if (distinctDistractors.length < 3) continue;

      const correctIndex = (i + 1) % 4;
      const options = [...distinctDistractors];
      options.splice(correctIndex, 0, target.term);

      const stem = didMask
        ? `"${masked}" ifadesinde boş bırakılan yere ders notuna göre hangi kavram getirilmelidir?`
        : `${target.section} konusunda "${stripTermSubjectToPredicate(target.definition, target.term)}" biçiminde açıklanan kavram aşağıdakilerden hangisidir?`;

      candidates.push({
        type: 'multiple_choice',
        question: stem,
        options,
        correctIndex,
        explanation: `Kaynak notun "${target.section}" bölümünde bu tanım doğrudan "${target.term}" kavramını ifade eder: ${target.definition}`,
        topic: target.section,
        sourceSection: target.section,
        sourcePage: target.pageRange,
        difficulty: 'easy',
        bloomLevel: 'Bilgi ve Kavrama',
      });
    }
  }

  // ARCHETYPE 2 (MEDIUM — Yorumlama ve Uygulama): Concept-Pinned Attribute / Role Matching
  for (let i = 0; i < rotatedTerms.length; i++) {
    const target = rotatedTerms[i];
    const others = rotateArrayBySeed(
      rotatedTerms.filter((ot) => normalizeForComparison(ot.term) !== normalizeForComparison(target.term)),
      `${nonce}:pin:${i}`,
    );
    const built = buildValidConceptPinnedQuestion({
      term: target.term,
      definition: target.definition,
      sectionHeading: target.section,
      pageRange: target.pageRange,
      otherTerms: others,
      seedIndex: i + 2,
    });
    if (!built) continue;
    candidates.push({
      type: 'multiple_choice',
      question: built.question,
      options: built.options,
      correctIndex: built.correctIndex,
      explanation: built.explanation,
      topic: target.section,
      sourceSection: target.section,
      sourcePage: target.pageRange,
      difficulty: 'medium',
      bloomLevel: 'Yorumlama ve Uygulama',
    });
  }

  // ARCHETYPE 3 (HARD — Analiz ve Karşılaştırma): Logical Inversion / "Hangisi Söylenemez?"
  for (let uIdx = 0; uIdx < rotatedUnits.length; uIdx++) {
    const u = rotatedUnits[uIdx];
    const cleanSents = u.sentences
      .filter((s) => !GREETING_RE.test(s) && s.length >= 30)
      .map((s) => cleanCompleteSentence(s, 155));
    const poolTrue = Array.from(
      new Set([
        ...cleanSents,
        ...sentences.filter((s) => !GREETING_RE.test(s) && s.length >= 30).map((s) => cleanCompleteSentence(s, 155)),
      ]),
    );
    if (poolTrue.length < 4) continue;

    // Pick a sentence to invert logically so strictly 1 option is FALSE and 3 options are TRUE
    const targetSentIdx = uIdx % Math.min(cleanSents.length || 1, poolTrue.length);
    const sentenceToInvert = cleanSents[targetSentIdx] || poolTrue[targetSentIdx];
    const hostTerm = rotatedTerms.find((t) => normalizeForComparison(t.section) === normalizeForComparison(u.heading)) || rotatedTerms[uIdx % Math.max(1, rotatedTerms.length)];
    const otherTerm = rotatedTerms.find((t) => hostTerm && normalizeForComparison(t.term) !== normalizeForComparison(hostTerm.term));
    const inverted = createLogicalInversion(sentenceToInvert, otherTerm, hostTerm?.term);
    if (!inverted) continue;

    const trueOptions = poolTrue
      .filter((s) => normalizeForComparison(s) !== normalizeForComparison(sentenceToInvert) && normalizeForComparison(s) !== normalizeForComparison(inverted.statement))
      .slice(0, 3);
    if (trueOptions.length < 3) continue;

    const correctIndex = (uIdx + 3) % 4;
    const options = [...trueOptions];
    options.splice(correctIndex, 0, inverted.statement);

    candidates.push({
      type: 'multiple_choice',
      question: `Ders notunun "${u.heading}" bölümü ve ilişkili ilkeler birlikte değerlendirildiğinde aşağıdaki yargılardan hangisi söylenemez?`,
      options,
      correctIndex,
      explanation: `${inverted.reason} Diğer üç seçenek kaynak metinle tutarlıdır.`,
      topic: u.heading,
      sourceSection: u.heading,
      sourcePage: u.pageRange,
      difficulty: 'hard',
      bloomLevel: 'Analiz ve Karşılaştırma',
    });
  }

  // ARCHETYPE 4 (HARD — Analiz ve Karşılaştırma): Cross-Term Distinction (Comparing two concepts from the note)
  if (rotatedTerms.length >= 4) {
    for (let i = 0; i < Math.min(rotatedTerms.length, 6); i++) {
      const termA = rotatedTerms[i];
      const termB = rotatedTerms[(i + 1) % rotatedTerms.length];
      if (normalizeForComparison(termA.term) === normalizeForComparison(termB.term)) continue;

      const predA = stripTermSubjectToPredicate(termA.definition, termA.term);
      const predB = stripTermSubjectToPredicate(termB.definition, termB.term);
      if (predA.length < 22 || predB.length < 22) continue;

      const invA = createLogicalInversion(termA.definition, termB, termA.term);
      const otherC = rotatedTerms[(i + 2) % rotatedTerms.length];
      const otherD = rotatedTerms[(i + 3) % rotatedTerms.length];
      const predC = stripTermSubjectToPredicate(otherC.definition, otherC.term);
      const predD = stripTermSubjectToPredicate(otherD.definition, otherD.term);

      const truePair = `${termA.term} kavramı ${predA.charAt(0).toLocaleLowerCase('tr-TR') + predA.slice(1)}`;
      const wrong1 = `${termA.term} kavramı ${predB.charAt(0).toLocaleLowerCase('tr-TR') + predB.slice(1)}`;
      const wrong2 = `${termB.term} kavramı ${predA.charAt(0).toLocaleLowerCase('tr-TR') + predA.slice(1)}`;
      const wrong3 = invA
        ? invA.statement
        : `${termA.term} kavramı ${predC.charAt(0).toLocaleLowerCase('tr-TR') + predC.slice(1)}`;

      const uniq = new Set([truePair, wrong1, wrong2, wrong3].map(normalizeForComparison));
      if (uniq.size < 4 || predD.length < 10) continue;

      const correctIndex = i % 4;
      const options = [wrong1, wrong2, wrong3];
      options.splice(correctIndex, 0, truePair);

      candidates.push({
        type: 'multiple_choice',
        question: `"${termA.term}" ve "${termB.term}" kavramları karşılaştırıldığında ders notuna göre aşağıdaki eşleştirmelerden hangisi doğrudur?`,
        options,
        correctIndex,
        explanation: `Kaynak metinde "${termA.term}" kavramı şu şekilde açıklanır: ${termA.definition} Oysa "${termB.term}" farklı bir işlevi tanımlar.`,
        topic: `${termA.section}`,
        sourceSection: termA.section,
        sourcePage: termA.pageRange,
        difficulty: 'hard',
        bloomLevel: 'Analiz ve Karşılaştırma',
      });
    }
  }

  // Rotate final candidate pool lightly by nonce so repeated calls sample different archetypes first
  return rotateArrayBySeed(candidates, `${nonce}:${course}:final`);
}

const CAUSAL_CONTRAST_RE =
  /\b(çünkü|dolayısıyla|nedeniyle|sonucunda|böylece|amaç|koşul|ilke|göre|karşın|ancak|aksine|istisna|zorunlu|farklı\s+olarak|temel\s+olarak|yol\s+açar|belirler|önemli|avantaj|dezavantaj)\b/i;

function highlightKeyTermsInProse(prose: string, terms: string[]): string {
  let out = prose;
  for (const term of terms.slice(0, 4)) {
    if (term.length < 4 || term.length > 38) continue;
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(?<![\\p{L}\\p{N}*])(${escaped})(?![\\p{L}\\p{N}*])`, 'iu');
    if (re.test(out)) {
      out = out.replace(re, '**$1**');
    }
  }
  return out;
}

function classifyClauseBadge(sentence: string): string {
  const lower = sentence.toLocaleLowerCase('tr-TR');
  if (/(çünkü|nedeniyle|kaynaklan)/.test(lower)) return 'Neden–Köken';
  if (/(sonucunda|dolayısıyla|yol\s+açar|böylece|sağlar)/.test(lower)) return 'Sonuç & Etki';
  if (/(ancak|karşın|aksine|farklı\s+olarak|istisna)/.test(lower)) return 'Ayırt Edici Fark';
  if (/(koşul|şart|zorunlu|göre|ilke)/.test(lower)) return 'Temel Koşul / İlke';
  return 'Anahtar Mekanizma';
}

function buildRichSummarySection(params: {
  index: number;
  heading: string;
  pageRange?: string;
  unit: ParsedUnit;
  allSentences: string[];
  keyTerms: Array<{ term: string; definition: string; formula?: string }>;
  domainMode: AcademicDomainMode;
  disciplineFamily?: DisciplineSummaryGuidance['disciplineFamily'];
  deepResearch?: boolean;
  course?: string;
  extraTakeaways?: string[];
}): SummarySection {
  const {
    index,
    heading,
    pageRange,
    unit,
    allSentences,
    keyTerms,
    domainMode,
    disciplineFamily,
    deepResearch,
    course,
    extraTakeaways,
  } = params;
  const isVerbal = domainMode === 'verbal' || disciplineFamily === 'law';
  const isLaw = disciplineFamily === 'law';
  const isStatistics = disciplineFamily === 'statistics';
  const isEconomics = disciplineFamily === 'economics';
  const bodyBlocks: string[] = [];

  const unitJoinedLower = unit.paragraphs.join(' ').toLocaleLowerCase('tr-TR');
  const matchedTerms = keyTerms.filter(
    (kt) =>
      unitJoinedLower.includes(kt.term.toLocaleLowerCase('tr-TR')) ||
      kt.definition.toLocaleLowerCase('tr-TR').includes(heading.toLocaleLowerCase('tr-TR').slice(0, 10)),
  );
  const sectionTerms = (matchedTerms.length >= 2 ? matchedTerms : keyTerms.slice(index, index + 4)).slice(0, 4);
  const termNames = sectionTerms.map((t) => t.term);

  // 1. Kavramsal Öz / Analitik Çerçeve (disipline doğal uyarlama)
  if (unit.paragraphs.length > 0) {
    const leadTitle = isLaw
      ? '#### Hukuki Çerçeve, Unsurlar ve Kapsam'
      : isEconomics
      ? '#### Kuramsal Çerçeve ve İktisadi Mekanizma'
      : isStatistics
      ? '#### İstatistiksel Yapı, Varsayımlar ve Yöntem'
      : isVerbal
      ? '#### Kavramsal Öz ve Ana Tez'
      : '#### Analitik Çerçeve';
    const enrichedParagraphs = unit.paragraphs.map((p) => highlightKeyTermsInProse(p, termNames));
    bodyBlocks.push(`${leadTitle}\n\n${enrichedParagraphs.join('\n\n')}`);
  }

  // 2. Neden–Sonuç Zinciri / Ayırt Edici İlkeler
  const causalCandidates = unit.sentences.filter((s) => CAUSAL_CONTRAST_RE.test(s));
  const combinedBullets = [
    ...unit.bullets.map((b) => `- **Ana Nokta:** ${highlightKeyTermsInProse(b, termNames)}`),
    ...causalCandidates
      .slice(0, 4)
      .map((s) => `- **${classifyClauseBadge(s)}:** ${highlightKeyTermsInProse(s, termNames)}`),
  ];
  const uniqueBullets = Array.from(new Set(combinedBullets)).slice(0, 5);
  if (uniqueBullets.length === 0 && unit.sentences.length > 0) {
    uniqueBullets.push(
      ...unit.sentences
        .slice(0, 3)
        .map((s) => `- **Temel İlke:** ${highlightKeyTermsInProse(s, termNames)}`),
    );
  }
  if (uniqueBullets.length > 0) {
    const bulletTitle = isLaw
      ? '#### Kurucu Unsurlar, İstisnalar ve Hukuki Sonuçlar'
      : isEconomics
      ? '#### Aktarım Mekanizmaları, Denge Koşulları ve Etkiler'
      : isStatistics
      ? '#### Test Adımları, Varsayımlar ve Karar Kuralları'
      : isVerbal
      ? '#### Neden–Sonuç Zinciri ve Ayırt Edici İlkeler'
      : '#### Öne Çıkan Mekanizmalar ve Adımlar';
    bodyBlocks.push(`${bulletTitle}\n${uniqueBullets.join('\n')}`);
  }

  // 3. Karşılaştırma ve Kavram Tablosu
  if (sectionTerms.length >= 2) {
    const tableHeader = isLaw
      ? '| Hukuki Kavram / Kurum | Tanım, Şart ve Kapsam | Sınavda Ayırt Edici Yön |'
      : isEconomics
      ? '| Kavram / Teori / Model | İktisadi İşlev ve Kapsam | Kritik Mekanizma / Ayrım |'
      : isStatistics
      ? '| Ölçüt / Test / Dağılım | Kullanım Amacı ve Varsayım | Yorumlama Odağı |'
      : isVerbal
      ? '| Kavram / Ekol / Unsur | Kapsam ve Ana Fikir | Sınavda Ayırt Edici Yön |'
      : '| Kavram / Unsur | Analitik İşlev ve Kapsam | Kritik Koşul / Ayrım |';
    const tableRows = sectionTerms
      .map((kt) => {
        const cleanTerm = kt.term.replace(/\|/g, '/');
        const cleanDef = kt.definition.replace(/\|/g, '/').slice(0, 125);
        const angle = classifyClauseBadge(kt.definition);
        return `| **${cleanTerm}** | ${cleanDef} | ${angle} |`;
      })
      .join('\n');
    const tableTitle = isLaw
      ? '#### Hukuki Kavram ve Ayrım Tablosu'
      : isVerbal
      ? '#### Kavram ve Ayrım Tablosu'
      : '#### Kavramsal Yapı ve Karşılaştırma Tablosu';
    bodyBlocks.push(`${tableTitle}\n${tableHeader}\n| --- | --- | --- |\n${tableRows}`);
  }

  // 4. Formüller yalnız gerçek sayısal/mantıksal ifade varsa gösterilir (hukuk/sözelde uydurma formül yok!)
  if (!isVerbal && unit.formulas.length > 0) {
    bodyBlocks.push(
      `#### Kaynak Formül, Denklem ve Kullanım İlişkisi\n${unit.formulas.map((f) => `> ${f}`).join('\n')}`,
    );
  }

  // 5. Sınav Odağı & Klasik Yorum İpucu
  const contrastSent =
    unit.sentences.find((s) => /\b(ancak|karşın|aksine|istisna|farklı\s+olarak|en\s+önemli)\b/i.test(s)) ||
    (unit.sentences.length > 1 ? unit.sentences[unit.sentences.length - 1] : unit.sentences[0]);
  if (contrastSent) {
    const tipTitle = isVerbal ? 'Klasik Sınav & Yorum İpucu' : 'Sınav Odağı';
    bodyBlocks.push(`> **${tipTitle}:** ${contrastSent}`);
  }

  const takeaways = Array.from(
    new Set([
      ...(extraTakeaways || []),
      ...(unit.bullets.length >= 2 ? unit.bullets : unit.sentences),
    ]),
  )
    .filter((t) => t && t.trim().length > 12)
    .slice(0, 4)
    .map((t) => t.trim().slice(0, 165));

  const qSentence = unit.sentences[0] || unit.paragraphs[0] || '';
  const primarySectionTerm = sectionTerms[0] || keyTerms[index % Math.max(1, keyTerms.length)];
  const builtCheckpoint = primarySectionTerm
    ? buildValidConceptPinnedQuestion({
        term: primarySectionTerm.term,
        definition: primarySectionTerm.definition,
        sectionHeading: heading,
        pageRange,
        otherTerms: keyTerms.filter((k) => k.term !== primarySectionTerm.term),
        seedIndex: index,
      })
    : null;

  const commonPitfalls: string[] = [];
  if (sectionTerms.length >= 2) {
    commonPitfalls.push(
      `**${sectionTerms[0].term}** ile **${sectionTerms[1].term}** kapsamını karıştırmayın: sınav sorularında neden–sonuç yönü ve sınır koşulları özellikle ayırt edicidir.`,
    );
  }
  const exceptionSent = unit.sentences.find((s) => /\b(istisna|hariç|olmazsa|aksi\s+halde|değildir)\b/i.test(s));
  if (exceptionSent) {
    commonPitfalls.push(`Dikkat edilecek istisna/sınır: "${exceptionSent.slice(0, 165)}"`);
  }

  const relatedTerms = sectionTerms.map((t) => t.term).slice(0, 3);
  const deepResearchNote =
    deepResearch && relatedTerms.length > 0
      ? isVerbal
        ? `**[Derin Akademik Araştırma]** "${heading}" başlığı, ${course || 'ilgili ders'} literatüründe ${relatedTerms.join(', ')} eksenindeki kuramsal ve kurumsal gelişimi açıklar; sınav yorumlarında bu kavramların tarihsel/hukuki neden–sonuç bağını birlikte kurmak tam puan getirir.`
        : `**[Derin Akademik Araştırma]** "${heading}" bölümü, ${relatedTerms.join(' ve ')} arasındaki analitik ve ampirik ilişkiyi inceleyerek kuramsal mekanizmayı somutlaştırır.`
      : undefined;

  return {
    index,
    heading,
    pageRange,
    content: bodyBlocks.join('\n\n') || unit.paragraphs.join('\n\n'),
    takeaways,
    deepResearchNote,
    commonPitfalls: commonPitfalls.slice(0, 2),
    checkpointQuestion: builtCheckpoint || undefined,
  };
}

/**
 * Formats an AI-failed or thin source excerpt into a structured university study section
 * so raw pasted text dumps never leak into generated summaries.
 */
export function formatSectionContentForFallback(params: {
  index: number;
  heading: string;
  pageRange?: string;
  rawSlice: string;
  focusPoints?: string[];
  course?: string;
  title?: string;
  deepResearch?: boolean;
}): SummarySection {
  const cleanSlice = normalizeSourceText(params.rawSlice || '');
  const sentences = splitIntoSentences(cleanSlice);
  const domain = classifyStudyDomain(cleanSlice, params.course, params.title);
  const keyTerms = extractKeyTerms(cleanSlice, sentences, params.course);

  const paragraphs: string[] = [];
  for (let i = 0; i < sentences.length; i += 3) {
    paragraphs.push(sentences.slice(i, i + 3).join(' '));
  }

  const unit: ParsedUnit = {
    heading: params.heading,
    pageRange: params.pageRange,
    paragraphs: paragraphs.length > 0 ? paragraphs : [cleanSlice.slice(0, 900)],
    sentences,
    bullets: (params.focusPoints || []).filter(Boolean),
    formulas: cleanSlice
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => /[=$\\]/.test(l) && l.length > 4 && l.length < 130)
      .slice(0, 3),
  };

  return buildRichSummarySection({
    index: params.index,
    heading: params.heading,
    pageRange: params.pageRange,
    unit,
    allSentences: sentences,
    keyTerms,
    domainMode: domain.mode,
    deepResearch: params.deepResearch,
    course: params.course,
    extraTakeaways: params.focusPoints,
  });
}

export function generateClientStudyMaterial(req: GeneratePayload): Record<string, unknown> {
  const cleanText = normalizeSourceText(req.noteContext || '');
  const title = req.noteTitle?.trim() || 'Çalışma Materyali';
  const course = req.course?.trim() || 'Akademik Ders';
  const domain = classifyStudyDomain(cleanText, course, title);
  const sentences = splitIntoSentences(cleanText);
  const keyTerms = extractKeyTerms(cleanText, sentences, course);

  const effectiveDepth =
    req.summaryDepth ||
    (req.detailLevel === 'concise'
      ? 'short'
      : req.detailLevel === 'textbook'
      ? 'textbook'
      : req.detailLevel === 'deep'
      ? 'comprehensive'
      : 'standard');

  // ---------------- QUIZ ----------------
  if (req.materialType === 'quiz') {
    const requested = Math.min(Math.max(req.questionCount || 6, 3), 25);
    const fmt = req.quizFormat || 'multiple_choice';
    const units = splitDocumentIntoUnits(cleanText, title, Math.max(4, Math.min(12, Math.ceil(sentences.length / 2))));
    const outlineHeadings = units.map((u) => u.heading);

    const rawCandidates = buildLocalQuizCandidates({
      units,
      keyTerms,
      sentences,
      title,
      course,
      quizFormat: fmt,
      generationNonce: req.generationNonce,
      preferredTopics: req.preferredTopics,
      requestedCount: requested,
    });

    const validated = validateQuizBatch(rawCandidates, {
      sourceText: cleanText,
      course,
      title,
      outlineHeadings,
      requestedCount: requested,
      requestedDifficulty: req.difficulty || 'mixed',
      sourceFingerprint: req.sourceFingerprint,
      historyEntries: req.avoidHistory,
    });

    const finalQuestions = [...validated.accepted];

    // If a very tiny source has fewer than `requested` unique MC items after history exclusion,
    // add distinct open-ended analytical questions (never repeating or fabricating broken options)
    if (finalQuestions.length < requested) {
      const rotatedUnits = rotateArrayBySeed(units, `${req.generationNonce || 'fill'}:open`);
      for (let i = 0; i < rotatedUnits.length && finalQuestions.length < requested; i++) {
        const u = rotatedUnits[i];
        const refSent = u.sentences[0] || sentences[i % Math.max(1, sentences.length)] || title;
        const candidateOpen: QuizQuestion = {
          type: 'short_answer',
          question: `"${u.heading}" bölümündeki temel ilkeyi ve bu mekanizmanın ${course} açısından doğurduğu sonucu açıklayınız.`,
          options: [],
          sampleAnswer: cleanCompleteSentence(refSent, 220),
          rubric: [
            `${u.heading} kavramının doğru biçimde tanımlanması`,
            'Kaynak nottaki neden-sonuç veya uygulama ilişkisinin belirtilmesi',
          ],
          explanation: `Kaynak metne (${u.heading}${u.pageRange ? `, ${u.pageRange}` : ''}) göre: ${cleanCompleteSentence(refSent, 220)}`,
          topic: u.heading,
          sourceSection: u.heading,
          sourcePage: u.pageRange,
          difficulty: 'medium',
          bloomLevel: 'Yorumlama ve Uygulama',
        };
        const check = validateQuizBatch([candidateOpen], {
          sourceText: cleanText,
          course,
          title,
          outlineHeadings,
          requestedCount: requested,
          requestedDifficulty: req.difficulty || 'mixed',
          sourceFingerprint: req.sourceFingerprint,
          historyEntries: req.avoidHistory,
          alreadyAccepted: finalQuestions,
          strictSourceGrounding: false,
        });
        if (check.accepted.length > finalQuestions.length) {
          finalQuestions.push(check.accepted[check.accepted.length - 1]);
        }
      }
    }

    const quotaUsed = computeDifficultyQuota(finalQuestions.length || 1, req.difficulty || 'mixed');
    return {
      questions: finalQuestions.slice(0, requested),
      extractionNotices: req.extractionWarnings?.length ? req.extractionWarnings : undefined,
      qualityReport: {
        ...validated.qualityReport,
        validatedCount: finalQuestions.slice(0, requested).length,
      },
      metadata: {
        sourceMode: 'local',
        deepResearch: Boolean(req.deepResearch),
        sourceFingerprint: req.sourceFingerprint,
        difficultyQuotaTarget: quotaUsed,
      },
    };
  }

  // ---------------- FLASHCARDS ----------------
  if (req.materialType === 'flashcards') {
    const requested = Math.min(Math.max(req.cardCount || 6, 4), 32);
    const units = splitDocumentIntoUnits(cleanText, title, Math.max(4, Math.min(12, Math.ceil(sentences.length / 2))));
    const outlineHeadings = units.map((u) => u.heading);
    const nonce = req.generationNonce || 'default';

    const rawCards: FlashcardItem[] = [];
    const rotatedTerms = rotateArrayBySeed(keyTerms, `${nonce}:fc-terms`);
    const rotatedUnits = rotateArrayBySeed(units, `${nonce}:fc-units`);

    for (let i = 0; i < rotatedTerms.length; i++) {
      const kt = rotatedTerms[i];
      const hostUnit = units.find((u) =>
        u.sentences.some((s) => s.toLocaleLowerCase('tr-TR').includes(kt.term.toLocaleLowerCase('tr-TR'))),
      );
      rawCards.push({
        front: `${kt.term} kavramının temel tanımı ve ${hostUnit?.heading || title} kapsamındaki işlevi nedir?`,
        back: kt.formula ? `${cleanCompleteSentence(kt.definition, 210)}\n\nFormül: $${kt.formula}$` : cleanCompleteSentence(kt.definition, 210),
        hint: `${kt.term} anahtar kavramı`,
        topic: hostUnit?.heading || kt.term,
        sourceSection: hostUnit?.heading,
        sourcePage: hostUnit?.pageRange,
        difficulty: i % 3 === 0 ? 'easy' : i % 3 === 1 ? 'medium' : 'hard',
      });
    }

    // Add comparative & mechanism cards across units (zero ugly "(#1): ..." raw truncation fronts!)
    if (rotatedTerms.length >= 2) {
      for (let i = 0; i < Math.min(4, rotatedTerms.length - 1); i++) {
        const a = rotatedTerms[i];
        const b = rotatedTerms[i + 1];
        rawCards.push({
          front: `"${a.term}" ile "${b.term}" kavramları hangi temel yönlerden ayrılır?`,
          back: `${a.term}: ${cleanCompleteSentence(a.definition, 120)} Buna karşılık ${b.term}: ${cleanCompleteSentence(b.definition, 120)}`,
          hint: 'Kavram karşılaştırması',
          topic: course,
          difficulty: 'hard',
        });
      }
    }

    for (let i = 0; i < rotatedUnits.length; i++) {
      const u = rotatedUnits[i];
      const coreSent = u.sentences.find((s) => !GREETING_RE.test(s) && s.length >= 28);
      if (!coreSent) continue;
      rawCards.push({
        front: `"${u.heading}" konusunda kaynak notun vurguladığı temel mekanizma veya ilke nedir?`,
        back: cleanCompleteSentence(coreSent, 220),
        hint: u.pageRange ? `${u.heading} (${u.pageRange})` : u.heading,
        topic: u.heading,
        sourceSection: u.heading,
        sourcePage: u.pageRange,
        difficulty: i % 2 === 0 ? 'medium' : 'easy',
      });
    }

    const validatedCards = validateFlashcardsBatch(rawCards, {
      sourceText: cleanText,
      course,
      title,
      outlineHeadings,
      requestedCount: requested,
      sourceFingerprint: req.sourceFingerprint,
      historyEntries: req.avoidFlashcardHistory,
    });

    const cards = [...validatedCards.accepted];
    if (cards.length < requested) {
      for (const fallbackCard of rawCards) {
        if (cards.length >= requested) break;
        if (!cards.some((c) => normalizeForComparison(c.front) === normalizeForComparison(fallbackCard.front))) {
          cards.push(fallbackCard);
        }
      }
    }

    return {
      cards: cards.slice(0, requested),
      extractionNotices: req.extractionWarnings?.length ? req.extractionWarnings : undefined,
      metadata: {
        sourceMode: 'local',
        deepResearch: Boolean(req.deepResearch),
        sourceFingerprint: req.sourceFingerprint,
      },
    };
  }

  // ---------------- VIDEO ----------------
  if (req.materialType === 'video') {
    let units = splitDocumentIntoUnits(cleanText, title, 7).filter(
      (u) =>
        u.sentences.some((st) => !GREETING_RE.test(st)) ||
        u.bullets.length > 0,
    );
    if (units.length < 4 && sentences.length >= 6) {
      const target = Math.min(6, Math.max(4, Math.floor(sentences.length / 2)));
      const per = Math.max(1, Math.ceil(sentences.length / target));
      units = Array.from({ length: target }, (_, i) => {
        const sents = sentences.slice(i * per, (i + 1) * per).filter(Boolean);
        const hWords = (sents[0] || '').split(/\s+/).slice(0, 5).join(' ').replace(/[,.;:!?]$/, '');
        return {
          heading: units[i]?.heading || (hWords ? `${title}: ${hWords}` : `${title} — Bölüm ${i + 1}`),
          pageRange: units[i]?.pageRange,
          paragraphs: [sents.join(' ')],
          bullets: units[i]?.bullets || [],
          formulas: units[i]?.formulas || [],
          sentences: sents.length > 0 ? sents : [sentences[i % sentences.length]],
        };
      });
    }

    const lockedTheme = resolveVideoThemeForCourse(course, title, cleanText);
    const diagramPalette =
      lockedTheme === 'economics'
        ? (['visual', 'curve', 'table', 'shapes', 'scenario', 'comparison', 'network'] as const)
        : (['visual', 'table', 'timeline', 'comparison', 'structure', 'scenario', 'shapes'] as const);
    const badges = ['Temel Kavram', 'Mekanizma', 'Kritik Koşul', 'Sonuç'];

    const rawScenes = units.slice(0, 7).map((u, idx) => {
      const nonGreetingUnitSents = u.sentences.filter((st) => !GREETING_RE.test(st));
      const unitSents =
        nonGreetingUnitSents.length > 0
          ? nonGreetingUnitSents
          : u.sentences.length > 0
          ? u.sentences
          : [`${u.heading} bölümü incelenmektedir.`];
      const hostTermObj =
        keyTerms.find((k) =>
          unitSents.some((s) => s.toLocaleLowerCase('tr-TR').includes(k.term.toLocaleLowerCase('tr-TR'))),
        ) || keyTerms[idx % Math.max(1, keyTerms.length)];
      const hostTerm = hostTermObj?.term || u.heading;

      const leadTurn = cleanCompleteSentence(unitSents[0] || `${u.heading} temel çerçevesini oluşturur.`, 240);
      const deepTurn = cleanCompleteSentence(
        unitSents.slice(1, 3).join(' ') ||
          (hostTermObj ? hostTermObj.definition : `${hostTerm} üzerinden neden-sonuç ilişkisi bu mekanizmada belirleyicidir.`),
        260,
      );
      const turns = [
        { speaker: 'Deniz' as const, text: leadTurn },
        {
          speaker: 'Barış' as const,
          text: `Deniz hocam, ${u.heading} kapsamında "${hostTerm}" kavramı nasıl bir mekanizma veya sonuç ortaya çıkarıyor?`,
        },
        { speaker: 'Deniz' as const, text: deepTurn },
      ];
      const narration = turns.map((t) => t.text).join(' ');

      const facetSources = [...unitSents, ...(u.bullets.length > 0 ? u.bullets : []), ...sentences].filter(
        (st) => st && !GREETING_RE.test(st),
      );
      const nodes = Array.from({ length: Math.min(4, Math.max(3, facetSources.length)) }, (_, ni) => {
        const rawSent = cleanCompleteSentence(facetSources[ni % facetSources.length] || u.heading, 128);
        const colonParts = rawSent.split(/[:–—]/);
        const labelCandidate =
          colonParts.length >= 2 && colonParts[0].trim().length <= 34
            ? colonParts[0].trim()
            : rawSent.split(/\s+/).slice(0, 3).join(' ').replace(/[,.;:!?]$/, '');
        return {
          label: labelCandidate || `${u.heading.slice(0, 24)} ${ni + 1}`,
          subtext: rawSent,
          badge: badges[ni % badges.length],
        };
      });

      const examTip = cleanCompleteSentence(
        unitSents.length > 1
          ? unitSents[1]
          : `${u.heading} konusunda ${nodes[0]?.label || hostTerm} ile sonucu arasındaki ayrımı netleştirin.`,
        170,
      );

      const validCp = hostTermObj
        ? buildValidConceptPinnedQuestion({
            term: hostTermObj.term,
            definition: hostTermObj.definition,
            sectionHeading: u.heading,
            pageRange: u.pageRange,
            otherTerms: keyTerms.filter((k) => k.term !== hostTermObj.term),
            seedIndex: idx,
          })
        : null;

      return {
        id: `scene-${idx + 1}`,
        order: idx + 1,
        title: u.heading,
        turns,
        narration,
        diagramData: {
          diagramType: diagramPalette[idx % diagramPalette.length],
          visualTheme: lockedTheme,
          mainTitle: u.heading,
          highlightMetric: examTip,
          nodes,
        },
        keyTakeaways: nodes.slice(0, 3).map((nd) => `${nd.label}: ${nd.subtext}`),
        keyTerms: keyTerms.slice(idx, idx + 3).map((k) => ({ term: k.term, definition: k.definition })),
        examTip,
        checkpointQuestion: validCp || undefined,
      };
    });

    const rawVideoPayload = {
      videoTitle: title,
      outline: sentences.slice(0, 3).join(' ') || `${course} — ${title} etkileşimli video dersi.`,
      overview: sentences.slice(0, 2).join(' ') || `${course} — ${title} etkileşimli video dersi.`,
      videoScript: rawScenes.map((s) => s.narration).join('\n\n'),
      totalEstimatedDurationSec: rawScenes.length * 60,
      scenes: rawScenes,
      keyFacts: sentences.slice(0, 5),
      keyTerms: keyTerms.slice(0, 8),
      extractionNotices: req.extractionWarnings?.length ? req.extractionWarnings : undefined,
      metadata: {
        sourceMode: 'local',
        sourceFingerprint: req.sourceFingerprint,
      },
    };

    return (
      validateAndRepairVideoContent(rawVideoPayload, {
        sourceText: cleanText,
        course,
        title,
        outlineHeadings: units.map((u) => u.heading),
        extractionWarnings: req.extractionWarnings,
        sourceFingerprint: req.sourceFingerprint,
      }) || rawVideoPayload
    );
  }

  // ---------------- SUMMARY ----------------
  const displayCourseTag =
    req.course && req.course.trim().length > 1 && req.course.trim() !== 'Akademik Ders'
      ? req.course.trim()
      : domain.detectedCourse || domain.discipline;

  const detectedPageMarkers = (cleanText.match(/---\s*(?:Sayfa|Slayt)\s+\d+\s*---/gi) || []).length;
  const totalWords = cleanText.split(/\s+/).filter(Boolean).length;
  const estimatedPages = Math.max(
    req.totalPagesOrSlides || 0,
    detectedPageMarkers,
    Math.max(1, Math.ceil(totalWords / 260)),
  );
  const summaryPlan = computeDynamicSummaryPlan({
    totalWords,
    totalPagesOrSlides: estimatedPages,
    summaryDepth: effectiveDepth,
    examMode: req.examMode,
  });
  const disciplineGuidance = getDisciplineSummaryGuidance(displayCourseTag, domain.mode);
  const scaledKeyTerms = extractKeyTerms(cleanText, sentences, course, summaryPlan.targetKeyTerms);
  const effectiveKeyTerms = scaledKeyTerms.length >= keyTerms.length ? scaledKeyTerms : keyTerms;

  const isLargeLocalDoc = summaryPlan.tier === 'large' || summaryPlan.tier === 'massive' || cleanText.length >= 16_000;
  const units = splitDocumentIntoUnits(cleanText, title, summaryPlan.targetSectionCount);

  const sections = units.map((u, idx) =>
    buildRichSummarySection({
      index: idx,
      heading: u.heading,
      pageRange: u.pageRange,
      unit: u,
      allSentences: sentences,
      keyTerms: effectiveKeyTerms,
      domainMode: domain.mode,
      disciplineFamily: disciplineGuidance.disciplineFamily,
      deepResearch: req.deepResearch,
      course: displayCourseTag,
    }),
  );

  const isVerbal = domain.mode === 'verbal' || disciplineGuidance.disciplineFamily === 'law';
  const comparativeMatrix =
    effectiveKeyTerms.length >= 2
      ? {
          title: `${title} — ${
            disciplineGuidance.disciplineFamily === 'law'
              ? 'Hukuki Kurumlar, Şartlar ve Ayrımlar Matrisi'
              : disciplineGuidance.disciplineFamily === 'economics'
              ? 'İktisadi Kavram, Teori ve Mekanizma Karşılaştırma Matrisi'
              : disciplineGuidance.disciplineFamily === 'statistics'
              ? 'İstatistiksel Ölçüt, Test ve Dağılım Karşılaştırma Matrisi'
              : isVerbal
              ? 'Kavram, Yaklaşım ve Ayrım Matrisi'
              : 'Kavram & Analiz Matrisi'
          }`,
          columns: isVerbal
            ? ['Kavram / İlke', 'Temel Tanım & Kapsam', 'Sınavda Ayırt Edici Nokta']
            : ['Kavram / Başlık', 'Kaynak Notlardaki Tanım & İşlev', 'Analitik Odak'],
          rows: effectiveKeyTerms
            .slice(0, Math.min(10, Math.max(6, Math.ceil(sections.length * 0.6))))
            .map((kt) => [kt.term, kt.definition.slice(0, 150), classifyClauseBadge(kt.definition)]),
        }
      : undefined;

  const focusModeLabel =
    disciplineGuidance.disciplineFamily === 'law'
      ? 'Hukuk & Mevzuat Analitik Sentezi'
      : disciplineGuidance.disciplineFamily === 'economics'
      ? 'İktisat & Kuramsal Analiz Sentezi'
      : disciplineGuidance.disciplineFamily === 'statistics'
      ? 'İstatistik & Sayısal Yöntem Sentezi'
      : isVerbal
      ? 'Sözel & Kuramsal Derin Sentez'
      : 'Analitik Akademik Sentez';
  const synthLead = `**${title}** (${displayCourseTag} · ${focusModeLabel}) dokümanı yaklaşık **${estimatedPages} sayfa/slayt** kapsamıyla **${sections.length} ana bölümde** sistemleştirilmiştir; temel kavramları, konu akışını ve sınavlarda öne çıkan ayrımları kapsar.`;
  const coreThesis =
    sentences.length > 0 ? sentences.slice(0, 3).join(' ') : cleanText.slice(0, 480);
  const overviewText = `${synthLead}\n\n${coreThesis}`.trim();

  const deepResearchTopics =
    req.deepResearch && effectiveKeyTerms.length >= 2
      ? effectiveKeyTerms.slice(0, 4).map((kt) => ({
          topic: `${kt.term} — Kuramsal ve Sınav Bağlamı`,
          literatureContext: `${kt.term}, "${title}" metninde ${kt.definition.slice(0, 140)} ekseninde konumlanır.`,
          realWorldApplication: isVerbal
            ? 'Klasik veya yorum sorularında bu kavramın ortaya çıkış gerekçesi, karşıt görüşlerle farkı ve kurumsal yansıması birlikte tartışılmalıdır.'
            : 'Kuramsal varsayımlar ile uygulamalı politika veya sayısal model çıktıları arasındaki ilişkiyi test eden sorularda belirleyicidir.',
        }))
      : [];

  const teacherEmphasis = effectiveKeyTerms.slice(0, Math.min(8, Math.max(5, Math.ceil(sections.length * 0.5)))).map(
    (kt, idx) => ({
      point: kt.term,
      whyImportant: isVerbal
        ? `Kavramsal sınır ve karşıt yaklaşımlarla farkı üzerinden klasik/test sorusu potansiyeli taşır: "${kt.definition.slice(0, 140)}"`
        : kt.definition.slice(0, 160),
      examProbability: idx < 3 ? 'Yüksek' : 'Orta',
    }),
  );

  // 8. Ezberlenecek Bilgiler vs. Yorumlanacak Bilgiler (disipline uyarlı)
  const memorizeItems = [
    ...effectiveKeyTerms
      .slice(0, 5)
      .map((kt) => `**${kt.term}:** ${kt.definition.slice(0, 140)}`),
    ...(!isVerbal
      ? units
          .flatMap((u) => u.formulas)
          .slice(0, 2)
          .map((f) => `**Kaynak Formül / İlişki:** ${f.slice(0, 120)}`)
      : []),
  ].slice(0, 6);

  const interpretSentences = sentences.filter((s) => CAUSAL_CONTRAST_RE.test(s));
  const interpretItems = (
    interpretSentences.length >= 3
      ? interpretSentences.slice(0, 5)
      : sections.slice(0, 5).map(
          (s) =>
            `"${s.heading}" bölümündeki temel kavramların neden–sonuç ilişkilerini ve diğer bölümlerle bağlantısını yorumlayabilme.`,
        )
  ).map((item) => item.slice(0, 190));

  const memorizeVsInterpret =
    memorizeItems.length > 0 || interpretItems.length > 0
      ? {
          memorize: memorizeItems,
          interpret: interpretItems,
        }
      : undefined;

  // 9. Konu Değerlendirmesi (bütüncül kapanış)
  const headingTrail = sections
    .slice(0, 6)
    .map((s) => s.heading)
    .join(' → ');
  const summarySynthesis = `**${title}** (${displayCourseTag}) belgesi ${
    sections.length
  } bütünleşik bölümde (${headingTrail}${
    sections.length > 6 ? ' ve devamı' : ''
  }) ele alınmıştır. Sınava hazırlanırken önce **Ezberlenecek Bilgiler** kısmındaki temel tanım, ${
    disciplineGuidance.disciplineFamily === 'law'
      ? 'kurucu unsur, kanun şartı ve süreleri'
      : disciplineGuidance.disciplineFamily === 'statistics'
      ? 'formül, dağılım varsayımı ve karar kurallarını'
      : 'teori, denklem sembolü ve sınıflandırmaları'
  } netleştirin; ardından **Yorumlanacak Bilgiler** ve karşılaştırma matrisi üzerinden neden–sonuç ilişkileri ile kavram ayrımlarını pekiştirin.`;

  const disciplineTag = isVerbal ? `${displayCourseTag} · Sözel Özet` : displayCourseTag;
  const finalKeyTerms = effectiveKeyTerms.slice(0, summaryPlan.targetKeyTerms);
  const studyPriorityMap = buildTopicPriorityGuide({
    sections,
    keyTerms: finalKeyTerms,
    teacherEmphasis,
    overview: overviewText,
    disciplineTag,
  });

  return {
    overview: overviewText,
    disciplineTag,
    extractionNotices: req.extractionWarnings?.length ? req.extractionWarnings : undefined,
    keyPoints: (sentences.length > 0 ? sentences : [title])
      .slice(0, summaryPlan.targetKeyPoints)
      .map((s) =>
        highlightKeyTermsInProse(
          s.slice(0, 210),
          finalKeyTerms.slice(0, 4).map((k) => k.term),
        ),
      ),
    sections,
    teacherEmphasis,
    comparativeMatrix,
    deepResearchTopics,
    keyTerms: finalKeyTerms,
    memorizeVsInterpret,
    summarySynthesis,
    studyPriorityMap,
    studyChecklist: sections.map((s) =>
      isVerbal
        ? `"${s.heading}" bölümündeki temel kavramları, neden–sonuç zincirini ve karşıt görüş farklarını kendi cümlelerimle özetleyebilirim.`
        : `"${s.heading}" bölümünün ana fikirlerini, mekanizmasını ve ayırt edici koşullarını açıklayabilirim.`,
    ),
    metadata: {
      sourceMode: 'local',
      deepResearch: Boolean(req.deepResearch),
      summaryDepth: effectiveDepth,
      examMode: req.examMode,
      isLargeBundle: isLargeLocalDoc,
      sourceStats: {
        sourceCount: 1,
        wordCount: totalWords,
        pagesOrSlides: estimatedPages,
        sectionCount: sections.length,
      },
    },
  };
}
