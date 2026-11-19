import type { User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

export interface BirthdayStatus {
  birthDate: string | null;
  isBirthdayToday: boolean;
  isUnlimitedActive: boolean;
  expiresAtIso: string | null;
  remainingLabel: string;
  alreadyClaimedAnotherDateThisYear: boolean;
}

const STORAGE_BIRTHDATE_PREFIX = 'econnotes_birth_date_';
const STORAGE_PASS_PREFIX = 'econnotes_bday_pass_';
const STORAGE_CELEBRATED_PREFIX = 'econnotes_bday_celebrated_';

/**
 * 19 Kasım 2026 (00:00 TRT) tarihinden önce kayıt/giriş yapmış ve doğum tarihi
 * bilgisi eksik olan kullanıcılar doğum tarihi tamamlama bilgilendirmesi görür.
 */
export const BIRTHDATE_REQUIRED_CUTOFF_ISO = '2026-11-19T00:00:00+03:00';
export const BIRTHDATE_REQUIRED_CUTOFF_MS = Date.parse(BIRTHDATE_REQUIRED_CUTOFF_ISO);

function parseIsoTimestampMs(value: unknown): number | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

export function isRegisteredOrLoggedInBeforeCutoff(
  user: User | null | undefined,
  profile?: { created_at?: string | null; last_login?: string | null } | null,
  cutoffMs = BIRTHDATE_REQUIRED_CUTOFF_MS,
): boolean {
  if (!user) return false;
  const candidates = [
    parseIsoTimestampMs(user.created_at),
    parseIsoTimestampMs(profile?.created_at),
    parseIsoTimestampMs(user.last_sign_in_at),
    parseIsoTimestampMs(profile?.last_login),
  ].filter((ms): ms is number => ms !== null);

  if (candidates.length === 0) return false;
  return candidates.some((ms) => ms < cutoffMs);
}

export function needsBirthDateCompletion(
  user: User | null | undefined,
  profile?: { birth_date?: string | null; created_at?: string | null; last_login?: string | null } | null,
): boolean {
  if (!user) return false;
  if (getUserBirthDate(user, profile)) return false;
  return isRegisteredOrLoggedInBeforeCutoff(user, profile);
}

function getTodayMonthDay(now = new Date()): { year: number; month: number; day: number; mmdd: string } {
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const day = now.getDate();
  const mmdd = `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return { year, month, day, mmdd };
}

export function parseBirthMonthDay(birthDateStr: string | null | undefined): {
  year: number;
  month: number;
  day: number;
  mmdd: string;
} | null {
  if (!birthDateStr || typeof birthDateStr !== 'string') return null;
  const trimmed = birthDateStr.trim();
  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return {
    year,
    month,
    day,
    mmdd: `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
  };
}

export function getUserBirthDate(user: User | null | undefined, profile?: any): string | null {
  if (!user) return null;
  const fromProfile = profile?.birth_date;
  if (typeof fromProfile === 'string' && parseBirthMonthDay(fromProfile)) {
    return fromProfile.slice(0, 10);
  }
  const fromMeta = (user.user_metadata as any)?.birth_date;
  if (typeof fromMeta === 'string' && parseBirthMonthDay(fromMeta)) {
    return fromMeta.slice(0, 10);
  }
  try {
    const local = localStorage.getItem(`${STORAGE_BIRTHDATE_PREFIX}${user.id}`);
    if (local && parseBirthMonthDay(local)) {
      return local.slice(0, 10);
    }
  } catch {
    // ignore storage errors
  }
  return null;
}

export function isBirthDateToday(birthDateStr: string | null | undefined, now = new Date()): boolean {
  const parsed = parseBirthMonthDay(birthDateStr);
  if (!parsed) return false;
  const today = getTodayMonthDay(now);

  // 29 Şubat doğumlular için artık olmayan yıllarda 28 Şubat'ta kutla
  const isLeapYear = (today.year % 4 === 0 && today.year % 100 !== 0) || today.year % 400 === 0;
  if (!isLeapYear && parsed.month === 2 && parsed.day === 29) {
    return today.month === 2 && today.day === 28;
  }

  return parsed.month === today.month && parsed.day === today.day;
}

