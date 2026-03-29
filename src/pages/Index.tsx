import { useAuth } from '@/contexts/AuthContext';
import { Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import Dashboard from './Dashboard';
import { AlertTriangle } from 'lucide-react';
import logo from '@/assets/econnotes-logo.png';

const Index = () => {
  const { user, loading, isAdmin } = useAuth();
  const [systemOpen, setSystemOpen] = useState<boolean | null>(null);
  const [closedUntil, setClosedUntil] = useState<string | null>(null);

  useEffect(() => {
    const checkSystem = async () => {
      const { data } = await supabase.from('system_settings').select('*').limit(1).single();
      if (data) {
        setSystemOpen((data as any).is_system_open ?? true);
        setClosedUntil((data as any).closed_until);
      } else {
        setSystemOpen(true);
      }
    };
    checkSystem();
  }, []);

  if (loading || systemOpen === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse-glow p-4 rounded-full">
          <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  // If system is closed and user is not admin, show maintenance message
  if (!systemOpen && !isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="max-w-md text-center space-y-4">
          <div className="flex justify-center">
            <img src={logo} alt="EconNotes" className="h-20 w-20 object-contain" />
          </div>
          <div className="flex justify-center">
            <div className="p-4 rounded-full bg-warning/10">
              <AlertTriangle className="h-12 w-12 text-warning" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-foreground">EconNotes Panel Bakımda</h1>
          <p className="text-muted-foreground">
            EconNotes Panel bakımda, lütfen daha sonra tekrar deneyin.
          </p>
          {closedUntil && (
            <p className="text-sm text-muted-foreground">
              Tahmini açılış: <strong>{new Date(closedUntil).toLocaleString('tr-TR')}</strong>
            </p>
          )}
          <p className="text-xs text-muted-foreground mt-4">
            Bu platform, Düzce Üniversitesi öğrencileri tarafından geliştirilmiştir.
          </p>
        </div>
      </div>
    );
  }

  return <Dashboard />;
};

export default Index;
