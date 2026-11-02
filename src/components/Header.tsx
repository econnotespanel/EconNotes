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
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { usePoints } from '@/hooks/usePoints';
import { getSeasonalTheme, useSiteConfig } from '@/contexts/SiteConfigContext';
import { SUPPORT_MESSAGE_PREFIX } from '@/lib/support';
import { getNotificationCursorKey, isDeviceNotificationEnabled, setDeviceNotificationEnabled } from '@/lib/deviceNotifications';
import { displayDeviceNotification, playChime } from '@/lib/showNotification';

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
      setDeviceNotificationsEnabled(Boolean(user && isDeviceNotificationEnabled(user.id) && 'Notification' in window && Notification.permission === 'granted'));
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
    playChime();

    // In-app visual notification banner
    toast('🔔 EconNotes Test Bildirimi', {
      description: 'Cihaz bildirimleriniz başarıyla aktif! Yeni duyurular bu cihaza anında düşecektir.',
      duration: 8000,
    });

    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;

    await displayDeviceNotification('EconNotes Test Bildirimi 🔔', {
      body: 'Cihaz bildirimleriniz başarıyla aktif! Yeni duyurular bu cihaza anında düşecektir.',
      data: { url: '/announcements' },
      tag: `econnotes-test-${Date.now()}`,
    });
  };

  const handleBellClick = async () => {
    if (!user) return;

    if (typeof window === 'undefined' || !('Notification' in window)) {
      const isIOS = typeof navigator !== 'undefined' && (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
      if (isIOS) {
        toast.info(
          'iPhone Bildirim Kurulumu: Safari Paylaş (kare ve yukarı ok) > "Ana Ekrana Ekle" dedikten sonra uygulamayı ana ekrandan açın. Bildirimler cihazınıza anında düşecektir.',
          { duration: 9000 }
        );
      } else {
        toast.error('Bu cihaz veya tarayıcı bildirimleri desteklemiyor.');
      }
      return;
    }

    // 1. If currently enabled, clicking toggles it off
    if (deviceNotificationsEnabled) {
      setDeviceNotificationEnabled(user.id, false);
      setDeviceNotificationsEnabled(false);
      toast.success('Cihaz bildirimleri kapatıldı.');
      return;
    }

    // 2. If previously blocked in browser settings
    if (Notification.permission === 'denied') {
      toast.error('Bildirim izni cihazınızda/tarayıcınızda engelli. Açmak için: Adres çubuğundaki (URL yanındaki) 🔒 kilit veya ayar simgesine tıklayıp Bildirimler\'i "İzin Ver" yapın.', {
        duration: 9000,
      });
      return;
    }

    // 3. DIRECT NATIVE BROWSER PERMISSION PROMPT
    // Directly triggers the operating system prompt (Safari iOS, Chrome Android, Windows, Mac)
    // without any intermediate in-app cards or questionnaire popovers!
    try {
      let permission = Notification.permission;
      if (permission === 'default') {
        const req = Notification.requestPermission();
        if (req && typeof req.then === 'function') {
          permission = await req;
        } else {
          permission = await new Promise((resolve) => Notification.requestPermission(resolve));
        }
      }

      if (permission === 'granted') {
        const now = new Date(Date.now() - 30_000).toISOString();
        setDeviceNotificationEnabled(user.id, true);
        localStorage.setItem(getNotificationCursorKey(user.id, 'notes'), now);
        localStorage.setItem(getNotificationCursorKey(user.id, 'announcements'), now);
        setDeviceNotificationsEnabled(true);
        toast.success('Bildirim izni verildi! Cihaz bildirimleri açıldı 🔔');
        await sendTestNotification();
      } else {
        toast.error('Bildirim izni onaylanmadı.');
      }
    } catch (e) {
      console.error('Notification permission request error:', e);
      toast.error('Bildirim izni alınamadı.');
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

        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          {user && (
            <div className="mr-1 hidden rounded-2xl border border-border/60 bg-card/60 px-3.5 py-1 text-right backdrop-blur-sm md:flex md:flex-col justify-center shadow-xs">
              <span className="text-[12px] font-semibold leading-tight text-foreground truncate max-w-[150px]">
                {getGreeting()}, {displayName}
              </span>
              {profile?.last_login && (
                <span className="text-[10px] text-muted-foreground leading-tight">Son: {formatLastLogin()}</span>
              )}
            </div>
          )}

          {points && (
            <button
              onClick={() => navigate('/')}
              title={`${points.points} puan • ${points.current_streak} günlük seri`}
              className="hidden h-9 items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 text-xs font-semibold text-primary shadow-xs backdrop-blur-sm transition-all duration-200 hover:scale-105 hover:bg-primary/20 active:scale-95 lg:inline-flex"
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>{points.points}</span>
              {points.current_streak > 0 && (
                <span className="inline-flex items-center gap-0.5 text-warning font-semibold">
                  <Flame className="h-3.5 w-3.5" />{points.current_streak}
                </span>
              )}
            </button>
          )}

          {/* Unified horizontal capsule toolbar collecting all icons together */}
          <div className="flex items-center gap-0.5 sm:gap-1 rounded-full border border-border/70 bg-card/75 p-1 shadow-xs backdrop-blur-md">
            <button
              type="button"
              title="Mesajlar"
              aria-label="Mesajlar"
              onClick={() => navigate('/messages')}
              className="relative hidden h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-all duration-200 hover:bg-primary/15 hover:text-primary active:scale-90 sm:inline-flex"
            >
              <MessageSquare className="h-4 w-4" />
              {unreadMessages > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground ring-2 ring-card">
                  {unreadMessages}
                </span>
              )}
            </button>

            <button
              type="button"
              title="Duyurular"
              aria-label="Duyurular"
              onClick={() => navigate('/announcements')}
              className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-all duration-200 hover:bg-primary/15 hover:text-primary active:scale-90"
            >
              <Megaphone className="h-4 w-4" />
              {unreadAnnouncements > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground ring-2 ring-card">
                  {unreadAnnouncements}
                </span>
              )}
            </button>

            {user && (
              <button
                type="button"
                aria-label={deviceNotificationsEnabled ? 'Cihaz bildirimlerini kapat' : 'Cihaz bildirimlerini aç'}
                title={deviceNotificationsEnabled ? 'Cihaz bildirimleri açık (kapatmak için tıklayın)' : 'Cihaz bildirimlerini aç'}
                onClick={() => void handleBellClick()}
                className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-all duration-200 active:scale-90 ${
                  deviceNotificationsEnabled
                    ? 'bg-primary/20 text-primary shadow-xs'
                    : 'text-muted-foreground hover:bg-primary/15 hover:text-primary'
                }`}
              >
                {deviceNotificationsEnabled ? (
                  <BellRing className="h-4 w-4 text-primary animate-pulse" />
                ) : (
                  <Bell className="h-4 w-4" />
                )}
              </button>
            )}

            <button
              type="button"
              title={theme === 'light' ? 'Karanlık moda geç' : 'Aydınlık moda geç'}
              aria-label="Tema değiştir"
              onClick={toggleTheme}
              className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-all duration-200 hover:bg-primary/15 hover:text-primary active:scale-90"
            >
              {theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            </button>

            <button
              type="button"
              title="Profilim"
              aria-label="Profilim"
              onClick={() => navigate('/profile')}
              className="relative hidden h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-all duration-200 hover:bg-primary/15 hover:text-primary active:scale-90 sm:inline-flex"
            >
              <User className="h-4 w-4" />
            </button>

            {/* Subtle separator before logout */}
            <div className="mx-0.5 hidden h-4 w-px bg-border/80 md:block" />

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <button
                  type="button"
                  title="Çıkış Yap"
                  aria-label="Çıkış Yap"
                  className="relative hidden h-8 w-8 shrink-0 items-center justify-center rounded-full text-destructive/80 transition-all duration-200 hover:bg-destructive/15 hover:text-destructive active:scale-90 md:inline-flex"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent className="rounded-2xl border-border/80 bg-card/95 backdrop-blur-xl">
                <AlertDialogHeader>
                  <AlertDialogTitle className="text-lg font-bold text-foreground">
                    EconNotes'tan Çıkış Yapılsın mı?
                  </AlertDialogTitle>
                  <AlertDialogDescription className="text-sm text-muted-foreground leading-relaxed">
                    EconNotes hesabınızdan güvenli bir şekilde çıkış yapılacaktır. Oturumunuzu sonlandırmak istediğinizi onaylıyor musunuz?
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter className="gap-2 sm:gap-0">
                  <AlertDialogCancel className="rounded-xl border-border/70 hover:bg-muted font-medium">
                    Vazgeç
                  </AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleLogout}
                    className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90 font-medium"
                  >
                    Onaylıyorum, Çıkış Yap
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
