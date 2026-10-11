const RETURNING_ACCOUNT_KEY = 'econnotes_returning_account_v1';

interface ReturningAccount {
  emailFingerprint: string;
  firstName: string;
}

const fingerprintEmail = async (email: string): Promise<string | null> => {
  if (!globalThis.crypto?.subtle) {
    console.warn('Returning account greeting is unavailable because Web Crypto is not supported.');
    return null;
  }

  const normalizedEmail = email.trim().toLowerCase();
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalizedEmail));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
};

export const rememberReturningAccount = async (email: string, fullName: string): Promise<string | null> => {
  const firstName = fullName.trim().split(/\s+/)[0];
  if (!email.trim() || !firstName) return null;

  try {
    const emailFingerprint = await fingerprintEmail(email);
    if (!emailFingerprint) return null;

    const account: ReturningAccount = { emailFingerprint, firstName };
    localStorage.setItem(RETURNING_ACCOUNT_KEY, JSON.stringify(account));
    return firstName;
  } catch (error) {
    console.warn('Could not save the returning account greeting on this device:', error);
    return null;
  }
};

export const getReturningAccountName = async (email: string): Promise<string | null> => {
  if (!email.trim()) return null;

  try {
    const stored = localStorage.getItem(RETURNING_ACCOUNT_KEY);
    if (!stored) return null;

    const account: unknown = JSON.parse(stored);
    if (
      typeof account !== 'object'
      || account === null
      || !('emailFingerprint' in account)
      || typeof account.emailFingerprint !== 'string'
      || !('firstName' in account)
      || typeof account.firstName !== 'string'
    ) {
      localStorage.removeItem(RETURNING_ACCOUNT_KEY);
      console.warn('Removed invalid returning account greeting data from this device.');
      return null;
    }

    const emailFingerprint = await fingerprintEmail(email);
    return emailFingerprint && emailFingerprint === account.emailFingerprint ? account.firstName : null;
  } catch (error) {
    console.warn('Could not read the returning account greeting on this device:', error);
    return null;
  }
};
