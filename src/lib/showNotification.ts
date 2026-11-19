// Web Push & Local Notifications utility for EconNotes
// Unified cross-platform notification dispatcher for Desktop (Windows, macOS) and Mobile (Android, iOS PWA)

let audioContext: AudioContext | null = null;
let lastChimeTimestamp = 0;

export const playChime = () => {
  try {
    const now = Date.now();
    // Throttle audio chime to once every 2 seconds to prevent audio echo / rapid overlapping chimes
    if (now - lastChimeTimestamp < 2000) {
      return;
    }
    lastChimeTimestamp = now;

    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    if (!audioContext || audioContext.state === 'closed') {
      audioContext = new AudioCtx();
    }
    if (audioContext.state === 'suspended') {
      void audioContext.resume().catch(() => {});
    }
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, audioContext.currentTime); // D5
    osc.frequency.exponentialRampToValueAtTime(880, audioContext.currentTime + 0.12); // A5
    gain.gain.setValueAtTime(0.001, audioContext.currentTime);
    gain.gain.linearRampToValueAtTime(0.2, audioContext.currentTime + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.35);
    osc.connect(gain);
    gain.connect(audioContext.destination);
    osc.start();
    osc.stop(audioContext.currentTime + 0.36);
  } catch {
    // Audio autostart might be restricted before user gesture
  }
};

const isMobileOrTouchOS = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return (
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua) ||
    (navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1)
  );
};

const getActiveServiceWorkerRegistration = async (): Promise<ServiceWorkerRegistration | null> => {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;

  try {
    const readyReg = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 1800)),
    ]);
    if (readyReg && typeof readyReg.showNotification === 'function') {
      return readyReg;
    }

    const existing = await navigator.serviceWorker.getRegistration('/');
    if (existing && typeof existing.showNotification === 'function') {
      return existing;
    }

    const anyReg = await navigator.serviceWorker.getRegistration();
    if (anyReg && typeof anyReg.showNotification === 'function') {
      return anyReg;
    }

    // Last resort: register the worker on demand
    const fresh = await navigator.serviceWorker.register('/OneSignalSDKWorker.js', { scope: '/' });
    if (fresh && typeof fresh.showNotification === 'function') {
      return fresh;
    }
  } catch (err) {
    console.warn('Service worker lookup for notification failed:', err);
  }

  return null;
};

export const displayDeviceNotification = async (
  title: string,
  options: NotificationOptions & { data?: { url?: string } } = {},
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

  const baseOptions: NotificationOptions = {
    body,
    icon: iconUrl,
    badge: iconUrl,
    tag,
    data: { url: targetUrl, econnotesLocal: true },
  };

  const extendedOptions: NotificationOptions & { renotify?: boolean } = {
    ...baseOptions,
    renotify: true,
  };

  const isMobile = isMobileOrTouchOS();

  // 1. DESKTOP (Windows, macOS, Linux): Native browser Notification constructor
  if (!isMobile) {
    try {
      const n = new Notification(title, baseOptions);
      n.onclick = () => {
        window.focus();
        window.location.assign(targetUrl);
        n.close();
      };
      return true;
    } catch (desktopErr) {
      console.warn('Desktop Notification constructor error, falling back to Service Worker:', desktopErr);
    }
  }

  // 2. MOBILE (Android Chrome, iOS PWA) & Service Worker fallback
  if ('serviceWorker' in navigator) {
    const reg = await getActiveServiceWorkerRegistration();
    if (reg) {
      try {
        await reg.showNotification(title, extendedOptions);
        return true;
      } catch {
        // Retry with minimal cross-browser options (e.g. strict iOS Safari PWA)
        try {
          await reg.showNotification(title, {
            body,
            icon: iconUrl,
            tag,
            data: { url: targetUrl, econnotesLocal: true },
          });
          return true;
        } catch (swErr) {
          console.warn('Service Worker showNotification error:', swErr);
        }
      }
    }

    // 3. Last-ditch fallback: Service Worker postMessage
    if (navigator.serviceWorker.controller) {
      try {
        navigator.serviceWorker.controller.postMessage({
          type: 'SHOW_NOTIFICATION',
          title,
          options: baseOptions,
        });
        return true;
      } catch (pmErr) {
        console.warn('Service Worker postMessage error:', pmErr);
      }
    }
  }

  return false;
};
