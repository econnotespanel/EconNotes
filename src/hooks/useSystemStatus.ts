import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface SystemStatus {
  systemOpen: boolean | null;
  closedUntil: string | null;
  closureTitle: string | null;
  closureMessage: string | null;
  closureImageUrl: string | null;
  closureMode: string | null;
  /** False after repeated failed reads: the backend is unreachable or overloaded. */
  backendReachable: boolean;
  retryNow: () => void;
}

/** Reads the public system status mirror so every visitor (not only admins) sees closures. */
const isDefaultInfrastructureClosure = (value?: string | null) => {
  if (!value) return false;
  return /infrastructure updates|altyapı güncellemeleri|temporarily unavailable|geçici olarak hizmet dışı|yakında geri döneceğiz|bakım çalışmaları/i.test(value);
};

export const useSystemStatus = (): SystemStatus => {
  const [backendReachable, setBackendReachable] = useState(true);
  const [retryTick, setRetryTick] = useState(0);
  const [state, setState] = useState<Omit<SystemStatus, 'backendReachable' | 'retryNow'>>({
    systemOpen: true,
    closedUntil: null,
    closureTitle: null,
    closureMessage: null,
    closureImageUrl: null,
    closureMode: null,
  });

  useEffect(() => {
    let alive = true;
    let failures = 0;
    let retryTimer: number | undefined;
    const markFailure = () => {
      failures += 1;
      if (failures >= 2) setBackendReachable(false);
      // Exponential backoff retry: 4s, 8s, 16s ... capped at 30s.
      window.clearTimeout(retryTimer);
      retryTimer = window.setTimeout(() => void checkSystem(), Math.min(30000, 2000 * 2 ** failures));
    };
    const markSuccess = () => { failures = 0; setBackendReachable(true); };
    const checkSystem = async () => {
      try {
        const request = (supabase as any).from('public_system_status').select('*').limit(1).maybeSingle();
        const { data, error } = await Promise.race([
          request,
          new Promise<{ data: null; error: Error }>((resolve) => {
            window.setTimeout(() => resolve({ data: null, error: new Error('Sistem durumu zaman aşımına uğradı.') }), 6000);
          }),
        ]);
        if (!alive) return;
        if (error) {
          markFailure();
          return;
        }
        markSuccess();
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
      } catch (err) {
        if (alive) markFailure();
      }
    };
    checkSystem();
    const interval = setInterval(checkSystem, 60000);
    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      channel = supabase
        .channel('public-system-status')
        .on('broadcast', { event: 'system-maintenance' }, () => {
          window.dispatchEvent(new Event('econnotes:system-changed'));
          void checkSystem();
        })
        .subscribe((status) => {
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.warn('Sistem bakım yayını kullanılamıyor; periyodik kontrol sürdürülecek.');
          }
        });
    } catch (error) {
      console.warn('Sistem bakım yayını başlatılamadı; periyodik kontrol sürdürülecek.', error);
    }
    const onVisible = () => { if (document.visibilityState === 'visible') checkSystem(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('econnotes:system-changed', checkSystem);
    return () => {
      alive = false;
      window.clearTimeout(retryTimer);
      clearInterval(interval);
      if (channel) void supabase.removeChannel(channel);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('econnotes:system-changed', checkSystem);
    };
  }, [retryTick]);

  return { ...state, backendReachable, retryNow: () => setRetryTick((t) => t + 1) };
};
