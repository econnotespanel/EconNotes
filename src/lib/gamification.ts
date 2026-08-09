import { Flame, Trophy, Target, Sparkles, BookOpen, Crown, Rocket, Medal, type LucideIcon } from 'lucide-react';

export interface BadgeDef {
  key: string;
  label: string;
  description: string;
  icon: LucideIcon;
  tone: string;
  /** Current progress value. */
  value: number;
  /** Threshold to unlock. */
  goal: number;
  /** Human readable unlock condition shown in the profile. */
  requirement: string;
  /** Unit label used in the progress caption. */
  unit: string;
}

export interface GamificationStats {
  points: number;
  currentStreak: number;
  longestStreak: number;
  totalLogins: number;
  attempts: number;
  goalsCompleted: number;
  notes: number;
}

/** Builds the badge list with progress from raw user stats. */
export const buildBadges = (s: GamificationStats): BadgeDef[] => [
  { key: 'streak3', label: 'Isınma Turu', description: '3 gün üst üste giriş yap.', icon: Flame, tone: 'text-warning', value: s.longestStreak, goal: 3 , requirement: "Üst üste 3 gün panele giriş yaparsan açılır. Seri bir gün kaçırınca sıfırlanır.", unit: "gün" },
  { key: 'streak7', label: 'Haftalık Disiplin', description: '7 günlük giriş serisi yakala.', icon: Flame, tone: 'text-destructive', value: s.longestStreak, goal: 7 , requirement: "Üst üste 7 gün giriş yap. En uzun serin baz alınır.", unit: "gün" },
  { key: 'streak30', label: 'Çelik İrade', description: '30 günlük giriş serisi yakala.', icon: Crown, tone: 'text-primary', value: s.longestStreak, goal: 30 , requirement: "Üst üste 30 gün giriş yap. En uzun serin baz alınır.", unit: "gün" },
  { key: 'logins20', label: 'Sadık Üye', description: 'Toplam 20 gün giriş yap.', icon: Medal, tone: 'text-success', value: s.totalLogins, goal: 20 , requirement: "Toplam 20 farklı günde günlük giriş puanı al.", unit: "gün" },
  { key: 'attempt1', label: 'İlk Deneme', description: 'İlk KPSS denemeni tamamla.', icon: Target, tone: 'text-accent', value: s.attempts, goal: 1 , requirement: "KPSS Merkezi'nde ilk testi bitirip kaydet.", unit: "deneme" },
  { key: 'attempt10', label: 'Deneme Avcısı', description: '10 deneme tamamla.', icon: Rocket, tone: 'text-primary', value: s.attempts, goal: 10 , requirement: "KPSS Merkezi'nde toplam 10 test bitir.", unit: "deneme" },
  { key: 'attempt50', label: 'Maraton Koşucusu', description: '50 deneme tamamla.', icon: Trophy, tone: 'text-warning', value: s.attempts, goal: 50 , requirement: "KPSS Merkezi'nde toplam 50 test bitir.", unit: "deneme" },
  { key: 'goal1', label: 'Hedef Vuruşu', description: 'Bir haftalık hedefi tamamla.', icon: Target, tone: 'text-success', value: s.goalsCompleted, goal: 1 , requirement: "Haftalık hedefler bölümünde bir hedefi tamamla.", unit: "hedef" },
  { key: 'goal5', label: 'Planlı Çalışan', description: '5 haftalık hedefi tamamla.', icon: Sparkles, tone: 'text-primary', value: s.goalsCompleted, goal: 5 , requirement: "Haftalık hedefler bölümünde toplam 5 hedefi tamamla.", unit: "hedef" },
  { key: 'note1', label: 'Paylaşımcı', description: 'Platforma bir ders notu yükle.', icon: BookOpen, tone: 'text-accent', value: s.notes, goal: 1 , requirement: "Notlar sayfasından bir ders notu yükle.", unit: "not" },
  { key: 'note5', label: 'Arşiv Dostu', description: '5 ders notu yükle.', icon: BookOpen, tone: 'text-success', value: s.notes, goal: 5 , requirement: "Notlar sayfasından toplam 5 ders notu yükle.", unit: "not" },
  { key: 'points500', label: 'Puan Ustası', description: '500 puana ulaş.', icon: Sparkles, tone: 'text-warning', value: s.points, goal: 500 , requirement: "Giriş, görev, not ve testlerden toplam 500 puan biriktir.", unit: "puan" },
];

/** ISO-week key such as 2026-W32; missions rotate weekly with this value. */
export const weekKey = (d = new Date()) => {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
};

export const todayKey = (d = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(d);

export type MissionMetric = 'login' | 'attempt' | 'material' | 'note' | 'points';

export interface MissionDef {
  key: string;
  label: string;
  metric: MissionMetric;
  target: number;
  reward: number;
}

const MISSION_POOL: MissionDef[] = [
  { key: 'daily_login', label: 'Bugün panele giriş yap.', metric: 'login', target: 1, reward: 5 },
  { key: 'one_attempt', label: 'Bugün 1 KPSS denemesi bitir.', metric: 'attempt', target: 1, reward: 10 },
  { key: 'two_attempts', label: 'Bugün 2 deneme bitir.', metric: 'attempt', target: 2, reward: 15 },
  { key: 'one_material', label: 'Bugün 1 yeni çalışma materyali üret.', metric: 'material', target: 1, reward: 10 },
  { key: 'two_materials', label: 'Bugün 2 materyal üret (kart/özet/test).', metric: 'material', target: 2, reward: 15 },
  { key: 'one_note', label: 'Bugün 1 ders notu paylaş.', metric: 'note', target: 1, reward: 20 },
  { key: 'points_30', label: 'Bugün en az 30 puan topla.', metric: 'points', target: 30, reward: 10 },
  { key: 'points_60', label: 'Bugün en az 60 puan topla.', metric: 'points', target: 60, reward: 20 },
];

/** Deterministic weekly selection of 4 daily missions. */
export const missionsForWeek = (wk = weekKey()): MissionDef[] => {
  let seed = 0;
  for (let i = 0; i < wk.length; i++) seed = (seed * 31 + wk.charCodeAt(i)) % 100000;
  const pool = [...MISSION_POOL];
  const picked: MissionDef[] = [];
  // always keep the login mission so every user can complete at least one
  picked.push(pool.shift()!);
  while (picked.length < 4 && pool.length) {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    picked.push(pool.splice(seed % pool.length, 1)[0]);
  }
  return picked;
};

export const missionReason = (key: string, day = todayKey()) => `mission:${key}:${day}`;
