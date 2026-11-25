import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import type { User } from '@supabase/supabase-js';

// Hoisted mutable auth state so tests can switch between brand-new users, User A, and User B cleanly
const mockAuthState = vi.hoisted(() => ({
  user: null as User | null,
  profile: null as Record<string, any> | null,
  isAdmin: false,
  isApproved: true,
  loading: false,
}));

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

const mockSupabaseRpc = vi.hoisted(() => vi.fn(async () => ({ data: {}, error: null })));
const mockProfilesUpdateEq = vi.hoisted(() => vi.fn(async () => ({ error: null })));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      updateUser: mockSupabaseUpdateUser,
    },
    rpc: mockSupabaseRpc,
    from: vi.fn(() => ({
      update: vi.fn(() => ({
        eq: mockProfilesUpdateEq,
      })),
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

vi.mock('@/contexts/SiteConfigContext', () => ({
  useSiteConfig: () => ({
    config: {
      theme: { seasonalMode: 'default' },
    },
    isPageEnabled: () => true,
  }),
  getSeasonalTheme: () => null,
}));

import {
  computeTourCardLayout,
  CONTEXTUAL_TIPS,
  createInitialOnboardingState,
  markFirstLoginDetected,
  ONBOARDING_STEPS,
  ONBOARDING_V2_ROLLOUT_ISO,
  resolveOnboardingState,
  shouldAutoRedirectToWelcome,
  writeLocalOnboardingState,
} from '@/lib/onboarding';
import { clearAllUserClientState } from '@/lib/sessionCleanup';
import { OnboardingProvider, useOnboarding } from '@/contexts/OnboardingContext';
import GuidedPlatformTour from '@/components/onboarding/GuidedPlatformTour';
import ContextualTipBanner from '@/components/onboarding/ContextualTipBanner';
import Welcome from '@/pages/Welcome';

function makeMockUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-new-001',
    aud: 'authenticated',
    role: 'authenticated',
    email: 'yeni.ogrenci@duzce.edu.tr',
    created_at: ONBOARDING_V2_ROLLOUT_ISO,
    app_metadata: {},
    user_metadata: { full_name: 'Ayşe Yılmaz' },
    ...overrides,
  } as User;
}

/** Realistic DOM fixture mirroring actual EconNotes data-tour anchors on desktop & mobile */
const MockAppShellWithRealAnchors = ({
  includeAnchors = true,
  isMobile = false,
}: {
  includeAnchors?: boolean;
  isMobile?: boolean;
}) => {
  const { startTour, resumeTour, canResumeTour, state } = useOnboarding();
  const location = useLocation();

  return (
    <div>
      <div data-testid="current-path">{location.pathname}</div>
      <div data-testid="onboarding-status">{state.status}</div>

      {includeAnchors && (
        <>
          <header>
            <button data-tour="header-points" type="button">
              120 Puan
            </button>
            <button data-tour="header-notifications" type="button">
              Bildirimler
            </button>
            <button data-tour="header-profile" type="button">
              AY
            </button>
          </header>

          {!isMobile && (
            <aside>
              <button data-tour="sidebar-nav-home" type="button">
                Ana Sayfa
              </button>
              <button data-tour="sidebar-nav-notes" type="button">
                Notlar
              </button>
              <div data-tour="sidebar-nav-comms">
                <button data-tour="sidebar-nav-announcements" type="button">
                  Duyurular
                </button>
                <button data-tour="sidebar-nav-messages" type="button">
                  Mesajlar
                </button>
              </div>
              <button data-tour="sidebar-nav-study" type="button">
                Çalışma Stüdyosu
              </button>
              <button data-tour="sidebar-nav-points" type="button">
                Puan Geçmişim
              </button>
              <button data-tour="sidebar-nav-support" type="button">
                Destek Merkezi
              </button>
            </aside>
          )}

          <main>
            <section data-tour="dashboard-hero">Merhaba Ayşe</section>
            <section data-tour="dashboard-stats">Toplam Not · Toplam XP</section>
            <div data-tour="dashboard-trivia">Günlük Bilgi Yarışması</div>
            <div data-tour="dashboard-leaderboard">Liderlik Tablosu</div>
          </main>

          {isMobile && (
            <nav aria-label="Mobil Alt Menü">
              <button data-tour="mobile-nav-home" type="button">
                Ana Sayfa
              </button>
              <button data-tour="mobile-nav-notes" type="button">
                Notlar
              </button>
              <button data-tour="mobile-nav-study" type="button">
                Stüdyo
              </button>
              <button data-tour="mobile-nav-messages" type="button">
                Mesajlar
              </button>
              <button data-tour="mobile-nav-menu" type="button">
                Menü
              </button>
            </nav>
          )}
        </>
      )}

      {/* Contextual tips test host */}
      <ContextualTipBanner tipId="notes_search" />
      <ContextualTipBanner tipId="notes_upload" />
      <ContextualTipBanner tipId="study_pdf" />
      <ContextualTipBanner tipId="points_xp" />

      {/* Re-entry triggers mimicking Profile & Support */}
      <button type="button" onClick={() => startTour({ fromBeginning: true })}>
        Platformu Tanı
      </button>
      {canResumeTour && (
        <button type="button" onClick={resumeTour}>
          Kaldığın Yerden Devam Et
        </button>
      )}
    </div>
  );
};

function mockBoundingRects(rects: Record<string, Partial<DOMRect>>) {
  return vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    const tourId = this.getAttribute('data-tour');
    if (tourId && rects[tourId]) {
      const r = rects[tourId];
      const top = r.top ?? 100;
      const left = r.left ?? 100;
      const width = r.width ?? 200;
      const height = r.height ?? 48;
      return {
        top,
        left,
        width,
        height,
        right: left + width,
        bottom: top + height,
        x: left,
        y: top,
        toJSON: () => {},
      } as DOMRect;
    }
    return {
      top: 0,
      left: 0,
      width: 0,
      height: 0,
      right: 0,
      bottom: 0,
      x: 0,
      y: 0,
      toJSON: () => {},
    } as DOMRect;
  });
}

