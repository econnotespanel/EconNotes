/**
 * SM-2 Spaced Repetition, Weak-Topic Heatmap, and Exam Countdown Planner
 * for EconNotes Neural Studio. Persists locally in browser storage without
 * requiring extra database migrations.
 */

import type { StudyMaterial, StudyProgressRow } from '@/types/study';

export type ReviewQuality = 0 | 1 | 2 | 3 | 4 | 5; // 1: Zor, 3: Orta, 4: İyi, 5: Çok Kolay

export interface SrsCardState {
  id: string;
  materialId: string;
  materialTitle: string;
  course: string | null;
  front: string;
  back: string;
  hint?: string;
  topic?: string;
  repetitions: number;
  intervalDays: number;
  easeFactor: number;
  lastReviewedAt: number | null;
  nextReviewAt: number;
  lapses: number;
}

export interface TopicMasteryMetric {
  topic: string;
  course: string | null;
  attempts: number;
  avgScorePct: number;
  dueCards: number;
  status: 'critical' | 'review' | 'mastered';
  recommendedAction: string;
  relatedMaterialId?: string;
}

export interface StudyPlanTask {
  id: string;
  title: string;
  course: string | null;
  kind: 'srs_review' | 'weak_topic_drill' | 'exam_sim' | 'deep_summary' | 'video_recap';
  durationMinutes: number;
  materialId?: string;
  completed?: boolean;
}

export interface StudyPlanDay {
  dateIso: string;
  dayLabel: string;
  isToday: boolean;
  totalMinutes: number;
  tasks: StudyPlanTask[];
}

export interface PlannerConfig {
  examDateIso: string;
  dailyMinutes: number;
  targetGoalLabel: string;
  completedTaskIds: string[];
}

const SRS_STORAGE_KEY = 'econnotes:neural:srs_v1';
const PLAN_STORAGE_KEY = 'econnotes:neural:plan_cfg_v1';
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Pure SuperMemo-2 (SM-2) interval calculation.
 */
export function computeSm2Review(
  card: SrsCardState,
  quality: ReviewQuality,
  nowMs = Date.now(),
): SrsCardState {
  let repetitions = card.repetitions;
  let intervalDays = card.intervalDays;
  let lapses = card.lapses;

  const q = Math.max(0, Math.min(5, quality));
  const nextEase = Math.max(
    1.3,
    Number((card.easeFactor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))).toFixed(2)),
  );

  if (q < 3) {
    repetitions = 0;
    intervalDays = 1;
    lapses += 1;
  } else {
    if (repetitions === 0) intervalDays = 1;
    else if (repetitions === 1) intervalDays = 6;
    else intervalDays = Math.max(1, Math.round(intervalDays * nextEase));
    repetitions += 1;
  }

  return {
    ...card,
    repetitions,
    intervalDays,
    easeFactor: nextEase,
    lapses,
    lastReviewedAt: nowMs,
    nextReviewAt: nowMs + intervalDays * DAY_MS,
  };
}

export function loadSrsStore(): Record<string, SrsCardState> {
  try {
    const raw = localStorage.getItem(SRS_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, SrsCardState>) : {};
  } catch {
    return {};
  }
}

export function saveSrsStore(store: Record<string, SrsCardState>): void {
  try {
    localStorage.setItem(SRS_STORAGE_KEY, JSON.stringify(store));
  } catch {
    // ignore storage quota errors
  }
}

/**
 * Synchronizes flashcard & summary key-term decks from user's StudyMaterial list
 * into the local SM-2 store so newly created decks immediately schedule reviews.
 */
export function syncSrsCardsFromMaterials(
  materials: StudyMaterial[],
  nowMs = Date.now(),
): SrsCardState[] {
  const existing = loadSrsStore();
  let mutated = false;

  for (const mat of materials) {
    const cards = Array.isArray(mat.content?.cards) ? mat.content.cards : [];
    cards.forEach((c, idx) => {
      const id = `${mat.id}::fc::${idx}`;
      if (!existing[id] && c.front && c.back) {
        existing[id] = {
          id,
          materialId: mat.id,
          materialTitle: mat.title,
          course: mat.course,
          front: c.front,
          back: c.back,
          hint: c.hint,
          topic: c.topic || mat.course || mat.title,
          repetitions: 0,
          intervalDays: 0,
          easeFactor: 2.5,
          lastReviewedAt: null,
          nextReviewAt: nowMs,
          lapses: 0,
        };
        mutated = true;
      }
    });

    // Also include keyTerms from summaries that don't have a dedicated flashcard deck yet
    if (mat.material_type === 'summary' && Array.isArray(mat.content?.keyTerms)) {
      mat.content.keyTerms.slice(0, 6).forEach((kt, idx) => {
        const id = `${mat.id}::kt::${idx}`;
        if (!existing[id] && kt.term && kt.definition) {
          existing[id] = {
            id,
            materialId: mat.id,
            materialTitle: mat.title,
            course: mat.course,
            front: `"${kt.term}" kavramını ve analitik işlevini tanımlayın.`,
            back: kt.formula ? `${kt.definition}\nFormül: ${kt.formula}` : kt.definition,
            topic: mat.course || mat.title,
            repetitions: 0,
            intervalDays: 0,
            easeFactor: 2.5,
            lastReviewedAt: null,
            nextReviewAt: nowMs,
            lapses: 0,
          };
          mutated = true;
        }
      });
    }
  }

  if (mutated) saveSrsStore(existing);
  return Object.values(existing);
}

