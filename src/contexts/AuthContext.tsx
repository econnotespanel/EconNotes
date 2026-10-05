import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { User, Session } from '@supabase/supabase-js';
import { APP_VERSION } from '@/lib/version';

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

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async (userId: string, detectInactivity = false) => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', userId)
      .single();
    if (data) {
      const previousLogin = data.last_login ? new Date(data.last_login).getTime() : null;
      const inactiveSince = Date.now() - INACTIVE_DAYS * 24 * 60 * 60 * 1000;
      const tourKey = `econnotes_return_tour_${RETURN_TOUR_VERSION}_${userId}`;
      if (detectInactivity && previousLogin && previousLogin < inactiveSince && !localStorage.getItem(tourKey)) {
        sessionStorage.setItem('econnotes_return_tour_pending', '1');
      }
      setProfile({ ...data, last_login: new Date().toISOString() } as Profile);
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
          setTimeout(async () => {
            await fetchProfile(session.user.id, _event === 'SIGNED_IN');
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
          setProfile(null);
          setIsAdmin(false);
        }
        setLoading(false);
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id).then(() => {
          supabase.from('profiles').update({ last_login: new Date().toISOString() }).eq('user_id', session.user.id).then(() => {});
        });
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ user, session, profile, isAdmin, loading, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
};
