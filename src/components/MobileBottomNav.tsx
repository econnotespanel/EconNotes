import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { SUPPORT_MESSAGE_PREFIX } from '@/lib/support';
import { cn } from '@/lib/utils';

export const toggleMobileSidebar = () => {
  window.dispatchEvent(new CustomEvent('econnotes:toggle-sidebar'));
};

/** Apple iOS SF-Symbols tarzı ikonlar */
const IosHomeIcon = ({ filled }: { filled: boolean }) =>
  filled ? (
    <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="currentColor" aria-hidden="true">
      <path d="M11.18 2.75a1.25 1.25 0 0 1 1.64 0l7.5 6.62c.43.38.68.93.68 1.5v8.88A2.25 2.25 0 0 1 18.75 22h-4.25a.75.75 0 0 1-.75-.75v-5.5a1.75 1.75 0 0 0-3.5 0v5.5a.75.75 0 0 1-.75.75H5.25A2.25 2.25 0 0 1 3 19.75v-8.88c0-.57.25-1.12.68-1.5l7.5-6.62Z" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="none" stroke="currentColor" strokeWidth="1.95" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3.68 9.87 11.18 3.25a1.25 1.25 0 0 1 1.64 0l7.5 6.62c.43.38.68.93.68 1.5v8.38A1.75 1.75 0 0 1 19.25 21.5h-4.5v-5.75a1.75 1.75 0 0 0-1.75-1.75h-2a1.75 1.75 0 0 0-1.75 1.75v5.75h-4.5A1.75 1.75 0 0 1 3 19.75v-8.38c0-.57.25-1.12.68-1.5Z" />
    </svg>
  );