export function reviewSrsCard(
  cardId: string,
  quality: ReviewQuality,
  nowMs = Date.now(),
): SrsCardState | null {
  const store = loadSrsStore();
  const target = store[cardId];
  if (!target) return null;
  const updated = computeSm2Review(target, quality, nowMs);
  store[cardId] = updated;
  saveSrsStore(store);
  return updated;
}

export function getDueSrsCards(cards: SrsCardState[], nowMs = Date.now()): SrsCardState[] {
  return cards
    .filter((c) => c.nextReviewAt <= nowMs)
    .sort((a, b) => a.nextReviewAt - b.nextReviewAt);
}

export function loadPlannerConfig(): PlannerConfig {
  try {
    const raw = localStorage.getItem(PLAN_STORAGE_KEY);
    if (raw) return JSON.parse(raw) as PlannerConfig;
  } catch {
    // ignore
  }
  const twoWeeksLater = new Date(Date.now() + 14 * DAY_MS).toISOString().slice(0, 10);
  return {
    examDateIso: twoWeeksLater,
    dailyMinutes: 60,
    targetGoalLabel: 'Vize / Final Tam Hazırlık',
    completedTaskIds: [],
  };
}

export function savePlannerConfig(cfg: PlannerConfig): void {
  try {
    localStorage.setItem(PLAN_STORAGE_KEY, JSON.stringify(cfg));
  } catch {
    // ignore
  }
}

/**
 * Analyzes quiz scores, unattempted decks, and lapsed SRS cards to produce
 * an actionable weak-topic heatmap ordered by urgency.
 */
export function analyzeWeakTopics(
  materials: StudyMaterial[],
  progressRows: StudyProgressRow[],
  srsCards: SrsCardState[],
  nowMs = Date.now(),
): TopicMasteryMetric[] {
  const bucket = new Map<
    string,
    {
      course: string | null;
      scores: number[];
      dueCards: number;
      lapses: number;
      materialId?: string;
    }
  >();

  const matById = new Map<string, StudyMaterial>();
  for (const m of materials) {
    matById.set(m.id, m);
    const topicName = m.course?.trim() || m.title;
    if (!bucket.has(topicName)) {
      bucket.set(topicName, {
        course: m.course,
        scores: [],
        dueCards: 0,
        lapses: 0,
        materialId: m.id,
      });
    }
  }

  for (const row of progressRows) {
    const mat = matById.get(row.material_id);
    if (!mat) continue;
    const topicName = mat.course?.trim() || mat.title;
    const pct =
      row.total_questions > 0
        ? Math.round((row.score / row.total_questions) * 100)
        : 0;
    const entry = bucket.get(topicName) || {
      course: mat.course,
      scores: [],
      dueCards: 0,
      lapses: 0,
      materialId: mat.id,
    };
    entry.scores.push(pct);
    bucket.set(topicName, entry);
  }

  for (const card of srsCards) {
    const topicName = card.course?.trim() || card.topic || card.materialTitle;
    const entry = bucket.get(topicName) || {
      course: card.course,
      scores: [],
      dueCards: 0,
      lapses: 0,
      materialId: card.materialId,
    };
    if (card.nextReviewAt <= nowMs) entry.dueCards += 1;
    entry.lapses += card.lapses;
    bucket.set(topicName, entry);
  }

  const metrics: TopicMasteryMetric[] = [];
  for (const [topic, info] of bucket.entries()) {
    const hasScores = info.scores.length > 0;
    const avg = hasScores
      ? Math.round(info.scores.reduce((a, b) => a + b, 0) / info.scores.length)
      : info.lapses > 0
      ? Math.max(35, 70 - info.lapses * 10)
      : 60;

    const status: TopicMasteryMetric['status'] =
      (hasScores && avg < 65) || info.lapses >= 2
        ? 'critical'
        : avg < 85 || info.dueCards >= 3
        ? 'review'
        : 'mastered';

    const recommendedAction =
      status === 'critical'
        ? 'Zayıf alan: Derin özet + 10 soruluk sınav simülasyonu önerilir'
        : status === 'review'
        ? `${info.dueCards > 0 ? `${info.dueCards} kart tekrar bekliyor — ` : ''}aktif hatırlama oturumu aç`
        : 'Pekiştirilmiş düzey: Haftalık kısa kontrol yeterli';

    metrics.push({
      topic,
      course: info.course,
      attempts: info.scores.length,
      avgScorePct: avg,
      dueCards: info.dueCards,
      status,
      recommendedAction,
      relatedMaterialId: info.materialId,
    });
  }

  const rank = { critical: 0, review: 1, mastered: 2 };
  return metrics.sort(
    (a, b) => rank[a.status] - rank[b.status] || a.avgScorePct - b.avgScorePct,
  );
}

