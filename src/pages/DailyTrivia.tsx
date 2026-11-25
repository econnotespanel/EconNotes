import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Award,
  BookOpen,
  CheckCircle2,
  Clock,
  Crown,
  Flag,
  Home,
  ListChecks,
  Loader2,
  LogIn,
  MinusCircle,
  Play,
  ShieldAlert,
  Sparkles,
  Square,
  Timer,
  Trophy,
  Volume2,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import EconLogo from '@/components/EconLogo';
import { TriviaArenaBackdrop, TriviaHeroBannerPattern } from '@/components/trivia/TriviaArenaBackdrop';
import { TriviaAudioControls } from '@/components/trivia/TriviaAudioControls';
import {
  isTurkishTtsSupported,
  loadTriviaAudioPrefs,
  playTriviaSound,
  saveTriviaAudioPrefs,
  speakTriviaQuestion,
  startTriviaAmbientMusic,
  stopAllTriviaAudio,
  stopTriviaAmbientMusic,
  stopTriviaSpeech,
  unlockTriviaAudio,
  updateTriviaAmbientMusicVolume,
  type TriviaAudioPrefs,
} from '@/lib/triviaAudio';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import {
  clearActiveTriviaRunInSession,
  formatCountdownToIso,
  formatTriviaClock,
  getDailyRenewalInfo,
  getTriviaUnlimitedRemainingLabel,
  invokeDailyTrivia,
  isTriviaUnlimitedActive,
  markActiveTriviaRunInSession,
  readActiveTriviaRunInSession,
  sendDailyTriviaBeacon,
  syncTriviaUnlimitedUntil,
  TRIVIA_LEAVE_LIMIT_MS,
  TRIVIA_TIME_LIMIT_MS,
  TRIVIA_TOTAL_QUESTIONS,
  TRIVIA_WARNING_MS,
  TRIVIA_XP_PER_CORRECT,
  type TriviaAnswerRecord,
  type TriviaAnswerResponse,
  type TriviaAttemptSummary,
  type TriviaCategory,
  type TriviaDifficulty,
  type TriviaFinishResponse,
  type TriviaHeartbeatResponse,
  type TriviaQuestionClient,
  type TriviaReturnResponse,
  type TriviaStartResponse,
  type TriviaStatusResponse,
} from '@/lib/dailyTrivia';
import { cn } from '@/lib/utils';

const OPTION_LETTERS = ['A', 'B', 'C', 'D'] as const;
const FLAGS_STORAGE_PREFIX = 'econnotes_trivia_flags_';

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

function readFlags(attemptId: string): number[] {
  try {
    const raw = sessionStorage.getItem(`${FLAGS_STORAGE_PREFIX}${attemptId}`);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((n): n is number => Number.isInteger(n) && n >= 0 && n < TRIVIA_TOTAL_QUESTIONS)
      : [];
  } catch {
    return [];
  }
}

function writeFlags(attemptId: string, flags: Set<number>): void {
  try {
    sessionStorage.setItem(`${FLAGS_STORAGE_PREFIX}${attemptId}`, JSON.stringify([...flags]));
  } catch {
    // ignore storage errors
  }
}

function answersToMap(list: TriviaAnswerRecord[] | undefined): Record<number, number> {
  const map: Record<number, number> = {};
  for (const a of list || []) {
    map[a.questionIndex] = a.selectedOption;
  }
  return map;
}

