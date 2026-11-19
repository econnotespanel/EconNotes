import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { purgeUser, serviceClient } from '../_shared/purge-user.ts';
import { getAuthenticatedUser } from '../_shared/request-security.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.match(/^Bearer\s+(\S+)$/i)?.[1];
    if (!token) return json({ error: 'Yetkisiz.' }, 401);

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
    const admin = serviceClient();

    const authUser = await getAuthenticatedUser(req);
    let currentUser = authUser?.id
      ? (await admin.auth.admin.getUserById(authUser.id)).data.user
      : null;
    if (!currentUser) {
      const { data: userData } = await admin.auth.getUser(token);
      currentUser = userData?.user ?? null;
    }
    if (!currentUser?.email) return json({ error: 'Oturum geçersiz.' }, 401);

    const body = await req.json().catch(() => ({}));
    const code: unknown = body?.code;
    if (typeof code !== 'string' || !/^\d{6}$/.test(code.trim())) {
      return json({ error: 'Doğrulama kodu 6 haneli olmalıdır.' }, 400);
    }

    // Validate the one-time code that was e-mailed to the account owner.
    const verifier = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
    const { error: otpError } = await verifier.auth.verifyOtp({
      email: currentUser.email,
      token: code.trim(),
      type: 'email',
    });
    if (otpError) {
      return json({ error: 'Doğrulama kodu geçersiz veya süresi dolmuş.' }, 400);
    }

    await admin.from('activity_logs').insert({
      user_id: currentUser.id,
      user_name: currentUser.user_metadata?.full_name ?? '',
      user_email: currentUser.email,
      action: 'user_deleted',
      details: 'Kullanıcı hesabını doğrulama kodu ile kalıcı olarak sildi',
      entity_type: 'user',
      entity_id: currentUser.id,
    });

    await purgeUser(admin, currentUser.id);

    return json({ success: true });
  } catch (e) {
    console.error('delete-my-account error', e);
    return json({ error: e instanceof Error ? e.message : 'Bilinmeyen hata.' }, 500);
  }
});
