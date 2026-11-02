export const playChime = () => {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.12); // A5
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.35);
  } catch {}
};

export const displayDeviceNotification = async (
  title: string,
  options: {
    body?: string;
    icon?: string;
    badge?: string;
    tag?: string;
    data?: { url?: string; [key: string]: any };
    vibrate?: number[];
    renotify?: boolean;
  } = {}
): Promise<boolean> => {
  let displayed = false;

  const mergedOptions = {
    body: options.body || '',
    icon: options.icon || '/icons/icon-192x192.png',
    badge: options.badge || '/icons/icon-192x192.png',
    vibrate: options.vibrate || [200, 100, 200],
    data: options.data || { url: '/announcements' },
    tag: options.tag || `econnotes-${Date.now()}`,
    renotify: options.renotify !== false,
  };

  // 1. Mobile (Android & iOS PWA) via ServiceWorkerRegistration.showNotification
  if ('serviceWorker' in navigator) {
    try {
      let reg = await navigator.serviceWorker.getRegistration();
      if (!reg) {
        reg = await navigator.serviceWorker.register('/sw.js');
      }
      if (reg && !reg.active) {
        reg = await Promise.race([
          navigator.serviceWorker.ready,
          new Promise<any>((res) => setTimeout(() => res(reg), 2500)),
        ]);
      }
      if (reg && typeof reg.showNotification === 'function') {
        await reg.showNotification(title, mergedOptions);
        displayed = true;
      }
    } catch (e) {
      console.warn('SW showNotification error:', e);
    }

    // Secondary postMessage channel directly to active Service Worker controller
    if (!displayed && navigator.serviceWorker.controller) {
      try {
        navigator.serviceWorker.controller.postMessage({
          type: 'SHOW_NOTIFICATION',
          title,
          options: mergedOptions,
        });
        displayed = true;
      } catch (e) {
        console.warn('SW postMessage error:', e);
      }
    }
  }

  // 2. Desktop (Windows & Mac) or browser Notification constructor
  if (!displayed && typeof window !== 'undefined' && 'Notification' in window) {
    try {
      const n = new Notification(title, mergedOptions);
      n.onclick = () => {
        window.focus();
        if (mergedOptions.data?.url) {
          window.location.assign(mergedOptions.data.url);
        }
        n.close();
      };
      displayed = true;
    } catch (e) {
      console.warn('Notification constructor error:', e);
    }
  }

  return displayed;
};
