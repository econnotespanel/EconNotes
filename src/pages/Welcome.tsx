import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Compass,
  FileText,
  GraduationCap,
  Home,
  ListOrdered,
  MessageSquare,
  PartyPopper,
  Play,
  Sparkles,
  Target,
  Trophy,
  UserCircle2,
} from 'lucide-react';
import EconLogo from '@/components/EconLogo';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useOnboarding } from '@/contexts/OnboardingContext';
import { getSeasonalTheme, useSiteConfig } from '@/contexts/SiteConfigContext';
import { APP_VERSION, APP_VERSION_LABEL } from '@/lib/version';
import { cn } from '@/lib/utils';

const ROADMAP_MODULES = [
  { icon: Home, label: 'Ana Sayfan', detail: 'İstatistikler, XP ve akademik takvim' },
  { icon: FileText, label: 'Notlar', detail: 'Üniversite ve ders bazlı paylaşımlar' },
  { icon: GraduationCap, label: 'Çalışma Stüdyosu', detail: 'Özet, sınav, kart ve kavram haritası' },
  { icon: Trophy, label: 'Günlük Bilgi Yarışması', detail: '15 soru, XP ve özel ödüller' },
  { icon: ListOrdered, label: 'Puanlar & Liderlik', detail: 'XP geçmişi ve canlı sıralama' },
  { icon: MessageSquare, label: 'Mesajlar & Duyurular', detail: 'Topluluk iletişimi ve Destek Merkezi' },
  { icon: UserCircle2, label: 'Profil & Hesap', detail: 'Kişisel bilgiler ve gizlilik ayarları' },
] as const;

interface ReturnSlide {
  eyebrow: string;
  title: string;
  desc: string;
  icon: typeof Sparkles;
  bullets: string[];
}