/**
 * Builds a structured multi-day study schedule up to examDateIso (max 10 upcoming days)
 * prioritizing due SM-2 cards, weak-topic drills, and timed exam simulations.
 */
export function buildExamStudyPlan(params: {
  examDateIso: string;
  dailyMinutes: number;
  materials: StudyMaterial[];
  weakTopics: TopicMasteryMetric[];
  dueCardsCount: number;
  completedTaskIds?: string[];
  nowMs?: number;
}): StudyPlanDay[] {
  const nowMs = params.nowMs ?? Date.now();
  const targetMs = Date.parse(params.examDateIso) || nowMs + 7 * DAY_MS;
  const daysRemaining = Math.max(
    1,
    Math.min(10, Math.ceil((targetMs - nowMs) / DAY_MS) + 1),
  );
  const completed = new Set(params.completedTaskIds || []);
  const formatter = new Intl.DateTimeFormat('tr-TR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });

  const plan: StudyPlanDay[] = [];
  const budget = Math.max(20, params.dailyMinutes || 60);

  for (let d = 0; d < daysRemaining; d++) {
    const dayDate = new Date(nowMs + d * DAY_MS);
    const dateIso = dayDate.toISOString().slice(0, 10);
    const tasks: StudyPlanTask[] = [];
    let used = 0;

    // Task 1: Daily SRS review on early days or if due cards exist
    if (d === 0 || params.dueCardsCount > 0) {
      const id = `${dateIso}::srs`;
      const mins = Math.min(20, Math.round(budget * 0.3));
      tasks.push({
        id,
        title:
          d === 0 && params.dueCardsCount > 0
            ? `Günün Aralıklı Tekrarı (${params.dueCardsCount} bekleyen kart)`
            : 'Günlük SM-2 Aktif Hatırlama Tekrarı',
        course: null,
        kind: 'srs_review',
        durationMinutes: mins,
        completed: completed.has(id),
      });
      used += mins;
    }

    // Task 2: Weak topic focused session cycling through top weak topics
    if (params.weakTopics.length > 0 && used < budget) {
      const topic = params.weakTopics[d % params.weakTopics.length];
      const id = `${dateIso}::weak::${topic.topic}`;
      const mins = Math.min(budget - used, Math.max(15, Math.round(budget * 0.45)));
      tasks.push({
        id,
        title: `Odak Çalışma: ${topic.topic}`,
        course: topic.course,
        kind: topic.status === 'critical' ? 'deep_summary' : 'weak_topic_drill',
        durationMinutes: mins,
        materialId: topic.relatedMaterialId,
        completed: completed.has(id),
      });
      used += mins;
    }

    // Task 3: Exam simulation or Video recap when budget permits
    if (used < budget) {
      const isSimDay = d === daysRemaining - 1 || d % 2 === 1;
      const mat = params.materials[d % Math.max(1, params.materials.length)];
      const id = `${dateIso}::${isSimDay ? 'sim' : 'video'}`;
      tasks.push({
        id,
        title: isSimDay
          ? 'Süreli Karma Sınav Simülasyonu'
          : mat
          ? `Video / Kavram Pekiştirme: ${mat.title}`
          : 'Kısa Konu Pekiştirme Testi',
        course: mat?.course || null,
        kind: isSimDay ? 'exam_sim' : 'video_recap',
        durationMinutes: Math.max(10, budget - used),
        materialId: mat?.id,
        completed: completed.has(id),
      });
    }

    plan.push({
      dateIso,
      dayLabel: d === 0 ? `Bugün · ${formatter.format(dayDate)}` : formatter.format(dayDate),
      isToday: d === 0,
      totalMinutes: tasks.reduce((sum, t) => sum + t.durationMinutes, 0),
      tasks,
    });
  }

  return plan;
}
