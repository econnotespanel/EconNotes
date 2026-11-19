import { useLocation, useNavigate } from 'react-router-dom';
import { Pause, Play, Square, Timer, Volume2, VolumeX } from 'lucide-react';
import { useFocusTimer } from '@/contexts/FocusTimerContext';

const formatMMSS = (sec: number) => {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

/**
 * Sleek persistent mini focus pill visible while studying on /notes, /study, etc.
 * Allows students to keep their Pomodoro timer & ambient rain/cafe sound running while reading notes!
 */
const FloatingFocusPill = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const {
    isRunning,
    hasStarted,
    secondsLeft,
    totalSeconds,
    preset,
    sessionGoal,
    ambientSound,
    toggle,
    reset,
    setAmbientSound,
  } = useFocusTimer();

  // Only show when a session has started and user navigated away from /arena
  if (!hasStarted || location.pathname === '/arena') return null;

  const pct = Math.min(100, Math.max(0, Math.round(((totalSeconds - secondsLeft) / Math.max(totalSeconds, 1)) * 100)));

  return (
    <div
      role="status"
      aria-label="Aktif Odak Sayacı"
      className="fixed right-3 top-[5.25rem] md:top-auto md:bottom-5 md:right-6 z-[65] pointer-events-auto animate-in fade-in slide-in-from-top-2 md:slide-in-from-bottom-2 duration-200"
    >
      <div className="relative flex items-center gap-2 rounded-full border border-primary/40 bg-card/95 dark:bg-[#0b1528]/95 pl-3 pr-2 py-1.5 shadow-[0_12px_32px_rgba(0,18,56,0.3)] backdrop-blur-xl">
        <button
          type="button"
          onClick={() => navigate('/arena?tab=focus')}
          className="flex items-center gap-2 text-left focus:outline-none"
          title="Odak Stüdyosunu Aç"
        >
          <span className="relative flex h-7 w-7 items-center justify-center rounded-full bg-primary/15 text-primary">
            <Timer className={`h-3.5 w-3.5 ${isRunning ? 'animate-pulse' : ''}`} />
          </span>
          <div className="leading-tight">
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-xs font-extrabold text-foreground">
                {formatMMSS(secondsLeft)}
              </span>
              <span className="text-[10px] font-semibold text-primary">
                %{pct}
              </span>
            </div>
            <p className="max-w-[115px] truncate text-[10px] text-muted-foreground">
              {sessionGoal.trim() || preset.label}
            </p>
          </div>
        </button>

        <div className="flex items-center gap-1 border-l border-border/70 pl-1.5">
          <button
            type="button"
            onClick={toggle}
            aria-label={isRunning ? 'Duraklat' : 'Devam Et'}
            className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-transform active:scale-95"
          >
            {isRunning ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3 ml-0.5" />}
          </button>
          {ambientSound !== 'off' && (
            <button
              type="button"
              onClick={() => setAmbientSound('off')}
              aria-label="Odak sesini kapat"
              title="Odak sesini kapat"
              className="flex h-7 w-7 items-center justify-center rounded-full text-primary hover:bg-primary/15 transition-colors"
            >
              <Volume2 className="h-3.5 w-3.5" />
            </button>
          )}
          {ambientSound === 'off' && (
            <button
              type="button"
              onClick={() => setAmbientSound('rain')}
              aria-label="Yağmur sesini aç"
              title="Yağmur sesini aç"
              className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted/70 hover:text-foreground transition-colors"
            >
              <VolumeX className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              reset();
              setAmbientSound('off');
            }}
            aria-label="Sayacı sıfırla"
            title="Bitir ve sıfırla"
            className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-destructive/15 hover:text-destructive transition-colors"
          >
            <Square className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default FloatingFocusPill;
