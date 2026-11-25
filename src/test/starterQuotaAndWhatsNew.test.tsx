import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { User } from '@supabase/supabase-js';

const mockAuthState = vi.hoisted(() => ({
  user: null as User | null,
  profile: null as Record<string, any> | null,
  isAdmin: false,
  isApproved: true,
  loading: false,
}));

const mockOnboardingState = vi.hoisted(() => ({
  isTourOpen: false,
  shouldShowWelcomeAuto: false,
}));

const mockSupabaseRpc = vi.hoisted(() =>
  vi.fn(async (_fn: string, _args?: Record<string, unknown>) => ({ data: true, error: null })),
);

const mockSupabaseUpdateUser = vi.hoisted(() =>
  vi.fn(async ({ data }: { data?: Record<string, unknown> }) => {
    if (mockAuthState.user && data) {
      mockAuthState.user = {
        ...mockAuthState.user,
        user_metadata: {
          ...(mockAuthState.user.user_metadata || {}),
          ...data,
        },
      };
    }
    return { data: { user: mockAuthState.user }, error: null };
  }),
);

const mockUpsert = vi.hoisted(() => vi.fn(async () => ({ error: null })));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      updateUser: mockSupabaseUpdateUser,
    },
    rpc: mockSupabaseRpc,
    from: vi.fn(() => ({
      upsert: mockUpsert,
      update: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
    })),
  },
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: mockAuthState.user,
    session: null,
    profile: mockAuthState.profile,
    isAdmin: mockAuthState.isAdmin,
    isApproved: mockAuthState.isApproved,
    loading: mockAuthState.loading,
    signOut: vi.fn(),
    refreshProfile: vi.fn(),
  }),
}));

vi.mock('@/contexts/OnboardingContext', () => ({
  useOnboarding: () => ({
    state: {
      version: 'v2',
      status: 'not_started',
      currentStep: 0,
      completedSteps: [],
      welcomeSeen: false,
      dismissedTips: [],
      startedAt: null,
      completedAt: null,
      updatedAt: '',
    },
    phase: 'completed',
    isTourOpen: mockOnboardingState.isTourOpen,
    activeStepIndex: 6,
    activeStep: {
      id: 'profile-account',
      stepNumber: 7,
      title: 'Profil ve Hesap İşlemleri',
      headline: 'Hesabını buradan yönetebilirsin.',
      paragraphs: ['Test'],
      route: '/',
      desktopTargets: ['[data-tour="header-profile"]'],
      mobileTargets: ['[data-tour="header-profile"]'],
      fallbackLocationHint: 'Hint',
    },
    totalSteps: 7,
    canResumeTour: false,
    shouldShowWelcomeAuto: mockOnboardingState.shouldShowWelcomeAuto,
    startTour: vi.fn(),
    resumeTour: vi.fn(),
    nextStep: vi.fn(),
    prevStep: vi.fn(),
    goToStep: vi.fn(),
    pauseTour: vi.fn(),
    skipTour: vi.fn(),
    completeTour: vi.fn(),
    dismissWelcome: vi.fn(),
    isTipVisible: () => false,
    dismissTip: vi.fn(),
    resetTips: vi.fn(),
  }),
}));

vi.mock('@/contexts/SiteConfigContext', () => ({
  useSiteConfig: () => ({
    config: { theme: { seasonalMode: 'default' } },
    isPageEnabled: () => true,
  }),
  getSeasonalTheme: () => null,
}));

import { resolveNoteUploadQuota, STARTER_NOTE_UPLOAD_QUOTA } from '@/lib/noteUploadQuota';
import {
  evaluateWhatsNewEligibility,
  hasUserSeenWhatsNew,
  markWhatsNewPendingForSession,
  releaseWhatsNewTabLock,
  tryAcquireWhatsNewTabLock,
  WHATS_NEW_CUTOFF_ISO,
  WHATS_NEW_STEPS,
  WHATS_NEW_VERSION,
} from '@/lib/whatsNew';
import {
  createInitialOnboardingState,
  ONBOARDING_V2_ROLLOUT_ISO,
  shouldAutoRedirectToWelcome,
} from '@/lib/onboarding';
import { clearAllUserClientState } from '@/lib/sessionCleanup';
import WhatsNewModal from '@/components/WhatsNewModal';
import Welcome from '@/pages/Welcome';
import GuidedPlatformTour from '@/components/onboarding/GuidedPlatformTour';

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-returning-001',
    aud: 'authenticated',
    role: 'authenticated',
    email: 'eski.ogrenci@duzce.edu.tr',
    created_at: '2026-09-15T10:00:00+03:00',
    app_metadata: {},
    user_metadata: { full_name: 'Kaan Çolakoğlu', birth_date: '2001-05-12' },
    ...overrides,
  } as User;
}

