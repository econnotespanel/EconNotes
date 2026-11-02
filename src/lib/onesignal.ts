declare global {
  interface Window {
    OneSignalDeferred?: Array<(OneSignal: any) => void | Promise<void>>;
    OneSignal?: any;
  }
}

export const ONESIGNAL_APP_ID = 'ce5179d9-cf07-4115-b29a-a7d73713818d';
export const ONESIGNAL_SAFARI_WEB_ID = 'web.onesignal.auto.3bb557bb-091e-4595-bac2-e40949e4ba5a';

const getOneSignalRestApiKey = (): string => {
  if (import.meta.env.VITE_ONESIGNAL_REST_API_KEY) {
    return String(import.meta.env.VITE_ONESIGNAL_REST_API_KEY);
  }
  try {
    return atob('b3NfdjJfYXBwX3p6aXh0d29wYTVhcmxtdTJ1N2x0b2U0YnJ4bnZ4d2NodHpmdTQzZmNwZXA2dnZ5cDR0Z21jM3VhM29vNzN3cnAza3dwYWx6NG1pcWt5Y2w3eHRjZ3RhZWNtbmZ6NXo3a2JrajRrM3E=');
  } catch {
    return '';
  }
};

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
        slidedown: {
          prompts: [
            {
              type: 'push',
              autoPrompt: true,
              text: {
                actionMessage: 'Duyurulardan ve ders notlarından anında haberdar olmak için bildirimleri açın.',
                acceptButton: 'Bildirimleri Aç',
                cancelButton: 'Daha Sonra',
              },
              delay: {
                pageViews: 1,
                timeDelay: 1,
              },
            },
          ],
        },
      });

      // Auto-opt in if native browser permission is already granted
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
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
    }
  });
};

export const requestOneSignalPermission = async (): Promise<boolean> => {
  if (typeof window === 'undefined') return false;

  return new Promise((resolve) => {
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred.push(async function (OneSignal: any) {
      try {
        // 1. Try OneSignal native slidedown prompt first
        if (OneSignal.Slidedown?.promptPush) {
          await OneSignal.Slidedown.promptPush({ force: true });
        } else if (OneSignal.Notifications?.requestPermission) {
          await OneSignal.Notifications.requestPermission();
        }

        // 2. Opt in to push subscription
        if (OneSignal.User?.PushSubscription?.optIn) {
          await OneSignal.User.PushSubscription.optIn();
        }

        const isGranted = Boolean(
          OneSignal.User?.PushSubscription?.optedIn ||
          OneSignal.Notifications?.permission ||
          (typeof Notification !== 'undefined' && Notification.permission === 'granted')
        );
        resolve(isGranted);
      } catch (err) {
        console.warn('OneSignal permission prompt error:', err);
        if ('Notification' in window) {
          try {
            const perm = await Notification.requestPermission();
            resolve(perm === 'granted');
          } catch {
            resolve(false);
          }
        } else {
          resolve(false);
        }
      }
    });
  });
};

export const sendOneSignalNotification = async (
  title: string,
  content: string,
  url: string = 'https://econnotes.online/announcements'
) => {
  const apiKey = getOneSignalRestApiKey();
  if (!apiKey) return false;

  try {
    const cleanContent = content
      ? String(content).replace(/<[^>]*>/g, '').trim().slice(0, 180)
      : 'Yeni bir duyuru paylaşıldı.';

    const response = await fetch('https://api.onesignal.com/notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Key ${apiKey}`,
      },
      body: JSON.stringify({
        app_id: ONESIGNAL_APP_ID,
        included_segments: ['Total Subscriptions', 'Active Subscriptions'],
        headings: { tr: title, en: title },
        contents: { tr: cleanContent, en: cleanContent },
        url,
        chrome_web_icon: 'https://econnotes.online/icons/icon-192x192.png',
        chrome_web_badge: 'https://econnotes.online/icons/icon-192x192.png',
        firefox_icon: 'https://econnotes.online/icons/icon-192x192.png',
      }),
    });

    const data = await response.json();
    return Boolean(data && !data.errors);
  } catch (error) {
    console.error('OneSignal push dispatch error:', error);
    return false;
  }
};
