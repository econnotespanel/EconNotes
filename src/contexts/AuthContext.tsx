import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { User, Session } from '@supabase/supabase-js';
import { APP_VERSION } from '@/lib/version';
import { rememberReturningAccount } from '@/lib/returningAccount';
import { detectClientDevice, formatLoginDetails, serializeLoginMetadata } from '@/lib/deviceInfo';
import { isLegacyUser, isUserApproved } from '@/lib/approvalUtils';
import { clearAllUserClientState } from '@/lib/sessionCleanup';
import { markFirstLoginDetected } from '@/lib/onboarding';

interface Profile {
  id: string;
  user_id: string;
  full_name: string;
  university: string;
  department: string;
  grade: number | null;
  birth_date?: string | null;
  trivia_unlimited_until?: string | null;
  wheel_bonus_quota?: number | null;
  wheel_unlimited_until?: string | null;
  onboarding_state?: Record<string, unknown> | null;
  avatar_url: string | null;
  approval_status?: 'pending' | 'approved' | 'rejected' | string;
  approved_at?: string | null;
  approved_by?: string | null;
  rejection_reason?: string | null;
  last_login: string | null;
  created_at: string;
  updated_at: string;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  isAdmin: boolean;
  isApproved: boolean;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  profile: null,
  isAdmin: false,
  isApproved: true,
  loading: true,
  signOut: async () => {},
  refreshProfile: async () => {},
});

const INACTIVE_DAYS = 90;
const RETURN_TOUR_VERSION = APP_VERSION;

export const useAuth = () => useContext(AuthContext);

type OAuthNameSource = Pick<User, 'user_metadata' | 'identities' | 'email'>;

const extractNameFromRecord = (rec: Record<string, any> | undefined | null): string => {
  if (!rec || typeof rec !== 'object') return '';
  const nestedName =
    rec.name && typeof rec.name === 'object'
      ? [rec.name.firstName, rec.name.lastName, rec.name.givenName, rec.name.familyName]
          .filter((v) => typeof v === 'string' && v.trim())
          .join(' ')
      : '';
  const candidates = [
    rec.full_name,
    typeof rec.name === 'string' ? rec.name : '',
    nestedName,
    [rec.given_name, rec.family_name].filter((v) => typeof v === 'string' && v.trim()).join(' '),
    [rec.first_name, rec.last_name].filter((v) => typeof v === 'string' && v.trim()).join(' '),
  ];
  return (candidates.find((value) => typeof value === 'string' && value.trim()) || '').trim();
};

const getOAuthFullName = (user: OAuthNameSource, fallback = '') => {
  const metadataName = extractNameFromRecord(user.user_metadata);
  if (metadataName) return metadataName;

  for (const identity of user.identities ?? []) {
    const idName = extractNameFromRecord(identity?.identity_data);
    if (idName) return idName;
  }

  if (fallback.trim()) return fallback.trim();

  const email = user.email || '';
  if (email && !email.toLowerCase().endsWith('@privaterelay.appleid.com')) {
    const prefix = email.split('@')[0]?.trim();
    if (prefix) return prefix;
  }
  return 'EconNotes Kullanıcısı';
};

// Capture OAuth redirect tokens/errors strictly from URL #hash (NEVER from query string to prevent session fixation / log leakage).
const captureInitialOAuthCallback = () => {
  if (typeof window === 'undefined') {
    return {
      tokens: null as { access_token: string; refresh_token: string } | null,
      errorMessage: null as string | null,
      isRecovery: false,
    };
  }
  const hashRaw = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : '';
  const hashParams = new URLSearchParams(hashRaw);
  const searchParams = new URLSearchParams(window.location.search);
  const isRecovery = hashParams.get('type') === 'recovery' || searchParams.get('type') === 'recovery';

  // SECURITY: Never accept bearer tokens from location.search (query string)
  const accessToken = hashParams.get('access_token');
  const refreshToken = hashParams.get('refresh_token');
  const errorCode = hashParams.get('error') || searchParams.get('error');
  const errorDesc = hashParams.get('error_description') || searchParams.get('error_description');

  if (accessToken && refreshToken) {
    return {
      tokens: { access_token: accessToken, refresh_token: refreshToken },
      errorMessage: null,
      isRecovery,
    };
  }
  if (errorCode || errorDesc) {
    return {
      tokens: null,
      errorMessage: errorDesc || errorCode,
      isRecovery,
    };
  }
  return { tokens: null, errorMessage: null, isRecovery };
};

