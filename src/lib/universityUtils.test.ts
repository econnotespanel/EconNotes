import { describe, it, expect } from 'vitest';
import { normalizeUniversityName } from './universityUtils';

describe('normalizeUniversityName', () => {
  it('normalizes various forms of Düzce Üniversitesi to canonical form', () => {
    expect(normalizeUniversityName('düzce üniversitesi')).toBe('Düzce Üniversitesi');
    expect(normalizeUniversityName('Düzce üniversitesi')).toBe('Düzce Üniversitesi');
    expect(normalizeUniversityName('Düzce Üniversitesi')).toBe('Düzce Üniversitesi');
    expect(normalizeUniversityName('düzce')).toBe('Düzce Üniversitesi');
    expect(normalizeUniversityName('duzce')).toBe('Düzce Üniversitesi');
    expect(normalizeUniversityName('duzce universitesi')).toBe('Düzce Üniversitesi');
    expect(normalizeUniversityName('DÜZCE ÜNİVERSİTESİ')).toBe('Düzce Üniversitesi');
  });

  it('normalizes acronyms and major universities', () => {
    expect(normalizeUniversityName('odtü')).toBe('Orta Doğu Teknik Üniversitesi');
    expect(normalizeUniversityName('itü')).toBe('İstanbul Teknik Üniversitesi');
    expect(normalizeUniversityName('boğaziçi')).toBe('Boğaziçi Üniversitesi');
    expect(normalizeUniversityName('marmara')).toBe('Marmara Üniversitesi');
    expect(normalizeUniversityName('hacettepe')).toBe('Hacettepe Üniversitesi');
  });

  it('handles empty or whitespace strings', () => {
    expect(normalizeUniversityName('')).toBe('Üniversite bilgisi yok');
    expect(normalizeUniversityName('   ')).toBe('Üniversite bilgisi yok');
    expect(normalizeUniversityName(null)).toBe('Üniversite bilgisi yok');
    expect(normalizeUniversityName(undefined)).toBe('Üniversite bilgisi yok');
  });

  it('title cases custom universities', () => {
    expect(normalizeUniversityName('selçuk üniversitesi')).toBe('Selçuk Üniversitesi');
    expect(normalizeUniversityName('erciyes üniversitesi')).toBe('Erciyes Üniversitesi');
  });

  it('groups disparate casings (2 + 1 + 33 notes) into a single canonical folder of 36 notes', () => {
    const rawNotes = [
      ...Array.from({ length: 2 }, (_, i) => ({ id: `d1_${i}`, title: `Not ${i}`, university: 'düzce üniversitesi' })),
      ...Array.from({ length: 1 }, (_, i) => ({ id: `d2_${i}`, title: `Not ${i}`, university: 'Düzce üniversitesi' })),
      ...Array.from({ length: 33 }, (_, i) => ({ id: `d3_${i}`, title: `Not ${i}`, university: 'Düzce Üniversitesi' })),
    ];

    const groups = rawNotes.reduce<Record<string, typeof rawNotes>>((acc, note) => {
      const canonicalKey = normalizeUniversityName(note.university);
      if (!acc[canonicalKey]) acc[canonicalKey] = [];
      acc[canonicalKey].push(note);
      return acc;
    }, {});

    expect(Object.keys(groups)).toEqual(['Düzce Üniversitesi']);
    expect(groups['Düzce Üniversitesi'].length).toBe(36);
  });
});
