import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import {
  LogOut,
  Sun,
  Moon,
  Bell,
  BellRing,
  User,
  MessageSquare,
  Sparkles,
  Megaphone,
  Search,
  Zap,
  Shield,
  LifeBuoy,
  Info,
  X,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import EconLogo from '@/components/EconLogo';
import Ataturk10KasimEmblem from '@/components/Ataturk10KasimEmblem';
import AtaturkPortrait from '@/components/AtaturkPortrait';
import { cn } from '@/lib/utils';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useState, useEffect, useCallback, useRef, type FormEvent } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { usePoints } from '@/hooks/usePoints';
import { getSeasonalTheme, useSiteConfig } from '@/contexts/SiteConfigContext';
import { SUPPORT_MESSAGE_PREFIX } from '@/lib/support';
import {
  ANNOUNCEMENTS_UPDATED_EVENT,
  getNotificationCursorKey,
  isDeviceNotificationEnabled,
  setDeviceNotificationEnabled,
} from '@/lib/deviceNotifications';
import { displayDeviceNotification, playChime } from '@/lib/showNotification';
import { requestOneSignalPermission, syncOneSignalSubscription } from '@/lib/onesignal';

const Header = () => {
  const { user, profile, signOut, isAdmin } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { config } = useSiteConfig();
  const seasonalTheme = getSeasonalTheme(config.theme.seasonalMode || 'default');
  const isNovember10 = seasonalTheme?.id === 'november10';
  const displayName =
    profile?.full_name?.trim() ||
    String(user?.user_metadata?.full_name || user?.user_metadata?.name || '').trim() ||
    user?.email?.split('@')[0] ||
    'Öğrenci';
  const userInitial = (displayName[0] || 'Ö').toLocaleUpperCase('tr-TR');

  const navigate = useNavigate();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const mobileSearchInputRef = useRef<HTMLInputElement>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [unreadAnnouncements, setUnreadAnnouncements] = useState(0);
  const [deviceNotificationsEnabled, setDeviceNotificationsEnabled] = useState(false);
  const { points } = usePoints(3);

  // Global Cmd+K / Ctrl+K shortcut to focus search bar
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (window.innerWidth < 768) {
          setMobileSearchOpen(true);
          window.setTimeout(() => mobileSearchInputRef.current?.focus(), 60);
        } else {
          searchInputRef.current?.focus();
          searchInputRef.current?.select();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const fetchUnread = useCallback(async () => {
    if (!user) return;

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
    const { data: views } = await supabase
      .from('announcement_views')
      .select('announcement_id')
      .eq('user_id', user.id);
    const viewedIds = new Set((views || []).map((v: any) => v.announcement_id));
    setUnreadAnnouncements((announcements || []).filter((a) => !viewedIds.has(a.id)).length);
  }, [user]);

  useEffect(() => {
    fetchUnread();
    const interval = setInterval(fetchUnread, 120000);
    window.addEventListener(ANNOUNCEMENTS_UPDATED_EVENT, fetchUnread);
    return () => {
      clearInterval(interval);
      window.removeEventListener(ANNOUNCEMENTS_UPDATED_EVENT, fetchUnread);
    };
  }, [fetchUnread]);

  useEffect(() => {
    const syncNotificationPreference = () => {
      setDeviceNotificationsEnabled(
        Boolean(
          user &&
            isDeviceNotificationEnabled(user.id) &&
            'Notification' in window &&
            Notification.permission === 'granted',
        ),
      );
    };
    syncNotificationPreference();
    window.addEventListener('econnotes-device-notification-preference', syncNotificationPreference);
    return () =>
      window.removeEventListener('econnotes-device-notification-preference', syncNotificationPreference);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('header-messages')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages', filter: `receiver_id=eq.${user.id}` },
        () => {
          fetchUnread();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, fetchUnread]);

  const handleSearchSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = searchQuery.trim();
    setMobileSearchOpen(false);
    if (trimmed) {
      navigate(`/notes?q=${encodeURIComponent(trimmed)}`);
    } else {
      navigate('/notes');
    }
  };

  const handleLogout = async () => {
    await signOut();
    toast.success('Çıkış başarılı!');
    navigate('/login');
  };

  const sendTestNotification = async () => {
    playChime();
    toast('EconNotes Test Bildirimi', {
      description: 'Cihaz bildirimleriniz başarıyla aktif! Yeni duyurular bu cihaza anında düşecektir.',
      duration: 8000,
    });

    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;

    await displayDeviceNotification('EconNotes Test Bildirimi', {
      body: 'Cihaz bildirimleriniz başarıyla aktif! Yeni duyurular bu cihaza anında düşecektir.',
      data: { url: '/announcements' },
      tag: `econnotes-test-${Date.now()}`,
    });
  };

  const handleBellClick = async () => {
    if (!user) return;

    if (typeof window === 'undefined' || !('Notification' in window)) {
      const isIOS =
        typeof navigator !== 'undefined' &&
        (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
          (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
      if (isIOS) {
        toast.info(
          'iPhone Bildirim Kurulumu: Safari Paylaş > "Ana Ekrana Ekle" dedikten sonra uygulamayı ana ekrandan açın. Bildirimler cihazınıza anında düşecektir.',
          { duration: 9000 },
        );
      } else {
        toast.error('Bu cihaz veya tarayıcı bildirimleri desteklemiyor.');
      }
      return;
    }

    if (deviceNotificationsEnabled) {
      setDeviceNotificationEnabled(user.id, false);
      setDeviceNotificationsEnabled(false);
      void syncOneSignalSubscription(user.id, false);
      toast.success('Cihaz bildirimleri kapatıldı.');
      return;
    }

    if (Notification.permission === 'denied') {
      toast.error(
        'Bildirim izni cihazınızda/tarayıcınızda engelli. Açmak için adres çubuğundaki kilit/ayar simgesinden Bildirimler seçeneğini "İzin Ver" yapın.',
        { duration: 9000 },
      );
      return;
    }

    try {
      const granted = await requestOneSignalPermission(user.id);

      if (granted) {
        const now = new Date(Date.now() - 30_000).toISOString();
        setDeviceNotificationEnabled(user.id, true);
        localStorage.setItem(getNotificationCursorKey(user.id, 'notes'), now);
        localStorage.setItem(getNotificationCursorKey(user.id, 'announcements'), now);
        setDeviceNotificationsEnabled(true);
        toast.success('Bildirim izni verildi! Cihaz bildirimleri açıldı.');
        await sendTestNotification();
      } else {
        toast.error('Bildirim izni onaylanmadı.');
      }
    } catch (e) {
      console.error('Notification permission request error:', e);
      toast.error('Bildirim izni alınamadı.');
    }
  };

  const totalUnread = unreadAnnouncements + unreadMessages;
  const formattedPoints = (points?.points ?? 0).toLocaleString('tr-TR');

  return (
    <header className="sticky top-0 z-30 w-full">
      {/* Solid opaque top surface prevents iOS 26 Standalone PWA native progressive blur over header controls */}
      <div
        className="w-full border-b border-slate-200/70 dark:border-slate-800/80 bg-background"
        style={{
          paddingTop: 'calc(env(safe-area-inset-top, 0px) + var(--ios-pwa-top-buffer, 0px))',
          paddingLeft: 'env(safe-area-inset-left, 0px)',
          paddingRight: 'env(safe-area-inset-right, 0px)',
        }}
      >
        <div className="mx-auto flex h-[56px] sm:h-[68px] w-full max-w-[1440px] items-center justify-between gap-2 px-3 sm:px-6 lg:px-8">
          {/* Mobile Brand Logo (desktop displays logo at top of left sidebar) */}
          <button
            type="button"
            onClick={() => navigate('/')}
            className="flex min-w-0 shrink-0 items-center gap-1.5 rounded-xl py-1 focus:outline-none md:hidden"
          >
            <EconLogo className="h-[19px] max-w-[96px] w-auto sm:h-6 sm:max-w-none" />
            {isNovember10 && (
              <span className="inline-flex items-center gap-1 border-l border-border/80 pl-1.5">
                <AtaturkPortrait className="h-5 w-auto" />
                <Ataturk10KasimEmblem className="h-4 w-4" />
              </span>
            )}
          </button>

          {/* Desktop & Tablet Pill Search Bar */}
          <form
            onSubmit={handleSearchSubmit}
            className="relative hidden flex-1 max-w-[540px] items-center md:flex"
            role="search"
            aria-label="Ders, not veya konu ara"
          >
            <Search
              className="pointer-events-none absolute left-4 h-4 w-4 text-slate-400 dark:text-slate-500"
              strokeWidth={1.9}
            />
            <input
              ref={searchInputRef}
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Ders, not veya konu ara..."
              className="h-11 w-full rounded-full border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-[#0d182d] pl-11 pr-16 text-[13.5px] text-foreground placeholder:text-slate-400 dark:placeholder:text-slate-500 shadow-[0_2px_10px_rgba(15,23,42,0.03)] transition-all focus:border-blue-500/60 focus:outline-none focus:ring-2 focus:ring-blue-500/15"
            />
            <span className="pointer-events-none absolute right-3.5 inline-flex items-center gap-0.5 rounded-lg border border-slate-200/90 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/90 px-2 py-0.5 font-mono text-[11px] font-medium text-slate-400 dark:text-slate-400">
              ⌘ K
            </span>
          </form>

          {/* Right Utility Controls — Strictly Sized to Fit 360px+ Screens Without Clipping */}
          <div className="flex shrink-0 items-center gap-1 sm:gap-2.5">
            {/* Mobile Search Toggle */}
            <button
              type="button"
              aria-label="Ara"
              title="Ders, not veya konu ara"
              onClick={() => {
                setMobileSearchOpen((v) => !v);
                window.setTimeout(() => mobileSearchInputRef.current?.focus(), 60);
              }}
              className="flex h-8 w-8 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-full text-slate-600 transition-colors hover:bg-slate-200/70 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white md:hidden"
            >
              {mobileSearchOpen ? <X className="h-[17px] w-[17px]" /> : <Search className="h-[17px] w-[17px]" />}
            </button>

            {/* Points Pill Button */}
            <button
              type="button"
              onClick={() => navigate('/points')}
              title={`${formattedPoints} Puan${points?.current_streak ? ` • ${points.current_streak} günlük seri` : ''}`}
              className={cn(
                'inline-flex h-8 sm:h-10 shrink-0 items-center gap-1 sm:gap-1.5 whitespace-nowrap rounded-full px-2.5 sm:px-4 text-[11.5px] sm:text-[13px] font-bold transition-all duration-200 hover:brightness-105 active:scale-95',
                isNovember10
                  ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950 shadow-sm'
                  : 'bg-gradient-to-r from-[#1d4ed8] via-[#2563eb] to-[#3b82f6] text-white shadow-[0_6px_16px_-5px_rgba(37,99,235,0.5)]',
              )}
            >
              <Zap
                className={cn(
                  'h-3 w-3 sm:h-3.5 sm:w-3.5 shrink-0',
                  isNovember10 ? 'fill-current' : 'fill-amber-300 text-amber-300',
                )}
              />
              <span className="tabular-nums">
                {formattedPoints}
                <span className="hidden min-[410px]:inline"> Puan</span>
              </span>
            </button>

            <span aria-hidden="true" className="hidden h-5 w-px bg-slate-200 dark:bg-slate-800 sm:block" />

            {/* Notifications Popover */}
            <Popover open={notificationsOpen} onOpenChange={setNotificationsOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label="Bildirimler"
                  title="Bildirimler"
                  className="relative flex h-8 w-8 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-full text-slate-600 transition-colors hover:bg-slate-200/70 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
                >
                  {deviceNotificationsEnabled ? (
                    <BellRing className="h-[18px] w-[18px] sm:h-[19px] sm:w-[19px] text-primary" strokeWidth={1.85} />
                  ) : (
                    <Bell className="h-[18px] w-[18px] sm:h-[19px] sm:w-[19px]" strokeWidth={1.85} />
                  )}
                  {totalUnread > 0 && (
                    <span className="absolute right-1.5 top-1.5 sm:right-2 sm:top-2 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-background" />
                  )}
                </button>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                className="z-[70] w-72 rounded-2xl border-slate-200/90 dark:border-slate-800 bg-card p-3 shadow-xl"
              >
                <div className="mb-2 flex items-center justify-between px-1">
                  <span className="text-xs font-bold text-foreground">Bildirimler</span>
                  {totalUnread > 0 && (
                    <span className="rounded-full bg-rose-500/10 px-2 py-0.5 text-[10px] font-bold text-rose-600 dark:text-rose-400">
                      {totalUnread} yeni
                    </span>
                  )}
                </div>
                <div className="space-y-1">
                  <button
                    type="button"
                    onClick={() => {
                      setNotificationsOpen(false);
                      navigate('/announcements');
                    }}
                    className="flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-left text-xs font-medium text-foreground transition-colors hover:bg-muted/70"
                  >
                    <span className="flex items-center gap-2">
                      <Megaphone className="h-4 w-4 text-primary" />
                      <span>Duyurular</span>
                    </span>
                    {unreadAnnouncements > 0 ? (
                      <span className="rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                        {unreadAnnouncements}
                      </span>
                    ) : (
                      <span className="text-[11px] text-muted-foreground">Güncel</span>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setNotificationsOpen(false);
                      navigate('/messages');
                    }}
                    className="flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-left text-xs font-medium text-foreground transition-colors hover:bg-muted/70"
                  >
                    <span className="flex items-center gap-2">
                      <MessageSquare className="h-4 w-4 text-primary" />
                      <span>Mesajlar</span>
                    </span>
                    {unreadMessages > 0 ? (
                      <span className="rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                        {unreadMessages}
                      </span>
                    ) : (
                      <span className="text-[11px] text-muted-foreground">Okunmuş</span>
                    )}
                  </button>

                  {user && (
                    <button
                      type="button"
                      onClick={() => {
                        void handleBellClick();
                      }}
                      className="mt-1 flex w-full items-center justify-between rounded-xl border border-border/70 bg-muted/40 px-2.5 py-2 text-left text-xs font-medium text-foreground transition-colors hover:bg-muted/80"
                    >
                      <span className="flex items-center gap-2">
                        <BellRing className="h-4 w-4 text-primary" />
                        <span>Cihaz Bildirimleri</span>
                      </span>
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 text-[10px] font-bold',
                          deviceNotificationsEnabled
                            ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                            : 'bg-slate-200/80 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
                        )}
                      >
                        {deviceNotificationsEnabled ? 'Açık' : 'Kapalı'}
                      </span>
                    </button>
                  )}
                </div>
              </PopoverContent>
            </Popover>

            {/* Theme Switcher */}
            <button
              type="button"
              title={theme === 'light' ? 'Karanlık moda geç' : 'Aydınlık moda geç'}
              aria-label="Tema değiştir"
              onClick={toggleTheme}
              className="flex h-8 w-8 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-full text-slate-600 transition-colors hover:bg-slate-200/70 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
            >
              {theme === 'light' ? (
                <Moon className="h-[18px] w-[18px] sm:h-[19px] sm:w-[19px]" strokeWidth={1.85} />
              ) : (
                <Sun className="h-[18px] w-[18px] sm:h-[19px] sm:w-[19px]" strokeWidth={1.85} />
              )}
            </button>

            {/* Profile Avatar Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="Profil menüsü"
                  title={displayName}
                  className={cn(
                    'flex h-8 w-8 sm:h-10 sm:w-10 shrink-0 items-center justify-center overflow-hidden rounded-full text-xs sm:text-sm font-bold text-white shadow-sm ring-2 ring-white/80 dark:ring-slate-800 transition-transform active:scale-95 focus:outline-none focus-visible:ring-primary/50',
                    isNovember10 ? 'bg-zinc-900 dark:bg-zinc-700' : 'bg-[#132b5e] dark:bg-blue-600',
                  )}
                >
                  {profile?.avatar_url ? (
                    <img
                      src={profile.avatar_url}
                      alt={displayName}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span>{userInitial}</span>
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="z-[70] w-56 rounded-2xl border-slate-200/90 dark:border-slate-800 p-1.5"
              >
                <DropdownMenuLabel className="px-2.5 py-1.5">
                  <p className="truncate text-xs font-bold text-foreground">{displayName}</p>
                  <p className="truncate text-[11px] font-normal text-muted-foreground">
                    {user?.email || 'Öğrenci Hesabı'}
                  </p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => navigate('/profile')}
                  className="cursor-pointer gap-2 rounded-xl text-xs font-medium"
                >
                  <User className="h-3.5 w-3.5" />
                  Profilim & Ayarlar
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => navigate('/points')}
                  className="cursor-pointer gap-2 rounded-xl text-xs font-medium"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Puan Geçmişim &amp; Sıralama
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => navigate('/support')}
                  className="cursor-pointer gap-2 rounded-xl text-xs font-medium"
                >
                  <LifeBuoy className="h-3.5 w-3.5" />
                  Destek Merkezi
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => navigate('/about')}
                  className="cursor-pointer gap-2 rounded-xl text-xs font-medium"
                >
                  <Info className="h-3.5 w-3.5" />
                  EconNotes Hakkında
                </DropdownMenuItem>
                {isAdmin && (
                  <DropdownMenuItem
                    onClick={() => navigate('/admin')}
                    className="cursor-pointer gap-2 rounded-xl text-xs font-medium"
                  >
                    <Shield className="h-3.5 w-3.5" />
                    Yönetici Paneli
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => setLogoutDialogOpen(true)}
                  className="cursor-pointer gap-2 rounded-xl text-xs font-medium text-destructive focus:text-destructive"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Çıkış Yap
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Expandable Mobile Search Bar */}
        {mobileSearchOpen && (
          <form
            onSubmit={handleSearchSubmit}
            className="border-t border-slate-200/70 dark:border-slate-800/80 px-3.5 py-2.5 md:hidden"
            role="search"
          >
            <div className="relative flex items-center">
              <Search className="pointer-events-none absolute left-3.5 h-4 w-4 text-slate-400" />
              <input
                ref={mobileSearchInputRef}
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Ders, not veya konu ara..."
                className="h-10 w-full rounded-full border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-[#0d182d] pl-10 pr-4 text-sm text-foreground placeholder:text-slate-400 focus:border-blue-500/60 focus:outline-none"
              />
            </div>
          </form>
        )}
      </div>

      {/* Logout Confirmation Dialog */}
      <AlertDialog open={logoutDialogOpen} onOpenChange={setLogoutDialogOpen}>
        <AlertDialogContent className="rounded-2xl border-border/80 bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lg font-bold text-foreground">
              EconNotes&apos;tan Çıkış Yapılsın mı?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm leading-relaxed text-muted-foreground">
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
    </header>
  );
};

export default Header;
