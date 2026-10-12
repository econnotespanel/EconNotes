import { describe, expect, it } from 'vitest';
import {
  encodeSupportMessage,
  getAssignedSupportAdmin,
  getSupportMessageBody,
  getSupportTicketStage,
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
  it('encodes and parses ticket and reply messages', () => {
    const ticket = {
      version: 1 as const,
      ticketId: 'ticket-1',
      kind: 'ticket' as const,
      category: 'technical' as const,
      subject: 'Not indirilemiyor',
      message: 'İndirme sırasında hata alıyorum.',
    };
    const reply = { version: 1 as const, ticketId: 'ticket-1', kind: 'reply' as const, message: 'Sorunu inceliyoruz.' };

    expect(parseSupportMessage(encodeSupportMessage(ticket))).toEqual(ticket);
    expect(parseSupportMessage(encodeSupportMessage(reply))).toEqual(reply);
    expect(getSupportMessageBody(encodeSupportMessage(reply))).toBe(reply.message);
  });

  it('rejects malformed or unsupported message payloads', () => {
    expect(parseSupportMessage('regular direct message')).toBeNull();
    expect(parseSupportMessage('[econnotes-support-v1]{broken')).toBeNull();
    expect(parseSupportMessage('[econnotes-support-v1]{"version":1,"ticketId":"x","kind":"ticket","category":"unknown","subject":"x","message":"x"}')).toBeNull();
  });

  it('assigns a user consistently to one available admin', () => {
    expect(getAssignedSupportAdmin('user-1', [])).toBeNull();
    expect(getAssignedSupportAdmin('user-1', ['admin-b', 'admin-a'])).toBe(getAssignedSupportAdmin('user-1', ['admin-a', 'admin-b']));
    expect(getAssignedSupportAdmin('user-1', ['admin-a', 'admin-b'])).toBeTruthy();
  });
});
