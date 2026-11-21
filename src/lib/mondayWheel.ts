import type { User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { awardPoints } from '@/hooks/usePoints';

export type WheelRewardType = 'extra_quota' | 'unlimited_day' | 'xp';

export interface WheelSegment {
  id: string;
  shortLabel: string;
  fullTitle: string;
  description: string;
  type: WheelRewardType;
  amount: number;
  color: string;
  textColor: string;
}

export const MONDAY_WHEEL_SEGMENTS: WheelSegment[] = [
  {
    id: 'quota_2',
    shortLabel: '+2 Not Hakkı',
    fullTitle: '+2 Fazladan Not Görüntüleme & İndirme Hakkı',
    description: 'Hesabına anında +2 kalıcı ek ders notu görüntüleme ve indirme hakkı tanımlandı!',
    type: 'extra_quota',
    amount: 2,
    color: '#003791',
    textColor: '#ffffff',
  },
  {
    id: 'xp_100',
    shortLabel: '+100 XP',
    fullTitle: '+100 XP Puan Ödülü',
    description: '100 XP puan anında hesabına ve liderlik tablosu puanına eklendi!',
    type: 'xp',
    amount: 100,
    color: '#0284c7',
    textColor: '#ffffff',
  },
  {
    id: 'xp_200',
    shortLabel: '+200 XP',
    fullTitle: '+200 XP Puan Ödülü',
    description: '200 XP puan anında hesabına ve liderlik tablosu puanına eklendi!',
    type: 'xp',
    amount: 200,
    color: '#1e40af',
    textColor: '#ffffff',
  },
  {
    id: 'unlimited_1d',
    shortLabel: '1 Gün Sınırsız',
    fullTitle: '1 Günlük Sınırsız Not Görüntüleme, İndirme & Yükleme Hakkı',
    description: '24 saat boyunca tüm ders notlarını sınırsız görüntüleyebilir, indirebilir ve saat kısıtlaması olmadan yükleyebilirsin!',
    type: 'unlimited_day',
    amount: 24,
    color: '#0ea5e9',
    textColor: '#ffffff',
  },
  {
    id: 'xp_300',
    shortLabel: '+300 XP',
    fullTitle: '+300 XP Puan Ödülü',
    description: '300 XP puan anında hesabına ve liderlik tablosu puanına eklendi!',
    type: 'xp',
    amount: 300,
    color: '#172554',
    textColor: '#ffffff',
  },
  {
    id: 'xp_400',
    shortLabel: '+400 XP',
    fullTitle: '+400 XP Puan Ödülü',
    description: '400 XP puan anında hesabına ve liderlik tablosu puanına eklendi!',
    type: 'xp',
    amount: 400,
    color: '#2563eb',
    textColor: '#ffffff',
  },
  {
    id: 'xp_500',
    shortLabel: '+500 XP',
    fullTitle: '+500 XP Büyük Puan Ödülü',
    description: 'Tam 500 XP puan anında hesabına ve liderlik tablosu puanına eklendi!',
    type: 'xp',
    amount: 500,
    color: '#0369a1',
    textColor: '#ffffff',
  },
];

const STORAGE_SPIN_PREFIX = 'econnotes_monday_wheel_spin_';
const STORAGE_BONUS_QUOTA_PREFIX = 'econnotes_wheel_bonus_quota_';
const STORAGE_UNLIMITED_UNTIL_PREFIX = 'econnotes_wheel_unlimited_until_';

export function getTodayDateString(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Bugünün Pazartesi (getDay() === 1) olup olmadığını kontrol eder. */
export function isMondayToday(now = new Date()): boolean {
  return now.getDay() === 1;
}

/** Bir sonraki Pazartesi günü saat 00:00'a kalan süreyi okunaklı Türkçe metin olarak döndürür. */
export function getNextMondayCountdownLabel(now = new Date()): string {
  if (isMondayToday(now)) {
    const endOfMonday = new Date(now);
    endOfMonday.setHours(23, 59, 59, 999);
    const diffMs = Math.max(0, endOfMonday.getTime() - now.getTime());
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    return `Bugün Pazartesi! Çarkın kapanmasına ${hours} saat ${mins} dk kaldı`;
  }

  const dayOfWeek = now.getDay(); // 0 = Pazar, 2 = Salı ... 6 = Cumartesi
  const daysUntilMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek;
  const nextMonday = new Date(now);
  nextMonday.setDate(now.getDate() + daysUntilMonday);
  nextMonday.setHours(0, 0, 0, 0);

  const diffMs = Math.max(0, nextMonday.getTime() - now.getTime());
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

  if (days === 0) {
    return `Yeni Pazartesi çarkına ${hours} saat kaldı`;
  }
  return `Bir sonraki Pazartesi çarkına ${days} gün ${hours} saat kaldı`;
}

export interface MondayWheelState {
  isMonday: boolean;
  isAdminDailyMode: boolean;
  hasSpunToday: boolean;
  canSpinNow: boolean;
  todayRewardId: string | null;
  todayRewardTitle: string | null;
  countdownLabel: string;
  bonusQuota: number;
  isWheelUnlimitedActive: boolean;
  wheelUnlimitedRemainingLabel: string;
}

export interface MondayWheelOptions {
  isAdmin?: boolean;
}

/** Yönetici günlük çark hakkının yarın 00:00'da yenilenmesine kalan süreyi döndürür. */
export function getNextDayResetCountdownLabel(now = new Date()): string {
  const nextMidnight = new Date(now);
  nextMidnight.setDate(now.getDate() + 1);
  nextMidnight.setHours(0, 0, 0, 0);
  const diffMs = Math.max(0, nextMidnight.getTime() - now.getTime());
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  return `Yarınki yönetici çark hakkına ${hours} saat ${mins} dk kaldı`;
}

export function getWheelBonusQuota(user: User | null | undefined): number {
  if (!user) return 0;
  const fromMeta = Number((user.user_metadata as any)?.wheel_bonus_quota || 0);
  let fromLocal = 0;
  try {
    fromLocal = Number(localStorage.getItem(`${STORAGE_BONUS_QUOTA_PREFIX}${user.id}`) || 0);
  } catch {
    fromLocal = 0;
  }
  return Math.max(0, fromMeta, fromLocal);
}

export function getWheelUnlimitedUntil(user: User | null | undefined): number {
  if (!user) return 0;
  const fromMeta = Number((user.user_metadata as any)?.wheel_unlimited_until || 0);
  let fromLocal = 0;
  try {
    fromLocal = Number(localStorage.getItem(`${STORAGE_UNLIMITED_UNTIL_PREFIX}${user.id}`) || 0);
  } catch {
    fromLocal = 0;
  }
  return Math.max(0, fromMeta, fromLocal);
}

export function isWheelUnlimitedActive(user: User | null | undefined, now = new Date()): boolean {
  return getWheelUnlimitedUntil(user) > now.getTime();
}

export function getMondayWheelState(
  user: User | null | undefined,
  now = new Date(),
  options?: MondayWheelOptions,
): MondayWheelState {
  const isMonday = isMondayToday(now);
  const isAdminDailyMode = Boolean(options?.isAdmin);
  const todayStr = getTodayDateString(now);
  const baseCountdownLabel = getNextMondayCountdownLabel(now);

  if (!user) {
    return {
      isMonday,
      isAdminDailyMode,
      hasSpunToday: false,
      canSpinNow: false,
      todayRewardId: null,
      todayRewardTitle: null,
      countdownLabel: baseCountdownLabel,
      bonusQuota: 0,
      isWheelUnlimitedActive: false,
      wheelUnlimitedRemainingLabel: '',
    };
  }

  const metaSpinDate = String((user.user_metadata as any)?.monday_wheel_last_date || '');
  const metaRewardId = String((user.user_metadata as any)?.monday_wheel_last_reward || '');

  let localRecord: { date: string; rewardId: string } | null = null;
  try {
    const raw = localStorage.getItem(`${STORAGE_SPIN_PREFIX}${user.id}_${todayStr}`);
    if (raw) localRecord = JSON.parse(raw);
  } catch {
    localRecord = null;
  }

  const hasSpunToday = metaSpinDate === todayStr || localRecord?.date === todayStr;
  const todayRewardId =
    (localRecord?.date === todayStr ? localRecord.rewardId : null) ||
    (metaSpinDate === todayStr ? metaRewardId : null);
  const rewardObj = MONDAY_WHEEL_SEGMENTS.find((s) => s.id === todayRewardId) || null;

  const bonusQuota = getWheelBonusQuota(user);
  const unlimitedUntil = getWheelUnlimitedUntil(user);
  const unlimitedActive = unlimitedUntil > now.getTime();
  let wheelUnlimitedRemainingLabel = '';
  if (unlimitedActive) {
    const diffMs = unlimitedUntil - now.getTime();
    const h = Math.floor(diffMs / (1000 * 60 * 60));
    const m = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    wheelUnlimitedRemainingLabel = `${h} saat ${m} dk kaldı`;
  }

  const canSpinNow = (isMonday || isAdminDailyMode) && !hasSpunToday;
  const countdownLabel = isAdminDailyMode
    ? hasSpunToday
      ? getNextDayResetCountdownLabel(now)
      : 'Yönetici ayrıcalığı · Bugün 1 çevirme hakkın hazır!'
    : baseCountdownLabel;

  return {
    isMonday,
    isAdminDailyMode,
    hasSpunToday,
    canSpinNow,
    todayRewardId,
    todayRewardTitle: rewardObj?.fullTitle || null,
    countdownLabel,
    bonusQuota,
    isWheelUnlimitedActive: unlimitedActive,
    wheelUnlimitedRemainingLabel,
  };
}

async function getSessionAccessToken(forceRefresh = false): Promise<string | null> {
  if (forceRefresh) {
    const { data } = await supabase.auth.refreshSession().catch(() => ({ data: { session: null } }));
    return data.session?.access_token ?? null;
  }
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

/**
 * Çarktan kazanılan XP puanını (100 - 500 XP) kullanıcının toplam puan sistemine
 * (`user_points` & `point_events`) güvenli ve idempotent biçimde işler.
 * 1) Öncelikli: `claim_monday_wheel_xp` SQL RPC
 * 2) Yedek (migration beklenirken anında çalışır): `claim-wheel-xp` Edge Function
 * 3) Son yedek: `award_points` RPC
 */
export async function awardMondayWheelXp(
  amount: number,
  todayStr: string,
): Promise<{ ok: boolean; newPointsTotal: number | null; alreadyClaimed?: boolean; error?: string }> {
  // 1) Dedicated SECURITY DEFINER RPC
  try {
    const { data, error } = await (supabase as any).rpc('claim_monday_wheel_xp', {
      _amount: amount,
      _spin_date: todayStr,
    });
    if (!error && data) {
      const row = Array.isArray(data) ? data[0] : data;
      if (row && typeof row.points === 'number') {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('econnotes:points-updated'));
        }
        return {
          ok: true,
          newPointsTotal: row.points,
          alreadyClaimed: Boolean(row.already_claimed),
        };
      }
    }
  } catch {
    // Fall through to Edge Function
  }

  // 2) Live Edge Function fallback (works immediately with service_role)
  try {
    let token = await getSessionAccessToken(false);
    if (!token) token = await getSessionAccessToken(true);
    if (token) {
      let res = await supabase.functions.invoke('claim-wheel-xp', {
        body: { amount, spinDate: todayStr },
        headers: { Authorization: `Bearer ${token}` },
      });

      const status = (res.error as { context?: { status?: number } } | null)?.context?.status;
      if (res.error && status === 401) {
        const freshToken = await getSessionAccessToken(true);
        if (freshToken && freshToken !== token) {
          res = await supabase.functions.invoke('claim-wheel-xp', {
            body: { amount, spinDate: todayStr },
            headers: { Authorization: `Bearer ${freshToken}` },
          });
        }
      }

      if (!res.error && res.data && (res.data as { ok?: boolean }).ok) {
        const payload = res.data as { points?: number; already_claimed?: boolean };
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('econnotes:points-updated'));
        }
        return {
          ok: true,
          newPointsTotal: typeof payload.points === 'number' ? payload.points : null,
          alreadyClaimed: Boolean(payload.already_claimed),
        };
      }
    }
  } catch {
    // Fall through to legacy awardPoints RPC
  }

  // 3) Updated award_points RPC fallback
  const directTotal = await awardPoints(`monday_wheel:${todayStr}`, amount);
  if (directTotal !== null) {
    return { ok: true, newPointsTotal: directTotal };
  }

  return {
    ok: false,
    newPointsTotal: null,
    error: 'XP puanı toplam puan sistemine kaydedilemedi. Lütfen internet bağlantını kontrol edip tekrar dene.',
  };
}

