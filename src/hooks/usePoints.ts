import { useCallback, useEffect, useState } from 'react';
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

/** Reads the signed-in user's point balance and the global leaderboard. */
export const usePoints = (leaderboardLimit = 10) => {
  const { user } = useAuth();
  const [points, setPoints] = useState<PointsState | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    setLoading(true);
    try {
      const [own, board] = await Promise.all([
        supabase.from('user_points' as any).select('*').eq('user_id', user.id).maybeSingle(),
        (supabase as any).rpc('get_leaderboard', { _limit: leaderboardLimit }),
      ]);
      if (own.error) console.error('Puan bilgisi yüklenemedi:', own.error);
      if (board.error) console.error('Liderlik tablosu yüklenemedi:', board.error);
      setPoints(own.data ? own.data as unknown as PointsState : null);
      setLeaderboard(board.data || []);
    } catch (error) {
      console.error('Puan verileri alınamadı:', error);
      setPoints(null);
      setLeaderboard([]);
    } finally {
      setLoading(false);
    }
  }, [user, leaderboardLimit]);

  useEffect(() => { refresh(); }, [refresh]);

  return { points, leaderboard, loading, refresh };
};

/** Awards points for an in-app action. Fails silently — points are a bonus. */
export const awardPoints = async (reason: string, amount: number) => {
  try {
    const { data } = await (supabase as any).rpc('award_points', { _reason: reason, _amount: amount });
    return data as number | null;
  } catch {
    return null;
  }
};
