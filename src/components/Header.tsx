import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { Button } from '@/components/ui/button';
import { LogOut, Sun, Moon, Bell, BellRing, User, MessageSquare, Sparkles, Flame } from 'lucide-react';
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

  const toggleDeviceNotifications = async () => {
    if (!user) return;
    if (!('Notification' in window)) {
      toast.error('Bu tarayıcı cihaz bildirimlerini desteklemiyor.');
      return;
    }
    if (deviceNotificationsEnabled) {
      setDeviceNotificationEnabled(user.id, false);
      setDeviceNotificationsEnabled(false);
      toast.success('Cihaz bildirimleri kapatıldı.');
      return;
    }
    try {
      const permission = Notification.permission === 'default'
        ? await Notification.requestPermission()
        : Notification.permission;
      if (permission !== 'granted') {
        toast.error(permission === 'denied'
          ? 'Bildirim izni tarayıcı ayarlarından engellenmiş. Site ayarlarından izin verip tekrar deneyin.'
          : 'Bildirim izni verilmedi.');
        return;
      }
      const now = new Date().toISOString();
      setDeviceNotificationEnabled(user.id, true);
      localStorage.setItem(getNotificationCursorKey(user.id, 'notes'), now);
      localStorage.setItem(getNotificationCursorKey(user.id, 'announcements'), now);
      setDeviceNotificationsEnabled(true);
      toast.success('Yeni not ve duyuru bildirimleri açıldı.');
    } catch (error) {
      console.error('Device notification permission setup failed:', error);
      toast.error('Cihaz bildirimleri etkinleştirilemedi. Lütfen tarayıcı ayarlarınızı kontrol edin.');
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
            <Bell className="h-5 w-5" />
            {unreadAnnouncements > 0 && (
              <span className="absolute -top-1 -right-1 h-4 min-w-4 px-0.5 rounded-full bg-destructive text-[9px] text-destructive-foreground inline-flex items-center justify-center">
                {unreadAnnouncements}
              </span>
            )}
          </Button>

          {user && (
            <Button
              variant="ghost"
              size="icon"
              aria-label={deviceNotificationsEnabled ? 'Cihaz bildirimlerini kapat' : 'Cihaz bildirimlerini aç'}
              title={deviceNotificationsEnabled ? 'Cihaz bildirimleri açık' : 'Cihaz bildirimlerini aç'}
              onClick={() => void toggleDeviceNotifications()}
              className="rounded-xl text-muted-foreground transition-all hover:bg-primary/10 hover:text-primary"
            >
              <BellRing className={`h-5 w-5 ${deviceNotificationsEnabled ? 'text-primary' : ''}`} />
            </Button>
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