/**
 * Kullanıcı bugün çarkı daha önce çevirip XP kazandıysa fakat eski sistem hatası nedeniyle
 * `point_events` tablosuna yansımadıysa tek seferlik olarak eksik XP'yi hesaba senkronize eder.
 */
export async function syncPendingWheelXp(
  user: User | null | undefined,
  options?: MondayWheelOptions,
): Promise<number | null> {
  if (!user) return null;
  const state = getMondayWheelState(user, new Date(), options);
  if (!state.hasSpunToday || !state.todayRewardId) return null;

  const seg = MONDAY_WHEEL_SEGMENTS.find((s) => s.id === state.todayRewardId);
  if (!seg || seg.type !== 'xp') return null;

  const todayStr = getTodayDateString(new Date());
  const syncedKey = `econnotes_wheel_xp_synced_${user.id}_${todayStr}`;
  try {
    if (localStorage.getItem(syncedKey) === '1') return null;
  } catch {
    // ignore
  }

  try {
    const { data: existingEvents } = await supabase
      .from('point_events')
      .select('id')
      .eq('user_id', user.id)
      .like('reason', `monday_wheel:${todayStr}%`)
      .limit(1);

    if (Array.isArray(existingEvents) && existingEvents.length > 0) {
      try {
        localStorage.setItem(syncedKey, '1');
      } catch {
        // ignore
      }
      return null;
    }

    const res = await awardMondayWheelXp(seg.amount, todayStr);
    if (res.ok) {
      try {
        localStorage.setItem(syncedKey, '1');
      } catch {
        // ignore
      }
      return res.alreadyClaimed ? null : seg.amount;
    }
  } catch {
    // Non-fatal background sync
  }
  return null;
}

