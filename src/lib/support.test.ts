import { describe, expect, it } from 'vitest';
import { getSupportTicketStage } from './support';

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
