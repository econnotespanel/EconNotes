import { describe, expect, it } from 'vitest';
import { hasActiveNoteUnlock } from './noteAccess';

describe('note password unlock expiry', () => {
  it('only treats a future expiry as an active unlock', () => {
    expect(hasActiveNoteUnlock(2_000, 1_000)).toBe(true);
    expect(hasActiveNoteUnlock(1_000, 1_000)).toBe(false);
    expect(hasActiveNoteUnlock(999, 1_000)).toBe(false);
    expect(hasActiveNoteUnlock(undefined, 1_000)).toBe(false);
  });
});
