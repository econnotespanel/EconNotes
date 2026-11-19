import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
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

    const admin = serviceClient();
    const authUser = await getAuthenticatedUser(req);
    let actor = authUser?.id
      ? (await admin.auth.admin.getUserById(authUser.id)).data.user
      : null;
    if (!actor) {
      const { data: userData } = await admin.auth.getUser(token);
      actor = userData?.user ?? null;
    }
    if (!actor) return json({ error: 'Oturum geçersiz.' }, 401);

    const { data: isAdmin } = await admin.rpc('is_admin', { _user_id: actor.id });
    if (!isAdmin) return json({ error: 'Bu işlem için yönetici yetkisi gerekir.' }, 403);

    const body = await req.json().catch(() => ({}));
    const targetId: unknown = body?.userId;
    if (typeof targetId !== 'string' || !/^[0-9a-f-]{36}$/i.test(targetId)) {
      return json({ error: 'Geçersiz kullanıcı.' }, 400);
    }
    if (targetId === actor.id) {
      return json({ error: 'Kendi hesabınızı buradan silemezsiniz.' }, 400);
    }

    const { data: targetIsAdmin } = await admin.rpc('is_admin', { _user_id: targetId });
    if (targetIsAdmin) return json({ error: 'Yönetici hesapları silinemez.' }, 400);

    await purgeUser(admin, targetId);

    await admin.from('activity_logs').insert({
      user_id: actor.id,
      user_name: actor.user_metadata?.full_name ?? 'Yönetici',
      user_email: actor.email ?? '',
      action: 'user_deleted',
      details: `Kullanıcı hesabı kalıcı olarak silindi (${targetId})`,
      entity_type: 'user',
      entity_id: targetId,
    });

    return json({ success: true });
  } catch (e) {
    console.error('admin-delete-user error', e);
    return json({ error: e instanceof Error ? e.message : 'Bilinmeyen hata.' }, 500);
  }
});
