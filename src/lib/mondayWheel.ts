import type { User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

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

/**
 * Exact EconNotes Lucky Wheel reward pool & probabilities (unchanged):
 * quota_2: 18%, xp_100: 22%, xp_200: 20%, unlimited_1d: 10%, xp_300: 14%, xp_400: 10%, xp_500: 6%
 */
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
    description:
      '24 saat boyunca tüm ders notlarını sınırsız görüntüleyebilir, indirebilir ve saat kısıtlaması olmadan yükleyebilirsin!',
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
const STORAGE_INFLIGHT_LOCK_PREFIX = 'econnotes_wheel_inflight_lock_';
const TAB_LOCK_TTL_MS = 15_000;

export interface WheelSpinRecord {
  id: string;
  transactionId: string;
  dailyPeriod: string;
  segmentId: string;
  rewardType: WheelRewardType;
  rewardAmount: number;
  xpAwarded: number;
  xpCredited: boolean;
  pointsAfter: number | null;
  quotaBonusAdded: number;
  unlimitedExpiresAt: string | null;
  createdAt: string;
}

export interface ServerWheelStatus {
  serverNowIso: string;
  dailyPeriod: string;
  isMonday: boolean;
  isAdminDailyMode: boolean;
  hasSpunToday: boolean;
  canSpinNow: boolean;
  nextResetAtIso: string;
  userPoints: number;
  wheelBonusQuota: number;
  wheelUnlimitedUntil: string | null;
  spin: WheelSpinRecord | null;
}

export interface ExecuteWheelSpinResult {
  ok: boolean;
  alreadySpun?: boolean;
  idempotentReplay?: boolean;
  segment?: WheelSegment;
  spin?: WheelSpinRecord;
  newPointsTotal?: number | null;
  wheelBonusQuota?: number;
  wheelUnlimitedUntil?: string | null;
  serverNowIso?: string;
  nextResetAtIso?: string;
  error?: string;
}

/**
 * Canonical Europe/Istanbul (UTC+03:00) calendar date & weekday info — independent from device timezone.
 */
export function getIstanbulWheelDateParts(now = new Date()): {
  dateStr: string;
  isMonday: boolean;
  isoDow: number;
  nextDayResetMs: number;
  nextMondayResetMs: number;
} {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);

  const y = Number(parts.find((p) => p.type === 'year')?.value ?? now.getUTCFullYear());
  const m = Number(parts.find((p) => p.type === 'month')?.value ?? now.getUTCMonth() + 1);
  const d = Number(parts.find((p) => p.type === 'day')?.value ?? now.getUTCDate());
  const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Istanbul',
    weekday: 'short',
  }).format(now);
  const dowMap: Record<string, number> = {
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
    Sun: 7,
  };
  const isoDow = dowMap[weekday] ?? 1;
  const isMonday = isoDow === 1;
  const daysToMonday = isMonday ? 7 : 8 - isoDow;

  // Permanent UTC+03:00 in Europe/Istanbul
  const nextDayResetMs = Date.UTC(y, m - 1, d + 1, 0, 0, 0) - 3 * 60 * 60 * 1000;
  const nextMondayResetMs = Date.UTC(y, m - 1, d + daysToMonday, 0, 0, 0) - 3 * 60 * 60 * 1000;

  return { dateStr, isMonday, isoDow, nextDayResetMs, nextMondayResetMs };
}

export function getTodayDateString(now = new Date()): string {
  return getIstanbulWheelDateParts(now).dateStr;
}

export function isMondayToday(now = new Date()): boolean {
  return getIstanbulWheelDateParts(now).isMonday;
}

export function getNextMondayCountdownLabel(now = new Date()): string {
  const info = getIstanbulWheelDateParts(now);
  if (info.isMonday) {
    const diffMs = Math.max(0, info.nextDayResetMs - now.getTime());
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    return `Bugün Pazartesi! Çarkın kapanmasına ${hours} saat ${mins} dk kaldı`;
  }

  const diffMs = Math.max(0, info.nextMondayResetMs - now.getTime());
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

  if (days === 0) {
    return `Yeni Pazartesi çarkına ${hours} saat kaldı`;
  }
  return `Bir sonraki Pazartesi çarkına ${days} gün ${hours} saat kaldı`;
}

