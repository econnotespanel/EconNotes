import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { getAuthenticatedUser } from '../_shared/request-security.ts';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

/** Clears the one-time-password flag after the signed-in user set a new password. */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.match(/^Bearer\s+(\S+)$/i)?.[1];
    if (!token) return json({ error: 'Yetkisiz.' }, 401);

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const authUser = await getAuthenticatedUser(req);
    let meUser = authUser?.id
      ? (await admin.auth.admin.getUserById(authUser.id)).data.user
      : null;
    if (!meUser) {
      const { data: me } = await admin.auth.getUser(token);
      meUser = me?.user ?? null;
    }
    if (!meUser) return json({ error: 'Oturum geçersiz.' }, 401);

    const meta = { ...(meUser.app_metadata || {}) } as Record<string, unknown>;
    if (!meta.must_change_password) return json({ ok: true });
    // Only clear when the password was actually changed after the flag was set.
    const changedRecently = meUser.updated_at && Date.now() - new Date(meUser.updated_at).getTime() < 10 * 60 * 1000;
    if (!changedRecently) return json({ error: 'Önce yeni şifre belirleyin.' }, 400);
    meta.must_change_password = false;
    const userMeta = { ...(meUser.user_metadata || {}) } as Record<string, unknown>;
    userMeta.must_change_password = false;
    const { error: upErr } = await admin.auth.admin.updateUserById(meUser.id, { app_metadata: meta, user_metadata: userMeta });
    if (upErr) return json({ error: 'İşlem tamamlanamadı.', details: upErr.message }, 500);
    return json({ ok: true });
  } catch (e) {
    return json({ error: 'Beklenmeyen hata.', details: String(e) }, 500);
  }
});
