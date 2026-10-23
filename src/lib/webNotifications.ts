type WebNotificationOptions = {
  body: string;
  tag: string;
  path: string;
};

export const showWebNotification = async (title: string, options: WebNotificationOptions) => {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  try {
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.ready;
      await registration.showNotification(title, {
        body: options.body,
        tag: options.tag,
        icon: '/icons/icon-192x192.png',
        data: { path: options.path },
      });
      return;
    }

    const notification = new Notification(title, {
      body: options.body,
      tag: options.tag,
      icon: '/icons/icon-192x192.png',
    });
    notification.onclick = () => {
      window.focus();
      window.location.assign(options.path);
      notification.close();
    };
  } catch (error) {
    console.error('Web notification could not be displayed:', error);
  }
};
