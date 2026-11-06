export type DeviceCategory = 'mobile' | 'tablet' | 'desktop';

export interface ClientDeviceInfo {
  deviceType: DeviceCategory;
  deviceLabel: string;
  os: string;
  browser: string;
  isPwa: boolean;
  screen: string;
  provider?: string;
  fingerprint: string;
}

interface NavigatorUAData {
  brands?: Array<{ brand: string; version: string }>;
  mobile?: boolean;
  platform?: string;
  getHighEntropyValues?: (hints: string[]) => Promise<{
    model?: string;
    platform?: string;
    platformVersion?: string;
  }>;
}

const DEVICE_META_PREFIX = 'login_device:';

const normalizeProviderLabel = (provider?: string | null): string => {
  const raw = (provider || '').trim().toLowerCase();
  if (raw === 'google') return 'Google';
  if (raw === 'apple') return 'Apple';
  if (raw === 'email' || raw === 'password') return 'E-posta';
  return raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : '';
};

export const getProviderLabel = normalizeProviderLabel;

const cleanAndroidModel = (rawModel?: string): string => {
  if (!rawModel) return '';
  const cleaned = rawModel
    .replace(/Build\/.*$/i, '')
    .replace(/\bwv\b/gi, '')
    .trim();
  if (!cleaned || cleaned === 'K' || cleaned.length < 2) return '';
  if (/^[a-z]{2}[-_][a-z]{2}$/i.test(cleaned)) return '';
  return cleaned;
};

