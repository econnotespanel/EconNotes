import { createClient } from 'npm:@supabase/supabase-js@2';
import { purgeUser, serviceClient } from '../_shared/purge-user.ts';
import {
  enforceRateLimit,
  getAuthenticatedUser,
  isTrustedOrigin,
  jsonResponse,
  preflightResponse,
  readJsonBody,
  RequestError,
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
    const currentUser = await getAuthenticatedUser(req);
    if (!currentUser?.id || !currentUser?.email) {
      return jsonResponse(req, { error: 'Oturum geçersiz.' }, 401);
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
    const admin = serviceClient();

    // Prevent brute-force guessing on the 6-digit account deletion OTP
    await enforceRateLimit(
      admin,
      `delete_account_otp:${currentUser.id}`,
      5,
      900,
      'Çok fazla doğrulama denemesi. Lütfen 15 dakika sonra tekrar deneyin.',
    );

    const { data: isAdmin } = await admin.rpc('is_admin', { _user_id: currentUser.id });
    if (isAdmin) {
      return jsonResponse(req, { error: 'Yönetici hesapları self-servis silinemez.' }, 403);
    }

    const body = await readJsonBody<{ code?: unknown }>(req, 4_096);
    const code = typeof body.code === 'string' ? body.code.trim() : '';
    if (!/^\d{6}$/.test(code)) {
      return jsonResponse(req, { error: 'Doğrulama kodu 6 haneli olmalıdır.' }, 400);
    }

    // Validate the one-time code that was e-mailed to the account owner.
    const verifier = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: otpError } = await verifier.auth.verifyOtp({
      email: currentUser.email,
      token: code,
      type: 'email',
    });
    if (otpError) {
      return jsonResponse(req, { error: 'Doğrulama kodu geçersiz veya süresi dolmuş.' }, 400);
    }

    const deletedId = currentUser.id;
    await purgeUser(admin, deletedId);

    // Record anonymized audit trail AFTER purge so purgeUser never deletes the audit log itself!
    await admin
      .from('activity_logs')
      .insert({
        user_id: '00000000-0000-0000-0000-000000000000',
        user_name: 'Sistem (Self-Servis)',
        user_email: '',
        action: 'user_self_deleted',
        details: `Kullanıcı doğrulama kodu ile hesabını kalıcı olarak sildi (${deletedId})`,
        entity_type: 'user',
        entity_id: deletedId,
      })
      .catch(() => {});

    return jsonResponse(req, { success: true });
  } catch (e) {
    if (e instanceof RequestError) return jsonResponse(req, { error: e.message }, e.status);
    console.error('delete-my-account error');
    return jsonResponse(req, { error: 'Hesap silme işlemi tamamlanamadı.' }, 500);
  }
});