export default function DailyTrivia() {
  const { user, profile, loading: authLoading, refreshProfile } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [entryTransition, setEntryTransition] = useState<'idle' | 'leaving' | 'launching'>('idle');
  const [finishing, setFinishing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [attempt, setAttempt] = useState<TriviaAttemptSummary | null>(null);
  const [questions, setQuestions] = useState<TriviaQuestionClient[]>([]);
  const [answers, setAnswers] = useState<TriviaAnswerRecord[]>([]);
  const [selected, setSelected] = useState<Record<number, number>>({});
  const [flagged, setFlagged] = useState<Set<number>>(new Set());
  const [userPoints, setUserPoints] = useState<number>(0);
  const [unlimitedExpiresAt, setUnlimitedExpiresAt] = useState<string | null>(null);

  const [currentIdx, setCurrentIdx] = useState(0);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [confirmFinishOpen, setConfirmFinishOpen] = useState(false);
  const [clockOffsetMs, setClockOffsetMs] = useState(0);
  const [nowTick, setNowTick] = useState(() => Date.now());

  // Audio, TTS & Motion preferences (persisted in localStorage)
  const [audioPrefs, setAudioPrefs] = useState<TriviaAudioPrefs>(() => loadTriviaAudioPrefs());
  const audioPrefsRef = useRef(audioPrefs);
  audioPrefsRef.current = audioPrefs;
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [lastSelectedOption, setLastSelectedOption] = useState<number | null>(null);
  const [inspectedAnswerIdx, setInspectedAnswerIdx] = useState<number | null>(null);
  const ttsSupported = useMemo(() => isTurkishTtsSupported(), []);

  // 5-second anti-cheat return guard state
  const [awayActive, setAwayActive] = useState(false);
  const [awayRemainingMs, setAwayRemainingMs] = useState(TRIVIA_LEAVE_LIMIT_MS);
  const [returnWarning, setReturnWarning] = useState<string | null>(null);

  const accessTokenRef = useRef<string | null>(null);
  const isInProgressRef = useRef(false);
  const isActiveQuizRef = useRef(false);
  const attemptStatusRef = useRef<string>('not_started');
  const leaveStartedAtRef = useRef<number | null>(null);
  const graceExpiresAtRef = useRef<number | null>(null);
  const leaveBeaconSentRef = useRef(false);
  const awayIntervalRef = useRef<number | null>(null);
  const returningRef = useRef(false);
  const cancellingRef = useRef(false);
  const initialReloadCheckedRef = useRef(false);
  const finishingRef = useRef(false);
  const warnedRef = useRef(false);
  const clockOffsetRef = useRef(0);
  // Cevap kayıtları sırayla (kuyruk) gönderilir; başarısız olanlar bitişten önce tekrar denenir
  const saveChainRef = useRef<Promise<void>>(Promise.resolve());
  const pendingSavesRef = useRef(0);
  const unsavedRef = useRef<Map<number, number>>(new Map());

  const userId = user?.id ?? null;
  const isInProgress = attempt?.status === 'in_progress';
  const isActiveQuiz = attempt?.status === 'in_progress' || attempt?.status === 'grace_period';
  isInProgressRef.current = isInProgress;
  isActiveQuizRef.current = isActiveQuiz;
  attemptStatusRef.current = attempt?.status ?? 'not_started';

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

  // 1-second UI clock: quiz countdown, unlimited pass countdown and midnight refresh countdown
  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const syncClock = useCallback((serverNowIso?: string | null) => {
    const serverMs = serverNowIso ? Date.parse(serverNowIso) : NaN;
    if (Number.isFinite(serverMs)) {
      const offset = serverMs - Date.now();
      clockOffsetRef.current = offset;
      setClockOffsetMs(offset);
    }
  }, []);

  const stopAwayIntervalOnly = useCallback(() => {
    if (awayIntervalRef.current !== null) {
      window.clearInterval(awayIntervalRef.current);
      awayIntervalRef.current = null;
    }
  }, []);

  const clearAwayTimers = useCallback(() => {
    stopAwayIntervalOnly();
    leaveStartedAtRef.current = null;
    graceExpiresAtRef.current = null;
    leaveBeaconSentRef.current = false;
    returningRef.current = false;
    setAwayActive(false);
    setAwayRemainingMs(TRIVIA_LEAVE_LIMIT_MS);
  }, [stopAwayIntervalOnly]);

  const handleAudioPrefsChange = useCallback(
    (next: TriviaAudioPrefs) => {
      audioPrefsRef.current = next;
      setAudioPrefs(next);
      saveTriviaAudioPrefs(next);

      if (!next.masterEnabled || next.volume <= 0.001) {
        stopAllTriviaAudio();
        setIsSpeaking(false);
        return;
      }
      if (!next.ttsEnabled) {
        stopTriviaSpeech();
        setIsSpeaking(false);
      }
      if (isInProgressRef.current) {
        if (next.musicEnabled) {
          startTriviaAmbientMusic(next);
          updateTriviaAmbientMusicVolume(next);
        } else {
          stopTriviaAmbientMusic();
        }
      } else {
        stopTriviaAmbientMusic();
      }
    },
    [],
  );

  // Stop all audio & speech cleanly on unmount
  useEffect(() => {
    return () => {
      stopAllTriviaAudio();
    };
  }, []);

  // Sync opt-in ambient music strictly with active quiz state (stops immediately on end/cancel/mute)
  useEffect(() => {
    if (isInProgress && audioPrefs.masterEnabled && audioPrefs.musicEnabled && audioPrefs.volume > 0.001) {
      startTriviaAmbientMusic(audioPrefs);
    } else {
      stopTriviaAmbientMusic();
    }
  }, [isInProgress, audioPrefs.masterEnabled, audioPrefs.musicEnabled, audioPrefs.volume]);

  // Stop speech automatically when question changes or quiz leaves active state
  useEffect(() => {
    stopTriviaSpeech();
    setIsSpeaking(false);
    setLastSelectedOption(null);
  }, [currentIdx, isInProgress]);

  const markCancelledLocally = useCallback(
    (reason: string, message: string | null, points?: number | null) => {
      stopAllTriviaAudio();
      clearAwayTimers();
      setIsSpeaking(false);
      playTriviaSound('wrong', audioPrefsRef.current);
      if (userId) clearActiveTriviaRunInSession(userId);
      isInProgressRef.current = false;
      isActiveQuizRef.current = false;
      attemptStatusRef.current = 'cancelled';
      unsavedRef.current.clear();
      setQuestions([]);
      setAttempt((prev) =>
        prev
          ? {
              ...prev,
              status: 'cancelled',
              xpEarned: 0,
              grandPrizeAwarded: false,
              unlimitedExpiresAt: null,
              leaveStartedAt: null,
              graceExpiresAt: null,
              cancelReason: reason,
              cancelMessage:
                message ||
                'Yarışma sırasında 5 saniye içerisinde geri dönülmediği için katılımınız iptal edildi.',
              cancelledAt: new Date().toISOString(),
            }
          : prev,
      );
      if (typeof points === 'number') setUserPoints(points);
      setFinishing(false);
      finishingRef.current = false;
      window.dispatchEvent(new CustomEvent('econnotes:points-updated'));
      window.dispatchEvent(new CustomEvent('econnotes:trivia-updated'));
    },
    [clearAwayTimers, userId],
  );

  const markExpiredLocally = useCallback(() => {
    stopAllTriviaAudio();
    clearAwayTimers();
    setIsSpeaking(false);
    if (userId) clearActiveTriviaRunInSession(userId);
    isInProgressRef.current = false;
    isActiveQuizRef.current = false;
    attemptStatusRef.current = 'expired';
    unsavedRef.current.clear();
    setQuestions([]);
    setAttempt((prev) =>
      prev
        ? {
            ...prev,
            status: 'expired',
            xpEarned: 0,
            grandPrizeAwarded: false,
            unlimitedExpiresAt: null,
            leaveStartedAt: null,
            graceExpiresAt: null,
            timedOut: true,
            cancelReason: 'time_expired',
            cancelMessage: '15 dakikalık yarışma süresi dolduğu için oturum sonlandı.',
          }
        : prev,
    );
    setFinishing(false);
    finishingRef.current = false;
    window.dispatchEvent(new CustomEvent('econnotes:trivia-updated'));
  }, [clearAwayTimers, userId]);

  const triggerCancel = useCallback(
    async (reason: string) => {
      if (cancellingRef.current || !userId) return;
      if (
        attemptStatusRef.current === 'cancelled' ||
        attemptStatusRef.current === 'completed' ||
        attemptStatusRef.current === 'expired'
      ) {
        return;
      }
      cancellingRef.current = true;
      stopAwayIntervalOnly();
      clearActiveTriviaRunInSession(userId);

      try {
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

        markCancelledLocally(data?.cancelReason || reason, data?.cancelMessage || null, data?.newUserPointsTotal);
        toast.error('Yarışma güvenlik kuralı gereği iptal edildi. Bu yarışmaya ait ödüller verilmedi.');
      } finally {
        cancellingRef.current = false;
      }
    },
    [markCancelledLocally, stopAwayIntervalOnly, userId],
  );

  /** Tek merkezli 5 saniyelik ayrılma zamanlayıcısı — aynı ayrılmada asla ikinci zamanlayıcı oluşturmaz. */
  const enterGracePeriod = useCallback(
    (reason: string, existingGraceExpiresAtLocalMs?: number) => {
      if (!userId || !isActiveQuizRef.current || cancellingRef.current || finishingRef.current) return;

      // Aynı ayrılma olayı (blur + visibilitychange + pagehide) için zamanlayıcıyı ASLA sıfırlama / çoğaltma!
      if (leaveStartedAtRef.current !== null) {
        if (
          (reason === 'page_hide' || reason === 'page_unload' || reason === 'navigated_away') &&
          !leaveBeaconSentRef.current
        ) {
          leaveBeaconSentRef.current = true;
          sendDailyTriviaBeacon(accessTokenRef.current, { action: 'report_leave', reason }, userId);
        }
        return;
      }

      const now = Date.now();
      const graceUntil =
        typeof existingGraceExpiresAtLocalMs === 'number' && Number.isFinite(existingGraceExpiresAtLocalMs)
          ? existingGraceExpiresAtLocalMs
          : now + TRIVIA_LEAVE_LIMIT_MS;
      const started = graceUntil - TRIVIA_LEAVE_LIMIT_MS;

      leaveStartedAtRef.current = started;
      graceExpiresAtRef.current = graceUntil;
      setAwayActive(true);
      setAwayRemainingMs(Math.max(0, graceUntil - now));

      if (existingGraceExpiresAtLocalMs === undefined) {
        leaveBeaconSentRef.current = true;
        sendDailyTriviaBeacon(accessTokenRef.current, { action: 'report_leave', reason }, userId);
      }

      if (now >= graceUntil) {
        void triggerCancel('away_over_5s');
        return;
      }

      stopAwayIntervalOnly();
      awayIntervalRef.current = window.setInterval(() => {
        if (graceExpiresAtRef.current === null) return;
        const left = Math.max(0, graceExpiresAtRef.current - Date.now());
        setAwayRemainingMs(left);
        if (left <= 0) {
          stopAwayIntervalOnly();
          void triggerCancel('away_over_5s');
        }
      }, 80);
    },
    [stopAwayIntervalOnly, triggerCancel, userId],
  );

  /** Sunucu zamanıyla doğrulanan geri dönüş işleyici (visibilitychange / focus / pageshow / buton). */
  const handleReturn = useCallback(
    async (source: 'visibilitychange' | 'focus' | 'pageshow' | 'button_click' | 'reload_resume') => {
      if (!userId || !isActiveQuizRef.current || cancellingRef.current || finishingRef.current) return;
      if (document.hidden && source !== 'button_click') return;
      if (returningRef.current) return;
      if (leaveStartedAtRef.current === null && attemptStatusRef.current !== 'grace_period') return;

      returningRef.current = true;
      const now = Date.now();
      const elapsed =
        leaveStartedAtRef.current !== null ? Math.max(0, now - leaveStartedAtRef.current) : 0;
      const deadline = graceExpiresAtRef.current;

      if ((deadline !== null && now >= deadline) || elapsed >= TRIVIA_LEAVE_LIMIT_MS) {
        stopAwayIntervalOnly();
        returningRef.current = false;
        await triggerCancel('away_over_5s');
        return;
      }

      try {
        const { data, error } = await invokeDailyTrivia<TriviaReturnResponse>({
          action: 'report_return',
        });

        if (data?.cancelled) {
          markCancelledLocally(
            data.cancelReason || 'away_over_5s',
            data.cancelMessage || '5 saniyelik geri dönüş süresi aşıldığı için yarışma iptal edildi.',
            data.newUserPointsTotal,
          );
          toast.error(data.cancelMessage || '5 saniye içinde dönülmediği için yarışma iptal edildi.');
          return;
        }

        if (data?.expired) {
          markExpiredLocally();
          toast.info('Yarışma süresi dolduğu için oturum sonlandı.');
          return;
        }

        if (error || !data) {
          // Sunucu onayı olmadan grace_period'u kapatma; süre dolduysa iptal et
          if (graceExpiresAtRef.current !== null && Date.now() >= graceExpiresAtRef.current) {
            await triggerCancel('away_over_5s');
          }
          return;
        }

        syncClock(data.serverNowIso);
        clearAwayTimers();
        if (Array.isArray(data.questions) && data.questions.length > 0) {
          setQuestions(data.questions);
        }
        setAttempt((prev) =>
          prev && prev.status === 'grace_period'
            ? { ...prev, status: 'in_progress', leaveStartedAt: null, graceExpiresAt: null }
            : prev,
        );

        const reportedMs = typeof data.awayMs === 'number' && data.awayMs > 0 ? data.awayMs : elapsed;
        if (reportedMs > 0) {
          const secStr = (reportedMs / 1000).toFixed(1);
          setReturnWarning(
            `Yarışma ekranından ayrıldınız (${secStr} sn). 5 saniye içinde döndüğünüz için devam ediyorsunuz; bir dahaki ayrılışta 5 saniyeyi aşarsanız yarışma iptal edilir.`,
          );
        }
      } finally {
        returningRef.current = false;
      }
    },
    [
      clearAwayTimers,
      markCancelledLocally,
      markExpiredLocally,
      stopAwayIntervalOnly,
      syncClock,
      triggerCancel,
      userId,
    ],
  );

  /** Sunucudan gelen sonucu (Yarışmayı Bitir veya süre doldu) ekrana uygular. */
  const applyFinalResult = useCallback(
    (final: TriviaFinishResponse) => {
      if (!userId) return;
      stopAllTriviaAudio();
      setIsSpeaking(false);
      clearActiveTriviaRunInSession(userId);
      clearAwayTimers();
      setAttempt(final.attempt);
      setAnswers(final.answers);
      setSelected(answersToMap(final.answers));
      setQuestions([]);
      setUserPoints(final.newUserPointsTotal);
      setConfirmFinishOpen(false);
      setFinishing(false);
      setInspectedAnswerIdx(null);
      if (final.grandPrizeAwarded && final.unlimitedExpiresAt) {
        playTriviaSound('grand_prize', audioPrefsRef.current);
        setUnlimitedExpiresAt(final.unlimitedExpiresAt);
        syncTriviaUnlimitedUntil(userId, final.unlimitedExpiresAt);
        void refreshProfile?.();
        toast.success('MÜKEMMEL! 15/15 ile 375 XP + 2 Saatlik Sınırsız Not Erişimi kazandın!');
      } else if (final.timedOut) {
        playTriviaSound(final.correctCount > 0 ? 'complete' : 'wrong', audioPrefsRef.current);
        toast.info('Süre doldu. Kaydedilen cevapların değerlendirildi.');
      } else {
        playTriviaSound(final.correctCount > 0 ? 'complete' : 'wrong', audioPrefsRef.current);
      }
      window.dispatchEvent(new CustomEvent('econnotes:points-updated'));
      window.dispatchEvent(new CustomEvent('econnotes:trivia-updated'));
    },
    [clearAwayTimers, refreshProfile, userId],
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

    syncClock(data.serverNowIso);
    setNowTick(Date.now());
    setAttempt(data.attempt);
    setQuestions(data.questions || []);
    setAnswers(data.answers || []);
    setSelected(answersToMap(data.answers));
    setUserPoints(data.userPoints || 0);
    setUnlimitedExpiresAt(data.unlimitedExpiresAt || null);
    syncTriviaUnlimitedUntil(userId, data.unlimitedExpiresAt || null);

    if (data.attempt?.status === 'in_progress') {
      setCurrentIdx(Math.min(data.attempt.currentIndex, TRIVIA_TOTAL_QUESTIONS - 1));
      setFlagged(new Set(readFlags(data.attempt.id)));
      markActiveTriviaRunInSession(userId, data.quizDate, data.attempt.id);
    } else if (data.attempt?.status === 'grace_period') {
      // Sunucuda 5 sn geri dönüş penceresinde: sayacı ASLA baştan başlatma!
      setCurrentIdx(Math.min(data.attempt.currentIndex, TRIVIA_TOTAL_QUESTIONS - 1));
      setFlagged(new Set(readFlags(data.attempt.id)));
      markActiveTriviaRunInSession(userId, data.quizDate, data.attempt.id);
      isActiveQuizRef.current = true;
      attemptStatusRef.current = 'grace_period';

      const graceServerMs = data.attempt.graceExpiresAt ? Date.parse(data.attempt.graceExpiresAt) : NaN;
      const serverNowMs = data.serverNowIso ? Date.parse(data.serverNowIso) : Date.now();
      const remainingFromServer = Number.isFinite(graceServerMs)
        ? graceServerMs - serverNowMs
        : TRIVIA_LEAVE_LIMIT_MS;
      const localGraceDeadline = Date.now() + remainingFromServer;

      if (remainingFromServer <= 0) {
        setLoading(false);
        void triggerCancel('away_over_5s');
        return;
      }

      if (!document.hidden) {
        // Kullanıcı 5 sn içinde sayfaya geri döndü/yeniledi -> sunucu zamanıyla doğrula
        const ret = await invokeDailyTrivia<TriviaReturnResponse>({ action: 'report_return' });
        if (ret.data?.cancelled) {
          markCancelledLocally(
            ret.data.cancelReason || 'away_over_5s',
            ret.data.cancelMessage || null,
            ret.data.newUserPointsTotal,
          );
          toast.error(
            ret.data.cancelMessage ||
              'Yarışma sırasında 5 saniye içerisinde geri dönülmediği için katılımınız iptal edildi.',
          );
        } else if (ret.data?.expired) {
          markExpiredLocally();
        } else if (ret.data && !ret.error) {
          syncClock(ret.data.serverNowIso);
          clearAwayTimers();
          if (Array.isArray(ret.data.questions) && ret.data.questions.length > 0) {
            setQuestions(ret.data.questions);
          }
          setAttempt((prev) =>
            prev ? { ...prev, status: 'in_progress', leaveStartedAt: null, graceExpiresAt: null } : prev,
          );
        } else {
          enterGracePeriod('reload_grace', localGraceDeadline);
        }
      } else {
        enterGracePeriod('reload_grace', localGraceDeadline);
      }
    } else {
      clearActiveTriviaRunInSession(userId);
      clearAwayTimers();
      if (data.attempt?.status === 'cancelled' && activeRunMarker) {
        window.dispatchEvent(new CustomEvent('econnotes:points-updated'));
        toast.error(
          data.attempt.cancelMessage ||
            'Yarışma sırasında 5 saniye içerisinde geri dönülmediği için katılımınız iptal edildi.',
        );
      } else if (data.attempt?.status === 'completed' && data.attempt.timedOut && activeRunMarker) {
        window.dispatchEvent(new CustomEvent('econnotes:points-updated'));
      }
    }

    setLoading(false);
  }, [clearAwayTimers, enterGracePeriod, markCancelledLocally, markExpiredLocally, syncClock, triggerCancel, userId]);

  useEffect(() => {
    if (!authLoading) {
      void fetchStatus();
    }
  }, [authLoading, fetchStatus]);

  // Real-time 5-second leave detection across Desktop, Mobile, iOS Safari & PWA lifecycle events.
  // Soru navigasyonu (Önceki/Sonraki/numara/işaretleme/cevap değişimi) sayfa içi durumdur, ekran terk sayılmaz.
  useEffect(() => {
    if (!isActiveQuiz || !userId) {
      clearAwayTimers();
      return;
    }

    const onVisibilityChange = () => {
      if (document.hidden) {
        enterGracePeriod('tab_hidden');
      } else {
        void handleReturn('visibilitychange');
      }
    };

    const onWindowBlur = () => {
      enterGracePeriod('window_blur');
    };

    const onWindowFocus = () => {
      if (!document.hidden) {
        void handleReturn('focus');
      }
    };

    const onPageHide = () => {
      enterGracePeriod('page_hide');
    };

    const onPageShow = () => {
      if (!document.hidden) {
        void handleReturn('pageshow');
      }
    };

    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!isActiveQuizRef.current || finishingRef.current || cancellingRef.current) return;
      enterGracePeriod('page_unload');
      e.preventDefault();
      e.returnValue = '';
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('blur', onWindowBlur);
    window.addEventListener('focus', onWindowFocus);
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('pageshow', onPageShow);
    window.addEventListener('beforeunload', onBeforeUnload);

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('blur', onWindowBlur);
      window.removeEventListener('focus', onWindowFocus);
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('pageshow', onPageShow);
      window.removeEventListener('beforeunload', onBeforeUnload);
      if (isActiveQuizRef.current && !finishingRef.current && !cancellingRef.current) {
        // SPA route değişikliğinde sunucuda 5 sn geri dönüş penceresini başlat; yerel zaman damgasını SİLME!
        enterGracePeriod('navigated_away');
      }
      stopAwayIntervalOnly();
    };
  }, [isActiveQuiz, userId, clearAwayTimers, enterGracePeriod, handleReturn, stopAwayIntervalOnly]);

  // Sunucu tarafı son etkinlik / canlılık kontrolü (iOS Safari/PWA arka planda askıya alınsa bile yakalar)
  useEffect(() => {
    if (!isInProgress || awayActive || !userId) return;
    let active = true;

    const sendHeartbeat = async () => {
      if (!active || document.hidden || !isInProgressRef.current || cancellingRef.current || finishingRef.current) {
        return;
      }
      const { data } = await invokeDailyTrivia<TriviaHeartbeatResponse>({ action: 'heartbeat' });
      if (!active || !data) return;
      if (data.serverNowIso) syncClock(data.serverNowIso);
      if (data.cancelled) {
        markCancelledLocally(
          data.cancelReason || 'inactivity_over_5s',
          data.cancelMessage || null,
        );
        toast.error(data.cancelMessage || 'Yarışma güvenlik kuralı gereği iptal edildi.');
      } else if (data.expired) {
        markExpiredLocally();
      } else if (data.status === 'grace_period' && data.graceExpiresAt) {
        const graceMs = Date.parse(data.graceExpiresAt) - clockOffsetRef.current;
        enterGracePeriod('server_grace', graceMs);
      }
    };

    void sendHeartbeat();
    const hbId = window.setInterval(() => {
      void sendHeartbeat();
    }, 3000);

    return () => {
      active = false;
      window.clearInterval(hbId);
    };
  }, [isInProgress, awayActive, userId, enterGracePeriod, markCancelledLocally, markExpiredLocally, syncClock]);

  const handleStart = async () => {
    if (!user || starting) return;
    unlockTriviaAudio();
    const reduceMotion = audioPrefsRef.current.reducedMotion;
    setStarting(true);
    if (!reduceMotion) {
      setEntryTransition('leaving');
    }
    setErrorMsg(null);
    const { data, error } = await invokeDailyTrivia<TriviaStartResponse>({ action: 'start' });

    if (error || !data) {
      setStarting(false);
      setEntryTransition('idle');
      toast.error(error || 'Yarışma başlatılamadı.');
      void fetchStatus();
      return;
    }

    playTriviaSound('start', audioPrefsRef.current);

    // Brief, sleek launch curtain (skipped immediately when reducedMotion is enabled)
    if (!reduceMotion) {
      setEntryTransition('launching');
      await new Promise((resolve) => window.setTimeout(resolve, 320));
    }

    syncClock(data.serverNowIso);
    setNowTick(Date.now());
    setAttempt(data.attempt);
    setQuestions(data.questions || []);
    setAnswers([]);
    setSelected({});
    setFlagged(new Set());
    unsavedRef.current.clear();
    pendingSavesRef.current = 0;
    saveChainRef.current = Promise.resolve();
    finishingRef.current = false;
    warnedRef.current = false;
    setSaveState('idle');
    setCurrentIdx(0);
    setReturnWarning(null);
    markActiveTriviaRunInSession(user.id, data.quizDate, data.attempt.id);
    setStarting(false);
    setEntryTransition('idle');
    toast.success('Yarışma başladı. 15 dakikan var, bol şans!');
  };

  /** Seçimi anında ekrana yansıtır, sunucuya sıralı kuyrukla kaydeder. Cevap istendiği kadar değiştirilebilir. */
  const handleSelectOption = (optionIndex: number) => {
    if (!user || !attempt || attempt.status !== 'in_progress' || finishing) return;
    const qIdx = currentIdx;
    if (selected[qIdx] === optionIndex) return;

    unlockTriviaAudio();
    setLastSelectedOption(optionIndex);
    playTriviaSound('select', audioPrefsRef.current);
    setSelected((prev) => ({ ...prev, [qIdx]: optionIndex }));
    setSaveState('saving');
    pendingSavesRef.current += 1;
    unsavedRef.current.set(qIdx, optionIndex);

    saveChainRef.current = saveChainRef.current.then(async () => {
      // Aynı soru için daha yeni bir seçim kuyruğa girdiyse eskisini göndermeye gerek yok
      const latest = unsavedRef.current.get(qIdx);
      if (latest !== undefined && latest !== optionIndex) {
        pendingSavesRef.current = Math.max(0, pendingSavesRef.current - 1);
        return;
      }
      const { data, error, raw } = await invokeDailyTrivia<TriviaAnswerResponse>({
        action: 'answer',
        questionIndex: qIdx,
        selectedOption: optionIndex,
      });
      pendingSavesRef.current = Math.max(0, pendingSavesRef.current - 1);

      if (raw?.cancelled) {
        markCancelledLocally(
          String(raw.cancelReason || 'away_over_5s'),
          error || 'Yarışma güvenlik kuralı gereği iptal edildi.',
        );
        toast.error(error || 'Yarışma iptal edildi.');
        return;
      }
      if (raw?.expired) {
        markExpiredLocally();
        toast.info('Yarışma süresi dolduğu için oturum sonlandı.');
        return;
      }
      if (raw?.completed) {
        void fetchStatus();
        return;
      }
      if (data?.timedOut && data.final) {
        finishingRef.current = true;
        applyFinalResult(data.final);
        return;
      }
      if (error || !data) {
        setSaveState('error');
        toast.error('Cevap kaydedilemedi. Bağlantını kontrol et; bitirirken yeniden denenecek.');
        return;
      }

      syncClock(data.serverNowIso);
      if (unsavedRef.current.get(qIdx) === optionIndex) unsavedRef.current.delete(qIdx);
      if (pendingSavesRef.current === 0) {
        setSaveState(unsavedRef.current.size > 0 ? 'error' : 'saved');
      }
    });
  };

  const handleToggleFlag = () => {
    if (!attempt) return;
    setFlagged((prev) => {
      const next = new Set(prev);
      if (next.has(currentIdx)) next.delete(currentIdx);
      else next.add(currentIdx);
      writeFlags(attempt.id, next);
      return next;
    });
  };

  const goToQuestion = (idx: number) => {
    const nextIdx = Math.max(0, Math.min(TRIVIA_TOTAL_QUESTIONS - 1, idx));
    if (nextIdx === currentIdx) return;
    unlockTriviaAudio();
    stopTriviaSpeech();
    setIsSpeaking(false);
    playTriviaSound('next_question', audioPrefsRef.current);
    setCurrentIdx(nextIdx);
  };

  const handleToggleSpeakQuestion = () => {
    const activeQ = questions[currentIdx];
    if (!activeQ) return;
    unlockTriviaAudio();
    if (isSpeaking) {
      stopTriviaSpeech();
      setIsSpeaking(false);
      return;
    }
    if (!ttsSupported) {
      toast.info('Bu tarayıcı sesli okuma özelliğini desteklemiyor.');
      return;
    }
    if (!audioPrefs.masterEnabled || !audioPrefs.ttsEnabled) {
      toast.info('Sesli soru okuma ses ayarlarından kapalı. Üstteki Ses menüsünden açabilirsin.');
      return;
    }
    const started = speakTriviaQuestion(
      {
        questionIndex: currentIdx,
        question: activeQ.question,
        options: activeQ.options,
        includeOptions: audioPrefs.ttsReadOptions,
      },
      audioPrefs,
      {
        onStart: () => setIsSpeaking(true),
        onEnd: () => setIsSpeaking(false),
        onError: () => setIsSpeaking(false),
      },
    );
    if (started) {
      setIsSpeaking(true);
    }
  };

  /** Yarışmayı sonuçlandırır (kullanıcı onayı sonrası veya süre dolunca otomatik). */
  const finishQuiz = useCallback(
    async (timedOut: boolean) => {
      if (!userId || finishingRef.current) return;
      finishingRef.current = true;
      setFinishing(true);
      setConfirmFinishOpen(false);
      clearAwayTimers();

      try {
        await saveChainRef.current;

        // Kaydedilemeyen cevaplar varsa bitirmeden önce yeniden gönder (süre dolduysa sunucu reddeder)
        if (!timedOut && unsavedRef.current.size > 0) {
          for (const [qIdx, opt] of Array.from(unsavedRef.current.entries())) {
            const { error, raw } = await invokeDailyTrivia<TriviaAnswerResponse>({
              action: 'answer',
              questionIndex: qIdx,
              selectedOption: opt,
            });
            if (raw?.cancelled) {
              markCancelledLocally(String(raw.cancelReason || 'away_over_5s'), error);
              toast.error(error || 'Yarışma iptal edildi.');
              finishingRef.current = false;
              setFinishing(false);
              return;
            }
            if (!error) unsavedRef.current.delete(qIdx);
          }
        }

        let lastError: string | null = null;
        for (let attemptNo = 0; attemptNo < 3; attemptNo++) {
          const { data, error, raw } = await invokeDailyTrivia<TriviaFinishResponse>({
            action: 'finish',
            timedOut,
          });
          if (raw?.cancelled) {
            markCancelledLocally(
              String(raw.cancelReason || 'away_over_5s'),
              error || 'Yarışma güvenlik kuralı gereği iptal edildi.',
            );
            toast.error(error || 'Yarışma iptal edildi.');
            return;
          }
          if (raw?.expired) {
            markExpiredLocally();
            toast.info('Yarışma süresi dolduğu için oturum sonlandı.');
            return;
          }
          if (data) {
            applyFinalResult(data);
            return;
          }
          lastError = error || 'Yarışma sonuçlandırılamadı.';
          await new Promise((r) => window.setTimeout(r, 1200));
        }

        toast.error(lastError || 'Yarışma sonuçlandırılamadı. Lütfen tekrar dene.');
        finishingRef.current = false;
        setFinishing(false);
      } catch {
        toast.error('Yarışma sonuçlandırılamadı. Lütfen tekrar dene.');
        finishingRef.current = false;
        setFinishing(false);
      }
    },
    [applyFinalResult, clearAwayTimers, markCancelledLocally, userId],
  );

  // Quiz clock derived from the server-issued deadline (startedAt + 15 min), corrected by server clock offset
  const deadlineMs = useMemo(() => {
    if (!attempt) return 0;
    const fromDeadline = attempt.deadlineAt ? Date.parse(attempt.deadlineAt) : NaN;
    if (Number.isFinite(fromDeadline)) return fromDeadline;
    const started = Date.parse(attempt.startedAt);
    return (Number.isFinite(started) ? started : Date.now()) + TRIVIA_TIME_LIMIT_MS;
  }, [attempt]);

  const remainingMs = isInProgress
    ? Math.min(TRIVIA_TIME_LIMIT_MS, Math.max(0, deadlineMs - (nowTick + clockOffsetMs)))
    : 0;
  const timeIsUp = isInProgress && remainingMs <= 0;
  const warnTime = isInProgress && remainingMs > 0 && remainingMs <= TRIVIA_WARNING_MS;

  // Süre sıfırlandığında yarışmayı otomatik sonlandır (başarısız olursa her saniye yeniden dener)
  useEffect(() => {
    if (timeIsUp && !finishingRef.current) {
      void finishQuiz(true);
    }
  }, [timeIsUp, nowTick, finishQuiz]);

  // 2 dakika altına düşünce tek seferlik görsel ve sesli uyarı
  useEffect(() => {
    if (warnTime && !warnedRef.current) {
      warnedRef.current = true;
      playTriviaSound('two_min_warning', audioPrefsRef.current);
      toast.warning('Son 2 dakika! Süre dolduğunda yarışma otomatik sonlanır.');
    }
  }, [warnTime]);

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

  const renewalInfo = useMemo(
    () => getDailyRenewalInfo(new Date(nowTick + clockOffsetMs)),
    [nowTick, clockOffsetMs],
  );

  const answeredCount = Object.keys(selected).length;
  const blankIndexes = useMemo(
    () =>
      Array.from({ length: TRIVIA_TOTAL_QUESTIONS }, (_, i) => i).filter((i) => selected[i] === undefined),
    [selected],
  );
  const flaggedIndexes = useMemo(() => [...flagged].sort((a, b) => a - b), [flagged]);

  if (authLoading || loading) {
    return (
      <div className="safe-area-screen relative flex flex-col items-center justify-center overflow-hidden bg-background p-6 text-muted-foreground">
        <TriviaArenaBackdrop variant="lobby" />
        <div className="relative z-10 flex flex-col items-center gap-3 rounded-3xl border border-slate-200/80 bg-white/90 px-8 py-7 shadow-lg backdrop-blur-xl dark:border-blue-400/15 dark:bg-[#0b1730]/90">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#174ec4]/10 text-[#174ec4] dark:bg-blue-500/15 dark:text-blue-400">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
          <p className="text-sm font-semibold text-foreground">Yarışma hazırlanıyor...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="safe-area-screen relative flex items-center justify-center overflow-hidden bg-background p-4">
        <TriviaArenaBackdrop variant="lobby" />
        <Card className="relative z-10 w-full max-w-md overflow-hidden rounded-[26px] border-slate-200/90 bg-white/95 shadow-[0_24px_60px_-18px_rgba(11,42,110,0.22)] backdrop-blur-xl dark:border-blue-400/20 dark:bg-[#0b1730]/95">
          <div className="relative overflow-hidden bg-gradient-to-br from-[#061a44] via-[#0f3484] to-[#1f62e8] px-6 py-8 text-center text-white">
            <TriviaHeroBannerPattern />
            <div className="relative z-10 flex flex-col items-center space-y-3">
              <EconLogo allWhite className="h-[25px] w-[112px] justify-center" />
              <div className="flex h-13 w-13 items-center justify-center rounded-2xl border border-white/25 bg-white/10 backdrop-blur-md">
                <Trophy className="h-6 w-6 text-sky-200" />
              </div>
              <h1 className="text-xl font-extrabold tracking-tight">
                Günlük Genel Kültür Bilgi Yarışması
              </h1>
            </div>
          </div>
          <CardContent className="space-y-4 p-6 text-center">
            <p className="text-sm leading-relaxed text-muted-foreground">
              Her gün yenilenen sorularla bilgini test et, XP kazan! Katılmak için EconNotes hesabınla giriş yap.
            </p>
            <Button
              onClick={() => navigate('/login')}
              className="h-12 w-full gap-2 rounded-2xl bg-gradient-to-r from-[#0d3385] via-[#174ec4] to-[#2563eb] text-sm font-bold text-white shadow-md hover:brightness-105"
            >
              <LogIn className="h-4 w-4" />
              Giriş Yap
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const currentQuestion = questions[currentIdx] || null;
  const isLastQuestion = currentIdx === TRIVIA_TOTAL_QUESTIONS - 1;
  const progressPct = Math.round((answeredCount / TRIVIA_TOTAL_QUESTIONS) * 100);
  const remainingTimePct = isInProgress
    ? Math.max(0, Math.min(100, (remainingMs / TRIVIA_TIME_LIMIT_MS) * 100))
    : 100;

  const resultCorrect = attempt?.correctCount ?? 0;
  const resultBlank =
    attempt?.blankCount ?? Math.max(0, TRIVIA_TOTAL_QUESTIONS - answers.length);
  const resultWrong =
    attempt?.wrongCount ?? Math.max(0, answers.length - resultCorrect);

  const backdropVariant: 'lobby' | 'quiz' | 'result' | 'grand_prize' | 'cancelled' = isInProgress
    ? 'quiz'
    : attempt?.status === 'cancelled' || attempt?.status === 'expired'
    ? 'cancelled'
    : attempt?.status === 'completed'
    ? attempt.grandPrizeAwarded
      ? 'grand_prize'
      : 'result'
    : 'lobby';

  return (
    <div
      className={cn(
        'relative min-h-[100dvh] overflow-x-clip bg-background text-foreground selection:bg-[#1f62e8]/20',
        audioPrefs.reducedMotion && 'trivia-reduced-motion',
      )}
      style={{
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 2rem)',
      }}
    >
      {/* Architectural Navy / Electric-Blue CSS+SVG Arena Backdrop */}
      <TriviaArenaBackdrop variant={backdropVariant} />

      {/* iPhone Safe-Area Aware Standalone Header (Solid Surface to Prevent iOS PWA Top-Edge Blur) */}
      <header className="sticky top-0 z-30 w-full">
        <div
          className="border-b border-slate-200/85 bg-white dark:border-blue-400/15 dark:bg-[#071229]"
          style={{
            paddingTop: 'calc(env(safe-area-inset-top, 0px) + var(--ios-pwa-top-buffer, 0px))',
            paddingLeft: 'env(safe-area-inset-left, 0px)',
            paddingRight: 'env(safe-area-inset-right, 0px)',
          }}
        >
          <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-x-3 gap-y-2 px-3.5 py-2.5 sm:h-16 sm:flex-nowrap sm:px-5 sm:py-0">
            <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
              <EconLogo className="h-[22px] w-[99px] shrink-0 justify-center -translate-y-[2px] sm:h-[26px] sm:w-[117px] sm:-translate-y-[3px]" />
              <span aria-hidden="true" className="h-4 w-px shrink-0 bg-slate-200 dark:bg-slate-700 sm:h-5" />
              <span className="truncate text-xs font-bold leading-none tracking-tight text-foreground sm:text-sm">
                Günlük Bilgi Yarışması
              </span>
            </div>

            <div className="flex w-full shrink-0 items-center justify-between gap-2 sm:w-auto sm:justify-end">
              {isInProgress ? (
                <>
                  <div className="flex items-center gap-1.5 sm:gap-2">
                    <span
                      data-testid="trivia-header-qcount"
                      className="inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border border-slate-200/90 bg-slate-50 px-2.5 text-xs font-extrabold tabular-nums text-foreground dark:border-blue-400/20 dark:bg-[#0d1c3a]"
                    >
                      <ListChecks className="h-3.5 w-3.5 text-[#174ec4] dark:text-blue-400" />
                      <span>
                        Soru {currentIdx + 1} / {TRIVIA_TOTAL_QUESTIONS}
                      </span>
                    </span>
                    <TriviaAudioControls prefs={audioPrefs} onChange={handleAudioPrefsChange} compact />
                  </div>

                  <div
                    role="timer"
                    aria-live="off"
                    data-testid="trivia-timer"
                    className={cn(
                      'inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border px-3 font-mono text-sm font-black tabular-nums transition-colors sm:h-10 sm:px-3.5 sm:text-base',
                      warnTime
                        ? 'animate-pulse border-rose-500/60 bg-rose-500/15 text-rose-600 dark:text-rose-400'
                        : 'border-[#1f62e8]/30 bg-blue-50/90 text-[#0d3385] dark:border-blue-400/30 dark:bg-blue-500/15 dark:text-blue-200',
                    )}
                  >
                    <Timer className="h-4 w-4 shrink-0" />
                    <span>{formatTriviaClock(remainingMs)}</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-1.5 sm:gap-2">
                    <TriviaAudioControls prefs={audioPrefs} onChange={handleAudioPrefsChange} compact />
                    <span className="inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border border-[#1f62e8]/25 bg-blue-50/90 px-3 text-xs font-bold tabular-nums text-[#174ec4] dark:border-blue-400/25 dark:bg-blue-500/15 dark:text-blue-300">
                      <Sparkles className="h-3.5 w-3.5 shrink-0" />
                      <span>{userPoints.toLocaleString('tr-TR')} XP</span>
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => navigate('/')}
                    className="h-9 shrink-0 gap-1.5 whitespace-nowrap rounded-xl border-slate-200/90 bg-white/90 px-3 text-xs font-semibold hover:border-[#1f62e8]/45 hover:text-[#174ec4] dark:border-blue-400/20 dark:bg-[#0d1c3a] dark:hover:border-blue-400/45 dark:hover:text-blue-300"
                  >
                    <ArrowLeft className="h-3.5 w-3.5 shrink-0" />
                    <span>Ana Sayfa</span>
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Continuous Visual Remaining-Time Bar during Active Quiz */}
          {isInProgress && (
            <div className="h-1 w-full bg-slate-100 dark:bg-slate-800/80" aria-hidden="true">
              <div
                className={cn(
                  'h-full transition-[width] duration-700 ease-linear',
                  warnTime
                    ? 'bg-gradient-to-r from-rose-500 via-amber-500 to-rose-500'
                    : 'bg-gradient-to-r from-[#0d3385] via-[#1f62e8] to-[#38bdf8]',
                )}
                style={{ width: `${remainingTimePct}%` }}
              />
            </div>
          )}

          {warnTime && (
            <div
              data-testid="trivia-two-min-banner"
              className="flex items-center justify-center gap-2 border-t border-rose-500/25 bg-rose-50/95 px-4 py-1.5 text-center text-xs font-bold text-rose-700 dark:bg-rose-950/75 dark:text-rose-300"
            >
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              <span>Son 2 dakika! Süre dolduğunda cevapların güvenle sonuçlandırılır.</span>
            </div>
          )}
        </div>
      </header>

      {/* Main Standalone Arena */}
      <main
        className={cn(
          'relative z-10 mx-auto space-y-5 px-4 py-5 sm:py-8',
          isInProgress ? 'max-w-4xl' : 'max-w-3xl',
        )}
        style={{
          paddingLeft: 'max(1rem, env(safe-area-inset-left, 0px))',
          paddingRight: 'max(1rem, env(safe-area-inset-right, 0px))',
        }}
      >
        {/* Live 2-Hour Grand Prize Active Banner */}
        {activeUnlimitedPass && !isInProgress && (
          <div className="flex flex-col gap-3 rounded-2xl border border-amber-400/45 bg-gradient-to-r from-amber-50/95 via-white/95 to-blue-50/90 p-4 shadow-sm backdrop-blur-md dark:border-amber-400/35 dark:from-amber-500/15 dark:via-[#0b1730]/95 dark:to-blue-500/10 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500 to-amber-600 text-white shadow-sm">
                <Crown className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-extrabold text-foreground">
                  2 Saatlik Sınırsız Not Erişimi Aktif
                </p>
                <p className="text-xs text-muted-foreground">
                  Kalan süre:{' '}
                  <strong className="font-mono text-amber-700 dark:text-amber-300">
                    {activeUnlimitedPass.remaining}
                  </strong>
                </p>
              </div>
            </div>
            <Button
              type="button"
              size="sm"
              onClick={() => navigate('/notes')}
              className="h-10 shrink-0 gap-1.5 rounded-xl bg-gradient-to-r from-[#0d3385] to-[#1f62e8] px-4 font-bold text-white shadow-sm hover:brightness-105"
            >
              <BookOpen className="h-3.5 w-3.5" />
              Ders Notlarına Git
            </Button>
          </div>
        )}

        {errorMsg && (
          <Card className="rounded-3xl border-destructive/35 bg-white/95 shadow-lg dark:bg-[#0b1730]/95">
            <CardContent className="flex flex-col items-center gap-3 p-7 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <p className="text-sm font-semibold text-foreground">{errorMsg}</p>
              <Button size="sm" variant="outline" onClick={() => void fetchStatus()} className="rounded-xl">
                Tekrar Dene
              </Button>
            </CardContent>
          </Card>
        )}

        {/* ==================== 1B. BRIEF LAUNCH CURTAIN TRANSITION ==================== */}
        {!errorMsg && !attempt && entryTransition === 'launching' && (
          <div
            data-testid="trivia-launch-curtain"
            className="trivia-anim-launch mx-auto flex min-h-[380px] max-w-xl flex-col items-center justify-center rounded-[28px] border border-[#1f62e8]/30 bg-gradient-to-br from-[#061a44] via-[#0e3282] to-[#1f62e8] p-8 text-center text-white shadow-[0_24px_70px_-20px_rgba(13,51,133,0.55)]"
          >
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/25 bg-white/10 backdrop-blur-md">
              <Sparkles className="h-7 w-7 text-sky-200" />
            </div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-200">
              EconNotes Günlük Yarışma
            </p>
            <h2 className="mt-2 text-2xl font-extrabold tracking-tight sm:text-3xl">
              Yarışma Başlıyor
            </h2>
            <p className="mt-2 text-sm text-blue-100/90">
              15 Soru · 15 Dakika · Her doğru cevap 25 XP
            </p>
          </div>
        )}

        {/* ==================== 1. LOBBY / ENTRY SCREEN (NOT STARTED YET) ==================== */}
        {!errorMsg && !attempt && entryTransition !== 'launching' && (
          <Card
            data-testid="trivia-lobby"
            className={cn(
              'overflow-hidden rounded-[28px] border border-slate-200/90 bg-white/95 shadow-[0_24px_65px_-22px_rgba(11,42,110,0.22)] backdrop-blur-xl dark:border-blue-400/20 dark:bg-[#0b1730]/95 dark:shadow-[0_24px_65px_-22px_rgba(0,0,0,0.65)]',
              entryTransition === 'leaving' ? 'trivia-anim-lobby-exit' : 'trivia-anim-enter',
            )}
          >
            <div className="relative overflow-hidden bg-gradient-to-br from-[#061a44] via-[#0e3282] to-[#1f62e8] px-6 py-9 text-center text-white sm:px-10 sm:py-12">
              <TriviaHeroBannerPattern />
              <div className="relative z-10 flex flex-col items-center space-y-4">
                <EconLogo
                  allWhite
                  className="h-[26px] w-[117px] justify-center drop-shadow-[0_1px_2px_rgba(0,0,0,0.2)] sm:h-[28px] sm:w-[126px]"
                />
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/25 bg-white/15 shadow-inner backdrop-blur-md">
                  <Trophy className="h-7 w-7 text-sky-100" strokeWidth={1.9} />
                </div>
                <div className="space-y-2">
                  <h1 className="text-2xl font-extrabold tracking-tight sm:text-[32px] sm:leading-[1.18]">
                    Günlük Genel Kültür Bilgi Yarışması
                  </h1>
                  <p className="mx-auto max-w-md text-sm font-medium leading-relaxed text-blue-100/95 sm:text-base">
                    Her gün yenilenen sorularla bilgini test et, XP kazan!
                  </p>
                </div>
              </div>
            </div>

            <CardContent className="space-y-6 p-5 sm:p-8">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="flex items-center gap-3.5 rounded-2xl border border-slate-200/85 bg-slate-50/80 px-4 py-4 dark:border-blue-400/15 dark:bg-[#0f1f3f]/75 sm:flex-col sm:justify-center sm:gap-2 sm:py-5 sm:text-center">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-blue-200/80 bg-blue-50 text-[#174ec4] dark:border-blue-400/25 dark:bg-blue-500/15 dark:text-blue-300">
                    <ListChecks className="h-5 w-5" strokeWidth={2} />
                  </div>
                  <div className="text-left sm:text-center">
                    <p className="text-lg font-extrabold tracking-tight tabular-nums text-foreground sm:text-xl">
                      15 Soru
                    </p>
                    <p className="text-xs font-medium text-muted-foreground">Güne özel seçki</p>
                  </div>
                </div>

                <div className="flex items-center gap-3.5 rounded-2xl border border-slate-200/85 bg-slate-50/80 px-4 py-4 dark:border-blue-400/15 dark:bg-[#0f1f3f]/75 sm:flex-col sm:justify-center sm:gap-2 sm:py-5 sm:text-center">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-blue-200/80 bg-blue-50 text-[#174ec4] dark:border-blue-400/25 dark:bg-blue-500/15 dark:text-blue-300">
                    <Clock className="h-5 w-5" strokeWidth={2} />
                  </div>
                  <div className="text-left sm:text-center">
                    <p className="text-lg font-extrabold tracking-tight tabular-nums text-foreground sm:text-xl">
                      15 Dakika
                    </p>
                    <p className="text-xs font-medium text-muted-foreground">Toplam yarışma süresi</p>
                  </div>
                </div>

                <div className="flex items-center gap-3.5 rounded-2xl border border-[#1f62e8]/30 bg-blue-50/75 px-4 py-4 dark:border-blue-400/30 dark:bg-blue-500/15 sm:flex-col sm:justify-center sm:gap-2 sm:py-5 sm:text-center">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#1f62e8]/30 bg-[#174ec4]/10 text-[#174ec4] dark:border-blue-400/30 dark:bg-blue-500/20 dark:text-blue-300">
                    <Sparkles className="h-5 w-5" strokeWidth={2} />
                  </div>
                  <div className="text-left sm:text-center">
                    <p className="text-sm font-extrabold tracking-tight text-[#0d3385] dark:text-blue-200 sm:text-[15px]">
                      Her doğru cevap 25 XP
                    </p>
                    <p className="text-xs font-medium text-muted-foreground">15/15’te 375 XP</p>
                  </div>
                </div>
              </div>

              <Button
                type="button"
                size="lg"
                disabled={starting}
                data-testid="trivia-start-btn"
                onClick={() => void handleStart()}
                className="h-14 w-full gap-2.5 rounded-2xl bg-gradient-to-r from-[#0a2970] via-[#174ec4] to-[#2563eb] text-base font-extrabold text-white shadow-[0_14px_32px_-10px_rgba(23,78,196,0.55)] transition-all hover:brightness-105 active:scale-[0.995]"
              >
                {starting ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Yarışma Hazırlanıyor...
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 fill-current" />
                    Yarışmaya Başla
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* ==================== 2. ACTIVE QUIZ ==================== */}
        {!errorMsg && isInProgress && currentQuestion && (
          <div data-testid="trivia-active-quiz" className="trivia-anim-arena-reveal relative space-y-4">
            {/* Return Warning Alert (after returning within 5s) */}
            {returnWarning && (
              <div className="flex items-start gap-2.5 rounded-2xl border border-amber-500/40 bg-amber-50/95 p-3.5 text-xs text-amber-800 shadow-sm dark:bg-amber-950/60 dark:text-amber-200">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                <p className="leading-relaxed">{returnWarning}</p>
              </div>
            )}

            {/* 1-15 Question Navigation & Progress Card */}
            <Card className="rounded-[22px] border border-slate-200/90 bg-white/95 shadow-[0_10px_30px_-14px_rgba(11,42,110,0.12)] backdrop-blur-md dark:border-blue-400/15 dark:bg-[#0b1730]/95">
              <CardContent className="space-y-3 p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-extrabold text-foreground">
                      Soru {currentIdx + 1} / {TRIVIA_TOTAL_QUESTIONS}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full border border-[#1f62e8]/25 bg-blue-50 px-2.5 py-0.5 text-[11px] font-bold tabular-nums text-[#174ec4] dark:border-blue-400/25 dark:bg-blue-500/15 dark:text-blue-300">
                      <CheckCircle2 className="h-3 w-3" />
                      {answeredCount}/{TRIVIA_TOTAL_QUESTIONS} cevaplandı
                    </span>
                  </div>
                  <span
                    className={cn(
                      'text-[11px] font-medium',
                      saveState === 'error' ? 'text-rose-500' : 'text-muted-foreground',
                    )}
                  >
                    {saveState === 'saving'
                      ? 'Kaydediliyor...'
                      : saveState === 'error'
                      ? 'Kaydedilemedi, yeniden denenecek'
                      : saveState === 'saved'
                      ? 'Cevaplar kaydedildi'
                      : `Kalan süre: ${formatTriviaClock(remainingMs)}`}
                  </span>
                </div>

                <Progress value={progressPct} className="h-2 bg-slate-100 dark:bg-slate-800/80" />

                <div className="grid grid-cols-5 gap-2 sm:grid-cols-[repeat(15,minmax(0,1fr))] sm:gap-1.5">
                  {Array.from({ length: TRIVIA_TOTAL_QUESTIONS }).map((_, idx) => {
                    const isAnswered = selected[idx] !== undefined;
                    const isFlagged = flagged.has(idx);
                    const isCur = idx === currentIdx;
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => goToQuestion(idx)}
                        aria-label={`Soru ${idx + 1}${isAnswered ? ' cevaplandı' : ' boş'}${isFlagged ? ' işaretli' : ''}`}
                        aria-current={isCur ? 'step' : undefined}
                        className={cn(
                          'relative flex h-10 items-center justify-center rounded-xl border text-xs font-extrabold tabular-nums transition-all sm:h-9',
                          isFlagged
                            ? 'border-amber-500/80 bg-amber-500/15 text-amber-800 hover:bg-amber-500/25 dark:text-amber-300'
                            : isAnswered
                            ? 'border-[#174ec4] bg-[#174ec4] text-white shadow-xs hover:bg-[#1f62e8]'
                            : 'border-slate-200/90 bg-slate-50/80 text-slate-600 hover:border-[#1f62e8]/50 hover:text-foreground dark:border-slate-700/80 dark:bg-[#0f1f3f]/70 dark:text-slate-300',
                          isCur &&
                            'ring-2 ring-[#2563eb] ring-offset-2 ring-offset-white dark:ring-blue-400 dark:ring-offset-[#0b1730]',
                        )}
                      >
                        {idx + 1}
                        {isFlagged && isAnswered && (
                          <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-[#1f62e8] ring-2 ring-white dark:ring-[#0b1730]" />
                        )}
                      </button>
                    );
                  })}
                </div>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-medium text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-sm bg-[#174ec4]" /> Cevaplandı
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-sm border border-slate-300 bg-slate-50 dark:border-slate-600 dark:bg-slate-800" /> Boş
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-sm bg-amber-500" /> İşaretli
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Elevated High-Contrast Question Card */}
            <Card
              key={currentIdx}
              className={cn(
                'trivia-anim-enter relative overflow-hidden rounded-[26px] border border-slate-200/95 bg-white shadow-[0_20px_50px_-20px_rgba(11,42,110,0.18)] transition-all dark:border-blue-400/20 dark:bg-[#0b1730] dark:shadow-[0_24px_60px_-22px_rgba(0,0,0,0.65)]',
                warnTime && 'border-rose-500/50 ring-1 ring-rose-500/25',
                awayActive && 'pointer-events-none select-none blur-md',
              )}
            >
              <div
                aria-hidden="true"
                className={cn(
                  'pointer-events-none h-1 w-full bg-gradient-to-r',
                  warnTime
                    ? 'from-rose-500 via-amber-400 to-rose-500'
                    : 'from-[#061a44] via-[#1f62e8] to-[#60a5fa]',
                )}
              />
              <CardContent className="space-y-6 p-5 sm:p-8">
                {/* Category, Difficulty, TTS & Flag Controls */}
                <div className="flex flex-wrap items-center justify-between gap-2.5">
                  <div className="flex flex-wrap items-center gap-2">
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
                  <div className="flex items-center gap-2">
                    {ttsSupported && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleToggleSpeakQuestion}
                        aria-pressed={isSpeaking}
                        aria-label={isSpeaking ? 'Sesli okumayı durdur' : 'Soruyu sesli dinle'}
                        title={
                          isSpeaking
                            ? 'Sesli okumayı durdur'
                            : audioPrefs.ttsReadOptions
                            ? 'Soruyu ve şıkları Türkçe dinle'
                            : 'Soruyu Türkçe dinle'
                        }
                        className={cn(
                          'h-9 gap-1.5 rounded-xl border-slate-200/90 text-xs font-semibold transition-colors dark:border-blue-400/20',
                          isSpeaking
                            ? 'border-[#1f62e8] bg-blue-50 text-[#174ec4] dark:bg-blue-500/20 dark:text-blue-200'
                            : !audioPrefs.masterEnabled || !audioPrefs.ttsEnabled
                            ? 'opacity-60'
                            : 'hover:border-[#1f62e8]/50 hover:text-[#174ec4]',
                        )}
                      >
                        {isSpeaking ? (
                          <Square className="h-3 w-3 fill-current" />
                        ) : (
                          <Volume2 className="h-3.5 w-3.5 text-[#174ec4] dark:text-blue-400" />
                        )}
                        <span>{isSpeaking ? 'Durdur' : 'Dinle'}</span>
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleToggleFlag}
                      aria-pressed={flagged.has(currentIdx)}
                      className={cn(
                        'h-9 gap-1.5 rounded-xl border-slate-200/90 text-xs font-semibold dark:border-blue-400/20',
                        flagged.has(currentIdx) &&
                          'border-amber-500 bg-amber-500/15 text-amber-800 hover:bg-amber-500/20 dark:text-amber-300',
                      )}
                    >
                      <Flag className={cn('h-3.5 w-3.5', flagged.has(currentIdx) && 'fill-current')} />
                      <span>{flagged.has(currentIdx) ? 'İşaretli' : 'İşaretle'}</span>
                    </Button>
                  </div>
                </div>

                {/* High-Readability Question Stem */}
                <h2 className="text-[18px] font-bold leading-[1.52] tracking-[-0.01em] text-foreground sm:text-[22px]">
                  {currentQuestion.question}
                </h2>

                {/* 4 Equal-Standard Option Cards (A, B, C, D) */}
                <div className="grid grid-cols-1 gap-3">
                  {currentQuestion.options.map((opt, idx) => {
                    const isSelected = selected[currentIdx] === idx;
                    const justPicked = isSelected && lastSelectedOption === idx;
                    return (
                      <button
                        key={idx}
                        type="button"
                        disabled={finishing}
                        onClick={() => handleSelectOption(idx)}
                        aria-pressed={isSelected}
                        className={cn(
                          'group flex min-h-[60px] w-full items-center gap-3.5 rounded-2xl border px-4 py-3.5 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] sm:min-h-[64px] sm:px-5 sm:py-4',
                          isSelected
                            ? 'border-[#1f62e8] bg-blue-50/90 ring-1 ring-[#1f62e8]/35 shadow-sm dark:border-blue-400 dark:bg-blue-500/20 dark:ring-blue-400/35'
                            : 'border-slate-200/90 bg-slate-50/55 hover:border-[#1f62e8]/55 hover:bg-blue-50/45 dark:border-blue-400/15 dark:bg-[#0f1f3f]/65 dark:hover:border-blue-400/45 dark:hover:bg-blue-500/10',
                          justPicked && 'trivia-anim-select',
                        )}
                      >
                        <span
                          className={cn(
                            'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border text-xs font-extrabold transition-colors',
                            isSelected
                              ? 'border-[#174ec4] bg-[#174ec4] text-white shadow-xs dark:border-blue-400 dark:bg-blue-500'
                              : 'border-slate-200/95 bg-white text-slate-700 group-hover:border-[#1f62e8]/50 group-hover:text-[#174ec4] dark:border-slate-700 dark:bg-[#0b1730] dark:text-slate-200 dark:group-hover:border-blue-400/50',
                          )}
                        >
                          {OPTION_LETTERS[idx]}
                        </span>
                        <span className="flex-1 text-[15px] font-medium leading-snug text-foreground sm:text-base">
                          {opt}
                        </span>
                        {isSelected && (
                          <CheckCircle2 className="h-5 w-5 shrink-0 text-[#174ec4] dark:text-blue-400" />
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Last question: answer status review */}
                {isLastQuestion && (
                  <div className="space-y-3 rounded-2xl border border-slate-200/85 bg-slate-50/80 p-4 dark:border-blue-400/15 dark:bg-[#0f1f3f]/70">
                    <p className="text-sm font-extrabold text-foreground">Cevap Özeti</p>
                    <div className="grid grid-cols-3 gap-2.5 text-center text-xs">
                      <div className="rounded-xl border border-[#1f62e8]/25 bg-blue-50/80 py-2.5 dark:border-blue-400/25 dark:bg-blue-500/15">
                        <p className="text-lg font-extrabold tabular-nums text-[#174ec4] dark:text-blue-300">
                          {answeredCount}
                        </p>
                        <p className="text-muted-foreground">Cevaplanan</p>
                      </div>
                      <div className="rounded-xl border border-slate-200/85 bg-white py-2.5 dark:border-slate-700/80 dark:bg-[#0b1730]">
                        <p className="text-lg font-extrabold tabular-nums text-foreground">{blankIndexes.length}</p>
                        <p className="text-muted-foreground">Boş</p>
                      </div>
                      <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.08] py-2.5">
                        <p className="text-lg font-extrabold tabular-nums text-amber-700 dark:text-amber-300">
                          {flaggedIndexes.length}
                        </p>
                        <p className="text-muted-foreground">İşaretli</p>
                      </div>
                    </div>
                    {blankIndexes.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 text-xs">
                        <span className="font-semibold text-muted-foreground">Boş sorular:</span>
                        {blankIndexes.map((i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => goToQuestion(i)}
                            className="h-7 min-w-7 rounded-lg border border-dashed border-slate-300 bg-white px-2 font-bold tabular-nums text-foreground hover:border-[#1f62e8] dark:border-slate-600 dark:bg-[#0b1730]"
                          >
                            {i + 1}
                          </button>
                        ))}
                      </div>
                    )}
                    {flaggedIndexes.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 text-xs">
                        <span className="font-semibold text-muted-foreground">İşaretli sorular:</span>
                        {flaggedIndexes.map((i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => goToQuestion(i)}
                            className="h-7 min-w-7 rounded-lg border border-amber-500 bg-amber-500/15 px-2 font-bold tabular-nums text-amber-800 dark:text-amber-300"
                          >
                            {i + 1}
                          </button>
                        ))}
                      </div>
                    )}
                    {blankIndexes.length === 0 && flaggedIndexes.length === 0 && (
                      <p className="text-xs text-muted-foreground">
                        Tüm soruları cevapladın. İstersen önceki sorulara dönüp kontrol edebilirsin.
                      </p>
                    )}
                  </div>
                )}

                {/* Prev / Next / Finish Action Bar */}
                <div className="flex items-center justify-between gap-3 border-t border-slate-200/80 pt-5 dark:border-blue-400/15">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={currentIdx === 0 || finishing}
                    onClick={() => goToQuestion(currentIdx - 1)}
                    className="h-12 gap-2 rounded-xl border-slate-200/90 px-4 font-bold dark:border-blue-400/20 sm:px-5"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    <span>Önceki Soru</span>
                  </Button>

                  {isLastQuestion ? (
                    <Button
                      type="button"
                      disabled={finishing}
                      onClick={() => setConfirmFinishOpen(true)}
                      className="h-12 gap-2 rounded-xl bg-gradient-to-r from-[#0a2970] via-[#174ec4] to-[#2563eb] px-5 font-extrabold text-white shadow-md hover:brightness-105 sm:px-6"
                    >
                      {finishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trophy className="h-4 w-4" />}
                      Yarışmayı Bitir
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      disabled={finishing}
                      onClick={() => goToQuestion(currentIdx + 1)}
                      className="h-12 gap-2 rounded-xl bg-gradient-to-r from-[#0d3385] via-[#174ec4] to-[#2563eb] px-5 font-bold text-white shadow-sm hover:brightness-105 sm:px-6"
                    >
                      <span>Sonraki Soru</span>
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Finish confirmation (always requires explicit approval) */}
            <AlertDialog open={confirmFinishOpen} onOpenChange={setConfirmFinishOpen}>
              <AlertDialogContent className="rounded-3xl border-slate-200/90 dark:border-blue-400/20">
                <AlertDialogHeader>
                  <AlertDialogTitle>Yarışmayı bitirmek istiyor musun?</AlertDialogTitle>
                  <AlertDialogDescription asChild>
                    <div className="space-y-2 text-sm text-muted-foreground">
                      {blankIndexes.length > 0 ? (
                        <p>
                          <strong className="text-rose-500">{blankIndexes.length} soru</strong> cevapsız
                          ({blankIndexes.map((i) => i + 1).join(', ')}). Bitirirsen bu sorular boş sayılır.
                        </p>
                      ) : (
                        <p>Tüm soruları cevapladın.</p>
                      )}
                      {flaggedIndexes.length > 0 && (
                        <p>
                          İşaretlediğin {flaggedIndexes.length} soru var ({flaggedIndexes.map((i) => i + 1).join(', ')}).
                        </p>
                      )}
                      <p>Bitirdikten sonra cevaplar değiştirilemez.</p>
                    </div>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="rounded-xl">Sorulara Dön</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => void finishQuiz(false)}
                    className="rounded-xl bg-gradient-to-r from-[#0d3385] to-[#1f62e8] text-white"
                  >
                    Evet, Bitir
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            {/* Auto-finish / finishing overlay */}
            {finishing && (
              <div className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-3 bg-background/80 backdrop-blur-sm">
                <div className="flex flex-col items-center gap-3 rounded-3xl border border-slate-200/80 bg-white px-8 py-6 shadow-xl dark:border-blue-400/20 dark:bg-[#0b1730]">
                  <Loader2 className="h-8 w-8 animate-spin text-[#174ec4] dark:text-blue-400" />
                  <p className="text-sm font-semibold text-foreground">
                    {timeIsUp ? 'Süre doldu, sonuçlar hesaplanıyor...' : 'Sonuçlar hesaplanıyor...'}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ==================== 2B. 5-SECOND AWAY COUNTDOWN OVERLAY ==================== */}
        {!errorMsg && isActiveQuiz && awayActive && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#040d22]/75 p-4 backdrop-blur-md">
            <div className="w-full max-w-md overflow-hidden rounded-[26px] border border-slate-200/90 bg-white text-center shadow-2xl dark:border-blue-400/20 dark:bg-[#0b1730]">
              <div className="relative overflow-hidden bg-gradient-to-br from-[#061a44] via-[#0e3282] to-[#174ec4] px-6 py-6 text-white">
                <TriviaHeroBannerPattern />
                <div className="relative z-10 flex flex-col items-center">
                  <div className="mb-3 flex h-12 w-12 animate-pulse items-center justify-center rounded-2xl border border-rose-300/40 bg-rose-500/20 text-rose-100">
                    <ShieldAlert className="h-6 w-6" />
                  </div>
                  <h2 className="text-lg font-extrabold tracking-tight">
                    Yarışma Ekranından Ayrıldınız
                  </h2>
                </div>
              </div>
              <div className="space-y-4 p-6">
                <p className="text-xs leading-relaxed text-muted-foreground sm:text-sm">
                  5 saniye içerisinde yarışma ekranına geri dönmezseniz katılımınız iptal
                  edilecek ve bu yarışma için XP veya ödül kazanılamayacaktır.
                </p>
                <div className="font-mono text-4xl font-black tabular-nums text-rose-600 dark:text-rose-400">
                  {(awayRemainingMs / 1000).toFixed(1)} sn
                </div>
                <Button
                  type="button"
                  onClick={() => {
                    window.focus();
                    void handleReturn('button_click');
                  }}
                  className="h-12 w-full rounded-2xl bg-gradient-to-r from-[#0a2970] via-[#174ec4] to-[#2563eb] font-extrabold text-white hover:brightness-105"
                >
                  Yarışmaya Geri Dön
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ==================== 2C. GRACE PERIOD VERIFICATION FALLBACK ==================== */}
        {!errorMsg && attempt?.status === 'grace_period' && !awayActive && (
          <Card className="rounded-[26px] border-slate-200/90 bg-white/95 p-8 text-center shadow-xl dark:border-blue-400/20 dark:bg-[#0b1730]/95">
            <CardContent className="flex flex-col items-center gap-3 p-0">
              <Loader2 className="h-7 w-7 animate-spin text-[#174ec4] dark:text-blue-400" />
              <p className="text-sm font-semibold text-foreground">
                Yarışma oturumunuz doğrulanıyor...
              </p>
            </CardContent>
          </Card>
        )}

        {/* ==================== 3. CANCELLED / EXPIRED SCREEN ==================== */}
        {!errorMsg && (attempt?.status === 'cancelled' || attempt?.status === 'expired') && (
          <Card
            data-testid="trivia-cancelled"
            className="trivia-anim-enter overflow-hidden rounded-[28px] border border-slate-200/90 bg-white/95 shadow-[0_24px_65px_-22px_rgba(11,42,110,0.22)] backdrop-blur-xl dark:border-blue-400/20 dark:bg-[#0b1730]/95 dark:shadow-[0_24px_65px_-22px_rgba(0,0,0,0.65)]"
          >
            <div className="relative overflow-hidden bg-gradient-to-br from-[#061a44] via-[#0d2d73] to-[#174ec4] px-6 py-8 text-center text-white sm:px-9 sm:py-10">
              <TriviaHeroBannerPattern />
              <div className="relative z-10 flex flex-col items-center space-y-3.5">
                <EconLogo
                  allWhite
                  className="h-[25px] w-[112px] justify-center drop-shadow-[0_1px_2px_rgba(0,0,0,0.2)] sm:h-[27px] sm:w-[121px]"
                />
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-rose-300/40 bg-rose-500/20 text-rose-100 shadow-inner backdrop-blur-md">
                  {attempt.status === 'expired' ? (
                    <Timer className="h-7 w-7" />
                  ) : (
                    <ShieldAlert className="h-7 w-7" />
                  )}
                </div>
                <div className="space-y-2">
                  <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
                    {attempt.status === 'expired' ? 'Yarışma Süresi Doldu' : 'Yarışma İptal Edildi'}
                  </h1>
                  <p className="mx-auto max-w-md text-sm leading-relaxed text-blue-100/95">
                    {attempt.status === 'expired'
                      ? '15 dakikalık yarışma süresi dolduğu için oturum sonlandı.'
                      : 'Yarışma sırasında belirtilen süre içerisinde geri dönmediğiniz için katılımınız iptal edildi.'}
                  </p>
                </div>
              </div>
            </div>

            <CardContent className="space-y-4 p-5 sm:space-y-5 sm:p-8">
              <div className="flex flex-col items-center justify-between gap-3 rounded-2xl border border-rose-500/25 bg-rose-50/85 px-5 py-4 text-center dark:border-rose-400/25 dark:bg-rose-500/10 sm:flex-row sm:text-left">
                <div className="space-y-0.5">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">
                    Katılım &amp; Ödül Durumu
                  </p>
                  <p className="text-sm font-semibold text-foreground">
                    Bu yarışma için XP ve ödül kazanılmadı.
                  </p>
                </div>
                <span className="inline-flex shrink-0 items-center rounded-xl border border-rose-500/30 bg-white px-4 py-1.5 text-lg font-black tabular-nums text-rose-600 shadow-2xs dark:bg-[#0b1730] dark:text-rose-400">
                  0 XP
                </span>
              </div>

              <div className="flex items-center justify-center gap-2.5 rounded-2xl border border-[#1f62e8]/20 bg-blue-50/70 px-4 py-3.5 text-xs font-semibold text-foreground dark:border-blue-400/20 dark:bg-blue-500/10 sm:text-sm">
                <Clock className="h-4 w-4 shrink-0 text-[#174ec4] dark:text-blue-400" />
                <span className="tabular-nums">{renewalInfo.label}</span>
              </div>

              <div className="flex flex-col gap-2.5 pt-1 sm:flex-row sm:justify-center">
                <Button
                  type="button"
                  onClick={() => navigate('/')}
                  className="h-12 w-full gap-2 rounded-2xl bg-gradient-to-r from-[#0a2970] via-[#174ec4] to-[#2563eb] px-6 font-extrabold text-white shadow-md hover:brightness-105 sm:w-auto sm:min-w-[210px]"
                >
                  <Home className="h-4 w-4" />
                  Ana Sayfaya Dön
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate('/notes')}
                  className="h-12 w-full gap-2 rounded-2xl border-slate-200/90 px-5 font-semibold dark:border-blue-400/20 sm:w-auto"
                >
                  <BookOpen className="h-4 w-4 text-[#174ec4] dark:text-blue-400" />
                  Ders Notlarına Git
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ==================== 4. COMPLETION / RESULT SCREEN ==================== */}
        {!errorMsg && attempt?.status === 'completed' && (
          <Card
            data-testid="trivia-results"
            className={cn(
              'trivia-anim-enter overflow-hidden rounded-[28px] bg-white/95 shadow-[0_24px_65px_-22px_rgba(11,42,110,0.22)] backdrop-blur-xl dark:bg-[#0b1730]/95 dark:shadow-[0_24px_65px_-22px_rgba(0,0,0,0.65)]',
              attempt.grandPrizeAwarded
                ? 'border-2 border-amber-400/65 dark:border-amber-400/50'
                : 'border border-slate-200/90 dark:border-blue-400/20',
            )}
          >
            <div
              className={cn(
                'relative overflow-hidden px-6 py-8 text-center text-white sm:px-10 sm:py-10',
                attempt.grandPrizeAwarded
                  ? 'bg-gradient-to-br from-[#06183f] via-[#0e3282] to-[#1a4fb8]'
                  : 'bg-gradient-to-br from-[#061a44] via-[#0e3282] to-[#1f62e8]',
              )}
            >
              <TriviaHeroBannerPattern goldAccent={Boolean(attempt.grandPrizeAwarded)} />
              {attempt.grandPrizeAwarded && (
                <div
                  aria-hidden="true"
                  className="trivia-anim-shimmer pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-amber-200/20 to-transparent"
                />
              )}
              <div className="relative z-10 flex flex-col items-center space-y-3.5">
                <EconLogo
                  allWhite
                  className="h-[25px] w-[112px] justify-center drop-shadow-[0_1px_2px_rgba(0,0,0,0.2)] sm:h-[27px] sm:w-[121px]"
                />
                <div
                  className={cn(
                    'flex h-14 w-14 items-center justify-center rounded-2xl border shadow-inner backdrop-blur-md',
                    attempt.grandPrizeAwarded
                      ? 'trivia-anim-correct border-amber-300/60 bg-amber-400/20 text-amber-200'
                      : 'border-white/25 bg-white/15 text-sky-100',
                  )}
                >
                  {attempt.grandPrizeAwarded ? (
                    <Crown className="h-7 w-7" strokeWidth={1.9} />
                  ) : (
                    <Award className="h-7 w-7" strokeWidth={1.9} />
                  )}
                </div>

                {attempt.grandPrizeAwarded && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300/50 bg-amber-400/15 px-3.5 py-1 text-xs font-extrabold tracking-wide text-amber-200">
                    <Sparkles className="h-3.5 w-3.5" />
                    15/15 Kusursuz Başarı
                  </span>
                )}

                <div className="space-y-1.5">
                  <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
                    Yarışma Tamamlandı
                  </h1>
                  <p className="mx-auto max-w-md text-xs leading-relaxed text-blue-100/95 sm:text-sm">
                    {attempt.grandPrizeAwarded
                      ? '15 sorunun tamamını doğru yanıtladın. 375 XP ve 2 saatlik sınırsız not erişimi hesabına tanımlandı.'
                      : attempt.timedOut
                      ? 'Yarışma süresi dolduğunda kaydedilmiş cevapların değerlendirildi.'
                      : 'Bugünkü 15 soruluk genel kültür yarışmasını başarıyla tamamladın.'}
                  </p>
                </div>
              </div>
            </div>

            <CardContent className="space-y-5 p-5 sm:space-y-6 sm:p-8">
              {/* Special 15/15 Grand Prize Achievement Panel */}
              {attempt.grandPrizeAwarded && (
                <div
                  data-testid="trivia-grand-prize-panel"
                  className="flex flex-col items-center justify-between gap-3 rounded-2xl border border-amber-400/50 bg-gradient-to-r from-amber-50/95 via-white to-blue-50/90 px-5 py-4 text-center dark:border-amber-400/40 dark:from-amber-500/15 dark:via-[#0d1c3a] dark:to-blue-500/15 sm:flex-row sm:text-left"
                >
                  <div className="flex items-center gap-3.5">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-amber-400/50 bg-amber-400/15 text-amber-700 dark:text-amber-300">
                      <Crown className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-xs font-extrabold uppercase tracking-wider text-amber-700 dark:text-amber-300">
                        Büyük Ödül Kazanıldı · 15/15
                      </p>
                      <p className="text-sm font-bold text-foreground">
                        375 XP + 2 Saatlik Sınırsız Not Erişimi Aktif
                      </p>
                    </div>
                  </div>
                  {activeUnlimitedPass && (
                    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-amber-400/45 bg-amber-500/15 px-3 py-1.5 font-mono text-xs font-extrabold tabular-nums text-amber-800 dark:text-amber-200">
                      <Clock className="h-3.5 w-3.5" />
                      {activeUnlimitedPass.remaining}
                    </span>
                  )}
                </div>
              )}

              {/* 4 Balanced KPI Stat Cards: Doğru / Yanlış / Boş / Kazanılan XP */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-2xl border border-emerald-500/30 bg-emerald-50/75 px-3.5 py-4 text-center dark:border-emerald-400/25 dark:bg-emerald-500/10">
                  <div className="mx-auto mb-1.5 flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="h-4 w-4" />
                  </div>
                  <p className="text-2xl font-black tabular-nums text-emerald-700 dark:text-emerald-300">
                    {resultCorrect}
                  </p>
                  <p className="mt-0.5 text-xs font-semibold text-muted-foreground">Doğru</p>
                </div>

                <div className="rounded-2xl border border-rose-500/25 bg-rose-50/70 px-3.5 py-4 text-center dark:border-rose-400/25 dark:bg-rose-500/10">
                  <div className="mx-auto mb-1.5 flex h-8 w-8 items-center justify-center rounded-xl bg-rose-500/15 text-rose-600 dark:text-rose-400">
                    <XCircle className="h-4 w-4" />
                  </div>
                  <p className="text-2xl font-black tabular-nums text-rose-600 dark:text-rose-400">
                    {resultWrong}
                  </p>
                  <p className="mt-0.5 text-xs font-semibold text-muted-foreground">Yanlış</p>
                </div>

                <div className="rounded-2xl border border-slate-200/90 bg-slate-50/85 px-3.5 py-4 text-center dark:border-slate-700/80 dark:bg-[#0f1f3f]/75">
                  <div className="mx-auto mb-1.5 flex h-8 w-8 items-center justify-center rounded-xl bg-slate-200/70 text-slate-600 dark:bg-slate-700/70 dark:text-slate-300">
                    <MinusCircle className="h-4 w-4" />
                  </div>
                  <p className="text-2xl font-black tabular-nums text-foreground">
                    {resultBlank}
                  </p>
                  <p className="mt-0.5 text-xs font-semibold text-muted-foreground">Boş</p>
                </div>

                <div
                  className={cn(
                    'rounded-2xl border px-3.5 py-4 text-center',
                    attempt.grandPrizeAwarded
                      ? 'border-amber-400/45 bg-amber-50/80 dark:border-amber-400/35 dark:bg-amber-500/15'
                      : 'border-[#1f62e8]/30 bg-blue-50/80 dark:border-blue-400/30 dark:bg-blue-500/15',
                  )}
                >
                  <div
                    className={cn(
                      'mx-auto mb-1.5 flex h-8 w-8 items-center justify-center rounded-xl',
                      attempt.grandPrizeAwarded
                        ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                        : 'bg-[#174ec4]/15 text-[#174ec4] dark:text-blue-300',
                    )}
                  >
                    <Sparkles className="h-4 w-4" />
                  </div>
                  <p
                    className={cn(
                      'text-2xl font-black tabular-nums',
                      attempt.grandPrizeAwarded
                        ? 'text-amber-700 dark:text-amber-300'
                        : 'text-[#174ec4] dark:text-blue-300',
                    )}
                  >
                    +{attempt.xpEarned} XP
                  </p>
                  <p className="mt-0.5 text-[11px] font-semibold tabular-nums text-muted-foreground">
                    {resultCorrect} × {TRIVIA_XP_PER_CORRECT} XP
                  </p>
                </div>
              </div>

              {/* 1-15 Question-by-Question Answer Summary */}
              <div className="space-y-3 rounded-2xl border border-slate-200/85 bg-slate-50/75 p-4 dark:border-blue-400/15 dark:bg-[#0f1f3f]/65 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-extrabold text-foreground sm:text-sm">
                    1–15 Soru Sonuç Özeti
                  </p>
                  <div className="flex flex-wrap items-center gap-3 text-[11px] font-medium text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" /> Doğru
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-sm bg-rose-500" /> Yanlış
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-sm border border-dashed border-muted-foreground" /> Boş
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-5 gap-2 sm:grid-cols-[repeat(15,minmax(0,1fr))] sm:gap-1.5">
                  {Array.from({ length: TRIVIA_TOTAL_QUESTIONS }).map((_, idx) => {
                    const rec = answers.find((a) => a.questionIndex === idx);
                    const state = !rec ? 'blank' : rec.isCorrect ? 'correct' : 'wrong';
                    const stateLabel =
                      state === 'correct' ? 'Doğru (+25 XP)' : state === 'wrong' ? 'Yanlış' : 'Boş';
                    const isInspected = inspectedAnswerIdx === idx;
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          unlockTriviaAudio();
                          setInspectedAnswerIdx(idx);
                          if (state === 'correct') playTriviaSound('correct', audioPrefsRef.current);
                          else if (state === 'wrong') playTriviaSound('wrong', audioPrefsRef.current);
                          else playTriviaSound('select', audioPrefsRef.current);
                        }}
                        aria-label={`Soru ${idx + 1}: ${stateLabel}`}
                        title={`Soru ${idx + 1}: ${stateLabel}`}
                        className={cn(
                          'flex h-10 items-center justify-center rounded-xl border text-xs font-extrabold tabular-nums transition-all sm:h-9',
                          state === 'correct' &&
                            'border-emerald-500/45 bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/25 dark:text-emerald-300',
                          state === 'wrong' &&
                            'border-rose-500/45 bg-rose-500/15 text-rose-700 hover:bg-rose-500/25 dark:text-rose-300',
                          state === 'blank' &&
                            'border-dashed border-slate-300 bg-white text-muted-foreground hover:border-[#1f62e8]/50 dark:border-slate-600 dark:bg-[#0b1730]',
                          isInspected && state === 'correct' && 'trivia-anim-correct ring-2 ring-emerald-500/60',
                          isInspected && state === 'wrong' && 'trivia-anim-wrong ring-2 ring-rose-500/60',
                          isInspected && state === 'blank' && 'ring-2 ring-[#1f62e8]/45',
                        )}
                      >
                        {idx + 1}
                      </button>
                    );
                  })}
                </div>

                {inspectedAnswerIdx !== null && (() => {
                  const rec = answers.find((a) => a.questionIndex === inspectedAnswerIdx);
                  const state = !rec ? 'blank' : rec.isCorrect ? 'correct' : 'wrong';
                  return (
                    <div
                      key={inspectedAnswerIdx}
                      className={cn(
                        'trivia-anim-enter flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3.5 py-2.5 text-xs',
                        state === 'correct' &&
                          'border-emerald-500/35 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300',
                        state === 'wrong' &&
                          'border-rose-500/35 bg-rose-500/10 text-rose-700 dark:text-rose-300',
                        state === 'blank' &&
                          'border-slate-200/90 bg-white text-muted-foreground dark:border-slate-700 dark:bg-[#0b1730]',
                      )}
                    >
                      <span className="font-bold">
                        Soru {inspectedAnswerIdx + 1}:{' '}
                        {state === 'correct'
                          ? 'Doğru cevap (+25 XP)'
                          : state === 'wrong'
                          ? 'Yanlış cevap'
                          : 'Boş bırakıldı'}
                      </span>
                      {rec?.explanation && (
                        <span className="text-[11px] opacity-90">{rec.explanation}</span>
                      )}
                    </div>
                  );
                })()}
              </div>

              {/* Next Daily Quiz Renewal Countdown */}
              <div className="flex items-center justify-center gap-2.5 rounded-2xl border border-[#1f62e8]/20 bg-blue-50/70 px-4 py-3.5 text-xs font-semibold text-foreground dark:border-blue-400/20 dark:bg-blue-500/10 sm:text-sm">
                <Clock className="h-4 w-4 shrink-0 text-[#174ec4] dark:text-blue-400" />
                <span className="tabular-nums">{renewalInfo.label}</span>
              </div>

              {/* Standardized 3-Button Action Row */}
              <div className="grid grid-cols-1 gap-2.5 pt-1 sm:grid-cols-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate('/points')}
                  className="h-12 w-full gap-2 rounded-2xl border-slate-200/90 font-semibold hover:border-[#1f62e8]/50 hover:text-[#174ec4] dark:border-blue-400/20 dark:hover:border-blue-400/45 dark:hover:text-blue-300"
                >
                  <Sparkles className="h-4 w-4 text-[#174ec4] dark:text-blue-400" />
                  Puan Geçmişi
                </Button>
                <Button
                  type="button"
                  onClick={() => navigate('/notes')}
                  className="h-12 w-full gap-2 rounded-2xl bg-gradient-to-r from-[#0a2970] via-[#174ec4] to-[#2563eb] font-extrabold text-white shadow-md hover:brightness-105"
                >
                  <BookOpen className="h-4 w-4" />
                  Ders Notlarına Git
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate('/')}
                  className="h-12 w-full gap-2 rounded-2xl border-slate-200/90 font-semibold hover:border-[#1f62e8]/50 hover:text-[#174ec4] dark:border-blue-400/20 dark:hover:border-blue-400/45 dark:hover:text-blue-300"
                >
                  <Home className="h-4 w-4" />
                  Ana Sayfaya Dön
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
