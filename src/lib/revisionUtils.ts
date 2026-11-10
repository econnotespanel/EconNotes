/**
 * Utility functions for 72-hour note revision workflow.
 *
 * Provides backward-compatible parsing and packing so the 72-hour deadline
 * works seamlessly even if the remote Supabase database does not have
 * the `revision_deadline` column added yet.
 */

export const REVISION_DURATION_HOURS = 72;
export const REVISION_DURATION_MS = REVISION_DURATION_HOURS * 60 * 60 * 1000;

export function calculate72HoursDeadline(fromTimestamp: number = Date.now()): string {
  return new Date(fromTimestamp + REVISION_DURATION_MS).toISOString();
}

/**
 * Packs the human reason and deadline into a single text format stored in rejection_reason:
 * e.g. "[REV_DEADLINE:2026-11-14T01:00:00.000Z] Eksik bilgileri tamamlayınız"
 */
export function packRevisionReason(reason: string, deadlineIso: string): string {
  const clean = reason.trim() || 'Lütfen notun eksik veya hatalı bilgilerini tamamlayın.';
  return `[REV_DEADLINE:${deadlineIso}] ${clean}`;
}

/**
 * Extracts the 72-hour deadline from a note object, checking:
 * 1. Dedicated `revision_deadline` column if present
 * 2. Embedded tag in `rejection_reason`
 * 3. Fallback: 72 hours from `updated_at`, `edited_at`, or `created_at`
 */
export function getNoteRevisionDeadline(note?: any): string | null {
  if (!note) return null;

  if (note.revision_deadline) {
    return note.revision_deadline;
  }

  const raw = String(note.rejection_reason || '');
  const match = raw.match(/\[REV_DEADLINE:([^\]]+)\]/);
  if (match && match[1]) {
    const parsed = new Date(match[1]).getTime();
    if (!isNaN(parsed)) {
      return match[1];
    }
  }

  if (note.status === 'revision_requested') {
    const baseTime = note.updated_at || note.edited_at || note.created_at;
    if (baseTime) {
      const baseMs = new Date(baseTime).getTime();
      if (!isNaN(baseMs)) {
        return new Date(baseMs + REVISION_DURATION_MS).toISOString();
      }
    }
  }

  return null;
}

/**
 * Returns the human-readable revision instructions without embedded tags.
 */
export function getCleanRevisionNotes(note?: any): string {
  if (!note) return 'Lütfen notun eksik bilgilerini tamamlayın.';

  if (note.revision_notes && typeof note.revision_notes === 'string' && note.revision_notes.trim()) {
    return note.revision_notes.trim();
  }

  const raw = String(note.rejection_reason || '');
  const cleaned = raw.replace(/\[REV_DEADLINE:[^\]]+\]\s*/, '').trim();

  return cleaned || 'Lütfen notun eksik bilgilerini tamamlayın.';
}

/**
 * Checks whether the revision deadline has passed.
 */
export function isRevisionExpired(deadlineIso?: string | null): boolean {
  if (!deadlineIso) return false;
  const time = new Date(deadlineIso).getTime();
  return !isNaN(time) && time <= Date.now();
}
