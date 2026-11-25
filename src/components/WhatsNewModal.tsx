import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Eye,
  FileText,
  Flame,
  GraduationCap,
  Home,
  Layers,
  ListOrdered,
  Moon,
  Network,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Sun,
  Trophy,
  Upload,
  Video,
  X,
} from 'lucide-react';
import EconLogo from '@/components/EconLogo';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useOnboarding } from '@/contexts/OnboardingContext';
import { getSeasonalTheme, useSiteConfig } from '@/contexts/SiteConfigContext';
import { needsBirthDateCompletion } from '@/lib/birthdayPerk';
import {
  broadcastWhatsNewSync,
  clearWhatsNewPendingForSession,
  getWhatsNewSeenKey,
  getWhatsNewTabLockKey,
  hasUserSeenWhatsNew,
  isWhatsNewPendingForSession,
  persistWhatsNewSeen,
  releaseWhatsNewTabLock,
  tryAcquireWhatsNewTabLock,
  WHATS_NEW_CHANNEL_NAME,
  WHATS_NEW_ELIGIBLE_EVENT,
  WHATS_NEW_STEPS,
  WHATS_NEW_VERSION,
} from '@/lib/whatsNew';
import { cn } from '@/lib/utils';

const EXCLUDED_PATHS = new Set([
  '/welcome',
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
]);

const STEP_ICONS = [
  Home,
  Smartphone,
  GraduationCap,
  Trophy,
  ListOrdered,
  FileText,
] as const;

/**
 * Pure UI mini-previews mirroring real active EconNotes surfaces using only
 * CSS layout primitives, typography, and minimal Lucide line icons (zero AI art).
 */
