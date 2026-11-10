import { toTurkishTitleCase } from './stringUtils';

/**
 * List of common Turkish Universities for datalist autocomplete and suggestions.
 */
export const POPULAR_UNIVERSITIES: string[] = [
  'Düzce Üniversitesi',
  'İstanbul Üniversitesi',
  'İstanbul Teknik Üniversitesi',
  'Orta Doğu Teknik Üniversitesi',
  'Boğaziçi Üniversitesi',
  'Ankara Üniversitesi',
  'Marmara Üniversitesi',
  'Gazi Üniversitesi',
  'Hacettepe Üniversitesi',
  'Ege Üniversitesi',
  'Dokuz Eylül Üniversitesi',
  'Yıldız Teknik Üniversitesi',
  'Anadolu Üniversitesi',
  'Sakarya Üniversitesi',
  'Kocaeli Üniversitesi',
  'Bursa Uludağ Üniversitesi',
  'Akdeniz Üniversitesi',
  'Çukurova Üniversitesi',
  'Karadeniz Teknik Üniversitesi',
  'Selçuk Üniversitesi',
  'Erciyes Üniversitesi',
  'Pamukkale Üniversitesi',
  'Ondokuz Mayıs Üniversitesi',
  'Bolu Abant İzzet Baysal Üniversitesi',
  'Yalova Üniversitesi',
  'Bartın Üniversitesi',
  'Karabük Üniversitesi',
  'Zonguldak Bülent Ecevit Üniversitesi',
  'Bilecik Şeyh Edebali Üniversitesi',
  'Kastamonu Üniversitesi',
  'Koç Üniversitesi',
  'Sabancı Üniversitesi',
  'Bilkent Üniversitesi',
  'TOBB Ekonomi ve Teknoloji Üniversitesi',
  'Özyeğin Üniversitesi',
  'Yeditepe Üniversitesi',
  'Bahçeşehir Üniversitesi',
];

/**
 * Canonicalizes and normalizes university names to prevent duplicate folders
 * caused by differing casings, typos, or missing 'Üniversitesi' suffixes.
 *
 * Examples:
 *   "düzce üniversitesi" -> "Düzce Üniversitesi"
 *   "Düzce üniversitesi" -> "Düzce Üniversitesi"
 *   "düzce"             -> "Düzce Üniversitesi"
 *   "duzce universitesi" -> "Düzce Üniversitesi"
 *   "itü"               -> "İstanbul Teknik Üniversitesi"
 *   "odtü"              -> "Orta Doğu Teknik Üniversitesi"
 */
export function normalizeUniversityName(raw?: string | null): string {
  if (!raw || !raw.trim()) {
    return 'Üniversite bilgisi yok';
  }

  const trimmed = raw.trim().replace(/\s+/g, ' ');
  const lower = trimmed.toLocaleLowerCase('tr-TR');

  // Exact & substring heuristics for common Turkish universities
  if (lower.includes('düzce') || lower.includes('duzce')) {
    return 'Düzce Üniversitesi';
  }
  if (lower.includes('boğaziçi') || lower.includes('bogazici')) {
    return 'Boğaziçi Üniversitesi';
  }
  if (lower === 'odtü' || lower === 'odtu' || lower.includes('orta doğu teknik') || lower.includes('orta dogu teknik')) {
    return 'Orta Doğu Teknik Üniversitesi';
  }
  if (lower === 'itü' || lower === 'itu' || lower.includes('istanbul teknik')) {
    return 'İstanbul Teknik Üniversitesi';
  }
  if (lower === 'ytü' || lower === 'ytu' || lower.includes('yıldız teknik') || lower.includes('yildiz teknik')) {
    return 'Yıldız Teknik Üniversitesi';
  }
  if (lower.includes('marmara')) {
    return 'Marmara Üniversitesi';
  }
  if (lower.includes('hacettepe')) {
    return 'Hacettepe Üniversitesi';
  }
  if (lower.includes('gazi')) {
    return 'Gazi Üniversitesi';
  }
  if (lower.includes('dokuz eylül') || lower.includes('dokuz eylul') || lower === 'deü' || lower === 'deu') {
    return 'Dokuz Eylül Üniversitesi';
  }
  if (lower.includes('ege')) {
    return 'Ege Üniversitesi';
  }
  if (lower.includes('anadolu')) {
    return 'Anadolu Üniversitesi';
  }
  if (lower.includes('sakarya')) {
    return 'Sakarya Üniversitesi';
  }
  if (lower.includes('kocaeli')) {
    return 'Kocaeli Üniversitesi';
  }
  if (lower.includes('abant') || lower.includes('izzet baysal')) {
    return 'Bolu Abant İzzet Baysal Üniversitesi';
  }
  if (lower.includes('karadeniz teknik') || lower === 'ktü' || lower === 'ktu') {
    return 'Karadeniz Teknik Üniversitesi';
  }
  if (lower === 'ankara' || lower === 'ankara üni' || lower === 'ankara üniversitesi') {
    return 'Ankara Üniversitesi';
  }
  if (lower === 'istanbul' || lower === 'istanbul üni' || lower === 'istanbul üniversitesi') {
    return 'İstanbul Üniversitesi';
  }

  // Generic Turkish Title-case
  let titleCased = toTurkishTitleCase(trimmed);

  // If ends with " Üni" or " Uni", convert to " Üniversitesi"
  titleCased = titleCased.replace(/\s+(?:Üni|Uni|üni|uni)$/i, ' Üniversitesi');

  return titleCased;
}
