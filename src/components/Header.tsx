import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { Button } from '@/components/ui/button';
import {
  LogOut,
  Sun,
  Moon,
  Bell,
  BellRing,
  User,
  MessageSquare,
  Sparkles,
  Flame,
  Megaphone,
  CheckCircle2,
  AlertTriangle,
  Smartphone,
  Laptop,
  Send,
  Info,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import EconLogo from '@/components/EconLogo';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { usePoints } from '@/hooks/usePoints';
import { getSeasonalTheme, useSiteConfig } from '@/contexts/SiteConfigContext';
import { SUPPORT_MESSAGE_PREFIX } from '@/lib/support';
import { getNotificationCursorKey, isDeviceNotificationEnabled, setDeviceNotificationEnabled } from '@/lib/deviceNotifications';

const Header = () => {
  const { user, profile, signOut, isAdmin } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { config } = useSiteConfig();
  const seasonalTheme = getSeasonalTheme(config.theme.seasonalMode || 'default');
  const flagThemeIds = new Set(['march18', 'october29', 'april23', 'may19']);
  const displayName = profile?.full_name?.trim()
    || String(user?.user_metadata?.full_name || user?.user_metadata?.name || '').trim()
    || user?.email?.split('@')[0]
    || 'Öğrenci';
  const navigate = useNavigate();
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [unreadAnnouncements, setUnreadAnnouncements] = useState(0);
  const [deviceNotificationsEnabled, setDeviceNotificationsEnabled] = useState(false);
  const [notificationPopoverOpen, setNotificationPopoverOpen] = useState(false);
  const [permissionState, setPermissionState] = useState<NotificationPermission | 'unsupported'>(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
    return Notification.permission;
  });
  const [showNotificationGuide, setShowNotificationGuide] = useState(() => {
    if (typeof window === 'undefined') return false;
    return sessionStorage.getItem('econnotes_notification_guide_dismissed') !== 'true';
  });

  const isIOSDevice = typeof navigator !== 'undefined' && (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
  const isStandaloneMode = typeof window !== 'undefined' && (window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true);

  const dismissNotificationGuide = () => {
    sessionStorage.setItem('econnotes_notification_guide_dismissed', 'true');
    setShowNotificationGuide(false);
  };
  const { points } = usePoints(3);

  const fetchUnread = useCallback(async () => {
    if (!user) return;

    // Count distinct senders with unread messages
    const { data: unreadMsgs } = await supabase
      .from('messages')
      .select('sender_id')
      .eq('receiver_id', user.id)
      .eq('is_read', false)
      .not('content', 'like', `${SUPPORT_MESSAGE_PREFIX}%`);
    
    if (unreadMsgs) {
      const uniqueSenders = new Set(unreadMsgs.map((m: any) => m.sender_id));
      setUnreadMessages(uniqueSenders.size);
    }

    const { data: announcements } = await supabase.from('announcements').select('id');
    const { data: views } = await supabase.from('announcement_views').select('announcement_id').eq('user_id', user.id);
    const viewedIds = new Set((views || []).map((v: any) => v.announcement_id));
    setUnreadAnnouncements((announcements || []).filter(a => !viewedIds.has(a.id)).length);
  }, [user]);

  useEffect(() => {
    fetchUnread();
    const interval = setInterval(fetchUnread, 120000);
    return () => clearInterval(interval);
  }, [fetchUnread]);

  useEffect(() => {
    const syncNotificationPreference = () => {
      const hasNotification = typeof window !== 'undefined' && 'Notification' in window;
      const perm = hasNotification ? Notification.permission : 'unsupported';
      setPermissionState(perm);
      setDeviceNotificationsEnabled(Boolean(user && isDeviceNotificationEnabled(user.id) && perm === 'granted'));
    };
    syncNotificationPreference();
    window.addEventListener('econnotes-device-notification-preference', syncNotificationPreference);
    return () => window.removeEventListener('econnotes-device-notification-preference', syncNotificationPreference);
  }, [user]);

  // Subscribe to realtime message changes
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('header-messages')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `receiver_id=eq.${user.id}` }, () => {
        fetchUnread();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, fetchUnread]);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour >= 6 && hour <= 11) return 'Günaydın';
    if (hour >= 12 && hour <= 16) return 'İyi Günler';
    if (hour >= 17 && hour <= 20) return 'İyi Akşamlar';
    return 'İyi Geceler';
  };

  const handleLogout = async () => {
    await signOut();
    toast.success('Çıkış başarılı!');
    navigate('/login');
  };

  const sendTestNotification = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      toast.error('Bu tarayıcı bildirimleri desteklemiyor.');
      return;
    }

    if (Notification.permission !== 'granted') {
      toast.error('Önce bildirim iznini vermelisiniz.');
      return;
    }

    // 1. Play subtle chime
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.12);
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.35);
      }
    } catch {}

    let sent = false;

    // 2. Service Worker showNotification (Android Mobile / PWA / Chrome)
    if ('serviceWorker' in navigator) {
      try {
        const reg = (await navigator.serviceWorker.getRegistration()) || (await navigator.serviceWorker.register('/sw.js'));
        if (reg && typeof reg.showNotification === 'function') {
          await reg.showNotification('EconNotes Test Bildirimi 🔔', {
            body: 'Cihaz bildirimleriniz başarıyla aktif! Yeni duyurular bu cihaza anında düşecektir.',
            icon: '/icons/icon-192x192.png',
            badge: '/icons/icon-192x192.png',
            vibrate: [200, 100, 200],
            data: { url: '/announcements' },
            tag: `econnotes-test-${Date.now()}`,
          });
          sent = true;
        }
      } catch (e) {
        console.warn('SW test failed:', e);
      }
    }

    // 3. Desktop Notification constructor (Windows / Mac)
    if (!sent) {
      try {
        const testNotification = new Notification('EconNotes Test Bildirimi 🔔', {
          body: 'Cihaz bildirimleriniz başarıyla aktif! Yeni duyurular bu cihaza anında düşecektir.',
          icon: '/icons/icon-192x192.png',
          badge: '/icons/icon-192x192.png',
          tag: `econnotes-test-${Date.now()}`,
        });
        testNotification.onclick = () => {
          window.focus();
          window.location.assign('/announcements');
          testNotification.close();
        };
        sent = true;
      } catch (desktopErr) {
        console.warn('Desktop test failed:', desktopErr);
      }
    }

    toast.success('Test bildirimi cihazınıza başarıyla gönderildi! 🔔');
  };

  const requestPermissionAndEnable = async () => {
    if (!user) return;
    if (typeof window === 'undefined' || !('Notification' in window)) {
      if (isIOSDevice) {
        toast.error('iPhone / iPad cihazlarda bildirim alabilmek için: Safari alt menüsündeki Paylaş butonuna basıp "Ana Ekrana Ekle" dedikten sonra uygulamayı ana ekrandan açmalısınız.', {
          duration: 9000,
        });
      } else {
        toast.error('Bu tarayıcı bildirimleri desteklemiyor. Güncel bir tarayıcı (Chrome, Edge vb.) kullanmanızı öneririz.');
      }
      return;
    }

    if (isIOSDevice && !isStandaloneMode) {
      toast.error('iPhone / iPad cihazlarda bildirim alabilmek için: Safari alt menüsündeki Paylaş (kare ve yukarı ok) butonuna basıp "Ana Ekrana Ekle" dedikten sonra uygulamayı ana ekrandan açmalısınız.', {
        duration: 9000,
      });
      return;
    }

    if (Notification.permission === 'denied') {
      toast.error('Bildirim izni tarayıcınızda veya cihazınızda ENGELLİ. Açmak için: Adres çubuğundaki (URL yanındaki) 🔒 kilit veya ayar simgesine tıklayıp Bildirimler\'i "İzin Ver" yapın.', {
        duration: 9000,
      });
      return;
    }

    try {
      let permission = Notification.permission;
      if (permission === 'default') {
        try {
          const req = Notification.requestPermission();
          if (req && typeof req.then === 'function') {
            permission = await req;
          } else {
            permission = await new Promise((resolve) => Notification.requestPermission(resolve));
          }
        } catch {
          permission = await new Promise((resolve) => Notification.requestPermission(resolve));
        }
      }

      setPermissionState(permission);

      if (permission === 'granted') {
        const now = new Date(Date.now() - 30_000).toISOString();
        setDeviceNotificationEnabled(user.id, true);
        localStorage.setItem(getNotificationCursorKey(user.id, 'notes'), now);
        localStorage.setItem(getNotificationCursorKey(user.id, 'announcements'), now);
        setDeviceNotificationsEnabled(true);
        await sendTestNotification();
      } else if (permission === 'denied') {
        toast.error('Bildirim izni engellendi. Adres çubuğundaki kilit simgesinden izin verip sayfayı yenileyin.', { duration: 8000 });
      }
    } catch (e) {
      console.error('Request permission failed:', e);
      toast.error('Bildirim izni alınamadı.');
    }
  };

  const toggleDeviceNotifications = () => {
    if (!user) return;
    if (deviceNotificationsEnabled) {
      setDeviceNotificationEnabled(user.id, false);
      setDeviceNotificationsEnabled(false);
      toast.success('Cihaz bildirimleri kapatıldı.');
    } else {
      if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
        const now = new Date(Date.now() - 30_000).toISOString();
        setDeviceNotificationEnabled(user.id, true);
        localStorage.setItem(getNotificationCursorKey(user.id, 'notes'), now);
        localStorage.setItem(getNotificationCursorKey(user.id, 'announcements'), now);
        setDeviceNotificationsEnabled(true);
        toast.success('Cihaz bildirimleri açıldı!');
      } else {
        void requestPermissionAndEnable();
      }
    }
  };

  const formatLastLogin = () => {
    if (!profile?.last_login) return '';
    const date = new Date(profile.last_login);
    return date.toLocaleDateString('tr-TR') + ' ' + date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/70 bg-card/90 shadow-[0_8px_24px_hsl(var(--foreground)/0.04)] backdrop-blur-xl">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/70 to-transparent" />
      <div className="flex h-[4.5rem] min-w-0 items-center justify-between gap-2 px-3 sm:px-4 md:px-6">
        <div className="ml-14 flex min-w-0 cursor-pointer items-center rounded-xl px-2 py-1.5 transition-colors hover:bg-primary/5 md:ml-0" onClick={() => navigate('/')}>
          <EconLogo className="h-6 w-24 sm:h-7 sm:w-32" />
          {seasonalTheme && (
            <span className="ml-2 hidden items-center gap-1 rounded-full border border-primary/25 bg-primary/10 px-2 py-1 text-[10px] font-semibold text-primary lg:inline-flex">
              {flagThemeIds.has(seasonalTheme.id) ? (
                <span className="seasonal-flag" title={`${seasonalTheme.label} teması`} aria-label={`${seasonalTheme.label} teması`}>🇹🇷</span>
              ) : seasonalTheme.id === 'november10' ? (
                <span className="seasonal-ribbon" title="Atatürk'ü Anma Günü" aria-label="Atatürk'ü Anma Günü" />
              ) : seasonalTheme.emoji}
              <span>{seasonalTheme.id === 'november10' ? 'Atatürk • 10 Kasım' : seasonalTheme.label}</span>
            </span>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-0.5 sm:gap-1 md:gap-2">
          {user && (
            <div className="mr-1 hidden rounded-xl border border-border/60 bg-background/45 px-3 py-1.5 text-right md:flex md:flex-col">
              <span className="text-[13px] font-semibold leading-4 text-foreground">
                {getGreeting()}, {displayName}
              </span>
              {profile?.last_login && (
                <span className="mt-0.5 text-[10px] text-muted-foreground">Son giriş: {formatLastLogin()}</span>
              )}
            </div>
          )}

          {points && (
            <button
              onClick={() => navigate('/')}
              title={`${points.points} puan • ${points.current_streak} günlük seri`}
              className="hidden h-8 items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 text-xs font-semibold text-primary shadow-sm shadow-primary/10 transition-colors hover:bg-primary/20 lg:inline-flex"
            >
              <Sparkles className="h-3.5 w-3.5" />
              {points.points}
              {points.current_streak > 0 && (
                <span className="inline-flex items-center gap-0.5 text-warning">
                  <Flame className="h-3.5 w-3.5" />{points.current_streak}
                </span>
              )}
            </button>
          )}


          <Button variant="ghost" size="icon" className="relative hidden rounded-xl text-muted-foreground transition-all hover:bg-primary/10 hover:text-primary sm:inline-flex" onClick={() => navigate('/messages')}>
            <MessageSquare className="h-5 w-5" />
            {unreadMessages > 0 && (
              <span className="absolute -top-1 -right-1 h-4 min-w-4 px-0.5 rounded-full bg-destructive text-[9px] text-destructive-foreground inline-flex items-center justify-center">
                {unreadMessages}
              </span>
            )}
          </Button>

          <Button variant="ghost" size="icon" className="relative rounded-xl text-muted-foreground transition-all hover:bg-primary/10 hover:text-primary" onClick={() => navigate('/announcements')}>
            <Megaphone className="h-5 w-5" />
            {unreadAnnouncements > 0 && (
              <span className="absolute -top-1 -right-1 h-4 min-w-4 px-0.5 rounded-full bg-destructive text-[9px] text-destructive-foreground inline-flex items-center justify-center">
                {unreadAnnouncements}
              </span>
            )}
          </Button>

          {user && (
            <Popover open={notificationPopoverOpen} onOpenChange={setNotificationPopoverOpen}>
              <div className="relative">
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Cihaz Bildirimleri"
                    title="Cihaz Bildirimleri"
                    onClick={() => {
                      if (showNotificationGuide) dismissNotificationGuide();
                    }}
                    className={`rounded-xl text-muted-foreground transition-all hover:bg-primary/10 hover:text-primary ${
                      showNotificationGuide && !deviceNotificationsEnabled ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : ''
                    }`}
                  >
                    {deviceNotificationsEnabled ? (
                      <BellRing className="h-5 w-5 text-primary animate-pulse" />
                    ) : (
                      <Bell className="h-5 w-5 text-muted-foreground" />
                    )}
                  </Button>
                </PopoverTrigger>

                {/* Guided Onboarding Arrow Callout for First Time Users */}
                {showNotificationGuide && !deviceNotificationsEnabled && !notificationPopoverOpen && (
                  <div className="absolute right-0 top-full mt-2.5 z-50 w-72 sm:w-80 rounded-2xl border border-border/80 bg-popover p-4 shadow-xl text-popover-foreground animate-in fade-in zoom-in-95 duration-200">
                    <div className="absolute -top-1.5 right-[13px] h-3 w-3 rotate-45 border-l border-t border-border/80 bg-popover" />

                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <BellRing className="h-5 w-5" />
                      </div>
                      <div className="space-y-1 min-w-0 flex-1">
                        <h4 className="text-sm font-semibold text-foreground tracking-tight">
                          Cihaz Bildirimlerini Açın
                        </h4>
                        <p className="text-xs leading-relaxed text-muted-foreground">
                          EconNotes'taki duyurular veya yeni yüklenen notlar hakkında anında haberdar olmak için bildirim tuşuna basarak cihaz bildirimlerini açabilirsiniz.
                        </p>
                      </div>
                    </div>

                    <div className="mt-3.5 flex items-center justify-end gap-2 border-t border-border/40 pt-3">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={dismissNotificationGuide}
                        className="h-8 text-xs font-medium text-muted-foreground hover:text-foreground px-2.5 rounded-lg"
                      >
                        Daha Sonra
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => {
                          dismissNotificationGuide();
                          void requestPermissionAndEnable();
                        }}
                        className="h-8 text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 px-3.5 gap-1.5 rounded-xl shadow-sm"
                      >
                        <BellRing className="h-3.5 w-3.5" />
                        <span>Bildirimleri Aç</span>
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              <PopoverContent align="end" className="w-80 sm:w-96 rounded-2xl border border-border/80 bg-popover p-4 shadow-2xl text-popover-foreground">
                <div className="space-y-3.5">
                  {/* Top Bar */}
                  <div className="flex items-center justify-between gap-2 border-b border-border/40 pb-3">
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <BellRing className="h-4 w-4" />
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold text-foreground tracking-tight">Cihaz Bildirimleri</h4>
                        <p className="text-[11px] text-muted-foreground">Duyuru ve not uyarıları</p>
                      </div>
                    </div>
                    {/* Status Badge */}
                    {permissionState === 'granted' && deviceNotificationsEnabled ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-600">
                        <CheckCircle2 className="h-3 w-3" />
                        Aktif
                      </span>
                    ) : permissionState === 'denied' ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-destructive/20 bg-destructive/10 px-2.5 py-0.5 text-[11px] font-semibold text-destructive">
                        <AlertTriangle className="h-3 w-3" />
                        Engellendi
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-amber-600">
                        İzin Gerekli
                      </span>
                    )}
                  </div>

                  {/* Permission or Active Controls */}
                  {permissionState !== 'granted' ? (
                    <div className="space-y-2.5 rounded-xl border border-border/60 bg-muted/30 p-3">
                      <p className="text-xs leading-relaxed text-muted-foreground">
                        {permissionState === 'denied'
                          ? 'Tarayıcınızda bildirim izni engellenmiş. İzin vermek için tarayıcınızın adres çubuğundaki (URL yanındaki) kilit (🔒) veya ayar simgesine dokunup Bildirimler\'i "İzin Ver" yapın.'
                          : 'Yöneticilerin paylaştığı duyurular ve yeni ders notları hakkında cihazınıza anlık uyarı almak için bildirim izni verin.'}
                      </p>
                      {permissionState !== 'denied' && (
                        <Button
                          size="sm"
                          onClick={() => void requestPermissionAndEnable()}
                          className="w-full h-8 text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg shadow-sm gap-1.5"
                        >
                          <BellRing className="h-3.5 w-3.5" />
                          <span>Bildirim İznini Başlat (İzin Ver)</span>
                        </Button>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between rounded-xl border border-border/60 bg-muted/20 p-2.5">
                        <span className="text-xs font-medium text-foreground">Bu Cihazda Bildirimler</span>
                        <Button
                          variant={deviceNotificationsEnabled ? 'outline' : 'default'}
                          size="sm"
                          onClick={toggleDeviceNotifications}
                          className="h-7 px-2.5 text-xs rounded-lg font-medium"
                        >
                          {deviceNotificationsEnabled ? 'Kapat' : 'Aç'}
                        </Button>
                      </div>

                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => void sendTestNotification()}
                        className="w-full h-8 text-xs font-semibold rounded-lg gap-1.5"
                      >
                        <Send className="h-3.5 w-3.5 text-primary" />
                        <span>Cihaza Test Bildirimi Gönder</span>
                      </Button>
                    </div>
                  )}

                  {/* Device Specific Guidelines */}
                  <div className="space-y-1.5 rounded-xl border border-border/40 bg-muted/20 p-2.5 text-[11px] leading-relaxed text-muted-foreground">
                    <div className="flex items-start gap-1.5 font-medium text-foreground/90">
                      <Laptop className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                      <span>Windows & Bilgisayar:</span>
                    </div>
                    <p className="pl-5 text-[10.5px]">
                      Tarayıcınız simge durumunda veya arka planda açık kaldığında tüm duyurular Windows Bildirim Merkezi'ne anında düşer. (Bildirim gelmiyorsa Windows 'Odaklanma Yardımı'nı kontrol edin).
                    </p>

                    <div className="flex items-start gap-1.5 font-medium text-foreground/90 pt-1">
                      <Smartphone className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                      <span>iPhone & Çoklu Cihaz:</span>
                    </div>
                    <p className="pl-5 text-[10.5px]">
                      iPhone'da Safari altındaki Paylaş &gt; "Ana Ekrana Ekle" yaparak uygulamadan açmalısınız. Hesabınızın açık olduğu her cihazınıza duyurular eşzamanlı ulaşır.
                    </p>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          )}

          <Button variant="ghost" size="icon" onClick={toggleTheme} className="rounded-xl text-muted-foreground transition-all hover:bg-primary/10 hover:text-primary">
            {theme === 'light' ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
          </Button>

          <Button variant="ghost" size="icon" className="hidden rounded-xl text-muted-foreground transition-all hover:bg-primary/10 hover:text-primary sm:inline-flex" onClick={() => navigate('/profile')}>
            <User className="h-5 w-5" />
          </Button>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="icon" className="hidden rounded-xl text-destructive/80 transition-all hover:bg-destructive/10 hover:text-destructive md:inline-flex">
                <LogOut className="h-5 w-5" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Çıkış yapmak istediğinize emin misiniz?</AlertDialogTitle>
                <AlertDialogDescription>Panelden çıkış yapılacaktır.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>İptal</AlertDialogCancel>
                <AlertDialogAction onClick={handleLogout} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  Çıkış Yap
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </header>
  );
};

export default Header;
