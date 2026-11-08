import { describe, expect, it } from 'vitest';
import {
  buildSupportTickets,
  encodeSupportMessage,
  getAssignedSupportAdmin,
  getSupportMessageBody,
  getSupportTicketStage,
  isSupportMessageValid,
  isSupportSystemMessage,
  parseSupportMessage,
} from './support';

describe('support ticket progress', () => {
  it('maps active tickets to their current tracking step', () => {
    expect(getSupportTicketStage('submitted', null, null)).toBe(0);
    expect(getSupportTicketStage('reviewing', null, '2026-10-01T12:00:00Z')).toBe(1);
    expect(getSupportTicketStage('answered', '2026-10-02T12:00:00Z', '2026-10-01T12:00:00Z')).toBe(2);
  });

  it('preserves the last reached step for closed tickets', () => {
    expect(getSupportTicketStage('closed', null, null)).toBe(0);
    expect(getSupportTicketStage('closed', null, '2026-10-01T12:00:00Z')).toBe(1);
    expect(getSupportTicketStage('closed', '2026-10-02T12:00:00Z', '2026-10-01T12:00:00Z')).toBe(2);
  });

  it('moves back to the review step when a user replies after an answer', () => {
    expect(getSupportTicketStage('reviewing', '2026-10-02T12:00:00Z', '2026-10-01T12:00:00Z')).toBe(1);
  });
});

