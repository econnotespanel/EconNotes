import { describe, it, expect } from 'vitest';
import { isLegacyUser, isUserApproved, WAITING_ROOM_LAUNCH_TIME } from './approvalUtils';

describe('approvalUtils', () => {
  it('correctly identifies legacy users created before the launch cutoff', () => {
    // 1 day before
    const oldDate = '2026-11-09T10:00:00.000Z';
    expect(isLegacyUser(oldDate, null)).toBe(true);
    expect(isLegacyUser(null, oldDate)).toBe(true);

    // months before
    const veryOldDate = '2026-03-27T21:00:00.000Z';
    expect(isLegacyUser(veryOldDate, null)).toBe(true);
  });

  it('correctly identifies new users created after the launch cutoff', () => {
    // 1 hour after cutoff
    const futureDate = '2026-11-11T12:00:00.000Z';
    expect(isLegacyUser(futureDate, null)).toBe(false);
    expect(isLegacyUser(null, futureDate)).toBe(false);
  });

  it('automatically approves previous/legacy users even if approval_status is pending or missing', () => {
    const oldDate = '2026-11-09T10:00:00.000Z';

    // Pending legacy user
    expect(isUserApproved('pending', oldDate, null, false)).toBe(true);

    // Legacy user without approval_status
    expect(isUserApproved(null, oldDate, null, false)).toBe(true);
    expect(isUserApproved('', oldDate, null, false)).toBe(true);
  });

  it('requires admin approval for users registering after the cutoff', () => {
    const newDate = '2026-11-12T10:00:00.000Z';

    // Brand new pending user
    expect(isUserApproved('pending', newDate, null, false)).toBe(false);

    // Once approved by admin, becomes approved
    expect(isUserApproved('approved', newDate, null, false)).toBe(true);

    // If rejected, blocked
    expect(isUserApproved('rejected', newDate, null, false)).toBe(false);
  });

  it('always approves administrators regardless of status or date', () => {
    const newDate = '2026-11-12T10:00:00.000Z';
    expect(isUserApproved('pending', newDate, null, true)).toBe(true);
    expect(isUserApproved('rejected', newDate, null, true)).toBe(true);
  });
});
