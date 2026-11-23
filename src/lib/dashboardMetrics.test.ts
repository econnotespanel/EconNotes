import { describe, expect, it } from 'vitest';
import {
  computeWeeklyStudySeries,
  detectNoteFileBadge,
  resolveAcademicCalendarDisplay,
  resolveContinueStudyingItem,
} from './dashboardMetrics';

describe('dashboardMetrics', () => {
  it('formats dynamic academic calendar card with semester, week and academic year', () => {
    const result = resolveAcademicCalendarDisplay(
      { week: 9, semester: 'Güz', label: '2026-2027' },
      new Date('2026-11-23T18:00:00Z'),
    );
    expect(result).toEqual({
      semester: 'Güz',
      weekLabel: '9. Hafta',
      yearLabel: '2026-2027 Eğitim-Öğretim Yılı Akademik Takvim',
    });
  });

  it('derives academic year cleanly when label is empty', () => {
    const fall = resolveAcademicCalendarDisplay(
      { week: 9, semester: 'Güz Dönemi', label: null },
      new Date('2026-11-23T18:00:00Z'),
    );
    expect(fall.semester).toBe('Güz');
    expect(fall.weekLabel).toBe('9. Hafta');
    expect(fall.yearLabel).toBe('2026-2027 Eğitim-Öğretim Yılı Akademik Takvim');
  });

  it('detects PDF, PPT, DOC and IMG badges reliably', () => {
    expect(detectNoteFileBadge('application/pdf', 'para-teorisi.pdf')).toEqual({ label: 'PDF', tone: 'blue' });
    expect(detectNoteFileBadge('', 'mikro-iktisat.pptx')).toEqual({ label: 'PPT', tone: 'orange' });
    expect(detectNoteFileBadge('', 'istatistik.docx')).toEqual({ label: 'DOC', tone: 'indigo' });
    expect(detectNoteFileBadge('image/png', 'tahta.png')).toEqual({ label: 'IMG', tone: 'teal' });
  });

  it('aggregates weekly study minutes across Mon..Sun and identifies peak day', () => {
    const now = new Date('2026-11-25T15:00:00Z'); // Wednesday in Europe/Istanbul
    const series = computeWeeklyStudySeries({
      pointEvents: [
        { amount: 25, reason: 'mission_focus_2026-11-23', created_at: '2026-11-23T10:00:00Z' },
        { amount: 15, reason: 'daily_trivia', created_at: '2026-11-25T11:00:00Z' },
      ],
      studyProgress: [{ completed_at: '2026-11-25T12:00:00Z', total_questions: 15 }],
      studyMaterials: [{ created_at: '2026-11-24T09:00:00Z' }],
      noteViews: [{ created_at: '2026-11-25T13:00:00Z' }],
      focusMinutesToday: 40,
      weekOffset: 0,
      now,
    });

    expect(series.days).toHaveLength(7);
    expect(series.days[0].shortLabel).toBe('Pzt');
    expect(series.days[0].minutes).toBe(25);
    expect(series.days[1].minutes).toBe(15);
    expect(series.days[2].minutes).toBe(50); // 15 trivia + 30 progress + 5 view (beats 40 focus)
    expect(series.days[2].isPeak).toBe(true);
    expect(series.peakIndex).toBe(2);
    expect(series.totalMinutes).toBe(90);
  });

  it('prefers real study_progress for continue studying card', () => {
    const item = resolveContinueStudyingItem({
      progress: [
        {
          material_id: 'm1',
          score: 7,
          total_questions: 10,
          completed_at: '2026-11-23T10:00:00Z',
        },
      ],
      materials: [
        {
          id: 'm1',
          source_type: 'platform',
          source_note_id: null,
          material_type: 'quiz',
          title: 'Para Teorisi - 6. Hafta',
          course: 'Para Teorisi',
          content: {} as any,
          model: null,
          created_at: '2026-11-23T09:00:00Z',
        },
      ],
      notebooks: [],
      recentNotes: [],
    });

    expect(item.title).toBe('Para Teorisi - 6. Hafta');
    expect(item.progressPct).toBe(70);
    expect(item.targetPath).toBe('/study');
    expect(item.hasRealHistory).toBe(true);
  });
});