describe('UI Polish: Welcome Plain Greeting & Equalized Completion Dialog Buttons', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    mockOnboardingState.isTourOpen = false;
    mockOnboardingState.shouldShowWelcomeAuto = false;
    mockAuthState.user = makeUser({ id: 'u-ui-1', created_at: '2026-11-26T10:00:00+03:00' });
    mockAuthState.profile = {
      user_id: 'u-ui-1',
      full_name: 'Kaan Çolakoğlu',
      approval_status: 'approved',
      created_at: '2026-11-26T10:00:00+03:00',
      birth_date: '2001-05-12',
    };
    mockAuthState.isApproved = true;
    mockAuthState.loading = false;
  });

  it('renders "Merhaba {firstName}, hesabın hazır" as plain solid text without translucent pill box', () => {
    render(
      <MemoryRouter initialEntries={['/welcome']}>
        <Welcome />
      </MemoryRouter>,
    );

    const greetingText = screen.getByText('Merhaba Kaan, hesabın hazır');
    const wrapper = greetingText.closest('p');
    expect(wrapper).not.toBeNull();
    expect(wrapper?.className).toContain('text-white');
    expect(wrapper?.className).not.toContain('bg-white/10');
    expect(wrapper?.className).not.toContain('border-white/20');
    expect(wrapper?.className).not.toContain('backdrop-blur');
  });

  it('equalizes both buttons in the tour completion dialog (identical height & 2-col equal grid)', () => {
    mockOnboardingState.isTourOpen = true;
    render(
      <MemoryRouter initialEntries={['/']}>
        <GuidedPlatformTour />
      </MemoryRouter>,
    );

    const backBtn = screen.getByRole('button', { name: /Son Adıma Dön/i });
    const startBtn = screen.getByRole('button', { name: /EconNotes'u Keşfetmeye Başla/i });
    expect(backBtn.className).toContain('h-11');
    expect(startBtn.className).toContain('h-11');
    expect(backBtn.className).toContain('w-full');
    expect(startBtn.className).toContain('w-full');
    expect(backBtn.parentElement?.className).toContain('sm:grid-cols-2');
  });
});