/**
 * Normal kullanıcılar için Pazartesi günleri, yöneticiler için her gün günde 1 kez çalışır.
 * Kazanan dilimi kullanıcının hesabına anında yükler:
 * - XP ise: claim_monday_wheel_xp / claim-wheel-xp ile user_points + point_events ve liderlik sıralamasına yazar.
 * - +2 Not Hakkı ise: kullanıcının indirme/görüntüleme kotasını kalıcı olarak +2 artırır.
 * - 1 Gün Sınırsız ise: 24 saatlik sınırsız not görüntüleme, indirme ve yükleme geçişini başlatır.
 */
export async function claimMondayWheelReward(
  user: User,
  segment: WheelSegment,
  now = new Date(),
  options?: MondayWheelOptions,
): Promise<{ ok: boolean; error?: string; newPointsTotal?: number | null }> {
  const isAdmin = Boolean(options?.isAdmin);
  const state = getMondayWheelState(user, now, { isAdmin });
  if (!state.isMonday && !isAdmin) {
    return {
      ok: false,
      error: 'Şans Çarkı yalnızca Pazartesi günleri çevrilebilir. Bir sonraki Pazartesi gününü beklemelisin!',
    };
  }
  if (state.hasSpunToday) {
    return {
      ok: false,
      error: isAdmin
        ? 'Bugünkü yönetici çark hakkını zaten kullandın. Yarın tekrar çevirebilirsin!'
        : 'Bu Pazartesi çark hakkını zaten kullandın. Haftaya Pazartesi tekrar çevirebilirsin!',
    };
  }

  const todayStr = getTodayDateString(now);

  let newPointsTotal: number | null = null;

  if (segment.type === 'xp') {
    const xpRes = await awardMondayWheelXp(segment.amount, todayStr);
    if (!xpRes.ok) {
      return {
        ok: false,
        error: xpRes.error || 'XP puanı puan sistemine eklenemedi. Lütfen tekrar dene.',
      };
    }
    newPointsTotal = xpRes.newPointsTotal;
    try {
      localStorage.setItem(`econnotes_wheel_xp_synced_${user.id}_${todayStr}`, '1');
    } catch {
      // ignore
    }
  }

  try {
    localStorage.setItem(
      `${STORAGE_SPIN_PREFIX}${user.id}_${todayStr}`,
      JSON.stringify({ date: todayStr, rewardId: segment.id }),
    );
  } catch {
    // ignore
  }

  const nextMeta: Record<string, unknown> = {
    monday_wheel_last_date: todayStr,
    monday_wheel_last_reward: segment.id,
  };

  if (segment.type === 'extra_quota') {
    const nextBonus = getWheelBonusQuota(user) + segment.amount;
    nextMeta.wheel_bonus_quota = nextBonus;
    try {
      localStorage.setItem(`${STORAGE_BONUS_QUOTA_PREFIX}${user.id}`, String(nextBonus));
    } catch {
      // ignore
    }
  } else if (segment.type === 'unlimited_day') {
    const expiresAt = now.getTime() + 24 * 60 * 60 * 1000;
    nextMeta.wheel_unlimited_until = expiresAt;
    try {
      localStorage.setItem(`${STORAGE_UNLIMITED_UNTIL_PREFIX}${user.id}`, String(expiresAt));
    } catch {
      // ignore
    }
  }

  await supabase.auth.updateUser({ data: nextMeta }).catch(() => {});
  window.dispatchEvent(new CustomEvent('econnotes:wheel-updated'));
  window.dispatchEvent(new CustomEvent('econnotes:points-updated'));
  window.dispatchEvent(new CustomEvent('econnotes:birthdate-updated'));

  return { ok: true, newPointsTotal };
}
