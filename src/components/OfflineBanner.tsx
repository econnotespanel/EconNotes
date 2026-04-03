import { useState, useEffect } from 'react';
import { WifiOff } from 'lucide-react';

const OfflineBanner = () => {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

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
    <div className="fixed top-0 left-0 right-0 z-[9999] bg-destructive text-destructive-foreground py-3 px-4 flex items-center justify-center gap-2 text-sm font-medium shadow-lg">
      <WifiOff className="h-4 w-4" />
      İnternet bağlantısı yok. Lütfen bağlantınızı kontrol edin.
    </div>
  );
};

export default OfflineBanner;
