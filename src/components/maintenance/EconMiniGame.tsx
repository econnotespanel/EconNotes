import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Gamepad2, Trophy, RotateCcw, Volume2, VolumeX, Heart, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface FallingItem {
  id: number;
  x: number;
  y: number;
  speed: number;
  type: 'note' | 'exam' | 'coffee' | 'bug';
  symbol: string;
  points: number;
  label: string;
  color: string;
  radius: number;
}

export const EconMiniGame: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [gameState, setGameState] = useState<'idle' | 'playing' | 'gameover'>('idle');
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState<number>(() => {
    try {
      return Number(localStorage.getItem('econnotes_catch_highscore') || 0);
    } catch {
      return 0;
    }
  });
  const [lives, setLives] = useState(3);
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Audio synthesizer via Web Audio API
  const audioCtxRef = useRef<AudioContext | null>(null);

  const getAudioContext = useCallback(() => {
    if (!audioCtxRef.current && typeof window !== 'undefined') {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioContextClass) {
        audioCtxRef.current = new AudioContextClass();
      }
    }
    if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }
    return audioCtxRef.current;
  }, []);

  const playTone = useCallback((freq: number, type: OscillatorType, duration: number, delay = 0) => {
    if (!soundEnabled) return;
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime + delay);
      gain.gain.setValueAtTime(0.08, ctx.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + duration);
    } catch {
      // Audio autoplay policy fallback
    }
  }, [soundEnabled, getAudioContext]);

  const playCollect = useCallback(() => {
    playTone(523.25, 'sine', 0.1, 0); // C5
    playTone(659.25, 'sine', 0.15, 0.08); // E5
  }, [playTone]);

  const playBugHit = useCallback(() => {
    playTone(180, 'sawtooth', 0.25, 0);
  }, [playTone]);

  const playGameOver = useCallback(() => {
    playTone(392.0, 'sawtooth', 0.2, 0);
    playTone(329.63, 'sawtooth', 0.25, 0.15);
    playTone(261.63, 'sawtooth', 0.35, 0.3);
  }, [playTone]);

  // Game loop state refs
  const stateRef = useRef({
    playerX: 200,
    playerWidth: 64,
    playerHeight: 18,
    items: [] as FallingItem[],
    nextItemId: 1,
    lastSpawn: 0,
    score: 0,
    lives: 3,
    keys: { left: false, right: false },
    isRunning: false,
  });

  const startGame = () => {
    stateRef.current.score = 0;
    stateRef.current.lives = 3;
    stateRef.current.items = [];
    stateRef.current.isRunning = true;
    setScore(0);
    setLives(3);
    setGameState('playing');
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        stateRef.current.keys.left = true;
      }
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        stateRef.current.keys.right = true;
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        stateRef.current.keys.left = false;
      }
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        stateRef.current.keys.right = false;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Mouse & Touch handling over canvas
  const handlePointerMove = (clientX: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * canvas.width;
    stateRef.current.playerX = Math.max(
      stateRef.current.playerWidth / 2,
      Math.min(canvas.width - stateRef.current.playerWidth / 2, x)
    );
  };

  useEffect(() => {
    if (gameState !== 'playing') return;

    let animId: number;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Reset player position to middle
    stateRef.current.playerX = canvas.width / 2;

    const itemPool: Array<Omit<FallingItem, 'id' | 'x' | 'y' | 'speed'>> = [
      { type: 'note', symbol: '📄', points: 10, label: 'Not', color: '#38bdf8', radius: 14 },
      { type: 'note', symbol: '📘', points: 15, label: 'Kitap', color: '#60a5fa', radius: 14 },
      { type: 'exam', symbol: '🎓', points: 25, label: 'A+ Sınav', color: '#fbbf24', radius: 15 },
      { type: 'coffee', symbol: '☕', points: 15, label: 'Kahve', color: '#f97316', radius: 14 },
      { type: 'bug', symbol: '🐞', points: -1, label: 'Bug', color: '#ef4444', radius: 13 },
      { type: 'bug', symbol: '⚠️', points: -1, label: 'Hata', color: '#dc2626', radius: 13 },
    ];

    let lastTime = performance.now();

    const loop = (now: number) => {
      const dt = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;

      // Handle keyboard movement
      const moveSpeed = 380;
      if (stateRef.current.keys.left) {
        stateRef.current.playerX = Math.max(
          stateRef.current.playerWidth / 2,
          stateRef.current.playerX - moveSpeed * dt
        );
      }
      if (stateRef.current.keys.right) {
        stateRef.current.playerX = Math.min(
          canvas.width - stateRef.current.playerWidth / 2,
          stateRef.current.playerX + moveSpeed * dt
        );
      }

      // Spawn falling items
      if (now - stateRef.current.lastSpawn > 800) {
        stateRef.current.lastSpawn = now;
        const template = itemPool[Math.floor(Math.random() * itemPool.length)];
        const newItem: FallingItem = {
          ...template,
          id: stateRef.current.nextItemId++,
          x: 24 + Math.random() * (canvas.width - 48),
          y: -10,
          speed: 130 + Math.random() * 80 + Math.min(stateRef.current.score * 1.5, 120),
        };
        stateRef.current.items.push(newItem);
      }

      // Update falling items
      const playerY = canvas.height - 24;
      const playerLeft = stateRef.current.playerX - stateRef.current.playerWidth / 2;
      const playerRight = stateRef.current.playerX + stateRef.current.playerWidth / 2;

      const remaining: FallingItem[] = [];

      for (const item of stateRef.current.items) {
        item.y += item.speed * dt;

        // Collision check with player basket
        const hitX = item.x >= playerLeft - 8 && item.x <= playerRight + 8;
        const hitY = item.y >= playerY - 14 && item.y <= playerY + 14;

        if (hitX && hitY) {
          if (item.type === 'bug') {
            stateRef.current.lives -= 1;
            setLives(stateRef.current.lives);
            playBugHit();

            if (stateRef.current.lives <= 0) {
              stateRef.current.isRunning = false;
              playGameOver();
              setGameState('gameover');
              const finalScore = stateRef.current.score;
              setScore(finalScore);
              setHighScore((prev) => {
                const next = Math.max(prev, finalScore);
                try {
                  localStorage.setItem('econnotes_catch_highscore', String(next));
                } catch {
                  // ignore
                }
                return next;
              });
              return;
            }
          } else {
            stateRef.current.score += item.points;
            setScore(stateRef.current.score);
            playCollect();
          }
          continue; // Item collected
        }

        // Off screen check
        if (item.y > canvas.height + 20) {
          continue;
        }

        remaining.push(item);
      }

      stateRef.current.items = remaining;

      // Draw everything
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw subtle background grid
      ctx.fillStyle = '#071026';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
      ctx.lineWidth = 1;
      for (let x = 0; x < canvas.width; x += 32) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }
      for (let y = 0; y < canvas.height; y += 32) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }

      // Draw items
      for (const item of stateRef.current.items) {
        // Glow circle
        ctx.fillStyle = item.color + '22';
        ctx.beginPath();
        ctx.arc(item.x, item.y, item.radius + 4, 0, Math.PI * 2);
        ctx.fill();

        // Symbol emoji
        ctx.font = '18px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(item.symbol, item.x, item.y);
      }

      // Draw Player Paddle (EconNotes Study Basket)
      const px = stateRef.current.playerX;
      const pw = stateRef.current.playerWidth;
      const ph = stateRef.current.playerHeight;
      const py = canvas.height - 24;

      // Gradient paddle
      const grad = ctx.createLinearGradient(px - pw / 2, py, px + pw / 2, py);
      grad.addColorStop(0, '#0284c7');
      grad.addColorStop(0.5, '#38bdf8');
      grad.addColorStop(1, '#0284c7');

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.roundRect(px - pw / 2, py, pw, ph, 8);
      ctx.fill();

      // Glowing highlight line
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(px - pw / 2 + 2, py + 2, pw - 4, 2, 2);
      ctx.stroke();

      // Text label inside paddle
      ctx.fillStyle = '#041d3d';
      ctx.font = 'bold 9px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('ECON BASKET', px, py + ph / 2 + 1);

      if (stateRef.current.isRunning) {
        animId = requestAnimationFrame(loop);
      }
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [gameState, playCollect, playBugHit, playGameOver]);

  return (
    <div className="relative w-full rounded-2xl bg-[#030919] border border-blue-500/20 p-4 sm:p-6 shadow-2xl overflow-hidden">
      {/* Top Game Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-white/10">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400">
            <Gamepad2 className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-bold text-white tracking-wide">EconNotes Catcher</h4>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-500/25 font-mono font-semibold">
                Bekleme Odası Oyunu
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Bakım bitene kadar ders notlarını ve A+ sınavlarını yakala, hata böceklerinden kaç!
            </p>
          </div>
        </div>

        {/* Live Score & Sound Toggle */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-white/5 border border-white/10 text-xs">
            <Trophy className="h-3.5 w-3.5 text-amber-400" />
            <span className="text-slate-400">En Yüksek:</span>
            <span className="font-bold text-amber-300 font-mono">{highScore}</span>
          </div>

          <button
            type="button"
            onClick={() => setSoundEnabled((v) => !v)}
            aria-label={soundEnabled ? 'Sesi Kapat' : 'Sesi Aç'}
            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-colors border border-white/10"
          >
            {soundEnabled ? <Volume2 className="h-4 w-4 text-cyan-400" /> : <VolumeX className="h-4 w-4 text-slate-500" />}
          </button>
        </div>
      </div>

      {/* Main Canvas & Overlay Arena */}
      <div className="relative mt-4 w-full h-[260px] rounded-xl overflow-hidden border border-white/10 bg-[#071026] flex items-center justify-center">
        <canvas
          ref={canvasRef}
          width={540}
          height={260}
          className="w-full h-full cursor-pointer touch-none"
          onMouseMove={(e) => handlePointerMove(e.clientX)}
          onTouchMove={(e) => {
            if (e.touches[0]) handlePointerMove(e.touches[0].clientX);
          }}
        />

        {/* In-game HUD */}
        {gameState === 'playing' && (
          <div className="absolute top-3 left-4 right-4 flex items-center justify-between pointer-events-none select-none">
            <div className="px-3 py-1 rounded-md bg-black/60 backdrop-blur-md border border-white/10 font-mono text-xs font-bold text-cyan-300">
              Puan: {score}
            </div>
            <div className="flex items-center gap-1 px-3 py-1 rounded-md bg-black/60 backdrop-blur-md border border-white/10">
              {[...Array(3)].map((_, i) => (
                <Heart
                  key={i}
                  className={`h-3.5 w-3.5 ${
                    i < lives ? 'fill-red-500 text-red-500 animate-pulse' : 'text-slate-600'
                  }`}
                />
              ))}
            </div>
          </div>
        )}

        {/* Start Screen Overlay */}
        {gameState === 'idle' && (
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm flex flex-col items-center justify-center p-4 text-center select-none">
            <div className="h-12 w-12 rounded-2xl bg-gradient-to-tr from-blue-600 to-cyan-400 flex items-center justify-center text-white shadow-lg shadow-cyan-500/20 mb-3 animate-bounce">
              <Sparkles className="h-6 w-6" />
            </div>
            <h3 className="text-base sm:text-lg font-bold text-white">Sistem Bakımdayken Canın mı Sıkıldı?</h3>
            <p className="text-xs text-slate-300 max-w-sm mt-1">
              Sağ/sol ok tuşlarıyla veya dokunarak sepete notları doldur. Bakım sürerken rekorunu kır!
            </p>
            <Button
              onClick={startGame}
              size="sm"
              className="mt-4 bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-white font-semibold text-xs px-6 py-2 rounded-xl shadow-lg shadow-blue-500/25 gap-2"
            >
              <Gamepad2 className="h-4 w-4" />
              Oyunu Başlat
            </Button>
          </div>
        )}

        {/* Game Over Screen Overlay */}
        {gameState === 'gameover' && (
          <div className="absolute inset-0 bg-black/85 backdrop-blur-sm flex flex-col items-center justify-center p-4 text-center select-none animate-in fade-in zoom-in-95 duration-200">
            <div className="text-3xl mb-1">🎓</div>
            <h3 className="text-lg font-bold text-white">Oyun Bitti!</h3>
            <p className="text-xs text-slate-300 mt-0.5">
              Harika skor! Sınavlara ve yeni döneme bomba gibi hazırlanıyorsun.
            </p>

            <div className="flex items-center gap-4 my-3 px-4 py-2 rounded-xl bg-white/5 border border-white/10">
              <div>
                <div className="text-[10px] text-slate-400 uppercase font-semibold">Skor</div>
                <div className="text-lg font-bold font-mono text-cyan-400">{score}</div>
              </div>
              <div className="h-8 w-px bg-white/10" />
              <div>
                <div className="text-[10px] text-slate-400 uppercase font-semibold">En Yüksek</div>
                <div className="text-lg font-bold font-mono text-amber-400">{highScore}</div>
              </div>
            </div>

            <Button
              onClick={startGame}
              size="sm"
              className="bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-white font-semibold text-xs px-5 py-2 rounded-xl shadow-lg gap-1.5"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Tekrar Oyna
            </Button>
          </div>
        )}
      </div>

      {/* Touch & Controls Legend */}
      <div className="mt-3 flex flex-wrap items-center justify-between text-[11px] text-slate-400 gap-2">
        <div className="flex items-center gap-2">
          <span className="px-1.5 py-0.5 rounded bg-white/10 text-white font-mono text-[10px]">←</span>
          <span className="px-1.5 py-0.5 rounded bg-white/10 text-white font-mono text-[10px]">→</span>
          <span>veya dokunarak sepete yön ver</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1 text-sky-400">📄 Not (+10)</span>
          <span className="flex items-center gap-1 text-amber-400">🎓 A+ (+25)</span>
          <span className="flex items-center gap-1 text-rose-400">🐞 Hata (-1 Can)</span>
        </div>
      </div>
    </div>
  );
};

export default EconMiniGame;
