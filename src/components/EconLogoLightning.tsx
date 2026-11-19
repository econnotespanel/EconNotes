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
  // Anchor near the E-mark spark on the left, arcing naturally across the logo span
  const startX = width * (0.14 + Math.random() * 0.06);
  const startY = height * (0.28 + Math.random() * 0.16);
  const endX = width * (0.82 + Math.random() * 0.12);
  const endY = height * (0.34 + Math.random() * 0.34);

  // Main upper/through plasma bolt
  const main = buildFractalPath(
    { x: startX, y: startY },
    { x: endX, y: endY },
    height * 0.28,
    5,
  );
  segments.push({ points: main, width: 2.1, alpha: 1 });

  // 2-3 organic hairline branches forking off the main bolt
  const branchCount = 2 + Math.floor(Math.random() * 2);
  for (let b = 0; b < branchCount; b++) {
    const idx = Math.floor(main.length * (0.22 + b * 0.24 + Math.random() * 0.1));
    const origin = main[Math.min(main.length - 2, Math.max(1, idx))];
    const dirY = Math.random() > 0.5 ? 1 : -1;
    const target: Point = {
      x: Math.min(width - 4, origin.x + width * (0.12 + Math.random() * 0.16)),
      y: Math.max(4, Math.min(height - 4, origin.y + dirY * height * (0.22 + Math.random() * 0.26))),
    };
    const branch = buildFractalPath(origin, target, height * 0.14, 3);
    segments.push({ points: branch, width: 1.05, alpha: 0.72 });
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
      const oy = cssH * 0.36;
      for (let i = 0; i < count; i++) {
        const angle = -Math.PI * 0.65 + Math.random() * Math.PI * 1.3;
        const speed = 1.1 + Math.random() * 2.8;
        sparks.push({
          x: ox + (Math.random() - 0.5) * 10,
          y: oy + (Math.random() - 0.5) * 8,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 0,
          maxLife: 16 + Math.random() * 18,
          size: 1.1 + Math.random() * 1.5,
        });
      }
    };

    spawnSparks(11);
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

      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // Layer 1: Wide outer electric cobalt/cyan plasma glow
      trace();
      ctx.strokeStyle = dark
        ? `rgba(56, 189, 248, ${0.42 * seg.alpha * intensity})`
        : `rgba(29, 78, 216, ${0.48 * seg.alpha * intensity})`;
      ctx.lineWidth = seg.width * 4.2;
      ctx.shadowColor = dark ? '#38bdf8' : '#2563eb';
      ctx.shadowBlur = dark ? 14 : 10;
      ctx.stroke();

      // Layer 2: Vivid mid-sheath electric blue/cyan
      trace();
      ctx.strokeStyle = dark
        ? `rgba(125, 211, 252, ${0.85 * seg.alpha * intensity})`
        : `rgba(14, 165, 233, ${0.9 * seg.alpha * intensity})`;
      ctx.lineWidth = seg.width * 1.85;
      ctx.shadowBlur = 6;
      ctx.stroke();

      // Layer 3: Blinding pure white hot plasma filament core
      trace();
      ctx.strokeStyle = `rgba(255, 255, 255, ${0.98 * seg.alpha * intensity})`;
      ctx.lineWidth = Math.max(0.8, seg.width * 0.72);
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

      // Soft origin flash halo at the E-spark mark
      if (intensity > 0.1) {
        const gx = cssW * 0.17;
        const gy = cssH * 0.35;
        const grad = ctx.createRadialGradient(gx, gy, 1, gx, gy, 24);
        grad.addColorStop(
          0,
          darkRef.current
            ? `rgba(224, 242, 254, ${0.85 * intensity})`
            : `rgba(56, 189, 248, ${0.7 * intensity})`,
        );
        grad.addColorStop(
          0.45,
          darkRef.current
            ? `rgba(56, 189, 248, ${0.35 * intensity})`
            : `rgba(37, 99, 235, ${0.3 * intensity})`,
        );
        grad.addColorStop(1, 'rgba(37, 99, 235, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(gx, gy, 24, 0, Math.PI * 2);
        ctx.fill();
      }

      for (const seg of bolts) {
        drawBolt(seg, intensity);
      }

      // Update & render luminous micro-sparks
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
        const a = 1 - s.life / s.maxLife;
        ctx.save();
        ctx.fillStyle = darkRef.current
          ? `rgba(224, 242, 254, ${a})`
          : `rgba(37, 99, 235, ${a})`;
        ctx.shadowColor = '#38bdf8';
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.size * a, 0, Math.PI * 2);
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
