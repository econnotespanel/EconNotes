import type { StudioNotebook, StudyMaterial, StudyProgressRow } from '@/types/study';

export interface AcademicWeekInput {
  week: number | null;
  label: string | null;
  semester: string | null;
}

export interface AcademicCalendarDisplay {
  semester: string;
  weekLabel: string;
  yearLabel: string;
}

export interface NoteFileBadge {
  label: 'PDF' | 'PPT' | 'DOC' | 'IMG' | 'NOT';
  tone: 'blue' | 'orange' | 'indigo' | 'teal' | 'slate';
}

export interface PointEventInput {
  amount: number;
  reason: string;
  created_at: string;
}

export interface SimpleTimestampRow {
  created_at: string;
  note_id?: string;
}

export interface WeeklyStudyDay {
  dateKey: string;
  shortLabel: string;
  fullLabel: string;
  minutes: number;
  isToday: boolean;
  isPeak: boolean;
}

export interface WeeklyStudySeries {
  days: WeeklyStudyDay[];
  totalMinutes: number;
  peakMinutes: number;
  peakIndex: number;
}

export interface ContinueStudyingItem {
  title: string;
  subtitle: string;
  progressPct: number;
  targetPath: string;
  ctaLabel: string;
  hasRealHistory: boolean;
}

const TURKISH_WEEKDAYS_SHORT = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'] as const;
const TURKISH_WEEKDAYS_FULL = [
  'Pazartesi',
  'Salı',
  'Çarşamba',
  'Perşembe',
  'Cuma',
  'Cumartesi',
  'Pazar',
] as const;

const ISTANBUL_OFFSET_MS = 3 * 60 * 60 * 1000;

