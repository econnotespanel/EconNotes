import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { isBirthdayUnlimitedActive } from '@/lib/birthdayPerk';
import { getWheelBonusQuota, isWheelUnlimitedActive } from '@/lib/mondayWheel';
import { getTriviaUnlimitedUntil, isTriviaUnlimitedActive } from '@/lib/dailyTrivia';

export interface DownloadQuota {
  approved_uploads: number;
  total_downloads: number;
  allowed_downloads: number;
  remaining: number;
  can_download: boolean;
  is_admin: boolean;
  is_birthday_unlimited?: boolean;
  is_wheel_unlimited?: boolean;
  is_trivia_unlimited?: boolean;
  trivia_unlimited_until?: number;
  wheel_bonus_quota?: number;
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
    const wheelUnlimited = isWheelUnlimitedActive(user);
    const triviaUnlimited = isTriviaUnlimitedActive(user, profile as { trivia_unlimited_until?: string | null } | null);
    const triviaUntil = getTriviaUnlimitedUntil(user, profile as { trivia_unlimited_until?: string | null } | null);
    const wheelBonus = getWheelBonusQuota(user);

    const { data, error } = await supabase.rpc('get_download_quota', { _user_id: user.id });
    if (!error && data && data.length > 0) {
      const nextQuota = data[0] as DownloadQuota;
      const baseAllowed = Math.max(0, nextQuota.allowed_downloads);
      const totalAllowed = baseAllowed + wheelBonus;
      const normalized: DownloadQuota = {
        ...nextQuota,
        allowed_downloads: totalAllowed,
        is_birthday_unlimited: birthdayUnlimited,
        is_wheel_unlimited: wheelUnlimited,
        is_trivia_unlimited: triviaUnlimited,
        trivia_unlimited_until: triviaUnlimited ? triviaUntil : 0,
        wheel_bonus_quota: wheelBonus,
      };
      normalized.remaining = Math.max(totalAllowed - normalized.total_downloads, 0);
      normalized.can_download =
        normalized.is_admin ||
        birthdayUnlimited ||
        wheelUnlimited ||
        triviaUnlimited ||
        normalized.total_downloads < totalAllowed;
      setQuota(normalized);
    } else if (birthdayUnlimited || wheelUnlimited || triviaUnlimited) {
      setQuota({
        approved_uploads: 0,
        total_downloads: 0,
        allowed_downloads: 999,
        remaining: 999,
        can_download: true,
        is_admin: false,
        is_birthday_unlimited: birthdayUnlimited,
        is_wheel_unlimited: wheelUnlimited,
        is_trivia_unlimited: triviaUnlimited,
        trivia_unlimited_until: triviaUnlimited ? triviaUntil : 0,
        wheel_bonus_quota: wheelBonus,
      });
    }
    setLoading(false);
  }, [user, profile]);

  useEffect(() => {
    refresh();
    window.addEventListener('econnotes:birthdate-updated', refresh);
    window.addEventListener('econnotes:wheel-updated', refresh);
    window.addEventListener('econnotes:trivia-updated', refresh);
    return () => {
      window.removeEventListener('econnotes:birthdate-updated', refresh);
      window.removeEventListener('econnotes:wheel-updated', refresh);
      window.removeEventListener('econnotes:trivia-updated', refresh);
    };
  }, [refresh]);

  // Real-time auto-expiry timer: restore normal quota the exact moment the 2-hour trivia pass expires
  useEffect(() => {
    const until = quota?.trivia_unlimited_until || 0;
    if (!until) return;
    const msLeft = until - Date.now();
    if (msLeft <= 0) {
      void refresh();
      return;
    }
    const timer = window.setTimeout(() => {
      void refresh();
    }, Math.min(msLeft + 300, 2_147_000_000));
    return () => window.clearTimeout(timer);
  }, [quota?.trivia_unlimited_until, refresh]);

  return { quota, loading, refresh };
};
