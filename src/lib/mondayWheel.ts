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
    color: '#2563eb',
    textColor: '#ffffff',
  },
  {
    id: 'xp_100',
    shortLabel: '+100 XP',
    fullTitle: '+100 XP Puan Ödülü',
    description: '100 XP puan anında hesabına ve liderlik tablosu puanına eklendi!',
    type: 'xp',
    amount: 100,
    color: '#0891b2',
    textColor: '#ffffff',
  },
  {
    id: 'xp_200',
    shortLabel: '+200 XP',
    fullTitle: '+200 XP Puan Ödülü',
    description: '200 XP puan anında hesabına ve liderlik tablosu puanına eklendi!',
    type: 'xp',
    amount: 200,
    color: '#059669',
    textColor: '#ffffff',
  },
  {
    id: 'unlimited_1d',
    shortLabel: '1 Gün Sınırsız',
    fullTitle: '1 Günlük Sınırsız Not Görüntüleme, İndirme & Yükleme Hakkı',
    description: '24 saat boyunca tüm ders notlarını sınırsız görüntüleyebilir, indirebilir ve saat kısıtlaması olmadan yükleyebilirsin!',
    type: 'unlimited_day',
    amount: 24,
    color: '#f59e0b',
    textColor: '#0f172a',
  },
  {
    id: 'xp_300',
    shortLabel: '+300 XP',
    fullTitle: '+300 XP Puan Ödülü',
    description: '300 XP puan anında hesabına ve liderlik tablosu puanına eklendi!',
    type: 'xp',
    amount: 300,
    color: '#7c3aed',
    textColor: '#ffffff',
  },
  {
    id: 'xp_400',
    shortLabel: '+400 XP',
    fullTitle: '+400 XP Puan Ödülü',
    description: '400 XP puan anında hesabına ve liderlik tablosu puanına eklendi!',
    type: 'xp',
    amount: 400,
    color: '#db2777',
    textColor: '#ffffff',
  },
  {
    id: 'xp_500',
    shortLabel: '+500 XP',
    fullTitle: '+500 XP Büyük Puan Ödülü',
    description: 'Tam 500 XP puan anında hesabına ve liderlik tablosu puanına eklendi!',
    type: 'xp',
    amount: 500,
    color: '#e11d48',
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
  hasSpunToday: boolean;
  canSpinNow: boolean;
  todayRewardId: string | null;
  todayRewardTitle: string | null;
  countdownLabel: string;
  bonusQuota: number;
  isWheelUnlimitedActive: boolean;
  wheelUnlimitedRemainingLabel: string;
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

export function getMondayWheelState(user: User | null | undefined, now = new Date()): MondayWheelState {
  const isMonday = isMondayToday(now);
  const todayStr = getTodayDateString(now);
  const countdownLabel = getNextMondayCountdownLabel(now);

  if (!user) {
    return {
      isMonday,
      hasSpunToday: false,
      canSpinNow: false,
      todayRewardId: null,
      todayRewardTitle: null,
      countdownLabel,
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

  return {
    isMonday,
    hasSpunToday,
    canSpinNow: isMonday && !hasSpunToday,
    todayRewardId,
    todayRewardTitle: rewardObj?.fullTitle || null,
    countdownLabel,
    bonusQuota,
    isWheelUnlimitedActive: unlimitedActive,
    wheelUnlimitedRemainingLabel,
  };
}

/**
 * Yalnızca Pazartesi günleri çalışır. Kazanan dilimi kullanıcının hesabına anında yükler:
 * - XP ise: awardPoints ile puan tablosuna ve liderlik sıralamasına yazar.
 * - +2 Not Hakkı ise: kullanıcının indirme/görüntüleme kotasını kalıcı olarak +2 artırır.
 * - 1 Gün Sınırsız ise: 24 saatlik sınırsız not görüntüleme, indirme ve yükleme geçişini başlatır.
 */
export async function claimMondayWheelReward(
  user: User,
  segment: WheelSegment,
  now = new Date(),
): Promise<{ ok: boolean; error?: string; newPointsTotal?: number | null }> {
  const state = getMondayWheelState(user, now);
  if (!state.isMonday) {
    return {
      ok: false,
      error: 'Şans Çarkı yalnızca Pazartesi günleri çevrilebilir. Bir sonraki Pazartesi gününü beklemelisin!',
    };
  }
  if (state.hasSpunToday) {
    return {
      ok: false,
      error: 'Bu Pazartesi çark hakkını zaten kullandın. Haftaya Pazartesi tekrar çevirebilirsin!',
    };
  }

  const todayStr = getTodayDateString(now);

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

  let newPointsTotal: number | null = null;

  if (segment.type === 'xp') {
    newPointsTotal = await awardPoints(`monday_wheel:${todayStr}`, segment.amount);
    window.dispatchEvent(new CustomEvent('econnotes:points-updated'));
  } else if (segment.type === 'extra_quota') {
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
  window.dispatchEvent(new CustomEvent('econnotes:birthdate-updated'));

  return { ok: true, newPointsTotal };
}
