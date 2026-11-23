import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { SUPPORT_MESSAGE_PREFIX } from '@/lib/support';
import { cn } from '@/lib/utils';

export const toggleMobileSidebar = () => {
  window.dispatchEvent(new CustomEvent('econnotes:toggle-sidebar'));
};

/**
 * Birleşik iOS SF-Symbols tasarım ailesinden 23px ikonlar (tutarlı çizgi kalınlığı: 1.85).
 * Aktif sekmede temiz dolgulu/vurgulu form, pasif sekmede dengeli ince çizgi formu kullanılır.
 */
const NavHomeIcon = ({ active }: { active: boolean }) =>
  active ? (
    <svg viewBox="0 0 24 24" className="h-[23px] w-[23px]" fill="currentColor" aria-hidden="true">
      <path d="M11.2 2.9a1.25 1.25 0 0 1 1.6 0l7.45 6.45c.47.41.75 1 .75 1.63v8.27A2.25 2.25 0 0 1 18.75 21.5h-4a.75.75 0 0 1-.75-.75v-5.25a2 2 0 0 0-4 0v5.25a.75.75 0 0 1-.75.75h-4A2.25 2.25 0 0 1 3 19.25v-8.27c0-.63.28-1.22.75-1.63L11.2 2.9Z" />
    </svg>
  ) : (
    <svg
      viewBox="0 0 24 24"
      className="h-[23px] w-[23px]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.85"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3.75 9.85 11.2 3.4a1.25 1.25 0 0 1 1.6 0l7.45 6.45c.47.41.75 1 .75 1.63v7.77a2 2 0 0 1-2 2h-4.25v-5.5a1.75 1.75 0 0 0-1.75-1.75h-2a1.75 1.75 0 0 0-1.75 1.75v5.5H5a2 2 0 0 1-2-2v-7.77c0-.63.28-1.22.75-1.63Z" />
    </svg>
  );

const NavNotesIcon = ({ active }: { active: boolean }) =>
  active ? (
    <svg viewBox="0 0 24 24" className="h-[23px] w-[23px]" fill="currentColor" aria-hidden="true">
      <path d="M6.75 2.25A2.5 2.5 0 0 0 4.25 4.75v14.5a2.5 2.5 0 0 0 2.5 2.5h10.5a2.5 2.5 0 0 0 2.5-2.5V8.6a2.25 2.25 0 0 0-.66-1.59l-4.1-4.1a2.25 2.25 0 0 0-1.59-.66H6.75Zm6.25 1.9v3.1c0 .69.56 1.25 1.25 1.25h3.1L13 4.15ZM8.25 12.25a.75.75 0 0 1 .75-.75h6a.75.75 0 0 1 0 1.5H9a.75.75 0 0 1-.75-.75Zm0 3.5a.75.75 0 0 1 .75-.75h4.25a.75.75 0 0 1 0 1.5H9a.75.75 0 0 1-.75-.75Z" />
    </svg>
  ) : (
    <svg
      viewBox="0 0 24 24"
      className="h-[23px] w-[23px]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.85"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M13.75 2.75H6.75a2 2 0 0 0-2 2v14.5a2 2 0 0 0 2 2h10.5a2 2 0 0 0 2-2V8.25l-5.5-5.5Z" />
      <path d="M13.5 2.75V8.25H19" />
      <path d="M8.75 12.75h6.5" />
      <path d="M8.75 16.25h4.5" />
    </svg>
  );

const NavStudyIcon = ({ active }: { active: boolean }) =>
  active ? (
    <svg viewBox="0 0 24 24" className="h-[23px] w-[23px]" fill="currentColor" aria-hidden="true">
      <path d="M11.36 3.35a1.5 1.5 0 0 1 1.28 0l9.05 4.28a.75.75 0 0 1 0 1.35l-9.05 4.28a1.5 1.5 0 0 1-1.28 0L2.31 8.98a.75.75 0 0 1 0-1.35l9.05-4.28Z" />
      <path d="M5.75 12.25v4.1c0 1.85 2.8 3.65 6.25 3.65s6.25-1.8 6.25-3.65v-4.1l-4.96 2.35a3 3 0 0 1-2.58 0l-4.96-2.35Z" />
      <path d="M21 10.6a.75.75 0 0 1 .75.75v4.9a.75.75 0 0 1-1.5 0v-4.9a.75.75 0 0 1 .75-.75Z" />
    </svg>
  ) : (
    <svg
      viewBox="0 0 24 24"
      className="h-[23px] w-[23px]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.85"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21.35 10.75a.85.85 0 0 0 0-1.54l-8.68-4.1a1.6 1.6 0 0 0-1.34 0l-8.68 4.1a.85.85 0 0 0 0 1.54l8.68 4.1a1.6 1.6 0 0 0 1.34 0l8.68-4.1Z" />
      <path d="M21.5 10.25v5.5" />
      <path d="M6.25 12.6v3.55c0 1.6 2.57 3.1 5.75 3.1s5.75-1.5 5.75-3.1V12.6" />
    </svg>
  );

