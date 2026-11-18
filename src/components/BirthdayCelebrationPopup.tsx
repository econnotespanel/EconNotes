import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Cake, Clock, Download, Eye, Gift, Sparkles } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import EconLogo from '@/components/EconLogo';
import { useAuth } from '@/contexts/AuthContext';
import { getSeasonalTheme, useSiteConfig } from '@/contexts/SiteConfigContext';
import {
  getBirthdayStatus,
  hasCelebratedBirthdayToday,
  markBirthdayCelebratedToday,
} from '@/lib/birthdayPerk';
import { cn } from '@/lib/utils';

export const openBirthdayCelebrationModal = () => {
  window.dispatchEvent(new CustomEvent('econnotes:open-birthday-celebration'));
};

const BirthdayCelebrationPopup = () => {
  const { user, profile, loading } = useAuth();
  const { config } = useSiteConfig();
  const seasonalTheme = getSeasonalTheme(config.theme.seasonalMode || 'default');
  const isNovember10 = seasonalTheme?.id === 'november10';
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

    const handleManualOpen = () => {
      setStatus(getBirthdayStatus(user, profile));
      setOpen(true);
    };

    refresh();
    window.addEventListener('econnotes:birthdate-updated', refresh);
    window.addEventListener('econnotes:open-birthday-celebration', handleManualOpen);
    return () => {
      window.removeEventListener('econnotes:birthdate-updated', refresh);
      window.removeEventListener('econnotes:open-birthday-celebration', handleManualOpen);
    };
  }, [user, profile, loading]);

  if (!user || (!status.isBirthdayToday && !open)) return null;

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
      <DialogContent className="w-[calc(100vw-1.5rem)] max-w-md overflow-hidden rounded-[26px] border border-primary/30 bg-card/95 p-0 shadow-[0_24px_64px_rgba(0,55,145,0.28)] backdrop-blur-2xl">
        {/* Üst EconNotes İmzalı Kobalt-Mavi Hero Katmanı */}
        <div
          className={cn(
            'relative overflow-hidden px-6 pt-6 pb-6 text-white',
            isNovember10
              ? 'bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-900'
              : 'bg-gradient-to-br from-[#001845] via-[#003791] to-[#0070d1]',
          )}
        >
          {/* Ambiyans Işık Küreleri */}
          <div className="pointer-events-none absolute -right-12 -top-12 h-44 w-44 rounded-full bg-cyan-400/20 blur-3xl" />
          <div className="pointer-events-none absolute -left-12 -bottom-12 h-40 w-40 rounded-full bg-blue-400/20 blur-2xl" />
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/70 to-transparent" />

          {/* Üst Bar: EconNotes Logosu + Özel Gün Rozeti */}
          <div className="relative z-10 flex items-center justify-between gap-2 mb-5">
            <EconLogo allWhite className="h-6 w-auto" />
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[11px] font-semibold text-white backdrop-blur-md">
              <Sparkles className="h-3 w-3 text-cyan-300" />
              Doğum Günü Özel
            </span>
          </div>

          {/* Merkez İkon & Başlık */}
          <div className="relative z-10 flex flex-col items-center text-center">
            <div className="mb-3.5 flex h-16 w-16 items-center justify-center rounded-2xl border border-white/25 bg-white/12 text-white shadow-[0_8px_28px_rgba(0,0,0,0.25)] backdrop-blur-md">
              <Cake className="h-8 w-8 text-cyan-200" />
            </div>

            <DialogHeader className="text-center sm:text-center">
              <DialogTitle className="text-2xl font-extrabold tracking-tight text-white">
                İyi ki Doğdun, {firstName}!
              </DialogTitle>
              <DialogDescription className="mt-1.5 text-xs sm:text-sm leading-relaxed text-blue-100/90">
                EconNotes ailesi olarak yeni yaşının sana sağlık, mutluluk ve akademik hayatında üstün başarılar getirmesini dileriz.
              </DialogDescription>
            </DialogHeader>
          </div>
        </div>

        {/* Alt İçerik: EconNotes Cam Kart Hediye Paketi */}
        <div className="space-y-4 p-5 sm:p-6">
          <div className="relative overflow-hidden rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/[0.08] via-card to-cyan-500/[0.06] p-4 space-y-3.5 shadow-xs">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary border border-primary/25">
                  <Gift className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-primary">
                    EconNotes Doğum Günü Hediyen
                  </p>
                  <p className="text-sm font-bold text-foreground">
                    1 Gün Boyunca Sınırsız Not Erişimi
                  </p>
                </div>
              </div>
              {status.remainingLabel && (
                <span className="inline-flex items-center gap-1 rounded-full border border-primary/25 bg-primary/10 px-2.5 py-1 text-[10.5px] font-semibold text-primary shrink-0">
                  <Clock className="h-3 w-3" />
                  {status.remainingLabel}
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2.5 text-xs">
              <div className="flex items-center gap-2 rounded-xl border border-border/70 bg-background/80 px-3 py-2.5">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Eye className="h-3.5 w-3.5" />
                </div>
                <div>
                  <p className="font-semibold text-foreground leading-tight">Sınırsız Önizleme</p>
                  <p className="text-[10px] text-muted-foreground">Tüm ders notları</p>
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-xl border border-border/70 bg-background/80 px-3 py-2.5">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-600 dark:text-cyan-400">
                  <Download className="h-3.5 w-3.5" />
                </div>
                <div>
                  <p className="font-semibold text-foreground leading-tight">Sınırsız İndirme</p>
                  <p className="text-[10px] text-muted-foreground">Kota sınırı olmadan</p>
                </div>
              </div>
            </div>

            <p className="text-[11.5px] leading-relaxed text-muted-foreground">
              Bugün boyunca EconNotes kütüphanesindeki tüm ders notlarını kota şartı olmadan görüntüleyebilir ve indirebilirsin.
            </p>
          </div>

          <div className="flex flex-col-reverse sm:flex-row gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleClaim(false)}
              className="w-full sm:w-auto rounded-xl text-xs h-10"
            >
              Teşekkürler
            </Button>
            <Button
              type="button"
              onClick={() => handleClaim(true)}
              className={cn(
                'w-full sm:flex-1 gap-2 rounded-xl text-xs font-bold h-10 text-white shadow-md',
                isNovember10
                  ? 'bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-950'
                  : 'bg-gradient-to-r from-[#003791] via-[#0055b8] to-[#0070d1] hover:opacity-95 shadow-blue-600/20',
              )}
            >
              <span>Hediyemi Kullan & Notlara Git</span>
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default BirthdayCelebrationPopup;
