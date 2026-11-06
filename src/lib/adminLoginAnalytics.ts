import {
  type ClientDeviceInfo,
  detectClientDeviceSync,
  getProviderLabel,
  parseLoginLogDevice,
} from '@/lib/deviceInfo';

export interface AuthAdminUserMeta {
  id: string;
  email: string | null;
  created_at: string;
  last_sign_in_at?: string | null;
  confirmed: boolean;
  provider?: string;
  providers?: string[];
}

export interface UserDeviceRecord extends ClientDeviceInfo {
  lastSeenAt: string;
  firstSeenAt: string;
  loginCount: number;
}

export interface UserLoginEvent {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  createdAt: string;
  details: string;
  device: ClientDeviceInfo | null;
  providerLabel: string;
  isFallbackRecord?: boolean;
}

export interface UserLoginSummary {
  userId: string;
  effectiveLastLogin: string | null;
  lastLoginSource: 'profile' | 'auth' | 'activity' | 'points' | null;
  totalLogins: number;
  devices: UserDeviceRecord[];
  events: UserLoginEvent[];
  providers: string[];
}

export const formatExactDateTime = (iso?: string | null): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
};

export const formatShortDateTime = (iso?: string | null): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const formatRelativeLoginTime = (
  iso?: string | null,
): { label: string; isOnlineNow: boolean; isToday: boolean; isRecentWeek: boolean } => {
  if (!iso) {
    return { label: 'Henüz giriş yok', isOnlineNow: false, isToday: false, isRecentWeek: false };
  }
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) {
    return { label: 'Henüz giriş yok', isOnlineNow: false, isToday: false, isRecentWeek: false };
  }

  const now = new Date();
  const diffMs = Math.max(0, now.getTime() - ts);
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);

  const d = new Date(ts);
  const isSameDay =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    d.getDate() === yesterday.getDate() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getFullYear() === yesterday.getFullYear();

  const timeStr = d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

  if (diffMin < 5) {
    return { label: 'Şu an aktif', isOnlineNow: true, isToday: true, isRecentWeek: true };
  }
  if (diffMin < 15) {
    return { label: `${diffMin} dk önce`, isOnlineNow: true, isToday: true, isRecentWeek: true };
  }
  if (diffMin < 60) {
    return { label: `${diffMin} dk önce`, isOnlineNow: false, isToday: true, isRecentWeek: true };
  }
  if (isSameDay) {
    return { label: `Bugün ${timeStr}`, isOnlineNow: false, isToday: true, isRecentWeek: true };
  }
  if (isYesterday) {
    return { label: `Dün ${timeStr}`, isOnlineNow: false, isToday: false, isRecentWeek: true };
  }
  if (diffDays < 7) {
    return { label: `${diffDays} gün önce`, isOnlineNow: false, isToday: false, isRecentWeek: true };
  }
  if (diffDays < 30) {
    return { label: `${diffDays} gün önce`, isOnlineNow: false, isToday: false, isRecentWeek: false };
  }
  if (diffHours > 0) {
    const months = Math.max(1, Math.floor(diffDays / 30));
    return {
      label: months < 12 ? `${months} ay önce` : `${Math.floor(months / 12)} yıl önce`,
      isOnlineNow: false,
      isToday: false,
      isRecentWeek: false,
    };
  }
  return { label: timeStr, isOnlineNow: false, isToday: isSameDay, isRecentWeek: diffDays < 7 };
};

interface BuildLoginAnalyticsParams {
  users: any[];
  userEmails: Record<string, string>;
  authMetaByUserId: Record<string, AuthAdminUserMeta>;
  loginLogs: any[];
  activityLogs: any[];
  userPoints: any[];
  currentUserId?: string;
}

const isValidIso = (value?: string | null): value is string => {
  if (!value || typeof value !== 'string') return false;
  const t = new Date(value).getTime();
  return !Number.isNaN(t) && t > 0;
};

