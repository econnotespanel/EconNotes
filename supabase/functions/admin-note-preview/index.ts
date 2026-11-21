import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  getAuthenticatedUser,
  isTrustedOrigin,
  jsonResponse,
  preflightResponse,
  readJsonBody,
  RequestError,
} from '../_shared/request-security.ts';

const NOTES_BUCKET = 'notes';
const DEFAULT_EXPIRES_IN = 900; // 15 minutes short-lived signed URL

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * Normalizes a stored `notes.file_url` value (relative path or full Supabase Storage URL)
 * into ordered, deduplicated candidate object paths within the private `notes` bucket.
 */
function extractPathCandidates(rawUrlOrPath?: string | null, bucket = NOTES_BUCKET): string[] {
  if (!rawUrlOrPath || typeof rawUrlOrPath !== 'string') return [];
  const trimmed = rawUrlOrPath.trim();
  if (!trimmed) return [];

  const candidates: string[] = [];
  const push = (p: string | null | undefined) => {
    if (!p) return;
    const cleaned = p.replace(/^\/+/, '').trim();
    if (cleaned && !candidates.includes(cleaned)) {
      candidates.push(cleaned);
    }
  };

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      const patterns = [
        new RegExp(`/storage/v1/object/(?:public|sign|authenticated)/${bucket}/(.+)$`, 'i'),
        new RegExp(`/storage/v1/object/${bucket}/(.+)$`, 'i'),
        new RegExp(`/storage/v1/render/image/(?:public|sign|authenticated)/${bucket}/(.+)$`, 'i'),
      ];
      for (const rx of patterns) {
        const m = parsed.pathname.match(rx);
        if (m && m[1]) {
          const rawMatch = m[1].replace(/^\/+/, '');
          const decoded = safeDecode(rawMatch).replace(/^\/+/, '');
          push(decoded.replace(new RegExp(`^${bucket}/+`, 'i'), ''));
          push(decoded);
          push(rawMatch.replace(new RegExp(`^${bucket}/+`, 'i'), ''));
          push(rawMatch);
          break;
        }
      }
    } catch {
      // Ignore malformed URL
    }
    return candidates;
  }

  const withoutQuery = trimmed.split('?')[0].split('#')[0].replace(/^\/+/, '');
  const decoded = safeDecode(withoutQuery).replace(/^\/+/, '');
  const bucketPrefixRx = new RegExp(`^${bucket}/+`, 'i');

  push(decoded.replace(bucketPrefixRx, ''));
  push(withoutQuery.replace(bucketPrefixRx, ''));
  push(decoded);
  push(withoutQuery);
  return candidates;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflightResponse(req);
  if (!isTrustedOrigin(req)) return jsonResponse(req, { error: 'Geçersiz kaynak.' }, 403);
  if (req.method !== 'POST') return jsonResponse(req, { error: 'Yalnızca POST desteklenir.' }, 405);

  const json = (body: unknown, status = 200) => jsonResponse(req, body, status);

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.match(/^Bearer\s+(\S+)$/i)?.[1];
    if (!token) return json({ error: 'Yetkisiz. Lütfen yönetici hesabıyla giriş yapın.', code: 'UNAUTHORIZED' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // 1. Validate caller JWT strictly on server
    let authUserId: string | null = (await getAuthenticatedUser(req))?.id ?? null;
    if (!authUserId) {
      const { data: userData, error: userErr } = await admin.auth.getUser(token);
      if (!userErr && userData?.user?.id) {
        authUserId = userData.user.id;
      }
    }
    if (!authUserId) {
      return json({ error: 'Oturum geçersiz veya süresi dolmuş. Lütfen tekrar giriş yapın.', code: 'INVALID_SESSION' }, 401);
    }

    // 2. Enforce administrator authorization server-side via public.is_admin
    const { data: isAdmin, error: roleErr } = await admin.rpc('is_admin', { _user_id: authUserId });
    if (roleErr || !isAdmin) {
      return json(
        { error: 'Bu işlem için yetkili yönetici hesabı gerekir.', code: 'FORBIDDEN' },
        403,
      );
    }

    // 3. Parse request body safely
    const body = await readJsonBody<{ noteId?: string; expiresIn?: number }>(req, 8 * 1024);
    const noteId = typeof body.noteId === 'string' ? body.noteId.trim() : '';
    if (!noteId || !/^[0-9a-f-]{32,40}$/i.test(noteId)) {
      return json({ error: 'Geçerli bir not kimliği (noteId) gönderilmedi.', code: 'INVALID_NOTE_ID' }, 400);
    }

    const requestedExpiry = Number(body.expiresIn);
    const expiresIn =
      Number.isFinite(requestedExpiry) && requestedExpiry >= 60 && requestedExpiry <= 1800
        ? Math.floor(requestedExpiry)
        : DEFAULT_EXPIRES_IN;

    // 4. Fetch authoritative note record (regardless of status or 72h revision deadline expiration)
    const { data: note, error: noteErr } = await admin
      .from('notes')
      .select(
        'id, user_id, title, description, grade, department, course, semester, file_url, file_name, file_type, uploader_name, created_at, updated_at, edited_at, university, status, approved_at, approved_by, rejection_reason, has_password',
      )
      .eq('id', noteId)
      .maybeSingle();

    if (noteErr) {
      return json({ error: `Not kaydı okunamadı: ${noteErr.message}`, code: 'DB_ERROR' }, 500);
    }
    if (!note) {
      return json({ error: 'İncelenmek istenen not veritabanında bulunamadı.', code: 'NOTE_NOT_FOUND' }, 404);
    }

    const rawFileUrl = typeof note.file_url === 'string' ? note.file_url.trim() : '';
    if (!rawFileUrl) {
      return json(
        {
          error: 'Bu not kaydına bağlı yüklenmiş bir dosya yolu (file_url) bulunmuyor.',
          code: 'NO_FILE_URL',
          note,
        },
        404,
      );
    }

    // 5. Resolve Storage object path & generate short-lived signed URL via service_role
    const candidates = extractPathCandidates(rawFileUrl, NOTES_BUCKET);
    let signedUrl: string | null = null;
    let resolvedPath: string | null = null;
    let fileSize: number | null = null;
    let storageMimeType: string | null = null;
    let lastStorageError = '';

    const trySign = async (candidatePath: string): Promise<boolean> => {
      const { data: signedData, error: signErr } = await admin.storage
        .from(NOTES_BUCKET)
        .createSignedUrl(candidatePath, expiresIn);
      if (!signErr && signedData?.signedUrl) {
        signedUrl = signedData.signedUrl;
        resolvedPath = candidatePath;
        return true;
      }
      if (signErr?.message) {
        lastStorageError = signErr.message;
      }
      return false;
    };

    for (const candidate of candidates) {
      if (await trySign(candidate)) break;
    }

    // 6. Read-only folder lookup under uploader's folder if exact path had case/encoding drift
    if (!signedUrl && note.user_id) {
      const targetBasename = (candidates[0] || rawFileUrl).split('/').pop()?.toLowerCase() || '';
      const folderPrefix = String(note.user_id);
      const { data: listed } = await admin.storage
        .from(NOTES_BUCKET)
        .list(folderPrefix, { limit: 200 });

      if (Array.isArray(listed) && listed.length > 0 && targetBasename) {
        const matched = listed.find((item) => {
          const itemLower = String(item.name || '').toLowerCase();
          return (
            itemLower === targetBasename ||
            safeDecode(itemLower) === safeDecode(targetBasename)
          );
        });
        if (matched?.name) {
          const fullFolderPath = `${folderPrefix}/${matched.name}`;
          if (await trySign(fullFolderPath)) {
            const meta = (matched as { metadata?: { size?: number; mimetype?: string } }).metadata;
            if (typeof meta?.size === 'number') fileSize = meta.size;
            if (typeof meta?.mimetype === 'string' && meta.mimetype) storageMimeType = meta.mimetype;
          }
        }
      }
    }

    // Retrieve object metadata (file size / mimetype) cleanly when resolved
    if (resolvedPath && fileSize === null) {
      const slashIdx = resolvedPath.lastIndexOf('/');
      const folder = slashIdx >= 0 ? resolvedPath.slice(0, slashIdx) : '';
      const baseName = slashIdx >= 0 ? resolvedPath.slice(slashIdx + 1) : resolvedPath;
      try {
        const { data: metaList } = await admin.storage
          .from(NOTES_BUCKET)
          .list(folder, { limit: 50, search: baseName });
        const exact = (metaList || []).find((entry) => entry.name === baseName);
        const meta = (exact as { metadata?: { size?: number; mimetype?: string } } | undefined)?.metadata;
        if (typeof meta?.size === 'number') fileSize = meta.size;
        if (typeof meta?.mimetype === 'string' && meta.mimetype) storageMimeType = meta.mimetype;
      } catch {
        // Metadata lookup is best-effort
      }
    }

    // 7. If not found in current project bucket, check if file_url is an external legacy URL
    if (!signedUrl) {
      let externalLegacyUrl: string | null = null;
      if (/^https?:\/\//i.test(rawFileUrl)) {
        try {
          const parsedRaw = new URL(rawFileUrl);
          const parsedCurrent = new URL(supabaseUrl);
          if (parsedRaw.host !== parsedCurrent.host) {
            externalLegacyUrl = rawFileUrl;
          }
        } catch {
          // ignore
        }
      }

      if (externalLegacyUrl) {
        return json({
          signedUrl: externalLegacyUrl,
          resolvedPath: candidates[0] || rawFileUrl,
          expiresIn,
          fileName: note.file_name || rawFileUrl.split('/').pop() || 'Belge',
          fileType: note.file_type || storageMimeType || null,
          fileSize,
          isExternalLegacyUrl: true,
          note,
        });
      }

      return json(
        {
          error:
            lastStorageError && !/not found/i.test(lastStorageError)
              ? `Depolama dosyasına erişilemedi: ${lastStorageError}`
              : 'Bu nota ait dosya depolama alanında (Storage) bulunamadı. Dosya yükleme sırasında yarıda kesilmiş veya silinmiş olabilir.',
          code: 'OBJECT_NOT_FOUND',
          triedPaths: candidates,
          detail: lastStorageError || 'Object not found',
          note,
        },
        404,
      );
    }

    return json({
      signedUrl,
      resolvedPath,
      expiresIn,
      fileName: note.file_name || resolvedPath?.split('/').pop() || 'Belge',
      fileType: note.file_type || storageMimeType || null,
      fileSize,
      isExternalLegacyUrl: false,
      note,
    });
  } catch (err) {
    if (err instanceof RequestError) {
      return json({ error: err.message, code: 'BAD_REQUEST' }, err.status);
    }
    console.error('admin-note-preview error:', err);
    return json(
      {
        error: err instanceof Error ? err.message : 'Belge önizleme bağlantısı oluşturulamadı.',
        code: 'INTERNAL_ERROR',
      },
      500,
    );
  }
});
