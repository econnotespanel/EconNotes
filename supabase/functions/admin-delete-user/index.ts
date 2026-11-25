import { purgeUser, serviceClient } from '../_shared/purge-user.ts';
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflightResponse(req);
  if (!isTrustedOrigin(req.headers.get('origin'))) {
    return jsonResponse(req, { error: 'Bu kaynaktan isteğe izin verilmiyor.' }, 403);
  }
  if (req.method !== 'POST') {
    return jsonResponse(req, { error: 'Yalnızca POST desteklenir.' }, 405);
  }

  try {
    const actor = await getAuthenticatedUser(req);
    if (!actor?.id) return jsonResponse(req, { error: 'Oturum geçersiz.' }, 401);

    const admin = serviceClient();
    const { data: isAdmin } = await admin.rpc('is_admin', { _user_id: actor.id });
    if (!isAdmin) return jsonResponse(req, { error: 'Bu işlem için yönetici yetkisi gerekir.' }, 403);

    await enforceRateLimit(admin, `admin_delete_user:${actor.id}`, 10, 600);

    const body = await readJsonBody<{ userId?: unknown }>(req, 4_096);
    const targetId = typeof body.userId === 'string' ? body.userId.trim() : '';
    if (!STRICT_UUID_RE.test(targetId)) {
      return jsonResponse(req, { error: 'Geçersiz kullanıcı.' }, 400);
    }
    if (targetId === actor.id) {
      return jsonResponse(req, { error: 'Kendi hesabınızı buradan silemezsiniz.' }, 400);
    }

    const { data: targetIsAdmin } = await admin.rpc('is_admin', { _user_id: targetId });
    if (targetIsAdmin) return jsonResponse(req, { error: 'Yönetici hesapları silinemez.' }, 400);

    await purgeUser(admin, targetId);

    await admin.from('activity_logs').insert({
      user_id: actor.id,
      user_name: (actor.user_metadata?.full_name as string) ?? 'Yönetici',
      user_email: actor.email ?? '',
      action: 'user_deleted',
      details: `Kullanıcı hesabı kalıcı olarak silindi (${targetId})`,
      entity_type: 'user',
      entity_id: targetId,
    });

    return jsonResponse(req, { success: true });
  } catch (e) {
    if (e instanceof RequestError) return jsonResponse(req, { error: e.message }, e.status);
    console.error('admin-delete-user error');
    return jsonResponse(req, { error: 'Kullanıcı silinirken bir hata oluştu.' }, 500);
  }
});