describe('Yeni Kullanıcı 2 Not Yükleme Hakkı Sistemi', () => {
  it('grants 2 starter upload rights on signup and preserves them while pending admin approval', () => {
    expect(STARTER_NOTE_UPLOAD_QUOTA).toBe(2);

    // Brand-new user awaiting admin approval in Waiting Room
    const pendingState = resolveNoteUploadQuota({
      profile: {
        note_upload_quota: 2,
        starter_upload_quota_granted_at: '2026-11-26T10:00:00Z',
        approval_status: 'pending',
      },
      isAdmin: false,
      isApproved: false,
    });
    expect(pendingState.remainingUploads).toBe(2);
    expect(pendingState.isLimited).toBe(true);
    expect(pendingState.isPendingApproval).toBe(true);
    expect(pendingState.canUpload).toBe(false);
    expect(pendingState.statusLabel).toContain('2 hak hazır');

    // Same user immediately after administrator approval -> both 2 rights usable
    const approvedState = resolveNoteUploadQuota({
      profile: {
        note_upload_quota: 2,
        starter_upload_quota_granted_at: '2026-11-26T10:00:00Z',
        approval_status: 'approved',
      },
      isAdmin: false,
      isApproved: true,
    });
    expect(approvedState.remainingUploads).toBe(2);
    expect(approvedState.canUpload).toBe(true);
    expect(approvedState.isPendingApproval).toBe(false);
    expect(approvedState.statusLabel).toBe('2 not yükleme hakkı kaldı');
  });

  it('tracks decrements from 2 -> 1 -> 0, preserves count on failed upload, and blocks at 0', () => {
    // After 1st successful upload: 2 -> 1
    const afterFirst = resolveNoteUploadQuota({
      profile: {
        note_upload_quota: 1,
        starter_upload_quota_granted_at: '2026-11-26T10:00:00Z',
        approval_status: 'approved',
      },
      isAdmin: false,
      isApproved: true,
    });
    expect(afterFirst.remainingUploads).toBe(1);
    expect(afterFirst.canUpload).toBe(true);
    expect(afterFirst.statusLabel).toBe('1 not yükleme hakkı kaldı');

    // Failed upload does not mutate DB -> remains 1 across reload / re-login
    const afterFailedUploadReload = resolveNoteUploadQuota({
      profile: {
        note_upload_quota: 1,
        starter_upload_quota_granted_at: '2026-11-26T10:00:00Z',
        approval_status: 'approved',
      },
      isAdmin: false,
      isApproved: true,
      rpcRow: {
        remaining_uploads: 1,
        starter_granted: true,
        is_limited: true,
        can_upload: true,
        is_admin: false,
      },
    });
    expect(afterFailedUploadReload.remainingUploads).toBe(1);
    expect(afterFailedUploadReload.canUpload).toBe(true);

    // After 2nd successful upload: 1 -> 0 -> blocked cleanly
    const exhausted = resolveNoteUploadQuota({
      profile: {
        note_upload_quota: 0,
        starter_upload_quota_granted_at: '2026-11-26T10:00:00Z',
        approval_status: 'approved',
      },
      isAdmin: false,
      isApproved: true,
    });
    expect(exhausted.remainingUploads).toBe(0);
    expect(exhausted.canUpload).toBe(false);
    expect(exhausted.statusLabel).toBe('Not yükleme hakkınız doldu');
  });

  it('leaves existing legacy users, admins, and Monday Wheel unlimited passes completely unaffected', () => {
    // Existing pre-migration user (`note_upload_quota = null`)
    const legacy = resolveNoteUploadQuota({
      profile: {
        note_upload_quota: null,
        starter_upload_quota_granted_at: null,
        approval_status: 'approved',
      },
      isAdmin: false,
      isApproved: true,
    });
    expect(legacy.isLimited).toBe(false);
    expect(legacy.canUpload).toBe(true);
    expect(legacy.remainingUploads).toBeNull();

    // Admin user
    const admin = resolveNoteUploadQuota({
      profile: { note_upload_quota: 0, approval_status: 'approved' },
      isAdmin: true,
      isApproved: true,
    });
    expect(admin.isLimited).toBe(false);
    expect(admin.canUpload).toBe(true);

    // Active Monday Wheel unlimited pass preserves remaining numeric balance without blocking
    const wheelPass = resolveNoteUploadQuota({
      profile: {
        note_upload_quota: 0,
        wheel_unlimited_until: new Date(Date.now() + 3600_000).toISOString(),
        approval_status: 'approved',
      },
      isAdmin: false,
      isApproved: true,
    });
    expect(wheelPass.isWheelUnlimited).toBe(true);
    expect(wheelPass.isLimited).toBe(false);
    expect(wheelPass.canUpload).toBe(true);
  });
});

