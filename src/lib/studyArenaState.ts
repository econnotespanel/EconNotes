import type { User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { awardPoints } from '@/hooks/usePoints';
import { todayKey } from '@/lib/gamification';
import { SEVEN_DAY_REWARDS } from '@/lib/studyArenaData';

export const ARENA_UPDATED_EVENT = 'econnotes:arena-updated';

export interface StudyTaskItem {
  id: string;
  text: string;
  done: boolean;
}

export interface StudyArenaState {
  // 7-day check-in streak cycle (1..7)
  checkInStreak: number;
  totalCheckIns: number;
  lastCheckInDate: string | null;

  // Daily 5-question blitz
  dailyBlitzDate: string | null;
  dailyBlitzScore: number;
  dailyBlitzTotal: number;
  dailyBlitzBestCombo: number;
  dailyBlitzAnswers: boolean[];
  totalBlitzCompleted: number;
  totalCorrectAnswers: number;

  // Concept Match game
  dailyMatchDate: string | null;
  bestMatchSeconds: number | null;
  totalMatchClears: number;

  // Deep Focus Pomodoro
  focusDate: string | null;
  focusMinutesToday: number;
  totalFocusMinutes: number;
  totalFocusSessions: number;
  dailyFocusRewardDate: string | null;

  // Mini study checklist
  studyTasks: StudyTaskItem[];

  // Audio feedback preference
  soundEnabled: boolean;
}

const DEFAULT_STATE: StudyArenaState = {
  checkInStreak: 0,
  totalCheckIns: 0,
  lastCheckInDate: null,
  dailyBlitzDate: null,
  dailyBlitzScore: 0,
  dailyBlitzTotal: 5,
  dailyBlitzBestCombo: 0,
  dailyBlitzAnswers: [],
  totalBlitzCompleted: 0,
  totalCorrectAnswers: 0,
  dailyMatchDate: null,
  bestMatchSeconds: null,
  totalMatchClears: 0,
  focusDate: null,
  focusMinutesToday: 0,
  totalFocusMinutes: 0,
  totalFocusSessions: 0,
  dailyFocusRewardDate: null,
  studyTasks: [],
  soundEnabled: true,
};

const STORAGE_PREFIX = 'econnotes_study_arena_v1_';

export const getYesterdayIstanbulKey = (now = new Date()): string => {
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  return todayKey(yesterday);
};

export const getTimeUntilMidnightIstanbul = (now = new Date()): string => {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Istanbul',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(now);
    const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
    const m = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
    const remainingMinutes = Math.max(1, 24 * 60 - (h * 60 + m));
    const remH = Math.floor(remainingMinutes / 60);
    const remM = remainingMinutes % 60;
    return `${remH} sa ${remM} dk`;
  } catch {
    return '';
  }
};

