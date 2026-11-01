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
const isDefaultInfrastructureClosure = (value?: string | null) => {
  if (!value) return false;
  return /infrastructure updates|altyapı güncellemeleri|temporarily unavailable|geçici olarak hizmet dışı|yakında geri döneceğiz|bakım çalışmaları/i.test(value);
};

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
    const startupFallback = window.setTimeout(() => {
      if (alive) setState((s) => s.systemOpen === null ? { ...s, systemOpen: true } : s);
    }, 3000);
    const checkSystem = async () => {
      const request = (supabase as any).from('public_system_status').select('*').limit(1).maybeSingle();
      const { data, error } = await Promise.race([
        request,
        new Promise<{ data: null; error: Error }>((resolve) => {
          window.setTimeout(() => resolve({ data: null, error: new Error('Sistem durumu zaman aşımına uğradı.') }), 3000);
        }),
      ]);
      if (!alive) return;
      if (error) {
        setState((s) => (s.systemOpen === null ? { ...s, systemOpen: true } : s));
        return;
      }
      if (data) {
        const looksLikeDefaultInfrastructureMessage =
          !data.is_system_open &&
          (isDefaultInfrastructureClosure(data.closure_title) || isDefaultInfrastructureClosure(data.closure_message));

        setState({
          systemOpen: looksLikeDefaultInfrastructureMessage ? true : (data.is_system_open ?? true),
          closedUntil: looksLikeDefaultInfrastructureMessage ? null : (data.closed_until ?? null),
          closureTitle: looksLikeDefaultInfrastructureMessage ? null : (data.closure_title ?? null),
          closureMessage: looksLikeDefaultInfrastructureMessage ? null : (data.closure_message ?? null),
          closureImageUrl: looksLikeDefaultInfrastructureMessage ? null : (data.closure_image_url ?? null),
          closureMode: looksLikeDefaultInfrastructureMessage ? null : (data.closure_mode ?? 'maintenance'),
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
      clearTimeout(startupFallback);
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('econnotes:system-changed', checkSystem);
    };
  }, []);

  return state;
};
