declare global {
  interface Window {
    OneSignalDeferred?: Array<(OneSignal: any) => void | Promise<void>>;
    OneSignal?: any;
  }
}

export const ONESIGNAL_APP_ID = 'ce5179d9-cf07-4115-b29a-a7d73713818d';

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
        // Fallback to standard requestPermission
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
  restApiKey: string,
  url: string = 'https://econnotes.online/announcements'
) => {
  if (!restApiKey) return false;

  try {
    const response = await fetch('https://onesignal.com/api/v1/notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${restApiKey}`,
      },
      body: JSON.stringify({
        app_id: ONESIGNAL_APP_ID,
        included_segments: ['Total Subscriptions'],
        headings: { tr: `📢 EconNotes: ${title}`, en: `📢 EconNotes: ${title}` },
        contents: { tr: content || 'Yeni bir duyuru paylaşıldı.', en: content || 'Yeni bir duyuru paylaşıldı.' },
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
