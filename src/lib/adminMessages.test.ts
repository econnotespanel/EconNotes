import { describe, expect, it, vi } from 'vitest';
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
import { getAdminMessageTarget } from './adminMessages';
import { encodeSupportMessage } from './support';

const baseRow = {
  id: 'message-1',
  sender_id: 'admin',
  receiver_id: 'student',
  content: 'Selam, kişisel Mesajlar sohbeti',
  is_read: false,
  created_at: '2026-11-08T10:00:00Z',
};

describe('administrator support message routing', () => {
  it('never routes personal Mesajlar chats into Destek Merkezi', () => {
    expect(getAdminMessageTarget(baseRow, 'student', ['admin'])).toBeNull();
  });

  it('routes an unread admin-initiated Support conversation to its exact ticket', () => {
    const adminSupportRow = {
      ...baseRow,
      content: encodeSupportMessage({
        version: 1,
        kind: 'ticket',
        initiatedBy: 'admin',
        ticketId: 'admin-conv-1',
        category: 'account',
        subject: 'Hesabınızla ilgili bilgilendirme',
        message: 'Merhaba, hesabınızla ilgili bir konuyu paylaşmak istedik.',
      }),
    };
    expect(getAdminMessageTarget(adminSupportRow, 'student', ['admin'])).toBe('admin-conv-1');
  });

  it('does not notify when sender is not a verified administrator', () => {
    const forgedRow = {
      ...baseRow,
      sender_id: 'regular-user',
      content: encodeSupportMessage({
        version: 1,
        kind: 'ticket',
        initiatedBy: 'admin',
        ticketId: 'forged-1',
        category: 'account',
        subject: 'Sahte',
        message: 'Test',
      }),
    };
    expect(getAdminMessageTarget(forgedRow, 'student', ['admin'])).toBeNull();
  });

  it('does not notify another recipient or already-read messages', () => {
    const adminSupportRow = {
      ...baseRow,
      content: encodeSupportMessage({
        version: 1,
        kind: 'ticket',
        initiatedBy: 'admin',
        ticketId: 'admin-conv-2',
        category: 'account',
        subject: 'Bilgi',
        message: 'Mesaj',
      }),
    };
    expect(getAdminMessageTarget(adminSupportRow, 'other-student', ['admin'])).toBeNull();
    expect(getAdminMessageTarget({ ...adminSupportRow, is_read: true }, 'student', ['admin'])).toBeNull();
  });

  it('opens the exact support ticket for an administrator reply', () => {
    expect(
      getAdminMessageTarget(
        {
          ...baseRow,
          content: encodeSupportMessage({
            version: 1,
            kind: 'reply',
            ticketId: 'existing-ticket',
            message: 'Yanıt',
          }),
        },
        'student',
        ['admin'],
      ),
    ).toBe('existing-ticket');
  });

  it('does not show a message alert for status changes', () => {
    expect(
      getAdminMessageTarget(
        {
          ...baseRow,
          content: encodeSupportMessage({
            version: 1,
            kind: 'status',
            ticketId: 'existing-ticket',
            status: 'closed',
          }),
        },
        'student',
        ['admin'],
      ),
    ).toBeNull();
  });
});