export const loadArenaState = (user: User | null | undefined): StudyArenaState => {
  const today = todayKey();
  if (!user) return { ...DEFAULT_STATE };

  let local: Partial<StudyArenaState> = {};
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${user.id}`);
    if (raw) local = JSON.parse(raw);
  } catch {
    local = {};
  }

  const meta = ((user.user_metadata as Record<string, unknown> | undefined)?.study_arena ??
    {}) as Partial<StudyArenaState>;

  // Merge remote metadata and local cache preferring freshest dates/higher totals
  const merged: StudyArenaState = {
    ...DEFAULT_STATE,
    ...meta,
    ...local,
    totalCheckIns: Math.max(Number(meta.totalCheckIns || 0), Number(local.totalCheckIns || 0)),
    totalBlitzCompleted: Math.max(
      Number(meta.totalBlitzCompleted || 0),
      Number(local.totalBlitzCompleted || 0),
    ),
    totalCorrectAnswers: Math.max(
      Number(meta.totalCorrectAnswers || 0),
      Number(local.totalCorrectAnswers || 0),
    ),
    totalMatchClears: Math.max(
      Number(meta.totalMatchClears || 0),
      Number(local.totalMatchClears || 0),
    ),
    totalFocusMinutes: Math.max(
      Number(meta.totalFocusMinutes || 0),
      Number(local.totalFocusMinutes || 0),
    ),
    totalFocusSessions: Math.max(
      Number(meta.totalFocusSessions || 0),
      Number(local.totalFocusSessions || 0),
    ),
  };

  // Preserve freshest daily completions across devices
  if (meta.lastCheckInDate === today && local.lastCheckInDate !== today) {
    merged.lastCheckInDate = today;
    merged.checkInStreak = Math.max(merged.checkInStreak, Number(meta.checkInStreak || 1));
  }
  if (meta.dailyBlitzDate === today && local.dailyBlitzDate !== today) {
    merged.dailyBlitzDate = today;
    merged.dailyBlitzScore = Number(meta.dailyBlitzScore || 0);
    merged.dailyBlitzTotal = Number(meta.dailyBlitzTotal || 5);
    merged.dailyBlitzBestCombo = Number(meta.dailyBlitzBestCombo || 0);
  }
  if (meta.dailyMatchDate === today && local.dailyMatchDate !== today) {
    merged.dailyMatchDate = today;
  }

  // Pick fastest personal best match seconds
  const candidates = [meta.bestMatchSeconds, local.bestMatchSeconds].filter(
    (v): v is number => typeof v === 'number' && v > 0,
  );
  merged.bestMatchSeconds = candidates.length > 0 ? Math.min(...candidates) : null;

  // Reset daily focus minutes counter if day changed
  if (merged.focusDate !== today) {
    merged.focusDate = today;
    merged.focusMinutesToday = 0;
  }

  // Ensure studyTasks is always an array
  if (!Array.isArray(merged.studyTasks)) {
    merged.studyTasks = [];
  }
  if (!Array.isArray(merged.dailyBlitzAnswers)) {
    merged.dailyBlitzAnswers = [];
  }

  return merged;
};

export const saveArenaState = (
  user: User | null | undefined,
  state: StudyArenaState,
  syncRemote = true,
) => {
  if (!user) return;
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${user.id}`, JSON.stringify(state));
  } catch {
    // ignore storage quota errors
  }

  window.dispatchEvent(new CustomEvent(ARENA_UPDATED_EVENT));

  if (syncRemote) {
    // Store compact subset in auth user_metadata for seamless phone <-> PC sync
    const compact = {
      checkInStreak: state.checkInStreak,
      totalCheckIns: state.totalCheckIns,
      lastCheckInDate: state.lastCheckInDate,
      dailyBlitzDate: state.dailyBlitzDate,
      dailyBlitzScore: state.dailyBlitzScore,
      dailyBlitzTotal: state.dailyBlitzTotal,
      dailyBlitzBestCombo: state.dailyBlitzBestCombo,
      totalBlitzCompleted: state.totalBlitzCompleted,
      totalCorrectAnswers: state.totalCorrectAnswers,
      dailyMatchDate: state.dailyMatchDate,
      bestMatchSeconds: state.bestMatchSeconds,
      totalMatchClears: state.totalMatchClears,
      focusDate: state.focusDate,
      focusMinutesToday: state.focusMinutesToday,
      totalFocusMinutes: state.totalFocusMinutes,
      totalFocusSessions: state.totalFocusSessions,
      dailyFocusRewardDate: state.dailyFocusRewardDate,
    };
    void supabase.auth.updateUser({ data: { study_arena: compact } }).catch(() => {});
  }
};

/** Computes which day (1..7) the user is on for their 7-day check-in chest. */
export const getCheckInCycleInfo = (state: StudyArenaState) => {
  const today = todayKey();
  const yesterday = getYesterdayIstanbulKey();
  const claimedToday = state.lastCheckInDate === today;

  let activeStreak = state.checkInStreak;
  if (!claimedToday && state.lastCheckInDate !== yesterday) {
    activeStreak = 0;
  }

  // Day index to display/claim (1..7)
  const completedInCycle = claimedToday
    ? ((Math.max(1, activeStreak) - 1) % 7) + 1
    : activeStreak % 7;

  const nextDayToClaim = claimedToday ? completedInCycle : completedInCycle + 1;
  const rewardDef = SEVEN_DAY_REWARDS[Math.min(6, Math.max(0, nextDayToClaim - 1))];

  return {
    claimedToday,
    activeStreak,
    completedInCycle,
    nextDayToClaim,
    rewardDef,
    hasStreakShield: activeStreak >= 3,
  };
};