describe('EconNotes Yeni Kullanıcı Karşılama & Rehberli Platform Turu', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    mockSupabaseUpdateUser.mockClear();
    mockSupabaseRpc.mockClear();
    mockProfilesUpdateEq.mockClear();

    mockAuthState.user = makeMockUser();
    mockAuthState.profile = {
      user_id: 'user-new-001',
      full_name: 'Ayşe Yılmaz',
      approval_status: 'approved',
      created_at: ONBOARDING_V2_ROLLOUT_ISO,
      last_login: null,
      onboarding_state: {},
    };
    mockAuthState.isApproved = true;
    mockAuthState.loading = false;

    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1440 });
    Object.defineProperty(window, 'innerHeight', { writable: true, configurable: true, value: 900 });
    window.scrollTo = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Per-user state isolation & auto-welcome logic', () => {
    it('routes brand-new approved user to Welcome once and never loops after ack', () => {
      const user = makeMockUser();
      const initial = createInitialOnboardingState();
      expect(
        shouldAutoRedirectToWelcome({
          user,
          profile: { created_at: ONBOARDING_V2_ROLLOUT_ISO },
          state: initial,
          isApproved: true,
        }),
      ).toBe(true);

      // Unapproved user must NEVER be auto-redirected to Welcome
      expect(
        shouldAutoRedirectToWelcome({
          user,
          profile: { created_at: ONBOARDING_V2_ROLLOUT_ISO },
          state: initial,
          isApproved: false,
        }),
      ).toBe(false);

      // After writing acknowledged state, auto-redirect stops permanently (no redirect loop)
      const seen = { ...initial, welcomeSeen: true, status: 'skipped' as const };
      writeLocalOnboardingState(user.id, seen);
      expect(
        shouldAutoRedirectToWelcome({
          user,
          profile: { created_at: ONBOARDING_V2_ROLLOUT_ISO },
          state: seen,
          isApproved: true,
        }),
      ).toBe(false);
    });

    it('detects legacy user with first-ever login flag before last_login mutation', () => {
      const olderUser = makeMockUser({
        id: 'user-first-login',
        created_at: '2026-10-01T10:00:00Z',
      });
      expect(
        shouldAutoRedirectToWelcome({
          user: olderUser,
          profile: { created_at: '2026-10-01T10:00:00Z' },
          state: createInitialOnboardingState(),
          isApproved: true,
        }),
      ).toBe(false);

      markFirstLoginDetected(olderUser.id);
      expect(
        shouldAutoRedirectToWelcome({
          user: olderUser,
          profile: { created_at: '2026-10-01T10:00:00Z' },
          state: createInitialOnboardingState(),
          isApproved: true,
        }),
      ).toBe(true);
    });

    it('isolates onboarding state strictly per user account even across logout & account switch', async () => {
      const userA = makeMockUser({
        id: 'user-A',
        user_metadata: {
          econnotes_onboarding: {
            version: 'v2',
            status: 'completed',
            currentStep: 6,
            completedSteps: ONBOARDING_STEPS.map((s) => s.id),
            welcomeSeen: true,
            dismissedTips: ['notes_search'],
            startedAt: '2026-11-25T10:00:00Z',
            completedAt: '2026-11-25T10:02:00Z',
            updatedAt: '2026-11-25T10:02:00Z',
          },
        },
      });
      const userB = makeMockUser({ id: 'user-B', user_metadata: {} });

      writeLocalOnboardingState(userA.id, resolveOnboardingState(userA));
      expect(resolveOnboardingState(userB).status).toBe('not_started');
      expect(resolveOnboardingState(userB).dismissedTips).toEqual([]);

      // Simulate sign-out clearing browser cache: User A still retains account state via metadata on re-login
      await clearAllUserClientState();
      const restoredA = resolveOnboardingState(userA);
      expect(restoredA.status).toBe('completed');
      expect(restoredA.dismissedTips).toEqual(['notes_search']);
    });
  });

  describe('2. Desktop & Mobile layout positioning engine', () => {
    it('places desktop popover to the right of sidebar items and clamps within viewport', () => {
      const layout = computeTourCardLayout({
        targetRect: { top: 220, left: 20, width: 230, height: 40, right: 250, bottom: 260 },
        viewportWidth: 1440,
        viewportHeight: 900,
        preferredDesktopPlacement: 'right',
      });
      expect(layout.mode).toBe('desktop-popover');
      expect(layout.arrowSide).toBe('left');
      expect(layout.left).toBeGreaterThanOrEqual(260);
      expect((layout.left ?? 0) + (layout.width ?? 0)).toBeLessThanOrEqual(1440 - 16);
    });

    it('uses centered fallback card on desktop when target is missing/invisible', () => {
      const layout = computeTourCardLayout({
        targetRect: null,
        viewportWidth: 1440,
        viewportHeight: 900,
      });
      expect(layout.mode).toBe('desktop-centered');
      expect(layout.arrowSide).toBe('none');
    });

    it('uses mobile-above-nav layout when highlighting MobileBottomNav so it never overlaps bottom bar', () => {
      const layout = computeTourCardLayout({
        targetRect: { top: 760, left: 82, width: 72, height: 54, right: 154, bottom: 814 },
        viewportWidth: 390,
        viewportHeight: 844,
        isMobileBottomNavTarget: true,
      });
      expect(layout.mode).toBe('mobile-above-nav');
      expect(layout.arrowSide).toBe('bottom');
    });

    it('uses modern mobile bottom sheet for upper/middle mobile targets (iPhone/Android)', () => {
      const layout = computeTourCardLayout({
        targetRect: { top: 120, left: 16, width: 358, height: 180, right: 374, bottom: 300 },
        viewportWidth: 390,
        viewportHeight: 844,
        isMobileBottomNavTarget: false,
      });
      expect(layout.mode).toBe('mobile-sheet');
    });
  });

  describe('3. Full end-to-end brand-new user onboarding flow (Desktop)', () => {
    it('walks from Welcome through all 7 real DOM anchored steps to Completion and enables contextual tips', async () => {
      const rectSpy = mockBoundingRects({
        'dashboard-stats': { top: 210, left: 300, width: 1080, height: 140 },
        'sidebar-nav-notes': { top: 150, left: 22, width: 220, height: 40 },
        'sidebar-nav-study': { top: 320, left: 22, width: 220, height: 40 },
        'dashboard-trivia': { top: 380, left: 840, width: 520, height: 220 },
        'dashboard-leaderboard': { top: 620, left: 980, width: 380, height: 240 },
        'sidebar-nav-comms': { top: 196, left: 22, width: 220, height: 84 },
        'header-profile': { top: 14, left: 1372, width: 40, height: 40 },
      });

      render(
        <MemoryRouter initialEntries={['/welcome']}>
          <OnboardingProvider>
            <GuidedPlatformTour />
            <Routes>
              <Route path="/welcome" element={<Welcome />} />
              <Route path="/" element={<MockAppShellWithRealAnchors />} />
            </Routes>
          </OnboardingProvider>
        </MemoryRouter>,
      );

      // 1. Welcome Screen verification (exact copy & two buttons)
      expect(screen.getByRole('heading', { name: "EconNotes'a Hoş Geldin!" })).toBeInTheDocument();
      expect(
        screen.getByText(/Ders notlarını keşfetmeye, çalışma materyallerini oluşturmaya/i),
      ).toBeInTheDocument();
      const exploreBtn = screen.getByRole('button', { name: /Platformu Keşfet/i });
      const skipWelcomeBtn = screen.getByRole('button', { name: /Şimdilik Geç/i });
      expect(exploreBtn).toBeInTheDocument();
      expect(skipWelcomeBtn).toBeInTheDocument();

      // 2. Start Interactive Guided Tour
      fireEvent.click(exploreBtn);

      await waitFor(() => {
        expect(screen.getByTestId('current-path')).toHaveTextContent('/');
        expect(screen.getByTestId('guided-tour-overlay')).toBeInTheDocument();
      });

      // Step 1: Ana Sayfan
      expect(screen.getByText('Ana Sayfan')).toBeInTheDocument();
      expect(screen.getByText('Her şey burada başlıyor!')).toBeInTheDocument();
      expect(screen.getByTestId('guided-tour-spotlight')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Geri/i })).toBeDisabled();

      // Step 2: Notlar
      fireEvent.click(screen.getByRole('button', { name: /İleri/i }));
      expect(screen.getByText('Notlar', { selector: 'h2' })).toBeInTheDocument();
      expect(screen.getByText('Aradığın ders notlarına buradan ulaşabilirsin.')).toBeInTheDocument();

      // Step 3: Çalışma Stüdyosu (verifies all 6 real AI bullets)
      fireEvent.click(screen.getByRole('button', { name: /İleri/i }));
      expect(screen.getByText('Çalışma Stüdyosu', { selector: 'h2' })).toBeInTheDocument();
      expect(
        screen.getByText('Ders notlarını gerçek bir çalışma materyaline dönüştür!'),
      ).toBeInTheDocument();
      expect(screen.getByText(/Ayrıntılı ders özetleri oluşturabilir/i)).toBeInTheDocument();
      expect(screen.getByText(/Kavram haritalarından yararlanabilir/i)).toBeInTheDocument();

      // Test Keyboard ArrowLeft (Back to Step 2) and ArrowRight (Forward to Step 3 & Step 4)
      fireEvent.keyDown(window, { key: 'ArrowLeft' });
      expect(screen.getByText('Aradığın ders notlarına buradan ulaşabilirsin.')).toBeInTheDocument();
      fireEvent.keyDown(window, { key: 'ArrowRight' });
      fireEvent.keyDown(window, { key: 'ArrowRight' });

      // Step 4: Günlük Bilgi Yarışması
      expect(screen.getByText('Günlük Bilgi Yarışması', { selector: 'h2' })).toBeInTheDocument();
      expect(screen.getByText('Bilgini test et, XP kazan!')).toBeInTheDocument();

      // Step 5: Puanlar ve Liderlik Tablosu
      fireEvent.click(screen.getByRole('button', { name: /İleri/i }));
      expect(screen.getByText('Puanlar ve Liderlik Tablosu')).toBeInTheDocument();
      expect(screen.getByText('Emeğinin karşılığını takip et!')).toBeInTheDocument();

      // Step 6: Mesajlar ve Duyurular
      fireEvent.click(screen.getByRole('button', { name: /İleri/i }));
      expect(screen.getByText('Mesajlar ve Duyurular')).toBeInTheDocument();
      expect(screen.getByText("EconNotes'taki gelişmelerden haberdar ol!")).toBeInTheDocument();

      // Step 7: Profil ve Hesap İşlemleri
      fireEvent.click(screen.getByRole('button', { name: /İleri/i }));
      expect(screen.getByText('Profil ve Hesap İşlemleri')).toBeInTheDocument();
      expect(screen.getByText('Hesabını buradan yönetebilirsin.')).toBeInTheDocument();

      // Contextual tips must stay hidden while tour is active
      expect(screen.queryByTestId('contextual-tip-notes_search')).not.toBeInTheDocument();

      // Final Completion Screen
      fireEvent.click(screen.getByRole('button', { name: /Turu Tamamla/i }));
      expect(screen.getByText("Artık EconNotes'u keşfetmeye hazırsın!")).toBeInTheDocument();
      expect(
        screen.getByText(
          'Eğitim yolculuğunda ihtiyaç duyacağın araçlar artık elinin altında. İyi çalışmalar!',
        ),
      ).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /EconNotes'u Keşfetmeye Başla/i }));

      await waitFor(() => {
        expect(screen.queryByTestId('guided-tour-overlay')).not.toBeInTheDocument();
        expect(screen.getByTestId('onboarding-status')).toHaveTextContent('completed');
      });

      // Persisted to user account via Supabase updateUser & RPC
      expect(mockSupabaseUpdateUser).toHaveBeenCalled();
      expect(mockSupabaseRpc).toHaveBeenCalledWith(
        'save_my_onboarding_state',
        expect.objectContaining({
          _state: expect.objectContaining({ status: 'completed', welcomeSeen: true }),
        }),
      );

      // Contextual tips appear cleanly AFTER tour completion and can be dismissed individually
      expect(screen.getByTestId('contextual-tip-notes_search')).toHaveTextContent(
        CONTEXTUAL_TIPS.notes_search.message,
      );
      expect(screen.getByTestId('contextual-tip-notes_upload')).toHaveTextContent(
        CONTEXTUAL_TIPS.notes_upload.message,
      );
      expect(screen.getByTestId('contextual-tip-study_pdf')).toHaveTextContent(
        CONTEXTUAL_TIPS.study_pdf.message,
      );
      expect(screen.getByTestId('contextual-tip-points_xp')).toHaveTextContent(
        CONTEXTUAL_TIPS.points_xp.message,
      );

      fireEvent.click(screen.getByRole('button', { name: /Hızlı Arama İpucu ipucunu kapat/i }));
      expect(screen.queryByTestId('contextual-tip-notes_search')).not.toBeInTheDocument();
      expect(screen.getByTestId('contextual-tip-study_pdf')).toBeInTheDocument();

      rectSpy.mockRestore();
    });

    it('supports pausing via Esc mid-tour and resuming from exact saved step', async () => {
      mockBoundingRects({
        'dashboard-stats': { top: 210, left: 300, width: 1080, height: 140 },
        'sidebar-nav-notes': { top: 150, left: 22, width: 220, height: 40 },
        'sidebar-nav-study': { top: 320, left: 22, width: 220, height: 40 },
      });

      render(
        <MemoryRouter initialEntries={['/']}>
          <OnboardingProvider>
            <GuidedPlatformTour />
            <Routes>
              <Route path="/" element={<MockAppShellWithRealAnchors />} />
            </Routes>
          </OnboardingProvider>
        </MemoryRouter>,
      );

      fireEvent.click(screen.getByRole('button', { name: 'Platformu Tanı' }));
      fireEvent.click(screen.getByRole('button', { name: /İleri/i })); // Step 2
      fireEvent.click(screen.getByRole('button', { name: /İleri/i })); // Step 3
      expect(screen.getByText('Çalışma Stüdyosu', { selector: 'h2' })).toBeInTheDocument();

      // Pause with Escape
      fireEvent.keyDown(window, { key: 'Escape' });
      await waitFor(() => {
        expect(screen.queryByTestId('guided-tour-overlay')).not.toBeInTheDocument();
      });

      // Resume button appears and returns straight to Step 3
      const resumeBtn = screen.getByRole('button', { name: 'Kaldığın Yerden Devam Et' });
      fireEvent.click(resumeBtn);
      expect(screen.getByText('Çalışma Stüdyosu', { selector: 'h2' })).toBeInTheDocument();
    });

    it('falls back gracefully without drawing a misplaced spotlight when a target is hidden/missing', () => {
      render(
        <MemoryRouter initialEntries={['/']}>
          <OnboardingProvider>
            <GuidedPlatformTour />
            <Routes>
              <Route path="/" element={<MockAppShellWithRealAnchors includeAnchors={false} />} />
            </Routes>
          </OnboardingProvider>
        </MemoryRouter>,
      );

      fireEvent.click(screen.getByRole('button', { name: 'Platformu Tanı' }));
      expect(screen.getByTestId('guided-tour-overlay')).toBeInTheDocument();
      expect(screen.queryByTestId('guided-tour-spotlight')).not.toBeInTheDocument();
      expect(screen.getByTestId('guided-tour-card')).toHaveAttribute(
        'data-layout-mode',
        'desktop-centered',
      );
    });
  });

  describe('4. Mobile viewport adaptation (iPhone/Android)', () => {
    it('switches between mobile bottom sheet, above-bottom-nav floating card, and drawer open event', async () => {
      Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 390 });
      Object.defineProperty(window, 'innerHeight', { writable: true, configurable: true, value: 844 });

      const openSidebarSpy = vi.fn();
      const closeSidebarSpy = vi.fn();
      window.addEventListener('econnotes:open-sidebar', openSidebarSpy);
      window.addEventListener('econnotes:close-sidebar', closeSidebarSpy);

      mockBoundingRects({
        'dashboard-stats': { top: 150, left: 14, width: 362, height: 180 },
        'mobile-nav-notes': { top: 760, left: 82, width: 72, height: 54 },
        'mobile-nav-study': { top: 760, left: 158, width: 72, height: 54 },
        'dashboard-trivia': { top: 200, left: 14, width: 362, height: 180 },
        'dashboard-leaderboard': { top: 200, left: 14, width: 362, height: 220 },
        'mobile-nav-messages': { top: 760, left: 234, width: 72, height: 54 },
        'header-profile': { top: 14, left: 344, width: 32, height: 32 },
      });

      render(
        <MemoryRouter initialEntries={['/']}>
          <OnboardingProvider>
            <GuidedPlatformTour />
            <Routes>
              <Route path="/" element={<MockAppShellWithRealAnchors isMobile />} />
            </Routes>
          </OnboardingProvider>
        </MemoryRouter>,
      );

      fireEvent.click(screen.getByRole('button', { name: 'Platformu Tanı' }));
      // Step 1 on mobile uses bottom sheet
      expect(screen.getByTestId('guided-tour-card')).toHaveAttribute(
        'data-layout-mode',
        'mobile-sheet',
      );

      // Step 2 (Notlar in MobileBottomNav) renders ABOVE bottom nav (zero overlap)
      fireEvent.click(screen.getByRole('button', { name: /İleri/i }));
      expect(screen.getByTestId('guided-tour-card')).toHaveAttribute(
        'data-layout-mode',
        'mobile-above-nav',
      );

      // Step 3 (Stüdyo in MobileBottomNav) also renders ABOVE bottom nav
      fireEvent.click(screen.getByRole('button', { name: /İleri/i }));
      expect(screen.getByTestId('guided-tour-card')).toHaveAttribute(
        'data-layout-mode',
        'mobile-above-nav',
      );

      // Advance to Step 6 (Mesajlar ve Duyurular) -> dispatches econnotes:open-sidebar on mobile
      fireEvent.click(screen.getByRole('button', { name: /İleri/i })); // Step 4
      fireEvent.click(screen.getByRole('button', { name: /İleri/i })); // Step 5
      fireEvent.click(screen.getByRole('button', { name: /İleri/i })); // Step 6
      expect(openSidebarSpy).toHaveBeenCalled();

      // Advance to Step 7 -> closes mobile drawer so top-right profile avatar is unobstructed
      act(() => {
        fireEvent.click(screen.getByRole('button', { name: /İleri/i }));
      });
      expect(closeSidebarSpy).toHaveBeenCalled();

      window.removeEventListener('econnotes:open-sidebar', openSidebarSpy);
      window.removeEventListener('econnotes:close-sidebar', closeSidebarSpy);
    });
  });
});
