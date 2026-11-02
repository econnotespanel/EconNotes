import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Heart,
  Zap,
  ShieldCheck,
  CheckCircle2,
  ArrowRight,
  X,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

// 22:00 Turkey time (UTC+3) on 2026-11-02
const TARGET_REOPEN_TIME = new Date('2026-11-02T22:00:00+03:00').getTime();
const STORAGE_KEY = 'econnotes_welcome_back_2200_seen';
const BANNER_DISMISSED_KEY = 'econnotes_welcome_banner_2200_dismissed';

export const WelcomeBackCelebration = () => {
  const [open, setOpen] = useState(false);
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    const checkActivation = () => {
      const isPastTarget = Date.now() >= TARGET_REOPEN_TIME;
      const alreadySeen = localStorage.getItem(STORAGE_KEY) === 'true';
      const bannerDismissed = localStorage.getItem(BANNER_DISMISSED_KEY) === 'true';

      if (isPastTarget) {
        if (!alreadySeen) {
          setOpen(true);
        }
        if (!bannerDismissed) {
          setShowBanner(true);
        }
      }
    };

    checkActivation();
    const interval = setInterval(checkActivation, 2000);
    return () => clearInterval(interval);
  }, []);

  const handleClose = () => {
    localStorage.setItem(STORAGE_KEY, 'true');
    setOpen(false);
  };

  const dismissBanner = () => {
    localStorage.setItem(BANNER_DISMISSED_KEY, 'true');
    setShowBanner(false);
  };

  return (
    <>
      {/* Top Celebratory Announcement Banner (Silent) */}
      {showBanner && (
        <div className="relative z-40 bg-gradient-to-r from-primary via-indigo-600 to-primary text-white px-4 py-2 text-xs sm:text-sm font-medium shadow-md flex items-center justify-between">
          <div className="mx-auto flex flex-wrap items-center justify-center gap-2 text-center">
            <span>Tekrardan Hoş Geldiniz! Sizleri çok özledik ❤️</span>
          </div>
          <button
            onClick={dismissBanner}
            className="p-1 rounded hover:bg-white/20 transition shrink-0 ml-2"
            title="Duyuruyu Kapat"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Main Welcoming Modal (Silent, Clean) */}
      <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
        <DialogContent className="max-w-xl p-0 overflow-hidden border border-primary/25 shadow-2xl bg-card">
          {/* Confetti & Glow Background Effect */}
          <div className="relative overflow-hidden bg-gradient-to-br from-primary/10 via-indigo-500/5 to-amber-500/5 p-6 sm:p-8 text-center border-b border-border/40">
            {/* Soft decorative glow */}
            <div className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 w-80 h-40 bg-primary/20 blur-3xl rounded-full" />

            {/* Sparkles Badge */}
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-primary/10 text-primary border border-primary/25 mb-3 shadow-sm">
              <Sparkles className="h-3.5 w-3.5 text-amber-500 animate-spin" style={{ animationDuration: '4s' }} />
              EconNotes Yeniden Sizlerle
            </div>

            <DialogHeader className="space-y-2">
              <DialogTitle className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground flex items-center justify-center gap-2">
                <span>Tekrardan Hoş Geldiniz!</span>
                <Heart className="h-6 w-6 text-rose-500 fill-rose-500 animate-bounce" />
              </DialogTitle>
              <DialogDescription className="text-sm sm:text-base text-muted-foreground max-w-md mx-auto leading-relaxed pt-1">
                Sizleri çok özledik! Sınav haftası yoğunluğu öncesinde EconNotes altyapısını tamamen yeniledik ve Cloudflare küresel sunucularına taşıdık.
              </DialogDescription>
            </DialogHeader>
          </div>

          {/* Feature Highlights Grid */}
          <div className="p-6 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-3 rounded-xl border border-border/60 bg-muted/30 space-y-1">
                <div className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400 font-bold text-xs">
                  <Zap className="h-4 w-4" />
                  <span>Ultra Hızlı</span>
                </div>
                <p className="text-[11px] text-muted-foreground leading-normal">
                  Cloudflare Global CDN ile anlık sayfa ve not yüklemeleri.
                </p>
              </div>

              <div className="p-3 rounded-xl border border-border/60 bg-muted/30 space-y-1">
                <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-bold text-xs">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Sıfır Kayıp</span>
                </div>
                <p className="text-[11px] text-muted-foreground leading-normal">
                  Tüm notlarınız, puanlarınız ve profilleriniz eksiksiz korundu.
                </p>
              </div>

              <div className="p-3 rounded-xl border border-border/60 bg-muted/30 space-y-1">
                <div className="flex items-center gap-1.5 text-purple-600 dark:text-purple-400 font-bold text-xs">
                  <ShieldCheck className="h-4 w-4" />
                  <span>7/24 Kesintisiz</span>
                </div>
                <p className="text-[11px] text-muted-foreground leading-normal">
                  Sınav maratonunda donma ve çökme olmadan kesintisiz erişim.
                </p>
              </div>
            </div>

            {/* Action Button */}
            <div className="pt-2 flex justify-center">
              <Button
                onClick={handleClose}
                className="w-full sm:w-auto px-8 py-2.5 font-bold shadow-lg gap-2 bg-gradient-to-r from-primary to-indigo-600 hover:opacity-95 text-white"
              >
                <span>Harika! Notlara Göz At</span>
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default WelcomeBackCelebration;
