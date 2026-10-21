import { useState, useEffect } from 'react';
import { WifiOff } from 'lucide-react';
import EconLogo from '@/components/EconLogo';

const OfflineBanner = () => {
  const [isOffline, setIsOffline] = useState(() => typeof navigator !== 'undefined' && !navigator.onLine);

  useEffect(() => {
    const goOffline = () => setIsOffline(true);
    const goOnline = () => setIsOffline(false);
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, []);

  if (!isOffline) return null;

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="fixed inset-0 z-[9999] flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 px-6 py-10 text-center text-white"
    >
      <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-primary/15 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-24 h-80 w-80 rounded-full bg-secondary/15 blur-3xl" />
      <div className="relative flex w-full max-w-md flex-col items-center rounded-3xl border border-white/10 bg-white/[0.04] px-6 py-10 shadow-2xl shadow-black/30 backdrop-blur-xl sm:px-10">
        <span className="mb-8 flex h-16 w-52 items-center justify-center rounded-2xl border border-primary/25 bg-primary/10 px-5 shadow-[0_0_30px_hsl(var(--primary)/0.15)]">
          <EconLogo allWhite className="h-9 w-full justify-center" />
        </span>
        <span className="mb-5 flex h-16 w-16 items-center justify-center rounded-full border-2 border-red-400/70 bg-red-500/20 text-red-300 shadow-[0_0_24px_rgba(248,113,113,0.28)]">
          <WifiOff className="h-8 w-8 stroke-[2.5]" aria-hidden="true" />
        </span>
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl">EconNotes'a ulaşılamıyor</h1>
        <p className="mt-3 max-w-sm text-sm leading-relaxed text-slate-300">
          Sunuculara ulaşılamıyor. Lütfen internet bağlantınızı kontrol edin.
        </p>
        <p className="mt-6 text-xs text-slate-500">Bağlantı yeniden kurulduğunda bu ekran otomatik olarak kapanır.</p>
      </div>
    </div>
  );
};

export default OfflineBanner;
