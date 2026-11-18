import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Cake, Clock, Download, Eye, Gift, Sparkles, X } from 'lucide-react';
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
      <DialogContent
        onOpenAutoFocus={(e) => e.preventDefault()}
        className={cn(
          'w-[calc(100vw-1.5rem)] max-w-[420px] overflow-hidden rounded-[28px] p-0 sm:p-0 gap-0 text-white backdrop-blur-2xl [&>button]:hidden',
          isNovember10
            ? 'border border-white/15 bg-gradient-to-b from-zinc-900 via-zinc-900 to-zinc-950 shadow-[0_24px_64px_rgba(0,0,0,0.65)]'
            : 'border border-cyan-300/25 bg-gradient-to-b from-[#001d52] via-[#002b75] to-[#051533] shadow-[0_24px_70px_rgba(0,55,145,0.55)]',
        )}
      >
        {/* Ambiyans Işık Küreleri & Üst Parlama */}
        <div className="pointer-events-none absolute -right-14 -top-14 h-48 w-48 rounded-full bg-cyan-400/25 blur-3xl" />
        <div className="pointer-events-none absolute -left-14 top-24 h-44 w-44 rounded-full bg-[#0070d1]/30 blur-3xl" />
        <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/80 to-transparent" />

        {/* Üst Hero Katmanı */}
        <div className="relative z-10 px-5 pt-5 pb-4 sm:px-6 sm:pt-6">
          {/* Üst Bar: EconNotes Logosu + Özel Gün Rozeti + Kapat Butonu (Çakışmasız) */}
          <div className="flex items-center justify-between gap-2 mb-4">
            <EconLogo allWhite className="h-5 sm:h-6 w-auto shrink-0" />
            <div className="flex items-center gap-1.5">
              <span className="inline-flex items-center gap-1 rounded-full border border-cyan-300/30 bg-white/10 px-2.5 py-1 text-[10.5px] font-semibold text-cyan-100 backdrop-blur-md">
                <Sparkles className="h-3 w-3 text-cyan-300 shrink-0" />
                <span>Doğum Günü Özel</span>
              </span>
              <button
                type="button"
                onClick={() => handleClaim(false)}
                aria-label="Kapat"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white/85 transition-all hover:bg-white/20 hover:text-white active:scale-90"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Merkez İkon & Başlık */}
          <div className="flex flex-col items-center text-center">
            <div className="mb-3 flex h-14 w-14 sm:h-16 sm:w-16 items-center justify-center rounded-2xl border border-cyan-300/30 bg-gradient-to-br from-white/20 to-white/5 text-white shadow-[0_8px_24px_rgba(0,24,69,0.4)] backdrop-blur-md">
              <Cake className="h-7 w-7 sm:h-8 sm:w-8 text-cyan-200" />
            </div>

            <DialogHeader className="pr-0 !text-center items-center space-y-1">
              <DialogTitle className="w-full text-center text-xl sm:text-2xl font-extrabold tracking-tight text-white">
                İyi ki Doğdun, {firstName}!
              </DialogTitle>
              <DialogDescription className="w-full text-center text-xs sm:text-[13px] leading-relaxed text-blue-100/85 max-w-[340px] mx-auto">
                EconNotes ailesi olarak yeni yaşının sana sağlık, mutluluk ve akademik hayatında üstün başarılar getirmesini dileriz.
              </DialogDescription>
            </DialogHeader>
          </div>
        </div>

        {/* Alt İçerik: EconNotes Uyumlu Cam Hediye Kartı */}
        <div className="relative z-10 space-y-3.5 px-4 pb-5 sm:px-6 sm:pb-6">
          <div className="relative overflow-hidden rounded-2xl border border-cyan-300/20 bg-white/[0.08] p-3.5 sm:p-4 space-y-3 backdrop-blur-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.15)]">
            {/* Üst Satır: Rozet & Kalan Süre */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-cyan-400/15 text-cyan-300 border border-cyan-300/25">
                  <Gift className="h-4 w-4" />
                </div>
                <span className="text-[10.5px] font-bold uppercase tracking-wider text-cyan-300 truncate">
                  Doğum Günü Hediyen
                </span>
              </div>
              {status.remainingLabel && (
                <span className="inline-flex items-center gap-1 rounded-full border border-cyan-300/30 bg-cyan-400/15 px-2.5 py-0.5 text-[10px] font-semibold text-cyan-100 shrink-0">
                  <Clock className="h-3 w-3 text-cyan-300" />
                  {status.remainingLabel}
                </span>
              )}
            </div>

            {/* Tam Genişlik Hediye Başlığı (Mobilde sıkışmayı önler) */}
            <p className="text-sm sm:text-[15px] font-extrabold text-white leading-snug">
              1 Gün Boyunca Sınırsız Not Erişimi
            </p>

            {/* Özellik Kutuları */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="flex items-center gap-2 rounded-xl border border-white/12 bg--[#001845]/45 bg-white/[0.06] px-2.5 py-2">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-cyan-400/15 text-cyan-300">
                  <Eye className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-white text-[11.5px] leading-tight truncate">Sınırsız Önizleme</p>
                  <p className="text-[10px] text-blue-100/70 truncate">Tüm ders notları</p>
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-xl border border-white/12 bg-white/[0.06] px-2.5 py-2">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-cyan-400/15 text-cyan-300">
                  <Download className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-white text-[11.5px] leading-tight truncate">Sınırsız İndirme</p>
                  <p className="text-[10px] text-blue-100/70 truncate">Kota sınırı yok</p>
                </div>
              </div>
            </div>

            <p className="text-[11px] leading-relaxed text-blue-100/80">
              Bugün boyunca EconNotes kütüphanesindeki tüm ders notlarını kota şartı olmadan görüntüleyebilir ve indirebilirsin.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row-reverse gap-2 pt-0.5">
            <Button
              type="button"
              onClick={() => handleClaim(true)}
              className={cn(
                'w-full sm:flex-1 gap-2 rounded-xl text-xs font-bold h-10 text-white shadow-lg border border-cyan-300/30',
                isNovember10
                  ? 'bg-zinc-100 text-zinc-950 hover:bg-zinc-200'
                  : 'bg-gradient-to-r from-[#0055b8] via-[#0070d1] to-[#0ea5e9] hover:opacity-95 shadow-[#0070d1]/30',
              )}
            >
              <span>Hediyemi Kullan & Notlara Git</span>
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => handleClaim(false)}
              className="w-full sm:w-auto rounded-xl text-xs h-10 border border-white/15 bg-white/[0.06] text-blue-100 hover:bg-white/12 hover:text-white focus-visible:ring-0"
            >
              Teşekkürler
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default BirthdayCelebrationPopup;
