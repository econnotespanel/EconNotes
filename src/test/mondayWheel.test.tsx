import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import MondayWheelPopup, { openMondayWheelModal } from '@/components/MondayWheelPopup';
import {
  executeLuckyWheelSpin,
  getIstanbulWheelDateParts,
  MONDAY_WHEEL_SEGMENTS,
  resetWheelClientLocks,
} from '@/lib/mondayWheel';

const rpcMock = vi.fn();
const functionsInvokeMock = vi.fn();
const refreshProfileMock = vi.fn();

const mockUser = {
  id: 'user-wheel-1',
  email: 'student@econnotes.online',
  user_metadata: {},
} as any;

const mockProfile = {
  full_name: 'Test Öğrenci',
  wheel_bonus_quota: 0,
  wheel_unlimited_until: null,
};

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: mockUser,
    profile: mockProfile,
    isAdmin: true,
    loading: false,
    refreshProfile: refreshProfileMock,
  }),
}));

vi.mock('@/contexts/SiteConfigContext', () => ({
  useSiteConfig: () => ({ config: { theme: { seasonalMode: 'default' } } }),
  getSeasonalTheme: () => null,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: { access_token: 'jwt-wheel-1' } } })),
      refreshSession: vi.fn(async () => ({ data: { session: { access_token: 'jwt-wheel-2' } } })),
    },
    rpc: (...args: unknown[]) => rpcMock(...args),
    functions: {
      invoke: (...args: unknown[]) => functionsInvokeMock(...args),
    },
    from: vi.fn(() => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { points: 250 }, error: null }),
          eq: () => ({
            limit: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
            }),
          }),
        }),
      }),
    })),
  },
}));

vi.mock('@/lib/wheelSoundEngine', () => ({
  computeWheelPegEvents: () => [{ timeMs: 20, speedRatio: 1 }],
  playWheelTick: vi.fn(),
  playWheelWinSound: vi.fn(),
  startWheelSpinAudio: vi.fn(),
  stopWheelSpinAudio: vi.fn(),
  unlockWheelAudio: vi.fn(),
}));

function makeStatusRpcResponse(hasSpunToday = false, segmentId = 'xp_300', points = 250) {
  return {
    data: {
      serverNowIso: '2026-11-24T10:00:00.000Z',
      dailyPeriod: '2026-11-24',
      isMonday: false,
      isAdminDailyMode: true,
      hasSpunToday,
      canSpinNow: !hasSpunToday,
      nextResetAtIso: '2026-11-24T21:00:00.000Z',
      userPoints: points,
      wheelBonusQuota: 0,
      wheelUnlimitedUntil: null,
      spin: hasSpunToday
        ? {
            id: 'spin-row-1',
            transactionId: 'wheel:user-wheel-1:2026-11-24',
            dailyPeriod: '2026-11-24',
            segmentId,
            rewardType: 'xp',
            rewardAmount: 300,
            xpAwarded: 300,
            xpCredited: true,
            pointsAfter: points,
            quotaBonusAdded: 0,
            unlimitedExpiresAt: null,
            createdAt: '2026-11-24T10:00:00.000Z',
          }
        : null,
    },
    error: null,
  };
}

function makeSpinRpcResponse(opts: { alreadySpun?: boolean; segmentId?: string; newPointsTotal?: number } = {}) {
  const seg = MONDAY_WHEEL_SEGMENTS.find((s) => s.id === (opts.segmentId || 'xp_300'))!;
  return {
    data: {
      ok: true,
      alreadySpun: Boolean(opts.alreadySpun),
      idempotentReplay: false,
      serverNowIso: '2026-11-24T10:00:02.000Z',
      dailyPeriod: '2026-11-24',
      nextResetAtIso: '2026-11-24T21:00:00.000Z',
      newPointsTotal: opts.newPointsTotal ?? 550,
      wheelBonusQuota: 0,
      wheelUnlimitedUntil: null,
      spin: {
        id: 'spin-row-1',
        transactionId: 'wheel:user-wheel-1:2026-11-24',
        dailyPeriod: '2026-11-24',
        segmentId: seg.id,
        rewardType: seg.type,
        rewardAmount: seg.amount,
        xpAwarded: seg.type === 'xp' ? seg.amount : 0,
        xpCredited: true,
        pointsAfter: opts.newPointsTotal ?? 550,
        quotaBonusAdded: seg.type === 'extra_quota' ? seg.amount : 0,
        unlimitedExpiresAt: null,
        createdAt: '2026-11-24T10:00:02.000Z',
      },
    },
    error: null,
  };
}

