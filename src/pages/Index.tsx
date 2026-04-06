import { useAuth } from '@/contexts/AuthContext';
import { Navigate, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import Dashboard from './Dashboard';
import { toast } from 'sonner';
import { useSystemStatus } from '@/hooks/useSystemStatus';
import MaintenanceScreen from '@/components/MaintenanceScreen';

const Index = () => {
  const { user, loading, isAdmin } = useAuth();
  const navigate = useNavigate();
  const { systemOpen, closedUntil } = useSystemStatus();

  if (loading || systemOpen === null) {
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
    return <MaintenanceScreen closedUntil={closedUntil} />;
  }

  if (!user) return <Navigate to="/login" replace />;

  return <Dashboard />;
};

export default Index;
