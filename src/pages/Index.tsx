import { useAuth } from '@/contexts/AuthContext';
import { Navigate, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import Dashboard from './Dashboard';
import { toast } from 'sonner';
import { useSystemStatus } from '@/hooks/useSystemStatus';
import MaintenanceScreen from '@/components/MaintenanceScreen';

const Index = () => {
  const { user, loading, isAdmin, signOut } = useAuth();
  const navigate = useNavigate();
  const { systemOpen, closedUntil } = useSystemStatus();

  useEffect(() => {
    if (systemOpen === false && user && !isAdmin) {
      signOut();
    }
  }, [systemOpen, user, isAdmin]);

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

  if (!systemOpen && !isAdmin) {
    return <MaintenanceScreen closedUntil={closedUntil} />;
  }

  return <Dashboard />;
};

export default Index;
