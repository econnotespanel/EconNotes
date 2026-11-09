import { describe, it, expect } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import React from 'react';
import Ataturk10KasimEmblem from '@/components/Ataturk10KasimEmblem';
import AtaturkPortrait from '@/components/AtaturkPortrait';
import EconLogo from '@/components/EconLogo';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { getSeasonalTheme, SEASONAL_THEMES } from '@/contexts/SiteConfigContext';

describe('10 Kasım Atatürk Commemoration Emblem & Theme', () => {
  it('renders Ataturk10KasimEmblem with transparent images for light and dark modes', () => {
    render(<Ataturk10KasimEmblem className="h-8 w-8" />);

    const images = screen.getAllByAltText('10 Kasım 193∞');
    expect(images.length).toBeGreaterThanOrEqual(1);

    const emblemContainer = screen.getByTitle(/10 Kasım Atatürk'ü Anma Günü/i);
    expect(emblemContainer).toBeInTheDocument();
  });

  it('renders allWhite variant when requested', () => {
    render(<Ataturk10KasimEmblem allWhite className="h-6 w-6" />);

    const lightImage = screen.getByAltText('10 Kasım 193∞');
    expect(lightImage).toHaveClass('brightness-0');
    expect(lightImage).toHaveClass('invert');
  });

  it('retrieves november10 seasonal theme correctly from configuration with monochrome tokens', () => {
    const theme = getSeasonalTheme('november10');
    expect(theme).not.toBeNull();
    expect(theme?.id).toBe('november10');
    expect(theme?.label).toBe('10 Kasım');
    expect(theme?.primary).toBe('0 0% 14%');
    expect(theme?.accent).toBe('0 0% 20%');
  });

  it('auto-activates 10 Kasım theme during November 9-11 commemoration period', () => {
    // Test Nov 9th
    const nov9 = getSeasonalTheme('auto', new Date('2026-11-09T10:00:00+03:00'));
    expect(nov9?.id).toBe('november10');

    // Test Nov 10th
    const nov10 = getSeasonalTheme('auto', new Date('2026-11-10T09:05:00+03:00'));
    expect(nov10?.id).toBe('november10');

    // Test Nov 11th
    const nov11 = getSeasonalTheme('auto', new Date('2026-11-11T23:59:59+03:00'));
    expect(nov11?.id).toBe('november10');

    // Other non-holiday date should not be november10
    const nov15 = getSeasonalTheme('auto', new Date('2026-11-15T12:00:00+03:00'));
    expect(nov15?.id).not.toBe('november10');
  });

  it('renders EconLogo with grayscale monochrome filter when show10Kasim is true or 10 Kasım theme is active', () => {
    const { unmount } = render(<EconLogo show10Kasim />);
    const images = screen.getAllByAltText('EconNotes');
    expect(images[0]).toHaveClass('grayscale');
    unmount();

    // Test when document attribute is active initially
    document.documentElement.dataset.seasonalTheme = 'november10';
    const view2 = render(<EconLogo />);
    const themeImages = screen.getAllByAltText('EconNotes');
    expect(themeImages[0]).toHaveClass('grayscale');
    view2.unmount();
    act(() => {
      delete document.documentElement.dataset.seasonalTheme;
    });
  });

  it('renders AtaturkPortrait commemorative picture badge with high contrast portrait', () => {
    render(<AtaturkPortrait className="h-7 w-auto" />);
    const portrait = screen.getByAltText('Mustafa Kemal Atatürk');
    expect(portrait).toBeInTheDocument();
    expect(portrait).toHaveClass('object-contain');
    const container = screen.getByTitle(/Ulu Önder Gazi Mustafa Kemal Atatürk/i);
    expect(container).toBeInTheDocument();
  });

  it('renders logout AlertDialog with proper z-[100] layering without portal positioning issues under 10 Kasım theme', () => {
    document.documentElement.dataset.seasonalTheme = 'november10';
    try {
      render(
        <AlertDialog defaultOpen>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Çıkış Yapılsın mı?</AlertDialogTitle>
              <AlertDialogDescription>Oturumunuz sonlandırılacaktır.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Vazgeç</AlertDialogCancel>
              <AlertDialogAction>Çıkış Yap</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      );

      const title = screen.getByText('Çıkış Yapılsın mı?');
      expect(title).toBeInTheDocument();
      const content = title.closest('[role="alertdialog"]');
      expect(content).toBeInTheDocument();
      expect(content).toHaveClass('z-[100]');
    } finally {
      delete document.documentElement.dataset.seasonalTheme;
    }
  });
});
