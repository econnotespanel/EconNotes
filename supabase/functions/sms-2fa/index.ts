import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  enforceRateLimit,
  extractVerifiedSessionId,
  getAuthenticatedUser,
  isTrustedOrigin,
  jsonResponse,
  preflightResponse,
  readJsonBody,
  RequestError,
} from '../_shared/request-security.ts';

const VERIFY_SID = Deno.env.get('TWILIO_VERIFY_SID') || 'VA99637792ed6e264c3cf175b69231ae76';
const GATEWAY = `https://connector-gateway.lovable.dev/twilio/verify/v2/Services/${VERIFY_SID}`;

type Body = { action?: string; phone?: string; code?: string };

const twilio = async (path: string, params: Record<string, string>) => {
  const lovableKey = Deno.env.get('LOVABLE_API_KEY');
  const twilioKey = Deno.env.get('TWILIO_API_KEY');
  if (!lovableKey || !twilioKey) throw new RequestError('SMS servisi yapılandırılmadı.', 503);
  const res = await fetch(`${GATEWAY}/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      'X-Connection-Api-Key': twilioKey,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(params),
    signal: AbortSignal.timeout(15_000),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`Twilio ${path} failed [${res.status}]`);
    throw new RequestError(
      res.status === 429
        ? 'Çok fazla SMS doğrulama isteği gönderildi. Lütfen biraz bekleyin.'
        : 'SMS doğrulama servisi isteği reddetti.',
      res.status === 429 ? 429 : 502,
    );
  }
  return JSON.parse(text);
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
    // Strictly validate active (non-revoked) session via auth.getUser(token)
    const user = await getAuthenticatedUser(req);
    if (!user?.id) return jsonResponse(req, { error: 'Giriş yapmalısınız.' }, 401);

    const userId = user.id;
    const sessionId = extractVerifiedSessionId(req);
    if (!sessionId) return jsonResponse(req, { error: 'Oturum bilgisi okunamadı.' }, 400);

    const url = Deno.env.get('SUPABASE_URL')!;
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const body = await readJsonBody<Body>(req, 2_000);
    const code = String(body.code ?? '');

    const isSession2faVerified = async (): Promise<boolean> => {
      const { data } = await admin
        .from('sms_2fa_sessions')
        .select('session_id')
        .eq('session_id', sessionId)
        .eq('user_id', userId)
        .maybeSingle();
      return Boolean(data?.session_id);
    };

    const getExistingPhone = async (): Promise<string | null> => {
      const { data } = await admin.from('sms_2fa').select('phone').eq('user_id', userId).maybeSingle();
      return typeof data?.phone === 'string' && data.phone ? data.phone : null;
    };

    const getStoredPhoneOrThrow = async (): Promise<string> => {
      const phone = await getExistingPhone();
      if (!phone) throw new RequestError('Kayıtlı telefon bulunamadı.', 400);
      return phone;
    };

    const assertCanModifyEnrollment = async () => {
      const existing = await getExistingPhone();
      if (!existing) return; // Initial enrollment allowed
      // CRITICAL SECURITY GUARD: Once SMS 2FA is enrolled, an unverified session can NEVER
      // overwrite the victim's 2FA phone or self-approve its own session!
      const verified = await isSession2faVerified();
      if (!verified) {
        throw new RequestError(
          'Mevcut SMS doğrulamasını değiştirmek için önce kayıtlı numaranızla oturumunuzu doğrulamalısınız.',
          403,
        );
      }
    };

    const checkCode = async (phone: string) => {
      await enforceRateLimit(
        admin,
        `sms_2fa_check:${userId}`,
        8,
        900,
        'Çok fazla hatalı kod denemesi. Lütfen 15 dakika sonra tekrar deneyin.',
      );
      if (!/^\d{4,8}$/.test(code)) throw new RequestError('Kod geçersiz.', 400);
      const r = await twilio('VerificationCheck', { To: phone, Code: code });
      if (r.status !== 'approved') throw new RequestError('Kod hatalı veya süresi doldu.', 400);
      const { error: sessErr } = await admin
        .from('sms_2fa_sessions')
        .upsert({ session_id: sessionId, user_id: userId });
      if (sessErr) throw new RequestError('Oturum doğrulama kaydı oluşturulamadı.', 500);
    };

    switch (body.action) {
      case 'enroll_send': {
        await assertCanModifyEnrollment();
        const phone = String(body.phone ?? '').trim();
        if (!/^\+90\d{10}$/.test(phone)) {
          throw new RequestError('Telefonu +905xxxxxxxxx biçiminde girin.', 400);
        }
        await enforceRateLimit(
          admin,
          `sms_send_user:${userId}`,
          5,
          900,
          'Çok fazla SMS kodu istendi. Lütfen 15 dakika sonra tekrar deneyin.',
        );
        await enforceRateLimit(
          admin,
          `sms_send_phone:${phone}`,
          4,
          900,
          'Bu telefon numarasına kısa sürede çok fazla doğrulama kodu gönderildi.',
        );
        await twilio('Verifications', { To: phone, Channel: 'sms', Locale: 'tr' });
        return jsonResponse(req, { success: true });
      }
      case 'enroll_confirm': {
        await assertCanModifyEnrollment();
        const phone = String(body.phone ?? '').trim();
        if (!/^\+90\d{10}$/.test(phone)) throw new RequestError('Telefon geçersiz.', 400);
        await checkCode(phone);
        const { error: enrollErr } = await admin
          .from('sms_2fa')
          .upsert({ user_id: userId, phone });
        if (enrollErr) throw new RequestError('SMS 2FA kaydı tamamlanamadı.', 500);
        return jsonResponse(req, { success: true });
      }
      case 'login_send': {
        const phone = await getStoredPhoneOrThrow();
        await enforceRateLimit(
          admin,
          `sms_send_user:${userId}`,
          5,
          900,
          'Çok fazla SMS kodu istendi. Lütfen biraz bekleyin.',
        );
        await twilio('Verifications', { To: phone, Channel: 'sms', Locale: 'tr' });
        return jsonResponse(req, { success: true });
      }
      case 'login_check': {
        await checkCode(await getStoredPhoneOrThrow());
        return jsonResponse(req, { success: true });
      }
      case 'disable': {
        // Server-side guard: requires currently verified 2FA session & prevents admin from removing sole MFA
        await assertCanModifyEnrollment();
        const { data: isAdmin } = await admin.rpc('is_admin', { _user_id: userId });
        if (isAdmin) {
          const { data: factors } = await admin.auth.admin.mfa.listFactors({ userId }).catch(() => ({ data: null }));
          const hasVerifiedTotp = Boolean(
            factors?.factors?.some((f: { factor_type?: string; status?: string }) => f.factor_type === 'totp' && f.status === 'verified'),
          );
          if (!hasVerifiedTotp) {
            throw new RequestError('Yönetici hesaplarında en az bir doğrulama yöntemi aktif kalmalıdır.', 400);
          }
        }
        const { error: delErr } = await admin.from('sms_2fa').delete().eq('user_id', userId);
        if (delErr) throw new RequestError('SMS 2FA kaldırılamadı.', 500);
        await admin.from('sms_2fa_sessions').delete().eq('user_id', userId);
        return jsonResponse(req, { success: true });
      }
      default:
        throw new RequestError('Geçersiz işlem.', 400);
    }
  } catch (error) {
    if (error instanceof RequestError) return jsonResponse(req, { error: error.message }, error.status);
    console.error('sms-2fa failed');
    return jsonResponse(req, { error: 'SMS doğrulaması yapılamadı.' }, 500);
  }
});
