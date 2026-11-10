import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Sparkles, X } from 'lucide-react';

export const getDailyPosterStorageKey = (userId: string, date: Date = new Date()): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `econnotes_daily_poster_${userId}_${year}-${month}-${day}`;
};

export const DailyWelcomePosterModal: React.FC = () => {
  const { user, isApproved, loading } = useAuth();
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (loading || !user?.id || !isApproved) return;

    const key = getDailyPosterStorageKey(user.id);
    const alreadyShown = localStorage.getItem(key);

    if (!alreadyShown) {
      // 700ms delay so initial page elements hydrate smoothly
      const timer = window.setTimeout(() => {
        setIsOpen(true);
      }, 700);
      return () => window.clearTimeout(timer);
    }
  }, [user?.id, isApproved, loading]);

  useEffect(() => {
    const handleManualOpen = () => setIsOpen(true);
    window.addEventListener('econnotes:open-daily-poster', handleManualOpen);
    return () => window.removeEventListener('econnotes:open-daily-poster', handleManualOpen);
  }, []);

  const handleClose = () => {
    if (user?.id) {
      try {
        localStorage.setItem(getDailyPosterStorageKey(user.id), 'true');
      } catch (err) {
        console.warn('localStorage poster key write error:', err);
      }
    }
    setIsOpen(false);
  };

  if (!user || !isApproved) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) handleClose(); }}>
      <DialogContent className="max-w-[92vw] sm:max-w-md md:max-w-[440px] p-2.5 sm:p-3.5 rounded-3xl border border-primary/25 bg-background/95 backdrop-blur-2xl shadow-2xl shadow-primary/20 overflow-hidden gap-2 sm:gap-3">
        <DialogHeader className="sr-only">
          <DialogTitle>Herkes İçin EconNotes Günlük Karşılama</DialogTitle>
          <DialogDescription>
            Her gün giriş yaptığınızda EconNotes ailesinin bir parçası olduğunuzu hatırlatan özel karşılama afişi.
          </DialogDescription>
        </DialogHeader>

        <div className="relative group overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-b from-primary/10 via-transparent to-primary/5">
          <img
            src="/econnotes-herkes-icin.jpg"
            alt="Herkes İçin EconNotes"
            className="w-full h-auto max-h-[68vh] sm:max-h-[72vh] object-contain rounded-2xl shadow-inner select-none transition-transform duration-300 group-hover:scale-[1.01]"
            loading="eager"
          />
          <button
            type="button"
            onClick={handleClose}
            className="absolute top-2.5 right-2.5 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white/90 hover:text-white hover:bg-black/80 backdrop-blur-md transition-all shadow-md focus:outline-none focus:ring-2 focus:ring-primary"
            aria-label="Kapat"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-1.5 px-1 pt-0.5">
          <Button
            onClick={handleClose}
            className="w-full h-10 sm:h-11 rounded-2xl gradient-primary text-primary-foreground font-semibold shadow-md shadow-primary/20 hover:opacity-95 text-xs sm:text-sm gap-2"
          >
            <Sparkles className="h-4 w-4 animate-spin-slow" />
            <span>EconNotes'a Başla</span>
          </Button>
          <p className="text-center text-[10px] sm:text-[11px] text-muted-foreground">
            ✨ Bu karşılama görseli hesabınıza giriş yaptığınızda günde 1 kez gösterilir.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default DailyWelcomePosterModal;
