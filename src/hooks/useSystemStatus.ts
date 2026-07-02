import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface SystemStatus {
  systemOpen: boolean | null;
  closedUntil: string | null;
  closureTitle: string | null;
  closureMessage: string | null;
  closureImageUrl: string | null;
  closureMode: string | null;
}

export const useSystemStatus = (): SystemStatus => {
  const [state, setState] = useState<SystemStatus>({
    systemOpen: null,
    closedUntil: null,
    closureTitle: null,
    closureMessage: null,
    closureImageUrl: null,
    closureMode: null,
  });

  useEffect(() => {
    const checkSystem = async () => {
      const { data } = await supabase.from('system_settings').select('*').limit(1).maybeSingle();
      if (data) {
        const d = data as any;
        setState({
          systemOpen: d.is_system_open ?? true,
          closedUntil: d.closed_until ?? null,
          closureTitle: d.closure_title ?? null,
          closureMessage: d.closure_message ?? null,
          closureImageUrl: d.closure_image_url ?? null,
          closureMode: d.closure_mode ?? 'maintenance',
        });
      } else {
        setState((s) => ({ ...s, systemOpen: true }));
      }
    };
    checkSystem();
    const interval = setInterval(checkSystem, 15000);
    return () => clearInterval(interval);
  }, []);

  return state;
};