describe('25.11.2026 ve Öncesi Eski Kullanıcılar İçin Tek Seferlik "EconNotes Yenilendi!" Sistemi', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    mockSupabaseRpc.mockClear();
    mockSupabaseUpdateUser.mockClear();
    mockUpsert.mockClear();
    mockOnboardingState.isTourOpen = false;
    mockOnboardingState.shouldShowWelcomeAuto = false;
    mockAuthState.isAdmin = false;
    mockAuthState.isApproved = true;
    mockAuthState.loading = false;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('correctly determines eligibility for <= 25.11.2026 returning users, never-logged-in legacy users, and excludes new signups', () => {
    // 1. Existing user whose last_login was before 25.11.2026 -> ELIGIBLE
    const returningUser = makeUser({
      id: 'u-old-1',
      created_at: '2026-08-10T12:00:00+03:00',
    });
    expect(
      evaluateWhatsNewEligibility({
        user: returningUser,
        profile: {
          created_at: '2026-08-10T12:00:00+03:00',
          last_login: '2026-11-20T18:30:00+03:00',
          starter_upload_quota_granted_at: null,
          seen_whats_new_versions: [],
        },
      }),
    ).toBe(true);

    // 2. Existing user whose last_login was on 25.11.2026 (inclusive cutoff) -> ELIGIBLE
    expect(
      evaluateWhatsNewEligibility({
        user: returningUser,
        profile: {
          created_at: '2026-10-01T12:00:00+03:00',
          last_login: '2026-11-25T21:00:00+03:00',
          starter_upload_quota_granted_at: null,
          seen_whats_new_versions: [],
        },
      }),
    ).toBe(true);

    // 3. Existing user who registered earlier and NEVER logged in (`last_login: null`) -> ELIGIBLE
    expect(
      evaluateWhatsNewEligibility({
        user: makeUser({ id: 'u-old-never', created_at: '2026-09-01T10:00:00+03:00' }),
        profile: {
          created_at: '2026-09-01T10:00:00+03:00',
          last_login: null,
          starter_upload_quota_granted_at: null,
          seen_whats_new_versions: [],
        },
      }),
    ).toBe(true);

    // 4. Existing user who already logged in AFTER 25.11.2026 -> NOT eligible
    expect(
      evaluateWhatsNewEligibility({
        user: returningUser,
        profile: {
          created_at: '2026-08-10T12:00:00+03:00',
          last_login: '2026-11-26T00:05:00+03:00',
          starter_upload_quota_granted_at: null,
          seen_whats_new_versions: [],
        },
      }),
    ).toBe(false);

    // 5. Existing user who ALREADY saw `whats_new_2026_11_25` (e.g. on another device) -> NOT eligible
    expect(
      evaluateWhatsNewEligibility({
        user: returningUser,
        profile: {
          created_at: '2026-08-10T12:00:00+03:00',
          last_login: '2026-11-10T12:00:00+03:00',
          starter_upload_quota_granted_at: null,
          seen_whats_new_versions: [WHATS_NEW_VERSION],
        },
      }),
    ).toBe(false);

    // 6. Brand-new user with starter 2 upload rights -> NEVER eligible (no onboarding collision!)
    const brandNewUser = makeUser({
      id: 'u-new-1',
      created_at: '2026-11-26T10:00:00+03:00',
    });
    expect(
      evaluateWhatsNewEligibility({
        user: brandNewUser,
        profile: {
          created_at: '2026-11-26T10:00:00+03:00',
          last_login: null,
          starter_upload_quota_granted_at: '2026-11-26T10:00:00+03:00',
          seen_whats_new_versions: [],
        },
      }),
    ).toBe(false);

    // 7. Brand-new user created on onboarding rollout day with NULL last_login -> NEVER collides with What's New
    const rolloutDayNewUser = makeUser({
      id: 'u-new-rollout',
      created_at: ONBOARDING_V2_ROLLOUT_ISO,
    });
    expect(
      evaluateWhatsNewEligibility({
        user: rolloutDayNewUser,
        profile: {
          created_at: ONBOARDING_V2_ROLLOUT_ISO,
          last_login: null,
          starter_upload_quota_granted_at: null,
          seen_whats_new_versions: [],
        },
      }),
    ).toBe(false);
    expect(
      shouldAutoRedirectToWelcome({
        user: rolloutDayNewUser,
        profile: { created_at: ONBOARDING_V2_ROLLOUT_ISO },
        state: createInitialOnboardingState(),
        isApproved: true,
      }),
    ).toBe(true);
  });

  it('auto-opens for eligible returning user, navigates forward & back through all 6 verified steps, and completes cleanly', async () => {
    const user = makeUser({ id: 'u-walkthrough-1' });
    mockAuthState.user = user;
    mockAuthState.profile = {
      user_id: user.id,
      full_name: 'Kaan Çolakoğlu',
      birth_date: '2001-05-12',
      approval_status: 'approved',
      created_at: '2026-09-15T10:00:00+03:00',
      last_login: '2026-11-20T10:00:00+03:00',
      seen_whats_new_versions: [],
    };
    markWhatsNewPendingForSession(user.id, WHATS_NEW_VERSION);

    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<WhatsNewModal />} />
        </Routes>
      </MemoryRouter>,
    );

    // Opens automatically with required title & Step 1
    expect(await screen.findByText('EconNotes Yenilendi!')).toBeInTheDocument();
    expect(screen.getByText('Yenilenen Ana Sayfa')).toBeInTheDocument();

    // Immediately persists 'viewed' on open
    await waitFor(() => {
      expect(mockSupabaseRpc).toHaveBeenCalledWith('mark_whats_new_seen', {
        _version: WHATS_NEW_VERSION,
        _status: 'viewed',
      });
    });

    // Step 1 -> Step 2 -> Step 1 (Forward & Back test)
    fireEvent.click(screen.getByRole('button', { name: /İleri/i }));
    expect(screen.getByText('Yenilenen Navigasyon ve Mobil Deneyim')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Geri/i }));
    expect(screen.getByText('Yenilenen Ana Sayfa')).toBeInTheDocument();

    // Walk through all remaining steps to Step 6
    for (let i = 1; i < WHATS_NEW_STEPS.length; i++) {
      fireEvent.click(screen.getByRole('button', { name: /İleri/i }));
      expect(screen.getByText(WHATS_NEW_STEPS[i].title)).toBeInTheDocument();
    }

    // Step 6 displays final CTA button and closes + records 'completed'
    const finishBtn = screen.getByRole('button', { name: /EconNotes'u Keşfetmeye Başla/i });
    fireEvent.click(finishBtn);

    await waitFor(() => {
      expect(screen.queryByTestId('whats-new-overlay')).not.toBeInTheDocument();
      expect(mockSupabaseRpc).toHaveBeenCalledWith('mark_whats_new_seen', {
        _version: WHATS_NEW_VERSION,
        _status: 'completed',
      });
    });
  });

  it('records skipped status on "Atla" and never re-opens across reload, re-login, or another device', async () => {
    const user = makeUser({ id: 'u-skip-1' });
    mockAuthState.user = user;
    mockAuthState.profile = {
      user_id: user.id,
      full_name: 'Kaan Çolakoğlu',
      birth_date: '2001-05-12',
      approval_status: 'approved',
      created_at: '2026-09-15T10:00:00+03:00',
      last_login: '2026-11-18T10:00:00+03:00',
      seen_whats_new_versions: [],
    };
    markWhatsNewPendingForSession(user.id, WHATS_NEW_VERSION);

    const { unmount } = render(
      <MemoryRouter initialEntries={['/']}>
        <WhatsNewModal />
      </MemoryRouter>,
    );

    expect(await screen.findByText('EconNotes Yenilendi!')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Atla$/i }));

    await waitFor(() => {
      expect(screen.queryByTestId('whats-new-overlay')).not.toBeInTheDocument();
      expect(mockSupabaseRpc).toHaveBeenCalledWith('mark_whats_new_seen', {
        _version: WHATS_NEW_VERSION,
        _status: 'skipped',
      });
    });

    unmount();

    // Simulate reload in same browser -> never re-opens
    expect(hasUserSeenWhatsNew(mockAuthState.user, mockAuthState.profile)).toBe(true);

    // Simulate brand-new device (all local storage wiped), only backend profile & auth user_metadata present
    await clearAllUserClientState();
    const deviceBProfile = {
      ...mockAuthState.profile,
      seen_whats_new_versions: [WHATS_NEW_VERSION],
    };
    expect(hasUserSeenWhatsNew(mockAuthState.user, deviceBProfile)).toBe(true);
    expect(
      evaluateWhatsNewEligibility({
        user: mockAuthState.user,
        profile: deviceBProfile,
        serverEligibility: { eligible: false, already_seen: true },
      }),
    ).toBe(false);
  });

  it('prevents two simultaneous browser tabs from opening What’s New concurrently', () => {
    const userId = 'u-multitab-1';
    expect(tryAcquireWhatsNewTabLock(userId, 'tab-A', WHATS_NEW_VERSION)).toBe(true);
    // Second tab trying to open concurrently is cleanly blocked
    expect(tryAcquireWhatsNewTabLock(userId, 'tab-B', WHATS_NEW_VERSION)).toBe(false);
    // Releasing by wrong tab does not unlock
    releaseWhatsNewTabLock(userId, 'tab-B', WHATS_NEW_VERSION);
    expect(tryAcquireWhatsNewTabLock(userId, 'tab-B', WHATS_NEW_VERSION)).toBe(false);
    // Releasing by owning tab frees the lock
    releaseWhatsNewTabLock(userId, 'tab-A', WHATS_NEW_VERSION);
    expect(tryAcquireWhatsNewTabLock(userId, 'tab-B', WHATS_NEW_VERSION)).toBe(true);
  });

  it('never collides with active guided platform tour or Welcome screen', () => {
    const user = makeUser({ id: 'u-nocollide-1' });
    mockAuthState.user = user;
    mockAuthState.profile = {
      user_id: user.id,
      full_name: 'Kaan',
      birth_date: '2001-05-12',
      approval_status: 'approved',
      created_at: '2026-09-15T10:00:00+03:00',
      last_login: '2026-11-18T10:00:00+03:00',
      seen_whats_new_versions: [],
    };
    markWhatsNewPendingForSession(user.id, WHATS_NEW_VERSION);
    mockOnboardingState.isTourOpen = true;

    render(
      <MemoryRouter initialEntries={['/']}>
        <WhatsNewModal />
      </MemoryRouter>,
    );

    expect(screen.queryByTestId('whats-new-overlay')).not.toBeInTheDocument();
  });
});