const detectBrowser = (ua: string, isIOS: boolean, isPwa: boolean, uaData?: NavigatorUAData): string => {
  if (/Instagram/i.test(ua)) return 'Instagram Tarayıcı';
  if (/FBAN|FBAV/i.test(ua)) return 'Facebook Tarayıcı';
  if (/WhatsApp/i.test(ua)) return 'WhatsApp Tarayıcı';
  if (/EdgA?\/|EdgiOS\//i.test(ua)) return 'Edge';
  if (/OPR\/|OPT\/|OPiOS\//i.test(ua)) return 'Opera';
  if (/SamsungBrowser\//i.test(ua)) return 'Samsung Internet';
  if (/YaBrowser\//i.test(ua)) return 'Yandex';
  if (/Firefox\/|FxiOS\//i.test(ua)) return 'Firefox';

  if (/Chrome\//i.test(ua)) {
    const brandNames = (uaData?.brands || []).map((b) => b.brand.toLowerCase());
    if (brandNames.some((b) => b.includes('brave'))) return 'Brave';
    if (brandNames.some((b) => b.includes('edge'))) return 'Edge';
    if (brandNames.some((b) => b.includes('opera'))) return 'Opera';
  }

  if (/Chrome\/|CriOS\//i.test(ua)) return 'Chrome';
  if (/Safari\//i.test(ua)) return 'Safari';
  if (isIOS) return isPwa ? 'Safari (Ana Ekran)' : 'Safari';
  return 'Web Tarayıcı';
};

export const detectClientDeviceSync = (provider?: string): ClientDeviceInfo => {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return {
      deviceType: 'desktop',
      deviceLabel: 'Web Cihazı',
      os: 'Bilinmiyor',
      browser: 'Tarayıcı',
      isPwa: false,
      screen: '',
      provider,
      fingerprint: 'unknown',
    };
  }

  const ua = navigator.userAgent || '';
  const platform = navigator.platform || '';
  const maxTouchPoints = navigator.maxTouchPoints || 0;
  const uaData = (navigator as Navigator & { userAgentData?: NavigatorUAData }).userAgentData;

  const isPwa = Boolean(
    window.matchMedia?.('(display-mode: standalone)')?.matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true,
  );

  const isIPhone = /iPhone|iPod/i.test(ua);
  const isIPad = /iPad/i.test(ua) || (platform === 'MacIntel' && maxTouchPoints > 1);
  const isIOS = isIPhone || isIPad;
  const isAndroid = /Android/i.test(ua);

  let deviceType: DeviceCategory = 'desktop';
  let deviceLabel = 'Bilgisayar';
  let os = 'Masaüstü';

  if (isIPhone) {
    deviceType = 'mobile';
    deviceLabel = 'iPhone';
    const match = ua.match(/CPU iPhone OS (\d+[._]\d+)/i);
    os = match ? `iOS ${match[1].replace(/_/g, '.')}` : 'iOS';
  } else if (isIPad) {
    deviceType = 'tablet';
    deviceLabel = 'iPad';
    const match = ua.match(/CPU OS (\d+[._]\d+)/i) || ua.match(/Version\/(\d+\.\d+)/i);
    os = match ? `iPadOS ${match[1].replace(/_/g, '.')}` : 'iPadOS';
  } else if (isAndroid) {
    const isTablet = !/Mobile/i.test(ua) || /Tablet|Pad/i.test(ua);
    deviceType = isTablet ? 'tablet' : 'mobile';
    const verMatch = ua.match(/Android\s+([0-9.]+)/i);
    os = verMatch ? `Android ${verMatch[1]}` : 'Android';
    const modelMatch = ua.match(/Android\s+[0-9.]+;\s*([^;)]+)/i);
    const model = cleanAndroidModel(modelMatch?.[1]);
    deviceLabel = model ? `Android (${model})` : isTablet ? 'Android Tablet' : 'Android Telefon';
  } else if (/CrOS/i.test(ua)) {
    deviceType = 'desktop';
    deviceLabel = 'Chromebook';
    os = 'ChromeOS';
  } else if (/Windows NT/i.test(ua)) {
    deviceType = 'desktop';
    const ntMatch = ua.match(/Windows NT ([0-9.]+)/i);
    const ntVer = ntMatch?.[1] || '';
    os = ntVer === '10.0' ? 'Windows 10/11' : ntVer ? `Windows (${ntVer})` : 'Windows';
    deviceLabel = 'Windows Bilgisayar';
  } else if (/Macintosh|Mac OS X/i.test(ua)) {
    deviceType = 'desktop';
    deviceLabel = 'Mac';
    os = 'macOS';
  } else if (/Linux/i.test(ua)) {
    deviceType = 'desktop';
    deviceLabel = 'Linux Bilgisayar';
    os = 'Linux';
  }

  const browser = detectBrowser(ua, isIOS, isPwa, uaData);
  const screen =
    typeof window.screen !== 'undefined' && window.screen.width && window.screen.height
      ? `${window.screen.width}×${window.screen.height}`
      : '';

  const fingerprint = [deviceType, deviceLabel, browser, isPwa ? 'pwa' : 'web'].join('|');

  return {
    deviceType,
    deviceLabel,
    os,
    browser,
    isPwa,
    screen,
    provider,
    fingerprint,
  };
};

export const detectClientDevice = async (provider?: string): Promise<ClientDeviceInfo> => {
  const base = detectClientDeviceSync(provider);
  if (typeof navigator === 'undefined') return base;

  const uaData = (navigator as Navigator & { userAgentData?: NavigatorUAData }).userAgentData;
  if (!uaData?.getHighEntropyValues) return base;

  try {
    const hints = await Promise.race([
      uaData.getHighEntropyValues(['model', 'platform', 'platformVersion']),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 350)),
    ]);
    if (!hints) return base;

    let { deviceLabel, os } = base;
    const hintPlatform = (hints.platform || '').toLowerCase();
    const majorVer = parseInt((hints.platformVersion || '').split('.')[0] || '0', 10);

    if (hintPlatform === 'windows' && majorVer > 0) {
      os = majorVer >= 13 ? 'Windows 11' : 'Windows 10';
      deviceLabel = `${os} Bilgisayar`;
    } else if (hintPlatform === 'macos' && majorVer > 0) {
      os = `macOS ${majorVer}`;
      deviceLabel = 'Mac';
    } else if (hintPlatform === 'android') {
      if (majorVer > 0) os = `Android ${majorVer}`;
      const model = cleanAndroidModel(hints.model);
      if (model) {
        deviceLabel = `Android (${model})`;
      }
    }

    const fingerprint = [base.deviceType, deviceLabel, base.browser, base.isPwa ? 'pwa' : 'web'].join('|');
    return {
      ...base,
      deviceLabel,
      os,
      fingerprint,
    };
  } catch {
    return base;
  }
};

export const formatLoginDetails = (info: ClientDeviceInfo): string => {
  const osPart =
    info.os && !info.deviceLabel.toLowerCase().includes(info.os.toLowerCase())
      ? `${info.deviceLabel} (${info.os})`
      : info.deviceLabel;
  const parts = [osPart, info.browser];
  if (info.isPwa) parts.push('PWA Uygulama');
  const providerLabel = normalizeProviderLabel(info.provider);
  if (providerLabel) parts.push(`${providerLabel} ile giriş`);
  else parts.push('Panele giriş yaptı');
  return parts.join(' · ');
};

export const serializeLoginMetadata = (info: ClientDeviceInfo): string => {
  const payload = {
    deviceType: info.deviceType,
    deviceLabel: info.deviceLabel,
    os: info.os,
    browser: info.browser,
    isPwa: info.isPwa,
    screen: info.screen,
    provider: info.provider || '',
  };
  return `${DEVICE_META_PREFIX}${JSON.stringify(payload)}`;
};

export const parseLoginLogDevice = (log: {
  entity_type?: string | null;
  details?: string | null;
}): ClientDeviceInfo | null => {
  const rawEntity = log.entity_type || '';
  if (rawEntity.startsWith(DEVICE_META_PREFIX)) {
    try {
      const parsed = JSON.parse(rawEntity.slice(DEVICE_META_PREFIX.length));
      if (parsed && typeof parsed === 'object' && parsed.deviceLabel) {
        const deviceType: DeviceCategory =
          parsed.deviceType === 'mobile' || parsed.deviceType === 'tablet' ? parsed.deviceType : 'desktop';
        const isPwa = Boolean(parsed.isPwa);
        const browser = String(parsed.browser || 'Tarayıcı');
        const deviceLabel = String(parsed.deviceLabel);
        return {
          deviceType,
          deviceLabel,
          os: String(parsed.os || ''),
          browser,
          isPwa,
          screen: String(parsed.screen || ''),
          provider: parsed.provider ? String(parsed.provider) : undefined,
          fingerprint: [deviceType, deviceLabel, browser, isPwa ? 'pwa' : 'web'].join('|'),
        };
      }
    } catch {
      // ignore malformed metadata and fall back to text inspection
    }
  }

  const details = (log.details || '').trim();
  if (!details || details === 'Panele giriş yaptı') return null;

  const lower = details.toLowerCase();
  const isPwa = lower.includes('pwa') || lower.includes('ana ekran');
  let deviceType: DeviceCategory = 'desktop';
  let deviceLabel = 'Web Cihazı';
  if (lower.includes('iphone')) {
    deviceType = 'mobile';
    deviceLabel = 'iPhone';
  } else if (lower.includes('ipad')) {
    deviceType = 'tablet';
    deviceLabel = 'iPad';
  } else if (lower.includes('android tablet')) {
    deviceType = 'tablet';
    deviceLabel = 'Android Tablet';
  } else if (lower.includes('android')) {
    deviceType = 'mobile';
    deviceLabel = 'Android Telefon';
  } else if (lower.includes('windows 11')) {
    deviceLabel = 'Windows 11 Bilgisayar';
  } else if (lower.includes('windows')) {
    deviceLabel = 'Windows Bilgisayar';
  } else if (lower.includes('mac')) {
    deviceLabel = 'Mac';
  } else {
    return null;
  }

  let browser = 'Tarayıcı';
  for (const candidate of ['Safari', 'Chrome', 'Edge', 'Firefox', 'Opera', 'Samsung Internet']) {
    if (lower.includes(candidate.toLowerCase())) {
      browser = candidate;
      break;
    }
  }

  return {
    deviceType,
    deviceLabel,
    os: '',
    browser,
    isPwa,
    screen: '',
    fingerprint: [deviceType, deviceLabel, browser, isPwa ? 'pwa' : 'web'].join('|'),
  };
};
