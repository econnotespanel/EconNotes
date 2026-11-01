import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface SiteTheme {
  primary?: string;
  accent?: string;
  neon?: string;
  radius?: string;
  seasonalMode?: SeasonalThemeId;
}

export type SeasonalThemeId =
  | 'default'
  | 'auto'
  | 'march18'
  | 'october29'
  | 'april23'
  | 'may19'
  | 'november10'
  | 'ramadan'
  | 'sacrifice'
  | 'newYear';

export interface SeasonalTheme {
  id: Exclude<SeasonalThemeId, 'default' | 'auto'>;
  label: string;
  emoji: string;
  primary: string;
  accent: string;
  neon: string;
  from?: string;
  to?: string;
}

export const SEASONAL_THEMES: SeasonalTheme[] = [
  { id: 'march18', label: '18 Mart Çanakkale', emoji: '🌹', primary: '351 73% 45%', accent: '345 42% 20%', neon: '42 90% 58%' },
  { id: 'october29', label: '29 Ekim Cumhuriyet', emoji: '🇹🇷', primary: '0 72% 48%', accent: '0 42% 20%', neon: '45 96% 58%' },
  { id: 'april23', label: '23 Nisan', emoji: '🎈', primary: '4 78% 55%', accent: '205 52% 24%', neon: '191 88% 62%' },
  { id: 'may19', label: '19 Mayıs', emoji: '🇹🇷', primary: '200 82% 45%', accent: '200 42% 20%', neon: '0 78% 58%' },
  { id: 'november10', label: '10 Kasım', emoji: '🖤', primary: '220 18% 38%', accent: '220 18% 16%', neon: '42 70% 55%' },
  { id: 'ramadan', label: 'Ramazan Bayramı', emoji: '🌙', primary: '262 65% 52%', accent: '262 35% 20%', neon: '45 92% 63%' },
  { id: 'sacrifice', label: 'Kurban Bayramı', emoji: '✨', primary: '160 62% 38%', accent: '160 32% 18%', neon: '42 92% 60%' },
  { id: 'newYear', label: 'Yılbaşı', emoji: '🎄', primary: '145 58% 34%', accent: '145 30% 17%', neon: '0 78% 60%' },
];

const BAYRAM_DATES: Record<number, { ramadan: [string, string]; sacrifice: [string, string] }> = {
  2026: { ramadan: ['03-20', '03-22'], sacrifice: ['05-27', '05-30'] },
  2027: { ramadan: ['03-09', '03-11'], sacrifice: ['05-16', '05-19'] },
  2028: { ramadan: ['02-26', '02-28'], sacrifice: ['05-06', '05-09'] },
  2029: { ramadan: ['02-15', '02-17'], sacrifice: ['04-24', '04-27'] },
  2030: { ramadan: ['02-05', '02-07'], sacrifice: ['04-15', '04-18'] },
};

export function getSeasonalTheme(id: SeasonalThemeId, date = new Date()): SeasonalTheme | null {
  if (id !== 'auto') return SEASONAL_THEMES.find(theme => theme.id === id) || null;
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' });
  const parts = formatter.formatToParts(date);
  const year = Number(parts.find(part => part.type === 'year')?.value);
  const month = parts.find(part => part.type === 'month')?.value || '';
  const day = parts.find(part => part.type === 'day')?.value || '';
  const current = `${month}-${day}`;
  const fixed: Array<[Exclude<SeasonalThemeId, 'default' | 'auto'>, string, string]> = [
    ['newYear', '12-20', '01-07'],
    ['march18', '03-18', '03-18'],
    ['april23', '04-23', '04-23'],
    ['may19', '05-19', '05-19'],
    ['october29', '10-29', '10-29'],
    ['november10', '11-10', '11-10'],
  ];
  const match = fixed.find(([, from, to]) => from === to ? current === from : (current >= from || current <= to));
  if (match) return SEASONAL_THEMES.find(theme => theme.id === match[0]) || null;
  const bayram = BAYRAM_DATES[year];
  if (bayram) {
    const bayramMatch = (Object.entries(bayram) as Array<[Exclude<SeasonalThemeId, 'default' | 'auto'>, [string, string]]>)
      .find(([, [from, to]]) => current >= from && current <= to);
    if (bayramMatch) return SEASONAL_THEMES.find(theme => theme.id === bayramMatch[0]) || null;
  }
  return null;
}

