import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { isBirthdayUnlimitedActive } from '@/lib/birthdayPerk';

export interface DownloadQuota {
  approved_uploads: number;
  total_downloads: number;
  allowed_downloads: number;
  remaining: number;
  can_download: boolean;
  is_admin: boolean;
  is_birthday_unlimited?: boolean;
}

export const useDownloadQuota = () => {
  const { user, profile } = useAuth();
  const [quota, setQuota] = useState<DownloadQuota | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) {
      setQuota(null);
      setLoading(false);
      return;
    }
    const birthdayUnlimited = isBirthdayUnlimitedActive(user, profile);
    const { data, error } = await supabase.rpc('get_download_quota', { _user_id: user.id });
    if (!error && data && data.length > 0) {
      const nextQuota = data[0] as DownloadQuota;
      const normalized: DownloadQuota = {
        ...nextQuota,
        allowed_downloads: Math.max(0, nextQuota.allowed_downloads),
        is_birthday_unlimited: birthdayUnlimited,
      };
      normalized.remaining = Math.max(
        normalized.allowed_downloads - normalized.total_downloads,
        0,
      );
      normalized.can_download =
        normalized.is_admin ||
        birthdayUnlimited ||
        normalized.total_downloads < normalized.allowed_downloads;
      setQuota(normalized);
    } else if (birthdayUnlimited) {
      setQuota({
        approved_uploads: 0,
        total_downloads: 0,
        allowed_downloads: 999,
        remaining: 999,
        can_download: true,
        is_admin: false,
        is_birthday_unlimited: true,
      });
    }
    setLoading(false);
  }, [user, profile]);

  useEffect(() => {
    refresh();
    window.addEventListener('econnotes:birthdate-updated', refresh);
    return () => {
      window.removeEventListener('econnotes:birthdate-updated', refresh);
    };
  }, [refresh]);

  return { quota, loading, refresh };
};
