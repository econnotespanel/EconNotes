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

/** Reads the public system status mirror so every visitor (not only admins) sees closures. */
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
    let alive = true;
    const checkSystem = async () => {
      const { data, error } = await (supabase as any).from('public_system_status').select('*').limit(1).maybeSingle();
      if (!alive) return;
      if (error) {
        // Keep the previous known state; default to open only on very first load.
        setState((s) => (s.systemOpen === null ? { ...s, systemOpen: true } : s));
        return;
      }
      if (data) {
        setState({
          systemOpen: data.is_system_open ?? true,
          closedUntil: data.closed_until ?? null,
          closureTitle: data.closure_title ?? null,
          closureMessage: data.closure_message ?? null,
          closureImageUrl: data.closure_image_url ?? null,
          closureMode: data.closure_mode ?? 'maintenance',
        });
      } else {
        setState((s) => ({ ...s, systemOpen: true }));
      }
    };
    checkSystem();
    const interval = setInterval(checkSystem, 8000);
    const onVisible = () => { if (document.visibilityState === 'visible') checkSystem(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('econnotes:system-changed', checkSystem);
    return () => {
      alive = false;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('econnotes:system-changed', checkSystem);
    };
  }, []);

  return state;
};