export function getNextDayResetCountdownLabel(now = new Date()): string {
  const info = getIstanbulWheelDateParts(now);
  const diffMs = Math.max(0, info.nextDayResetMs - now.getTime());
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  return `Yarınki yönetici çark hakkına ${hours} saat ${mins} dk kaldı`;
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
  dailyPeriod: string;
  transactionId?: string | null;
}

export interface MondayWheelOptions {
  isAdmin?: boolean;
  profile?: { wheel_bonus_quota?: number | null; wheel_unlimited_until?: string | null } | null;
  serverStatus?: ServerWheelStatus | null;
}

function parseTimestampMs(val: unknown): number {
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  if (typeof val === 'string' && val.trim()) {
    const num = Number(val);
    if (Number.isFinite(num) && num > 1_000_000_000_000) return num;
    const ms = Date.parse(val);
    if (Number.isFinite(ms)) return ms;
  }
  return 0;
}

export function getWheelBonusQuota(
  user: User | null | undefined,
  profile?: { wheel_bonus_quota?: number | null } | null,
): number {
  if (!user) return 0;
  const fromProfile = Number(profile?.wheel_bonus_quota || 0);
  const fromMeta = Number((user.user_metadata as Record<string, unknown> | undefined)?.wheel_bonus_quota || 0);
  let fromLocal = 0;
  try {
    fromLocal = Number(localStorage.getItem(`${STORAGE_BONUS_QUOTA_PREFIX}${user.id}`) || 0);
  } catch {
    fromLocal = 0;
  }
  return Math.max(0, fromProfile, fromMeta, fromLocal);
}

export function getWheelUnlimitedUntil(
  user: User | null | undefined,
  profile?: { wheel_unlimited_until?: string | null } | null,
): number {
  if (!user) return 0;
  const fromProfile = parseTimestampMs(profile?.wheel_unlimited_until);
  const fromMeta = parseTimestampMs((user.user_metadata as Record<string, unknown> | undefined)?.wheel_unlimited_until);
  let fromLocal = 0;
  try {
    fromLocal = parseTimestampMs(localStorage.getItem(`${STORAGE_UNLIMITED_UNTIL_PREFIX}${user.id}`));
  } catch {
    fromLocal = 0;
  }
  return Math.max(0, fromProfile, fromMeta, fromLocal);
}

export function isWheelUnlimitedActive(
  user: User | null | undefined,
  now = new Date(),
  profile?: { wheel_unlimited_until?: string | null } | null,
): boolean {
  return getWheelUnlimitedUntil(user, profile) > now.getTime();
}

export function getMondayWheelState(
  user: User | null | undefined,
  now = new Date(),
  options?: MondayWheelOptions,
): MondayWheelState {
  const srv = options?.serverStatus;
  const info = getIstanbulWheelDateParts(now);
  const isMonday = srv ? srv.isMonday : info.isMonday;
  const isAdminDailyMode = srv ? srv.isAdminDailyMode : Boolean(options?.isAdmin);
  const todayStr = srv ? srv.dailyPeriod : info.dateStr;
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
      dailyPeriod: todayStr,
      transactionId: null,
    };
  }

  const metaSpinDate = String((user.user_metadata as Record<string, unknown> | undefined)?.monday_wheel_last_date || '');
  const metaRewardId = String((user.user_metadata as Record<string, unknown> | undefined)?.monday_wheel_last_reward || '');

  let localRecord: { date: string; rewardId: string; transactionId?: string } | null = null;
  try {
    const raw = localStorage.getItem(`${STORAGE_SPIN_PREFIX}${user.id}_${todayStr}`);
    if (raw) localRecord = JSON.parse(raw);
  } catch {
    localRecord = null;
  }

  const hasSpunToday = srv
    ? Boolean(srv.hasSpunToday)
    : metaSpinDate === todayStr || localRecord?.date === todayStr;

  const todayRewardId = srv
    ? srv.spin?.segmentId ?? null
    : (localRecord?.date === todayStr ? localRecord.rewardId : null) ||
      (metaSpinDate === todayStr ? metaRewardId : null);

  const rewardObj = MONDAY_WHEEL_SEGMENTS.find((s) => s.id === todayRewardId) || null;
  const bonusQuota = Math.max(
    srv?.wheelBonusQuota ?? 0,
    getWheelBonusQuota(user, options?.profile),
  );
  const unlimitedUntil = Math.max(
    parseTimestampMs(srv?.wheelUnlimitedUntil),
    getWheelUnlimitedUntil(user, options?.profile),
  );
  const unlimitedActive = unlimitedUntil > now.getTime();
  let wheelUnlimitedRemainingLabel = '';
  if (unlimitedActive) {
    const diffMs = unlimitedUntil - now.getTime();
    const h = Math.floor(diffMs / (1000 * 60 * 60));
    const m = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    wheelUnlimitedRemainingLabel = `${h} saat ${m} dk kaldı`;
  }

  const canSpinNow = srv ? Boolean(srv.canSpinNow) : (isMonday || isAdminDailyMode) && !hasSpunToday;
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
    dailyPeriod: todayStr,
    transactionId: srv?.spin?.transactionId ?? localRecord?.transactionId ?? null,
  };
}

