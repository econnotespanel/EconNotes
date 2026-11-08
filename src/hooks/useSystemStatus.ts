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
      window.clearTimeout(retryTimer);
      retryTimer = window.setTimeout(() => void checkSystem(), Math.min(30000, 2000 * 2 ** failures));
    };

    const markSuccess = () => {
      failures = 0;
      setBackendReachable(true);
    };

    const checkSystem = async () => {
      try {
        let rawData: any = null;

        // 1. Önce genel durum tablosunu sorgula (anonim ve tüm kullanıcılar okuyabilir)
        const primaryReq = (supabase as any).from('public_system_status').select('*').limit(1).maybeSingle();
        const primaryRes = await Promise.race([
          primaryReq,
          new Promise<{ data: null; error: Error }>((resolve) => {
            window.setTimeout(() => resolve({ data: null, error: new Error('Sistem durumu zaman aşımına uğradı.') }), 5000);
          }),
        ]);

        if (primaryRes.data) {
          rawData = primaryRes.data;
        } else if (primaryRes.error) {
          // 2. Yedek olarak system_settings tablosunu kontrol et
          const fallbackReq = (supabase as any).from('system_settings').select('*').limit(1).maybeSingle();
          const fallbackRes = await fallbackReq;
          if (fallbackRes.data) rawData = fallbackRes.data;
        }

        if (!alive) return;

        if (!rawData && primaryRes.error) {
          markFailure();
          return;
        }

        markSuccess();

        if (rawData) {
          const isSystemOpen = Boolean(rawData.is_system_open);
          setState({
            systemOpen: isSystemOpen,
            closedUntil: rawData.closed_until ?? null,
            closureTitle: rawData.closure_title ?? null,
            closureMessage: rawData.closure_message ?? null,
            closureImageUrl: rawData.closure_image_url ?? null,
            closureMode: rawData.closure_mode ?? 'maintenance',
          });
        } else {
          setState((s) => ({ ...s, systemOpen: true }));
        }
      } catch (err) {
        if (alive) markFailure();
      }
    };

    checkSystem();
    const interval = setInterval(checkSystem, 30000);

    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      channel = supabase
        .channel('public-system-status')
        .on('broadcast', { event: 'system-maintenance' }, (payload) => {
          if (payload?.payload?.is_system_open !== undefined) {
            setState((prev) => ({
              ...prev,
              systemOpen: Boolean(payload.payload.is_system_open),
            }));
          }
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

    const onVisible = () => {
      if (document.visibilityState === 'visible') checkSystem();
    };

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
