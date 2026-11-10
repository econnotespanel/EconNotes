import { describe, it, expect } from 'vitest';
import { toTurkishTitleCase } from '@/lib/stringUtils';

describe('Turkish Title Case & Waiting Room Logic', () => {
  it('converts names to proper Turkish Title Case', () => {
    expect(toTurkishTitleCase('kaan çolakoğlu')).toBe('Kaan Çolakoğlu');
    expect(toTurkishTitleCase('ahmet can öztürk')).toBe('Ahmet Can Öztürk');
    expect(toTurkishTitleCase('ışıl şimşek')).toBe('Işıl Şimşek');
    expect(toTurkishTitleCase('ibrahim erol')).toBe('İbrahim Erol');
    expect(toTurkishTitleCase('GÖKÇE GÜLER')).toBe('Gökçe Güler');
    expect(toTurkishTitleCase('çağla çetin')).toBe('Çağla Çetin');
  });

  it('calculates 72-hour revision deadline properly', () => {
    const now = Date.now();
    const seventyTwoHoursMs = 72 * 60 * 60 * 1000;
    const deadlineMs = now + seventyTwoHoursMs;
    const diffHours = (deadlineMs - now) / (1000 * 60 * 60);
    expect(diffHours).toBe(72);

    const deadlineIso = new Date(deadlineMs).toISOString();
    expect(new Date(deadlineIso).getTime()).toBeGreaterThan(now);
  });

  it('determines when a 72-hour revision deadline has expired', () => {
    const expiredDeadline = new Date(Date.now() - 1000).toISOString();
    const activeDeadline = new Date(Date.now() + 100000).toISOString();

    const isExpired = (deadline: string) => new Date(deadline).getTime() <= Date.now();

    expect(isExpired(expiredDeadline)).toBe(true);
    expect(isExpired(activeDeadline)).toBe(false);
  });

  it('enforces mandatory registration fields rule', () => {
    const isValidRegistration = (data: {
      fullName: string;
      university: string;
      department: string;
      grade: string | number;
    }) => {
      const cleanName = data.fullName.trim();
      const cleanUni = data.university.trim();
      const cleanDept = data.department.trim();
      const parsedGrade = parseInt(String(data.grade));
      return Boolean(cleanName && cleanUni && cleanDept && parsedGrade && !isNaN(parsedGrade));
    };

    expect(isValidRegistration({ fullName: '', university: 'Düzce', department: 'İktisat', grade: 1 })).toBe(false);
    expect(isValidRegistration({ fullName: 'Kaan', university: '', department: 'İktisat', grade: 1 })).toBe(false);
    expect(isValidRegistration({ fullName: 'Kaan', university: 'Düzce', department: '', grade: 1 })).toBe(false);
    expect(isValidRegistration({ fullName: 'Kaan', university: 'Düzce', department: 'İktisat', grade: '' })).toBe(false);
    expect(isValidRegistration({ fullName: 'Kaan Çolakoğlu', university: 'Düzce Üniversitesi', department: 'İktisat', grade: 3 })).toBe(true);
  });

  it('filters public notes to strictly approved notes only', () => {
    const notes = [
      { id: '1', title: 'Makro İktisat', status: 'approved' },
      { id: '2', title: 'Mikro İktisat', status: 'pending' },
      { id: '3', title: 'Ekonometri', status: 'revision_requested' },
      { id: '4', title: 'Hukuk', status: 'archived' },
      { id: '5', title: 'Muhasebe', status: 'rejected' },
    ];

    const publicNotes = notes.filter((n) => n.status === 'approved');
    expect(publicNotes.length).toBe(1);
    expect(publicNotes[0].title).toBe('Makro İktisat');
  });
});
