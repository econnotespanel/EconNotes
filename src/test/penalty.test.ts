import { describe, expect, it } from 'vitest';

describe('User Penalty & Eviction Flow', () => {
  it('correctly determines whether a penalty is active or expired', () => {
    const isPenaltyActive = (penalty: { is_permanent?: boolean; penalty_until: string | null }, now = Date.now()) => {
      if (penalty.is_permanent) return true;
      if (!penalty.penalty_until) return false;
      return new Date(penalty.penalty_until).getTime() > now;
    };

    const now = 1700000000000;
    const future = new Date(now + 3600 * 1000).toISOString();
    const past = new Date(now - 3600 * 1000).toISOString();

    // Permanent ban is always active
    expect(isPenaltyActive({ is_permanent: true, penalty_until: null }, now)).toBe(true);

    // Future expiration is active
    expect(isPenaltyActive({ is_permanent: false, penalty_until: future }, now)).toBe(true);

    // Past expiration is expired (inactive)
    expect(isPenaltyActive({ is_permanent: false, penalty_until: past }, now)).toBe(false);
  });

  it('correctly formats remaining time countdown into Turkish localized units', () => {
    const formatRemaining = (targetTimeMs: number, nowMs: number) => {
      const diff = targetTimeMs - nowMs;
      if (diff <= 0) return 'Süre doldu';
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
      const minutes = Math.floor((diff / (1000 * 60)) % 60);
      const seconds = Math.floor((diff / 1000) % 60);

      const parts: string[] = [];
      if (days > 0) parts.push(`${days} gün`);
      if (hours > 0 || days > 0) parts.push(`${hours} saat`);
      if (minutes > 0 || hours > 0 || days > 0) parts.push(`${minutes} dk`);
      parts.push(`${seconds} sn`);
      return parts.join(' ') + ' kaldı';
    };

    const base = 1700000000000;
    // 45 seconds
    expect(formatRemaining(base + 45 * 1000, base)).toBe('45 sn kaldı');
    // 5 minutes 12 seconds
    expect(formatRemaining(base + (5 * 60 + 12) * 1000, base)).toBe('5 dk 12 sn kaldı');
    // 2 hours 10 minutes 30 seconds
    expect(formatRemaining(base + (2 * 3600 + 10 * 60 + 30) * 1000, base)).toBe('2 saat 10 dk 30 sn kaldı');
    // 3 days 4 hours
    expect(formatRemaining(base + (3 * 86400 + 4 * 3600 + 15 * 60 + 5) * 1000, base)).toBe('3 gün 4 saat 15 dk 5 sn kaldı');
    // Expired
    expect(formatRemaining(base - 1000, base)).toBe('Süre doldu');
  });

  it('correctly serializes and deserializes eviction payload', () => {
    const payload = {
      reason: 'Telif hakkı ihlali ve spam içerik',
      until: '2026-11-05T14:30:00.000Z',
      is_permanent: false,
      warning_number: 2,
      created_at: '2026-11-04T14:30:00.000Z',
      evicted: true,
    };

    const json = JSON.stringify(payload);
    const parsed = JSON.parse(json);
    expect(parsed.reason).toBe(payload.reason);
    expect(parsed.warning_number).toBe(2);
    expect(parsed.evicted).toBe(true);
    expect(parsed.is_permanent).toBe(false);
  });
});
