/**
 * EconNotes Study Quality, Semantic Deduplication, History & Alignment Engine
 *
 * Architectural core guaranteeing:
 * 1. Exact + semantic deduplication (intra-batch and across repeated exams per user/source)
 * 2. Persistent per-user / per-source question & flashcard history + rotated topic coverage
 * 3. Automated 7-point quiz validation gate (source grounding, single-answer integrity,
 *    answer-explanation consistency, distractor sanity, non-duplication, stem clarity, Bloom/difficulty)
 * 4. Balanced 30% easy / 40% medium / 30% hard cognitive difficulty quotas
 * 5. Video lesson source verification, course-locked visual themes, narration<->visual<->subtitle sync
 */

import { detectCourseIdentity, foldTurkishToAscii } from '@/lib/courseDetector';
import type {
  DifficultyLevel,
  FlashcardItem,
  QuizQualityReport,
  QuizQuestion,
  StudyMaterial,
} from '@/types/study';

export type CognitiveDifficulty = 'easy' | 'medium' | 'hard';

export type VideoVisualTheme =
  | 'economics'
  | 'history'
  | 'law'
  | 'politics'
  | 'medicine'
  | 'engineering'
  | 'education'
  | 'sports'
  | 'agriculture'
  | 'science'
  | 'society';

export type VideoDiagramType =
  | 'visual'
  | 'shapes'
  | 'table'
  | 'chart'
  | 'scenario'
  | 'timeline'
  | 'comparison'
  | 'structure'
  | 'network'
  | 'curve';

export interface DifficultyQuota {
  easy: number;
  medium: number;
  hard: number;
}

export interface QuestionHistoryEntry {
  id: string;
  sourceFingerprint: string;
  course: string;
  topic: string;
  sourceSection?: string;
  conceptKey: string;
  stemPreview: string;
  stemNormalized: string;
  stemTokens: string[];
  answerTokens: string[];
  createdAt: string;
}

export interface FlashcardHistoryEntry {
  id: string;
  sourceFingerprint: string;
  topic: string;
  conceptKey: string;
  frontPreview: string;
  frontTokens: string[];
  backTokens: string[];
  createdAt: string;
}

export interface SourceSectionAnchor {
  heading: string;
  pageHint?: string;
  text: string;
  tokenSet: Set<string>;
}

export interface RejectedQuizItem {
  question: string;
  reasons: string[];
}

export interface QuizValidationResult {
  accepted: QuizQuestion[];
  rejected: RejectedQuizItem[];
  missingCount: number;
  missingDifficulties: DifficultyQuota;
  difficultyBreakdown: DifficultyQuota;
  uncoveredTopics: string[];
  historyExcludedCount: number;
  qualityReport: QuizQualityReport;
}

export interface FlashcardValidationResult {
  accepted: FlashcardItem[];
  rejectedCount: number;
  historyExcludedCount: number;
  missingCount: number;
}

export interface AvoidanceAndRotationPlan {
  priorityTopics: string[];
  avoidSummaries: string[];
  historyEntries: QuestionHistoryEntry[];
  topicUsageCounts: Record<string, number>;
}

const HISTORY_STORAGE_PREFIX = 'econnotes_qhist_v1:';
const FLASHCARD_HISTORY_PREFIX = 'econnotes_fhist_v1:';
const MAX_STORED_HISTORY = 140;

const TR_STOPWORDS = new Set([
  've', 'veya', 'ile', 'icin', 'gibi', 'olan', 'olarak', 'bir', 'bu', 'su', 'o',
  'da', 'de', 'ki', 'mi', 'mu', 'ancak', 'fakat', 'lakin', 'cunku', 'dolayi',
  'uzerine', 'gore', 'kadar', 'daha', 'en', 'cok', 'az', 'her', 'bazi', 'tum',
  'butun', 'kendi', 'hem', 'ya', 'ne', 'nasil', 'neden', 'hangi', 'hangisi',
  'hangisidir', 'hangileri', 'asagidakilerden', 'asagidaki', 'yukaridaki',
  'tarafindan', 'arasinda', 'hakkinda', 'icinde', 'sonra', 'once', 'uzere',
  'boylece', 'ise', 'var', 'yok', 'ayrica', 'dolayisiyla', 'sekilde', 'durumda',
  'yonelik', 'ilgili', 'kapsaminda', 'acisindan', 'ortaya', 'vardir', 'oldugu',
  'edilir', 'yapilir', 'saglar', 'bulunur', 'olur', 'olabilir', 'olanlar',
  'bununla', 'birlikte', 'genellikle', 'ornegin', 'ozellikle', 'ifadelerden',
  'ifadesi', 'dogrudur', 'yanlistir', 'soylenemez', 'degildir', 'kavram',
  'kavrami', 'ders', 'notu', 'notuna', 'metne', 'metinde', 'bolum', 'sayfa',
  'slayt', 'konu', 'soru', 'the', 'and', 'for', 'with', 'that', 'this', 'from',
]);

const GREETING_FILLER_RE =
  /^\s*(?:merhaba|hos\s+geldiniz|selam|gunaydin|iyi\s+gunler|bugunku\s+dersimizde|sevgili\s+arkadaslar|akilli\s+tahtamizda|harika\s+bir\s+soru)\b/i;

const BROKEN_META_DISTRACTOR_RE =
  /(?:farkli\s+baglam|alternatif\s+yorum\s+\d+|ders\s+notunun\s+kapsami\s+disinda|metinde\s+belirtilen\s+temel\s+varsayimlarla\s+ortusmez|yalnizca\s+tek\s+bir\s+dis\s+faktore\s+indirgenir|temel\s+kavram\s+\d+)/i;

const NEGATIVE_STEM_RE =
  /(?:yanlistir|soylenemez|degildir|cikarilamaz|beklenmez|yer\s+almaz|kapsaminda\s+degil|dogru\s+degil|uygun\s+degil|celisir|istisnasidir|hangisi\s+olamaz)/i;

const HARD_COGNITIVE_RE =
  /(?:karsilastir|farki|ayrim|aksine|celisir|yanlistir|soylenemez|degildir|cikarilamaz|hangi\s+kosul|varsayim|bozulursa|senaryo|uzun\s+donem|kisa\s+donem|birlikte\s+degerlendir|hangisi\s+beklenmez|en\s+temel\s+neden|analiz|sentez)/i;

const MEDIUM_COGNITIVE_RE =
  /(?:nasil\s+etkiler|hangi\s+sonuc|yol\s+acar|neden\s+olur|artarsa|azalirsa|yukselirse|duserse|uygulandiginda|hesaplan|yorumlan|araciligiyla|ornek|hangisi\s+gerceklesir|hangi\s+durumda|mekanizma|isleyis|etkisi)/i;

const EASY_COGNITIVE_RE =
  /(?:nedir|ne\s+ad\s+verilir|olarak\s+tanimlanir|ifade\s+eder|kurucusu|temel\s+amaci|bos\s+birakilan|hangi\s+kavram|asagidakilerden\s+hangisidir|tanim)/i;

function safeLocalStorage(): Storage | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
  } catch {
    // Ignore SSR / test / privacy mode errors
  }
  return null;
}

