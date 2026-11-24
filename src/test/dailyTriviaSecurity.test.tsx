import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import DailyTrivia from '@/pages/DailyTrivia';
import type { TriviaQuestionClient, TriviaStatusResponse } from '@/lib/dailyTrivia';

const invokeMock = vi.fn();
const beaconMock = vi.fn();

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'user-sec-1', email: 'student@econnotes.online', user_metadata: {} },
    profile: { full_name: 'Test Öğrenci', trivia_unlimited_until: null },
    loading: false,
    refreshProfile: vi.fn(),
  }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  SUPABASE_URL: 'https://htjmuzogayyufewirvlp.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'test-anon',
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: { access_token: 'tok-1' } } })),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
  },
}));

vi.mock('@/lib/triviaAudio', () => ({
  isTurkishTtsSupported: () => false,
  loadTriviaAudioPrefs: () => ({
    masterEnabled: false,
    sfxEnabled: false,
    musicEnabled: false,
    ttsEnabled: false,
    ttsReadOptions: false,
    volume: 0,
    reducedMotion: true,
  }),
  saveTriviaAudioPrefs: vi.fn(),
  playTriviaSound: vi.fn(),
  speakTriviaQuestion: vi.fn(() => false),
  startTriviaAmbientMusic: vi.fn(),
  stopAllTriviaAudio: vi.fn(),
  stopTriviaAmbientMusic: vi.fn(),
  stopTriviaSpeech: vi.fn(),
  unlockTriviaAudio: vi.fn(),
  updateTriviaAmbientMusicVolume: vi.fn(),
}));

vi.mock('@/lib/dailyTrivia', async () => {
  const actual = await vi.importActual<typeof import('@/lib/dailyTrivia')>('@/lib/dailyTrivia');
  return {
    ...actual,
    invokeDailyTrivia: (...args: unknown[]) => invokeMock(...args),
    sendDailyTriviaBeacon: (...args: unknown[]) => beaconMock(...args),
  };
});

function makeQuestions(): TriviaQuestionClient[] {
  return Array.from({ length: 15 }, (_, i) => ({
    index: i,
    category: 'Tarih',
    difficulty: 'easy',
    question: `Örnek genel kültür sorusu #${i + 1}?`,
    options: ['Seçenek A', 'Seçenek B', 'Seçenek C', 'Seçenek D'],
  }));
}

function activeStatusResponse(): { data: TriviaStatusResponse; error: null; status: number } {
  const now = new Date();
  return {
    status: 200,
    error: null,
    data: {
      quizDate: '2026-11-24',
      resetsAtIso: new Date(now.getTime() + 3600_000).toISOString(),
      sessionStatus: 'in_progress',
      totalQuestions: 15,
      xpPerCorrect: 25,
      maxXp: 375,
      serverNowIso: now.toISOString(),
      userPoints: 200,
      perfectWinsCount: 0,
      unlimitedExpiresAt: null,
      attempt: {
        id: 'att-live-1',
        sessionToken: 'sess-1',
        status: 'in_progress',
        currentIndex: 0,
        answeredCount: 0,
        correctCount: 0,
        xpEarned: 0,
        grandPrizeAwarded: false,
        unlimitedExpiresAt: null,
        cancelReason: null,
        cancelMessage: null,
        startedAt: now.toISOString(),
        deadlineAt: new Date(now.getTime() + 15 * 60 * 1000).toISOString(),
        timeLimitSec: 900,
        completedAt: null,
        cancelledAt: null,
      },
      questions: makeQuestions(),
      answers: [],
    },
  };
}

function setDocumentHidden(hidden: boolean) {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => (hidden ? 'hidden' : 'visible'),
  });
}

