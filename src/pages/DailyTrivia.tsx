import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Award,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Crown,
  Flame,
  Loader2,
  Lock,
  LogIn,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trophy,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import EconLogo from '@/components/EconLogo';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import {
  clearActiveTriviaRunInSession,
  formatCountdownToIso,
  getTriviaUnlimitedRemainingLabel,
  invokeDailyTrivia,
  isTriviaUnlimitedActive,
  markActiveTriviaRunInSession,
  readActiveTriviaRunInSession,
  sendDailyTriviaBeacon,
  syncTriviaUnlimitedUntil,
  TRIVIA_LEAVE_LIMIT_MS,
  TRIVIA_TOTAL_QUESTIONS,
  TRIVIA_XP_LADDER,
  TRIVIA_XP_PER_CORRECT,
  type TriviaAnswerRecord,
  type TriviaAnswerResponse,
  type TriviaAttemptSummary,
  type TriviaCategory,
  type TriviaDifficulty,
  type TriviaQuestionClient,
  type TriviaReturnResponse,
  type TriviaStartResponse,
  type TriviaStatusResponse,
} from '@/lib/dailyTrivia';
import { cn } from '@/lib/utils';

const OPTION_LETTERS = ['A', 'B', 'C', 'D'] as const;

const CATEGORY_STYLES: Record<TriviaCategory, string> = {
  Tarih: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  Coğrafya: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  Bilim: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300',
  Sanat: 'border-pink-500/30 bg-pink-500/10 text-pink-700 dark:text-pink-300',
  Spor: 'border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-300',
  Teknoloji: 'border-indigo-500/30 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300',
  Edebiyat: 'border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300',
  'Güncel Genel Kültür': 'border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300',
};

