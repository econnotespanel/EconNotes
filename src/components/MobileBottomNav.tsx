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
    { label: 'Ana Sayfa', path: '/', icon: Home, exact: true },
    { label: 'Notlar', path: '/notes', icon: FileText },
    { label: 'Stüdyo', path: '/study', icon: GraduationCap, isHighlight: true },
    { label: 'Mesajlar', path: '/messages', icon: MessageSquare, badge: unreadMessages },
  ];

  return (
    <nav
      role="navigation"
      aria-label="Mobil Apple Liquid Glass Menü"
      className="fixed inset-x-0 z-40 md:hidden pointer-events-none select-none transition-all duration-300"
      style={{
        bottom: isStandalone
          ? 'calc(env(safe-area-inset-bottom, 0px) + 0.35rem)'
          : 'calc(env(safe-area-inset-bottom, 0px) + 0.75rem)',
      }}
    >
      <div className="flex items-center justify-center gap-2.5 px-3 max-w-md mx-auto">
        {/* Apple Sıvı Cam Ana Kapsül (Floating Liquid Glass Dock) */}
        <div
          className={cn(
            'pointer-events-auto flex items-center justify-around flex-1 max-w-[340px] h-[62px] p-1.5',
            'rounded-full',
            'bg-white/80 dark:bg-slate-950/75',
            'backdrop-blur-2xl backdrop-saturate-200',
            'border border-black/[0.08] dark:border-white/[0.14]',
            'shadow-[0_12px_36px_-6px_rgba(0,0,0,0.12),0_4px_12px_rgba(0,0,0,0.06),inset_0_1px_1.5px_0_rgba(255,255,255,0.9)] dark:shadow-[0_16px_40px_-6px_rgba(0,0,0,0.7),0_4px_16px_rgba(0,0,0,0.5),inset_0_1px_1px_0_rgba(255,255,255,0.16)]',
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
                  'relative flex flex-col items-center justify-center flex-1 h-full min-w-0 py-1 px-1 sm:px-2 rounded-full',
                  'touch-manipulation select-none active:scale-95 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]',
                  isActive
                    ? cn(
                        'bg-gradient-to-b from-blue-600/15 via-blue-500/10 to-blue-600/15 dark:from-white/[0.18] dark:via-white/[0.12] dark:to-white/[0.08]',
                        'border border-blue-500/30 dark:border-white/[0.20]',
                        'shadow-[inset_0_1px_1px_rgba(255,255,255,0.9),0_2px_10px_rgba(0,112,209,0.15)] dark:shadow-[inset_0_1px_1px_rgba(255,255,255,0.25),0_4px_16px_rgba(0,0,0,0.4)]',
                        'text-blue-600 dark:text-[#38bdf8]'
                      )
                    : cn(
                        'text-slate-600 dark:text-slate-400',
                        'hover:text-slate-900 dark:hover:text-white',
                        'hover:bg-black/[0.04] dark:hover:bg-white/[0.06]'
                      )
                )}
              >
                <div className="relative">
                  <Icon
                    className={cn(
                      'h-5 w-5 transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]',
                      isActive
                        ? 'scale-110 text-blue-600 dark:text-[#38bdf8] drop-shadow-[0_2px_6px_rgba(0,112,209,0.35)] dark:drop-shadow-[0_2px_10px_rgba(56,189,248,0.5)]'
                        : 'text-slate-600 dark:text-slate-400 opacity-90'
                    )}
                    strokeWidth={isActive ? 2.5 : 2}
                  />
                  {item.badge && item.badge > 0 ? (
                    <span className="absolute -top-1.5 -right-2 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#ff3b30] px-1 text-[9px] font-bold text-white ring-2 ring-white dark:ring-slate-950 animate-in zoom-in-50 shadow-sm">
                      {item.badge > 99 ? '99+' : item.badge}
                    </span>
                  ) : null}
                  {item.isHighlight && !isActive && (
                    <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-blue-500 dark:bg-sky-400 shadow-[0_0_8px_rgba(0,112,209,0.7)] dark:shadow-[0_0_8px_rgba(56,189,248,0.9)] animate-pulse" />
                  )}
                </div>
                <span
                  className={cn(
                    'text-[10px] sm:text-[10.5px] mt-0.5 tracking-tight truncate max-w-full leading-tight transition-colors duration-200',
                    isActive
                      ? 'text-blue-600 dark:text-[#38bdf8] font-bold'
                      : 'text-slate-600 dark:text-slate-400 font-medium'
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
            'pointer-events-auto flex items-center justify-center shrink-0 w-[62px] h-[62px]',
            'rounded-full touch-manipulation select-none active:scale-90 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]',
            'backdrop-blur-2xl backdrop-saturate-200',
            isSidebarOpen
              ? 'bg-blue-600/20 dark:bg-blue-600/30 border border-blue-500/50 dark:border-blue-400/60 text-blue-600 dark:text-[#38bdf8] shadow-[0_0_24px_rgba(0,112,209,0.35),inset_0_1px_1.5px_rgba(255,255,255,0.8)]'
              : cn(
                  'bg-white/80 dark:bg-slate-950/75',
                  'border border-black/[0.08] dark:border-white/[0.14]',
                  'text-slate-700 dark:text-slate-200 hover:text-slate-950 dark:hover:text-white',
                  'shadow-[0_12px_36px_-6px_rgba(0,0,0,0.12),0_4px_12px_rgba(0,0,0,0.06),inset_0_1px_1.5px_0_rgba(255,255,255,0.9)] dark:shadow-[0_16px_40px_-6px_rgba(0,0,0,0.7),0_4px_16px_rgba(0,0,0,0.5),inset_0_1px_1px_0_rgba(255,255,255,0.16)]'
                )
          )}
        >
          <div className="relative flex items-center justify-center">
            <Menu
              className={cn(
                'h-6 w-6 transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]',
                isSidebarOpen ? 'scale-110 text-blue-600 dark:text-[#38bdf8] rotate-90' : 'text-slate-700 dark:text-slate-200'
              )}
              strokeWidth={2.3}
            />
            {totalBadge > 0 && !isSidebarOpen && (
              <span className="absolute -top-1.5 -right-1.5 h-2.5 w-2.5 rounded-full bg-[#ff3b30] ring-2 ring-white dark:ring-slate-950 shadow-sm" />
            )}
          </div>
        </button>
      </div>
    </nav>
  );
};

export default MobileBottomNav;
