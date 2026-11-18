import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { CalendarClock, CheckCircle2, Gift, Lock, PartyPopper, Sparkles, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import EconLogo from '@/components/EconLogo';
import econEMark from '@/assets/econnotes-e-mark.png';
import { useAuth } from '@/contexts/AuthContext';
import { getSeasonalTheme, useSiteConfig } from '@/contexts/SiteConfigContext';
import {
  claimMondayWheelReward,
  getMondayWheelState,
  MONDAY_WHEEL_SEGMENTS,
  type WheelSegment,
} from '@/lib/mondayWheel';
import { cn } from '@/lib/utils';

export const openMondayWheelModal = () => {
  window.dispatchEvent(new CustomEvent('econnotes:open-monday-wheel'));
};

/** EconNotes kobalt-mavi & cyan dilimli özel minyatür çark ikonu */
export const EconWheelMiniGraphic = ({ className = 'h-10 w-10' }: { className?: string }) => {
  const num = MONDAY_WHEEL_SEGMENTS.length;
  const angle = 360 / num;
  const cx = 32;
  const cy = 32;
  const r = 27;

  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <circle cx={cx} cy={cy} r={r + 3} fill="#001845" stroke="#38bdf8" strokeWidth="2" />
      {MONDAY_WHEEL_SEGMENTS.map((seg, i) => {
        const sDeg = i * angle - 90;
        const eDeg = (i + 1) * angle - 90;
        const sRad = (sDeg * Math.PI) / 180;
        const eRad = (eDeg * Math.PI) / 180;
        const x1 = cx + r * Math.cos(sRad);
        const y1 = cy + r * Math.sin(sRad);
        const x2 = cx + r * Math.cos(eRad);
        const y2 = cy + r * Math.sin(eRad);
        return (
          <path
            key={seg.id}
            d={`M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2} Z`}
            fill={seg.color}
            stroke="rgba(255,255,255,0.55)"
            strokeWidth="1"
          />
        );
      })}
      <circle cx={cx} cy={cy} r="9.5" fill="#001845" stroke="#38bdf8" strokeWidth="1.8" />
      <text
        x={cx}
        y={cy + 0.5}
        fill="#ffffff"
        fontSize="9.5"
        fontWeight="900"
        textAnchor="middle"
        dominantBaseline="middle"
      >
        E
      </text>
      <polygon points="32,1 28,8 36,8" fill="#38bdf8" />
    </svg>
  );
};

