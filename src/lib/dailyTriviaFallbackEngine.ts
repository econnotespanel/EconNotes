import { supabase } from '@/integrations/supabase/client';
import {
  CURATED_TRIVIA_BANK,
  TRIVIA_CATEGORIES,
  type TriviaCategory,
  type TriviaDifficulty,
  type TriviaQuestionRecord,
} from '@/lib/dailyTriviaQuestionBank';
import { EXTRA_TRIVIA_BANK } from '@/lib/dailyTriviaQuestionBankExtra';
import type {
  TriviaAnswerRecord,
  TriviaAnswerResponse,
  TriviaAttemptSummary,
  TriviaFinishResponse,
  TriviaHeartbeatResponse,
  TriviaLeaveResponse,
  TriviaQuestionClient,
  TriviaReturnResponse,
  TriviaSessionStatus,
  TriviaStartResponse,
  TriviaStatusResponse,
} from '@/lib/dailyTrivia';

export const ALL_CURATED_TRIVIA_BANK: TriviaQuestionRecord[] = [
  ...CURATED_TRIVIA_BANK,
  ...EXTRA_TRIVIA_BANK,
];

const TOTAL_QUESTIONS = 15;
const XP_PER_CORRECT = 25;
const MAX_AWAY_MS = 5000; // Strict 5-second return window
const SILENT_INACTIVITY_MS = 15_000; // Catch force-killed / background-frozen PWAs without pagehide
const GRAND_PRIZE_DURATION_MS = 2 * 60 * 60 * 1000; // 2 hours real-time
const TIME_LIMIT_MS = 15 * 60 * 1000; // 15 minutes total for all 15 questions
const TIME_GRACE_MS = 4000; // network latency tolerance for the final answer / auto-finish
const LEAVE_STORAGE_PREFIX = 'econnotes_trivia_leave_ts_';
const RUN_MIRROR_PREFIX = 'econnotes_trivia_run_mirror_';
const DAILY_ASSIGNED_PREFIX = 'econnotes_trivia_day_assigned_';
const DISJOINT_BUCKET_COUNT = 22; // 45 per category / 2 per category = 22 completely disjoint daily buckets

interface CompactStoredAnswer {
  i: number;
  s: number;
  /** Yalnızca yarışma sonuçlandığında hesaplanır */
  c?: boolean;
  x?: number;
}

interface StoredAttemptMeta {
  id: string;
  sessionToken?: string;
  quizDate: string;
  status: TriviaSessionStatus;
  questionIds: string[];
  currentIndex: number;
  answeredCount: number;
  correctCount: number;
  xpEarned: number;
  xpCredited?: boolean;
  rewardTransactionId?: string | null;
  grandPrizeAwarded: boolean;
  unlimitedExpiresAt: string | null;
  cancelReason: string | null;
  startedAt: string;
  completedAt: string | null;
  cancelledAt: string | null;
  leaveStartedAt: number | null;
  graceExpiresAt?: number | null;
  lastActivityAt?: number;
  lastHeartbeatAt?: number | null;
  timedOut?: boolean;
  updatedAt?: number;
  answers: CompactStoredAnswer[];
}

interface PendingXpEntry {
  reason: string;
  amount: number;
}

const QUESTION_BY_ID = new Map<string, TriviaQuestionRecord>(
  ALL_CURATED_TRIVIA_BANK.map((q) => [q.id, q]),
);

const TRIVIA_STOPWORDS = new Set([
  've', 'veya', 'ile', 'icin', 'olan', 'olarak', 'bir', 'bu', 'su', 'o', 'da', 'de',
  'hangi', 'hangisi', 'hangisidir', 'hangileridir', 'kimdir', 'nedir', 'kac', 'nerede',
  'asagidakilerden', 'asagidaki', 'yilda', 'yilinda', 'tarihte', 'dunyanin', 'turkiyenin',
  'ad', 'verilir', 'tarafindan', 'olarak', 'bilinen', 'en', 'ilk', 'yer', 'alir', 'bulunur',
]);

function foldTr(text: string): string {
  return String(text || '')
    .toLocaleLowerCase('tr-TR')
    .replace(/ç/g, 'c')
    .replace(/ğ/g, 'g')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ş/g, 's')
    .replace(/ü/g, 'u')
    .replace(/â/g, 'a')
    .replace(/î/g, 'i')
    .replace(/û/g, 'u')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function triviaTokenSet(text: string): Set<string> {
  const out = new Set<string>();
  for (const w of foldTr(text).split(' ')) {
    if (w.length < 3 || TRIVIA_STOPWORDS.has(w)) continue;
    out.add(w);
    if (w.length >= 6) out.add(w.slice(0, 6));
  }
  return out;
}

/**
 * Checks whether two general-knowledge questions test the same underlying fact or are paraphrases.
 */
export function areTriviaQuestionsSemanticallySimilar(
  a: Pick<TriviaQuestionRecord, 'category' | 'question' | 'options' | 'correctIndex'>,
  b: Pick<TriviaQuestionRecord, 'category' | 'question' | 'options' | 'correctIndex'>,
): boolean {
  const normA = foldTr(a.question);
  const normB = foldTr(b.question);
  if (!normA || !normB) return false;
  if (normA === normB) return true;

  const ansA = foldTr(a.options[a.correctIndex] || '');
  const ansB = foldTr(b.options[b.correctIndex] || '');
  const setA = triviaTokenSet(a.question);
  const setB = triviaTokenSet(b.question);

  let inter = 0;
  for (const t of setA) {
    if (setB.has(t)) inter++;
  }
  const union = setA.size + setB.size - inter;
  const jaccard = union > 0 ? inter / union : 0;

  const ansOverlap =
    ansA.length >= 4 &&
    ansB.length >= 4 &&
    (ansA === ansB || ansA.includes(ansB) || ansB.includes(ansA));

  // Same/overlapping canonical answer + stem overlap -> testing the same underlying fact
  if (a.category === b.category && ansOverlap && jaccard >= 0.25) {
    return true;
  }
  if (ansOverlap && jaccard >= 0.35) {
    return true;
  }
  // Near-identical paraphrased wording regardless of answer formatting
  if (jaccard >= 0.72) return true;
  return false;
}

function readDailyAssignedIds(quizDate: string): Set<string> {
  try {
    const raw = localStorage.getItem(`${DAILY_ASSIGNED_PREFIX}${quizDate}`);
    if (!raw) return new Set<string>();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set<string>(parsed.filter((x): x is string => typeof x === 'string')) : new Set<string>();
  } catch {
    return new Set<string>();
  }
}

function recordDailyAssignedIds(quizDate: string, ids: string[]): void {
  try {
    const existing = readDailyAssignedIds(quizDate);
    for (const id of ids) existing.add(id);
    // Keep bounded to today's bank size
    const arr = Array.from(existing).slice(-ALL_CURATED_TRIVIA_BANK.length);
    localStorage.setItem(`${DAILY_ASSIGNED_PREFIX}${quizDate}`, JSON.stringify(arr));
  } catch {
    // ignore storage errors
  }
}

// In-memory cache of active run + base points to avoid unnecessary Auth/DB churn on Q1..Q14
const activeRunCache = new Map<string, StoredAttemptMeta>();
const basePointsCache = new Map<string, number>();

export function getIstanbulDateParts(now = new Date()): { dateStr: string; resetsAtIso: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);

  const y = Number(parts.find((p) => p.type === 'year')?.value ?? now.getUTCFullYear());
  const m = Number(parts.find((p) => p.type === 'month')?.value ?? now.getUTCMonth() + 1);
  const d = Number(parts.find((p) => p.type === 'day')?.value ?? now.getUTCDate());

  const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  // Next midnight in Europe/Istanbul (permanent UTC+03:00)
  const tomorrowUtc = new Date(Date.UTC(y, m - 1, d + 1, 0, 0, 0) - 3 * 60 * 60 * 1000);
  return { dateStr, resetsAtIso: tomorrowUtc.toISOString() };
}

