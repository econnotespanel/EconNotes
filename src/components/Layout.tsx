import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import MobileBottomNav from '@/components/MobileBottomNav';
import SupportNotificationListener from '@/components/SupportNotificationListener';
import ContentNotificationListener from '@/components/ContentNotificationListener';
import DeviceNotificationBanner from '@/components/DeviceNotificationBanner';

const Layout = ({ children }: { children: React.ReactNode }) => {
  return (
    <div className="min-h-screen bg-background relative overflow-x-hidden selection:bg-primary/20">
      {/* Hafifletilmiş ve Mobil Performansı Optimize Edilmiş Arka Plan Katmanı */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
        {/* Masaüstünde zengin ambiyans */}
        <div className="hidden md:block absolute -top-32 left-1/4 -translate-x-1/2 w-[800px] h-[450px] bg-gradient-to-br from-[#003791]/15 dark:from-[#0070d1]/18 via-[#00439c]/8 to-transparent rounded-full blur-[110px] pointer-events-none" />
        <div className="hidden md:block absolute top-1/3 -right-20 w-[600px] h-[400px] bg-gradient-to-bl from-[#00f0ff]/10 dark:from-[#0090ff]/12 via-transparent to-transparent rounded-full blur-[120px] pointer-events-none" />
        {/* Mobilde GPU'yu yormayan, 60fps akıcı kaydırma sağlayan hafif ambiyans */}
        <div className="md:hidden absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-transparent pointer-events-none" />
      </div>

      <SupportNotificationListener />
      <ContentNotificationListener />
      <DeviceNotificationBanner />
      <Header />
      <Sidebar />
      <main className="relative z-10 min-h-[calc(100vh-4rem)] min-w-0 px-3 py-4 pb-24 sm:px-4 sm:pb-28 md:ml-64 md:p-8 opacity-100 visible">
        <div className="mx-auto w-full max-w-7xl opacity-100 visible text-foreground">
          {children}
        </div>
      </main>
      <footer className="relative z-10 md:ml-64 flex flex-col sm:flex-row items-center justify-between gap-2 px-6 py-4 pb-24 sm:pb-28 md:pb-4 text-xs text-muted-foreground border-t border-border/50 bg-card/30 backdrop-blur-sm">
        <span>EconNotes</span>
        <span>Düzce Üniversitesi öğrencileri tarafından geliştirilmiştir.</span>
      </footer>
      <MobileBottomNav />
    </div>
  );
};

export default Layout;
