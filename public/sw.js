importScripts("https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js");

const SHELL_CACHE = 'econnotes-pwa-shell-v1';

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || req.mode !== 'navigate') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(req)
      .then((response) => {
        if (response && response.ok && url.pathname === '/') {
          const clone = response.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put('/', clone)).catch(() => {});
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match('/');
        return cached || Response.error();
      })
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
    const { title, options } = event.data;
    event.waitUntil(self.registration.showNotification(title, options));
  }
});

self.addEventListener('notificationclick', (event) => {
  const notifData = event.notification && event.notification.data;
  if (!notifData || !notifData.econnotesLocal || !notifData.url) return;

  event.notification.close();
  const targetUrl = new URL(notifData.url, self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          if ('navigate' in client) {
            return client.navigate(targetUrl).then(() => client.focus()).catch(() => client.focus());
          }
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
      return undefined;
    })
  );
});
