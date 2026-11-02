import React, { useState, useEffect, useRef } from 'react';
import {
  Sparkles,
  Heart,
  Volume2,
  VolumeX,
  Zap,
  ShieldCheck,
  CheckCircle2,
  ArrowRight,
  Music,
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

/**
 * Synthesizes a warm, cheerful, uplifting welcome chime using the Web Audio API.
 * Uses harmonized triangle and sine waves with exponential decay for a rich celeste/marimba feel.
 */
function playWelcomeChime(onStop?: () => void) {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return null;
    const ctx = new AudioCtx();
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.3, ctx.currentTime);
    masterGain.connect(ctx.destination);

    // Uplifting melodic chords: Cmaj7 -> Am7 -> F6/9 -> Resolution Cmaj
    const melody = [
      // Phrase 1: C - E - G - B (C maj 7)
      { freq: 261.63, time: 0.0, dur: 0.8 },
      { freq: 329.63, time: 0.16, dur: 0.8 },
      { freq: 392.00, time: 0.32, dur: 0.8 },
      { freq: 493.88, time: 0.48, dur: 1.0 },

      // Phrase 2: A - C - E - G (Am 7)
      { freq: 440.00, time: 0.76, dur: 0.8 },
      { freq: 523.25, time: 0.92, dur: 0.8 },
      { freq: 659.25, time: 1.08, dur: 0.8 },
      { freq: 783.99, time: 1.24, dur: 1.2 },

      // Phrase 3: F - A - C - D (F6/9 transition)
      { freq: 349.23, time: 1.55, dur: 0.7 },
      { freq: 440.00, time: 1.71, dur: 0.7 },
      { freq: 523.25, time: 1.87, dur: 0.7 },
      { freq: 587.33, time: 2.03, dur: 0.9 },
      { freq: 783.99, time: 2.22, dur: 1.3 },

      // Final celebratory resolution chord: C5 + E5 + G5 + C6
      { freq: 523.25, time: 2.65, dur: 2.5 },
      { freq: 659.25, time: 2.65, dur: 2.5 },
      { freq: 783.99, time: 2.65, dur: 2.5 },
      { freq: 1046.50, time: 2.72, dur: 2.8 },
    ];

    melody.forEach(({ freq, time, dur }) => {
      const osc = ctx.createOscillator();
      const noteGain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + time);

      const start = ctx.currentTime + time;
      noteGain.gain.setValueAtTime(0.0001, start);
      noteGain.gain.exponentialRampToValueAtTime(0.25, start + 0.035);
      noteGain.gain.exponentialRampToValueAtTime(0.0001, start + dur);

      osc.connect(noteGain);
      noteGain.connect(masterGain);

      osc.start(start);
      osc.stop(start + dur + 0.1);
    });

    const totalDuration = 5.5 * 1000;
    const stopTimer = setTimeout(() => {
      onStop?.();
      try {
        ctx.close().catch(() => {});
      } catch {}
    }, totalDuration);

    return {
      stop: () => {
        clearTimeout(stopTimer);
        try {
          masterGain.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 0.15);
          setTimeout(() => {
            ctx.close().catch(() => {});
          }, 200);
        } catch {}
        onStop?.();
      },
    };
  } catch (err) {
    console.warn('Web Audio chime could not start:', err);
    return null;
  }
}

