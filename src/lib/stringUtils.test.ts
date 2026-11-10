import { describe, it, expect } from 'vitest';
import { toTurkishTitleCase } from './stringUtils';

describe('toTurkishTitleCase', () => {
  it('capitalizes lowercase Turkish names correctly', () => {
    expect(toTurkishTitleCase('kaan çolakoğlu')).toBe('Kaan Çolakoğlu');
    expect(toTurkishTitleCase('ali can öztürk')).toBe('Ali Can Öztürk');
    expect(toTurkishTitleCase('ışıl şimşek')).toBe('Işıl Şimşek');
    expect(toTurkishTitleCase('ibrahim erol')).toBe('İbrahim Erol');
  });

  it('normalizes uppercase names into title case', () => {
    expect(toTurkishTitleCase('KAAN ÇOLAKOĞLU')).toBe('Kaan Çolakoğlu');
    expect(toTurkishTitleCase('IŞIL ŞİMŞEK')).toBe('Işıl Şimşek');
    expect(toTurkishTitleCase('İBRAHİM EROL')).toBe('İbrahim Erol');
  });

  it('handles irregular spaces and edge cases', () => {
    expect(toTurkishTitleCase('  kaan   çolakoğlu  ')).toBe('Kaan Çolakoğlu');
    expect(toTurkishTitleCase('')).toBe('');
    expect(toTurkishTitleCase('ahmet')).toBe('Ahmet');
  });
});
