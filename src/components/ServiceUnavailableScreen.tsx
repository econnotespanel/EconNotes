import { useEffect, useState } from 'react';
import { RefreshCw, ServerCrash, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import EconLogo from '@/components/EconLogo';

/** Shown when the backend cannot be reached; retries automatically in the background. */
const ServiceUnavailableScreen = ({ onRetry }: { onRetry: () => void }) => {
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  const [seconds, setSeconds] = useState(15);

  useEffect(() => {
    const on = () => { setOnline(true); onRetry(); };
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, [onRetry]);

  useEffect(() => {
    const t = window.setInterval(() => {
      setSeconds((s) => {
        if (s <= 1) { onRetry(); return 15; }
        return s - 1;
      });
    }, 1000);
    return () => window.clearInterval(t);
  }, [onRetry]);

  const Icon = online ? ServerCrash : WifiOff;
  return (
    <main
      role="alert"
      aria-live="assertive"
      className="flex min-h-[100dvh] flex-col items-center justify-center gap-6 bg-background px-6 text-center text-foreground"
      style={{
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + var(--ios-pwa-top-buffer, 0px) + 1.5rem)',
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 1.5rem)',
      }}
    >
      <EconLogo className="h-9 w-auto" />
      <div className="w-full max-w-md rounded-[24px] border border-slate-200/85 dark:border-slate-800/90 bg-card p-8 shadow-[var(--panel-shadow)]">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400">
          <Icon className="h-7 w-7" aria-hidden />
        </div>
        <h1 className="mt-4 text-xl sm:text-2xl font-extrabold tracking-tight">
          {online ? 'EconNotes sunucularına ulaşılamıyor.' : 'İnternet bağlantınız yok.'}
        </h1>
        <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">
          {online
            ? 'Şu anda yoğunluk veya geçici bir servis kesintisi yaşanıyor. Bağlantı otomatik olarak yeniden denenecek.'
            : 'Bağlantınız geri geldiğinde EconNotes otomatik olarak yeniden bağlanacak.'}
        </p>
        <p className="mt-4 text-xs text-muted-foreground tabular-nums" aria-live="polite">{seconds} sn içinde yeniden denenecek.</p>
        <Button variant="cta" className="mt-5 w-full" onClick={() => { setSeconds(15); onRetry(); }}>
          <RefreshCw className="h-4 w-4" />Şimdi yeniden dene
        </Button>
      </div>
    </main>
  );
};

export default ServiceUnavailableScreen;
