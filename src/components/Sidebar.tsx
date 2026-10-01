import { useAuth } from '@/contexts/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { Home, FileText, Megaphone, User, Shield, MessageSquare, Menu, X, Info, Bot, Video, GraduationCap, Target, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState, useEffect, useCallback, useRef } from 'react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { APP_VERSION } from '@/lib/version';
import { useSiteConfig } from '@/contexts/SiteConfigContext';
import EconLogo from '@/components/EconLogo';

type LinkItem = {
  label: string;
  icon: any;
  path: string;
  badge?: number;
  isNew?: boolean;
};

const Sidebar = () => {
  const { isAdmin, user } = useAuth();
  const { isPageEnabled, config } = useSiteConfig();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [unreadAnnouncements, setUnreadAnnouncements] = useState(0);
  const firstItemRef = useRef<HTMLButtonElement>(null);

  const fetchUnread = useCallback(async () => {
    if (!user) return;
    const { data: unreadMsgs } = await supabase
      .from('messages').select('sender_id')
      .eq('receiver_id', user.id).eq('is_read', false);
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
    const interval = setInterval(fetchUnread, 15000);
    return () => clearInterval(interval);
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
    { label: 'Hakkında',           icon: Info,          path: '/about' },
    ...(isAdmin ? [{ label: 'Yönetici Paneli', icon: Shield, path: '/admin' } as LinkItem] : []),
  ];

  const visible = (items: LinkItem[]) => items.filter(l => isAdmin || isPageEnabled(l.path));

  const totalBadge = unreadMessages + unreadAnnouncements;

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
          'group relative flex items-center gap-3 w-full rounded-lg pl-4 pr-3 min-h-[42px] py-2 text-sm font-medium',
          'transition-all duration-200 ease-out',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--sidebar-ring))] focus-visible:ring-offset-1 focus-visible:ring-offset-[hsl(var(--sidebar-background))]',
           active
             ? 'text-sidebar-primary bg-sidebar-accent'
             : 'text-sidebar-foreground/75 hover:text-sidebar-foreground hover:bg-sidebar-accent/60',
        )}
      >
        {/* Left neon indicator */}
        <span
          aria-hidden
          className={cn(
            'absolute left-0 top-1/2 -translate-y-1/2 w-[3px] rounded-r-full transition-all duration-300',
            active
               ? 'h-6 opacity-100 bg-sidebar-primary'
               : 'h-3 opacity-0 group-hover:opacity-50 bg-sidebar-primary',
          )}
        />

        <Icon
          className={cn(
            'h-[18px] w-[18px] shrink-0 transition-colors',
             active ? 'text-sidebar-primary' : 'text-sidebar-foreground/70 group-hover:text-sidebar-primary',
          )}
          strokeWidth={2}
        />

        <span className="flex-1 text-left truncate tracking-tight">{link.label}</span>

        {link.isNew && (
          <span className="px-1.5 py-0.5 text-[9px] font-bold tracking-wider rounded-md border border-[hsl(var(--sidebar-primary)/0.5)] text-[hsl(var(--sidebar-primary))] bg-[hsl(var(--sidebar-primary)/0.1)]">
            YENİ
          </span>
        )}
        {link.badge && link.badge > 0 && (
          <span className="h-5 min-w-5 px-1.5 rounded-full bg-[hsl(var(--destructive))] text-[10px] font-semibold text-[hsl(var(--destructive-foreground))] inline-flex items-center justify-center shadow-[0_0_10px_hsl(var(--destructive)/0.6)]">
            {link.badge > 99 ? '99+' : link.badge}
          </span>
        )}
      </button>
    );
  };

  const Section = ({ title, items, startIdx = 0 }: { title: string; items: LinkItem[]; startIdx?: number }) => (
    <div className="px-2 pt-4 first:pt-2">
      <div className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--sidebar-foreground)/0.4)]">
        {title}
      </div>
      <div className="flex flex-col gap-0.5">
        {items.map((l, i) => renderItem(l, startIdx === 0 && i === 0))}
      </div>
    </div>
  );

  const NavContent = () => (
    <nav className="flex flex-col py-2" aria-label="Ana menü">
      <Section title="Panel" items={visible(primary)} startIdx={0} />
      <Section title="Araçlar" items={visible(tools)} startIdx={1} />
      <Section title="Hesap" items={visible(account)} startIdx={1} />
    </nav>
  );

  return (
    <>
      {/* Hamburger — mobile */}
      <Button
        variant="ghost"
        size="icon"
        aria-label={open ? 'Menüyü kapat' : 'Menüyü aç'}
        aria-expanded={open}
        aria-controls="mobile-sidebar"
        className="fixed top-3 left-3 z-[70] md:hidden h-10 w-10 rounded-lg border border-[hsl(var(--sidebar-border))] bg-[hsl(var(--sidebar-background))] text-[hsl(var(--sidebar-foreground))] hover:bg-[hsl(var(--sidebar-accent))] hover:text-[hsl(var(--sidebar-primary))] transition-all"
        onClick={() => setOpen(v => !v)}
      >
        <span className="relative block h-5 w-5">
          <Menu className={cn('absolute inset-0 h-5 w-5 transition-all duration-300', open ? 'opacity-0 rotate-90 scale-75' : 'opacity-100 rotate-0 scale-100')} />
          <X className={cn('absolute inset-0 h-5 w-5 transition-all duration-300', open ? 'opacity-100 rotate-0 scale-100' : 'opacity-0 -rotate-90 scale-75')} />
        </span>
        {!open && totalBadge > 0 && (
          <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-[hsl(var(--neon-cyan))] shadow-[0_0_8px_hsl(var(--neon-cyan))]" />
        )}
      </Button>

      {/* Backdrop */}
      <div
        aria-hidden
        onClick={() => setOpen(false)}
         className={cn(
          'fixed inset-0 z-40 bg-[hsl(222_47%_2%/0.7)] md:hidden transition-opacity duration-300',
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
        )}
      />

      <aside
        id="mobile-sidebar"
        role="navigation"
        className={cn(
          'fixed left-0 top-16 z-50 h-[calc(100dvh-4rem)] w-[82vw] max-w-[18rem] md:w-64',
          'flex flex-col',
           'bg-sidebar-background/90 backdrop-blur-xl text-sidebar-foreground',
          'border-r border-[hsl(var(--sidebar-border))]',
          'transition-transform duration-300 ease-[cubic-bezier(.22,1,.36,1)] md:transition-none',
          'md:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-[105%]',
        )}
      >
        {/* Neon top scanline */}
        <div className="h-[1px] bg-gradient-to-r from-transparent via-[hsl(var(--sidebar-primary))] to-transparent shadow-[0_0_10px_hsl(var(--sidebar-primary)/0.6)]" />

        <div className="flex-1 overflow-y-auto overscroll-contain">
          <NavContent />
        </div>

        <div className="p-3 border-t border-[hsl(var(--sidebar-border))]">
          <div className="flex items-center justify-between px-2 text-[10px] text-[hsl(var(--sidebar-foreground)/0.5)]">
            <EconLogo className="h-6 w-28" />
            <span className="font-mono text-[hsl(var(--sidebar-primary)/0.85)]">v{APP_VERSION}</span>
          </div>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
