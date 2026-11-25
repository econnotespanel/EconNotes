import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { User } from '@supabase/supabase-js';

const mockAuthState = vi.hoisted(() => ({
  user: null as User | null,
  profile: null as Record<string, any> | null,
  isAdmin: false,
  isApproved: false,
  loading: false,
}));

const mockRefreshProfile = vi.hoisted(() => vi.fn(async () => {}));
const mockSignOut = vi.hoisted(() => vi.fn(async () => {}));
const mockToggleTheme = vi.hoisted(() => vi.fn());
const mockToastSuccess = vi.hoisted(() => vi.fn());
const mockToastInfo = vi.hoisted(() => vi.fn());
const mockToastError = vi.hoisted(() => vi.fn());

const mockProfileQueryResult = vi.hoisted(() => ({
  data: { approval_status: 'pending', approved_at: null, rejection_reason: null } as Record<
    string,
    any
  > | null,
  error: null as { message: string } | null,
}));

const mockMaybeSingle = vi.hoisted(() => vi.fn(async () => mockProfileQueryResult));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: mockMaybeSingle,
        })),
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
    signOut: mockSignOut,
    refreshProfile: mockRefreshProfile,
  }),
}));

vi.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({
    theme: 'light',
    toggleTheme: mockToggleTheme,
  }),
}));

vi.mock('@/contexts/SiteConfigContext', () => ({
  useSiteConfig: () => ({
    config: { theme: { seasonalMode: 'default' } },
  }),
  getSeasonalTheme: () => null,
}));

vi.mock('sonner', () => ({
  toast: {
    success: mockToastSuccess,
    info: mockToastInfo,
    error: mockToastError,
  },
}));

import WaitingRoomScreen, {
  buildApplicationSteps,
  extractRejectionReason,
} from '@/components/WaitingRoomScreen';
import ApprovalGate from '@/components/ApprovalGate';

function createPendingUser(overrides: Partial<User> = {}): User {
  return {
    id: 'pending-user-123',
    aud: 'authenticated',
    role: 'authenticated',
    email: 'mehmet.demir@duzce.edu.tr',
    created_at: '2026-11-25T16:30:00.000Z',
    app_metadata: {},
    user_metadata: {
      full_name: 'Mehmet Demir',
      university: 'Düzce Üniversitesi',
      department: 'İktisat',
      grade: 2,
    },
    ...overrides,
  } as User;
}

