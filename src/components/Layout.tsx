import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import MobileBottomNav from '@/components/MobileBottomNav';
import DeviceNotificationBanner from '@/components/DeviceNotificationBanner';
import ExamWishPopup from '@/components/ExamWishPopup';
import BirthdayCelebrationPopup from '@/components/BirthdayCelebrationPopup';
import MondayWheelPopup from '@/components/MondayWheelPopup';
import DailyTriviaLauncher from '@/components/DailyTriviaLauncher';
import { useSiteConfig, getSeasonalTheme } from '@/contexts/SiteConfigContext';
import { cn } from '@/lib/utils';

const Layout = ({
  children,
  wide = false,
  studioMode = false,
  focusMode = false,
}: {
  children: React.ReactNode;
  wide?: boolean;
  studioMode?: boolean;
  focusMode?: boolean;
}) => {
  const { config } = useSiteConfig();
  const seasonalTheme = getSeasonalTheme(config.theme.seasonalMode || 'default');
  const isNovember10 = seasonalTheme?.id === 'november10';

  if (focusMode) {
    return (
      <div
        data-testid="studio-focus-shell"
        className="fixed inset-0 z-[60] flex h-[100dvh] w-full flex-col overflow-hidden bg-background text-foreground selection:bg-primary/20"
        style={{
          paddingTop: 'calc(env(safe-area-inset-top, 0px) + var(--ios-pwa-top-buffer, 0px))',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          paddingLeft: 'env(safe-area-inset-left, 0px)',
          paddingRight: 'env(safe-area-inset-right, 0px)',
        }}
      >
        <div className="min-h-0 flex-1 overflow-y-auto px-2.5 py-2 sm:px-3.5 sm:py-2.5">
          {children}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-background relative overflow-x-clip selection:bg-primary/20">
      {/* Subtle Light/Dark Ambient Canvas Backdrop */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
        <div
          className={cn(
            'hidden md:block absolute -top-36 right-1/4 w-[760px] h-[420px] rounded-full blur-[120px] pointer-events-none',
            isNovember10
              ? 'bg-gradient-to-br from-neutral-500/10 dark:from-neutral-400/10 via-neutral-500/5 to-transparent'
              : 'bg-gradient-to-br from-[#003791]/10 dark:from-[#0070d1]/15 via-[#2563eb]/5 to-transparent',
          )}
        />
        <div
          className={cn(
            'hidden md:block absolute bottom-0 right-0 w-[560px] h-[360px] rounded-full blur-[120px] pointer-events-none',
            isNovember10
              ? 'bg-gradient-to-tl from-neutral-500/10 dark:from-neutral-400/10 via-transparent to-transparent'
              : 'bg-gradient-to-tl from-[#0ea5e9]/10 dark:from-[#0090ff]/10 via-transparent to-transparent',
          )}
        />
      </div>

      <DeviceNotificationBanner />
      <ExamWishPopup />
      <BirthdayCelebrationPopup />
      <MondayWheelPopup />
      <DailyTriviaLauncher />

      {/* Full-Height Left Navigation Sidebar (Desktop) & Slide-Over Drawer (Mobile) */}
      <Sidebar />

      {/* Right Main Column: Header + Content + Footer */}
      <div className="relative z-10 flex min-h-[100dvh] flex-col md:pl-[17.25rem]">
        <Header />

        <main
          className={cn(
            'relative z-10 flex-1 min-w-0 opacity-100 visible',
            studioMode
              ? 'py-2 pb-[calc(env(safe-area-inset-bottom,0px)+5.5rem)] md:py-2.5 md:pb-2.5'
              : wide
              ? 'py-4 pb-6 md:py-5'
              : 'py-4 pb-6 md:py-6',
          )}
          style={{
            paddingLeft: 'env(safe-area-inset-left, 0px)',
            paddingRight: 'env(safe-area-inset-right, 0px)',
          }}
        >
          <div
            className={cn(
              'mx-auto w-full min-w-0 opacity-100 visible text-foreground',
              studioMode
                ? 'max-w-none px-2.5 sm:px-3.5 md:px-4'
                : wide
                ? 'max-w-[1680px] px-3 sm:px-5 md:px-6'
                : 'max-w-[1440px] px-3.5 sm:px-6 lg:px-8',
            )}
          >
            {children}
          </div>
        </main>

        {!studioMode && (
          <footer className="relative z-10 flex items-center justify-center border-t border-slate-200/70 dark:border-slate-800/80 bg-card/40 px-6 py-4 pb-[calc(env(safe-area-inset-bottom,0px)+6.75rem)] text-center text-xs text-muted-foreground md:pb-5">
            <span>EconNotes, Düzce Üniversitesi öğrencileri tarafından geliştirilmiştir.</span>
          </footer>
        )}
      </div>

      <MobileBottomNav />
    </div>
  );
};

export default Layout;
