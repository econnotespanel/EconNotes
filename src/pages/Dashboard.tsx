import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  BarChart2,
  BarChart3,
  Bookmark,
  BookOpen,
  Cake,
  ChevronRight,
  ClipboardList,
  Clock,
  Compass,
  FileText,
  Flame,
  Gift,
  GraduationCap,
  Megaphone,
  Play,
  Sparkles,
  Star,
  TrendingUp,
  Trophy,
  X,
} from 'lucide-react';
import Layout from '@/components/Layout';
import DashboardLeaderboardCard from '@/components/DashboardLeaderboardCard';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/contexts/AuthContext';
import { useOnboarding } from '@/contexts/OnboardingContext';
import { getSeasonalTheme, useSiteConfig } from '@/contexts/SiteConfigContext';
import { useDownloadQuota } from '@/hooks/useDownloadQuota';
import { usePoints } from '@/hooks/usePoints';
import { supabase } from '@/integrations/supabase/client';
import { getBirthdayStatus } from '@/lib/birthdayPerk';
import {
  getDailyRenewalInfo,
  getTriviaUnlimitedRemainingLabel,
  invokeDailyTrivia,
  type TriviaAttemptSummary,
  type TriviaStatusResponse,
} from '@/lib/dailyTrivia';
import {
  computeWeeklyStudySeries,
  detectNoteFileBadge,
  formatTurkishShortDate,
  resolveAcademicCalendarDisplay,
  resolveContinueStudyingItem,
  type PointEventInput,
  type SimpleTimestampRow,
} from '@/lib/dashboardMetrics';
import { getMondayWheelState } from '@/lib/mondayWheel';
import { loadUserNotebooks } from '@/lib/neural/notebookStore';
import { NOTE_SELECT } from '@/lib/noteColumns';
import { ARENA_UPDATED_EVENT, getCheckInCycleInfo, loadArenaState } from '@/lib/studyArenaState';
import { cn } from '@/lib/utils';
import type { StudyMaterial, StudyProgressRow } from '@/types/study';

interface DashboardNoteRow {
  id: string;
  title: string;
  course?: string | null;
  semester?: string | null;
  file_name?: string | null;
  file_type?: string | null;
  uploader_name?: string | null;
  created_at: string;
}

const BannerContent = ({ content }: { content: string }) => {
  const [expanded, setExpanded] = useState(false);
  const isLong = content.length > 120;
  return (
    <div className="min-w-0">
      <p
        className={cn(
          'text-xs sm:text-sm leading-relaxed text-muted-foreground',
          !expanded && isLong && 'line-clamp-2',
        )}
      >
        {content}
      </p>
      {isLong && (
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          aria-expanded={expanded}
          className="mt-1 text-xs font-semibold text-primary hover:underline"
        >
          {expanded ? 'Daha az göster' : 'Devamını oku'}
        </button>
      )}
    </div>
  );
};

