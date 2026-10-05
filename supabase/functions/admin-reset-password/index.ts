import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const makePassword = () => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  let out = '';
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out.slice(0, 4) + '-' + out.slice(4, 8) + '-' + out.slice(8) + '7';
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader.startsWith('Bearer ')) return json({ error: 'Yetkisiz.' }, 401);
    const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } }, auth: { persistSession: false },
    });
    const { data: me, error: meErr } = await userClient.auth.getUser();
    if (meErr || !me.user) return json({ error: 'Oturum geçersiz.' }, 401);

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: isAdmin } = await admin.rpc('is_admin', { _user_id: me.user.id });
    if (!isAdmin) return json({ error: 'Bu işlem için yönetici yetkisi gerekir.' }, 403);

    const body = await req.json().catch(() => ({}));
    const userId = typeof body?.user_id === 'string' ? body.user_id : '';
    if (!UUID.test(userId)) return json({ error: 'Geçersiz kullanıcı.' }, 400);

    const { data: target, error: tErr } = await admin.auth.admin.getUserById(userId);
    if (tErr || !target.user) return json({ error: 'Kullanıcı bulunamadı.' }, 404);

    const tempPassword = makePassword();
    const { error: upErr } = await admin.auth.admin.updateUserById(userId, {
      password: tempPassword,
      app_metadata: { ...(target.user.app_metadata || {}), must_change_password: true },
    });
    if (upErr) return json({ error: 'Parola oluşturulamadı.', details: upErr.message }, 500);

    // Revoke existing sessions so the old password/session cannot be reused.
    await admin.auth.admin.signOut(userId, 'global').catch(() => {});

    await admin.from('activity_logs').insert({
      user_id: me.user.id, user_name: 'Yönetici', user_email: me.user.email ?? '',
      action: 'admin_temp_password', details: 'Kullanıcıya tek kullanımlık parola tanımlandı', entity_type: 'user', entity_id: userId,
    });

    return json({ temp_password: tempPassword, email: target.user.email });
  } catch (e) {
    return json({ error: 'Beklenmeyen hata.', details: String(e) }, 500);
  }
});
