import { supabase } from '@/integrations/supabase/client';
import { encodeSupportMessage, parseSupportMessage } from '@/lib/support';

export type AdminMessageRow = { id: string; sender_id: string; receiver_id: string; content: string; is_read: boolean; created_at: string };

export const directAdminTicketId = (adminId: string, userId: string) => `admin-${adminId}-${userId}`;

export function getAdminMessageTarget(row: AdminMessageRow, userId: string, adminIds: string[]) {
  if (row.is_read || row.receiver_id !== userId || row.sender_id === userId || !adminIds.includes(row.sender_id)) return null;
  const payload = parseSupportMessage(row.content);
  if (payload && payload.kind !== 'reply' && payload.kind !== 'ticket') return null;
  return payload?.ticketId ?? directAdminTicketId(row.sender_id, userId);
}

// A read-only projection; original private messages are never rewritten.
export function projectAdminConversations<T extends AdminMessageRow>(rows: T[], adminIds: string[]): T[] {
  const result = rows.filter((row) => parseSupportMessage(row.content));
  const started = new Set<string>();
  for (const row of [...rows].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    if (parseSupportMessage(row.content)) continue;
    const fromAdmin = adminIds.includes(row.sender_id);
    const adminId = fromAdmin ? row.sender_id : row.receiver_id;
    const userId = fromAdmin ? row.receiver_id : row.sender_id;
    if (!adminIds.includes(adminId) || adminIds.includes(userId) || userId === adminId) continue;
    const ticketId = directAdminTicketId(adminId, userId);
    if (!started.has(ticketId)) {
      if (!fromAdmin) continue;
      started.add(ticketId);
      result.push({ ...row, sender_id: userId, receiver_id: adminId, content: encodeSupportMessage({
        version: 1, kind: 'ticket', ticketId, category: 'account', subject: 'Yönetici mesajı', message: row.content,
      }) });
    } else {
      result.push({ ...row, content: encodeSupportMessage({ version: 1, kind: 'reply', ticketId, message: row.content }) });
    }
  }
  return result;
}

export async function verifyMessageAdmins(ids: string[]): Promise<string[]> {
  const results = await Promise.all([...new Set(ids)].map(async (id) => {
    const { data, error } = await supabase.rpc('is_admin', { _user_id: id });
    if (error) throw error;
    return data === true ? id : null;
  }));
  return results.filter((id): id is string => id !== null);
}