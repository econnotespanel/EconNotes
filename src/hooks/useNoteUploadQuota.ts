import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import {
  resolveNoteUploadQuota,
  UPLOAD_QUOTA_UPDATED_EVENT,
  type NoteUploadQuotaState,
} from '@/lib/noteUploadQuota';

interface UploadQuotaRpcRow {
  remaining_uploads: number | null;
  total_uploads: number;
  starter_granted: boolean;
  is_limited: boolean;
  can_upload: boolean;
  is_admin: boolean;
}

/**
 * Fetches & tracks the authenticated user's server-authoritative note upload rights.
 * Combines `get_note_upload_quota` RPC with `AuthContext.profile` so remaining upload
 * rights update immediately after uploads and never reset across reloads or re-logins.
 */
export function useNoteUploadQuota() {
  const { user, profile, isAdmin, isApproved } = useAuth();
  const [rpcRow, setRpcRow] = useState<UploadQuotaRpcRow | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user?.id) {
      setRpcRow(null);
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await (supabase.rpc as any)('get_note_upload_quota', {
        _user_id: user.id,
      });
      if (!error && Array.isArray(data) && data.length > 0) {
        setRpcRow(data[0] as UploadQuotaRpcRow);
      } else {
        setRpcRow(null);
      }
    } catch {
      setRpcRow(null);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    void refresh();
    const onUpdated = () => {
      void refresh();
    };
    window.addEventListener(UPLOAD_QUOTA_UPDATED_EVENT, onUpdated);
    window.addEventListener('econnotes:wheel-updated', onUpdated);
    return () => {
      window.removeEventListener(UPLOAD_QUOTA_UPDATED_EVENT, onUpdated);
      window.removeEventListener('econnotes:wheel-updated', onUpdated);
    };
  }, [refresh, profile?.note_upload_quota, profile?.approval_status]);

  const uploadQuota: NoteUploadQuotaState = useMemo(
    () =>
      resolveNoteUploadQuota({
        profile,
        isAdmin,
        isApproved,
        rpcRow,
      }),
    [profile, isAdmin, isApproved, rpcRow],
  );

  return { uploadQuota, loading, refresh };
}