const StepVisualPreview: React.FC<{ stepId: string }> = ({ stepId }) => {
  switch (stepId) {
    case 'dashboard':
      return (
        <div
          className="space-y-2.5 rounded-2xl border border-slate-200/90 bg-slate-50/90 p-3.5 dark:border-slate-800 dark:bg-slate-900/70"
          aria-hidden="true"
        >
          <div className="flex items-center justify-between text-[11px] font-semibold text-muted-foreground">
            <span className="inline-flex items-center gap-1.5 text-foreground">
              <Home className="h-3.5 w-3.5 text-[#174ec4] dark:text-blue-400" />
              Ana Sayfa Özeti
            </span>
            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-[#174ec4] dark:bg-blue-500/15 dark:text-blue-300">
              Canlı Panel
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-slate-200/80 bg-card p-2.5 shadow-xs dark:border-slate-800">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-medium text-muted-foreground">Toplam XP</span>
                <Sparkles className="h-3.5 w-3.5 text-[#174ec4] dark:text-blue-400" />
              </div>
              <p className="mt-1 text-base font-extrabold tabular-nums text-foreground">1.250 XP</p>
              <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                7 günlük seri
              </span>
            </div>
            <div className="rounded-xl border border-slate-200/80 bg-card p-2.5 shadow-xs dark:border-slate-800">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-medium text-muted-foreground">Materyaller</span>
                <BookOpen className="h-3.5 w-3.5 text-[#174ec4] dark:text-blue-400" />
              </div>
              <p className="mt-1 text-base font-extrabold tabular-nums text-foreground">18 Kayıt</p>
              <span className="text-[10px] text-muted-foreground">Kaldığın yerden</span>
            </div>
          </div>
          <div className="rounded-xl border border-slate-200/80 bg-card p-2.5 dark:border-slate-800">
            <div className="mb-1.5 flex items-center justify-between text-[10px] font-semibold">
              <span className="inline-flex items-center gap-1 text-foreground">
                <BarChart3 className="h-3 w-3 text-[#174ec4] dark:text-blue-400" />
                Haftalık Çalışma
              </span>
              <span className="inline-flex items-center gap-1 text-muted-foreground">
                <CalendarDays className="h-3 w-3" />
                Güz • 9. Hafta
              </span>
            </div>
            <div className="flex h-10 items-end gap-1.5 px-1">
              {[38, 62, 50, 82, 74, 96, 68].map((h, i) => (
                <span
                  key={i}
                  className={cn(
                    'flex-1 rounded-t-md',
                    i === 5
                      ? 'bg-gradient-to-t from-[#0b2a6e] to-[#2563eb]'
                      : 'bg-blue-200/90 dark:bg-blue-500/30',
                  )}
                  style={{ height: `${h}%` }}
                />
              ))}
            </div>
          </div>
        </div>
      );

    case 'navigation-mobile':
      return (
        <div
          className="space-y-2.5 rounded-2xl border border-slate-200/90 bg-slate-50/90 p-3.5 dark:border-slate-800 dark:bg-slate-900/70"
          aria-hidden="true"
        >
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-foreground">
              <Smartphone className="h-3.5 w-3.5 text-[#174ec4] dark:text-blue-400" />
              Oval Menü & Tema
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-card px-2 py-0.5 text-[10px] font-semibold text-muted-foreground dark:border-slate-700">
              <Sun className="h-3 w-3 text-amber-500" />
              <span>/</span>
              <Moon className="h-3 w-3 text-blue-400" />
            </span>
          </div>
          <div className="space-y-1.5 rounded-xl border border-slate-200/80 bg-card p-2.5 dark:border-slate-800">
            {[
              { label: 'Ana Sayfa', active: true },
              { label: 'Notlar', active: false },
              { label: 'Çalışma Stüdyosu', active: false },
              { label: 'Puan Geçmişim', active: false },
            ].map((item) => (
              <div
                key={item.label}
                className={cn(
                  'flex items-center justify-between rounded-full px-3 py-1.5 text-[11px] font-semibold',
                  item.active
                    ? 'bg-gradient-to-r from-[#0b2a6e] to-[#2563eb] text-white shadow-xs'
                    : 'text-muted-foreground',
                )}
              >
                <span>{item.label}</span>
                {item.active && <span className="h-1.5 w-1.5 rounded-full bg-sky-200" />}
              </div>
            ))}
          </div>
          <div className="flex items-center justify-around rounded-full border border-slate-200/90 bg-card px-2 py-2 text-[10px] font-semibold text-muted-foreground shadow-xs dark:border-slate-800">
            <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-[#174ec4] dark:bg-blue-500/15 dark:text-blue-300">
              Ana Sayfa
            </span>
            <span>Notlar</span>
            <span>Stüdyo</span>
            <span>Menü</span>
          </div>
        </div>
      );

    case 'study-studio':
      return (
        <div
          className="space-y-2.5 rounded-2xl border border-slate-200/90 bg-slate-50/90 p-3.5 dark:border-slate-800 dark:bg-slate-900/70"
          aria-hidden="true"
        >
          <div className="flex items-center justify-between text-[11px] font-semibold">
            <span className="inline-flex items-center gap-1.5 text-foreground">
              <GraduationCap className="h-3.5 w-3.5 text-[#174ec4] dark:text-blue-400" />
              Çalışma Stüdyosu Araçları
            </span>
            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-[#174ec4] dark:bg-blue-500/15 dark:text-blue-300">
              6 Aktif Modül
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {[
              { icon: FileText, label: 'Ayrıntılı Özet' },
              { icon: Video, label: 'Videolu Ders' },
              { icon: Sparkles, label: 'Deneme Sınavı' },
              { icon: Layers, label: 'Çalışma Kartları' },
              { icon: Network, label: 'Kavram Haritası' },
              { icon: CalendarDays, label: 'Sınav Planı' },
            ].map(({ icon: Icon, label }) => (
              <div
                key={label}
                className="flex items-center gap-2 rounded-xl border border-slate-200/80 bg-card px-2.5 py-2 text-[11px] font-semibold text-foreground dark:border-slate-800"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-[#174ec4] dark:bg-blue-500/15 dark:text-blue-400">
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <span className="truncate">{label}</span>
              </div>
            ))}
          </div>
        </div>
      );

    case 'daily-trivia':
      return (
        <div
          className="space-y-2.5 rounded-2xl border border-slate-200/90 bg-slate-50/90 p-3.5 dark:border-slate-800 dark:bg-slate-900/70"
          aria-hidden="true"
        >
          <div className="rounded-xl bg-gradient-to-br from-[#06183d] via-[#0b2a6e] to-[#174ec4] p-3.5 text-white">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-sky-200">
                <Trophy className="h-3.5 w-3.5" />
                Günlük Bilgi Yarışması
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-bold">
                <Clock className="h-3 w-3" />
                15 dk
              </span>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-white/10 p-2">
                <p className="text-sm font-extrabold tabular-nums">15</p>
                <p className="text-[10px] text-blue-100">Soru</p>
              </div>
              <div className="rounded-xl bg-white/10 p-2">
                <p className="text-sm font-extrabold tabular-nums">+25</p>
                <p className="text-[10px] text-blue-100">XP / Doğru</p>
              </div>
              <div className="rounded-xl bg-white/10 p-2">
                <p className="text-sm font-extrabold tabular-nums">375</p>
                <p className="text-[10px] text-blue-100">Maks. XP</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-blue-200/80 bg-blue-50/80 px-3 py-2 text-[11px] font-semibold text-[#0b2a6e] dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-200">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-[#174ec4] dark:text-blue-400" />
            <span>15/15 başarıda 2 saat sınırsız not erişimi</span>
          </div>
        </div>
      );

    case 'xp-leaderboard':
      return (
        <div
          className="space-y-2.5 rounded-2xl border border-slate-200/90 bg-slate-50/90 p-3.5 dark:border-slate-800 dark:bg-slate-900/70"
          aria-hidden="true"
        >
          <div className="flex items-center justify-between text-[11px] font-semibold">
            <span className="inline-flex items-center gap-1.5 text-foreground">
              <ListOrdered className="h-3.5 w-3.5 text-[#174ec4] dark:text-blue-400" />
              Liderlik Tablosu
            </span>
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-600 dark:text-amber-400">
              <Flame className="h-3 w-3" />
              Günlük Seri
            </span>
          </div>
          <div className="space-y-1.5">
            {[
              { rank: '1', name: 'Örnek Öğrenci A.', xp: '2.450 XP', highlight: false },
              { rank: '2', name: 'Senin Sıran', xp: '2.125 XP', highlight: true },
              { rank: '3', name: 'Örnek Öğrenci B.', xp: '1.980 XP', highlight: false },
            ].map((row) => (
              <div
                key={row.rank}
                className={cn(
                  'flex items-center justify-between rounded-xl border px-3 py-2 text-xs',
                  row.highlight
                    ? 'border-[#174ec4]/40 bg-blue-50/90 font-bold text-[#0b2a6e] dark:border-blue-500/40 dark:bg-blue-500/15 dark:text-blue-200'
                    : 'border-slate-200/80 bg-card font-semibold text-foreground dark:border-slate-800',
                )}
              >
                <span className="flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-200/80 text-[10px] font-extrabold tabular-nums text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                    {row.rank}
                  </span>
                  <span>{row.name}</span>
                </span>
                <span className="tabular-nums text-[11px] font-extrabold text-[#174ec4] dark:text-blue-300">
                  {row.xp}
                </span>
              </div>
            ))}
          </div>
        </div>
      );

    default:
      return (
        <div
          className="space-y-2.5 rounded-2xl border border-slate-200/90 bg-slate-50/90 p-3.5 dark:border-slate-800 dark:bg-slate-900/70"
          aria-hidden="true"
        >
          <div className="flex items-center justify-between text-[11px] font-semibold">
            <span className="inline-flex items-center gap-1.5 text-foreground">
              <ShieldCheck className="h-3.5 w-3.5 text-[#174ec4] dark:text-blue-400" />
              Güvenli Not Erişimi
            </span>
            <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
              Aktif
            </span>
          </div>
          <div className="space-y-2 rounded-xl border border-slate-200/80 bg-card p-3 dark:border-slate-800">
            <div className="flex items-center justify-between text-[11px]">
              <span className="inline-flex items-center gap-1.5 font-semibold text-foreground">
                <Eye className="h-3.5 w-3.5 text-[#174ec4] dark:text-blue-400" />
                Filigranlı PDF &amp; PPTX Önizleme
              </span>
              <Check className="h-3.5 w-3.5 text-emerald-500" />
            </div>
            <div className="flex items-center justify-between text-[11px]">
              <span className="inline-flex items-center gap-1.5 font-semibold text-foreground">
                <Upload className="h-3.5 w-3.5 text-[#174ec4] dark:text-blue-400" />
                Anlık Kota &amp; Yükleme Takibi
              </span>
              <Check className="h-3.5 w-3.5 text-emerald-500" />
            </div>
            <div className="flex items-center justify-between text-[11px]">
              <span className="inline-flex items-center gap-1.5 font-semibold text-foreground">
                <GraduationCap className="h-3.5 w-3.5 text-[#174ec4] dark:text-blue-400" />
                Stüdyo Kaynak Aktarımı
              </span>
              <Check className="h-3.5 w-3.5 text-emerald-500" />
            </div>
          </div>
        </div>
      );
  }
};

export const WhatsNewModal: React.FC = () => {
  const { user, profile, isApproved, loading } = useAuth();
  const { isTourOpen, shouldShowWelcomeAuto } = useOnboarding();
  const location = useLocation();
  const { config } = useSiteConfig();
  const seasonalTheme = getSeasonalTheme(config.theme.seasonalMode || 'default');
  const isNovember10 = seasonalTheme?.id === 'november10';

  const [open, setOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [pendingSignalTick, setPendingSignalTick] = useState(0);
  const tabIdRef = useRef<string>(
    `tab_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
  );
  const recordedOpenForUserRef = useRef<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const isExcludedRoute = EXCLUDED_PATHS.has(location.pathname);
  const birthDateBlocking = Boolean(
    user && profile && isApproved && needsBirthDateCompletion(user, profile),
  );

  // Listen for AuthContext eligibility signal (fired right before last_login update)
  useEffect(() => {
    const onEligible = () => setPendingSignalTick((t) => t + 1);
    window.addEventListener(WHATS_NEW_ELIGIBLE_EVENT, onEligible);
    return () => window.removeEventListener(WHATS_NEW_ELIGIBLE_EVENT, onEligible);
  }, []);

  // Multi-tab deduplication: if another tab opens or dismisses What's New for this user, stay closed
  useEffect(() => {
    if (!user?.id) return;
    const userId = user.id;
    const seenKey = getWhatsNewSeenKey(userId, WHATS_NEW_VERSION);
    const lockKey = getWhatsNewTabLockKey(userId, WHATS_NEW_VERSION);

    const handleStorage = (e: StorageEvent) => {
      if (e.key === seenKey && e.newValue === '1') {
        clearWhatsNewPendingForSession(userId, WHATS_NEW_VERSION);
        setOpen(false);
      } else if (e.key === lockKey && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue) as { tabId?: string };
          if (parsed.tabId && parsed.tabId !== tabIdRef.current) {
            setOpen(false);
          }
        } catch {
          // ignore
        }
      }
    };

    window.addEventListener('storage', handleStorage);

    let channel: BroadcastChannel | null = null;
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        channel = new BroadcastChannel(WHATS_NEW_CHANNEL_NAME);
        channel.onmessage = (event) => {
          const msg = event.data as {
            type?: string;
            userId?: string;
            version?: string;
            tabId?: string;
          } | null;
          if (
            msg &&
            msg.userId === userId &&
            msg.version === WHATS_NEW_VERSION &&
            msg.tabId !== tabIdRef.current
          ) {
            clearWhatsNewPendingForSession(userId, WHATS_NEW_VERSION);
            setOpen(false);
          }
        };
      } catch {
        channel = null;
      }
    }

    return () => {
      window.removeEventListener('storage', handleStorage);
      channel?.close();
    };
  }, [user?.id]);

  // Reset modal cleanly on account switch or sign-out
  useEffect(() => {
    if (!user?.id) {
      setOpen(false);
      setStepIndex(0);
      recordedOpenForUserRef.current = null;
    }
  }, [user?.id]);

  // Trigger one-time display strictly when eligible, approved, not colliding with onboarding or other blocking modals
  useEffect(() => {
    if (
      loading ||
      !user?.id ||
      !profile ||
      !isApproved ||
      isExcludedRoute ||
      isTourOpen ||
      shouldShowWelcomeAuto ||
      birthDateBlocking
    ) {
      return;
    }

    if (open) return;

    if (!isWhatsNewPendingForSession(user.id, WHATS_NEW_VERSION)) {
      return;
    }

    if (hasUserSeenWhatsNew(user, profile, WHATS_NEW_VERSION)) {
      clearWhatsNewPendingForSession(user.id, WHATS_NEW_VERSION);
      return;
    }

    // Prevent simultaneous display across multiple open browser tabs
    if (!tryAcquireWhatsNewTabLock(user.id, tabIdRef.current, WHATS_NEW_VERSION)) {
      clearWhatsNewPendingForSession(user.id, WHATS_NEW_VERSION);
      return;
    }

    setStepIndex(0);
    setOpen(true);

    // Record seen status immediately upon opening so reloads, multi-tab, or cross-device logins never repeat
    if (recordedOpenForUserRef.current !== user.id) {
      recordedOpenForUserRef.current = user.id;
      broadcastWhatsNewSync({
        type: 'opened',
        userId: user.id,
        version: WHATS_NEW_VERSION,
        tabId: tabIdRef.current,
      });
      void persistWhatsNewSeen(user, 'viewed', WHATS_NEW_VERSION);
    }
  }, [
    birthDateBlocking,
    isApproved,
    isExcludedRoute,
    isTourOpen,
    loading,
    open,
    pendingSignalTick,
    profile,
    shouldShowWelcomeAuto,
    user,
  ]);

  const handleClose = useCallback(
    (status: 'skipped' | 'completed') => {
      setOpen(false);
      if (user) {
        releaseWhatsNewTabLock(user.id, tabIdRef.current, WHATS_NEW_VERSION);
        broadcastWhatsNewSync({
          type: 'dismissed',
          userId: user.id,
          version: WHATS_NEW_VERSION,
          tabId: tabIdRef.current,
        });
        void persistWhatsNewSeen(user, status, WHATS_NEW_VERSION);
      }
    },
    [user],
  );

  // Move focus cleanly into dialog and support Esc / ArrowLeft / ArrowRight navigation
  useEffect(() => {
    if (!open) return;
    const focusTimer = window.setTimeout(() => {
      dialogRef.current?.focus({ preventScroll: true });
    }, 50);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleClose('skipped');
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setStepIndex((idx) => Math.min(WHATS_NEW_STEPS.length - 1, idx + 1));
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setStepIndex((idx) => Math.max(0, idx - 1));
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [handleClose, open]);

  const totalSteps = WHATS_NEW_STEPS.length;
  const activeStep = useMemo(
    () => WHATS_NEW_STEPS[stepIndex] ?? WHATS_NEW_STEPS[0],
    [stepIndex],
  );
  const StepIcon = STEP_ICONS[stepIndex] ?? Sparkles;
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === totalSteps - 1;
  const progressPercent = Math.round(((stepIndex + 1) / totalSteps) * 100);

  if (!open) return null;

  return (
    <div
      data-testid="whats-new-overlay"
      data-whats-new-version={WHATS_NEW_VERSION}
      data-whats-new-step={activeStep.id}
      className="fixed inset-0 z-[96] flex items-center justify-center overflow-y-auto bg-[#040d21]/68 p-3 backdrop-blur-[5px] animate-fade-in sm:p-5"
      style={{
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.75rem)',
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 0.75rem)',
        paddingLeft: 'max(0.75rem, env(safe-area-inset-left, 0px))',
        paddingRight: 'max(0.75rem, env(safe-area-inset-right, 0px))',
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="whats-new-title"
        aria-describedby="whats-new-subtitle"
        tabIndex={-1}
        className="relative my-auto flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-[26px] border border-slate-200/90 bg-card shadow-[0_28px_80px_-16px_rgba(4,13,33,0.55)] outline-none focus:outline-none dark:border-slate-700/85"
      >
        {/* Navy -> Electric Blue Brand Header */}
        <div
          className={cn(
            'relative shrink-0 overflow-hidden px-5 pt-5 pb-5 text-white sm:px-8 sm:pt-6 sm:pb-6',
            isNovember10
              ? 'bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-800'
              : 'bg-gradient-to-br from-[#06183d] via-[#0b2a6e] to-[#174ec4]',
          )}
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-12 -top-16 h-56 w-56 rounded-full bg-sky-400/20 blur-3xl"
          />

          <div className="relative z-10 flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <EconLogo allWhite className="h-6 w-auto shrink-0 sm:h-7" />
              <span className="h-4 w-px shrink-0 bg-white/25" aria-hidden="true" />
              <span className="text-xs font-semibold text-blue-100 sm:hidden">
                Neler Yeni?
              </span>
              <span className="hidden truncate text-xs font-semibold text-blue-100 sm:inline">
                EconNotes&apos;ta Neler Yeni?
              </span>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <span className="rounded-full border border-white/20 bg-white/10 px-2.5 py-0.5 text-[11px] font-bold tabular-nums text-white">
                {stepIndex + 1} / {totalSteps}
              </span>
              <button
                type="button"
                aria-label="Yenilikler tanıtımını kapat"
                onClick={() => handleClose('skipped')}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white transition-colors hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="relative z-10 mt-4 max-w-2xl">
            <h2
              id="whats-new-title"
              className="text-xl font-extrabold leading-tight tracking-tight text-white sm:text-[28px]"
            >
              EconNotes Yenilendi!
            </h2>
            <p
              id="whats-new-subtitle"
              className="mt-1.5 text-xs leading-relaxed text-blue-100/95 sm:text-sm"
            >
              Platforma eklenen yeni özellikleri ve geliştirilen araçları keşfet. Daha verimli bir
              EconNotes deneyimi seni bekliyor!
            </p>
          </div>

          {/* Interactive Segmented Step Progress Indicator */}
          <div className="relative z-10 mt-4 space-y-1.5">
            <div
              role="progressbar"
              aria-label="Yenilikler tanıtımı ilerlemesi"
              aria-valuenow={stepIndex + 1}
              aria-valuemin={1}
              aria-valuemax={totalSteps}
              className="grid grid-cols-6 gap-1.5"
            >
              {WHATS_NEW_STEPS.map((step, idx) => (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => setStepIndex(idx)}
                  aria-label={`Adım ${step.stepNumber}: ${step.title}`}
                  aria-current={idx === stepIndex ? 'step' : undefined}
                  className={cn(
                    'h-1.5 rounded-full transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-white',
                    idx <= stepIndex ? 'bg-white' : 'bg-white/25 hover:bg-white/45',
                  )}
                />
              ))}
            </div>
            <div className="flex items-center justify-between text-[11px] font-medium text-blue-100/90">
              <span>
                Adım {activeStep.stepNumber} / {totalSteps} • {activeStep.badge}
              </span>
              <span className="tabular-nums font-bold">%{progressPercent}</span>
            </div>
          </div>
        </div>

        {/* Scrollable Two-Column Step Body */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-8 sm:py-6">
          <div className="grid grid-cols-1 items-start gap-5 md:grid-cols-12 md:gap-6">
            {/* Step Copy & Verified Feature Bullets */}
            <div className="space-y-3.5 md:col-span-7">
              <div className="flex items-center gap-3">
                <span
                  className={cn(
                    'flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-white shadow-sm',
                    isNovember10
                      ? 'bg-zinc-900 dark:bg-zinc-200 dark:text-zinc-950'
                      : 'bg-gradient-to-br from-[#0b2a6e] to-[#2563eb]',
                  )}
                >
                  <StepIcon className="h-5 w-5" strokeWidth={2} />
                </span>
                <div className="min-w-0">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-primary">
                    Adım {activeStep.stepNumber}
                  </p>
                  <h3 className="text-lg font-extrabold leading-snug tracking-tight text-foreground sm:text-xl">
                    {activeStep.title}
                  </h3>
                </div>
              </div>

              <p className="text-sm leading-relaxed text-muted-foreground">
                {activeStep.description}
              </p>

              <ul className="space-y-2">
                {activeStep.bullets.map((bullet) => (
                  <li
                    key={bullet}
                    className="flex items-start gap-2.5 rounded-xl border border-slate-200/80 bg-slate-50/75 px-3 py-2 text-xs font-medium leading-snug text-foreground dark:border-slate-800 dark:bg-slate-900/50 sm:text-[13px]"
                  >
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#174ec4] dark:text-blue-400" />
                    <span>{bullet}</span>
                  </li>
                ))}
              </ul>

              {activeStep.footnote && (
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {activeStep.footnote}
                </p>
              )}
            </div>

            {/* Real UI Component Mini-Preview */}
            <div className="md:col-span-5">
              <StepVisualPreview stepId={activeStep.id} />
            </div>
          </div>
        </div>

        {/* Responsive Action Footer */}
        <div className="shrink-0 border-t border-slate-200/80 bg-card/95 px-5 py-3.5 dark:border-slate-800 sm:px-8 sm:py-4">
          <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="button"
              onClick={() => handleClose('skipped')}
              className="inline-flex h-10 w-full items-center justify-center rounded-full px-4 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:w-auto sm:justify-start"
            >
              Atla
            </button>

            <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center sm:gap-2.5">
              <Button
                type="button"
                variant="outline"
                onClick={() => setStepIndex((idx) => Math.max(0, idx - 1))}
                disabled={isFirst}
                className="h-11 rounded-full px-5 text-xs font-semibold sm:text-sm"
              >
                <ChevronLeft className="h-4 w-4 shrink-0" />
                <span>Geri</span>
              </Button>

              {isLast ? (
                <Button
                  type="button"
                  onClick={() => handleClose('completed')}
                  className={cn(
                    'h-11 gap-1.5 rounded-full px-5 text-xs font-bold text-white shadow-[0_10px_24px_-8px_rgba(23,78,196,0.55)] transition-all hover:brightness-105 active:scale-[0.99] sm:px-6 sm:text-sm',
                    isNovember10
                      ? 'bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-950'
                      : 'bg-gradient-to-r from-[#0b2a6e] via-[#174ec4] to-[#2563eb]',
                  )}
                >
                  <span className="truncate">EconNotes&apos;u Keşfetmeye Başla</span>
                  <ArrowRight className="h-4 w-4 shrink-0" />
                </Button>
              ) : (
                <Button
                  type="button"
                  onClick={() => setStepIndex((idx) => Math.min(totalSteps - 1, idx + 1))}
                  className={cn(
                    'h-11 gap-1.5 rounded-full px-6 text-xs font-bold text-white shadow-[0_10px_24px_-8px_rgba(23,78,196,0.55)] transition-all hover:brightness-105 active:scale-[0.99] sm:text-sm',
                    isNovember10
                      ? 'bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-950'
                      : 'bg-gradient-to-r from-[#0b2a6e] via-[#174ec4] to-[#2563eb]',
                  )}
                >
                  <span>İleri</span>
                  <ChevronRight className="h-4 w-4 shrink-0" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WhatsNewModal;
