import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import SupportNotificationListener from '@/components/SupportNotificationListener';
import ContentNotificationListener from '@/components/ContentNotificationListener';
import DeviceNotificationBanner from '@/components/DeviceNotificationBanner';

const Layout = ({ children }: { children: React.ReactNode }) => {
  return (
    <div className="min-h-screen bg-background relative overflow-x-hidden selection:bg-primary/20">
      {/* Subtle PlayStation Cosmic Ambient Aurora */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[900px] h-[500px] bg-gradient-to-b from-[#003791]/12 dark:from-[#0070d1]/14 via-transparent to-transparent rounded-full blur-[100px] pointer-events-none" />
      </div>

      <SupportNotificationListener />
      <ContentNotificationListener />
      <DeviceNotificationBanner />
      <Header />
      <Sidebar />
      <main className="relative z-10 min-h-[calc(100vh-4rem)] min-w-0 px-3 py-5 pb-16 sm:px-4 md:ml-64 md:p-8 opacity-100 visible">
        <div className="mx-auto w-full max-w-7xl opacity-100 visible text-foreground">
          {children}
        </div>
      </main>
      <footer className="relative z-10 md:ml-64 text-center md:text-right px-6 py-4 text-xs text-muted-foreground border-t border-border/50 bg-card/30 backdrop-blur-sm">
        EconNotes, Düzce Üniversitesi öğrencileri tarafından geliştirilmiştir.
      </footer>
    </div>
  );
};

export default Layout;
