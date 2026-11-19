import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { ambientAudio, type AmbientSoundId } from '@/lib/ambientAudio';
import { playVictoryFanfare, recordFocusSessionComplete } from '@/lib/studyArenaState';

export interface FocusPreset {
  id: 'sprint' | 'pomodoro' | 'deep' | 'break';
  label: string;
  minutes: number;
  isBreak?: boolean;
  subtitle: string;
}

export const FOCUS_PRESETS: FocusPreset[] = [
  { id: 'sprint', label: 'Hızlı Sprint', minutes: 15, subtitle: 'Başlamak için en kolay mod' },
  { id: 'pomodoro', label: 'Pomodoro', minutes: 25, subtitle: 'Klasik yüksek odak seansı' },
  { id: 'deep', label: 'Sınav Maratonu', minutes: 50, subtitle: 'Derin çalışma bloğu' },
  { id: 'break', label: 'Kısa Mola', minutes: 5, isBreak: true, subtitle: 'Göz ve zihin dinlendirme' },
];

interface FocusTimerContextValue {
  preset: FocusPreset;
  secondsLeft: number;
  totalSeconds: number;
  isRunning: boolean;
  hasStarted: boolean;
  sessionGoal: string;
  ambientSound: AmbientSoundId;
  ambientVolume: number;
  selectPreset: (presetId: FocusPreset['id']) => void;
  start: () => void;
  pause: () => void;
  toggle: () => void;
  reset: () => void;
  setSessionGoal: (goal: string) => void;
  setAmbientSound: (sound: AmbientSoundId) => void;
  setAmbientVolume: (vol: number) => void;
}

const FocusTimerContext = createContext<FocusTimerContextValue | null>(null);

export const FocusTimerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [preset, setPreset] = useState<FocusPreset>(FOCUS_PRESETS[1]); // 25 dk Pomodoro default
  const [secondsLeft, setSecondsLeft] = useState(FOCUS_PRESETS[1].minutes * 60);
  const [isRunning, setIsRunning] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [sessionGoal, setSessionGoal] = useState('');
  const [ambientSound, setAmbientSoundState] = useState<AmbientSoundId>('off');
  const [ambientVolume, setAmbientVolumeState] = useState(0.42);

  const endTimestampRef = useRef<number | null>(null);
  const completedRef = useRef(false);

  const totalSeconds = preset.minutes * 60;

  const setAmbientSound = useCallback((sound: AmbientSoundId) => {
    setAmbientSoundState(sound);
    ambientAudio.setSound(sound);
  }, []);

  const setAmbientVolume = useCallback((vol: number) => {
    const clamped = Math.min(1, Math.max(0, vol));
    setAmbientVolumeState(clamped);
    ambientAudio.setVolume(clamped);
  }, []);

  const handleComplete = useCallback(async () => {
    if (completedRef.current) return;
    completedRef.current = true;
    setIsRunning(false);
    setHasStarted(false);
    endTimestampRef.current = null;
    playVictoryFanfare(true);

    if (preset.isBreak) {
      toast.success('Mola tamamlandı! Yeni odak turuna hazırsın.', { duration: 6000 });
    } else if (user) {
      const res = await recordFocusSessionComplete(user, preset.minutes);
      if (res.xpAwarded > 0) {
        toast.success(`Harika odaklandın! ${preset.minutes} dk tamamlandı (+${res.xpAwarded} XP)`, {
          description: sessionGoal
            ? `Hedef: ${sessionGoal}`
            : 'Günlük odak dakikan güncellendi ve puanın liderlik tablosuna işlendi.',
          duration: 7000,
        });
      } else {
        toast.success(`Tebrikler! ${preset.minutes} dakikalık odak seansını tamamladın!`, {
          description: sessionGoal || 'Kısa bir mola verip zihnini tazeleyebilirsin.',
          duration: 6000,
        });
      }
    } else {
      toast.success(`${preset.minutes} dakikalık odak seansı tamamlandı!`);
    }

    setSecondsLeft(preset.minutes * 60);
  }, [preset, sessionGoal, user]);

  const secondsLeftRef = useRef(secondsLeft);
  secondsLeftRef.current = secondsLeft;

  useEffect(() => {
    if (!isRunning) return;

    if (endTimestampRef.current === null) {
      endTimestampRef.current = Date.now() + secondsLeftRef.current * 1000;
    }

    const tick = () => {
      if (endTimestampRef.current === null) return;
      const remaining = Math.max(0, Math.ceil((endTimestampRef.current - Date.now()) / 1000));
      setSecondsLeft(remaining);
      if (remaining <= 0) {
        void handleComplete();
      }
    };

    const interval = window.setInterval(tick, 500);
    return () => window.clearInterval(interval);
  }, [isRunning, handleComplete]);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      ambientAudio.stop();
    };
  }, []);

  const selectPreset = useCallback((presetId: FocusPreset['id']) => {
    const found = FOCUS_PRESETS.find((p) => p.id === presetId) ?? FOCUS_PRESETS[1];
    setPreset(found);
    setIsRunning(false);
    setHasStarted(false);
    completedRef.current = false;
    endTimestampRef.current = null;
    setSecondsLeft(found.minutes * 60);
  }, []);

  const start = useCallback(() => {
    completedRef.current = false;
    setHasStarted(true);
    endTimestampRef.current = Date.now() + secondsLeft * 1000;
    setIsRunning(true);
  }, [secondsLeft]);

  const pause = useCallback(() => {
    if (endTimestampRef.current !== null) {
      const remaining = Math.max(0, Math.ceil((endTimestampRef.current - Date.now()) / 1000));
      setSecondsLeft(remaining);
    }
    endTimestampRef.current = null;
    setIsRunning(false);
  }, []);

  const toggle = useCallback(() => {
    if (isRunning) pause();
    else start();
  }, [isRunning, pause, start]);

  const reset = useCallback(() => {
    setIsRunning(false);
    setHasStarted(false);
    completedRef.current = false;
    endTimestampRef.current = null;
    setSecondsLeft(preset.minutes * 60);
  }, [preset.minutes]);

  return (
    <FocusTimerContext.Provider
      value={{
        preset,
        secondsLeft,
        totalSeconds,
        isRunning,
        hasStarted,
        sessionGoal,
        ambientSound,
        ambientVolume,
        selectPreset,
        start,
        pause,
        toggle,
        reset,
        setSessionGoal,
        setAmbientSound,
        setAmbientVolume,
      }}
    >
      {children}
    </FocusTimerContext.Provider>
  );
};

export const useFocusTimer = () => {
  const ctx = useContext(FocusTimerContext);
  if (!ctx) {
    throw new Error('useFocusTimer must be used inside FocusTimerProvider');
  }
  return ctx;
};
