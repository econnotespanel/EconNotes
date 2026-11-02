import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useSystemStatus } from '@/hooks/useSystemStatus';
import MaintenanceScreen from '@/components/MaintenanceScreen';
import ForcePasswordChange from '@/components/ForcePasswordChange';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import ServiceUnavailableScreen from '@/components/ServiceUnavailableScreen';

/** Active broadcast announcement displayed across the platform during maintenance. */
const OVERLOAD_ANNOUNCEMENT_ACTIVE = false;
const OVERLOAD_ANNOUNCEMENT_TITLE = 'Altyapı ve Kapasite Güncellemesi';
const OVERLOAD_ANNOUNCEMENT_MESSAGE = `Sınav haftasının yaklaşmasıyla beraber EconNotes'a anlık olarak çok ciddi bir giriş ve indirme trafiği gerçekleşti. Bu yoğun ilgi sebebiyle bulut sunucularımız aşırı yüklenme (overload) durumuna geçti ve geçici olarak erişim kısıtlandı.

Öncelikle belirtmek isteriz ki sistemdeki tüm notlar, ders materyalleri ve kullanıcı hesapları eksiksiz şekilde korunmaktadır; herhangi bir veri kaybı söz konusu değildir.

Sınav süreciniz boyunca benzer bir yavaşlama veya kesinti tekrar yaşamamanız adına, altyapımızı şu an daha yüksek kapasiteli ve bağımsız bir sunucu sistemine aktarıyoruz. 

Sınavlara hazırlandığınız bu kritik dönemde böyle bir aksaklıkla karşılaştığınız için anlayışınıza sığınıyoruz. Çalışmalarımızı en kısa sürede tamamlayarak platformu yeniden erişime açacağız.

Anlayışınız ve sabrınız için teşekkür eder, sınavlarınızda başarılar dileriz.

EconNotes Ekibi`;

/** Routes that stay reachable during a closure so admins can sign in. */
const OPEN_PATHS = ['/login', '/admin', '/forgot-password', '/reset-password'];

/** Applies the admin closure to every page and enforces one-time password replacement. */
const SystemGate = ({ children }: { children: React.ReactNode }) => {
  const { user, isAdmin, loading } = useAuth();
  const status = useSystemStatus();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const previousSystemOpen = useRef<boolean | null>(null);
  const fatalErrorLogged = useRef(false);

  // If the active overload announcement is enabled, show it everywhere
  if (OVERLOAD_ANNOUNCEMENT_ACTIVE) {
    return (
      <MaintenanceScreen
        closedUntil={null}
        title={null}
        message={null}
        imageUrl={null}
        mode="fatal_error"
      />
    );
  }

  useEffect(() => {
    if (status.systemOpen === false && status.closureMode === 'fatal_error' && !fatalErrorLogged.current) {
      fatalErrorLogged.current = true;
      console.error('[EconNotes] FATAL_ERROR: HTTP 500 SERVICE_UNAVAILABLE', {
        status: 500,
        code: 'ECONNOTES_FATAL_ERROR',
        message: 'EconNotes is temporarily unavailable.',
      });
    }
    if (status.systemOpen !== false || status.closureMode !== 'fatal_error') {
      fatalErrorLogged.current = false;
    }
  }, [status.systemOpen, status.closureMode]);

  useEffect(() => {
    const wasOpen = previousSystemOpen.current;
    previousSystemOpen.current = status.systemOpen;
    if (wasOpen !== true || status.systemOpen !== false || isAdmin || !user || loading) return;

    toast.warning('EconNotes bakım güncellemesine alındı.', {
      description: 'Güncelleme tamamlanana kadar oturumunuz kapatılacaktır.',
      duration: 1100,
    });
    const timer = window.setTimeout(async () => {
      await supabase.auth.signOut();
      navigate('/login', { replace: true });
    }, 1100);
    return () => window.clearTimeout(timer);
  }, [status.systemOpen, isAdmin, user, loading, navigate]);

  if (!status.backendReachable) {
    return <ServiceUnavailableScreen onRetry={status.retryNow} />;
  }

  if (false && status.systemOpen === false && !isAdmin && !loading && !OPEN_PATHS.includes(pathname)) {
    return (
      <MaintenanceScreen
        closedUntil={status.closedUntil}
        title={status.closureTitle}
        message={status.closureMessage}
        imageUrl={status.closureImageUrl}
        mode={status.closureMode}
      />
    );
  }

  if (user && (user.app_metadata as any)?.must_change_password && pathname !== '/reset-password') {
    return <ForcePasswordChange />;
  }

  return <>{children}</>;
};

export default SystemGate;