describe('support messages', () => {
  it('allows short non-empty ticket messages while rejecting whitespace-only content', () => {
    expect(isSupportMessageValid('denemeun')).toBe(true);
    expect(isSupportMessageValid('  ')).toBe(false);
    expect(isSupportMessageValid('x'.repeat(5001))).toBe(false);
  });

  it('encodes and parses user and admin-initiated ticket and reply messages', () => {
    const ticket = {
      version: 1 as const,
      ticketId: 'ticket-1',
      kind: 'ticket' as const,
      category: 'technical' as const,
      subject: 'Not indirilemiyor',
      message: 'İndirme sırasında hata alıyorum.',
    };
    const adminTicket = {
      version: 1 as const,
      ticketId: 'ticket-admin-1',
      kind: 'ticket' as const,
      initiatedBy: 'admin' as const,
      category: 'account' as const,
      subject: 'Hesap bilgilendirmesi',
      message: 'Merhaba, not paylaşımınız hakkında bilgi vermek istedik.',
    };
    const reply = { version: 1 as const, ticketId: 'ticket-1', kind: 'reply' as const, message: 'Sorunu inceliyoruz.' };

    expect(parseSupportMessage(encodeSupportMessage(ticket))).toEqual(ticket);
    expect(parseSupportMessage(encodeSupportMessage(adminTicket))).toEqual(adminTicket);
    expect(parseSupportMessage(encodeSupportMessage(reply))).toEqual(reply);
    expect(getSupportMessageBody(encodeSupportMessage(reply))).toBe(reply.message);
    const deleted = { version: 1 as const, ticketId: 'ticket-1', kind: 'deleted' as const };
    expect(parseSupportMessage(encodeSupportMessage(deleted))).toEqual(deleted);
    expect(getSupportMessageBody(encodeSupportMessage(deleted))).toBe('');
  });

  it('rejects malformed or unsupported message payloads', () => {
    expect(isSupportSystemMessage('regular direct message')).toBe(false);
    expect(isSupportSystemMessage('[econnotes-support-v1]{broken')).toBe(true);
    expect(parseSupportMessage('regular direct message')).toBeNull();
    expect(parseSupportMessage('[econnotes-support-v1]{broken')).toBeNull();
    expect(parseSupportMessage('[econnotes-support-v1]{"version":1,"ticketId":"x","kind":"ticket","category":"unknown","subject":"x","message":"x"}')).toBeNull();
    expect(parseSupportMessage('[econnotes-support-v1]{"version":1,"ticketId":"x","kind":"ticket","initiatedBy":"bot","category":"account","subject":"x","message":"x"}')).toBeNull();
  });

  it('assigns a user consistently to one available admin', () => {
    expect(getAssignedSupportAdmin('user-1', [])).toBeNull();
    expect(getAssignedSupportAdmin('user-1', ['admin-b', 'admin-a'])).toBe(getAssignedSupportAdmin('user-1', ['admin-a', 'admin-b']));
    expect(getAssignedSupportAdmin('user-1', ['admin-a', 'admin-b'])).toBeTruthy();
  });

  it('keeps personal Mesajlar chats strictly out of Destek Merkezi while supporting admin-initiated conversations', () => {
    const rows = [
      // Admin's personal friend DM in Mesajlar — must NEVER appear in Destek Merkezi
      {
        id: 'dm-1',
        sender_id: 'admin-1',
        receiver_id: 'student-1',
        content: 'Selam kanka sınav nasıldı?',
        created_at: '2026-11-08T10:00:00Z',
        is_read: false,
      },
      {
        id: 'dm-2',
        sender_id: 'student-1',
        receiver_id: 'admin-1',
        content: 'Çok iyiydi teşekkürler!',
        created_at: '2026-11-08T10:02:00Z',
        is_read: false,
      },
      // Admin initiates an official conversation via Destek Merkezi user picker
      {
        id: 'sup-1',
        sender_id: 'admin-1',
        receiver_id: 'student-1',
        content: encodeSupportMessage({
          version: 1,
          ticketId: 'conv-admin-1',
          kind: 'ticket',
          initiatedBy: 'admin',
          category: 'complaint',
          subject: 'Paylaştığınız ders notu hakkında bilgilendirme',
          message: 'Yüklediğiniz PDF dosyasında eksik sayfalar bulunuyor, güncelleyebilir misiniz?',
        }),
        created_at: '2026-11-08T11:00:00Z',
        is_read: false,
      },
    ];

    // Admin view: sees only the official support conversation, never personal DMs
    const adminTickets = buildSupportTickets(rows, true, 'admin-1');
    expect(adminTickets).toHaveLength(1);
    expect(adminTickets[0].id).toBe('conv-admin-1');
    expect(adminTickets[0].initiatedBy).toBe('admin');
    expect(adminTickets[0].adminId).toBe('admin-1');
    expect(adminTickets[0].userId).toBe('student-1');
    expect(adminTickets[0].status).toBe('submitted');
    expect(adminTickets[0].hasUnread).toBe(false);

    // Student view: sees the admin-initiated conversation in Destek Merkezi as unread
    const studentTickets = buildSupportTickets(rows, false, 'student-1', ['admin-1']);
    expect(studentTickets).toHaveLength(1);
    expect(studentTickets[0].id).toBe('conv-admin-1');
    expect(studentTickets[0].hasUnread).toBe(true);
    expect(studentTickets[0].unreadRowIds).toEqual(['sup-1']);

    // Forged admin-initiated payload from an unverified sender is ignored
    expect(buildSupportTickets(rows, false, 'student-1', [])).toEqual([]);

    // Student replies -> status becomes 'reviewing' for admin queue, then admin replies -> 'answered'
    const withReplies = [
      ...rows,
      {
        id: 'sup-2',
        sender_id: 'student-1',
        receiver_id: 'admin-1',
        content: encodeSupportMessage({
          version: 1,
          ticketId: 'conv-admin-1',
          kind: 'reply',
          message: 'Hemen tam halini yüklüyorum, teşekkür ederim.',
        }),
        created_at: '2026-11-08T11:05:00Z',
        is_read: false,
      },
    ];

    const afterStudentReply = buildSupportTickets(withReplies, true, 'admin-1');
    expect(afterStudentReply[0].status).toBe('reviewing');
    expect(afterStudentReply[0].hasUnread).toBe(true);

    const afterAdminFollowup = buildSupportTickets(
      [
        ...withReplies,
        {
          id: 'sup-3',
          sender_id: 'admin-1',
          receiver_id: 'student-1',
          content: encodeSupportMessage({
            version: 1,
            ticketId: 'conv-admin-1',
            kind: 'reply',
            message: 'Kontrol ettik, onaylandı. Başarılar!',
          }),
          created_at: '2026-11-08T11:10:00Z',
          is_read: false,
        },
      ],
      false,
      'student-1',
    );
    expect(afterAdminFollowup[0].status).toBe('answered');
    expect(afterAdminFollowup[0].replies).toHaveLength(2);
  });
});