/** Subtle decorative vector sparkline wave tucked safely in the bottom-right corner of KPI stat cards. */
const StatSparkline = ({
  id,
  stroke,
  fillTop,
  path,
  area,
}: {
  id: string;
  stroke: string;
  fillTop: string;
  path: string;
  area: string;
}) => (
  <svg
    viewBox="0 0 120 36"
    fill="none"
    aria-hidden="true"
    className="pointer-events-none absolute bottom-0 right-0 z-0 h-7 w-16 opacity-35 sm:h-9 sm:w-24 sm:opacity-55 dark:opacity-30"
    preserveAspectRatio="none"
  >
    <defs>
      <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={fillTop} stopOpacity="0.32" />
        <stop offset="100%" stopColor={fillTop} stopOpacity="0.02" />
      </linearGradient>
    </defs>
    <path d={area} fill={`url(#${id})`} />
    <path d={path} stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const FILE_BADGE_CLASSES: Record<'blue' | 'orange' | 'indigo' | 'teal' | 'slate', string> = {
  blue: 'bg-[#2563eb] text-white shadow-[0_6px_14px_-4px_rgba(37,99,235,0.45)]',
  orange: 'bg-[#ea580c] text-white shadow-[0_6px_14px_-4px_rgba(234,88,12,0.45)]',
  indigo: 'bg-[#4f46e5] text-white shadow-[0_6px_14px_-4px_rgba(79,70,229,0.45)]',
  teal: 'bg-[#0d9488] text-white shadow-[0_6px_14px_-4px_rgba(13,148,136,0.45)]',
  slate: 'bg-slate-700 text-white shadow-[0_6px_14px_-4px_rgba(51,65,85,0.4)]',
};

const Dashboard = () => {
  const { profile, user } = useAuth();
  const {
    state: onboardingState,
    isTourOpen,
    totalSteps,
    resumeTour,
    skipTour,
  } = useOnboarding();
  const navigate = useNavigate();
  const { quota } = useDownloadQuota();
  const { points, leaderboard, loading: pointsLoading } = usePoints(100);
  const { config } = useSiteConfig();
  const seasonalTheme = getSeasonalTheme(config.theme.seasonalMode || 'default');
  const isNovember10 = seasonalTheme?.id === 'november10';

  const [loading, setLoading] = useState(true);
  const [totalNotesCount, setTotalNotesCount] = useState(0);
  const [recentNotes, setRecentNotes] = useState<DashboardNoteRow[]>([]);
  const [notesAddedLast7Days, setNotesAddedLast7Days] = useState(0);
  const [studyMaterials, setStudyMaterials] = useState<StudyMaterial[]>([]);
  const [studyProgress, setStudyProgress] = useState<StudyProgressRow[]>([]);
  const [kpssMaterialsCount, setKpssMaterialsCount] = useState(0);
  const [kpssMaterialsRecent7, setKpssMaterialsRecent7] = useState(0);
  const [downloadedNotesCount, setDownloadedNotesCount] = useState(0);
  const [pointEvents, setPointEvents] = useState<PointEventInput[]>([]);
  const [noteViews, setNoteViews] = useState<SimpleTimestampRow[]>([]);
  const [academicWeek, setAcademicWeek] = useState<{
    week: number | null;
    label: string | null;
    semester: string | null;
  }>({ week: null, label: null, semester: null });
  const [triviaAttempt, setTriviaAttempt] = useState<TriviaAttemptSummary | null>(null);
  const [banners, setBanners] = useState<any[]>([]);
  const [dismissedBanners, setDismissedBanners] = useState<Set<string>>(new Set());
  const [showWelcome, setShowWelcome] = useState(false);
  const [sessionWarning, setSessionWarning] = useState(false);
  const [weekPeriod, setWeekPeriod] = useState<'current' | 'previous'>('current');
  const [selectedDayIndex, setSelectedDayIndex] = useState<number | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [arenaTick, setArenaTick] = useState(0);
  const [, setBirthdayTick] = useState(0);

  const birthdayStatus = getBirthdayStatus(user, profile);
  const isBirthdayToday = birthdayStatus.isBirthdayToday;
  const displayName =
    profile?.full_name?.trim() ||
    String(user?.user_metadata?.full_name || user?.user_metadata?.name || '').trim() ||
    user?.email?.split('@')[0] ||
    'Öğrenci';
  const firstName = displayName.split(' ')[0] || 'Öğrenci';

  useEffect(() => {
    const onBdayChange = () => setBirthdayTick((t) => t + 1);
    const onArenaChange = () => setArenaTick((t) => t + 1);
    window.addEventListener('econnotes:birthdate-updated', onBdayChange);
    window.addEventListener(ARENA_UPDATED_EVENT, onArenaChange);
    return () => {
      window.removeEventListener('econnotes:birthdate-updated', onBdayChange);
      window.removeEventListener(ARENA_UPDATED_EVENT, onArenaChange);
    };
  }, []);

  // Keep daily trivia renewal countdown ticking cleanly
  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const fourteenDaysAgoIso = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString();
    const sevenDaysAgoMs = Date.now() - 7 * 24 * 60 * 60 * 1000;

    const fetchDashboardData = async () => {
      try {
        const queries: PromiseLike<any>[] = [
          supabase
            .from('notes')
            .select(NOTE_SELECT, { count: 'exact' })
            .order('created_at', { ascending: false })
            .limit(40),
          supabase.from('public_system_status').select('*').limit(1).maybeSingle(),
          supabase
            .from('banners')
            .select('*')
            .eq('is_active', true)
            .order('created_at', { ascending: false }),
        ];

        if (user) {
          queries.push(
            supabase
              .from('study_materials')
              .select('id, user_id, source_type, source_note_id, material_type, title, course, created_at')
              .eq('user_id', user.id)
              .order('created_at', { ascending: false })
              .limit(100),
            supabase
              .from('study_progress')
              .select('id, user_id, material_id, score, total_questions, attempts, completed_at')
              .eq('user_id', user.id)
              .order('completed_at', { ascending: false })
              .limit(60),
            supabase
              .from('kpss_materials')
              .select('id, created_at', { count: 'exact' })
              .eq('user_id', user.id),
            supabase
              .from('point_events')
              .select('amount, reason, created_at')
              .eq('user_id', user.id)
              .gte('created_at', fourteenDaysAgoIso)
              .order('created_at', { ascending: false })
              .limit(400),
            supabase
              .from('note_views')
              .select('note_id, created_at')
              .eq('user_id', user.id)
              .gte('created_at', fourteenDaysAgoIso)
              .order('created_at', { ascending: false })
              .limit(200),
            supabase
              .from('note_downloads')
              .select('note_id, created_at')
              .eq('user_id', user.id)
              .limit(300),
          );
        }

        const results = await Promise.allSettled(queries);
        if (cancelled) return;

        const notesRes = results[0]?.status === 'fulfilled' ? results[0].value : null;
        const statusRes = results[1]?.status === 'fulfilled' ? results[1].value : null;
        const bannersRes = results[2]?.status === 'fulfilled' ? results[2].value : null;

        const notesList: DashboardNoteRow[] = Array.isArray(notesRes?.data) ? notesRes.data : [];
        setTotalNotesCount(typeof notesRes?.count === 'number' ? notesRes.count : notesList.length);
        setRecentNotes(notesList);
        setNotesAddedLast7Days(
          notesList.filter((n) => new Date(n.created_at).getTime() >= sevenDaysAgoMs).length,
        );

        setBanners(Array.isArray(bannersRes?.data) ? bannersRes.data : []);
        if (statusRes?.data) {
          setAcademicWeek({
            week: statusRes.data.academic_week ?? null,
            label: statusRes.data.academic_week_label ?? null,
            semester: statusRes.data.academic_semester ?? null,
          });
        }

        if (user) {
          const matRes = results[3]?.status === 'fulfilled' ? results[3].value : null;
          const progRes = results[4]?.status === 'fulfilled' ? results[4].value : null;
          const kpssRes = results[5]?.status === 'fulfilled' ? results[5].value : null;
          const evRes = results[6]?.status === 'fulfilled' ? results[6].value : null;
          const viewRes = results[7]?.status === 'fulfilled' ? results[7].value : null;
          const dlRes = results[8]?.status === 'fulfilled' ? results[8].value : null;

          setStudyMaterials(
            Array.isArray(matRes?.data) ? (matRes.data as unknown as StudyMaterial[]) : [],
          );
          setStudyProgress(
            Array.isArray(progRes?.data) ? (progRes.data as unknown as StudyProgressRow[]) : [],
          );
          const kpssRows: Array<{ id: string; created_at: string }> = Array.isArray(kpssRes?.data)
            ? kpssRes.data
            : [];
          setKpssMaterialsCount(typeof kpssRes?.count === 'number' ? kpssRes.count : kpssRows.length);
          setKpssMaterialsRecent7(
            kpssRows.filter((k) => new Date(k.created_at).getTime() >= sevenDaysAgoMs).length,
          );
          setPointEvents(Array.isArray(evRes?.data) ? (evRes.data as PointEventInput[]) : []);
          setNoteViews(Array.isArray(viewRes?.data) ? (viewRes.data as SimpleTimestampRow[]) : []);

          const dlRows: SimpleTimestampRow[] = Array.isArray(dlRes?.data) ? dlRes.data : [];
          const uniqueDl = new Set(dlRows.map((d) => d.note_id).filter(Boolean));
          setDownloadedNotesCount(uniqueDl.size);

          // Fetch today's trivia status non-blockingly
          void invokeDailyTrivia<TriviaStatusResponse>({ action: 'status' })
            .then((res) => {
              if (!cancelled && res.data) {
                setTriviaAttempt(res.data.attempt ?? null);
              }
            })
            .catch(() => {});
        }
      } catch (err) {
        console.error('Dashboard verileri yüklenirken hata:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    if (user) {
      const welcomeKey = `econotes_welcomed_${user.id}`;
      if (!localStorage.getItem(welcomeKey)) {
        setShowWelcome(true);
        localStorage.setItem(welcomeKey, 'true');
      }
    }

    void fetchDashboardData();

    const onGamificationUpdated = () => {
      if (!user || cancelled) return;
      void supabase
        .from('point_events')
        .select('amount, reason, created_at')
        .eq('user_id', user.id)
        .gte('created_at', fourteenDaysAgoIso)
        .order('created_at', { ascending: false })
        .limit(400)
        .then(({ data }) => {
          if (!cancelled && Array.isArray(data)) {
            setPointEvents(data as PointEventInput[]);
          }
        });
      void invokeDailyTrivia<TriviaStatusResponse>({ action: 'status' })
        .then((res) => {
          if (!cancelled && res.data) {
            setTriviaAttempt(res.data.attempt ?? null);
          }
        })
        .catch(() => {});
    };

    window.addEventListener('econnotes:points-updated', onGamificationUpdated);
    window.addEventListener('econnotes:trivia-updated', onGamificationUpdated);
    window.addEventListener('econnotes:wheel-updated', onGamificationUpdated);

    const sessionStart = Date.now();
    const interval = window.setInterval(() => {
      if (Date.now() - sessionStart > 3600000) {
        setSessionWarning(true);
        window.clearInterval(interval);
      }
    }, 60000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener('econnotes:points-updated', onGamificationUpdated);
      window.removeEventListener('econnotes:trivia-updated', onGamificationUpdated);
      window.removeEventListener('econnotes:wheel-updated', onGamificationUpdated);
    };
  }, [user]);

  const arenaState = useMemo(() => {
    void arenaTick;
    return loadArenaState(user);
  }, [user, arenaTick]);

  const arenaCycle = useMemo(() => getCheckInCycleInfo(arenaState), [arenaState]);
  const notebooks = useMemo(() => (user ? loadUserNotebooks(user.id) : []), [user]);

  const nowDate = useMemo(() => new Date(nowTick), [nowTick]);
  const academicDisplay = useMemo(
    () => resolveAcademicCalendarDisplay(academicWeek, nowDate),
    [academicWeek, nowDate],
  );
  const renewal = useMemo(() => getDailyRenewalInfo(nowDate), [nowDate]);

  const displayStreak = Math.max(points?.current_streak ?? 0, arenaCycle.activeStreak);
  const totalXp = points?.points ?? 0;

  // Recent XP gained over the last 7 days
  const recentXpGain = useMemo(() => {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return pointEvents
      .filter((e) => new Date(e.created_at).getTime() >= cutoff && e.amount > 0)
      .reduce((sum, e) => sum + e.amount, 0);
  }, [pointEvents]);

  // Saved materials = Study Studio materials + KPSS materials + unique downloaded notes
  const savedMaterialsTotal = useMemo(
    () => studyMaterials.length + kpssMaterialsCount + downloadedNotesCount,
    [studyMaterials.length, kpssMaterialsCount, downloadedNotesCount],
  );

  const savedMaterialsDelta7 = useMemo(() => {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const recentStudio = studyMaterials.filter(
      (m) => new Date(m.created_at).getTime() >= cutoff,
    ).length;
    return recentStudio + kpssMaterialsRecent7;
  }, [studyMaterials, kpssMaterialsRecent7]);

  const continueItem = useMemo(
    () =>
      resolveContinueStudyingItem({
        progress: studyProgress,
        materials: studyMaterials,
        notebooks,
        recentNotes,
        lastViewedNoteId: noteViews[0]?.note_id ?? null,
      }),
    [studyProgress, studyMaterials, notebooks, recentNotes, noteViews],
  );

  const weeklySeries = useMemo(
    () =>
      computeWeeklyStudySeries({
        pointEvents,
        studyProgress,
        studyMaterials,
        noteViews,
        focusMinutesToday: arenaState.focusMinutesToday,
        weekOffset: weekPeriod === 'current' ? 0 : -1,
        now: nowDate,
      }),
    [
      pointEvents,
      studyProgress,
      studyMaterials,
      noteViews,
      arenaState.focusMinutesToday,
      weekPeriod,
      nowDate,
    ],
  );

  const highlightedDayIndex = useMemo(() => {
    if (selectedDayIndex !== null && selectedDayIndex >= 0 && selectedDayIndex < 7) {
      return selectedDayIndex;
    }
    if (weeklySeries.peakIndex >= 0) return weeklySeries.peakIndex;
    const todayIdx = weeklySeries.days.findIndex((d) => d.isToday);
    return todayIdx >= 0 ? todayIdx : 0;
  }, [selectedDayIndex, weeklySeries]);

  const statCards = [
    {
      label: 'Toplam Not',
      value: totalNotesCount.toLocaleString('tr-TR'),
      delta: notesAddedLast7Days > 0 ? `+${notesAddedLast7Days}` : null,
      icon: BookOpen,
      iconTile: isNovember10
        ? 'bg-muted text-foreground'
        : 'bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400',
      sparkStroke: isNovember10 ? '#52525b' : '#60a5fa',
      sparkFill: isNovember10 ? '#a1a1aa' : '#93c5fd',
      sparkPath: 'M4 28 C22 25, 36 16, 56 20 C76 24, 92 10, 116 14',
      sparkArea: 'M4 36 L4 28 C22 25, 36 16, 56 20 C76 24, 92 10, 116 14 L116 36 Z',
      onClick: () => navigate('/notes'),
    },
    {
      label: 'Toplam XP',
      value: totalXp.toLocaleString('tr-TR'),
      delta: recentXpGain > 0 ? `+${recentXpGain}` : null,
      icon: Star,
      iconTile: isNovember10
        ? 'bg-muted text-foreground'
        : 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400',
      sparkStroke: isNovember10 ? '#52525b' : '#818cf8',
      sparkFill: isNovember10 ? '#a1a1aa' : '#c7d2fe',
      sparkPath: 'M4 30 C24 27, 42 22, 62 17 C82 12, 98 18, 116 8',
      sparkArea: 'M4 36 L4 30 C24 27, 42 22, 62 17 C82 12, 98 18, 116 8 L116 36 Z',
      onClick: () => navigate('/points'),
    },
    {
      label: 'Çalışma Serisi',
      value: `${displayStreak} gün`,
      delta: displayStreak > 0 ? (arenaCycle.claimedToday ? '+1' : `Rekor ${Math.max(displayStreak, points?.longest_streak ?? 0)}`) : null,
      icon: Flame,
      iconTile: isNovember10
        ? 'bg-muted text-foreground'
        : 'bg-orange-50 text-orange-500 dark:bg-orange-500/15 dark:text-orange-400',
      sparkStroke: isNovember10 ? '#52525b' : '#fb923c',
      sparkFill: isNovember10 ? '#a1a1aa' : '#fed7aa',
      sparkPath: 'M4 29 C26 24, 44 26, 64 16 C84 10, 98 20, 116 12',
      sparkArea: 'M4 36 L4 29 C26 24, 44 26, 64 16 C84 10, 98 20, 116 12 L116 36 Z',
      onClick: () => navigate('/points'),
    },
    {
      label: 'Kaydedilen Materyal',
      value: savedMaterialsTotal.toLocaleString('tr-TR'),
      delta: savedMaterialsDelta7 > 0 ? `+${savedMaterialsDelta7}` : null,
      icon: Bookmark,
      iconTile: isNovember10
        ? 'bg-muted text-foreground'
        : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400',
      sparkStroke: isNovember10 ? '#52525b' : '#34d399',
      sparkFill: isNovember10 ? '#a1a1aa' : '#a7f3d0',
      sparkPath: 'M4 28 C26 26, 46 18, 66 22 C86 24, 100 12, 116 10',
      sparkArea: 'M4 36 L4 28 C26 26, 46 18, 66 22 C86 24, 100 12, 116 10 L116 36 Z',
      onClick: () => navigate('/study'),
    },
  ];

  const activeBanners = banners.filter((b) => !dismissedBanners.has(b.id));
  const hasActiveUnlimitedPerk = Boolean(
    quota &&
      !quota.is_admin &&
      (quota.is_birthday_unlimited || quota.is_wheel_unlimited || quota.is_trivia_unlimited),
  );
  const topNotes = recentNotes.slice(0, 4);
  const barScaleMax = Math.max(weeklySeries.peakMinutes, 30);

  return (
    <Layout>
      <div className="space-y-5 opacity-100 visible text-foreground">
        {/* Conditional Admin Announcement Banners (hidden when none active) */}
        {activeBanners.map((banner) => (
          <Card
            key={banner.id}
            role="status"
            className="relative overflow-hidden rounded-[20px] border-primary/20 bg-card shadow-sm"
          >
            <CardContent className="flex items-start gap-3 p-4 sm:items-center sm:px-5">
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary sm:mt-0">
                <Megaphone className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="mb-0.5 break-words text-sm font-semibold text-foreground">
                  {banner.title}
                </p>
                <BannerContent content={banner.content} />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Duyuruyu kapat"
                className="-mr-1 h-8 w-8 shrink-0 rounded-full text-muted-foreground hover:text-foreground"
                onClick={() => setDismissedBanners((prev) => new Set(prev).add(banner.id))}
              >
                <X className="h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        ))}

        {/* Paused Guided Tour Resume Strip (shown only if user closed tour mid-way) */}
        {!isTourOpen && onboardingState.status === 'in_progress' && (
          <div
            role="status"
            data-testid="resume-tour-banner"
            className="flex flex-col gap-3 rounded-[20px] border border-blue-200/90 bg-blue-50/75 px-4 py-3 text-sm shadow-sm dark:border-blue-500/30 dark:bg-blue-500/10 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#174ec4] text-white">
                <Compass className="h-4 w-4" />
              </span>
              <p className="min-w-0 text-xs font-medium text-foreground sm:text-sm">
                Platform turu{' '}
                <strong className="font-bold">
                  Adım {onboardingState.currentStep + 1}/{totalSteps}
                </strong>{' '}
                aşamasında kaydedildi. İstediğin zaman kaldığın yerden devam edebilirsin.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                type="button"
                size="sm"
                onClick={resumeTour}
                className="h-9 rounded-full bg-gradient-to-r from-[#0b2a6e] via-[#174ec4] to-[#2563eb] px-4 text-xs font-semibold text-white hover:brightness-105"
              >
                Tura Devam Et
              </Button>
              <button
                type="button"
                aria-label="Hatırlatmayı kapat"
                onClick={skipTour}
                className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* Conditional First-Login Welcome & Eye-Rest Notices */}
        {showWelcome && !isTourOpen && onboardingState.status !== 'in_progress' && (
          <div className="flex items-center justify-between gap-3 rounded-[20px] border border-primary/25 bg-primary/5 px-4 py-3 text-sm">
            <div className="flex items-center gap-3 min-w-0">
              <Sparkles className="h-4 w-4 shrink-0 text-primary" />
              <p className="truncate font-medium text-foreground">
                EconNotes&apos;a hoş geldin! Ders notlarını keşfedip Çalışma Stüdyosu ile hemen başlayabilirsin.
              </p>
            </div>
            <button
              type="button"
              aria-label="Kapat"
              onClick={() => setShowWelcome(false)}
              className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {sessionWarning && (
          <div className="flex items-center justify-between gap-3 rounded-[20px] border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm">
            <div className="flex items-center gap-3 min-w-0">
              <Clock className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <p className="truncate font-medium text-foreground">
                1 saattir aktifsin. Kısa bir mola verip gözlerini dinlendirmeyi unutma.
              </p>
            </div>
            <button
              type="button"
              aria-label="Kapat"
              onClick={() => setSessionWarning(false)}
              className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Conditional Compact Active Unlimited Access Reward Strip */}
        {hasActiveUnlimitedPerk && quota && (
          <div className="flex flex-col gap-3 rounded-[20px] border border-blue-200/90 dark:border-blue-500/30 bg-card px-4 py-3.5 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#0b2763] to-[#1d63ed] text-white">
                {quota.is_birthday_unlimited ? (
                  <Cake className="h-5 w-5" />
                ) : quota.is_wheel_unlimited ? (
                  <Gift className="h-5 w-5" />
                ) : (
                  <Sparkles className="h-5 w-5" />
                )}
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-bold text-foreground">
                    {quota.is_birthday_unlimited
                      ? 'Doğum Günü Hediyen: 1 Gün Sınırsız Not Erişimi Aktif'
                      : quota.is_wheel_unlimited
                        ? 'Şans Çarkı Ödülün: 24 Saat Sınırsız Not Erişimi Aktif'
                        : 'Bilgi Yarışması 15/15 Ödülün: 2 Saat Sınırsız Not Erişimi Aktif'}
                  </p>
                  <span className="rounded-full bg-blue-500/10 px-2.5 py-0.5 text-[11px] font-bold text-primary">
                    {quota.is_birthday_unlimited
                      ? birthdayStatus.remainingLabel
                      : quota.is_wheel_unlimited
                        ? getMondayWheelState(user, nowDate, { profile: profile as any }).wheelUnlimitedRemainingLabel
                        : getTriviaUnlimitedRemainingLabel(user, profile as any)}
                  </span>
                </div>
              </div>
            </div>
            <Button
              type="button"
              size="sm"
              onClick={() => navigate('/notes')}
              className="rounded-full bg-[#1d63ed] px-4 text-white hover:bg-[#1652cc] shrink-0"
            >
              Notları İncele
            </Button>
          </div>
        )}

        {/* 1. HERO WELCOME BANNER + COMPACT HORIZONTAL ACADEMIC CALENDAR CARD */}
        <section
          data-tour="dashboard-hero"
          aria-label="Karşılama alanı"
          className={cn(
            'relative overflow-hidden rounded-[22px] sm:rounded-[24px] px-4 py-4 sm:px-7 sm:py-6 text-white shadow-[0_14px_34px_-12px_rgba(7,26,66,0.45)]',
            isNovember10
              ? 'bg-gradient-to-r from-zinc-950 via-zinc-900 to-zinc-800'
              : 'bg-gradient-to-r from-[#06183d] via-[#0b2a6e] to-[#0f3a8f]',
          )}
        >
          {/* Subtle vector light-arc geometry (pure SVG, zero raster/AI images) */}
          <svg
            aria-hidden="true"
            viewBox="0 0 960 220"
            fill="none"
            preserveAspectRatio="none"
            className="pointer-events-none absolute inset-0 h-full w-full opacity-35"
          >
            <path
              d="M360 230 C490 120, 620 40, 810 -15"
              stroke="url(#heroArc1)"
              strokeWidth="1.5"
            />
            <path
              d="M520 245 C655 130, 775 55, 975 20"
              stroke="url(#heroArc2)"
              strokeWidth="1.2"
            />
            <defs>
              <linearGradient id="heroArc1" x1="360" y1="230" x2="810" y2="-15" gradientUnits="userSpaceOnUse">
                <stop stopColor="#60a5fa" stopOpacity="0" />
                <stop offset="0.5" stopColor="#93c5fd" stopOpacity="0.8" />
                <stop offset="1" stopColor="#60a5fa" stopOpacity="0" />
              </linearGradient>
              <linearGradient id="heroArc2" x1="520" y1="245" x2="975" y2="20" gradientUnits="userSpaceOnUse">
                <stop stopColor="#38bdf8" stopOpacity="0" />
                <stop offset="0.5" stopColor="#bae6fd" stopOpacity="0.55" />
                <stop offset="1" stopColor="#38bdf8" stopOpacity="0" />
              </linearGradient>
            </defs>
          </svg>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-12 -top-20 h-56 w-56 rounded-full bg-sky-400/20 blur-3xl"
          />

          <div className="relative z-10 flex flex-col gap-3.5 sm:gap-5 lg:flex-row lg:items-center lg:justify-between">
            {/* Greeting Text */}
            <div className="min-w-0 space-y-1.5">
              <h1 className="text-[22px] leading-tight font-extrabold tracking-tight sm:text-[30px] sm:leading-[1.15]">
                {isBirthdayToday ? (
                  <>
                    Doğum günün kutlu olsun,{' '}
                    <span className={isNovember10 ? 'text-zinc-300' : 'text-[#6cb2ff]'}>
                      {firstName}!
                    </span>
                  </>
                ) : (
                  <>
                    Merhaba,{' '}
                    <span className={isNovember10 ? 'text-zinc-300' : 'text-[#6cb2ff]'}>
                      {firstName}!
                    </span>
                  </>
                )}
              </h1>
              <p className="text-[13px] leading-relaxed text-blue-100/90 sm:text-[15px]">
                <span>
                  {isBirthdayToday
                    ? 'Bugün sana özel tüm ders notlarını sınırsız görüntüleyebilir ve indirebilirsin.'
                    : 'Bugünün hedefi: Bir adım daha ileriye gitmek.'}
                </span>
                <TrendingUp
                  aria-hidden="true"
                  className={cn(
                    'ml-1.5 inline-block h-4 w-4 align-text-bottom',
                    isNovember10 ? 'text-zinc-300' : 'text-amber-300',
                  )}
                  strokeWidth={2.2}
                />
              </p>
            </div>

            {/* Compact Horizontal Academic Calendar Card (Top-Right of Hero Banner) */}
            <div
              aria-label="Akademik Takvim"
              className={cn(
                'flex w-full sm:w-fit max-w-full shrink-0 items-center gap-3 rounded-2xl border px-3 py-2.5 sm:px-3.5 backdrop-blur-md self-start lg:self-center',
                isNovember10
                  ? 'border-white/15 bg-white/10'
                  : 'border-sky-200/25 bg-sky-300/15',
              )}
            >
              <div
                className={cn(
                  'flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-xl border',
                  isNovember10
                    ? 'border-white/15 bg-white/10 text-zinc-100'
                    : 'border-sky-200/25 bg-sky-200/15 text-sky-100',
                )}
              >
                <GraduationCap className="h-[18px] w-[18px] sm:h-5 sm:w-5" strokeWidth={1.9} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold leading-none',
                      isNovember10
                        ? 'border-white/20 bg-white/15 text-white'
                        : 'border-sky-200/30 bg-sky-200/20 text-sky-100',
                    )}
                  >
                    {academicDisplay.semester}
                  </span>
                  <span className="text-[13px] sm:text-sm font-bold leading-none text-white">
                    {academicDisplay.weekLabel}
                  </span>
                </div>
                <p className="mt-1 text-[11px] sm:text-[11.5px] font-medium leading-snug text-sky-100/85">
                  {academicDisplay.yearLabel}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* 2. FOUR KPI STAT CARDS — ZERO TRUNCATION ON 360px+ MOBILE SCREENS */}
        <section
          data-tour="dashboard-stats"
          aria-label="Özet istatistikler"
          className="grid grid-cols-2 max-[359px]:grid-cols-1 gap-3 sm:gap-4 xl:grid-cols-4"
        >
          {loading
            ? Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="rounded-[20px] border border-slate-200/80 dark:border-slate-800 bg-card p-3.5 sm:p-5 shadow-[0_4px_18px_rgba(15,23,42,0.03)]"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Skeleton className="h-9 w-9 sm:h-11 sm:w-11 rounded-2xl shrink-0" />
                      <Skeleton className="h-4 w-10 rounded-full" />
                    </div>
                    <div className="space-y-1.5">
                      <Skeleton className="h-3.5 w-24" />
                      <Skeleton className="h-7 w-16" />
                    </div>
                  </div>
                </div>
              ))
            : statCards.map((stat, idx) => {
                const Icon = stat.icon;
                return (
                  <button
                    key={stat.label}
                    type="button"
                    onClick={stat.onClick}
                    className="group relative flex min-w-0 flex-col justify-between gap-2.5 overflow-hidden rounded-[20px] border border-slate-200/85 dark:border-slate-800/90 bg-card p-3.5 sm:p-5 text-left shadow-[0_4px_20px_rgba(15,23,42,0.035)] transition-all duration-200 hover:-translate-y-0.5 hover:border-blue-300/80 dark:hover:border-blue-500/40 hover:shadow-[0_12px_28px_-10px_rgba(37,99,235,0.14)] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                  >
                    {/* Top Row: Icon + Optional Delta Pill (never squeezes label or value!) */}
                    <div className="relative z-10 flex w-full items-center justify-between gap-2">
                      <span
                        className={cn(
                          'flex h-9 w-9 sm:h-11 sm:w-11 shrink-0 items-center justify-center rounded-xl sm:rounded-2xl transition-transform duration-200 group-hover:scale-105',
                          stat.iconTile,
                        )}
                      >
                        <Icon className="h-[18px] w-[18px] sm:h-5 sm:w-5" strokeWidth={1.9} />
                      </span>

                      {stat.delta && (
                        <span className="shrink-0 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                          {stat.delta}
                        </span>
                      )}
                    </div>

                    {/* Full-Width Label + Value (100% readable, zero ellipsis clipping!) */}
                    <div className="relative z-10 min-w-0 space-y-0.5 pr-4">
                      <p className="text-[12px] font-medium leading-snug text-slate-500 dark:text-slate-400 sm:text-[13px]">
                        {stat.label}
                      </p>
                      <p className="text-[22px] font-extrabold leading-tight tracking-tight text-foreground sm:text-[26px] tabular-nums">
                        {stat.value}
                      </p>
                    </div>

                    <StatSparkline
                      id={`dash-spark-${idx}`}
                      stroke={stat.sparkStroke}
                      fillTop={stat.sparkFill}
                      path={stat.sparkPath}
                      area={stat.sparkArea}
                    />
                  </button>
                );
              })}
        </section>

        {/* 3. MIDDLE FEATURE ROW: CONTINUE STUDYING + DAILY TRIVIA */}
        <section
          aria-label="Çalışma ve Günlük Bilgi Yarışması"
          className="grid grid-cols-1 gap-4 sm:gap-5 lg:grid-cols-12"
        >
          {/* Left: Kaldığın yerden devam et (compact purposeful layout, zero empty decorative box) */}
          <div className="flex flex-col justify-between rounded-[22px] border border-slate-200/85 dark:border-slate-800/90 bg-card p-4 sm:p-6 shadow-[0_6px_24px_rgba(15,23,42,0.035)] lg:col-span-6">
            <div className="mb-4 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <BarChart2 className="h-[18px] w-[18px] sm:h-5 sm:w-5 shrink-0 text-primary" strokeWidth={2} />
                <h2 className="truncate text-[15px] font-bold tracking-tight text-foreground sm:text-[17px]">
                  Kaldığın yerden devam et
                </h2>
              </div>
              <button
                type="button"
                onClick={() => navigate('/study')}
                className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-primary transition-colors hover:text-primary/80"
              >
                <span>Tümünü Gör</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>

            {loading ? (
              <div className="space-y-4">
                <div className="flex items-center gap-3.5">
                  <Skeleton className="h-12 w-12 rounded-2xl shrink-0" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-5 w-44" />
                    <Skeleton className="h-3.5 w-32" />
                  </div>
                </div>
                <Skeleton className="h-2 w-full rounded-full" />
                <Skeleton className="h-10 w-full rounded-full" />
              </div>
            ) : (
              <div className="flex flex-1 flex-col justify-between gap-4">
                {/* Compact Icon Tile + Real Course & Topic Title */}
                <div className="flex items-center gap-3.5">
                  <span
                    aria-hidden="true"
                    className={cn(
                      'flex h-12 w-12 sm:h-14 sm:w-14 shrink-0 items-center justify-center rounded-2xl text-white shadow-sm',
                      isNovember10
                        ? 'bg-zinc-900 dark:bg-zinc-800'
                        : 'bg-gradient-to-br from-[#0b2a6e] to-[#1d63ed]',
                    )}
                  >
                    <ClipboardList className="h-6 w-6" strokeWidth={1.85} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-base sm:text-lg font-extrabold leading-snug tracking-tight text-foreground line-clamp-2">
                      {continueItem.title}
                    </h3>
                    <p className="mt-0.5 truncate text-xs font-medium text-muted-foreground">
                      {continueItem.subtitle}
                    </p>
                  </div>
                </div>

                {/* Progress Bar + Percentage + Full-Width CTA */}
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <div
                        className={cn(
                          'h-full rounded-full transition-all duration-500',
                          isNovember10
                            ? 'bg-zinc-900 dark:bg-zinc-200'
                            : 'bg-gradient-to-r from-[#1d63ed] to-[#5ba0ff]',
                        )}
                        style={{
                          width: `${Math.max(continueItem.progressPct, continueItem.hasRealHistory ? 8 : 0)}%`,
                        }}
                      />
                    </div>
                    <span className="shrink-0 text-xs font-extrabold text-foreground tabular-nums">
                      %{continueItem.progressPct}
                    </span>
                  </div>

                  <Button
                    type="button"
                    onClick={() => navigate(continueItem.targetPath)}
                    className={cn(
                      'h-10 sm:h-11 w-full gap-2 rounded-full text-sm font-semibold text-white transition-all hover:brightness-105 active:scale-[0.99]',
                      isNovember10
                        ? 'bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-950'
                        : 'bg-gradient-to-r from-[#174ec4] via-[#1f62e8] to-[#2e78f6] shadow-[0_10px_22px_-8px_rgba(29,99,237,0.6)]',
                    )}
                  >
                    <Play className="h-3.5 w-3.5 fill-current" />
                    <span>{continueItem.ctaLabel}</span>
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Right: Günlük Bilgi Yarışması (pure typography, Lucide line icons, zero decorative trophy graphics) */}
          <div
            data-tour="dashboard-trivia"
            className={cn(
              'relative flex flex-col justify-between overflow-hidden rounded-[22px] p-4 sm:p-6 text-white shadow-[0_14px_34px_-10px_rgba(12,46,115,0.45)] lg:col-span-6',
              isNovember10
                ? 'bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-800'
                : 'bg-gradient-to-br from-[#071a42] via-[#0e3682] to-[#1d63ed]',
            )}
          >
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -right-10 -top-12 h-44 w-44 rounded-full bg-sky-300/15 blur-3xl"
            />

            <div className="relative z-10 flex h-full flex-col justify-between gap-4">
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-2 text-sm font-bold text-white">
                    <Trophy
                      className={cn(
                        'h-4 w-4 shrink-0',
                        isNovember10 ? 'text-zinc-300' : 'text-amber-300',
                      )}
                      strokeWidth={2}
                    />
                    <span>Günlük Bilgi Yarışması</span>
                  </span>
                  {triviaAttempt?.status === 'completed' && (
                    <span className="rounded-full border border-emerald-300/35 bg-emerald-400/20 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-100">
                      Bugün: {triviaAttempt.correctCount}/15
                    </span>
                  )}
                  {triviaAttempt?.status === 'cancelled' && (
                    <span className="rounded-full border border-rose-300/40 bg-rose-500/25 px-2.5 py-0.5 text-[11px] font-semibold text-rose-100">
                      Bugün: İptal Edildi
                    </span>
                  )}
                  {triviaAttempt?.status === 'expired' && (
                    <span className="rounded-full border border-amber-300/40 bg-amber-500/25 px-2.5 py-0.5 text-[11px] font-semibold text-amber-100">
                      Bugün: Süre Doldu
                    </span>
                  )}
                  {triviaAttempt?.status === 'grace_period' && (
                    <span className="rounded-full border border-amber-300/50 bg-amber-500/30 px-2.5 py-0.5 text-[11px] font-bold text-amber-100 animate-pulse">
                      5 sn Geri Dönüş!
                    </span>
                  )}
                </div>

                <h2 className="text-[22px] font-extrabold tracking-tight text-white sm:text-[26px] sm:leading-tight">
                  15 soru • 15 dakika
                </h2>
                <p className="text-xs sm:text-sm text-blue-100/90">
                  Bilgini test et, ödülleri kazan!
                </p>
              </div>

              <div className="space-y-2.5">
                <Button
                  type="button"
                  onClick={() => navigate('/gunluk-yarisma')}
                  className="h-10 sm:h-11 w-full sm:w-auto sm:min-w-[220px] gap-2 rounded-full bg-white px-6 text-sm font-bold text-[#0c265c] shadow-[0_8px_20px_-6px_rgba(0,0,0,0.28)] transition-all hover:bg-blue-50 active:scale-[0.99]"
                >
                  <Play className="h-4 w-4 fill-current" />
                  <span>
                    {triviaAttempt?.status === 'in_progress'
                      ? 'Yarışmaya Devam Et'
                      : triviaAttempt?.status === 'grace_period'
                        ? 'Yarışmaya Hemen Dön'
                        : triviaAttempt?.status === 'completed'
                          ? 'Sonucu Görüntüle'
                          : triviaAttempt?.status === 'cancelled'
                            ? 'İptal Durumunu Gör'
                            : triviaAttempt?.status === 'expired'
                              ? 'Durumu Görüntüle'
                              : 'Yarışmaya Katıl'}
                  </span>
                </Button>

                <p className="flex items-center gap-1.5 text-xs font-medium text-blue-100/85">
                  <Clock className="h-3.5 w-3.5 shrink-0 text-sky-200" />
                  <span>Yarışmaya kalan süre:</span>
                  <strong className="font-semibold text-white tabular-nums">
                    {renewal.compactTime}
                  </strong>
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* 4. BOTTOM BALANCED SECTION: SON EKLENEN NOTLAR + HAFTALIK İSTATİSTİKLER + LİDERLİK TABLOSU */}
        <section
          aria-label="Son eklenen notlar, haftalık çalışma istatistikleri ve liderlik tablosu"
          className="grid grid-cols-1 gap-4 sm:gap-5 lg:grid-cols-12"
        >
          {/* Left: Son Eklenen Notlar */}
          <div className="flex flex-col rounded-[22px] border border-slate-200/85 dark:border-slate-800/90 bg-card p-4 sm:p-5 shadow-[0_6px_24px_rgba(15,23,42,0.035)] lg:col-span-6 xl:col-span-4">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-x-2.5 gap-y-1.5">
              <div className="flex items-center gap-2">
                <FileText className="h-[18px] w-[18px] shrink-0 text-primary" strokeWidth={2} />
                <h2 className="whitespace-nowrap text-[15.5px] font-bold leading-snug tracking-tight text-foreground sm:text-[16px]">
                  Son Eklenen Notlar
                </h2>
              </div>
              <button
                type="button"
                onClick={() => navigate('/notes')}
                className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 py-1 -mr-2 text-xs font-semibold text-primary transition-colors hover:bg-primary/10"
              >
                <span>Tüm Notları Gör</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>

            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3.5 rounded-2xl p-2.5">
                    <Skeleton className="h-11 w-11 rounded-xl shrink-0" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-3 w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            ) : topNotes.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-border/80 px-4 py-10 text-center">
                <FileText className="mb-2 h-7 w-7 text-muted-foreground/60" />
                <p className="text-sm font-semibold text-foreground">Henüz ders notu bulunmuyor</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  İlk notu paylaşarak veya mevcut derslere göz atarak başlayabilirsin.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {topNotes.map((note) => {
                  const badge = detectNoteFileBadge(note.file_type, note.file_name);
                  const dateLabel = formatTurkishShortDate(note.created_at);
                  const metaSecondary = note.course?.trim() || note.semester?.trim() || note.uploader_name?.trim() || '';
                  return (
                    <button
                      key={note.id}
                      type="button"
                      onClick={() => navigate(`/notes?q=${encodeURIComponent(note.title)}`)}
                      className="group flex w-full items-center gap-3.5 py-3 first:pt-1 last:pb-1 text-left transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/40 rounded-xl px-2 -mx-2"
                    >
                      <span
                        className={cn(
                          'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[11px] font-extrabold tracking-wide',
                          isNovember10
                            ? 'bg-zinc-900 text-white dark:bg-zinc-200 dark:text-zinc-950'
                            : FILE_BADGE_CLASSES[badge.tone],
                        )}
                      >
                        {badge.label}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                          {note.title}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {dateLabel}
                          {metaSecondary ? ` • ${metaSecondary}` : ''}
                        </p>
                      </div>
                      <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-primary" />
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Center: Haftalık Çalışma İstatistikleri */}
          <div className="flex flex-col justify-between rounded-[22px] border border-slate-200/85 dark:border-slate-800/90 bg-card p-4 sm:p-5 shadow-[0_6px_24px_rgba(15,23,42,0.035)] lg:col-span-6 xl:col-span-4">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-x-2.5 gap-y-2">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-[18px] w-[18px] shrink-0 text-primary" strokeWidth={2} />
                <h2 className="text-[15.5px] font-bold leading-snug tracking-tight text-foreground sm:text-[16px]">
                  Haftalık Çalışma İstatistikleri
                </h2>
              </div>

              <div
                role="group"
                aria-label="Hafta seçimi"
                className="inline-flex items-center rounded-full border border-slate-200/90 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-900/70 p-0.5"
              >
                <button
                  type="button"
                  onClick={() => {
                    setWeekPeriod('current');
                    setSelectedDayIndex(null);
                  }}
                  className={cn(
                    'rounded-full px-3 py-1 text-xs font-semibold transition-all',
                    weekPeriod === 'current'
                      ? 'bg-white dark:bg-slate-800 text-foreground shadow-sm'
                      : 'text-slate-500 hover:text-foreground dark:text-slate-400',
                  )}
                >
                  Bu Hafta
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setWeekPeriod('previous');
                    setSelectedDayIndex(null);
                  }}
                  className={cn(
                    'rounded-full px-3 py-1 text-xs font-semibold transition-all',
                    weekPeriod === 'previous'
                      ? 'bg-white dark:bg-slate-800 text-foreground shadow-sm'
                      : 'text-slate-500 hover:text-foreground dark:text-slate-400',
                  )}
                >
                  Geçen Hafta
                </button>
              </div>
            </div>

            {loading ? (
              <div className="flex h-[186px] items-end justify-between gap-2.5 pt-8">
                {[42, 65, 92, 54, 72, 48, 80].map((h, i) => (
                  <div key={i} className="flex flex-1 flex-col items-center gap-2">
                    <Skeleton className="w-full max-w-[38px] rounded-t-xl" style={{ height: `${h}px` }} />
                    <Skeleton className="h-3 w-7" />
                  </div>
                ))}
              </div>
            ) : (
              <div>
                <div className="grid h-[188px] grid-cols-7 items-end gap-1.5 sm:gap-2 pt-9">
                  {weeklySeries.days.map((day, idx) => {
                    const isHighlighted = idx === highlightedDayIndex;
                    const heightPct =
                      day.minutes > 0
                        ? Math.min(100, Math.max(14, Math.round((day.minutes / barScaleMax) * 100)))
                        : 7;

                    return (
                      <button
                        key={day.dateKey}
                        type="button"
                        onMouseEnter={() => setSelectedDayIndex(idx)}
                        onFocus={() => setSelectedDayIndex(idx)}
                        onClick={() => setSelectedDayIndex(idx)}
                        aria-label={`${day.fullLabel}: ${day.minutes} dakika`}
                        className="group relative flex h-full flex-col items-center justify-end gap-2 focus:outline-none"
                      >
                        <div className="relative flex w-full flex-1 items-end justify-center">
                          <div
                            className={cn(
                              'relative w-full max-w-[40px] rounded-t-xl transition-all duration-300',
                              day.minutes === 0
                                ? 'bg-slate-100 dark:bg-slate-800/80'
                                : isNovember10
                                  ? isHighlighted
                                    ? 'bg-zinc-900 dark:bg-zinc-200'
                                    : 'bg-zinc-500/70 dark:bg-zinc-600'
                                  : isHighlighted
                                    ? 'bg-gradient-to-t from-[#60a5fa] via-[#2563eb] to-[#1d4ed8] shadow-[0_8px_18px_-6px_rgba(37,99,235,0.55)]'
                                    : 'bg-gradient-to-t from-[#bfdbfe] via-[#60a5fa] to-[#3b82f6] opacity-85 group-hover:opacity-100',
                            )}
                            style={{ height: `${heightPct}%` }}
                          >
                            {/* Floating duration pill anchored cleanly above the highlighted / peak bar */}
                            {isHighlighted && (
                              <span
                                className={cn(
                                  'pointer-events-none absolute -top-8 z-10 whitespace-nowrap rounded-full border border-slate-200/90 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-0.5 text-[11px] font-bold text-foreground shadow-sm tabular-nums',
                                  idx === 0
                                    ? 'left-0 sm:left-1/2 sm:-translate-x-1/2'
                                    : idx === 6
                                      ? 'right-0 sm:left-1/2 sm:right-auto sm:-translate-x-1/2'
                                      : 'left-1/2 -translate-x-1/2',
                                )}
                              >
                                {day.minutes} dk
                              </span>
                            )}
                          </div>
                        </div>

                        <span
                          className={cn(
                            'text-xs leading-none transition-colors',
                            isHighlighted
                              ? 'font-bold text-foreground'
                              : 'font-medium text-slate-500 dark:text-slate-400',
                          )}
                        >
                          {day.shortLabel}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-slate-100 dark:border-slate-800/80 pt-3 text-xs text-muted-foreground">
                  <span className="truncate">
                    {weeklySeries.totalMinutes > 0
                      ? 'Odak, stüdyo ve yarışmalardan hesaplanır.'
                      : 'Bu hafta henüz çalışma kaydı yok.'}
                  </span>
                  <span className="shrink-0 pl-3 font-bold text-foreground tabular-nums">
                    Toplam {weeklySeries.totalMinutes} dk
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Right: Liderlik Tablosu (Gerçek Veritabanı XP Sıralaması) */}
          <DashboardLeaderboardCard
            dataTour="dashboard-leaderboard"
            leaderboard={leaderboard}
            currentUserId={user?.id}
            currentUserName={displayName}
            currentUserAvatar={profile?.avatar_url}
            currentUserPoints={points?.points ?? 0}
            loading={pointsLoading}
            isNovember10={isNovember10}
            onViewAll={() => navigate('/points?tab=leaderboard')}
            className="lg:col-span-12 xl:col-span-4"
          />
        </section>
      </div>
    </Layout>
  );
};

export default Dashboard;
