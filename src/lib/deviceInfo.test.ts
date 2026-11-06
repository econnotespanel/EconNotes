import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  detectClientDevice,
  detectClientDeviceSync,
  formatLoginDetails,
  parseLoginLogDevice,
  serializeLoginMetadata,
} from '@/lib/deviceInfo';
import { buildLoginAnalytics } from '@/lib/adminLoginAnalytics';

describe('deviceInfo & adminLoginAnalytics', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('parses iPhone Safari and round-trips structured metadata via entity_type', () => {
    vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
    );
    vi.spyOn(window.navigator, 'platform', 'get').mockReturnValue('iPhone');

    const info = detectClientDeviceSync('apple');
    expect(info.deviceType).toBe('mobile');
    expect(info.deviceLabel).toBe('iPhone');
    expect(info.os).toBe('iOS 18.1');
    expect(info.browser).toBe('Safari');

    const details = formatLoginDetails(info);
    const meta = serializeLoginMetadata(info);
    expect(meta.startsWith('login_device:')).toBe(true);

    const parsed = parseLoginLogDevice({
      action: 'user_login',
      details,
      entity_type: meta,
    });
    expect(parsed).not.toBeNull();
    expect(parsed?.deviceLabel).toBe('iPhone');
    expect(parsed?.os).toBe('iOS 18.1');
    expect(parsed?.browser).toBe('Safari');
    expect(parsed?.provider).toBe('apple');
  });

  it('detects Windows 11 via high-entropy Client Hints when available', async () => {
    vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0',
    );
    Object.defineProperty(window.navigator, 'userAgentData', {
      configurable: true,
      value: {
        brands: [{ brand: 'Microsoft Edge', version: '131' }],
        mobile: false,
        platform: 'Windows',
        getHighEntropyValues: async () => ({
          platform: 'Windows',
          platformVersion: '15.0.0',
          model: '',
        }),
      },
    });

    const info = await detectClientDevice('google');
    expect(info.deviceType).toBe('desktop');
    expect(info.os).toBe('Windows 11');
    expect(info.browser).toBe('Edge');
    expect(info.provider).toBe('google');
  });

  it('recovers missing profiles.last_login from auth.users.last_sign_in_at and aggregates devices', () => {
    const nowIso = new Date().toISOString();
    const hourAgoIso = new Date(Date.now() - 3600_000).toISOString();

    const iphoneMeta = serializeLoginMetadata({
      deviceType: 'mobile',
      deviceLabel: 'iPhone',
      os: 'iOS 18.1',
      browser: 'Safari',
      isPwa: true,
      screen: '390x844',
      provider: 'apple',
      fingerprint: 'mobile|iPhone|iOS 18.1|Safari|pwa',
    });

    const winMeta = serializeLoginMetadata({
      deviceType: 'desktop',
      deviceLabel: 'Windows Bilgisayar',
      os: 'Windows 11',
      browser: 'Chrome',
      isPwa: false,
      screen: '1920x1080',
      provider: 'google',
      fingerprint: 'desktop|Windows Bilgisayar|Windows 11|Chrome|web',
    });

    const { summariesByUserId, allEvents } = buildLoginAnalytics({
      users: [
        { user_id: 'u-null-login', full_name: 'Zeynep Demir', last_login: null, created_at: hourAgoIso },
        { user_id: 'u-two-devices', full_name: 'Ahmet Çelik', last_login: nowIso, created_at: hourAgoIso },
      ],
      userEmails: {
        'u-null-login': 'zeynep@ogr.duzce.edu.tr',
        'u-two-devices': 'ahmet@ogr.duzce.edu.tr',
      },
      authMetaByUserId: {
        'u-null-login': {
          id: 'u-null-login',
          email: 'zeynep@ogr.duzce.edu.tr',
          created_at: hourAgoIso,
          last_sign_in_at: hourAgoIso,
          confirmed: true,
          provider: 'google',
          providers: ['google'],
        },
      },
      loginLogs: [
        {
          id: 'l1',
          user_id: 'u-two-devices',
          user_name: 'Ahmet Çelik',
          user_email: 'ahmet@ogr.duzce.edu.tr',
          action: 'user_login',
          created_at: nowIso,
          details: 'iPhone · iOS 18.1 · Safari · PWA Uygulama',
          entity_type: iphoneMeta,
        },
        {
          id: 'l2',
          user_id: 'u-two-devices',
          user_name: 'Ahmet Çelik',
          user_email: 'ahmet@ogr.duzce.edu.tr',
          action: 'user_login',
          created_at: hourAgoIso,
          details: 'Windows Bilgisayar · Windows 11 · Chrome',
          entity_type: winMeta,
        },
      ],
      activityLogs: [],
      userPoints: [],
    });

    expect(summariesByUserId['u-null-login'].effectiveLastLogin).toBe(hourAgoIso);
    expect(summariesByUserId['u-null-login'].lastLoginSource).toBe('auth');
    expect(summariesByUserId['u-null-login'].providers).toContain('Google');

    expect(summariesByUserId['u-two-devices'].devices).toHaveLength(2);
    expect(summariesByUserId['u-two-devices'].devices[0].deviceLabel).toBe('iPhone');
    expect(summariesByUserId['u-two-devices'].devices[0].isPwa).toBe(true);
    expect(summariesByUserId['u-two-devices'].devices[1].deviceLabel).toBe('Windows Bilgisayar');
    expect(allEvents.length).toBeGreaterThanOrEqual(3);
  });
});
