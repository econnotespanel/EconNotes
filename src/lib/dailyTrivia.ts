import type { User } from '@supabase/supabase-js';
import { supabase, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from '@/integrations/supabase/client';
import {
  recordFallbackLeaveLocally,
  runDailyTriviaSupabaseEngine,
} from '@/lib/dailyTriviaFallbackEngine';

export type TriviaCategory =
  | 'Tarih'
  | 'Coğrafya'
  | 'Bilim'
  | 'Sanat'
  | 'Spor'
  | 'Teknoloji'
  | 'Edebiyat'
  | 'Güncel Genel Kültür';

export type TriviaDifficulty = 'easy' | 'medium' | 'hard';

export interface TriviaQuestionClient {
  index: number;
  category: TriviaCategory;
  difficulty: TriviaDifficulty;
  question: string;
  options: [string, string, string, string];
}

/**
 * Kaydedilmiş cevap. Yarışma sürerken yalnızca `questionIndex` ve `selectedOption` döner;
 * doğruluk bilgisi (isCorrect, correctIndex, explanation) yarışma bittikten sonra açıklanır.
 */
export interface TriviaAnswerRecord {
  questionIndex: number;
  selectedOption: number;
  isCorrect?: boolean;
  xpAwarded?: number;
  correctIndex?: number;
  explanation?: string;
}

export type TriviaSessionStatus =
  | 'not_started'
  | 'in_progress'
  | 'grace_period'
  | 'completed'
  | 'cancelled'
  | 'expired';

export interface TriviaAttemptSummary {
  id: string;
  sessionToken?: string;
  status: TriviaSessionStatus;
  currentIndex: number;
  answeredCount: number;
  correctCount: number;
  wrongCount?: number;
  blankCount?: number;
  xpEarned: number;
  xpCredited?: boolean;
  rewardTransactionId?: string | null;
  grandPrizeAwarded: boolean;
  unlimitedExpiresAt: string | null;
  leaveStartedAt?: string | null;
  graceExpiresAt?: string | null;
  lastActivityAt?: string | null;
  cancelReason: string | null;
  cancelMessage: string | null;
  startedAt: string;
  /** Sunucuda startedAt + 15 dk olarak hesaplanan bitiş zamanı */
  deadlineAt?: string;
  timeLimitSec?: number;
  timedOut?: boolean;
  completedAt: string | null;
  cancelledAt: string | null;
}

export interface TriviaStatusResponse {
  quizDate: string;
  resetsAtIso: string;
  sessionStatus?: TriviaSessionStatus;
  totalQuestions: number;
  xpPerCorrect: number;
  maxXp: number;
  serverNowIso: string;
  userPoints: number;
  perfectWinsCount: number;
  unlimitedExpiresAt: string | null;
  attempt: TriviaAttemptSummary | null;
  questions?: TriviaQuestionClient[];
  answers?: TriviaAnswerRecord[];
}

export interface TriviaStartResponse {
  quizDate: string;
  resetsAtIso: string;
  serverNowIso: string;
  attempt: TriviaAttemptSummary;
  questions: TriviaQuestionClient[];
}

/** Cevap kaydı yanıtı: doğru/yanlış bilgisi yarışma bitene kadar gizli tutulur. */
export interface TriviaAnswerResponse {
  questionIndex: number;
  selectedOption: number;
  saved: boolean;
  answeredCount: number;
  remainingCount: number;
  deadlineAt: string;
  serverNowIso: string;
  /** Süre dolduğu için yarışma otomatik sonuçlandıysa true */
  timedOut?: boolean;
  final?: TriviaFinishResponse;
}

export interface TriviaFinishResponse {
  attempt: TriviaAttemptSummary;
  answers: TriviaAnswerRecord[];
  correctCount: number;
  wrongCount: number;
  blankCount: number;
  xpEarned: number;
  grandPrizeAwarded: boolean;
  unlimitedExpiresAt: string | null;
  newUserPointsTotal: number;
  timedOut: boolean;
  serverNowIso: string;
}

export interface TriviaReturnResponse {
  cancelled: boolean;
  expired?: boolean;
  status?: TriviaSessionStatus;
  awayMs?: number;
  cancelReason?: string | null;
  cancelMessage?: string | null;
  xpRevoked?: number;
  newUserPointsTotal?: number | null;
  serverNowIso?: string;
  questions?: TriviaQuestionClient[];
}

export interface TriviaLeaveResponse {
  ok: boolean;
  status?: TriviaSessionStatus;
  cancelled?: boolean;
  leaveStartedAt?: string;
  graceExpiresAt?: string;
  serverNowIso?: string;
}

export interface TriviaHeartbeatResponse {
  ok: boolean;
  status?: TriviaSessionStatus;
  cancelled?: boolean;
  expired?: boolean;
  cancelReason?: string | null;
  cancelMessage?: string | null;
  graceExpiresAt?: string | null;
  serverNowIso?: string;
}

export const TRIVIA_TOTAL_QUESTIONS = 15;
export const TRIVIA_XP_PER_CORRECT = 25;
export const TRIVIA_LEAVE_LIMIT_MS = 5000;
export const TRIVIA_TIME_LIMIT_MS = 15 * 60 * 1000;
export const TRIVIA_WARNING_MS = 2 * 60 * 1000;

export function formatTriviaClock(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export interface DailyRenewalInfo {
  dateStr: string;
  resetsAtIso: string;
  remainingMs: number;
  label: string;
  compactTime: string;
}

/**
 * Computes the canonical daily renewal countdown (00:00 Europe/Istanbul, identical for all users).
 * Never resets on page refresh and automatically rolls over to the next day's 24h cycle at midnight.
 */
export function getDailyRenewalInfo(now = new Date()): DailyRenewalInfo {
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
  let targetMs = Date.UTC(y, m - 1, d + 1, 0, 0, 0) - 3 * 60 * 60 * 1000;
  if (targetMs <= now.getTime()) {
    targetMs = Date.UTC(y, m - 1, d + 2, 0, 0, 0) - 3 * 60 * 60 * 1000;
  }

  const remainingMs = Math.max(1000, targetMs - now.getTime());
  const totalSec = Math.floor(remainingMs / 1000);
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;

  let compactTime: string;
  if (hours > 0 && minutes > 0) {
    compactTime = `${hours} saat ${minutes} dk`;
  } else if (hours > 0) {
    compactTime = `${hours} saat`;
  } else if (minutes > 0) {
    compactTime = `${minutes} dk ${seconds} sn`;
  } else {
    compactTime = `${seconds} sn`;
  }

  return {
    dateStr,
    resetsAtIso: new Date(targetMs).toISOString(),
    remainingMs,
    compactTime,
    label: `Yarınki yarışmaya: ${compactTime} kaldı`,
  };
}

export const TRIVIA_XP_LADDER = Array.from({ length: TRIVIA_TOTAL_QUESTIONS }, (_, i) => ({
  correct: i + 1,
  xp: (i + 1) * TRIVIA_XP_PER_CORRECT,
  isGrandPrize: i + 1 === TRIVIA_TOTAL_QUESTIONS,
}));

const STORAGE_UNLIMITED_PREFIX = 'econnotes_trivia_unlimited_until_';
const STORAGE_ACTIVE_RUN_PREFIX = 'econnotes_trivia_active_run_';

function parseMs(val: unknown): number {
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  if (typeof val === 'string' && val.trim()) {
    const num = Number(val);
    if (Number.isFinite(num) && num > 1_000_000_000_000) return num;
    const ms = Date.parse(val);
    if (Number.isFinite(ms)) return ms;
  }
  return 0;
}

export function getTriviaUnlimitedUntil(
  user: User | null | undefined,
  profile?: { trivia_unlimited_until?: string | null } | null,
): number {
  if (!user) return 0;
  const fromProfile = parseMs(profile?.trivia_unlimited_until);
  const fromMeta = parseMs((user.user_metadata as Record<string, unknown> | undefined)?.trivia_unlimited_until);
  let fromLocal = 0;
  try {
    fromLocal = parseMs(localStorage.getItem(`${STORAGE_UNLIMITED_PREFIX}${user.id}`));
  } catch {
    fromLocal = 0;
  }
  return Math.max(0, fromProfile, fromMeta, fromLocal);
}

export function isTriviaUnlimitedActive(
  user: User | null | undefined,
  profile?: { trivia_unlimited_until?: string | null } | null,
  now = new Date(),
): boolean {
  return getTriviaUnlimitedUntil(user, profile) > now.getTime();
}

export function getTriviaUnlimitedRemainingLabel(
  user: User | null | undefined,
  profile?: { trivia_unlimited_until?: string | null } | null,
  now = new Date(),
): string {
  const until = getTriviaUnlimitedUntil(user, profile);
  const diffMs = Math.max(0, until - now.getTime());
  if (diffMs <= 0) return '';
  const totalSec = Math.floor(diffMs / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) {
    return `${h} saat ${String(m).padStart(2, '0')} dk ${String(s).padStart(2, '0')} sn kaldı`;
  }
  return `${m} dk ${String(s).padStart(2, '0')} sn kaldı`;
}

export function syncTriviaUnlimitedUntil(userId: string, expiresAtIso: string | null | undefined): void {
  try {
    const key = `${STORAGE_UNLIMITED_PREFIX}${userId}`;
    if (expiresAtIso && parseMs(expiresAtIso) > Date.now()) {
      localStorage.setItem(key, expiresAtIso);
    } else if (expiresAtIso === null) {
      localStorage.removeItem(key);
    }
  } catch {
    // ignore storage errors
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('econnotes:trivia-updated'));
  }
}

export function markActiveTriviaRunInSession(userId: string, quizDate: string, attemptId: string): void {
  try {
    sessionStorage.setItem(
      `${STORAGE_ACTIVE_RUN_PREFIX}${userId}`,
      JSON.stringify({ quizDate, attemptId, markedAt: Date.now() }),
    );
  } catch {
    // ignore
  }
}

export function readActiveTriviaRunInSession(
  userId: string,
): { quizDate: string; attemptId: string; markedAt: number } | null {
  try {
    const raw = sessionStorage.getItem(`${STORAGE_ACTIVE_RUN_PREFIX}${userId}`);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function clearActiveTriviaRunInSession(userId: string): void {
  try {
    sessionStorage.removeItem(`${STORAGE_ACTIVE_RUN_PREFIX}${userId}`);
  } catch {
    // ignore
  }
}

export function formatCountdownToIso(targetIso: string | null | undefined, now = new Date()): string {
  const targetMs = parseMs(targetIso);
  if (!targetMs) return '';
  const diffMs = Math.max(0, targetMs - now.getTime());
  const totalSec = Math.floor(diffMs / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

async function getAccessToken(forceRefresh = false): Promise<string | null> {
  if (forceRefresh) {
    const { data } = await supabase.auth.refreshSession().catch(() => ({ data: { session: null } }));
    return data.session?.access_token ?? null;
  }
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

const EDGE_TIMEOUT_MS = 12_000;
let edgeUnavailableInSession = false;

export function resetDailyTriviaTransportState(): void {
  edgeUnavailableInSession = false;
}

export async function invokeDailyTrivia<T>(
  body: Record<string, unknown>,
): Promise<{ data: T | null; error: string | null; status?: number; raw?: Record<string, unknown> }> {
  // If we already confirmed during this session that the dedicated Edge Function is not deployed yet,
  // route directly to the live Supabase Auth + PostgreSQL engine without triggering redundant 404s.
  if (edgeUnavailableInSession) {
    return runDailyTriviaSupabaseEngine<T>(body);
  }

  let token = await getAccessToken(false);
  if (!token) token = await getAccessToken(true);
  if (!token) {
    return { data: null, error: 'Oturum bulunamadı. Lütfen yeniden giriş yapın.', status: 401 };
  }

  const callWithToken = async (jwt: string) => {
    const controller = new AbortController();
    const timer =
      typeof window !== 'undefined'
        ? window.setTimeout(() => controller.abort(), EDGE_TIMEOUT_MS)
        : null;
    try {
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/daily-trivia`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          apikey: SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${jwt}`,
        },
        body: JSON.stringify(body),
      });
      const parsed = (await resp.json().catch(() => ({}))) as Record<string, unknown>;
      return { resp, parsed };
    } finally {
      if (timer !== null && typeof window !== 'undefined') {
        window.clearTimeout(timer);
      }
    }
  };

  try {
    let { resp, parsed } = await callWithToken(token);
    if (resp.status === 401) {
      const fresh = await getAccessToken(true);
      if (fresh && fresh !== token) {
        ({ resp, parsed } = await callWithToken(fresh));
      }
    }

    // Edge Function not deployed (404 NOT_FOUND) or DB migration pending (503) ->
    // seamlessly engage the live Supabase Auth + PostgreSQL backend engine.
    if (
      resp.status === 404 ||
      parsed.code === 'NOT_FOUND' ||
      (resp.status === 503 && parsed.migrationPending)
    ) {
      edgeUnavailableInSession = true;
      return runDailyTriviaSupabaseEngine<T>(body);
    }

    if (!resp.ok) {
      return {
        data: null,
        error: typeof parsed.error === 'string' ? parsed.error : 'İşlem gerçekleştirilemedi.',
        status: resp.status,
        raw: parsed,
      };
    }

    return { data: parsed as unknown as T, error: null, status: resp.status, raw: parsed };
  } catch {
    // When a Supabase Edge Function is not deployed yet, browsers block the 404 OPTIONS preflight
    // and reject fetch() with TypeError("Failed to fetch"). Verify real connectivity against live
    // Supabase Auth & PostgreSQL before reporting an offline error!
    const fallbackRes = await runDailyTriviaSupabaseEngine<T>(body);
    if (!fallbackRes.error || fallbackRes.status === 401 || fallbackRes.status === 409) {
      edgeUnavailableInSession = true;
    }
    return fallbackRes;
  }
}

/**
 * Reliable keepalive POST used on tab hide / pagehide / beforeunload so the server always
 * records the exact departure timestamp even if the user closes or refreshes the tab.
 */
export function sendDailyTriviaBeacon(
  accessToken: string | null,
  body: Record<string, unknown>,
  userId?: string | null,
): void {
  if (userId) {
    recordFallbackLeaveLocally(userId, typeof body.reason === 'string' ? body.reason : 'left_screen');
  }
  if (edgeUnavailableInSession) {
    // Also persist grace_period asynchronously to Supabase Auth metadata so reloads/other tabs see it immediately
    void runDailyTriviaSupabaseEngine(body).catch(() => {});
    return;
  }
  if (!accessToken) return;
  try {
    void fetch(`${SUPABASE_URL}/functions/v1/daily-trivia`, {
      method: 'POST',
      keepalive: true,
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
    }).catch(() => {});
  } catch {
    // ignore unload errors
  }
}
