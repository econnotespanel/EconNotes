import type { User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { ONBOARDING_V2_ROLLOUT_MS } from '@/lib/onboarding';

/**
 * Unique version key for the 25.11.2026 major EconNotes platform refresh walkthrough.
 * Future major releases can bump this version (e.g. `whats_new_2027_03_01`) while
 * keeping historical per-user records intact in `user_whats_new_views`.
 */
export const WHATS_NEW_VERSION = 'whats_new_2026_11_25';

/**
 * End of 25.11.2026 in Turkey time (Europe/Istanbul, UTC+3).
 * Existing users whose previous last_login is on or before this timestamp
 * (or who registered on/before this date and never logged in yet) are eligible.
 */
export const WHATS_NEW_CUTOFF_ISO = '2026-11-25T23:59:59.999+03:00';
export const WHATS_NEW_CUTOFF_MS = Date.parse(WHATS_NEW_CUTOFF_ISO);

export const WHATS_NEW_CHANNEL_NAME = 'econnotes_whats_new_sync_v1';
export const WHATS_NEW_ELIGIBLE_EVENT = 'econnotes:whats-new-eligible';

export type WhatsNewViewStatus = 'viewed' | 'skipped' | 'completed';

export interface WhatsNewStepConfig {
  id: string;
  stepNumber: number;
  badge: string;
  title: string;
  description: string;
  bullets: string[];
  footnote?: string;
}

/**
 * All 6 steps strictly describe verified, live, active features in EconNotes.
 */
export const WHATS_NEW_STEPS: readonly WhatsNewStepConfig[] = [
  {
    id: 'dashboard',
    stepNumber: 1,
    badge: 'Ana Sayfa',
    title: 'Yenilenen Ana Sayfa',
    description:
      "EconNotes dashboard'u daha modern bir tasarıma kavuştu. Artık ana sayfandan tüm akademik akışını tek bakışta takip edebilirsin.",
    bullets: [
      'Toplam not ve XP bilgilerini,',
      'Çalışma serini ve kaydedilen materyallerini,',
      'Kaldığın yerden devam et bölümünü,',
      'Akademik Takvim bilgilerini,',
      'Haftalık çalışma istatistiklerini,',
      "Liderlik Tablosu'nu daha kolay takip edebilirsin.",
    ],
  },
  {
    id: 'navigation-mobile',
    stepNumber: 2,
    badge: 'Navigasyon & Mobil',
    title: 'Yenilenen Navigasyon ve Mobil Deneyim',
    description:
      "EconNotes'un menü sistemi ve sayfa tasarımı masaüstü ve mobilde daha akıcı bir kullanım için baştan yenilendi.",
    bullets: [
      'Daha düzenli oval menü tasarımı,',
      'Geliştirilmiş mobil navigasyon,',
      'Daha tutarlı açık ve koyu tema,',
      'iPhone ve Android uyumluluğuna yönelik arayüz iyileştirmeleri.',
    ],
  },
  {
    id: 'study-studio',
    stepNumber: 3,
    badge: 'Çalışma Stüdyosu',
    title: 'Gelişmiş Çalışma Stüdyosu',
    description: 'Ders çalışmalarında yararlanabileceğin tüm aktif araçlar tek bir çalışma alanında bir arada.',
    bullets: [
      'Ayrıntılı ders özetleri',
      'Videolu Ders',
      'Deneme Sınavı',
      'Çalışma Kartları',
      'Kavram Haritası',
      'Sınav Planı',
    ],
    footnote:
      'Desteklenen ve kullanıma hazır özellikleri yüklediğin ders materyalleriyle hemen kullanabilirsin.',
  },
  {
    id: 'daily-trivia',
    stepNumber: 4,
    badge: 'Bilgi Yarışması',
    title: 'Günlük Genel Kültür Bilgi Yarışması',
    description: 'Her gün yenilenen 15 soruluk genel kültür yarışmasına katılarak hem bilginle öne çık hem ödül kazan.',
    bullets: [
      '15 soru',
      '15 dakika',
      'Her doğru cevap için 25 XP',
      '15 sorunun tamamını doğru cevapladığında toplam 375 XP',
      'Başarı durumunda 2 saatlik sınırsız not görüntüleme ve indirme ödülü',
    ],
  },
  {
    id: 'xp-leaderboard',
    stepNumber: 5,
    badge: 'Puanlar & Sıralama',
    title: 'XP ve Liderlik Tablosu',
    description: 'Kazandığın puanları, çalışma sürekliliğini ve platformdaki sıralamanı canlı olarak takip edebilirsin.',
    bullets: [
      'XP geçmişi',
      'Kullanıcı sıralamaları',
      'Dashboard üzerinde Liderlik Tablosu',
      'Günlük ödül ve puan takibi',
    ],
  },
  {
    id: 'notes-access',
    stepNumber: 6,
    badge: 'Notlar & Erişim',
    title: 'Not Paylaşımı ve Erişim İyileştirmeleri',
    description:
      'Notların güvenli önizlenmesi, indirilmesi ve çalışma materyallerine dönüştürülmesine yönelik aktif iyileştirmeleri keşfet.',
    bullets: [
      'Dinamik filigranlı güvenli PDF, görsel ve PowerPoint not önizleme',
      'Üniversite, bölüm ve ders adına göre hızlı arama ve filtreleme',
      'İndirme ve not yükleme haklarının anlık kota takibi',
      "Paylaşılan ders notlarını Çalışma Stüdyosu'na doğrudan kaynak olarak ekleme",
    ],
  },
] as const;

export function getWhatsNewSeenKey(userId: string, version = WHATS_NEW_VERSION): string {
  return `econnotes_whats_new_seen_${version}_${userId}`;
}

export function getWhatsNewPendingSessionKey(userId: string, version = WHATS_NEW_VERSION): string {
  return `econnotes_whats_new_pending_${version}_${userId}`;
}

export function getWhatsNewTabLockKey(userId: string, version = WHATS_NEW_VERSION): string {
  return `econnotes_whats_new_lock_${version}_${userId}`;
}

function parseMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

export function getSeenVersionsFromUserAndProfile(
  user: User | null | undefined,
  profile?: { seen_whats_new_versions?: string[] | null } | null,
): string[] {
  const versions = new Set<string>();
  if (Array.isArray(profile?.seen_whats_new_versions)) {
    for (const v of profile.seen_whats_new_versions) {
      if (typeof v === 'string' && v.trim()) versions.add(v.trim());
    }
  }
  const metaVersions = (user?.user_metadata as Record<string, unknown> | undefined)
    ?.econnotes_whats_new_seen;
  if (Array.isArray(metaVersions)) {
    for (const v of metaVersions) {
      if (typeof v === 'string' && v.trim()) versions.add(v.trim());
    }
  }
  return Array.from(versions);
}

export function hasLocalWhatsNewAck(userId: string, version = WHATS_NEW_VERSION): boolean {
  if (typeof window === 'undefined' || !userId) return false;
  try {
    return window.localStorage.getItem(getWhatsNewSeenKey(userId, version)) === '1';
  } catch {
    return false;
  }
}

export function writeLocalWhatsNewAck(userId: string, version = WHATS_NEW_VERSION): void {
  if (typeof window === 'undefined' || !userId) return;
  try {
    window.localStorage.setItem(getWhatsNewSeenKey(userId, version), '1');
    window.sessionStorage.removeItem(getWhatsNewPendingSessionKey(userId, version));
  } catch {
    // Ignore storage restrictions
  }
}

export function markWhatsNewPendingForSession(userId: string, version = WHATS_NEW_VERSION): void {
  if (typeof window === 'undefined' || !userId) return;
  try {
    window.sessionStorage.setItem(getWhatsNewPendingSessionKey(userId, version), '1');
    window.dispatchEvent(
      new CustomEvent(WHATS_NEW_ELIGIBLE_EVENT, { detail: { userId, version } }),
    );
  } catch {
    // Ignore storage restrictions
  }
}

export function isWhatsNewPendingForSession(userId: string, version = WHATS_NEW_VERSION): boolean {
  if (typeof window === 'undefined' || !userId) return false;
  try {
    return window.sessionStorage.getItem(getWhatsNewPendingSessionKey(userId, version)) === '1';
  } catch {
    return false;
  }
}

export function clearWhatsNewPendingForSession(userId: string, version = WHATS_NEW_VERSION): void {
  if (typeof window === 'undefined' || !userId) return;
  try {
    window.sessionStorage.removeItem(getWhatsNewPendingSessionKey(userId, version));
  } catch {
    // Ignore storage restrictions
  }
}

export function hasUserSeenWhatsNew(
  user: User | null | undefined,
  profile?: { seen_whats_new_versions?: string[] | null } | null,
  version = WHATS_NEW_VERSION,
): boolean {
  if (!user?.id) return true;
  if (hasLocalWhatsNewAck(user.id, version)) return true;
  return getSeenVersionsFromUserAndProfile(user, profile).includes(version);
}

/**
 * Pure eligibility evaluator called BEFORE `AuthContext` overwrites `profiles.last_login`.
 * Guarantees:
 * - Eligible ONLY for existing accounts created <= cutoff whose previous `last_login` is
 *   <= cutoff OR NULL (registered earlier and never logged in).
 * - Excludes brand-new accounts (`starter_upload_quota_granted_at` set, or created after cutoff,
 *   or created on/after onboarding rollout with NULL last_login / pending welcome) so there is
 *   ZERO collision with the new-user Welcome + Guided Platform Tour system.
 * - Never eligible once seen in DB (`user_whats_new_views` / `profiles.seen_whats_new_versions`),
 *   `user_metadata`, or versioned localStorage.
 */
export function evaluateWhatsNewEligibility(params: {
  user: User | null | undefined;
  profile: {
    created_at?: string | null;
    last_login?: string | null;
    starter_upload_quota_granted_at?: string | null;
    seen_whats_new_versions?: string[] | null;
  } | null | undefined;
  serverEligibility?: {
    eligible: boolean;
    already_seen: boolean;
  } | null;
  version?: string;
  cutoffMs?: number;
}): boolean {
  const {
    user,
    profile,
    serverEligibility,
    version = WHATS_NEW_VERSION,
    cutoffMs = WHATS_NEW_CUTOFF_MS,
  } = params;

  if (!user?.id || !profile) return false;
  if (hasUserSeenWhatsNew(user, profile, version)) return false;

  // Brand-new users receiving starter upload rights or explicit pending welcome NEVER see What's New
  if (profile.starter_upload_quota_granted_at) return false;
  if (typeof window !== 'undefined') {
    try {
      if (window.localStorage.getItem('econnotes_welcome_pending') === '1') {
        return false;
      }
    } catch {
      // ignore
    }
  }

  // If the server RPC answered authoritatively, respect it strictly
  if (serverEligibility) {
    if (serverEligibility.already_seen) {
      writeLocalWhatsNewAck(user.id, version);
      return false;
    }
    return Boolean(serverEligibility.eligible);
  }

  // Fallback client calculation using pre-update profile.last_login & account created_at
  const userCreatedMs = parseMs(user.created_at);
  const profileCreatedMs = parseMs(profile.created_at);
  const accountCreatedMs =
    userCreatedMs !== null && profileCreatedMs !== null
      ? Math.min(userCreatedMs, profileCreatedMs)
      : (profileCreatedMs ?? userCreatedMs);

  if (accountCreatedMs === null || accountCreatedMs > cutoffMs) {
    return false;
  }

  const prevLoginMs = parseMs(profile.last_login);

  // If account was created on/after onboarding v2 rollout and has NEVER logged in,
  // treat as a brand-new user entering standard Welcome + Guided Platform Tour (zero collision)
  if (prevLoginMs === null && accountCreatedMs >= ONBOARDING_V2_ROLLOUT_MS) {
    return false;
  }

  if (prevLoginMs === null) {
    // Existing pre-cutoff user who registered earlier and never logged in before
    return true;
  }

  return prevLoginMs <= cutoffMs;
}

/**
 * Multi-tab lock to ensure two simultaneously opened browser tabs NEVER display
 * the What's New modal concurrently for the same user & version.
 */
export function tryAcquireWhatsNewTabLock(
  userId: string,
  tabId: string,
  version = WHATS_NEW_VERSION,
  staleMs = 20_000,
): boolean {
  if (typeof window === 'undefined' || !userId) return true;
  try {
    const key = getWhatsNewTabLockKey(userId, version);
    const raw = window.localStorage.getItem(key);
    const now = Date.now();
    if (raw) {
      const parsed = JSON.parse(raw) as { tabId?: string; ts?: number };
      if (parsed.tabId && parsed.tabId !== tabId && typeof parsed.ts === 'number' && now - parsed.ts < staleMs) {
        return false;
      }
    }
    window.localStorage.setItem(key, JSON.stringify({ tabId, ts: now }));
    return true;
  } catch {
    return true;
  }
}

export function releaseWhatsNewTabLock(
  userId: string,
  tabId: string,
  version = WHATS_NEW_VERSION,
): void {
  if (typeof window === 'undefined' || !userId) return;
  try {
    const key = getWhatsNewTabLockKey(userId, version);
    const raw = window.localStorage.getItem(key);
    if (!raw) return;
    const parsed = JSON.parse(raw) as { tabId?: string };
    if (parsed.tabId === tabId) {
      window.localStorage.removeItem(key);
    }
  } catch {
    // ignore
  }
}

export function broadcastWhatsNewSync(payload: {
  type: 'opened' | 'dismissed';
  userId: string;
  version: string;
  tabId: string;
}): void {
  if (typeof window === 'undefined') return;
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      const ch = new BroadcastChannel(WHATS_NEW_CHANNEL_NAME);
      ch.postMessage(payload);
      ch.close();
    }
  } catch {
    // BroadcastChannel unavailable in older webviews — localStorage storage event still handles sync
  }
}

