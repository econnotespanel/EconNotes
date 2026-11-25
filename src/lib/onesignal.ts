import { supabase } from '@/integrations/supabase/client';
import { DEVICE_NOTIFICATION_PREFERENCE } from '@/lib/deviceNotifications';

declare global {
  interface Window {
    OneSignalDeferred?: Array<(OneSignal: any) => void | Promise<void>>;
    OneSignal?: any;
  }
}

export const ONESIGNAL_APP_ID = 'ce5179d9-cf07-4115-b29a-a7d73713818d';
export const ONESIGNAL_SAFARI_WEB_ID = 'web.onesignal.auto.3bb557bb-091e-4595-bac2-e40949e4ba5a';

let initCalled = false;
let initializedOneSignal: any = null;
let initResolve: ((os: any | null) => void) | null = null;
const oneSignalReadyPromise: Promise<any | null> = new Promise((resolve) => {
  initResolve = resolve;
});

const hasAnyUserDisabledLocally = (): boolean => {
  if (typeof window === 'undefined') return false;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(`${DEVICE_NOTIFICATION_PREFERENCE}:`) && !k.endsWith('-cursor')) {
        if (localStorage.getItem(k) === 'false') return true;
      }
    }
  } catch {
    // ignore
  }
  return false;
};

export const waitForOneSignalReady = async (timeoutMs = 5000): Promise<any | null> => {
  if (initializedOneSignal) return initializedOneSignal;
  return Promise.race([
    oneSignalReadyPromise,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
  ]);
};

export const initOneSignal = () => {
  if (typeof window === 'undefined' || initCalled) return;
  initCalled = true;

  window.OneSignalDeferred = window.OneSignalDeferred || [];
  window.OneSignalDeferred.push(async function (OneSignal: any) {
    try {
      await OneSignal.init({
        appId: ONESIGNAL_APP_ID,
        safari_web_id: ONESIGNAL_SAFARI_WEB_ID,
        notifyButton: {
          enable: false,
        },
        serviceWorkerPath: 'OneSignalSDKWorker.js',
        serviceWorkerParam: { scope: '/' },
        allowLocalhostAsSecureOrigin: import.meta.env.DEV,
      });

      initializedOneSignal = OneSignal;
      initResolve?.(OneSignal);

      // Auto-opt-in if native browser permission is already granted and user has not disabled locally
      if (
        typeof Notification !== 'undefined' &&
        Notification.permission === 'granted' &&
        !hasAnyUserDisabledLocally()
      ) {
        try {
          if (OneSignal.User?.PushSubscription?.optIn) {
            await OneSignal.User.PushSubscription.optIn();
          }
        } catch (subErr) {
          console.warn('OneSignal auto-optIn notice:', subErr);
        }
      }
    } catch (err) {
      console.warn('OneSignal init warning:', err);
      initResolve?.(null);
    }
  });
};

/**
 * Syncs OneSignal Web Push subscription state (opt-in / opt-out + optional external user ID)
 * strictly AFTER OneSignal.init() has finished so v16 never drops the subscription due to a race condition.
 */
export const logoutOneSignalUser = async (): Promise<void> => {
  if (typeof window === 'undefined') return;
  try {
    const os = initializedOneSignal || (await waitForOneSignalReady(1500));
    if (os && typeof os.logout === 'function') {
      await os.logout();
    }
  } catch {
    // ignore logout errors when push is not active
  }
};

export const syncOneSignalSubscription = async (
  userId?: string,
  enabled: boolean = true,
): Promise<boolean> => {
  if (typeof window === 'undefined') return false;

  const OneSignal = await waitForOneSignalReady(6000);
  if (!OneSignal) return false;

  try {
    if (userId && typeof OneSignal.login === 'function') {
      try {
        await OneSignal.login(userId);
      } catch (loginErr) {
        console.warn('OneSignal login notice:', loginErr);
      }
    }

    if (enabled) {
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        if (OneSignal.User?.PushSubscription?.optIn) {
          await OneSignal.User.PushSubscription.optIn();
        }
        return Boolean(
          OneSignal.User?.PushSubscription?.optedIn ||
            OneSignal.Notifications?.permission ||
            Notification.permission === 'granted',
        );
      }
      return false;
    } else {
      if (OneSignal.User?.PushSubscription?.optOut) {
        await OneSignal.User.PushSubscription.optOut();
      }
      return true;
    }
  } catch (err) {
    console.warn('OneSignal subscription sync warning:', err);
    return false;
  }
};

