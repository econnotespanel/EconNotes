import { useCallback, useEffect, useRef } from 'react';

interface Point {
  x: number;
  y: number;
}

interface BoltSegment {
  points: Point[];
  width: number;
  alpha: number;
}

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
}

interface EconLogoLightningProps {
  active: boolean;
  isDark?: boolean;
}

/**
 * Generates a realistic jagged fractal lightning path between two points
 * using recursive midpoint displacement.
 */
function buildFractalPath(a: Point, b: Point, displace: number, depth: number): Point[] {
  if (depth <= 0 || displace < 1.2) return [a, b];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  // Normal vector perpendicular to segment
  const nx = -dy / len;
  const ny = dx / len;
  const offset = (Math.random() - 0.5) * 2 * displace;
  const mid: Point = {
    x: (a.x + b.x) * 0.5 + nx * offset,
    y: (a.y + b.y) * 0.5 + ny * offset,
  };
  const left = buildFractalPath(a, mid, displace * 0.55, depth - 1);
  const right = buildFractalPath(mid, b, displace * 0.55, depth - 1);
  return [...left.slice(0, -1), ...right];
}

function generateStrikeSet(width: number, height: number): BoltSegment[] {
  const segments: BoltSegment[] = [];
  // Sleek translucent plasma arc flowing smoothly from the E-spark across the logo
  const startX = width * (0.14 + Math.random() * 0.05);
  const startY = height * (0.28 + Math.random() * 0.14);
  const endX = width * (0.84 + Math.random() * 0.1);
  const endY = height * (0.36 + Math.random() * 0.28);

  const main = buildFractalPath(
    { x: startX, y: startY },
    { x: endX, y: endY },
    height * 0.2,
    5,
  );
  segments.push({ points: main, width: 1.35, alpha: 0.78 });

  // 2 fine modern hairline branches
  const branchCount = 2;
  for (let b = 0; b < branchCount; b++) {
    const idx = Math.floor(main.length * (0.26 + b * 0.28 + Math.random() * 0.08));
    const origin = main[Math.min(main.length - 2, Math.max(1, idx))];
    const dirY = b % 2 === 0 ? -1 : 1;
    const target: Point = {
      x: Math.min(width - 4, origin.x + width * (0.12 + Math.random() * 0.14)),
      y: Math.max(4, Math.min(height - 4, origin.y + dirY * height * (0.18 + Math.random() * 0.22))),
    };
    const branch = buildFractalPath(origin, target, height * 0.1, 3);
    segments.push({ points: branch, width: 0.72, alpha: 0.52 });
  }

  return segments;
}

/**
 * Retina HTML5 Canvas procedural fractal lightning overlay for the EconNotes header logo.
 * Fires an authentic double-flash plasma strike + micro-sparks on hover with zero clipart clutter.
 */
