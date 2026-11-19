export interface BeforeInstallPromptEvent extends Event {
  readonly platforms?: string[];
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform?: string }>;
}

declare global {
  interface Window {
    __econnotesDeferredInstallPrompt?: BeforeInstallPromptEvent | null;
    __econnotesMobileInstallPromptOpen?: boolean;
  }
}

export const PWA_INSTALL_AVAILABLE_EVENT = 'econnotes:pwa-install-available';
export const PWA_INSTALLED_EVENT = 'econnotes:pwa-installed';
export const PWA_PROMPT_VISIBILITY_EVENT = 'econnotes:pwa-prompt-visibility';

const PWA_INSTALLED_STORAGE_KEY = 'econnotes_pwa_installed';
const MOBILE_PROMPT_DISMISSED_UNTIL_KEY = 'econnotes_mobile_a2hs_dismissed_until';
const AUTO_INSTALL_ATTEMPTED_SESSION_KEY = 'econnotes_auto_install_attempted';

export const isStandalonePwa = (): boolean => {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  try {
    if (window.matchMedia?.('(display-mode: standalone)')?.matches) return true;
    if (window.matchMedia?.('(display-mode: fullscreen)')?.matches) return true;
    if ((navigator as Navigator & { standalone?: boolean }).standalone === true) return true;
    if (typeof document !== 'undefined' && document.referrer?.startsWith('android-app://')) return true;
  } catch {
    // ignore
  }
  return false;
};

export const isIOSDevice = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return (
    /iPad|iPhone|iPod/i.test(ua) ||
    (navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1)
  );
};

export const isAndroidDevice = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  return /Android/i.test(navigator.userAgent || '');
};

export const isMobileDevice = (): boolean => {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  if (isIOSDevice() || isAndroidDevice()) return true;
  const ua = navigator.userAgent || '';
  if (/webOS|BlackBerry|IEMobile|Opera Mini|Mobile|Tablet/i.test(ua)) return true;
  try {
    const coarse = window.matchMedia?.('(pointer: coarse)')?.matches;
    if (coarse && window.innerWidth <= 900) return true;
  } catch {
    // ignore
  }
  return false;
};

export const isInAppBrowser = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /Instagram|FBAN|FBAV|WhatsApp|Telegram|Snapchat|Line\/|Twitter|TikTok|BytedanceWebview|wv\)/i.test(ua);
};

export const isIOSSafari = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  if (!isIOSDevice()) return false;
  const ua = navigator.userAgent || '';
  if (isInAppBrowser()) return false;
  if (/CriOS|FxiOS|EdgiOS|OPiOS|YaBrowser/i.test(ua)) return false;
  return /Safari/i.test(ua);
};

export const getDeferredInstallPrompt = (): BeforeInstallPromptEvent | null => {
  if (typeof window === 'undefined') return null;
  return window.__econnotesDeferredInstallPrompt ?? null;
};

export const clearDeferredInstallPrompt = () => {
  if (typeof window === 'undefined') return;
  window.__econnotesDeferredInstallPrompt = null;
};

export const markPwaInstalled = () => {
  try {
    localStorage.setItem(PWA_INSTALLED_STORAGE_KEY, 'true');
  } catch {
    // ignore storage failures
  }
};

export const isPwaMarkedInstalled = (): boolean => {
  if (typeof window === 'undefined') return false;
  if (isStandalonePwa()) return true;
  try {
    return localStorage.getItem(PWA_INSTALLED_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
};

export const isMobilePromptDismissed = (): boolean => {
  if (typeof window === 'undefined') return true;
  try {
    const raw = localStorage.getItem(MOBILE_PROMPT_DISMISSED_UNTIL_KEY);
    if (!raw) return false;
    const until = Number(raw);
    return Number.isFinite(until) && Date.now() < until;
  } catch {
    return false;
  }
};

export const dismissMobilePrompt = (hours = 24) => {
  if (typeof window === 'undefined') return;
  try {
    const until = Date.now() + hours * 60 * 60 * 1000;
    localStorage.setItem(MOBILE_PROMPT_DISMISSED_UNTIL_KEY, String(until));
  } catch {
    // ignore
  }
};

export const hasAttemptedAutoInstallInSession = (): boolean => {
  if (typeof window === 'undefined') return true;
  try {
    return sessionStorage.getItem(AUTO_INSTALL_ATTEMPTED_SESSION_KEY) === 'true';
  } catch {
    return false;
  }
};

export const markAutoInstallAttemptedInSession = () => {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(AUTO_INSTALL_ATTEMPTED_SESSION_KEY, 'true');
  } catch {
    // ignore
  }
};

export const setMobileInstallPromptVisible = (open: boolean) => {
  if (typeof window === 'undefined') return;
  window.__econnotesMobileInstallPromptOpen = open;
  window.dispatchEvent(new CustomEvent(PWA_PROMPT_VISIBILITY_EVENT, { detail: { open } }));
};

export const isMobileInstallPromptVisible = (): boolean => {
  if (typeof window === 'undefined') return false;
  return Boolean(window.__econnotesMobileInstallPromptOpen);
};

export type NativeInstallOutcome = 'accepted' | 'dismissed' | 'unavailable' | 'gesture-required';

export const triggerNativePwaInstall = async (): Promise<NativeInstallOutcome> => {
  const deferred = getDeferredInstallPrompt();
  if (!deferred) return 'unavailable';

  try {
    await deferred.prompt();
    const choice = await deferred.userChoice;
    clearDeferredInstallPrompt();
    if (choice.outcome === 'accepted') {
      markPwaInstalled();
      window.dispatchEvent(new Event(PWA_INSTALLED_EVENT));
      return 'accepted';
    }
    return 'dismissed';
  } catch (err: unknown) {
    const name = err && typeof err === 'object' && 'name' in err ? String((err as { name?: unknown }).name) : '';
    const message = err && typeof err === 'object' && 'message' in err ? String((err as { message?: unknown }).message) : '';
    if (name === 'NotAllowedError' || /gesture|activation/i.test(message)) {
      // Keep deferredPrompt intact so the user's direct tap on the Install button works immediately
      return 'gesture-required';
    }
    console.warn('PWA native install prompt error:', err);
    return 'unavailable';
  }
};

export const subscribeToInstallPrompt = (
  onChange: (prompt: BeforeInstallPromptEvent | null, installed: boolean) => void,
): (() => void) => {
  if (typeof window === 'undefined') return () => {};

  const handleAvailable = () => {
    onChange(getDeferredInstallPrompt(), isStandalonePwa());
  };

  const handleBeforeInstall = (e: Event) => {
    e.preventDefault();
    window.__econnotesDeferredInstallPrompt = e as BeforeInstallPromptEvent;
    onChange(window.__econnotesDeferredInstallPrompt, false);
  };

  const handleInstalled = () => {
    clearDeferredInstallPrompt();
    markPwaInstalled();
    onChange(null, true);
  };

  window.addEventListener(PWA_INSTALL_AVAILABLE_EVENT, handleAvailable);
  window.addEventListener('beforeinstallprompt', handleBeforeInstall);
  window.addEventListener(PWA_INSTALLED_EVENT, handleInstalled);
  window.addEventListener('appinstalled', handleInstalled);

  // Sync current state immediately
  onChange(getDeferredInstallPrompt(), isStandalonePwa());

  return () => {
    window.removeEventListener(PWA_INSTALL_AVAILABLE_EVENT, handleAvailable);
    window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
    window.removeEventListener(PWA_INSTALLED_EVENT, handleInstalled);
    window.removeEventListener('appinstalled', handleInstalled);
  };
};