describe('EconNotes Kayıt Bekleme Odası (WaitingRoomScreen & ApprovalGate)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProfileQueryResult.data = {
      approval_status: 'pending',
      approved_at: null,
      rejection_reason: null,
    };
    mockProfileQueryResult.error = null;

    mockAuthState.user = createPendingUser();
    mockAuthState.profile = {
      user_id: 'pending-user-123',
      full_name: 'Mehmet Demir',
      university: 'Düzce Üniversitesi',
      department: 'İktisat',
      grade: 2,
      approval_status: 'pending',
      rejection_reason: null,
      created_at: '2026-11-25T16:30:00.000Z',
    };
    mockAuthState.isAdmin = false;
    mockAuthState.isApproved = false;
    mockAuthState.loading = false;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('1. Dynamic 3-step application status builder', () => {
    it('never marks unapproved steps as completed while pending', () => {
      const steps = buildApplicationSteps('pending');
      expect(steps).toHaveLength(3);
      expect(steps[0]).toMatchObject({ title: 'Başvuru Alındı', subtitle: 'Tamamlandı', status: 'completed' });
      expect(steps[1]).toMatchObject({ title: 'Yönetici İncelemesi', subtitle: 'Devam Ediyor', status: 'current' });
      expect(steps[2]).toMatchObject({
        title: 'Hesap Erişimi',
        subtitle: 'Onay sonrasında açılacak',
        status: 'upcoming',
      });
    });

    it('marks stage 2 as rejected and keeps stage 3 locked when rejected', () => {
      const steps = buildApplicationSteps('rejected');
      expect(steps[0].status).toBe('completed');
      expect(steps[1].status).toBe('rejected');
      expect(steps[2].status).toBe('upcoming');
    });

    it('marks all 3 stages completed only when approved', () => {
      const steps = buildApplicationSteps('approved');
      expect(steps.every((s) => s.status === 'completed')).toBe(true);
    });

    it('extracts real rejection reason without fabricating one when missing', () => {
      expect(extractRejectionReason({ rejection_reason: 'Öğrenci belgesi doğrulanamadı.' }, {})).toBe(
        'Öğrenci belgesi doğrulanamadı.',
      );
      expect(extractRejectionReason({ rejection_reason: '   ' }, {})).toBeNull();
      expect(extractRejectionReason(null, null)).toBeNull();
    });
  });

  describe('2. Redesigned Waiting Room UI & registration information', () => {
    it('renders exact hero copy, badge, 3-step progress, all 5 registration fields, and info card', () => {
      render(
        <MemoryRouter initialEntries={['/']}>
          <WaitingRoomScreen />
        </MemoryRouter>,
      );

      expect(screen.getByRole('heading', { name: /Hoş Geldiniz,\s*Mehmet Demir!/i })).toBeInTheDocument();
      expect(
        screen.getByText(
          'EconNotes topluluğuna katılım başvurunuz başarıyla alındı. Hesabınız şu anda yönetici ekibimizin incelemesindedir.',
        ),
      ).toBeInTheDocument();
      expect(screen.getByTestId('waiting-status-badge')).toHaveTextContent('Yönetici Onayı Bekleniyor');

      // 3-step visual progress indicator
      expect(screen.getByTestId('application-step-received')).toHaveAttribute('data-step-status', 'completed');
      expect(screen.getByTestId('application-step-review')).toHaveAttribute('data-step-status', 'current');
      expect(screen.getByTestId('application-step-access')).toHaveAttribute('data-step-status', 'upcoming');

      // All 5 registration fields
      const regCard = screen.getByTestId('waiting-registration-info');
      expect(regCard).toHaveTextContent('Ad Soyad');
      expect(regCard).toHaveTextContent('Mehmet Demir');
      expect(regCard).toHaveTextContent('E-posta');
      expect(regCard).toHaveTextContent('mehmet.demir@duzce.edu.tr');
      expect(regCard).toHaveTextContent('Üniversite');
      expect(regCard).toHaveTextContent('Düzce Üniversitesi');
      expect(regCard).toHaveTextContent('Bölüm ve Sınıf');
      expect(regCard).toHaveTextContent('İktisat • 2. Sınıf');
      expect(regCard).toHaveTextContent('Kayıt Tarihi');

      // Simplified info card text
      expect(
        screen.getByText(
          "Hesabınız onaylandığında EconNotes'un tüm özelliklerine otomatik olarak erişebileceksiniz.",
        ),
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          /Ders notları, Çalışma Stüdyosu, KPSS Merkezi, Akademik Asistan ve diğer özellikler/i,
        ),
      ).toBeInTheDocument();

      // Top bar theme & sign-out controls
      fireEvent.click(screen.getByRole('button', { name: /Koyu moda geç/i }));
      expect(mockToggleTheme).toHaveBeenCalledTimes(1);

      fireEvent.click(screen.getByRole('button', { name: /Çıkış Yap/i }));
      expect(mockSignOut).toHaveBeenCalledTimes(1);
    });

    it('displays real rejection reason when application is rejected', () => {
      mockAuthState.profile = {
        ...mockAuthState.profile,
        approval_status: 'rejected',
        rejection_reason: 'Girilen üniversite ve bölüm bilgileri doğrulanamadı.',
      };

      render(
        <MemoryRouter initialEntries={['/']}>
          <WaitingRoomScreen />
        </MemoryRouter>,
      );

      expect(screen.getByTestId('waiting-status-badge')).toHaveTextContent('Başvuru Onaylanmadı');
      expect(screen.getByTestId('rejection-reason-card')).toHaveTextContent(
        'Girilen üniversite ve bölüm bilgileri doğrulanamadı.',
      );
      expect(screen.getByTestId('application-step-review')).toHaveAttribute('data-step-status', 'rejected');
    });
  });

  describe('3. Live approval status tracking & ApprovalGate auto-unlock', () => {
    it('polls calmly in background and refreshes profile automatically when backend approves user', async () => {
      vi.useFakeTimers();

      render(
        <MemoryRouter initialEntries={['/']}>
          <WaitingRoomScreen />
        </MemoryRouter>,
      );

      // Simulate admin approving the user in backend
      mockProfileQueryResult.data = {
        approval_status: 'approved',
        approved_at: '2026-11-25T17:00:00.000Z',
        rejection_reason: null,
      };

      await act(async () => {
        vi.advanceTimersByTime(20_500);
        await Promise.resolve();
      });

      expect(mockMaybeSingle).toHaveBeenCalledTimes(1);
      expect(mockRefreshProfile).toHaveBeenCalledTimes(1);
    });

    it('blocks unapproved access in ApprovalGate and automatically unlocks with toast once approved', async () => {
      const { rerender } = render(
        <MemoryRouter initialEntries={['/']}>
          <ApprovalGate>
            <Routes>
              <Route path="/" element={<div data-testid="unlocked-dashboard">Dashboard Açık</div>} />
            </Routes>
          </ApprovalGate>
        </MemoryRouter>,
      );

      expect(screen.getByTestId('waiting-room-screen')).toBeInTheDocument();
      expect(screen.queryByTestId('unlocked-dashboard')).not.toBeInTheDocument();

      // Admin approves the user -> AuthContext updates isApproved=true
      mockAuthState.profile = { ...mockAuthState.profile, approval_status: 'approved' };
      mockAuthState.isApproved = true;

      rerender(
        <MemoryRouter initialEntries={['/']}>
          <ApprovalGate>
            <Routes>
              <Route path="/" element={<div data-testid="unlocked-dashboard">Dashboard Açık</div>} />
            </Routes>
          </ApprovalGate>
        </MemoryRouter>,
      );

      await waitFor(() => {
        expect(screen.getByTestId('unlocked-dashboard')).toBeInTheDocument();
        expect(mockToastSuccess).toHaveBeenCalledWith(
          'Hesabınız onaylandı!',
          expect.objectContaining({
            description: "EconNotes'un tüm özelliklerine erişiminiz açıldı.",
          }),
        );
      });
    });
  });
});
