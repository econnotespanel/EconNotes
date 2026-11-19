import { supabase } from '@/integrations/supabase/client';
import { parseSupportMessage } from '@/lib/support';

export type AdminMessageRow = {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  is_read: boolean;
  created_at: string;
};

/**
 * Returns the target Support conversation `ticketId` ONLY for unread official
 * `[econnotes-support-v1]` messages sent by a verified administrator (either an
 * admin-initiated Support conversation or an admin reply to an existing ticket).
 * Personal chats in `Mesajlar` never carry `[econnotes-support-v1]` and always return `null`.
 */
export function getAdminMessageTarget(
  row: AdminMessageRow,
  userId: string,
  adminIds: string[],
): string | null {
  if (
    row.is_read ||
    row.receiver_id !== userId ||
    row.sender_id === userId ||
    !adminIds.includes(row.sender_id)
  ) {
    return null;
  }
  const payload = parseSupportMessage(row.content);
  if (!payload) return null;
  if (payload.kind === 'ticket') {
    return payload.initiatedBy === 'admin' ? payload.ticketId : null;
  }
  if (payload.kind === 'reply') {
    return payload.ticketId;
  }
  return null;
}

export async function verifyMessageAdmins(ids: string[]): Promise<string[]> {
  const uniqueIds = [...new Set(ids)].filter(Boolean);
  if (uniqueIds.length === 0) return [];
  const results = await Promise.all(
    uniqueIds.map(async (id) => {
      const { data, error } = await supabase.rpc('is_admin', { _user_id: id });
      if (error) throw error;
      return data === true ? id : null;
    }),
  );
  return results.filter((id): id is string => id !== null);
}

const SEEN_ADMIN_NOTICE_PREFIX = 'econnotes_seen_admin_notice_ids_v1_';
const MAX_STORED_NOTICE_IDS = 300;

export function getSeenAdminNoticeIds(userId: string): Set<string> {
  if (!userId || typeof window === 'undefined') return new Set();
  try {
    const raw = window.localStorage.getItem(`${SEEN_ADMIN_NOTICE_PREFIX}${userId}`);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((item): item is string => typeof item === 'string' && item.length > 0));
  } catch {
    return new Set();
  }
}

export function markAdminNoticeIdsSeen(userId: string, messageIds: string[]): void {
  if (!userId || messageIds.length === 0 || typeof window === 'undefined') return;
  try {
    const existing = Array.from(getSeenAdminNoticeIds(userId));
    const merged = Array.from(new Set([...existing, ...messageIds.filter(Boolean)]));
    const trimmed = merged.slice(-MAX_STORED_NOTICE_IDS);
    window.localStorage.setItem(`${SEEN_ADMIN_NOTICE_PREFIX}${userId}`, JSON.stringify(trimmed));
  } catch {
    // Ignore storage quota/privacy-mode errors
  }
}

export function extractDeletedSupportTicketIds(rows: Pick<AdminMessageRow, 'content'>[]): Set<string> {
  const deleted = new Set<string>();
  for (const row of rows) {
    const payload = parseSupportMessage(row.content);
    if (payload?.kind === 'deleted' && payload.ticketId) {
      deleted.add(payload.ticketId);
    }
  }
  return deleted;
}
