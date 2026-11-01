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

const getOAuthFullName = (user: OAuthNameSource, fallback = '') => {
  const metadata = user.user_metadata ?? {};
  const metadataName = [
    metadata.full_name,
    metadata.name,
    [metadata.given_name, metadata.family_name].filter(Boolean).join(' '),
  ].find((value) => typeof value === 'string' && value.trim());
  const identityData = user.identities?.[0]?.identity_data ?? {};
  const identityName = [
    identityData.full_name,
    identityData.name,
    [identityData.given_name, identityData.family_name].filter(Boolean).join(' '),
  ].find((value) => typeof value === 'string' && value.trim());
  return String(metadataName || identityName || fallback || user.email?.split('@')[0] || 'EconNotes kullanıcısı').trim();
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
      setProfile(null);
      setIsAdmin(false);
      if (!nextSession?.user) {
        setLoading(false);
        return;
      }

      // Auth session is enough to render the application. Profile/role data is
      // hydrated in the background so a slow database cannot lock the whole app.
      setLoading(false);
      void fetchProfile(
          nextSession.user.id,
          detectInactivity,
          nextSession.user.email,
          getOAuthFullName(nextSession.user),
          nextSession.user,
        ).then(() => supabase.from('profiles').update({ last_login: new Date().toISOString() }).eq('user_id', nextSession.user.id))
        .catch((error) => console.error('Profil arka planda yüklenemedi:', error));
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (!initialized) return;
        setLoading(false);
        window.setTimeout(() => { void hydrateSession(session, _event === 'SIGNED_IN'); }, 0);
        if (session?.user) {
          if (_event === 'SIGNED_IN') {
            import('@/lib/activityLogger').then(({ logActivity }) => {
              logActivity(session.user.id, session.user.user_metadata?.full_name || '', session.user.email || '', 'user_login', 'Panele giriş yaptı');
            });
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

        }
      }
    );

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      await hydrateSession(session);
      initialized = true;
    }).catch((error) => {
      console.error('Oturum başlatılamadı:', error);
      if (mounted) setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, session, profile, isAdmin, loading, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
};