function mirrorServerWheelOutcomeLocally(
  userId: string,
  dailyPeriod: string,
  spin: WheelSpinRecord | null,
  wheelBonusQuota?: number,
  wheelUnlimitedUntil?: string | null,
): void {
  try {
    if (spin) {
      localStorage.setItem(
        `${STORAGE_SPIN_PREFIX}${userId}_${dailyPeriod}`,
        JSON.stringify({
          date: dailyPeriod,
          rewardId: spin.segmentId,
          transactionId: spin.transactionId,
        }),
      );
    }
    if (typeof wheelBonusQuota === 'number' && wheelBonusQuota > 0) {
      localStorage.setItem(`${STORAGE_BONUS_QUOTA_PREFIX}${userId}`, String(wheelBonusQuota));
    }
    if (wheelUnlimitedUntil) {
      const ms = parseTimestampMs(wheelUnlimitedUntil);
      if (ms > Date.now()) {
        localStorage.setItem(`${STORAGE_UNLIMITED_UNTIL_PREFIX}${userId}`, String(ms));
      }
    }
  } catch {
    // ignore storage errors
  }
}

async function getSessionAccessToken(forceRefresh = false): Promise<string | null> {
  if (forceRefresh) {
    const { data } = await supabase.auth.refreshSession().catch(() => ({ data: { session: null } }));
    return data.session?.access_token ?? null;
  }
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

// Module-level deduplication maps so concurrent tabs / StrictMode / rapid re-renders NEVER double-fire
const inFlightSpinByKey = new Map<string, Promise<ExecuteWheelSpinResult>>();
const inFlightSyncUsers = new Set<string>();

export function resetWheelClientLocks(): void {
  inFlightSpinByKey.clear();
  inFlightSyncUsers.clear();
}

function acquireCrossTabSpinLock(userId: string, dailyPeriod: string, requestId: string): boolean {
  const key = `${STORAGE_INFLIGHT_LOCK_PREFIX}${userId}_${dailyPeriod}`;
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw) as { requestId?: string; expiresAt?: number };
      if (parsed.expiresAt && parsed.expiresAt > Date.now() && parsed.requestId !== requestId) {
        return false;
      }
    }
    localStorage.setItem(key, JSON.stringify({ requestId, expiresAt: Date.now() + TAB_LOCK_TTL_MS }));
    return true;
  } catch {
    return true;
  }
}

function releaseCrossTabSpinLock(userId: string, dailyPeriod: string, requestId: string): void {
  const key = `${STORAGE_INFLIGHT_LOCK_PREFIX}${userId}_${dailyPeriod}`;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return;
    const parsed = JSON.parse(raw) as { requestId?: string };
    if (parsed.requestId === requestId) {
      localStorage.removeItem(key);
    }
  } catch {
    // ignore
  }
}

