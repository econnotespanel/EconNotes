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
    data?: { url?: string; [key: string]: any };
    tag?: string;
  } = {}
): Promise<boolean> => {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return false;
  }

  if (Notification.permission !== 'granted') {
    return false;
  }

  const iconUrl = options.icon || `${window.location.origin}/icons/icon-192x192.png`;
  const targetUrl = options.data?.url || '/announcements';
  const tag = options.tag || `econnotes-${Date.now()}`;
  const body = options.body || '';

  // Minimal, cross-platform options (avoids Android silent failure with badge/vibrate and iOS WebKit errors)
  const notificationOptions: NotificationOptions = {
    body,
    icon: iconUrl,
    tag,
    data: { url: targetUrl },
  };

  let delivered = false;
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

  // 1. DESKTOP (Windows, macOS, Linux): Native browser Notification constructor
  // This guarantees an instant visible toast bubble on Windows / Mac desktops without depending on SW state
  if (!isMobile) {
    try {
      const n = new Notification(title, notificationOptions);
      n.onclick = () => {
        window.focus();
        window.location.assign(targetUrl);
        n.close();
      };
      delivered = true;
    } catch (desktopErr) {
      console.warn('Desktop Notification constructor error:', desktopErr);
    }
  }

  // 2. MOBILE (Android Chrome, iOS PWA) & Service Worker
  // Android Chrome strictly requires ServiceWorkerRegistration.showNotification()
  if ('serviceWorker' in navigator) {
    try {
      // First try immediate ready registration
      const reg = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise<any>((resolve) => setTimeout(() => resolve(null), 2000)),
      ]);

      if (reg && typeof reg.showNotification === 'function') {
        await reg.showNotification(title, notificationOptions);
        delivered = true;
      } else {
        // Fallback to getRegistration
        const fallbackReg = await navigator.serviceWorker.getRegistration();
        if (fallbackReg && typeof fallbackReg.showNotification === 'function') {
          await fallbackReg.showNotification(title, notificationOptions);
          delivered = true;
        }
      }
    } catch (swErr) {
      console.warn('Service Worker showNotification error:', swErr);
    }

    // Secondary postMessage channel directly to active Service Worker controller
    if (navigator.serviceWorker.controller) {
      try {
        navigator.serviceWorker.controller.postMessage({
          type: 'SHOW_NOTIFICATION',
          title,
          options: notificationOptions,
        });
        delivered = true;
      } catch (pmErr) {
        console.warn('Service Worker postMessage error:', pmErr);
      }
    }
  }

  // 3. Fallback on mobile if service worker failed but Notification constructor exists
  if (!delivered && !isMobile) {
    try {
      const fallbackN = new Notification(title, notificationOptions);
      fallbackN.onclick = () => {
        window.focus();
        window.location.assign(targetUrl);
        fallbackN.close();
      };
      delivered = true;
    } catch {}
  }

  return delivered;
};
