import { supabase } from '@/integrations/supabase/client';
import {
  CURATED_TRIVIA_BANK,
  TRIVIA_CATEGORIES,
  type TriviaCategory,
  type TriviaDifficulty,
  type TriviaQuestionRecord,
} from '@/lib/dailyTriviaQuestionBank';
import type {
  TriviaAnswerRecord,
  TriviaAnswerResponse,
  TriviaAttemptSummary,
  TriviaQuestionClient,
  TriviaReturnResponse,
  TriviaStartResponse,
  TriviaStatusResponse,
} from '@/lib/dailyTrivia';

const TOTAL_QUESTIONS = 15;
const XP_PER_CORRECT = 25;
const MAX_AWAY_MS = 5500; // 5s strict client window + 0.5s grace
const GRAND_PRIZE_DURATION_MS = 2 * 60 * 60 * 1000; // 2 hours real-time
const LEAVE_STORAGE_PREFIX = 'econnotes_trivia_leave_ts_';
const RUN_MIRROR_PREFIX = 'econnotes_trivia_run_mirror_';

interface CompactStoredAnswer {
  i: number;
  s: number;
  c: boolean;
  x: number;
}

interface StoredAttemptMeta {
  id: string;
  quizDate: string;
  status: 'in_progress' | 'completed' | 'cancelled';
  questionIds: string[];
  currentIndex: number;
  answeredCount: number;
  correctCount: number;
  xpEarned: number;
  grandPrizeAwarded: boolean;
  unlimitedExpiresAt: string | null;
  cancelReason: string | null;
  startedAt: string;
  completedAt: string | null;
  cancelledAt: string | null;
  leaveStartedAt: number | null;
  answers: CompactStoredAnswer[];
}

interface PendingXpEntry {
  reason: string;
  amount: number;
}

const QUESTION_BY_ID = new Map<string, TriviaQuestionRecord>(
  CURATED_TRIVIA_BANK.map((q) => [q.id, q]),
);

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
 * strictly excluding previously asked question IDs from earlier days.
 */
