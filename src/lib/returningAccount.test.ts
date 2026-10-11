import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getReturningAccountName, rememberReturningAccount } from './returningAccount';

describe('returning account greeting', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal('crypto', webcrypto);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('remembers a first name and returns it only for the same email', async () => {
    await expect(rememberReturningAccount('kaan@example.com', 'Kaan Çolakoğlu')).resolves.toBe('Kaan');

    await expect(getReturningAccountName('KAAN@example.com')).resolves.toBe('Kaan');
    await expect(getReturningAccountName('another@example.com')).resolves.toBeNull();
  });

  it('stores an email fingerprint instead of the email address', async () => {
    await rememberReturningAccount('kaan@example.com', 'Kaan Çolakoğlu');

    const stored = localStorage.getItem('econnotes_returning_account_v1');
    expect(stored).not.toContain('kaan@example.com');
    expect(JSON.parse(stored || '{}')).toMatchObject({ firstName: 'Kaan' });
  });
});
