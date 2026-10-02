import { useEffect, useRef, useState } from 'react';
import EconLogo from '@/components/EconLogo';

const MIN_VISIBLE_MS = 450;
const FADE_MS = 350;

const RouteLoader = () => {
  const [leaving, setLeaving] = useState(false);
  const [mounted, setMounted] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const startedAt = useRef<number>(Date.now());

  useEffect(() => {
    // Move focus to the loader so screen readers announce it
    containerRef.current?.focus();
    return () => {
      // On unmount path: ensure min visible duration via fade
      const elapsed = Date.now() - startedAt.current;
      const remaining = Math.max(0, MIN_VISIBLE_MS - elapsed);
      window.setTimeout(() => setLeaving(true), remaining);
      window.setTimeout(() => setMounted(false), remaining + FADE_MS);
    };
  }, []);

  if (!mounted) return null;

  return (
    <div
      ref={containerRef}
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="Sayfa yükleniyor"
      tabIndex={-1}
      className="min-h-screen flex items-center justify-center bg-background relative overflow-hidden outline-none transition-opacity"
      style={{
        opacity: leaving ? 0 : 1,
        transitionDuration: `${FADE_MS}ms`,
        transitionTimingFunction: 'cubic-bezier(.4,0,.2,1)',
      }}
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 opacity-70 animate-loader-aurora"
        style={{
          background:
            'radial-gradient(circle at 25% 30%, hsl(var(--primary) / 0.45), transparent 55%), radial-gradient(circle at 75% 70%, hsl(280 85% 65% / 0.4), transparent 55%), radial-gradient(circle at 50% 50%, hsl(199 95% 60% / 0.25), transparent 70%)',
          filter: 'blur(70px)',
        }}
      />
      <div className="flex flex-col items-center gap-6">
        <EconLogo className="h-12 w-52 animate-pulse" />

        <div
          className="h-1 w-44 rounded-full bg-muted/60 overflow-hidden"
          aria-hidden="true"
        >
          <div className="h-full w-1/3 bg-gradient-to-r from-transparent via-primary to-transparent animate-loader-bar" />
        </div>
        <span className="sr-only">EconNotes yükleniyor, lütfen bekleyin.</span>
      </div>
    </div>
  );
};

export default RouteLoader;

export const prefetchRoutes = () => {
  // Warm up critical chunks after first paint
  const w = window as any;
  const idle = (cb: () => void): void => {
    if (typeof w.requestIdleCallback === 'function') {
      w.requestIdleCallback(cb, { timeout: 2500 });
    } else {
      w.setTimeout(cb, 600);
    }
  };

  idle(() => {
    void import('@/pages/Dashboard');
    void import('@/pages/Notes');
    void import('@/pages/Announcements');
    void import('@/pages/Messages');
    void import('@/pages/Profile');
  });
};
