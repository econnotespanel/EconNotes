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

/** Cryptographically unbiased random temporary password generator */
const makePassword = (): string => {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  const alphabet = upper + lower + digits;

  const pick = (pool: string): string => {
    const limit = Math.floor(256 / pool.length) * pool.length;
    const buf = new Uint8Array(1);
    while (true) {
      crypto.getRandomValues(buf);
      if (buf[0] < limit) return pool[buf[0] % pool.length];
    }
  };

  const chars: string[] = [pick(upper), pick(lower), pick(digits)];
  while (chars.length < 12) chars.push(pick(alphabet));
  // Fisher-Yates shuffle
  for (let i = chars.length - 1; i > 0; i--) {
    const buf = new Uint8Array(1);
    const limit = Math.floor(256 / (i + 1)) * (i + 1);
    let r = 0;
    do {
      crypto.getRandomValues(buf);
      r = buf[0];
    } while (r >= limit);
    const j = r % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  const s = chars.join('');
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8)}`;
};

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

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    const { data: isAdmin } = await admin.rpc('is_admin', { _user_id: actor.id });
    if (!isAdmin) return jsonResponse(req, { error: 'Bu işlem için yönetici yetkisi gerekir.' }, 403);

    await enforceRateLimit(admin, `admin_reset_pw:${actor.id}`, 15, 600);

    const body = await readJsonBody<{ user_id?: unknown; userId?: unknown }>(req, 4_096);
    const rawUserId =
      typeof body.user_id === 'string'
        ? body.user_id
        : typeof body.userId === 'string'
        ? body.userId
        : '';
    const userId = rawUserId.trim();
    if (!STRICT_UUID_RE.test(userId)) {
      return jsonResponse(req, { error: 'Geçersiz kullanıcı kimliği.' }, 400);
    }

    // SECURITY GUARD: Block lateral admin-to-admin password reset takeover
    const { data: targetIsAdmin } = await admin.rpc('is_admin', { _user_id: userId });
    if (targetIsAdmin) {
      return jsonResponse(req, { error: 'Yönetici hesaplarının şifresi bu araçla sıfırlanamaz.' }, 403);
    }

    const { data: target, error: tErr } = await admin.auth.admin.getUserById(userId);
    if (tErr || !target.user) return jsonResponse(req, { error: 'Kullanıcı bulunamadı.' }, 404);

    const tempPassword = makePassword();
    const { error: upErr } = await admin.auth.admin.updateUserById(userId, {
      password: tempPassword,
      app_metadata: { ...(target.user.app_metadata || {}), must_change_password: true },
      user_metadata: { ...(target.user.user_metadata || {}), must_change_password: true },
    });
    if (upErr) {
      console.error('admin-reset-password update failed');
      return jsonResponse(req, { error: 'Parola oluşturulamadı.' }, 500);
    }

    // Revoke existing sessions so old password/JWT cannot be reused.
    await admin.auth.admin.signOut(userId, 'global').catch(() => {});

    await admin.from('activity_logs').insert({
      user_id: actor.id,
      user_name: 'Yönetici',
      user_email: actor.email ?? '',
      action: 'admin_temp_password',
      details: 'Kullanıcıya tek kullanımlık parola tanımlandı',
      entity_type: 'user',
      entity_id: userId,
    });

    return jsonResponse(req, { temp_password: tempPassword, email: target.user.email });
  } catch (e) {
    if (e instanceof RequestError) return jsonResponse(req, { error: e.message }, e.status);
    console.error('admin-reset-password failed');
    return jsonResponse(req, { error: 'Beklenmeyen bir hata oluştu.' }, 500);
  }
});
