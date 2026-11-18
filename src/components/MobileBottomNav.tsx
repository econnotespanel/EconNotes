import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { SUPPORT_MESSAGE_PREFIX } from '@/lib/support';
import { cn } from '@/lib/utils';

export const toggleMobileSidebar = () => {
  window.dispatchEvent(new CustomEvent('econnotes:toggle-sidebar'));
};

/** Apple iOS SF-Symbols tarzı ikonlar (Aktif durumda dolgun/filled, pasif durumda zarif iOS çizgili) */
const IosHomeIcon = ({ active }: { active: boolean }) =>
  active ? (
    <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="currentColor" aria-hidden="true">
      <path d="M11.18 2.75a1.25 1.25 0 0 1 1.64 0l7.5 6.62c.43.38.68.93.68 1.5v8.88A2.25 2.25 0 0 1 18.75 22h-4.25a.75.75 0 0 1-.75-.75v-5.5a1.75 1.75 0 0 0-3.5 0v5.5a.75.75 0 0 1-.75.75H5.25A2.25 2.25 0 0 1 3 19.75v-8.88c0-.57.25-1.12.68-1.5l7.5-6.62Z" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="none" stroke="currentColor" strokeWidth="1.95" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3.68 9.87 11.18 3.25a1.25 1.25 0 0 1 1.64 0l7.5 6.62c.43.38.68.93.68 1.5v8.38A1.75 1.75 0 0 1 19.25 21.5h-4.5v-5.75a1.75 1.75 0 0 0-1.75-1.75h-2a1.75 1.75 0 0 0-1.75 1.75v5.75h-4.5A1.75 1.75 0 0 1 3 19.75v-8.38c0-.57.25-1.12.68-1.5Z" />
    </svg>
  );

const IosNotesIcon = ({ active }: { active: boolean }) =>
  active ? (
    <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="currentColor" aria-hidden="true">
      <path d="M6.75 2A2.75 2.75 0 0 0 4 4.75v14.5A2.75 2.75 0 0 0 6.75 22h10.5A2.75 2.75 0 0 0 20 19.25V8.56a2.25 2.25 0 0 0-.66-1.59l-4.31-4.31A2.25 2.25 0 0 0 13.44 2H6.75Zm6.25 1.8v3.45c0 .69.56 1.25 1.25 1.25h3.45L13 3.8ZM8 12.25a.75.75 0 0 1 .75-.75h6.5a.75.75 0 0 1 0 1.5h-6.5a.75.75 0 0 1-.75-.75Zm0 3.5a.75.75 0 0 1 .75-.75h4.5a.75.75 0 0 1 0 1.5h-4.5a.75.75 0 0 1-.75-.75Z" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="none" stroke="currentColor" strokeWidth="1.95" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 2.5H6.75A2.25 2.25 0 0 0 4.5 4.75v14.5a2.25 2.25 0 0 0 2.25 2.25h10.5a2.25 2.25 0 0 0 2.25-2.25V8L14 2.5Z" />
      <path d="M13.5 2.5V8H19" />
      <path d="M8.5 12.5h7" />
      <path d="M8.5 16h5" />
    </svg>
  );

const IosStudyIcon = ({ active }: { active: boolean }) =>
  active ? (
    <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="currentColor" aria-hidden="true">
      <path d="M11.35 3.16a1.5 1.5 0 0 1 1.3 0l9.25 4.38a.75.75 0 0 1 0 1.36l-9.25 4.38a1.5 1.5 0 0 1-1.3 0L2.1 8.9a.75.75 0 0 1 0-1.36l9.25-4.38Z" />
      <path d="M5.5 12.18v4.32c0 1.88 2.95 3.75 6.5 3.75s6.5-1.87 6.5-3.75v-4.32l-5.2 2.46a3 3 0 0 1-2.6 0l-5.2-2.46Z" />
      <path d="M21 10.75a.75.75 0 0 1 .75.75v5.25a.75.75 0 0 1-1.5 0V11.5a.75.75 0 0 1 .75-.75Z" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="none" stroke="currentColor" strokeWidth="1.95" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z" />
      <path d="M22 10v6" />
      <path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5" />
    </svg>
  );

const IosMessagesIcon = ({ active }: { active: boolean }) =>
  active ? (
    <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="currentColor" aria-hidden="true">
      <path d="M12 3C6.48 3 2 6.69 2 11.25c0 2.13.98 4.08 2.59 5.54-.21 1.24-.81 2.41-1.52 3.24a.5.5 0 0 0 .45.82c1.82-.19 3.45-.86 4.65-1.64 1.19.35 2.48.54 3.83.54 5.52 0 10-3.69 10-8.5S17.52 3 12 3Z" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="none" stroke="currentColor" strokeWidth="1.95" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3.5c-5.25 0-9.5 3.47-9.5 7.75 0 2.04.97 3.9 2.55 5.28-.2 1.15-.74 2.22-1.4 3a.45.45 0 0 0 .4.74c1.69-.18 3.2-.8 4.33-1.53 1.13.33 2.35.51 3.62.51 5.25 0 9.5-3.47 9.5-7.75S17.25 3.5 12 3.5Z" />
    </svg>
  );