describe('DailyTrivia Component – 5-Second Anti-Cheat Lifecycle & Browser Events', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    setDocumentHidden(false);
  });

  afterEach(() => {
    vi.useRealTimers();
    setDocumentHidden(false);
  });

  it('does NOT count internal question navigation or answer selection as leaving the quiz', async () => {
    invokeMock.mockImplementation(async (body: { action: string; questionIndex?: number; selectedOption?: number }) => {
      if (body.action === 'status') return activeStatusResponse();
      if (body.action === 'heartbeat') return { data: { ok: true, status: 'in_progress' }, error: null, status: 200 };
      if (body.action === 'answer') {
        return {
          data: {
            questionIndex: body.questionIndex,
            selectedOption: body.selectedOption,
            saved: true,
            answeredCount: 1,
            remainingCount: 14,
            deadlineAt: new Date(Date.now() + 14 * 60_000).toISOString(),
            serverNowIso: new Date().toISOString(),
          },
          error: null,
          status: 200,
        };
      }
      return { data: {}, error: null, status: 200 };
    });

    render(
      <MemoryRouter>
        <DailyTrivia />
      </MemoryRouter>,
    );

    await screen.findByText('Örnek genel kültür sorusu #1?');

    fireEvent.click(screen.getByText('Seçenek A'));
    fireEvent.click(screen.getByRole('button', { name: /Soru 5/i }));
    await screen.findByText('Örnek genel kültür sorusu #5?');
    fireEvent.click(screen.getByRole('button', { name: /Sonraki Soru/i }));
    await screen.findByText('Örnek genel kültür sorusu #6?');

    expect(beaconMock).not.toHaveBeenCalled();
    expect(screen.queryByText('Yarışma Ekranından Ayrıldınız')).toBeNull();
  });

  it('deduplicates simultaneous blur + visibilitychange + pagehide into ONE leave beacon and resumes cleanly within 3s', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    invokeMock.mockImplementation(async (body: { action: string }) => {
      if (body.action === 'status') return activeStatusResponse();
      if (body.action === 'heartbeat') return { data: { ok: true, status: 'in_progress' }, error: null, status: 200 };
      if (body.action === 'report_return') {
        return {
          data: {
            cancelled: false,
            status: 'in_progress',
            awayMs: 3000,
            serverNowIso: new Date().toISOString(),
          },
          error: null,
          status: 200,
        };
      }
      return { data: {}, error: null, status: 200 };
    });

    render(
      <MemoryRouter>
        <DailyTrivia />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByText('Örnek genel kültür sorusu #1?')).toBeInTheDocument());

    // Fire 3 simultaneous leave events (typical desktop + iOS Safari)
    act(() => {
      fireEvent(window, new Event('blur'));
      setDocumentHidden(true);
      fireEvent(document, new Event('visibilitychange'));
      fireEvent(window, new Event('pagehide'));
    });

    expect(beaconMock).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Yarışma Ekranından Ayrıldınız')).toBeInTheDocument();

    // Wait 3 seconds (< 5s), then return via visibilitychange + focus + pageshow
    await act(async () => {
      vi.advanceTimersByTime(3000);
    });

    await act(async () => {
      setDocumentHidden(false);
      fireEvent(document, new Event('visibilitychange'));
      fireEvent(window, new Event('focus'));
      fireEvent(window, new Event('pageshow'));
    });

    await waitFor(() => {
      expect(screen.queryByText('Yarışma Ekranından Ayrıldınız')).toBeNull();
    });

    const returnCalls = invokeMock.mock.calls.filter(([b]) => b?.action === 'report_return');
    expect(returnCalls).toHaveLength(1);
    expect(screen.getByText('Örnek genel kültür sorusu #1?')).toBeInTheDocument();
  });

  it('permanently cancels quiz when user stays away > 5 seconds and shows Yarışma İptal Edildi with 0 XP', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    invokeMock.mockImplementation(async (body: { action: string }) => {
      if (body.action === 'status') return activeStatusResponse();
      if (body.action === 'heartbeat') return { data: { ok: true, status: 'in_progress' }, error: null, status: 200 };
      if (body.action === 'cancel') {
        return {
          data: {
            cancelled: true,
            status: 'cancelled',
            cancelReason: 'away_over_5s',
            cancelMessage: 'Yarışma sırasında 5 saniye içerisinde geri dönülmediği için katılımınız iptal edildi.',
            xpRevoked: 0,
            newUserPointsTotal: 200,
          },
          error: null,
          status: 200,
        };
      }
      return { data: {}, error: null, status: 200 };
    });

    render(
      <MemoryRouter>
        <DailyTrivia />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByText('Örnek genel kültür sorusu #1?')).toBeInTheDocument());

    act(() => {
      setDocumentHidden(true);
      fireEvent(document, new Event('visibilitychange'));
    });

    await act(async () => {
      vi.advanceTimersByTime(5300);
    });

    await waitFor(() => {
      expect(screen.getByText('Yarışma İptal Edildi')).toBeInTheDocument();
    });

    expect(screen.getByText('0 XP')).toBeInTheDocument();
    expect(screen.queryByText('Örnek genel kültür sorusu #1?')).toBeNull();
    const cancelCalls = invokeMock.mock.calls.filter(([b]) => b?.action === 'cancel');
    expect(cancelCalls).toHaveLength(1);
  });

  it('sends navigated_away leave beacon on SPA route unmount while in_progress', async () => {
    invokeMock.mockImplementation(async (body: { action: string }) => {
      if (body.action === 'status') return activeStatusResponse();
      if (body.action === 'heartbeat') return { data: { ok: true, status: 'in_progress' }, error: null, status: 200 };
      return { data: {}, error: null, status: 200 };
    });

    const { unmount } = render(
      <MemoryRouter>
        <DailyTrivia />
      </MemoryRouter>,
    );

    await screen.findByText('Örnek genel kültür sorusu #1?');

    unmount();

    expect(beaconMock).toHaveBeenCalledTimes(1);
    expect(beaconMock.mock.calls[0][1]).toEqual({
      action: 'report_leave',
      reason: 'navigated_away',
    });
  });
});
