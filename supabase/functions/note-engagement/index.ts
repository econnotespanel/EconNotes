import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { getAuthenticatedUser } from '../_shared/request-security.ts';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NOTE_ID_CHUNK_SIZE = 150;
const PAGE_SIZE = 1000;
const MAX_PAGES_PER_CHUNK = 50;

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

async function countTableByNoteIds(
  admin: ReturnType<typeof createClient>,
  table: 'note_views' | 'note_downloads',
  noteIds: string[],
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const chunk of chunkArray(noteIds, NOTE_ID_CHUNK_SIZE)) {
    for (let page = 0; page < MAX_PAGES_PER_CHUNK; page++) {
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const { data, error } = await admin
        .from(table)
        .select('note_id')
        .in('note_id', chunk)
        .range(from, to);

      if (error || !Array.isArray(data) || data.length === 0) break;
      for (const row of data) {
        const id = (row as { note_id?: string }).note_id;
        if (id) counts[id] = (counts[id] || 0) + 1;
      }
      if (data.length < PAGE_SIZE) break;
    }
  }
  return counts;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
    });

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.match(/^Bearer\s+(\S+)$/i)?.[1];
    if (!token) return json({ error: 'Yetkisiz.' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    let authUserId: string | null = (await getAuthenticatedUser(req))?.id ?? null;
    if (!authUserId) {
      const { data: userData, error: userErr } = await admin.auth.getUser(token);
      if (!userErr && userData?.user?.id) {
        authUserId = userData.user.id;
      }
    }
    if (!authUserId) return json({ error: 'Oturum geçersiz.' }, 401);

    let body: EngagementBody = {};
    try {
      const parsed = await req.json();
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        body = parsed as EngagementBody;
      }
    } catch {
      body = {};
    }

    const action = body.action ?? 'counts';
    const { data: isAdminRaw } = await admin.rpc('is_admin', { _user_id: authUserId });
    const isAdmin = Boolean(isAdminRaw);

    if (action === 'record_view' || action === 'record_download') {
      const noteId = typeof body.noteId === 'string' ? body.noteId.trim() : '';
      if (!UUID_REGEX.test(noteId)) {
        return json({ error: 'Geçersiz not kimliği.' }, 400);
      }

      const { data: noteRow, error: noteErr } = await admin
        .from('notes')
        .select('id, status, user_id')
        .eq('id', noteId)
        .maybeSingle();

      if (noteErr || !noteRow) {
        return json({ error: 'Not bulunamadı.' }, 404);
      }

      const canAccess =
        isAdmin ||
        (noteRow as { status?: string }).status === 'approved' ||
        (noteRow as { user_id?: string }).user_id === authUserId;

      if (!canAccess) {
        return json({ error: 'Bu not için yetkiniz yok.' }, 403);
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
          // Repeat view/download by the same user: increment total counter in note_stats
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
      }

      return json({
        note_id: noteId,
        view_count: viewCount,
        download_count: downloadCount,
      });
    }

    // Default action: 'counts'
    const requestedIds = Array.isArray(body.noteIds)
      ? Array.from(
          new Set(
            body.noteIds
              .filter((id): id is string => typeof id === 'string' && UUID_REGEX.test(id.trim()))
              .map((id) => id.trim()),
          ),
        ).slice(0, 1500)
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
      let query = admin.from('notes').select('id, status, user_id').limit(1500);
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
      return json({ counts: {} });
    }

    const statsMap: Record<string, { views: number; downloads: number }> = {};
    for (const chunk of chunkArray(visibleIds, NOTE_ID_CHUNK_SIZE)) {
      const { data: statsRows, error: statsErr } = await admin
        .from('note_stats')
        .select('note_id, view_count, download_count')
        .in('note_id', chunk);
      if (statsErr) break;
      for (const row of statsRows || []) {
        const s = row as { note_id: string; view_count?: number; download_count?: number };
        statsMap[s.note_id] = {
          views: Number(s.view_count) || 0,
          downloads: Number(s.download_count) || 0,
        };
      }
    }

    const [rawViewCounts, rawDownloadCounts] = await Promise.all([
      countTableByNoteIds(admin, 'note_views', visibleIds),
      countTableByNoteIds(admin, 'note_downloads', visibleIds),
    ]);

    const counts: Record<string, { views: number; downloads: number }> = {};
    for (const id of visibleIds) {
      counts[id] = {
        views: Math.max(statsMap[id]?.views ?? 0, rawViewCounts[id] ?? 0),
        downloads: Math.max(statsMap[id]?.downloads ?? 0, rawDownloadCounts[id] ?? 0),
      };
    }

    return json({ counts });
  } catch (e) {
    console.error('note-engagement error', e);
    return json({ error: e instanceof Error ? e.message : 'Bilinmeyen hata.' }, 500);
  }
});
