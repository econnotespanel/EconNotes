import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, render, act } from '@testing-library/react';
import { useDownloadQuota } from '@/hooks/useDownloadQuota';
import SupportNotificationListener from '@/components/SupportNotificationListener';
import { encodeSupportMessage } from '@/lib/support';

// Mutable auth state to test Anonymous, Regular User A, Cross-User B, and Admin roles
let mockAuthState: {
  user: { id: string; email?: string; user_metadata?: Record<string, unknown> } | null;
  profile: Record<string, unknown> | null;
  isAdmin: boolean;
  loading: boolean;
} = {
  user: null,
  profile: null,
  isAdmin: false,
  loading: false,
};

const rpcMock = vi.fn();
const verifyMessageAdminsMock = vi.fn();
let realtimeInsertCallback: ((payload: { new: Record<string, unknown> }) => Promise<void> | void) | null = null;

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => mockAuthState,
}));

vi.mock('@/lib/adminMessages', () => ({
  verifyMessageAdmins: (...args: unknown[]) => verifyMessageAdminsMock(...args),
}));

vi.mock('@/lib/deviceNotifications', () => ({
  isDeviceNotificationEnabled: () => true,
}));

vi.mock('@/integrations/supabase/client', () => ({
  SUPABASE_URL: 'https://test.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'test-anon',
  supabase: {
    rpc: (...args: unknown[]) => rpcMock(...args),
    channel: () => ({
      on: (_type: string, _filter: unknown, cb: (payload: { new: Record<string, unknown> }) => void) => {
        realtimeInsertCallback = cb;
        return {
          subscribe: () => ({}),
        };
      },
    }),
    removeChannel: vi.fn(),
  },
}));

describe('Multi-Role Runtime Security Verification (Anon / User A / Cross-User B / Admin)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    realtimeInsertCallback = null;
    mockAuthState = { user: null, profile: null, isAdmin: false, loading: false };
  });

  it('1. Anonymous user receives null quota and never calls get_download_quota RPC', async () => {
    const { result } = renderHook(() => useDownloadQuota());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.quota).toBeNull();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('2. Regular User A: useDownloadQuota FAILS CLOSED on RPC error and ignores spoofed localStorage/user_metadata', async () => {
    localStorage.setItem('econnotes_wheel_bonus_quota', '999');
    localStorage.setItem('econnotes_wheel_unlimited_until', String(Date.now() + 86_400_000));
    mockAuthState = {
      user: {
        id: 'user-a-1111-1111-1111-111111111111',
        email: 'usera@uni.edu.tr',
        user_metadata: {
          wheel_bonus_quota: 999,
          wheel_unlimited_until: Date.now() + 86_400_000,
          trivia_unlimited_until: new Date(Date.now() + 86_400_000).toISOString(),
        },
      },
      profile: {
        wheel_bonus_quota: 0,
        wheel_unlimited_until: null,
        trivia_unlimited_until: null,
        birth_date: null,
      },
      isAdmin: false,
      loading: false,
    };

    // Simulate RPC failure -> MUST fail CLOSED (can_download: false, remaining: 0)
    rpcMock.mockResolvedValueOnce({ data: null, error: new Error('network error') });
    const { result } = renderHook(() => useDownloadQuota());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.quota?.can_download).toBe(false);
    expect(result.current.quota?.remaining).toBe(0);
    expect(result.current.quota?.is_wheel_unlimited).toBe(false);
    expect(result.current.quota?.is_trivia_unlimited).toBe(false);
  });

  it('3. Regular User A with 0 remaining server quota stays blocked even when localStorage/user_metadata are tampered', async () => {
    localStorage.setItem('econnotes_wheel_bonus_quota', '50');
    mockAuthState = {
      user: {
        id: 'user-a-1111-1111-1111-111111111111',
        user_metadata: { wheel_bonus_quota: 50 },
      },
      profile: { wheel_bonus_quota: 0, wheel_unlimited_until: null, trivia_unlimited_until: null },
      isAdmin: false,
      loading: false,
    };
    rpcMock.mockResolvedValueOnce({
      data: [{ approved_uploads: 0, total_downloads: 3, total_quota: 3, remaining: 0, is_admin: false }],
      error: null,
    });

    const { result } = renderHook(() => useDownloadQuota());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.quota?.can_download).toBe(false);
    expect(result.current.quota?.remaining).toBe(0);
  });

  it('4. Admin account receives server-verified admin quota', async () => {
    mockAuthState = {
      user: { id: 'admin-9999-9999-9999-999999999999' },
      profile: { wheel_bonus_quota: 0 },
      isAdmin: true,
      loading: false,
    };
    rpcMock.mockResolvedValueOnce({
      data: [{ approved_uploads: 5, total_downloads: 10, total_quota: 999, remaining: 999, is_admin: true }],
      error: null,
    });

    const { result } = renderHook(() => useDownloadQuota());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.quota?.is_admin).toBe(true);
    expect(result.current.quota?.can_download).toBe(true);
  });

  it('5. Cross-User B spoofing: SupportNotificationListener rejects forged admin support messages from non-admin User B and accepts verified Admin', async () => {
    const showNotifSpy = vi.fn();
    const NotificationMock = vi.fn().mockImplementation((title: string, opts?: unknown) => {
      showNotifSpy(title, opts);
      return { onclick: null, close: vi.fn() };
    });
    (NotificationMock as any).permission = 'granted';
    vi.stubGlobal('Notification', NotificationMock);
    // Ensure we exercise direct Notification fallback cleanly
    const origSW = navigator.serviceWorker;
    Object.defineProperty(navigator, 'serviceWorker', { value: undefined, configurable: true });

    mockAuthState = {
      user: { id: 'user-a-victim' },
      profile: {},
      isAdmin: false,
      loading: false,
    };

    render(<SupportNotificationListener />);
    expect(realtimeInsertCallback).toBeTruthy();

    const spoofedSupportMsg = encodeSupportMessage({
      version: 1,
      kind: 'ticket',
      ticketId: 't-spoof-1',
      category: 'account',
      subject: 'Sahte Yönetici Bildirimi',
      message: 'Hesabınızı doğrulamak için tıklayın',
      initiatedBy: 'admin',
    });

    // Attacker User B is NOT verified by server-side is_admin RPC
    verifyMessageAdminsMock.mockResolvedValueOnce([]);
    await act(async () => {
      await realtimeInsertCallback?.({
        new: {
          sender_id: 'user-b-attacker',
          receiver_id: 'user-a-victim',
          content: spoofedSupportMsg,
        },
      });
    });

    expect(verifyMessageAdminsMock).toHaveBeenCalledWith(['user-b-attacker']);
    expect(showNotifSpy).not.toHaveBeenCalled();

    // Legitimate verified Admin IS returned by server-side is_admin RPC -> notification allowed
    verifyMessageAdminsMock.mockResolvedValueOnce(['real-admin-id']);
    await act(async () => {
      await realtimeInsertCallback?.({
        new: {
          sender_id: 'real-admin-id',
          receiver_id: 'user-a-victim',
          content: spoofedSupportMsg,
        },
      });
    });

    expect(showNotifSpy).toHaveBeenCalledWith(
      'EconNotes Destek Merkezi',
      expect.objectContaining({ body: 'Sahte Yönetici Bildirimi' }),
    );

    Object.defineProperty(navigator, 'serviceWorker', { value: origSW, configurable: true });
    vi.unstubAllGlobals();
  });
});
