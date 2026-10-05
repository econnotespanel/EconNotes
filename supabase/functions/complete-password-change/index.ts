import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

/** Clears the one-time-password flag after the signed-in user set a new password. */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader.startsWith('Bearer ')) return json({ error: 'Yetkisiz.' }, 401);
    const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } }, auth: { persistSession: false },
    });
    const { data: me, error } = await userClient.auth.getUser();
    if (error || !me.user) return json({ error: 'Oturum geçersiz.' }, 401);

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const meta = { ...(me.user.app_metadata || {}) } as Record<string, unknown>;
    if (!meta.must_change_password) return json({ ok: true });
    // Only clear when the password was actually changed after the flag was set.
    const changedRecently = me.user.updated_at && Date.now() - new Date(me.user.updated_at).getTime() < 10 * 60 * 1000;
    if (!changedRecently) return json({ error: 'Önce yeni şifre belirleyin.' }, 400);
    meta.must_change_password = false;
    const { error: upErr } = await admin.auth.admin.updateUserById(me.user.id, { app_metadata: meta });
    if (upErr) return json({ error: 'İşlem tamamlanamadı.', details: upErr.message }, 500);
    return json({ ok: true });
  } catch (e) {
    return json({ error: 'Beklenmeyen hata.', details: String(e) }, 500);
  }
});
