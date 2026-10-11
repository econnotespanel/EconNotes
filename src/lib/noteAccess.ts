export const NOTE_PASSWORD_UNLOCK_DURATION_MS = 30 * 60 * 1000;

export const hasActiveNoteUnlock = (expiresAt: number | undefined, now = Date.now()) =>
  typeof expiresAt === 'number' && expiresAt > now;