export function hashCompact(input: string): string {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

export function normalizeForComparison(text: string): string {
  return foldTurkishToAscii(String(text || ''))
    .replace(/\$[^$]*\$/g, (m) => m.replace(/[^a-z0-9=+\-*/^]/g, ' '))
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractContentTokens(text: string): string[] {
  const norm = normalizeForComparison(text);
  if (!norm) return [];
  const tokens: string[] = [];
  const seen = new Set<string>();
  for (const raw of norm.split(' ')) {
    if (raw.length < 3 || TR_STOPWORDS.has(raw)) continue;
    if (/^\d+$/.test(raw) && raw.length < 3) continue;
    if (!seen.has(raw)) {
      seen.add(raw);
      tokens.push(raw);
    }
  }
  return tokens;
}

/**
 * Expands Turkish tokens with 5-6 char root prefixes so agglutinative inflections
 * (e.g. "enflasyonu" <-> "enflasyon", "sozlesmenin" <-> "sozlesme") match accurately.
 */
export function buildTurkishStemSet(tokens: Iterable<string>): Set<string> {
  const set = new Set<string>();
  for (const t of tokens) {
    if (!t || t.length < 3) continue;
    set.add(t);
    if (t.length >= 6) {
      set.add(t.slice(0, 6));
      set.add(t.slice(0, 5));
    } else if (t.length === 5) {
      set.add(t.slice(0, 4));
    }
  }
  return set;
}

export function buildCharShingles(text: string, n = 4): Set<string> {
  const compact = normalizeForComparison(text).replace(/\s+/g, ' ');
  const out = new Set<string>();
  if (compact.length < n) {
    if (compact) out.add(compact);
    return out;
  }
  for (let i = 0; i <= compact.length - n; i++) {
    out.add(compact.slice(i, i + n));
  }
  return out;
}

export function jaccardSetSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  const [smaller, larger] = a.size <= b.size ? [a, b] : [b, a];
  for (const item of smaller) {
    if (larger.has(item)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export function tokenOverlapRatio(queryTokens: string[], targetStemSet: Set<string>): {
  ratio: number;
  matchedCount: number;
} {
  if (queryTokens.length === 0 || targetStemSet.size === 0) {
    return { ratio: 0, matchedCount: 0 };
  }
  let matched = 0;
  for (const tok of queryTokens) {
    if (
      targetStemSet.has(tok) ||
      (tok.length >= 6 && (targetStemSet.has(tok.slice(0, 6)) || targetStemSet.has(tok.slice(0, 5)))) ||
      (tok.length === 5 && targetStemSet.has(tok.slice(0, 4)))
    ) {
      matched++;
    }
  }
  return { ratio: matched / queryTokens.length, matchedCount: matched };
}

export function computeConceptKey(questionText: string, topic?: string, answerText?: string): string {
  const topicTokens = extractContentTokens(topic || '').slice(0, 3);
  const ansTokens = extractContentTokens(answerText || '').slice(0, 4);
  const stemTokens = extractContentTokens(questionText).slice(0, 4);
  const combined = Array.from(new Set([...topicTokens, ...ansTokens, ...stemTokens]))
    .slice(0, 5)
    .map((t) => (t.length >= 6 ? t.slice(0, 6) : t))
    .sort()
    .join('_');
  return combined || `concept_${hashCompact(questionText)}`;
}

export function getCorrectAnswerText(q: Pick<QuizQuestion, 'type' | 'options' | 'correctIndex' | 'sampleAnswer'>): string {
  if (q.type === 'short_answer') {
    return String(q.sampleAnswer || '');
  }
  if (Array.isArray(q.options) && typeof q.correctIndex === 'number' && q.options[q.correctIndex]) {
    return String(q.options[q.correctIndex]);
  }
  return '';
}

export function computeQuestionSemanticSimilarity(
  a: {
    stemNormalized: string;
    stemTokens: string[];
    answerTokens: string[];
    conceptKey?: string;
  },
  b: {
    stemNormalized: string;
    stemTokens: string[];
    answerTokens: string[];
    conceptKey?: string;
  },
): { score: number; isDuplicate: boolean; reason?: string } {
  if (!a.stemNormalized || !b.stemNormalized) {
    return { score: 0, isDuplicate: false };
  }
  if (a.stemNormalized === b.stemNormalized) {
    return { score: 1, isDuplicate: true, reason: 'exact_stem_match' };
  }
  if (
    a.stemNormalized.length >= 24 &&
    b.stemNormalized.length >= 24 &&
    (a.stemNormalized.includes(b.stemNormalized) || b.stemNormalized.includes(a.stemNormalized))
  ) {
    return { score: 0.92, isDuplicate: true, reason: 'stem_containment' };
  }

  const aStemSet = buildTurkishStemSet(a.stemTokens);
  const bStemSet = buildTurkishStemSet(b.stemTokens);
  const stemTokenSim = jaccardSetSimilarity(aStemSet, bStemSet);

  const aShingles = buildCharShingles(a.stemNormalized, 4);
  const bShingles = buildCharShingles(b.stemNormalized, 4);
  const shingleSim = jaccardSetSimilarity(aShingles, bShingles);

  const aAnsSet = buildTurkishStemSet(a.answerTokens);
  const bAnsSet = buildTurkishStemSet(b.answerTokens);
  const answerSim = jaccardSetSimilarity(aAnsSet, bAnsSet);

  const combined = stemTokenSim * 0.44 + shingleSim * 0.24 + answerSim * 0.32;

  if (stemTokenSim >= 0.56) {
    return { score: Math.max(combined, stemTokenSim), isDuplicate: true, reason: 'high_stem_token_similarity' };
  }
  if (shingleSim >= 0.62) {
    return { score: Math.max(combined, shingleSim), isDuplicate: true, reason: 'near_identical_paraphrase' };
  }
  if (combined >= 0.52) {
    return { score: combined, isDuplicate: true, reason: 'semantic_duplicate' };
  }
  if (
    a.conceptKey &&
    b.conceptKey &&
    a.conceptKey === b.conceptKey &&
    (answerSim >= 0.5 || stemTokenSim >= 0.38)
  ) {
    return { score: Math.max(combined, 0.65), isDuplicate: true, reason: 'same_concept_and_answer' };
  }
  if (answerSim >= 0.72 && stemTokenSim >= 0.32) {
    return { score: Math.max(combined, 0.64), isDuplicate: true, reason: 'same_target_fact' };
  }

  return { score: combined, isDuplicate: false };
}

export function questionToHistoryEntry(
  q: QuizQuestion,
  sourceFingerprint: string,
  course: string,
): QuestionHistoryEntry {
  const ans = getCorrectAnswerText(q);
  const stemNorm = normalizeForComparison(q.question);
  const stemTokens = extractContentTokens(q.question);
  const answerTokens = extractContentTokens(ans);
  const conceptKey = q.conceptKey || computeConceptKey(q.question, q.topic || q.sourceSection, ans);
  const id = q.id || `q_${hashCompact(`${sourceFingerprint}|${stemNorm}|${ans.slice(0, 40)}`)}`;

  return {
    id,
    sourceFingerprint,
    course,
    topic: String(q.topic || q.sourceSection || course || 'Genel').trim(),
    sourceSection: q.sourceSection,
    conceptKey,
    stemPreview: q.question.replace(/\s+/g, ' ').trim().slice(0, 120),
    stemNormalized: stemNorm,
    stemTokens: stemTokens.slice(0, 24),
    answerTokens: answerTokens.slice(0, 18),
    createdAt: new Date().toISOString(),
  };
}

export function loadSourceQuestionHistory(params: {
  userId?: string;
  sourceFingerprint?: string;
  course?: string;
  existingMaterials?: StudyMaterial[];
  previousQuestions?: QuizQuestion[];
}): QuestionHistoryEntry[] {
  const fp = params.sourceFingerprint || 'default';
  const entries: QuestionHistoryEntry[] = [];
  const seenIds = new Set<string>();

  const pushEntry = (entry: QuestionHistoryEntry) => {
    const key = entry.stemNormalized || entry.id;
    if (!key || seenIds.has(key)) return;
    seenIds.add(key);
    entries.push(entry);
  };

  // 1. Load persistent localStorage history scoped by userId + sourceFingerprint
  const storage = safeLocalStorage();
  if (storage && params.sourceFingerprint) {
    const storageKey = `${HISTORY_STORAGE_PREFIX}${params.userId || 'anon'}:${fp}`;
    try {
      const raw = storage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            if (item && typeof item.stemNormalized === 'string') {
              pushEntry(item as QuestionHistoryEntry);
            }
          }
        }
      }
    } catch {
      // ignore corrupted storage
    }
  }

  // 2. Merge questions from saved StudyMaterial rows matching this sourceFingerprint
  if (Array.isArray(params.existingMaterials)) {
    for (const mat of params.existingMaterials) {
      if (mat.material_type !== 'quiz') continue;
      const matFp =
        mat.content?.metadata?.sourceFingerprint ||
        (mat.exam_profile as Record<string, unknown> | null | undefined)?.sourceFingerprint;
      if (params.sourceFingerprint && matFp && matFp !== params.sourceFingerprint) continue;
      if (params.sourceFingerprint && !matFp && params.course && mat.course !== params.course) continue;
      const qs = Array.isArray(mat.content?.questions) ? mat.content.questions : [];
      for (const q of qs) {
        if (q?.question) {
          pushEntry(questionToHistoryEntry(q, fp, mat.course || params.course || 'Genel'));
        }
      }
    }
  }

  // 3. Merge explicit previousQuestions passed in settings
  if (Array.isArray(params.previousQuestions)) {
    for (const q of params.previousQuestions) {
      if (q?.question) {
        pushEntry(questionToHistoryEntry(q, fp, params.course || 'Genel'));
      }
    }
  }

  return entries.slice(0, MAX_STORED_HISTORY);
}

export function recordValidatedQuestionsToHistory(params: {
  userId?: string;
  sourceFingerprint?: string;
  course: string;
  questions: QuizQuestion[];
}): void {
  const storage = safeLocalStorage();
  if (!storage || !params.sourceFingerprint || params.questions.length === 0) return;
  const storageKey = `${HISTORY_STORAGE_PREFIX}${params.userId || 'anon'}:${params.sourceFingerprint}`;

  const existing = loadSourceQuestionHistory({
    userId: params.userId,
    sourceFingerprint: params.sourceFingerprint,
    course: params.course,
  });

  const merged: QuestionHistoryEntry[] = [];
  const seen = new Set<string>();
  const freshEntries = params.questions.map((q) =>
    questionToHistoryEntry(q, params.sourceFingerprint!, params.course),
  );

  for (const item of [...freshEntries, ...existing]) {
    if (!item.stemNormalized || seen.has(item.stemNormalized)) continue;
    seen.add(item.stemNormalized);
    merged.push(item);
    if (merged.length >= MAX_STORED_HISTORY) break;
  }

  try {
    storage.setItem(storageKey, JSON.stringify(merged));
  } catch {
    // quota ignored
  }
}

export function loadSourceFlashcardHistory(params: {
  userId?: string;
  sourceFingerprint?: string;
  previousFlashcards?: FlashcardItem[];
}): FlashcardHistoryEntry[] {
  const fp = params.sourceFingerprint || 'default';
  const entries: FlashcardHistoryEntry[] = [];
  const seen = new Set<string>();

  const pushCard = (entry: FlashcardHistoryEntry) => {
    const key = normalizeForComparison(entry.frontPreview);
    if (!key || seen.has(key)) return;
    seen.add(key);
    entries.push(entry);
  };

  const storage = safeLocalStorage();
  if (storage && params.sourceFingerprint) {
    const storageKey = `${FLASHCARD_HISTORY_PREFIX}${params.userId || 'anon'}:${fp}`;
    try {
      const raw = storage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            if (item && typeof item.frontPreview === 'string') {
              pushCard(item as FlashcardHistoryEntry);
            }
          }
        }
      }
    } catch {
      // ignore
    }
  }

  if (Array.isArray(params.previousFlashcards)) {
    for (const c of params.previousFlashcards) {
      if (!c?.front || !c?.back) continue;
      pushCard({
        id: c.id || `fc_${hashCompact(`${fp}|${c.front}`)}`,
        sourceFingerprint: fp,
        topic: c.topic || 'Genel',
        conceptKey: c.conceptKey || computeConceptKey(c.front, c.topic, c.back),
        frontPreview: c.front.slice(0, 120),
        frontTokens: extractContentTokens(c.front).slice(0, 20),
        backTokens: extractContentTokens(c.back).slice(0, 20),
        createdAt: new Date().toISOString(),
      });
    }
  }

  return entries.slice(0, MAX_STORED_HISTORY);
}

