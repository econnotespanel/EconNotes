import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowRight,
  Award,
  BookOpen,
  Check,
  CheckCircle2,
  Clock,
  Flame,
  Gift,
  Heart,
  Lightbulb,
  Pause,
  Play,
  Plus,
  Puzzle,
  RotateCcw,
  Share2,
  Shield,
  Shuffle,
  Sparkles,
  Timer,
  Trash2,
  Trophy,
  Volume2,
  VolumeX,
  Wand2,
  XCircle,
  Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import Layout from '@/components/Layout';
import { useAuth } from '@/contexts/AuthContext';
import { usePoints } from '@/hooks/usePoints';
import { FOCUS_PRESETS, useFocusTimer } from '@/contexts/FocusTimerContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { todayKey } from '@/lib/gamification';
import { AMBIENT_SOUNDS } from '@/lib/ambientAudio';
import {
  ACADEMIC_RANKS,
  ARENA_CATEGORY_META,
  ARENA_QUESTIONS,
  getDailyBlitzQuestions,
  getDailyStudySpark,
  getMatchRoundPairs,
  getRankForPoints,
  MATCH_DECK_META,
  SEVEN_DAY_REWARDS,
  type ArenaCategory,
  type ArenaQuestion,
  type MatchPair,
} from '@/lib/studyArenaData';
import {
  ARENA_UPDATED_EVENT,
  claimDailyCheckIn,
  getCheckInCycleInfo,
  getTimeUntilMidnightIstanbul,
  loadArenaState,
  playComboTone,
  playVictoryFanfare,
  playWrongTone,
  recordDailyBlitzResult,
  recordMatchClear,
  saveArenaState,
  type StudyArenaState,
} from '@/lib/studyArenaState';
import { cn } from '@/lib/utils';

type ArenaTab = 'blitz' | 'match' | 'focus' | 'streak';

const QUESTION_SECONDS = 20;

