import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTheme } from '@/contexts/ThemeContext';
import EconLogo from '@/components/EconLogo';
import Ataturk10KasimEmblem from '@/components/Ataturk10KasimEmblem';
import AtaturkPortrait from '@/components/AtaturkPortrait';
import { getSeasonalTheme, useSiteConfig } from '@/contexts/SiteConfigContext';
import { Button } from '@/components/ui/button';
import { ArrowRight, Menu, X, Sun, Moon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ScrolltideNavbarProps {
  onLoginClick?: () => void;
}

export const ScrolltideNavbar: React.FC<ScrolltideNavbarProps> = ({ onLoginClick }) => {
  const { theme, toggleTheme } = useTheme();
  const { config } = useSiteConfig();
  const seasonalTheme = getSeasonalTheme(config.theme.seasonalMode || 'default');
  const isNovember10 = seasonalTheme?.id === 'november10';
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header
      className="sticky z-50 mx-auto w-full max-w-6xl px-3 sm:px-4 pointer-events-auto"
      style={{ top: 'calc(env(safe-area-inset-top, 0px) + 0.75rem)' }}
    >
      <nav className="relative flex items-center justify-between gap-2 rounded-full border border-slate-200/85 dark:border-white/15 bg-white/85 dark:bg-black/55 px-3 sm:px-6 py-2 sm:py-2.5 backdrop-blur-2xl shadow-[0_8px_32px_rgba(15,23,42,0.08)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.25)] transition-all">
        {/* Brand Logo — optically centered inside the pill (wordmark sits low in the PNG) */}
        <div className="flex h-8 sm:h-9 shrink-0 items-center pl-1 sm:pl-1.5">
          <Link to="/" className="flex h-full items-center gap-2 group" aria-label="EconNotes ana sayfa">
            <EconLogo className="h-6 w-auto sm:h-8 -translate-y-[2.5px] sm:-translate-y-[3px] transition-transform duration-300 group-hover:scale-105" />
            {isNovember10 && (
              <span className="flex items-center gap-1.5 border-l border-slate-300 dark:border-white/20 pl-2 -translate-y-[1px]">
                <AtaturkPortrait className="h-6 w-auto sm:h-7" />
                <Ataturk10KasimEmblem className="h-5 w-5 sm:h-6 sm:w-6" />
                <span className="hidden sm:inline font-sans text-xs text-muted-foreground font-bold">193&infin;</span>
              </span>
            )}
          </Link>
        </div>

        {/* Desktop Centered Pill Navigation */}
        <div className="hidden md:flex items-center gap-1 rounded-full bg-slate-100/80 dark:bg-white/[0.03] border border-slate-200/80 dark:border-white/10 px-3 py-1 text-xs font-medium text-muted-foreground">
          <a
            href="#ozellikler"
            className="px-3 py-1.5 rounded-full transition-colors hover:text-foreground hover:bg-white dark:hover:bg-white/10"
          >
            Özellikler
          </a>
          <a
            href="#studyo"
            className="px-3 py-1.5 rounded-full transition-colors hover:text-foreground hover:bg-white dark:hover:bg-white/10"
          >
            Çalışma Stüdyosu
          </a>
          <a
            href="#guvenlik"
            className="px-3 py-1.5 rounded-full transition-colors hover:text-foreground hover:bg-white dark:hover:bg-white/10"
          >
            Güvenlik
          </a>
          <Link
            to="/about"
            className="px-3 py-1.5 rounded-full transition-colors hover:text-foreground hover:bg-white dark:hover:bg-white/10"
          >
            Hakkında
          </Link>
        </div>

        {/* Right CTA Actions */}
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          {/* Theme Switcher Pill */}
          <button
            onClick={toggleTheme}
            className="flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-full border border-slate-200/90 dark:border-border/80 bg-background/90 text-muted-foreground transition-all hover:text-foreground hover:scale-105 active:scale-95"
            aria-label={theme === 'dark' ? 'Açık moda geç' : 'Koyu moda geç'}
          >
            {theme === 'dark' ? (
              <Sun className="h-4 w-4 text-amber-300" />
            ) : (
              <Moon className="h-4 w-4 text-blue-600" />
            )}
          </button>

          {/* Login Button — desktop/tablet inline, mobile inside menu & hero */}
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="hidden sm:inline-flex rounded-full text-xs font-semibold px-3.5 hover:bg-slate-100 dark:hover:bg-white/10"
          >
            <Link to="/login" onClick={onLoginClick}>
              Giriş Yap
            </Link>
          </Button>

          {/* Register Button with Neon Cyan-Blue Sheen (Monochrome in 10 Kasım) */}
          <Button
            asChild
            size="sm"
            className={cn(
              "relative group overflow-hidden rounded-full h-8 sm:h-9 px-3 sm:px-4 text-xs font-bold text-white transition-all duration-300 hover:scale-[1.02] active:scale-95 whitespace-nowrap",
              isNovember10
                ? "bg-zinc-900 shadow-none hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-white"
                : "bg-gradient-to-r from-[#00439c] via-[#0070d1] to-[#00c6ff] shadow-[0_0_20px_rgba(0,112,243,0.3)] hover:shadow-[0_0_28px_rgba(0,198,255,0.5)]"
            )}
          >
            <Link to="/register" className="flex items-center gap-1.5">
              <span>Hemen Başla</span>
              <ArrowRight className="hidden sm:inline-block h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-0.5" />
            </Link>
          </Button>

          {/* Mobile Hamburger Toggle */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="flex md:hidden h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200/90 dark:border-border bg-background/90 dark:bg-card text-foreground transition-colors hover:bg-muted"
            aria-label="Menüyü aç/kapat"
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </nav>

      {/* Mobile Dropdown Panel */}
      {mobileMenuOpen && (
        <div className="md:hidden mt-2 rounded-2xl border border-slate-200/85 dark:border-white/15 bg-white/95 dark:bg-slate-950/95 p-4 backdrop-blur-2xl shadow-2xl animate-fade-in space-y-3">
          <div className="flex flex-col space-y-1 text-sm font-medium text-foreground">
            <a
              href="#ozellikler"
              onClick={() => setMobileMenuOpen(false)}
              className="px-3 py-2 rounded-xl hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
            >
              Özellikler
            </a>
            <a
              href="#studyo"
              onClick={() => setMobileMenuOpen(false)}
              className="px-3 py-2 rounded-xl hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
            >
              Çalışma Stüdyosu
            </a>
            <a
              href="#guvenlik"
              onClick={() => setMobileMenuOpen(false)}
              className="px-3 py-2 rounded-xl hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
            >
              Güvenlik
            </a>
            <Link
              to="/about"
              onClick={() => setMobileMenuOpen(false)}
              className="px-3 py-2 rounded-xl hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
            >
              Hakkında ve KVKK
            </Link>
          </div>
          <div className="pt-2.5 border-t border-border/60 flex items-center gap-2">
            <Button
              asChild
              variant="outline"
              className="flex-1 rounded-xl"
              size="sm"
              onClick={() => setMobileMenuOpen(false)}
            >
              <Link to="/login">Giriş Yap</Link>
            </Button>
            <Button
              asChild
              className={cn(
                "flex-1 rounded-xl text-white",
                isNovember10
                  ? "bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-white"
                  : "bg-gradient-to-r from-[#00439c] to-[#0070d1]"
              )}
              size="sm"
              onClick={() => setMobileMenuOpen(false)}
            >
              <Link to="/register">Kayıt Ol</Link>
            </Button>
          </div>
        </div>
      )}
    </header>
  );
};
