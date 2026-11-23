import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface PointsState {
  points: number;
  current_streak: number;
  longest_streak: number;
  total_logins: number;
  last_login_date: string | null;
}

export interface LeaderboardRow {
  user_id: string;
  full_name: string;
  avatar_url: string | null;
  university: string | null;
  points: number;
  current_streak: number;
  total_logins: number;
  rank: number;
}

/** Reads the signed-in user's point balance and the live global leaderboard from Supabase. */
export const usePoints = (leaderboardLimit = 10) => {
  const { user } = useAuth();
  const [points, setPoints] = useState<PointsState | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const hasLoadedRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!user) {
      setPoints(null);
      setLeaderboard([]);
      setLoading(false);
      return;
    }
    if (!hasLoadedRef.current) {
      setLoading(true);
    }
    try {
      const [own, board] = await Promise.all([
        supabase.from('user_points' as any).select('*').eq('user_id', user.id).maybeSingle(),
        (supabase as any).rpc('get_leaderboard', { _limit: leaderboardLimit }),
      ]);
      if (own.error) console.error('Puan bilgisi yüklenemedi:', own.error);
      if (board.error) console.error('Liderlik tablosu yüklenemedi:', board.error);
      setPoints(own.data ? (own.data as unknown as PointsState) : null);
      setLeaderboard(Array.isArray(board.data) ? (board.data as LeaderboardRow[]) : []);
    } catch (error) {
      console.error('Puan verileri alınamadı:', error);
      setPoints(null);
      setLeaderboard([]);
    } finally {
      hasLoadedRef.current = true;
      setLoading(false);
    }
  }, [user, leaderboardLimit]);

  useEffect(() => {
    hasLoadedRef.current = false;
    void refresh();
    const onPointsEvent = () => {
      void refresh();
    };
    window.addEventListener('econnotes:points-updated', onPointsEvent);
    window.addEventListener('econnotes:trivia-updated', onPointsEvent);
    window.addEventListener('econnotes:wheel-updated', onPointsEvent);
    return () => {
      window.removeEventListener('econnotes:points-updated', onPointsEvent);
      window.removeEventListener('econnotes:trivia-updated', onPointsEvent);
      window.removeEventListener('econnotes:wheel-updated', onPointsEvent);
    };
  }, [refresh]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`user-points-sync-${user.id}-${leaderboardLimit}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'user_points', filter: `user_id=eq.${user.id}` },
        () => {
          void refresh();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, leaderboardLimit, refresh]);

  return { points, leaderboard, loading, refresh };
};

/** Awards points for an in-app action. Fails silently — points are a bonus. */
export const awardPoints = async (reason: string, amount: number) => {
  try {
    const { data, error } = await (supabase as any).rpc('award_points', { _reason: reason, _amount: amount });
    if (error) return null;
    if (typeof window !== 'undefined' && data != null) {
      window.dispatchEvent(new CustomEvent('econnotes:points-updated'));
    }
    return data as number | null;
  } catch {
    return null;
  }
};
