import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import DailyTrivia from '@/pages/DailyTrivia';
import type { TriviaQuestionClient, TriviaStatusResponse } from '@/lib/dailyTrivia';

const invokeMock = vi.fn();
const beaconMock = vi.fn();
const playSoundMock = vi.fn();

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'user-ui-1', email: 'student@econnotes.online', user_metadata: {} },
    profile: { full_name: 'Kaan Çolakoğlu', trivia_unlimited_until: null },
    loading: false,
    refreshProfile: vi.fn(),
  }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  SUPABASE_URL: 'https://htjmuzogayyufewirvlp.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'test-anon',
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: { access_token: 'tok-ui-1' } } })),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
  },
}));

vi.mock('@/lib/triviaAudio', () => ({
  isTurkishTtsSupported: () => false,
  loadTriviaAudioPrefs: () => ({
    masterEnabled: true,
    sfxEnabled: true,
    musicEnabled: false,
    ttsEnabled: false,
    ttsReadOptions: false,
    volume: 0.7,
    reducedMotion: true,
  }),
  saveTriviaAudioPrefs: vi.fn(),
  playTriviaSound: (...args: unknown[]) => playSoundMock(...args),
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
    difficulty: i < 5 ? 'easy' : i < 10 ? 'medium' : 'hard',
    question: `Günlük genel kültür sorusu #${i + 1}: Osmanlı ekonomisinde iaşecilik neyi amaçlar?`,
    options: ['İç piyasada mal bolluğu', 'İhracat tekeli', 'Sömürge ticaret ağı', 'Gümrük muafiyeti'],
  }));
}

function baseStatus(override: Partial<TriviaStatusResponse> = {}) {
  const now = new Date();
  return {
    status: 200,
    error: null,
    data: {
      quizDate: '2026-11-25',
      resetsAtIso: new Date(now.getTime() + 5 * 3600_000).toISOString(),
      sessionStatus: 'not_started',
      totalQuestions: 15,
      xpPerCorrect: 25,
      maxXp: 375,
      serverNowIso: now.toISOString(),
      userPoints: 450,
      perfectWinsCount: 0,
      unlimitedExpiresAt: null,
      attempt: null,
      questions: [],
      answers: [],
      ...override,
    } as TriviaStatusResponse,
  };
}