const DIFFICULTY_LABELS: Record<TriviaDifficulty, { label: string; cls: string }> = {
  easy: { label: 'Kolay', cls: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
  medium: { label: 'Orta', cls: 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400' },
  hard: { label: 'Zor', cls: 'border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400' },
};

export default function DailyTrivia() {
  const { user, profile, loading: authLoading, refreshProfile } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [quizDate, setQuizDate] = useState('');
  const [resetsAtIso, setResetsAtIso] = useState('');
  const [attempt, setAttempt] = useState<TriviaAttemptSummary | null>(null);
  const [questions, setQuestions] = useState<TriviaQuestionClient[]>([]);
  const [answers, setAnswers] = useState<TriviaAnswerRecord[]>([]);
  const [userPoints, setUserPoints] = useState<number>(0);
  const [unlimitedExpiresAt, setUnlimitedExpiresAt] = useState<string | null>(null);

  const [currentIdx, setCurrentIdx] = useState(0);
  const [lastFeedback, setLastFeedback] = useState<TriviaAnswerResponse | null>(null);
  const [showXpTable, setShowXpTable] = useState(false);
  const [nowTick, setNowTick] = useState(() => Date.now());

  // 5-second anti-cheat return guard state
  const [awayActive, setAwayActive] = useState(false);
  const [awayRemainingMs, setAwayRemainingMs] = useState(TRIVIA_LEAVE_LIMIT_MS);
  const [returnWarning, setReturnWarning] = useState<string | null>(null);

  const accessTokenRef = useRef<string | null>(null);
  const isInProgressRef = useRef(false);
  const leaveStartedAtRef = useRef<number | null>(null);
  const awayIntervalRef = useRef<number | null>(null);
  const cancellingRef = useRef(false);
  const initialReloadCheckedRef = useRef(false);

  const userId = user?.id ?? null;
  const isInProgress = attempt?.status === 'in_progress';
  isInProgressRef.current = isInProgress;

  // Keep a fresh JWT in ref for synchronous keepalive beacons on tab hide / unload
  useEffect(() => {
    let active = true;
    const syncToken = async () => {
      const { data } = await supabase.auth.getSession();
      if (active) accessTokenRef.current = data.session?.access_token ?? null;
    };
    void syncToken();
    const { data: sub } = supabase.auth.onAuthStateChange((_ev, session) => {
      accessTokenRef.current = session?.access_token ?? null;
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // 1-second UI clock for real-time 2-hour unlimited countdown & midnight daily refresh countdown
  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const clearAwayTimers = useCallback(() => {
    if (awayIntervalRef.current !== null) {
      window.clearInterval(awayIntervalRef.current);
      awayIntervalRef.current = null;
    }
    leaveStartedAtRef.current = null;
    setAwayActive(false);
    setAwayRemainingMs(TRIVIA_LEAVE_LIMIT_MS);
  }, []);

  const triggerCancel = useCallback(
    async (reason: string) => {
      if (cancellingRef.current || !userId) return;
      cancellingRef.current = true;
      clearAwayTimers();
      clearActiveTriviaRunInSession(userId);

      const { data } = await invokeDailyTrivia<{
        cancelled?: boolean;
        cancelReason?: string;
        cancelMessage?: string;
        xpRevoked?: number;
        newUserPointsTotal?: number | null;
      }>({
        action: 'cancel',
        reason,
      });

      setAttempt((prev) =>
        prev
          ? {
              ...prev,
              status: 'cancelled',
              xpEarned: 0,
              grandPrizeAwarded: false,
              unlimitedExpiresAt: null,
              cancelReason: data?.cancelReason || reason,
              cancelMessage:
                data?.cancelMessage ||
                'Yarışma ekranından ayrıldıktan sonra 5 saniye içinde geri dönülmediği için yarışma otomatik olarak iptal edildi ve bu yarışmaya ait ödüller verilmedi.',
              cancelledAt: new Date().toISOString(),
            }
          : prev,
      );
      setLastFeedback(null);
      if (typeof data?.newUserPointsTotal === 'number') {
        setUserPoints(data.newUserPointsTotal);
      }
      window.dispatchEvent(new CustomEvent('econnotes:points-updated'));
      window.dispatchEvent(new CustomEvent('econnotes:trivia-updated'));
      toast.error('Yarışma güvenlik kuralı gereği iptal edildi. Bu yarışmaya ait ödüller verilmedi.');
      cancellingRef.current = false;
    },
    [clearAwayTimers, userId],
  );

  // Initial status fetch (+ reload anti-cheat detection strictly once per page mount)
  const fetchStatus = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setErrorMsg(null);

    const activeRunMarker = !initialReloadCheckedRef.current
      ? readActiveTriviaRunInSession(userId)
      : null;
    initialReloadCheckedRef.current = true;

    const { data, error } = await invokeDailyTrivia<TriviaStatusResponse>({
      action: 'status',
      clientReloaded: Boolean(activeRunMarker),
    });

    if (error || !data) {
      setErrorMsg(error || 'Yarışma bilgileri yüklenemedi.');
      setLoading(false);
      return;
    }

    setQuizDate(data.quizDate);
    setResetsAtIso(data.resetsAtIso);
    setAttempt(data.attempt);
    setQuestions(data.questions || []);
    setAnswers(data.answers || []);
    setUserPoints(data.userPoints || 0);
    setUnlimitedExpiresAt(data.unlimitedExpiresAt || null);
    syncTriviaUnlimitedUntil(userId, data.unlimitedExpiresAt || null);

    if (data.attempt?.status === 'in_progress') {
      setCurrentIdx(Math.min(data.attempt.currentIndex, TRIVIA_TOTAL_QUESTIONS - 1));
      markActiveTriviaRunInSession(userId, data.quizDate, data.attempt.id);
    } else {
      clearActiveTriviaRunInSession(userId);
      if (data.attempt?.status === 'cancelled' && activeRunMarker) {
        window.dispatchEvent(new CustomEvent('econnotes:points-updated'));
        toast.error(
          data.attempt.cancelMessage ||
            'Sayfa yenilendiği için yarışma güvenlik kuralları gereği iptal edildi.',
        );
      }
    }

    setLoading(false);
  }, [userId]);

  useEffect(() => {
    if (!authLoading) {
      void fetchStatus();
    }
  }, [authLoading, fetchStatus]);

  // Real-time 5-second leave detection (tab switch, window blur, page refresh/close)
  useEffect(() => {
    if (!isInProgress || !userId) {
      clearAwayTimers();
      return;
    }

    const startAwayClock = (reason: string) => {
      if (!isInProgressRef.current || cancellingRef.current) return;
      if (leaveStartedAtRef.current !== null) return; // already counting

      const started = Date.now();
      leaveStartedAtRef.current = started;
      setAwayActive(true);
      setAwayRemainingMs(TRIVIA_LEAVE_LIMIT_MS);

      // Immediately stamp departure on server with keepalive
      sendDailyTriviaBeacon(accessTokenRef.current, { action: 'report_leave', reason }, userId);

      awayIntervalRef.current = window.setInterval(() => {
        if (leaveStartedAtRef.current === null) return;
        const elapsed = Date.now() - leaveStartedAtRef.current;
        const left = Math.max(0, TRIVIA_LEAVE_LIMIT_MS - elapsed);
        setAwayRemainingMs(left);
        if (elapsed >= TRIVIA_LEAVE_LIMIT_MS) {
          void triggerCancel('left_screen_over_5s');
        }
      }, 80);
    };

    const handleReturn = async () => {
      if (!isInProgressRef.current || cancellingRef.current) return;
      if (leaveStartedAtRef.current === null) return;

      const elapsed = Date.now() - leaveStartedAtRef.current;
      clearAwayTimers();

      if (elapsed >= TRIVIA_LEAVE_LIMIT_MS) {
        await triggerCancel('left_screen_over_5s');
        return;
      }

      // Server-side timestamp verification
      const { data } = await invokeDailyTrivia<TriviaReturnResponse>({
        action: 'report_return',
      });

      if (data?.cancelled) {
        clearActiveTriviaRunInSession(userId);
        setAttempt((prev) =>
          prev
            ? {
                ...prev,
                status: 'cancelled',
                xpEarned: 0,
                grandPrizeAwarded: false,
                unlimitedExpiresAt: null,
                cancelReason: data.cancelReason || 'away_over_5s',
                cancelMessage:
                  data.cancelMessage ||
                  '5 saniyelik geri dönüş süresi aşıldığı için yarışma iptal edildi.',
                cancelledAt: new Date().toISOString(),
              }
            : prev,
        );
        if (typeof data.newUserPointsTotal === 'number') {
          setUserPoints(data.newUserPointsTotal);
        }
        window.dispatchEvent(new CustomEvent('econnotes:points-updated'));
        toast.error(data.cancelMessage || '5 saniye içinde dönülmediği için yarışma iptal edildi.');
        return;
      }

      const secStr = (elapsed / 1000).toFixed(1);
      setReturnWarning(
        `Yarışma ekranından ayrıldınız (${secStr} sn). 5 saniye içinde döndüğünüz için devam ediyorsunuz; bir dahaki ayrılışta 5 saniyeyi aşarsanız yarışma iptal edilir.`,
      );
    };

    const onVisibilityChange = () => {
      if (document.hidden) {
        startAwayClock('tab_hidden');
      } else {
        void handleReturn();
      }
    };

    const onWindowBlur = () => {
      startAwayClock('window_blur');
    };

    const onWindowFocus = () => {
      if (!document.hidden) {
        void handleReturn();
      }
    };

    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!isInProgressRef.current) return;
      sendDailyTriviaBeacon(
        accessTokenRef.current,
        {
          action: 'report_leave',
          reason: 'page_unload',
        },
        userId,
      );
      e.preventDefault();
      e.returnValue = '';
    };

    const onPageHide = () => {
      if (!isInProgressRef.current) return;
      sendDailyTriviaBeacon(
        accessTokenRef.current,
        {
          action: 'report_leave',
          reason: 'page_hide',
        },
        userId,
      );
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('blur', onWindowBlur);
    window.addEventListener('focus', onWindowFocus);
    window.addEventListener('beforeunload', onBeforeUnload);
    window.addEventListener('pagehide', onPageHide);

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('blur', onWindowBlur);
      window.removeEventListener('focus', onWindowFocus);
      window.removeEventListener('beforeunload', onBeforeUnload);
      window.removeEventListener('pagehide', onPageHide);
      if (isInProgressRef.current) {
        // Navigating away via SPA router triggers server leave timestamp
        sendDailyTriviaBeacon(
          accessTokenRef.current,
          {
            action: 'report_leave',
            reason: 'navigated_away',
          },
          userId,
        );
      }
      clearAwayTimers();
    };
  }, [isInProgress, userId, clearAwayTimers, triggerCancel]);

  const handleStart = async () => {
    if (!user || starting) return;
    setStarting(true);
    setErrorMsg(null);
    const { data, error } = await invokeDailyTrivia<TriviaStartResponse>({ action: 'start' });
    setStarting(false);

    if (error || !data) {
      toast.error(error || 'Yarışma başlatılamadı.');
      void fetchStatus();
      return;
    }

    setQuizDate(data.quizDate);
    setResetsAtIso(data.resetsAtIso);
    setAttempt(data.attempt);
    setQuestions(data.questions || []);
    setAnswers([]);
    setCurrentIdx(0);
    setLastFeedback(null);
    setReturnWarning(null);
    markActiveTriviaRunInSession(user.id, data.quizDate, data.attempt.id);
    toast.success('Yarışma başladı! Ekrandan ayrılmadan 15 soruyu tamamla.');
  };

  const handleSelectOption = async (optionIndex: number) => {
    if (!user || !attempt || attempt.status !== 'in_progress' || submitting || lastFeedback) return;
    setSubmitting(true);

    const { data, error, raw } = await invokeDailyTrivia<TriviaAnswerResponse>({
      action: 'answer',
      questionIndex: currentIdx,
      selectedOption: optionIndex,
    });
    setSubmitting(false);

    if (raw?.cancelled) {
      clearActiveTriviaRunInSession(user.id);
      setAttempt((prev) =>
        prev
          ? {
              ...prev,
              status: 'cancelled',
              xpEarned: 0,
              grandPrizeAwarded: false,
              unlimitedExpiresAt: null,
              cancelReason: String(raw.cancelReason || 'away_over_5s'),
              cancelMessage: error || 'Yarışma güvenlik kuralı gereği iptal edildi.',
            }
          : prev,
      );
      window.dispatchEvent(new CustomEvent('econnotes:points-updated'));
      toast.error(error || 'Yarışma iptal edildi.');
      return;
    }

    if (error || !data) {
      toast.error(error || 'Cevap gönderilemedi.');
      return;
    }

    setLastFeedback(data);
    setAnswers((prev) => [
      ...prev.filter((a) => a.questionIndex !== data.questionIndex),
      {
        questionIndex: data.questionIndex,
        selectedOption: data.selectedOption,
        isCorrect: data.isCorrect,
        xpAwarded: data.xpAwarded,
        correctIndex: data.correctIndex,
        explanation: data.explanation,
      },
    ]);
    setUserPoints(data.newUserPointsTotal);
    setAttempt((prev) =>
      prev
        ? {
            ...prev,
            currentIndex: data.answeredCount,
            answeredCount: data.answeredCount,
            correctCount: data.correctCount,
            xpEarned: data.totalXpEarned,
            grandPrizeAwarded: data.grandPrizeAwarded,
            unlimitedExpiresAt: data.unlimitedExpiresAt,
          }
        : prev,
    );

    if (data.isCorrect) {
      window.dispatchEvent(new CustomEvent('econnotes:points-updated'));
      toast.success(`Doğru! +${TRIVIA_XP_PER_CORRECT} XP hesabına eklendi.`);
    }

    if (data.completed) {
      clearActiveTriviaRunInSession(user.id);
      if (data.grandPrizeAwarded && data.unlimitedExpiresAt) {
        setUnlimitedExpiresAt(data.unlimitedExpiresAt);
        syncTriviaUnlimitedUntil(user.id, data.unlimitedExpiresAt);
        void refreshProfile?.();
        toast.success('MÜKEMMEL! 15/15 ile 375 XP + 2 Saatlik Sınırsız Not Erişimi kazandın!');
      }
    }
  };

  const handleNextQuestion = () => {
    if (!lastFeedback) return;
    if (lastFeedback.completed) {
      setAttempt((prev) =>
        prev
          ? {
              ...prev,
              status: 'completed',
              completedAt: new Date().toISOString(),
            }
          : prev,
      );
      setLastFeedback(null);
      return;
    }
    setCurrentIdx(lastFeedback.answeredCount);
    setLastFeedback(null);
  };

  const activeUnlimitedPass = useMemo(() => {
    const untilIso = unlimitedExpiresAt || attempt?.unlimitedExpiresAt || null;
    const ms = untilIso ? Date.parse(untilIso) : 0;
    const activeFromServer = Number.isFinite(ms) && ms > nowTick;
    const activeFromClient = isTriviaUnlimitedActive(user, profile as any, new Date(nowTick));
    if (!activeFromServer && !activeFromClient) return null;
    const remaining = activeFromServer
      ? formatCountdownToIso(untilIso, new Date(nowTick))
      : getTriviaUnlimitedRemainingLabel(user, profile as any, new Date(nowTick));
    return { active: true, remaining, expiresAtIso: untilIso };
  }, [unlimitedExpiresAt, attempt?.unlimitedExpiresAt, user, profile, nowTick]);

  const midnightCountdown = useMemo(
    () => formatCountdownToIso(resetsAtIso, new Date(nowTick)),
    [resetsAtIso, nowTick],
  );

  const formattedQuizDate = useMemo(() => {
    if (!quizDate) return '';
    const [y, m, d] = quizDate.split('-').map(Number);
    if (!y || !m || !d) return quizDate;
    return new Date(y, m - 1, d).toLocaleDateString('tr-TR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      weekday: 'long',
    });
  }, [quizDate]);

  if (authLoading || loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background p-6 text-muted-foreground">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
        <p className="mt-3 text-sm font-medium">Günlük Genel Kültür Bilgi Yarışması hazırlanıyor...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md rounded-3xl border-border/70 p-6 text-center shadow-xl">
          <CardContent className="space-y-4 p-2">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Trophy className="h-7 w-7" />
            </div>
            <h1 className="text-xl font-extrabold text-foreground">
              Günlük Genel Kültür Bilgi Yarışması
            </h1>
            <p className="text-sm text-muted-foreground">
              Her gün yenilenen 15 genel kültür sorusuyla 375 XP ve 2 saatlik sınırsız not erişimi
              kazanmak için EconNotes hesabınla giriş yap.
            </p>
            <Button onClick={() => navigate('/login')} className="w-full gap-2 rounded-xl">
              <LogIn className="h-4 w-4" />
              Giriş Yap
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const currentQuestion = questions[currentIdx] || null;
  const remainingQuestions = Math.max(
    0,
    TRIVIA_TOTAL_QUESTIONS - (attempt?.answeredCount ?? 0),
  );
  const progressPct = Math.round(
    ((attempt?.answeredCount ?? 0) / TRIVIA_TOTAL_QUESTIONS) * 100,
  );

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-background text-foreground selection:bg-primary/20">
      {/* Subtle Cobalt / Gold Ambiance */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -top-36 left-1/3 h-[420px] w-[720px] -translate-x-1/2 rounded-full bg-gradient-to-br from-[#003791]/18 via-blue-500/10 to-transparent blur-[110px]" />
        <div className="absolute bottom-0 right-0 h-[360px] w-[500px] rounded-full bg-gradient-to-tl from-amber-500/12 via-cyan-500/10 to-transparent blur-[120px]" />
      </div>

      {/* Independent Standalone Header (not coupled to any sidebar/menu) */}
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between gap-3 px-4">
          <div className="flex items-center gap-3 min-w-0">
            <EconLogo className="h-6 w-auto shrink-0" />
            <span className="h-5 w-px bg-border" />
            <span className="truncate text-xs font-bold tracking-tight text-foreground sm:text-sm">
              Günlük Bilgi Yarışması
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-bold text-primary tabular-nums">
              <Sparkles className="h-3.5 w-3.5" />
              {userPoints.toLocaleString('tr-TR')} XP
            </span>

            {!isInProgress ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => navigate('/')}
                className="h-8 gap-1.5 rounded-xl text-xs"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Ana Sayfa</span>
              </Button>
            ) : (
              <Badge
                variant="outline"
                className="gap-1 border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400"
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Güvenli Yarışma Modu</span>
                <span className="sm:hidden">5 sn Kuralı</span>
              </Badge>
            )}
          </div>
        </div>
      </header>

      {/* Main Standalone Arena */}
      <main className="relative z-10 mx-auto max-w-3xl px-4 py-6 sm:py-8 space-y-5">
        {/* Live 2-Hour Grand Prize Active Banner */}
        {activeUnlimitedPass && (
          <div className="flex flex-col gap-3 rounded-2xl border-2 border-amber-500/40 bg-gradient-to-r from-amber-500/15 via-card to-orange-500/10 p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-md">
                <Crown className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-extrabold text-foreground">
                  2 Saatlik Sınırsız Not Erişimi Aktif!
                </p>
                <p className="text-xs text-muted-foreground">
                  Kalan süre:{' '}
                  <strong className="font-mono text-amber-600 dark:text-amber-400">
                    {activeUnlimitedPass.remaining}
                  </strong>{' '}
                  · Süre dolduğunda normal kotana otomatik dönülür.
                </p>
              </div>
            </div>
            <Button
              type="button"
              size="sm"
              onClick={() => navigate('/notes')}
              className="shrink-0 gap-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 text-white hover:opacity-95"
            >
              <BookOpen className="h-3.5 w-3.5" />
              Notlara Git
            </Button>
          </div>
        )}

        {errorMsg && (
          <Card className="rounded-2xl border-destructive/40 bg-destructive/5">
            <CardContent className="flex flex-col items-center gap-3 p-6 text-center">
              <AlertTriangle className="h-8 w-8 text-destructive" />
              <p className="text-sm font-semibold text-foreground">{errorMsg}</p>
              <Button size="sm" variant="outline" onClick={() => void fetchStatus()}>
                Tekrar Dene
              </Button>
            </CardContent>
          </Card>
        )}

        {/* ==================== 1. LOBBY (NOT STARTED YET) ==================== */}
        {!errorMsg && !attempt && (
          <div className="space-y-5">
            <Card className="overflow-hidden rounded-3xl border-border/75 bg-card/95 shadow-xl">
              <div className="relative overflow-hidden bg-gradient-to-br from-[#001d52] via-[#003791] to-[#0070d1] p-6 text-white sm:p-8">
                <div className="pointer-events-none absolute -right-12 -top-12 h-44 w-44 rounded-full bg-cyan-400/25 blur-3xl" />
                <div className="relative z-10 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-white/10 px-3 py-1 text-[11px] font-bold text-cyan-100">
                      <Trophy className="h-3.5 w-3.5 text-amber-300" />
                      Her Gün Yeni 15 Soru
                    </span>
                    {midnightCountdown && (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-black/20 px-3 py-1 font-mono text-[11px] text-blue-100">
                        <Clock className="h-3 w-3 text-cyan-300" />
                        Yenilenmeye: {midnightCountdown}
                      </span>
                    )}
                  </div>

                  <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
                    Günlük Genel Kültür Bilgi Yarışması
                  </h1>
                  <p className="max-w-xl text-xs leading-relaxed text-blue-100/90 sm:text-sm">
                    {formattedQuizDate ? `${formattedQuizDate} · ` : ''}
                    Tarih, coğrafya, bilim, sanat, spor, teknoloji, edebiyat ve güncel genel kültür
                    alanlarından her gün benzersiz 15 soruyla bilgini test et!
                  </p>
                </div>
              </div>

              <CardContent className="space-y-5 p-5 sm:p-7">
                {/* 4 Key Rule Tiles */}
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-border/70 bg-muted/25 p-4">
                    <div className="flex items-center gap-2 text-xs font-bold text-foreground">
                      <Sparkles className="h-4 w-4 text-primary" />
                      Her Doğru Cevap +25 XP
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      15 soruyu tamamlayamasan bile doğru bildiğin her soru için +25 XP anında
                      hesabına eklenir ve korunur (14 doğru = 350 XP).
                    </p>
                  </div>

                  <div className="rounded-2xl border border-amber-500/30 bg-amber-500/[0.06] p-4">
                    <div className="flex items-center gap-2 text-xs font-bold text-foreground">
                      <Crown className="h-4 w-4 text-amber-500" />
                      15/15 Büyük Ödül: 2 Saat Sınırsız Not
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      15 sorunun tamamını doğru bil: toplam <strong>375 XP</strong>, Şampiyon rozeti
                      ve anında başlayan <strong>2 saatlik sınırsız not erişimi &amp; indirme</strong> kazan!
                    </p>
                  </div>

                  <div className="rounded-2xl border border-rose-500/30 bg-rose-500/[0.05] p-4">
                    <div className="flex items-center gap-2 text-xs font-bold text-foreground">
                      <ShieldAlert className="h-4 w-4 text-rose-500" />
                      5 Saniyelik Güvenlik &amp; Kopya Koruması
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      Yarışma sırasında başka sekmeye geçer veya ekrandan ayrılırsan 5 saniyelik
                      sayaç başlar. 5 sn içinde dönmezsen ya da sayfayı yenilersen yarışma iptal
                      edilir ve ödüller verilmez.
                    </p>
                  </div>

                  <div className="rounded-2xl border border-border/70 bg-muted/25 p-4">
                    <div className="flex items-center gap-2 text-xs font-bold text-foreground">
                      <Lock className="h-4 w-4 text-emerald-500" />
                      Günde 1 Katılım · Sunucu Doğrulamalı
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      Her kullanıcı günlük yarışmaya yalnızca 1 kez katılabilir. Tüm cevaplar,
                      süreler ve XP ödülleri sunucu tarafında doğrulanır.
                    </p>
                  </div>
                </div>

                {/* Expandable XP Reward Ladder */}
                <div className="rounded-2xl border border-border/70 bg-background/60">
                  <button
                    type="button"
                    onClick={() => setShowXpTable((v) => !v)}
                    className="flex w-full items-center justify-between px-4 py-3 text-xs font-bold text-foreground"
                  >
                    <span className="flex items-center gap-2">
                      <Award className="h-4 w-4 text-primary" />
                      Doğru Cevap &amp; XP Ödül Tablosu (1 – 15 Soru)
                    </span>
                    {showXpTable ? (
                      <ChevronUp className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    )}
                  </button>
                  {showXpTable && (
                    <div className="grid grid-cols-3 gap-1.5 border-t border-border/60 p-3 sm:grid-cols-5">
                      {TRIVIA_XP_LADDER.map((row) => (
                        <div
                          key={row.correct}
                          className={cn(
                            'rounded-xl border px-2.5 py-2 text-center text-xs',
                            row.isGrandPrize
                              ? 'border-amber-500/50 bg-amber-500/15 font-extrabold text-amber-600 dark:text-amber-400'
                              : 'border-border/60 bg-muted/30',
                          )}
                        >
                          <p className="text-[10.5px] text-muted-foreground">{row.correct} doğru</p>
                          <p className="font-bold tabular-nums">{row.xp} XP</p>
                          {row.isGrandPrize && (
                            <p className="mt-0.5 text-[9.5px] font-bold">+ 2 Saat Sınırsız</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <Button
                  type="button"
                  size="lg"
                  disabled={starting}
                  onClick={() => void handleStart()}
                  className="h-12 w-full gap-2 rounded-2xl bg-gradient-to-r from-[#003791] via-[#0055b8] to-[#0070d1] text-sm font-extrabold text-white shadow-lg shadow-primary/25 hover:opacity-95"
                >
                  {starting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Günün 15 Sorusu Hazırlanıyor...
                    </>
                  ) : (
                    <>
                      <Flame className="h-4 w-4 text-amber-300" />
                      Yarışmaya Başla (15 Soru)
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ==================== 2. ACTIVE QUIZ ==================== */}
        {!errorMsg && isInProgress && currentQuestion && (
          <div className="relative space-y-4">
            {/* Return Warning Alert (after returning within 5s) */}
            {returnWarning && (
              <div className="flex items-start gap-2.5 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-3.5 text-xs text-amber-700 dark:text-amber-300">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                <p className="leading-relaxed">{returnWarning}</p>
              </div>
            )}

            {/* Top HUD: Progress, Remaining, Live Earned XP */}
            <Card className="rounded-2xl border-border/75 bg-card/95 shadow-xs">
              <CardContent className="space-y-3 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-extrabold text-foreground">
                      Soru {currentIdx + 1} / {TRIVIA_TOTAL_QUESTIONS}
                    </span>
                    <span className="text-muted-foreground">·</span>
                    <span className="text-muted-foreground">
                      Kalan: <strong className="text-foreground">{remainingQuestions}</strong> soru
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {attempt?.correctCount ?? 0} Doğru
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 font-bold text-primary tabular-nums">
                      <Sparkles className="h-3.5 w-3.5" />
                      +{attempt?.xpEarned ?? 0} XP
                    </span>
                  </div>
                </div>

                <Progress value={progressPct} className="h-2" />

                {/* 15-Question Status Dots */}
                <div className="grid grid-cols-[repeat(15,minmax(0,1fr))] gap-1">
                  {Array.from({ length: TRIVIA_TOTAL_QUESTIONS }).map((_, idx) => {
                    const ans = answers.find((a) => a.questionIndex === idx);
                    const isCur = idx === currentIdx;
                    return (
                      <div
                        key={idx}
                        className={cn(
                          'h-1.5 rounded-full transition-all',
                          ans
                            ? ans.isCorrect
                              ? 'bg-emerald-500'
                              : 'bg-rose-500'
                            : isCur
                            ? 'bg-primary ring-2 ring-primary/30'
                            : 'bg-muted',
                        )}
                      />
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Question Card */}
            <Card
              className={cn(
                'overflow-hidden rounded-3xl border-border/75 bg-card/95 shadow-lg transition-all',
                awayActive && 'pointer-events-none select-none blur-md',
              )}
            >
              <CardContent className="space-y-5 p-5 sm:p-7">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Badge
                    variant="outline"
                    className={cn('rounded-full px-3 py-1 text-xs font-bold', CATEGORY_STYLES[currentQuestion.category])}
                  >
                    {currentQuestion.category}
                  </Badge>
                  <Badge
                    variant="outline"
                    className={cn('rounded-full px-2.5 py-0.5 text-[11px] font-semibold', DIFFICULTY_LABELS[currentQuestion.difficulty].cls)}
                  >
                    {DIFFICULTY_LABELS[currentQuestion.difficulty].label}
                  </Badge>
                </div>

                <h2 className="text-base font-bold leading-relaxed text-foreground sm:text-xl">
                  {currentQuestion.question}
                </h2>

                {/* 4 Options (A, B, C, D) */}
                <div className="space-y-2.5">
                  {currentQuestion.options.map((opt, idx) => {
                    const isSelected = lastFeedback?.selectedOption === idx;
                    const isCorrectOpt = lastFeedback?.correctIndex === idx;
                    const showResult = Boolean(lastFeedback);

                    let optionStyle =
                      'border-border/80 bg-background/70 hover:border-primary/50 hover:bg-primary/[0.04]';
                    if (showResult) {
                      if (isCorrectOpt) {
                        optionStyle =
                          'border-emerald-500 bg-emerald-500/12 text-foreground ring-1 ring-emerald-500/35';
                      } else if (isSelected && !lastFeedback?.isCorrect) {
                        optionStyle =
                          'border-rose-500 bg-rose-500/12 text-foreground ring-1 ring-rose-500/35';
                      } else {
                        optionStyle = 'border-border/50 bg-muted/20 opacity-60';
                      }
                    }

                    return (
                      <button
                        key={idx}
                        type="button"
                        disabled={submitting || showResult}
                        onClick={() => void handleSelectOption(idx)}
                        className={cn(
                          'group flex w-full items-center gap-3.5 rounded-2xl border p-3.5 text-left transition-all sm:p-4',
                          optionStyle,
                        )}
                      >
                        <span
                          className={cn(
                            'flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border text-xs font-extrabold transition-colors',
                            showResult && isCorrectOpt
                              ? 'border-emerald-500 bg-emerald-500 text-white'
                              : showResult && isSelected && !lastFeedback?.isCorrect
                              ? 'border-rose-500 bg-rose-500 text-white'
                              : 'border-border/80 bg-muted/60 text-foreground group-hover:border-primary/50 group-hover:bg-primary group-hover:text-primary-foreground',
                          )}
                        >
                          {OPTION_LETTERS[idx]}
                        </span>
                        <span className="flex-1 text-sm font-medium leading-snug text-foreground">
                          {opt}
                        </span>
                        {showResult && isCorrectOpt && (
                          <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" />
                        )}
                        {showResult && isSelected && !lastFeedback?.isCorrect && (
                          <XCircle className="h-5 w-5 shrink-0 text-rose-500" />
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Submitting indicator */}
                {submitting && (
                  <div className="flex items-center justify-center gap-2 py-1 text-xs text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    Cevabın sunucuda doğrulanıyor...
                  </div>
                )}

                {/* Answer Feedback + Next Button */}
                {lastFeedback && (
                  <div
                    className={cn(
                      'space-y-3 rounded-2xl border p-4 animate-fade-in',
                      lastFeedback.isCorrect
                        ? 'border-emerald-500/35 bg-emerald-500/[0.07]'
                        : 'border-rose-500/35 bg-rose-500/[0.06]',
                    )}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-sm font-extrabold">
                        {lastFeedback.isCorrect ? (
                          <>
                            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                            <span className="text-emerald-600 dark:text-emerald-400">
                              Doğru Cevap! +{lastFeedback.xpAwarded} XP Kazandın
                            </span>
                          </>
                        ) : (
                          <>
                            <XCircle className="h-5 w-5 text-rose-500" />
                            <span className="text-rose-600 dark:text-rose-400">
                              Yanlış Cevap · Doğru seçenek: {OPTION_LETTERS[lastFeedback.correctIndex]}
                            </span>
                          </>
                        )}
                      </div>
                      <span className="text-xs font-semibold text-muted-foreground tabular-nums">
                        Toplam kazanç: +{lastFeedback.totalXpEarned} XP
                      </span>
                    </div>

                    <p className="text-xs leading-relaxed text-foreground/90">
                      {lastFeedback.explanation}
                    </p>

                    <Button
                      type="button"
                      onClick={handleNextQuestion}
                      className="h-10 w-full gap-2 rounded-xl font-bold"
                    >
                      {lastFeedback.completed ? (
                        <>
                          <Trophy className="h-4 w-4" />
                          Yarışma Sonucunu Gör
                        </>
                      ) : (
                        <>
                          <span>Sonraki Soru ({currentIdx + 2} / {TRIVIA_TOTAL_QUESTIONS})</span>
                          <ArrowRight className="h-4 w-4" />
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* 5-Second Away Countdown Lock Overlay */}
            {awayActive && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 p-4 backdrop-blur-md">
                <div className="w-full max-w-md rounded-3xl border-2 border-rose-500/60 bg-card p-6 text-center shadow-2xl space-y-4">
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-500/15 text-rose-500 animate-pulse">
                    <ShieldAlert className="h-8 w-8" />
                  </div>
                  <h2 className="text-xl font-extrabold text-foreground">
                    Yarışma Ekranından Ayrıldınız!
                  </h2>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    Güvenlik kuralları gereği 5 saniye içinde yarışma ekranına geri dönmezseniz
                    yarışma otomatik olarak iptal edilecek ve ödüller verilmeyecektir.
                  </p>
                  <div className="font-mono text-4xl font-black text-rose-500 tabular-nums">
                    {(awayRemainingMs / 1000).toFixed(1)} sn
                  </div>
                  <Button
                    type="button"
                    onClick={() => window.focus()}
                    className="w-full rounded-xl bg-rose-600 text-white hover:bg-rose-700"
                  >
                    Yarışmaya Geri Dön
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ==================== 3. CANCELLED SCREEN ==================== */}
        {!errorMsg && attempt?.status === 'cancelled' && (
          <Card className="overflow-hidden rounded-3xl border-2 border-rose-500/40 bg-card shadow-xl">
            <CardContent className="space-y-5 p-6 text-center sm:p-8">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-500/15 text-rose-500">
                <ShieldAlert className="h-8 w-8" />
              </div>
              <div className="space-y-1.5">
                <Badge variant="destructive" className="rounded-full px-3 py-0.5 text-xs">
                  Yarışma İptal Edildi
                </Badge>
                <h1 className="text-xl font-extrabold text-foreground sm:text-2xl">
                  Bugünkü Yarışma Güvenlik Kuralı Nedeniyle Sonlandırıldı
                </h1>
                <p className="mx-auto max-w-lg text-sm leading-relaxed text-muted-foreground">
                  {attempt.cancelMessage ||
                    'Yarışma ekranından ayrıldıktan sonra 5 saniye içinde geri dönülmediği veya sayfa yenilendiği için yarışma otomatik olarak iptal edildi ve bu yarışmaya ait ödüller verilmedi.'}
                </p>
              </div>

              <div className="mx-auto flex max-w-sm items-center justify-center gap-2 rounded-2xl border border-border/70 bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
                <Clock className="h-4 w-4 text-primary" />
                <span>
                  Yeni 15 soruluk yarışmaya:{' '}
                  <strong className="font-mono text-foreground">{midnightCountdown}</strong>
                </span>
              </div>

              <div className="flex flex-wrap justify-center gap-2.5 pt-1">
                <Button variant="outline" onClick={() => navigate('/')} className="rounded-xl">
                  Ana Sayfaya Dön
                </Button>
                <Button onClick={() => navigate('/notes')} className="rounded-xl">
                  Ders Notlarına Git
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ==================== 4. COMPLETED SCREEN ==================== */}
        {!errorMsg && attempt?.status === 'completed' && (
          <Card
            className={cn(
              'overflow-hidden rounded-3xl shadow-xl',
              attempt.grandPrizeAwarded
                ? 'border-2 border-amber-500/50 bg-card'
                : 'border-border/75 bg-card',
            )}
          >
            <div
              className={cn(
                'p-6 text-center text-white sm:p-8',
                attempt.grandPrizeAwarded
                  ? 'bg-gradient-to-br from-amber-500 via-orange-500 to-[#003791]'
                  : 'bg-gradient-to-br from-[#001d52] via-[#003791] to-[#0070d1]',
              )}
            >
              <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/15 backdrop-blur-md">
                {attempt.grandPrizeAwarded ? (
                  <Crown className="h-9 w-9 text-amber-200" />
                ) : (
                  <Trophy className="h-8 w-8 text-cyan-200" />
                )}
              </div>
              <h1 className="text-2xl font-extrabold sm:text-3xl">
                {attempt.grandPrizeAwarded
                  ? 'Efsane! 15/15 Tam Puan!'
                  : 'Günlük Yarışmayı Tamamladın!'}
              </h1>
              <p className="mt-1.5 text-xs text-white/90 sm:text-sm">
                {attempt.grandPrizeAwarded
                  ? '15 sorunun tamamını doğru bilerek 375 XP, Şampiyon rozeti ve 2 saatlik sınırsız not erişimi kazandın!'
                  : `${attempt.correctCount} doğru cevap ile kazandığın ${attempt.xpEarned} XP hesabına tanımlandı ve korundu.`}
              </p>
            </div>

            <CardContent className="space-y-5 p-6">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-border/70 bg-muted/25 p-4 text-center">
                  <p className="text-xs text-muted-foreground">Doğru Sayısı</p>
                  <p className="mt-1 text-2xl font-extrabold text-foreground tabular-nums">
                    {attempt.correctCount} / {TRIVIA_TOTAL_QUESTIONS}
                  </p>
                </div>
                <div className="rounded-2xl border border-primary/25 bg-primary/[0.06] p-4 text-center">
                  <p className="text-xs text-muted-foreground">Kazanılan XP</p>
                  <p className="mt-1 text-2xl font-extrabold text-primary tabular-nums">
                    +{attempt.xpEarned} XP
                  </p>
                </div>
                <div className="rounded-2xl border border-border/70 bg-muted/25 p-4 text-center">
                  <p className="text-xs text-muted-foreground">Büyük Ödül (15/15)</p>
                  <p
                    className={cn(
                      'mt-1 text-sm font-extrabold',
                      attempt.grandPrizeAwarded
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-muted-foreground',
                    )}
                  >
                    {attempt.grandPrizeAwarded ? '2 Saat Sınırsız Aktif' : 'Kazanılamadı'}
                  </p>
                </div>
              </div>

              {!attempt.grandPrizeAwarded && (
                <div className="rounded-2xl border border-border/70 bg-muted/20 p-3.5 text-center text-xs text-muted-foreground">
                  2 saatlik sınırsız not erişimi büyük ödülü için 15 sorunun tamamını doğru
                  cevaplamak gerekir. Kazandığın{' '}
                  <strong className="text-foreground">{attempt.xpEarned} XP</strong> toplam puanına
                  eklendi!
                </div>
              )}

              {/* Answer summary dots */}
              {answers.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground">Soru Özeti</p>
                  <div className="flex flex-wrap gap-1.5">
                    {answers.map((a) => (
                      <span
                        key={a.questionIndex}
                        className={cn(
                          'inline-flex h-8 w-8 items-center justify-center rounded-xl border text-xs font-bold',
                          a.isCorrect
                            ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                            : 'border-rose-500/40 bg-rose-500/15 text-rose-600 dark:text-rose-400',
                        )}
                        title={`Soru ${a.questionIndex + 1}: ${a.isCorrect ? 'Doğru (+25 XP)' : 'Yanlış (0 XP)'}`}
                      >
                        {a.questionIndex + 1}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-center gap-2 rounded-2xl border border-border/70 bg-muted/25 px-4 py-3 text-xs text-muted-foreground">
                <Clock className="h-4 w-4 text-primary" />
                <span>
                  Yarının 15 yeni sorusuna:{' '}
                  <strong className="font-mono text-foreground">{midnightCountdown}</strong>
                </span>
              </div>

              <div className="flex flex-wrap justify-center gap-2.5">
                <Button variant="outline" onClick={() => navigate('/points')} className="rounded-xl gap-1.5">
                  <Sparkles className="h-4 w-4 text-primary" />
                  Puan Geçmişim
                </Button>
                <Button onClick={() => navigate('/notes')} className="rounded-xl gap-1.5">
                  <BookOpen className="h-4 w-4" />
                  {attempt.grandPrizeAwarded ? 'Sınırsız Notlara Git' : 'Ders Notlarına Git'}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
