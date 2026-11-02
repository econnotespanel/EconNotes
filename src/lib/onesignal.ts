declare global {
  interface Window {
    OneSignalDeferred?: Array<(OneSignal: any) => void | Promise<void>>;
    OneSignal?: any;
  }
}

export const ONESIGNAL_APP_ID = 'ce5179d9-cf07-4115-b29a-a7d73713818d';

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
        notifyButton: {
          enable: false,
        },
        allowLocalhostAsSecureOrigin: true,
      });
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
        const result = await OneSignal.Notifications.requestPermission();
        resolve(result === true || Notification.permission === 'granted');
      } catch (err) {
        console.error('OneSignal permission error:', err);
        if ('Notification' in window) {
          const perm = await Notification.requestPermission();
          resolve(perm === 'granted');
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
      ? String(content).replace(/<[^>]*>/g, '').trim().slice(0, 150)
      : 'Yeni bir duyuru paylaşıldı.';

    const response = await fetch('https://api.onesignal.com/notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Key ${apiKey}`,
      },
      body: JSON.stringify({
        app_id: ONESIGNAL_APP_ID,
        included_segments: ['Total Subscriptions', 'Subscribed Users'],
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
