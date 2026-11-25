importScripts("https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js");

const SHELL_CACHE = 'econnotes-pwa-shell-v1';

// Lightweight navigation fetch handler (network-first) to satisfy Android/Chromium PWA installability heuristics
// without interfering with API calls, auth sessions, or OneSignal push traffic.
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

// Handle direct message from page to show local device notification (realtime / polling fallback)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
    const { title, options } = event.data;
    event.waitUntil(self.registration.showNotification(title, options));
  }
});

// Handle click for EconNotes local notifications only (never intercepts OneSignal cloud push clicks)
self.addEventListener('notificationclick', (event) => {
  const notifData = event.notification && event.notification.data;
  if (!notifData || !notifData.econnotesLocal || !notifData.url) return;

  event.notification.close();
  let targetUrl = self.location.origin + '/';
  try {
    const parsed = new URL(notifData.url, self.location.origin);
    if (parsed.origin === self.location.origin) {
      targetUrl = parsed.href;
    }
  } catch {
    targetUrl = self.location.origin + '/';
  }

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
