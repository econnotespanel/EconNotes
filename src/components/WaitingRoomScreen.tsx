import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  BookOpen,
  Bot,
  Building2,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  GraduationCap,
  LifeBuoy,
  Lock,
  LogOut,
  Mail,
  Moon,
  RotateCw,
  ShieldCheck,
  Sun,
  Target,
  User,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import EconLogo from '@/components/EconLogo';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { getSeasonalTheme, useSiteConfig } from '@/contexts/SiteConfigContext';
import { useTheme } from '@/contexts/ThemeContext';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { APP_VERSION_LABEL } from '@/lib/version';

const LIVE_POLL_INTERVAL_MS = 20_000;
const FOCUS_CHECK_COOLDOWN_MS = 8_000;

export type ApplicationStageStatus = 'completed' | 'current' | 'upcoming' | 'rejected';

export interface ApplicationStep {
  id: 'received' | 'review' | 'access';
  number: number;
  title: string;
  subtitle: string;
  status: ApplicationStageStatus;
}

export function buildApplicationSteps(approvalStatus?: string | null): ApplicationStep[] {
  const normalized = approvalStatus || 'pending';
  if (normalized === 'approved') {
    return [
      {
        id: 'received',
        number: 1,
        title: 'Başvuru Alındı',
        subtitle: 'Tamamlandı',
        status: 'completed',
      },
      {
        id: 'review',
        number: 2,
        title: 'Yönetici İncelemesi',
        subtitle: 'Tamamlandı',
        status: 'completed',
      },
      {
        id: 'access',
        number: 3,
        title: 'Hesap Erişimi',
        subtitle: 'Erişim açıldı',
        status: 'completed',
      },
    ];
  }

  if (normalized === 'rejected') {
    return [
      {
        id: 'received',
        number: 1,
        title: 'Başvuru Alındı',
        subtitle: 'Tamamlandı',
        status: 'completed',
      },
      {
        id: 'review',
        number: 2,
        title: 'Yönetici İncelemesi',
        subtitle: 'Onaylanmadı',
        status: 'rejected',
      },
      {
        id: 'access',
        number: 3,
        title: 'Hesap Erişimi',
        subtitle: 'Erişim kapalı',
        status: 'upcoming',
      },
    ];
  }

  // Pending (default unapproved state — never displays unapproved steps as completed)
  return [
    {
      id: 'received',
      number: 1,
      title: 'Başvuru Alındı',
      subtitle: 'Tamamlandı',
      status: 'completed',
    },
    {
      id: 'review',
      number: 2,
      title: 'Yönetici İncelemesi',
      subtitle: 'Devam Ediyor',
      status: 'current',
    },
    {
      id: 'access',
      number: 3,
      title: 'Hesap Erişimi',
      subtitle: 'Onay sonrasında açılacak',
      status: 'upcoming',
    },
  ];
}

export function extractRejectionReason(
  profile?: Record<string, unknown> | null,
  userMetadata?: Record<string, unknown> | null,
): string | null {
  const candidates = [
    profile?.rejection_reason,
    profile?.approval_rejection_reason,
    profile?.rejected_reason,
    userMetadata?.rejection_reason,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }
  return null;
}

function formatGradeLabel(grade: number | string | null | undefined): string {
  const num = Number(grade);
  if (!Number.isFinite(num) || num <= 0) return '';
  if (num === 5) return '5. Sınıf / Yüksek Lisans';
  return `${num}. Sınıf`;
}

