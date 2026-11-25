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
  is_birthday_unlimited?: boolean;
  is_wheel_unlimited?: boolean;
  is_trivia_unlimited?: boolean;
  trivia_unlimited_until?: number;
  wheel_bonus_quota?: number;
}

/**
 * Strictly derives download quota & active perks from server-authoritative sources
 * (`get_download_quota` RPC + `profiles` table columns). Never trusts `localStorage`
 * or client-writable `user_metadata`, and fails CLOSED when the quota RPC errors.
 */
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

    const p = profile as {
      birth_date?: string | null;
      wheel_bonus_quota?: number | null;
      wheel_unlimited_until?: string | null;
      trivia_unlimited_until?: string | null;
    } | null;

    const nowMs = Date.now();
    const triviaUntilMs = p?.trivia_unlimited_until ? Date.parse(p.trivia_unlimited_until) : 0;
    const wheelUntilMs = p?.wheel_unlimited_until ? Date.parse(p.wheel_unlimited_until) : 0;
    const triviaUnlimited = Number.isFinite(triviaUntilMs) && triviaUntilMs > nowMs;
    const wheelUnlimited = Number.isFinite(wheelUntilMs) && wheelUntilMs > nowMs;
    const wheelBonus = Math.max(0, Number(p?.wheel_bonus_quota || 0));

    let birthdayUnlimited = false;
    if (p?.birth_date && /^\d{4}-\d{2}-\d{2}/.test(p.birth_date)) {
      try {
        const parts = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'Europe/Istanbul',
          month: '2-digit',
          day: '2-digit',
        }).formatToParts(new Date());
        const m = parts.find((x) => x.type === 'month')?.value;
        const d = parts.find((x) => x.type === 'day')?.value;
        if (m && d && p.birth_date.slice(5, 10) === `${m}-${d}`) {
          birthdayUnlimited = true;
        }
      } catch {
        birthdayUnlimited = false;
      }
    }

    const { data, error } = await supabase.rpc('get_download_quota', { _user_id: user.id });
    if (!error && Array.isArray(data) && data.length > 0) {
      const row = data[0] as Record<string, unknown>;
      const isAdmin = Boolean(row.is_admin);
      const totalDownloads = Math.max(0, Number(row.total_downloads ?? 0));
      const allowed = Math.max(0, Number(row.total_quota ?? row.allowed_downloads ?? 0));
      const remaining = Math.max(0, Number(row.remaining ?? Math.max(allowed - totalDownloads, 0)));
      const normalized: DownloadQuota = {
        approved_uploads: Math.max(0, Number(row.approved_uploads ?? 0)),
        total_downloads: totalDownloads,
        allowed_downloads: allowed,
        remaining,
        is_admin: isAdmin,
        is_birthday_unlimited: birthdayUnlimited,
        is_wheel_unlimited: wheelUnlimited,
        is_trivia_unlimited: triviaUnlimited,
        trivia_unlimited_until: triviaUnlimited ? triviaUntilMs : 0,
        wheel_bonus_quota: wheelBonus,
        can_download: isAdmin || remaining > 0 || birthdayUnlimited || wheelUnlimited || triviaUnlimited,
      };
      setQuota(normalized);
    } else {
      // Fail CLOSED on quota RPC error (never grant unlimited quota from client cache!)
      setQuota({
        approved_uploads: 0,
        total_downloads: 0,
        allowed_downloads: 0,
        remaining: 0,
        can_download: false,
        is_admin: false,
        is_birthday_unlimited: false,
        is_wheel_unlimited: false,
        is_trivia_unlimited: false,
        trivia_unlimited_until: 0,
        wheel_bonus_quota: 0,
      });
    }
    setLoading(false);
  }, [user, profile]);

  useEffect(() => {
    void refresh();
    window.addEventListener('econnotes:birthdate-updated', refresh);
    window.addEventListener('econnotes:wheel-updated', refresh);
    window.addEventListener('econnotes:trivia-updated', refresh);
    return () => {
      window.removeEventListener('econnotes:birthdate-updated', refresh);
      window.removeEventListener('econnotes:wheel-updated', refresh);
      window.removeEventListener('econnotes:trivia-updated', refresh);
    };
  }, [refresh]);

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
