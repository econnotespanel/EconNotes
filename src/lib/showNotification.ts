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

    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    if (!audioContext || audioContext.state === 'closed') {
      audioContext = new AudioCtx();
    }
    if (audioContext.state === 'suspended') {
      audioContext.resume();
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
  } catch (e) {
    // Audio autostart might be restricted before user gesture
  }
};

export const displayDeviceNotification = async (
  title: string,
  options: NotificationOptions & { data?: { url?: string } } = {}
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

  const notificationOptions: NotificationOptions = {
    body,
    icon: iconUrl,
    tag,
    data: { url: targetUrl },
  };

  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

  // 1. DESKTOP (Windows, macOS, Linux): Native browser Notification constructor
  // When this succeeds, exit immediately so we NEVER fire a duplicate from the service worker
  if (!isMobile) {
    try {
      const n = new Notification(title, notificationOptions);
      n.onclick = () => {
        window.focus();
        window.location.assign(targetUrl);
        n.close();
      };
      return true; // Already delivered once! Stop further delivery.
    } catch (desktopErr) {
      console.warn('Desktop Notification constructor error, falling back to Service Worker:', desktopErr);
    }
  }

  // 2. MOBILE (Android Chrome, iOS PWA) & Service Worker
  if ('serviceWorker' in navigator) {
    try {
      const reg = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise<any>((resolve) => setTimeout(() => resolve(null), 1500)),
      ]);

      if (reg && typeof reg.showNotification === 'function') {
        await reg.showNotification(title, notificationOptions);
        return true; // Delivered once! Stop further delivery.
      }

      const fallbackReg = await navigator.serviceWorker.getRegistration();
      if (fallbackReg && typeof fallbackReg.showNotification === 'function') {
        await fallbackReg.showNotification(title, notificationOptions);
        return true; // Delivered once! Stop further delivery.
      }
    } catch (swErr) {
      console.warn('Service Worker showNotification error:', swErr);
    }

    // 3. Last-ditch fallback: Service Worker postMessage (only if direct showNotification wasn't available)
    if (navigator.serviceWorker.controller) {
      try {
        navigator.serviceWorker.controller.postMessage({
          type: 'SHOW_NOTIFICATION',
          title,
          options: notificationOptions,
        });
        return true;
      } catch (pmErr) {
        console.warn('Service Worker postMessage error:', pmErr);
      }
    }
  }

  return false;
};
