/**
 * Turkish string utilities for EconNotes.
 */

/**
 * Converts a Turkish name or title into proper title-case.
 * Handles Turkish specific characters correctly (i -> İ, ı -> I, etc.)
 *
 * Example:
 *   "kaan çolakoğlu" -> "Kaan Çolakoğlu"
 *   "MEHMET ALİ IŞIK" -> "Mehmet Ali Işık"
 *   "ışıl şentürk" -> "Işıl Şentürk"
 */
export function toTurkishTitleCase(input: string): string {
  if (!input) return '';
  return input
    .trim()
    .split(/\s+/)
    .map((word) => {
      if (!word) return '';
      const first = word.charAt(0).toLocaleUpperCase('tr-TR');
      const rest = word.slice(1).toLocaleLowerCase('tr-TR');
      return first + rest;
    })
    .join(' ');
}
