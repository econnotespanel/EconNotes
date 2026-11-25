export const STARTER_NOTE_UPLOAD_QUOTA = 2;

export const UPLOAD_QUOTA_UPDATED_EVENT = 'econnotes:upload-quota-updated';

export interface NoteUploadQuotaState {
  /** Remaining upload rights for tracked accounts; null means unlimited (legacy/admin/wheel pass). */
  remainingUploads: number | null;
  /** Whether the user is subject to a numeric upload right balance. */
  isLimited: boolean;
  /** Whether the user is currently allowed to create a new note upload. */
  canUpload: boolean;
  /** Whether starter 2 upload rights were granted at signup. */
  starterGranted: boolean;
  /** Whether a temporary Monday Wheel unlimited pass is active. */
  isWheelUnlimited: boolean;
  /** Whether the user is an administrator (exempt). */
  isAdmin: boolean;
  /** Whether the account is awaiting Waiting Room approval (rights preserved until approved). */
  isPendingApproval: boolean;
  /** User-facing concise status label. */
  statusLabel: string;
}

export interface UploadQuotaProfileInput {
  note_upload_quota?: number | null;
  starter_upload_quota_granted_at?: string | null;
  wheel_unlimited_until?: string | null;
  approval_status?: string | null;
}

/**
 * Pure server-backed resolver for a user's note upload rights.
 * - Existing legacy users (`note_upload_quota == null`) remain completely untouched (unlimited).
 * - Brand-new users start with 2 starter upload rights saved in `profiles.note_upload_quota`.
 * - Pending Waiting Room accounts preserve their rights until admin approval.
 * - Admins and active Monday Wheel unlimited pass holders can upload without consuming rights.
 */
export function resolveNoteUploadQuota(params: {
  profile: UploadQuotaProfileInput | null | undefined;
  isAdmin: boolean;
  isApproved: boolean;
  rpcRow?: {
    remaining_uploads?: number | null;
    starter_granted?: boolean;
    is_limited?: boolean;
    can_upload?: boolean;
    is_admin?: boolean;
  } | null;
  nowMs?: number;
}): NoteUploadQuotaState {
  const { profile, isAdmin, isApproved, rpcRow, nowMs = Date.now() } = params;
  const effectiveAdmin = Boolean(isAdmin || rpcRow?.is_admin);
  const wheelUntilMs = profile?.wheel_unlimited_until
    ? Date.parse(profile.wheel_unlimited_until)
    : 0;
  const isWheelUnlimited = Number.isFinite(wheelUntilMs) && wheelUntilMs > nowMs;

  const starterGranted = Boolean(
    rpcRow?.starter_granted ?? Boolean(profile?.starter_upload_quota_granted_at),
  );
  const isPendingApproval = !effectiveAdmin && !isApproved;

  // Prefer server RPC row when available; fall back to profile.note_upload_quota column
  const rawQuota =
    rpcRow && 'remaining_uploads' in rpcRow
      ? rpcRow.remaining_uploads
      : profile?.note_upload_quota;

  if (effectiveAdmin) {
    return {
      remainingUploads: null,
      isLimited: false,
      canUpload: true,
      starterGranted,
      isWheelUnlimited,
      isAdmin: true,
      isPendingApproval: false,
      statusLabel: 'Sınırsız (Yönetici)',
    };
  }

  if (isWheelUnlimited) {
    return {
      remainingUploads: typeof rawQuota === 'number' ? Math.max(0, Math.floor(rawQuota)) : null,
      isLimited: false,
      canUpload: isApproved,
      starterGranted,
      isWheelUnlimited: true,
      isAdmin: false,
      isPendingApproval,
      statusLabel: 'Sınırsız (Şans Çarkı Ödülü Aktif)',
    };
  }

  if (typeof rawQuota === 'number' && Number.isFinite(rawQuota)) {
    const remaining = Math.max(0, Math.floor(rawQuota));
    const canUpload = isApproved && remaining > 0;
    const statusLabel = isPendingApproval
      ? `${remaining} hak hazır (Onay sonrası aktif)`
      : remaining > 0
        ? `${remaining} not yükleme hakkı kaldı`
        : 'Not yükleme hakkınız doldu';

    return {
      remainingUploads: remaining,
      isLimited: true,
      canUpload,
      starterGranted,
      isWheelUnlimited: false,
      isAdmin: false,
      isPendingApproval,
      statusLabel,
    };
  }

  // Legacy existing user (`note_upload_quota === null`): existing rights untouched
  return {
    remainingUploads: null,
    isLimited: false,
    canUpload: isApproved,
    starterGranted,
    isWheelUnlimited: false,
    isAdmin: false,
    isPendingApproval,
    statusLabel: isPendingApproval ? 'Onay sonrası aktif' : 'Sınırsız',
  };
}

export function emitUploadQuotaUpdated(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(UPLOAD_QUOTA_UPDATED_EVENT));
  }
}
