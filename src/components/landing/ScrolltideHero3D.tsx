import React, { useState, useEffect, useRef } from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import {
  Sparkles,
  BookOpen,
  TrendingUp,
  Brain,
  GraduationCap,
  Play,
  Pause,
  Volume2,
  VolumeX,
  ShieldCheck,
  CheckCircle2,
  Award,
  Users,
  Flame,
} from 'lucide-react';

interface ScrolltideHero3DProps {
  onExploreClick?: () => void;
  onLoginClick?: () => void;
}

export const ScrolltideHero3D: React.FC<ScrolltideHero3DProps> = ({
  onExploreClick,
  onLoginClick,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Mouse tilt tracking
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  // Smooth springs for high-end luxury feel
  const springConfig = { damping: 25, stiffness: 120 };
  const smoothX = useSpring(mouseX, springConfig);
  const smoothY = useSpring(mouseY, springConfig);

  const rotateX = useTransform(smoothY, [-0.5, 0.5], [10, -10]);
  const rotateY = useTransform(smoothX, [-0.5, 0.5], [-14, 14]);
  const lightX = useTransform(smoothX, [-0.5, 0.5], [20, 80]);
  const lightY = useTransform(smoothY, [-0.5, 0.5], [20, 80]);

  // Floating audio / lofi player simulator
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const oscillatorRef = useRef<OscillatorNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);

  // Play peaceful ambient lofi tone when toggled
  const toggleLofi = () => {
    if (!isPlaying) {
      try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (!audioContextRef.current) {
          audioContextRef.current = new AudioCtx();
        }
        const ctx = audioContextRef.current;
        if (ctx.state === 'suspended') {
          ctx.resume();
        }

        // Create warm ambient synth chord
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(220, ctx.currentTime); // A3 warm tone

        gain.gain.setValueAtTime(0.01, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.04, ctx.currentTime + 1);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();

        oscillatorRef.current = osc;
        gainNodeRef.current = gain;
        setIsPlaying(true);
      } catch (e) {
        setIsPlaying(true);
      }
    } else {
      if (oscillatorRef.current) {
        try {
          oscillatorRef.current.stop();
          oscillatorRef.current.disconnect();
        } catch (e) {}
      }
      setIsPlaying(false);
    }
  };

  useEffect(() => {
    return () => {
      if (oscillatorRef.current) {
        try {
          oscillatorRef.current.stop();
        } catch (e) {}
      }
    };
  }, []);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    mouseX.set(x);
    mouseY.set(y);
  };

  const handleMouseLeave = () => {
    mouseX.set(0);
    mouseY.set(0);
  };

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className="relative mx-auto w-full max-w-5xl py-4 sm:py-8 select-none"
      style={{ perspective: 1200 }}
    >
      <motion.div
        style={{
          rotateX,
          rotateY,
          transformStyle: 'preserve-3d',
        }}
        className="relative flex flex-col items-center justify-center min-h-[460px] sm:min-h-[540px] md:min-h-[580px] rounded-3xl border border-white/10 bg-gradient-to-b from-white/[0.07] via-white/[0.02] to-transparent p-6 sm:p-10 backdrop-blur-2xl shadow-[0_30px_100px_rgba(0,0,0,0.4)]"
      >
        {/* Dynamic Studio Ambient Spotlight */}
        <motion.div
          className="pointer-events-none absolute -inset-px rounded-3xl opacity-40 blur-2xl"
          style={{
            background: `radial-gradient(circle at 50% 40%, rgba(0, 112, 243, 0.35), rgba(0, 240, 255, 0.15) 40%, transparent 70%)`,
          }}
        />

        {/* Studio Pedestal / Circular Reflective Floor (Scrolltide car/mascot stage effect) */}
        <div
          className="absolute bottom-6 sm:bottom-12 w-[85%] sm:w-[70%] max-w-[520px] h-28 sm:h-36 rounded-[100%] pointer-events-none"
          style={{
            background:
              'radial-gradient(ellipse at center, rgba(0, 112, 243, 0.35) 0%, rgba(0, 240, 255, 0.12) 40%, rgba(10, 15, 35, 0.8) 75%, transparent 100%)',
            boxShadow: '0 20px 60px rgba(0, 112, 243, 0.25)',
            transform: 'rotateX(68deg) translateZ(-40px)',
          }}
        >
          {/* Subtle concentric rings on floor */}
          <div className="absolute inset-4 rounded-[100%] border border-cyan-400/20" />
          <div className="absolute inset-10 rounded-[100%] border border-blue-400/25 border-dashed animate-spin-slow" />
        </div>

        {/* 3D Knowledge Core / Central Mascot Sphere */}
        <div
          className="relative flex items-center justify-center my-8 sm:my-12 z-20 cursor-pointer"
          style={{ transform: 'translateZ(60px)' }}
          onClick={onExploreClick}
        >
          {/* External Gyroscopic Rings */}
          <div className="relative w-48 h-48 sm:w-64 sm:h-64 flex items-center justify-center">
            {/* Ring 1 - Outer cyan orbit */}
            <div
              className="absolute inset-0 rounded-full border-2 border-cyan-400/40 border-t-transparent border-l-transparent animate-spin"
              style={{ animationDuration: '18s' }}
            />
            {/* Ring 2 - Counter rotating blue orbit */}
            <div
              className="absolute inset-3 rounded-full border border-blue-400/50 border-b-transparent border-r-transparent animate-spin"
              style={{ animationDuration: '12s', animationDirection: 'reverse' }}
            />
            {/* Ring 3 - Dashed tilted orbit */}
            <div
              className="absolute inset-6 rounded-full border border-indigo-400/30 border-dashed animate-spin"
              style={{ animationDuration: '24s' }}
            />

            {/* Glowing Central Nucleus / Quantum Brain Orb */}
            <motion.div
              animate={{
                scale: [1, 1.05, 1],
                boxShadow: [
                  '0 0 50px rgba(0, 112, 243, 0.6), 0 0 100px rgba(0, 240, 255, 0.3)',
                  '0 0 70px rgba(0, 240, 255, 0.7), 0 0 120px rgba(0, 112, 243, 0.4)',
                  '0 0 50px rgba(0, 112, 243, 0.6), 0 0 100px rgba(0, 240, 255, 0.3)',
                ],
              }}
              transition={{ repeat: Infinity, duration: 4, ease: 'easeInOut' }}
              className="relative w-28 h-28 sm:w-36 sm:h-36 rounded-full bg-gradient-to-tr from-[#003791] via-[#0070d1] to-[#00f0ff] p-[2px] flex items-center justify-center overflow-hidden"
            >
              {/* Inner core refractive glass */}
              <div className="relative w-full h-full rounded-full bg-gradient-to-b from-[#0a1638]/90 via-[#071026]/95 to-[#030712] flex flex-col items-center justify-center backdrop-blur-md">
                {/* Core animated icon */}
                <motion.div
                  animate={{ y: [-3, 3, -3], rotate: [0, 5, -5, 0] }}
                  transition={{ repeat: Infinity, duration: 5, ease: 'easeInOut' }}
                  className="flex flex-col items-center"
                >
                  <div className="relative">
                    <Brain className="h-10 w-10 sm:h-12 sm:w-12 text-cyan-300 drop-shadow-[0_0_12px_rgba(0,240,255,0.8)]" />
                    <Sparkles className="absolute -top-1 -right-2 h-4 w-4 text-amber-300 animate-pulse" />
                  </div>
                  <span className="mt-1 text-[10px] sm:text-xs font-bold tracking-widest uppercase bg-gradient-to-r from-cyan-200 to-blue-200 bg-clip-text text-transparent">
                    ECON CORE
                  </span>
                </motion.div>

                {/* Micro energy filaments */}
                <div className="absolute inset-0 bg-radial-gradient from-cyan-400/20 via-transparent to-transparent pointer-events-none" />
              </div>
            </motion.div>

            {/* Floating Orbiting Satellite Tokens */}
            {/* Satellite 1: Economics Candlestick Graph */}
            <motion.div
              animate={{
                y: [0, -12, 0],
                x: [0, 6, 0],
                rotate: [0, 8, 0],
              }}
              transition={{ repeat: Infinity, duration: 4.5, ease: 'easeInOut' }}
              className="absolute -top-3 left-4 p-2.5 sm:p-3 rounded-2xl bg-white/10 dark:bg-white/[0.08] backdrop-blur-xl border border-white/20 shadow-lg flex items-center gap-2"
              style={{ transform: 'translateZ(90px)' }}
            >
              <div className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400">
                <TrendingUp className="h-4 w-4" />
              </div>
              <div className="hidden sm:block text-left">
                <div className="text-[10px] font-semibold text-emerald-400">İktisat & Finans</div>
                <div className="text-[9px] text-white/70">3,800+ Not</div>
              </div>
            </motion.div>

            {/* Satellite 2: Graduation Cap */}
            <motion.div
              animate={{
                y: [0, 14, 0],
                x: [0, -8, 0],
                rotate: [0, -6, 0],
              }}
              transition={{ repeat: Infinity, duration: 5, ease: 'easeInOut', delay: 0.5 }}
              className="absolute -bottom-2 right-2 p-2.5 sm:p-3 rounded-2xl bg-white/10 dark:bg-white/[0.08] backdrop-blur-xl border border-white/20 shadow-lg flex items-center gap-2"
              style={{ transform: 'translateZ(85px)' }}
            >
              <div className="p-1.5 rounded-lg bg-amber-500/20 text-amber-300">
                <GraduationCap className="h-4 w-4" />
              </div>
              <div className="hidden sm:block text-left">
                <div className="text-[10px] font-semibold text-amber-300">Düzce Üniversitesi</div>
                <div className="text-[9px] text-white/70">Resmi Kampüs Ağı</div>
              </div>
            </motion.div>

            {/* Satellite 3: AI Sparkle */}
            <motion.div
              animate={{
                y: [0, -10, 0],
                x: [0, -5, 0],
              }}
              transition={{ repeat: Infinity, duration: 4, ease: 'easeInOut', delay: 1 }}
              className="absolute top-1/2 -right-8 -translate-y-1/2 p-2 rounded-xl bg-cyan-500/20 backdrop-blur-md border border-cyan-400/40 text-cyan-300 shadow-md"
              style={{ transform: 'translateZ(95px)' }}
            >
              <Sparkles className="h-4 w-4 animate-spin-slow" />
            </motion.div>
          </div>
        </div>

        {/* ─── FLOATING HUD BADGE 1: TOP RIGHT (System Live Metric) ─── */}
        <motion.div
          animate={{ y: [0, -6, 0] }}
          transition={{ repeat: Infinity, duration: 6, ease: 'easeInOut' }}
          className="absolute top-4 sm:top-6 right-4 sm:right-6 z-30 flex items-center gap-2.5 px-3 sm:px-4 py-2 sm:py-2.5 rounded-2xl bg-black/40 border border-white/15 backdrop-blur-xl shadow-xl text-xs"
          style={{ transform: 'translateZ(50px)' }}
        >
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
          </span>
          <div className="text-left">
            <p className="font-semibold text-white tracking-wide text-[11px] sm:text-xs">
              CANLI SİSTEM • V2.4
            </p>
            <p className="text-[9px] sm:text-[10px] text-white/70 font-mono">
              +1,420 Öğrenci Çevrim İçi
            </p>
          </div>
        </motion.div>

        {/* ─── FLOATING HUD BADGE 2: CENTER LEFT (AI Assistant Snippet) ─── */}
        <motion.div
          animate={{ y: [0, 8, 0] }}
          transition={{ repeat: Infinity, duration: 5.5, ease: 'easeInOut', delay: 0.8 }}
          className="absolute top-16 sm:top-24 left-4 sm:left-6 z-30 max-w-[210px] sm:max-w-[260px] p-3 sm:p-3.5 rounded-2xl bg-black/40 border border-white/15 backdrop-blur-xl shadow-2xl text-left"
          style={{ transform: 'translateZ(75px)' }}
        >
          <div className="flex items-center justify-between mb-1.5">
            <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-cyan-300">
              <Brain className="h-3.5 w-3.5" /> AI Asistan
            </span>
            <div className="flex items-end gap-[2px] h-3">
              {[0.4, 0.8, 0.5, 1, 0.6, 0.3].map((val, i) => (
                <motion.span
                  key={i}
                  animate={{ height: ['20%', '100%', '30%'] }}
                  transition={{ repeat: Infinity, duration: 0.9, delay: i * 0.15 }}
                  className="w-[2px] bg-cyan-400 rounded-full"
                />
              ))}
            </div>
          </div>
          <p className="text-xs font-medium text-white/90 leading-snug">
            "Mikroekonomi Arz-Talep Dengesi özeti ve 30 soru kartı hazır!"
          </p>
          <div className="mt-2 flex items-center justify-between pt-1.5 border-t border-white/10 text-[10px] text-white/60">
            <span>Çalışma Stüdyosu</span>
            <span className="text-cyan-300 font-semibold cursor-pointer hover:underline">
              İncele →
            </span>
          </div>
        </motion.div>

        {/* ─── FLOATING HUD BADGE 3: BOTTOM LEFT (Community & Trust) ─── */}
        <motion.div
          animate={{ y: [0, -5, 0] }}
          transition={{ repeat: Infinity, duration: 6.5, ease: 'easeInOut', delay: 1.2 }}
          className="absolute bottom-4 sm:bottom-6 left-4 sm:left-6 z-30 hidden sm:flex items-center gap-3 p-3 rounded-2xl bg-black/40 border border-white/15 backdrop-blur-xl shadow-xl"
          style={{ transform: 'translateZ(45px)' }}
        >
          <div className="flex -space-x-2 overflow-hidden">
            <div className="inline-block h-7 w-7 rounded-full ring-2 ring-background bg-gradient-to-tr from-cyan-500 to-blue-500 text-[10px] font-bold text-white flex items-center justify-center">
              KÇ
            </div>
            <div className="inline-block h-7 w-7 rounded-full ring-2 ring-background bg-gradient-to-tr from-purple-500 to-indigo-500 text-[10px] font-bold text-white flex items-center justify-center">
              AY
            </div>
            <div className="inline-block h-7 w-7 rounded-full ring-2 ring-background bg-gradient-to-tr from-emerald-500 to-teal-500 text-[10px] font-bold text-white flex items-center justify-center">
              ED
            </div>
            <div className="inline-block h-7 w-7 rounded-full ring-2 ring-background bg-slate-800 text-[10px] font-bold text-white/80 flex items-center justify-center">
              +1k
            </div>
          </div>
          <div className="text-left">
            <div className="flex items-center gap-1 text-[11px] font-bold text-amber-300">
              <span>★ 4.9/5</span>
              <span className="text-white/60 font-normal">• DÜ Öğrencileri</span>
            </div>
            <div className="text-[9px] text-white/70">Topluluk tarafından onaylı</div>
          </div>
        </motion.div>

        {/* ─── FLOATING HUD BADGE 4: BOTTOM RIGHT (Lofi Study Room Audio Player) ─── */}
        <motion.div
          animate={{ y: [0, 6, 0] }}
          transition={{ repeat: Infinity, duration: 5, ease: 'easeInOut', delay: 0.4 }}
          className="absolute bottom-4 sm:bottom-6 right-4 sm:right-6 z-30 flex items-center gap-2.5 px-3.5 py-2.5 rounded-2xl bg-black/40 border border-white/15 backdrop-blur-xl shadow-xl"
          style={{ transform: 'translateZ(60px)' }}
        >
          <button
            onClick={toggleLofi}
            className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-tr from-[#0055ff] to-[#00e5ff] text-white shadow-md transition-transform hover:scale-105 active:scale-95"
            aria-label={isPlaying ? 'Lofi müziği durdur' : 'Lofi odak müziğini başlat'}
          >
            {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
          </button>
          <div className="text-left pr-1">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-semibold text-white">Odaklanma Odası</span>
              {isPlaying && (
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-cyan-400 animate-ping" />
              )}
            </div>
            <p className="text-[9px] text-white/60">
              {isPlaying ? 'Lofi Ambiyans Çalıyor...' : 'Tıkla ve Odaklan'}
            </p>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
};
