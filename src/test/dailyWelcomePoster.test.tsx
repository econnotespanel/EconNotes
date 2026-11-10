import { describe, it, expect } from 'vitest';
import { getDailyPosterStorageKey } from '@/components/DailyWelcomePosterModal';

describe('DailyWelcomePosterModal logic', () => {
  it('generates date-isolated storage keys for once-a-day enforcement', () => {
    const userId = 'usr_abc_123';
    const day1 = new Date('2026-11-11T09:00:00Z');
    const day2 = new Date('2026-11-12T09:00:00Z');

    const key1 = getDailyPosterStorageKey(userId, day1);
    const key2 = getDailyPosterStorageKey(userId, day2);

    expect(key1).toContain('econnotes_daily_poster_usr_abc_123_2026-11-11');
    expect(key2).toContain('econnotes_daily_poster_usr_abc_123_2026-11-12');
    expect(key1).not.toBe(key2);
  });

  it('keeps same key across multiple hours on the same day', () => {
    const userId = 'usr_xyz';
    const morning = new Date(2026, 10, 11, 8, 30);
    const evening = new Date(2026, 10, 11, 21, 45);

    expect(getDailyPosterStorageKey(userId, morning)).toBe(getDailyPosterStorageKey(userId, evening));
  });

  it('evaluates module without throwing errors', async () => {
    const mod = await import('@/components/DailyWelcomePosterModal');
    expect(mod.DailyWelcomePosterModal).toBeDefined();
  });
});
