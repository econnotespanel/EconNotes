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
    <main role="alert" aria-live="assertive" className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-6 text-center text-foreground">
      <EconLogo />
      <div className="rounded-2xl border-2 border-border bg-card p-8 shadow-lg max-w-md w-full">
        <Icon className="mx-auto h-12 w-12 text-primary" aria-hidden />
        <h1 className="mt-4 font-display text-2xl font-bold">
          {online ? 'EconNotes sunucularına ulaşılamıyor.' : 'İnternet bağlantınız yok.'}
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          {online
            ? 'Şu anda yoğunluk veya geçici bir servis kesintisi yaşanıyor. Bağlantı otomatik olarak yeniden denenecek.'
            : 'Bağlantınız geri geldiğinde EconNotes otomatik olarak yeniden bağlanacak.'}
        </p>
        <p className="mt-4 text-xs text-muted-foreground" aria-live="polite">{seconds} sn içinde yeniden denenecek.</p>
        <Button className="mt-5 w-full" onClick={() => { setSeconds(15); onRetry(); }}>
          <RefreshCw className="mr-2 h-4 w-4" />Şimdi yeniden dene.
        </Button>
      </div>
    </main>
  );
};

export default ServiceUnavailableScreen;