function parseServerStatusPayload(raw: Record<string, unknown>): ServerWheelStatus | null {
  if (!raw || typeof raw !== 'object') return null;
  if (typeof raw.dailyPeriod !== 'string') return null;
  const spinRaw = raw.spin && typeof raw.spin === 'object' ? (raw.spin as Record<string, unknown>) : null;
  const spin: WheelSpinRecord | null = spinRaw
    ? {
        id: String(spinRaw.id || ''),
        transactionId: String(spinRaw.transactionId || ''),
        dailyPeriod: String(spinRaw.dailyPeriod || raw.dailyPeriod),
        segmentId: String(spinRaw.segmentId || ''),
        rewardType: (spinRaw.rewardType as WheelRewardType) || 'xp',
        rewardAmount: Number(spinRaw.rewardAmount || 0),
        xpAwarded: Number(spinRaw.xpAwarded || 0),
        xpCredited: Boolean(spinRaw.xpCredited),
        pointsAfter: typeof spinRaw.pointsAfter === 'number' ? spinRaw.pointsAfter : null,
        quotaBonusAdded: Number(spinRaw.quotaBonusAdded || 0),
        unlimitedExpiresAt:
          typeof spinRaw.unlimitedExpiresAt === 'string' ? spinRaw.unlimitedExpiresAt : null,
        createdAt: String(spinRaw.createdAt || new Date().toISOString()),
      }
    : null;

  return {
    serverNowIso: String(raw.serverNowIso || new Date().toISOString()),
    dailyPeriod: String(raw.dailyPeriod),
    isMonday: Boolean(raw.isMonday),
    isAdminDailyMode: Boolean(raw.isAdminDailyMode),
    hasSpunToday: Boolean(raw.hasSpunToday),
    canSpinNow: Boolean(raw.canSpinNow),
    nextResetAtIso: String(raw.nextResetAtIso || new Date().toISOString()),
    userPoints: Number(raw.userPoints ?? 0),
    wheelBonusQuota: Number(raw.wheelBonusQuota ?? 0),
    wheelUnlimitedUntil:
      typeof raw.wheelUnlimitedUntil === 'string' ? raw.wheelUnlimitedUntil : null,
    spin,
  };
}

/**
 * Fetches server-authoritative Lucky Wheel status using Istanbul server time.
 * Strictly read-only — NEVER spins the wheel or triggers animations!
 */
