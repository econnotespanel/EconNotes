import { describe, it, expect } from 'vitest';
import {
  calculate72HoursDeadline,
  packRevisionReason,
  getNoteRevisionDeadline,
  getCleanRevisionNotes,
  isRevisionExpired,
  REVISION_DURATION_MS,
} from './revisionUtils';

describe('revisionUtils', () => {
  it('calculates 72 hours deadline correctly', () => {
    const start = 1700000000000;
    const deadline = calculate72HoursDeadline(start);
    expect(new Date(deadline).getTime()).toBe(start + REVISION_DURATION_MS);
  });

  it('packs reason and deadline into rejection_reason', () => {
    const deadline = '2026-11-14T01:00:00.000Z';
    const reason = 'Üniversite ve bölüm eksik';
    const packed = packRevisionReason(reason, deadline);
    expect(packed).toBe(`[REV_DEADLINE:${deadline}] ${reason}`);
  });

  it('extracts deadline from note with dedicated revision_deadline column', () => {
    const note = {
      id: '1',
      status: 'revision_requested',
      revision_deadline: '2026-11-14T01:00:00.000Z',
      rejection_reason: 'Düzeltme gerekli',
    };
    expect(getNoteRevisionDeadline(note)).toBe('2026-11-14T01:00:00.000Z');
  });

  it('extracts embedded deadline from rejection_reason when revision_deadline column is missing', () => {
    const deadline = '2026-11-14T01:00:00.000Z';
    const note = {
      id: '2',
      status: 'revision_requested',
      revision_deadline: null,
      rejection_reason: `[REV_DEADLINE:${deadline}] Ders adı eksik`,
    };
    expect(getNoteRevisionDeadline(note)).toBe(deadline);
    expect(getCleanRevisionNotes(note)).toBe('Ders adı eksik');
  });

  it('falls back to 72 hours from updated_at / created_at if tag is missing', () => {
    const baseTime = '2026-11-10T12:00:00.000Z';
    const note = {
      id: '3',
      status: 'revision_requested',
      created_at: baseTime,
      rejection_reason: 'Eski not',
    };
    const expected = new Date(new Date(baseTime).getTime() + REVISION_DURATION_MS).toISOString();
    expect(getNoteRevisionDeadline(note)).toBe(expected);
  });

  it('detects whether deadline is expired', () => {
    const past = new Date(Date.now() - 1000).toISOString();
    const future = new Date(Date.now() + 100000).toISOString();
    expect(isRevisionExpired(past)).toBe(true);
    expect(isRevisionExpired(future)).toBe(false);
  });
});
