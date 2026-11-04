import { useLocation, useNavigate } from 'react-router-dom';
import { Home, FileText, GraduationCap, MessageSquare, Menu } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { SUPPORT_MESSAGE_PREFIX } from '@/lib/support';
import { cn } from '@/lib/utils';

export const toggleMobileSidebar = () => {
  window.dispatchEvent(new CustomEvent('econnotes:toggle-sidebar'));
};

const MobileBottomNav = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [unreadAnnouncements, setUnreadAnnouncements] = useState(0);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Okunmamış mesaj ve duyuru sayılarını dinle
  const fetchUnread = useCallback(async () => {
    if (!user) return;
    try {
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
    } catch {
      // Hata durumunda sessizce devam et
    }
  }, [user]);

  useEffect(() => {
    fetchUnread();
    const interval = setInterval(fetchUnread, 120000);
    return () => clearInterval(interval);
  }, [fetchUnread]);

  useEffect(() => {
    const handleStateChange = (e: Event) => {
      const customEvent = e as CustomEvent<{ open: boolean }>;
      if (customEvent.detail && typeof customEvent.detail.open === 'boolean') {
        setIsSidebarOpen(customEvent.detail.open);
      }
    };

    window.addEventListener('econnotes:sidebar-state', handleStateChange as EventListener);
    return () => {
      window.removeEventListener('econnotes:sidebar-state', handleStateChange as EventListener);
    };
  }, []);

  const totalBadge = unreadMessages + unreadAnnouncements;

  const navItems = [
    { label: 'Ana Sayfa', path: '/', icon: Home },
    { label: 'Notlar', path: '/notes', icon: FileText },
    { label: 'Stüdyo', path: '/study', icon: GraduationCap, isHighlight: true },
    { label: 'Mesajlar', path: '/messages', icon: MessageSquare, badge: unreadMessages },
  ];

  return (
    <nav
      role="navigation"
      aria-label="Mobil Hızlı Menü"
      className={cn(
        'fixed bottom-0 inset-x-0 z-40 md:hidden',
        'border-t border-border/80 bg-card/92 backdrop-blur-xl',
        'shadow-[0_-4px_24px_rgba(0,0,0,0.08)] dark:shadow-[0_-8px_32px_rgba(0,0,0,0.4)]',
        'transition-all duration-200'
      )}
      style={{
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 0.35rem)',
      }}
    >
      <div className="grid grid-cols-5 h-14 items-center px-1 max-w-lg mx-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path && !isSidebarOpen;

          return (
            <button
              key={item.path}
              type="button"
              onClick={() => {
                window.dispatchEvent(new CustomEvent('econnotes:close-sidebar'));
                navigate(item.path);
              }}
              className={cn(
                'relative flex flex-col items-center justify-center h-full w-full py-1',
                'touch-manipulation select-none active:scale-95 transition-all duration-150',
                isActive
                  ? 'text-primary font-semibold'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <div className="relative">
                <Icon
                  className={cn(
                    'h-5 w-5 transition-transform duration-200',
                    isActive && 'scale-110 text-primary drop-shadow-[0_2px_8px_hsl(var(--primary)/0.35)]'
                  )}
                  strokeWidth={isActive ? 2.5 : 2}
                />
                {item.badge && item.badge > 0 ? (
                  <span className="absolute -top-1.5 -right-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold text-destructive-foreground ring-2 ring-card animate-in zoom-in-50">
                    {item.badge > 99 ? '99+' : item.badge}
                  </span>
                ) : null}
                {item.isHighlight && !isActive && (
                  <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
                )}
              </div>
              <span
                className={cn(
                  'text-[10px] mt-1 tracking-tight truncate max-w-full leading-none transition-colors',
                  isActive ? 'text-primary font-bold' : 'text-muted-foreground'
                )}
              >
                {item.label}
              </span>
              {isActive && (
                <span className="absolute top-0 inset-x-3 h-0.5 rounded-full bg-primary shadow-[0_1px_6px_hsl(var(--primary)/0.7)]" />
              )}
            </button>
          );
        })}

        {/* 5. Öğe: Tüm Menüyü Aç/Kapat Butonu */}
        <button
          type="button"
          onClick={toggleMobileSidebar}
          aria-label={isSidebarOpen ? 'Menüyü Kapat' : 'Tüm Menüyü Aç'}
          className={cn(
            'relative flex flex-col items-center justify-center h-full w-full py-1',
            'touch-manipulation select-none active:scale-95 transition-all duration-150',
            isSidebarOpen
              ? 'text-primary font-semibold'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <div className="relative">
            <Menu
              className={cn(
                'h-5 w-5 transition-transform duration-200',
                isSidebarOpen && 'scale-110 text-primary rotate-90'
              )}
              strokeWidth={isSidebarOpen ? 2.5 : 2}
            />
            {totalBadge > 0 && !isSidebarOpen && (
              <span className="absolute -top-1 -right-1.5 h-2.5 w-2.5 rounded-full bg-destructive ring-2 ring-card shadow-sm" />
            )}
          </div>
          <span
            className={cn(
              'text-[10px] mt-1 tracking-tight truncate max-w-full leading-none transition-colors',
              isSidebarOpen ? 'text-primary font-bold' : 'text-muted-foreground'
            )}
          >
            Menü
          </span>
          {isSidebarOpen && (
            <span className="absolute top-0 inset-x-3 h-0.5 rounded-full bg-primary shadow-[0_1px_6px_hsl(var(--primary)/0.7)]" />
          )}
        </button>
      </div>
    </nav>
  );
};

export default MobileBottomNav;
