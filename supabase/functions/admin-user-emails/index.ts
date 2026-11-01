import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader.startsWith('Bearer ')) return json({ error: 'Yetkisiz.' }, 401);

    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
    );

    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json({ error: 'Oturum geçersiz.' }, 401);

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    const { data: isAdmin } = await admin.rpc('is_admin', { _user_id: userData.user.id });
    if (!isAdmin) return json({ error: 'Bu işlem için yönetici yetkisi gerekir.' }, 403);

    const users: { id: string; email: string | null; created_at: string; confirmed: boolean; provider: string }[] = [];
    for (let page = 1; page <= 20; page++) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
      if (error) return json({ error: error.message }, 500);
      for (const u of data.users) {
        const identityEmail = u.identities
          ?.map((identity) => identity.identity_data?.email)
          .find((email): email is string => typeof email === 'string' && email.trim().length > 0);
        const metadataEmail = u.user_metadata?.email;
        users.push({
          id: u.id,
          email: u.email ?? identityEmail ?? (typeof metadataEmail === 'string' ? metadataEmail : null),
          created_at: u.created_at,
          confirmed: Boolean(u.email_confirmed_at ?? u.confirmed_at),
          provider: (u.app_metadata?.provider as string) ?? 'email',
        });
      }
      if (data.users.length < 200) break;
    }

    return json({ users });
  } catch (e) {
    console.error('admin-user-emails error', e);
    return json({ error: e instanceof Error ? e.message : 'Bilinmeyen hata.' }, 500);
  }
});
