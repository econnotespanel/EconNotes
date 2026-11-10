/**
 * Utility functions and constants for user registration approval workflow.
 *
 * Rule:
 * All users registered BEFORE this launch timestamp are treated as existing/legacy users
 * and are automatically approved without requiring admin intervention.
 * Users registering AFTER this timestamp require explicit administrator approval in the Waiting Room.
 */

// Launch cutoff: 2026-11-11 01:00:00 UTC+3 (2026-11-10T22:00:00.000Z)
export const WAITING_ROOM_LAUNCH_TIME = '2026-11-10T22:00:00.000Z';

const LAUNCH_TIMESTAMP = new Date(WAITING_ROOM_LAUNCH_TIME).getTime();

/**
 * Checks whether an account was created before the waiting room cutoff date.
 */
export function isLegacyUser(
  userCreatedAt?: string | null,
  profileCreatedAt?: string | null
): boolean {
  if (userCreatedAt) {
    const t = new Date(userCreatedAt).getTime();
    if (!isNaN(t) && t < LAUNCH_TIMESTAMP) {
      return true;
    }
  }

  if (profileCreatedAt) {
    const t = new Date(profileCreatedAt).getTime();
    if (!isNaN(t) && t < LAUNCH_TIMESTAMP) {
      return true;
    }
  }

  // If timestamps are unavailable but user existed without approval_status
  return false;
}

/**
 * Determines whether a user has full platform access:
 * - Administrators are always approved.
 * - Legacy (existing) accounts registered prior to the waiting room launch are automatically approved.
 * - Explicitly approved accounts ('approved') are approved.
 * - Explicitly rejected accounts ('rejected') are blocked.
 * - Newly registered accounts ('pending') after cutoff are held in the Waiting Room.
 */
export function isUserApproved(
  approvalStatus?: string | null,
  userCreatedAt?: string | null,
  profileCreatedAt?: string | null,
  isAdmin: boolean = false
): boolean {
  if (isAdmin) return true;
  if (approvalStatus === 'rejected') return false;
  if (approvalStatus === 'approved') return true;

  // Previous registered users are automatically approved
  if (isLegacyUser(userCreatedAt, profileCreatedAt)) {
    return true;
  }

  // Brand new users default to pending/not yet approved
  return false;
}
