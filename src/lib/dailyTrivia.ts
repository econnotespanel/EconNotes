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

export interface TriviaAnswerRecord {
  questionIndex: number;
  selectedOption: number;
  isCorrect: boolean;
  xpAwarded: number;
  correctIndex?: number;
  explanation?: string;
}

export interface TriviaAttemptSummary {
  id: string;
  status: 'in_progress' | 'completed' | 'cancelled';
  currentIndex: number;
  answeredCount: number;
  correctCount: number;
  xpEarned: number;
  grandPrizeAwarded: boolean;
  unlimitedExpiresAt: string | null;
  cancelReason: string | null;
  cancelMessage: string | null;
  startedAt: string;
  completedAt: string | null;
  cancelledAt: string | null;
}

export interface TriviaStatusResponse {
  quizDate: string;
  resetsAtIso: string;
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

export interface TriviaAnswerResponse {
  questionIndex: number;
  selectedOption: number;
  isCorrect: boolean;
  correctIndex: number;
  explanation: string;
  xpAwarded: number;
  totalXpEarned: number;
  correctCount: number;
  answeredCount: number;
  remainingCount: number;
  completed: boolean;
  grandPrizeAwarded: boolean;
  unlimitedExpiresAt: string | null;
  newUserPointsTotal: number;
}

export interface TriviaReturnResponse {
  cancelled: boolean;
  awayMs?: number;
  cancelReason?: string | null;
  cancelMessage?: string | null;
  xpRevoked?: number;
  newUserPointsTotal?: number | null;
}

export const TRIVIA_TOTAL_QUESTIONS = 15;
export const TRIVIA_XP_PER_CORRECT = 25;
export const TRIVIA_LEAVE_LIMIT_MS = 5000;

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
  if (edgeUnavailableInSession) {
    recordFallbackLeaveLocally(userId ?? null);
    return;
  }
  if (userId) {
    recordFallbackLeaveLocally(userId);
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