export const claimDailyCheckIn = async (
  user: User,
): Promise<{ ok: boolean; xp: number; dayInCycle: number; newStreak: number; totalPoints: number | null }> => {
  const today = todayKey();
  const state = loadArenaState(user);
  const info = getCheckInCycleInfo(state);

  if (info.claimedToday) {
    return {
      ok: false,
      xp: 0,
      dayInCycle: info.completedInCycle,
      newStreak: info.activeStreak,
      totalPoints: null,
    };
  }

  const newStreak = info.activeStreak + 1;
  const dayInCycle = ((newStreak - 1) % 7) + 1;
  const reward = SEVEN_DAY_REWARDS[dayInCycle - 1]?.xp ?? 10;

  // Uses mission_ prefix (allowed by award_points RPC, 1..50 XP, 1x per day)
  const totalPoints = await awardPoints(`mission_checkin_${today}`, reward);

  const nextState: StudyArenaState = {
    ...state,
    checkInStreak: newStreak,
    totalCheckIns: state.totalCheckIns + 1,
    lastCheckInDate: today,
  };

  saveArenaState(user, nextState, true);
  window.dispatchEvent(new CustomEvent('econnotes:points-updated'));

  return {
    ok: true,
    xp: reward,
    dayInCycle,
    newStreak,
    totalPoints,
  };
};

export const recordDailyBlitzResult = async (
  user: User,
  score: number,
  total: number,
  bestCombo: number,
  answers: boolean[],
): Promise<{ xpAwarded: number; alreadyClaimedToday: boolean; totalPoints: number | null }> => {
  const today = todayKey();
  const state = loadArenaState(user);
  const alreadyClaimedToday = state.dailyBlitzDate === today;

  // Scale reward between 15 and 40 XP (guaranteed within server 1..50 cap)
  const xpAmount = Math.min(45, Math.max(15, 10 + score * 6 + (score === total ? 5 : 0)));
  let totalPoints: number | null = null;
  let xpAwarded = 0;

  if (!alreadyClaimedToday) {
    totalPoints = await awardPoints(`mission_blitz_${today}`, xpAmount);
    xpAwarded = xpAmount;
  }

  const nextState: StudyArenaState = {
    ...state,
    dailyBlitzDate: today,
    dailyBlitzScore: alreadyClaimedToday ? Math.max(state.dailyBlitzScore, score) : score,
    dailyBlitzTotal: total,
    dailyBlitzBestCombo: alreadyClaimedToday
      ? Math.max(state.dailyBlitzBestCombo, bestCombo)
      : bestCombo,
    dailyBlitzAnswers: alreadyClaimedToday ? state.dailyBlitzAnswers : answers,
    totalBlitzCompleted: alreadyClaimedToday ? state.totalBlitzCompleted : state.totalBlitzCompleted + 1,
    totalCorrectAnswers: state.totalCorrectAnswers + score,
  };

  saveArenaState(user, nextState, true);
  if (xpAwarded > 0) {
    window.dispatchEvent(new CustomEvent('econnotes:points-updated'));
  }

  return { xpAwarded, alreadyClaimedToday, totalPoints };
};

export const recordMatchClear = async (
  user: User,
  elapsedSeconds: number,
): Promise<{ xpAwarded: number; isNewBest: boolean; totalPoints: number | null }> => {
  const today = todayKey();
  const state = loadArenaState(user);
  const rounded = Math.max(1, Math.round(elapsedSeconds * 10) / 10);
  const isNewBest = state.bestMatchSeconds === null || rounded < state.bestMatchSeconds;
  const alreadyClaimedToday = state.dailyMatchDate === today;

  let xpAwarded = 0;
  let totalPoints: number | null = null;
  if (!alreadyClaimedToday) {
    const reward = 25;
    totalPoints = await awardPoints(`mission_match_${today}`, reward);
    xpAwarded = reward;
  }

  const nextState: StudyArenaState = {
    ...state,
    dailyMatchDate: today,
    bestMatchSeconds: isNewBest ? rounded : state.bestMatchSeconds,
    totalMatchClears: state.totalMatchClears + 1,
  };

  saveArenaState(user, nextState, true);
  if (xpAwarded > 0) {
    window.dispatchEvent(new CustomEvent('econnotes:points-updated'));
  }

  return { xpAwarded, isNewBest, totalPoints };
};