function formatRegistrationDate(iso?: string | null): string {
  if (!iso) return '—';
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return '—';
  return new Intl.DateTimeFormat('tr-TR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed);
}

const UNLOCKED_FEATURES = [
  { icon: BookOpen, label: 'Ders Notları' },
  { icon: GraduationCap, label: 'Çalışma Stüdyosu' },
  { icon: Target, label: 'KPSS Merkezi' },
  { icon: Bot, label: 'Akademik Asistan' },
] as const;

export const WaitingRoomScreen: React.FC = () => {
  const { user, profile, signOut, refreshProfile } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { config } = useSiteConfig();
  const navigate = useNavigate();

  const seasonalTheme = getSeasonalTheme(config.theme.seasonalMode || 'default');
  const isNovember10 = seasonalTheme?.id === 'november10';

  const [checking, setChecking] = useState(false);
  const [liveRejectionReason, setLiveRejectionReason] = useState<string | null>(null);
  const inFlightRef = useRef(false);
  const lastCheckMsRef = useRef<number>(Date.now());
  const lastKnownStatusRef = useRef<string>(profile?.approval_status || 'pending');

  const approvalStatus = profile?.approval_status || 'pending';
  const isRejected = approvalStatus === 'rejected';
  const isApprovedNow = approvalStatus === 'approved';

  useEffect(() => {
    lastKnownStatusRef.current = approvalStatus;
  }, [approvalStatus]);

  const checkLiveStatus = useCallback(
    async (manual = false) => {
      if (!user?.id || inFlightRef.current) return;
      if (!manual && typeof document !== 'undefined' && document.visibilityState !== 'visible') {
        return;
      }

      inFlightRef.current = true;
      if (manual) setChecking(true);

      try {
        // Lightweight targeted query (handles optional rejection_reason column safely)
        let row: { approval_status?: string | null; rejection_reason?: string | null } | null = null;
        let queryError: { message?: string } | null = null;

        const primaryRes = await supabase
          .from('profiles')
          .select('approval_status, approved_at, rejection_reason')
          .eq('user_id', user.id)
          .maybeSingle();

        if (primaryRes.error && primaryRes.error.message?.includes('rejection_reason')) {
          const fallbackRes = await supabase
            .from('profiles')
            .select('approval_status, approved_at')
            .eq('user_id', user.id)
            .maybeSingle();
          row = fallbackRes.data as typeof row;
          queryError = fallbackRes.error;
        } else {
          row = primaryRes.data as typeof row;
          queryError = primaryRes.error;
        }

        if (queryError) {
          if (manual) {
            toast.error('Durum kontrol edilemedi. Lütfen tekrar deneyin.');
          }
          return;
        }

        const now = Date.now();
        lastCheckMsRef.current = now;

        if (row?.rejection_reason && typeof row.rejection_reason === 'string') {
          setLiveRejectionReason(row.rejection_reason.trim());
        }

        const nextStatus = row?.approval_status || 'pending';
        const statusChanged = nextStatus !== lastKnownStatusRef.current;

        if (statusChanged || manual) {
          await refreshProfile();
        }

        if (nextStatus === 'approved') {
          // ApprovalGate immediately unmounts WaitingRoomScreen; ensure user lands on home cleanly
          return;
        }

        if (manual) {
          if (nextStatus === 'rejected') {
            toast.error('Başvurunuz yönetici ekibi tarafından onaylanmadı.');
          } else {
            toast.info('Başvuru durumunuz güncel: Yönetici onayı bekleniyor.');
          }
        }
      } catch {
        if (manual) {
          toast.error('Durum kontrol edilemedi. Lütfen tekrar deneyin.');
        }
      } finally {
        inFlightRef.current = false;
        if (manual) setChecking(false);
      }
    },
    [refreshProfile, user?.id],
  );

  // Calm periodic live polling + tab-return check (zero wasteful background requests)
  useEffect(() => {
    if (!user?.id || isApprovedNow) return;

    const intervalId = window.setInterval(() => {
      void checkLiveStatus(false);
    }, LIVE_POLL_INTERVAL_MS);

    const handleVisibilityOrFocus = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastCheckMsRef.current >= FOCUS_CHECK_COOLDOWN_MS) {
        void checkLiveStatus(false);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityOrFocus);
    window.addEventListener('focus', handleVisibilityOrFocus);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      window.removeEventListener('focus', handleVisibilityOrFocus);
    };
  }, [checkLiveStatus, isApprovedNow, user?.id]);

  // If rejected, attempt one initial fetch for an explicit rejection_reason if not already on profile
  useEffect(() => {
    if (isRejected && user?.id) {
      void checkLiveStatus(false);
    }
  }, [checkLiveStatus, isRejected, user?.id]);

  const handleSignOut = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  const userMeta = (user?.user_metadata || {}) as Record<string, unknown>;
  const fullName =
    profile?.full_name?.trim() ||
    (typeof userMeta.full_name === 'string' ? userMeta.full_name.trim() : '') ||
    (typeof userMeta.name === 'string' ? userMeta.name.trim() : '') ||
    'Değerli Öğrencimiz';
  const email = user?.email || '—';
  const university =
    profile?.university?.trim() ||
    (typeof userMeta.university === 'string' ? userMeta.university.trim() : '') ||
    'Belirtilmedi';
  const department =
    profile?.department?.trim() ||
    (typeof userMeta.department === 'string' ? userMeta.department.trim() : '') ||
    'Belirtilmedi';
  const gradeLabel = formatGradeLabel(profile?.grade ?? (userMeta.grade as number | string | null));
  const departmentAndGrade = gradeLabel ? `${department} • ${gradeLabel}` : department;
  const registrationDate = formatRegistrationDate(profile?.created_at || user?.created_at);

  const rejectionReason = useMemo(
    () =>
      liveRejectionReason ||
      extractRejectionReason(
        profile as unknown as Record<string, unknown> | null,
        userMeta,
      ),
    [liveRejectionReason, profile, userMeta],
  );

  const steps = useMemo(() => buildApplicationSteps(approvalStatus), [approvalStatus]);

  const registrationFields = useMemo(
    () => [
      { id: 'full_name', label: 'Ad Soyad', value: fullName, icon: User, spanClass: '' },
      { id: 'email', label: 'E-posta', value: email, icon: Mail, spanClass: 'lg:col-span-2' },
      { id: 'university', label: 'Üniversite', value: university, icon: Building2, spanClass: '' },
      {
        id: 'department_grade',
        label: 'Bölüm ve Sınıf',
        value: departmentAndGrade,
        icon: GraduationCap,
        spanClass: '',
      },
      {
        id: 'created_at',
        label: 'Kayıt Tarihi',
        value: registrationDate,
        icon: Calendar,
        spanClass: 'col-span-2 max-[379px]:col-span-1 lg:col-span-1',
      },
    ],
    [departmentAndGrade, email, fullName, registrationDate, university],
  );

  return (
    <div
      data-testid="waiting-room-screen"
      className="relative flex min-h-[100dvh] w-full flex-col overflow-x-clip bg-background text-foreground selection:bg-primary/20"
    >
      {/* Subtle Dashboard-Consistent Ambient Backdrop (Light & Dark Navy) */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
        <div
          className={cn(
            'absolute -top-36 right-1/4 h-[380px] w-[580px] rounded-full blur-[120px]',
            isNovember10
              ? 'bg-zinc-500/10'
              : 'bg-gradient-to-br from-[#003791]/12 via-[#2563eb]/8 to-transparent dark:from-[#0070d1]/18 dark:via-[#2563eb]/10',
          )}
        />
        <div
          className={cn(
            'absolute -bottom-32 left-1/4 h-[340px] w-[500px] rounded-full blur-[120px]',
            isNovember10
              ? 'bg-zinc-500/10'
              : 'bg-gradient-to-tl from-[#0ea5e9]/10 via-[#174ec4]/6 to-transparent dark:from-[#0090ff]/12',
          )}
        />
      </div>

      {/* Top Navigation Bar — Safe Area & Dynamic Island Ready */}
      <header className="sticky top-0 z-30 w-full border-b border-slate-200/75 bg-background/95 backdrop-blur-md dark:border-slate-800/85">
        <div
          style={{
            paddingTop: 'calc(env(safe-area-inset-top, 0px) + var(--ios-pwa-top-buffer, 0px))',
            paddingLeft: 'env(safe-area-inset-left, 0px)',
            paddingRight: 'env(safe-area-inset-right, 0px)',
          }}
        >
          <div className="mx-auto flex h-[58px] w-full max-w-5xl items-center justify-between gap-2 px-3.5 sm:h-[68px] sm:px-6">
            <div className="flex min-w-0 shrink-0 items-center gap-2">
              <EconLogo className="h-[21px] w-auto max-w-[116px] sm:h-[26px] sm:max-w-none" />
            </div>

            <div className="flex shrink-0 items-center gap-1.5 sm:gap-2.5">
              <button
                type="button"
                onClick={toggleTheme}
                aria-label={theme === 'dark' ? 'Açık moda geç' : 'Koyu moda geç'}
                title={theme === 'dark' ? 'Açık moda geç' : 'Koyu moda geç'}
                className="inline-flex h-9 sm:h-10 items-center justify-center gap-1.5 rounded-full border border-slate-200/90 bg-card px-2.5 sm:px-3.5 text-xs font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-100 hover:text-slate-950 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 dark:border-slate-800 dark:text-slate-200 dark:hover:bg-slate-800 dark:hover:text-white"
              >
                {theme === 'dark' ? (
                  <Sun className="h-4 w-4 shrink-0 text-amber-400" strokeWidth={1.9} />
                ) : (
                  <Moon className="h-4 w-4 shrink-0 text-[#174ec4]" strokeWidth={1.9} />
                )}
                <span className="hidden sm:inline">
                  {theme === 'dark' ? 'Açık Mod' : 'Koyu Mod'}
                </span>
              </button>

              <button
                type="button"
                onClick={handleSignOut}
                className="inline-flex h-9 sm:h-10 items-center justify-center gap-1.5 rounded-full border border-slate-200/90 bg-card px-3 sm:px-4 text-xs font-semibold text-slate-700 shadow-sm transition-colors hover:border-destructive/35 hover:bg-destructive/10 hover:text-destructive focus:outline-none focus-visible:ring-2 focus-visible:ring-destructive/40 dark:border-slate-800 dark:text-slate-200 dark:hover:border-destructive/40 dark:hover:bg-destructive/15 dark:hover:text-rose-300"
              >
                <LogOut className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
                <span>Çıkış Yap</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main
        className="relative z-10 mx-auto flex w-full max-w-4xl flex-1 flex-col justify-center px-3.5 py-5 sm:px-6 sm:py-8"
        style={{
          paddingLeft: 'max(0.875rem, env(safe-area-inset-left, 0px))',
          paddingRight: 'max(0.875rem, env(safe-area-inset-right, 0px))',
        }}
      >
        <div className="space-y-4 sm:space-y-5">
          {/* 1. HERO WELCOME CARD (Dashboard Navy/Electric Blue Aesthetic) */}
          <section
            aria-labelledby="waiting-room-heading"
            className={cn(
              'relative overflow-hidden rounded-[22px] sm:rounded-[26px] px-5 py-6 text-white shadow-[0_16px_38px_-14px_rgba(6,24,61,0.48)] sm:px-8 sm:py-8',
              isNovember10
                ? 'bg-gradient-to-r from-zinc-950 via-zinc-900 to-zinc-800'
                : isRejected
                  ? 'bg-gradient-to-br from-[#2b0b16] via-[#5c1227] to-[#881337]'
                  : 'bg-gradient-to-r from-[#06183d] via-[#0b2a6e] to-[#174ec4]',
            )}
          >
            {/* Single subtle curved vector light-arc (pure SVG, zero raster art) */}
            <svg
              aria-hidden="true"
              data-testid="waiting-banner-lines"
              viewBox="0 0 960 240"
              fill="none"
              preserveAspectRatio="none"
              className="pointer-events-none absolute inset-0 z-0 h-full w-full opacity-35"
            >
              <path
                d="M360 245 C495 130, 630 45, 830 -15"
                stroke="url(#waitingArc1)"
                strokeWidth="1.5"
              />
              <defs>
                <linearGradient
                  id="waitingArc1"
                  x1="360"
                  y1="245"
                  x2="830"
                  y2="-15"
                  gradientUnits="userSpaceOnUse"
                >
                  <stop
                    stopColor={isRejected ? '#fda4af' : isNovember10 ? '#d4d4d8' : '#60a5fa'}
                    stopOpacity="0"
                  />
                  <stop
                    offset="0.5"
                    stopColor={isRejected ? '#fecdd3' : isNovember10 ? '#f4f4f5' : '#93c5fd'}
                    stopOpacity="0.8"
                  />
                  <stop
                    offset="1"
                    stopColor={isRejected ? '#fda4af' : isNovember10 ? '#d4d4d8' : '#60a5fa'}
                    stopOpacity="0"
                  />
                </linearGradient>
              </defs>
            </svg>
            <div
              aria-hidden="true"
              className={cn(
                'pointer-events-none absolute -right-14 -top-20 z-0 h-56 w-56 rounded-full blur-3xl',
                isRejected ? 'bg-rose-400/20' : 'bg-sky-400/20',
              )}
            />

            <div className="relative z-10 space-y-4">
              {(isRejected || isApprovedNow) && (
                <div className="flex flex-wrap items-center gap-2.5">
                  {isRejected ? (
                    <span
                      data-testid="waiting-status-badge"
                      className="inline-flex items-center gap-2 rounded-full border border-rose-300/40 bg-rose-500/25 px-3.5 py-1.5 text-xs font-bold text-rose-100 backdrop-blur-md"
                    >
                      <XCircle className="h-3.5 w-3.5 shrink-0" />
                      <span>Başvuru Onaylanmadı</span>
                    </span>
                  ) : (
                    <span
                      data-testid="waiting-status-badge"
                      className="inline-flex items-center gap-2 rounded-full border border-emerald-300/40 bg-emerald-500/25 px-3.5 py-1.5 text-xs font-bold text-emerald-100 backdrop-blur-md"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                      <span>Hesabınız Onaylandı</span>
                    </span>
                  )}
                </div>
              )}

              {/* Greeting Title & Subtitle */}
              <div className="max-w-2xl space-y-2">
                <h1
                  id="waiting-room-heading"
                  className="text-[24px] font-extrabold leading-tight tracking-tight text-white sm:text-[32px] sm:leading-[1.15]"
                >
                  {isRejected ? (
                    'Kayıt Başvurunuz Onaylanmadı'
                  ) : (
                    <>
                      Hoş Geldiniz,{' '}
                      <span className={isNovember10 ? 'text-zinc-300' : 'text-[#8ec5ff]'}>
                        {fullName}!
                      </span>
                    </>
                  )}
                </h1>
                <p className="text-[13.5px] leading-relaxed text-blue-100/95 sm:text-[15px]">
                  {isRejected
                    ? 'EconNotes kayıt başvurunuz yönetici ekibimiz tarafından incelenmiş ancak mevcut hâliyle onaylanamamıştır.'
                    : 'EconNotes topluluğuna katılım başvurunuz başarıyla alındı. Hesabınız şu anda yönetici ekibimizin incelemesindedir.'}
                </p>
              </div>
            </div>
          </section>

          {/* Conditional Real Rejection Reason Card (shown ONLY when rejected) */}
          {isRejected && (
            <section
              role="alert"
              data-testid="rejection-reason-card"
              className="rounded-[22px] border border-destructive/30 bg-card p-4 shadow-[var(--panel-shadow)] sm:p-5"
            >
              <div className="flex items-start gap-3.5">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
                  <AlertCircle className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1 space-y-1">
                  <h2 className="text-sm font-bold text-foreground sm:text-[15px]">
                    Yönetici Değerlendirme Notu
                  </h2>
                  {rejectionReason ? (
                    <p className="text-xs leading-relaxed text-foreground/90 sm:text-sm">
                      {rejectionReason}
                    </p>
                  ) : (
                    <p className="text-xs leading-relaxed text-muted-foreground sm:text-sm">
                      Yönetici ekibi ek bir ret nedeni belirtmedi. Bilgilerinizde eksiklik olduğunu
                      düşünüyorsanız Destek Merkezi üzerinden doğrudan bizimle iletişime geçebilirsiniz.
                    </p>
                  )}
                </div>
              </div>
            </section>
          )}

          {/* 2. THREE-STEP DYNAMIC APPLICATION PROGRESS INDICATOR */}
          <section
            aria-label="Başvuru süreci adımları"
            data-testid="waiting-progress-stepper"
            className="rounded-[22px] border border-slate-200/85 bg-card p-4 shadow-[var(--panel-shadow)] dark:border-slate-800/90 sm:p-6"
          >
            <div className="mb-4 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-[18px] w-[18px] shrink-0 text-primary" strokeWidth={2} />
                <h2 className="text-[15px] font-bold tracking-tight text-foreground sm:text-base">
                  Başvuru Durumu
                </h2>
              </div>
              <span className="text-xs font-medium text-muted-foreground">
                {isRejected
                  ? 'İnceleme sonuçlandı'
                  : isApprovedNow
                    ? '3 / 3 tamamlandı'
                    : 'Aşama 2 / 3'}
              </span>
            </div>

            <ol className="relative grid grid-cols-1 gap-3 md:grid-cols-3 md:gap-4">
              {steps.map((step, index) => {
                const isDone = step.status === 'completed';
                const isCurrent = step.status === 'current';
                const isStepRejected = step.status === 'rejected';

                return (
                  <li
                    key={step.id}
                    data-testid={`application-step-${step.id}`}
                    data-step-status={step.status}
                    aria-current={isCurrent ? 'step' : undefined}
                    className={cn(
                      'relative flex items-start gap-3.5 rounded-2xl border p-3.5 transition-colors sm:p-4',
                      isDone
                        ? 'border-blue-200/80 bg-blue-50/55 dark:border-blue-500/25 dark:bg-blue-500/10'
                        : isCurrent
                          ? 'border-primary/45 bg-gradient-to-br from-blue-50/90 via-card to-sky-50/50 ring-1 ring-primary/15 dark:border-blue-400/40 dark:from-blue-500/15 dark:via-card dark:to-sky-500/10'
                          : isStepRejected
                            ? 'border-destructive/35 bg-destructive/5 dark:border-destructive/40 dark:bg-destructive/10'
                            : 'border-slate-200/75 bg-slate-50/60 dark:border-slate-800/80 dark:bg-slate-900/40',
                    )}
                  >
                    {/* Step Status Circle */}
                    <span
                      className={cn(
                        'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold shadow-sm',
                        isDone
                          ? isNovember10
                            ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950'
                            : 'bg-[#174ec4] text-white'
                          : isCurrent
                            ? 'border-2 border-primary bg-card text-primary'
                            : isStepRejected
                              ? 'bg-destructive text-white'
                              : 'border border-slate-300 bg-card text-slate-400 dark:border-slate-700 dark:text-slate-500',
                      )}
                    >
                      {isDone ? (
                        <Check className="h-4 w-4" strokeWidth={2.5} />
                      ) : isCurrent ? (
                        <Clock className="h-4 w-4" strokeWidth={2.2} />
                      ) : isStepRejected ? (
                        <XCircle className="h-4 w-4" strokeWidth={2.2} />
                      ) : (
                        <Lock className="h-3.5 w-3.5" strokeWidth={2} />
                      )}
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] font-bold tabular-nums text-muted-foreground">
                          {index + 1}.
                        </span>
                        <p className="truncate text-sm font-bold text-foreground">
                          {step.title}
                        </p>
                      </div>
                      <p
                        className={cn(
                          'mt-0.5 text-xs font-semibold leading-snug',
                          isDone
                            ? 'text-[#174ec4] dark:text-blue-300'
                            : isCurrent
                              ? 'text-amber-600 dark:text-amber-400'
                              : isStepRejected
                                ? 'text-destructive'
                                : 'text-muted-foreground',
                        )}
                      >
                        {step.subtitle}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>

          {/* 3. REGISTRATION DETAILS CARD */}
          <section
            aria-label="Kayıt bilgileriniz"
            data-testid="waiting-registration-info"
            className="rounded-[22px] border border-slate-200/85 bg-card p-4 shadow-[var(--panel-shadow)] dark:border-slate-800/90 sm:p-6"
          >
            <div className="mb-4 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <User className="h-[18px] w-[18px] shrink-0 text-primary" strokeWidth={2} />
                <h2 className="text-[15px] font-bold tracking-tight text-foreground sm:text-base">
                  Kayıt Bilgileriniz
                </h2>
              </div>
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                Başvuru Özeti
              </span>
            </div>

            <div className="grid grid-cols-2 max-[379px]:grid-cols-1 gap-2.5 sm:gap-3 lg:grid-cols-3">
              {registrationFields.map((field) => {
                const Icon = field.icon;
                return (
                  <div
                    key={field.id}
                    className={cn(
                      'flex min-w-0 items-start gap-3 rounded-2xl border border-slate-200/75 bg-slate-50/70 p-3 dark:border-slate-800/80 dark:bg-slate-900/45 sm:p-3.5',
                      field.spanClass,
                    )}
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[#174ec4] dark:bg-blue-500/15 dark:text-blue-400">
                      <Icon className="h-4 w-4" strokeWidth={1.9} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-medium text-muted-foreground">
                        {field.label}
                      </p>
                      <p
                        title={field.value}
                        className="mt-0.5 [overflow-wrap:anywhere] text-[13px] font-semibold leading-snug text-foreground sm:text-sm"
                      >
                        {field.value}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* 4. SIMPLIFIED INFORMATION CARD & ACTIONS */}
          <section
            aria-label="Bilgilendirme ve işlemler"
            className="rounded-[22px] border border-slate-200/85 bg-card p-4 shadow-[var(--panel-shadow)] dark:border-slate-800/90 sm:p-6"
          >
            <div className="space-y-4">
              <div className="space-y-1.5">
                <h2 className="text-[15px] font-bold leading-snug tracking-tight text-foreground sm:text-base">
                  Hesabınız onaylandığında EconNotes&apos;un tüm özelliklerine otomatik olarak erişebileceksiniz.
                </h2>
                <p className="text-xs leading-relaxed text-muted-foreground sm:text-sm">
                  Ders notları, Çalışma Stüdyosu, KPSS Merkezi, Akademik Asistan ve diğer özellikler
                  hesabınız aktif olduğunda kullanılabilir hâle gelecektir.
                </p>
              </div>

              {/* Minimal Real Feature Pills (Zero Decorative Art) */}
              <div className="flex flex-wrap gap-2">
                {UNLOCKED_FEATURES.map((feat) => {
                  const Icon = feat.icon;
                  return (
                    <span
                      key={feat.label}
                      className="inline-flex items-center gap-1.5 rounded-full border border-slate-200/85 bg-slate-50/80 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-200"
                    >
                      <Icon className="h-3.5 w-3.5 shrink-0 text-primary" strokeWidth={2} />
                      <span>{feat.label}</span>
                    </span>
                  );
                })}
              </div>

              {/* Oval Action Buttons */}
              <div className="flex flex-col gap-2.5 border-t border-slate-200/75 pt-4 dark:border-slate-800/80 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-[11.5px] leading-snug text-muted-foreground">
                  Bu sayfa onay durumunuzu otomatik olarak takip eder; onay verildiğinde erişiminiz
                  anında açılır.
                </p>

                <div className="flex flex-col gap-2 sm:flex-row sm:shrink-0 sm:items-center">
                  <Button
                    type="button"
                    onClick={() => void checkLiveStatus(true)}
                    disabled={checking}
                    className={cn(
                      'h-11 w-full gap-2 rounded-full px-6 text-xs sm:text-sm font-bold text-white shadow-[0_10px_24px_-8px_rgba(23,78,196,0.55)] transition-all hover:brightness-105 active:scale-[0.99] sm:w-auto',
                      isNovember10
                        ? 'bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-950'
                        : 'bg-gradient-to-r from-[#0b2a6e] via-[#174ec4] to-[#2563eb]',
                    )}
                  >
                    <RotateCw className={cn('h-4 w-4', checking && 'animate-spin')} />
                    <span>{checking ? 'Kontrol Ediliyor…' : 'Durumu Kontrol Et'}</span>
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => navigate('/support')}
                    className="h-11 w-full gap-2 rounded-full border-slate-200/90 px-5 text-xs sm:text-sm font-semibold hover:bg-slate-100/80 dark:border-slate-700 dark:hover:bg-slate-800/70 sm:w-auto"
                  >
                    <LifeBuoy className="h-4 w-4 text-primary" />
                    <span>Destek Merkezi</span>
                  </Button>
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>

      {/* Footer */}
      <footer
        className="relative z-10 border-t border-slate-200/70 bg-card/40 px-4 py-4 text-xs text-muted-foreground dark:border-slate-800/80"
        style={{
          paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 1rem)',
        }}
      >
        <div className="mx-auto flex w-full max-w-5xl flex-col items-center justify-between gap-1.5 text-center sm:flex-row sm:text-left">
          <span>EconNotes, Düzce Üniversitesi öğrencileri tarafından geliştirilmiştir.</span>
          <span className="font-mono text-[11px] text-muted-foreground/80">
            {APP_VERSION_LABEL}
          </span>
        </div>
      </footer>
    </div>
  );
};

export default WaitingRoomScreen;