/**
 * Kullanıcının bugün doğum günü olup olmadığını ve 1 günlük (24 saatlik) sınırsız
 * not görüntüleme & indirme hakkının aktif olup olmadığını hesaplar.
 * Yılda yalnızca 1 kez (o yılki doğum gününde) aktifleşir.
 */
export function getBirthdayStatus(
  user: User | null | undefined,
  profile?: any,
  now = new Date(),
): BirthdayStatus {
  const birthDate = getUserBirthDate(user, profile);
  if (!user || !birthDate) {
    return {
      birthDate: null,
      isBirthdayToday: false,
      isUnlimitedActive: false,
      expiresAtIso: null,
      remainingLabel: '',
      alreadyClaimedAnotherDateThisYear: false,
    };
  }

  const today = getTodayMonthDay(now);
  const parsed = parseBirthMonthDay(birthDate);
  const isToday = isBirthDateToday(birthDate, now);

  // Yıl içinde başka bir tarihte doğum günü hakkı kullanılmış mı kontrol et (suistimal önleme)
  const metaClaimedYear = Number((user.user_metadata as any)?.birthday_pass_year || 0);
  const metaClaimedMmdd = String((user.user_metadata as any)?.birthday_pass_mmdd || '');
  let localPass: { year: number; mmdd: string; expiresAt: number } | null = null;
  try {
    const raw = localStorage.getItem(`${STORAGE_PASS_PREFIX}${user.id}_${today.year}`);
    if (raw) localPass = JSON.parse(raw);
  } catch {
    // ignore
  }

  const claimedMmddThisYear =
    (metaClaimedYear === today.year && metaClaimedMmdd) ||
    (localPass?.year === today.year ? localPass.mmdd : '');

  const alreadyClaimedAnotherDateThisYear = Boolean(
    claimedMmddThisYear && parsed && claimedMmddThisYear !== parsed.mmdd,
  );

  // Eğer bugün doğum günüyse ve bu yıl başka bir tarihte kullanılmadıysa 24 saatlik geçişi başlat/sürdür
  if (isToday && !alreadyClaimedAnotherDateThisYear) {
    const endOfToday = new Date(now);
    endOfToday.setHours(23, 59, 59, 999);

    let expiresAt = endOfToday.getTime();
    if (localPass && localPass.mmdd === parsed?.mmdd && localPass.expiresAt > expiresAt) {
      expiresAt = localPass.expiresAt;
    } else if (!localPass) {
      // Giriş yaptığı andan itibaren en az 24 saat (veya gün sonuna kadar, hangisi uzunsa)
      expiresAt = Math.max(endOfToday.getTime(), now.getTime() + 24 * 60 * 60 * 1000);
      try {
        localStorage.setItem(
          `${STORAGE_PASS_PREFIX}${user.id}_${today.year}`,
          JSON.stringify({
            year: today.year,
            mmdd: parsed?.mmdd || today.mmdd,
            expiresAt,
          }),
        );
      } catch {
        // ignore
      }
    }

    const diffMs = Math.max(0, expiresAt - now.getTime());
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

    return {
      birthDate,
      isBirthdayToday: true,
      isUnlimitedActive: true,
      expiresAtIso: new Date(expiresAt).toISOString(),
      remainingLabel: `${hours} saat ${minutes} dk kaldı`,
      alreadyClaimedAnotherDateThisYear: false,
    };
  }

  // Doğum günü dün başladıysa ve 24 saatlik pencere henüz dolmadıysa
  if (
    localPass &&
    parsed &&
    localPass.mmdd === parsed.mmdd &&
    localPass.expiresAt > now.getTime()
  ) {
    const diffMs = localPass.expiresAt - now.getTime();
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    return {
      birthDate,
      isBirthdayToday: isToday,
      isUnlimitedActive: true,
      expiresAtIso: new Date(localPass.expiresAt).toISOString(),
      remainingLabel: `${hours} saat ${minutes} dk kaldı`,
      alreadyClaimedAnotherDateThisYear: false,
    };
  }

  return {
    birthDate,
    isBirthdayToday: isToday,
    isUnlimitedActive: false,
    expiresAtIso: null,
    remainingLabel: '',
    alreadyClaimedAnotherDateThisYear,
  };
}

