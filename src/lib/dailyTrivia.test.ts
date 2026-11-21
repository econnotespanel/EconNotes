import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  CURATED_TRIVIA_BANK,
  TRIVIA_CATEGORIES,
} from '@/lib/dailyTriviaQuestionBank';
import {
  flushPendingTriviaWrites,
  getIstanbulDateParts,
  recordFallbackLeaveLocally,
  resetFallbackEngineMemory,
  runDailyTriviaSupabaseEngine,
  selectDailyQuestionsForDate,
} from '@/lib/dailyTriviaFallbackEngine';
import {
  formatTriviaClock,
  invokeDailyTrivia,
  resetDailyTriviaTransportState,
  TRIVIA_TIME_LIMIT_MS,
  TRIVIA_TOTAL_QUESTIONS,
  TRIVIA_XP_PER_CORRECT,
  type TriviaAnswerResponse,
  type TriviaFinishResponse,
  type TriviaStartResponse,
  type TriviaStatusResponse,
} from '@/lib/dailyTrivia';

const mockState = {
  userId: 'user-trivia-test-1',
  userMeta: {} as Record<string, unknown>,
  points: 100,
  claimedReasons: new Set<string>(),
  offline: false,
  rpcCalls: [] as Array<{ reason: string; amount: number }>,
};

vi.mock('@/integrations/supabase/client', () => ({
  SUPABASE_URL: 'https://htjmuzogayyufewirvlp.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'test-anon-key',
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({
        data: {
          session: mockState.offline
            ? null
            : {
                access_token: 'mock-jwt-token',
                user: { id: mockState.userId, user_metadata: { ...mockState.userMeta } },
              },
        },
      })),
      refreshSession: vi.fn(async () => ({
        data: {
          session: mockState.offline
            ? null
            : {
                access_token: 'mock-jwt-token-2',
                user: { id: mockState.userId, user_metadata: { ...mockState.userMeta } },
              },
          user: mockState.offline
            ? null
            : { id: mockState.userId, user_metadata: { ...mockState.userMeta } },
        },
      })),
      getUser: vi.fn(async () => {
        if (mockState.offline) {
          throw new TypeError('Failed to fetch');
        }
        return {
          data: {
            user: { id: mockState.userId, user_metadata: { ...mockState.userMeta } },
          },
          error: null,
        };
      }),
      updateUser: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        if (mockState.offline) {
          return { data: null, error: { message: 'Failed to fetch' } };
        }
        mockState.userMeta = { ...mockState.userMeta, ...data };
        return {
          data: { user: { id: mockState.userId, user_metadata: { ...mockState.userMeta } } },
          error: null,
        };
      }),
    },
    from: vi.fn((table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            if (mockState.offline) throw new TypeError('Failed to fetch');
            if (table === 'user_points') {
              return { data: { points: mockState.points }, error: null };
            }
            return { data: null, error: null };
          },
        }),
      }),
      update: () => ({
        eq: async () => ({ error: null }),
      }),
    })),
    rpc: vi.fn(async (fnName: string, args: { _reason: string; _amount: number }) => {
      if (fnName === 'award_points') {
        if (mockState.claimedReasons.has(args._reason)) {
          return { data: null, error: { message: 'Bu görev ödülü zaten alındı.' } };
        }
        mockState.claimedReasons.add(args._reason);
        mockState.points += args._amount;
        mockState.rpcCalls.push({ reason: args._reason, amount: args._amount });
        return { data: mockState.points, error: null };
      }
      return { data: null, error: { message: 'Unknown RPC' } };
    }),
  },
}));