const MondayWheelPopup = () => {
  const { user, loading } = useAuth();
  const { config } = useSiteConfig();
  const seasonalTheme = getSeasonalTheme(config.theme.seasonalMode || 'default');
  const isNovember10 = seasonalTheme?.id === 'november10';
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [LauncherDismissed, setLauncherDismissed] = useState(false);
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

    const weights = [18, 22, 20, 10, 14, 10, 6];
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
      toast.success(`Tebrikler! ${chosen.fullTitle} hesabına tanımlandı!`);
    }, 4200);
  };

  const cx = 160;
  const cy = 160;
  const r = 136;
  const showFloatingLauncher = !LauncherDismissed && location.pathname === '/';

  return (
    <>
      {/* Sağ Altta Çark Resmi ile Gösterilen Yüzen Pazartesi Şans Çarkı Kutusu */}
      {showFloatingLauncher && (
        <div className="fixed bottom-24 right-4 z-40 md:bottom-5 md:right-5 flex items-center">
          <div className="group relative flex items-center gap-3 rounded-2xl border border-primary/35 bg-card/95 p-2.5 pr-3.5 shadow-[0_16px_44px_rgba(0,55,145,0.22)] backdrop-blur-xl transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/60">
            <button
              type="button"
              onClick={openMondayWheelModal}
              className="flex items-center gap-3 text-left"
            >
              <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#001845] via-[#003791] to-[#0070d1] p-1 shadow-md">
                <EconWheelMiniGraphic className="h-10 w-10 transition-transform duration-500 group-hover:rotate-45" />
                {wheelState.canSpinNow && (
                  <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-cyan-400 ring-2 ring-card animate-pulse" />
                )}
              </div>
              <div className="min-w-0 pr-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-extrabold tracking-tight text-foreground">
                    Pazartesi Şans Çarkı
                  </span>
                  <span className="rounded-full border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[9.5px] font-bold text-primary">
                    {wheelState.canSpinNow ? 'AKTİF' : 'PAZARTESİ'}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground truncate max-w-[185px]">
                  {wheelState.canSpinNow
                    ? 'Hemen çevir, ödülünü kazan!'
                    : wheelState.countdownLabel}
                </p>
              </div>
            </button>
            <button
              type="button"
              aria-label="Çark kutusunu gizle"
              onClick={(e) => {
                e.stopPropagation();
                setLauncherDismissed(true);
              }}
              className="ml-0.5 rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* EconNotes Temalı Pazartesi Şans Çarkı Modalı */}
      <Dialog open={open} onOpenChange={(v) => !spinning && setOpen(v)}>
        <DialogContent className="w-[calc(100vw-1.5rem)] max-w-md overflow-hidden rounded-[26px] border border-primary/35 bg-card/95 p-0 shadow-[0_24px_64px_rgba(0,55,145,0.32)] backdrop-blur-2xl">
          {/* Üst EconNotes Kobalt-Mavi Başlık Katmanı */}
          <div
            className={cn(
              'relative overflow-hidden px-6 pt-5 pb-5 text-white',
              isNovember10
                ? 'bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-900'
                : 'bg-gradient-to-br from-[#001845] via-[#003791] to-[#0070d1]',
            )}
          >
            <div className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-cyan-400/20 blur-3xl" />
            <div className="pointer-events-none absolute -left-12 -bottom-12 h-36 w-36 rounded-full bg-blue-400/20 blur-2xl" />
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/70 to-transparent" />

            <div className="relative z-10 flex items-center justify-between gap-2 mb-3">
              <EconLogo allWhite className="h-6 w-auto" />
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[10.5px] font-semibold text-white backdrop-blur-md">
                <Sparkles className="h-3 w-3 text-cyan-300" />
                Haftalık Pazartesi Etkinliği
              </span>
            </div>

            <DialogHeader className="relative z-10 text-center sm:text-center">
              <DialogTitle className="text-xl sm:text-2xl font-extrabold tracking-tight text-white">
                Pazartesi Şans Çarkı
              </DialogTitle>
              <DialogDescription className="text-xs text-blue-100/90 mt-1 leading-relaxed">
                Her Pazartesi giriş yap, çarkı çevir; sınırsız erişim, +2 not hakkı veya 500 XP’ye varan puanları anında kazan!
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="p-5 space-y-4">
            {/* EconNotes Kobalt & Cyan Çark Görseli + Merkezde Beyaz E Logosu */}
            <div className="relative mx-auto flex h-[300px] w-[300px] items-center justify-center">
              {/* Arka Plan Mavi Parlama Halesi */}
              <div className="pointer-events-none absolute inset-4 rounded-full bg-primary/15 blur-2xl" />

              {/* Üst EconNotes Cyan/Mavi İbre */}
              <div className="absolute -top-2.5 left-1/2 z-30 -translate-x-1/2 drop-shadow-[0_4px_10px_rgba(0,55,145,0.5)]">
                <svg width="34" height="34" viewBox="0 0 34 34">
                  <polygon
                    points="17,32 4,6 30,6"
                    fill="#003791"
                    stroke="#38bdf8"
                    strokeWidth="2.5"
                  />
                  <circle cx="17" cy="12" r="3.5" fill="#ffffff" />
                </svg>
              </div>

              {/* Dönen SVG Çark */}
              <svg
                viewBox="0 0 320 320"
                className="h-full w-full drop-shadow-[0_14px_32px_rgba(0,24,69,0.35)]"
                style={{
                  transform: `rotate(${rotationDeg}deg)`,
                  transition: spinning
                    ? 'transform 4.2s cubic-bezier(0.15, 0.88, 0.22, 1)'
                    : 'none',
                }}
              >
                {/* Dış Kobalt Çerçeve */}
                <circle
                  cx={cx}
                  cy={cy}
                  r={r + 12}
                  fill="#001845"
                  stroke="#0070d1"
                  strokeWidth="3.5"
                />
                <circle
                  cx={cx}
                  cy={cy}
                  r={r + 3}
                  fill="none"
                  stroke="#38bdf8"
                  strokeWidth="1.5"
                  strokeOpacity="0.6"
                />

                {/* Çerçeve Üzeri 14 Işıklı Nokta */}
                {Array.from({ length: 14 }).map((_, i) => {
                  const deg = (i * 360) / 14 - 90;
                  const rad = (deg * Math.PI) / 180;
                  const sx = cx + (r + 7.5) * Math.cos(rad);
                  const sy = cy + (r + 7.5) * Math.sin(rad);
                  return (
                    <circle
                      key={i}
                      cx={sx}
                      cy={sy}
                      r={i % 2 === 0 ? '2.6' : '1.8'}
                      fill={i % 2 === 0 ? '#ffffff' : '#38bdf8'}
                    />
                  );
                })}

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
                  const tx = cx + r * 0.65 * Math.cos(midRad);
                  const ty = cy + r * 0.65 * Math.sin(midRad);

                  return (
                    <g key={seg.id}>
                      <path
                        d={pathData}
                        fill={seg.color}
                        stroke="rgba(255,255,255,0.35)"
                        strokeWidth="1.8"
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

                {/* İç Derinlik Halkası */}
                <circle
                  cx={cx}
                  cy={cy}
                  r="38"
                  fill="rgba(0, 24, 69, 0.35)"
                  stroke="rgba(255,255,255,0.25)"
                  strokeWidth="1.5"
                />
              </svg>

              {/* Sabit Merkez Göbek: EconNotes Beyaz E Logosu */}
              <div className="pointer-events-none absolute z-20 flex h-16 w-16 items-center justify-center rounded-full border-[3px] border-cyan-300/80 bg-gradient-to-br from-[#001845] via-[#003791] to-[#0070d1] shadow-[0_0_24px_rgba(0,112,209,0.65)]">
                <img
                  src={econEMark}
                  alt="EconNotes E"
                  className="h-9 w-9 object-contain brightness-0 invert select-none"
                  draggable={false}
                />
              </div>
            </div>

            {/* Kazanılan Ödül veya Durum Kartı (EconNotes Temalı) */}
            {wonSegment && wheelState.hasSpunToday ? (
              <div className="rounded-2xl border border-primary/35 bg-gradient-to-br from-primary/[0.10] via-card to-cyan-500/[0.08] p-4 text-center space-y-2">
                <div className="inline-flex items-center gap-1.5 text-xs font-bold text-primary">
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
                    className="rounded-xl text-xs"
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
                    className="rounded-xl bg-gradient-to-r from-[#003791] to-[#0070d1] text-white text-xs gap-1.5"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {wonSegment.type === 'xp' ? 'Puanlarıma Git' : 'Notlara Git'}
                  </Button>
                </div>
              </div>
            ) : !wheelState.isMonday ? (
              <div className="rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/[0.07] via-card to-cyan-500/[0.05] p-4 text-center space-y-1.5">
                <div className="inline-flex items-center gap-1.5 text-xs font-bold text-primary">
                  <Lock className="h-3.5 w-3.5" />
                  Yalnızca Pazartesi Günleri Çevrilebilir
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Şans çarkı haftada yalnız 1 gün (Pazartesi 00:00 - 23:59 arası) aktif olur. Pazartesi günü çevirmeyi kaçırırsan bir sonraki Pazartesi gününü beklemen gerekir.
                </p>
                <p className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary mt-1">
                  <CalendarClock className="h-3.5 w-3.5" />
                  {wheelState.countdownLabel}
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                <Button
                  type="button"
                  disabled={spinning || !wheelState.canSpinNow}
                  onClick={handleSpin}
                  className={cn(
                    'w-full h-11 rounded-2xl text-white font-bold text-sm shadow-lg gap-2',
                    isNovember10
                      ? 'bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-950'
                      : 'bg-gradient-to-r from-[#003791] via-[#0055b8] to-[#0070d1] hover:opacity-95 shadow-blue-600/25',
                  )}
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
    </>
  );
};

export default MondayWheelPopup;
