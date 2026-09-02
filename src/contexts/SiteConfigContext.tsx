import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface SiteTheme {
  primary?: string;
  accent?: string;
  neon?: string;
  radius?: string;
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
};

export const SiteConfigProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [config, setConfig] = useState<SiteConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const { data } = await (supabase as any)
      .from('site_config')
      .select('*')
      .limit(1)
      .maybeSingle();
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
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
    const interval = setInterval(() => { void refresh(); }, 20000);
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
