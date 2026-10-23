import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, getAuthenticatedUser, jsonResponse, preflightResponse, readJsonBody } from '../_shared/request-security.ts';

type PushRequest = {
  announcementId: string;
  title: string;
  body: string;
  path?: string;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflightResponse(req);
  if (req.method !== 'POST') return jsonResponse(req, { error: 'Yalnızca POST desteklenir.' }, 405);

  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return jsonResponse(req, { error: 'Oturum geçersiz.' }, 401);

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { data: isAdmin } = await admin.rpc('is_admin', { _user_id: user.id });
    if (!isAdmin) return jsonResponse(req, { error: 'Yönetici yetkisi gerekir.' }, 403);

    const body = await readJsonBody<PushRequest>(req, 16_384);
    if (!body.announcementId || !body.title || !body.body) {
      return jsonResponse(req, { error: 'Duyuru bilgileri eksik.' }, 400);
    }

    const publicKey = Deno.env.get('WEB_PUSH_VAPID_PUBLIC_KEY');
    const privateKey = Deno.env.get('WEB_PUSH_VAPID_PRIVATE_KEY');
    const subject = Deno.env.get('WEB_PUSH_VAPID_SUBJECT') || 'mailto:admin@econnotes.online';
    if (!publicKey || !privateKey) {
      return jsonResponse(req, { error: 'Web Push VAPID anahtarları yapılandırılmamış.' }, 503);
    }
    webpush.setVapidDetails(subject, publicKey, privateKey);

    const { data: subscriptions, error } = await admin
      .from('web_push_subscriptions')
      .select('id, endpoint, p256dh, auth');
    if (error) throw error;

    const payload = JSON.stringify({
      title: `Yeni duyuru: ${body.title}`,
      body: body.body.slice(0, 180),
      tag: `announcement-${body.announcementId}`,
      path: body.path || '/announcements',
    });
    let delivered = 0;
    for (const subscription of subscriptions || []) {
      try {
        await webpush.sendNotification({
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        }, payload);
        delivered += 1;
      } catch (error) {
        const statusCode = (error as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await admin.from('web_push_subscriptions').delete().eq('id', subscription.id);
        } else {
          console.error('Web Push delivery failed:', error);
        }
      }
    }
    return jsonResponse(req, { delivered, total: subscriptions?.length || 0 });
  } catch (error) {
    console.error('send-web-push failed:', error);
    return jsonResponse(req, { error: error instanceof Error ? error.message : 'Bildirim gönderilemedi.' }, 500);
  }
});
