import { useAuth } from '@/contexts/AuthContext';
import { Navigate, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import Dashboard from './Dashboard';
import Landing from './Landing';
import { toast } from 'sonner';
import { useSystemStatus } from '@/hooks/useSystemStatus';
import MaintenanceScreen from '@/components/MaintenanceScreen';
import { Button } from '@/components/ui/button';
import { RefreshCw, ArrowRight } from 'lucide-react';
import EconLogo from '@/components/EconLogo';

const Index = () => {
  const { user, loading, isAdmin } = useAuth();
  const navigate = useNavigate();
  const { systemOpen, closedUntil, closureTitle, closureMessage, closureImageUrl, closureMode } = useSystemStatus();
  const [loadTimedOut, setLoadTimedOut] = useState(false);
  const [forceGuest, setForceGuest] = useState(false);

  useEffect(() => {
    if (!loading && systemOpen !== null) return;
    const timer = window.setTimeout(() => setLoadTimedOut(true), 4000);
    return () => window.clearTimeout(timer);
  }, [loading, systemOpen]);

  if ((loading || systemOpen === null) && !forceGuest) {
    if (loadTimedOut) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4 text-center">
          <EconLogo className="h-10 w-44 mb-6 opacity-90" />
          <h2 className="text-lg font-semibold text-foreground mb-2">Sunucu Bağlantısı Bekleniyor</h2>
          <p className="text-sm text-muted-foreground max-w-md mb-6 leading-relaxed">
            Sunucu yanıtı normalden uzun sürüyor. Veritabanı geçici olarak meşgul veya bakımda olabilir.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button
              variant="default"
              onClick={() => window.location.reload()}
              className="gap-2"
            >
              <RefreshCw className="h-4 w-4" />
              Tekrar Dene
            </Button>
            <Button
              variant="outline"
              onClick={() => setForceGuest(true)}
              className="gap-2"
            >
              Misafir Olarak Aç
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse-glow p-4 rounded-full">
          <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  // Show maintenance screen for non-admin users (without signing them out)
  if (systemOpen === false && !isAdmin) {
    return <MaintenanceScreen closedUntil={closedUntil} title={closureTitle} message={closureMessage} imageUrl={closureImageUrl} mode={closureMode} />;
  }

  if (!user || forceGuest) return <Landing />;

  if (sessionStorage.getItem('econnotes_return_tour_pending') === '1') {
    sessionStorage.removeItem('econnotes_return_tour_pending');
    return <Navigate to="/welcome?mode=return" replace />;
  }

  return <Dashboard />;
};

export default Index;
