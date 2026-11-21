import { supabase } from '@/integrations/supabase/client';

export interface NoteEngagementCount {
  views: number;
  downloads: number;
}

export type NoteEngagementMap = Record<string, NoteEngagementCount>;

const NOTE_ID_CHUNK_SIZE = 150;
const FALLBACK_PAGE_SIZE = 1000;
const FALLBACK_MAX_PAGES = 20;

function chunkIds(ids: string[], size: number): string[][] {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += size) {
    chunks.push(ids.slice(i, i + size));
  }
  return chunks;
}

function emptyCountsFor(ids: string[]): NoteEngagementMap {
  const map: NoteEngagementMap = {};
  for (const id of ids) {
    map[id] = { views: 0, downloads: 0 };
  }
  return map;
}

async function getAccessToken(forceRefresh = false): Promise<string | null> {
  if (forceRefresh) {
    const { data } = await supabase.auth.refreshSession().catch(() => ({ data: { session: null } }));
    return data.session?.access_token ?? null;
  }
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

async function invokeNoteEngagementFunction<T>(body: Record<string, unknown>): Promise<T | null> {
  try {
    let token = await getAccessToken(false);
    if (!token) {
      token = await getAccessToken(true);
    }
    if (!token) return null;

    let res = await supabase.functions.invoke('note-engagement', {
      body,
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.error) {
      const status = (res.error as { context?: { status?: number } })?.context?.status;
      if (status === 401) {
        const freshToken = await getAccessToken(true);
        if (freshToken && freshToken !== token) {
          res = await supabase.functions.invoke('note-engagement', {
            body,
            headers: { Authorization: `Bearer ${freshToken}` },
          });
        }
      }
    }

    if (res.error || !res.data || (res.data as { error?: unknown }).error) {
      return null;
    }
    return res.data as T;
  } catch {
    return null;
  }
}

async function fetchDirectTableCounts(
  table: 'note_views' | 'note_downloads',
  noteIds: string[],
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const chunk of chunkIds(noteIds, NOTE_ID_CHUNK_SIZE)) {
    for (let page = 0; page < FALLBACK_MAX_PAGES; page++) {
      const from = page * FALLBACK_PAGE_SIZE;
      const to = from + FALLBACK_PAGE_SIZE - 1;
      const { data, error } = await supabase
        .from(table)
        .select('note_id')
        .in('note_id', chunk)
        .range(from, to);

      if (error || !Array.isArray(data) || data.length === 0) break;
      for (const row of data) {
        const id = (row as { note_id?: string }).note_id;
        if (id) counts[id] = (counts[id] || 0) + 1;
      }
      if (data.length < FALLBACK_PAGE_SIZE) break;
    }
  }
  return counts;
}

/**
 * Fetches total view and download counts for the given note IDs.
 * Works identically for regular users and administrators:
 * 1) Primary: `get_note_engagement_counts` SECURITY DEFINER RPC (single aggregated query, no 1000-row cap)
 * 2) Secondary: `note-engagement` Edge Function (service-role server aggregation if SQL migration is pending)
 * 3) Tertiary: Direct `note_stats` / `note_views` + `note_downloads` query fallback
 */
export async function fetchNoteEngagementCounts(noteIds: string[]): Promise<NoteEngagementMap> {
  const uniqueIds = Array.from(new Set(noteIds.filter((id): id is string => Boolean(id))));
  if (uniqueIds.length === 0) return {};

  const result = emptyCountsFor(uniqueIds);

  // 1) Primary: SECURITY DEFINER SQL RPC
  try {
    const rpcResult = await supabase.rpc('get_note_engagement_counts' as any, {
      _note_ids: uniqueIds,
    });
    if (!rpcResult.error && Array.isArray(rpcResult.data)) {
      for (const row of rpcResult.data as Array<{
        note_id?: string;
        view_count?: number;
        download_count?: number;
      }>) {
        if (!row.note_id) continue;
        result[row.note_id] = {
          views: Math.max(0, Number(row.view_count) || 0),
          downloads: Math.max(0, Number(row.download_count) || 0),
        };
      }
      return result;
    }
  } catch {
    // Fall through to secondary source
  }

  // 2) Secondary: Authenticated Edge Function (works even before SQL migration is applied)
  const edgeData = await invokeNoteEngagementFunction<{
    counts?: Record<string, { views?: number; downloads?: number }>;
  }>({
    action: 'counts',
    noteIds: uniqueIds,
  });

  if (edgeData?.counts && typeof edgeData.counts === 'object') {
    for (const id of uniqueIds) {
      const entry = edgeData.counts[id];
      if (entry) {
        result[id] = {
          views: Math.max(0, Number(entry.views) || 0),
          downloads: Math.max(0, Number(entry.downloads) || 0),
        };
      }
    }
    return result;
  }

  // 3) Tertiary: Direct client table fallback
  const [directViews, directDownloads] = await Promise.all([
    fetchDirectTableCounts('note_views', uniqueIds),
    fetchDirectTableCounts('note_downloads', uniqueIds),
  ]);

  for (const id of uniqueIds) {
    result[id] = {
      views: Math.max(0, directViews[id] || 0),
      downloads: Math.max(0, directDownloads[id] || 0),
    };
  }
  return result;
}

function parseSingleCountRow(data: unknown): NoteEngagementCount | null {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== 'object') return null;
  const r = row as { view_count?: unknown; download_count?: unknown };
  if (typeof r.view_count === 'undefined' && typeof r.download_count === 'undefined') {
    return null;
  }
  return {
    views: Math.max(0, Number(r.view_count) || 0),
    downloads: Math.max(0, Number(r.download_count) || 0),
  };
}

