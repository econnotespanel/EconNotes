import { useAuth } from '@/contexts/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { Home, FileText, Megaphone, User, Shield, MessageSquare, Menu, X, Info, Bot, Video, GraduationCap, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { APP_VERSION } from '@/lib/version';

type LinkItem = {
  label: string;
  icon: any;
  path: string;
  emoji: string;
  color: string; // sticker palette css var name
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

  const fetchUnread = useCallback(async () => {
    if (!user) return;
    const { data: unreadMsgs } = await supabase
      .from('messages')
      .select('sender_id')
      .eq('receiver_id', user.id)
      .eq('is_read', false);
    if (unreadMsgs) {
      const uniqueSenders = new Set(unreadMsgs.map((m: any) => m.sender_id));
      setUnreadMessages(uniqueSenders.size);
    }
    const { data: announcements } = await supabase.from('announcements').select('id');
    const { data: views } = await supabase.from('announcement_views').select('announcement_id').eq('user_id', user.id);
    const viewedIds = new Set((views || []).map((v: any) => v.announcement_id));
    const unread = (announcements || []).filter(a => !viewedIds.has(a.id)).length;
    setUnreadAnnouncements(unread);
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `receiver_id=eq.${user.id}` }, () => {
        fetchUnread();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, fetchUnread]);

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

  const NavContent = () => (
    <nav className="flex flex-col gap-2 p-3">
      {links.map((link, idx) => {
        const Icon = link.icon;
        const active = location.pathname === link.path;
        const tilt = idx % 3 === 0 ? '-rotate-1' : idx % 3 === 1 ? 'rotate-1' : 'rotate-0';
        return (
          <button
            key={link.path}
            onClick={() => { navigate(link.path); setOpen(false); }}
            style={{
              // active bg uses the item's sticker color
              ['--item-color' as any]: `hsl(var(--${link.color}))`,
            }}
            className={cn(
              'group relative flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-bold border-2 border-transparent',
              'transition-all duration-200 will-change-transform overflow-hidden',
              'hover:border-foreground hover:-translate-y-0.5 hover:-translate-x-0.5 hover:rotate-0',
              'hover:[box-shadow:5px_5px_0_0_hsl(var(--foreground))]',
              active
                ? 'border-foreground text-foreground [box-shadow:5px_5px_0_0_hsl(var(--foreground))] scale-[1.02]'
                : cn('text-foreground/75 hover:text-foreground bg-transparent', tilt),
            )}
          >
            {/* Active fill */}
            {active && (
              <span
                aria-hidden
                className="absolute inset-0 -z-10"
                style={{ background: 'var(--item-color)' }}
              />
            )}

            {/* Diagonal shine sweep on hover */}
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 -translate-x-full skew-x-[-20deg] bg-gradient-to-r from-transparent via-white/70 to-transparent opacity-0 group-hover:opacity-100 group-hover:translate-x-full transition-all duration-700"
            />

            {/* Icon chip — sticker square with hard border */}
            <span
              className={cn(
                'relative shrink-0 w-8 h-8 grid place-items-center rounded-lg border-2 border-foreground transition-transform duration-300',
                'group-hover:rotate-[-8deg] group-hover:scale-110',
                active ? 'bg-background' : 'bg-card',
              )}
              style={!active ? { background: 'var(--item-color)' } : undefined}
            >
              <Icon className="h-4 w-4" strokeWidth={2.5} />
              {active && (
                <Sparkles className="absolute -top-2 -right-2 h-3.5 w-3.5 text-foreground animate-pulse" strokeWidth={3} />
              )}
            </span>

            <span className="flex-1 text-left leading-tight">
              {link.label}
            </span>

            <span aria-hidden className="text-base opacity-80 group-hover:animate-wiggle">{link.emoji}</span>

            {link.isNew && (
              <span className="px-1.5 py-0.5 text-[9px] font-black rounded-md border-2 border-foreground bg-background text-foreground shadow-[2px_2px_0_0_hsl(var(--foreground))] rotate-[-6deg]">
                YENİ
              </span>
            )}
            {link.badge && link.badge > 0 && (
              <span className="h-5 min-w-5 px-1 rounded-full bg-destructive text-[10px] font-black text-destructive-foreground inline-flex items-center justify-center border-2 border-foreground shadow-[2px_2px_0_0_hsl(var(--foreground))]">
                {link.badge}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="fixed top-4 left-4 z-[60] md:hidden border-2 border-foreground bg-card shadow-[3px_3px_0_0_hsl(var(--foreground))]"
        onClick={() => setOpen(!open)}
      >
        {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </Button>

      {open && (
        <div className="fixed inset-0 z-40 bg-foreground/30 md:hidden" onClick={() => setOpen(false)} />
      )}

      <aside
        className={cn(
          'fixed left-0 top-16 z-50 h-[calc(100vh-4rem)] w-64 transition-transform duration-300 md:translate-x-0 flex flex-col justify-between',
          'bg-card border-r-2 border-foreground shadow-[6px_0_0_0_hsl(var(--foreground))]',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        {/* Sticker header strip */}
        <div className="tape-strip h-3 border-b-2 border-foreground" />

        <div className="flex-1 overflow-y-auto">
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
