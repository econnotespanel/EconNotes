import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  enforceRateLimit,
  getAuthenticatedUser,
  isTrustedOrigin,
  jsonResponse,
  preflightResponse,
  readJsonBody,
  RequestError,
  STRICT_UUID_RE,
} from '../_shared/request-security.ts';

const NOTE_ID_CHUNK_SIZE = 100;
const MAX_REQUESTED_IDS = 300;

type EngagementBody = {
  action?: 'counts' | 'record_view' | 'record_download';
  noteIds?: unknown;
  noteId?: unknown;
};

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflightResponse(req);
  if (!isTrustedOrigin(req.headers.get('origin'))) {
    return jsonResponse(req, { error: 'Bu kaynaktan isteğe izin verilmiyor.' }, 403);
  }
  if (req.method !== 'POST') {
    return jsonResponse(req, { error: 'Yalnızca POST desteklenir.' }, 405);
  }

  try {
    const user = await getAuthenticatedUser(req);
    if (!user?.id) return jsonResponse(req, { error: 'Oturum geçersiz.' }, 401);
    const authUserId = user.id;

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const body = await readJsonBody<EngagementBody>(req, 64 * 1024);
    const action = body.action ?? 'counts';

    const { data: isAdminRaw } = await admin.rpc('is_admin', { _user_id: authUserId });
    const isAdmin = Boolean(isAdminRaw);

    if (action === 'record_view' || action === 'record_download') {
      const noteId = typeof body.noteId === 'string' ? body.noteId.trim() : '';
      if (!STRICT_UUID_RE.test(noteId)) {
        return jsonResponse(req, { error: 'Geçersiz not kimliği.' }, 400);
      }

      // Prevent automated counter inflation
      await enforceRateLimit(admin, `note_eng:${action}:${authUserId}`, 60, 300);

      const { data: noteRow, error: noteErr } = await admin
        .from('notes')
        .select('id, status, user_id, visibility_status, hidden_until')
        .eq('id', noteId)
        .maybeSingle();

      if (noteErr || !noteRow) {
        return jsonResponse(req, { error: 'Not bulunamadı.' }, 404);
      }

      const nr = noteRow as {
        status?: string;
        user_id?: string;
        visibility_status?: string;
        hidden_until?: string | null;
      };
      const isVisible =
        nr.visibility_status === 'visible' ||
        (nr.visibility_status === 'temporary' && nr.hidden_until && Date.parse(nr.hidden_until) <= Date.now());
      const canAccess = isAdmin || nr.user_id === authUserId || (nr.status === 'approved' && isVisible);

      if (!canAccess) {
        return jsonResponse(req, { error: 'Bu not için yetkiniz yok.' }, 403);
      }

      const targetTable = action === 'record_view' ? 'note_views' : 'note_downloads';
      const { data: existingRow } = await admin
        .from(targetTable)
        .select('id')
        .eq('note_id', noteId)
        .eq('user_id', authUserId)
        .maybeSingle();

      if (!existingRow) {
        await admin
          .from(targetTable)
          .upsert({ note_id: noteId, user_id: authUserId }, { onConflict: 'note_id,user_id', ignoreDuplicates: true });
      }

      const [viewsExact, downloadsExact, statsRes] = await Promise.all([
        admin.from('note_views').select('id', { count: 'exact', head: true }).eq('note_id', noteId),
        admin.from('note_downloads').select('id', { count: 'exact', head: true }).eq('note_id', noteId),
        admin.from('note_stats').select('view_count, download_count').eq('note_id', noteId).maybeSingle(),
      ]);

      let viewCount = viewsExact.count ?? 0;
      let downloadCount = downloadsExact.count ?? 0;

      if (!statsRes.error) {
        const currentStats = statsRes.data as { view_count?: number; download_count?: number } | null;
        const baseViews = Math.max(currentStats?.view_count ?? 0, viewCount);
        const baseDownloads = Math.max(currentStats?.download_count ?? 0, downloadCount);

        if (existingRow) {
          // Throttle repeat counter increments by the same user to max once per 10 minutes per note
          let allowRepeatBump = false;
          try {
            await enforceRateLimit(admin, `note_eng_bump:${action}:${authUserId}:${noteId}`, 1, 600);
            allowRepeatBump = true;
          } catch {
            allowRepeatBump = false;
          }

          if (allowRepeatBump) {
            viewCount = action === 'record_view' ? baseViews + 1 : baseViews;
            downloadCount = action === 'record_download' ? baseDownloads + 1 : baseDownloads;
            await admin.from('note_stats').upsert(
              {
                note_id: noteId,
                view_count: viewCount,
                download_count: downloadCount,
                updated_at: new Date().toISOString(),
              },
              { onConflict: 'note_id' },
            );
          } else {
            viewCount = baseViews;
            downloadCount = baseDownloads;
          }
        } else {
          viewCount = baseViews;
          downloadCount = baseDownloads;
        }
      }

      return jsonResponse(req, {
        note_id: noteId,
        view_count: viewCount,
        download_count: downloadCount,
      });
    }

    // Default action: 'counts' — uses indexed `note_stats` only (eliminates 1M-row DoS scan!)
    await enforceRateLimit(admin, `note_eng_counts:${authUserId}`, 60, 300);

    const requestedIds = Array.isArray(body.noteIds)
      ? Array.from(
          new Set(
            body.noteIds
              .filter((id): id is string => typeof id === 'string' && STRICT_UUID_RE.test(id.trim()))
              .map((id) => id.trim()),
          ),
        ).slice(0, MAX_REQUESTED_IDS)
      : [];

    const visibleIds: string[] = [];
    if (requestedIds.length > 0) {
      for (const chunk of chunkArray(requestedIds, NOTE_ID_CHUNK_SIZE)) {
        const { data: rows } = await admin
          .from('notes')
          .select('id, status, user_id')
          .in('id', chunk);

        for (const row of rows || []) {
          const r = row as { id: string; status?: string; user_id?: string };
          if (isAdmin || r.status === 'approved' || r.user_id === authUserId) {
            visibleIds.push(r.id);
          }
        }
      }
    } else {
      let query = admin.from('notes').select('id, status, user_id').limit(MAX_REQUESTED_IDS);
      if (!isAdmin) {
        query = query.or(`status.eq.approved,user_id.eq.${authUserId}`);
      }
      const { data: rows } = await query;
      for (const row of rows || []) {
        const r = row as { id: string };
        if (r.id) visibleIds.push(r.id);
      }
    }

    if (visibleIds.length === 0) {
      return jsonResponse(req, { counts: {} });
    }

    const counts: Record<string, { views: number; downloads: number }> = {};
    for (const chunk of chunkArray(visibleIds, NOTE_ID_CHUNK_SIZE)) {
      const { data: statsRows } = await admin
        .from('note_stats')
        .select('note_id, view_count, download_count')
        .in('note_id', chunk);
      for (const row of statsRows || []) {
        const s = row as { note_id: string; view_count?: number; download_count?: number };
        counts[s.note_id] = {
          views: Number(s.view_count) || 0,
          downloads: Number(s.download_count) || 0,
        };
      }
    }

    for (const id of visibleIds) {
      if (!counts[id]) counts[id] = { views: 0, downloads: 0 };
    }

    return jsonResponse(req, { counts });
  } catch (e) {
    if (e instanceof RequestError) return jsonResponse(req, { error: e.message }, e.status);
    console.error('note-engagement error');
    return jsonResponse(req, { error: 'Etkileşim verisi işlenemedi.' }, 500);
  }
});
