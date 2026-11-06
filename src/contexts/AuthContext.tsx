import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { User, Session } from '@supabase/supabase-js';
import { APP_VERSION } from '@/lib/version';
import { rememberReturningAccount } from '@/lib/returningAccount';

interface Profile {
  id: string;
  user_id: string;
  full_name: string;
  university: string;
  department: string;
  grade: number | null;
  avatar_url: string | null;
  last_login: string | null;
  created_at: string;
  updated_at: string;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  isAdmin: boolean;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  profile: null,
  isAdmin: false,
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

// Capture OAuth redirect tokens/errors synchronously before React Router mounts and mutates location.hash.
const captureInitialOAuthCallback = () => {
  if (typeof window === 'undefined') {
    return { tokens: null as { access_token: string; refresh_token: string } | null, errorMessage: null as string | null };
  }
  const hashRaw = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : '';
  const hashParams = new URLSearchParams(hashRaw);
  const searchParams = new URLSearchParams(window.location.search);

  const accessToken = hashParams.get('access_token') || searchParams.get('access_token');
  const refreshToken = hashParams.get('refresh_token') || searchParams.get('refresh_token');
  const errorCode = hashParams.get('error') || searchParams.get('error');
  const errorDesc = hashParams.get('error_description') || searchParams.get('error_description');

  if (accessToken && refreshToken) {
    return {
      tokens: { access_token: accessToken, refresh_token: refreshToken },
      errorMessage: null,
    };
  }
  if (errorCode || errorDesc) {
    return {
      tokens: null,
      errorMessage: errorDesc || errorCode,
    };
  }
  return { tokens: null, errorMessage: null };
};

const initialOAuthCallback = captureInitialOAuthCallback();

const cleanOAuthParamsFromUrl = () => {
  if (typeof window === 'undefined') return;
  try {
    const url = new URL(window.location.href);
    for (const key of ['access_token', 'refresh_token', 'expires_in', 'expires_at', 'token_type', 'provider_token', 'state', 'error', 'error_code', 'error_description']) {
      url.searchParams.delete(key);
    }
    const cleanSearch = url.searchParams.toString();
    const cleanUrl = url.pathname + (cleanSearch ? `?${cleanSearch}` : '');
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

  const fetchProfile = async (userId: string, detectInactivity = false, email?: string, fallbackFullName = '', authUserOverride?: User | null) => {
    const authUser = authUserOverride ?? (user?.id === userId ? user : null);
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
      const previousLogin = data.last_login ? new Date(data.last_login).getTime() : null;
      const inactiveSince = Date.now() - INACTIVE_DAYS * 24 * 60 * 60 * 1000;
      const tourKey = `econnotes_return_tour_${RETURN_TOUR_VERSION}_${userId}`;
      if (detectInactivity && previousLogin && previousLogin < inactiveSince && !localStorage.getItem(tourKey)) {
        sessionStorage.setItem('econnotes_return_tour_pending', '1');
      }
      if (detectInactivity && email) {
        await rememberReturningAccount(email, data.full_name || fallbackFullName || '');
      }
      setProfile({ ...data, last_login: new Date().toISOString() } as Profile);
    } else if (authUser || fallbackFullName || email) {
      const profileName = getOAuthFullName(authUser ?? { user_metadata: { full_name: fallbackFullName }, identities: [], email }, fallbackFullName);
      const { data: createdProfile, error: profileError } = await supabase
        .from('profiles')
        .upsert({ user_id: userId, full_name: profileName }, { onConflict: 'user_id' })
        .select('*')
        .single();
      if (profileError) {
        console.error('OAuth profile could not be created:', profileError);
      } else if (createdProfile) {
        setProfile({ ...createdProfile, last_login: new Date().toISOString() } as Profile);
      }
    }

    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .single();
    if (roleData) setIsAdmin(roleData.role === 'admin');
  };

  const refreshProfile = async () => {
    if (user) await fetchProfile(user.id);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setProfile(null);
    setIsAdmin(false);
  };

  useEffect(() => {
    let mounted = true;
    let initialized = false;
    const hydrateSession = async (nextSession: Session | null, detectInactivity = false) => {
      if (!mounted) return;
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      if (!nextSession?.user) {
        setProfile(null);
        setIsAdmin(false);
        setLoading(false);
        return;
      }

      // Ana yönetici hesapları için gecikmesiz anlık yetki tanımlaması
      const email = nextSession.user.email?.toLowerCase();
      const isDesignatedAdmin = email === 'kaancolakogullari1@gmail.com' ||
        email === 'kaancolakogullari9@gmail.com' ||
        email === 'econnotespanel@gmail.com';
      if (isDesignatedAdmin) {
        setIsAdmin(true);
      }

      try {
        await fetchProfile(
          nextSession.user.id,
          detectInactivity,
          nextSession.user.email,
          getOAuthFullName(nextSession.user),
          nextSession.user,
        );
      } catch (error) {
        console.error('Profil yüklenirken hata:', error);
      } finally {
        if (mounted) {
          setLoading(false);
          void supabase
            .from('profiles')
            .update({ last_login: new Date().toISOString() })
            .eq('user_id', nextSession.user.id);
        }
      }
    };

    const recordSignInSideEffects = (signedInUser: User) => {
      const activityKey = `econnotes_login_logged_${signedInUser.id}`;
      const loggedAt = Number(localStorage.getItem(activityKey) || 0);
      if (Date.now() - loggedAt > 60 * 60 * 1000) {
        localStorage.setItem(activityKey, String(Date.now()));
        import('@/lib/activityLogger').then(({ logActivity }) => {
          void logActivity(
            signedInUser.id,
            getOAuthFullName(signedInUser),
            signedInUser.email || '',
            'user_login',
            'Panele giriş yaptı',
          );
        });
      }
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
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (!initialized) return;
        setLoading(false);
        window.setTimeout(() => { void hydrateSession(session, _event === 'SIGNED_IN'); }, 0);
        if (session?.user && _event === 'SIGNED_IN') {
          recordSignInSideEffects(session.user);
        }
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
          cleanOAuthParamsFromUrl();
        }

        window.clearTimeout(authStartupTimer);
        await hydrateSession(activeSession, hadOAuthTokens);
        if (hadOAuthTokens && activeSession?.user) {
          recordSignInSideEffects(activeSession.user);
        }
        initialized = true;
      } catch (error) {
        window.clearTimeout(authStartupTimer);
        console.error('Oturum başlatılamadı:', error);
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
      window.clearTimeout(authStartupTimer);
      subscription.unsubscribe();
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, session, profile, isAdmin, loading, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
};
