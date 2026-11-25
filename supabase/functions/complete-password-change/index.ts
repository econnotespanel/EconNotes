import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  enforceRateLimit,
  getAuthenticatedUser,
  isTrustedOrigin,
  jsonResponse,
  preflightResponse,
  readJsonBody,
  RequestError,
} from '../_shared/request-security.ts';

type Body = { newPassword?: string };

/**
 * Atomically sets the user's new strong password AND clears `app_metadata.must_change_password`
 * server-side so the forced password change gate can NEVER be bypassed via metadata updates.
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
    const authUser = await getAuthenticatedUser(req);
    if (!authUser?.id) return jsonResponse(req, { error: 'Oturum geçersiz.' }, 401);

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    await enforceRateLimit(
      admin,
      `complete_pw_change:${authUser.id}`,
      8,
      900,
      'Çok fazla şifre değişikliği denemesi. Lütfen biraz bekleyin.',
    );

    const { data: userLookup, error: lookupErr } = await admin.auth.admin.getUserById(authUser.id);
    const meUser = userLookup?.user ?? null;
    if (lookupErr || !meUser) return jsonResponse(req, { error: 'Oturum geçersiz.' }, 401);

    const appMeta = { ...(meUser.app_metadata || {}) } as Record<string, unknown>;
    if (!appMeta.must_change_password) {
      return jsonResponse(req, { ok: true });
    }

    const body = await readJsonBody<Body>(req, 4_096);
    const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';
    if (newPassword.length < 8 || newPassword.length > 128) {
      return jsonResponse(req, { error: 'Yeni şifre en az 8, en fazla 128 karakter olmalıdır.' }, 400);
    }
    if (!/[A-Z]/.test(newPassword) || !/\d/.test(newPassword)) {
      return jsonResponse(req, { error: 'Yeni şifre en az 1 büyük harf ve 1 rakam içermelidir.' }, 400);
    }

    appMeta.must_change_password = false;
    const userMeta = { ...(meUser.user_metadata || {}) } as Record<string, unknown>;
    userMeta.must_change_password = false;

    const { error: upErr } = await admin.auth.admin.updateUserById(meUser.id, {
      password: newPassword,
      app_metadata: appMeta,
      user_metadata: userMeta,
    });
    if (upErr) {
      console.error('complete-password-change update failed');
      return jsonResponse(req, { error: 'Şifre güncellenemedi. Lütfen tekrar deneyin.' }, 500);
    }

    return jsonResponse(req, { ok: true });
  } catch (e) {
    if (e instanceof RequestError) return jsonResponse(req, { error: e.message }, e.status);
    console.error('complete-password-change failed');
    return jsonResponse(req, { error: 'Beklenmeyen bir hata oluştu.' }, 500);
  }
});
