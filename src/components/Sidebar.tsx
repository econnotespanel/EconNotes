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
  Home,
  FileText,
  Megaphone,
  User,
  Shield,
  MessageSquare,
  Menu,
  X,
  Info,
  Bot,
  Video,
  GraduationCap,
  Target,
  Sparkles,
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
  isNew?: boolean;
  isBeta?: boolean;
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

  const primary: LinkItem[] = [
    { label: 'Ana Sayfa',          icon: Home,          path: '/' },
    { label: 'Notlar',             icon: FileText,      path: '/notes' },
    { label: 'Duyurular',          icon: Megaphone,     path: '/announcements', badge: unreadAnnouncements },
    { label: 'Mesajlar',           icon: MessageSquare, path: '/messages',      badge: unreadMessages },
  ];

  const tools: LinkItem[] = [
    { label: 'Çalışma Stüdyosu',   icon: GraduationCap, path: '/study',      isNew: true },
    { label: 'KPSS Merkezi',       icon: Target,        path: '/kpss',       isNew: true },
    { label: 'Canlı Ders',         icon: Video,         path: '/live-class' },
    { label: 'Akademik Asistan',   icon: Bot,           path: '/assistant' },
  ];

  const account: LinkItem[] = [
    { label: 'Profilim',           icon: User,          path: '/profile' },
    { label: 'Puan Geçmişim',      icon: Sparkles,      path: '/points',     isNew: true },
    { label: 'Destek Merkezi',     icon: LifeBuoy,      path: '/support',    isBeta: true, badge: unreadSupport },
    { label: 'Hakkında',           icon: Info,          path: '/about' },
    ...(isAdmin ? [{ label: 'Yönetici Paneli', icon: Shield, path: '/admin' } as LinkItem] : []),
  ];

  const visible = (items: LinkItem[]) => items.filter(l => isAdmin || isPageEnabled(l.path));

  const totalBadge = unreadMessages + unreadSupport + unreadAnnouncements;

  const handleLogout = async () => {
    await signOut();
    toast.success('Çıkış başarılı!');
    navigate('/login');
  };

  const renderItem = (link: LinkItem, isFirst = false) => {
    const Icon = link.icon;
    const active =
      link.path === '/'
        ? location.pathname === '/'
        : location.pathname === link.path || location.pathname.startsWith(link.path + '/');

    return (
      <button
        key={link.path}
        ref={isFirst ? firstItemRef : undefined}
        onClick={() => navigate(link.path)}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'group relative flex items-center gap-2.5 w-full rounded-[13px] px-2.5 min-h-[35px] py-1.5 text-[13px]',
          'transition-all duration-200 ease-out select-none',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
          active
            ? 'bg-gradient-to-r from-primary/[0.13] via-primary/[0.07] to-cyan-500/[0.04] text-primary dark:text-[#60a5fa] font-semibold ring-1 ring-primary/25 shadow-[0_2px_12px_-3px_hsl(var(--primary)/0.18)]'
            : 'text-foreground/75 dark:text-slate-300/85 font-medium hover:bg-primary/[0.06] dark:hover:bg-white/[0.05] hover:text-foreground',
        )}
      >
        {/* Sol aktif gösterge çubuğu */}
        <span
          aria-hidden
          className={cn(
            'absolute left-0 top-1/2 -translate-y-1/2 w-[3px] rounded-r-full transition-all duration-300',
            active
              ? 'h-5 opacity-100 bg-gradient-to-b from-[#003791] via-primary to-cyan-400 shadow-[0_0_8px_hsl(var(--primary)/0.6)]'
              : 'h-2.5 opacity-0 group-hover:opacity-45 bg-primary',
          )}
        />

        {/* İkon kutusu */}
        <span
          className={cn(
            'flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px] transition-all duration-200',
            active
              ? 'bg-gradient-to-br from-[#003791] to-[#0070d1] text-white shadow-[0_3px_10px_rgba(0,112,209,0.35)] ring-1 ring-white/20'
              : 'bg-primary/[0.06] text-foreground/65 group-hover:bg-primary/15 group-hover:text-primary dark:bg-white/[0.05] dark:text-slate-300/80 dark:group-hover:bg-primary/20 dark:group-hover:text-[#60a5fa]',
          )}
        >
          <Icon
            className="h-[15px] w-[15px] shrink-0 transition-transform duration-200 group-hover:scale-105"
            strokeWidth={active ? 2.2 : 1.9}
          />
        </span>

        <span className="flex-1 text-left truncate tracking-[-0.01em]">{link.label}</span>

        {link.isNew && (
          <span
            className={cn(
              'px-2 py-0.5 text-[9px] font-bold tracking-wider rounded-full border transition-colors',
              active
                ? 'border-primary/35 bg-primary/15 text-primary dark:border-[#60a5fa]/40 dark:bg-[#60a5fa]/15 dark:text-[#60a5fa]'
                : 'border-primary/25 text-primary bg-primary/[0.08] dark:border-[#5b9cf6]/30 dark:text-[#60a5fa] dark:bg-[#5b9cf6]/10',
            )}
          >
            YENİ
          </span>
        )}
        {link.isBeta && (
          <span className="px-2 py-0.5 text-[9px] font-bold tracking-wider rounded-full border border-amber-500/30 text-amber-600 bg-amber-500/10 dark:text-amber-400">
            BETA
          </span>
        )}
        {link.badge && link.badge > 0 ? (
          <span className="h-[19px] min-w-[22px] px-1.5 rounded-full bg-destructive text-[10.5px] font-bold text-destructive-foreground inline-flex items-center justify-center shadow-xs">
            {link.badge > 99 ? '99+' : link.badge}
          </span>
        ) : null}
      </button>
    );
  };

  const Section = ({
    title,
    items,
    isFirstSection = false,
  }: {
    title: string;
    items: LinkItem[];
    isFirstSection?: boolean;
  }) => {
    if (items.length === 0) return null;
    return (
      <div
        className={cn(
          'flex flex-col gap-0.5',
          !isFirstSection && 'mt-1.5 pt-2 border-t border-border/60 dark:border-white/[0.06]',
        )}
      >
        <div className="flex items-center gap-1.5 px-2.5 pb-1 text-[9.5px] font-bold uppercase tracking-[0.16em] text-muted-foreground/80">
          <span className="h-1.5 w-1.5 rounded-full bg-gradient-to-br from-[#003791] to-cyan-500 opacity-75" />
          <span>{title}</span>
        </div>
        <div className="flex flex-col gap-0.5">
          {items.map((l, i) => renderItem(l, isFirstSection && i === 0))}
        </div>
      </div>
    );
  };

  return (
    <>
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
          'fixed left-3 md:left-4 z-40 w-[264px] max-w-[calc(100vw-1.5rem)] md:w-[244px]',
          'flex flex-col overflow-hidden',
          'rounded-[22px]',
          'bg-card/90 dark:bg-card/85 text-foreground',
          'border border-border/75 dark:border-white/[0.09]',
          'shadow-[0_14px_38px_-10px_hsl(var(--primary)/0.12),0_6px_20px_hsl(var(--foreground)/0.04)] dark:shadow-[0_24px_60px_rgba(0,0,0,0.75)]',
          'backdrop-blur-2xl',
          'transition-all duration-300 ease-[cubic-bezier(.22,1,.36,1)] md:transition-none',
          'md:translate-x-0 md:opacity-100',
          open ? 'translate-x-0 opacity-100' : '-translate-x-[115%] opacity-0 md:opacity-100',
        )}
        style={{
          top: 'calc(env(safe-area-inset-top, 0px) + 5.75rem)',
          maxHeight: 'calc(100dvh - env(safe-area-inset-top, 0px) - 6.5rem)',
        }}
      >
        {/* Üst ince EconNotes vurgu çizgisi */}
        <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-primary/70 to-transparent" />

        <div className="flex-1 overflow-y-auto overscroll-contain p-2.5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          <nav className="flex flex-col" aria-label="Ana menü">
            <Section title="Panel" items={visible(primary)} isFirstSection />
            <Section title="Araçlar" items={visible(tools)} />
            <Section title="Hesap" items={visible(account)} />
          </nav>
        </div>

        <div className="px-3.5 py-2.5 border-t border-border/60 dark:border-white/[0.06] bg-gradient-to-r from-primary/[0.04] via-transparent to-cyan-500/[0.04] flex items-center justify-between text-[10px] text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <EconLogo className="h-3.5 w-auto opacity-90" />
            {isNovember10 && (
              <div className="flex items-center gap-1">
                <AtaturkPortrait className="h-3.5 w-auto" />
                <Ataturk10KasimEmblem className="h-3 w-3" />
              </div>
            )}
          </div>
          <span className="rounded-full border border-primary/20 bg-primary/[0.08] px-2 py-0.5 font-mono text-[10px] font-semibold text-primary dark:text-[#60a5fa]">
            {APP_VERSION}
          </span>
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