export const requestOneSignalPermission = async (userId?: string): Promise<boolean> => {
  if (typeof window === 'undefined') return false;

  let granted = typeof Notification !== 'undefined' && Notification.permission === 'granted';

  // 1. If OneSignal v16 is already initialized, prefer OneSignal.Notifications.requestPermission()
  //    so OneSignal's state machine creates the push subscription token atomically on the user tap gesture.
  if (!granted && initializedOneSignal?.Notifications?.requestPermission) {
    try {
      await initializedOneSignal.Notifications.requestPermission();
      granted =
        Boolean(initializedOneSignal.Notifications?.permission) ||
        (typeof Notification !== 'undefined' && Notification.permission === 'granted');
    } catch (osPermErr) {
      console.warn('OneSignal.Notifications.requestPermission fallback to native:', osPermErr);
    }
  }

  // 2. Fallback / direct native browser permission request (preserves user tap gesture on iOS PWA & Android)
  if (!granted && 'Notification' in window) {
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

  // 3. Synchronize OneSignal subscription in background once init() is ready (never freezes UI)
  if (granted) {
    void waitForOneSignalReady(8000).then(async (OneSignal) => {
      if (!OneSignal) return;
      try {
        if (userId && typeof OneSignal.login === 'function') {
          try {
            await OneSignal.login(userId);
          } catch {}
        }
        if (OneSignal.User?.PushSubscription?.optIn) {
          await OneSignal.User.PushSubscription.optIn();
        }
      } catch (err) {
        console.warn('OneSignal optIn sync error:', err);
      }
    });
  }

  return granted || (typeof Notification !== 'undefined' && Notification.permission === 'granted');
};

const extractOneSignalError = (errors: unknown): string | null => {
  if (!errors) return null;
  if (Array.isArray(errors) && errors.length > 0) {
    return String(errors[0]);
  }
  if (typeof errors === 'string') return errors;
  if (typeof errors === 'object') {
    const values = Object.values(errors as Record<string, unknown>).flat();
    if (values.length > 0) return String(values[0]);
  }
  return null;
};

export const sendOneSignalNotification = async (
  title: string,
  content: string,
  url: string = 'https://econnotes.online/announcements',
): Promise<{ success: boolean; reason?: string; recipients?: number }> => {
  try {
    const { data, error } = await supabase.functions.invoke('send-notification', {
      body: { title, content, url },
    });

    if (error) {
      console.warn('send-notification edge function error:', error);
      return { success: false, reason: 'Bildirim servisine ulaşılamadı.' };
    }

    if (!data?.success) {
      if (data?.reason === 'ONESIGNAL_REST_API_KEY not configured') {
        return { success: false, reason: 'Sunucuda ONESIGNAL_REST_API_KEY tanımlı değil.' };
      }
      const apiErr = extractOneSignalError(data?.data?.errors);
      if (apiErr && /not subscribed|no subscribed/i.test(apiErr)) {
        return {
          success: false,
          reason: 'Henüz push bildirimine abone olmuş cihaz bulunmuyor (uygulama içi bildirim iletildi).',
        };
      }
      return {
        success: false,
        reason: apiErr || data?.reason || 'Bildirim gönderilemedi.',
      };
    }

    return { success: true, recipients: typeof data?.data?.recipients === 'number' ? data.data.recipients : undefined };
  } catch (error) {
    console.error('OneSignal push dispatch error:', error);
    return { success: false, reason: 'Bildirim gönderilemedi.' };
  }
};
