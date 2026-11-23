import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Bell, BellRing, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import {
  getNotificationCursorKey,
  isDeviceNotificationEnabled,
  setDeviceNotificationEnabled,
} from '@/lib/deviceNotifications';
import { displayDeviceNotification, playChime } from '@/lib/showNotification';
import { requestOneSignalPermission, syncOneSignalSubscription } from '@/lib/onesignal';
import {
  isIOSDevice,
  isMobileInstallPromptVisible,
  isStandalonePwa,
  PWA_PROMPT_VISIBILITY_EVENT,
} from '@/lib/pwaInstall';

const DeviceNotificationBanner = () => {
  const { user } = useAuth();
  const [visible, setVisible] = useState(false);
  const [isIOSWeb, setIsIOSWeb] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pwaPromptOpen, setPwaPromptOpen] = useState<boolean>(() => isMobileInstallPromptVisible());
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  useEffect(() => {
    const handlePwaPromptVisibility = (e: Event) => {
      const custom = e as CustomEvent<{ open: boolean }>;
      if (custom.detail && typeof custom.detail.open === 'boolean') {
        setPwaPromptOpen(custom.detail.open);
      }
    };
    const handleSidebarState = (e: Event) => {
      const custom = e as CustomEvent<{ open: boolean }>;
      if (custom.detail && typeof custom.detail.open === 'boolean') {
        setIsSidebarOpen(custom.detail.open);
      }
    };

    window.addEventListener(PWA_PROMPT_VISIBILITY_EVENT, handlePwaPromptVisibility as EventListener);
    window.addEventListener('econnotes:sidebar-state', handleSidebarState as EventListener);
    return () => {
      window.removeEventListener(PWA_PROMPT_VISIBILITY_EVENT, handlePwaPromptVisibility as EventListener);
      window.removeEventListener('econnotes:sidebar-state', handleSidebarState as EventListener);
    };
  }, []);

  useEffect(() => {
    if (!user || typeof window === 'undefined') return;

    // Check if user dismissed it in this browser session
    const dismissed = sessionStorage.getItem('econnotes_notification_banner_dismissed') === 'true';
    if (dismissed) return;

    const isIOS = isIOSDevice();
    const isStandalone = isStandalonePwa();

    // If notifications are already granted, silently ensure OneSignal is synced
    if ('Notification' in window && Notification.permission === 'granted') {
      void syncOneSignalSubscription(user.id, isDeviceNotificationEnabled(user.id));
      if (isDeviceNotificationEnabled(user.id)) {
        return;
      }
    }

    // If on iOS browser (not yet added to home screen as PWA), MobileHomeScreenPrompt already guides them;
    // only show this compact banner if MobileHomeScreenPrompt is closed/dismissed.
    if (isIOS && !isStandalone) {
      setIsIOSWeb(true);
      const timer = window.setTimeout(() => setVisible(true), 1600);
      return () => window.clearTimeout(timer);
    }

    // Show if device supports notifications and has not denied permission yet
    if ('Notification' in window && (Notification.permission === 'default' || !isDeviceNotificationEnabled(user.id))) {
      if (Notification.permission === 'denied') return;
      const timer = window.setTimeout(() => setVisible(true), 1500);
      return () => window.clearTimeout(timer);
    }
  }, [user]);

  const handleDismiss = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    sessionStorage.setItem('econnotes_notification_banner_dismissed', 'true');
    setVisible(false);
  };

  const handleIOSHelp = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    toast.info(
      'iPhone Bildirim Kurulumu: Safari ekranının en altındaki "Paylaş" (kare ve yukarı ok) simgesine dokunun, ardından "Ana Ekrana Ekle"yi seçin. Uygulamayı ana ekrandan açtığınızda bildirimler cihazınıza gelecektir.',
      { duration: 10000 },
    );
    handleDismiss();
  };

  const handleRequestPermission = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!user || loading) return;

    setLoading(true);
    try {
      const granted = await requestOneSignalPermission(user.id);

      if (granted) {
        const now = new Date(Date.now() - 30_000).toISOString();
        setDeviceNotificationEnabled(user.id, true);
        localStorage.setItem(getNotificationCursorKey(user.id, 'notes'), now);
        localStorage.setItem(getNotificationCursorKey(user.id, 'announcements'), now);
        playChime();
        await displayDeviceNotification('EconNotes Bildirimleri Aktif! 🔔', {
          body: 'Yeni duyurular artık bu cihaza anında bildirim olarak düşecektir.',
          data: { url: '/announcements' },
        });
        toast.success('Bildirim izni verildi! Cihaz bildirimleriniz aktif 🔔');
      } else {
        toast.error('Bildirim izni onaylanmadı veya tarayıcı ayarlarından engellenmiş.');
      }
    } catch (err) {
      console.error('Notification permission request error:', err);
      toast.error('Bildirim izni alınırken bir sorun oluştu.');
    } finally {
      setLoading(false);
      handleDismiss();
    }
  };

  // Never overlap MobileHomeScreenPrompt or open mobile sidebar
  if (!visible || pwaPromptOpen || isSidebarOpen) return null;

  return (
    <aside
      aria-label="Bildirim İzni"
      className="fixed bottom-[calc(env(safe-area-inset-bottom,0px)+5.25rem)] md:bottom-4 left-3 right-3 sm:left-auto sm:right-6 z-[58] pointer-events-auto mx-auto max-w-sm rounded-2xl border border-primary/30 bg-card/95 p-3.5 shadow-2xl backdrop-blur-xl animate-in slide-in-from-bottom duration-300"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            {isIOSWeb ? (
              <Smartphone className="h-4 w-4" />
            ) : (
              <BellRing className="h-4 w-4 animate-pulse" />
            )}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-foreground truncate">
              {isIOSWeb ? 'iPhone Bildirimleri' : 'Duyuru Bildirimleri'}
            </p>
            <p className="text-[11px] text-muted-foreground truncate">
              {isIOSWeb ? 'Ana Ekrana Ekle ile bildirimleri açın' : 'Duyurular cihazınıza anında düşsün mü?'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={handleDismiss}
            className="h-8 px-2.5 text-xs text-muted-foreground hover:text-foreground cursor-pointer rounded-lg hover:bg-muted/50 transition-colors"
            aria-label="Kapat"
          >
            Sonra
          </button>
          {isIOSWeb ? (
            <button
              type="button"
              onClick={handleIOSHelp}
              className="h-8 px-3 text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl shadow-sm flex items-center justify-center cursor-pointer transition-all active:scale-95"
            >
              <span>Nasıl Yapılır?</span>
            </button>
          ) : (
            <button
              type="button"
              disabled={loading}
              onClick={handleRequestPermission}
              className="h-8 px-3 text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 gap-1 rounded-xl shadow-sm flex items-center justify-center cursor-pointer transition-all active:scale-95 disabled:opacity-50"
            >
              <Bell className="h-3 w-3" />
              <span>{loading ? 'Açılıyor...' : 'İzin Ver'}</span>
            </button>
          )}
        </div>
      </div>
    </aside>
  );
};

export default DeviceNotificationBanner;
