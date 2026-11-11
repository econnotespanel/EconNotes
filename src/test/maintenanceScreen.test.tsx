import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import MaintenanceScreen from '@/components/MaintenanceScreen';
import { APP_VERSION_LABEL } from '@/lib/version';

describe('MaintenanceScreen Modern Hub', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders default maintenance screen with logo, version label and services', () => {
    render(
      <MemoryRouter>
        <MaintenanceScreen />
      </MemoryRouter>
    );

    expect(screen.getByText('Platformumuzda Bakım Çalışması Yürütülüyor')).toBeInTheDocument();
    expect(screen.getByText(APP_VERSION_LABEL)).toBeInTheDocument();
    expect(screen.getByText('Yönetici Girişi')).toBeInTheDocument();
    expect(screen.getByText('Ders Notları ve Çalışma Stüdyosu')).toBeInTheDocument();
    expect(screen.getByText('Not Arşivi ve Veri Güvenliği')).toBeInTheDocument();
    expect(screen.getByText('EconNotes, Düzce Üniversitesi öğrencileri tarafından geliştirilmiştir.')).toBeInTheDocument();
  });

  it('renders custom title, message and mode badge', () => {
    render(
      <MemoryRouter>
        <MaintenanceScreen
          title="Finallere Hazırlık Altyapı Güçlendirmesi"
          message="Final sınavları haftası öncesinde öğrenci yoğunluğunu karşılamak için sunucu kapasitesi artırılıyor."
          mode="exam_break"
        />
      </MemoryRouter>
    );

    expect(screen.getByText('Finallere Hazırlık Altyapı Güçlendirmesi')).toBeInTheDocument();
    expect(
      screen.getAllByText(
        'Final sınavları haftası öncesinde öğrenci yoğunluğunu karşılamak için sunucu kapasitesi artırılıyor.'
      ).length
    ).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Sınav Hazırlığı')).toBeInTheDocument();
  });

  it('renders countdown clock when closedUntil is provided', () => {
    const futureDate = new Date(Date.now() + 1000 * 60 * 60 * 24 * 3).toISOString();

    render(
      <MemoryRouter>
        <MaintenanceScreen closedUntil={futureDate} />
      </MemoryRouter>
    );

    expect(screen.getByText('Planlanan Yeniden Açılış')).toBeInTheDocument();
    expect(screen.getByText('Geri Sayım Sürüyor')).toBeInTheDocument();
    expect(screen.getByText('Gün')).toBeInTheDocument();
    expect(screen.getByText('Saat')).toBeInTheDocument();
  });

  it('allows navigating to Canlı Konsol and Mini Oyun tabs', () => {
    render(
      <MemoryRouter>
        <MaintenanceScreen />
      </MemoryRouter>
    );

    // Tab 2: Canlı Konsol
    const consoleTabBtn = screen.getByRole('button', { name: /Canlı Konsol/i });
    fireEvent.click(consoleTabBtn);
    expect(screen.getByText('ops-worker@econnotes-cloud:~')).toBeInTheDocument();

    // Tab 3: Mini Oyun
    const gameTabBtn = screen.getByRole('button', { name: /Mini Oyun/i });
    fireEvent.click(gameTabBtn);
    expect(screen.getByText('EconNotes Catcher')).toBeInTheDocument();
    expect(screen.getByText('Bekleme Odası Oyunu')).toBeInTheDocument();

    // Tab 4: S.S.S.
    const faqTabBtn = screen.getByRole('button', { name: /S\.S\.S\./i });
    fireEvent.click(faqTabBtn);
    expect(
      screen.getByText('Yüklediğim ders notları, özetler veya kazandığım puanlar silinecek mi?')
    ).toBeInTheDocument();
  });

  it('dispatches econnotes:system-changed event when refresh button is clicked', () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

    render(
      <MemoryRouter>
        <MaintenanceScreen />
      </MemoryRouter>
    );

    const refreshBtn = screen.getByRole('button', { name: /Durumu Yenile/i });
    fireEvent.click(refreshBtn);

    expect(dispatchSpy).toHaveBeenCalledWith(expect.any(Event));
  });
});
