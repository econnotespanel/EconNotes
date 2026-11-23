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
      {/* Hafifletilmiş ve Mobil Performansı Optimize Edilmiş Arka Plan Katmanı */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
        {/* Masaüstünde zengin ambiyans */}
        <div className={cn(
          "hidden md:block absolute -top-32 left-1/4 -translate-x-1/2 w-[800px] h-[450px] rounded-full blur-[110px] pointer-events-none",
          isNovember10
            ? "bg-gradient-to-br from-neutral-500/10 dark:from-neutral-400/10 via-neutral-500/5 to-transparent"
            : "bg-gradient-to-br from-[#003791]/15 dark:from-[#0070d1]/18 via-[#00439c]/8 to-transparent"
        )} />
        <div className={cn(
          "hidden md:block absolute top-1/3 -right-20 w-[600px] h-[400px] rounded-full blur-[120px] pointer-events-none",
          isNovember10
            ? "bg-gradient-to-bl from-neutral-500/10 dark:from-neutral-400/10 via-transparent to-transparent"
            : "bg-gradient-to-bl from-[#00f0ff]/10 dark:from-[#0090ff]/12 via-transparent to-transparent"
        )} />
        {/* Mobilde GPU'yu yormayan, 60fps akıcı kaydırma sağlayan hafif ambiyans */}
        <div className="md:hidden absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-transparent pointer-events-none" />
      </div>

      <DeviceNotificationBanner />
      <ExamWishPopup />
      <BirthdayCelebrationPopup />
      <MondayWheelPopup />
      <DailyTriviaLauncher />
      <Header />
      <Sidebar />
      <main
        className={cn(
          "relative z-10 min-h-[calc(100dvh-4rem)] min-w-0 opacity-100 visible md:ml-[16.5rem]",
          wide
            ? "px-2.5 py-3 pb-[calc(env(safe-area-inset-bottom,0px)+6rem)] sm:px-4 sm:pb-28 md:px-4 md:py-4 xl:px-5"
            : "px-3 py-4 pb-[calc(env(safe-area-inset-bottom,0px)+6rem)] sm:px-4 sm:pb-28 md:p-8",
        )}
        style={{
          paddingLeft: 'max(0.75rem, env(safe-area-inset-left, 0px))',
          paddingRight: 'max(0.75rem, env(safe-area-inset-right, 0px))',
        }}
      >
        <div
          className={cn(
            "mx-auto w-full min-w-0 opacity-100 visible text-foreground",
            wide ? "max-w-[1680px]" : "max-w-7xl",
          )}
        >
          {children}
        </div>
      </main>
      <footer className="relative z-10 md:ml-[16.5rem] flex items-center justify-center px-6 py-4 pb-[calc(env(safe-area-inset-bottom,0px)+6rem)] sm:pb-28 md:pb-4 text-center text-xs text-muted-foreground border-t border-border/50 bg-card/30 backdrop-blur-sm">
        <span>EconNotes, Düzce Üniversitesi öğrencileri tarafından geliştirilmiştir.</span>
      </footer>
      <MobileBottomNav />
    </div>
  );
};

export default Layout;
