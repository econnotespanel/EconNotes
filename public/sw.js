// EconNotes Service Worker - PWA & Push Notifications
const CACHE_NAME = 'econnotes-sw-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Listen for incoming Web Push events
self.addEventListener('push', (event) => {
  let data = {
    title: 'EconNotes Duyuru 📢',
    body: 'Yeni bir duyuru veya ders notu paylaşıldı!',
    url: '/announcements',
    tag: 'econnotes-push',
  };

  if (event.data) {
    try {
      const parsed = event.data.json();
      data = { ...data, ...parsed };
    } catch (e) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-192x192.png',
    vibrate: [150, 60, 150],
    data: {
      url: data.url || '/announcements',
    },
    tag: data.tag || 'econnotes-announcement',
    renotify: true,
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

// Handle notification click by focusing existing tab or opening a new one
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/announcements';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // If a window is already open, focus it and navigate
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          if ('navigate' in client) {
            client.navigate(targetUrl);
          }
          return client.focus();
        }
      }
      // Otherwise open a new window/PWA instance
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