export async function fetchLuckyWheelStatus(
  user: User | null | undefined,
  options?: { isAdmin?: boolean },
): Promise<ServerWheelStatus | null> {
  if (!user) return null;

  // 1) Primary: dedicated PostgreSQL SECURITY DEFINER RPC
  try {
    const { data, error } = await (supabase as any).rpc('get_lucky_wheel_status');
    if (!error && data && typeof data === 'object') {
      const parsed = parseServerStatusPayload(data as Record<string, unknown>);
      if (parsed) {
        mirrorServerWheelOutcomeLocally(
          user.id,
          parsed.dailyPeriod,
          parsed.spin,
          parsed.wheelBonusQuota,
          parsed.wheelUnlimitedUntil,
        );
        return parsed;
      }
    }
  } catch {
    // Fall through to Edge Function
  }

  // 2) Secondary: claim-wheel-xp Edge Function (`action: 'status'`)
  try {
    const token = (await getSessionAccessToken(false)) || (await getSessionAccessToken(true));
    if (token) {
      const res = await supabase.functions.invoke('claim-wheel-xp', {
        body: { action: 'status' },
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.error && res.data && typeof res.data === 'object') {
        const parsed = parseServerStatusPayload(res.data as Record<string, unknown>);
        if (parsed) {
          mirrorServerWheelOutcomeLocally(
            user.id,
            parsed.dailyPeriod,
            parsed.spin,
            parsed.wheelBonusQuota,
            parsed.wheelUnlimitedUntil,
          );
          return parsed;
        }
      }
    }
  } catch {
    // Fall through to DB table read
  }

  // 3) Read-only DB check on point_events for today's Istanbul date
  try {
    const info = getIstanbulWheelDateParts(new Date());
    const [ptsRes, evRes] = await Promise.all([
      supabase.from('user_points').select('points').eq('user_id', user.id).maybeSingle(),
      supabase
        .from('point_events')
        .select('id, amount, created_at')
        .eq('user_id', user.id)
        .eq('reason', `monday_wheel:${info.dateStr}`)
        .limit(1)
        .maybeSingle(),
    ]);
    const userPoints = Number((ptsRes.data as { points?: number } | null)?.points ?? 0);
    const localState = getMondayWheelState(user, new Date(), { isAdmin: options?.isAdmin });
    const hasDbEvent = Boolean(evRes.data);
    const segId = evRes.data?.amount
      ? `xp_${evRes.data.amount}`
      : localState.todayRewardId;
    const seg = MONDAY_WHEEL_SEGMENTS.find((s) => s.id === segId) || null;
    const hasSpun = hasDbEvent || localState.hasSpunToday;

    return {
      serverNowIso: new Date().toISOString(),
      dailyPeriod: info.dateStr,
      isMonday: info.isMonday,
      isAdminDailyMode: Boolean(options?.isAdmin),
      hasSpunToday: hasSpun,
      canSpinNow: (info.isMonday || Boolean(options?.isAdmin)) && !hasSpun,
      nextResetAtIso: new Date(
        options?.isAdmin ? info.nextDayResetMs : info.nextMondayResetMs,
      ).toISOString(),
      userPoints,
      wheelBonusQuota: localState.bonusQuota,
      wheelUnlimitedUntil: localState.isWheelUnlimitedActive
        ? new Date(getWheelUnlimitedUntil(user)).toISOString()
        : null,
      spin:
        hasSpun && seg
          ? {
              id: `db-${info.dateStr}`,
              transactionId: `wheel:${user.id}:${info.dateStr}`,
              dailyPeriod: info.dateStr,
              segmentId: seg.id,
              rewardType: seg.type,
              rewardAmount: seg.amount,
              xpAwarded: seg.type === 'xp' ? seg.amount : 0,
              xpCredited: hasDbEvent || seg.type !== 'xp',
              pointsAfter: userPoints,
              quotaBonusAdded: seg.type === 'extra_quota' ? seg.amount : 0,
              unlimitedExpiresAt:
                seg.type === 'unlimited_day' && localState.isWheelUnlimitedActive
                  ? new Date(getWheelUnlimitedUntil(user)).toISOString()
                  : null,
              createdAt: (evRes.data as { created_at?: string } | null)?.created_at ?? new Date().toISOString(),
            }
          : null,
    };
  } catch {
    return null;
  }
}

/**
 * Server-authoritative, single-transaction atomic Lucky Wheel spin.
 * - Uses clientRequestId for idempotent retry (never produces a second reward).
 * - Deduplicates concurrent in-tab and cross-tab spin attempts.
 * - Server determines the winning segment using the exact original odds and commits XP/quota/unlimited
 *   atomically BEFORE the client plays the visual wheel landing animation.
 */
export async function executeLuckyWheelSpin(
  user: User,
  clientRequestId: string,
  options?: { isAdmin?: boolean },
): Promise<ExecuteWheelSpinResult> {
  const dailyPeriod = getTodayDateString(new Date());
  const lockKey = `${user.id}:${dailyPeriod}`;

  // If a spin call is already in flight in this tab, return the exact same promise (zero duplicate requests)
  const existingPromise = inFlightSpinByKey.get(lockKey);
  if (existingPromise) {
    return existingPromise;
  }

  if (!acquireCrossTabSpinLock(user.id, dailyPeriod, clientRequestId)) {
    return {
      ok: false,
      error: 'Başka bir sekmede çark çevirme işlemi devam ediyor. Lütfen birkaç saniye bekle.',
    };
  }

  const task = (async (): Promise<ExecuteWheelSpinResult> => {
    try {
      let rawResult: Record<string, unknown> | null = null;
      let rpcErrorMsg: string | null = null;

      // 1) Primary path: atomic PostgreSQL RPC `spin_lucky_wheel`
      try {
        const { data, error } = await (supabase as any).rpc('spin_lucky_wheel', {
          _client_request_id: clientRequestId,
        });
        if (!error && data && typeof data === 'object' && (data as { ok?: boolean }).ok) {
          rawResult = data as Record<string, unknown>;
        } else if (error) {
          const msg = String(error.message || '');
          const isMissingFn =
            error.code === 'PGRST202' ||
            msg.includes('spin_lucky_wheel') ||
            msg.includes('schema cache');
          if (!isMissingFn) {
            rpcErrorMsg = msg;
          }
        }
      } catch (err) {
        console.warn('spin_lucky_wheel RPC fallback:', err);
      }

      // If the RPC explicitly rejected eligibility (e.g. not Monday), return that exact error immediately
      if (!rawResult && rpcErrorMsg) {
        return { ok: false, error: rpcErrorMsg };
      }

      // 2) Secondary path: Edge Function `claim-wheel-xp` with `{ action: 'spin', clientRequestId }`
      if (!rawResult) {
        try {
          let token = await getSessionAccessToken(false);
          if (!token) token = await getSessionAccessToken(true);
          if (token) {
            let res = await supabase.functions.invoke('claim-wheel-xp', {
              body: { action: 'spin', clientRequestId },
              headers: { Authorization: `Bearer ${token}` },
            });
            const status = (res.error as { context?: { status?: number } } | null)?.context?.status;
            if (res.error && status === 401) {
              const freshToken = await getSessionAccessToken(true);
              if (freshToken && freshToken !== token) {
                res = await supabase.functions.invoke('claim-wheel-xp', {
                  body: { action: 'spin', clientRequestId },
                  headers: { Authorization: `Bearer ${freshToken}` },
                });
              }
            }
            if (!res.error && res.data && typeof res.data === 'object' && (res.data as { ok?: boolean }).ok) {
              rawResult = res.data as Record<string, unknown>;
            } else if (res.data && typeof (res.data as { error?: unknown }).error === 'string') {
              return { ok: false, error: String((res.data as { error: string }).error) };
            } else if (res.error) {
              const errCtx = (res.error as { context?: { status?: number; json?: () => Promise<unknown> } } | null)?.context;
              const errStatus = errCtx?.status;
              if (errStatus && errStatus !== 404 && typeof errCtx?.json === 'function') {
                try {
                  const errBody = (await errCtx.json()) as { error?: unknown } | null;
                  if (errBody && typeof errBody.error === 'string' && errBody.error.trim()) {
                    return { ok: false, error: errBody.error.trim() };
                  }
                } catch {
                  // Fall through to standard unreachable error
                }
              }
            }
          }
        } catch (err) {
          console.warn('claim-wheel-xp spin fallback error:', err);
        }
      }

      if (!rawResult) {
        return {
          ok: false,
          error:
            'Şans Çarkı sunucu ödül servisine ulaşılamadı. Ödül kaybı yaşanmaması için işlem durduruldu; lütfen kısa süre sonra tekrar dene.',
        };
      }

      const spinRaw = rawResult.spin as Record<string, unknown> | undefined;
      if (!spinRaw || typeof spinRaw.segmentId !== 'string') {
        return { ok: false, error: 'Sunucudan geçersiz çark sonucu döndü.' };
      }

      const segment = MONDAY_WHEEL_SEGMENTS.find((s) => s.id === spinRaw.segmentId);
      if (!segment) {
        return { ok: false, error: 'Tanımlı olmayan ödül dilimi döndü.' };
      }

      const spin: WheelSpinRecord = {
        id: String(spinRaw.id || clientRequestId),
        transactionId: String(spinRaw.transactionId || `wheel:${user.id}:${dailyPeriod}`),
        dailyPeriod: String(spinRaw.dailyPeriod || rawResult.dailyPeriod || dailyPeriod),
        segmentId: segment.id,
        rewardType: (spinRaw.rewardType as WheelRewardType) || segment.type,
        rewardAmount: Number(spinRaw.rewardAmount || segment.amount),
        xpAwarded: Number(spinRaw.xpAwarded ?? (segment.type === 'xp' ? segment.amount : 0)),
        xpCredited: Boolean(spinRaw.xpCredited ?? segment.type !== 'xp'),
        pointsAfter:
          typeof rawResult.newPointsTotal === 'number'
            ? rawResult.newPointsTotal
            : typeof spinRaw.pointsAfter === 'number'
              ? spinRaw.pointsAfter
              : null,
        quotaBonusAdded: Number(spinRaw.quotaBonusAdded || 0),
        unlimitedExpiresAt:
          typeof spinRaw.unlimitedExpiresAt === 'string' ? spinRaw.unlimitedExpiresAt : null,
        createdAt: String(spinRaw.createdAt || new Date().toISOString()),
      };

      const wheelBonusQuota =
        typeof rawResult.wheelBonusQuota === 'number' ? rawResult.wheelBonusQuota : undefined;
      const wheelUnlimitedUntil =
        typeof rawResult.wheelUnlimitedUntil === 'string' ? rawResult.wheelUnlimitedUntil : null;

      mirrorServerWheelOutcomeLocally(
        user.id,
        spin.dailyPeriod,
        spin,
        wheelBonusQuota,
        wheelUnlimitedUntil,
      );

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('econnotes:wheel-updated'));
        window.dispatchEvent(new CustomEvent('econnotes:points-updated'));
        window.dispatchEvent(new CustomEvent('econnotes:birthdate-updated'));
      }

      return {
        ok: true,
        alreadySpun: Boolean(rawResult.alreadySpun),
        idempotentReplay: Boolean(rawResult.idempotentReplay),
        segment,
        spin,
        newPointsTotal: spin.pointsAfter,
        wheelBonusQuota,
        wheelUnlimitedUntil,
        serverNowIso: typeof rawResult.serverNowIso === 'string' ? rawResult.serverNowIso : undefined,
        nextResetAtIso: typeof rawResult.nextResetAtIso === 'string' ? rawResult.nextResetAtIso : undefined,
      };
    } finally {
      inFlightSpinByKey.delete(lockKey);
      releaseCrossTabSpinLock(user.id, dailyPeriod, clientRequestId);
    }
  })();

  inFlightSpinByKey.set(lockKey, task);
  return task;
}