/**
 * Persists the user's seen/skipped/completed status for the given What's New version
 * across:
 * 1) Versioned per-user localStorage ack (instant, multi-tab safe)
 * 2) Server-side `mark_whats_new_seen` RPC (`user_whats_new_views` + `profiles.seen_whats_new_versions`)
 * 3) Direct `user_whats_new_views` upsert fallback if RPC schema cache is lagging
 * 4) Supabase Auth `user_metadata.econnotes_whats_new_seen` mirror (guaranteed cross-device persistence)
 */
export async function persistWhatsNewSeen(
  user: User | null | undefined,
  status: WhatsNewViewStatus,
  version = WHATS_NEW_VERSION,
): Promise<void> {
  if (!user?.id) return;

  writeLocalWhatsNewAck(user.id, version);

  const existingMeta = Array.isArray(
    (user.user_metadata as Record<string, unknown> | undefined)?.econnotes_whats_new_seen,
  )
    ? ((user.user_metadata as Record<string, unknown>).econnotes_whats_new_seen as string[])
    : [];
  const nextMeta = existingMeta.includes(version) ? existingMeta : [...existingMeta, version];

  await Promise.allSettled([
    (supabase.rpc as any)('mark_whats_new_seen', {
      _version: version,
      _status: status,
    }).then(async ({ error }: { error?: unknown }) => {
      if (error) {
        // Fallback direct upsert to user_whats_new_views if RPC isn't cached yet
        await (supabase.from as any)('user_whats_new_views').upsert(
          {
            user_id: user.id,
            version,
            status,
            completed_at: status === 'viewed' ? null : new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,version' },
        );
      }
    }),
    supabase.auth.updateUser({
      data: {
        econnotes_whats_new_seen: nextMeta,
      },
    }),
  ]);
}
