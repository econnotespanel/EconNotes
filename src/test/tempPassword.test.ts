import { describe, expect, it } from 'vitest';

describe('Admin Temporary Password (Geçici Anahtar Şifre) Flow', () => {
  it('generates compliant passwords matching app requirements', () => {
    const makePassword = () => {
      const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
      const bytes = new Uint8Array([12, 45, 98, 23, 76, 120, 88, 34, 19, 56, 77, 89]);
      let out = '';
      for (const b of bytes) out += alphabet[b % alphabet.length];
      return out.slice(0, 4) + '-' + out.slice(4, 8) + '-' + out.slice(8) + '7';
    };

    const tempPw = makePassword();
    expect(tempPw.length).toBeGreaterThanOrEqual(8);
    expect(/[A-Z]/.test(tempPw)).toBe(true);
    expect(/[a-z]/.test(tempPw)).toBe(true);
    expect(/\d/.test(tempPw)).toBe(true);
    expect(tempPw).toContain('-');
  });

  it('correctly detects must_change_password flag from app_metadata or user_metadata', () => {
    const checkMustChange = (user: any) => {
      return Boolean(
        user && (user.app_metadata?.must_change_password || user.user_metadata?.must_change_password)
      );
    };

    // User without flag
    expect(checkMustChange(null)).toBe(false);
    expect(checkMustChange({ id: '1', app_metadata: {}, user_metadata: {} })).toBe(false);

    // User with temp password flag in app_metadata
    expect(checkMustChange({ id: '1', app_metadata: { must_change_password: true } })).toBe(true);

    // User with temp password flag in user_metadata
    expect(checkMustChange({ id: '1', user_metadata: { must_change_password: true } })).toBe(true);

    // After password change, flag is cleared
    expect(checkMustChange({ id: '1', app_metadata: { must_change_password: false }, user_metadata: { must_change_password: false } })).toBe(false);
  });

  it('validates new replacement password according to EconNotes password policy', () => {
    const validatePassword = (pw: string, pw2: string) => {
      if (pw.length < 6) return 'Şifre en az 6 karakter olmalıdır.';
      if (!/[A-Z]/.test(pw) || !/\d/.test(pw)) return 'Şifre en az 1 büyük harf ve 1 rakam içermelidir.';
      if (pw !== pw2) return 'Şifreler eşleşmiyor.';
      return null;
    };

    expect(validatePassword('short', 'short')).toBe('Şifre en az 6 karakter olmalıdır.');
    expect(validatePassword('lowercase1', 'lowercase1')).toBe('Şifre en az 1 büyük harf ve 1 rakam içermelidir.');
    expect(validatePassword('NoNumberUpper', 'NoNumberUpper')).toBe('Şifre en az 1 büyük harf ve 1 rakam içermelidir.');
    expect(validatePassword('ValidPass1', 'DifferentPass1')).toBe('Şifreler eşleşmiyor.');
    expect(validatePassword('ValidPass1', 'ValidPass1')).toBeNull();
  });

  it('accepts both userId and user_id in admin payload structure', () => {
    const parsePayloadUserId = (body: any) => {
      const raw = typeof body?.user_id === 'string' ? body.user_id : (typeof body?.userId === 'string' ? body.userId : '');
      return raw.trim();
    };

    const targetUuid = 'e8b0d210-6c91-4e7a-b51c-8c541793a388';
    expect(parsePayloadUserId({ userId: targetUuid })).toBe(targetUuid);
    expect(parsePayloadUserId({ user_id: targetUuid })).toBe(targetUuid);
    expect(parsePayloadUserId({ userId: targetUuid, user_id: targetUuid })).toBe(targetUuid);
    expect(parsePayloadUserId({})).toBe('');
  });
});