const IosNotesIcon = ({ filled }: { filled: boolean }) =>
  filled ? (
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

const IosStudyIcon = ({ filled }: { filled: boolean }) =>
  filled ? (
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

const IosMessagesIcon = ({ filled }: { filled: boolean }) =>
  filled ? (
    <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="currentColor" aria-hidden="true">
      <path d="M12 3C6.48 3 2 6.69 2 11.25c0 2.13.98 4.08 2.59 5.54-.21 1.24-.81 2.41-1.52 3.24a.5.5 0 0 0 .45.82c1.82-.19 3.45-.86 4.65-1.64 1.19.35 2.48.54 3.83.54 5.52 0 10-3.69 10-8.5S17.52 3 12 3Z" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="none" stroke="currentColor" strokeWidth="1.95" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3.5c-5.25 0-9.5 3.47-9.5 7.75 0 2.04.97 3.9 2.55 5.28-.2 1.15-.74 2.22-1.4 3a.45.45 0 0 0 .4.74c1.69-.18 3.2-.8 4.33-1.53 1.13.33 2.35.51 3.62.51 5.25 0 9.5-3.47 9.5-7.75S17.25 3.5 12 3.5Z" />
    </svg>
  );

const IosMenuIcon = ({ filled }: { filled: boolean }) => (
  <svg
    viewBox="0 0 24 24"
    className="h-[22px] w-[22px]"
    fill="none"
    stroke="currentColor"
    strokeWidth={filled ? '2.4' : '2'}
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

  const itemCount = navItems.length;

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

  // iOS 26 Liquid Glass Fizik Motoru (Spring & Mercek Kırılması)
  const barRef = useRef<HTMLDivElement | null>(null);
  const posRef = useRef<number>(activeIndex);
  const velRef = useRef<number>(0);
  const targetRef = useRef<number>(activeIndex);
  const lensRef = useRef<number>(0); // 0 = koyu iç kapsül, 1 = şişmiş şeffaf 3D sıvı cam mercek (videodaki 00:06 efekti)
  const draggingRef = useRef<boolean>(false);
  const dragMovedRef = useRef<boolean>(false);
  const rafRef = useRef<number | null>(null);

  const [animState, setAnimState] = useState<{
    pos: number;
    vel: number;
    lens: number;
  }>({
    pos: activeIndex,
    vel: 0,
    lens: 0,
  });

  const startLoop = useCallback(() => {
    if (rafRef.current !== null) return;

    let lastTime = performance.now();

    const step = (now: number) => {
      const dt = Math.min(0.032, (now - lastTime) / 1000);
      lastTime = now;

      const target = targetRef.current;
      const pos = posRef.current;
      let vel = velRef.current;

      // Yay fiziği (iOS 26 UITabBar spring constants)
      const stiffness = draggingRef.current ? 520 : 340;
      const damping = draggingRef.current ? 36 : 26;
      const force = (target - pos) * stiffness;
      vel = (vel + force * dt) * Math.exp(-damping * dt);
      const nextPos = pos + vel * dt;

      posRef.current = nextPos;
      velRef.current = vel;

      // Mercek şişme & şeffaflaşma yoğunluğu (hareket veya dokunma sırasında 1'e çıkar, durunca 0'a iner)
      const dist = Math.abs(target - nextPos);
      const speed = Math.abs(vel);
      const wantLens = draggingRef.current || dist > 0.035 || speed > 0.25 ? 1 : 0;
      const lensSpeed = wantLens > lensRef.current ? 16 : 9;
      const nextLens =
        lensRef.current + (wantLens - lensRef.current) * Math.min(1, dt * lensSpeed);
      lensRef.current = nextLens;

      setAnimState({
        pos: nextPos,
        vel,
        lens: nextLens,
      });

      const settled =
        !draggingRef.current &&
        dist < 0.002 &&
        speed < 0.01 &&
        nextLens < 0.01;

      if (settled) {
        posRef.current = target;
        velRef.current = 0;
        lensRef.current = 0;
        setAnimState({ pos: target, vel: 0, lens: 0 });
        rafRef.current = null;
      } else {
        rafRef.current = requestAnimationFrame(step);
      }
    };

    rafRef.current = requestAnimationFrame(step);
  }, []);

  useEffect(() => {
    if (!draggingRef.current) {
      targetRef.current = activeIndex;
      startLoop();
    }
  }, [activeIndex, startLoop]);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const activateTabByIndex = (idx: number) => {
    const clamped = Math.max(0, Math.min(itemCount - 1, idx));
    const item = navItems[clamped];
    if (!item) return;
    targetRef.current = clamped;
    startLoop();

    if (item.isMenu) {
      toggleMobileSidebar();
    } else {
      window.dispatchEvent(new CustomEvent('econnotes:close-sidebar'));
      if (location.pathname !== item.path) {
        navigate(item.path);
      }
    }
  };

  const getIndexFromClientX = (clientX: number) => {
    const el = barRef.current;
    if (!el) return activeIndex;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return activeIndex;
    const rel = (clientX - rect.left) / rect.width;
    const raw = rel * itemCount - 0.5;
    return Math.max(0, Math.min(itemCount - 1, raw));
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    draggingRef.current = true;
    dragMovedRef.current = false;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
    startLoop();
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    dragMovedRef.current = true;
    targetRef.current = getIndexFromClientX(e.clientX);
    startLoop();
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
    const finalIdx = Math.round(getIndexFromClientX(e.clientX));
    activateTabByIndex(finalIdx);
  };

  // Kapsül konumu ve kırılma (clip-path) koordinatları
  const slotPct = 100 / itemCount; // 20%
  // Stadyum kapsülünü biraz daha geniş tutarak iOS 26 geniş oval oranını yakala
  const extraWidthPct = 2.6;
  const pillWidthPct = slotPct + extraWidthPct;
  const rawLeftPct = animState.pos * slotPct - extraWidthPct / 2;
  const pillLeftPct = Math.max(0.8, Math.min(100 - pillWidthPct - 0.8, rawLeftPct));
  const pillRightPct = pillLeftPct + pillWidthPct;

  const lens = animState.lens; // 0..1
  const speedStretch = Math.min(0.11, Math.abs(animState.vel) * 0.022);
  const scaleX = 1 + lens * 0.11 + speedStretch;
  const scaleY = 1 + lens * 0.17 - speedStretch * 0.45;

  // Mercek kırılması (clip-path) sınırlarını şişme oranına göre genişlet
  const halfGrowPct = (pillWidthPct * (scaleX - 1)) / 2;
  const clipLeft = Math.max(0, pillLeftPct - halfGrowPct);
  const clipRight = Math.max(0, 100 - (pillRightPct + halfGrowPct));

  return (
    <nav
      role="navigation"
      aria-label="Mobil Alt Menü"
      className="fixed inset-x-0 z-[60] md:hidden pointer-events-none select-none"
      style={{
        bottom: isStandalone
          ? 'calc(env(safe-area-inset-bottom, 0px) + 0.35rem)'
          : 'calc(env(safe-area-inset-bottom, 0px) + 0.55rem)',
      }}
    >
      <div className="mx-auto flex w-full max-w-[430px] items-center justify-center px-2.5">
        {/* Orijinal Apple iOS 26 Liquid Glass Tab Bar */}
        <div
          ref={barRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          style={{
            background:
              'linear-gradient(180deg, rgba(52, 52, 57, 0.76) 0%, rgba(32, 32, 36, 0.82) 55%, rgba(40, 40, 45, 0.78) 100%)',
            boxShadow:
              '0 14px 36px rgba(0, 0, 0, 0.55), inset 0 1px 0.5px rgba(255, 255, 255, 0.34), inset 0 -1px 0.5px rgba(255, 255, 255, 0.16), inset 1px 0 0.5px rgba(255, 255, 255, 0.12), inset -1px 0 0.5px rgba(255, 255, 255, 0.12)',
          }}
          className="pointer-events-auto relative flex h-[62px] w-full touch-none items-center justify-between rounded-full border border-white/[0.16] p-[4px] backdrop-blur-[30px] backdrop-saturate-[190%]"
        >
          {/* 1. KATMAN: Taban (Beyaz İkon ve Yazılar) */}
          <div className="relative z-10 flex h-full w-full items-center justify-between">
            {navItems.map((item, idx) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  if (!dragMovedRef.current) activateTabByIndex(idx);
                }}
                className="flex h-full flex-1 min-w-0 flex-col items-center justify-center rounded-full px-1 focus:outline-none"
              >
                <div className="relative flex items-center justify-center text-white/95">
                  {item.renderIcon({ filled: false })}
                  {item.badge && item.badge > 0 ? (
                    <span className="absolute -top-1.5 -right-3 flex h-[16px] min-w-[16px] items-center justify-center rounded-full bg-[#ff3b30] px-1 text-[9.5px] font-bold text-white ring-2 ring-[#202024]">
                      {item.badge > 99 ? '99+' : item.badge}
                    </span>
                  ) : null}
                </div>
                <span className="mt-[2px] max-w-full truncate text-[10.5px] font-semibold leading-tight tracking-[-0.01em] text-white/95">
                  {item.label}
                </span>
              </button>
            ))}
          </div>

          {/* 2. KATMAN: Kayan iOS 26 Liquid Glass Kapsülü (Dururken koyu iç kapsül, geçişte şişen şeffaf 3D sıvı cam mercek) */}
          <div
            aria-hidden="true"
            style={{
              left: `${pillLeftPct}%`,
              width: `${pillWidthPct}%`,
              transform: `scale3d(${scaleX.toFixed(4)}, ${scaleY.toFixed(4)}, 1)`,
              background:
                lens > 0.05
                  ? `radial-gradient(65% 50% at 50% 4%, rgba(255,255,255,${(0.22 + lens * 0.24).toFixed(3)}) 0%, rgba(255,255,255,${(0.05 + lens * 0.08).toFixed(3)}) 55%, transparent 100%), radial-gradient(65% 48% at 50% 96%, rgba(255,255,255,${(0.14 + lens * 0.22).toFixed(3)}) 0%, transparent 100%), rgba(14, 14, 17, ${(0.88 - lens * 0.66).toFixed(3)})`
                  : 'radial-gradient(65% 48% at 50% 3%, rgba(255, 255, 255, 0.22) 0%, rgba(255, 255, 255, 0.04) 55%, transparent 100%), radial-gradient(60% 42% at 50% 97%, rgba(255, 255, 255, 0.14) 0%, transparent 100%), rgba(12, 12, 15, 0.88)',
              boxShadow:
                lens > 0.05
                  ? `0 8px 24px rgba(0,0,0,${(0.45 + lens * 0.15).toFixed(2)}), inset 0 1.5px ${1 + lens * 2}px rgba(255,255,255,${(0.24 + lens * 0.5).toFixed(2)}), inset 0 -1.5px ${1 + lens * 2}px rgba(255,255,255,${(0.14 + lens * 0.38).toFixed(2)}), inset 1.5px 0 2px rgba(255,255,255,${(lens * 0.35).toFixed(2)}), inset -1.5px 0 2px rgba(255,255,255,${(lens * 0.35).toFixed(2)})`
                  : '0 4px 12px rgba(0, 0, 0, 0.5), inset 0 1px 1px rgba(255, 255, 255, 0.22), inset 0 -0.5px 1px rgba(255, 255, 255, 0.12)',
              borderColor: `rgba(255, 255, 255, ${(0.10 + lens * 0.38).toFixed(3)})`,
            }}
            className="pointer-events-none absolute top-[4px] bottom-[4px] z-20 rounded-full border"
          />

          {/* 3. KATMAN: Mercek İçi Kırılma & Aktif Renk Katmanı (Videodaki 00:06 gibi kapsül hangi sekmenin üzerindeyse o kısmı anında renklendirir ve büyütür) */}
          <div
            aria-hidden="true"
            style={{
              clipPath: `inset(-8px ${clipRight.toFixed(2)}% -8px ${clipLeft.toFixed(2)}% round 999px)`,
            }}
            className="pointer-events-none absolute inset-[4px] z-30 flex items-center justify-between"
          >
            {navItems.map((item) => {
              // Menü butonuna tıklandığında mavi olmasın (kullanıcı talebi), diğer sekmeler EconNotes iOS mavisi (#2e90ff) olsun
              const activeColorClass = item.isMenu ? 'text-white' : 'text-[#2e90ff]';
              return (
                <div
                  key={item.id}
                  style={{
                    transform: `scale(${(1 + lens * 0.06).toFixed(3)})`,
                  }}
                  className={cn(
                    'flex h-full flex-1 min-w-0 flex-col items-center justify-center rounded-full px-1',
                    activeColorClass,
                  )}
                >
                  <div className="relative flex items-center justify-center">
                    {item.renderIcon({ filled: true })}
                    {item.badge && item.badge > 0 ? (
                      <span className="absolute -top-1.5 -right-3 flex h-[16px] min-w-[16px] items-center justify-center rounded-full bg-[#ff3b30] px-1 text-[9.5px] font-bold text-white ring-2 ring-[#121215]">
                        {item.badge > 99 ? '99+' : item.badge}
                      </span>
                    ) : null}
                  </div>
                  <span className="mt-[2px] max-w-full truncate text-[10.5px] font-bold leading-tight tracking-[-0.01em]">
                    {item.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </nav>
  );
};

export default MobileBottomNav;
