import { useLocation, useNavigate } from 'react-router-dom';
import { LayoutGrid, FileText, Layers, Mail, Menu } from 'lucide-react';
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

  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    const checkStandalone = () => {
      const standalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as any).standalone === true;
      setIsStandalone(standalone);
    };
    checkStandalone();
    window.addEventListener('resize', checkStandalone);
    return () => window.removeEventListener('resize', checkStandalone);
  }, []);

  const totalBadge = unreadMessages + unreadAnnouncements;

  const navItems = [
    { label: 'Panel', path: '/', icon: LayoutGrid, exact: true },
    { label: 'Notlar', path: '/notes', icon: FileText },
    { label: 'Stüdyo', path: '/study', icon: Layers, isHighlight: true },
    { label: 'Mesajlarım', path: '/messages', icon: Mail, badge: unreadMessages },
  ];

  return (
    <nav
      role="navigation"
      aria-label="Mobil Alt Menü"
      className="fixed inset-x-0 z-40 md:hidden pointer-events-none select-none transition-all duration-300"
      style={{
        bottom: isStandalone
          ? 'calc(env(safe-area-inset-bottom, 0px) + 0.35rem)'
          : 'calc(env(safe-area-inset-bottom, 0px) + 0.75rem)',
      }}
    >
      <div className="flex items-center justify-center gap-2.5 px-3 max-w-md mx-auto">
        <div
          className={cn(
            'pointer-events-auto flex items-center justify-around flex-1 max-w-[340px] h-[62px] p-1.5',
            'rounded-[24px]',
            'bg-white/95 dark:bg-[#14171c]/95',
            'backdrop-blur-2xl',
            'border border-slate-200/80 dark:border-white/[0.08]',
            'shadow-[0_12px_36px_rgba(15,23,42,0.12)] dark:shadow-[0_20px_50px_rgba(0,0,0,0.75)]',
            'transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]',
            isSidebarOpen && 'opacity-80 scale-[0.98]'
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
                  'relative flex flex-col items-center justify-center flex-1 h-full min-w-0 py-1 px-1 sm:px-2 rounded-[16px]',
                  'touch-manipulation select-none active:scale-95 transition-all duration-200',
                  isActive
                    ? 'bg-blue-500/10 dark:bg-[#19283e] text-blue-600 dark:text-[#5b9cf6] ring-1 ring-blue-500/20 dark:ring-[#5b9cf6]/25'
                    : 'text-slate-600 dark:text-[#8e96a4] hover:text-slate-900 dark:hover:text-[#e2e8f0] hover:bg-slate-100/80 dark:hover:bg-white/[0.05]'
                )}
              >
                <div className="relative">
                  <Icon
                    className={cn(
                      'h-5 w-5 transition-all duration-200',
                      isActive
                        ? 'text-blue-600 dark:text-[#5b9cf6]'
                        : 'text-slate-500 dark:text-[#8e96a4]'
                    )}
                    strokeWidth={isActive ? 2.1 : 1.85}
                  />
                  {item.badge && item.badge > 0 ? (
                    <span className="absolute -top-1.5 -right-2.5 flex h-4 min-w-[18px] items-center justify-center rounded-full bg-[#f05252] px-1 text-[9.5px] font-bold text-white ring-2 ring-white dark:ring-[#14171c] shadow-xs">
                      {item.badge > 99 ? '99+' : item.badge}
                    </span>
                  ) : null}
                  {item.isHighlight && !isActive && (
                    <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-[#5b9cf6] shadow-[0_0_8px_rgba(91,156,246,0.8)] animate-pulse" />
                  )}
                </div>
                <span
                  className={cn(
                    'text-[10px] sm:text-[10.5px] mt-0.5 tracking-tight truncate max-w-full leading-tight transition-colors duration-200',
                    isActive
                      ? 'text-blue-600 dark:text-[#5b9cf6] font-semibold'
                      : 'text-slate-600 dark:text-[#8e96a4] font-medium'
                  )}
                >
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={toggleMobileSidebar}
          aria-label={isSidebarOpen ? 'Menüyü Kapat' : 'Tüm Menüyü Aç'}
          className={cn(
            'pointer-events-auto flex items-center justify-center shrink-0 w-[62px] h-[62px]',
            'rounded-[24px] touch-manipulation select-none active:scale-90 transition-all duration-200',
            'backdrop-blur-2xl',
            isSidebarOpen
              ? 'bg-blue-500/15 dark:bg-[#19283e] border border-blue-500/40 dark:border-[#5b9cf6]/40 text-blue-600 dark:text-[#5b9cf6] shadow-[0_12px_36px_rgba(0,0,0,0.4)]'
              : cn(
                  'bg-white/95 dark:bg-[#14171c]/95',
                  'border border-slate-200/80 dark:border-white/[0.08]',
                  'text-slate-600 dark:text-[#8e96a4] hover:text-slate-900 dark:hover:text-[#e2e8f0]',
                  'shadow-[0_12px_36px_rgba(15,23,42,0.12)] dark:shadow-[0_20px_50px_rgba(0,0,0,0.75)]'
                )
          )}
        >
          <div className="relative flex items-center justify-center">
            <Menu
              className={cn(
                'h-6 w-6 transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]',
                isSidebarOpen ? 'scale-110 text-blue-600 dark:text-[#5b9cf6] rotate-90' : 'text-slate-600 dark:text-[#8e96a4]'
              )}
              strokeWidth={2}
            />
            {totalBadge > 0 && !isSidebarOpen && (
              <span className="absolute -top-1.5 -right-1.5 h-2.5 w-2.5 rounded-full bg-[#f05252] ring-2 ring-white dark:ring-[#14171c] shadow-xs" />
            )}
          </div>
        </button>
      </div>
    </nav>
  );
};

export default MobileBottomNav;
