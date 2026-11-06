import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import vizeBasarilarImage from '@/assets/vize-basarilar.jpg';

/**
 * One-time "Vize sınavlarınızda başarılar" popup shown to signed-in users.
 * The acknowledgement is versioned and stored per user in localStorage, so
 * each account sees it only once per browser.
 */
const CAMPAIGN_VERSION = 'vize-2026-11';
const storageKeyFor = (userId: string) => `econnotes_exam_wish_${CAMPAIGN_VERSION}_${userId}`;

const ExamWishPopup = () => {
  const { user, loading } = useAuth();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (loading || !user) return;
    try {
      if (localStorage.getItem(storageKeyFor(user.id)) === 'true') return;
    } catch {
      return;
    }
    // Small delay so the popup doesn't collide with the splash screen / page load.
    const t = setTimeout(() => setOpen(true), 800);
    return () => clearTimeout(t);
  }, [user, loading]);

  const handleClose = () => {
    if (user) {
      try {
        localStorage.setItem(storageKeyFor(user.id), 'true');
      } catch {
        /* storage unavailable – ignore */
      }
    }
    setOpen(false);
  };

  if (!user) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-md p-0 overflow-hidden border border-primary/25 shadow-2xl bg-card">
        <DialogTitle className="sr-only">Vize sınavlarınızda başarılar dileriz!</DialogTitle>
        <DialogDescription className="sr-only">
          EconNotes ekibi olarak vize sınavlarınızda başarılar dileriz.
        </DialogDescription>
        <img
          src={vizeBasarilarImage}
          alt="Vize sınavlarınızda başarılar dileriz! - econnotes.online"
          className="block w-full h-auto select-none"
          draggable={false}
        />
        <div className="p-4 flex justify-center">
          <Button onClick={handleClose} className="w-full sm:w-auto px-8 font-bold">
            Teşekkürler!
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ExamWishPopup;
