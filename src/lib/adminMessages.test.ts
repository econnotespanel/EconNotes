import { describe, expect, it, vi } from 'vitest';
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
import { directAdminTicketId, getAdminMessageTarget, projectAdminConversations } from './adminMessages';
import { encodeSupportMessage, parseSupportMessage } from './support';

const row = { id: 'message-1', sender_id: 'admin', receiver_id: 'student', content: 'Hesabınızla ilgili bilgi', is_read: false, created_at: '2026-11-08T10:00:00Z' };

describe('administrator private messages', () => {
  it('routes an unread verified administrator message to its support conversation', () => {
    expect(getAdminMessageTarget(row, 'student', ['admin'])).toBe(directAdminTicketId('admin', 'student'));
  });
  it('does not notify for a non-administrator message', () => {
    expect(getAdminMessageTarget(row, 'student', [])).toBeNull();
  });
  it('does not notify another recipient', () => {
    expect(getAdminMessageTarget(row, 'other-student', ['admin'])).toBeNull();
  });
  it('does not repeat read messages', () => {
    expect(getAdminMessageTarget({ ...row, is_read: true }, 'student', ['admin'])).toBeNull();
  });
  it('opens the exact support ticket for an administrator reply', () => {
    expect(getAdminMessageTarget({ ...row, content: encodeSupportMessage({ version: 1, kind: 'reply', ticketId: 'existing-ticket', message: 'Yanıt' }) }, 'student', ['admin'])).toBe('existing-ticket');
  });
  it('does not show a message alert for status changes', () => {
    expect(getAdminMessageTarget({ ...row, content: encodeSupportMessage({ version: 1, kind: 'status', ticketId: 'existing-ticket', status: 'closed' }) }, 'student', ['admin'])).toBeNull();
  });
  it('automatically includes admin messages and recipient replies without changing originals', () => {
    const response = { ...row, id: 'message-2', sender_id: 'student', receiver_id: 'admin', content: 'Teşekkürler', created_at: '2026-11-08T10:01:00Z' };
    const projected = projectAdminConversations([row, response], ['admin']);
    expect(projected).toHaveLength(2);
    expect(parseSupportMessage(projected[0].content)).toMatchObject({ kind: 'ticket', ticketId: directAdminTicketId('admin', 'student'), message: row.content });
    expect(parseSupportMessage(projected[1].content)).toMatchObject({ kind: 'reply', message: 'Teşekkürler' });
    expect(row.content).toBe('Hesabınızla ilgili bilgi');
  });
  it('does not import regular user conversations', () => {
    expect(projectAdminConversations([row], [])).toEqual([]);
  });
});