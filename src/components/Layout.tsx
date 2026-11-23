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

const Layout = ({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) => {
  const { config } = useSiteConfig();
  const seasonalTheme = getSeasonalTheme(config.theme.seasonalMode || 'default');
  const isNovember10 = seasonalTheme?.id === 'november10';

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
      <div className="relative z-10 flex min-h-[100dvh] flex-col md:pl-[16rem]">
        <Header />

        <main
          className={cn(
            'relative z-10 flex-1 min-w-0 opacity-100 visible',
            wide
              ? 'py-4 pb-[calc(env(safe-area-inset-bottom,0px)+6rem)] sm:pb-28 md:py-5'
              : 'py-4 pb-[calc(env(safe-area-inset-bottom,0px)+6rem)] sm:pb-28 md:py-6',
          )}
          style={{
            paddingLeft: 'env(safe-area-inset-left, 0px)',
            paddingRight: 'env(safe-area-inset-right, 0px)',
          }}
        >
          <div
            className={cn(
              'mx-auto w-full min-w-0 opacity-100 visible text-foreground',
              wide ? 'max-w-[1680px] px-3 sm:px-5 md:px-6' : 'max-w-[1440px] px-3.5 sm:px-6 lg:px-8',
            )}
          >
            {children}
          </div>
        </main>

        <footer className="relative z-10 flex items-center justify-center border-t border-slate-200/70 dark:border-slate-800/80 bg-card/40 px-6 py-4 pb-[calc(env(safe-area-inset-bottom,0px)+6rem)] text-center text-xs text-muted-foreground sm:pb-28 md:pb-4">
          <span>EconNotes, Düzce Üniversitesi öğrencileri tarafından geliştirilmiştir.</span>
        </footer>
      </div>

      <MobileBottomNav />
    </div>
  );
};

export default Layout;