export function recordValidatedFlashcardsToHistory(params: {
  userId?: string;
  sourceFingerprint?: string;
  cards: FlashcardItem[];
}): void {
  const storage = safeLocalStorage();
  if (!storage || !params.sourceFingerprint || params.cards.length === 0) return;
  const storageKey = `${FLASHCARD_HISTORY_PREFIX}${params.userId || 'anon'}:${params.sourceFingerprint}`;

  const existing = loadSourceFlashcardHistory({
    userId: params.userId,
    sourceFingerprint: params.sourceFingerprint,
  });

  const fresh: FlashcardHistoryEntry[] = params.cards.map((c) => ({
    id: c.id || `fc_${hashCompact(`${params.sourceFingerprint}|${c.front}`)}`,
    sourceFingerprint: params.sourceFingerprint!,
    topic: c.topic || 'Genel',
    conceptKey: c.conceptKey || computeConceptKey(c.front, c.topic, c.back),
    frontPreview: c.front.slice(0, 120),
    frontTokens: extractContentTokens(c.front).slice(0, 20),
    backTokens: extractContentTokens(c.back).slice(0, 20),
    createdAt: new Date().toISOString(),
  }));

  const merged: FlashcardHistoryEntry[] = [];
  const seen = new Set<string>();
  for (const item of [...fresh, ...existing]) {
    const k = normalizeForComparison(item.frontPreview);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    merged.push(item);
    if (merged.length >= MAX_STORED_HISTORY) break;
  }

  try {
    storage.setItem(storageKey, JSON.stringify(merged));
  } catch {
    // ignore
  }
}

/**
 * Computes exact difficulty targets:
 * - 'mixed' -> ~30% easy (bilgi & kavrama), ~40% medium (yorumlama & uygulama), ~30% hard (analiz & karsilastirma)
 * - explicit easy/medium/hard -> 100% requested level
 */
export function computeDifficultyQuota(
  totalCount: number,
  requestedDifficulty: DifficultyLevel = 'mixed',
): DifficultyQuota {
  const safeTotal = Math.max(1, Math.round(totalCount));
  if (requestedDifficulty === 'easy') return { easy: safeTotal, medium: 0, hard: 0 };
  if (requestedDifficulty === 'medium') return { easy: 0, medium: safeTotal, hard: 0 };
  if (requestedDifficulty === 'hard') return { easy: 0, medium: 0, hard: safeTotal };

  if (safeTotal === 1) return { easy: 0, medium: 1, hard: 0 };
  if (safeTotal === 2) return { easy: 1, medium: 1, hard: 0 };

  const easy = Math.max(1, Math.round(safeTotal * 0.3));
  const hard = Math.max(1, Math.round(safeTotal * 0.3));
  const medium = Math.max(1, safeTotal - easy - hard);
  const diff = easy + medium + hard - safeTotal;

  return {
    easy,
    medium: Math.max(0, medium - Math.max(0, diff)),
    hard: Math.max(1, hard - Math.max(0, diff - medium)),
  };
}

/**
 * Classifies cognitive difficulty & Bloom level from actual analytical demand,
 * NEVER from superficial question length.
 */
export function inferCognitiveDifficultyAndBloom(
  q: Pick<QuizQuestion, 'question' | 'difficulty' | 'bloomLevel' | 'type'>,
): { difficulty: CognitiveDifficulty; bloomLevel: string } {
  const norm = normalizeForComparison(q.question);
  const hasHardSignal = HARD_COGNITIVE_RE.test(norm);
  const hasMediumSignal = MEDIUM_COGNITIVE_RE.test(norm);
  const hasEasySignal = EASY_COGNITIVE_RE.test(norm);

  let inferred: CognitiveDifficulty;
  if (hasHardSignal) {
    inferred = 'hard';
  } else if (hasMediumSignal) {
    inferred = 'medium';
  } else if (hasEasySignal) {
    inferred = 'easy';
  } else if (q.difficulty === 'easy' || q.difficulty === 'medium' || q.difficulty === 'hard') {
    inferred = q.difficulty;
  } else {
    inferred = q.type === 'short_answer' ? 'hard' : 'medium';
  }

  // Respect explicit AI classification unless it directly contradicts strong cognitive cues
  let finalDifficulty: CognitiveDifficulty = inferred;
  if (q.difficulty === 'easy' || q.difficulty === 'medium' || q.difficulty === 'hard') {
    if (q.difficulty === 'easy' && hasHardSignal) {
      finalDifficulty = 'hard';
    } else if (q.difficulty === 'hard' && hasEasySignal && !hasHardSignal && !hasMediumSignal) {
      finalDifficulty = 'easy';
    } else {
      finalDifficulty = q.difficulty;
    }
  }

  const defaultBloom =
    finalDifficulty === 'hard'
      ? 'Analiz ve Karşılaştırma'
      : finalDifficulty === 'medium'
      ? 'Yorumlama ve Uygulama'
      : 'Bilgi ve Kavrama';

  const existingBloom = String(q.bloomLevel || '').trim();
  const bloomLevel =
    existingBloom.length >= 4 && existingBloom.length <= 36 ? existingBloom : defaultBloom;

  return { difficulty: finalDifficulty, bloomLevel };
}

/**
 * Parses uploaded source text into ordered section anchors with Sayfa/Slayt provenance.
 */