/**
 * Records a note view and returns the updated total view & download counts when available.
 */
export async function recordNoteView(
  noteId: string,
  userId: string,
): Promise<NoteEngagementCount | null> {
  if (!noteId || !userId) return null;

  try {
    const rpcRes = await supabase.rpc('record_note_view' as any, { _note_id: noteId });
    if (!rpcRes.error) {
      const parsed = parseSingleCountRow(rpcRes.data);
      if (parsed) return parsed;
    }
  } catch {
    // Fall through
  }

  const edgeRes = await invokeNoteEngagementFunction<{
    view_count?: number;
    download_count?: number;
  }>({
    action: 'record_view',
    noteId,
  });
  const parsedEdge = parseSingleCountRow(edgeRes);
  if (parsedEdge) return parsedEdge;

  await supabase.from('note_views').upsert(
    { note_id: noteId, user_id: userId },
    { onConflict: 'note_id,user_id' },
  );
  return null;
}

/**
 * Records a note download (preserving unique per-user download quota) and returns updated totals.
 */
export async function recordNoteDownload(
  noteId: string,
  userId: string,
): Promise<NoteEngagementCount | null> {
  if (!noteId || !userId) return null;

  try {
    const rpcRes = await supabase.rpc('record_note_download' as any, { _note_id: noteId });
    if (!rpcRes.error) {
      const parsed = parseSingleCountRow(rpcRes.data);
      if (parsed) return parsed;
    }
  } catch {
    // Fall through
  }

  const edgeRes = await invokeNoteEngagementFunction<{
    view_count?: number;
    download_count?: number;
  }>({
    action: 'record_download',
    noteId,
  });
  const parsedEdge = parseSingleCountRow(edgeRes);
  if (parsedEdge) return parsedEdge;

  await supabase.from('note_downloads').upsert(
    { note_id: noteId, user_id: userId },
    { onConflict: 'note_id,user_id' },
  );
  return null;
}

export function formatEngagementNumber(value: number | null | undefined): string {
  const safe = Math.max(0, Number(value) || 0);
  return safe.toLocaleString('tr-TR');
}

export function sumNoteEngagement(
  map: NoteEngagementMap,
  noteIds?: string[],
): NoteEngagementCount {
  const keys = noteIds ?? Object.keys(map);
  let views = 0;
  let downloads = 0;
  for (const id of keys) {
    const entry = map[id];
    if (!entry) continue;
    views += Math.max(0, Number(entry.views) || 0);
    downloads += Math.max(0, Number(entry.downloads) || 0);
  }
  return { views, downloads };
}
