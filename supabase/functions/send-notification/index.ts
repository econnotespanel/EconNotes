import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  getAuthenticatedUser,
  isTrustedOrigin,
  jsonResponse,
  preflightResponse,
  readJsonBody,
  RequestError,
} from '../_shared/request-security.ts';

const ONESIGNAL_APP_ID = 'ce5179d9-cf07-4115-b29a-a7d73713818d';

interface NotificationPayload {
  title: string;
  content: string;
  url?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflightResponse(req);
  if (!isTrustedOrigin(req.headers.get('origin'))) {
    return jsonResponse(req, { error: 'Bu kaynaktan isteğe izin verilmiyor.' }, 403);
  }
  if (req.method !== 'POST') return jsonResponse(req, { error: 'Yalnızca POST desteklenir.' }, 405);

  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return jsonResponse(req, { error: 'Giriş yapmalısınız.' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('Supabase admin environment is not configured.');
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: isAdmin, error: roleError } = await adminClient.rpc('is_admin', { _user_id: user.id });
    if (roleError || !isAdmin) {
      return jsonResponse(req, { error: 'Bu işlem için yönetici yetkisi gerekir.' }, 403);
    }

    const body = await readJsonBody<NotificationPayload>(req, 100_000);
    if (!body?.title || !body?.content) {
      throw new RequestError('Başlık ve içerik zorunludur.', 400);
    }

    const restApiKey = Deno.env.get('ONESIGNAL_REST_API_KEY');
    if (!restApiKey) {
      console.warn('ONESIGNAL_REST_API_KEY is not configured on server.');
      return jsonResponse(req, { success: false, reason: 'ONESIGNAL_REST_API_KEY not configured' }, 200);
    }

    const cleanContent = String(body.content).replace(/<[^>]*>/g, '').trim().slice(0, 180);
    const targetUrl = body.url || 'https://econnotes.online/announcements';

    const response = await fetch('https://api.onesignal.com/notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Key ${restApiKey}`,
      },
      body: JSON.stringify({
        app_id: ONESIGNAL_APP_ID,
        included_segments: ['Total Subscriptions', 'Active Subscriptions'],
        headings: { tr: body.title, en: body.title },
        contents: { tr: cleanContent, en: cleanContent },
        url: targetUrl,
        chrome_web_icon: 'https://econnotes.online/icons/icon-192x192.png',
        chrome_web_badge: 'https://econnotes.online/icons/icon-192x192.png',
        firefox_icon: 'https://econnotes.online/icons/icon-192x192.png',
      }),
    });

    const data = await response.json();
    return jsonResponse(req, { success: Boolean(data && !data.errors), data });
  } catch (error) {
    if (error instanceof RequestError) return jsonResponse(req, { error: error.message }, error.status);
    console.error('send-notification request failed:', error);
    return jsonResponse(req, { error: 'Bildirim gönderilemedi.' }, 500);
  }
});
