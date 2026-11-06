import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTheme } from '@/contexts/ThemeContext';
import EconLogo from '@/components/EconLogo';
import { Button } from '@/components/ui/button';
import { ArrowRight, Menu, X, Sun, Moon } from 'lucide-react';

interface ScrolltideNavbarProps {
  onLoginClick?: () => void;
}

export const ScrolltideNavbar: React.FC<ScrolltideNavbarProps> = ({ onLoginClick }) => {
  const { theme, toggleTheme } = useTheme();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="sticky top-4 z-50 mx-auto w-full max-w-6xl px-4 pointer-events-auto">
      <nav className="relative flex items-center justify-between rounded-full border border-white/15 bg-background/70 dark:bg-black/50 px-3.5 sm:px-6 py-2.5 backdrop-blur-2xl shadow-[0_8px_32px_rgba(0,0,0,0.15)] transition-all">
        {/* Brand Logo — optically centered inside the pill (wordmark sits low in the PNG) */}
        <div className="flex h-9 items-center pl-1 sm:pl-1.5">
          <Link to="/" className="flex h-full items-center group" aria-label="EconNotes ana sayfa">
            <EconLogo className="h-7 w-28 sm:h-8 sm:w-32 -translate-y-[3px] transition-transform duration-300 group-hover:scale-105" />
          </Link>
        </div>

        {/* Desktop Centered Pill Navigation */}
        <div className="hidden md:flex items-center gap-1 rounded-full bg-white/[0.04] dark:bg-white/[0.03] border border-white/10 px-3 py-1 text-xs font-medium text-muted-foreground">
          <a
            href="#ozellikler"
            className="px-3 py-1.5 rounded-full transition-colors hover:text-foreground hover:bg-white/10"
          >
            Özellikler
          </a>
          <a
            href="#studyo"
            className="px-3 py-1.5 rounded-full transition-colors hover:text-foreground hover:bg-white/10"
          >
            Çalışma Stüdyosu
          </a>
          <a
            href="#guvenlik"
            className="px-3 py-1.5 rounded-full transition-colors hover:text-foreground hover:bg-white/10"
          >
            Güvenlik
          </a>
          <Link
            to="/about"
            className="px-3 py-1.5 rounded-full transition-colors hover:text-foreground hover:bg-white/10"
          >
            Hakkında
          </Link>
        </div>

        {/* Right CTA Actions */}
        <div className="flex items-center gap-2">
          {/* Theme Switcher Pill */}
          <button
            onClick={toggleTheme}
            className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-full border border-border/80 bg-background/80 text-muted-foreground transition-all hover:text-foreground hover:scale-105 active:scale-95"
            aria-label={theme === 'dark' ? 'Açık moda geç' : 'Koyu moda geç'}
          >
            {theme === 'dark' ? (
              <Sun className="h-4 w-4 text-amber-300" />
            ) : (
              <Moon className="h-4 w-4 text-blue-600" />
            )}
          </button>

          {/* Login Button */}
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="rounded-full text-xs font-semibold px-3.5 hover:bg-white/10"
          >
            <Link to="/login">Giriş Yap</Link>
          </Button>

          {/* Register Button with Neon Cyan-Blue Sheen */}
          <Button
            asChild
            size="sm"
            className="relative group overflow-hidden rounded-full bg-gradient-to-r from-[#00439c] via-[#0070d1] to-[#00c6ff] px-4 py-1.5 text-xs font-bold text-white shadow-[0_0_20px_rgba(0,112,243,0.35)] transition-all duration-300 hover:shadow-[0_0_28px_rgba(0,198,255,0.55)] hover:scale-[1.02] active:scale-95"
          >
            <Link to="/register" className="flex items-center gap-1.5">
              <span>Hemen Başla</span>
              <ArrowRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-0.5" />
            </Link>
          </Button>

          {/* Mobile Hamburger Toggle */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="flex md:hidden h-8 w-8 items-center justify-center rounded-full border border-border bg-card text-foreground"
            aria-label="Menüyü aç/kapat"
          >
            {mobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </nav>

      {/* Mobile Dropdown Panel */}
      {mobileMenuOpen && (
        <div className="md:hidden mt-2 rounded-2xl border border-white/15 bg-background/95 dark:bg-black/90 p-4 backdrop-blur-2xl shadow-2xl animate-fade-in space-y-3">
          <div className="flex flex-col space-y-2 text-sm font-medium">
            <a
              href="#ozellikler"
              onClick={() => setMobileMenuOpen(false)}
              className="px-3 py-2 rounded-xl hover:bg-white/10"
            >
              Özellikler
            </a>
            <a
              href="#studyo"
              onClick={() => setMobileMenuOpen(false)}
              className="px-3 py-2 rounded-xl hover:bg-white/10"
            >
              Çalışma Stüdyosu
            </a>
            <a
              href="#guvenlik"
              onClick={() => setMobileMenuOpen(false)}
              className="px-3 py-2 rounded-xl hover:bg-white/10"
            >
              Güvenlik
            </a>
            <Link
              to="/about"
              onClick={() => setMobileMenuOpen(false)}
              className="px-3 py-2 rounded-xl hover:bg-white/10"
            >
              Hakkında ve KVKK
            </Link>
          </div>
          <div className="pt-2 border-t border-border/60 flex items-center gap-2">
            <Button asChild variant="outline" className="flex-1 rounded-xl" size="sm">
              <Link to="/login">Giriş Yap</Link>
            </Button>
            <Button
              asChild
              className="flex-1 rounded-xl bg-gradient-to-r from-[#00439c] to-[#0070d1] text-white"
              size="sm"
            >
              <Link to="/register">Kayıt Ol</Link>
            </Button>
          </div>
        </div>
      )}
    </header>
  );
};