export const recordFocusSessionComplete = async (
  user: User,
  minutes: number,
): Promise<{ xpAwarded: number; totalPoints: number | null }> => {
  const today = todayKey();
  const state = loadArenaState(user);
  const prevToday = state.focusDate === today ? state.focusMinutesToday : 0;
  const rewardKey = `mission_focus_${today}`;
  const alreadyClaimedToday = state.dailyFocusRewardDate === today;

  let xpAwarded = 0;
  let totalPoints: number | null = null;
  if (!alreadyClaimedToday && minutes >= 5) {
    const reward = minutes >= 45 ? 35 : minutes >= 20 ? 30 : 20;
    totalPoints = await awardPoints(rewardKey, reward);
    xpAwarded = reward;
  }

  const nextState: StudyArenaState = {
    ...state,
    focusDate: today,
    focusMinutesToday: prevToday + minutes,
    totalFocusMinutes: state.totalFocusMinutes + minutes,
    totalFocusSessions: state.totalFocusSessions + 1,
    dailyFocusRewardDate: xpAwarded > 0 ? today : state.dailyFocusRewardDate,
  };

  saveArenaState(user, nextState, true);
  if (xpAwarded > 0) {
    window.dispatchEvent(new CustomEvent('econnotes:points-updated'));
  }

  return { xpAwarded, totalPoints };
};

// ─── Crisp Procedural Web Audio Game Feedback (Zero network assets, instant tactile delight) ───

let fxCtx: AudioContext | null = null;

const getFxContext = (): AudioContext | null => {
  if (typeof window === 'undefined') return null;
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    if (!fxCtx || fxCtx.state === 'closed') {
      fxCtx = new Ctx();
    }
    if (fxCtx.state === 'suspended') {
      void fxCtx.resume().catch(() => {});
    }
    return fxCtx;
  } catch {
    return null;
  }
};

const playNote = (
  ctx: AudioContext,
  freq: number,
  startOffset: number,
  duration: number,
  volume = 0.12,
  type: OscillatorType = 'sine',
) => {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const t = ctx.currentTime + startOffset;
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.linearRampToValueAtTime(volume, t + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(t);
  osc.stop(t + duration + 0.02);
};

export const playComboTone = (combo = 1, enabled = true) => {
  if (!enabled) return;
  const ctx = getFxContext();
  if (!ctx) return;
  const baseFreq = 523.25 * Math.pow(1.06, Math.min(combo - 1, 8)); // Rising C5 -> A5
  playNote(ctx, baseFreq, 0, 0.14, 0.11, 'triangle');
  playNote(ctx, baseFreq * 1.25, 0.07, 0.2, 0.12, 'sine');
};

export const playWrongTone = (enabled = true) => {
  if (!enabled) return;
  const ctx = getFxContext();
  if (!ctx) return;
  playNote(ctx, 220, 0, 0.16, 0.09, 'sawtooth');
  playNote(ctx, 185, 0.09, 0.22, 0.08, 'triangle');
};

export const playVictoryFanfare = (enabled = true) => {
  if (!enabled) return;
  const ctx = getFxContext();
  if (!ctx) return;
  // Bright major arpeggio: C5 -> E5 -> G5 -> C6
  playNote(ctx, 523.25, 0.0, 0.18, 0.11, 'triangle');
  playNote(ctx, 659.25, 0.09, 0.18, 0.11, 'triangle');
  playNote(ctx, 783.99, 0.18, 0.22, 0.12, 'triangle');
  playNote(ctx, 1046.5, 0.28, 0.42, 0.14, 'sine');
};
