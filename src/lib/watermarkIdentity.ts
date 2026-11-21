import type { User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

export interface WatermarkIdentity {
  userId: string;
  /** Safe display name or masked username — NEVER contains raw email, phone, or sensitive PII */
  displayLabel: string;
  /** Short anonymized account trace tag (e.g. "ID:7A3C") derived from verified auth user id */
  accountCode: string;
  /** Formatted viewing/download timestamp in Europe/Istanbul (e.g. "21.11.2026 15:24") */
  timestampLabel: string;
  /** True once confirmed via live Supabase Auth + own profile query */
  verifiedByServer: boolean;
}

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const PHONE_RE = /(?:\+?\d[\d\s().-]{7,}\d)/g;
const LONG_DIGITS_RE = /\b\d{6,}\b/g;

/**
 * Formats a clean Istanbul local date & time label (`DD.MM.YYYY HH:mm`) for dynamic watermarks.
 */
export function formatWatermarkTimestamp(now = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat('tr-TR', {
      timeZone: 'Europe/Istanbul',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(now);

    const get = (type: string) => parts.find((p) => p.type === type)?.value || '';
    const day = get('day');
    const month = get('month');
    const year = get('year');
    const hour = get('hour');
    const minute = get('minute');
    if (day && month && year && hour && minute) {
      return `${day}.${month}.${year} ${hour}:${minute}`;
    }
  } catch {
    // Fallback below
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(now.getDate())}.${pad(now.getMonth() + 1)}.${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

/**
 * Generates a short deterministic non-sensitive account trace code from user ID (e.g., "ID:4F9A").
 */
export function buildAccountTraceCode(userId?: string | null): string {
  const clean = String(userId || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  if (clean.length >= 6) {
    return `ID:${clean.slice(0, 4)}${clean.slice(-2)}`;
  }
  if (clean.length > 0) {
    return `ID:${clean.slice(0, 4)}`;
  }
  return 'ID:USER';
}

/**
 * Masks a username/handle (e.g., "kaancan99" -> "ka***99") while stripping any sensitive PII.
 */
function maskHandle(handle: string): string {
  const clean = handle.replace(/[^a-zA-Z0-9çğıöşüÇĞİÖŞÜ._-]/g, '').trim();
  if (!clean) return 'EconNotes Üyesi';
  if (clean.length <= 2) return `${clean[0]}*`;
  if (clean.length <= 4) return `${clean[0]}**${clean[clean.length - 1]}`;
  return `${clean.slice(0, 2)}***${clean.slice(-2)}`;
}

/**
 * Produces a privacy-safe display name or masked username for dynamic watermarks.
 * Strictly guarantees raw email addresses, phone numbers, and ID numbers are NEVER exposed.
 */
export function sanitizeWatermarkDisplayName(rawName?: string | null): string {
  const raw = String(rawName || '').trim();
  if (!raw) return 'EconNotes Üyesi';

  // If the input looks like an email address, mask only the local part (never expose full email/domain)
  if (raw.includes('@')) {
    const localPart = raw.split('@')[0]?.trim() || '';
    const scrubbedLocal = localPart.replace(PHONE_RE, '').replace(LONG_DIGITS_RE, '').trim();
    return scrubbedLocal ? maskHandle(scrubbedLocal) : 'EconNotes Üyesi';
  }

  // Strip embedded emails, phone numbers, and long numeric sequences (e.g. TC/student ID)
  const stripped = raw
    .replace(EMAIL_RE, '')
    .replace(PHONE_RE, '')
    .replace(LONG_DIGITS_RE, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!stripped || stripped.length < 2) {
    return 'EconNotes Üyesi';
  }

  const words = stripped.split(' ').filter((w) => w.length > 0);
  if (words.length === 1) {
    // Single-token handle/username -> mask middle characters for privacy
    const token = words[0];
    if (/[._0-9]/.test(token)) {
      return maskHandle(token);
    }
    return token.slice(0, 28);
  }

  // Multi-word full display name (e.g. "Ali Yılmaz") -> safe visible name capped cleanly
  return words.join(' ').slice(0, 36);
}

/**
 * Builds an immediate local fallback watermark identity strictly from the current signed-in user
 * while the server verification request completes. Never exposes email or phone numbers.
 */
export function buildLocalWatermarkIdentity(
  user: User | null | undefined,
  profile?: { full_name?: string | null } | null,
  now = new Date(),
): WatermarkIdentity {
  const meta = (user?.user_metadata || {}) as Record<string, unknown>;
  const candidateName =
    profile?.full_name?.trim() ||
    (typeof meta.full_name === 'string' ? meta.full_name.trim() : '') ||
    (typeof meta.name === 'string' ? meta.name.trim() : '') ||
    user?.email ||
    '';

  return {
    userId: user?.id || 'guest',
    displayLabel: sanitizeWatermarkDisplayName(candidateName),
    accountCode: buildAccountTraceCode(user?.id),
    timestampLabel: formatWatermarkTimestamp(now),
    verifiedByServer: false,
  };
}

/**
 * Resolves the signed-in user's watermark identity directly from Supabase Auth + own RLS-protected
 * profile row so watermark attribution is server-verified and isolated strictly to the logged-in account.
 */
export async function resolveServerVerifiedWatermarkIdentity(
  fallbackProfile?: { full_name?: string | null } | null,
): Promise<WatermarkIdentity | null> {
  try {
    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr || !authData?.user) {
      return null;
    }

    const verifiedUser = authData.user;
    let verifiedFullName: string | null = null;

    try {
      const { data: profileRow } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('user_id', verifiedUser.id)
        .maybeSingle();

      if (profileRow && typeof (profileRow as { full_name?: unknown }).full_name === 'string') {
        verifiedFullName = (profileRow as { full_name: string }).full_name.trim() || null;
      }
    } catch {
      // Non-fatal: fallback to verified auth user_metadata below
    }

    const meta = (verifiedUser.user_metadata || {}) as Record<string, unknown>;
    const rawCandidate =
      verifiedFullName ||
      fallbackProfile?.full_name?.trim() ||
      (typeof meta.full_name === 'string' ? meta.full_name.trim() : '') ||
      (typeof meta.name === 'string' ? meta.name.trim() : '') ||
      verifiedUser.email ||
      '';

    return {
      userId: verifiedUser.id,
      displayLabel: sanitizeWatermarkDisplayName(rawCandidate),
      accountCode: buildAccountTraceCode(verifiedUser.id),
      timestampLabel: formatWatermarkTimestamp(new Date()),
      verifiedByServer: true,
    };
  } catch {
    return null;
  }
}
