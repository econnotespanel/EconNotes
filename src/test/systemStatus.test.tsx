import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SystemGate from '@/components/SystemGate';

const mockUseAuth = vi.fn();
const mockUseSystemStatus = vi.fn();

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock('@/hooks/useSystemStatus', () => ({
  useSystemStatus: () => mockUseSystemStatus(),
}));

describe('SystemGate & Maintenance Recognition', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders children when system is open', () => {
    mockUseAuth.mockReturnValue({ isAdmin: false, loading: false });
    mockUseSystemStatus.mockReturnValue({
      systemOpen: true,
      closureTitle: null,
      closureMessage: null,
      closureMode: 'maintenance',
    });

    render(
      <MemoryRouter initialEntries={['/']}>
        <SystemGate>
          <div>Öğrenci Paneli Açık</div>
        </SystemGate>
      </MemoryRouter>
    );

    expect(screen.getByText('Öğrenci Paneli Açık')).toBeInTheDocument();
  });

  it('shields visitors with MaintenanceScreen when system is closed (maintenance mode recognized)', () => {
    mockUseAuth.mockReturnValue({ isAdmin: false, loading: false });
    mockUseSystemStatus.mockReturnValue({
      systemOpen: false,
      closureTitle: 'Altyapı Yenileme Çalışması',
      closureMessage: 'Sınav öncesi sunucularımız bakıma alınmıştır.',
      closureMode: 'maintenance',
    });

    render(
      <MemoryRouter initialEntries={['/notes']}>
        <SystemGate>
          <div>Öğrenci Notları</div>
        </SystemGate>
      </MemoryRouter>
    );

    expect(screen.queryByText('Öğrenci Notları')).not.toBeInTheDocument();
    expect(screen.getByText('Altyapı Yenileme Çalışması')).toBeInTheDocument();
    expect(screen.getAllByText('Sınav öncesi sunucularımız bakıma alınmıştır.').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Yönetici Girişi')).toBeInTheDocument();
  });

  it('allows administrators full access even when system is in maintenance mode', () => {
    mockUseAuth.mockReturnValue({ isAdmin: true, loading: false });
    mockUseSystemStatus.mockReturnValue({
      systemOpen: false,
      closureTitle: 'Sistem Kapalı',
      closureMessage: 'Bakım devam ediyor',
      closureMode: 'maintenance',
    });

    render(
      <MemoryRouter initialEntries={['/notes']}>
        <SystemGate>
          <div>Öğrenci Notları (Yönetici İncelemesi)</div>
        </SystemGate>
      </MemoryRouter>
    );

    expect(screen.getByText('Öğrenci Notları (Yönetici İncelemesi)')).toBeInTheDocument();
  });

  it('allows access to /login during maintenance so administrators can sign in', () => {
    mockUseAuth.mockReturnValue({ isAdmin: false, loading: false });
    mockUseSystemStatus.mockReturnValue({
      systemOpen: false,
      closureTitle: 'Sistem Kapalı',
      closureMessage: 'Bakım devam ediyor',
      closureMode: 'maintenance',
    });

    render(
      <MemoryRouter initialEntries={['/login']}>
        <SystemGate>
          <div>Giriş Yap Sayfası</div>
        </SystemGate>
      </MemoryRouter>
    );

    expect(screen.getByText('Giriş Yap Sayfası')).toBeInTheDocument();
  });

  it('renders FatalErrorScreen when closureMode is fatal_error and system is closed', () => {
    mockUseAuth.mockReturnValue({ isAdmin: false, loading: false });
    mockUseSystemStatus.mockReturnValue({
      systemOpen: false,
      closureTitle: 'Sunucu Arızası',
      closureMessage: 'Teknik aksaklık yaşanmaktadır.',
      closureMode: 'fatal_error',
    });

    render(
      <MemoryRouter initialEntries={['/']}>
        <SystemGate>
          <div>Anasayfa İçeriği</div>
        </SystemGate>
      </MemoryRouter>
    );

    expect(screen.queryByText('Anasayfa İçeriği')).not.toBeInTheDocument();
    expect(screen.getByText('CRITICAL SERVICE INTERRUPTION')).toBeInTheDocument();
    expect(screen.getByText('500')).toBeInTheDocument();
    expect(screen.getByText('Sunucu Arızası')).toBeInTheDocument();
  });
});