const Welcome = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { profile, user, loading } = useAuth();
  const { state, canResumeTour, startTour, resumeTour, dismissWelcome } = useOnboarding();
  const { config } = useSiteConfig();
  const seasonalTheme = getSeasonalTheme(config.theme.seasonalMode || 'default');
  const isNovember10 = seasonalTheme?.id === 'november10';

  const isReturn = params.get('mode') === 'return';
  const [returnStep, setReturnStep] = useState(0);

  const firstName = useMemo(() => {
    const raw =
      profile?.full_name ||
      String((user?.user_metadata as Record<string, unknown> | undefined)?.full_name || '') ||
      '';
    return raw.trim().split(' ')[0] || 'Öğrenci';
  }, [profile, user]);

  useEffect(() => {
    if (!loading && !user) {
      const t = window.setTimeout(() => navigate('/login'), 4000);
      return () => window.clearTimeout(t);
    }
  }, [loading, user, navigate]);

  const acknowledgeReturnTour = () => {
    try {
      localStorage.setItem('econnotes_welcome_seen', '1');
      if (user) {
        localStorage.setItem(`econnotes_return_tour_${APP_VERSION}_${user.id}`, '1');
      }
    } catch {
      // ignore storage restrictions
    }
  };

  const handleStartExplore = () => {
    acknowledgeReturnTour();
    startTour({ fromBeginning: true });
  };

  const handleResumeExplore = () => {
    acknowledgeReturnTour();
    resumeTour();
  };

  const handleSkipForNow = () => {
    acknowledgeReturnTour();
    dismissWelcome();
  };

  // Returning-user summary flow (90+ days inactive, preserved per versioned return-tour rules)
  if (isReturn) {
    const returnSlides: ReturnSlide[] = [
      {
        eyebrow: 'Tekrar hoş geldin',
        icon: Sparkles,
        title: `${firstName}, seni yeniden görmek güzel.`,
        desc: `Bir süredir görüşemedik. ${APP_VERSION_LABEL} ile EconNotes daha hızlı, daha düzenli ve yeni çalışma araçlarıyla güncel.`,
        bullets: ['Yenilenen ana panel', 'Gelişmiş Çalışma Stüdyosu', 'Güçlendirilmiş hesap güvenliği'],
      },
      {
        eyebrow: 'Çalışma Stüdyosu',
        icon: GraduationCap,
        title: 'PDF ve notlarından çalışma materyalleri üret.',
        desc: 'Ayrıntılı ders özeti, deneme sınavı, çalışma kartları, videolu ders ve kavram haritası tek çalışma defterinde.',
        bullets: ['Ayrıntılı ders özetleri', 'Deneme sınavı & kartlar', 'Sınav çalışma planı'],
      },
      {
        eyebrow: 'Yarışma ve XP',
        icon: Trophy,
        title: 'Günlük Bilgi Yarışması ve Liderlik Tablosu.',
        desc: 'Her gün yenilenen 15 soruluk yarışmaya katıl, XP kazan ve canlı liderlik sıralamasında yerini takip et.',
        bullets: ['Günlük 15 soru', 'Canlı XP geçmişi', 'KPSS Merkezi ve görevler'],
      },
    ];
    const current = returnSlides[returnStep] ?? returnSlides[0];
    const ReturnIcon = current.icon;
    const progress = ((returnStep + 1) / returnSlides.length) * 100;

    return (
      <div
        className="relative flex min-h-[100dvh] w-full items-center justify-center overflow-x-clip bg-background px-4 py-8"
        style={{
          paddingTop: 'calc(env(safe-area-inset-top, 0px) + var(--ios-pwa-top-buffer, 0px) + 1.5rem)',
          paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 1.5rem)',
          paddingLeft: 'max(1rem, env(safe-area-inset-left, 0px))',
          paddingRight: 'max(1rem, env(safe-area-inset-right, 0px))',
        }}
      >
        <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
          <div className="absolute -top-32 right-1/4 h-80 w-80 rounded-full bg-[#174ec4]/12 blur-3xl" />
          <div className="absolute -bottom-32 left-1/4 h-80 w-80 rounded-full bg-[#0b2a6e]/12 blur-3xl" />
        </div>

        <div className="relative z-10 w-full max-w-2xl">
          <div className="mb-5 flex items-center gap-3.5">
            <EconLogo className="h-7 w-auto shrink-0 sm:h-8" />
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200/85 dark:bg-slate-800">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#0b2a6e] via-[#174ec4] to-[#3b82f6] transition-[width] duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="rounded-full border border-blue-200/80 bg-blue-50 px-2.5 py-0.5 text-xs font-bold tabular-nums text-[#0b2a6e] dark:border-blue-500/30 dark:bg-blue-500/15 dark:text-blue-300">
              {returnStep + 1}/{returnSlides.length}
            </span>
          </div>

          <div className="rounded-[24px] border border-slate-200/85 bg-card p-6 shadow-[var(--panel-shadow)] dark:border-slate-800/90 sm:p-9">
            <div className="space-y-5">
              <div className="flex items-center gap-2.5">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-[#174ec4] dark:bg-blue-500/15 dark:text-blue-400">
                  <ReturnIcon className="h-5 w-5" strokeWidth={1.9} />
                </span>
                <span className="rounded-full border border-blue-200/80 bg-blue-50 px-3 py-1 text-xs font-semibold text-[#0b2a6e] dark:border-blue-500/30 dark:bg-blue-500/15 dark:text-blue-300">
                  {current.eyebrow}
                </span>
              </div>

              <h1 className="text-2xl font-extrabold leading-tight tracking-tight text-foreground sm:text-3xl">
                {current.title}
              </h1>

              <p className="text-sm leading-relaxed text-muted-foreground sm:text-base">
                {current.desc}
              </p>

              <ul className="grid gap-2.5 sm:grid-cols-3">
                {current.bullets.map((bullet, idx) => (
                  <li
                    key={bullet}
                    className="flex items-center gap-2.5 rounded-2xl border border-slate-200/80 bg-muted/40 px-3.5 py-3 text-xs font-semibold text-foreground dark:border-slate-800"
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#174ec4] text-[11px] font-bold text-white">
                      {idx + 1}
                    </span>
                    <span className="leading-snug">{bullet}</span>
                  </li>
                ))}
              </ul>

              <div className="flex flex-col-reverse gap-3 border-t border-border/60 pt-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleSkipForNow}
                    className="text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
                  >
                    Panele geç
                  </button>
                  <button
                    type="button"
                    onClick={handleStartExplore}
                    className="text-sm font-semibold text-primary transition-colors hover:underline"
                  >
                    İnteraktif turu başlat
                  </button>
                </div>

                <div className="flex items-center justify-end gap-2">
                  {returnStep > 0 && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setReturnStep((s) => Math.max(0, s - 1))}
                      className="h-11 rounded-full px-5"
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Geri
                    </Button>
                  )}
                  <Button
                    type="button"
                    onClick={() => {
                      if (returnStep < returnSlides.length - 1) {
                        setReturnStep((s) => s + 1);
                      } else {
                        handleSkipForNow();
                      }
                    }}
                    className="h-11 rounded-full bg-gradient-to-r from-[#0b2a6e] via-[#174ec4] to-[#2563eb] px-6 font-semibold text-white hover:brightness-105"
                  >
                    {returnStep === returnSlides.length - 1 ? (
                      <>
                        Panele Git <PartyPopper className="h-4 w-4" />
                      </>
                    ) : (
                      <>
                        İleri <ChevronRight className="h-4 w-4" />
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="relative flex min-h-[100dvh] w-full flex-col items-center justify-center overflow-x-clip bg-background px-4 py-6 sm:px-6 sm:py-10"
      style={{
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + var(--ios-pwa-top-buffer, 0px) + 1.25rem)',
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 1.5rem)',
        paddingLeft: 'max(1rem, env(safe-area-inset-left, 0px))',
        paddingRight: 'max(1rem, env(safe-area-inset-right, 0px))',
      }}
    >
      {/* Subtle EconNotes brand ambient backdrop (pure CSS gradients, zero decorative images) */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
        <div
          className={cn(
            'absolute -top-36 right-1/4 h-[380px] w-[520px] rounded-full blur-[110px]',
            isNovember10 ? 'bg-zinc-500/10' : 'bg-[#174ec4]/12 dark:bg-[#2563eb]/16',
          )}
        />
        <div
          className={cn(
            'absolute -bottom-32 left-1/4 h-[340px] w-[460px] rounded-full blur-[110px]',
            isNovember10 ? 'bg-zinc-500/10' : 'bg-[#06183d]/10 dark:bg-[#0ea5e9]/12',
          )}
        />
      </div>

      <main className="relative z-10 w-full max-w-4xl space-y-5">
        {/* Top brand bar */}
        <div className="flex items-center justify-between gap-3 px-1">
          <EconLogo className="h-7 w-auto sm:h-8" />
          <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200/90 bg-card/90 px-3 py-1 text-[11px] font-semibold text-muted-foreground shadow-sm dark:border-slate-800">
            <Compass className="h-3.5 w-3.5 text-primary" />
            <span>Rehberli Platform Turu • 7 Adım</span>
          </span>
        </div>

        {/* Main Hero Welcome Card */}
        <section
          aria-labelledby="welcome-heading"
          className="overflow-hidden rounded-[26px] border border-slate-200/85 bg-card shadow-[0_18px_50px_-18px_rgba(6,24,61,0.16)] dark:border-slate-800/90 dark:shadow-[0_22px_60px_-18px_rgba(0,0,0,0.65)]"
        >
          {/* Deep Navy & Blue Brand Header Strip */}
          <div
            className={cn(
              'relative overflow-hidden px-5 py-7 text-white sm:px-9 sm:py-9',
              isNovember10
                ? 'bg-gradient-to-r from-zinc-950 via-zinc-900 to-zinc-800'
                : 'bg-gradient-to-br from-[#06183d] via-[#0b2a6e] to-[#174ec4]',
            )}
          >
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -right-12 -top-16 h-56 w-56 rounded-full bg-sky-400/20 blur-3xl"
            />
            <div className="relative z-10 max-w-2xl space-y-3.5">
              <p className="inline-flex items-center gap-2 text-xs font-semibold text-white sm:text-sm">
                <BookOpen className="h-4 w-4 shrink-0 text-white" />
                <span>Merhaba {firstName}, hesabın hazır</span>
              </p>

              <h1
                id="welcome-heading"
                className="text-[26px] font-extrabold leading-[1.15] tracking-tight text-white sm:text-[38px]"
              >
                EconNotes&apos;a Hoş Geldin!
              </h1>

              <p className="text-sm leading-relaxed text-blue-100/95 sm:text-base">
                Ders notlarını keşfetmeye, çalışma materyallerini oluşturmaya ve akademik yolculuğunu
                daha verimli hâle getirmeye hazır mısın? EconNotes&apos;un özelliklerini birlikte
                keşfedelim.
              </p>

              {/* Primary + Secondary Oval Action Buttons */}
              <div className="flex flex-col gap-2.5 pt-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
                <Button
                  type="button"
                  onClick={handleStartExplore}
                  className={cn(
                    'h-12 w-full gap-2 rounded-full px-7 text-sm font-bold shadow-[0_12px_28px_-8px_rgba(0,0,0,0.35)] transition-all hover:brightness-105 active:scale-[0.99] sm:w-auto',
                    isNovember10
                      ? 'bg-white text-zinc-950 hover:bg-zinc-100'
                      : 'bg-white text-[#0b2a6e] hover:bg-blue-50',
                  )}
                >
                  <Compass className="h-4 w-4" />
                  <span>Platformu Keşfet</span>
                  <ArrowRight className="h-4 w-4" />
                </Button>

                {canResumeTour && state.currentStep > 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleResumeExplore}
                    className="h-12 w-full gap-2 rounded-full border-white/30 bg-white/10 px-6 text-sm font-semibold text-white backdrop-blur-sm hover:bg-white/20 hover:text-white sm:w-auto"
                  >
                    <Play className="h-4 w-4 fill-current" />
                    <span>Kaldığın Yerden Devam Et (Adım {state.currentStep + 1}/7)</span>
                  </Button>
                )}

                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleSkipForNow}
                  className="h-12 w-full rounded-full border border-white/25 bg-transparent px-6 text-sm font-semibold text-white/95 hover:bg-white/12 hover:text-white sm:w-auto"
                >
                  Şimdilik Geç
                </Button>
              </div>
            </div>
          </div>

          {/* Real 7-Module Tour Preview Grid (Minimal Icons & Typography Only) */}
          <div className="p-5 sm:p-8">
            <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-sm font-bold tracking-tight text-foreground sm:text-base">
                  Rehberli turda seni neler bekliyor?
                </h2>
                <p className="text-xs text-muted-foreground">
                  Gerçek menüler ve ekran bileşenleri üzerinde adım adım hızlı tanıtım.
                </p>
              </div>
              <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-[11px] font-semibold text-[#174ec4] dark:bg-blue-500/15 dark:text-blue-300">
                <Target className="h-3.5 w-3.5" />
                <span>Yaklaşık 1 dakika</span>
              </span>
            </div>

            <ol className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {ROADMAP_MODULES.map((mod, index) => {
                const Icon = mod.icon;
                const done = state.completedSteps.includes(
                  ['dashboard-home', 'notes', 'study-studio', 'daily-trivia', 'points-leaderboard', 'messages-announcements', 'profile-account'][index],
                );
                return (
                  <li
                    key={mod.label}
                    className={cn(
                      'flex items-start gap-3 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-3.5 transition-colors dark:border-slate-800/80 dark:bg-slate-900/40',
                      index === ROADMAP_MODULES.length - 1 && 'sm:col-span-2 lg:col-span-3',
                    )}
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[#174ec4] dark:bg-blue-500/15 dark:text-blue-400">
                      <Icon className="h-4 w-4" strokeWidth={2} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] font-bold tabular-nums text-[#174ec4] dark:text-blue-400">
                          {index + 1}.
                        </span>
                        <span className="truncate text-xs font-bold text-foreground sm:text-[13px]">
                          {mod.label}
                        </span>
                        {done && (
                          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                        )}
                      </div>
                      <p className="mt-0.5 text-[11.5px] leading-snug text-muted-foreground">
                        {mod.detail}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>

            <p className="mt-4 text-center text-[11.5px] text-muted-foreground sm:text-left">
              İstediğin zaman turdan çıkabilir, daha sonra{' '}
              <strong className="font-semibold text-foreground">Profil</strong> veya{' '}
              <strong className="font-semibold text-foreground">Destek Merkezi</strong>{' '}
              üzerindeki <strong className="font-semibold text-foreground">Platformu Tanı</strong>{' '}
              seçeneğinden yeniden başlatabilirsin.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
};

export default Welcome;
