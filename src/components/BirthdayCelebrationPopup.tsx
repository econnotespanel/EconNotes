import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Cake, Download, Eye, Gift, PartyPopper, Sparkles } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import {
  getBirthdayStatus,
  hasCelebratedBirthdayToday,
  markBirthdayCelebratedToday,
} from '@/lib/birthdayPerk';

const BirthdayCelebrationPopup = () => {
  const { user, profile, loading } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState(() => getBirthdayStatus(user, profile));

  useEffect(() => {
    const refresh = () => {
      const next = getBirthdayStatus(user, profile);
      setStatus(next);
      if (
        !loading &&
        user &&
        next.birthDate &&
        next.isBirthdayToday &&
        next.isUnlimitedActive &&
        !hasCelebratedBirthdayToday(user.id)
      ) {
        setOpen(true);
      }
    };

    refresh();
    window.addEventListener('econnotes:birthdate-updated', refresh);
    return () => {
      window.removeEventListener('econnotes:birthdate-updated', refresh);
    };
  }, [user, profile, loading]);

  if (!user || !status.isBirthdayToday || !status.isUnlimitedActive) return null;

  const firstName =
    (profile?.full_name || (user.user_metadata as any)?.full_name || 'Öğrenci')
      .trim()
      .split(' ')[0] || 'Öğrenci';

  const handleClaim = (goToNotes: boolean) => {
    if (status.birthDate) {
      markBirthdayCelebratedToday(user, status.birthDate);
    }
    setOpen(false);
    if (goToNotes) {
      navigate('/notes');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClaim(false)}>
      <DialogContent className="max-w-md overflow-hidden rounded-3xl border border-amber-400/40 bg-card p-0 shadow-2xl">
        {/* Üst Kutlama Başlığı */}
        <div className="relative overflow-hidden bg-gradient-to-br from-amber-500/20 via-rose-500/15 to-primary/20 px-6 pt-7 pb-6 text-center">
          <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl border border-amber-400/40 bg-amber-500/20 text-amber-500 shadow-lg">
            <Cake className="h-8 w-8" />
          </div>
          <div className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/15 px-3 py-1 text-[11px] font-bold text-amber-600 dark:text-amber-300">
            <PartyPopper className="h-3.5 w-3.5" />
            EconNotes Doğum Günü Kutlaması
          </div>
          <DialogHeader className="mt-2.5 text-center sm:text-center">
            <DialogTitle className="text-2xl font-extrabold tracking-tight text-foreground">
              İyi ki Doğdun, {firstName}! 🎂
            </DialogTitle>
            <DialogDescription className="mt-1.5 text-xs sm:text-sm leading-relaxed text-muted-foreground">
              Yeni yaşının sana sağlık, mutluluk ve tüm sınavlarında üstün başarılar getirmesini dileriz!
            </DialogDescription>
          </DialogHeader>
        </div>

        {/* Hediye Paketi Kartı */}
        <div className="space-y-4 p-6">
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/[0.07] p-4 space-y-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-white shadow-xs">
                <Gift className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                  Doğum Günü Hediyen Tanımlandı
                </p>
                <p className="text-sm font-bold text-foreground">
                  1 Gün Boyunca Sınırsız Not Erişimi
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1 text-xs">
              <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-background/70 px-3 py-2">
                <Eye className="h-4 w-4 text-primary shrink-0" />
                <span className="font-medium">Sınırsız Önizleme</span>
              </div>
              <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-background/70 px-3 py-2">
                <Download className="h-4 w-4 text-emerald-500 shrink-0" />
                <span className="font-medium">Sınırsız İndirme</span>
              </div>
            </div>

            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Bugün boyunca ({status.remainingLabel}) EconNotes üzerindeki tüm ders notlarını kota sınırı olmadan görüntüleyebilir ve indirebilirsin.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleClaim(false)}
              className="w-full sm:w-auto text-xs"
            >
              Teşekkürler!
            </Button>
            <Button
              type="button"
              onClick={() => handleClaim(true)}
              className="w-full sm:flex-1 gap-1.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:from-amber-600 hover:to-orange-600 text-xs font-bold shadow-md"
            >
              <Sparkles className="h-4 w-4" />
              Hediyemi Kullan & Notlara Git
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default BirthdayCelebrationPopup;
