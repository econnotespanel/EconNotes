import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  CURATED_TRIVIA_BANK,
  TRIVIA_CATEGORIES,
} from '@/lib/dailyTriviaQuestionBank';
import {
  getIstanbulDateParts,
  resetFallbackEngineMemory,
  runDailyTriviaSupabaseEngine,
  selectDailyQuestionsForDate,
} from '@/lib/dailyTriviaFallbackEngine';
import {
  invokeDailyTrivia,
  resetDailyTriviaTransportState,
  TRIVIA_TOTAL_QUESTIONS,
  TRIVIA_XP_PER_CORRECT,
  type TriviaAnswerResponse,
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

describe('Daily Trivia Backend Resilience, XP & Anti-Cheat Engine', () => {
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

  it('recovers automatically when Edge Function returns 404/CORS error and loads status + 15 questions', async () => {
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
    // Ensure answer keys are never exposed in client questions
    expect((startRes.data?.questions[0] as unknown as Record<string, unknown>).correctIndex).toBeUndefined();
  });

  it('still reports real offline error when Supabase Auth itself is unreachable', async () => {
    mockState.offline = true;
    const res = await runDailyTriviaSupabaseEngine<TriviaStatusResponse>({ action: 'status' });
    expect(res.data).toBeNull();
    expect(res.error).toContain('Sunucuya bağlanılamadı');
  });

  it('awards 350 XP for 14/15 without grand prize, and prevents duplicate answers or second daily play', async () => {
    const startRes = await runDailyTriviaSupabaseEngine<TriviaStartResponse>({ action: 'start' });
    expect(startRes.data).not.toBeNull();

    // Second start on same day must be rejected (1 play per day)
    const dupStart = await runDailyTriviaSupabaseEngine<TriviaStartResponse>({ action: 'start' });
    expect(dupStart.status).toBe(409);

    const { dateStr } = getIstanbulDateParts(new Date());
    const stored = mockState.userMeta.daily_trivia_state as { questionIds: string[] };
    const bankMap = new Map(CURATED_TRIVIA_BANK.map((q) => [q.id, q]));

    let lastAns: TriviaAnswerResponse | null = null;
    for (let i = 0; i < 15; i++) {
      const q = bankMap.get(stored.questionIds[i])!;
      const chosen = i === 14 ? ((q.correctIndex + 1) % 4) : q.correctIndex; // 14 correct, 1 wrong
      const ansRes = await runDailyTriviaSupabaseEngine<TriviaAnswerResponse>({
        action: 'answer',
        questionIndex: i,
        selectedOption: chosen,
      });
      expect(ansRes.error).toBeNull();
      lastAns = ansRes.data;
    }

    expect(lastAns?.completed).toBe(true);
    expect(lastAns?.correctCount).toBe(14);
    expect(lastAns?.totalXpEarned).toBe(14 * TRIVIA_XP_PER_CORRECT);
    expect(lastAns?.grandPrizeAwarded).toBe(false);
    expect(lastAns?.unlimitedExpiresAt).toBeNull();
    expect(mockState.points).toBe(100 + 350);
    expect(mockState.rpcCalls).toHaveLength(14);
    expect(mockState.rpcCalls[0].reason).toBe(`mission_trivia_${dateStr.replace(/-/g, '')}_q01`);
  });

  it('awards 375 XP + 2-hour unlimited note access grand prize on 15/15 perfect score', async () => {
    await runDailyTriviaSupabaseEngine<TriviaStartResponse>({ action: 'start' });
    const stored = mockState.userMeta.daily_trivia_state as { questionIds: string[] };
    const bankMap = new Map(CURATED_TRIVIA_BANK.map((q) => [q.id, q]));

    let lastAns: TriviaAnswerResponse | null = null;
    for (let i = 0; i < 15; i++) {
      const q = bankMap.get(stored.questionIds[i])!;
      const ansRes = await runDailyTriviaSupabaseEngine<TriviaAnswerResponse>({
        action: 'answer',
        questionIndex: i,
        selectedOption: q.correctIndex,
      });
      expect(ansRes.error).toBeNull();
      lastAns = ansRes.data;
    }

    expect(lastAns?.completed).toBe(true);
    expect(lastAns?.correctCount).toBe(15);
    expect(lastAns?.totalXpEarned).toBe(375);
    expect(lastAns?.grandPrizeAwarded).toBe(true);
    expect(lastAns?.unlimitedExpiresAt).toBeTruthy();
    const diffMs = Date.parse(lastAns!.unlimitedExpiresAt!) - Date.now();
    expect(diffMs).toBeGreaterThan(119 * 60 * 1000);
    expect(diffMs).toBeLessThanOrEqual(121 * 60 * 1000);
    expect(mockState.points).toBe(100 + 375);
    expect(mockState.userMeta.trivia_perfect_wins).toBe(1);
  });

  it('cancels active run on page reload and grants ZERO XP or rewards', async () => {
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
  });
});
