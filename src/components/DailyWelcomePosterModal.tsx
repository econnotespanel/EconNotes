import React from 'react';

export const getDailyPosterStorageKey = (userId: string, date: Date = new Date()): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `econnotes_daily_poster_${userId}_${year}-${month}-${day}`;
};

/**
 * Decorative AI promotional welcome poster modal has been intentionally retired
 * as part of the EconNotes 2026 clean SaaS design system update.
 * Exports are retained for backwards compatibility with existing imports & unit tests.
 */
export const DailyWelcomePosterModal: React.FC = () => null;

export default DailyWelcomePosterModal;
