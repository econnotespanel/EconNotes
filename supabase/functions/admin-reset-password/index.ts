import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { getAuthenticatedUser } from '../_shared/request-security.ts';

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
    const token = authHeader.match(/^Bearer\s+(\S+)$/i)?.[1];
    if (!token) return json({ error: 'Yetkisiz.' }, 401);

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    let actor = await getAuthenticatedUser(req);
    if (!actor?.id) {
      const { data: me } = await admin.auth.getUser(token);
      actor = me?.user ? { id: me.user.id, email: me.user.email } : null;
    }
    if (!actor?.id) return json({ error: 'Oturum geçersiz.' }, 401);

    const { data: isAdmin } = await admin.rpc('is_admin', { _user_id: actor.id });
    if (!isAdmin) return json({ error: 'Bu işlem için yönetici yetkisi gerekir.' }, 403);

    const body = await req.json().catch(() => ({}));
    const rawUserId = typeof body?.user_id === 'string' ? body.user_id : (typeof body?.userId === 'string' ? body.userId : '');
    const userId = rawUserId.trim();
    if (!UUID.test(userId)) return json({ error: 'Geçersiz kullanıcı kimliği.' }, 400);

    const { data: target, error: tErr } = await admin.auth.admin.getUserById(userId);
    if (tErr || !target.user) return json({ error: 'Kullanıcı bulunamadı.' }, 404);

    const tempPassword = makePassword();
    const { error: upErr } = await admin.auth.admin.updateUserById(userId, {
      password: tempPassword,
      app_metadata: { ...(target.user.app_metadata || {}), must_change_password: true },
      user_metadata: { ...(target.user.user_metadata || {}), must_change_password: true },
    });
    if (upErr) return json({ error: 'Parola oluşturulamadı.', details: upErr.message }, 500);

    // Revoke existing sessions so the old password/session cannot be reused.
    await admin.auth.admin.signOut(userId, 'global').catch(() => {});

    await admin.from('activity_logs').insert({
      user_id: actor.id, user_name: 'Yönetici', user_email: actor.email ?? '',
      action: 'admin_temp_password', details: 'Kullanıcıya tek kullanımlık parola tanımlandı', entity_type: 'user', entity_id: userId,
    });

    return json({ temp_password: tempPassword, email: target.user.email });
  } catch (e) {
    return json({ error: 'Beklenmeyen hata.', details: String(e) }, 500);
  }
});
