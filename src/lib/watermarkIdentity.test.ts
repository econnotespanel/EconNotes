import { describe, expect, it, vi } from 'vitest';
import {
  buildAccountTraceCode,
  buildLocalWatermarkIdentity,
  formatWatermarkTimestamp,
  resolveServerVerifiedWatermarkIdentity,
  sanitizeWatermarkDisplayName,
} from '@/lib/watermarkIdentity';
import { buildDiagonalWatermarkSvgDataUri } from '@/components/DynamicWatermarkOverlay';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getUser: vi.fn(async () => ({
        data: {
          user: {
            id: 'a4f9c210-8833-4a12-90ab-1234567890ef',
            email: 'secret.student@duzce.edu.tr',
            user_metadata: { full_name: 'Ayşe Kaya' },
          },
        },
        error: null,
      })),
    },
    from: vi.fn(() => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: { full_name: 'Ayşe Kaya' },
            error: null,
          }),
        }),
      }),
    })),
  },
}));

describe('Server-Verified Dynamic Watermark Identity & Privacy', () => {
  it('scrubs emails, phone numbers, and numeric IDs from watermark labels', () => {
    expect(sanitizeWatermarkDisplayName('student.test@example.com')).not.toContain('@');
    expect(sanitizeWatermarkDisplayName('student.test@example.com')).not.toContain('example.com');
    expect(sanitizeWatermarkDisplayName('Ali 0532 123 45 67 Yılmaz')).not.toContain('0532');
    expect(sanitizeWatermarkDisplayName('Ali 0532 123 45 67 Yılmaz')).toBe('Ali Yılmaz');
    expect(sanitizeWatermarkDisplayName('12345678901')).toBe('EconNotes Üyesi');
    expect(sanitizeWatermarkDisplayName('Kaan Çolakoğulları')).toBe('Kaan Çolakoğulları');
  });

  it('produces distinct user-specific watermarks for different users viewing the same note', () => {
    const now = new Date('2026-11-21T12:30:00Z');
    const idA = buildLocalWatermarkIdentity(
      { id: '1111aaaa-0000-0000-0000-0000000000aa', email: 'ali@univ.edu.tr', user_metadata: { full_name: 'Ali Demir' } } as any,
      { full_name: 'Ali Demir' },
      now,
    );
    const idB = buildLocalWatermarkIdentity(
      { id: '9999bbbb-0000-0000-0000-0000000000bb', email: 'veli@univ.edu.tr', user_metadata: { full_name: 'Veli Aksoy' } } as any,
      { full_name: 'Veli Aksoy' },
      now,
    );

    expect(idA.displayLabel).toBe('Ali Demir');
    expect(idB.displayLabel).toBe('Veli Aksoy');
    expect(idA.accountCode).not.toBe(idB.accountCode);
    expect(idA.timestampLabel).toBe(formatWatermarkTimestamp(now));

    const svgA = buildDiagonalWatermarkSvgDataUri(idA, 'on-light');
    const svgB = buildDiagonalWatermarkSvgDataUri(idB, 'on-light');
    expect(svgA).not.toBe(svgB);
    expect(decodeURIComponent(svgA)).toContain('rotate(-28)');
    expect(decodeURIComponent(svgA)).toContain('Ali Demir');
    expect(decodeURIComponent(svgA)).not.toContain('ali@univ.edu.tr');
    expect(decodeURIComponent(svgA)).toContain(idA.timestampLabel);
  });

  it('verifies user identity via Supabase Auth + own profile without leaking email', async () => {
    const resolved = await resolveServerVerifiedWatermarkIdentity();
    expect(resolved).not.toBeNull();
    expect(resolved?.verifiedByServer).toBe(true);
    expect(resolved?.displayLabel).toBe('Ayşe Kaya');
    expect(resolved?.accountCode).toBe(buildAccountTraceCode('a4f9c210-8833-4a12-90ab-1234567890ef'));
    expect(resolved?.timestampLabel).toMatch(/^\d{2}\.\d{2}\.\d{4} \d{2}:\d{2}$/);
    expect(JSON.stringify(resolved)).not.toContain('secret.student@duzce.edu.tr');
  });
});
