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
  mfaRequired: boolean;
  completeMfa: () => void;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  profile: null,
  isAdmin: false,
  loading: true,
  mfaRequired: false,
  completeMfa: () => {},
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
  const [mfaRequired, setMfaRequired] = useState(false);

  const fetchProfile = async (userId: string, detectInactivity = false, email?: string, fallbackFullName = '') => {
    const authUser = user?.id === userId ? user : null;
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', userId)
      .single();
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
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          const { data: assurance } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
          const requiresMfa = assurance?.nextLevel === 'aal2' && assurance.currentLevel !== 'aal2';
          setMfaRequired(requiresMfa);
          setTimeout(async () => {
            await fetchProfile(session.user.id, _event === 'SIGNED_IN', session.user.email, getOAuthFullName(session.user));
            await supabase.from('profiles').update({ last_login: new Date().toISOString() }).eq('user_id', session.user.id);
          }, 0);
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

        } else {
          setMfaRequired(false);
          setProfile(null);
          setIsAdmin(false);
        }
        setLoading(false);
      }
    );

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        const { data: assurance } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        setMfaRequired(assurance?.nextLevel === 'aal2' && assurance.currentLevel !== 'aal2');
        fetchProfile(session.user.id, false, session.user.email, getOAuthFullName(session.user)).then(() => {
          supabase.from('profiles').update({ last_login: new Date().toISOString() }).eq('user_id', session.user.id).then(() => {});
        });
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ user, session, profile, isAdmin, loading, mfaRequired, completeMfa: () => setMfaRequired(false), signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
};