describe('SQL Migration Invariants (20261125180000_starter_upload_quota_and_whats_new.sql)', () => {
  const migrationPath = path.resolve(
    process.cwd(),
    'supabase/migrations/20261125180000_starter_upload_quota_and_whats_new.sql',
  );
  const sql = fs.readFileSync(migrationPath, 'utf8');

  it('defines idempotent starter 2 upload rights, transactional consumption, RLS, and versioned whats_new tracking', () => {
    // Columns & constraints
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS note_upload_quota INTEGER');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS starter_upload_quota_granted_at TIMESTAMPTZ');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS seen_whats_new_versions TEXT[]');
    expect(sql).toContain('CHECK (note_upload_quota IS NULL OR note_upload_quota >= 0)');

    // Dedicated user_whats_new_views table with RLS scoped via (select auth.uid())
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.user_whats_new_views');
    expect(sql).toContain('UNIQUE (user_id, version)');
    expect(sql).toContain('ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('(select auth.uid()) = user_id');

    // handle_new_user idempotency & starter grant of 2 without mutating existing users
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.handle_new_user()');
    expect(sql).toContain('CASE WHEN _is_admin THEN NULL ELSE 2 END');
    expect(sql).toContain('WHEN profiles.starter_upload_quota_granted_at IS NULL');
    expect(sql).not.toMatch(/UPDATE\s+public\.profiles\s+SET\s+note_upload_quota\s*=\s*2\s*;/i);

    // Transactional atomic decrement with FOR UPDATE on INSERT only
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.protect_notes_moderation_and_path()');
    expect(sql).toContain('FOR UPDATE');
    expect(sql).toContain('SET note_upload_quota = note_upload_quota - 1');
    expect(sql).toContain('IF v_upload_quota <= 0 THEN');

    // Privileged column protection blocks client tampering
    expect(sql).toContain('OR NEW.note_upload_quota IS DISTINCT FROM OLD.note_upload_quota');
    expect(sql).toContain('OR NEW.seen_whats_new_versions IS DISTINCT FROM OLD.seen_whats_new_versions');

    // Server RPCs & cutoff match TS constants
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.check_whats_new_eligibility');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.mark_whats_new_seen');
    expect(sql).toContain(WHATS_NEW_VERSION);
    expect(sql).toContain(WHATS_NEW_CUTOFF_ISO);
    expect(sql).toContain("NOTIFY pgrst, 'reload schema'");
  });
});
