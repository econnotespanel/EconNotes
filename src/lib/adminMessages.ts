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
