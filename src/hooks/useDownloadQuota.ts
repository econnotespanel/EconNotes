import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface DownloadQuota {
  approved_uploads: number;
  total_downloads: number;
  allowed_downloads: number;
  remaining: number;
  can_download: boolean;
  is_admin: boolean;
}

export const useDownloadQuota = () => {
  const { user } = useAuth();
  const [quota, setQuota] = useState<DownloadQuota | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) {
      setQuota(null);
      setLoading(false);
      return;
    }
    const { data, error } = await supabase.rpc('get_download_quota', { _user_id: user.id });
    if (!error && data && data.length > 0) {
      const nextQuota = data[0] as DownloadQuota;
      const normalized = {
        ...nextQuota,
        allowed_downloads: Math.max(0, nextQuota.allowed_downloads),
      };
      normalized.remaining = Math.max(normalized.allowed_downloads - normalized.total_downloads, 0);
      normalized.can_download = normalized.is_admin || normalized.total_downloads < normalized.allowed_downloads;
      setQuota(normalized);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { quota, loading, refresh };
};
