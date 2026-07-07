import { useAuth } from '@/contexts/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { Home, FileText, Megaphone, User, Shield, MessageSquare, Menu, X, Info, Bot, Video, GraduationCap, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState, useEffect, useCallback, useRef } from 'react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { APP_VERSION } from '@/lib/version';

type LinkItem = {
  label: string;
  icon: any;
  path: string;
  emoji: string;
  color: string;
  badge?: number;
  isNew?: boolean;
};

const Sidebar = () => {
  const { isAdmin, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [unreadAnnouncements, setUnreadAnnouncements] = useState(0);
  const asideRef = useRef<HTMLElement>(null);
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

  // Close drawer whenever route changes (mobile)
  useEffect(() => { setOpen(false); }, [location.pathname]);

  // Lock body scroll + ESC + focus first item when drawer opens on mobile
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    // Focus first nav item for a11y
    const t = setTimeout(() => firstItemRef.current?.focus(), 120);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
      clearTimeout(t);
    };
  }, [open]);

  const links: LinkItem[] = [
    { label: 'Ana Sayfa',          icon: Home,          path: '/',              emoji: '🏠', color: 'sticker-pink' },
    { label: 'Notlar',             icon: FileText,      path: '/notes',         emoji: '📚', color: 'sticker-cobalt' },
    { label: 'Duyurular',          icon: Megaphone,     path: '/announcements', emoji: '📣', color: 'sticker-tangerine', badge: unreadAnnouncements },
    { label: 'Mesajlar',           icon: MessageSquare, path: '/messages',      emoji: '💬', color: 'sticker-lime', badge: unreadMessages },
    { label: 'Çalışma Stüdyosu',   icon: GraduationCap, path: '/study',         emoji: '⚡', color: 'sticker-cyan', isNew: true },
    { label: 'Canlı Ders',         icon: Video,         path: '/live-class',    emoji: '🎬', color: 'sticker-lilac' },
    { label: 'Akademik Asistan',   icon: Bot,           path: '/assistant',     emoji: '🤖', color: 'sticker-cobalt' },
    { label: 'Profilim',           icon: User,          path: '/profile',       emoji: '🎒', color: 'sticker-pink' },
    { label: 'Hakkında',           icon: Info,          path: '/about',         emoji: '✨', color: 'sticker-tangerine' },
    ...(isAdmin ? [{ label: 'Yönetici Paneli', icon: Shield, path: '/admin', emoji: '🛡️', color: 'sticker-cyan' } as LinkItem] : []),
  ];

  const totalBadge = unreadMessages + unreadAnnouncements;

  const NavContent = () => (
    <nav className="flex flex-col gap-1.5 p-3" aria-label="Ana menü">
      {links.map((link, idx) => {
        const Icon = link.icon;
        const active = location.pathname === link.path;
        // Only tilt on desktop for playfulness; keep straight on touch for tap targets
        const tilt = idx % 3 === 0 ? 'md:-rotate-1' : idx % 3 === 1 ? 'md:rotate-1' : 'md:rotate-0';
        return (
          <button
            key={link.path}
            ref={idx === 0 ? firstItemRef : undefined}
            onClick={() => navigate(link.path)}
            aria-current={active ? 'page' : undefined}
            style={{ ['--item-color' as any]: `hsl(var(--${link.color}))` }}
            className={cn(
              'group relative flex items-center gap-3 rounded-2xl px-3 min-h-[48px] py-2.5 text-sm font-bold border-2 border-transparent',
              'transition-[transform,box-shadow,background-color,color] duration-200 ease-out will-change-transform overflow-hidden',
              'md:hover:border-foreground md:hover:-translate-y-0.5 md:hover:-translate-x-0.5 md:hover:rotate-0',
              'md:hover:[box-shadow:5px_5px_0_0_hsl(var(--foreground))]',
              'active:scale-[0.97] active:[box-shadow:2px_2px_0_0_hsl(var(--foreground))]',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
              active
                ? 'border-foreground text-[hsl(240_20%_10%)] [box-shadow:4px_4px_0_0_hsl(var(--foreground))] md:scale-[1.02]'
                : cn('text-foreground/85 bg-transparent md:hover:bg-foreground md:hover:text-background', tilt),
            )}
          >
            {/* Animated active fill */}
            <span
              aria-hidden
              className={cn(
                'absolute inset-0 -z-10 transition-transform duration-300 ease-[cubic-bezier(.34,1.56,.64,1)] origin-left',
                active ? 'scale-x-100' : 'scale-x-0',
              )}
              style={{ background: 'var(--item-color)' }}
            />

            {/* Left active indicator bar */}
            <span
              aria-hidden
              className={cn(
                'absolute left-0 top-1/2 -translate-y-1/2 h-6 w-1 rounded-r-md bg-foreground transition-all duration-300',
                active ? 'opacity-100 scale-y-100' : 'opacity-0 scale-y-0',
              )}
            />

            {/* Desktop-only shine sweep */}
            <span
              aria-hidden
              className="hidden md:block pointer-events-none absolute inset-0 -translate-x-full skew-x-[-20deg] bg-gradient-to-r from-transparent via-white/50 to-transparent opacity-0 group-hover:opacity-100 group-hover:translate-x-full transition-all duration-700"
            />

            {/* Icon chip */}
            <span
              className={cn(
                'relative shrink-0 w-9 h-9 grid place-items-center rounded-lg border-2 border-foreground transition-transform duration-300',
                'md:group-hover:rotate-[-8deg] md:group-hover:scale-110',
                active ? 'bg-background' : 'bg-card',
              )}
              style={!active ? { background: 'var(--item-color)' } : undefined}
            >
              <Icon className="h-4 w-4" strokeWidth={2.5} />
              {active && (
                <Sparkles className="absolute -top-2 -right-2 h-3.5 w-3.5 text-foreground motion-safe:animate-pulse" strokeWidth={3} />
              )}
            </span>

            <span className="flex-1 text-left leading-tight truncate">{link.label}</span>

            <span aria-hidden className="text-base opacity-80 md:group-hover:motion-safe:animate-wiggle">{link.emoji}</span>

            {link.isNew && (
              <span className="px-1.5 py-0.5 text-[9px] font-black rounded-md border-2 border-foreground bg-background text-foreground shadow-[2px_2px_0_0_hsl(var(--foreground))] md:rotate-[-6deg]">
                YENİ
              </span>
            )}
            {link.badge && link.badge > 0 && (
              <span className="h-5 min-w-5 px-1 rounded-full bg-destructive text-[10px] font-black text-destructive-foreground inline-flex items-center justify-center border-2 border-foreground shadow-[2px_2px_0_0_hsl(var(--foreground))]">
                {link.badge > 99 ? '99+' : link.badge}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );

  return (
    <>
      {/* Hamburger — mobile only, animated icon swap + unread dot */}
      <Button
        variant="ghost"
        size="icon"
        aria-label={open ? 'Menüyü kapat' : 'Menüyü aç'}
        aria-expanded={open}
        aria-controls="mobile-sidebar"
        className="fixed top-3 left-3 z-[70] md:hidden h-11 w-11 rounded-xl border-2 border-foreground bg-card shadow-[3px_3px_0_0_hsl(var(--foreground))] active:translate-y-0.5 active:translate-x-0.5 active:shadow-[1px_1px_0_0_hsl(var(--foreground))] transition-all"
        onClick={() => setOpen(v => !v)}
      >
        <span className="relative block h-5 w-5">
          <Menu className={cn('absolute inset-0 h-5 w-5 transition-all duration-300', open ? 'opacity-0 rotate-90 scale-75' : 'opacity-100 rotate-0 scale-100')} />
          <X className={cn('absolute inset-0 h-5 w-5 transition-all duration-300', open ? 'opacity-100 rotate-0 scale-100' : 'opacity-0 -rotate-90 scale-75')} />
        </span>
        {!open && totalBadge > 0 && (
          <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-destructive border-2 border-foreground motion-safe:animate-pulse" />
        )}
      </Button>

      {/* Backdrop */}
      <div
        aria-hidden
        onClick={() => setOpen(false)}
        className={cn(
          'fixed inset-0 z-40 bg-foreground/40 backdrop-blur-[2px] md:hidden transition-opacity duration-300',
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
        )}
      />

      <aside
        ref={asideRef}
        id="mobile-sidebar"
        role="navigation"
        aria-hidden={!open && typeof window !== 'undefined' && window.innerWidth < 768}
        className={cn(
          'fixed left-0 top-16 z-50 h-[calc(100dvh-4rem)] w-[85vw] max-w-[19rem] md:w-64',
          'flex flex-col justify-between',
          'bg-card border-r-2 border-foreground shadow-[6px_0_0_0_hsl(var(--foreground))]',
          'transition-transform duration-300 ease-[cubic-bezier(.22,1,.36,1)] md:transition-none',
          'md:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-[105%]',
        )}
      >
        <div className="tape-strip h-3 border-b-2 border-foreground" />

        <div className="flex-1 overflow-y-auto overscroll-contain">
          <NavContent />
        </div>

        <div className="p-3 border-t-2 border-foreground bg-secondary/40">
          <div className="flex items-center justify-center gap-2">
            <span className="chip chip-pink !text-[10px] !py-0.5 !px-2">EconNotes</span>
            <span className="chip !text-[10px] !py-0.5 !px-2">{APP_VERSION}</span>
          </div>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
