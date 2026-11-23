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
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Home,
  FileText,
  Megaphone,
  User,
  Shield,
  MessageSquare,
  X,
  Info,
  Bot,
  Video,
  GraduationCap,
  Target,
  Sparkles,
  LogOut,
  LifeBuoy,
  Crown,
  ChevronRight,
  ChevronDown,
  Settings,
  Trophy,
  Gift,
  BookOpen,
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
  icon: typeof Home;
  path: string;
  badge?: number;
  isNew?: boolean;
  isBeta?: boolean;
  tagLabel?: string;
};

const Sidebar = () => {
  const { isAdmin, user, profile, signOut } = useAuth();
  const { isPageEnabled, config } = useSiteConfig();
  const seasonalTheme = getSeasonalTheme(config.theme.seasonalMode || 'default');
  const isNovember10 = seasonalTheme?.id === 'november10';
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [proModalOpen, setProModalOpen] = useState(false);
  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [unreadSupport, setUnreadSupport] = useState(0);
  const [unreadAnnouncements, setUnreadAnnouncements] = useState(0);
  const firstItemRef = useRef<HTMLButtonElement>(null);

  const displayName =
    profile?.full_name?.trim() ||
    String(user?.user_metadata?.full_name || user?.user_metadata?.name || '').trim() ||
    user?.email?.split('@')[0] ||
    'Öğrenci';

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
    window.addEventListener('econnotes:support-read-updated', fetchUnread);
    window.addEventListener('econnotes:announcements-updated', fetchUnread);
    return () => {
      clearInterval(interval);
      window.removeEventListener('econnotes:support-read-updated', fetchUnread);
      window.removeEventListener('econnotes:announcements-updated', fetchUnread);
    };
  }, [fetchUnread]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('sidebar-messages')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages', filter: `receiver_id=eq.${user.id}` },
        () => fetchUnread(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, fetchUnread]);

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const handleToggle = () => setOpen((v) => !v);
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
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    const t = setTimeout(() => firstItemRef.current?.focus(), 120);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
      clearTimeout(t);
    };
  }, [open]);

  const primary: LinkItem[] = [
    { label: 'Ana Sayfa', icon: Home, path: '/' },
    { label: 'Notlar', icon: FileText, path: '/notes' },
    { label: 'Duyurular', icon: Megaphone, path: '/announcements', badge: unreadAnnouncements },
    { label: 'Mesajlar', icon: MessageSquare, path: '/messages', badge: unreadMessages },
  ];

  const tools: LinkItem[] = [
    { label: 'Çalışma Stüdyosu', icon: GraduationCap, path: '/study', isNew: true },
    { label: 'KPSS Merkezi', icon: Target, path: '/kpss', tagLabel: 'EconKPSS' },
    { label: 'Canlı Ders', icon: Video, path: '/live-class' },
    { label: 'Akademik Asistan', icon: Bot, path: '/assistant' },
  ];

  const account: LinkItem[] = [
    { label: 'Profilim', icon: User, path: '/profile' },
    { label: 'Puan Geçmişim', icon: Sparkles, path: '/points', isNew: true },
    { label: 'Destek Merkezi', icon: LifeBuoy, path: '/support', isBeta: true, badge: unreadSupport },
    ...(isAdmin ? [{ label: 'Yönetici Paneli', icon: Shield, path: '/admin' } as LinkItem] : []),
  ];

  const visible = (items: LinkItem[]) => items.filter((l) => isAdmin || isPageEnabled(l.path));

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
        type="button"
        onClick={() => navigate(link.path)}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'group relative flex h-10 w-full items-center gap-3 rounded-full px-3.5 text-[13.5px] select-none transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
          active
            ? isNovember10
              ? 'bg-zinc-900 text-white font-semibold shadow-sm dark:bg-zinc-100 dark:text-zinc-950'
              : 'bg-gradient-to-r from-[#1b5ce5] via-[#2b73f5] to-[#5ba0ff] text-white font-semibold shadow-[0_8px_20px_-6px_rgba(27,92,229,0.55)]'
            : 'text-slate-600 dark:text-slate-300 font-medium hover:bg-blue-50/90 dark:hover:bg-primary/10 hover:text-slate-900 dark:hover:text-white',
        )}
      >
        <Icon
          className={cn(
            'h-[17px] w-[17px] shrink-0 transition-colors duration-200',
            active
              ? isNovember10
                ? 'text-white dark:text-zinc-950'
                : 'text-white'
              : 'text-slate-500 dark:text-slate-400 group-hover:text-primary dark:group-hover:text-blue-400',
          )}
          strokeWidth={active ? 2.15 : 1.85}
        />

        <span className="flex-1 truncate text-left tracking-[-0.01em]">{link.label}</span>

        {link.isNew && (
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-[10px] font-semibold leading-none',
              active
                ? 'bg-white/20 text-white'
                : 'bg-blue-50 text-blue-600 border border-blue-200/70 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-400/25',
            )}
          >
            Yeni
          </span>
        )}
        {link.tagLabel && (
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-[10px] font-semibold leading-none',
              active
                ? 'bg-white/20 text-white'
                : 'bg-sky-50 text-sky-700 border border-sky-200/70 dark:bg-sky-500/15 dark:text-sky-300 dark:border-sky-400/25',
            )}
          >
            {link.tagLabel}
          </span>
        )}
        {link.isBeta && (
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-[10px] font-semibold leading-none',
              active
                ? 'bg-white/20 text-white'
                : 'bg-amber-50 text-amber-600 border border-amber-200/80 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-400/25',
            )}
          >
            Beta
          </span>
        )}
        {link.badge && link.badge > 0 ? (
          <span
            className={cn(
              'inline-flex h-[19px] min-w-[20px] items-center justify-center rounded-full px-1.5 text-[10px] font-bold leading-none',
              active ? 'bg-white text-blue-700' : 'bg-rose-500 text-white',
            )}
          >
            {link.badge > 99 ? '99+' : link.badge}
          </span>
        ) : null}
      </button>
    );
  };

  const Section = ({
    title,
    items,
    showHeading = true,
    isFirstSection = false,
  }: {
    title: string;
    items: LinkItem[];
    showHeading?: boolean;
    isFirstSection?: boolean;
  }) => {
    if (items.length === 0) return null;
    return (
      <div className={cn('flex flex-col gap-1', !isFirstSection && 'mt-4')}>
        {showHeading && (
          <div className="px-3.5 pb-1 text-[10.5px] font-bold uppercase tracking-[0.12em] text-slate-400 dark:text-slate-500">
            {title}
          </div>
        )}
        <div className="flex flex-col gap-1">
          {items.map((l, i) => renderItem(l, isFirstSection && i === 0))}
        </div>
      </div>
    );
  };

  return (
    <>
      {/* Mobile Backdrop */}
      <div
        aria-hidden="true"
        onClick={() => setOpen(false)}
        className={cn(
          'fixed inset-0 z-40 bg-[#040d21]/60 backdrop-blur-[3px] md:hidden transition-opacity duration-300',
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
        )}
      />

      <aside
        id="mobile-sidebar"
        role="navigation"
        aria-label="Ana menü"
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-[272px] max-w-[84vw] flex-col border-r border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-[#091224] text-foreground',
          'shadow-[8px_0_32px_rgba(15,23,42,0.08)] md:w-[16rem] md:max-w-none md:shadow-[4px_0_24px_rgba(15,23,42,0.03)] dark:md:shadow-[4px_0_24px_rgba(0,6,20,0.4)]',
          'transition-transform duration-300 ease-[cubic-bezier(.22,1,.36,1)] md:translate-x-0',
          open ? 'translate-x-0 pointer-events-auto' : '-translate-x-full pointer-events-none md:pointer-events-auto',
        )}
        style={{
          paddingTop: 'calc(env(safe-area-inset-top, 0px) + var(--ios-pwa-top-buffer, 0px))',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          paddingLeft: 'env(safe-area-inset-left, 0px)',
        }}
      >
        {/* Top Logo Header Aligned to Left Menu */}
        <div className="flex h-[68px] shrink-0 items-center justify-between px-5">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="flex min-w-0 items-center gap-2 rounded-xl py-1 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            <EconLogo className="h-[25px] w-auto" />
            {isNovember10 && (
              <span className="inline-flex items-center gap-1 border-l border-border/80 pl-2">
                <AtaturkPortrait className="h-6 w-auto" />
                <Ataturk10KasimEmblem className="h-5 w-5" />
              </span>
            )}
          </button>

          <button
            type="button"
            aria-label="Menüyü kapat"
            onClick={() => setOpen(false)}
            className="flex h-8 w-8 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white md:hidden"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable Navigation Sections */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-3 pb-3 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          <nav className="flex flex-col" aria-label="Sol navigasyon">
            <Section title="Panel" items={visible(primary)} showHeading={false} isFirstSection />
            <Section title="Araçlar" items={visible(tools)} />
            <Section title="Hesap" items={visible(account)} />
          </nav>
        </div>

        {/* Bottom Dock: EconNotes Pro + Öğrenci Hesabı + Ayarlar / Versiyon */}
        <div className="shrink-0 space-y-2.5 border-t border-slate-200/75 dark:border-slate-800/80 px-3 pt-3 pb-3.5">
          {/* EconNotes Pro Pill */}
          <button
            type="button"
            onClick={() => setProModalOpen(true)}
            className={cn(
              'group flex w-full items-center gap-2.5 rounded-full px-3 py-2 text-left text-white transition-all duration-200 hover:brightness-105 active:scale-[0.98]',
              isNovember10
                ? 'bg-zinc-900 dark:bg-zinc-800 shadow-sm'
                : 'bg-gradient-to-r from-[#0a2152] via-[#134296] to-[#1e60d5] shadow-[0_10px_24px_-8px_rgba(19,66,150,0.65)]',
            )}
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10">
              <Crown className="h-4 w-4 text-amber-300" strokeWidth={2} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-bold leading-tight">EconNotes Pro</span>
              <span className="block truncate text-[10.5px] text-blue-100/85 leading-tight mt-0.5">
                Daha fazlasını keşfet!
              </span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-blue-100/85 transition-transform duration-200 group-hover:translate-x-0.5" />
          </button>

          {/* Öğrenci Hesabı Pill Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex w-full items-center gap-2.5 rounded-full border border-slate-200/90 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-900/70 px-3 py-2 text-left transition-colors hover:bg-slate-100/90 dark:hover:bg-slate-800/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400">
                  {profile?.avatar_url ? (
                    <img
                      src={profile.avatar_url}
                      alt={displayName}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <User className="h-3.5 w-3.5" strokeWidth={2} />
                  )}
                </span>
                <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-foreground">
                  Öğrenci Hesabı
                </span>
                <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              side="top"
              align="start"
              className="z-[70] w-[228px] rounded-2xl border-slate-200/90 dark:border-slate-800 p-1.5"
            >
              <DropdownMenuLabel className="px-2.5 py-1.5">
                <p className="truncate text-xs font-bold text-foreground">{displayName}</p>
                <p className="truncate text-[11px] font-normal text-muted-foreground">
                  {isAdmin ? 'Yönetici & Öğrenci' : user?.email || 'EconNotes Üyesi'}
                </p>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => navigate('/profile')}
                className="cursor-pointer gap-2 rounded-xl text-xs font-medium"
              >
                <User className="h-3.5 w-3.5" />
                Profilim & Hesap Bilgileri
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

          {/* Footer Settings + Version */}
          <div className="flex items-center justify-between px-2 pt-0.5">
            <button
              type="button"
              onClick={() => navigate('/profile')}
              className="inline-flex items-center gap-2 rounded-full px-1.5 py-1 text-xs font-medium text-slate-600 transition-colors hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
            >
              <Settings className="h-3.5 w-3.5" strokeWidth={1.85} />
              <span>Ayarlar</span>
            </button>
            <span className="font-mono text-[11px] font-medium text-slate-400 dark:text-slate-500">
              {APP_VERSION}
            </span>
          </div>
        </div>
      </aside>

      {/* EconNotes Pro / Avantajlar Modal */}
      <Dialog open={proModalOpen} onOpenChange={setProModalOpen}>
        <DialogContent className="w-[calc(100vw-1.5rem)] max-w-md rounded-3xl border-border/80 bg-card p-6">
          <DialogHeader className="space-y-2 text-left">
            <div className="inline-flex w-fit items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/15 dark:text-blue-300">
              <Crown className="h-3.5 w-3.5 text-amber-500" />
              <span>EconNotes Pro Avantajları</span>
            </div>
            <DialogTitle className="text-xl font-bold tracking-tight text-foreground">
              Sınırsız Not Erişimi & Ödüller
            </DialogTitle>
            <DialogDescription className="text-sm leading-relaxed text-muted-foreground">
              EconNotes tamamen öğrenci dostudur. Aktif katılımınla sınırsız not erişimi ve ekstra XP avantajları kazanabilirsin:
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2.5 py-2">
            <div className="flex items-start gap-3 rounded-2xl border border-border/70 bg-muted/40 p-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
                <Trophy className="h-4 w-4" />
              </div>
              <div className="min-w-0 text-xs">
                <p className="font-semibold text-foreground">Günlük Bilgi Yarışması (15/15)</p>
                <p className="mt-0.5 text-muted-foreground">
                  Tüm soruları doğru bil, 375 XP ve 2 saatlik sınırsız not erişimi kazan.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-2xl border border-border/70 bg-muted/40 p-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                <Gift className="h-4 w-4" />
              </div>
              <div className="min-w-0 text-xs">
                <p className="font-semibold text-foreground">Pazartesi Şans Çarkı & Doğum Günü</p>
                <p className="mt-0.5 text-muted-foreground">
                  24 saatlik sınırsız not indirme, bonus indirme hakları ve yüksek XP ödülleri.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-2xl border border-border/70 bg-muted/40 p-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <BookOpen className="h-4 w-4" />
              </div>
              <div className="min-w-0 text-xs">
                <p className="font-semibold text-foreground">Ders Notu Paylaşımı</p>
                <p className="mt-0.5 text-muted-foreground">
                  Onaylanan her ders notu paylaşımında indirme kotan kalıcı olarak artar.
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setProModalOpen(false);
                navigate('/points');
              }}
              className="w-full rounded-full sm:w-auto"
            >
              Puan Geçmişim
            </Button>
            <Button
              type="button"
              onClick={() => {
                setProModalOpen(false);
                navigate('/gunluk-yarisma');
              }}
              className="w-full flex-1 rounded-full bg-gradient-to-r from-[#1b5ce5] to-[#2b73f5] text-white hover:brightness-105"
            >
              Yarışmaya Katıl
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Safe Logout Confirmation */}
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
    </>
  );
};

export default Sidebar;
