import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

/**
 * Monitors penalties for the active logged-in user in real-time.
 * If an admin issues a penalty or ban, the user is immediately evicted
 * from the platform, logged out, and redirected to login with full details.
 */
export const UserPenaltyMonitor = () => {
  const { user, isAdmin, signOut } = useAuth();
  const checkingRef = useRef(false);

  useEffect(() => {
    if (!user || isAdmin) return;

    const verifyPenalty = async () => {
      if (checkingRef.current) return;
      checkingRef.current = true;
      try {
        const { data, error } = await supabase
          .from('penalties')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(1);

        if (error) {
          console.warn('Penalty check error:', error);
          return;
        }

        if (data && data.length > 0) {
          const latest = data[0];
          const now = new Date();
          const isPerm = Boolean(latest.is_permanent);
          const until = latest.penalty_until ? new Date(latest.penalty_until) : null;

          if (isPerm || (until && until > now)) {
            // User has an active penalty/ban: Evict immediately!
            try {
              sessionStorage.setItem('econnotes_active_penalty', JSON.stringify({
                reason: latest.reason || 'Topluluk kuralları ihlali',
                until: latest.penalty_until,
                is_permanent: isPerm,
                warning_number: latest.warning_number || 1,
                created_at: latest.created_at,
                evicted: true,
              }));
            } catch (storageErr) {
              console.warn('sessionStorage error:', storageErr);
            }

            toast.error('Hesap Erişimi Kısıtlandı', {
              description: `Ceza sebebi: ${latest.reason || 'Kurallara uygun değil'}. Oturumunuz sonlandırıldı.`,
              duration: 8000,
            });

            await signOut().catch(() => {});
            window.location.replace('/login');
          }
        }
      } catch (err) {
        console.warn('Penalty monitor exception:', err);
      } finally {
        checkingRef.current = false;
      }
    };

    // 1. Initial check
    void verifyPenalty();

    // 2. Realtime subscription on penalties table & direct broadcast channel
    const channelName = `penalty-monitor-${user.id}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'penalties',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          void verifyPenalty();
        }
      )
      .on('broadcast', { event: 'evict' }, () => {
        void verifyPenalty();
      })
      .subscribe();

    // 3. Periodic heartbeat check (every 15 seconds)
    const interval = setInterval(() => {
      void verifyPenalty();
    }, 15000);

    // 4. Tab visibility / focus check
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void verifyPenalty();
      }
    };
    window.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleVisibilityChange);

    return () => {
      clearInterval(interval);
      window.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleVisibilityChange);
      void supabase.removeChannel(channel);
    };
  }, [user?.id, isAdmin]);

  return null;
};

export default UserPenaltyMonitor;