describe('Lucky Wheel (Şans Çarkı) – Single-Spin Lock, StrictMode Safety, Idempotency & Atomic XP', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    resetWheelClientLocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('uses canonical Europe/Istanbul calendar dates and Monday checks independent of device timezone', () => {
    // 2026-11-23 00:30 Istanbul = 2026-11-22 21:30 UTC (Monday in Turkey, Sunday in UTC!)
    const trMondayEarly = new Date('2026-11-22T21:30:00.000Z');
    const info = getIstanbulWheelDateParts(trMondayEarly);
    expect(info.dateStr).toBe('2026-11-23');
    expect(info.isMonday).toBe(true);

    // 2026-11-24 00:05 Istanbul = 2026-11-23 21:05 UTC (Tuesday in Turkey, Monday in UTC!)
    const trTuesdayEarly = new Date('2026-11-23T21:05:00.000Z');
    const infoTue = getIstanbulWheelDateParts(trTuesdayEarly);
    expect(infoTue.dateStr).toBe('2026-11-24');
    expect(infoTue.isMonday).toBe(false);
  });

  it('NEVER auto-opens or auto-spins when mounted or opened under React.StrictMode', async () => {
    rpcMock.mockImplementation(async (name: string) => {
      if (name === 'get_lucky_wheel_status') return makeStatusRpcResponse(false);
      if (name === 'reconcile_my_missing_xp') return { data: { ok: true, creditedXp: 0 }, error: null };
      return { data: null, error: { message: 'unexpected' } };
    });

    render(
      <React.StrictMode>
        <MemoryRouter initialEntries={['/']}>
          <MondayWheelPopup />
        </MemoryRouter>
      </React.StrictMode>,
    );

    // Wait with zero user action -> modal does NOT auto-open and spin RPC is NEVER called
    await new Promise((r) => setTimeout(r, 150));
    expect(screen.queryByText('Şans Çarkını Çevir!')).toBeNull();

    // User deliberately opens modal -> still ZERO spins until user clicks Spin
    act(() => {
      openMondayWheelModal();
    });
    await screen.findByText('Şans Çarkını Çevir!');
    await new Promise((r) => setTimeout(r, 150));

    const spinCalls = rpcMock.mock.calls.filter(([n]) => n === 'spin_lucky_wheel');
    expect(spinCalls).toHaveLength(0);
    const svg = screen.getByTestId('lucky-wheel-svg');
    expect(svg.style.transform).toBe('rotate(0deg)');
  });

  it('enforces single spin & single XP credit even under 5 rapid clicks, and dispatches points refresh', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let spinCount = 0;
    const pointsUpdatedSpy = vi.fn();
    window.addEventListener('econnotes:points-updated', pointsUpdatedSpy);

    rpcMock.mockImplementation(async (name: string) => {
      if (name === 'get_lucky_wheel_status') return makeStatusRpcResponse(spinCount > 0, 'xp_300', spinCount > 0 ? 550 : 250);
      if (name === 'reconcile_my_missing_xp') return { data: { ok: true, creditedXp: 0 }, error: null };
      if (name === 'spin_lucky_wheel') {
        spinCount += 1;
        return makeSpinRpcResponse({ segmentId: 'xp_300', newPointsTotal: 550 });
      }
      return { data: null, error: null };
    });

    render(
      <MemoryRouter initialEntries={['/']}>
        <MondayWheelPopup />
      </MemoryRouter>,
    );

    act(() => {
      openMondayWheelModal();
    });

    const spinBtn = await screen.findByRole('button', { name: /Şans Çarkını Çevir!/i });

    // Rapidly hammer the button 5 times
    await act(async () => {
      fireEvent.click(spinBtn);
      fireEvent.click(spinBtn);
      fireEvent.click(spinBtn);
      fireEvent.click(spinBtn);
      fireEvent.click(spinBtn);
    });

    // Wait until server spin completes and visual animation begins, then advance past 4.2s animation
    await screen.findByText(/Çark Dönüyor/i);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4500);
    });

    await waitFor(() => {
      expect(screen.getByText('+300 XP Puan Ödülü')).toBeInTheDocument();
    });

    expect(spinCount).toBe(1);
    expect(pointsUpdatedSpy).toHaveBeenCalled();
    window.removeEventListener('econnotes:points-updated', pointsUpdatedSpy);
  });

  it('deduplicates concurrent executeLuckyWheelSpin calls into ONE server request', async () => {
    let resolveRpc!: (val: unknown) => void;
    rpcMock.mockImplementation((name: string) => {
      if (name === 'spin_lucky_wheel') {
        return new Promise((resolve) => {
          resolveRpc = resolve;
        });
      }
      return Promise.resolve({ data: null, error: null });
    });

    const p1 = executeLuckyWheelSpin(mockUser, 'req-uuid-1', { isAdmin: true });
    const p2 = executeLuckyWheelSpin(mockUser, 'req-uuid-2', { isAdmin: true });
    const p3 = executeLuckyWheelSpin(mockUser, 'req-uuid-3', { isAdmin: true });

    resolveRpc(makeSpinRpcResponse({ segmentId: 'xp_500', newPointsTotal: 750 }));

    const [r1, r2, r3] = await Promise.all([p1, p2, p3]);
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(r1.ok).toBe(true);
    expect(r1.newPointsTotal).toBe(750);
    expect(r2.spin?.transactionId).toBe(r1.spin?.transactionId);
    expect(r3.spin?.transactionId).toBe(r1.spin?.transactionId);
  });

  it('does NOT animate a second time if server reports alreadySpun (multi-device/tab)', async () => {
    rpcMock.mockImplementation(async (name: string) => {
      if (name === 'get_lucky_wheel_status') return makeStatusRpcResponse(false);
      if (name === 'reconcile_my_missing_xp') return { data: { ok: true, creditedXp: 0 }, error: null };
      if (name === 'spin_lucky_wheel') {
        return makeSpinRpcResponse({ alreadySpun: true, segmentId: 'xp_200', newPointsTotal: 450 });
      }
      return { data: null, error: null };
    });

    render(
      <MemoryRouter initialEntries={['/']}>
        <MondayWheelPopup />
      </MemoryRouter>,
    );

    act(() => {
      openMondayWheelModal();
    });

    const spinBtn = await screen.findByRole('button', { name: /Şans Çarkını Çevir!/i });
    fireEvent.click(spinBtn);

    await waitFor(() => {
      expect(screen.getByText('+200 XP Puan Ödülü')).toBeInTheDocument();
    });

    // Wheel rotation stayed at 0deg — zero duplicate animation!
    expect(screen.getByTestId('lucky-wheel-svg').style.transform).toBe('rotate(0deg)');
  });

  it('reports clear server error on failure without spinning or faking reward, and allows safe retry', async () => {
    let attempt = 0;
    rpcMock.mockImplementation(async (name: string) => {
      if (name === 'get_lucky_wheel_status') return makeStatusRpcResponse(false);
      if (name === 'reconcile_my_missing_xp') return { data: { ok: true, creditedXp: 0 }, error: null };
      if (name === 'spin_lucky_wheel') {
        attempt += 1;
        if (attempt === 1) {
          return { data: null, error: { code: 'PGRST202', message: 'Could not find spin_lucky_wheel' } };
        }
        return makeSpinRpcResponse({ segmentId: 'xp_100', newPointsTotal: 350 });
      }
      return { data: null, error: null };
    });
    functionsInvokeMock.mockResolvedValue({ data: null, error: { message: '404' } });

    render(
      <MemoryRouter initialEntries={['/']}>
        <MondayWheelPopup />
      </MemoryRouter>,
    );

    act(() => {
      openMondayWheelModal();
    });

    const spinBtn = await screen.findByRole('button', { name: /Şans Çarkını Çevir!/i });
    fireEvent.click(spinBtn);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/sunucu ödül servisine ulaşılamadı/i);
    });
    // Wheel did NOT spin on error
    expect(screen.getByTestId('lucky-wheel-svg').style.transform).toBe('rotate(0deg)');
    // Button re-enabled cleanly for retry (reward was NOT lost)
    expect(screen.getByRole('button', { name: /Şans Çarkını Çevir!/i })).not.toBeDisabled();
  });
});
