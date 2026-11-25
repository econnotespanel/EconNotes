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

const NOTES_BUCKET = 'notes';

/**
 * Server-authoritative note download & preview signed-URL issuer.
 * Enforces:
 *  - Active verified session (auth.getUser)
 *  - Waiting Room approval & active ban check (is_approved_unbanned_user)
 *  - Note moderation & visibility check (approved + visible, or owner/admin)
 *  - Password unlock verification (note_password_unlocks)
 *  - Server-side download quota verification (get_download_quota) for mode='download'
 *  - Safe owner-scoped storage path signing (no traversal / active web MIME)
 */
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

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    await enforceRateLimit(admin, `download_note:${user.id}`, 45, 300);

    const body = await readJsonBody<{ noteId?: unknown; mode?: unknown }>(req, 4_096);
    const noteId = typeof body.noteId === 'string' ? body.noteId.trim() : '';
    const mode = body.mode === 'preview' ? 'preview' : 'download';
    if (!STRICT_UUID_RE.test(noteId)) {
      return jsonResponse(req, { error: 'Geçersiz not kimliği.' }, 400);
    }

    const [{ data: isAdminRaw }, { data: isApprovedRaw }] = await Promise.all([
      admin.rpc('is_admin', { _user_id: user.id }),
      admin.rpc('is_approved_unbanned_user', { _uid: user.id }),
    ]);
    const isAdmin = Boolean(isAdminRaw);
    if (!isAdmin && !isApprovedRaw) {
      return jsonResponse(req, { error: 'Hesabınız bu işlem için onaylı değil veya kısıtlı.' }, 403);
    }

    const { data: note } = await admin
      .from('notes')
      .select('id, user_id, status, visibility_status, hidden_until, has_password, file_url, file_name, file_type')
      .eq('id', noteId)
      .maybeSingle();

    if (!note || !note.file_url) {
      return jsonResponse(req, { error: 'Not veya dosya bulunamadı.' }, 404);
    }

    const isOwner = note.user_id === user.id;
    const isVisible =
      note.visibility_status === 'visible' ||
      (note.visibility_status === 'temporary' && note.hidden_until && Date.parse(note.hidden_until) <= Date.now());

    if (!isAdmin && !isOwner && !(note.status === 'approved' && isVisible)) {
      return jsonResponse(req, { error: 'Bu nota erişim yetkiniz yok.' }, 403);
    }

    if (note.has_password && !isAdmin && !isOwner) {
      const { data: unlock } = await admin
        .from('note_password_unlocks')
        .select('expires_at')
        .eq('note_id', noteId)
        .eq('user_id', user.id)
        .maybeSingle();
      if (!unlock?.expires_at || Date.parse(unlock.expires_at) <= Date.now()) {
        return jsonResponse(req, { error: 'Bu not şifre korumalıdır. Önce şifreyi doğrulayın.', code: 'PASSWORD_REQUIRED' }, 403);
      }
    }

    // Server-side quota enforcement on download (owners & admins exempt)
    if (mode === 'download' && !isAdmin && !isOwner) {
      const { data: existingDl } = await admin
        .from('note_downloads')
        .select('id')
        .eq('note_id', noteId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (!existingDl) {
        const { data: quotaRows, error: quotaErr } = await admin.rpc('get_download_quota', {
          _user_id: user.id,
        });
        const quota = Array.isArray(quotaRows) ? quotaRows[0] : quotaRows;
        if (quotaErr || !quota || Number(quota.remaining ?? 0) <= 0) {
          return jsonResponse(
            req,
            { error: 'İndirme hakkınız doldu. Yeni not yükleyerek ek hak kazanabilirsiniz.', code: 'QUOTA_EXCEEDED' },
            403,
          );
        }
        await admin
          .from('note_downloads')
          .upsert({ note_id: noteId, user_id: user.id }, { onConflict: 'note_id,user_id', ignoreDuplicates: true });
      }
    }

    // Normalize & validate storage path strictly inside note.user_id/
    let cleanPath = String(note.file_url).trim().split('?')[0].split('#')[0];
    if (/^https?:\/\//i.test(cleanPath)) {
      const m = cleanPath.match(/\/storage\/v1\/object\/(?:(?:public|sign|authenticated)\/)?notes\/(.+)$/i);
      cleanPath = m?.[1] ? decodeURIComponent(m[1]) : '';
    }
    cleanPath = cleanPath.replace(/^\/+/, '').replace(/^notes\/+/i, '');

    if (
      !cleanPath ||
      cleanPath.includes('..') ||
      !cleanPath.startsWith(`${note.user_id}/`) ||
      /\.(html?|svg|xhtml|xml|js|mjs|cjs|php|exe)$/i.test(cleanPath)
    ) {
      return jsonResponse(req, { error: 'Dosya yolu doğrulanamadı.' }, 400);
    }

    const ttlSeconds = mode === 'preview' ? 300 : 180;
    const { data: signed, error: signErr } = await admin.storage
      .from(NOTES_BUCKET)
      .createSignedUrl(cleanPath, ttlSeconds);

    if (signErr || !signed?.signedUrl) {
      return jsonResponse(req, { error: 'Dosya erişim bağlantısı oluşturulamadı.' }, 502);
    }

    return jsonResponse(req, {
      signedUrl: signed.signedUrl,
      expiresIn: ttlSeconds,
      fileName: note.file_name || 'not.pdf',
      fileType: note.file_type || null,
    });
  } catch (e) {
    if (e instanceof RequestError) return jsonResponse(req, { error: e.message }, e.status);
    console.error('download-note failed');
    return jsonResponse(req, { error: 'Dosya indirme işlemi başarısız oldu.' }, 500);
  }
});