export function isBirthdayUnlimitedActive(user: User | null | undefined, profile?: any): boolean {
  return getBirthdayStatus(user, profile).isUnlimitedActive;
}

export function hasCelebratedBirthdayToday(userId: string, now = new Date()): boolean {
  const { year, mmdd } = getTodayMonthDay(now);
  try {
    return localStorage.getItem(`${STORAGE_CELEBRATED_PREFIX}${userId}_${year}_${mmdd}`) === '1';
  } catch {
    return false;
  }
}

export function markBirthdayCelebratedToday(user: User, birthDate: string, now = new Date()): void {
  const { year, mmdd } = getTodayMonthDay(now);
  const parsed = parseBirthMonthDay(birthDate);
  try {
    localStorage.setItem(`${STORAGE_CELEBRATED_PREFIX}${user.id}_${year}_${mmdd}`, '1');
  } catch {
    // ignore
  }
  // Bu yılki doğum günü hediyesinin kullanıldığını kullanıcı metadata'sına işle
  const existingYear = Number((user.user_metadata as any)?.birthday_pass_year || 0);
  if (existingYear !== year && parsed) {
    void supabase.auth
      .updateUser({
        data: {
          birth_date: birthDate,
          birthday_pass_year: year,
          birthday_pass_mmdd: parsed.mmdd,
        },
      })
      .catch(() => {});
  }
}

export async function saveUserBirthDate(
  user: User,
  birthDate: string,
): Promise<{ ok: boolean; error?: string }> {
  const parsed = parseBirthMonthDay(birthDate);
  if (!parsed) {
    return { ok: false, error: 'Lütfen geçerli bir doğum tarihi seçin.' };
  }
  if (parsed.year < 1940 || parsed.year > new Date().getFullYear() - 10) {
    return { ok: false, error: 'Lütfen geçerli bir doğum yılı girin.' };
  }

  const currentYear = new Date().getFullYear();
  const claimedYear = Number((user.user_metadata as any)?.birthday_pass_year || 0);
  const claimedMmdd = String((user.user_metadata as any)?.birthday_pass_mmdd || '');
  const existingBirthDate = getUserBirthDate(user);

  // Eğer bu yıl doğum günü hediyesini zaten kullandıysa doğum tarihini değiştirmesine izin verme
  if (
    existingBirthDate &&
    existingBirthDate !== birthDate &&
    claimedYear === currentYear &&
    claimedMmdd
  ) {
    return {
      ok: false,
      error: 'Bu yılki doğum günü sınırsız indirme hediyesi kullanıldığı için doğum tarihi yıl sonuna kadar değiştirilemez.',
    };
  }

  try {
    localStorage.setItem(`${STORAGE_BIRTHDATE_PREFIX}${user.id}`, birthDate);
  } catch {
    // ignore
  }

  const { error: authErr } = await supabase.auth.updateUser({
    data: {
      birth_date: birthDate,
    },
  });

  // Profiles tablosunda birth_date sütunu varsa oraya da senkronize et
  await supabase
    .from('profiles')
    .update({ birth_date: birthDate } as any)
    .eq('user_id', user.id)
    .then(() => {})
    .catch(() => {});

  if (authErr) {
    return { ok: false, error: authErr.message };
  }

  window.dispatchEvent(new CustomEvent('econnotes:birthdate-updated'));
  return { ok: true };
}