/**
 * Safe, deduplicated per-user historical XP reconciliation for verified uncredited Wheel / Trivia XP.
 * Calls the atomic `reconcile_my_missing_xp` PostgreSQL RPC (never estimates or double-credits).
 */
export async function syncPendingWheelXp(
  user: User | null | undefined,
  _options?: MondayWheelOptions,
): Promise<number | null> {
  if (!user) return null;
  if (inFlightSyncUsers.has(user.id)) return null;

  const todayStr = getTodayDateString(new Date());
  const sessionKey = `econnotes_xp_reconciled_${user.id}_${todayStr}`;
  try {
    if (sessionStorage.getItem(sessionKey) === '1') return null;
  } catch {
    // ignore
  }

  inFlightSyncUsers.add(user.id);
  try {
    // 1) Primary: atomic PostgreSQL self-reconciliation RPC
    const { data, error } = await (supabase as any).rpc('reconcile_my_missing_xp');
    if (!error && data && typeof data === 'object') {
      try {
        sessionStorage.setItem(sessionKey, '1');
      } catch {
        // ignore
      }
      const creditedXp = Number(
        (data as { creditedXp?: number; total_xp_reconciled?: number }).creditedXp ??
          (data as { total_xp_reconciled?: number }).total_xp_reconciled ??
          0,
      );
      if (creditedXp > 0 && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('econnotes:points-updated'));
        window.dispatchEvent(new CustomEvent('econnotes:wheel-updated'));
        return creditedXp;
      }
      return null;
    }

    // 2) Secondary: Edge Function reconcile action
    const token = await getSessionAccessToken(false);
    if (token) {
      const res = await supabase.functions.invoke('claim-wheel-xp', {
        body: { action: 'reconcile' },
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.error && res.data && typeof res.data === 'object') {
        try {
          sessionStorage.setItem(sessionKey, '1');
        } catch {
          // ignore
        }
        const creditedXp = Number((res.data as { creditedXp?: number }).creditedXp ?? 0);
        if (creditedXp > 0 && typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('econnotes:points-updated'));
          window.dispatchEvent(new CustomEvent('econnotes:wheel-updated'));
          return creditedXp;
        }
      }
    }
  } catch {
    // Non-fatal background check
  } finally {
    inFlightSyncUsers.delete(user.id);
  }
  return null;
}

/**
 * Legacy helper retained for API compatibility; delegates directly to the atomic `claim_monday_wheel_xp` RPC / Edge Function.
 */
export async function awardMondayWheelXp(
  amount: number,
  todayStr: string,
  transactionId?: string,
): Promise<{ ok: boolean; newPointsTotal: number | null; alreadyClaimed?: boolean; error?: string }> {
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

  try {
    const token = (await getSessionAccessToken(false)) || (await getSessionAccessToken(true));
    if (token) {
      const res = await supabase.functions.invoke('claim-wheel-xp', {
        body: { amount, spinDate: todayStr, transactionId },
        headers: { Authorization: `Bearer ${token}` },
      });
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
    // Fall through
  }

  return {
    ok: false,
    newPointsTotal: null,
    error: 'XP puanı toplam puan sistemine kaydedilemedi. Lütfen kısa süre sonra tekrar dene.',
  };
}