export function selectDailyQuestionsForDate(
  dateStr: string,
  usedIds: Iterable<string>,
): TriviaQuestionRecord[] {
  const seed = dateSeed(dateStr);
  const usedSet = new Set<string>(usedIds);
  const picked: TriviaQuestionRecord[] = [];
  const pickedIds = new Set<string>();

  const catCounts = new Map<TriviaCategory, number>();
  for (const cat of TRIVIA_CATEGORIES) catCounts.set(cat, 0);

  const rotatedCategories = seededShuffle(TRIVIA_CATEGORIES, seed);
  const shuffledBank = seededShuffle(CURATED_TRIVIA_BANK, seed ^ 0x9e3779b9);

  // Pass 1: Strictly unused questions balanced evenly across all 8 domains
  let safety = 0;
  while (picked.length < TOTAL_QUESTIONS && safety < 60) {
    safety++;
    const sortedCats = [...rotatedCategories].sort(
      (a, b) => (catCounts.get(a) || 0) - (catCounts.get(b) || 0),
    );
    let added = false;
    for (const cat of sortedCats) {
      if (picked.length >= TOTAL_QUESTIONS) break;
      const cand = shuffledBank.find(
        (q) => q.category === cat && !usedSet.has(q.id) && !pickedIds.has(q.id),
      );
      if (cand) {
        pickedIds.add(cand.id);
        picked.push(cand);
        catCounts.set(cat, (catCounts.get(cat) || 0) + 1);
        added = true;
      }
    }
    if (!added) break;
  }

  // Pass 2: Any remaining unused question from curated bank
  if (picked.length < TOTAL_QUESTIONS) {
    for (const q of shuffledBank) {
      if (picked.length >= TOTAL_QUESTIONS) break;
      if (!usedSet.has(q.id) && !pickedIds.has(q.id)) {
        pickedIds.add(q.id);
        picked.push(q);
      }
    }
  }

  // Pass 3: Only after ALL 160 questions have been exhausted across >10 days, recycle oldest first
  if (picked.length < TOTAL_QUESTIONS) {
    for (const q of shuffledBank) {
      if (picked.length >= TOTAL_QUESTIONS) break;
      if (!pickedIds.has(q.id)) {
        pickedIds.add(q.id);
        picked.push(q);
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
      return 'Yarışma devam ederken sayfa yenilendiği için güvenlik kuralları gereği yarışma otomatik olarak iptal edildi ve bu yarışmaya ait ödüller tanımlanmadı.';
    case 'away_over_5s':
    case 'left_screen_over_5s':
      return 'Yarışma ekranından ayrıldıktan sonra 5 saniye içinde geri dönülmediği için yarışma otomatik olarak iptal edildi ve bu yarışmaya ait ödüller tanımlanmadı.';
    case 'navigated_away':
      return 'Yarışma ekranından çıkış yapıldığı için yarışma iptal edildi ve bu yarışmaya ait ödüller tanımlanmadı.';
    default:
      return 'Güvenlik kuralları ihlal edildiği için yarışma iptal edildi ve bu yarışmaya ait ödüller verilmedi.';
  }
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

export function recordFallbackLeaveLocally(userId: string | null): void {
  if (!userId) return;
  const { dateStr } = getIstanbulDateParts(new Date());
  const existing = readLocalLeaveTs(userId, dateStr);
  const stamp = existing ?? Date.now();
  writeLocalLeaveTs(userId, dateStr, stamp);
  const cached = activeRunCache.get(cacheKey(userId, dateStr));
  if (cached && cached.status === 'in_progress') {
    writeLocalRunMirror(userId, dateStr, { ...cached, leaveStartedAt: stamp });
  }
}

function parseStoredAttempt(raw: unknown, quizDate: string): StoredAttemptMeta | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  if (obj.quizDate !== quizDate) return null;
  const status = obj.status;
  if (status !== 'in_progress' && status !== 'completed' && status !== 'cancelled') return null;
  const questionIds = Array.isArray(obj.questionIds)
    ? obj.questionIds.filter((id): id is string => typeof id === 'string' && QUESTION_BY_ID.has(id))
    : [];
  const answers = Array.isArray(obj.answers)
    ? (obj.answers as CompactStoredAnswer[]).filter(
        (a) =>
          a &&
          typeof a.i === 'number' &&
          typeof a.s === 'number' &&
          typeof a.c === 'boolean' &&
          typeof a.x === 'number',
      )
    : [];

  return {
    id: typeof obj.id === 'string' ? obj.id : `trivia-${quizDate}`,
    quizDate,
    status,
    questionIds,
    currentIndex: Math.max(0, Math.min(TOTAL_QUESTIONS, Number(obj.currentIndex) || 0)),
    answeredCount: Math.max(0, Math.min(TOTAL_QUESTIONS, Number(obj.answeredCount) || 0)),
    correctCount: Math.max(0, Math.min(TOTAL_QUESTIONS, Number(obj.correctCount) || 0)),
    xpEarned: Math.max(0, Math.min(TOTAL_QUESTIONS * XP_PER_CORRECT, Number(obj.xpEarned) || 0)),
    grandPrizeAwarded: Boolean(obj.grandPrizeAwarded),
    unlimitedExpiresAt: typeof obj.unlimitedExpiresAt === 'string' ? obj.unlimitedExpiresAt : null,
    cancelReason: typeof obj.cancelReason === 'string' ? obj.cancelReason : null,
    startedAt: typeof obj.startedAt === 'string' ? obj.startedAt : new Date().toISOString(),
    completedAt: typeof obj.completedAt === 'string' ? obj.completedAt : null,
    cancelledAt: typeof obj.cancelledAt === 'string' ? obj.cancelledAt : null,
    leaveStartedAt: typeof obj.leaveStartedAt === 'number' ? obj.leaveStartedAt : null,
    answers,
  };
}

function toAttemptSummary(att: StoredAttemptMeta): TriviaAttemptSummary {
  return {
    id: att.id,
    status: att.status,
    currentIndex: att.currentIndex,
    answeredCount: att.answeredCount,
    correctCount: att.correctCount,
    xpEarned: att.xpEarned,
    grandPrizeAwarded: att.grandPrizeAwarded,
    unlimitedExpiresAt: att.unlimitedExpiresAt,
    cancelReason: att.cancelReason,
    cancelMessage: att.status === 'cancelled' ? getCancelMessage(att.cancelReason) : null,
    startedAt: att.startedAt,
    completedAt: att.completedAt,
    cancelledAt: att.cancelledAt,
  };
}

function resolveQuestionSet(
  questionIds: string[],
  quizDate: string,
  usedIds: string[],
): TriviaQuestionRecord[] {
  if (questionIds.length === TOTAL_QUESTIONS) {
    const mapped = questionIds
      .map((id) => QUESTION_BY_ID.get(id))
      .filter((q): q is TriviaQuestionRecord => Boolean(q));
    if (mapped.length === TOTAL_QUESTIONS) return mapped;
  }
  return selectDailyQuestionsForDate(quizDate, usedIds);
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
    if (action === 'answer' || action === 'report_leave' || action === 'report_return') {
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

  // Reconcile server-stored attempt with active in-memory/local mirror for today's run
  const serverAttempt = parseStoredAttempt(meta.daily_trivia_state, quizDate);
  const mirrorAttempt = activeRunCache.get(cKey) || readLocalRunMirror(userId, quizDate);

  let attempt: StoredAttemptMeta | null = serverAttempt;
  if (serverAttempt && serverAttempt.status === 'in_progress' && mirrorAttempt && mirrorAttempt.id === serverAttempt.id) {
    if (mirrorAttempt.status !== 'in_progress' || mirrorAttempt.answeredCount >= serverAttempt.answeredCount) {
      attempt = mirrorAttempt;
    }
  } else if (!serverAttempt && mirrorAttempt) {
    attempt = mirrorAttempt;
  }

  const perfectWinsCount = Math.max(0, Number(meta.trivia_perfect_wins || 0));
  const rawUnlimited =
    typeof meta.trivia_unlimited_until === 'string' ? meta.trivia_unlimited_until : null;
  const activeUnlimitedUntil =
    rawUnlimited && Date.parse(rawUnlimited) > Date.now() ? rawUnlimited : null;

  const localLeaveTs = readLocalLeaveTs(userId, quizDate);
  const effectiveLeaveTs =
    attempt?.status === 'in_progress' ? attempt.leaveStartedAt || localLeaveTs || null : null;

  const persistMetaToServer = async (patch: Record<string, unknown>) => {
    const { error: updErr } = await supabase.auth.updateUser({ data: patch });
    if (updErr && isNetworkFailureError(updErr)) {
      throw new Error('Sunucuya bağlanılamadı. İnternet bağlantınızı kontrol edin.');
    }
  };

  const cancelAttempt = async (reason: string): Promise<StoredAttemptMeta> => {
    const nowIso = new Date().toISOString();
    writeLocalLeaveTs(userId, quizDate, null);
    const next: StoredAttemptMeta = {
      ...(attempt as StoredAttemptMeta),
      status: 'cancelled',
      xpEarned: 0,
      grandPrizeAwarded: false,
      unlimitedExpiresAt: null,
      leaveStartedAt: null,
      cancelReason: reason,
      cancelledAt: nowIso,
    };
    attempt = next;
    writeLocalRunMirror(userId, quizDate, next);
    await persistMetaToServer({
      daily_trivia_state: next,
    });
    return next;
  };

  try {
    // ==================== ACTION: STATUS ====================
    if (action === 'status') {
      const clientReloaded = Boolean(body.clientReloaded);
      if (attempt && attempt.status === 'in_progress') {
        if (clientReloaded) {
          await cancelAttempt('page_reloaded');
        } else if (effectiveLeaveTs && Date.now() - effectiveLeaveTs > MAX_AWAY_MS) {
          await cancelAttempt('away_over_5s');
        }
      }

      let questions: TriviaQuestionClient[] | undefined;
      let answers: TriviaAnswerRecord[] = [];

      if (attempt) {
        const fullSet = resolveQuestionSet(attempt.questionIds, quizDate, usedIds);
        if (attempt.status === 'in_progress') {
          questions = sanitizeQuestions(fullSet);
        }
        answers = attempt.answers.map((a) => {
          const qObj = fullSet[a.i];
          return {
            questionIndex: a.i,
            selectedOption: a.s,
            isCorrect: a.c,
            xpAwarded: a.x,
            correctIndex: qObj?.correctIndex,
            explanation: qObj?.explanation,
          };
        });
      }

      const payload: TriviaStatusResponse = {
        quizDate,
        resetsAtIso,
        totalQuestions: TOTAL_QUESTIONS,
        xpPerCorrect: XP_PER_CORRECT,
        maxXp: TOTAL_QUESTIONS * XP_PER_CORRECT,
        serverNowIso: new Date().toISOString(),
        userPoints:
          attempt?.status === 'in_progress'
            ? currentUserPoints + attempt.xpEarned
            : currentUserPoints,
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
        const msg =
          attempt.status === 'cancelled'
            ? 'Bugünkü yarışma hakkınız güvenlik iptali nedeniyle kapandı. Yarın yeni 15 soru ile tekrar katılabilirsiniz.'
            : attempt.status === 'completed'
            ? 'Bugünkü Günlük Genel Kültür Bilgi Yarışması’nı zaten tamamladınız. Her kullanıcı günde 1 kez katılabilir.'
            : 'Devam eden bir yarışmanız zaten bulunuyor.';
        return { data: null, error: msg, status: 409, raw: { error: msg, alreadyParticipated: true } };
      }

      const selectedQuestions = selectDailyQuestionsForDate(quizDate, usedIds);
      const selectedIds = selectedQuestions.map((q) => q.id);
      const nowIso = new Date().toISOString();

      const nextUsedSet = new Set<string>(usedIds);
      for (const id of selectedIds) nextUsedSet.add(id);
      const nextUsedIds =
        nextUsedSet.size >= CURATED_TRIVIA_BANK.length ? selectedIds : Array.from(nextUsedSet);

      const created: StoredAttemptMeta = {
        id: `trivia-${quizDate}-${Date.now().toString(36)}`,
        quizDate,
        status: 'in_progress',
        questionIds: selectedIds,
        currentIndex: 0,
        answeredCount: 0,
        correctCount: 0,
        xpEarned: 0,
        grandPrizeAwarded: false,
        unlimitedExpiresAt: null,
        cancelReason: null,
        startedAt: nowIso,
        completedAt: null,
        cancelledAt: null,
        leaveStartedAt: null,
        answers: [],
      };

      writeLocalLeaveTs(userId, quizDate, null);
      writeLocalRunMirror(userId, quizDate, created);

      // Milestone 1: Authoritatively lock today's 1/day participation on Supabase Auth server
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

    // ==================== ACTION: REPORT_LEAVE ====================
    if (action === 'report_leave') {
      if (!attempt || attempt.status !== 'in_progress') {
        return { data: { ok: true, status: attempt?.status ?? 'none' } as unknown as T, error: null, status: 200 };
      }
      const stamp = effectiveLeaveTs ?? Date.now();
      writeLocalLeaveTs(userId, quizDate, stamp);
      writeLocalRunMirror(userId, quizDate, { ...attempt, leaveStartedAt: stamp });
      return {
        data: { ok: true, serverNowIso: new Date().toISOString() } as unknown as T,
        error: null,
        status: 200,
      };
    }

    // ==================== ACTION: REPORT_RETURN ====================
    if (action === 'report_return') {
      if (!attempt) {
        return { data: { cancelled: false } as unknown as T, error: null, status: 200 };
      }
      if (attempt.status === 'cancelled') {
        const payload: TriviaReturnResponse = {
          cancelled: true,
          cancelReason: attempt.cancelReason,
          cancelMessage: getCancelMessage(attempt.cancelReason),
          newUserPointsTotal: currentUserPoints,
        };
        return { data: payload as unknown as T, error: null, status: 200 };
      }
      if (attempt.status !== 'in_progress') {
        return { data: { cancelled: false } as unknown as T, error: null, status: 200 };
      }

      const awayMs = effectiveLeaveTs ? Math.max(0, Date.now() - effectiveLeaveTs) : 0;
      if (effectiveLeaveTs && awayMs > MAX_AWAY_MS) {
        await cancelAttempt('away_over_5s');
        const payload: TriviaReturnResponse = {
          cancelled: true,
          awayMs,
          cancelReason: 'away_over_5s',
          cancelMessage: getCancelMessage('away_over_5s'),
          xpRevoked: 0,
          newUserPointsTotal: currentUserPoints,
        };
        return { data: payload as unknown as T, error: null, status: 200 };
      }

      writeLocalLeaveTs(userId, quizDate, null);
      writeLocalRunMirror(userId, quizDate, { ...attempt, leaveStartedAt: null });

      return {
        data: { cancelled: false, awayMs } as unknown as T,
        error: null,
        status: 200,
      };
    }

    // ==================== ACTION: CANCEL ====================
    if (action === 'cancel') {
      if (!attempt || attempt.status !== 'in_progress') {
        const payload: TriviaReturnResponse = {
          cancelled: attempt?.status === 'cancelled',
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
        cancelReason: reason,
        cancelMessage: getCancelMessage(reason),
        xpRevoked: 0,
        newUserPointsTotal: currentUserPoints,
      };
      return { data: payload as unknown as T, error: null, status: 200 };
    }

    // ==================== ACTION: ANSWER ====================
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
      if (attempt.status === 'completed') {
        return { data: null, error: 'Bu yarışma zaten tamamlandı.', status: 409 };
      }

      // Enforce 5-second away check before accepting any answer
      if (effectiveLeaveTs && Date.now() - effectiveLeaveTs > MAX_AWAY_MS) {
        await cancelAttempt('away_over_5s');
        const msg = getCancelMessage('away_over_5s');
        return {
          data: null,
          error: msg,
          status: 409,
          raw: { error: msg, cancelled: true, cancelReason: 'away_over_5s' },
        };
      }

      const questionIndex = Number(body.questionIndex);
      const selectedOption = Number(body.selectedOption);
      if (!Number.isInteger(questionIndex) || questionIndex < 0 || questionIndex >= TOTAL_QUESTIONS) {
        return { data: null, error: 'Geçersiz soru numarası.', status: 400 };
      }
      if (!Number.isInteger(selectedOption) || selectedOption < 0 || selectedOption > 3) {
        return { data: null, error: 'Geçersiz seçenek.', status: 400 };
      }
      if (
        questionIndex !== attempt.currentIndex ||
        attempt.answers.some((a) => a.i === questionIndex)
      ) {
        return {
          data: null,
          error: 'Sorular sırayla ve yalnızca bir kez yanıtlanabilir.',
          status: 409,
        };
      }

      const fullSet = resolveQuestionSet(attempt.questionIds, quizDate, usedIds);
      const targetQuestion = fullSet[questionIndex];
      if (!targetQuestion) {
        return { data: null, error: 'Soru bulunamadı.', status: 404 };
      }

      const isCorrect = selectedOption === targetQuestion.correctIndex;
      const xpAwarded = isCorrect ? XP_PER_CORRECT : 0;

      const nextAnswers: CompactStoredAnswer[] = [
        ...attempt.answers,
        { i: questionIndex, s: selectedOption, c: isCorrect, x: xpAwarded },
      ];
      const nextAnswered = nextAnswers.length;
      const nextCorrect = nextAnswers.filter((a) => a.c).length;
      const nextXpEarned = nextCorrect * XP_PER_CORRECT;
      const completed = nextAnswered >= TOTAL_QUESTIONS;
      const isPerfect = completed && nextCorrect === TOTAL_QUESTIONS;
      const nowIso = new Date().toISOString();

      let finalPointsTotal = currentUserPoints + nextXpEarned;
      let nextPendingXp = remainingPendingXp;
      let unlimitedExpiresAt: string | null = activeUnlimitedUntil;

      const metaPatch: Record<string, unknown> = {};

      if (completed) {
        // Milestone 2: Flush ALL verified correct answers to real PostgreSQL `user_points` & `point_events`
        // via server-deduplicated `award_points` RPC (zero XP ever leaked on cancelled runs!)
        const compactDate = quizDate.replace(/-/g, '');
        const xpEntries: PendingXpEntry[] = nextAnswers
          .filter((a) => a.c && a.x > 0)
          .map((a) => ({
            reason: `mission_trivia_${compactDate}_q${String(a.i + 1).padStart(2, '0')}`,
            amount: XP_PER_CORRECT,
          }));

        if (xpEntries.length > 0) {
          const flushed = await flushTriviaXpEntries(xpEntries, currentUserPoints);
          finalPointsTotal = flushed.totalPoints;
          basePointsCache.set(userId, finalPointsTotal);
          if (flushed.remainingPending.length > 0) {
            const existingReasons = new Set(remainingPendingXp.map((p) => p.reason));
            nextPendingXp = [
              ...remainingPendingXp,
              ...flushed.remainingPending.filter((p) => !existingReasons.has(p.reason)),
            ];
            metaPatch.daily_trivia_pending_xp = nextPendingXp;
          }
        } else {
          finalPointsTotal = currentUserPoints;
        }

        if (isPerfect) {
          unlimitedExpiresAt = new Date(Date.now() + GRAND_PRIZE_DURATION_MS).toISOString();
          metaPatch.trivia_unlimited_until = unlimitedExpiresAt;
          metaPatch.trivia_perfect_wins = perfectWinsCount + 1;

          // Best-effort sync to profiles table if migration column exists
          void supabase
            .from('profiles')
            .update({ trivia_unlimited_until: unlimitedExpiresAt } as Record<string, unknown>)
            .eq('user_id', userId)
            .then(() => {});
        }
      }

      const updatedAttempt: StoredAttemptMeta = {
        ...attempt,
        currentIndex: nextAnswered,
        answeredCount: nextAnswered,
        correctCount: nextCorrect,
        xpEarned: nextXpEarned,
        status: completed ? 'completed' : 'in_progress',
        completedAt: completed ? nowIso : null,
        grandPrizeAwarded: isPerfect,
        unlimitedExpiresAt: isPerfect ? unlimitedExpiresAt : null,
        leaveStartedAt: null,
        answers: nextAnswers,
      };

      writeLocalLeaveTs(userId, quizDate, null);
      writeLocalRunMirror(userId, quizDate, updatedAttempt);

      // Persist completion authoritatively to Supabase Auth server (no per-click Auth spam during Q1..Q14)
      if (completed) {
        await persistMetaToServer({
          ...metaPatch,
          daily_trivia_state: updatedAttempt,
        });
      }

      const payload: TriviaAnswerResponse = {
        questionIndex,
        selectedOption,
        isCorrect,
        correctIndex: targetQuestion.correctIndex,
        explanation: targetQuestion.explanation,
        xpAwarded,
        totalXpEarned: nextXpEarned,
        correctCount: nextCorrect,
        answeredCount: nextAnswered,
        remainingCount: Math.max(0, TOTAL_QUESTIONS - nextAnswered),
        completed,
        grandPrizeAwarded: isPerfect,
        unlimitedExpiresAt: isPerfect ? unlimitedExpiresAt : activeUnlimitedUntil,
        newUserPointsTotal: finalPointsTotal,
      };

      return { data: payload as unknown as T, error: null, status: 200 };
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