const formatMMSS = (sec: number) => {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

const shuffleArray = <T,>(items: T[]): T[] => {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

const StudyArena = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { points } = usePoints(5);
  const focus = useFocusTimer();

  const initialTab = (searchParams.get('tab') as ArenaTab) || 'blitz';
  const validTab: ArenaTab = ['blitz', 'match', 'focus', 'streak'].includes(initialTab)
    ? initialTab
    : 'blitz';
  const [activeTab, setActiveTab] = useState<ArenaTab>(validTab);

  useEffect(() => {
    const t = searchParams.get('tab') as ArenaTab | null;
    if (t && ['blitz', 'match', 'focus', 'streak'].includes(t) && t !== activeTab) {
      setActiveTab(t);
    }
  }, [searchParams, activeTab]);

  const handleTabChange = (val: string) => {
    const next = val as ArenaTab;
    setActiveTab(next);
    setSearchParams({ tab: next }, { replace: true });
  };

  const today = todayKey();
  const [arena, setArena] = useState<StudyArenaState>(() => loadArenaState(user));
  const [claimingCheckIn, setClaimingCheckIn] = useState(false);
  const [countdown, setCountdown] = useState(() => getTimeUntilMidnightIstanbul());

  const refreshArena = useCallback(() => {
    setArena(loadArenaState(user));
  }, [user]);

  useEffect(() => {
    refreshArena();
    window.addEventListener(ARENA_UPDATED_EVENT, refreshArena);
    return () => window.removeEventListener(ARENA_UPDATED_EVENT, refreshArena);
  }, [refreshArena]);

  useEffect(() => {
    const timer = window.setInterval(() => setCountdown(getTimeUntilMidnightIstanbul()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const toggleSoundFx = () => {
    const next = { ...arena, soundEnabled: !arena.soundEnabled };
    setArena(next);
    saveArenaState(user, next, false);
  };

  // ═══════════════════════════════════════════════════════════════
  // TAB 1: GÜNÜN 5 SORULUK DÜELLOSU & SINIRSIZ ANTRENMAN MODU
  // ═══════════════════════════════════════════════════════════════
  const [quizMode, setQuizMode] = useState<'daily' | 'practice'>('daily');
  const [practiceCategory, setPracticeCategory] = useState<ArenaCategory | 'all'>('all');
  const [quizQuestions, setQuizQuestions] = useState<ArenaQuestion[]>(() =>
    getDailyBlitzQuestions(today),
  );
  const [qIndex, setQIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [timeLeft, setTimeLeft] = useState(QUESTION_SECONDS);
  const [combo, setCombo] = useState(0);
  const [bestCombo, setBestCombo] = useState(0);
  const [score, setScore] = useState(0);
  const [hearts, setHearts] = useState(3);
  const [jokerUsed, setJokerUsed] = useState(false);
  const [eliminatedOptions, setEliminatedOptions] = useState<number[]>([]);
  const [answersLog, setAnswersLog] = useState<boolean[]>([]);
  const [quizFinished, setQuizFinished] = useState(false);
  const [lastAwardedXp, setLastAwardedXp] = useState<number>(0);

  const dailyDoneToday = arena.dailyBlitzDate === today;

  const startDailyBlitz = useCallback(() => {
    setQuizMode('daily');
    setQuizQuestions(getDailyBlitzQuestions(today));
    setQIndex(0);
    setSelectedOption(null);
    setTimeLeft(QUESTION_SECONDS);
    setCombo(0);
    setBestCombo(0);
    setScore(0);
    setHearts(3);
    setJokerUsed(false);
    setEliminatedOptions([]);
    setAnswersLog([]);
    setQuizFinished(false);
    setLastAwardedXp(0);
  }, [today]);

  const startPracticeBlitz = useCallback((cat: ArenaCategory | 'all') => {
    const pool =
      cat === 'all' ? ARENA_QUESTIONS : ARENA_QUESTIONS.filter((q) => q.category === cat);
    setQuizMode('practice');
    setPracticeCategory(cat);
    setQuizQuestions(shuffleArray(pool).slice(0, 10));
    setQIndex(0);
    setSelectedOption(null);
    setTimeLeft(QUESTION_SECONDS);
    setCombo(0);
    setBestCombo(0);
    setScore(0);
    setHearts(3);
    setJokerUsed(false);
    setEliminatedOptions([]);
    setAnswersLog([]);
    setQuizFinished(false);
    setLastAwardedXp(0);
  }, []);

  const currentQuestion = quizQuestions[qIndex];

  // Question countdown timer
  useEffect(() => {
    if (activeTab !== 'blitz' || quizFinished || selectedOption !== null || !currentQuestion) return;
    if (timeLeft <= 0) {
      // Timeout counts as wrong answer (-1)
      setSelectedOption(-1);
      setCombo(0);
      setAnswersLog((prev) => [...prev, false]);
      if (quizMode === 'practice') {
        setHearts((h) => Math.max(0, h - 1));
      }
      playWrongTone(arena.soundEnabled);
      return;
    }

    const t = window.setTimeout(() => setTimeLeft((s) => Math.max(0, s - 1)), 1000);
    return () => window.clearTimeout(t);
  }, [activeTab, quizFinished, selectedOption, timeLeft, currentQuestion, quizMode, arena.soundEnabled]);

  const handleAnswer = (idx: number) => {
    if (selectedOption !== null || !currentQuestion) return;
    setSelectedOption(idx);
    const isCorrect = idx === currentQuestion.correctIndex;
    setAnswersLog((prev) => [...prev, isCorrect]);

    if (isCorrect) {
      const nextCombo = combo + 1;
      setScore((s) => s + 1);
      setCombo(nextCombo);
      setBestCombo((b) => Math.max(b, nextCombo));
      playComboTone(nextCombo, arena.soundEnabled);
    } else {
      setCombo(0);
      if (quizMode === 'practice') {
        setHearts((h) => Math.max(0, h - 1));
      }
      playWrongTone(arena.soundEnabled);
    }
  };

  const handleUseJoker = () => {
    if (jokerUsed || selectedOption !== null || !currentQuestion) return;
    const wrongIndices = [0, 1, 2, 3].filter((i) => i !== currentQuestion.correctIndex);
    const toRemove = shuffleArray(wrongIndices).slice(0, 2);
    setEliminatedOptions(toRemove);
    setJokerUsed(true);
    toast.info('50/50 Joker kullanıldı! 2 yanlış şık elendi.');
  };

  const handleNextQuestion = async () => {
    const outOfHearts = quizMode === 'practice' && hearts <= 0;
    const isLast = qIndex >= quizQuestions.length - 1;

    if (isLast || outOfHearts) {
      setQuizFinished(true);
      playVictoryFanfare(arena.soundEnabled);

      if (quizMode === 'daily' && user) {
        const res = await recordDailyBlitzResult(
          user,
          score,
          quizQuestions.length,
          bestCombo,
          answersLog,
        );
        setLastAwardedXp(res.xpAwarded);
        if (res.xpAwarded > 0) {
          toast.success(`Günün Düellosu tamamlandı! +${res.xpAwarded} XP kazandın 🎉`, {
            description: `Skor: ${score}/${quizQuestions.length} • En iyi kombo: ${bestCombo}x`,
          });
        }
        refreshArena();
      }
      return;
    }

    setQIndex((i) => i + 1);
    setSelectedOption(null);
    setEliminatedOptions([]);
    setTimeLeft(QUESTION_SECONDS);
  };

  const handleCopyBlitzResult = () => {
    const grid = (answersLog.length > 0 ? answersLog : arena.dailyBlitzAnswers)
      .map((ok) => (ok ? '🟩' : '🟥'))
      .join('');
    const finalScore = answersLog.length > 0 ? score : arena.dailyBlitzScore;
    const finalTotal = answersLog.length > 0 ? quizQuestions.length : arena.dailyBlitzTotal;
    const finalCombo = answersLog.length > 0 ? bestCombo : arena.dailyBlitzBestCombo;
    const text = `⚡ EconNotes Günün İktisat Düellosu (${today})\nSkor: ${finalScore}/${finalTotal} ${grid}\nEn Yüksek Kombo: ${finalCombo}x 🔥\nSen de çöz: https://econnotes.online/arena`;

    if (navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(text).then(() => {
        toast.success('Sonuç kartı panoya kopyalandı! Arkadaşlarınla paylaşabilirsin.');
      });
    } else {
      toast.info(text);
    }
  };

  // ═══════════════════════════════════════════════════════════════
  // TAB 2: KAVRAM EŞLEŞTİRME ARENASI (SPEED MEMORY MATCH)
  // ═══════════════════════════════════════════════════════════════
  const [matchDeck, setMatchDeck] = useState<MatchPair['deck']>('iktisatcilar');
  const [matchPairs, setMatchPairs] = useState<MatchPair[]>(() =>
    getMatchRoundPairs('iktisatcilar', 4),
  );
  const [shuffledTerms, setShuffledTerms] = useState<MatchPair[]>([]);
  const [shuffledDefs, setShuffledDefs] = useState<MatchPair[]>([]);
  const [pickedTermId, setPickedTermId] = useState<string | null>(null);
  const [pickedDefId, setPickedDefId] = useState<string | null>(null);
  const [matchedIds, setMatchedIds] = useState<Set<string>>(new Set());
  const [wrongFlash, setWrongFlash] = useState<{ termId: string; defId: string } | null>(null);
  const [matchCombo, setMatchCombo] = useState(0);
  const [matchStartedAt, setMatchStartedAt] = useState<number | null>(null);
  const [matchElapsed, setMatchElapsed] = useState(0);
  const [matchCompleted, setMatchCompleted] = useState(false);
  const [matchXpEarned, setMatchXpEarned] = useState(0);

  const initMatchRound = useCallback((deck: MatchPair['deck']) => {
    const pairs = getMatchRoundPairs(deck, 4);
    setMatchDeck(deck);
    setMatchPairs(pairs);
    setShuffledTerms(shuffleArray(pairs));
    setShuffledDefs(shuffleArray(pairs));
    setPickedTermId(null);
    setPickedDefId(null);
    setMatchedIds(new Set());
    setWrongFlash(null);
    setMatchCombo(0);
    setMatchStartedAt(null);
    setMatchElapsed(0);
    setMatchCompleted(false);
    setMatchXpEarned(0);
  }, []);

  useEffect(() => {
    initMatchRound('iktisatcilar');
  }, [initMatchRound]);

  // Live decisecond stopwatch while playing match
  useEffect(() => {
    if (!matchStartedAt || matchCompleted || activeTab !== 'match') return;
    const t = window.setInterval(() => {
      setMatchElapsed((Date.now() - matchStartedAt) / 1000);
    }, 100);
    return () => window.clearInterval(t);
  }, [matchStartedAt, matchCompleted, activeTab]);

  const evaluateMatchPair = useCallback(
    (termId: string, defId: string) => {
      if (termId === defId) {
        const nextMatched = new Set(matchedIds);
        nextMatched.add(termId);
        const nextCombo = matchCombo + 1;
        setMatchedIds(nextMatched);
        setMatchCombo(nextCombo);
        setPickedTermId(null);
        setPickedDefId(null);
        playComboTone(nextCombo, arena.soundEnabled);

        if (nextMatched.size === matchPairs.length) {
          const finalSec = matchStartedAt ? (Date.now() - matchStartedAt) / 1000 : 1;
          setMatchElapsed(finalSec);
          setMatchCompleted(true);
          playVictoryFanfare(arena.soundEnabled);

          if (user) {
            void recordMatchClear(user, finalSec).then((res) => {
              setMatchXpEarned(res.xpAwarded);
              if (res.xpAwarded > 0) {
                toast.success(`Kavram Eşleştirme tamamlandı! +${res.xpAwarded} XP 🧩`, {
                  description: `Süre: ${finalSec.toFixed(1)} sn${res.isNewBest ? ' • Yeni kişisel rekor!' : ''}`,
                });
              } else if (res.isNewBest) {
                toast.success(`Yeni kişisel rekor: ${finalSec.toFixed(1)} sn! ⚡`);
              }
              refreshArena();
            });
          }
        }
      } else {
        setMatchCombo(0);
        setWrongFlash({ termId, defId });
        playWrongTone(arena.soundEnabled);
        window.setTimeout(() => {
          setWrongFlash(null);
          setPickedTermId(null);
          setPickedDefId(null);
        }, 420);
      }
    },
    [matchedIds, matchCombo, matchPairs.length, matchStartedAt, arena.soundEnabled, user, refreshArena],
  );

  const handlePickTerm = (id: string) => {
    if (matchedIds.has(id) || wrongFlash) return;
    if (!matchStartedAt) setMatchStartedAt(Date.now());
    setPickedTermId(id);
    if (pickedDefId) {
      evaluateMatchPair(id, pickedDefId);
    }
  };

  const handlePickDef = (id: string) => {
    if (matchedIds.has(id) || wrongFlash) return;
    if (!matchStartedAt) setMatchStartedAt(Date.now());
    setPickedDefId(id);
    if (pickedTermId) {
      evaluateMatchPair(pickedTermId, id);
    }
  };

  // ═══════════════════════════════════════════════════════════════
  // TAB 3: ODAK STÜDYOSU MINI CHECKLIST
  // ═══════════════════════════════════════════════════════════════
  const [newTaskText, setNewTaskText] = useState('');
  const taskInputRef = useRef<HTMLInputElement | null>(null);

  const handleAddTask = () => {
    const trimmed = newTaskText.trim();
    if (!trimmed) return;
    const nextTasks = [
      ...arena.studyTasks,
      { id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, text: trimmed, done: false },
    ].slice(-12);
    const nextState = { ...arena, studyTasks: nextTasks };
    setArena(nextState);
    saveArenaState(user, nextState, false);
    setNewTaskText('');
  };

  const handleToggleTask = (id: string) => {
    const target = arena.studyTasks.find((t) => t.id === id);
    const nextTasks = arena.studyTasks.map((t) => (t.id === id ? { ...t, done: !t.done } : t));
    const nextState = { ...arena, studyTasks: nextTasks };
    setArena(nextState);
    saveArenaState(user, nextState, false);
    if (target && !target.done) {
      playComboTone(2, arena.soundEnabled);
    }
  };

  const handleDeleteTask = (id: string) => {
    const nextTasks = arena.studyTasks.filter((t) => t.id !== id);
    const nextState = { ...arena, studyTasks: nextTasks };
    setArena(nextState);
    saveArenaState(user, nextState, false);
  };

  // ═══════════════════════════════════════════════════════════════
  // TAB 4: CHECK-IN & RANKS
  // ═══════════════════════════════════════════════════════════════
  const totalXp = points?.points ?? 0;
  const rank = useMemo(() => getRankForPoints(totalXp), [totalXp]);
  const cycle = useMemo(() => getCheckInCycleInfo(arena), [arena]);
  const displayStreak = Math.max(points?.current_streak ?? 0, cycle.activeStreak);
  const spark = useMemo(() => getDailyStudySpark(today), [today]);

  const handleClaimCheckIn = async () => {
    if (!user || claimingCheckIn || cycle.claimedToday) return;
    setClaimingCheckIn(true);
    try {
      const res = await claimDailyCheckIn(user);
      if (res.ok) {
        playVictoryFanfare(arena.soundEnabled);
        toast.success(
          res.dayInCycle === 7
            ? `7. Gün Büyük Sandık Açıldı! +${res.xp} XP 🎉`
            : `${res.dayInCycle}. Gün Ödülü Alındı! +${res.xp} XP 🔥`,
        );
        refreshArena();
      }
    } finally {
      setClaimingCheckIn(false);
    }
  };

  // SVG Ring math for Focus Timer
  const ringRadius = 86;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const focusProgressRatio =
    focus.totalSeconds > 0
      ? Math.min(1, Math.max(0, (focus.totalSeconds - focus.secondsLeft) / focus.totalSeconds))
      : 0;
  const ringOffset = ringCircumference * (1 - focusProgressRatio);

  return (
    <Layout>
      <div className="space-y-6 animate-fade-in">
        {/* Arena Hero Header */}
        <div className="relative overflow-hidden rounded-2xl border border-primary/25 bg-gradient-to-br from-card via-card to-primary/10 dark:from-[#0c162b] dark:via-[#0a1324] dark:to-[#0f254f] p-5 sm:p-6 shadow-md">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-14 -top-14 h-52 w-52 rounded-full bg-cyan-500/15 blur-3xl"
          />
          <div className="relative z-10 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-[#003791] via-[#0070d1] to-[#00a8ff] px-3 py-1 text-xs font-bold text-white shadow-sm">
                  <span>{rank.current.emoji}</span>
                  <span>{rank.current.title}</span>
                </span>
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/35 bg-amber-500/10 px-2.5 py-1 text-xs font-bold text-amber-600 dark:text-amber-400">
                  <Flame className="h-3.5 w-3.5 fill-current" />
                  {displayStreak} Gün Seri
                </span>
                <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary">
                  <Sparkles className="h-3.5 w-3.5" />
                  {totalXp} XP
                </span>
              </div>
              <h1 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
                EconNotes Çalışma Arenası
              </h1>
              <p className="text-xs sm:text-sm text-muted-foreground max-w-2xl">
                Sıkılmadan öğren, her gün serini büyüt: 60 saniyelik İktisat Düellosu, Kavram Eşleştirme ve Yağmur/Kütüphane sesli Derin Odak Stüdyosu tek yerde.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={toggleSoundFx}
                className="h-9 rounded-xl border-border/80 gap-1.5 text-xs"
              >
                {arena.soundEnabled ? (
                  <>
                    <Volume2 className="h-3.5 w-3.5 text-primary" />
                    Ses Efektleri Açık
                  </>
                ) : (
                  <>
                    <VolumeX className="h-3.5 w-3.5 text-muted-foreground" />
                    Ses Kapalı
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate('/points')}
                className="h-9 rounded-xl border-primary/30 text-xs gap-1.5"
              >
                <Trophy className="h-3.5 w-3.5 text-amber-500" />
                Puan Geçmişi
              </Button>
            </div>
          </div>
        </div>

        {/* Main Interactive Tabs */}
        <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-5">
          <TabsList className="grid h-auto w-full grid-cols-2 gap-1.5 rounded-2xl border border-border/70 bg-card/80 p-1.5 sm:grid-cols-4">
            <TabsTrigger
              value="blitz"
              className="flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs sm:text-sm font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              <Zap className="h-4 w-4" />
              <span>Günün Düellosu</span>
            </TabsTrigger>
            <TabsTrigger
              value="match"
              className="flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs sm:text-sm font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              <Puzzle className="h-4 w-4" />
              <span>Kavram Eşleştirme</span>
            </TabsTrigger>
            <TabsTrigger
              value="focus"
              className="flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs sm:text-sm font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              <Timer className="h-4 w-4" />
              <span>Odak Stüdyosu</span>
            </TabsTrigger>
            <TabsTrigger
              value="streak"
              className="flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs sm:text-sm font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              <Flame className="h-4 w-4" />
              <span>Seri & Rütbeler</span>
            </TabsTrigger>
          </TabsList>

          {/* ═══════════ TAB 1: GÜNÜN DÜELLOSU & SINIRSIZ PRATİK ═══════════ */}
          <TabsContent value="blitz" className="space-y-4">
            {/* Mode Switcher */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant={quizMode === 'daily' ? 'default' : 'outline'}
                  onClick={startDailyBlitz}
                  className="rounded-xl gap-1.5 text-xs font-bold"
                >
                  <Zap className="h-3.5 w-3.5" />
                  Günün 5 Sorusu
                  {dailyDoneToday && <Check className="h-3.5 w-3.5 text-emerald-300" />}
                </Button>
                <Button
                  size="sm"
                  variant={quizMode === 'practice' ? 'default' : 'outline'}
                  onClick={() => startPracticeBlitz(practiceCategory)}
                  className="rounded-xl gap-1.5 text-xs font-bold"
                >
                  <Shuffle className="h-3.5 w-3.5" />
                  Sınırsız Antrenman (10 Soru)
                </Button>
              </div>

              {quizMode === 'practice' && (
                <div className="flex flex-wrap items-center gap-1.5">
                  {(['all', 'mikro', 'makro', 'para', 'maliye', 'ekonometri'] as const).map(
                    (cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => startPracticeBlitz(cat)}
                        className={cn(
                          'rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-all',
                          practiceCategory === cat
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-border/70 bg-card text-muted-foreground hover:text-foreground',
                        )}
                      >
                        {ARENA_CATEGORY_META[cat].shortLabel}
                      </button>
                    ),
                  )}
                </div>
              )}
            </div>

            {quizMode === 'daily' && dailyDoneToday && !quizFinished && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-500/35 bg-emerald-500/10 px-4 py-2.5 text-xs">
                <span className="font-medium text-emerald-700 dark:text-emerald-300">
                  ✅ Bugünün 5 Soruluk Düellosunu tamamladın (Skorun: <strong>{arena.dailyBlitzScore}/{arena.dailyBlitzTotal}</strong>). Tekrar çözebilir veya Sınırsız Antrenman&apos;a geçebilirsin!
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleCopyBlitzResult}
                  className="h-7 rounded-lg border-emerald-500/40 text-[11px] gap-1"
                >
                  <Share2 className="h-3 w-3" />
                  Skoru Paylaş
                </Button>
              </div>
            )}

            {quizFinished ? (
              <Card className="glass-card border-primary/30 overflow-hidden">
                <CardContent className="p-6 sm:p-8 text-center space-y-5">
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[#003791] via-[#0070d1] to-[#00b4ff] text-white shadow-lg shadow-primary/30">
                    <Trophy className="h-8 w-8" />
                  </div>
                  <div className="space-y-1.5">
                    <h2 className="text-2xl font-extrabold text-foreground">
                      {score === quizQuestions.length
                        ? 'Kusursuz Seri! 🏆'
                        : score >= Math.ceil(quizQuestions.length * 0.6)
                          ? 'Harika Performans! 🔥'
                          : 'Güzel Antrenman! 💪'}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      {quizMode === 'daily'
                        ? 'Günün 5 Soruluk İktisat Düellosunu tamamladın.'
                        : `${ARENA_CATEGORY_META[practiceCategory].label} antrenmanını tamamladın.`}
                    </p>
                  </div>

                  {/* Emoji Scorecard */}
                  <div className="flex items-center justify-center gap-1.5 text-xl">
                    {answersLog.map((ok, i) => (
                      <span key={i} aria-label={ok ? 'Doğru' : 'Yanlış'}>
                        {ok ? '🟩' : '🟥'}
                      </span>
                    ))}
                  </div>

                  <div className="grid grid-cols-3 gap-3 max-w-md mx-auto">
                    <div className="rounded-xl border border-border/70 bg-background/70 p-3">
                      <p className="text-[11px] text-muted-foreground">Doğru</p>
                      <p className="text-xl font-extrabold text-foreground">
                        {score}/{quizQuestions.length}
                      </p>
                    </div>
                    <div className="rounded-xl border border-border/70 bg-background/70 p-3">
                      <p className="text-[11px] text-muted-foreground">En İyi Kombo</p>
                      <p className="text-xl font-extrabold text-amber-500">{bestCombo}x 🔥</p>
                    </div>
                    <div className="rounded-xl border border-border/70 bg-background/70 p-3">
                      <p className="text-[11px] text-muted-foreground">Kazanılan XP</p>
                      <p className="text-xl font-extrabold text-emerald-500">
                        {lastAwardedXp > 0 ? `+${lastAwardedXp}` : 'Pratik'}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-center gap-2.5 pt-2">
                    {quizMode === 'daily' && (
                      <Button
                        variant="outline"
                        onClick={handleCopyBlitzResult}
                        className="rounded-xl gap-1.5"
                      >
                        <Share2 className="h-4 w-4" />
                        Sonuç Kartını Kopyala
                      </Button>
                    )}
                    <Button
                      onClick={() => startPracticeBlitz(practiceCategory)}
                      className="rounded-xl gradient-primary text-primary-foreground gap-1.5"
                    >
                      <Shuffle className="h-4 w-4" />
                      Yeni 10 Soruluk Antrenman
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => handleTabChange('match')}
                      className="rounded-xl gap-1.5"
                    >
                      <Puzzle className="h-4 w-4" />
                      Kavram Eşleştirme Oyna
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : currentQuestion ? (
              <Card className="glass-card border-primary/25 overflow-hidden">
                {/* Timer Progress Top Line */}
                <div className="h-1.5 w-full bg-muted overflow-hidden">
                  <div
                    className={cn(
                      'h-full transition-all duration-1000 ease-linear',
                      timeLeft <= 5
                        ? 'bg-destructive'
                        : timeLeft <= 10
                          ? 'bg-amber-500'
                          : 'bg-gradient-to-r from-[#0070d1] to-cyan-400',
                    )}
                    style={{ width: `${(timeLeft / QUESTION_SECONDS) * 100}%` }}
                  />
                </div>

                <CardContent className="p-5 sm:p-6 space-y-5">
                  {/* HUD Strip */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-bold text-muted-foreground">
                        Soru {qIndex + 1}/{quizQuestions.length}
                      </span>
                      <span
                        className={cn(
                          'rounded-full border px-2.5 py-0.5 text-[11px] font-semibold',
                          ARENA_CATEGORY_META[currentQuestion.category].colorClass,
                        )}
                      >
                        {ARENA_CATEGORY_META[currentQuestion.category].label}
                      </span>
                      {combo >= 2 && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 px-2.5 py-0.5 text-[11px] font-extrabold text-amber-600 dark:text-amber-400 animate-bounce">
                          <Flame className="h-3 w-3 fill-current" />
                          {combo}x KOMBO!
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {quizMode === 'practice' && (
                        <div className="flex items-center gap-0.5" title="Kalan Can">
                          {[0, 1, 2].map((i) => (
                            <Heart
                              key={i}
                              className={cn(
                                'h-4 w-4 transition-all',
                                i < hearts
                                  ? 'fill-rose-500 text-rose-500'
                                  : 'text-muted-foreground/30',
                              )}
                            />
                          ))}
                        </div>
                      )}

                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={jokerUsed || selectedOption !== null}
                        onClick={handleUseJoker}
                        className="h-7 rounded-lg px-2.5 text-[11px] gap-1"
                        title="2 yanlış şıkkı ele"
                      >
                        <Wand2 className="h-3 w-3 text-primary" />
                        50/50
                      </Button>

                      <span
                        className={cn(
                          'inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 font-mono text-xs font-bold',
                          timeLeft <= 5
                            ? 'border-destructive/50 bg-destructive/10 text-destructive'
                            : 'border-border/70 bg-background/70 text-foreground',
                        )}
                      >
                        <Clock className="h-3 w-3" />
                        {timeLeft}s
                      </span>
                    </div>
                  </div>

                  {/* Question Text */}
                  <h2 className="text-base sm:text-xl font-bold leading-snug text-foreground">
                    {currentQuestion.question}
                  </h2>

                  {/* 4 Options */}
                  <div className="grid gap-2.5 sm:grid-cols-2">
                    {currentQuestion.options.map((opt, idx) => {
                      const isEliminated = eliminatedOptions.includes(idx);
                      const isAnswered = selectedOption !== null;
                      const isCorrect = idx === currentQuestion.correctIndex;
                      const isPicked = idx === selectedOption;

                      return (
                        <button
                          key={idx}
                          type="button"
                          disabled={isAnswered || isEliminated}
                          onClick={() => handleAnswer(idx)}
                          className={cn(
                            'group flex items-start gap-3 rounded-xl border p-3.5 text-left text-sm font-medium transition-all',
                            isEliminated && 'opacity-25 line-through cursor-not-allowed',
                            !isAnswered &&
                              !isEliminated &&
                              'border-border/80 bg-background/70 hover:border-primary/60 hover:bg-primary/[0.06] active:scale-[0.99] cursor-pointer',
                            isAnswered &&
                              isCorrect &&
                              'border-emerald-500 bg-emerald-500/15 text-foreground shadow-sm',
                            isAnswered &&
                              isPicked &&
                              !isCorrect &&
                              'border-destructive bg-destructive/15 text-foreground',
                            isAnswered &&
                              !isCorrect &&
                              !isPicked &&
                              'border-border/50 bg-background/40 opacity-55',
                          )}
                        >
                          <span
                            className={cn(
                              'flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border text-xs font-bold',
                              isAnswered && isCorrect
                                ? 'border-emerald-500 bg-emerald-500 text-white'
                                : isAnswered && isPicked && !isCorrect
                                  ? 'border-destructive bg-destructive text-white'
                                  : 'border-border/80 bg-card text-muted-foreground group-hover:border-primary/50 group-hover:text-primary',
                            )}
                          >
                            {isAnswered && isCorrect ? (
                              <Check className="h-3.5 w-3.5" />
                            ) : isAnswered && isPicked && !isCorrect ? (
                              <XCircle className="h-3.5 w-3.5" />
                            ) : (
                              String.fromCharCode(65 + idx)
                            )}
                          </span>
                          <span className="leading-snug">{opt}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Instant Explanation & Next Button */}
                  {selectedOption !== null && (
                    <div className="space-y-3 rounded-xl border border-primary/25 bg-primary/[0.06] p-4 animate-in fade-in slide-in-from-bottom-2 duration-200">
                      <div className="flex items-start gap-2.5">
                        <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                        <div className="space-y-1 text-xs sm:text-sm">
                          <p className="font-bold text-foreground">
                            {selectedOption === currentQuestion.correctIndex
                              ? 'Doğru! Sınav İpucu:'
                              : selectedOption === -1
                                ? 'Süre Doldu! Aklında Kalsın:'
                                : 'Hemen Öğrenelim:'}
                          </p>
                          <p className="text-muted-foreground leading-relaxed">
                            {currentQuestion.tip}
                          </p>
                        </div>
                      </div>
                      <div className="flex justify-end">
                        <Button
                          onClick={() => void handleNextQuestion()}
                          className="rounded-xl gradient-primary text-primary-foreground gap-1.5 font-bold"
                        >
                          <span>
                            {qIndex >= quizQuestions.length - 1 ||
                            (quizMode === 'practice' && hearts <= 0)
                              ? 'Sonuçları Gör'
                              : 'Sonraki Soru'}
                          </span>
                          <ArrowRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ) : null}
          </TabsContent>

          {/* ═══════════ TAB 2: KAVRAM EŞLEŞTİRME ARENASI ═══════════ */}
          <TabsContent value="match" className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                {(['iktisatcilar', 'kavramlar', 'finans'] as const).map((deck) => (
                  <Button
                    key={deck}
                    size="sm"
                    variant={matchDeck === deck ? 'default' : 'outline'}
                    onClick={() => initMatchRound(deck)}
                    className="rounded-xl text-xs font-semibold"
                  >
                    {MATCH_DECK_META[deck].label}
                  </Button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-xl border border-border/80 bg-card px-3 py-1.5 font-mono text-xs font-bold">
                  <Clock className="h-3.5 w-3.5 text-primary" />
                  {matchElapsed.toFixed(1)} sn
                </span>
                {arena.bestMatchSeconds && (
                  <span className="inline-flex items-center gap-1 rounded-xl border border-amber-500/35 bg-amber-500/10 px-2.5 py-1.5 font-mono text-xs font-bold text-amber-600 dark:text-amber-400">
                    <Trophy className="h-3.5 w-3.5" />
                    Rekor: {arena.bestMatchSeconds}s
                  </span>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => initMatchRound(matchDeck)}
                  className="rounded-xl gap-1 text-xs"
                >
                  <Shuffle className="h-3.5 w-3.5" />
                  Karıştır
                </Button>
              </div>
            </div>

            <Card className="glass-card border-primary/20">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">{MATCH_DECK_META[matchDeck].label}</CardTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Sol sütundan bir kavram seç, sağ sütundan doğru karşılığına dokun. Günün ilk turu <strong>+25 XP</strong> kazandırır!
                    </p>
                  </div>
                  {matchCombo >= 2 && !matchCompleted && (
                    <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-extrabold text-emerald-500">
                      {matchCombo}x Seri!
                    </span>
                  )}
                </div>
              </CardHeader>

              <CardContent className="p-4 sm:p-6">
                {matchCompleted ? (
                  <div className="py-6 text-center space-y-4">
                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-500">
                      <CheckCircle2 className="h-8 w-8" />
                    </div>
                    <div className="space-y-1">
                      <h3 className="text-xl font-extrabold text-foreground">
                        Hepsini Eşleştirdin! ⚡ {matchElapsed.toFixed(1)} saniye
                      </h3>
                      <p className="text-xs sm:text-sm text-muted-foreground">
                        {matchXpEarned > 0
                          ? `Günün ilk eşleştirme bonusu olarak +${matchXpEarned} XP hesabına eklendi!`
                          : 'Yeni kartlarla hız rekorunu kırmaya devam et.'}
                      </p>
                    </div>
                    <div className="flex flex-wrap justify-center gap-2">
                      <Button
                        onClick={() => initMatchRound(matchDeck)}
                        className="rounded-xl gradient-primary text-primary-foreground gap-1.5"
                      >
                        <Shuffle className="h-4 w-4" />
                        Yeni Tur Başlat
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => {
                          const decks: MatchPair['deck'][] = ['iktisatcilar', 'kavramlar', 'finans'];
                          const next = decks[(decks.indexOf(matchDeck) + 1) % decks.length];
                          initMatchRound(next);
                        }}
                        className="rounded-xl gap-1.5"
                      >
                        Sonraki Deste
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2">
                    {/* Terms column */}
                    <div className="space-y-2.5">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                        Kavram / İktisatçı
                      </p>
                      {shuffledTerms.map((item) => {
                        const isMatched = matchedIds.has(item.id);
                        const isSelected = pickedTermId === item.id;
                        const isWrong = wrongFlash?.termId === item.id;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            disabled={isMatched}
                            onClick={() => handlePickTerm(item.id)}
                            className={cn(
                              'w-full rounded-xl border p-3.5 text-left text-sm font-bold transition-all',
                              isMatched &&
                                'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 opacity-60 cursor-default',
                              isWrong &&
                                'border-destructive bg-destructive/15 text-destructive',
                              !isMatched &&
                                !isWrong &&
                                isSelected &&
                                'border-primary bg-primary/15 text-primary ring-2 ring-primary/30 scale-[1.01]',
                              !isMatched &&
                                !isWrong &&
                                !isSelected &&
                                'border-border/80 bg-background/70 hover:border-primary/50 hover:bg-primary/[0.05] cursor-pointer',
                            )}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span>{item.term}</span>
                              {isMatched && <Check className="h-4 w-4 shrink-0" />}
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    {/* Definitions column */}
                    <div className="space-y-2.5">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                        Tanım / Kuram
                      </p>
                      {shuffledDefs.map((item) => {
                        const isMatched = matchedIds.has(item.id);
                        const isSelected = pickedDefId === item.id;
                        const isWrong = wrongFlash?.defId === item.id;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            disabled={isMatched}
                            onClick={() => handlePickDef(item.id)}
                            className={cn(
                              'w-full rounded-xl border p-3.5 text-left text-xs sm:text-sm font-medium transition-all leading-snug',
                              isMatched &&
                                'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 opacity-60 cursor-default',
                              isWrong &&
                                'border-destructive bg-destructive/15 text-destructive',
                              !isMatched &&
                                !isWrong &&
                                isSelected &&
                                'border-cyan-500 bg-cyan-500/15 text-foreground ring-2 ring-cyan-500/30 scale-[1.01]',
                              !isMatched &&
                                !isWrong &&
                                !isSelected &&
                                'border-border/80 bg-background/70 hover:border-cyan-500/50 hover:bg-cyan-500/[0.05] cursor-pointer',
                            )}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span>{item.definition}</span>
                              {isMatched && <Check className="h-4 w-4 shrink-0" />}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ═══════════ TAB 3: DERİN ODAK POMODORO & SES STÜDYOSU ═══════════ */}
          <TabsContent value="focus" className="space-y-4">
            <div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
              {/* Left: Circular Pomodoro Timer & Ambient Mixer */}
              <Card className="glass-card border-primary/25">
                <CardContent className="p-5 sm:p-6 space-y-6">
                  {/* Presets */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {FOCUS_PRESETS.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => focus.selectPreset(p.id)}
                        className={cn(
                          'rounded-xl border px-2.5 py-2 text-center transition-all',
                          focus.preset.id === p.id
                            ? 'border-primary bg-primary/15 text-primary shadow-sm'
                            : 'border-border/70 bg-background/60 text-muted-foreground hover:text-foreground',
                        )}
                      >
                        <p className="text-xs font-bold">{p.label}</p>
                        <p className="font-mono text-[11px]">{p.minutes} dk</p>
                      </button>
                    ))}
                  </div>

                  {/* Circular SVG Timer */}
                  <div className="flex flex-col items-center justify-center py-2">
                    <div className="relative flex h-52 w-52 items-center justify-center">
                      <svg className="h-full w-full -rotate-90" viewBox="0 0 200 200">
                        <circle
                          cx="100"
                          cy="100"
                          r={ringRadius}
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="10"
                          className="text-muted/40"
                        />
                        <circle
                          cx="100"
                          cy="100"
                          r={ringRadius}
                          fill="none"
                          stroke="url(#focusRingGrad)"
                          strokeWidth="10"
                          strokeLinecap="round"
                          strokeDasharray={ringCircumference}
                          strokeDashoffset={ringOffset}
                          className="transition-all duration-500"
                        />
                        <defs>
                          <linearGradient id="focusRingGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                            <stop offset="0%" stopColor="#00439c" />
                            <stop offset="50%" stopColor="#0070d1" />
                            <stop offset="100%" stopColor="#22d3ee" />
                          </linearGradient>
                        </defs>
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                          {focus.preset.label}
                        </span>
                        <span className="font-mono text-4xl font-extrabold tracking-tight text-foreground mt-0.5">
                          {formatMMSS(focus.secondsLeft)}
                        </span>
                        <span className="mt-1 text-[11px] text-primary font-medium">
                          {focus.isRunning
                            ? 'Odak aktif 🔥'
                            : focus.hasStarted
                              ? 'Duraklatıldı'
                              : focus.preset.isBreak
                                ? 'Zihnini dinlendir'
                                : 'Tamamla → +30 XP'}
                        </span>
                      </div>
                    </div>

                    {/* Session Goal Input */}
                    <div className="mt-4 w-full max-w-sm">
                      <Input
                        value={focus.sessionGoal}
                        onChange={(e) => focus.setSessionGoal(e.target.value)}
                        placeholder="Bu oturumda ne çalışacaksın? (ör. Makro İktisat IS-LM)"
                        className="h-10 rounded-xl bg-background/70 text-center text-xs sm:text-sm"
                      />
                    </div>

                    {/* Timer Buttons */}
                    <div className="mt-4 flex flex-wrap items-center justify-center gap-2.5">
                      <Button
                        size="lg"
                        onClick={focus.toggle}
                        className="rounded-xl gradient-primary text-primary-foreground px-7 font-bold shadow-lg shadow-primary/25 gap-2"
                      >
                        {focus.isRunning ? (
                          <>
                            <Pause className="h-4 w-4" />
                            Duraklat
                          </>
                        ) : (
                          <>
                            <Play className="h-4 w-4" />
                            {focus.hasStarted ? 'Devam Et' : 'Odağı Başlat'}
                          </>
                        )}
                      </Button>

                      <Button
                        size="lg"
                        variant="outline"
                        onClick={focus.reset}
                        className="rounded-xl gap-1.5"
                      >
                        <RotateCcw className="h-4 w-4" />
                        Sıfırla
                      </Button>

                      <Button
                        size="lg"
                        variant="outline"
                        onClick={() => navigate('/notes')}
                        className="rounded-xl border-primary/35 text-primary hover:bg-primary/10 gap-1.5"
                        title="Sayaç ve ses arka planda çalışırken ders notlarını okuyabilirsin!"
                      >
                        <BookOpen className="h-4 w-4" />
                        Notları Aç
                      </Button>
                    </div>
                  </div>

                  {/* Ambient Soundscapes */}
                  <div className="space-y-3 border-t border-border/60 pt-4">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-bold text-foreground flex items-center gap-1.5">
                        <Volume2 className="h-4 w-4 text-primary" />
                        Odak Sesleri (Çevrimdışı & Arka Planda Çalışır)
                      </p>
                      {focus.ambientSound !== 'off' && (
                        <input
                          type="range"
                          min={0.05}
                          max={1}
                          step={0.05}
                          value={focus.ambientVolume}
                          onChange={(e) => focus.setAmbientVolume(Number(e.target.value))}
                          aria-label="Ses düzeyi"
                          className="w-24 accent-primary cursor-pointer"
                        />
                      )}
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                      {AMBIENT_SOUNDS.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => focus.setAmbientSound(s.id)}
                          className={cn(
                            'flex flex-col items-center justify-center rounded-xl border p-2.5 text-center transition-all',
                            focus.ambientSound === s.id
                              ? 'border-primary bg-primary/15 text-foreground shadow-sm'
                              : 'border-border/70 bg-background/60 text-muted-foreground hover:border-border hover:text-foreground',
                          )}
                        >
                          <span className="text-lg">{s.emoji}</span>
                          <span className="mt-1 text-[11px] font-semibold">{s.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Right: Today's Focus Stats + Mini Study Checklist */}
              <div className="space-y-4">
                <Card className="glass-card">
                  <CardContent className="p-4 grid grid-cols-3 gap-2.5 text-center">
                    <div className="rounded-xl border border-border/60 bg-background/60 p-3">
                      <p className="text-[10.5px] text-muted-foreground">Bugün</p>
                      <p className="text-xl font-extrabold text-primary">{arena.focusMinutesToday} dk</p>
                    </div>
                    <div className="rounded-xl border border-border/60 bg-background/60 p-3">
                      <p className="text-[10.5px] text-muted-foreground">Toplam</p>
                      <p className="text-xl font-extrabold text-foreground">{arena.totalFocusMinutes} dk</p>
                    </div>
                    <div className="rounded-xl border border-border/60 bg-background/60 p-3">
                      <p className="text-[10.5px] text-muted-foreground">Seans</p>
                      <p className="text-xl font-extrabold text-emerald-500">{arena.totalFocusSessions}</p>
                    </div>
                  </CardContent>
                </Card>

                <Card className="glass-card">
                  <CardHeader className="pb-2.5">
                    <CardTitle className="text-base flex items-center justify-between">
                      <span>Bugünün Çalışma Hedefleri</span>
                      <span className="font-mono text-xs text-muted-foreground">
                        {arena.studyTasks.filter((t) => t.done).length}/{arena.studyTasks.length}
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex gap-2">
                      <Input
                        ref={taskInputRef}
                        value={newTaskText}
                        onChange={(e) => setNewTaskText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleAddTask();
                        }}
                        placeholder="Yeni mini hedef ekle (ör. 10 soru çöz)"
                        className="h-9 text-xs rounded-xl"
                      />
                      <Button
                        size="sm"
                        onClick={handleAddTask}
                        className="h-9 rounded-xl px-3 shrink-0"
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>

                    {arena.studyTasks.length === 0 ? (
                      <p className="text-xs text-muted-foreground py-3 text-center">
                        Henüz hedef eklemedin. Küçük 2-3 hedef yazmak odaklanmayı %40 kolaylaştırır!
                      </p>
                    ) : (
                      <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                        {arena.studyTasks.map((task) => (
                          <div
                            key={task.id}
                            className="flex items-center gap-2.5 rounded-xl border border-border/60 bg-background/60 px-3 py-2"
                          >
                            <button
                              type="button"
                              onClick={() => handleToggleTask(task.id)}
                              className={cn(
                                'flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors',
                                task.done
                                  ? 'border-emerald-500 bg-emerald-500 text-white'
                                  : 'border-border hover:border-primary',
                              )}
                              aria-label="Tamamlandı olarak işaretle"
                            >
                              {task.done && <Check className="h-3.5 w-3.5 stroke-[3]" />}
                            </button>
                            <span
                              className={cn(
                                'flex-1 text-xs leading-snug break-words',
                                task.done && 'line-through text-muted-foreground',
                              )}
                            >
                              {task.text}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleDeleteTask(task.id)}
                              aria-label="Hedefi sil"
                              className="text-muted-foreground hover:text-destructive transition-colors"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Daily Technique Tip */}
                <Card className="glass-card border-amber-500/25 bg-amber-500/[0.04]">
                  <CardContent className="p-4 space-y-1.5 text-xs">
                    <p className="font-bold text-foreground flex items-center gap-1.5">
                      <Lightbulb className="h-4 w-4 text-amber-500" />
                      Günün Bilimsel Tekniği: {spark.technique}
                    </p>
                    <p className="text-muted-foreground leading-relaxed">{spark.advice}</p>
                    <p className="pt-1 text-[11px] text-primary font-medium">
                      💡 Günün İktisat Notu: {spark.econFact}
                    </p>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          {/* ═══════════ TAB 4: 7 GÜNLÜK SERİ & AKADEMİK RÜTBE YOLU ═══════════ */}
          <TabsContent value="streak" className="space-y-5">
            <Card className="glass-card border-primary/25">
              <CardHeader className="pb-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Gift className="h-5 w-5 text-amber-500" />
                      7 Günlük Düzenli Giriş & Ödül Yolu
                    </CardTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Her gün uğrayarak sandığını aç, serini koru ve 7. günde +50 XP Büyük Sandığı kap!{' '}
                      {countdown ? `Yeni gün: ${countdown}` : ''}
                    </p>
                  </div>
                  {!cycle.claimedToday ? (
                    <Button
                      onClick={() => void handleClaimCheckIn()}
                      disabled={claimingCheckIn}
                      className="rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-bold gap-1.5"
                    >
                      <Gift className="h-4 w-4" />
                      {claimingCheckIn
                        ? 'Açılıyor...'
                        : `${cycle.nextDayToClaim}. Gün Ödülünü Al (+${cycle.rewardDef.xp} XP)`}
                    </Button>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/35 bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-500">
                      <CheckCircle2 className="h-4 w-4" />
                      Bugünün ödülü alındı! Yarın {Math.min(7, (cycle.completedInCycle % 7) + 1)}. gün seni bekliyor.
                    </span>
                  )}
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5">
                  {SEVEN_DAY_REWARDS.map((item) => {
                    const done = item.day <= cycle.completedInCycle;
                    const active = !cycle.claimedToday && item.day === cycle.nextDayToClaim;
                    return (
                      <div
                        key={item.day}
                        className={cn(
                          'rounded-2xl border p-3 text-center space-y-1.5 transition-all',
                          done
                            ? 'border-emerald-500/40 bg-emerald-500/10'
                            : active
                              ? 'border-amber-500 bg-amber-500/15 ring-2 ring-amber-500/30'
                              : item.isGrand
                                ? 'border-primary/40 bg-primary/5'
                                : 'border-border/70 bg-background/50',
                        )}
                      >
                        <p className="text-xs font-bold text-foreground">{item.label}</p>
                        <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-xl bg-background/80">
                          {done ? (
                            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                          ) : item.isGrand ? (
                            <Gift className="h-5 w-5 text-amber-500" />
                          ) : active ? (
                            <Flame className="h-5 w-5 text-amber-500 animate-bounce" />
                          ) : (
                            <Sparkles className="h-4 w-4 text-muted-foreground" />
                          )}
                        </div>
                        <p className="font-mono text-sm font-extrabold text-primary">
                          +{item.xp} XP
                        </p>
                        <p className="text-[10px] text-muted-foreground leading-tight">
                          {item.perk}
                        </p>
                      </div>
                    );
                  })}
                </div>

                {cycle.hasStreakShield && (
                  <div className="flex items-center gap-2.5 rounded-xl border border-emerald-500/35 bg-emerald-500/10 p-3 text-xs text-emerald-700 dark:text-emerald-300">
                    <Shield className="h-4 w-4 shrink-0" />
                    <span>
                      <strong>Seri Kalkanı Aktif!</strong> 3 gün üst üste giriş yaparak akademik istikrarını kanıtladın.
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Academic Rank Ladder */}
            <Card className="glass-card">
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Award className="h-5 w-5 text-primary" />
                    Akademik Rütbe Merdiveni
                  </CardTitle>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => navigate('/profile')}
                    className="rounded-xl text-xs gap-1.5"
                  >
                    Rozetlerimi Gör
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold">
                      Mevcut Rütben: {rank.current.emoji} {rank.current.title} ({totalXp} XP)
                    </span>
                    {rank.next && (
                      <span className="text-muted-foreground font-mono">
                        Sonraki: {rank.next.title} ({rank.pointsToNext} XP kaldı)
                      </span>
                    )}
                  </div>
                  <Progress value={rank.progress} className="h-2" />
                </div>

                <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 pt-1">
                  {ACADEMIC_RANKS.map((r) => {
                    const unlocked = totalXp >= r.minPoints;
                    const isCurrent = rank.current.id === r.id;
                    return (
                      <div
                        key={r.id}
                        className={cn(
                          'flex items-center gap-3 rounded-xl border p-3 transition-all',
                          isCurrent
                            ? 'border-primary bg-primary/10 shadow-sm'
                            : unlocked
                              ? 'border-emerald-500/35 bg-emerald-500/[0.06]'
                              : 'border-border/60 bg-background/40 opacity-70',
                        )}
                      >
                        <span className="text-2xl">{r.emoji}</span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-1">
                            <p className="text-xs sm:text-sm font-bold text-foreground truncate">
                              {r.title}
                            </p>
                            <span className="font-mono text-[10px] font-semibold text-muted-foreground shrink-0">
                              {r.minPoints} XP
                            </span>
                          </div>
                          <p className="text-[11px] text-muted-foreground truncate">{r.tagline}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
};

export default StudyArena;
