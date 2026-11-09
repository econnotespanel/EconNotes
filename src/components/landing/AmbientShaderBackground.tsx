import React, { useEffect, useRef } from 'react';
import { useTheme } from '@/contexts/ThemeContext';

interface AmbientShaderBackgroundProps {
  className?: string;
  intensity?: number;
}

/**
 * High-performance WebGL / 2D Canvas ambient fluid gradient shader.
 * Inspired by scrollshaders.com / scrolltide.co.
 * Smoothly follows mouse movement with silky organic aurora waves.
 */
export const AmbientShaderBackground: React.FC<AmbientShaderBackgroundProps> = ({
  className = '',
  intensity = 1.0,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    let mouseX = width / 2;
    let mouseY = height / 2;
    let targetMouseX = mouseX;
    let targetMouseY = mouseY;

    const handleMouseMove = (e: MouseEvent) => {
      targetMouseX = e.clientX;
      targetMouseY = e.clientY;
    };

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    window.addEventListener('resize', handleResize);

    const isNovember10 = typeof document !== 'undefined' && document.documentElement.dataset.seasonalTheme === 'november10';

    // Glowing organic orbs
    const orbs = [
      { x: width * 0.2, y: height * 0.3, radius: 360, vx: 0.3, vy: 0.25, baseColor: isNovember10 ? (isDark ? [80, 80, 80] : [160, 160, 160]) : (isDark ? [0, 85, 255] : [0, 112, 243]) },
      { x: width * 0.8, y: height * 0.4, radius: 420, vx: -0.25, vy: 0.35, baseColor: isNovember10 ? (isDark ? [110, 110, 110] : [190, 190, 190]) : (isDark ? [0, 240, 255] : [14, 165, 233]) },
      { x: width * 0.5, y: height * 0.75, radius: 400, vx: 0.2, vy: -0.3, baseColor: isNovember10 ? (isDark ? [60, 60, 60] : [140, 140, 140]) : (isDark ? [79, 70, 229] : [99, 102, 241]) },
      { x: width * 0.3, y: height * 0.6, radius: 300, vx: -0.3, vy: -0.2, baseColor: isNovember10 ? (isDark ? [90, 90, 90] : [170, 170, 170]) : (isDark ? [2, 132, 199] : [59, 130, 246]) },
    ];

    let time = 0;

    const render = () => {
      time += 0.012;

      // Smooth mouse lerping
      mouseX += (targetMouseX - mouseX) * 0.05;
      mouseY += (targetMouseY - mouseY) * 0.05;

      ctx.clearRect(0, 0, width, height);

      // Render base atmosphere
      for (let i = 0; i < orbs.length; i++) {
        const orb = orbs[i];

        // Harmonic fluid movement
        orb.x += Math.sin(time + i * 1.5) * orb.vx * 2;
        orb.y += Math.cos(time + i * 1.2) * orb.vy * 2;

        // Subtle pull toward mouse cursor
        const dx = mouseX - orb.x;
        const dy = mouseY - orb.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 10) {
          orb.x += (dx / dist) * 0.4;
          orb.y += (dy / dist) * 0.4;
        }

        const gradient = ctx.createRadialGradient(
          orb.x,
          orb.y,
          0,
          orb.x,
          orb.y,
          orb.radius * (1 + Math.sin(time * 0.8 + i) * 0.12)
        );

        const [r, g, b] = orb.baseColor;
        const alphaCenter = (isDark ? 0.28 : 0.15) * intensity;
        const alphaEdge = 0;

        gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${alphaCenter})`);
        gradient.addColorStop(0.5, `rgba(${r}, ${g}, ${b}, ${alphaCenter * 0.4})`);
        gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, ${alphaEdge})`);

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(orb.x, orb.y, orb.radius * 1.2, 0, Math.PI * 2);
        ctx.fill();
      }

      // Subtle cyber grid / noise texture sheen
      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('resize', handleResize);
    };
  }, [isDark, intensity]);

  return (
    <div className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}>
      <canvas
        ref={canvasRef}
        className="h-full w-full opacity-90 transition-opacity duration-1000"
      />
      {/* Film grain / micro grid overlay for tactile luxury finish */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.03] dark:opacity-[0.05]"
        style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, rgba(255,255,255,0.7) 1px, transparent 0)`,
          backgroundSize: '32px 32px',
        }}
      />
      {/* Atmospheric radial vignette */}
      <div className="pointer-events-none absolute inset-0 bg-radial-gradient from-transparent via-background/40 to-background/90" />
    </div>
  );
};
