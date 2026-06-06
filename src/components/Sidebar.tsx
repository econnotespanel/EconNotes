import { useAuth } from '@/contexts/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { Home, FileText, Megaphone, User, Shield, MessageSquare, Menu, X, Info, Bot, Video, GraduationCap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { APP_VERSION } from '@/lib/version';

const Sidebar = () => {
  const { isAdmin, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [unreadAnnouncements, setUnreadAnnouncements] = useState(0);

  const fetchUnread = useCallback(async () => {
    if (!user) return;
    // Count distinct senders with unread messages
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

  // Realtime subscription for message updates
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

  const links = [
    { label: 'Ana Sayfa', icon: Home, path: '/' },
    { label: 'Notlar', icon: FileText, path: '/notes' },
    { label: 'Duyurular', icon: Megaphone, path: '/announcements', badge: unreadAnnouncements },
    { label: 'Mesajlar', icon: MessageSquare, path: '/messages', badge: unreadMessages },
    { label: 'Çalışma Stüdyosu', icon: GraduationCap, path: '/study', isNew: true },
    { label: 'Canlı Ders', icon: Video, path: '/live-class' },
    { label: 'Akademik Asistan', icon: Bot, path: '/assistant' },
    { label: 'Profilim', icon: User, path: '/profile' },
    { label: 'Hakkında', icon: Info, path: '/about' },
    ...(isAdmin ? [{ label: 'Yönetici Paneli', icon: Shield, path: '/admin' }] : []),
  ];

  const NavContent = () => (
    <nav className="flex flex-col gap-1 p-3">
      {links.map((link) => {
        const Icon = link.icon;
        const active = location.pathname === link.path;
        const badge = (link as any).badge;
        const isNew = (link as any).isNew;
        return (
          <button
            key={link.path}
            onClick={() => { navigate(link.path); setOpen(false); }}
            className={cn(
              "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-300 relative overflow-hidden",
              active
                ? "bg-gradient-to-r from-primary to-[hsl(var(--primary-glow))] text-primary-foreground shadow-lg shadow-primary/30"
                : "text-foreground/70 hover:bg-white/50 dark:hover:bg-white/5 hover:text-foreground hover:translate-x-1 hover:shadow-md"
            )}
          >
            {active && (
              <span className="absolute inset-y-1 left-0 w-1 rounded-r bg-white/80" />
            )}
            <Icon className={cn("h-4 w-4 transition-transform duration-300", !active && "group-hover:scale-110 group-hover:text-primary")} />
            <span className="flex-1 text-left">{link.label}</span>
            {isNew && (
              <span className="px-1.5 py-0.5 text-[9px] font-bold rounded-md bg-gradient-to-r from-fuchsia-500 to-violet-600 text-white shadow-sm animate-pulse">
                YENİ
              </span>
            )}
            {badge > 0 && (
              <span className="h-5 min-w-5 px-1 rounded-full bg-destructive text-[10px] text-destructive-foreground inline-flex items-center justify-center shadow">
                {badge}
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
        className="fixed top-4 left-4 z-[60] md:hidden"
        onClick={() => setOpen(!open)}
      >
        {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </Button>

      {open && (
        <div className="fixed inset-0 z-40 bg-foreground/20 backdrop-blur-sm md:hidden" onClick={() => setOpen(false)} />
      )}

      <aside
        className={cn(
          "fixed left-0 top-16 z-50 h-[calc(100vh-4rem)] w-60 border-r border-white/30 dark:border-white/10 bg-card/50 dark:bg-card/40 backdrop-blur-2xl transition-transform duration-300 md:translate-x-0 flex flex-col justify-between shadow-xl shadow-primary/5",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <NavContent />
        <div className="p-3 border-t border-white/30 dark:border-white/10">
          <p className="text-xs text-muted-foreground text-center font-semibold">EconNotes</p>
          <p className="text-[10px] text-muted-foreground text-center mt-1">{APP_VERSION}</p>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
