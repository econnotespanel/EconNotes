import { createClient } from 'npm:@supabase/supabase-js@2';
import { isTrustedOrigin, jsonResponse, preflightResponse, readJsonBody, RequestError } from '../_shared/request-security.ts';

const VERIFY_SID = 'VA99637792ed6e264c3cf175b69231ae76';
const GATEWAY = 'https://connector-gateway.lovable.dev/twilio/verify/v2/Services/' + VERIFY_SID;

type Body = { action?: string; phone?: string; code?: string };

const twilio = async (path: string, params: Record<string, string>) => {
  const lovableKey = Deno.env.get('LOVABLE_API_KEY');
  const twilioKey = Deno.env.get('TWILIO_API_KEY');
  if (!lovableKey || !twilioKey) throw new Error('Twilio is not configured');
  const res = await fetch(`${GATEWAY}/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      'X-Connection-Api-Key': twilioKey,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(params),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`Twilio ${path} failed [${res.status}]: ${text}`);
    let msg = 'SMS servisi isteği reddetti.';
    try { const j = JSON.parse(text); if (j?.message) msg = j.message; } catch { /* ignore */ }
    throw new RequestError(msg, res.status === 429 ? 429 : 502);
  }
  return JSON.parse(text);
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflightResponse(req);
  if (!isTrustedOrigin(req.headers.get('origin'))) return jsonResponse(req, { error: 'Bu kaynaktan isteğe izin verilmiyor.' }, 403);
  if (req.method !== 'POST') return jsonResponse(req, { error: 'Yalnızca POST desteklenir.' }, 405);

  try {
    const token = req.headers.get('authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1];
    if (!token) return jsonResponse(req, { error: 'Giriş yapmalısınız.' }, 401);
    const url = Deno.env.get('SUPABASE_URL')!;
    const anon = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { auth: { persistSession: false } });
    const { data: claimsData, error: cErr } = await anon.auth.getClaims(token);
    const claims = claimsData?.claims as Record<string, unknown> | undefined;
    if (cErr || !claims?.sub) return jsonResponse(req, { error: 'Giriş yapmalısınız.' }, 401);
    const userId = String(claims.sub);
    const sessionId = String(claims.session_id ?? '');
    if (!/^[0-9a-f-]{36}$/i.test(sessionId)) return jsonResponse(req, { error: 'Oturum bilgisi okunamadı.' }, 400);

    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
    const body = await readJsonBody<Body>(req, 2_000);
    const code = String(body.code ?? '');

    const getStoredPhone = async () => {
      const { data } = await admin.from('sms_2fa').select('phone').eq('user_id', userId).maybeSingle();
      if (!data?.phone) throw new RequestError('Kayıtlı telefon bulunamadı.', 400);
      return data.phone as string;
    };
    const check = async (phone: string) => {
      if (!/^\d{4,8}$/.test(code)) throw new RequestError('Kod geçersiz.', 400);
      const r = await twilio('VerificationCheck', { To: phone, Code: code });
      if (r.status !== 'approved') throw new RequestError('Kod hatalı veya süresi doldu.', 400);
      await admin.from('sms_2fa_sessions').upsert({ session_id: sessionId, user_id: userId });
    };

    switch (body.action) {
      case 'enroll_send': {
        const phone = String(body.phone ?? '');
        if (!/^\+90\d{10}$/.test(phone)) throw new RequestError('Telefonu +905xxxxxxxxx biçiminde girin.', 400);
        await twilio('Verifications', { To: phone, Channel: 'sms', Locale: 'en' });
        return jsonResponse(req, { success: true });
      }
      case 'enroll_confirm': {
        const phone = String(body.phone ?? '');
        if (!/^\+90\d{10}$/.test(phone)) throw new RequestError('Telefon geçersiz.', 400);
        await check(phone);
        await admin.from('sms_2fa').upsert({ user_id: userId, phone });
        return jsonResponse(req, { success: true });
      }
      case 'login_send':
        await twilio('Verifications', { To: await getStoredPhone(), Channel: 'sms', Locale: 'en' });
        return jsonResponse(req, { success: true });
      case 'login_check':
        await check(await getStoredPhone());
        return jsonResponse(req, { success: true });
      default:
        throw new RequestError('Geçersiz işlem.', 400);
    }
  } catch (error) {
    if (error instanceof RequestError) return jsonResponse(req, { error: error.message }, error.status);
    console.error('sms-2fa failed:', error);
    return jsonResponse(req, { error: 'SMS doğrulaması yapılamadı.' }, 500);
  }
});