const NavMessagesIcon = ({ active }: { active: boolean }) =>
  active ? (
    <svg viewBox="0 0 24 24" className="h-[23px] w-[23px]" fill="currentColor" aria-hidden="true">
      <path d="M12 3.25c-5.38 0-9.75 3.55-9.75 7.95 0 2.05.95 3.93 2.52 5.34-.22 1.18-.8 2.3-1.48 3.1a.48.48 0 0 0 .43.79c1.77-.19 3.36-.83 4.53-1.59 1.16.34 2.42.52 3.75.52 5.38 0 9.75-3.56 9.75-7.96S17.38 3.25 12 3.25Z" />
    </svg>
  ) : (
    <svg
      viewBox="0 0 24 24"
      className="h-[23px] w-[23px]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.85"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3.75c-5.1 0-9.25 3.37-9.25 7.55 0 1.98.94 3.78 2.48 5.12-.2 1.12-.72 2.16-1.36 2.92a.44.44 0 0 0 .39.72c1.64-.18 3.11-.78 4.21-1.49 1.1.32 2.28.49 3.53.49 5.1 0 9.25-3.37 9.25-7.55S17.1 3.75 12 3.75Z" />
    </svg>
  );

const NavMenuIcon = ({ active }: { active: boolean }) => (
  <svg
    viewBox="0 0 24 24"
    className="h-[23px] w-[23px]"
    fill="none"
    stroke="currentColor"
    strokeWidth={active ? '2.15' : '1.85'}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <line x1="4.25" y1="7" x2="19.75" y2="7" />
    <line x1="4.25" y1="12" x2="19.75" y2="12" />
    <line x1="4.25" y1="17" x2="19.75" y2="17" />
  </svg>
);