/** Returns YYYY-MM-DD in Europe/Istanbul (permanent UTC+03:00). */
export function toIstanbulDateKey(input: Date | string): string {
  const date = typeof input === 'string' ? new Date(input) : input;
  if (Number.isNaN(date.getTime())) return '';
  const shifted = new Date(date.getTime() + ISTANBUL_OFFSET_MS);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const d = String(shifted.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Computes a sensible academic week fallback (1..14) when DB setting is unset. */
function estimateAcademicWeek(now: Date): number {
  const shifted = new Date(now.getTime() + ISTANBUL_OFFSET_MS);
  const year = shifted.getUTCFullYear();
  const month = shifted.getUTCMonth(); // 0-indexed
  // Fall starts ~late September (Sept 28), Spring starts ~mid February (Feb 16)
  const termStart =
    month >= 8
      ? Date.UTC(year, 8, 28)
      : month >= 1 && month <= 5
        ? Date.UTC(year, 1, 16)
        : Date.UTC(year - 1, 8, 28);
  const elapsedWeeks = Math.floor((shifted.getTime() - termStart) / (7 * 24 * 60 * 60 * 1000)) + 1;
  return Math.max(1, Math.min(14, elapsedWeeks));
}

/**
 * Formats the compact horizontal Academic Calendar banner card dynamically from
 * `public_system_status` (`academic_week`, `academic_semester`, `academic_week_label`)
 * with accurate fallbacks for the active academic year.
 */
export function resolveAcademicCalendarDisplay(
  input: AcademicWeekInput,
  now = new Date(),
): AcademicCalendarDisplay {
  const shifted = new Date(now.getTime() + ISTANBUL_OFFSET_MS);
  const year = shifted.getUTCFullYear();
  const month = shifted.getUTCMonth(); // 0 = Jan, 8 = Sep

  const rawSemester = (input.semester || '').trim();
  const semester = rawSemester
    ? rawSemester.replace(/\s*Dönemi$/i, '')
    : month >= 1 && month <= 5
      ? 'Bahar'
      : 'Güz';

  const weekNum =
    typeof input.week === 'number' && Number.isFinite(input.week) && input.week > 0
      ? Math.round(input.week)
      : estimateAcademicWeek(now);
  const weekLabel = `${weekNum}. Hafta`;

  const academicStartYear = month >= 8 ? year : year - 1;
  const computedYearRange = `${academicStartYear}-${academicStartYear + 1}`;
  const rawLabel = (input.label || '').trim();

  let yearLabel: string;
  if (rawLabel && /akademik\s+takvim/i.test(rawLabel)) {
    yearLabel = rawLabel;
  } else if (rawLabel && /\d{4}\s*[-–/]\s*\d{4}/.test(rawLabel)) {
    const normalizedRange = rawLabel.match(/\d{4}\s*[-–/]\s*\d{4}/)?.[0].replace(/\s*[-–/]\s*/, '-') || computedYearRange;
    yearLabel = `${normalizedRange} Eğitim-Öğretim Yılı Akademik Takvim`;
  } else {
    yearLabel = `${computedYearRange} Eğitim-Öğretim Yılı Akademik Takvim`;
  }

  return { semester, weekLabel, yearLabel };
}

/** Detects clean file-type badge styling for recent notes. */
export function detectNoteFileBadge(
  fileType?: string | null,
  fileName?: string | null,
): NoteFileBadge {
  const mime = (fileType || '').toLowerCase();
  const ext = (fileName || '').split('.').pop()?.toLowerCase() || '';

  if (mime.includes('pdf') || ext === 'pdf') {
    return { label: 'PDF', tone: 'blue' };
  }
  if (mime.includes('presentation') || mime.includes('powerpoint') || ext === 'pptx' || ext === 'ppt') {
    return { label: 'PPT', tone: 'orange' };
  }
  if (mime.includes('word') || mime.includes('document') || ext === 'docx' || ext === 'doc') {
    return { label: 'DOC', tone: 'indigo' };
  }
  if (mime.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)) {
    return { label: 'IMG', tone: 'teal' };
  }
  return { label: 'NOT', tone: 'slate' };
}

/** Formats an ISO timestamp as a clean Turkish date, e.g. "23 Kasım 2026". */
export function formatTurkishShortDate(dateStr?: string | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function estimateEventMinutes(reason: string): number {
  const r = reason.toLowerCase();
  if (r.startsWith('mission_focus')) return 25;
  if (r.startsWith('daily_trivia') || r.startsWith('mission_trivia')) return 15;
  if (r === 'kpss_attempt') return 30;
  if (r === 'study_material') return 20;
  if (r === 'note_uploaded') return 15;
  if (r.startsWith('mission_blitz') || r.startsWith('mission_match')) return 10;
  if (r === 'daily_login') return 5;
  if (r.startsWith('mission_checkin') || r.startsWith('mission:')) return 8;
  return 6;
}

/**
 * Computes a Mon..Sun weekly study duration series (minutes per day) strictly from
 * real user activity tables (`point_events`, `study_progress`, `study_materials`,
 * `note_views`) plus live focus timer minutes for today.
 */
export function computeWeeklyStudySeries(params: {
  pointEvents: PointEventInput[];
  studyProgress: Pick<StudyProgressRow, 'completed_at' | 'total_questions'>[];
  studyMaterials: Pick<StudyMaterial, 'created_at'>[];
  noteViews: SimpleTimestampRow[];
  focusMinutesToday: number;
  weekOffset?: 0 | -1;
  now?: Date;
}): WeeklyStudySeries {
  const now = params.now ?? new Date();
  const weekOffset = params.weekOffset ?? 0;
  const todayStr = toIstanbulDateKey(now);

  // Anchor Monday 00:00 in Europe/Istanbul
  const shiftedNow = new Date(now.getTime() + ISTANBUL_OFFSET_MS);
  const utcDay = shiftedNow.getUTCDay(); // 0=Sun, 1=Mon..6=Sat
  const daysSinceMonday = (utcDay + 6) % 7;
  const mondayUtcMs =
    Date.UTC(shiftedNow.getUTCFullYear(), shiftedNow.getUTCMonth(), shiftedNow.getUTCDate()) -
    (daysSinceMonday - weekOffset * 7) * 24 * 60 * 60 * 1000;

  const dayKeys: string[] = [];
  const minutesByDay = new Map<string, number>();
  const eventMaterialDayCount = new Map<string, number>();
  const viewMinutesByDay = new Map<string, number>();

  for (let i = 0; i < 7; i++) {
    const d = new Date(mondayUtcMs + i * 24 * 60 * 60 * 1000);
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(
      d.getUTCDate(),
    ).padStart(2, '0')}`;
    dayKeys.push(key);
    minutesByDay.set(key, 0);
  }

  for (const ev of params.pointEvents) {
    const key = toIstanbulDateKey(ev.created_at);
    if (!minutesByDay.has(key)) continue;
    minutesByDay.set(key, (minutesByDay.get(key) || 0) + estimateEventMinutes(ev.reason));
    if (ev.reason === 'study_material') {
      eventMaterialDayCount.set(key, (eventMaterialDayCount.get(key) || 0) + 1);
    }
  }

  for (const prog of params.studyProgress) {
    if (!prog.completed_at) continue;
    const key = toIstanbulDateKey(prog.completed_at);
    if (!minutesByDay.has(key)) continue;
    const qCount = typeof prog.total_questions === 'number' && prog.total_questions > 0 ? prog.total_questions : 8;
    const mins = Math.min(45, Math.max(10, qCount * 2));
    minutesByDay.set(key, (minutesByDay.get(key) || 0) + mins);
  }

  // Only credit study_materials not already reflected in point_events on that day
  const materialCountByDay = new Map<string, number>();
  for (const mat of params.studyMaterials) {
    const key = toIstanbulDateKey(mat.created_at);
    if (!minutesByDay.has(key)) continue;
    materialCountByDay.set(key, (materialCountByDay.get(key) || 0) + 1);
  }
  materialCountByDay.forEach((count, key) => {
    const extra = Math.max(0, count - (eventMaterialDayCount.get(key) || 0));
    if (extra > 0) {
      minutesByDay.set(key, (minutesByDay.get(key) || 0) + extra * 15);
    }
  });

  for (const view of params.noteViews) {
    const key = toIstanbulDateKey(view.created_at);
    if (!minutesByDay.has(key)) continue;
    const cur = viewMinutesByDay.get(key) || 0;
    if (cur < 45) {
      viewMinutesByDay.set(key, cur + 5);
    }
  }
  viewMinutesByDay.forEach((mins, key) => {
    minutesByDay.set(key, (minutesByDay.get(key) || 0) + mins);
  });

  if (weekOffset === 0 && minutesByDay.has(todayStr) && params.focusMinutesToday > 0) {
    const existing = minutesByDay.get(todayStr) || 0;
    minutesByDay.set(todayStr, Math.max(existing, Math.round(params.focusMinutesToday)));
  }

  let peakMinutes = 0;
  let peakIndex = -1;
  let totalMinutes = 0;

  const rawDays = dayKeys.map((dateKey, idx) => {
    const minutes = Math.min(360, Math.round(minutesByDay.get(dateKey) || 0));
    totalMinutes += minutes;
    if (minutes > peakMinutes) {
      peakMinutes = minutes;
      peakIndex = idx;
    }
    return {
      dateKey,
      shortLabel: TURKISH_WEEKDAYS_SHORT[idx],
      fullLabel: TURKISH_WEEKDAYS_FULL[idx],
      minutes,
      isToday: dateKey === todayStr,
      isPeak: false,
    };
  });

  if (peakIndex >= 0 && peakMinutes > 0) {
    rawDays[peakIndex].isPeak = true;
  }

  return {
    days: rawDays,
    totalMinutes,
    peakMinutes,
    peakIndex,
  };
}

/**
 * Resolves the "Kaldığın yerden devam et" card from the user's real study history:
 * 1. Most recent `study_progress` entry paired with its `study_materials` item
 * 2. Most recent `study_materials` item
 * 3. Most recently updated Study Studio notebook with sources
 * 4. Most recently viewed platform note
 * 5. Graceful fallback to latest accessible note / Study Studio onboarding
 */
export function resolveContinueStudyingItem(params: {
  progress: StudyProgressRow[];
  materials: StudyMaterial[];
  notebooks: StudioNotebook[];
  recentNotes: Array<{ id: string; title: string; course?: string | null; semester?: string | null }>;
  lastViewedNoteId?: string | null;
}): ContinueStudyingItem {
  const materialById = new Map(params.materials.map((m) => [m.id, m]));

  // 1. Latest study_progress with matching study_material
  for (const row of params.progress) {
    const mat = materialById.get(row.material_id);
    if (mat) {
      const total = typeof row.total_questions === 'number' && row.total_questions > 0 ? row.total_questions : 0;
      const score = typeof row.score === 'number' && row.score >= 0 ? row.score : 0;
      const pct = total > 0 ? Math.min(100, Math.max(12, Math.round((score / total) * 100))) : 60;
      const courseLabel = mat.course?.trim() || 'Çalışma Stüdyosu';
      return {
        title: mat.title || courseLabel,
        subtitle: `${courseLabel} • Son Çalışman`,
        progressPct: pct,
        targetPath: '/study',
        ctaLabel: 'Çalışmaya Devam Et',
        hasRealHistory: true,
      };
    }
  }

  // 2. Latest saved StudyMaterial
  if (params.materials.length > 0) {
    const mat = params.materials[0];
    const typeLabel =
      mat.material_type === 'summary'
        ? 'Ders Özeti'
        : mat.material_type === 'quiz'
          ? 'Test'
          : mat.material_type === 'flashcards'
            ? 'Bilgi Kartları'
            : 'Video Dersi';
    const courseLabel = mat.course?.trim() || typeLabel;
    const progressPct = mat.material_type === 'summary' ? 65 : mat.material_type === 'flashcards' ? 50 : 40;
    return {
      title: mat.title || courseLabel,
      subtitle: `${courseLabel} • ${typeLabel}`,
      progressPct,
      targetPath: '/study',
      ctaLabel: 'Çalışmaya Devam Et',
      hasRealHistory: true,
    };
  }

  // 3. Most recently updated local Study Studio notebook with sources
  const activeNotebooks = [...params.notebooks]
    .filter((nb) => nb.sources.length > 0 || nb.materialIds.length > 0 || nb.messages.length > 0)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  if (activeNotebooks.length > 0) {
    const nb = activeNotebooks[0];
    const totalSources = Math.max(1, nb.sources.length);
    const checkedCount = nb.checkedSourceIds.length;
    const pct = Math.min(95, Math.max(25, Math.round((checkedCount / totalSources) * 75)));
    return {
      title: nb.title || nb.course || 'Çalışma Defteri',
      subtitle: `${nb.course || 'Çalışma Stüdyosu'} • Son Çalışman`,
      progressPct: pct,
      targetPath: '/study',
      ctaLabel: 'Çalışmaya Devam Et',
      hasRealHistory: true,
    };
  }

  // 4. Most recently viewed note
  if (params.lastViewedNoteId) {
    const viewed = params.recentNotes.find((n) => n.id === params.lastViewedNoteId);
    if (viewed) {
      return {
        title: viewed.title,
        subtitle: `${viewed.course || viewed.semester || 'Ders Notu'} • Son İncelenen`,
        progressPct: 35,
        targetPath: `/notes?q=${encodeURIComponent(viewed.title)}`,
        ctaLabel: 'Çalışmaya Devam Et',
        hasRealHistory: true,
      };
    }
  }

  // 5. Fallback to latest accessible note or Studio invite
  if (params.recentNotes.length > 0) {
    const latest = params.recentNotes[0];
    return {
      title: latest.title,
      subtitle: `${latest.course || latest.semester || 'Önerilen Ders Notu'} • Yeni Kaynak`,
      progressPct: 0,
      targetPath: '/study',
      ctaLabel: 'Çalışmaya Devam Et',
      hasRealHistory: false,
    };
  }

  return {
    title: 'Çalışma Stüdyosu',
    subtitle: 'Ders notunu yükleyip özet ve test oluştur',
    progressPct: 0,
    targetPath: '/study',
    ctaLabel: 'Çalışmaya Devam Et',
    hasRealHistory: false,
  };
}