export const WelcomeBackCelebration = () => {
  const [open, setOpen] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showBanner, setShowBanner] = useState(false);
  const audioHandleRef = useRef<{ stop: () => void } | null>(null);

  useEffect(() => {
    // Only activate once 22:00 is reached
    const checkActivation = () => {
      const isPastTarget = Date.now() >= TARGET_REOPEN_TIME;
      const alreadySeen = localStorage.getItem(STORAGE_KEY) === 'true';
      const bannerDismissed = localStorage.getItem(BANNER_DISMISSED_KEY) === 'true';

      if (isPastTarget) {
        if (!alreadySeen) {
          setOpen(true);
          // Try playing music automatically
          startMusic();
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

  const startMusic = () => {
    if (audioHandleRef.current) {
      audioHandleRef.current.stop();
    }
    const handle = playWelcomeChime(() => {
      setIsPlaying(false);
    });
    if (handle) {
      audioHandleRef.current = handle;
      setIsPlaying(true);
    }
  };

  const toggleMusic = () => {
    if (isPlaying && audioHandleRef.current) {
      audioHandleRef.current.stop();
      audioHandleRef.current = null;
      setIsPlaying(false);
    } else {
      startMusic();
    }
  };

  const handleClose = () => {
    if (audioHandleRef.current) {
      audioHandleRef.current.stop();
      audioHandleRef.current = null;
      setIsPlaying(false);
    }
    localStorage.setItem(STORAGE_KEY, 'true');
    setOpen(false);
  };

  const dismissBanner = () => {
    localStorage.setItem(BANNER_DISMISSED_KEY, 'true');
    setShowBanner(false);
  };

  return (
    <>
      {/* Top Celebratory Announcement Banner */}
      {showBanner && (
        <div className="relative z-40 bg-gradient-to-r from-primary via-indigo-600 to-primary text-white px-4 py-2 text-xs sm:text-sm font-medium shadow-md flex items-center justify-between">
          <div className="mx-auto flex flex-wrap items-center justify-center gap-2 text-center">
            <span className="inline-flex items-center gap-1 font-bold">
              <Zap className="h-4 w-4 text-amber-300 animate-pulse" />
              Altyapı Güçlendirildi:
            </span>
            <span>Cloudflare Geçişi & Performans İyileştirmesi Tamamlandı — Tekrardan Hoş Geldiniz! Sizleri çok özledik ❤️</span>
            <button
              onClick={startMusic}
              className="inline-flex items-center gap-1 ml-2 px-2 py-0.5 rounded-full bg-white/20 hover:bg-white/30 text-[11px] font-semibold transition"
            >
              <Music className="h-3 w-3" />
              {isPlaying ? 'Müzik Çalıyor 🎵' : 'Karşılama Müziği 🎶'}
            </button>
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

      {/* Main Welcoming Modal */}
      <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
        <DialogContent className="max-w-xl p-0 overflow-hidden border border-primary/30 shadow-2xl bg-card">
          {/* Confetti & Glow Background Effect */}
          <div className="relative overflow-hidden bg-gradient-to-br from-primary/15 via-indigo-500/10 to-amber-500/10 p-6 sm:p-8 text-center border-b border-border/40">
            {/* Soft decorative glow */}
            <div className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 w-80 h-40 bg-primary/25 blur-3xl rounded-full" />

            {/* Sparkles Badge */}
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-primary/15 text-primary border border-primary/30 mb-3 shadow-sm">
              <Sparkles className="h-3.5 w-3.5 text-amber-500 animate-spin" style={{ animationDuration: '4s' }} />
              Altyapı Güçlendirildi • Cloudflare Geçişi Tamamlandı
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

            {/* Interactive Music Control Bar */}
            <div className="mt-5 inline-flex items-center gap-2.5 px-4 py-2 rounded-xl bg-card/80 border border-primary/20 shadow-sm backdrop-blur-sm">
              <div className="flex items-center gap-1">
                <span className={`h-3 w-1 rounded-full bg-primary ${isPlaying ? 'animate-pulse' : 'opacity-40'}`} />
                <span className={`h-4 w-1 rounded-full bg-primary ${isPlaying ? 'animate-pulse delay-75' : 'opacity-40'}`} />
                <span className={`h-2.5 w-1 rounded-full bg-primary ${isPlaying ? 'animate-pulse delay-150' : 'opacity-40'}`} />
              </div>
              <span className="text-xs font-semibold text-foreground">
                {isPlaying ? 'Karşılama müziği çalıyor...' : 'Karşılama müziği hazır'}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={toggleMusic}
                className="h-7 px-2.5 text-xs font-bold gap-1 text-primary hover:text-primary hover:bg-primary/10"
              >
                {isPlaying ? (
                  <>
                    <VolumeX className="h-3.5 w-3.5" />
                    <span>Durdur</span>
                  </>
                ) : (
                  <>
                    <Volume2 className="h-3.5 w-3.5" />
                    <span>Müziği Başlat</span>
                  </>
                )}
              </Button>
            </div>
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
