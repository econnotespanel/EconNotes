import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  enforceRateLimit,
  getAuthenticatedUser,
  isTrustedOrigin,
  jsonResponse,
  preflightResponse,
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
    const actor = await getAuthenticatedUser(req);
    if (!actor?.id) return jsonResponse(req, { error: 'Oturum geçersiz.' }, 401);

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    const { data: isAdmin } = await admin.rpc('is_admin', { _user_id: actor.id });
    if (!isAdmin) return jsonResponse(req, { error: 'Bu işlem için yönetici yetkisi gerekir.' }, 403);

    await enforceRateLimit(admin, `admin_user_emails:${actor.id}`, 12, 300);

    const users: {
      id: string;
      email: string | null;
      created_at: string;
      last_sign_in_at: string | null;
      confirmed: boolean;
      provider: string;
      providers: string[];
    }[] = [];

    for (let page = 1; page <= 20; page++) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
      if (error) {
        console.error('admin-user-emails listUsers failed');
        return jsonResponse(req, { error: 'Kullanıcı listesi alınamadı.' }, 500);
      }
      for (const u of data.users) {
        const identityEmail = u.identities
          ?.map((identity) => identity.identity_data?.email)
          .find((email): email is string => typeof email === 'string' && email.trim().length > 0);

        const identitySignIn =
          u.identities
            ?.map((identity) => identity.last_sign_in_at)
            .filter((ts): ts is string => typeof ts === 'string' && ts.length > 0)
            .sort()
            .at(-1) ?? null;

        const bestSignIn =
          [u.last_sign_in_at, identitySignIn]
            .filter((ts): ts is string => typeof ts === 'string' && ts.length > 0)
            .sort()
            .at(-1) ?? null;

        const rawProviders = Array.isArray(u.app_metadata?.providers)
          ? (u.app_metadata.providers as string[])
          : [];
        const identityProviders = (u.identities ?? [])
          .map((identity) => identity.provider)
          .filter((p): p is string => typeof p === 'string' && p.length > 0);
        const primaryProvider = (u.app_metadata?.provider as string) ?? 'email';
        const providers = Array.from(new Set([...rawProviders, ...identityProviders, primaryProvider]));

        // SECURITY: Never trust client-writable user_metadata.email
        users.push({
          id: u.id,
          email: u.email ?? identityEmail ?? null,
          created_at: u.created_at,
          last_sign_in_at: bestSignIn,
          confirmed: Boolean(u.email_confirmed_at ?? u.confirmed_at),
          provider: primaryProvider,
          providers,
        });
      }
      if (data.users.length < 200) break;
    }

    return jsonResponse(req, { users });
  } catch (e) {
    if (e instanceof RequestError) return jsonResponse(req, { error: e.message }, e.status);
    console.error('admin-user-emails error');
    return jsonResponse(req, { error: 'Kullanıcı listesi alınamadı.' }, 500);
  }
});
