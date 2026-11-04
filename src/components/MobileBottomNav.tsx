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
    { label: 'Ana Sayfa', path: '/', icon: Home, exact: true },
    { label: 'Notlar', path: '/notes', icon: FileText },
    { label: 'Stüdyo', path: '/study', icon: GraduationCap, isHighlight: true },
    { label: 'Mesajlar', path: '/messages', icon: MessageSquare, badge: unreadMessages },
  ];

  return (
    <nav
      role="navigation"
      aria-label="Mobil Apple Liquid Glass Menü"
      className="fixed bottom-3 inset-x-0 z-40 md:hidden pointer-events-none select-none transition-all duration-300"
      style={{
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 0.15rem)',
      }}
    >
      <div className="flex items-center justify-center gap-2 sm:gap-2.5 px-3 max-w-md mx-auto">
        {/* Apple Sıvı Cam Ana Kapsül (Floating Liquid Glass Dock) */}
        <div
          className={cn(
            'pointer-events-auto flex items-center justify-around flex-1 max-w-[340px] h-[58px] sm:h-[62px] p-1.5',
            'rounded-full',
            'bg-slate-950/80 dark:bg-black/80 backdrop-blur-2xl backdrop-saturate-150',
            'border border-white/[0.14] dark:border-white/[0.12]',
            'shadow-[inset_0_1px_1px_0_rgba(255,255,255,0.22),0_12px_36px_-6px_rgba(0,0,0,0.55),0_4px_16px_rgba(0,0,0,0.35)]',
            isSidebarOpen && 'opacity-90'
          )}
        >
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              (item.exact
                ? location.pathname === item.path
                : location.pathname === item.path || location.pathname.startsWith(item.path + '/')) &&
              !isSidebarOpen;

            return (
              <button
                key={item.path}
                type="button"
                onClick={() => {
                  window.dispatchEvent(new CustomEvent('econnotes:close-sidebar'));
                  navigate(item.path);
                }}
                className={cn(
                  'relative flex flex-col items-center justify-center flex-1 h-full min-w-0 py-1 px-1 sm:px-2 rounded-full',
                  'touch-manipulation select-none active:scale-95 transition-all duration-200',
                  isActive
                    ? 'bg-white/[0.12] dark:bg-white/[0.14] border border-white/20 dark:border-white/10 shadow-[inset_0_1px_1px_rgba(255,255,255,0.25),0_2px_8px_rgba(0,0,0,0.2)] text-[#0a84ff]'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]'
                )}
              >
                <div className="relative">
                  <Icon
                    className={cn(
                      'h-5 w-5 transition-transform duration-200',
                      isActive
                        ? 'scale-105 text-[#0a84ff] drop-shadow-[0_2px_8px_rgba(10,132,255,0.55)]'
                        : 'text-slate-400 dark:text-slate-300/80'
                    )}
                    strokeWidth={isActive ? 2.4 : 1.9}
                  />
                  {item.badge && item.badge > 0 ? (
                    <span className="absolute -top-1.5 -right-2 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#ff3b30] px-1 text-[9px] font-bold text-white ring-2 ring-slate-950 animate-in zoom-in-50 shadow-sm">
                      {item.badge > 99 ? '99+' : item.badge}
                    </span>
                  ) : null}
                  {item.isHighlight && !isActive && (
                    <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.9)] animate-pulse" />
                  )}
                </div>
                <span
                  className={cn(
                    'text-[10px] sm:text-[10.5px] mt-0.5 tracking-tight truncate max-w-full leading-tight transition-colors',
                    isActive
                      ? 'text-[#0a84ff] font-bold'
                      : 'text-slate-400 dark:text-slate-400 font-medium'
                  )}
                >
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>

        {/* Apple Sıvı Cam Bağımsız Dairesel Menü Butonu (Floating Circular Action Button) */}
        <button
          type="button"
          onClick={toggleMobileSidebar}
          aria-label={isSidebarOpen ? 'Menüyü Kapat' : 'Tüm Menüyü Aç'}
          className={cn(
            'pointer-events-auto flex flex-col items-center justify-center shrink-0 w-[58px] h-[58px] sm:w-[62px] sm:h-[62px]',
            'rounded-full touch-manipulation select-none active:scale-90 transition-all duration-200',
            'backdrop-blur-2xl backdrop-saturate-150',
            isSidebarOpen
              ? 'bg-blue-600/25 border border-blue-400/50 text-[#0a84ff] shadow-[inset_0_1px_1px_0_rgba(255,255,255,0.3),0_0_20px_rgba(10,132,255,0.4)]'
              : 'bg-slate-950/80 dark:bg-black/80 border border-white/[0.14] dark:border-white/[0.12] text-slate-300 hover:text-white shadow-[inset_0_1px_1px_0_rgba(255,255,255,0.22),0_12px_36px_-6px_rgba(0,0,0,0.55),0_4px_16px_rgba(0,0,0,0.35)]'
          )}
        >
          <div className="relative">
            <Menu
              className={cn(
                'h-5 w-5 transition-transform duration-200',
                isSidebarOpen ? 'scale-110 text-[#0a84ff] rotate-90' : 'text-slate-300'
              )}
              strokeWidth={isSidebarOpen ? 2.4 : 2}
            />
            {totalBadge > 0 && !isSidebarOpen && (
              <span className="absolute -top-1 -right-1.5 h-2.5 w-2.5 rounded-full bg-[#ff3b30] ring-2 ring-slate-950 shadow-sm" />
            )}
          </div>
          <span
            className={cn(
              'text-[9.5px] mt-0.5 tracking-tight truncate max-w-full leading-tight transition-colors',
              isSidebarOpen ? 'text-[#0a84ff] font-bold' : 'text-slate-400 font-medium'
            )}
          >
            Menü
          </span>
        </button>
      </div>
    </nav>
  );
};

export default MobileBottomNav;