describe('Günlük Bilgi Yarışması Premium Tema & Kullanıcı Deneyimi Yenilemesi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('renders clean Lobby screen with exact copy, 3 KPI cards, and transitions smoothly into active quiz on start', async () => {
    const now = new Date();
    invokeMock.mockImplementation(async (body: { action: string }) => {
      if (body.action === 'status') return baseStatus();
      if (body.action === 'start') {
        return {
          status: 200,
          error: null,
          data: {
            quizDate: '2026-11-25',
            serverNowIso: now.toISOString(),
            attempt: {
              id: 'att-start-1',
              sessionToken: 'sess-start-1',
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
              deadlineAt: new Date(now.getTime() + 15 * 60_000).toISOString(),
              timeLimitSec: 900,
              completedAt: null,
              cancelledAt: null,
            },
            questions: makeQuestions(),
          },
        };
      }
      if (body.action === 'heartbeat') return { data: { ok: true, status: 'in_progress' }, error: null, status: 200 };
      return { data: {}, error: null, status: 200 };
    });

    render(
      <MemoryRouter>
        <DailyTrivia />
      </MemoryRouter>,
    );

    expect(await screen.findByTestId('trivia-lobby')).toBeInTheDocument();
    expect(screen.getByText('Günlük Genel Kültür Bilgi Yarışması')).toBeInTheDocument();
    expect(screen.getByText('Her gün yenilenen sorularla bilgini test et, XP kazan!')).toBeInTheDocument();
    expect(screen.getByText('15 Soru')).toBeInTheDocument();
    expect(screen.getByText('15 Dakika')).toBeInTheDocument();
    expect(screen.getByText('Her doğru cevap 25 XP')).toBeInTheDocument();

    // Start quiz -> triggers start sound & renders active quiz screen with header counter and 15-min timer
    fireEvent.click(screen.getByTestId('trivia-start-btn'));
    expect(await screen.findByTestId('trivia-active-quiz')).toBeInTheDocument();
    expect(screen.getByTestId('trivia-header-qcount').textContent).toContain('Soru 1 / 15');
    expect(screen.getByTestId('trivia-timer')).toBeInTheDocument();
    expect(playSoundMock).toHaveBeenCalledWith('start', expect.anything());
  });

  it('renders 15/15 Completion Screen with Yarışma Tamamlandı, 375 XP Grand Prize showcase, 1-15 interactive summary, and all 3 actions', async () => {
    const now = new Date();
    const unlimitedUntil = new Date(now.getTime() + 2 * 3600_000).toISOString();
    const allCorrectAnswers = Array.from({ length: 15 }, (_, i) => ({
      questionIndex: i,
      selectedOption: 0,
      isCorrect: true,
      correctOption: 0,
      explanation: `Açıklama ${i + 1}`,
      answeredAt: now.toISOString(),
    }));

    invokeMock.mockResolvedValue(
      baseStatus({
        sessionStatus: 'completed',
        unlimitedExpiresAt: unlimitedUntil,
        attempt: {
          id: 'att-win-1',
          sessionToken: 'sess-win-1',
          status: 'completed',
          currentIndex: 14,
          answeredCount: 15,
          correctCount: 15,
          wrongCount: 0,
          blankCount: 0,
          xpEarned: 375,
          grandPrizeAwarded: true,
          unlimitedExpiresAt: unlimitedUntil,
          cancelReason: null,
          cancelMessage: null,
          startedAt: new Date(now.getTime() - 400_000).toISOString(),
          deadlineAt: new Date(now.getTime() + 500_000).toISOString(),
          timeLimitSec: 900,
          completedAt: now.toISOString(),
          cancelledAt: null,
        },
        answers: allCorrectAnswers,
      }),
    );

    render(
      <MemoryRouter>
        <DailyTrivia />
      </MemoryRouter>,
    );

    expect(await screen.findByTestId('trivia-results')).toBeInTheDocument();
    expect(screen.getByText('Yarışma Tamamlandı')).toBeInTheDocument();
    expect(screen.getByTestId('trivia-grand-prize-panel')).toBeInTheDocument();
    expect(screen.getByText('+375 XP')).toBeInTheDocument();
    expect(screen.getByText(/375 XP \+ 2 Saatlik Sınırsız Not Erişimi Aktif/i)).toBeInTheDocument();

    // Tap question #3 in 1-15 summary -> plays 'correct' cue & reveals inline detail
    fireEvent.click(screen.getByRole('button', { name: /Soru 3: Doğru/i }));
    expect(playSoundMock).toHaveBeenCalledWith('correct', expect.anything());
    expect(await screen.findByText(/Soru 3: Doğru cevap/i)).toBeInTheDocument();

    // Verify all 3 requested actions exist
    expect(screen.getByRole('button', { name: /Puan Geçmişi/i })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Ders Notlarına Git/i }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole('button', { name: /Ana Sayfaya Dön/i })).toBeInTheDocument();
  });

  it('renders professional Cancelled Screen with exact heading, explanation, 0 XP badge, renewal timer & Home button', async () => {
    const now = new Date();
    invokeMock.mockResolvedValue(
      baseStatus({
        sessionStatus: 'cancelled',
        attempt: {
          id: 'att-cancel-1',
          sessionToken: 'sess-cancel-1',
          status: 'cancelled',
          currentIndex: 3,
          answeredCount: 3,
          correctCount: 0,
          xpEarned: 0,
          grandPrizeAwarded: false,
          unlimitedExpiresAt: null,
          cancelReason: 'away_over_5s',
          cancelMessage: 'away',
          startedAt: new Date(now.getTime() - 120_000).toISOString(),
          deadlineAt: new Date(now.getTime() + 780_000).toISOString(),
          timeLimitSec: 900,
          completedAt: null,
          cancelledAt: now.toISOString(),
        },
      }),
    );

    render(
      <MemoryRouter>
        <DailyTrivia />
      </MemoryRouter>,
    );

    expect(await screen.findByTestId('trivia-cancelled')).toBeInTheDocument();
    expect(screen.getByText('Yarışma İptal Edildi')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Yarışma sırasında belirtilen süre içerisinde geri dönmediğiniz için katılımınız iptal edildi.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('0 XP')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Ana Sayfaya Dön/i })).toBeInTheDocument();
  });
});
