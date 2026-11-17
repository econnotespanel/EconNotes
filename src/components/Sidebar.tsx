import { useAuth } from '@/contexts/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
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
import {
  LayoutGrid,
  FileText,
  Megaphone,
  User,
  Shield,
  Mail,
  Menu,
  X,
  Info,
  Bot,
  Video,
  Layers,
  ListChecks,
  Trophy,
  LogOut,
  LifeBuoy,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState, useEffect, useCallback, useRef } from 'react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { APP_VERSION } from '@/lib/version';
import { getSeasonalTheme, useSiteConfig } from '@/contexts/SiteConfigContext';
import EconLogo from '@/components/EconLogo';
import Ataturk10KasimEmblem from '@/components/Ataturk10KasimEmblem';
import AtaturkPortrait from '@/components/AtaturkPortrait';
import { toast } from 'sonner';
import { parseSupportMessage, SUPPORT_MESSAGE_PREFIX } from '@/lib/support';

type LinkItem = {
  label: string;
  icon: any;
  path: string;
  badge?: number;
};

const Sidebar = () => {
  const { isAdmin, user, signOut } = useAuth();
  const { isPageEnabled, config } = useSiteConfig();
  const seasonalTheme = getSeasonalTheme(config.theme.seasonalMode || 'default');
  const isNovember10 = seasonalTheme?.id === 'november10';
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [unreadSupport, setUnreadSupport] = useState(0);
  const [unreadAnnouncements, setUnreadAnnouncements] = useState(0);
  const firstItemRef = useRef<HTMLButtonElement>(null);

  const fetchUnread = useCallback(async () => {
    if (!user) return;
    const [{ data: unreadMsgs }, { data: unreadSupportRows }] = await Promise.all([
      supabase
        .from('messages')
        .select('sender_id')
        .eq('receiver_id', user.id)
        .eq('is_read', false)
        .not('content', 'like', `${SUPPORT_MESSAGE_PREFIX}%`),
      supabase
        .from('messages')
        .select('content')
        .eq('receiver_id', user.id)
        .eq('is_read', false)
        .like('content', `${SUPPORT_MESSAGE_PREFIX}%`),
    ]);
    if (unreadMsgs) {
      const uniqueSenders = new Set(unreadMsgs.map((m: any) => m.sender_id));
      setUnreadMessages(uniqueSenders.size);
    }
    if (unreadSupportRows) {
      const unreadTicketIds = new Set<string>();
      for (const row of unreadSupportRows as { content: string }[]) {
        const parsed = parseSupportMessage(row.content);
        if (parsed && (parsed.kind === 'ticket' || parsed.kind === 'reply')) {
          unreadTicketIds.add(parsed.ticketId);
        }
      }
      setUnreadSupport(unreadTicketIds.size);
    }
    const { data: announcements } = await supabase.from('announcements').select('id');
    const { data: views } = await supabase.from('announcement_views').select('announcement_id').eq('user_id', user.id);
    const viewedIds = new Set((views || []).map((v: any) => v.announcement_id));
    setUnreadAnnouncements((announcements || []).filter(a => !viewedIds.has(a.id)).length);
  }, [user]);

  useEffect(() => {
    fetchUnread();
    const interval = setInterval(fetchUnread, 120000);
    window.addEventListener('econnotes:support-read-updated', fetchUnread);
    return () => {
      clearInterval(interval);
      window.removeEventListener('econnotes:support-read-updated', fetchUnread);
    };
  }, [fetchUnread]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('sidebar-messages')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `receiver_id=eq.${user.id}` }, () => fetchUnread())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, fetchUnread]);

  useEffect(() => { setOpen(false); }, [location.pathname]);

  useEffect(() => {
    const handleToggle = () => setOpen(v => !v);
    const handleClose = () => setOpen(false);
    const handleOpen = () => setOpen(true);

    window.addEventListener('econnotes:toggle-sidebar', handleToggle);
    window.addEventListener('econnotes:close-sidebar', handleClose);
    window.addEventListener('econnotes:open-sidebar', handleOpen);

    return () => {
      window.removeEventListener('econnotes:toggle-sidebar', handleToggle);
      window.removeEventListener('econnotes:close-sidebar', handleClose);
      window.removeEventListener('econnotes:open-sidebar', handleOpen);
    };
  }, []);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('econnotes:sidebar-state', { detail: { open } }));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    const t = setTimeout(() => firstItemRef.current?.focus(), 120);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
      clearTimeout(t);
    };
  }, [open]);

  const menuItems: LinkItem[] = [
    { label: 'Panel',            icon: LayoutGrid, path: '/' },
    { label: 'Notlar',           icon: FileText,   path: '/notes' },
    { label: 'Duyurular',        icon: Megaphone,  path: '/announcements', badge: unreadAnnouncements },
    { label: 'Çalışma Stüdyosu', icon: Layers,     path: '/study' },
    { label: 'Soru Bankası',     icon: ListChecks, path: '/kpss' },
    { label: 'Canlı Ders',       icon: Video,      path: '/live-class' },
    { label: 'Akademik Asistan', icon: Bot,        path: '/assistant' },
    { label: 'Liderlik',         icon: Trophy,     path: '/points' },
    { label: 'Mesajlarım',       icon: Mail,       path: '/messages',      badge: unreadMessages },
    { label: 'Destek Merkezi',   icon: LifeBuoy,   path: '/support',       badge: unreadSupport },
    { label: 'Profilim',         icon: User,       path: '/profile' },
    { label: 'Hakkında',         icon: Info,       path: '/about' },
    ...(isAdmin ? [{ label: 'Yönetim', icon: Shield, path: '/admin' } as LinkItem] : []),
  ];

  const visibleItems = menuItems.filter(l => isAdmin || isPageEnabled(l.path));

  const totalBadge = unreadMessages + unreadSupport + unreadAnnouncements;

  const handleLogout = async () => {
    await signOut();
    toast.success('Çıkış başarılı!');
    navigate('/login');
  };

  const renderItem = (link: LinkItem, isFirst = false) => {
    const Icon = link.icon;
    const active = location.pathname === link.path;
    return (
      <button
        key={link.path}
        ref={isFirst ? firstItemRef : undefined}
        onClick={() => navigate(link.path)}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'group relative flex items-center gap-3.5 w-full rounded-[15px] px-4 min-h-[44px] py-2.5 text-[14.5px]',
          'transition-all duration-200 ease-out select-none',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
          active
            ? 'bg-blue-500/12 dark:bg-[#19283e] text-blue-600 dark:text-[#5b9cf6] font-semibold'
            : 'text-slate-600 dark:text-[#8e96a4] font-medium hover:bg-slate-100/80 dark:hover:bg-white/[0.05] hover:text-slate-900 dark:hover:text-[#e2e8f0]',
        )}
      >
        <Icon
          className={cn(
            'h-[19px] w-[19px] shrink-0 transition-colors duration-200',
            active
              ? 'text-blue-600 dark:text-[#5b9cf6]'
              : 'text-slate-500 dark:text-[#8e96a4] group-hover:text-slate-800 dark:group-hover:text-[#e2e8f0]',
          )}
          strokeWidth={active ? 2.1 : 1.85}
        />

        <span className="flex-1 text-left truncate tracking-[-0.01em]">{link.label}</span>

        {link.badge && link.badge > 0 ? (
          <span className="h-[22px] min-w-[28px] px-2 rounded-full bg-[#f05252] text-[11.5px] font-bold text-white inline-flex items-center justify-center shadow-xs">
            {link.badge > 99 ? '99+' : link.badge}
          </span>
        ) : null}
      </button>
    );
  };

  return (
    <>
      {/* Hamburger — mobile */}
      <button
        type="button"
        aria-label={open ? 'Menüyü kapat' : 'Menüyü aç'}
        aria-expanded={open}
        aria-controls="mobile-sidebar"
        className="fixed left-3 z-[70] flex h-10 w-10 items-center justify-center p-0 md:hidden rounded-xl border border-border/80 bg-card/95 text-foreground shadow-sm backdrop-blur-md hover:bg-accent active:scale-95 transition-all touch-manipulation"
        style={{ top: 'calc(env(safe-area-inset-top, 0px) + 1.5rem)' }}
        onClick={() => setOpen(v => !v)}
      >
        <div className="relative flex h-5 w-5 items-center justify-center">
          <Menu className={cn('h-5 w-5 transition-all duration-300', open ? 'opacity-0 rotate-90 scale-75' : 'opacity-100 rotate-0 scale-100')} />
          <X className={cn('absolute inset-0 m-auto h-5 w-5 transition-all duration-300', open ? 'opacity-100 rotate-0 scale-100' : 'opacity-0 -rotate-90 scale-75')} />
        </div>
        {!open && totalBadge > 0 && (
          <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-[#f05252] shadow-[0_0_8px_rgba(240,82,82,0.7)]" />
        )}
      </button>

      {/* Backdrop */}
      <div
        aria-hidden
        onClick={() => setOpen(false)}
        className={cn(
          'fixed inset-0 z-40 bg-black/60 backdrop-blur-[2px] md:hidden transition-opacity duration-300',
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
        )}
      />

      <aside
        id="mobile-sidebar"
        role="navigation"
        className={cn(
          'fixed left-3 md:left-4 z-50 w-[260px] max-w-[calc(100vw-1.5rem)] md:w-[240px]',
          'flex flex-col',
          'rounded-[26px]',
          'bg-white/95 dark:bg-[#14171c]/95 text-slate-700 dark:text-[#8e96a4]',
          'border border-slate-200/80 dark:border-white/[0.08]',
          'shadow-[0_20px_50px_rgba(15,23,42,0.12)] dark:shadow-[0_24px_60px_rgba(0,0,0,0.75)]',
          'backdrop-blur-xl',
          'transition-all duration-300 ease-[cubic-bezier(.22,1,.36,1)] md:transition-none',
          'md:translate-x-0 md:opacity-100',
          open ? 'translate-x-0 opacity-100' : '-translate-x-[115%] opacity-0 md:opacity-100',
        )}
        style={{
          top: 'calc(env(safe-area-inset-top, 0px) + 5.5rem)',
          maxHeight: 'calc(100dvh - env(safe-area-inset-top, 0px) - 6.5rem)',
        }}
      >
        <div className="flex-1 overflow-y-auto overscroll-contain p-3">
          <nav className="flex flex-col gap-1" aria-label="Ana menü">
            {visibleItems.map((l, i) => renderItem(l, i === 0))}
          </nav>
        </div>

        <div className="px-4 py-2.5 border-t border-slate-200/60 dark:border-white/[0.06] flex items-center justify-between text-[10px] text-slate-400 dark:text-[#646d7a]">
          <div className="flex items-center gap-1.5">
            <EconLogo className="h-3.5 w-auto opacity-80" />
            {isNovember10 && (
              <div className="flex items-center gap-1">
                <AtaturkPortrait className="h-3.5 w-auto" />
                <Ataturk10KasimEmblem className="h-3 w-3" />
              </div>
            )}
          </div>
          <span className="font-mono font-medium">{APP_VERSION}</span>
        </div>

        <div className="px-3 pb-3 md:hidden">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                className="h-10 w-full justify-center gap-2 rounded-2xl border border-destructive/20 bg-destructive/10 text-destructive hover:bg-destructive/15 hover:text-destructive text-xs font-semibold"
              >
                <LogOut className="h-3.5 w-3.5" /> Çıkış Yap
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="w-[calc(100%-2rem)] !rounded-2xl border-border/70 bg-background/95 p-5 shadow-2xl backdrop-blur-sm sm:w-full sm:p-6">
              <AlertDialogHeader>
                <AlertDialogTitle>Çıkış yapmak istediğinize emin misiniz?</AlertDialogTitle>
                <AlertDialogDescription>Hesabınızdan güvenli şekilde çıkış yapılacaktır.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter className="gap-2 sm:gap-2">
                <AlertDialogCancel className="mt-0 w-full rounded-xl sm:w-auto">İptal</AlertDialogCancel>
                <AlertDialogAction onClick={handleLogout} className="w-full rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90 sm:w-auto">
                  Çıkış Yap
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
