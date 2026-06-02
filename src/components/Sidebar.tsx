import { useAuth } from '@/contexts/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { Home, FileText, Megaphone, User, Shield, MessageSquare, Menu, X, Info, Bot, Video, GraduationCap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';

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
    { label: 'Çalış', icon: GraduationCap, path: '/study' },
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
        return (
          <button
            key={link.path}
            onClick={() => { navigate(link.path); setOpen(false); }}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 relative",
              active
                ? "bg-primary text-primary-foreground shadow-md"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            )}
          >
            <Icon className="h-4 w-4" />
            {link.label}
            {badge > 0 && (
              <span className="absolute right-2 h-5 min-w-5 px-1 rounded-full bg-destructive text-[10px] text-destructive-foreground inline-flex items-center justify-center">
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
          "fixed left-0 top-16 z-50 h-[calc(100vh-4rem)] w-60 border-r border-border bg-card transition-transform duration-300 md:translate-x-0 flex flex-col justify-between",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <NavContent />
        <div className="p-3 border-t border-border">
          <p className="text-xs text-muted-foreground text-center">EconNotes</p>
          <p className="text-[10px] text-muted-foreground text-center mt-1">v2.5.0</p>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