const initialOAuthCallback = captureInitialOAuthCallback();

const cleanOAuthParamsFromUrl = (preserveRecovery = false) => {
  if (typeof window === 'undefined') return;
  try {
    const url = new URL(window.location.href);
    for (const key of ['access_token', 'refresh_token', 'expires_in', 'expires_at', 'token_type', 'provider_token', 'state', 'error', 'error_code', 'error_description']) {
      url.searchParams.delete(key);
    }
    const cleanSearch = url.searchParams.toString();
    const hashSuffix = preserveRecovery ? '#type=recovery' : '';
    const cleanUrl = url.pathname + (cleanSearch ? `?${cleanSearch}` : '') + hashSuffix;
    window.history.replaceState(null, '', cleanUrl);
  } catch {
    // ignore history cleanup errors
  }
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async (
    userId: string,
    detectInactivity = false,
    email?: string,
    fallbackFullName = '',
    authUserOverride?: User | null,
  ): Promise<string> => {
    const authUser = authUserOverride ?? (user?.id === userId ? user : null);
    let resolvedName = fallbackFullName;
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', userId)
      .single();
    if (error && error.code !== 'PGRST116') {
      console.error('Profil yüklenemedi:', error);
    }
    if (data) {
      const profileName = data.full_name?.trim() || getOAuthFullName(authUser ?? { user_metadata: { full_name: fallbackFullName }, identities: [], email }, fallbackFullName);
      if (!data.full_name?.trim() && profileName) {
        await supabase.from('profiles').update({ full_name: profileName }).eq('user_id', userId);
        data.full_name = profileName;
      }
      resolvedName = data.full_name || profileName;
      const previousLogin = data.last_login ? new Date(data.last_login).getTime() : null;
      const inactiveSince = Date.now() - INACTIVE_DAYS * 24 * 60 * 60 * 1000;
      const tourKey = `econnotes_return_tour_${RETURN_TOUR_VERSION}_${userId}`;
      if (previousLogin === null) {
        markFirstLoginDetected(userId);
      }
      if (detectInactivity && previousLogin && previousLogin < inactiveSince && !localStorage.getItem(tourKey)) {
        sessionStorage.setItem('econnotes_return_tour_pending', '1');
      }
      if (detectInactivity && email) {
        await rememberReturningAccount(email, data.full_name || fallbackFullName || '');
      }
      setProfile({ ...data, last_login: new Date().toISOString() } as Profile);
    } else if (authUser || fallbackFullName || email) {
      const profileName = getOAuthFullName(authUser ?? { user_metadata: { full_name: fallbackFullName }, identities: [], email }, fallbackFullName);
      resolvedName = profileName;
      const { data: createdProfile, error: profileError } = await supabase
        .from('profiles')
        .upsert({ user_id: userId, full_name: profileName }, { onConflict: 'user_id' })
        .select('*')
        .single();
      if (profileError) {
        console.error('OAuth profile could not be created:', profileError);
      } else if (createdProfile) {
        markFirstLoginDetected(userId);
        resolvedName = createdProfile.full_name || profileName;
        setProfile({ ...createdProfile, last_login: new Date().toISOString() } as Profile);
      }
    }

    // Derive admin role strictly from server-side RPC / user_roles (default false on failure)
    let resolvedAdmin = false;
    try {
      const { data: rpcAdmin, error: rpcErr } = await supabase.rpc('is_admin', { _user_id: userId });
      if (!rpcErr && typeof rpcAdmin === 'boolean') {
        resolvedAdmin = rpcAdmin;
      } else {
        const { data: roleRows } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', userId);
        if (Array.isArray(roleRows)) {
          resolvedAdmin = roleRows.some((r) => r.role === 'admin');
        }
      }
    } catch {
      resolvedAdmin = false;
    }
    setIsAdmin(resolvedAdmin);
    return resolvedName;
  };

  const refreshProfile = async () => {
    if (user) await fetchProfile(user.id);
  };

  const signOut = async () => {
    await supabase.auth.signOut().catch(() => {});
    await clearAllUserClientState();
    setUser(null);
    setSession(null);
    setProfile(null);
    setIsAdmin(false);
  };

  useEffect(() => {
    let mounted = true;
    let initialized = false;
    const inFlightLoginLog = new Set<string>();

    const recordSignInSideEffects = async (
      signedInUser: User,
      resolvedFullName = '',
      isExplicitSignIn = false,
    ) => {
      if (!inFlightLoginLog.has(signedInUser.id)) {
        inFlightLoginLog.add(signedInUser.id);
        try {
          const provider =
            (signedInUser.app_metadata?.provider as string) ||
            signedInUser.identities?.[0]?.provider ||
            'email';
          const deviceInfo = await detectClientDevice(provider);
          const dedupeKey = `econnotes_device_login_${signedInUser.id}_${deviceInfo.fingerprint}`;
          let loggedAt = 0;
          try {
            loggedAt = Number(localStorage.getItem(dedupeKey) || 0);
          } catch {
            loggedAt = 0;
          }
          const cooldownMs = isExplicitSignIn ? 15_000 : 30 * 60 * 1000;
          if (Date.now() - loggedAt > cooldownMs) {
            const { logActivity } = await import('@/lib/activityLogger');
            const ok = await logActivity(
              signedInUser.id,
              resolvedFullName.trim() || getOAuthFullName(signedInUser),
              signedInUser.email || '',
              'user_login',
              formatLoginDetails(deviceInfo),
              serializeLoginMetadata(deviceInfo),
            );
            if (ok) {
              try {
                localStorage.setItem(dedupeKey, String(Date.now()));
              } catch {
                // ignore storage quota errors
              }
              window.dispatchEvent(new CustomEvent('econnotes:login-recorded'));
            }
          }
        } catch (err) {
          console.warn('Giriş cihaz kaydı oluşturulamadı:', err);
        } finally {
          inFlightLoginLog.delete(signedInUser.id);
        }
      }

      if (isExplicitSignIn) {
        setTimeout(() => {
          (supabase as any).rpc('award_daily_login').then(({ data }: any) => {
            const result = Array.isArray(data) ? data[0] : data;
            if (result && !result.already_claimed && result.awarded > 0) {
              import('sonner').then(({ toast }) => {
                toast.success(`Günlük giriş puanı: +${result.awarded}`, {
                  description: `${result.current_streak} günlük serideysin. Toplam puanın: ${result.points}`,
                });
              });
            }
          });
        }, 400);
      }
    };

    const hydrateSession = async (
      nextSession: Session | null,
      detectInactivity = false,
      isExplicitSignIn = false,
      recordVisit = true,
    ) => {
      if (!mounted) return;
      const previousUid = session?.user?.id ?? null;
      const nextUid = nextSession?.user?.id ?? null;
      if (previousUid && previousUid !== nextUid) {
        await clearAllUserClientState();
      }

      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      if (!nextSession?.user) {
        setProfile(null);
        setIsAdmin(false);
        setLoading(false);
        return;
      }

      // SECURITY: Admin role is resolved exclusively from server-side DB (never hardcoded emails!)
      let resolvedName = getOAuthFullName(nextSession.user);
      try {
        const fetchedName = await fetchProfile(
          nextSession.user.id,
          detectInactivity,
          nextSession.user.email,
          resolvedName,
          nextSession.user,
        );
        if (fetchedName?.trim()) {
          resolvedName = fetchedName.trim();
        }
      } catch (error) {
        console.error('Profil yüklenirken hata:', error);
      } finally {
        if (mounted) {
          setLoading(false);
          if (recordVisit) {
            const nowIso = new Date().toISOString();
            void supabase
              .from('profiles')
              .update({ last_login: nowIso })
              .eq('user_id', nextSession.user.id)
              .select('user_id')
              .then(({ data: updatedRows }) => {
                if (!updatedRows || updatedRows.length === 0) {
                  void supabase
                    .from('profiles')
                    .upsert(
                      {
                        user_id: nextSession.user.id,
                        full_name: resolvedName,
                        last_login: nowIso,
                      },
                      { onConflict: 'user_id' },
                    );
                }
              });
            void recordSignInSideEffects(nextSession.user, resolvedName, isExplicitSignIn);
          }
        }
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, nextSession) => {
        if (!initialized) return;
        if (_event === 'SIGNED_OUT') {
          await clearAllUserClientState();
        }
        setLoading(false);
        const isSignIn = _event === 'SIGNED_IN';
        const shouldRecordVisit = isSignIn || _event === 'INITIAL_SESSION';
        window.setTimeout(() => {
          void hydrateSession(nextSession, isSignIn, isSignIn, shouldRecordVisit);
        }, 0);
      }
    );

    const startupTimeoutMs = initialOAuthCallback.tokens ? 6000 : 2500;
    const authStartupTimer = window.setTimeout(() => {
      if (mounted) {
        setLoading((current) => {
          if (current) {
            console.warn('Oturum başlatma zaman aşımına uğradı, misafir modunda başlatılıyor.');
            return false;
          }
          return current;
        });
      }
    }, startupTimeoutMs);

    if (initialOAuthCallback.errorMessage) {
      const errMsg = initialOAuthCallback.errorMessage;
      initialOAuthCallback.errorMessage = null;
      cleanOAuthParamsFromUrl();
      import('sonner').then(({ toast }) => {
        if (errMsg.toLowerCase().includes('access_denied') || errMsg.toLowerCase().includes('cancel')) {
          toast.info('Sosyal giriş işlemi iptal edildi.');
        } else {
          toast.error('Sosyal giriş tamamlanamadı.', { description: errMsg });
        }
      });
    }

    (async () => {
      try {
        const hadOAuthTokens = Boolean(initialOAuthCallback.tokens);
        const capturedTokens = initialOAuthCallback.tokens;
        initialOAuthCallback.tokens = null;

        let { data: { session: activeSession } } = await supabase.auth.getSession();

        if (!activeSession && capturedTokens) {
          const { data: restored, error: setSessionErr } = await supabase.auth.setSession(capturedTokens);
          if (setSessionErr) {
            console.error('OAuth oturumu kurulamadı:', setSessionErr);
          } else {
            activeSession = restored.session;
          }
        }

        if (hadOAuthTokens) {
          cleanOAuthParamsFromUrl(initialOAuthCallback.isRecovery);
        }

        window.clearTimeout(authStartupTimer);
        await hydrateSession(activeSession, true, hadOAuthTokens, true);
      } catch (error) {
        window.clearTimeout(authStartupTimer);
        console.error('Oturum başlatılamadı:', error);
        if (mounted) setLoading(false);
      } finally {
        initialized = true;
      }
    })();

    return () => {
      mounted = false;
      window.clearTimeout(authStartupTimer);
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`profile-approval-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          if (payload.new) {
            setProfile((prev) => (prev ? { ...prev, ...payload.new } : (payload.new as Profile)));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  const isApproved = isUserApproved(
    profile?.approval_status,
    user?.created_at,
    profile?.created_at,
    isAdmin
  );

  // Önceki kayıtlı kullanıcıların onay durumunu sunucu tarafı RPC üzerinden güvenli senkronize et
  useEffect(() => {
    if (
      user &&
      profile &&
      isLegacyUser(user.created_at, profile.created_at) &&
      profile.approval_status !== 'approved'
    ) {
      void (supabase.rpc as any)('approve_legacy_user_if_eligible').then(
        ({ data, error }: { data?: boolean; error?: unknown }) => {
          if (!error && data === true) {
            setProfile((prev) => (prev ? { ...prev, approval_status: 'approved' } : prev));
          }
        },
      );
    }
  }, [user?.id, user?.created_at, profile?.created_at, profile?.approval_status]);

  return (
    <AuthContext.Provider value={{ user, session, profile, isAdmin, isApproved, loading, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
};
