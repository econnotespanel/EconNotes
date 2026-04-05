import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export const useSystemStatus = () => {
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
    const interval = setInterval(checkSystem, 15000);
    return () => clearInterval(interval);
  }, []);

  return { systemOpen, closedUntil };
};