export const buildLoginAnalytics = ({
  users,
  userEmails,
  authMetaByUserId,
  loginLogs,
  activityLogs,
  userPoints,
  currentUserId,
}: BuildLoginAnalyticsParams): {
  summariesByUserId: Record<string, UserLoginSummary>;
  allEvents: UserLoginEvent[];
} => {
  const loginLogsByUser = new Map<string, any[]>();
  for (const log of loginLogs) {
    if (!log?.user_id) continue;
    const arr = loginLogsByUser.get(log.user_id) || [];
    arr.push(log);
    loginLogsByUser.set(log.user_id, arr);
  }

  const latestAnyActivityByUser = new Map<string, string>();
  for (const log of activityLogs) {
    if (!log?.user_id || !isValidIso(log.created_at)) continue;
    const prev = latestAnyActivityByUser.get(log.user_id);
    if (!prev || new Date(log.created_at).getTime() > new Date(prev).getTime()) {
      latestAnyActivityByUser.set(log.user_id, log.created_at);
    }
  }

  const pointsByUser = new Map<string, any>();
  for (const row of userPoints) {
    if (row?.user_id) pointsByUser.set(row.user_id, row);
  }

  const userById = new Map<string, any>();
  for (const u of users) {
    if (u?.user_id) userById.set(u.user_id, u);
  }

  const summariesByUserId: Record<string, UserLoginSummary> = {};
  const allEvents: UserLoginEvent[] = [];

  // Process all known users (plus any user_id present in loginLogs)
  const allUserIds = new Set<string>([
    ...Array.from(userById.keys()),
    ...Array.from(loginLogsByUser.keys()),
  ]);

  for (const userId of allUserIds) {
    const profile = userById.get(userId);
    const authMeta = authMetaByUserId[userId];
    const rawUserLogs = (loginLogsByUser.get(userId) || []).slice().sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
    const pointsRow = pointsByUser.get(userId);
    const displayEmail = userEmails[userId] || authMeta?.email || rawUserLogs[0]?.user_email || '';
    const displayName =
      profile?.full_name?.trim() ||
      rawUserLogs[0]?.user_name?.trim() ||
      (displayEmail ? displayEmail.split('@')[0] : 'Kullanıcı');

    const providerSet = new Set<string>();
    if (authMeta?.providers?.length) {
      authMeta.providers.forEach((p) => {
        const lbl = getProviderLabel(p);
        if (lbl) providerSet.add(lbl);
      });
    } else if (authMeta?.provider) {
      const lbl = getProviderLabel(authMeta.provider);
      if (lbl) providerSet.add(lbl);
    }

    const deviceMap = new Map<string, UserDeviceRecord>();
    const userEvents: UserLoginEvent[] = [];

    for (const log of rawUserLogs) {
      const parsedDevice = parseLoginLogDevice(log);
      if (parsedDevice?.provider) {
        const lbl = getProviderLabel(parsedDevice.provider);
        if (lbl) providerSet.add(lbl);
      }

      const eventProvider =
        getProviderLabel(parsedDevice?.provider) ||
        getProviderLabel(authMeta?.provider) ||
        '';

      const event: UserLoginEvent = {
        id: log.id,
        userId,
        userName: displayName,
        userEmail: displayEmail,
        createdAt: log.created_at,
        details: log.details || 'Panele giriş yaptı',
        device: parsedDevice,
        providerLabel: eventProvider,
      };
      userEvents.push(event);
      allEvents.push(event);

      if (parsedDevice) {
        const existing = deviceMap.get(parsedDevice.fingerprint);
        if (!existing) {
          deviceMap.set(parsedDevice.fingerprint, {
            ...parsedDevice,
            lastSeenAt: log.created_at,
            firstSeenAt: log.created_at,
            loginCount: 1,
          });
        } else {
          existing.loginCount += 1;
          if (new Date(log.created_at).getTime() > new Date(existing.lastSeenAt).getTime()) {
            existing.lastSeenAt = log.created_at;
          }
          if (new Date(log.created_at).getTime() < new Date(existing.firstSeenAt).getTime()) {
            existing.firstSeenAt = log.created_at;
          }
        }
      }
    }

    // Current online admin's live device fallback if insert is still in-flight
    if (currentUserId && userId === currentUserId && deviceMap.size === 0) {
      const liveDevice = detectClientDeviceSync(authMeta?.provider);
      const nowIso = new Date().toISOString();
      deviceMap.set(liveDevice.fingerprint, {
        ...liveDevice,
        lastSeenAt: nowIso,
        firstSeenAt: nowIso,
        loginCount: 1,
      });
    }

    // Determine effectiveLastLogin across all trusted sources
    const candidates: Array<{ ts: string; source: 'profile' | 'auth' | 'activity' | 'points' }> = [];
    if (isValidIso(profile?.last_login)) {
      candidates.push({ ts: profile.last_login, source: 'profile' });
    }
    if (isValidIso(authMeta?.last_sign_in_at)) {
      candidates.push({ ts: authMeta.last_sign_in_at!, source: 'auth' });
    }
    if (isValidIso(rawUserLogs[0]?.created_at)) {
      candidates.push({ ts: rawUserLogs[0].created_at, source: 'activity' });
    }
    const anyActTs = latestAnyActivityByUser.get(userId);
    if (isValidIso(anyActTs)) {
      candidates.push({ ts: anyActTs, source: 'activity' });
    }
    if (candidates.length === 0 && pointsRow && Number(pointsRow.total_logins) > 0) {
      if (isValidIso(pointsRow.updated_at)) {
        candidates.push({ ts: pointsRow.updated_at, source: 'points' });
      } else if (pointsRow.last_login_date) {
        const fallbackDate = `${pointsRow.last_login_date}T12:00:00.000Z`;
        if (isValidIso(fallbackDate)) {
          candidates.push({ ts: fallbackDate, source: 'points' });
        }
      }
    }

    candidates.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
    const best = candidates[0] || null;

    // If user has a known last login (e.g. from profiles.last_login or auth.users.last_sign_in_at)
    // that is newer than or absent from activity_logs, synthesize a clean timeline item so no user's login is hidden.
    const newestLoggedMs = userEvents[0] ? new Date(userEvents[0].createdAt).getTime() : 0;
    const bestMs = best ? new Date(best.ts).getTime() : 0;
    if (best && (userEvents.length === 0 || bestMs - newestLoggedMs > 10 * 60 * 1000)) {
      const liveDevice =
        currentUserId && userId === currentUserId
          ? detectClientDeviceSync(authMeta?.provider)
          : null;
      const fallbackEvent: UserLoginEvent = {
        id: `fallback-${userId}-${best.ts}`,
        userId,
        userName: displayName,
        userEmail: displayEmail,
        createdAt: best.ts,
        details: liveDevice
          ? `${liveDevice.deviceLabel} · ${liveDevice.browser}`
          : 'Son oturum kaydı (cihaz detayı sonraki girişte eklenecek)',
        device: liveDevice,
        providerLabel: getProviderLabel(authMeta?.provider) || Array.from(providerSet)[0] || '',
        isFallbackRecord: !liveDevice,
      };
      userEvents.unshift(fallbackEvent);
      allEvents.push(fallbackEvent);
    }

    const devices = Array.from(deviceMap.values()).sort(
      (a, b) => new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime(),
    );

    const totalLogins = Math.max(
      rawUserLogs.length,
      Number(pointsRow?.total_logins || 0),
      best ? 1 : 0,
    );

    summariesByUserId[userId] = {
      userId,
      effectiveLastLogin: best?.ts ?? null,
      lastLoginSource: best?.source ?? null,
      totalLogins,
      devices,
      events: userEvents,
      providers: Array.from(providerSet),
    };
  }

  allEvents.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return { summariesByUserId, allEvents };
};
