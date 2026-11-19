import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Check,
  CheckCircle2,
  Flame,
  Gift,
  Lightbulb,
  Puzzle,
  Shield,
  Sparkles,
  Timer,
  Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { usePoints } from '@/hooks/usePoints';
import { useFocusTimer } from '@/contexts/FocusTimerContext';
import { useSiteConfig, getSeasonalTheme } from '@/contexts/SiteConfigContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { todayKey } from '@/lib/gamification';
import {
  getDailyStudySpark,
  getRankForPoints,
  SEVEN_DAY_REWARDS,
} from '@/lib/studyArenaData';
import {
  ARENA_UPDATED_EVENT,
  claimDailyCheckIn,
  getCheckInCycleInfo,
  getTimeUntilMidnightIstanbul,
  loadArenaState,
  playVictoryFanfare,
  type StudyArenaState,
} from '@/lib/studyArenaState';
import { cn } from '@/lib/utils';

const formatMMSS = (sec: number) => {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

const DailyHabitHub = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { points } = usePoints(3);
  const { isRunning, hasStarted, secondsLeft } = useFocusTimer();
  const { config } = useSiteConfig();
  const seasonalTheme = getSeasonalTheme(config.theme.seasonalMode || 'default');
  const isNovember10 = seasonalTheme?.id === 'november10';

  const [arena, setArena] = useState<StudyArenaState>(() => loadArenaState(user));
  const [claiming, setClaiming] = useState(false);
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
    const t = window.setInterval(() => {
      setCountdown(getTimeUntilMidnightIstanbul());
    }, 60_000);
    return () => window.clearInterval(t);
  }, []);

  if (!user) return null;

  const today = todayKey();
  const totalXp = points?.points ?? 0;
  const rank = getRankForPoints(totalXp);
  const cycle = getCheckInCycleInfo(arena);
  const displayStreak = Math.max(points?.current_streak ?? 0, cycle.activeStreak);
  const spark = getDailyStudySpark(today);

  const blitzDoneToday = arena.dailyBlitzDate === today;
  const matchDoneToday = arena.dailyMatchDate === today;
  const focusDoneToday = arena.dailyFocusRewardDate === today;

  const handleClaimCheckIn = async () => {
    if (claiming || cycle.claimedToday) return;
    setClaiming(true);
    try {
      const res = await claimDailyCheckIn(user);
      if (res.ok) {
        playVictoryFanfare(arena.soundEnabled);
        toast.success(
          res.dayInCycle === 7
            ? `7. Gün Büyük Sandık Açıldı! +${res.xp} XP 🎉`
            : `${res.dayInCycle}. Gün Seri Ödülü Alındı! +${res.xp} XP 🔥`,
          {
            description:
              res.totalPoints != null
                ? `Toplam puanın ${res.totalPoints} XP oldu. Yarın gelerek serini büyüt!`
                : 'Günlük serin kaydedildi. Yarın da uğramayı unutma!',
            duration: 6000,
          },
        );
        refreshArena();
      }
    } finally {
      setClaiming(false);
    }
  };

  return (
    <Card
      className={cn(
        'relative overflow-hidden border shadow-md transition-all',
        isNovember10
          ? 'border-border/80 bg-card/95'
          : 'border-primary/30 bg-gradient-to-br from-card via-card to-primary/[0.08] dark:from-[#0c162b] dark:via-[#0a1324] dark:to-[#0d2247]/90',
      )}
    >
      {/* Subtle Ambient Glow */}
      {!isNovember10 && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-cyan-500/10 blur-3xl"
        />
      )}

      <CardContent className="relative z-10 p-4 sm:p-6 space-y-5">
        {/* Top Row: Rank, Streak & Daily Chest CTA */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold shadow-xs',
                  isNovember10
                    ? 'bg-muted text-foreground border border-border'
                    : 'bg-gradient-to-r from-[#003791] via-[#0070d1] to-[#00a8ff] text-white',
                )}
              >
                <span>{rank.current.emoji}</span>
                <span>{rank.current.title}</span>
              </span>

              <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/35 bg-amber-500/10 px-2.5 py-1 text-xs font-bold text-amber-600 dark:text-amber-400">
                <Flame className="h-3.5 w-3.5 fill-current" />
                <span>{displayStreak} Günlük Seri</span>
              </span>

              {cycle.hasStreakShield && (
                <span
                  title="3+ gün üst üste ödül toplayarak Seri Kalkanı kazandın!"
                  className="inline-flex items-center gap-1 rounded-full border border-emerald-500/35 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400"
                >
                  <Shield className="h-3 w-3" />
                  Seri Kalkanı
                </span>
              )}

              {countdown && (
                <span className="text-[11px] text-muted-foreground">
                  Yeni güne {countdown}
                </span>
              )}
            </div>

            <div className="max-w-md space-y-1">
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span className="font-medium text-foreground/85">{rank.current.tagline}</span>
                {rank.next ? (
                  <span className="font-mono">
                    {rank.next.emoji} {rank.next.title}: {rank.pointsToNext} XP
                  </span>
                ) : (
                  <span className="font-mono text-primary font-semibold">Zirve Rütbe!</span>
                )}
              </div>
              <Progress value={rank.progress} className="h-1.5" />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {!cycle.claimedToday ? (
              <Button
                onClick={() => void handleClaimCheckIn()}
                disabled={claiming}
                className={cn(
                  'h-10 rounded-xl font-bold text-xs sm:text-sm gap-2 shadow-lg transition-all active:scale-95',
                  isNovember10
                    ? 'bg-foreground text-background hover:opacity-90'
                    : 'bg-gradient-to-r from-amber-500 via-orange-500 to-amber-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 shadow-amber-500/25',
                )}
              >
                <Gift className="h-4 w-4" />
                <span>
                  {claiming
                    ? 'Açılıyor...'
                    : `${cycle.nextDayToClaim}. Gün Ödülünü Aç (+${cycle.rewardDef.xp} XP)`}
                </span>
              </Button>
            ) : (
              <span className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-emerald-500/35 bg-emerald-500/10 px-3.5 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-4 w-4" />
                <span>Bugünkü Sandık Alındı</span>
              </span>
            )}

            <Button
              variant="outline"
              onClick={() => navigate('/arena')}
              className="h-10 rounded-xl border-primary/30 bg-background/70 hover:bg-primary/10 hover:text-primary font-semibold text-xs sm:text-sm gap-1.5"
            >
              <Sparkles className="h-4 w-4 text-primary" />
              <span>Çalışma Arenası</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* 7-Day Visual Streak Strip */}
        <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
          {SEVEN_DAY_REWARDS.map((item) => {
            const isCompleted = item.day <= cycle.completedInCycle;
            const isCurrentTarget = !cycle.claimedToday && item.day === cycle.nextDayToClaim;
            return (
              <button
                key={item.day}
                type="button"
                onClick={() => {
                  if (isCurrentTarget) {
                    void handleClaimCheckIn();
                  } else {
                    navigate('/arena?tab=streak');
                  }
                }}
                title={`${item.label} • +${item.xp} XP (${item.perk})`}
                className={cn(
                  'relative flex flex-col items-center justify-center rounded-xl border px-1 py-2 text-center transition-all',
                  isCompleted
                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                    : isCurrentTarget
                      ? 'border-amber-500/70 bg-amber-500/15 text-foreground ring-2 ring-amber-500/30 hover:scale-[1.03] cursor-pointer'
                      : item.isGrand
                        ? 'border-primary/35 bg-primary/5 text-foreground/85 hover:border-primary/60'
                        : 'border-border/60 bg-background/50 text-muted-foreground hover:border-border',
                )}
              >
                <span className="text-[9.5px] sm:text-[10px] font-semibold leading-none">
                  {item.day}.G
                </span>
                <div className="my-1 flex h-6 w-6 items-center justify-center rounded-full">
                  {isCompleted ? (
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white">
                      <Check className="h-3 w-3 stroke-[3]" />
                    </span>
                  ) : item.isGrand ? (
                    <Gift className="h-4 w-4 text-amber-500" />
                  ) : isCurrentTarget ? (
                    <Flame className="h-4 w-4 text-amber-500 animate-bounce" />
                  ) : (
                    <span className="h-2 w-2 rounded-full bg-muted-foreground/35" />
                  )}
                </div>
                <span className="font-mono text-[10px] font-bold leading-none">
                  +{item.xp}
                </span>
              </button>
            );
          })}
        </div>

        {/* 3 Fun Daily Study Action Tiles */}
        <div className="grid gap-3 sm:grid-cols-3">
          {/* Tile 1: Daily 5-Question Blitz */}
          <button
            type="button"
            onClick={() => navigate('/arena?tab=blitz')}
            className="group flex items-center gap-3 rounded-xl border border-border/75 bg-background/70 p-3.5 text-left transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md"
          >
            <div
              className={cn(
                'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-transform group-hover:scale-105',
                blitzDoneToday
                  ? 'bg-emerald-500/15 text-emerald-500'
                  : 'bg-primary/15 text-primary',
              )}
            >
              <Zap className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-1">
                <p className="text-xs sm:text-sm font-bold text-foreground truncate">
                  Günün Düellosu
                </p>
                <span
                  className={cn(
                    'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold',
                    blitzDoneToday
                      ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                      : 'bg-primary/15 text-primary',
                  )}
                >
                  {blitzDoneToday ? `${arena.dailyBlitzScore}/${arena.dailyBlitzTotal}` : '+40 XP'}
                </span>
              </div>
              <p className="mt-0.5 text-[11px] text-muted-foreground truncate">
                {blitzDoneToday
                  ? 'Tamamlandı • Sınırsız pratik yap'
                  : '5 hızlı soru • Kombo & 50/50 joker'}
              </p>
            </div>
          </button>

          {/* Tile 2: Concept Match Arena */}
          <button
            type="button"
            onClick={() => navigate('/arena?tab=match')}
            className="group flex items-center gap-3 rounded-xl border border-border/75 bg-background/70 p-3.5 text-left transition-all hover:-translate-y-0.5 hover:border-cyan-500/50 hover:shadow-md"
          >
            <div
              className={cn(
                'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-transform group-hover:scale-105',
                matchDoneToday
                  ? 'bg-emerald-500/15 text-emerald-500'
                  : 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400',
              )}
            >
              <Puzzle className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-1">
                <p className="text-xs sm:text-sm font-bold text-foreground truncate">
                  Kavram Eşleştirme
                </p>
                <span
                  className={cn(
                    'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold',
                    matchDoneToday
                      ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                      : 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400',
                  )}
                >
                  {arena.bestMatchSeconds ? `${arena.bestMatchSeconds} sn` : '+25 XP'}
                </span>
              </div>
              <p className="mt-0.5 text-[11px] text-muted-foreground truncate">
                {matchDoneToday
                  ? 'Rekorunu kırmak için tekrar oyna'
                  : 'İktisatçı & kuramları hızla eşleştir'}
              </p>
            </div>
          </button>

          {/* Tile 3: Deep Focus Studio */}
          <button
            type="button"
            onClick={() => navigate('/arena?tab=focus')}
            className="group flex items-center gap-3 rounded-xl border border-border/75 bg-background/70 p-3.5 text-left transition-all hover:-translate-y-0.5 hover:border-indigo-500/50 hover:shadow-md"
          >
            <div
              className={cn(
                'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-transform group-hover:scale-105',
                isRunning
                  ? 'bg-indigo-500 text-white animate-pulse'
                  : focusDoneToday
                    ? 'bg-emerald-500/15 text-emerald-500'
                    : 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400',
              )}
            >
              <Timer className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-1">
                <p className="text-xs sm:text-sm font-bold text-foreground truncate">
                  Derin Odak Stüdyosu
                </p>
                <span
                  className={cn(
                    'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold font-mono',
                    hasStarted
                      ? 'bg-indigo-500 text-white'
                      : focusDoneToday
                        ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                        : 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400',
                  )}
                >
                  {hasStarted
                    ? formatMMSS(secondsLeft)
                    : arena.focusMinutesToday > 0
                      ? `${arena.focusMinutesToday} dk`
                      : '+30 XP'}
                </span>
              </div>
              <p className="mt-0.5 text-[11px] text-muted-foreground truncate">
                {isRunning
                  ? 'Sayaç aktif • Arka planda çalışıyor'
                  : 'Pomodoro + Yağmur & Kütüphane sesi'}
              </p>
            </div>
          </button>
        </div>

        {/* Daily Study Spark Footer */}
        <div className="flex items-start gap-2.5 rounded-xl border border-border/60 bg-background/60 px-3.5 py-2.5 text-xs">
          <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          <p className="text-muted-foreground leading-relaxed">
            <strong className="text-foreground">{spark.technique}:</strong> {spark.advice}
          </p>
        </div>
      </CardContent>
    </Card>
  );
};

export default DailyHabitHub;