function dateSeed(seedStr: string): number {
  let h = 2166136261;
  for (let i = 0; i < seedStr.length; i++) {
    h ^= seedStr.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seededShuffle<T>(items: T[], seed: number): T[] {
  const arr = [...items];
  let s = seed || 1;
  for (let i = arr.length - 1; i > 0; i--) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const j = s % (i + 1);
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

function orderProgressively(questions: TriviaQuestionRecord[]): TriviaQuestionRecord[] {
  const rank: Record<TriviaDifficulty, number> = { easy: 0, medium: 1, hard: 2 };
  return [...questions].sort((a, b) => rank[a.difficulty] - rank[b.difficulty]);
}

/**
 * Selects 15 balanced, unique general-knowledge questions across all 8 domains
 * specifically personalized per user + date using 22 disjoint daily buckets across the 360-question pool,
 * strictly excluding:
 * - questions this user already encountered on prior days (`usedIds`),
 * - questions already assigned to other users today (`excludeTodayIds`),
 * - and semantically similar / same-fact duplicates.
 */
export function selectDailyQuestionsForDate(
  dateStr: string,
  usedIds: Iterable<string>,
  userId = 'default-user',
  excludeTodayIds?: Iterable<string>,
): TriviaQuestionRecord[] {
  const daySeed = dateSeed(dateStr);
  const userSeed = dateSeed(`${dateStr}::user::${userId}`);
  const usedSet = new Set<string>(usedIds);
  const todayExcludedSet = new Set<string>(excludeTodayIds || []);
  const picked: TriviaQuestionRecord[] = [];
  const pickedIds = new Set<string>();

  const pastRecords = Array.from(usedSet)
    .map((id) => QUESTION_BY_ID.get(id))
    .filter((q): q is TriviaQuestionRecord => Boolean(q));

  const isSemanticallyBlocked = (cand: TriviaQuestionRecord, checkPast: boolean): boolean => {
    if (picked.some((p) => areTriviaQuestionsSemanticallySimilar(p, cand))) return true;
    if (checkPast && pastRecords.some((p) => areTriviaQuestionsSemanticallySimilar(p, cand))) return true;
    return false;
  };

  // Partition each category's 45 questions into 22 completely disjoint 2-question buckets per day
  const categoryPools = new Map<TriviaCategory, TriviaQuestionRecord[]>();
  for (const cat of TRIVIA_CATEGORIES) {
    const catItems = ALL_CURATED_TRIVIA_BANK.filter((q) => q.category === cat);
    categoryPools.set(cat, seededShuffle(catItems, daySeed ^ dateSeed(cat)));
  }

  // Pick a user-specific disjoint bucket (stepping cleanly if any item in this bucket was assigned today on device)
  let bucket = userSeed % DISJOINT_BUCKET_COUNT;
  if (todayExcludedSet.size > 0) {
    for (let step = 0; step < DISJOINT_BUCKET_COUNT; step++) {
      const candBucket = (bucket + step) % DISJOINT_BUCKET_COUNT;
      let collisions = 0;
      for (const cat of TRIVIA_CATEGORIES) {
        const pool = categoryPools.get(cat) || [];
        const q1 = pool[candBucket * 2];
        const q2 = pool[candBucket * 2 + 1];
        if ((q1 && todayExcludedSet.has(q1.id)) || (q2 && todayExcludedSet.has(q2.id))) {
          collisions++;
        }
      }
      if (collisions === 0) {
        bucket = candBucket;
        break;
      }
    }
  }

  // Rotate category order uniquely per user so the 1-question category also varies across users
  const rotatedCategories = seededShuffle(TRIVIA_CATEGORIES, userSeed ^ 0x517cc1b7);
  const catTargets = new Map<TriviaCategory, number>();
  rotatedCategories.forEach((cat, idx) => {
    catTargets.set(cat, idx < 7 ? 2 : 1); // 7*2 + 1 = 15 across all 8 domains
  });

  // Pass 1: Draw directly from this user's disjoint daily bucket first (guarantees 0/15 overlap across different users!)
  for (const cat of rotatedCategories) {
    const target = catTargets.get(cat) || 1;
    const pool = categoryPools.get(cat) || [];
    let got = 0;
    const bucketIndices = [bucket * 2, bucket * 2 + 1];
    for (const bi of bucketIndices) {
      if (got >= target || picked.length >= TOTAL_QUESTIONS) break;
      const cand = pool[bi];
      if (
        cand &&
        !usedSet.has(cand.id) &&
        !todayExcludedSet.has(cand.id) &&
        !pickedIds.has(cand.id) &&
        !isSemanticallyBlocked(cand, true)
      ) {
        pickedIds.add(cand.id);
        picked.push(cand);
        got++;
      }
    }

    // If bucket item was seen on a previous day or claimed today, draw next unused item in this category starting after bucket
    if (got < target) {
      const startOffset = (bucket * 2 + 2) % Math.max(1, pool.length);
      for (let off = 0; off < pool.length && got < target && picked.length < TOTAL_QUESTIONS; off++) {
        const cand = pool[(startOffset + off) % pool.length];
        if (
          cand &&
          !usedSet.has(cand.id) &&
          !todayExcludedSet.has(cand.id) &&
          !pickedIds.has(cand.id) &&
          !isSemanticallyBlocked(cand, true)
        ) {
          pickedIds.add(cand.id);
          picked.push(cand);
          got++;
        }
      }
    }
  }

  // Pass 2: Any remaining unused & unclaimed question from full 360-question bank (user-seeded order)
  const userShuffledAll = seededShuffle(ALL_CURATED_TRIVIA_BANK, userSeed ^ 0x9e3779b9);
  if (picked.length < TOTAL_QUESTIONS) {
    for (const cand of userShuffledAll) {
      if (picked.length >= TOTAL_QUESTIONS) break;
      if (
        !usedSet.has(cand.id) &&
        !todayExcludedSet.has(cand.id) &&
        !pickedIds.has(cand.id) &&
        !isSemanticallyBlocked(cand, false)
      ) {
        pickedIds.add(cand.id);
        picked.push(cand);
      }
    }
  }

  // Pass 3: If today's 360-question pool was exhausted (>24 users offline), pick distinct user-salted subset avoiding past history
  if (picked.length < TOTAL_QUESTIONS) {
    for (const cand of userShuffledAll) {
      if (picked.length >= TOTAL_QUESTIONS) break;
      if (!usedSet.has(cand.id) && !pickedIds.has(cand.id) && !isSemanticallyBlocked(cand, false)) {
        pickedIds.add(cand.id);
        picked.push(cand);
      }
    }
  }

  // Pass 4: Only after a single user has seen all 360 questions across 24+ days, recycle cleanly
  if (picked.length < TOTAL_QUESTIONS) {
    for (const cand of userShuffledAll) {
      if (picked.length >= TOTAL_QUESTIONS) break;
      if (!pickedIds.has(cand.id)) {
        pickedIds.add(cand.id);
        picked.push(cand);
      }
    }
  }

  return orderProgressively(picked).slice(0, TOTAL_QUESTIONS);
}

function sanitizeQuestions(questions: TriviaQuestionRecord[]): TriviaQuestionClient[] {
  return questions.map((q, index) => ({
    index,
    category: q.category,
    difficulty: q.difficulty,
    question: q.question,
    options: q.options,
  }));
}

function getCancelMessage(reason: string | null | undefined): string {
  switch (reason) {
    case 'page_reloaded':
      return 'Yarışma devam ederken bağlantı/oturum kuralı ihlal edildiği için katılımınız iptal edildi.';
    case 'inactivity_over_5s':
      return 'Yarışma oturumu uzun süre arka planda/pasif kaldığı için güvenlik kuralı gereği iptal edildi.';
    case 'away_over_5s':
    case 'left_screen_over_5s':
      return 'Yarışma sırasında 5 saniye içerisinde geri dönülmediği için katılımınız iptal edildi.';
    case 'navigated_away':
      return 'Yarışma ekranından çıkıldığı ve 5 saniye içerisinde geri dönülmediği için katılımınız iptal edildi.';
    default:
      return 'Yarışma sırasında 5 saniye içerisinde geri dönülmediği için katılımınız iptal edildi.';
  }
}

function isTerminalStatus(status: TriviaSessionStatus): boolean {
  return status === 'cancelled' || status === 'completed' || status === 'expired';
}

function cacheKey(userId: string, quizDate: string): string {
  return `${userId}_${quizDate}`;
}

function readLocalLeaveTs(userId: string, quizDate: string): number | null {
  try {
    const raw = localStorage.getItem(`${LEAVE_STORAGE_PREFIX}${userId}_${quizDate}`);
    if (!raw) return null;
    const num = Number(raw);
    return Number.isFinite(num) && num > 0 ? num : null;
  } catch {
    return null;
  }
}

function writeLocalLeaveTs(userId: string, quizDate: string, ts: number | null): void {
  try {
    const key = `${LEAVE_STORAGE_PREFIX}${userId}_${quizDate}`;
    if (ts && ts > 0) {
      localStorage.setItem(key, String(ts));
    } else {
      localStorage.removeItem(key);
    }
  } catch {
    // ignore storage errors
  }
}

function readLocalRunMirror(userId: string, quizDate: string): StoredAttemptMeta | null {
  try {
    const raw = localStorage.getItem(`${RUN_MIRROR_PREFIX}${userId}_${quizDate}`);
    if (!raw) return null;
    return parseStoredAttempt(JSON.parse(raw), quizDate);
  } catch {
    return null;
  }
}

function writeLocalRunMirror(userId: string, quizDate: string, att: StoredAttemptMeta | null): void {
  const key = cacheKey(userId, quizDate);
  if (att) {
    activeRunCache.set(key, att);
  } else {
    activeRunCache.delete(key);
  }
  try {
    const lsKey = `${RUN_MIRROR_PREFIX}${userId}_${quizDate}`;
    if (att) {
      localStorage.setItem(lsKey, JSON.stringify(att));
    } else {
      localStorage.removeItem(lsKey);
    }
  } catch {
    // ignore storage errors
  }
}

export function recordFallbackLeaveLocally(userId: string | null, _reason = 'left_screen'): void {
  if (!userId) return;
  const { dateStr } = getIstanbulDateParts(new Date());
  const cached = activeRunCache.get(cacheKey(userId, dateStr)) || readLocalRunMirror(userId, dateStr);
  if (cached && isTerminalStatus(cached.status)) {
    return;
  }
  const existing = readLocalLeaveTs(userId, dateStr) ?? cached?.leaveStartedAt ?? null;
  const stamp = existing ?? Date.now();
  const graceExpiresAt = cached?.graceExpiresAt ?? stamp + MAX_AWAY_MS;
  writeLocalLeaveTs(userId, dateStr, stamp);
  if (cached && (cached.status === 'in_progress' || cached.status === 'grace_period')) {
    const next: StoredAttemptMeta = {
      ...cached,
      status: 'grace_period',
      leaveStartedAt: stamp,
      graceExpiresAt,
      updatedAt: Date.now(),
    };
    writeLocalRunMirror(userId, dateStr, next);
    persistLatest.set(userId, next);
  }
}

function parseStoredAttempt(raw: unknown, quizDate: string): StoredAttemptMeta | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  if (obj.quizDate !== quizDate) return null;
  const status = obj.status;
  if (
    status !== 'not_started' &&
    status !== 'in_progress' &&
    status !== 'grace_period' &&
    status !== 'completed' &&
    status !== 'cancelled' &&
    status !== 'expired'
  ) {
    return null;
  }
  const questionIds = Array.isArray(obj.questionIds)
    ? obj.questionIds.filter((id): id is string => typeof id === 'string' && QUESTION_BY_ID.has(id))
    : [];
  const answers = Array.isArray(obj.answers)
    ? (obj.answers as CompactStoredAnswer[])
        .filter(
          (a) =>
            a &&
            Number.isInteger(a.i) &&
            a.i >= 0 &&
            a.i < TOTAL_QUESTIONS &&
            Number.isInteger(a.s) &&
            a.s >= 0 &&
            a.s <= 3,
        )
        .map((a) => ({
          i: a.i,
          s: a.s,
          ...(typeof a.c === 'boolean' ? { c: a.c } : {}),
          ...(typeof a.x === 'number' ? { x: a.x } : {}),
        }))
    : [];

  const leaveStartedAt = typeof obj.leaveStartedAt === 'number' ? obj.leaveStartedAt : null;
  const graceExpiresAt =
    typeof obj.graceExpiresAt === 'number'
      ? obj.graceExpiresAt
      : leaveStartedAt !== null
        ? leaveStartedAt + MAX_AWAY_MS
        : null;

  return {
    id: typeof obj.id === 'string' ? obj.id : `trivia-${quizDate}`,
    sessionToken: typeof obj.sessionToken === 'string' ? obj.sessionToken : undefined,
    quizDate,
    status,
    questionIds,
    currentIndex: Math.max(0, Math.min(TOTAL_QUESTIONS - 1, Number(obj.currentIndex) || 0)),
    answeredCount: answers.length,
    correctCount: Math.max(0, Math.min(TOTAL_QUESTIONS, Number(obj.correctCount) || 0)),
    xpEarned: Math.max(0, Math.min(TOTAL_QUESTIONS * XP_PER_CORRECT, Number(obj.xpEarned) || 0)),
    xpCredited: typeof obj.xpCredited === 'boolean' ? obj.xpCredited : status === 'completed',
    rewardTransactionId: typeof obj.rewardTransactionId === 'string' ? obj.rewardTransactionId : null,
    grandPrizeAwarded: Boolean(obj.grandPrizeAwarded),
    unlimitedExpiresAt: typeof obj.unlimitedExpiresAt === 'string' ? obj.unlimitedExpiresAt : null,
    cancelReason: typeof obj.cancelReason === 'string' ? obj.cancelReason : null,
    startedAt: typeof obj.startedAt === 'string' ? obj.startedAt : new Date().toISOString(),
    completedAt: typeof obj.completedAt === 'string' ? obj.completedAt : null,
    cancelledAt: typeof obj.cancelledAt === 'string' ? obj.cancelledAt : null,
    leaveStartedAt,
    graceExpiresAt,
    lastActivityAt: typeof obj.lastActivityAt === 'number' ? obj.lastActivityAt : Date.now(),
    lastHeartbeatAt: typeof obj.lastHeartbeatAt === 'number' ? obj.lastHeartbeatAt : null,
    timedOut: Boolean(obj.timedOut),
    updatedAt: typeof obj.updatedAt === 'number' ? obj.updatedAt : 0,
    answers,
  };
}

function getDeadlineMs(att: Pick<StoredAttemptMeta, 'startedAt'>): number {
  const started = Date.parse(att.startedAt);
  return (Number.isFinite(started) ? started : Date.now()) + TIME_LIMIT_MS;
}

function toAttemptSummary(att: StoredAttemptMeta): TriviaAttemptSummary {
  const done = att.status === 'completed';
  return {
    id: att.id,
    sessionToken: att.sessionToken || att.id,
    status: att.status,
    currentIndex: att.currentIndex,
    answeredCount: att.answers.length,
    correctCount: done ? att.correctCount : 0,
    wrongCount: done ? att.answers.length - att.correctCount : 0,
    blankCount: done ? TOTAL_QUESTIONS - att.answers.length : 0,
    xpEarned: done ? att.xpEarned : 0,
    xpCredited: Boolean(att.xpCredited),
    rewardTransactionId: att.rewardTransactionId ?? null,
    grandPrizeAwarded: att.grandPrizeAwarded,
    unlimitedExpiresAt: att.unlimitedExpiresAt,
    leaveStartedAt: att.leaveStartedAt ? new Date(att.leaveStartedAt).toISOString() : null,
    graceExpiresAt: att.graceExpiresAt ? new Date(att.graceExpiresAt).toISOString() : null,
    lastActivityAt: att.lastActivityAt ? new Date(att.lastActivityAt).toISOString() : att.startedAt,
    cancelReason: att.cancelReason,
    cancelMessage:
      att.status === 'cancelled'
        ? getCancelMessage(att.cancelReason)
        : att.status === 'expired'
          ? '15 dakikalık yarışma süresi dolduğu için oturum sonlandı.'
          : null,
    startedAt: att.startedAt,
    deadlineAt: new Date(getDeadlineMs(att)).toISOString(),
    timeLimitSec: TIME_LIMIT_MS / 1000,
    timedOut: Boolean(att.timedOut),
    completedAt: att.completedAt,
    cancelledAt: att.cancelledAt,
  };
}

// Cevapları arka planda (birleştirilmiş/sıralı) sunucuya yazan kuyruk. Yerel yansıma her cevapta senkron yazılır.
const persistChains = new Map<string, Promise<void>>();
const persistQueued = new Set<string>();
const persistLatest = new Map<string, StoredAttemptMeta>();

function scheduleAttemptPersist(userId: string, att: StoredAttemptMeta): void {
  persistLatest.set(userId, att);
  if (persistQueued.has(userId)) return;
  persistQueued.add(userId);
  const prev = persistChains.get(userId) ?? Promise.resolve();
  const next = prev.then(async () => {
    persistQueued.delete(userId);
    const state = persistLatest.get(userId);
    if (!state) return;
    // Guard: NEVER allow a stale in_progress write to overwrite grace_period or any terminal state!
    const live = activeRunCache.get(cacheKey(userId, state.quizDate));
    if (live && (live.status !== 'in_progress' || isTerminalStatus(live.status))) {
      return;
    }
    if (state.status !== 'in_progress') return;
    try {
      await supabase.auth.updateUser({ data: { daily_trivia_state: state } });
    } catch {
      // yerel yansıma güvende; bir sonraki cevapta / bitişte yeniden denenir
    }
  });
  persistChains.set(userId, next);
}

async function drainAttemptPersist(userId: string): Promise<void> {
  try {
    await (persistChains.get(userId) ?? Promise.resolve());
  } catch {
    // ignore
  }
}

function resolveQuestionSet(
  questionIds: string[],
  quizDate: string,
  usedIds: string[],
  userId: string,
): TriviaQuestionRecord[] {
  if (questionIds.length === TOTAL_QUESTIONS) {
    const mapped = questionIds
      .map((id) => QUESTION_BY_ID.get(id))
      .filter((q): q is TriviaQuestionRecord => Boolean(q));
    if (mapped.length === TOTAL_QUESTIONS) return mapped;
  }
  return selectDailyQuestionsForDate(quizDate, usedIds, userId);
}

/**
 * Credits verified XP via the live `public.award_points` PostgreSQL SECURITY DEFINER RPC.
 * Uses unique per-question reason keys (`mission_trivia_YYYYMMDD_qNN`) which are
 * deduplicated server-side by PostgreSQL for 7 days so the same question can never award XP twice.
 */
async function flushTriviaXpEntries(
  entries: PendingXpEntry[],
  fallbackPointsTotal: number,
): Promise<{ totalPoints: number; remainingPending: PendingXpEntry[]; creditedXp: number }> {
  let latestTotal = fallbackPointsTotal;
  const remaining: PendingXpEntry[] = [];
  let creditedXp = 0;

  for (const entry of entries) {
    if (!entry.reason || entry.amount <= 0) continue;
    try {
      const { data, error } = await (supabase as any).rpc('award_points', {
        _reason: entry.reason,
        _amount: entry.amount,
      });
      if (!error && typeof data === 'number') {
        latestTotal = data;
        creditedXp += entry.amount;
      } else {
        const msg = String(error?.message || '').toLocaleLowerCase('tr-TR');
        if (msg.includes('zaten alındı')) {
          continue;
        }
        // e.g. daily 300-pt cap on legacy award_points RPC — preserve for automatic next-window sync
        remaining.push(entry);
      }
    } catch {
      remaining.push(entry);
    }
  }

  return { totalPoints: latestTotal, remainingPending: remaining, creditedXp };
}

function isNetworkFailureError(err: unknown): boolean {
  const msg = String((err as { message?: string } | null)?.message || err || '').toLowerCase();
  return (
    msg.includes('failed to fetch') ||
    msg.includes('networkerror') ||
    msg.includes('network request failed') ||
    msg.includes('load failed') ||
    msg.includes('timeout')
  );
}

export function resetFallbackEngineMemory(): void {
  activeRunCache.clear();
  basePointsCache.clear();
  persistChains.clear();
  persistQueued.clear();
  persistLatest.clear();
}

/** Bekleyen arka plan kayıtlarının bitmesini bekler (test ve bitiş akışı için). */
export async function flushPendingTriviaWrites(userId: string): Promise<void> {
  await drainAttemptPersist(userId);
}

/**
 * Live Supabase-backed Daily Trivia engine used transparently when the dedicated
 * `daily-trivia` Edge Function / SQL migration is not yet deployed on the Supabase project.
 *
 * Uses ONLY real live authenticated Supabase APIs:
 * - `supabase.auth.getUser()` / `supabase.auth.updateUser()` (server-persisted session, 1/day lock,
 *   used question history, 2-hour unlimited pass timestamp, perfect win count)
 * - `public.user_points` (real user XP balance)
 * - `public.award_points` SECURITY DEFINER PostgreSQL RPC (server-deduplicated XP crediting)
 */
export async function runDailyTriviaSupabaseEngine<T>(
  body: Record<string, unknown>,
): Promise<{ data: T | null; error: string | null; status?: number; raw?: Record<string, unknown> }> {
  const action = String(body.action || 'status');
  const { dateStr: quizDate, resetsAtIso } = getIstanbulDateParts(new Date());

  // Fast-path for mid-quiz actions (`answer` Q1..Q14, `report_leave`, `report_return` within 5s)
  // still verifies active session without hitting Auth rate limits on every click.
  let authUser;
  try {
    if (action === 'answer' || action === 'report_leave' || action === 'report_return' || action === 'heartbeat') {
      const { data: sessData } = await supabase.auth.getSession();
      authUser = sessData.session?.user ?? null;
    }
    if (!authUser) {
      const { data, error } = await supabase.auth.getUser();
      if (error) {
        if (isNetworkFailureError(error)) {
          return { data: null, error: 'Sunucuya bağlanılamadı. İnternet bağlantınızı kontrol edin.' };
        }
        const refreshed = await supabase.auth.refreshSession().catch(() => ({ data: { user: null } }));
        authUser = refreshed.data.user;
      } else {
        authUser = data.user;
      }
    }
  } catch (err) {
    if (isNetworkFailureError(err)) {
      return { data: null, error: 'Sunucuya bağlanılamadı. İnternet bağlantınızı kontrol edin.' };
    }
    return { data: null, error: 'Oturum doğrulanamadı. Lütfen yeniden giriş yapın.', status: 401 };
  }

  if (!authUser) {
    return { data: null, error: 'Oturum bulunamadı. Lütfen yeniden giriş yapın.', status: 401 };
  }

  const userId = authUser.id;
  const cKey = cacheKey(userId, quizDate);
  const meta = (authUser.user_metadata || {}) as Record<string, unknown>;

  // Fetch live points from PostgreSQL `user_points` on status/start/cancel (cached during Q1..Q14)
  let currentUserPoints = basePointsCache.get(userId) ?? 0;
  if (action === 'status' || action === 'start' || action === 'cancel' || !basePointsCache.has(userId)) {
    try {
      const { data: ptsRow, error: ptsErr } = await supabase
        .from('user_points')
        .select('points')
        .eq('user_id', userId)
        .maybeSingle();
      if (ptsErr && isNetworkFailureError(ptsErr)) {
        return { data: null, error: 'Sunucuya bağlanılamadı. İnternet bağlantınızı kontrol edin.' };
      }
      currentUserPoints = Number((ptsRow as { points?: number } | null)?.points ?? 0);
      basePointsCache.set(userId, currentUserPoints);
    } catch (err) {
      if (isNetworkFailureError(err)) {
        return { data: null, error: 'Sunucuya bağlanılamadı. İnternet bağlantınızı kontrol edin.' };
      }
    }
  }

  // Recover any pending overflow XP from an earlier 300/day cap automatically on status load
  const rawPendingXp = Array.isArray(meta.daily_trivia_pending_xp)
    ? (meta.daily_trivia_pending_xp as PendingXpEntry[]).filter(
        (p) => p && typeof p.reason === 'string' && typeof p.amount === 'number' && p.amount > 0,
      )
    : [];
  let remainingPendingXp = rawPendingXp;

  if (action === 'status' && rawPendingXp.length > 0) {
    const flushed = await flushTriviaXpEntries(rawPendingXp, currentUserPoints);
    currentUserPoints = flushed.totalPoints;
    basePointsCache.set(userId, currentUserPoints);
    remainingPendingXp = flushed.remainingPending;
    if (flushed.creditedXp > 0) {
      await supabase.auth
        .updateUser({ data: { daily_trivia_pending_xp: remainingPendingXp } })
        .catch(() => {});
    }
  }

  const usedIds: string[] = Array.isArray(meta.daily_trivia_used_ids)
    ? (meta.daily_trivia_used_ids as unknown[]).filter((x): x is string => typeof x === 'string')
    : [];

  // Reconcile server-stored attempt with active in-memory/local mirror for today's run.
  // INVARIANT: Terminal statuses (cancelled / completed / expired) NEVER revert to active!
  const serverAttempt = parseStoredAttempt(meta.daily_trivia_state, quizDate);
  const mirrorAttempt = activeRunCache.get(cKey) || readLocalRunMirror(userId, quizDate);

  let attempt: StoredAttemptMeta | null = serverAttempt;
  if (serverAttempt && isTerminalStatus(serverAttempt.status)) {
    attempt = serverAttempt;
    writeLocalRunMirror(userId, quizDate, serverAttempt);
    writeLocalLeaveTs(userId, quizDate, null);
  } else if (serverAttempt && mirrorAttempt && mirrorAttempt.id === serverAttempt.id) {
    if (isTerminalStatus(mirrorAttempt.status)) {
      attempt = mirrorAttempt;
    } else {
      const base =
        (mirrorAttempt.updatedAt ?? 0) >= (serverAttempt.updatedAt ?? 0) ? mirrorAttempt : serverAttempt;
      const leaveCandidates = [
        serverAttempt.leaveStartedAt,
        mirrorAttempt.leaveStartedAt,
        readLocalLeaveTs(userId, quizDate),
      ].filter((v): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0);
      const earliestLeave = leaveCandidates.length > 0 ? Math.min(...leaveCandidates) : null;
      if (earliestLeave !== null) {
        attempt = {
          ...base,
          status: 'grace_period',
          leaveStartedAt: earliestLeave,
          graceExpiresAt: earliestLeave + MAX_AWAY_MS,
        };
      } else {
        attempt = base;
      }
    }
  } else if (!serverAttempt && mirrorAttempt) {
    attempt = mirrorAttempt;
  }

  const perfectWinsCount = Math.max(0, Number(meta.trivia_perfect_wins || 0));
  const rawUnlimited =
    typeof meta.trivia_unlimited_until === 'string' ? meta.trivia_unlimited_until : null;
  let activeUnlimitedUntil =
    rawUnlimited && Date.parse(rawUnlimited) > Date.now() ? rawUnlimited : null;

  const localLeaveTs = readLocalLeaveTs(userId, quizDate);
  const effectiveLeaveTs =
    attempt && (attempt.status === 'in_progress' || attempt.status === 'grace_period')
      ? (() => {
          const vals = [attempt.leaveStartedAt, localLeaveTs].filter(
            (v): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0,
          );
          return vals.length > 0 ? Math.min(...vals) : null;
        })()
      : null;

  const effectiveGraceExpiresAt =
    effectiveLeaveTs !== null
      ? Math.min(
          attempt?.graceExpiresAt ?? effectiveLeaveTs + MAX_AWAY_MS,
          effectiveLeaveTs + MAX_AWAY_MS,
        )
      : null;

  const persistMetaToServer = async (patch: Record<string, unknown>) => {
    await drainAttemptPersist(userId);
    const { error: updErr } = await supabase.auth.updateUser({ data: patch });
    if (updErr && isNetworkFailureError(updErr)) {
      throw new Error('Sunucuya bağlanılamadı. İnternet bağlantınızı kontrol edin.');
    }
  };

  const cancelAttempt = async (reason: string): Promise<StoredAttemptMeta> => {
    const base = attempt as StoredAttemptMeta;
    if (base.status === 'completed') return base;
    if (base.status === 'cancelled') return base;

    const nowIso = new Date().toISOString();
    writeLocalLeaveTs(userId, quizDate, null);
    const next: StoredAttemptMeta = {
      ...base,
      status: 'cancelled',
      xpEarned: 0,
      xpCredited: false,
      rewardTransactionId: null,
      correctCount: 0,
      grandPrizeAwarded: false,
      unlimitedExpiresAt: null,
      leaveStartedAt: null,
      graceExpiresAt: null,
      cancelReason: reason,
      cancelledAt: nowIso,
      updatedAt: Date.now(),
    };
    attempt = next;
    persistLatest.set(userId, next);
    writeLocalRunMirror(userId, quizDate, next);
    await persistMetaToServer({
      daily_trivia_state: next,
    });
    return next;
  };

  const expireAttempt = async (): Promise<StoredAttemptMeta> => {
    const base = attempt as StoredAttemptMeta;
    if (isTerminalStatus(base.status)) return base;
    const nowIso = new Date().toISOString();
    writeLocalLeaveTs(userId, quizDate, null);
    const next: StoredAttemptMeta = {
      ...base,
      status: 'expired',
      xpEarned: 0,
      xpCredited: false,
      rewardTransactionId: null,
      correctCount: 0,
      grandPrizeAwarded: false,
      unlimitedExpiresAt: null,
      leaveStartedAt: null,
      graceExpiresAt: null,
      cancelReason: 'time_expired',
      timedOut: true,
      completedAt: nowIso,
      updatedAt: Date.now(),
    };
    attempt = next;
    persistLatest.set(userId, next);
    writeLocalRunMirror(userId, quizDate, next);
    await persistMetaToServer({
      daily_trivia_state: next,
    });
    return next;
  };

  const enforceSilentInactivity = async (): Promise<boolean> => {
    if (!attempt || attempt.status !== 'in_progress') return false;
    if (attempt.lastHeartbeatAt && Date.now() - attempt.lastHeartbeatAt > SILENT_INACTIVITY_MS) {
      await cancelAttempt('inactivity_over_5s');
      return true;
    }
    return false;
  };

  const buildAnswerRecords = (att: StoredAttemptMeta, reveal: boolean): TriviaAnswerRecord[] => {
    if (!reveal) {
      return att.answers.map((a) => ({ questionIndex: a.i, selectedOption: a.s }));
    }
    const fullSet = resolveQuestionSet(att.questionIds, quizDate, usedIds, userId);
    return att.answers.map((a) => {
      const qObj = fullSet[a.i];
      return {
        questionIndex: a.i,
        selectedOption: a.s,
        isCorrect: Boolean(a.c),
        xpAwarded: a.x ?? 0,
        correctIndex: qObj?.correctIndex,
        explanation: qObj?.explanation,
      };
    });
  };

  const buildFinishPayload = (att: StoredAttemptMeta): TriviaFinishResponse => ({
    attempt: toAttemptSummary(att),
    answers: buildAnswerRecords(att, true),
    correctCount: att.correctCount,
    wrongCount: att.answers.length - att.correctCount,
    blankCount: TOTAL_QUESTIONS - att.answers.length,
    xpEarned: att.xpEarned,
    grandPrizeAwarded: att.grandPrizeAwarded,
    unlimitedExpiresAt: att.grandPrizeAwarded ? att.unlimitedExpiresAt : activeUnlimitedUntil,
    newUserPointsTotal: currentUserPoints,
    timedOut: Boolean(att.timedOut),
    serverNowIso: new Date().toISOString(),
  });

  /**
   * Yarışmayı sonuçlandırır: kayıtlı cevapları sunucu tarafında değerlendirir (doğru/yanlış/boş),
   * her doğru için 25 XP'yi server-dedupe `award_points` ile yazar, 15/15 ise 2 saatlik sınırsız erişimi tanımlar.
   * Aynı anda gelen ikinci çağrı (manuel + otomatik bitiş) ödülü ikinci kez veremez: durum önce yerelde kilitlenir.
   */
  const finalizeAttempt = async (timedOut: boolean): Promise<StoredAttemptMeta> => {
    const base = attempt as StoredAttemptMeta;
    const fullSet = resolveQuestionSet(base.questionIds, quizDate, usedIds, userId);
    const graded: CompactStoredAnswer[] = base.answers
      .slice()
      .sort((a, b) => a.i - b.i)
      .map((a) => {
        const ok = Boolean(fullSet[a.i]) && a.s === fullSet[a.i].correctIndex;
        return { i: a.i, s: a.s, c: ok, x: ok ? XP_PER_CORRECT : 0 };
      });
    const correct = graded.filter((a) => a.c).length;
    const xp = correct * XP_PER_CORRECT;
    const isPerfect = correct === TOTAL_QUESTIONS;
    const nowIso = new Date().toISOString();
    const unlimitedUntil = isPerfect ? new Date(Date.now() + GRAND_PRIZE_DURATION_MS).toISOString() : null;

    const completedAttempt: StoredAttemptMeta = {
      ...base,
      status: 'completed',
      answers: graded,
      answeredCount: graded.length,
      correctCount: correct,
      xpEarned: xp,
      xpCredited: xp === 0,
      rewardTransactionId: xp > 0 ? `trivia:${base.id}` : null,
      currentIndex: Math.min(TOTAL_QUESTIONS - 1, base.currentIndex),
      grandPrizeAwarded: isPerfect,
      unlimitedExpiresAt: unlimitedUntil,
      leaveStartedAt: null,
      graceExpiresAt: null,
      timedOut,
      completedAt: nowIso,
      updatedAt: Date.now(),
    };
    // Önce yerelde kilitle (çifte sonuçlandırmayı engeller)
    attempt = completedAttempt;
    persistLatest.set(userId, completedAttempt);
    writeLocalLeaveTs(userId, quizDate, null);
    writeLocalRunMirror(userId, quizDate, completedAttempt);

    const compactDate = quizDate.replace(/-/g, '');
    const xpEntries: PendingXpEntry[] = graded
      .filter((a) => a.c && (a.x ?? 0) > 0)
      .map((a) => ({
        reason: `mission_trivia_${compactDate}_q${String(a.i + 1).padStart(2, '0')}`,
        amount: XP_PER_CORRECT,
      }));

    const metaPatch: Record<string, unknown> = { daily_trivia_state: completedAttempt };
    let finalPointsTotal = currentUserPoints;
    if (xpEntries.length > 0) {
      const flushed = await flushTriviaXpEntries(xpEntries, currentUserPoints);
      finalPointsTotal = flushed.totalPoints;
      completedAttempt.xpCredited = flushed.remainingPending.length === 0;
      if (flushed.remainingPending.length > 0) {
        const existingReasons = new Set(remainingPendingXp.map((p) => p.reason));
        metaPatch.daily_trivia_pending_xp = [
          ...remainingPendingXp,
          ...flushed.remainingPending.filter((p) => !existingReasons.has(p.reason)),
        ];
      }
      metaPatch.daily_trivia_state = completedAttempt;
      writeLocalRunMirror(userId, quizDate, completedAttempt);
    }
    currentUserPoints = finalPointsTotal;
    basePointsCache.set(userId, finalPointsTotal);

    if (isPerfect && unlimitedUntil) {
      activeUnlimitedUntil = unlimitedUntil;
      metaPatch.trivia_unlimited_until = unlimitedUntil;
      metaPatch.trivia_perfect_wins = perfectWinsCount + 1;
      void supabase
        .from('profiles')
        .update({ trivia_unlimited_until: unlimitedUntil } as Record<string, unknown>)
        .eq('user_id', userId)
        .then(() => {});
    }

    await persistMetaToServer(metaPatch);
    return completedAttempt;
  };

  const isExpired = (att: StoredAttemptMeta): boolean => Date.now() > getDeadlineMs(att) + TIME_GRACE_MS;

  try {
    // ==================== ACTION: STATUS (Strictly Read-Only w.r.t. grace_period!) ====================
    if (action === 'status') {
      if (attempt && (attempt.status === 'in_progress' || attempt.status === 'grace_period')) {
        if (effectiveGraceExpiresAt !== null && Date.now() > effectiveGraceExpiresAt) {
          await cancelAttempt('away_over_5s');
        } else if (await enforceSilentInactivity()) {
          // cancelled due to silent inactivity
        } else if (isExpired(attempt)) {
          if (attempt.answers.length === 0) {
            await expireAttempt();
          } else {
            await finalizeAttempt(true);
          }
        } else if (effectiveLeaveTs !== null && attempt.status !== 'grace_period') {
          attempt = {
            ...attempt,
            status: 'grace_period',
            leaveStartedAt: effectiveLeaveTs,
            graceExpiresAt: effectiveGraceExpiresAt,
          };
          writeLocalRunMirror(userId, quizDate, attempt);
        }
        // CRITICAL: status NEVER clears grace_period or leaveStartedAt!
      }

      let questions: TriviaQuestionClient[] | undefined;
      let answers: TriviaAnswerRecord[] = [];

      if (attempt) {
        if (attempt.status === 'in_progress') {
          questions = sanitizeQuestions(resolveQuestionSet(attempt.questionIds, quizDate, usedIds, userId));
        }
        answers = buildAnswerRecords(attempt, attempt.status === 'completed');
      }

      const payload: TriviaStatusResponse = {
        quizDate,
        resetsAtIso,
        sessionStatus: attempt ? attempt.status : 'not_started',
        totalQuestions: TOTAL_QUESTIONS,
        xpPerCorrect: XP_PER_CORRECT,
        maxXp: TOTAL_QUESTIONS * XP_PER_CORRECT,
        serverNowIso: new Date().toISOString(),
        userPoints: currentUserPoints,
        perfectWinsCount,
        unlimitedExpiresAt: activeUnlimitedUntil,
        attempt: attempt ? toAttemptSummary(attempt) : null,
        questions,
        answers,
      };
      return { data: payload as unknown as T, error: null, status: 200 };
    }

    // ==================== ACTION: START ====================
    if (action === 'start') {
      if (attempt) {
        if (attempt.status === 'grace_period' && effectiveGraceExpiresAt !== null && Date.now() > effectiveGraceExpiresAt) {
          await cancelAttempt('away_over_5s');
        }
        const msg =
          attempt.status === 'cancelled'
            ? 'Bugünkü yarışma hakkınız güvenlik iptali nedeniyle kapandı. Yarın yeni 15 soru ile tekrar katılabilirsiniz.'
            : attempt.status === 'expired'
              ? 'Bugünkü yarışma süreniz dolduğu için oturum kapandı. Yarın yeni 15 soru ile tekrar katılabilirsiniz.'
              : attempt.status === 'completed'
                ? 'Bugünkü Günlük Genel Kültür Bilgi Yarışması’nı zaten tamamladınız. Her kullanıcı günde 1 kez katılabilir.'
                : 'Devam eden bir yarışmanız zaten bulunuyor.';
        return { data: null, error: msg, status: 409, raw: { error: msg, alreadyParticipated: true, status: attempt.status } };
      }

      const todayAssignedIds = readDailyAssignedIds(quizDate);
      const selectedQuestions = selectDailyQuestionsForDate(quizDate, usedIds, userId, todayAssignedIds);
      const selectedIds = selectedQuestions.map((q) => q.id);
      const nowMs = Date.now();
      const nowIso = new Date(nowMs).toISOString();

      recordDailyAssignedIds(quizDate, selectedIds);

      const nextUsedSet = new Set<string>(usedIds);
      for (const id of selectedIds) nextUsedSet.add(id);
      const nextUsedIds =
        nextUsedSet.size >= ALL_CURATED_TRIVIA_BANK.length ? selectedIds : Array.from(nextUsedSet);

      const sessionToken =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `sess-${quizDate}-${nowMs.toString(36)}`;

      const created: StoredAttemptMeta = {
        id: `trivia-${quizDate}-${nowMs.toString(36)}`,
        sessionToken,
        quizDate,
        status: 'in_progress',
        questionIds: selectedIds,
        currentIndex: 0,
        answeredCount: 0,
        correctCount: 0,
        xpEarned: 0,
        xpCredited: false,
        rewardTransactionId: null,
        grandPrizeAwarded: false,
        unlimitedExpiresAt: null,
        cancelReason: null,
        startedAt: nowIso,
        completedAt: null,
        cancelledAt: null,
        leaveStartedAt: null,
        graceExpiresAt: null,
        lastActivityAt: nowMs,
        lastHeartbeatAt: null,
        updatedAt: nowMs,
        answers: [],
      };

      writeLocalLeaveTs(userId, quizDate, null);
      writeLocalRunMirror(userId, quizDate, created);

      await persistMetaToServer({
        daily_trivia_state: created,
        daily_trivia_used_ids: nextUsedIds,
      });

      const payload: TriviaStartResponse = {
        quizDate,
        resetsAtIso,
        serverNowIso: nowIso,
        attempt: toAttemptSummary(created),
        questions: sanitizeQuestions(selectedQuestions),
      };
      return { data: payload as unknown as T, error: null, status: 200 };
    }

    // ==================== ACTION: HEARTBEAT ====================
    if (action === 'heartbeat') {
      if (!attempt) {
        const res: TriviaHeartbeatResponse = { ok: false, status: 'not_started', serverNowIso: new Date().toISOString() };
        return { data: res as unknown as T, error: null, status: 200 };
      }
      if (isTerminalStatus(attempt.status)) {
        const res: TriviaHeartbeatResponse = {
          ok: true,
          status: attempt.status,
          cancelled: attempt.status === 'cancelled',
          expired: attempt.status === 'expired',
          cancelReason: attempt.cancelReason,
          cancelMessage: attempt.status === 'cancelled' ? getCancelMessage(attempt.cancelReason) : null,
          serverNowIso: new Date().toISOString(),
        };
        return { data: res as unknown as T, error: null, status: 200 };
      }
      if (attempt.status === 'grace_period' || effectiveLeaveTs !== null) {
        if (effectiveGraceExpiresAt !== null && Date.now() > effectiveGraceExpiresAt) {
          await cancelAttempt('away_over_5s');
          const res: TriviaHeartbeatResponse = {
            ok: true,
            status: 'cancelled',
            cancelled: true,
            cancelReason: 'away_over_5s',
            cancelMessage: getCancelMessage('away_over_5s'),
            serverNowIso: new Date().toISOString(),
          };
          return { data: res as unknown as T, error: null, status: 200 };
        }
        const res: TriviaHeartbeatResponse = {
          ok: true,
          status: 'grace_period',
          graceExpiresAt: effectiveGraceExpiresAt ? new Date(effectiveGraceExpiresAt).toISOString() : null,
          serverNowIso: new Date().toISOString(),
        };
        return { data: res as unknown as T, error: null, status: 200 };
      }
      if (await enforceSilentInactivity()) {
        const res: TriviaHeartbeatResponse = {
          ok: true,
          status: 'cancelled',
          cancelled: true,
          cancelReason: 'inactivity_over_5s',
          cancelMessage: getCancelMessage('inactivity_over_5s'),
          serverNowIso: new Date().toISOString(),
        };
        return { data: res as unknown as T, error: null, status: 200 };
      }
      const nowMs = Date.now();
      const updated: StoredAttemptMeta = {
        ...attempt,
        lastActivityAt: nowMs,
        lastHeartbeatAt: nowMs,
        updatedAt: nowMs,
      };
      attempt = updated;
      writeLocalRunMirror(userId, quizDate, updated);
      const res: TriviaHeartbeatResponse = {
        ok: true,
        status: 'in_progress',
        serverNowIso: new Date(nowMs).toISOString(),
      };
      return { data: res as unknown as T, error: null, status: 200 };
    }

    // ==================== ACTION: REPORT_LEAVE ====================
    if (action === 'report_leave') {
      if (!attempt) {
        const res: TriviaLeaveResponse = { ok: true, status: 'not_started' };
        return { data: res as unknown as T, error: null, status: 200 };
      }
      if (isTerminalStatus(attempt.status)) {
        const res: TriviaLeaveResponse = {
          ok: true,
          status: attempt.status,
          cancelled: attempt.status === 'cancelled',
        };
        return { data: res as unknown as T, error: null, status: 200 };
      }

      const stamp = effectiveLeaveTs ?? Date.now();
      const graceUntil = Math.min(attempt.graceExpiresAt ?? stamp + MAX_AWAY_MS, stamp + MAX_AWAY_MS);

      if (Date.now() > graceUntil) {
        await cancelAttempt('away_over_5s');
        const res: TriviaLeaveResponse = {
          ok: true,
          status: 'cancelled',
          cancelled: true,
          serverNowIso: new Date().toISOString(),
        };
        return { data: res as unknown as T, error: null, status: 200 };
      }

      const next: StoredAttemptMeta = {
        ...attempt,
        status: 'grace_period',
        leaveStartedAt: stamp,
        graceExpiresAt: graceUntil,
        updatedAt: Date.now(),
      };
      attempt = next;
      persistLatest.set(userId, next);
      writeLocalLeaveTs(userId, quizDate, stamp);
      writeLocalRunMirror(userId, quizDate, next);
      await persistMetaToServer({ daily_trivia_state: next }).catch(() => {});

      const res: TriviaLeaveResponse = {
        ok: true,
        status: 'grace_period',
        leaveStartedAt: new Date(stamp).toISOString(),
        graceExpiresAt: new Date(graceUntil).toISOString(),
        serverNowIso: new Date().toISOString(),
      };
      return { data: res as unknown as T, error: null, status: 200 };
    }

    // ==================== ACTION: REPORT_RETURN ====================
    if (action === 'report_return') {
      if (!attempt) {
        return { data: { cancelled: false, status: 'not_started' } as unknown as T, error: null, status: 200 };
      }
      if (attempt.status === 'cancelled') {
        const payload: TriviaReturnResponse = {
          cancelled: true,
          status: 'cancelled',
          cancelReason: attempt.cancelReason,
          cancelMessage: getCancelMessage(attempt.cancelReason),
          newUserPointsTotal: currentUserPoints,
        };
        return { data: payload as unknown as T, error: null, status: 200 };
      }
      if (attempt.status === 'completed' || attempt.status === 'expired') {
        return {
          data: {
            cancelled: false,
            expired: attempt.status === 'expired',
            status: attempt.status,
          } as unknown as T,
          error: null,
          status: 200,
        };
      }

      const awayMs = effectiveLeaveTs ? Math.max(0, Date.now() - effectiveLeaveTs) : 0;
      if (effectiveGraceExpiresAt !== null && Date.now() > effectiveGraceExpiresAt) {
        await cancelAttempt('away_over_5s');
        const payload: TriviaReturnResponse = {
          cancelled: true,
          status: 'cancelled',
          awayMs,
          cancelReason: 'away_over_5s',
          cancelMessage: getCancelMessage('away_over_5s'),
          xpRevoked: 0,
          newUserPointsTotal: currentUserPoints,
        };
        return { data: payload as unknown as T, error: null, status: 200 };
      }

      if (await enforceSilentInactivity()) {
        const payload: TriviaReturnResponse = {
          cancelled: true,
          status: 'cancelled',
          awayMs,
          cancelReason: 'inactivity_over_5s',
          cancelMessage: getCancelMessage('inactivity_over_5s'),
          xpRevoked: 0,
          newUserPointsTotal: currentUserPoints,
        };
        return { data: payload as unknown as T, error: null, status: 200 };
      }

      const nowMs = Date.now();
      const resumed: StoredAttemptMeta = {
        ...attempt,
        status: 'in_progress',
        leaveStartedAt: null,
        graceExpiresAt: null,
        lastActivityAt: nowMs,
        lastHeartbeatAt: attempt.lastHeartbeatAt !== null ? nowMs : null,
        updatedAt: nowMs,
      };
      attempt = resumed;
      writeLocalLeaveTs(userId, quizDate, null);
      writeLocalRunMirror(userId, quizDate, resumed);
      await persistMetaToServer({ daily_trivia_state: resumed }).catch(() => {});

      const questions = sanitizeQuestions(resolveQuestionSet(resumed.questionIds, quizDate, usedIds, userId));
      const payload: TriviaReturnResponse = {
        cancelled: false,
        status: 'in_progress',
        awayMs,
        serverNowIso: new Date(nowMs).toISOString(),
        questions,
      };
      return { data: payload as unknown as T, error: null, status: 200 };
    }

    // ==================== ACTION: CANCEL ====================
    if (action === 'cancel') {
      if (!attempt || (attempt.status !== 'in_progress' && attempt.status !== 'grace_period')) {
        const payload: TriviaReturnResponse = {
          cancelled: attempt?.status === 'cancelled',
          status: attempt?.status ?? 'not_started',
          cancelReason: attempt?.cancelReason ?? null,
          cancelMessage:
            attempt?.status === 'cancelled' ? getCancelMessage(attempt.cancelReason) : null,
          newUserPointsTotal: currentUserPoints,
        };
        return { data: payload as unknown as T, error: null, status: 200 };
      }

      const reason =
        typeof body.reason === 'string' && body.reason.trim()
          ? body.reason.trim().slice(0, 60)
          : 'left_screen_over_5s';
      await cancelAttempt(reason);
      const payload: TriviaReturnResponse = {
        cancelled: true,
        status: 'cancelled',
        cancelReason: reason,
        cancelMessage: getCancelMessage(reason),
        xpRevoked: 0,
        newUserPointsTotal: currentUserPoints,
      };
      return { data: payload as unknown as T, error: null, status: 200 };
    }

    // ==================== ACTION: ANSWER (kaydet / değiştir) ====================
    if (action === 'answer') {
      if (!attempt) {
        return { data: null, error: 'Aktif yarışma bulunamadı.', status: 404 };
      }
      if (attempt.status === 'cancelled') {
        const msg = getCancelMessage(attempt.cancelReason);
        return {
          data: null,
          error: msg,
          status: 409,
          raw: { error: msg, cancelled: true, cancelReason: attempt.cancelReason },
        };
      }
      if (attempt.status === 'expired') {
        return {
          data: null,
          error: 'Yarışma süresi dolduğu için cevap kabul edilemez.',
          status: 409,
          raw: { error: 'Yarışma süresi dolduğu için cevap kabul edilemez.', expired: true },
        };
      }
      if (attempt.status === 'completed') {
        return {
          data: null,
          error: 'Bu yarışma zaten tamamlandı.',
          status: 409,
          raw: { error: 'Bu yarışma zaten tamamlandı.', completed: true },
        };
      }

      // Enforce 5-second away check & silent kill before accepting any answer
      if (effectiveGraceExpiresAt !== null && Date.now() > effectiveGraceExpiresAt) {
        await cancelAttempt('away_over_5s');
        const msg = getCancelMessage('away_over_5s');
        return {
          data: null,
          error: msg,
          status: 409,
          raw: { error: msg, cancelled: true, cancelReason: 'away_over_5s' },
        };
      }
      if (await enforceSilentInactivity()) {
        const msg = getCancelMessage('inactivity_over_5s');
        return {
          data: null,
          error: msg,
          status: 409,
          raw: { error: msg, cancelled: true, cancelReason: 'inactivity_over_5s' },
        };
      }
      if (attempt.status === 'grace_period') {
        return {
          data: null,
          error: 'Önce yarışma ekranına geri dönmelisiniz.',
          status: 409,
          raw: {
            error: 'Önce yarışma ekranına geri dönmelisiniz.',
            inGracePeriod: true,
            graceExpiresAt: effectiveGraceExpiresAt ? new Date(effectiveGraceExpiresAt).toISOString() : null,
          },
        };
      }

      // Sunucu tarafı süre kontrolü: 15 dk dolduysa bu cevap sayılmaz, kayıtlı cevaplarla sonuçlanır
      if (isExpired(attempt)) {
        if (attempt.answers.length === 0) {
          await expireAttempt();
          return {
            data: null,
            error: 'Yarışma süresi dolduğu için oturum sonlandı.',
            status: 409,
            raw: { error: 'Yarışma süresi dolduğu için oturum sonlandı.', expired: true },
          };
        }
        const done = await finalizeAttempt(true);
        const final = buildFinishPayload(done);
        const payload: TriviaAnswerResponse = {
          questionIndex: Number(body.questionIndex) || 0,
          selectedOption: Number(body.selectedOption) || 0,
          saved: false,
          answeredCount: done.answers.length,
          remainingCount: Math.max(0, TOTAL_QUESTIONS - done.answers.length),
          deadlineAt: new Date(getDeadlineMs(done)).toISOString(),
          serverNowIso: new Date().toISOString(),
          timedOut: true,
          final,
        };
        return { data: payload as unknown as T, error: null, status: 200 };
      }

      const questionIndex = Number(body.questionIndex);
      const selectedOption = Number(body.selectedOption);
      if (!Number.isInteger(questionIndex) || questionIndex < 0 || questionIndex >= TOTAL_QUESTIONS) {
        return { data: null, error: 'Geçersiz soru numarası.', status: 400 };
      }
      if (!Number.isInteger(selectedOption) || selectedOption < 0 || selectedOption > 3) {
        return { data: null, error: 'Geçersiz seçenek.', status: 400 };
      }

      const nextAnswers: CompactStoredAnswer[] = [
        ...attempt.answers.filter((a) => a.i !== questionIndex),
        { i: questionIndex, s: selectedOption },
      ].sort((a, b) => a.i - b.i);

      const nowMs = Date.now();
      const updatedAttempt: StoredAttemptMeta = {
        ...attempt,
        currentIndex: questionIndex,
        answeredCount: nextAnswers.length,
        lastActivityAt: nowMs,
        updatedAt: nowMs,
        answers: nextAnswers,
      };
      attempt = updatedAttempt;
      writeLocalRunMirror(userId, quizDate, updatedAttempt);
      scheduleAttemptPersist(userId, updatedAttempt);

      const payload: TriviaAnswerResponse = {
        questionIndex,
        selectedOption,
        saved: true,
        answeredCount: nextAnswers.length,
        remainingCount: Math.max(0, TOTAL_QUESTIONS - nextAnswers.length),
        deadlineAt: new Date(getDeadlineMs(updatedAttempt)).toISOString(),
        serverNowIso: new Date(nowMs).toISOString(),
      };
      return { data: payload as unknown as T, error: null, status: 200 };
    }

    // ==================== ACTION: FINISH (Yarışmayı Bitir / süre doldu) ====================
    if (action === 'finish') {
      if (!attempt) {
        return { data: null, error: 'Aktif yarışma bulunamadı.', status: 404 };
      }
      if (attempt.status === 'cancelled') {
        const msg = getCancelMessage(attempt.cancelReason);
        return {
          data: null,
          error: msg,
          status: 409,
          raw: { error: msg, cancelled: true, cancelReason: attempt.cancelReason },
        };
      }
      if (attempt.status === 'expired') {
        return {
          data: null,
          error: 'Yarışma süresi dolduğu için ödül tanımlanamaz.',
          status: 409,
          raw: { error: 'Yarışma süresi dolduğu için ödül tanımlanamaz.', expired: true },
        };
      }
      if (attempt.status === 'completed') {
        return { data: buildFinishPayload(attempt) as unknown as T, error: null, status: 200 };
      }
      if (effectiveGraceExpiresAt !== null && Date.now() > effectiveGraceExpiresAt) {
        await cancelAttempt('away_over_5s');
        const msg = getCancelMessage('away_over_5s');
        return {
          data: null,
          error: msg,
          status: 409,
          raw: { error: msg, cancelled: true, cancelReason: 'away_over_5s' },
        };
      }
      if (await enforceSilentInactivity()) {
        const msg = getCancelMessage('inactivity_over_5s');
        return {
          data: null,
          error: msg,
          status: 409,
          raw: { error: msg, cancelled: true, cancelReason: 'inactivity_over_5s' },
        };
      }
      const timedOut = isExpired(attempt) || Date.now() >= getDeadlineMs(attempt) - 1500;
      if (Boolean(body.timedOut) && timedOut && attempt.answers.length === 0) {
        await expireAttempt();
        return {
          data: null,
          error: 'Yarışma süresi dolduğu için oturum sonlandı.',
          status: 409,
          raw: { error: 'Yarışma süresi dolduğu için oturum sonlandı.', expired: true },
        };
      }
      const done = await finalizeAttempt(Boolean(body.timedOut) && timedOut);
      return { data: buildFinishPayload(done) as unknown as T, error: null, status: 200 };
    }

    return { data: null, error: 'Bilinmeyen işlem.', status: 400 };
  } catch (err) {
    return {
      data: null,
      error:
        err instanceof Error && err.message
          ? err.message
          : 'Sunucuya bağlanılamadı. İnternet bağlantınızı kontrol edin.',
    };
  }
}
