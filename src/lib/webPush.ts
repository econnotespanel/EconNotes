import { supabase } from '@/integrations/supabase/client';

const VAPID_PUBLIC_KEY = (
  import.meta.env.VITE_WEB_PUSH_VAPID_PUBLIC_KEY
  || 'BGW2d--X9DChd5IMttdOmG2Beo48Nu-zLAOqjr1dmDQVbxOBaBU6sLe_lHDyVeEZOex3pv-tO73KSzxHEblZqcI'
) as string;

const decodeBase64Url = (value: string) => {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
};

export const subscribeToWebPush = async (userId: string) => {
  if (!VAPID_PUBLIC_KEY) throw new Error('Web Push anahtarı yapılandırılmamış.');
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) throw new Error('Bu tarayıcı Web Push desteklemiyor.');
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: decodeBase64Url(VAPID_PUBLIC_KEY),
  });
  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) throw new Error('Web Push aboneliği eksik oluşturuldu.');
  const { error } = await supabase.from('web_push_subscriptions').upsert({
    user_id: userId,
    endpoint: json.endpoint,
    p256dh: json.keys.p256dh,
    auth: json.keys.auth,
    user_agent: navigator.userAgent,
  }, { onConflict: 'endpoint' });
  if (error) throw error;
  return subscription;
};

export const removeWebPushSubscription = async (userId: string) => {
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (subscription) {
    await supabase.from('web_push_subscriptions').delete().eq('user_id', userId).eq('endpoint', subscription.endpoint);
    await subscription.unsubscribe();
  }
};