export interface SiteConfig {
  id?: string;
  brand_name: string;
  tagline: string | null;
  logo_url: string | null;
  theme: SiteTheme;
  pages: Record<string, boolean>;
}

/** Yönetici panelinden anlık açılıp kapatılabilen sayfalar. */
export const MANAGED_PAGES: { path: string; label: string }[] = [
  { path: '/notes', label: 'Notlar' },
  { path: '/announcements', label: 'Duyurular' },
  { path: '/messages', label: 'Mesajlar' },
  { path: '/study', label: 'Çalışma Stüdyosu' },
  { path: '/kpss', label: 'KPSS Merkezi' },
  { path: '/live-class', label: 'Canlı Ders' },
  { path: '/assistant', label: 'Akademik Asistan' },
  { path: '/points', label: 'Puan Geçmişim' },
  { path: '/profile', label: 'Profilim' },
  { path: '/about', label: 'Hakkında' },
];

const DEFAULT_CONFIG: SiteConfig = {
  brand_name: 'EconNotes',
  tagline: null,
  logo_url: null,
  theme: {},
  pages: {},
};

interface Ctx {
  config: SiteConfig;
  loading: boolean;
  refresh: () => Promise<void>;
  isPageEnabled: (path: string) => boolean;
}

const SiteConfigContext = createContext<Ctx>({
  config: DEFAULT_CONFIG,
  loading: true,
  refresh: async () => {},
  isPageEnabled: () => true,
});

export const useSiteConfig = () => useContext(SiteConfigContext);

/** Tema tokenlarını canlı olarak kök elemana uygular. */
const applyTheme = (theme: SiteTheme) => {
  const root = document.documentElement;
  const set = (name: string, value?: string) => {
    if (value && value.trim()) root.style.setProperty(name, value.trim());
    else root.style.removeProperty(name);
  };
  set('--primary', theme.primary);
  set('--ring', theme.primary);
  set('--sidebar-primary', theme.primary);
  set('--accent', theme.accent);
  set('--neon-cyan', theme.neon);
  set('--radius', theme.radius);
  const seasonal = getSeasonalTheme(theme.seasonalMode || 'default');
  if (seasonal) {
    set('--primary', seasonal.primary);
    set('--ring', seasonal.primary);
    set('--sidebar-primary', seasonal.primary);
    set('--accent', seasonal.accent);
    set('--neon-cyan', seasonal.neon);
    root.dataset.seasonalTheme = seasonal.id;
    root.dataset.seasonalLabel = `${seasonal.emoji} ${seasonal.label}`;
  } else {
    delete root.dataset.seasonalTheme;
    delete root.dataset.seasonalLabel;
  }
};

export const SiteConfigProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [config, setConfig] = useState<SiteConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const { data, error } = await (supabase as any)
        .from('site_config')
        .select('*')
        .limit(1)
        .maybeSingle();
      if (error) {
        console.error('Site config yüklenemedi:', error);
        return;
      }
      if (data) {
        const next: SiteConfig = {
          id: data.id,
          brand_name: data.brand_name || 'EconNotes',
          tagline: data.tagline ?? null,
          logo_url: data.logo_url ?? null,
          theme: (data.theme || {}) as SiteTheme,
          pages: (data.pages || {}) as Record<string, boolean>,
        };
        setConfig(next);
        applyTheme(next.theme);
        document.title = `${next.brand_name}${next.tagline ? ' — ' + next.tagline : ''}`;
      }
    } catch (error) {
      console.error('Site config isteği başarısız:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const interval = setInterval(() => { void refresh(); }, 60000);
    return () => clearInterval(interval);
  }, [refresh]);

  const isPageEnabled = useCallback(
    (path: string) => config.pages?.[path] !== false,
    [config.pages],
  );

  return (
    <SiteConfigContext.Provider value={{ config, loading, refresh, isPageEnabled }}>
      {children}
    </SiteConfigContext.Provider>
  );
};