export default function EconLogoLightning({ active, isDark = false }: EconLogoLightningProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const activeRef = useRef(active);
  const darkRef = useRef(isDark);

  activeRef.current = active;
  darkRef.current = isDark;

  const stopLoop = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
    }
  }, []);

  useEffect(() => {
    if (!active) {
      stopLoop();
      return;
    }

    if (
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    const cssW = Math.max(120, rect.width);
    const cssH = Math.max(40, rect.height);
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    let bolts: BoltSegment[] = generateStrikeSet(cssW, cssH);
    const sparks: Spark[] = [];

    const spawnSparks = (count: number) => {
      const ox = cssW * 0.17;
      const oy = cssH * 0.35;
      for (let i = 0; i < count; i++) {
        const angle = -Math.PI * 0.65 + Math.random() * Math.PI * 1.3;
        const speed = 0.85 + Math.random() * 2.1;
        sparks.push({
          x: ox + (Math.random() - 0.5) * 10,
          y: oy + (Math.random() - 0.5) * 8,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 0,
          maxLife: 18 + Math.random() * 18,
          size: 0.85 + Math.random() * 1.15,
        });
      }
    };

    spawnSparks(9);
    let cycleStart = performance.now();
    let lastMorph = cycleStart;

    const drawBolt = (seg: BoltSegment, intensity: number) => {
      if (seg.points.length < 2 || intensity <= 0.02) return;
      const dark = darkRef.current;

      const trace = () => {
        ctx.beginPath();
        ctx.moveTo(seg.points[0].x, seg.points[0].y);
        for (let i = 1; i < seg.points.length; i++) {
          ctx.lineTo(seg.points[i].x, seg.points[i].y);
        }
      };

      // Modern iridescent cyan -> electric blue -> soft violet gradient along the arc
      const arcGrad = ctx.createLinearGradient(
        seg.points[0].x,
        seg.points[0].y,
        seg.points[seg.points.length - 1].x,
        seg.points[seg.points.length - 1].y,
      );
      if (dark) {
        arcGrad.addColorStop(0, `rgba(125, 211, 252, ${0.55 * seg.alpha * intensity})`);
        arcGrad.addColorStop(0.55, `rgba(56, 189, 248, ${0.48 * seg.alpha * intensity})`);
        arcGrad.addColorStop(1, `rgba(129, 140, 248, ${0.42 * seg.alpha * intensity})`);
      } else {
        arcGrad.addColorStop(0, `rgba(14, 165, 233, ${0.5 * seg.alpha * intensity})`);
        arcGrad.addColorStop(0.55, `rgba(37, 99, 235, ${0.42 * seg.alpha * intensity})`);
        arcGrad.addColorStop(1, `rgba(99, 102, 241, ${0.36 * seg.alpha * intensity})`);
      }

      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      if (dark) {
        ctx.globalCompositeOperation = 'screen';
      }

      // Layer 1: Airy translucent plasma aura
      trace();
      ctx.strokeStyle = dark
        ? `rgba(56, 189, 248, ${0.2 * seg.alpha * intensity})`
        : `rgba(37, 99, 235, ${0.18 * seg.alpha * intensity})`;
      ctx.lineWidth = seg.width * 3.8;
      ctx.shadowColor = dark ? '#38bdf8' : '#3b82f6';
      ctx.shadowBlur = dark ? 14 : 10;
      ctx.stroke();

      // Layer 2: Sleek translucent cyan-indigo gradient filament
      trace();
      ctx.strokeStyle = arcGrad;
      ctx.lineWidth = seg.width * 1.45;
      ctx.shadowBlur = 5;
      ctx.stroke();

      // Layer 3: Fine glassy white-ice highlight core
      trace();
      ctx.strokeStyle = `rgba(255, 255, 255, ${0.65 * seg.alpha * intensity})`;
      ctx.lineWidth = Math.max(0.65, seg.width * 0.55);
      ctx.shadowBlur = 2;
      ctx.stroke();

      ctx.restore();
    };

    const tick = (now: number) => {
      if (!activeRef.current) {
        stopLoop();
        return;
      }

      const elapsed = now - cycleStart;
      ctx.clearRect(0, 0, cssW, cssH);

      // Authentic atmospheric double-flash envelope (0..520ms), then calm pause until 1900ms
      let intensity = 0;
      if (elapsed < 105) {
        // Primary bright strike
        intensity = 1 - (elapsed / 105) * 0.25;
      } else if (elapsed < 155) {
        // Brief flicker dip
        intensity = 0.2;
      } else if (elapsed < 310) {
        // Secondary strong re-strike
        intensity = 0.95 * (1 - (elapsed - 155) / 170);
      } else if (elapsed < 480) {
        // Fast natural fade-out
        intensity = 0.35 * (1 - (elapsed - 310) / 170);
      } else if (elapsed >= 1850) {
        // Subtle fresh crackle if user keeps hovering
        cycleStart = now;
        lastMorph = now;
        bolts = generateStrikeSet(cssW, cssH);
        spawnSparks(7);
      }

      // Morph bolt geometry rapidly during active strike for live electric crackle
      if (intensity > 0.25 && now - lastMorph > 52) {
        bolts = generateStrikeSet(cssW, cssH);
        lastMorph = now;
      }

      // Soft translucent origin shimmer at the E-spark mark
      if (intensity > 0.1) {
        const gx = cssW * 0.17;
        const gy = cssH * 0.35;
        const grad = ctx.createRadialGradient(gx, gy, 1, gx, gy, 22);
        grad.addColorStop(
          0,
          darkRef.current
            ? `rgba(224, 242, 254, ${0.45 * intensity})`
            : `rgba(56, 189, 248, ${0.36 * intensity})`,
        );
        grad.addColorStop(
          0.45,
          darkRef.current
            ? `rgba(56, 189, 248, ${0.18 * intensity})`
            : `rgba(59, 130, 246, ${0.14 * intensity})`,
        );
        grad.addColorStop(1, 'rgba(37, 99, 235, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(gx, gy, 22, 0, Math.PI * 2);
        ctx.fill();
      }

      for (const seg of bolts) {
        drawBolt(seg, intensity);
      }

      // Update & render delicate translucent micro-sparks
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i];
        s.x += s.vx;
        s.y += s.vy;
        s.vx *= 0.93;
        s.vy *= 0.93;
        s.life += 1;
        if (s.life >= s.maxLife) {
          sparks.splice(i, 1);
          continue;
        }
        const a = (1 - s.life / s.maxLife) * 0.65;
        ctx.save();
        ctx.fillStyle = darkRef.current
          ? `rgba(224, 242, 254, ${a})`
          : `rgba(14, 165, 233, ${a})`;
        ctx.shadowColor = '#38bdf8';
        ctx.shadowBlur = 5;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.size * (1 - s.life / s.maxLife), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      stopLoop();
    };
  }, [active, stopLoop]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none absolute -inset-x-4 -inset-y-2.5 z-20 h-[calc(100%+20px)] w-[calc(100%+32px)]"
    />
  );
}
