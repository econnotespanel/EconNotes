import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import MaintenanceScreen from '@/components/MaintenanceScreen';
import WelcomeBackCelebration from '@/components/WelcomeBackCelebration';

// 20:00 Turkey time (UTC+3) on 2026-11-03
const TARGET_REOPEN_TIME = new Date('2026-11-03T20:00:00+03:00').getTime();

// Paths that stay open so administrators can sign in and manage
const ADMIN_ACCESSIBLE_PATHS = ['/login', '/admin'];

const SystemGate = ({ children }: { children: React.ReactNode }) => {
  const { isAdmin, loading } = useAuth();
  const { pathname } = useLocation();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const isBeforeTarget = now < TARGET_REOPEN_TIME;

  // While checking auth state, wait briefly to know if the user is an admin
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Administrators have full access everywhere
  if (isAdmin) {
    return (
      <>
        <WelcomeBackCelebration />
        {children}
      </>
    );
  }

  // Allow admin login page so administrators can authenticate
  if (ADMIN_ACCESSIBLE_PATHS.includes(pathname)) {
    return <>{children}</>;
  }

  // While maintenance is active, show the maintenance screen for all non-admin visitors
  if (isBeforeTarget) {
    return (
      <MaintenanceScreen
        closedUntil="2026-11-04T06:00:00+03:00"
        title="EconNotes Sınav Dönemi Altyapı Güçlendirmesi"
        message="Sınav döneminin yaklaşmasıyla oluşan anlık yoğunluk nedeniyle sunucu altyapımızda kapasite artırımı ve güçlendirme çalışması yapılmaktadır. Tüm ders notlarınız, materyalleriniz ve hesaplarınız güvendedir. Çalışmalar tamamlanır tamamlanmaz sistemimiz kesintisiz olarak erişime açılacaktır."
      />
    );
  }

  // Once 22:00 is reached, all users have access + welcome music & celebration
  return (
    <>
      <WelcomeBackCelebration />
      {children}
    </>
  );
};

export default SystemGate;