const IosMenuIcon = ({ active }: { active: boolean }) => (
  <svg
    viewBox="0 0 24 24"
    className="h-[22px] w-[22px]"
    fill="none"
    stroke="currentColor"
    strokeWidth={active ? '2.4' : '2'}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <line x1="4" y1="7" x2="20" y2="7" />
    <line x1="4" y1="12" x2="20" y2="12" />
    <line x1="4" y1="17" x2="20" y2="17" />
  </svg>
);

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
    { id: 'home', label: 'Ana Sayfa', path: '/', renderIcon: IosHomeIcon, exact: true },
    { id: 'notes', label: 'Notlar', path: '/notes', renderIcon: IosNotesIcon },
    { id: 'study', label: 'Stüdyo', path: '/study', renderIcon: IosStudyIcon },
    { id: 'messages', label: 'Mesajlar', path: '/messages', renderIcon: IosMessagesIcon, badge: unreadMessages },
    { id: 'menu', label: 'Menü', path: '__menu__', renderIcon: IosMenuIcon, badge: totalBadge, isMenu: true },
  ];

  const getActiveIndex = () => {
    if (isSidebarOpen) return 4;
    const foundIdx = navItems.findIndex((item) => {
      if (item.isMenu) return false;
      return item.exact
        ? location.pathname === item.path
        : location.pathname === item.path || location.pathname.startsWith(item.path + '/');
    });
    return foundIdx >= 0 ? foundIdx : 0;
  };

  const activeIndex = getActiveIndex();

  return (
    <nav
      role="navigation"
      aria-label="Mobil Alt Menü"
      className="fixed inset-x-0 z-40 md:hidden pointer-events-none select-none"
      style={{
        bottom: isStandalone
          ? 'calc(env(safe-area-inset-bottom, 0px) + 0.35rem)'
          : 'calc(env(safe-area-inset-bottom, 0px) + 0.55rem)',
      }}
    >
      <div className="mx-auto flex w-full max-w-[420px] items-center justify-center px-3">
        {/* Orijinal Apple iPhone iOS 26 Liquid Glass Kapsül Tab Bar */}
        <div
          style={{
            background:
              'linear-gradient(180deg, rgba(58, 58, 64, 0.72) 0%, rgba(36, 36, 40, 0.78) 50%, rgba(44, 44, 49, 0.75) 100%)',
            boxShadow:
              '0 14px 36px rgba(0, 0, 0, 0.5), inset 0 1px 0.5px rgba(255, 255, 255, 0.32), inset 0 -1px 0.5px rgba(255, 255, 255, 0.14), inset 1px 0 0.5px rgba(255, 255, 255, 0.12), inset -1px 0 0.5px rgba(255, 255, 255, 0.12)',
          }}
          className="pointer-events-auto relative flex h-[60px] w-full items-center justify-between rounded-full border border-white/[0.16] p-[3.5px] backdrop-blur-[30px] backdrop-saturate-[190%]"
        >
          {navItems.map((item, idx) => {
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
                  'group relative z-10 flex h-full min-w-0 flex-col items-center justify-center rounded-full px-2 py-1',
                  'touch-manipulation select-none focus:outline-none',
                  'transition-[flex,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-95',
                  isActive ? 'flex-[1.32]' : 'flex-1',
                )}
              >
                {/* Apple iOS 26 Siyah/Füme 3D Liquid Glass Aktif Stadyum Kapsülü */}
                {isActive && (
                  <motion.div
                    layoutId="ios-liquid-glass-active-pill"
                    transition={{
                      type: 'spring',
                      stiffness: 400,
                      damping: 32,
                      mass: 0.85,
                    }}
                    style={{
                      background:
                        'radial-gradient(65% 48% at 50% 2%, rgba(255, 255, 255, 0.22) 0%, rgba(255, 255, 255, 0.05) 55%, transparent 100%), radial-gradient(60% 42% at 50% 98%, rgba(255, 255, 255, 0.14) 0%, transparent 100%), rgba(14, 14, 17, 0.88)',
                      boxShadow:
                        '0 4px 14px rgba(0, 0, 0, 0.48), inset 0 1px 1px rgba(255, 255, 255, 0.22), inset 0 -0.5px 1px rgba(255, 255, 255, 0.12)',
                    }}
                    className="pointer-events-none absolute inset-0 rounded-full border border-white/[0.10]"
                  />
                )}

                <div className="relative z-10 flex items-center justify-center text-white">
                  {item.renderIcon({ active: isActive })}

                  {item.badge && item.badge > 0 ? (
                    <span className="absolute -top-1.5 -right-3 flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-[#25d366] px-1 text-[10px] font-bold text-black ring-2 ring-[#1c1c1e] shadow-xs">
                      {item.badge > 99 ? '99+' : item.badge}
                    </span>
                  ) : null}
                </div>

                <span
                  className={cn(
                    'relative z-10 mt-[2px] max-w-full truncate text-[10.5px] leading-tight tracking-[-0.01em] transition-colors duration-200',
                    isActive
                      ? 'font-semibold text-white'
                      : 'font-medium text-white/85 group-hover:text-white',
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