const MobileBottomNav = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [unreadAnnouncements, setUnreadAnnouncements] = useState(0);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  const barRef = useRef<HTMLDivElement | null>(null);
  const pointerStartXRef = useRef<number | null>(null);
  const didSwipeRef = useRef(false);
  const suppressNextClickRef = useRef(false);

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
        const uniqueSenders = new Set(unreadMsgs.map((m: { sender_id: string }) => m.sender_id));
        setUnreadMessages(uniqueSenders.size);
      }

      const { data: announcements } = await supabase.from('announcements').select('id');
      const { data: views } = await supabase
        .from('announcement_views')
        .select('announcement_id')
        .eq('user_id', user.id);
      const viewedIds = new Set((views || []).map((v: { announcement_id: string }) => v.announcement_id));
      setUnreadAnnouncements((announcements || []).filter((a) => !viewedIds.has(a.id)).length);
    } catch {
      // Sessizce devam et
    }
  }, [user]);

  useEffect(() => {
    fetchUnread();
    const interval = window.setInterval(fetchUnread, 120000);
    window.addEventListener('econnotes:announcements-updated', fetchUnread);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('econnotes:announcements-updated', fetchUnread);
    };
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

  useEffect(() => {
    const checkStandalone = () => {
      const standalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
      setIsStandalone(standalone);
    };
    checkStandalone();
    window.addEventListener('resize', checkStandalone);
    return () => window.removeEventListener('resize', checkStandalone);
  }, []);

  const totalBadge = unreadMessages + unreadAnnouncements;

  const navItems = [
    { id: 'home', label: 'Ana Sayfa', path: '/', renderIcon: NavHomeIcon, exact: true },
    { id: 'notes', label: 'Notlar', path: '/notes', renderIcon: NavNotesIcon },
    { id: 'study', label: 'Stüdyo', path: '/study', renderIcon: NavStudyIcon },
    { id: 'messages', label: 'Mesajlar', path: '/messages', renderIcon: NavMessagesIcon, badge: unreadMessages },
    { id: 'menu', label: 'Menü', path: '__menu__', renderIcon: NavMenuIcon, badge: totalBadge, isMenu: true },
  ];

  const getActiveIndex = (): number => {
    if (isSidebarOpen) return 4;
    const pathname = location.pathname;
    if (pathname === '/' || pathname === '/dashboard') return 0;
    const foundIdx = navItems.findIndex((item) => {
      if (item.isMenu) return false;
      return item.exact
        ? pathname === item.path
        : pathname === item.path || pathname.startsWith(`${item.path}/`);
    });
    // İkincil sayfalarda (KPSS, Profil, Duyurular, Puanlar vb.) Menü aktif olarak yansıtılır
    return foundIdx >= 0 ? foundIdx : 4;
  };

  const activeIndex = getActiveIndex();

  const activateTabByIndex = (idx: number) => {
    const clamped = Math.max(0, Math.min(navItems.length - 1, idx));
    const item = navItems[clamped];
    if (!item) return;

    if (item.isMenu) {
      toggleMobileSidebar();
    } else {
      window.dispatchEvent(new CustomEvent('econnotes:close-sidebar'));
      if (location.pathname !== item.path) {
        navigate(item.path);
      }
    }
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    pointerStartXRef.current = e.clientX;
    didSwipeRef.current = false;
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (pointerStartXRef.current === null) return;
    if (Math.abs(e.clientX - pointerStartXRef.current) > 14) {
      didSwipeRef.current = true;
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (pointerStartXRef.current === null) return;
    const wasSwipe = didSwipeRef.current;
    pointerStartXRef.current = null;
    didSwipeRef.current = false;

    if (wasSwipe && barRef.current) {
      const rect = barRef.current.getBoundingClientRect();
      if (rect.width > 0) {
        const rel = Math.max(0, Math.min(0.9999, (e.clientX - rect.left) / rect.width));
        const targetIdx = Math.floor(rel * navItems.length);
        suppressNextClickRef.current = true;
        window.setTimeout(() => {
          suppressNextClickRef.current = false;
        }, 120);
        activateTabByIndex(targetIdx);
      }
    }
  };

  return (
    <nav
      role="navigation"
      aria-label="Mobil Alt Menü"
      className="fixed inset-x-0 z-[60] md:hidden pointer-events-none select-none"
      style={{
        bottom: isStandalone
          ? 'calc(env(safe-area-inset-bottom, 0px) + 10px)'
          : 'calc(env(safe-area-inset-bottom, 0px) + 12px)',
        paddingLeft: 'max(0.75rem, env(safe-area-inset-left, 0px))',
        paddingRight: 'max(0.75rem, env(safe-area-inset-right, 0px))',
      }}
    >
      <div className="mx-auto flex w-full max-w-[404px] sm:max-w-[456px] items-center justify-center">
        {/* Apple Music esintili zarif Liquid Glass alt navigasyon kapsülü */}
        <div
          ref={barRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={() => {
            pointerStartXRef.current = null;
            didSwipeRef.current = false;
          }}
          className="econ-liquid-dock pointer-events-auto relative h-[58px] sm:h-[60px] w-full overflow-hidden rounded-full p-[4px]"
        >
          {/* Aktif seçenek arkasında kayan hafif, yarı saydam yuvarlatılmış cam alan */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-[4px] z-0"
          >
            <div
              className="econ-liquid-active-pill h-full w-1/5 rounded-full"
              style={{
                transform: `translate3d(${activeIndex * 100}%, 0, 0)`,
              }}
            />
          </div>

          {/* 5 Eşit Genişlikte Navigasyon Seçeneği */}
          <div className="relative z-10 grid h-full w-full grid-cols-5 items-center">
            {navItems.map((item, idx) => {
              const isActive = idx === activeIndex;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-current={isActive ? 'page' : undefined}
                  aria-label={item.label}
                  onClick={() => {
                    if (suppressNextClickRef.current) return;
                    activateTabByIndex(idx);
                  }}
                  className={cn(
                    'group flex h-full w-full min-w-0 flex-col items-center justify-center gap-[3px] rounded-full px-1 transition-colors duration-200 active:scale-[0.94] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60',
                    isActive
                      ? 'text-white'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white',
                  )}
                >
                  <span className="relative flex items-center justify-center transition-transform duration-200 group-active:scale-95">
                    {item.renderIcon({ active: isActive })}
                    {item.badge && item.badge > 0 ? (
                      <span className="absolute -top-1 -right-2.5 flex h-[15px] min-w-[15px] items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold leading-none text-white shadow-sm ring-[1.5px] ring-white dark:ring-[#091224]">
                        {item.badge > 99 ? '99+' : item.badge}
                      </span>
                    ) : null}
                  </span>
                  <span
                    className={cn(
                      'max-w-full truncate text-[11px] leading-none tracking-[-0.01em] transition-colors duration-200',
                      isActive ? 'font-semibold' : 'font-medium',
                    )}
                  >
                    {item.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </nav>
  );
};

export default MobileBottomNav;