describe('Daily Trivia Exam System (15-Min Timer, Free Navigation, Answer Changes, XP & Anti-Cheat)', () => {
  beforeEach(() => {
    mockState.userMeta = {};
    mockState.points = 100;
    mockState.claimedReasons.clear();
    mockState.offline = false;
    mockState.rpcCalls = [];
    resetFallbackEngineMemory();
    resetDailyTriviaTransportState();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('formats countdown clocks accurately from 15:00 down to 00:00', () => {
    expect(formatTriviaClock(TRIVIA_TIME_LIMIT_MS)).toBe('15:00');
    expect(formatTriviaClock(2 * 60 * 1000)).toBe('02:00');
    expect(formatTriviaClock(5_000)).toBe('00:05');
    expect(formatTriviaClock(0)).toBe('00:00');
    expect(formatTriviaClock(-1000)).toBe('00:00');
  });

  it('selects 15 balanced unique questions across all 8 domains with zero repeats across consecutive days', () => {
    const used = new Set<string>();
    for (let day = 1; day <= 7; day++) {
      const dateStr = `2026-11-${String(day).padStart(2, '0')}`;
      const qs = selectDailyQuestionsForDate(dateStr, used);
      expect(qs).toHaveLength(TRIVIA_TOTAL_QUESTIONS);

      const cats = new Set(qs.map((q) => q.category));
      expect(cats.size).toBe(TRIVIA_CATEGORIES.length);

      for (const q of qs) {
        expect(used.has(q.id)).toBe(false);
        expect(q.options).toHaveLength(4);
        used.add(q.id);
      }
    }
    expect(used.size).toBe(7 * 15);
  });

  it('recovers automatically when Edge Function returns 404/CORS error and starts a 15-minute server-timed run', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );

    const statusRes = await invokeDailyTrivia<TriviaStatusResponse>({ action: 'status' });
    expect(statusRes.error).toBeNull();
    expect(statusRes.data?.totalQuestions).toBe(15);
    expect(statusRes.data?.xpPerCorrect).toBe(25);
    expect(statusRes.data?.maxXp).toBe(375);
    expect(statusRes.data?.userPoints).toBe(100);
    expect(statusRes.data?.attempt).toBeNull();

    const startRes = await invokeDailyTrivia<TriviaStartResponse>({ action: 'start' });
    expect(startRes.error).toBeNull();
    expect(startRes.data?.questions).toHaveLength(15);
    expect(startRes.data?.attempt.status).toBe('in_progress');
    expect(startRes.data?.attempt.timeLimitSec).toBe(900);
    expect(startRes.data?.attempt.deadlineAt).toBeTruthy();

    const diffMs =
      Date.parse(startRes.data!.attempt.deadlineAt!) - Date.parse(startRes.data!.attempt.startedAt);
    expect(diffMs).toBe(TRIVIA_TIME_LIMIT_MS);
    // Ensure answer keys are never exposed in client questions
    expect((startRes.data?.questions[0] as unknown as Record<string, unknown>).correctIndex).toBeUndefined();
  });

  it('still reports real offline error when Supabase Auth itself is unreachable', async () => {
    mockState.offline = true;
    const res = await runDailyTriviaSupabaseEngine<TriviaStatusResponse>({ action: 'status' });
    expect(res.data).toBeNull();
    expect(res.error).toContain('Sunucuya bağlanılamadı');
  });

  it('supports free non-linear navigation, changing previous answers, blank questions, and idempotent finish', async () => {
    await runDailyTriviaSupabaseEngine<TriviaStartResponse>({ action: 'start' });
    const stored = mockState.userMeta.daily_trivia_state as { questionIds: string[] };
    const bankMap = new Map(CURATED_TRIVIA_BANK.map((q) => [q.id, q]));

    // Answer Q5 first (wrong), Q0 second (wrong), Q14 third (correct)
    const q5 = bankMap.get(stored.questionIds[5])!;
    const q0 = bankMap.get(stored.questionIds[0])!;
    const q14 = bankMap.get(stored.questionIds[14])!;

    const a5 = await runDailyTriviaSupabaseEngine<TriviaAnswerResponse>({
      action: 'answer',
      questionIndex: 5,
      selectedOption: (q5.correctIndex + 1) % 4,
    });
    expect(a5.error).toBeNull();
    expect(a5.data?.saved).toBe(true);
    expect(a5.data?.answeredCount).toBe(1);
    // Must NOT leak isCorrect while quiz is in progress
    expect((a5.data as unknown as Record<string, unknown>).isCorrect).toBeUndefined();

    await runDailyTriviaSupabaseEngine<TriviaAnswerResponse>({
      action: 'answer',
      questionIndex: 0,
      selectedOption: (q0.correctIndex + 1) % 4,
    });
    await runDailyTriviaSupabaseEngine<TriviaAnswerResponse>({
      action: 'answer',
      questionIndex: 14,
      selectedOption: q14.correctIndex,
    });

    // Return to Q0 and change answer to the correct option
    const changedQ0 = await runDailyTriviaSupabaseEngine<TriviaAnswerResponse>({
      action: 'answer',
      questionIndex: 0,
      selectedOption: q0.correctIndex,
    });
    expect(changedQ0.error).toBeNull();
    expect(changedQ0.data?.selectedOption).toBe(q0.correctIndex);
    // Answered count stays 3 (overwrote Q0 rather than duplicating)
    expect(changedQ0.data?.answeredCount).toBe(3);

    await flushPendingTriviaWrites(mockState.userId);

    // Finish explicitly -> Q0 correct, Q14 correct, Q5 wrong, 12 blank
    const fin = await runDailyTriviaSupabaseEngine<TriviaFinishResponse>({
      action: 'finish',
      timedOut: false,
    });
    expect(fin.error).toBeNull();
    expect(fin.data?.attempt.status).toBe('completed');
    expect(fin.data?.correctCount).toBe(2);
    expect(fin.data?.wrongCount).toBe(1);
    expect(fin.data?.blankCount).toBe(12);
    expect(fin.data?.xpEarned).toBe(50);
    expect(fin.data?.grandPrizeAwarded).toBe(false);
    expect(mockState.points).toBe(150);

    // Calling finish a second time must be idempotent and never double-credit XP
    const fin2 = await runDailyTriviaSupabaseEngine<TriviaFinishResponse>({
      action: 'finish',
      timedOut: false,
    });
    expect(fin2.error).toBeNull();
    expect(fin2.data?.xpEarned).toBe(50);
    expect(mockState.points).toBe(150);
  });

  it('awards 350 XP for 14/15 without grand prize and blocks second daily play', async () => {
    const startRes = await runDailyTriviaSupabaseEngine<TriviaStartResponse>({ action: 'start' });
    expect(startRes.data).not.toBeNull();

    // Second start on same day must be rejected (1 play per day)
    const dupStart = await runDailyTriviaSupabaseEngine<TriviaStartResponse>({ action: 'start' });
    expect(dupStart.status).toBe(409);

    const { dateStr } = getIstanbulDateParts(new Date());
    const stored = mockState.userMeta.daily_trivia_state as { questionIds: string[] };
    const bankMap = new Map(CURATED_TRIVIA_BANK.map((q) => [q.id, q]));

    for (let i = 0; i < 15; i++) {
      const q = bankMap.get(stored.questionIds[i])!;
      const chosen = i === 14 ? (q.correctIndex + 1) % 4 : q.correctIndex; // 14 correct, 1 wrong
      const ansRes = await runDailyTriviaSupabaseEngine<TriviaAnswerResponse>({
        action: 'answer',
        questionIndex: i,
        selectedOption: chosen,
      });
      expect(ansRes.error).toBeNull();
    }

    const finRes = await runDailyTriviaSupabaseEngine<TriviaFinishResponse>({
      action: 'finish',
      timedOut: false,
    });
    expect(finRes.error).toBeNull();
    expect(finRes.data?.correctCount).toBe(14);
    expect(finRes.data?.wrongCount).toBe(1);
    expect(finRes.data?.blankCount).toBe(0);
    expect(finRes.data?.xpEarned).toBe(14 * TRIVIA_XP_PER_CORRECT);
    expect(finRes.data?.grandPrizeAwarded).toBe(false);
    expect(finRes.data?.unlimitedExpiresAt).toBeNull();
    expect(mockState.points).toBe(100 + 350);
    expect(mockState.rpcCalls).toHaveLength(14);
    expect(mockState.rpcCalls[0].reason).toBe(`mission_trivia_${dateStr.replace(/-/g, '')}_q01`);
  });

  it('awards 375 XP + 2-hour unlimited note access grand prize on 15/15 perfect score', async () => {
    await runDailyTriviaSupabaseEngine<TriviaStartResponse>({ action: 'start' });
    const stored = mockState.userMeta.daily_trivia_state as { questionIds: string[] };
    const bankMap = new Map(CURATED_TRIVIA_BANK.map((q) => [q.id, q]));

    for (let i = 0; i < 15; i++) {
      const q = bankMap.get(stored.questionIds[i])!;
      const ansRes = await runDailyTriviaSupabaseEngine<TriviaAnswerResponse>({
        action: 'answer',
        questionIndex: i,
        selectedOption: q.correctIndex,
      });
      expect(ansRes.error).toBeNull();
    }

    const finRes = await runDailyTriviaSupabaseEngine<TriviaFinishResponse>({
      action: 'finish',
      timedOut: false,
    });
    expect(finRes.error).toBeNull();
    expect(finRes.data?.correctCount).toBe(15);
    expect(finRes.data?.wrongCount).toBe(0);
    expect(finRes.data?.blankCount).toBe(0);
    expect(finRes.data?.xpEarned).toBe(375);
    expect(finRes.data?.grandPrizeAwarded).toBe(true);
    expect(finRes.data?.unlimitedExpiresAt).toBeTruthy();
    const diffMs = Date.parse(finRes.data!.unlimitedExpiresAt!) - Date.now();
    expect(diffMs).toBeGreaterThan(119 * 60 * 1000);
    expect(diffMs).toBeLessThanOrEqual(121 * 60 * 1000);
    expect(mockState.points).toBe(100 + 375);
    expect(mockState.userMeta.trivia_perfect_wins).toBe(1);
  });

  it('auto-finalizes with saved answers when the 15-minute server timer expires (and never resets timer)', async () => {
    await runDailyTriviaSupabaseEngine<TriviaStartResponse>({ action: 'start' });
    const stored = mockState.userMeta.daily_trivia_state as {
      questionIds: string[];
      startedAt: string;
    };
    const bankMap = new Map(CURATED_TRIVIA_BANK.map((q) => [q.id, q]));

    // Save 3 correct answers before timeout
    for (let i = 0; i < 3; i++) {
      const q = bankMap.get(stored.questionIds[i])!;
      await runDailyTriviaSupabaseEngine<TriviaAnswerResponse>({
        action: 'answer',
        questionIndex: i,
        selectedOption: q.correctIndex,
      });
    }
    await flushPendingTriviaWrites(mockState.userId);

    // Verify status does not reset startedAt / deadlineAt
    const midStatus = await runDailyTriviaSupabaseEngine<TriviaStatusResponse>({ action: 'status' });
    expect(midStatus.data?.attempt?.startedAt).toBe(stored.startedAt);
    expect(midStatus.data?.attempt?.status).toBe('in_progress');

    // Simulate 16 minutes elapsed on server timestamp
    const expiredStartedAt = new Date(Date.now() - 16 * 60 * 1000).toISOString();
    const curState = mockState.userMeta.daily_trivia_state as Record<string, unknown>;
    mockState.userMeta.daily_trivia_state = { ...curState, startedAt: expiredStartedAt };
    resetFallbackEngineMemory();
    localStorage.clear();

    const lateAns = await runDailyTriviaSupabaseEngine<TriviaAnswerResponse>({
      action: 'answer',
      questionIndex: 4,
      selectedOption: 0,
    });
    expect(lateAns.error).toBeNull();
    expect(lateAns.data?.saved).toBe(false);
    expect(lateAns.data?.timedOut).toBe(true);
    expect(lateAns.data?.final?.attempt.status).toBe('completed');
    expect(lateAns.data?.final?.correctCount).toBe(3);
    expect(lateAns.data?.final?.blankCount).toBe(12);
    expect(lateAns.data?.final?.xpEarned).toBe(75);
    expect(mockState.points).toBe(175);
  });

  it('cancels active run on page reload or >5s away and grants ZERO XP or rewards', async () => {
    await runDailyTriviaSupabaseEngine<TriviaStartResponse>({ action: 'start' });
    const stored = mockState.userMeta.daily_trivia_state as { questionIds: string[] };
    const bankMap = new Map(CURATED_TRIVIA_BANK.map((q) => [q.id, q]));

    // Answer first 2 questions correctly
    for (let i = 0; i < 2; i++) {
      const q = bankMap.get(stored.questionIds[i])!;
      await runDailyTriviaSupabaseEngine<TriviaAnswerResponse>({
        action: 'answer',
        questionIndex: i,
        selectedOption: q.correctIndex,
      });
    }
    await flushPendingTriviaWrites(mockState.userId);

    // Simulate reload -> status with clientReloaded: true
    const reloaded = await runDailyTriviaSupabaseEngine<TriviaStatusResponse>({
      action: 'status',
      clientReloaded: true,
    });
    expect(reloaded.data?.attempt?.status).toBe('cancelled');
    expect(reloaded.data?.attempt?.xpEarned).toBe(0);
    expect(reloaded.data?.attempt?.grandPrizeAwarded).toBe(false);
    expect(mockState.rpcCalls).toHaveLength(0);
    expect(mockState.points).toBe(100);

    // Also verify leave timestamp helper works cleanly
    recordFallbackLeaveLocally(mockState.userId);
    expect(mockState.points).toBe(100);
  });
});
