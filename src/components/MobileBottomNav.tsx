import { useLocation, useNavigate } from 'react-router-dom';
import { Home, FileText, GraduationCap, MessageSquare, Menu } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useEffect, useState, useCallback, useRef } from 'react';
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
  const [isMorphing, setIsMorphing] = useState(false);
  const prevActiveIndexRef = useRef<number>(0);

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
      const { data: views } = await supabase
        .from('announcement_views')
        .select('announcement_id')
        .eq('user_id', user.id);
      const viewedIds = new Set((views || []).map((v: any) => v.announcement_id));
      setUnreadAnnouncements((announcements || []).filter((a) => !viewedIds.has(a.id)).length);
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
    { id: 'home', label: 'Ana Sayfa', path: '/', icon: Home, exact: true },
    { id: 'notes', label: 'Notlar', path: '/notes', icon: FileText },
    { id: 'study', label: 'Stüdyo', path: '/study', icon: GraduationCap, isHighlight: true },
    { id: 'messages', label: 'Mesajlar', path: '/messages', icon: MessageSquare, badge: unreadMessages },
    { id: 'menu', label: 'Menü', path: '__menu__', icon: Menu, badge: totalBadge, isMenu: true },
  ];

  const getActiveIndex = () => {
    if (isSidebarOpen) return 4; // Menü aktif
    const foundIdx = navItems.findIndex((item) => {
      if (item.isMenu) return false;
      return item.exact
        ? location.pathname === item.path
        : location.pathname === item.path || location.pathname.startsWith(item.path + '/');
    });
    return foundIdx >= 0 ? foundIdx : 0;
  };

  const activeIndex = getActiveIndex();

  // Sekme geçişlerinde iOS Liquid Glass esneme (liquid stretch & bounce) animasyonunu tetikle
  useEffect(() => {
    if (prevActiveIndexRef.current !== activeIndex) {
      prevActiveIndexRef.current = activeIndex;
      setIsMorphing(true);
      const timer = setTimeout(() => setIsMorphing(false), 340);
      return () => clearTimeout(timer);
    }
  }, [activeIndex]);

  const itemCount = navItems.length;
  const slotWidthPercent = 100 / itemCount;

  return (
    <nav
      role="navigation"
      aria-label="Mobil Alt Menü"
      className="fixed inset-x-0 z-40 md:hidden pointer-events-none select-none"
      style={{
        bottom: isStandalone
          ? 'calc(env(safe-area-inset-bottom, 0px) + 0.4rem)'
          : 'calc(env(safe-area-inset-bottom, 0px) + 0.65rem)',
      }}
    >
      <div className="mx-auto flex max-w-[410px] items-center justify-center px-3">
        {/* Apple iOS Liquid Glass & EconNotes Uyumlu Kapsül Tab Bar */}
        <div
          className={cn(
            'pointer-events-auto relative flex h-[66px] w-full items-center justify-between rounded-full p-[5px]',
            'backdrop-blur-2xl backdrop-saturate-[190%]',
            'bg-gradient-to-b from-[#17253f]/82 via-[#0d1729]/88 to-[#132038]/86',
            'dark:from-[#182640]/84 dark:via-[#0b1322]/90 dark:to-[#132038]/88',
            'border border-white/[0.22]',
            'shadow-[0_18px_44px_rgba(0,12,36,0.52),0_4px_16px_rgba(0,55,145,0.25),inset_0_1.2px_1.5px_rgba(255,255,255,0.38),inset_0_-1px_1.5px_rgba(255,255,255,0.16),inset_1px_0_1px_rgba(255,255,255,0.14),inset_-1px_0_1px_rgba(255,255,255,0.14)]',
            'transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]',
          )}
        >
          {/* Üst cam yansıma katmanı (iOS Liquid Glass Specular Sheen) */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-4 top-0 h-[1px] bg-gradient-to-r from-transparent via-white/55 to-transparent"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-6 bottom-0 h-[1px] bg-gradient-to-r from-transparent via-cyan-300/35 to-transparent"
          />

          {/* Kayan 3D Liquid Glass Aktif Buton Balonu (iOS Geçiş Animasyonlu - Mavi Renksiz Doğal Cam) */}
          <div
            aria-hidden="true"
            style={{
              width: `calc(${slotWidthPercent}% - 8px)`,
              left: `calc(${activeIndex * slotWidthPercent}% + 4px)`,
              transition:
                'left 430ms cubic-bezier(0.22, 1.26, 0.36, 1), transform 340ms cubic-bezier(0.34, 1.56, 0.64, 1)',
              transform: isMorphing ? 'scaleX(1.13) scaleY(0.92)' : 'scaleX(1) scaleY(1)',
            }}
            className={cn(
              'pointer-events-none absolute top-[5px] bottom-[5px] z-0 rounded-full overflow-hidden',
              'bg-gradient-to-b from-black/55 via-black/70 to-black/60',
              'border border-white/20',
              'shadow-[0_6px_20px_rgba(0,0,0,0.6),inset_0_1.5px_2px_rgba(255,255,255,0.38),inset_0_-1.5px_2px_rgba(255,255,255,0.22)]',
            )}
          >
            {/* iOS 3D Üst & Alt Kubbe Işık Yansıması */}
            <div
              className="absolute inset-x-1 -top-1 h-5 rounded-full opacity-90"
              style={{
                background:
                  'radial-gradient(ellipse 75% 60% at 50% 10%, rgba(255,255,255,0.35), rgba(255,255,255,0.08) 60%, transparent 100%)',
              }}
            />
            <div
              className="absolute inset-x-2 -bottom-1 h-4 rounded-full opacity-80"
              style={{
                background:
                  'radial-gradient(ellipse 70% 55% at 50% 95%, rgba(255,255,255,0.25), rgba(255,255,255,0.06) 60%, transparent 100%)',
              }}
            />
          </div>

          {/* Sekme Butonları */}
          {navItems.map((item, idx) => {
            const Icon = item.icon;
            const isActive = activeIndex === idx;

            return (
              <button
                key={item.id}
                type="button"
                aria-current={isActive && !item.isMenu ? 'page' : undefined}
                onClick={() => {
                  if (item.isMenu) {
                    toggleMobileSidebar();
                  } else {
                    window.dispatchEvent(new CustomEvent('econnotes:close-sidebar'));
                    navigate(item.path);
                  }
                }}
                className={cn(
                  'group relative z-10 flex h-full flex-1 min-w-0 flex-col items-center justify-center rounded-full px-1 py-1',
                  'touch-manipulation select-none focus:outline-none',
                  'transition-transform duration-200 active:scale-90',
                )}
              >
                <div
                  className={cn(
                    'relative flex items-center justify-center transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]',
                    isActive ? '-translate-y-[1px] scale-110' : 'translate-y-0 scale-100 group-hover:scale-105',
                  )}
                >
                  <Icon
                    className={cn(
                      'h-[20px] w-[20px] transition-colors duration-300',
                      isActive
                        ? 'text-white drop-shadow-[0_1px_6px_rgba(255,255,255,0.35)]'
                        : 'text-white/75 group-hover:text-white',
                    )}
                    strokeWidth={isActive ? 2.3 : 1.95}
                  />

                  {item.badge && item.badge > 0 ? (
                    <span className="absolute -top-1.5 -right-2.5 flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-[#22c55e] px-1 text-[9.5px] font-extrabold text-white ring-2 ring-[#0d1729] shadow-[0_2px_8px_rgba(34,197,94,0.5)]">
                      {item.badge > 99 ? '99+' : item.badge}
                    </span>
                  ) : null}

                  {item.isHighlight && !isActive && (
                    <span className="absolute -top-1 -right-1.5 h-2 w-2 rounded-full bg-white/80 shadow-[0_0_8px_rgba(255,255,255,0.8)] animate-pulse" />
                  )}
                </div>

                <span
                  className={cn(
                    'mt-0.5 max-w-full truncate text-[10.5px] leading-tight tracking-[-0.01em] transition-all duration-300',
                    isActive
                      ? 'font-bold text-white'
                      : 'font-medium text-white/75 group-hover:text-white',
                  )}
                >
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
};

export default MobileBottomNav;
