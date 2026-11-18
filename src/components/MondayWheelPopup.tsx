import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarClock, CheckCircle2, Gift, Lock, PartyPopper, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
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
  claimMondayWheelReward,
  getMondayWheelState,
  MONDAY_WHEEL_SEGMENTS,
  type WheelSegment,
} from '@/lib/mondayWheel';

export const openMondayWheelModal = () => {
  window.dispatchEvent(new CustomEvent('econnotes:open-monday-wheel'));
};

const MondayWheelPopup = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [wheelState, setWheelState] = useState(() => getMondayWheelState(user));
  const [spinning, setSpinning] = useState(false);
  const [rotationDeg, setRotationDeg] = useState(0);
  const [wonSegment, setWonSegment] = useState<WheelSegment | null>(null);

  useEffect(() => {
    const syncState = () => {
      const next = getMondayWheelState(user);
      setWheelState(next);
      if (next.todayRewardId) {
        const found = MONDAY_WHEEL_SEGMENTS.find((s) => s.id === next.todayRewardId) || null;
        setWonSegment(found);
      }
    };

    syncState();

    // Pazartesi günü giriş yapıldığında ve henüz çevrilmediyse otomatik aç
    if (!loading && user) {
      const current = getMondayWheelState(user);
      const sessionPromptKey = `econnotes_monday_wheel_prompted_${user.id}`;
      if (current.canSpinNow && !sessionStorage.getItem(sessionPromptKey)) {
        sessionStorage.setItem(sessionPromptKey, '1');
        const t = window.setTimeout(() => setOpen(true), 650);
        return () => window.clearTimeout(t);
      }
    }
  }, [user, loading]);

  useEffect(() => {
    const handleOpen = () => {
      setWheelState(getMondayWheelState(user));
      setOpen(true);
    };
    const handleUpdated = () => {
      setWheelState(getMondayWheelState(user));
    };

    window.addEventListener('econnotes:open-monday-wheel', handleOpen);
    window.addEventListener('econnotes:wheel-updated', handleUpdated);
    return () => {
      window.removeEventListener('econnotes:open-monday-wheel', handleOpen);
      window.removeEventListener('econnotes:wheel-updated', handleUpdated);
    };
  }, [user]);

  if (!user) return null;

  const numSegments = MONDAY_WHEEL_SEGMENTS.length;
  const sliceAngle = 360 / numSegments;

  const handleSpin = () => {
    if (spinning || !wheelState.canSpinNow) return;

    // Ağırlıklı rastgele seçim (tüm ödüller çıkabilir, XP ve Not hakları dengeli)
    const weights = [18, 22, 20, 10, 14, 10, 6]; // toplam 100
    const roll = Math.random() * 100;
    let acc = 0;
    let chosenIdx = 0;
    for (let i = 0; i < weights.length; i++) {
      acc += weights[i];
      if (roll <= acc) {
        chosenIdx = i;
        break;
      }
    }

    const chosen = MONDAY_WHEEL_SEGMENTS[chosenIdx];
    // Üst ibre (-90 derece / 0 derece tepe) hizasına gelecek açı
    const targetSliceCenter = chosenIdx * sliceAngle + sliceAngle / 2;
    const extraSpins = 360 * 6;
    const jitter = (Math.random() - 0.5) * (sliceAngle * 0.45);
    const nextRotation =
      rotationDeg + extraSpins + (360 - targetSliceCenter) - (rotationDeg % 360) + jitter;

    setSpinning(true);
    setRotationDeg(nextRotation);

    window.setTimeout(async () => {
      const res = await claimMondayWheelReward(user, chosen);
      setSpinning(false);
      if (!res.ok) {
        toast.error(res.error || 'Çark ödülü kaydedilemedi.');
        setWheelState(getMondayWheelState(user));
        return;
      }
      setWonSegment(chosen);
      setWheelState(getMondayWheelState(user));
      toast.success(`Tebrikler! ${chosen.fullTitle} hesabına tanımlandı! 🎉`);
    }, 4200);
  };

  // SVG dilim koordinatları (merkez 150,150, yarıçap 138)
  const cx = 150;
  const cy = 150;
  const r = 136;

  return (
    <Dialog open={open} onOpenChange={(v) => !spinning && setOpen(v)}>
      <DialogContent className="max-w-md overflow-hidden rounded-3xl border border-primary/30 bg-card p-0 shadow-2xl">
        {/* Üst Başlık */}
        <div className="bg-gradient-to-br from-blue-600/20 via-violet-600/15 to-amber-500/15 px-6 pt-5 pb-4 text-center border-b border-border/60">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[11px] font-bold text-primary">
            <Sparkles className="h-3.5 w-3.5" />
            Haftalık Pazartesi Etkinliği
          </div>
          <DialogHeader className="mt-2 text-center sm:text-center">
            <DialogTitle className="text-xl sm:text-2xl font-extrabold tracking-tight text-foreground">
              Pazartesi Şans Çarkı 🎡
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground mt-1">
              Her Pazartesi giriş yap, çarkı çevir; sınırsız erişim, ek not hakkı veya 500 XP’ye varan puanları anında kazan!
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="p-5 space-y-4">
          {/* Çark Görseli */}
          <div className="relative mx-auto flex h-[290px] w-[290px] items-center justify-center">
            {/* Üst Altın İbre */}
            <div className="absolute -top-2 left-1/2 z-20 -translate-x-1/2 drop-shadow-md">
              <div className="h-0 w-0 border-l-[13px] border-r-[13px] border-t-[24px] border-l-transparent border-r-transparent border-t-amber-400" />
            </div>

            {/* Dönen SVG Çark */}
            <svg
              viewBox="0 0 300 300"
              className="h-full w-full drop-shadow-xl"
              style={{
                transform: `rotate(${rotationDeg}deg)`,
                transition: spinning
                  ? 'transform 4.2s cubic-bezier(0.15, 0.88, 0.22, 1)'
                  : 'none',
              }}
            >
              {/* Dış Çerçeve */}
              <circle cx={cx} cy={cy} r={r + 6} fill="#0f172a" stroke="#f59e0b" strokeWidth="4" />

              {MONDAY_WHEEL_SEGMENTS.map((seg, idx) => {
                const startDeg = idx * sliceAngle - 90;
                const endDeg = (idx + 1) * sliceAngle - 90;
                const startRad = (startDeg * Math.PI) / 180;
                const endRad = (endDeg * Math.PI) / 180;

                const x1 = cx + r * Math.cos(startRad);
                const y1 = cy + r * Math.sin(startRad);
                const x2 = cx + r * Math.cos(endRad);
                const y2 = cy + r * Math.sin(endRad);

                const pathData = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2} Z`;

                const midDeg = startDeg + sliceAngle / 2;
                const midRad = (midDeg * Math.PI) / 180;
                const tx = cx + r * 0.63 * Math.cos(midRad);
                const ty = cy + r * 0.63 * Math.sin(midRad);

                return (
                  <g key={seg.id}>
                    <path
                      d={pathData}
                      fill={seg.color}
                      stroke="#ffffff"
                      strokeWidth="2"
                    />
                    <text
                      x={tx}
                      y={ty}
                      fill={seg.textColor}
                      fontSize="11.5"
                      fontWeight="800"
                      textAnchor="middle"
                      dominantBaseline="middle"
                      transform={`rotate(${midDeg}, ${tx}, ${ty})`}
                    >
                      {seg.shortLabel}
                    </text>
                  </g>
                );
              })}

              {/* Merkez Göbek */}
              <circle cx={cx} cy={cy} r="28" fill="#0f172a" stroke="#facc15" strokeWidth="4" />
              <text
                x={cx}
                y={cy + 1}
                fill="#ffffff"
                fontSize="10"
                fontWeight="800"
                textAnchor="middle"
                dominantBaseline="middle"
              >
                ECON
              </text>
            </svg>
          </div>

          {/* Kazanılan Ödül veya Durum Kartı */}
          {wonSegment && wheelState.hasSpunToday ? (
            <div className="rounded-2xl border border-emerald-500/35 bg-emerald-500/10 p-4 text-center space-y-2">
              <div className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-300">
                <PartyPopper className="h-4 w-4" />
                Bu Haftaki Pazartesi Ödülün Hesabına Yüklendi!
              </div>
              <p className="text-base font-extrabold text-foreground">{wonSegment.fullTitle}</p>
              <p className="text-xs text-muted-foreground">{wonSegment.description}</p>
              <div className="pt-2 flex gap-2 justify-center">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setOpen(false)}
                  className="text-xs"
                >
                  Kapat
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    setOpen(false);
                    navigate(wonSegment.type === 'xp' ? '/points' : '/notes');
                  }}
                  className="text-xs gap-1.5"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {wonSegment.type === 'xp' ? 'Puanlarıma Git' : 'Notlara Git'}
                </Button>
              </div>
            </div>
          ) : !wheelState.isMonday ? (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/[0.08] p-4 text-center space-y-1.5">
              <div className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-600 dark:text-amber-400">
                <Lock className="h-3.5 w-3.5" />
                Yalnızca Pazartesi Günleri Çevrilebilir
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Şans çarkı haftada yalnız 1 gün (Pazartesi 00:00 - 23:59 arası) aktif olur. Pazartesi günü çevirmeyi kaçırırsan bir sonraki Pazartesi gününü beklemen gerekir.
              </p>
              <p className="inline-flex items-center gap-1 text-xs font-semibold text-foreground pt-1">
                <CalendarClock className="h-3.5 w-3.5 text-primary" />
                {wheelState.countdownLabel}
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              <Button
                type="button"
                disabled={spinning || !wheelState.canSpinNow}
                onClick={handleSpin}
                className="w-full h-11 rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 text-white font-bold text-sm shadow-lg hover:opacity-95 gap-2"
              >
                <Gift className="h-4 w-4" />
                {spinning ? 'Çark Dönüyor...' : 'Şans Çarkını Çevir!'}
              </Button>
              <p className="text-center text-[11px] text-muted-foreground">
                {wheelState.countdownLabel} · Çıkan ödül anında hesabına tanımlanır.
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default MondayWheelPopup;
