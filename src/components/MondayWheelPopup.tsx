import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Gift,
  Loader2,
  Lock,
  PartyPopper,
  ShieldCheck,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
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
import { useOnboarding } from '@/contexts/OnboardingContext';
import { getSeasonalTheme, useSiteConfig } from '@/contexts/SiteConfigContext';
import {
  clearPendingSpinRequestId,
  executeLuckyWheelSpin,
  fetchLuckyWheelStatus,
  getMondayWheelState,
  getOrCreatePendingSpinRequestId,
  MONDAY_WHEEL_SEGMENTS,
  syncPendingWheelXp,
  type ServerWheelStatus,
  type WheelSegment,
} from '@/lib/mondayWheel';
import {
  computeWheelPegEvents,
  playWheelTick,
  playWheelWinSound,
  startWheelSpinAudio,
  stopWheelSpinAudio,
  unlockWheelAudio,
} from '@/lib/wheelSoundEngine';
import { cn } from '@/lib/utils';

const WHEEL_SOUND_MUTED_KEY = 'econnotes_wheel_sound_muted';
const SPIN_DURATION_MS = 4200;

type WheelPhase = 'idle' | 'loading' | 'requesting' | 'animating' | 'completed';

export const openMondayWheelModal = () => {
  window.dispatchEvent(new CustomEvent('econnotes:open-monday-wheel'));
};

/** EconNotes kobalt-mavi & cyan dilimli, merkezinde beyaz E logolu özel minyatür çark ikonu */
export const EconWheelMiniGraphic = ({ className = 'h-10 w-10' }: { className?: string }) => {
  const num = MONDAY_WHEEL_SEGMENTS.length;
  const angle = 360 / num;
  const cx = 32;
  const cy = 32;
  const r = 26;

  return (
    <div className={cn('relative inline-flex items-center justify-center select-none', className)} aria-hidden="true">
      <svg viewBox="0 0 64 64" className="h-full w-full drop-shadow-[0_2px_6px_rgba(0,18,56,0.45)]">
        <circle cx={cx} cy={cy} r={r + 3.5} fill="#001438" stroke="#38bdf8" strokeWidth="1.8" />
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
              stroke="rgba(255,255,255,0.45)"
              strokeWidth="0.9"
            />
          );
        })}
        {Array.from({ length: 7 }).map((_, i) => {
          const deg = (i * 360) / 7 - 90;
          const rad = (deg * Math.PI) / 180;
          return (
            <circle
              key={i}
              cx={cx + (r + 1.8) * Math.cos(rad)}
              cy={cy + (r + 1.8) * Math.sin(rad)}
              r="1.1"
              fill="#ffffff"
            />
          );
        })}
        <circle cx={cx} cy={cy} r="10.5" fill="#001845" stroke="#38bdf8" strokeWidth="1.6" />
        <polygon points="32,0.8 28.2,7.5 35.8,7.5" fill="#38bdf8" stroke="#001438" strokeWidth="0.8" />
      </svg>
      <img
        src={econEMark}
        alt=""
        draggable={false}
        className="pointer-events-none absolute h-[31%] w-[31%] object-contain brightness-0 invert"
      />
    </div>
  );
};