export function extractSourceSectionAnchors(
  sourceText: string,
  outlineFallback?: string[],
): SourceSectionAnchor[] {
  const lines = String(sourceText || '')
    .replace(/\r\n/g, '\n')
    .split('\n');
  const anchors: SourceSectionAnchor[] = [];
  let currentHeading = '';
  let currentPage: string | undefined;
  let buffer: string[] = [];

  const flush = () => {
    const body = buffer.join('\n').trim();
    if (body.length >= 25) {
      const heading = currentHeading || outlineFallback?.[anchors.length] || `Bölüm ${anchors.length + 1}`;
      anchors.push({
        heading,
        pageHint: currentPage,
        text: body,
        tokenSet: buildTurkishStemSet(extractContentTokens(`${heading} ${body}`)),
      });
    }
    buffer = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    const pageMatch = line.match(/^---\s*(Sayfa|Slayt)\s+(\d+)\s*---$/i);
    if (pageMatch) {
      currentPage = `${pageMatch[1]} ${pageMatch[2]}`;
      continue;
    }
    if (/^===\s*KAYNAK/i.test(line)) {
      flush();
      currentHeading = line.replace(/^===\s*|\s*===$/g, '').trim();
      continue;
    }
    const isHeading =
      /^#{1,4}\s+/.test(line) ||
      /^(\d+(\.\d+){0,2}|[IVX]+\.)\s+[A-ZÇĞİÖŞÜ]/.test(line) ||
      (line.length >= 5 && line.length <= 68 && line.endsWith(':') && !/[.!?]/.test(line));
    if (isHeading) {
      if (buffer.length > 0) flush();
      currentHeading = line.replace(/^#{1,4}\s+/, '').replace(/:$/, '').trim();
      continue;
    }
    buffer.push(line);
  }
  flush();

  if (anchors.length === 0 && sourceText.trim().length > 20) {
    anchors.push({
      heading: outlineFallback?.[0] || 'Ana Bölüm',
      pageHint: currentPage,
      text: sourceText.trim(),
      tokenSet: buildTurkishStemSet(extractContentTokens(sourceText)),
    });
  }

  return anchors;
}

export function locateSourceReference(
  anchors: SourceSectionAnchor[],
  queryText: string,
): { sourceSection?: string; sourcePage?: string } {
  if (anchors.length === 0) return {};
  const tokens = extractContentTokens(queryText);
  if (tokens.length === 0) {
    return { sourceSection: anchors[0].heading, sourcePage: anchors[0].pageHint };
  }
  let best: SourceSectionAnchor | null = null;
  let bestScore = 0;
  for (const anchor of anchors) {
    const { matchedCount, ratio } = tokenOverlapRatio(tokens, anchor.tokenSet);
    const score = matchedCount * 1.4 + ratio * 3;
    if (score > bestScore) {
      bestScore = score;
      best = anchor;
    }
  }
  if (!best) return {};
  return { sourceSection: best.heading, sourcePage: best.pageHint };
}

/**
 * Rotates topics across repeated generations so consecutive exams probe
 * untested or least-tested chapters and learning outcomes first.
 */
export function buildAvoidanceAndRotationPlan(params: {
  outlineHeadings: string[];
  historyEntries: QuestionHistoryEntry[];
  requestedCount: number;
  generationNonce?: string;
}): AvoidanceAndRotationPlan {
  const usageCounts: Record<string, number> = {};
  const cleanHeadings = Array.from(
    new Set(params.outlineHeadings.map((h) => h.trim()).filter((h) => h.length >= 3)),
  );

  for (const heading of cleanHeadings) {
    const hTokens = extractContentTokens(heading);
    const hSet = buildTurkishStemSet(hTokens);
    let hits = 0;
    for (const entry of params.historyEntries) {
      const topicMatch =
        tokenOverlapRatio(extractContentTokens(`${entry.topic} ${entry.sourceSection || ''}`), hSet)
          .matchedCount >= 1;
      const stemMatch = tokenOverlapRatio(entry.stemTokens, hSet).matchedCount >= 2;
      if (topicMatch || stemMatch) hits++;
    }
    usageCounts[heading] = hits;
  }

  // Deterministic nonce rotation among ties so Run 1, Run 2, Run 3 shift focus smoothly
  const nonceOffset = params.generationNonce
    ? parseInt(hashCompact(params.generationNonce).slice(0, 4), 36)
    : 0;

  const indexed = cleanHeadings.map((h, i) => ({
    heading: h,
    count: usageCounts[h] || 0,
    rotatedOrder: (i + nonceOffset) % Math.max(1, cleanHeadings.length),
  }));

  indexed.sort((a, b) => a.count - b.count || a.rotatedOrder - b.rotatedOrder);

  const priorityTopics = indexed
    .slice(0, Math.min(12, Math.max(4, params.requestedCount)))
    .map((x) => x.heading);

  const avoidSummaries = params.historyEntries
    .slice(0, 24)
    .map((h) => `[${h.topic}] ${h.stemPreview}`);

  return {
    priorityTopics,
    avoidSummaries,
    historyEntries: params.historyEntries,
    topicUsageCounts: usageCounts,
  };
}

function splitCleanSourceSentences(sourceText: string): string[] {
  return String(sourceText || '')
    .replace(/---\s*(Sayfa|Slayt)\s*\d+\s*---/gi, '\n')
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.replace(/^[-•*#]+\s*/, '').trim())
    .filter((s) => s.length >= 36);
}

/**
 * Checks whether an option is an un-negated verbatim true sentence from the source text.
 * Used to catch broken "which statement is true?" questions where distractors are ALSO true sentences!
 */
function isVerbatimSourceSentence(optionText: string, normalizedSourceSentences: string[]): boolean {
  const normOpt = normalizeForComparison(optionText);
  if (normOpt.length < 40) return false;
  return normalizedSourceSentences.some(
    (s) => s === normOpt || (s.length >= 45 && (s.includes(normOpt) || normOpt.includes(s))),
  );
}

function isUnpinnedGenericTrueStem(normStem: string): boolean {
  if (NEGATIVE_STEM_RE.test(normStem)) return false;
  return (
    /(?:asagidaki\s+ifadelerden\s+hangisi\s+dogrudur|asagidakilerden\s+hangisi\s+dogrudur|metinle\s+dogrulanir|cikarimlardan\s+hangisi\s+gecerlidir)/.test(
      normStem,
    ) && !/["'«»]/.test(normStem)
  );
}

/**
 * 7-Point Automated Quiz Quality Validator & Deduplicator.
 * Rejects hallucinated, off-source, broken, duplicate, or answer-key-mismatched questions
 * and computes exact shortfall counts for targeted regeneration.
 */
export function validateQuizBatch(
  rawCandidates: unknown[],
  params: {
    sourceText: string;
    course: string;
    title?: string;
    outlineHeadings?: string[];
    requestedCount: number;
    requestedDifficulty?: DifficultyLevel;
    sourceFingerprint?: string;
    historyEntries?: QuestionHistoryEntry[];
    alreadyAccepted?: QuizQuestion[];
    strictSourceGrounding?: boolean;
  },
): QuizValidationResult {
  const sourceFull = `${params.course || ''} ${params.title || ''} ${params.sourceText || ''}`;
  const sourceTokens = extractContentTokens(sourceFull);
  const sourceStemSet = buildTurkishStemSet(sourceTokens);
  const hasSubstantialSource = sourceTokens.length >= 12;
  const anchors = extractSourceSectionAnchors(params.sourceText, params.outlineHeadings);
  const normalizedSourceSentences = splitCleanSourceSentences(params.sourceText).map(normalizeForComparison);

  const quota = computeDifficultyQuota(params.requestedCount, params.requestedDifficulty || 'mixed');
  const accepted: QuizQuestion[] = [...(params.alreadyAccepted || [])];
  const rejected: RejectedQuizItem[] = [];
  let historyExcludedCount = 0;

  const acceptedSignatures = accepted.map((q) => {
    const ans = getCorrectAnswerText(q);
    return {
      stemNormalized: normalizeForComparison(q.question),
      stemTokens: extractContentTokens(q.question),
      answerTokens: extractContentTokens(ans),
      conceptKey: q.conceptKey || computeConceptKey(q.question, q.topic, ans),
    };
  });

  const historySignatures = (params.historyEntries || []).map((h) => ({
    stemNormalized: h.stemNormalized,
    stemTokens: h.stemTokens,
    answerTokens: h.answerTokens,
    conceptKey: h.conceptKey,
  }));

  for (const raw of Array.isArray(rawCandidates) ? rawCandidates : []) {
    if (!raw || typeof raw !== 'object') continue;
    const rec = raw as Record<string, unknown>;
    const rawQuestion = String(rec.question || '').replace(/\s+/g, ' ').trim();
    const reasons: string[] = [];

    // CHECK 1: Stem clarity & structural integrity
    if (rawQuestion.length < 18) {
      reasons.push('stem_too_short');
    }
    if (/(?:\.\.\.|…)/.test(rawQuestion)) {
      reasons.push('truncated_stem');
    }
    if (/\(Soru\s+\d+\)|#\d+\s*:/.test(rawQuestion)) {
      reasons.push('mechanical_template_tag');
    }
    if (GREETING_FILLER_RE.test(normalizeForComparison(rawQuestion))) {
      reasons.push('greeting_chatter');
    }

    const rawType = String(rec.type || 'multiple_choice').toLowerCase();
    const isShort = rawType === 'short_answer' || rawType === 'open_ended' || rawType === 'classic';

    let options: string[] = [];
    let correctIndex: number | undefined = undefined;
    let sampleAnswer: string | undefined = undefined;
    const explanation = String(rec.explanation || '').replace(/\s+/g, ' ').trim();

    if (isShort) {
      sampleAnswer = String(rec.sampleAnswer || explanation || '').trim();
      if (sampleAnswer.length < 16) {
        reasons.push('missing_sample_answer');
      }
    } else {
      // CHECK 2: Exact 4 distinct options + explicit valid correctIndex (NEVER silently clamped!)
      const rawOpts = Array.isArray(rec.options)
        ? rec.options
            .map((o) =>
              String(o || '')
                .replace(/^[A-Da-d]\s*[).:\-]\s*/, '')
                .replace(/\s+/g, ' ')
                .trim(),
            )
            .filter(Boolean)
        : [];
      if (rawOpts.length < 4) {
        reasons.push('insufficient_options');
      }
      options = rawOpts.slice(0, 4);

      const idxNum = typeof rec.correctIndex === 'number' ? rec.correctIndex : Number(rec.correctIndex);
      if (
        rec.correctIndex === undefined ||
        rec.correctIndex === null ||
        rec.correctIndex === '' ||
        !Number.isInteger(idxNum) ||
        idxNum < 0 ||
        idxNum >= options.length
      ) {
        reasons.push('invalid_correct_index');
      } else {
        correctIndex = idxNum;
      }

      // Check option distinctness, truncation, and broken meta-distractors
      const optTokenSets = options.map((o) => buildTurkishStemSet(extractContentTokens(o)));
      const optNorms = options.map(normalizeForComparison);
      let hasDupOption = false;
      let hasBrokenDistractor = false;
      for (let i = 0; i < options.length; i++) {
        if (options[i].length < 2) hasBrokenDistractor = true;
        if (BROKEN_META_DISTRACTOR_RE.test(optNorms[i])) {
          hasBrokenDistractor = true;
        }
        if (/(?:\.\.\.|…)$/.test(options[i])) {
          reasons.push('truncated_option');
        }
        for (let j = i + 1; j < options.length; j++) {
          if (optNorms[i] === optNorms[j]) {
            hasDupOption = true;
          } else if (
            optTokenSets[i].size >= 2 &&
            optTokenSets[j].size >= 2 &&
            jaccardSetSimilarity(optTokenSets[i], optTokenSets[j]) >= 0.8
          ) {
            hasDupOption = true;
          }
        }
      }
      if (hasDupOption) reasons.push('duplicate_options');
      if (hasBrokenDistractor) reasons.push('broken_meta_distractor');

      // Catch all-true distractor bug on generic unpinned positive stems
      if (correctIndex !== undefined && options.length === 4 && isUnpinnedGenericTrueStem(normalizeForComparison(rawQuestion))) {
        let verbatimTrueDistractors = 0;
        for (let i = 0; i < options.length; i++) {
          if (i === correctIndex) continue;
          if (isVerbatimSourceSentence(options[i], normalizedSourceSentences)) {
            verbatimTrueDistractors++;
          }
        }
        if (verbatimTrueDistractors >= 1) {
          reasons.push('multiple_true_options');
        }
      }
    }

    // CHECK 3: Explanation quality & answer-key consistency verification
    if (!isShort && explanation.length < 18) {
      reasons.push('weak_or_missing_explanation');
    }

    if (!isShort && correctIndex !== undefined && options.length === 4 && explanation.length >= 18) {
      const normExp = normalizeForComparison(explanation);
      // Explicit letter contradiction check ("dogru cevap B" when correctIndex != 1)
      const letterMatch = explanation.match(/(?:doğru\s+(?:cevap|şık|seçenek)|yanıt)\s*[:\-]?\s*([A-D])\b/i);
      if (letterMatch) {
        const expectedIdx = letterMatch[1].toUpperCase().charCodeAt(0) - 65;
        if (expectedIdx >= 0 && expectedIdx < 4 && expectedIdx !== correctIndex) {
          reasons.push('explanation_letter_mismatch');
        }
      }

      // Cross-check explanation token overlap with marked correct option vs wrong options
      const expTokens = extractContentTokens(explanation);
      if (expTokens.length >= 4 && !NEGATIVE_STEM_RE.test(normalizeForComparison(rawQuestion))) {
        const expSet = buildTurkishStemSet(expTokens);
        const correctOptTokens = extractContentTokens(options[correctIndex]);
        const correctOverlap = tokenOverlapRatio(correctOptTokens, expSet).ratio;
        const hasNegation = /\b(?:degil|degildir|yanlis|yanlistir|hatali|aksine|oysa|degilse)\b/.test(normExp);
        if (correctOverlap < 0.14 && !hasNegation) {
          for (let i = 0; i < options.length; i++) {
            if (i === correctIndex) continue;
            const wrongTokens = extractContentTokens(options[i]);
            const wrongMatch = tokenOverlapRatio(wrongTokens, expSet);
            if (wrongTokens.length >= 3 && wrongMatch.ratio >= 0.75 && wrongMatch.matchedCount >= 3) {
              reasons.push('explanation_contradicts_answer_key');
              break;
            }
          }
        }
      }
    }

    // CHECK 4: Source Grounding Verification (rejects hallucinated / off-course questions)
    const answerText = isShort
      ? String(sampleAnswer || '')
      : correctIndex !== undefined && options[correctIndex]
      ? options[correctIndex]
      : '';
    if (hasSubstantialSource) {
      const groundingTokens = extractContentTokens(`${rawQuestion} ${answerText} ${explanation}`);
      const { ratio, matchedCount } = tokenOverlapRatio(groundingTokens, sourceStemSet);
      const minRatio = params.strictSourceGrounding === false ? 0.18 : 0.26;
      const minCount = Math.min(2, groundingTokens.length);
      if (matchedCount < minCount || ratio < minRatio) {
        reasons.push('ungrounded_off_source');
      }
    }

    // CHECK 5: Intra-Batch & Cross-Exam Semantic Deduplication
    const stemNorm = normalizeForComparison(rawQuestion);
    const stemTokens = extractContentTokens(rawQuestion);
    const answerTokens = extractContentTokens(answerText);
    const conceptKey = String(rec.conceptKey || '').trim() || computeConceptKey(rawQuestion, String(rec.topic || ''), answerText);
    const candidateSig = {
      stemNormalized: stemNorm,
      stemTokens,
      answerTokens,
      conceptKey,
    };

    if (reasons.length === 0) {
      for (const prev of historySignatures) {
        const sim = computeQuestionSemanticSimilarity(candidateSig, prev);
        if (sim.isDuplicate) {
          reasons.push(`history_duplicate:${sim.reason || 'similar'}`);
          historyExcludedCount++;
          break;
        }
      }
    }

    if (reasons.length === 0) {
      for (const acc of acceptedSignatures) {
        const sim = computeQuestionSemanticSimilarity(candidateSig, acc);
        if (sim.isDuplicate) {
          reasons.push(`batch_duplicate:${sim.reason || 'similar'}`);
          break;
        }
      }
    }

    if (reasons.length > 0) {
      rejected.push({ question: rawQuestion.slice(0, 140), reasons });
      continue;
    }

    // CHECK 6: Cognitive Difficulty + Bloom Classification
    const { difficulty, bloomLevel } = inferCognitiveDifficultyAndBloom({
      type: isShort ? 'short_answer' : 'multiple_choice',
      question: rawQuestion,
      difficulty:
        rec.difficulty === 'easy' || rec.difficulty === 'medium' || rec.difficulty === 'hard'
          ? rec.difficulty
          : undefined,
      bloomLevel: typeof rec.bloomLevel === 'string' ? rec.bloomLevel : undefined,
    });

    // CHECK 7: Source Section & Page Provenance Attribution
    const located = locateSourceReference(anchors, `${rawQuestion} ${answerText} ${explanation}`);
    const sourceSection = String(rec.sourceSection || '').trim() || located.sourceSection || String(rec.topic || '').trim() || undefined;
    const sourcePage = String(rec.sourcePage || '').trim() || located.sourcePage || undefined;
    const topic = String(rec.topic || '').trim() || sourceSection || params.course || 'Ders Notu';

    const validatedQuestion: QuizQuestion = {
      id: `q_${hashCompact(`${params.sourceFingerprint || params.course}|${stemNorm}|${answerText.slice(0, 32)}`)}`,
      type: isShort ? 'short_answer' : 'multiple_choice',
      question: rawQuestion,
      options: isShort ? [] : options,
      correctIndex: isShort ? 0 : correctIndex,
      sampleAnswer: isShort ? sampleAnswer : undefined,
      rubric:
        isShort && Array.isArray(rec.rubric)
          ? rec.rubric.map(String).filter(Boolean).slice(0, 5)
          : undefined,
      explanation: explanation || sampleAnswer || '',
      topic,
      sourceSection,
      sourcePage,
      conceptKey,
      sourceFingerprint: params.sourceFingerprint,
      difficulty,
      bloomLevel,
    };

    accepted.push(validatedQuestion);
    acceptedSignatures.push(candidateSig);
  }

  // Rebalance accepted selection toward target difficulty quota if we received MORE than requested
  let finalAccepted = accepted;
  if (accepted.length > params.requestedCount) {
    const byDiff: Record<CognitiveDifficulty, QuizQuestion[]> = { easy: [], medium: [], hard: [] };
    for (const q of accepted) {
      byDiff[q.difficulty || 'medium'].push(q);
    }
    const picked: QuizQuestion[] = [];
    const takeFrom = (level: CognitiveDifficulty, n: number) => {
      const slice = byDiff[level].splice(0, n);
      picked.push(...slice);
    };
    takeFrom('easy', quota.easy);
    takeFrom('medium', quota.medium);
    takeFrom('hard', quota.hard);
    const remaining = [...byDiff.medium, ...byDiff.hard, ...byDiff.easy];
    while (picked.length < params.requestedCount && remaining.length > 0) {
      const next = remaining.shift();
      if (next) picked.push(next);
    }
    finalAccepted = picked;
  }

  // Distribute MC correctIndex evenly if heavily skewed (e.g., all answers stuck at index 0)
  finalAccepted = rebalanceCorrectIndices(finalAccepted);

  const breakdown: DifficultyQuota = { easy: 0, medium: 0, hard: 0 };
  const coveredSectionNorms = new Set<string>();
  for (const q of finalAccepted) {
    breakdown[q.difficulty || 'medium']++;
    const secKey = normalizeForComparison(q.sourceSection || q.topic || '');
    if (secKey) coveredSectionNorms.add(secKey);
  }

  const missingCount = Math.max(0, params.requestedCount - finalAccepted.length);
  const missingDifficulties: DifficultyQuota = {
    easy: Math.max(0, quota.easy - breakdown.easy),
    medium: Math.max(0, quota.medium - breakdown.medium),
    hard: Math.max(0, quota.hard - breakdown.hard),
  };

  const uncoveredTopics = (params.outlineHeadings || []).filter((h) => {
    const hSet = buildTurkishStemSet(extractContentTokens(h));
    if (hSet.size === 0) return false;
    return !finalAccepted.some(
      (q) =>
        tokenOverlapRatio(
          extractContentTokens(`${q.topic || ''} ${q.sourceSection || ''} ${q.question}`),
          hSet,
        ).matchedCount >= 1,
    );
  });

  const qualityReport: QuizQualityReport = {
    validatedCount: finalAccepted.length,
    rejectedCount: rejected.length,
    regeneratedCount: 0,
    historyExcludedCount,
    difficultyBreakdown: breakdown,
    topicCoverageCount: coveredSectionNorms.size,
  };

  return {
    accepted: finalAccepted,
    rejected,
    missingCount,
    missingDifficulties,
    difficultyBreakdown: breakdown,
    uncoveredTopics,
    historyExcludedCount,
    qualityReport,
  };
}

/**
 * Prevents degenerate answer-key patterns (e.g., 80%+ of answers at option A)
 * by deterministically permuting options while keeping `correctIndex` strictly locked
 * to the exact same correct option text.
 */
export function rebalanceCorrectIndices(questions: QuizQuestion[]): QuizQuestion[] {
  const mcQuestions = questions.filter(
    (q) => q.type !== 'short_answer' && Array.isArray(q.options) && q.options.length === 4,
  );
  if (mcQuestions.length < 3) return questions;

  const counts = [0, 0, 0, 0];
  for (const q of mcQuestions) {
    if (typeof q.correctIndex === 'number' && q.correctIndex >= 0 && q.correctIndex < 4) {
      counts[q.correctIndex]++;
    }
  }
  const maxSkew = Math.max(...counts);
  // Only rebalance if skewed (> 50% on a single slot or <= 1 distinct slot used)
  const usedSlots = counts.filter((c) => c > 0).length;
  if (usedSlots > 1 && maxSkew <= Math.ceil(mcQuestions.length * 0.5)) {
    return questions;
  }

  let mcCursor = 0;
  return questions.map((q) => {
    if (
      q.type === 'short_answer' ||
      !Array.isArray(q.options) ||
      q.options.length !== 4 ||
      typeof q.correctIndex !== 'number'
    ) {
      return q;
    }
    const targetIdx = mcCursor % 4;
    mcCursor++;
    if (q.correctIndex === targetIdx) return q;
    // Skip permuting if an option explicitly says "Hepsi" or "Hiçbiri"
    if (q.options.some((o) => /\b(hepsi|tümü|hiçbiri|yukarıdakilerin)\b/i.test(o))) {
      return q;
    }
    const opts = [...q.options];
    const tmp = opts[targetIdx];
    opts[targetIdx] = opts[q.correctIndex];
    opts[q.correctIndex] = tmp;
    return {
      ...q,
      options: opts,
      correctIndex: targetIdx,
    };
  });
}

/**
 * Validates and deduplicates flashcards against source text, current batch, and prior history.
 */
export function validateFlashcardsBatch(
  rawCards: unknown[],
  params: {
    sourceText: string;
    course: string;
    title?: string;
    outlineHeadings?: string[];
    requestedCount: number;
    sourceFingerprint?: string;
    historyEntries?: FlashcardHistoryEntry[];
    alreadyAccepted?: FlashcardItem[];
  },
): FlashcardValidationResult {
  const sourceTokens = extractContentTokens(`${params.course} ${params.title || ''} ${params.sourceText}`);
  const sourceStemSet = buildTurkishStemSet(sourceTokens);
  const hasSubstantialSource = sourceTokens.length >= 12;
  const anchors = extractSourceSectionAnchors(params.sourceText, params.outlineHeadings);

  const accepted: FlashcardItem[] = [...(params.alreadyAccepted || [])];
  let rejectedCount = 0;
  let historyExcludedCount = 0;

  const acceptedTokenPairs = accepted.map((c) => ({
    frontNorm: normalizeForComparison(c.front),
    frontSet: buildTurkishStemSet(extractContentTokens(c.front)),
    backSet: buildTurkishStemSet(extractContentTokens(c.back)),
  }));

  const historyPairs = (params.historyEntries || []).map((h) => ({
    frontNorm: normalizeForComparison(h.frontPreview),
    frontSet: buildTurkishStemSet(h.frontTokens),
    backSet: buildTurkishStemSet(h.backTokens),
  }));

  for (const raw of Array.isArray(rawCards) ? rawCards : []) {
    if (!raw || typeof raw !== 'object') continue;
    const rec = raw as Record<string, unknown>;
    const front = String(rec.front || '').replace(/\s+/g, ' ').trim();
    const back = String(rec.back || '').replace(/\s+/g, ' ').trim();

    if (front.length < 8 || back.length < 12) {
      rejectedCount++;
      continue;
    }
    if (/(?:\.\.\.|…)/.test(front) || /\(#\d+\)\s*:/.test(front)) {
      rejectedCount++;
      continue;
    }
    if (GREETING_FILLER_RE.test(normalizeForComparison(front))) {
      rejectedCount++;
      continue;
    }

    if (hasSubstantialSource) {
      const tokens = extractContentTokens(`${front} ${back}`);
      const { ratio, matchedCount } = tokenOverlapRatio(tokens, sourceStemSet);
      if (matchedCount < Math.min(2, tokens.length) || ratio < 0.24) {
        rejectedCount++;
        continue;
      }
    }

    const frontNorm = normalizeForComparison(front);
    const frontSet = buildTurkishStemSet(extractContentTokens(front));
    const backSet = buildTurkishStemSet(extractContentTokens(back));

    const isHistDup = historyPairs.some(
      (h) =>
        h.frontNorm === frontNorm ||
        jaccardSetSimilarity(frontSet, h.frontSet) >= 0.6 ||
        (jaccardSetSimilarity(backSet, h.backSet) >= 0.72 && jaccardSetSimilarity(frontSet, h.frontSet) >= 0.3),
    );
    if (isHistDup) {
      rejectedCount++;
      historyExcludedCount++;
      continue;
    }

    const isBatchDup = acceptedTokenPairs.some(
      (a) =>
        a.frontNorm === frontNorm ||
        jaccardSetSimilarity(frontSet, a.frontSet) >= 0.6 ||
        (jaccardSetSimilarity(backSet, a.backSet) >= 0.72 && jaccardSetSimilarity(frontSet, a.frontSet) >= 0.3),
    );
    if (isBatchDup) {
      rejectedCount++;
      continue;
    }

    const located = locateSourceReference(anchors, `${front} ${back}`);
    const rawDiff = String(rec.difficulty || 'medium').toLowerCase();
    const difficulty: CognitiveDifficulty =
      rawDiff === 'easy' ? 'easy' : rawDiff === 'hard' ? 'hard' : 'medium';

    const card: FlashcardItem = {
      id: `fc_${hashCompact(`${params.sourceFingerprint || params.course}|${frontNorm}`)}`,
      front,
      back,
      hint: rec.hint ? String(rec.hint).trim() : undefined,
      topic: String(rec.topic || located.sourceSection || params.course || 'Ders Notu').trim(),
      sourceSection: String(rec.sourceSection || located.sourceSection || '').trim() || undefined,
      sourcePage: String(rec.sourcePage || located.sourcePage || '').trim() || undefined,
      conceptKey: computeConceptKey(front, String(rec.topic || ''), back),
      difficulty,
      examTip: rec.examTip ? String(rec.examTip).trim() : undefined,
    };

    accepted.push(card);
    acceptedTokenPairs.push({ frontNorm, frontSet, backSet });
    if (accepted.length >= params.requestedCount) break;
  }

  return {
    accepted: accepted.slice(0, params.requestedCount),
    rejectedCount,
    historyExcludedCount,
    missingCount: Math.max(0, params.requestedCount - accepted.length),
  };
}

/**
 * Authoritatively maps detected course/discipline to exact VideoVisualTheme,
 * preventing cross-course visual leakage (e.g., Law or History getting Economics curves).
 */
export function resolveVideoThemeForCourse(
  course: string,
  title: string,
  sourceText: string,
): VideoVisualTheme {
  const det = detectCourseIdentity({
    text: sourceText.slice(0, 6000),
    fileNameOrTitle: title,
    explicitCourse: course,
  });
  const combined = foldTurkishToAscii(`${det.course || ''} ${det.discipline || ''} ${course} ${title}`);

  if (/(hukuk|anayasa|borclar|ceza|medeni|idare|ticaret\s+hukuku|icra|iflas|usul\s+hukuku)/.test(combined)) {
    return 'law';
  }
  if (/(tarih|osmanli|selcuklu|inkilap|medeniyet|cagdas\s+dunya\s+tarihi)/.test(combined)) {
    return 'history';
  }
  if (/(para\s+teorisi|iktisat|ekonomi|makro|mikro|ekonometri|maliye|finans|muhasebe|isletme|pazarlama|bankacilik)/.test(combined)) {
    return 'economics';
  }
  if (/(siyaset|uluslararasi\s+iliskiler|kamu\s+yonetimi|diplomasi)/.test(combined)) {
    return 'politics';
  }
  if (/(tip|anatomi|fizyoloji|farmakoloji|patoloji|hemsirelik|eczacilik|saglik|biyokimya)/.test(combined)) {
    return 'medicine';
  }
  if (/(muhendislik|algoritma|veri\s+yapilari|yazilim|bilgisayar|termodinamik|mukavemet|elektrik|elektronik|makine)/.test(combined)) {
    return 'engineering';
  }
  if (/(egitim|pedagoji|ogretim|olcme\s+ve\s+degerlendirme|rehberlik|pdr)/.test(combined)) {
    return 'education';
  }
  if (/(spor|egzersiz|antrenman|kinesiyoloji|biyomekanik)/.test(combined)) {
    return 'sports';
  }
  if (/(ziraat|tarim|toprak\s+bilimi|bitki\s+koruma|zootekni)/.test(combined)) {
    return 'agriculture';
  }
  if (/(istatistik|matematik|fizik|kimya|biyoloji|olasilik|kalkulus|lineer\s+cebir|diferansiyel)/.test(combined)) {
    return 'science';
  }
  return 'society';
}

const VALID_VIDEO_DIAGRAM_TYPES: VideoDiagramType[] = [
  'visual',
  'shapes',
  'table',
  'chart',
  'scenario',
  'timeline',
  'comparison',
  'structure',
  'network',
  'curve',
];

function sceneSupportsCurve(theme: VideoVisualTheme, text: string): boolean {
  if (theme !== 'economics') return false;
  const f = foldTurkishToAscii(text);
  return /(arz\s+egrisi|talep\s+egrisi|arz\s+ve\s+talep|para\s+arzi|para\s+talebi|is\s*-?\s*lm|ad\s*-?\s*as|phillips|esneklik|marjinal\s+maliyet|marjinal\s+fayda|denge\s+fiyat|denge\s+faiz|likidite\s+tuzagi|farksizlik\s+egrisi|butce\s+dogrusu)/.test(
    f,
  );
}

function sceneSupportsChart(theme: VideoVisualTheme, text: string): boolean {
  if (!['economics', 'science', 'engineering', 'medicine'].includes(theme)) return false;
  const f = foldTurkishToAscii(text);
  return /(yuzde|%|oran|dagilim|regresyon|varyans|standart\s+sapma|korelasyon|hipotez|istatistik|enflasyon|gsyh|gsyih|faiz\s+orani|buyume\s+orani|veri|olcum|carpan)/.test(
    f,
  );
}

function selectAlignedDiagramType(
  requestedType: unknown,
  theme: VideoVisualTheme,
  sceneText: string,
  sceneIdx: number,
  usedTypes: Set<VideoDiagramType>,
): VideoDiagramType {
  const f = foldTurkishToAscii(sceneText);
  const canCurve = sceneSupportsCurve(theme, sceneText);
  const canChart = sceneSupportsChart(theme, sceneText);

  let candidate: VideoDiagramType | null =
    typeof requestedType === 'string' && VALID_VIDEO_DIAGRAM_TYPES.includes(requestedType as VideoDiagramType)
      ? (requestedType as VideoDiagramType)
      : null;

  if (candidate === 'curve' && !canCurve) candidate = null;
  if (candidate === 'chart' && !canChart) candidate = null;
  if (candidate && !usedTypes.has(candidate)) return candidate;

  // Infer from actual scene semantics
  const inferred: VideoDiagramType[] = [];
  if (canCurve) inferred.push('curve');
  if (/(karsilastir|kiyas|fark|aksine|oysa|karsilik)/.test(f)) inferred.push('comparison', 'table');
  if (/(asama|surec|adim|kronoloji|yuzyil|donem|\b1[6-9]\d{2}\b|\b20\d{2}\b)/.test(f)) inferred.push('timeline');
  if (/(ornek|vaka|senaryo|uygulama|durumunda)/.test(f)) inferred.push('scenario');
  if (/(tur|cesit|siniflandir|unsur|kosul|ilke|madde|tablo)/.test(f)) inferred.push('table', 'structure');
  if (/(etkilesim|mekanizma|kanal|aktarim|iliski|baglanti)/.test(f)) inferred.push('network', 'shapes');
  if (canChart) inferred.push('chart');

  const safePool: VideoDiagramType[] = [
    ...inferred,
    'visual',
    'table',
    'comparison',
    'structure',
    'network',
    'scenario',
    'timeline',
    'shapes',
  ];

  const unused = safePool.find((t) => !usedTypes.has(t));
  return unused || candidate || safePool[sceneIdx % safePool.length];
}

function cleanNodeLabel(raw: string, fallback: string): string {
  const clean = String(raw || '')
    .replace(/…|\.{2,}/g, '')
    .replace(/^[-•*\d.)\s]+/, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean || /^(?:temel\s+)?kavram\s*\d+$/i.test(clean) || /^ilke\s*\d+$/i.test(clean)) {
    return fallback.slice(0, 34);
  }
  if (clean.length <= 34) return clean;
  const words = clean.split(' ');
  let acc = '';
  for (const w of words) {
    const next = acc ? `${acc} ${w}` : w;
    if (next.length > 34) break;
    acc = next;
  }
  return acc || clean.slice(0, 34);
}

function cleanNodeSubtext(raw: string): string {
  const clean = String(raw || '')
    .replace(/…|\.{3,}/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean) return '';
  if (clean.length <= 130) return /[.!?]$/.test(clean) ? clean : `${clean}.`;
  const firstSentence = clean.split(/(?<=[.!?])\s+/)[0] || clean;
  if (firstSentence.length <= 135) return firstSentence;
  const words = clean.slice(0, 126).split(' ');
  words.pop();
  return `${words.join(' ').replace(/[,;:\-]+$/, '')}.`;
}

function buildNodesFromSceneNarration(
  narration: string,
  keyTakeaways: string[],
  keyTerms: Array<{ term: string; definition: string }>,
  sceneTitle: string,
): Array<{ label: string; subtext: string; badge: string }> {
  const badges = ['Temel Kavram', 'Mekanizma', 'Kritik Koşul', 'Sonuç'];
  const out: Array<{ label: string; subtext: string; badge: string }> = [];
  const seen = new Set<string>();

  const pushNode = (label: string, subtext: string) => {
    const cleanLbl = cleanNodeLabel(label, sceneTitle);
    const cleanSub = cleanNodeSubtext(subtext);
    const key = normalizeForComparison(cleanLbl);
    if (!key || !cleanSub || seen.has(key) || GREETING_FILLER_RE.test(normalizeForComparison(cleanSub))) {
      return;
    }
    seen.add(key);
    out.push({
      label: cleanLbl,
      subtext: cleanSub,
      badge: badges[out.length % badges.length],
    });
  };

  for (const kt of keyTerms) {
    if (out.length >= 4) break;
    pushNode(kt.term, kt.definition);
  }

  for (const tk of keyTakeaways) {
    if (out.length >= 4) break;
    const colon = tk.split(/[:–—]/);
    if (colon.length >= 2 && colon[0].trim().length <= 34) {
      pushNode(colon[0].trim(), colon.slice(1).join(':').trim());
    } else {
      const label = tk.split(/\s+/).slice(0, 3).join(' ');
      pushNode(label, tk);
    }
  }

  const sents = narration
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 24 && !GREETING_FILLER_RE.test(normalizeForComparison(s)) && !s.endsWith('?'));

  for (const s of sents) {
    if (out.length >= 4) break;
    const colon = s.split(/[:–—]/);
    const label =
      colon.length >= 2 && colon[0].trim().length <= 34
        ? colon[0].trim()
        : s.split(/\s+/).slice(0, 3).join(' ').replace(/[,.;:!?]$/, '');
    pushNode(label, s);
  }

  return out.slice(0, 4);
}

/**
 * Validates and repairs AI or local video lesson payloads so:
 * - Course & visualTheme are strictly locked to the uploaded document
 * - Every scene's narration === concatenated turns (100% TTS <-> subtitle sync)
 * - Every slide node actively aligns with concepts taught in that scene's narration
 * - Inappropriate chart/curve diagrams are stripped on verbal/non-quantitative courses
 * - Duplicate scenes across chunked passes are removed
 * - Embedded examQuestions & checkpointQuestions pass the quiz quality gate
 * - Extraction warnings are faithfully preserved in `extractionNotices`
 */
export function validateAndRepairVideoContent(
  rawVideo: Record<string, unknown>,
  params: {
    sourceText: string;
    course: string;
    title: string;
    outlineHeadings?: string[];
    extractionWarnings?: string[];
    sourceFingerprint?: string;
    analyzedCourses?: string[];
    isMultiCourse?: boolean;
  },
): Record<string, unknown> | null {
  const rawScenes = Array.isArray(rawVideo?.scenes) ? rawVideo.scenes : [];
  if (rawScenes.length === 0) return null;

  const lockedTheme = resolveVideoThemeForCourse(params.course, params.title, params.sourceText);
  const sourceTokens = extractContentTokens(`${params.course} ${params.title} ${params.sourceText}`);
  const sourceStemSet = buildTurkishStemSet(sourceTokens);
  const hasSubstantialSource = sourceTokens.length >= 12;
  const usedDiagramTypes = new Set<VideoDiagramType>();
  const seenSceneSignatures: Array<{ titleSet: Set<string>; narrSet: Set<string> }> = [];
  const repairedScenes: Array<Record<string, unknown>> = [];

  for (let i = 0; i < rawScenes.length; i++) {
    const sc = rawScenes[i] as Record<string, unknown> | null;
    if (!sc || typeof sc !== 'object') continue;

    const sceneTitle = String(sc.title || `Bölüm ${repairedScenes.length + 1}`)
      .replace(/\s+/g, ' ')
      .trim();

    // Clean and synchronize turns <-> narration
    const rawTurns = Array.isArray(sc.turns) ? sc.turns : [];
    const cleanedTurns: Array<{ speaker: 'Deniz' | 'Barış'; text: string }> = [];
    for (let tIdx = 0; tIdx < rawTurns.length; tIdx++) {
      const t = rawTurns[tIdx] as Record<string, unknown> | null;
      const text = String(t?.text || '').replace(/\s+/g, ' ').trim();
      if (text.length < 12) continue;
      if (GREETING_FILLER_RE.test(normalizeForComparison(text)) && text.length < 160) continue;
      const rawSpk = String(t?.speaker || '').toLocaleLowerCase('tr-TR');
      const speaker: 'Deniz' | 'Barış' = rawSpk.includes('bar') ? 'Barış' : 'Deniz';
      cleanedTurns.push({ speaker, text });
    }

    const rawNarration = String(sc.narration || '').replace(/\s+/g, ' ').trim();
    if (cleanedTurns.length === 0 && rawNarration.length >= 24) {
      const sents = rawNarration
        .split(/(?<=[.!?])\s+/)
        .map((s) => s.trim())
        .filter((s) => s.length >= 16 && !GREETING_FILLER_RE.test(normalizeForComparison(s)));
      if (sents.length >= 2) {
        cleanedTurns.push({ speaker: 'Deniz', text: sents[0] });
        cleanedTurns.push({
          speaker: 'Barış',
          text: `Deniz hocam, ${sceneTitle} kapsamında öne çıkan temel mekanizma nasıl işliyor?`,
        });
        cleanedTurns.push({ speaker: 'Deniz', text: sents.slice(1).join(' ') });
      } else if (sents.length === 1) {
        cleanedTurns.push({ speaker: 'Deniz', text: sents[0] });
      }
    }

    if (cleanedTurns.length === 0) continue;
    const syncedNarration = cleanedTurns.map((t) => t.text).join(' ');

    // Source grounding check per scene
    if (hasSubstantialSource) {
      const sceneTokens = extractContentTokens(`${sceneTitle} ${syncedNarration}`);
      const { ratio, matchedCount } = tokenOverlapRatio(sceneTokens, sourceStemSet);
      if (matchedCount < 2 || ratio < 0.2) {
        continue;
      }
    }

    // Cross-scene deduplication (protects chunked video merges)
    const titleSet = buildTurkishStemSet(extractContentTokens(sceneTitle));
    const narrSet = buildTurkishStemSet(extractContentTokens(syncedNarration));
    const isDuplicateScene = seenSceneSignatures.some(
      (prev) =>
        (titleSet.size >= 2 && jaccardSetSimilarity(titleSet, prev.titleSet) >= 0.72) ||
        jaccardSetSimilarity(narrSet, prev.narrSet) >= 0.65,
    );
    if (isDuplicateScene) continue;
    seenSceneSignatures.push({ titleSet, narrSet });

    const keyTakeaways = (Array.isArray(sc.keyTakeaways) ? sc.keyTakeaways : [])
      .map((k) => String(k || '').replace(/\s+/g, ' ').trim())
      .filter((k) => k.length >= 12 && !GREETING_FILLER_RE.test(normalizeForComparison(k)))
      .slice(0, 4);

    const keyTerms = (Array.isArray(sc.keyTerms) ? sc.keyTerms : [])
      .map((kt) => {
        const rec = kt as Record<string, unknown> | null;
        return {
          term: String(rec?.term || '').replace(/\s+/g, ' ').trim(),
          definition: String(rec?.definition || '').replace(/\s+/g, ' ').trim(),
        };
      })
      .filter((kt) => kt.term.length >= 2 && kt.definition.length >= 12)
      .slice(0, 5);

    // Repair diagramData: lock visualTheme, legalize diagramType, align nodes to narration
    const rawDd = (sc.diagramData && typeof sc.diagramData === 'object'
      ? (sc.diagramData as Record<string, unknown>)
      : {}) as Record<string, unknown>;

    const sceneNarrStemSet = buildTurkishStemSet(
      extractContentTokens(`${sceneTitle} ${syncedNarration} ${keyTakeaways.join(' ')}`),
    );

    const rawNodes = Array.isArray(rawDd.nodes) ? rawDd.nodes : [];
    const alignedNodes: Array<{ label: string; subtext: string; badge: string; value?: number }> = [];
    const seenNodeKeys = new Set<string>();
    const defaultBadges = ['Temel Kavram', 'Mekanizma', 'Kritik Koşul', 'Sonuç'];

    for (let nIdx = 0; nIdx < rawNodes.length; nIdx++) {
      const node = rawNodes[nIdx] as Record<string, unknown> | null;
      if (!node || typeof node !== 'object') continue;
      const rawLabel = String(node.label || '').trim();
      const rawSub = String(node.subtext || '').trim();
      if (!rawLabel || !rawSub) continue;
      if (BROKEN_META_DISTRACTOR_RE.test(normalizeForComparison(`${rawLabel} ${rawSub}`))) continue;
      if (GREETING_FILLER_RE.test(normalizeForComparison(rawSub))) continue;

      // Require node concepts to actually overlap with this scene's narration OR source
      const nodeTokens = extractContentTokens(`${rawLabel} ${rawSub}`);
      const narrOverlap = tokenOverlapRatio(nodeTokens, sceneNarrStemSet);
      const srcOverlap = hasSubstantialSource ? tokenOverlapRatio(nodeTokens, sourceStemSet) : { matchedCount: 2, ratio: 1 };
      if (nodeTokens.length >= 2 && narrOverlap.matchedCount === 0 && srcOverlap.matchedCount < 2) {
        continue;
      }

      const label = cleanNodeLabel(rawLabel, sceneTitle);
      const subtext = cleanNodeSubtext(rawSub);
      const key = normalizeForComparison(label);
      if (!key || !subtext || seenNodeKeys.has(key)) continue;
      seenNodeKeys.add(key);
      alignedNodes.push({
        label,
        subtext,
        badge: String(node.badge || defaultBadges[alignedNodes.length % defaultBadges.length]).trim().slice(0, 24),
        value: typeof node.value === 'number' && Number.isFinite(node.value) ? node.value : undefined,
      });
    }

    if (alignedNodes.length < 3) {
      const synthesized = buildNodesFromSceneNarration(syncedNarration, keyTakeaways, keyTerms, sceneTitle);
      for (const sn of synthesized) {
        if (alignedNodes.length >= 4) break;
        const key = normalizeForComparison(sn.label);
        if (!seenNodeKeys.has(key)) {
          seenNodeKeys.add(key);
          alignedNodes.push(sn);
        }
      }
    }

    const diagramType = selectAlignedDiagramType(
      rawDd.diagramType,
      lockedTheme,
      `${params.course} ${sceneTitle} ${syncedNarration}`,
      repairedScenes.length,
      usedDiagramTypes,
    );
    usedDiagramTypes.add(diagramType);

    const rawTip = String(sc.examTip || '').replace(/\s+/g, ' ').trim();
    const examTip =
      rawTip.length >= 16 && !GREETING_FILLER_RE.test(normalizeForComparison(rawTip))
        ? rawTip
        : keyTakeaways[0] || alignedNodes[0]?.subtext || `${sceneTitle} kapsamındaki temel kavram ve mekanizma ayrımına dikkat edin.`;

    // Validate optional scene checkpointQuestion so broken checkpoints never reach the UI
    let validCheckpoint: Record<string, unknown> | undefined = undefined;
    if (sc.checkpointQuestion && typeof sc.checkpointQuestion === 'object') {
      const cpCheck = validateQuizBatch([sc.checkpointQuestion], {
        sourceText: `${syncedNarration}\n${params.sourceText}`,
        course: params.course,
        title: params.title,
        requestedCount: 1,
        strictSourceGrounding: false,
      });
      if (cpCheck.accepted[0]) {
        const q = cpCheck.accepted[0];
        validCheckpoint = {
          question: q.question,
          options: q.options,
          correctIndex: q.correctIndex,
          explanation: q.explanation,
        };
      }
    }

    repairedScenes.push({
      ...sc,
      id: `scene-${repairedScenes.length + 1}`,
      order: repairedScenes.length + 1,
      title: sceneTitle,
      turns: cleanedTurns,
      narration: syncedNarration,
      diagramData: {
        diagramType,
        visualTheme: lockedTheme,
        mainTitle: String(rawDd.mainTitle || sceneTitle).trim().slice(0, 80),
        highlightMetric: String(rawDd.highlightMetric || examTip).trim().slice(0, 150),
        nodes: alignedNodes.slice(0, 4),
      },
      keyTakeaways: keyTakeaways.length > 0 ? keyTakeaways : alignedNodes.slice(0, 3).map((n) => `${n.label}: ${n.subtext}`),
      keyTerms,
      examTip,
      checkpointQuestion: validCheckpoint,
    });
  }

  if (repairedScenes.length === 0) return null;

  // Validate embedded video examQuestions via the exact same 7-point quiz gate
  const rawExamQs = Array.isArray(rawVideo.examQuestions) ? rawVideo.examQuestions : [];
  const validatedExamQs =
    rawExamQs.length > 0
      ? validateQuizBatch(rawExamQs, {
          sourceText: params.sourceText,
          course: params.course,
          title: params.title,
          outlineHeadings: params.outlineHeadings,
          requestedCount: Math.min(6, rawExamQs.length),
          sourceFingerprint: params.sourceFingerprint,
        }).accepted
      : [];

  const mergedNotices = Array.from(
    new Set([
      ...(params.extractionWarnings || []),
      ...(Array.isArray(rawVideo.extractionNotices)
        ? rawVideo.extractionNotices.map(String).filter(Boolean)
        : []),
    ]),
  );

  const keyFacts = (Array.isArray(rawVideo.keyFacts) ? rawVideo.keyFacts : [])
    .map((f) => String(f || '').replace(/\s+/g, ' ').trim())
    .filter((f) => f.length >= 16 && !GREETING_FILLER_RE.test(normalizeForComparison(f)))
    .slice(0, 8);

  return {
    ...rawVideo,
    videoTitle: String(rawVideo.videoTitle || params.title || 'Etkileşimli Video Ders').trim(),
    outline:
      String(rawVideo.outline || rawVideo.overview || '').trim() ||
      `${params.title} konusunun ${repairedScenes.length} aşamalı kaynak odaklı video anlatımı.`,
    overview:
      String(rawVideo.overview || rawVideo.outline || '').trim() ||
      `${params.title} ders materyali ${repairedScenes.length} yapılandırılmış bölümde incelenmektedir.`,
    videoScript: repairedScenes.map((s) => String(s.narration || '')).join('\n\n'),
    totalEstimatedDurationSec: repairedScenes.length * 60,
    scenes: repairedScenes,
    keyFacts:
      keyFacts.length > 0
        ? keyFacts
        : repairedScenes.map((s) => String(s.examTip || '')).filter(Boolean).slice(0, 6),
    examQuestions: validatedExamQs,
    extractionNotices: mergedNotices.length > 0 ? mergedNotices : undefined,
    metadata: {
      ...(rawVideo.metadata && typeof rawVideo.metadata === 'object'
        ? (rawVideo.metadata as Record<string, unknown>)
        : {}),
      sourceFingerprint: params.sourceFingerprint,
      analyzedCourses: params.analyzedCourses,
      isMultiCourse: params.isMultiCourse,
      qualityVerified: true,
    },
  };
}
