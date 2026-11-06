import { supabase } from '@/integrations/supabase/client';

declare global {
  interface Window {
    OneSignalDeferred?: Array<(OneSignal: any) => void | Promise<void>>;
    OneSignal?: any;
  }
}

export const ONESIGNAL_APP_ID = 'ce5179d9-cf07-4115-b29a-a7d73713818d';
export const ONESIGNAL_SAFARI_WEB_ID = 'web.onesignal.auto.3bb557bb-091e-4595-bac2-e40949e4ba5a';

export const initOneSignal = () => {
  if (typeof window === 'undefined') return;

  window.OneSignalDeferred = window.OneSignalDeferred || [];
  window.OneSignalDeferred.push(async function (OneSignal: any) {
    try {
      await OneSignal.init({
        appId: ONESIGNAL_APP_ID,
        safari_web_id: ONESIGNAL_SAFARI_WEB_ID,
        notifyButton: {
          enable: false,
        },
        allowLocalhostAsSecureOrigin: true,
      });

      // Auto-opt in if native browser permission is already granted
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        try {
          if (OneSignal.User?.PushSubscription?.optIn) {
            void OneSignal.User.PushSubscription.optIn();
          }
        } catch (subErr) {
          console.warn('OneSignal auto-optIn notice:', subErr);
        }
      }
    } catch (err) {
      console.warn('OneSignal init warning:', err);
    }
  });
};

export const requestOneSignalPermission = async (): Promise<boolean> => {
  if (typeof window === 'undefined') return false;

  let granted = false;

  // 1. Direct synchronous native browser permission request (preserves user tap gesture for iOS & Android)
  if ('Notification' in window) {
    try {
      let perm = Notification.permission;
      if (perm === 'default') {
        const req = Notification.requestPermission();
        if (req && typeof req.then === 'function') {
          perm = await req;
        } else {
          perm = await new Promise((res) => Notification.requestPermission(res));
        }
      }
      granted = perm === 'granted';
    } catch (e) {
      console.warn('Native requestPermission error:', e);
    }
  }

  // 2. Non-blocking OneSignal push subscription sync (runs in background without freezing UI)
  try {
    const triggerOptIn = async (OneSignal: any) => {
      try {
        if (OneSignal?.Notifications?.requestPermission) {
          void OneSignal.Notifications.requestPermission();
        }
        if (OneSignal?.User?.PushSubscription?.optIn) {
          await OneSignal.User.PushSubscription.optIn();
        }
      } catch (err) {
        console.warn('OneSignal optIn error:', err);
      }
    };

    if (window.OneSignal) {
      void triggerOptIn(window.OneSignal);
    } else {
      window.OneSignalDeferred = window.OneSignalDeferred || [];
      window.OneSignalDeferred.push(triggerOptIn);
    }
  } catch {}

  return granted || (typeof Notification !== 'undefined' && Notification.permission === 'granted');
};

export const sendOneSignalNotification = async (
  title: string,
  content: string,
  url: string = 'https://econnotes.online/announcements'
): Promise<{ success: boolean; reason?: string; recipients?: number }> => {
  try {
    const { data, error } = await supabase.functions.invoke('send-notification', {
      body: { title, content, url },
    });

    if (error) {
      console.warn('send-notification edge function error:', error);
      let reason = 'Bildirim servisine ulaşılamadı.';
      try {
        const ctx = (error as any)?.context;
        if (ctx && typeof ctx.json === 'function') {
          const body = await ctx.json();
          if (body?.error) reason = String(body.error);
        }
      } catch {}
      return { success: false, reason };
    }

    if (!data?.success) {
      const reason = data?.reason === 'ONESIGNAL_REST_API_KEY not configured'
        ? 'Bildirim anahtarı tanımlı değil.'
        : (data?.data?.errors?.[0] ?? 'Bildirim gönderilemedi.');
      return { success: false, reason: String(reason) };
    }

    return { success: true, recipients: data?.data?.recipients };
  } catch (error) {
    console.error('OneSignal push dispatch error:', error);
    return { success: false, reason: 'Bildirim gönderilemedi.' };
  }
};
