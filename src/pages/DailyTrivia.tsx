import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Clock,
  Crown,
  Flag,
  Flame,
  Home,
  Loader2,
  LogIn,
  MinusCircle,
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
  const leaveStartedAtRef = useRef<number | null>(null);
  const awayIntervalRef = useRef<number | null>(null);
  const cancellingRef = useRef(false);
  const initialReloadCheckedRef = useRef(false);
  const finishingRef = useRef(false);
  const warnedRef = useRef(false);
  // Cevap kayıtları sırayla (kuyruk) gönderilir; başarısız olanlar bitişten önce tekrar denenir
  const saveChainRef = useRef<Promise<void>>(Promise.resolve());
  const pendingSavesRef = useRef(0);
  const unsavedRef = useRef<Map<number, number>>(new Map());

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

  // 1-second UI clock: quiz countdown, unlimited pass countdown and midnight refresh countdown
  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const syncClock = useCallback((serverNowIso?: string | null) => {
    const serverMs = serverNowIso ? Date.parse(serverNowIso) : NaN;
    if (Number.isFinite(serverMs)) setClockOffsetMs(serverMs - Date.now());
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
      setIsSpeaking(false);
      playTriviaSound('wrong', audioPrefsRef.current);
      if (userId) clearActiveTriviaRunInSession(userId);
      setAttempt((prev) =>
        prev
          ? {
              ...prev,
              status: 'cancelled',
              xpEarned: 0,
              grandPrizeAwarded: false,
              unlimitedExpiresAt: null,
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
    [userId],
  );

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

      markCancelledLocally(data?.cancelReason || reason, data?.cancelMessage || null, data?.newUserPointsTotal);
      toast.error('Yarışma güvenlik kuralı gereği iptal edildi. Bu yarışmaya ait ödüller verilmedi.');
      cancellingRef.current = false;
    },
    [clearAwayTimers, markCancelledLocally, userId],
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
    } else {
      clearActiveTriviaRunInSession(userId);
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
  }, [syncClock, userId]);

  useEffect(() => {
    if (!authLoading) {
      void fetchStatus();
    }
  }, [authLoading, fetchStatus]);

  // Real-time 5-second leave detection (tab switch, window blur, page refresh/close).
  // Soru navigasyonu (Önceki/Sonraki/numara) sayfa içi durum değişimidir ve ekran terk sayılmaz.
  useEffect(() => {
    if (!isInProgress || !userId) {
      clearAwayTimers();
      return;
    }

    const startAwayClock = (reason: string) => {
      if (!isInProgressRef.current || cancellingRef.current || finishingRef.current) return;
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
        markCancelledLocally(
          data.cancelReason || 'away_over_5s',
          data.cancelMessage || '5 saniyelik geri dönüş süresi aşıldığı için yarışma iptal edildi.',
          data.newUserPointsTotal,
        );
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
      if (isInProgressRef.current && !finishingRef.current) {
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
  }, [isInProgress, userId, clearAwayTimers, triggerCancel, markCancelledLocally]);

  const handleStart = async () => {
    if (!user || starting) return;
    unlockTriviaAudio();
    setStarting(true);
    setErrorMsg(null);
    const { data, error } = await invokeDailyTrivia<TriviaStartResponse>({ action: 'start' });
    setStarting(false);

    if (error || !data) {
      toast.error(error || 'Yarışma başlatılamadı.');
      void fetchStatus();
      return;
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
    playTriviaSound('start', audioPrefsRef.current);
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
      <div className="safe-area-screen flex flex-col items-center justify-center bg-background p-6 text-muted-foreground">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
        <p className="mt-3 text-sm font-medium">Yarışma hazırlanıyor...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="safe-area-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md rounded-3xl border-border/70 p-6 text-center shadow-xl">
          <CardContent className="space-y-4 p-2">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Trophy className="h-7 w-7" />
            </div>
            <h1 className="text-xl font-extrabold text-foreground">
              Günlük Genel Kültür Bilgi Yarışması
            </h1>
            <p className="text-sm text-muted-foreground">
              Her gün yenilenen 15 genel kültür sorusuyla bilgini test etmek için giriş yap.
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
  const isLastQuestion = currentIdx === TRIVIA_TOTAL_QUESTIONS - 1;
  const progressPct = Math.round((answeredCount / TRIVIA_TOTAL_QUESTIONS) * 100);

  const resultCorrect = attempt?.correctCount ?? 0;
  const resultBlank =
    attempt?.blankCount ?? Math.max(0, TRIVIA_TOTAL_QUESTIONS - answers.length);
  const resultWrong =
    attempt?.wrongCount ?? Math.max(0, answers.length - resultCorrect);

  return (
    <div
      className={cn(
        'relative min-h-[100dvh] overflow-x-clip bg-background text-foreground selection:bg-primary/20',
        audioPrefs.reducedMotion && 'trivia-reduced-motion',
      )}
      style={{
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 1.5rem)',
      }}
    >
      {/* Subtle Premium Cobalt & Gold Quiz-Show Ambiance */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -top-36 left-1/3 h-[420px] w-[720px] -translate-x-1/2 rounded-full bg-gradient-to-br from-[#003791]/20 via-blue-500/10 to-transparent blur-[110px]" />
        <div className="absolute bottom-0 right-0 h-[360px] w-[500px] rounded-full bg-gradient-to-tl from-amber-500/15 via-cyan-500/10 to-transparent blur-[120px]" />
      </div>

      {/* iPhone Safe-Area Aware Standalone Header (Dynamic Island + Landscape + Narrow-Screen Proof) */}
      <header
        className="sticky top-0 z-30 border-b border-border/70 bg-background/95 backdrop-blur-2xl"
        style={{
          paddingTop: 'env(safe-area-inset-top, 0px)',
          paddingLeft: 'env(safe-area-inset-left, 0px)',
          paddingRight: 'env(safe-area-inset-right, 0px)',
        }}
      >
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-x-3 gap-y-2 px-3.5 py-2.5 sm:h-16 sm:flex-nowrap sm:px-4 sm:py-0">
          <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
            <EconLogo className="h-[22px] w-[99px] shrink-0 justify-center -translate-y-[2px] sm:h-[26px] sm:w-[117px] sm:-translate-y-[3px]" />
            <span aria-hidden="true" className="h-4 w-px shrink-0 bg-border sm:h-5" />
            <span className="whitespace-nowrap text-xs font-bold leading-none tracking-tight text-foreground sm:text-sm sm:leading-none">
              Günlük Bilgi Yarışması
            </span>
          </div>

          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <TriviaAudioControls prefs={audioPrefs} onChange={handleAudioPrefsChange} compact />
            {isInProgress ? (
              <div
                role="timer"
                aria-live="off"
                className={cn(
                  'inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border px-3 font-mono text-sm font-black tabular-nums transition-colors sm:h-10 sm:rounded-2xl sm:px-3.5 sm:text-lg',
                  warnTime
                    ? 'animate-pulse border-rose-500/60 bg-rose-500/15 text-rose-600 dark:text-rose-400'
                    : 'border-primary/35 bg-primary/10 text-primary',
                )}
              >
                <Timer className="h-4 w-4 shrink-0 sm:h-5 sm:w-5" />
                <span>{formatTriviaClock(remainingMs)}</span>
              </div>
            ) : (
              <>
                <span className="inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border border-primary/25 bg-primary/10 px-2.5 text-xs font-bold text-primary tabular-nums">
                  <Sparkles className="h-3.5 w-3.5 shrink-0" />
                  <span>{userPoints.toLocaleString('tr-TR')} XP</span>
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => navigate('/')}
                  className="h-8 shrink-0 gap-1.5 whitespace-nowrap rounded-xl px-2.5 text-xs"
                >
                  <ArrowLeft className="h-3.5 w-3.5 shrink-0" />
                  <span>Ana Sayfa</span>
                </Button>
              </>
            )}
          </div>
        </div>
        {warnTime && (
          <div className="border-t border-rose-500/30 bg-rose-500/10 px-4 py-1.5 text-center text-xs font-bold text-rose-600 dark:text-rose-400">
            Son 2 dakika! Süre dolduğunda yarışma otomatik olarak sonuçlanır.
          </div>
        )}
      </header>

      {/* Main Standalone Arena */}
      <main
        className="relative z-10 mx-auto max-w-3xl space-y-5 px-4 py-5 sm:py-8"
        style={{
          paddingLeft: 'max(1rem, env(safe-area-inset-left, 0px))',
          paddingRight: 'max(1rem, env(safe-area-inset-right, 0px))',
        }}
      >
        {/* Live 2-Hour Grand Prize Active Banner */}
        {activeUnlimitedPass && !isInProgress && (
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
                  </strong>
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
          <Card className="trivia-anim-enter overflow-hidden rounded-3xl border-border/80 bg-card/95 shadow-xl">
            <div className="relative overflow-hidden bg-gradient-to-br from-[#001a4d] via-[#003791] to-[#0066cc] px-6 py-8 text-center text-white sm:px-10 sm:py-11">
              <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-amber-300/75 to-transparent" />
              <div className="pointer-events-none absolute -right-14 -top-14 h-48 w-48 rounded-full bg-cyan-400/25 blur-3xl" />
              <div className="pointer-events-none absolute -bottom-16 -left-10 h-44 w-44 rounded-full bg-amber-400/20 blur-3xl" />
              <div className="relative z-10 flex flex-col items-center space-y-3.5">
                <EconLogo
                  allWhite
                  className="h-[26px] w-[117px] justify-center drop-shadow-[0_1px_2px_rgba(0,0,0,0.22)] sm:h-[27px] sm:w-[121px]"
                />
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-amber-300/35 bg-gradient-to-br from-amber-400/25 via-white/15 to-white/5 shadow-inner backdrop-blur-md">
                  <Trophy className="h-7 w-7 text-amber-300" />
                </div>
                <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
                  Günlük Genel Kültür Bilgi Yarışması
                </h1>
                <p className="mx-auto max-w-md text-sm leading-relaxed text-blue-100/95 sm:text-base">
                  Her gün sana özel 15 genel kültür sorusuyla bilgini test et!
                </p>
              </div>
            </div>

            <CardContent className="space-y-5 p-5 sm:p-7">
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3 sm:gap-3">
                <div className="flex items-center justify-center gap-2 rounded-2xl border border-border/70 bg-muted/25 px-3 py-3.5 text-center sm:flex-col sm:gap-1 sm:py-4">
                  <span className="text-xl font-extrabold tabular-nums text-foreground sm:text-2xl">15 Soru</span>
                </div>
                <div className="flex items-center justify-center gap-2 rounded-2xl border border-border/70 bg-muted/25 px-3 py-3.5 text-center sm:flex-col sm:gap-1 sm:py-4">
                  <span className="text-xl font-extrabold tabular-nums text-foreground sm:text-2xl">15 Dakika</span>
                </div>
                <div className="flex items-center justify-center gap-2 rounded-2xl border border-primary/25 bg-primary/[0.06] px-3 py-3.5 text-center sm:flex-col sm:gap-1 sm:py-4">
                  <span className="text-sm font-extrabold text-primary sm:text-base">Her doğru cevap 25 XP</span>
                </div>
              </div>

              <Button
                type="button"
                size="lg"
                disabled={starting}
                onClick={() => void handleStart()}
                className="h-14 w-full gap-2 rounded-2xl bg-gradient-to-r from-[#003791] via-[#0055b8] to-[#0070d1] text-base font-extrabold text-white shadow-lg shadow-primary/25 hover:opacity-95"
              >
                {starting ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Hazırlanıyor...
                  </>
                ) : (
                  <>
                    <Flame className="h-5 w-5 text-amber-300" />
                    Yarışmaya Başla
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
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

            {/* Question navigator */}
            <Card className="rounded-2xl border-border/75 bg-card/95 shadow-xs">
              <CardContent className="space-y-3 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="font-extrabold text-foreground">
                    Soru {currentIdx + 1} / {TRIVIA_TOTAL_QUESTIONS}
                  </span>
                  <div className="flex items-center gap-2">
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
                        : ''}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 font-bold tabular-nums text-primary">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {answeredCount}/{TRIVIA_TOTAL_QUESTIONS} cevaplandı
                    </span>
                  </div>
                </div>

                <Progress value={progressPct} className="h-2" />

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
                          'relative flex h-10 items-center justify-center rounded-xl border text-xs font-bold tabular-nums transition-all sm:h-9',
                          isFlagged
                            ? 'border-amber-500 bg-amber-500/20 text-amber-700 dark:text-amber-300'
                            : isAnswered
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-dashed border-border bg-background text-muted-foreground hover:border-primary/50',
                          isCur && 'ring-2 ring-primary ring-offset-2 ring-offset-background',
                        )}
                      >
                        {idx + 1}
                        {isFlagged && isAnswered && (
                          <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-primary ring-2 ring-background" />
                        )}
                      </button>
                    );
                  })}
                </div>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded bg-primary" /> Cevaplandı
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded border border-dashed border-muted-foreground" /> Boş
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded bg-amber-500" /> İşaretli
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Question Card */}
            <Card
              key={currentIdx}
              className={cn(
                'trivia-anim-enter relative overflow-hidden rounded-3xl border-border/80 bg-card/95 shadow-xl transition-all',
                warnTime && 'border-rose-500/45 ring-1 ring-rose-500/20',
                awayActive && 'pointer-events-none select-none blur-md',
              )}
            >
              <div
                aria-hidden="true"
                className={cn(
                  'pointer-events-none h-1 w-full bg-gradient-to-r',
                  warnTime
                    ? 'from-rose-500 via-amber-400 to-rose-500'
                    : 'from-[#003791] via-[#0070d1] to-amber-400/80',
                )}
              />
              <CardContent className="space-y-5 p-5 sm:p-7">
                <div className="flex flex-wrap items-center justify-between gap-2">
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
                  <div className="flex items-center gap-1.5">
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
                          'h-8 gap-1.5 rounded-xl text-xs font-semibold transition-colors',
                          isSpeaking
                            ? 'border-primary bg-primary/15 text-primary hover:bg-primary/20'
                            : !audioPrefs.masterEnabled || !audioPrefs.ttsEnabled
                            ? 'opacity-60'
                            : 'hover:border-primary/50 hover:text-primary',
                        )}
                      >
                        {isSpeaking ? (
                          <Square className="h-3 w-3 fill-current" />
                        ) : (
                          <Volume2 className="h-3.5 w-3.5 text-primary" />
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
                        'h-8 gap-1.5 rounded-xl text-xs font-semibold',
                        flagged.has(currentIdx) &&
                          'border-amber-500 bg-amber-500/15 text-amber-700 hover:bg-amber-500/20 dark:text-amber-300',
                      )}
                    >
                      <Flag className={cn('h-3.5 w-3.5', flagged.has(currentIdx) && 'fill-current')} />
                      <span>{flagged.has(currentIdx) ? 'İşaretli' : 'İşaretle'}</span>
                    </Button>
                  </div>
                </div>

                <h2 className="text-base font-bold leading-relaxed text-foreground sm:text-xl">
                  {currentQuestion.question}
                </h2>

                {/* 4 Options (A, B, C, D) */}
                <div className="space-y-2.5">
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
                          'group flex w-full items-center gap-3.5 rounded-2xl border p-3.5 text-left transition-all sm:p-4',
                          isSelected
                            ? 'border-primary bg-primary/10 ring-1 ring-primary/40 shadow-sm'
                            : 'border-border/80 bg-background/75 hover:border-primary/50 hover:bg-primary/[0.04]',
                          justPicked && 'trivia-anim-select',
                        )}
                      >
                        <span
                          className={cn(
                            'flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border text-xs font-extrabold transition-colors',
                            isSelected
                              ? 'border-primary bg-primary text-primary-foreground'
                              : 'border-border/80 bg-muted/60 text-foreground group-hover:border-primary/50',
                          )}
                        >
                          {OPTION_LETTERS[idx]}
                        </span>
                        <span className="flex-1 text-sm font-medium leading-snug text-foreground">
                          {opt}
                        </span>
                        {isSelected && <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" />}
                      </button>
                    );
                  })}
                </div>

                {/* Last question: answer status review */}
                {isLastQuestion && (
                  <div className="space-y-3 rounded-2xl border border-border/70 bg-muted/20 p-4">
                    <p className="text-sm font-extrabold text-foreground">Cevap Durumu</p>
                    <div className="grid grid-cols-3 gap-2 text-center text-xs">
                      <div className="rounded-xl border border-primary/25 bg-primary/[0.06] py-2">
                        <p className="text-lg font-extrabold tabular-nums text-primary">{answeredCount}</p>
                        <p className="text-muted-foreground">Cevaplanan</p>
                      </div>
                      <div className="rounded-xl border border-border/70 bg-background py-2">
                        <p className="text-lg font-extrabold tabular-nums text-foreground">{blankIndexes.length}</p>
                        <p className="text-muted-foreground">Boş</p>
                      </div>
                      <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.07] py-2">
                        <p className="text-lg font-extrabold tabular-nums text-amber-600 dark:text-amber-400">
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
                            className="h-7 min-w-7 rounded-lg border border-dashed border-border bg-background px-2 font-bold tabular-nums text-foreground hover:border-primary"
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
                            className="h-7 min-w-7 rounded-lg border border-amber-500 bg-amber-500/15 px-2 font-bold tabular-nums text-amber-700 dark:text-amber-300"
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

                {/* Prev / Next / Finish */}
                <div className="flex items-center justify-between gap-2 border-t border-border/60 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={currentIdx === 0 || finishing}
                    onClick={() => goToQuestion(currentIdx - 1)}
                    className="h-11 gap-2 rounded-xl font-bold"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    <span>Önceki Soru</span>
                  </Button>

                  {isLastQuestion ? (
                    <Button
                      type="button"
                      disabled={finishing}
                      onClick={() => setConfirmFinishOpen(true)}
                      className="h-11 gap-2 rounded-xl bg-gradient-to-r from-[#003791] to-[#0070d1] font-extrabold text-white hover:opacity-95"
                    >
                      {finishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trophy className="h-4 w-4" />}
                      Yarışmayı Bitir
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      disabled={finishing}
                      onClick={() => goToQuestion(currentIdx + 1)}
                      className="h-11 gap-2 rounded-xl font-bold"
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
              <AlertDialogContent className="rounded-3xl">
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
                  <AlertDialogCancel>Sorulara Dön</AlertDialogCancel>
                  <AlertDialogAction onClick={() => void finishQuiz(false)}>Evet, Bitir</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            {/* Auto-finish / finishing overlay */}
            {finishing && (
              <div className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-3 bg-background/80 backdrop-blur-sm">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm font-semibold text-foreground">
                  {timeIsUp ? 'Süre doldu, sonuçlar hesaplanıyor...' : 'Sonuçlar hesaplanıyor...'}
                </p>
              </div>
            )}

            {/* 5-Second Away Countdown Lock Overlay */}
            {awayActive && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#001d52]/75 p-4 backdrop-blur-md">
                <div className="w-full max-w-md overflow-hidden rounded-3xl border border-border/80 bg-card text-center shadow-2xl">
                  <div className="bg-gradient-to-br from-[#001d52] via-[#003791] to-[#0055b8] px-6 py-5 text-white">
                    <div className="mx-auto mb-2.5 flex h-12 w-12 animate-pulse items-center justify-center rounded-2xl border border-rose-300/35 bg-rose-500/20 text-rose-100">
                      <ShieldAlert className="h-6 w-6" />
                    </div>
                    <h2 className="text-lg font-extrabold tracking-tight">
                      Yarışma Ekranından Ayrıldınız
                    </h2>
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
                      onClick={() => window.focus()}
                      className="h-11 w-full rounded-2xl bg-gradient-to-r from-[#003791] via-[#0055b8] to-[#0070d1] font-extrabold text-white hover:opacity-95"
                    >
                      Yarışmaya Geri Dön
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ==================== 3. CANCELLED SCREEN ==================== */}
        {!errorMsg && attempt?.status === 'cancelled' && (
          <Card className="trivia-anim-enter overflow-hidden rounded-3xl border-border/80 bg-card/95 shadow-xl">
            <div className="relative overflow-hidden bg-gradient-to-br from-[#001a4d] via-[#003791] to-[#0055b8] px-5 py-7 text-center text-white sm:px-8 sm:py-8">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-rose-300/65 to-transparent"
              />
              <div className="pointer-events-none absolute -right-12 -top-12 h-44 w-44 rounded-full bg-rose-400/20 blur-3xl" />
              <div className="pointer-events-none absolute -bottom-14 -left-10 h-40 w-40 rounded-full bg-cyan-400/20 blur-3xl" />
              <div className="relative z-10 flex flex-col items-center space-y-3">
                <EconLogo
                  allWhite
                  className="h-[26px] w-[117px] justify-center drop-shadow-[0_1px_2px_rgba(0,0,0,0.22)] sm:h-[27px] sm:w-[121px]"
                />
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-rose-300/40 bg-rose-500/20 text-rose-100 shadow-inner backdrop-blur-md">
                  <ShieldAlert className="h-7 w-7" />
                </div>
                <div className="space-y-1.5">
                  <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
                    Yarışma İptal Edildi
                  </h1>
                  <p className="mx-auto max-w-md text-xs leading-relaxed text-blue-100/95 sm:text-sm">
                    {attempt.cancelMessage ||
                      'Yarışma sırasında 5 saniye içerisinde geri dönülmediği için katılımınız iptal edildi.'}
                  </p>
                </div>
              </div>
            </div>

            <CardContent className="space-y-4 p-5 sm:space-y-5 sm:p-7">
              <div className="flex flex-col items-center justify-between gap-2 rounded-2xl border border-rose-500/25 bg-rose-500/[0.06] px-5 py-4 text-center sm:flex-row sm:text-left">
                <div className="space-y-0.5">
                  <p className="text-xs font-bold uppercase tracking-wider text-rose-600/85 dark:text-rose-400">
                    Ödül Durumu
                  </p>
                  <p className="text-sm font-semibold text-foreground">
                    Bu yarışma için XP ve ödül kazanılamadı.
                  </p>
                </div>
                <span className="inline-flex shrink-0 items-center rounded-xl border border-rose-500/30 bg-rose-500/10 px-3.5 py-1.5 text-lg font-black tabular-nums text-rose-600 dark:text-rose-400">
                  0 XP
                </span>
              </div>

              <div className="flex items-center justify-center gap-2 rounded-2xl border border-primary/20 bg-primary/[0.05] px-4 py-3 text-xs font-semibold text-foreground sm:text-sm">
                <Clock className="h-4 w-4 shrink-0 text-primary" />
                <span className="tabular-nums">{renewalInfo.label}</span>
              </div>

              <div className="flex flex-col gap-2.5 pt-1 sm:flex-row sm:justify-center">
                <Button
                  type="button"
                  onClick={() => navigate('/')}
                  className="h-11 w-full gap-2 rounded-2xl bg-gradient-to-r from-[#003791] via-[#0055b8] to-[#0070d1] px-6 font-extrabold text-white shadow-md shadow-primary/20 hover:opacity-95 sm:w-auto sm:min-w-[200px]"
                >
                  <Home className="h-4 w-4" />
                  Ana Sayfaya Dön
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate('/notes')}
                  className="h-11 w-full gap-2 rounded-2xl px-5 font-semibold sm:w-auto"
                >
                  <BookOpen className="h-4 w-4 text-primary" />
                  Ders Notlarına Git
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ==================== 4. RESULT SCREEN ==================== */}
        {!errorMsg && attempt?.status === 'completed' && (
          <Card
            className={cn(
              'trivia-anim-enter overflow-hidden rounded-3xl bg-card/95 shadow-xl',
              attempt.grandPrizeAwarded
                ? 'border-2 border-amber-400/60 shadow-amber-500/10'
                : 'border-border/80',
            )}
          >
            <div
              className={cn(
                'relative overflow-hidden px-5 py-6 text-center text-white sm:px-8 sm:py-8',
                attempt.grandPrizeAwarded
                  ? 'bg-gradient-to-br from-[#001a4d] via-[#003791] to-amber-500'
                  : 'bg-gradient-to-br from-[#001a4d] via-[#003791] to-[#0066cc]',
              )}
            >
              <div
                aria-hidden="true"
                className={cn(
                  'pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent to-transparent',
                  attempt.grandPrizeAwarded ? 'via-amber-200/85' : 'via-cyan-200/60',
                )}
              />
              {attempt.grandPrizeAwarded && (
                <div
                  aria-hidden="true"
                  className="trivia-anim-shimmer pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-amber-200/20 to-transparent"
                />
              )}
              <div className="pointer-events-none absolute -right-12 -top-12 h-44 w-44 rounded-full bg-cyan-400/25 blur-3xl" />
              <div className="pointer-events-none absolute -bottom-14 -left-10 h-40 w-40 rounded-full bg-amber-400/20 blur-3xl" />
              <div className="relative z-10 flex flex-col items-center space-y-3">
                <EconLogo
                  allWhite
                  className="h-[26px] w-[117px] justify-center drop-shadow-[0_1px_2px_rgba(0,0,0,0.22)] sm:h-[27px] sm:w-[121px]"
                />
                <div
                  className={cn(
                    'flex h-14 w-14 items-center justify-center rounded-2xl border shadow-inner backdrop-blur-md',
                    attempt.grandPrizeAwarded
                      ? 'trivia-anim-correct border-amber-200/50 bg-amber-400/25 text-amber-200'
                      : 'border-white/25 bg-white/15 text-cyan-200',
                  )}
                >
                  {attempt.grandPrizeAwarded ? (
                    <Crown className="h-7 w-7" />
                  ) : (
                    <Trophy className="h-7 w-7" />
                  )}
                </div>
                <div className="space-y-1">
                  <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
                    {attempt.grandPrizeAwarded
                      ? '15/15 Mükemmel Başarı!'
                      : attempt.timedOut
                      ? 'Süre Doldu'
                      : 'Yarışma Tamamlandı'}
                  </h1>
                  <p className="mx-auto max-w-md text-xs leading-relaxed text-blue-100/95 sm:text-sm">
                    {attempt.grandPrizeAwarded
                      ? 'Tüm soruları doğru bildin! 375 XP ve 2 saatlik sınırsız not erişimi kazandın.'
                      : attempt.timedOut
                      ? 'Süre dolduğunda kaydedilmiş cevapların değerlendirildi.'
                      : 'Bugünkü 15 soruluk genel kültür yarışmasını tamamladın.'}
                  </p>
                </div>
              </div>
            </div>

            <CardContent className="space-y-4 p-5 sm:space-y-5 sm:p-7">
              {/* Prominent Earned XP Showcase */}
              <div
                className={cn(
                  'flex flex-col items-center justify-between gap-3 rounded-2xl border px-5 py-4 text-center sm:flex-row sm:px-6 sm:text-left',
                  attempt.grandPrizeAwarded
                    ? 'border-amber-500/40 bg-gradient-to-r from-amber-500/[0.12] via-[#003791]/[0.06] to-amber-500/10'
                    : 'border-primary/25 bg-gradient-to-r from-[#003791]/[0.08] via-[#0055b8]/[0.05] to-cyan-500/[0.08]',
                )}
              >
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-primary/80">
                    Kazanılan XP
                  </p>
                  <p className="mt-0.5 text-3xl font-black tracking-tight tabular-nums text-primary sm:text-4xl">
                    +{attempt.xpEarned} XP
                  </p>
                </div>

                <div className="flex flex-col items-center gap-1.5 sm:items-end">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-background/80 px-3 py-1 text-xs font-semibold tabular-nums text-foreground">
                    <Sparkles className="h-3.5 w-3.5 text-primary" />
                    {resultCorrect} doğru × {TRIVIA_XP_PER_CORRECT} XP
                  </span>
                  {attempt.grandPrizeAwarded && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/15 px-3 py-1 text-xs font-extrabold text-amber-700 dark:text-amber-300">
                      <Crown className="h-3.5 w-3.5" />
                      2 Saatlik Sınırsız Not Erişimi Aktif
                    </span>
                  )}
                </div>
              </div>

              {/* Balanced Correct / Wrong / Blank Stat Cards */}
              <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
                <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.07] px-3 py-3.5 text-center">
                  <div className="mx-auto mb-1 flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="h-4 w-4" />
                  </div>
                  <p className="text-2xl font-black tabular-nums text-emerald-600 dark:text-emerald-400">
                    {resultCorrect}
                  </p>
                  <p className="mt-0.5 text-[11px] font-semibold text-muted-foreground sm:text-xs">
                    Doğru
                  </p>
                </div>

                <div className="rounded-2xl border border-rose-500/30 bg-rose-500/[0.06] px-3 py-3.5 text-center">
                  <div className="mx-auto mb-1 flex h-7 w-7 items-center justify-center rounded-lg bg-rose-500/15 text-rose-600 dark:text-rose-400">
                    <XCircle className="h-4 w-4" />
                  </div>
                  <p className="text-2xl font-black tabular-nums text-rose-600 dark:text-rose-400">
                    {resultWrong}
                  </p>
                  <p className="mt-0.5 text-[11px] font-semibold text-muted-foreground sm:text-xs">
                    Yanlış
                  </p>
                </div>

                <div className="rounded-2xl border border-border/75 bg-muted/30 px-3 py-3.5 text-center">
                  <div className="mx-auto mb-1 flex h-7 w-7 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    <MinusCircle className="h-4 w-4" />
                  </div>
                  <p className="text-2xl font-black tabular-nums text-foreground">
                    {resultBlank}
                  </p>
                  <p className="mt-0.5 text-[11px] font-semibold text-muted-foreground sm:text-xs">
                    Boş
                  </p>
                </div>
              </div>

              {/* 1-15 Question-by-Question Answer Summary */}
              <div className="space-y-3 rounded-2xl border border-border/70 bg-muted/20 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-extrabold text-foreground">Soru Bazında Cevap Özeti</p>
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
                          'flex h-9 items-center justify-center rounded-xl border text-xs font-extrabold tabular-nums transition-all sm:h-8',
                          state === 'correct' &&
                            'border-emerald-500/45 bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/25 dark:text-emerald-300',
                          state === 'wrong' &&
                            'border-rose-500/45 bg-rose-500/15 text-rose-700 hover:bg-rose-500/25 dark:text-rose-300',
                          state === 'blank' &&
                            'border-dashed border-border bg-background/80 text-muted-foreground hover:border-primary/40',
                          isInspected && state === 'correct' && 'trivia-anim-correct ring-2 ring-emerald-500/60',
                          isInspected && state === 'wrong' && 'trivia-anim-wrong ring-2 ring-rose-500/60',
                          isInspected && state === 'blank' && 'ring-2 ring-primary/40',
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
                        'trivia-anim-enter flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 text-xs',
                        state === 'correct' &&
                          'border-emerald-500/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
                        state === 'wrong' &&
                          'border-rose-500/35 bg-rose-500/10 text-rose-700 dark:text-rose-300',
                        state === 'blank' &&
                          'border-border/75 bg-background/80 text-muted-foreground',
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
              <div className="flex items-center justify-center gap-2 rounded-2xl border border-primary/20 bg-primary/[0.05] px-4 py-3 text-xs font-semibold text-foreground sm:text-sm">
                <Clock className="h-4 w-4 shrink-0 text-primary" />
                <span className="tabular-nums">{renewalInfo.label}</span>
              </div>

              {/* Unified Action Row */}
              <div className="flex flex-col gap-2.5 pt-1 sm:flex-row sm:justify-center">
                <Button
                  type="button"
                  onClick={() => navigate('/notes')}
                  className="h-11 w-full gap-2 rounded-2xl bg-gradient-to-r from-[#003791] via-[#0055b8] to-[#0070d1] px-5 font-extrabold text-white shadow-md shadow-primary/20 hover:opacity-95 sm:w-auto"
                >
                  <BookOpen className="h-4 w-4" />
                  {attempt.grandPrizeAwarded ? 'Sınırsız Notlara Git' : 'Ders Notlarına Git'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate('/points')}
                  className="h-11 w-full gap-2 rounded-2xl px-5 font-semibold sm:w-auto"
                >
                  <Sparkles className="h-4 w-4 text-primary" />
                  Puan Geçmişim
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate('/')}
                  className="h-11 w-full gap-2 rounded-2xl px-5 font-semibold sm:w-auto"
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
