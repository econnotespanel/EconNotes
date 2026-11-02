importScripts("https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js");

// EconNotes Service Worker - PWA & Push Notifications
const CACHE_NAME = 'econnotes-sw-v2';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Handle direct message from page to show notification (local fallback)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
    const { title, options } = event.data;
    event.waitUntil(self.registration.showNotification(title, options));
  }
});

// Handle notification click by focusing existing tab or opening a new one
self.addEventListener('notificationclick', (event) => {
  // If OneSignal handles the notification, let it proceed; otherwise handle local notifications
  if (event.notification.data?.url) {
    event.notification.close();
    const targetUrl = event.notification.data.url;

    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
        for (const client of windowClients) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            if ('navigate' in client) {
              client.navigate(targetUrl);
            }
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow(targetUrl);
        }
      })
    );
  }
});