const MondayWheelPopup = () => {
  const { user, profile, isAdmin, loading, refreshProfile } = useAuth();
  const { isTourOpen } = useOnboarding();
  const { config } = useSiteConfig();
  const seasonalTheme = getSeasonalTheme(config.theme.seasonalMode || 'default');
  const isNovember10 = seasonalTheme?.id === 'november10';
  const navigate = useNavigate();
  const location = useLocation();

  const [open, setOpen] = useState(false);
  const [launcherDismissed, setLauncherDismissed] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [serverStatus, setServerStatus] = useState<ServerWheelStatus | null>(null);
  const [clockOffsetMs, setClockOffsetMs] = useState(0);
  const [phase, setPhase] = useState<WheelPhase>('idle');
  const [spinError, setSpinError] = useState<string | null>(null);
  const [rotationDeg, setRotationDeg] = useState(0);
  const [wonSegment, setWonSegment] = useState<WheelSegment | null>(null);
  const [pointerKick, setPointerKick] = useState(false);
  const [soundMuted, setSoundMuted] = useState<boolean>(() => {
    try {
      return localStorage.getItem(WHEEL_SOUND_MUTED_KEY) === '1';
    } catch {
      return false;
    }
  });

  // Strict synchronous guards preventing any double-spin, auto-spin, or duplicate animation
  const soundMutedRef = useRef(soundMuted);
  const spinLockRef = useRef(false);
  const statusInFlightRef = useRef(false);
  const mountedRef = useRef(true);
  const rotationRef = useRef(0);
  const userRef = useRef(user);
  const profileRef = useRef(profile);
  const isAdminRef = useRef(isAdmin);
  const animatedTxIdsRef = useRef<Set<string>>(new Set());
  const tickRafRef = useRef<number | null>(null);
  const spinTimerRef = useRef<number | null>(null);
  const pointerTimerRef = useRef<number | null>(null);
  const lastReconciledUserRef = useRef<string | null>(null);

  soundMutedRef.current = soundMuted;
  rotationRef.current = rotationDeg;
  userRef.current = user;
  profileRef.current = profile;
  isAdminRef.current = isAdmin;

  const isBusy = phase === 'requesting' || phase === 'animating';

  const wheelState = getMondayWheelState(user, new Date(Date.now() + clockOffsetMs), {
    isAdmin,
    profile: profile as { wheel_bonus_quota?: number | null; wheel_unlimited_until?: string | null } | null,
    serverStatus,
  });

  const stopAnimationTimers = useCallback(() => {
    stopWheelSpinAudio();
    if (tickRafRef.current !== null) {
      cancelAnimationFrame(tickRafRef.current);
      tickRafRef.current = null;
    }
    if (spinTimerRef.current !== null) {
      window.clearTimeout(spinTimerRef.current);
      spinTimerRef.current = null;
    }
    if (pointerTimerRef.current !== null) {
      window.clearTimeout(pointerTimerRef.current);
      pointerTimerRef.current = null;
    }
    setPointerKick(false);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      stopAnimationTimers();
    };
  }, [stopAnimationTimers]);

  const toggleSoundMuted = () => {
    setSoundMuted((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(WHEEL_SOUND_MUTED_KEY, next ? '1' : '0');
      } catch {
        // ignore
      }
      if (next) {
        stopWheelSpinAudio();
      } else {
        unlockWheelAudio();
        playWheelTick(0.8);
      }
      return next;
    });
  };

  useEffect(() => {
    const handleSidebarState = (e: Event) => {
      const customEvent = e as CustomEvent<{ open: boolean }>;
      if (customEvent.detail && typeof customEvent.detail.open === 'boolean') {
        setIsSidebarOpen(customEvent.detail.open);
      }
    };
    window.addEventListener('econnotes:sidebar-state', handleSidebarState as EventListener);
    return () => window.removeEventListener('econnotes:sidebar-state', handleSidebarState as EventListener);
  }, []);

  /** Strictly read-only status refresh from server — NEVER starts a spin or animation. */
  const refreshWheelStatus = useCallback(async (showLoader = false) => {
    const activeUser = userRef.current;
    if (!activeUser || spinLockRef.current || statusInFlightRef.current) return;
    statusInFlightRef.current = true;
    if (showLoader) setPhase('loading');
    try {
      const srv = await fetchLuckyWheelStatus(activeUser, { isAdmin: isAdminRef.current });
      if (!mountedRef.current || spinLockRef.current) return;
      if (srv) {
        const srvMs = Date.parse(srv.serverNowIso);
        if (Number.isFinite(srvMs)) setClockOffsetMs(srvMs - Date.now());
        setServerStatus(srv);
        if (srv.hasSpunToday && srv.spin?.segmentId) {
          const found = MONDAY_WHEEL_SEGMENTS.find((s) => s.id === srv.spin?.segmentId) || null;
          setWonSegment(found);
          setPhase('completed');
        } else {
          setWonSegment(null);
          setPhase('idle');
        }
      } else {
        const fallbackState = getMondayWheelState(activeUser, new Date(), {
          isAdmin: isAdminRef.current,
          profile: profileRef.current as any,
        });
        if (fallbackState.hasSpunToday && fallbackState.todayRewardId) {
          const found = MONDAY_WHEEL_SEGMENTS.find((s) => s.id === fallbackState.todayRewardId) || null;
          setWonSegment(found);
          setPhase('completed');
        } else {
          setWonSegment(null);
          setPhase('idle');
        }
      }
    } catch {
      if (mountedRef.current && !spinLockRef.current) {
        setPhase('idle');
      }
    } finally {
      statusInFlightRef.current = false;
    }
  }, []);

  // One-time read-only status load + verified historical XP sync per user (NEVER auto-spins or auto-opens)
  useEffect(() => {
    if (loading || !user?.id) return;
    void refreshWheelStatus(false);

    if (lastReconciledUserRef.current !== user.id) {
      lastReconciledUserRef.current = user.id;
      void syncPendingWheelXp(user, { isAdmin }).then((recoveredXp) => {
        if (mountedRef.current && recoveredXp && recoveredXp > 0) {
          toast.success(`Doğrulanmış eksik +${recoveredXp} XP ödülün hesabına aktarıldı!`);
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, isAdmin, loading, refreshWheelStatus]);

  useEffect(() => {
    const handleOpen = () => {
      setSpinError(null);
      setOpen(true);
      if (!spinLockRef.current) {
        void refreshWheelStatus(true);
      }
    };
    const handleUpdated = () => {
      if (!spinLockRef.current) {
        void refreshWheelStatus(false);
      }
    };

    window.addEventListener('econnotes:open-monday-wheel', handleOpen);
    window.addEventListener('econnotes:wheel-updated', handleUpdated);
    return () => {
      window.removeEventListener('econnotes:open-monday-wheel', handleOpen);
      window.removeEventListener('econnotes:wheel-updated', handleUpdated);
    };
  }, [refreshWheelStatus]);

  if (!user) return null;

  const numSegments = MONDAY_WHEEL_SEGMENTS.length;
  const sliceAngle = 360 / numSegments;

  /**
   * PURELY visual animation targeting an ALREADY server-committed reward segment.
   * Never calls any backend API or grants any reward when it finishes.
   */
  const playSingleSpinAnimation = (
    chosen: WheelSegment,
    transactionId: string,
    newPointsTotal: number | null | undefined,
    onDone: () => void,
  ) => {
    if (animatedTxIdsRef.current.has(transactionId)) {
      onDone();
      return;
    }
    animatedTxIdsRef.current.add(transactionId);

    const chosenIdx = Math.max(
      0,
      MONDAY_WHEEL_SEGMENTS.findIndex((s) => s.id === chosen.id),
    );
    const targetSliceCenter = chosenIdx * sliceAngle + sliceAngle / 2;
    const extraSpins = 360 * 6;
    const jitter = (Math.random() - 0.5) * (sliceAngle * 0.42);
    const startRotation = rotationRef.current;
    const nextRotation =
      startRotation + extraSpins + (360 - targetSliceCenter) - (startRotation % 360) + jitter;
    const totalDelta = nextRotation - startRotation;

    const pegEvents = computeWheelPegEvents(startRotation, totalDelta, SPIN_DURATION_MS, 14);
    if (!soundMutedRef.current) {
      startWheelSpinAudio(pegEvents, SPIN_DURATION_MS);
    }

    setPhase('animating');
    setRotationDeg(nextRotation);

    if (tickRafRef.current !== null) cancelAnimationFrame(tickRafRef.current);
    let nextEventIdx = 0;
    const spinStartedAt = performance.now();

    const stepPointer = (now: number) => {
      const elapsed = now - spinStartedAt;
      let triggered = false;
      while (nextEventIdx < pegEvents.length && elapsed >= pegEvents[nextEventIdx].timeMs) {
        nextEventIdx++;
        triggered = true;
      }
      if (triggered) {
        setPointerKick(true);
        if (pointerTimerRef.current !== null) window.clearTimeout(pointerTimerRef.current);
        pointerTimerRef.current = window.setTimeout(() => setPointerKick(false), 55);
      }
      if (elapsed < SPIN_DURATION_MS) {
        tickRafRef.current = requestAnimationFrame(stepPointer);
      } else {
        tickRafRef.current = null;
      }
    };
    tickRafRef.current = requestAnimationFrame(stepPointer);

    if (spinTimerRef.current !== null) window.clearTimeout(spinTimerRef.current);
    spinTimerRef.current = window.setTimeout(() => {
      if (tickRafRef.current !== null) {
        cancelAnimationFrame(tickRafRef.current);
        tickRafRef.current = null;
      }
      setPointerKick(false);
      if (!mountedRef.current) return;

      if (!soundMutedRef.current) {
        const isGrandPrize = chosen.id === 'xp_500' || chosen.type === 'unlimited_day';
        playWheelWinSound(isGrandPrize);
      }

      setWonSegment(chosen);
      setPhase('completed');
      onDone();

      if (chosen.type === 'xp' && typeof newPointsTotal === 'number') {
        toast.success(
          `Tebrikler! ${chosen.fullTitle} hesabına eklendi! (Yeni toplam: ${newPointsTotal.toLocaleString('tr-TR')} XP)`,
        );
      } else {
        toast.success(`Tebrikler! ${chosen.fullTitle} hesabına tanımlandı!`);
      }
    }, SPIN_DURATION_MS);
  };

  /**
   * Triggered EXCLUSIVELY by explicit click on "Şans Çarkını Çevir!".
   * Step 1: Acquire synchronous ref lock + disable button immediately.
   * Step 2: Execute single atomic server spin (commits reward in PostgreSQL).
   * Step 3: Animate wheel ONCE to the server-confirmed winning segment.
   */
  const handleSpin = async () => {
    if (spinLockRef.current || phase !== 'idle' || !wheelState.canSpinNow || !user) return;

    spinLockRef.current = true;
    setSpinError(null);
    setPhase('requesting');

    // Unlock audio synchronously inside the user's explicit click gesture
    if (!soundMutedRef.current) {
      unlockWheelAudio();
    }

    const clientRequestId = getOrCreatePendingSpinRequestId(user.id, wheelState.dailyPeriod);
    const res = await executeLuckyWheelSpin(user, clientRequestId, { isAdmin });

    if (!mountedRef.current) {
      spinLockRef.current = false;
      return;
    }

    if (!res.ok || !res.segment || !res.spin) {
      if (res.retryable === false) {
        clearPendingSpinRequestId(user.id, wheelState.dailyPeriod);
      }
      const errMsg = res.error || 'Çark ödülü kaydedilemedi. Lütfen tekrar dene.';
      setSpinError(errMsg);
      setPhase('idle');
      spinLockRef.current = false;
      toast.error(errMsg);
      return;
    }

    clearPendingSpinRequestId(user.id, wheelState.dailyPeriod);

    if (res.serverNowIso) {
      const srvMs = Date.parse(res.serverNowIso);
      if (Number.isFinite(srvMs)) setClockOffsetMs(srvMs - Date.now());
    }

    const nextServerStatus: ServerWheelStatus = {
      serverNowIso: res.serverNowIso || new Date().toISOString(),
      dailyPeriod: res.spin.dailyPeriod,
      isMonday: wheelState.isMonday,
      isAdminDailyMode: wheelState.isAdminDailyMode,
      hasSpunToday: true,
      canSpinNow: false,
      nextResetAtIso: res.nextResetAtIso || serverStatus?.nextResetAtIso || new Date().toISOString(),
      userPoints: res.newPointsTotal ?? serverStatus?.userPoints ?? 0,
      wheelBonusQuota: res.wheelBonusQuota ?? wheelState.bonusQuota,
      wheelUnlimitedUntil: res.wheelUnlimitedUntil ?? serverStatus?.wheelUnlimitedUntil ?? null,
      spin: res.spin,
    };

    // If user already spun in another tab/device, do NOT spin a second time — show exact committed reward!
    if (res.alreadySpun) {
      setServerStatus(nextServerStatus);
      setWonSegment(res.segment);
      setPhase('completed');
      spinLockRef.current = false;
      void refreshProfile?.();
      toast.info('Bugünkü çark hakkını zaten kullandın. Kazandığın ödül hesabında tanımlı!');
      return;
    }

    // Play ONE single visual landing animation for this committed transactionId
    playSingleSpinAnimation(res.segment, res.spin.transactionId, res.newPointsTotal, () => {
      setServerStatus(nextServerStatus);
      spinLockRef.current = false;
      void refreshProfile?.();
      window.dispatchEvent(new CustomEvent('econnotes:points-updated'));
      window.dispatchEvent(new CustomEvent('econnotes:wheel-updated'));
    });
  };

  const cx = 160;
  const cy = 160;
  const r = 136;
  const showFloatingLauncher = !launcherDismissed && !isTourOpen && location.pathname === '/';

  return (
    <>
      {/* Sağ Altta Çark Resmi ile Gösterilen EconNotes Uyumlu Pazartesi Şans Çarkı Kutusu */}
      {showFloatingLauncher && (
        <div
          className={cn(
            'fixed bottom-[calc(env(safe-area-inset-bottom,0px)+5.85rem)] right-3.5 z-30 md:bottom-5 md:right-5 items-center',
            isSidebarOpen ? 'hidden md:flex' : 'flex',
          )}
        >
          <div
            className={cn(
              'group relative flex items-center gap-3 overflow-hidden rounded-[22px] p-2.5 pr-3 text-white',
              'border border-cyan-300/35 bg-gradient-to-r from-[#001a49]/95 via-[#003182]/95 to-[#0052b5]/95',
              'shadow-[0_18px_44px_-8px_rgba(0,40,110,0.55),0_4px_14px_rgba(0,0,0,0.2),inset_0_1px_1px_rgba(255,255,255,0.25)]',
              'backdrop-blur-2xl transition-all duration-300 hover:-translate-y-0.5 hover:border-cyan-300/60 hover:shadow-[0_22px_50px_-8px_rgba(0,70,175,0.65)]',
            )}
          >
            <div className="pointer-events-none absolute inset-x-5 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/80 to-transparent" />
            <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-cyan-400/20 blur-2xl" />

            <button
              type="button"
              onClick={openMondayWheelModal}
              className="relative z-10 flex items-center gap-3 text-left focus:outline-none"
            >
              <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-cyan-300/35 bg-gradient-to-br from-[#001233] via-[#00286e] to-[#0055b8] p-1 shadow-[0_6px_16px_rgba(0,18,56,0.5),inset_0_1px_1px_rgba(255,255,255,0.2)]">
                <EconWheelMiniGraphic className="h-10 w-10 transition-transform duration-500 ease-out group-hover:rotate-45" />
                {wheelState.canSpinNow && (
                  <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-cyan-400 ring-2 ring-[#001a49] animate-pulse" />
                )}
              </div>

              <div className="min-w-0 pr-0.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-[13px] font-extrabold tracking-tight text-white whitespace-nowrap">
                    Pazartesi Şans Çarkı
                  </span>
                </div>
                <p className="mt-0.5 flex items-center gap-1 text-[11px] font-medium text-blue-100/90 whitespace-nowrap">
                  <CalendarClock className="h-3 w-3 shrink-0 text-cyan-300" />
                  <span>
                    {wheelState.canSpinNow
                      ? wheelState.isAdminDailyMode && !wheelState.isMonday
                        ? 'Yönetici hakkın hazır, çevir!'
                        : 'Hemen çevir, ödülünü kazan!'
                      : wheelState.countdownLabel
                          .replace('Bir sonraki Pazartesi çarkına ', '')
                          .replace('Yarınki yönetici çark hakkına ', 'Yarınki hakka: ')}
                  </span>
                </p>
              </div>
            </button>

            <div className="relative z-10 flex items-center pl-1 border-l border-white/15">
              <button
                type="button"
                aria-label="Çark kutusunu gizle"
                onClick={(e) => {
                  e.stopPropagation();
                  setLauncherDismissed(true);
                }}
                className="flex h-7 w-7 items-center justify-center rounded-full text-blue-100/75 hover:bg-white/15 hover:text-white transition-colors active:scale-90"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EconNotes Temalı Pazartesi Şans Çarkı Modalı */}
      <Dialog open={open} onOpenChange={(v) => !isBusy && setOpen(v)}>
        <DialogContent
          onOpenAutoFocus={(e) => e.preventDefault()}
          className={cn(
            'w-[calc(100vw-1.5rem)] max-w-md overflow-hidden rounded-[28px] p-0 sm:p-0 gap-0 text-white backdrop-blur-2xl [&>button]:hidden',
            isNovember10
              ? 'border border-white/15 bg-gradient-to-b from-zinc-900 via-zinc-900 to-zinc-950 shadow-[0_24px_64px_rgba(0,0,0,0.65)]'
              : 'border border-cyan-300/30 bg-gradient-to-b from-[#001d52] via-[#003385] to-[#041536] shadow-[0_24px_72px_rgba(0,55,145,0.6)]',
          )}
        >
          <div className="pointer-events-none absolute -right-14 -top-14 h-48 w-48 rounded-full bg-cyan-400/25 blur-3xl" />
          <div className="pointer-events-none absolute -left-14 top-1/3 h-48 w-48 rounded-full bg-[#0070d1]/30 blur-3xl" />
          <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/80 to-transparent" />

          <div className="relative z-10 px-5 pt-5 pb-3 sm:px-6 sm:pt-6 text-center">
            <div className="relative flex items-center justify-center mb-3.5">
              <button
                type="button"
                onClick={toggleSoundMuted}
                aria-label={soundMuted ? 'Çark sesini aç' : 'Çark sesini kapat'}
                title={soundMuted ? 'Sesi Aç' : 'Sesi Kapat'}
                className="absolute left-0 top-1/2 -translate-y-1/2 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white/85 transition-all hover:bg-white/20 hover:text-white active:scale-90"
              >
                {soundMuted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
              </button>
              <EconLogo allWhite className="h-5 sm:h-6 w-auto" />
              <button
                type="button"
                disabled={isBusy}
                onClick={() => !isBusy && setOpen(false)}
                aria-label="Kapat"
                className="absolute right-0 top-1/2 -translate-y-1/2 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white/85 transition-all hover:bg-white/20 hover:text-white active:scale-90 disabled:opacity-40"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <DialogHeader className="relative z-10 pr-0 !text-center items-center">
              <DialogTitle className="w-full text-center text-xl sm:text-2xl font-extrabold tracking-tight text-white">
                Pazartesi Şans Çarkı
              </DialogTitle>
              <DialogDescription className="w-full text-center text-xs text-blue-100/90 mt-1 leading-relaxed max-w-[340px] mx-auto">
                {wheelState.isAdminDailyMode
                  ? 'Yönetici ayrıcalığıyla her gün 1 kez çarkı çevirebilir; 1 günlük sınırsız not erişimi, +2 not hakkı veya 500 XP’ye varan puanları anında kazanabilirsin!'
                  : 'Her Pazartesi giriş yap, çarkı çevir; 1 günlük sınırsız not erişimi, +2 not hakkı veya 500 XP’ye varan puanları anında kazan!'}
              </DialogDescription>
              {wheelState.isAdminDailyMode && (
                <div className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-cyan-300/35 bg-cyan-400/15 px-3 py-0.5 text-[11px] font-bold text-cyan-100">
                  <ShieldCheck className="h-3.5 w-3.5 text-cyan-300" />
                  <span>Yönetici Günlük Çark Hakkı (Her Gün 1 Kez)</span>
                </div>
              )}
            </DialogHeader>
          </div>

          <div className="relative z-10 px-5 pb-5 pt-2 sm:px-6 sm:pb-6 space-y-4">
            {/* EconNotes Kobalt & Cyan Çark Görseli */}
            <div className="relative mx-auto flex h-[290px] w-[290px] sm:h-[304px] sm:w-[304px] items-center justify-center">
              <div className="pointer-events-none absolute inset-2 rounded-full bg-cyan-400/20 blur-2xl" />

              <div
                className={cn(
                  'absolute -top-2.5 left-1/2 z-30 -translate-x-1/2 origin-top transition-transform duration-75 drop-shadow-[0_4px_12px_rgba(0,12,36,0.75)]',
                  pointerKick ? '-rotate-[14deg]' : 'rotate-0',
                )}
              >
                <svg width="34" height="34" viewBox="0 0 34 34">
                  <polygon
                    points="17,32 4,6 30,6"
                    fill="#002b75"
                    stroke="#38bdf8"
                    strokeWidth="2.5"
                  />
                  <circle cx="17" cy="12" r="3.5" fill="#ffffff" />
                </svg>
              </div>

              <svg
                data-testid="lucky-wheel-svg"
                viewBox="0 0 320 320"
                className="h-full w-full drop-shadow-[0_16px_38px_rgba(0,12,36,0.65)]"
                style={{
                  transform: `rotate(${rotationDeg}deg)`,
                  transition:
                    phase === 'animating'
                      ? 'transform 4.2s cubic-bezier(0.15, 0.88, 0.22, 1)'
                      : 'none',
                }}
              >
                <circle
                  cx={cx}
                  cy={cy}
                  r={r + 12}
                  fill="#001438"
                  stroke="#38bdf8"
                  strokeWidth="3"
                  strokeOpacity="0.75"
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

                <circle
                  cx={cx}
                  cy={cy}
                  r="38"
                  fill="rgba(0, 24, 69, 0.35)"
                  stroke="rgba(255,255,255,0.25)"
                  strokeWidth="1.5"
                />
              </svg>

              <div className="pointer-events-none absolute z-20 flex h-16 w-16 items-center justify-center rounded-full border-[3px] border-cyan-300/85 bg-gradient-to-br from-[#001845] via-[#003791] to-[#0070d1] shadow-[0_0_24px_rgba(0,112,209,0.75)]">
                <img
                  src={econEMark}
                  alt="EconNotes E"
                  className="h-9 w-9 object-contain brightness-0 invert select-none"
                  draggable={false}
                />
              </div>
            </div>

            {spinError && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-2xl border border-rose-300/35 bg-rose-500/15 px-3.5 py-2.5 text-left text-xs text-rose-100"
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-300" />
                <span>{spinError}</span>
              </div>
            )}

            {/* Kazanılan Ödül veya Durum Kartı */}
            {phase === 'completed' && wonSegment && wheelState.hasSpunToday ? (
              <div className="rounded-2xl border border-cyan-300/25 bg-white/[0.08] p-4 text-center space-y-2 backdrop-blur-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.15)]">
                <div className="inline-flex items-center gap-1.5 text-xs font-bold text-cyan-300">
                  <PartyPopper className="h-4 w-4" />
                  {wheelState.isAdminDailyMode && !wheelState.isMonday
                    ? 'Bugünkü Yönetici Ödülün Hesabına Yüklendi!'
                    : 'Bu Haftaki Pazartesi Ödülün Hesabına Yüklendi!'}
                </div>
                <p className="text-base font-extrabold text-white">{wonSegment.fullTitle}</p>
                <p className="text-xs text-blue-100/85">{wonSegment.description}</p>
                {wheelState.isAdminDailyMode && (
                  <p className="text-[11px] font-medium text-cyan-200/90">{wheelState.countdownLabel}</p>
                )}
                <div className="pt-2 flex gap-2 justify-center">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setOpen(false)}
                    className="rounded-xl text-xs border border-white/15 bg-white/[0.06] text-blue-100 hover:bg-white/15 hover:text-white"
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
                    className="rounded-xl bg-gradient-to-r from-[#0055b8] via-[#0070d1] to-[#0ea5e9] text-white text-xs gap-1.5 border border-cyan-300/30 shadow-md"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {wonSegment.type === 'xp' ? 'Puanlarıma Git' : 'Notlara Git'}
                  </Button>
                </div>
              </div>
            ) : !wheelState.isMonday && !wheelState.isAdminDailyMode ? (
              <div className="rounded-2xl border border-cyan-300/25 bg-white/[0.08] p-4 text-center space-y-1.5 backdrop-blur-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.15)]">
                <div className="inline-flex items-center gap-1.5 text-xs font-bold text-cyan-200">
                  <Lock className="h-3.5 w-3.5 text-cyan-300" />
                  Yalnızca Pazartesi Günleri Çevrilebilir
                </div>
                <p className="text-xs text-blue-100/85 leading-relaxed">
                  Şans çarkı haftada yalnız 1 gün (Pazartesi 00:00 - 23:59 arası) aktif olur. Pazartesi günü çevirmeyi kaçırırsan bir sonraki Pazartesi gününü beklemen gerekir.
                </p>
                <p className="inline-flex items-center gap-1.5 rounded-full border border-cyan-300/30 bg-cyan-400/15 px-3 py-1 text-xs font-semibold text-cyan-100 mt-1">
                  <CalendarClock className="h-3.5 w-3.5 text-cyan-300" />
                  {wheelState.countdownLabel}
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                <Button
                  type="button"
                  disabled={phase !== 'idle' || !wheelState.canSpinNow}
                  onClick={() => void handleSpin()}
                  className={cn(
                    'w-full h-11 rounded-2xl text-white font-bold text-sm shadow-lg gap-2 border border-cyan-300/30',
                    isNovember10
                      ? 'bg-zinc-100 text-zinc-950 hover:bg-zinc-200'
                      : 'bg-gradient-to-r from-[#0055b8] via-[#0070d1] to-[#0ea5e9] hover:opacity-95 shadow-[#0070d1]/35',
                  )}
                >
                  {phase === 'loading' || phase === 'requesting' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Gift className="h-4 w-4" />
                  )}
                  {phase === 'loading'
                    ? 'Durum Kontrol Ediliyor...'
                    : phase === 'requesting'
                      ? 'Ödül Doğrulanıyor...'
                      : phase === 'animating'
                        ? 'Çark Dönüyor...'
                        : 'Şans Çarkını Çevir!'}
                </Button>
                <p className="text-center text-[11px] text-blue-100/80">
                  {wheelState.countdownLabel} · Çıkan ödül sunucu onayıyla anında hesabına tanımlanır.
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
