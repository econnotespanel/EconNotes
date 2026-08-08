import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Award, Lock } from 'lucide-react';
import { buildBadges, type BadgeDef } from '@/lib/gamification';

/** Achievement badges derived from streaks, attempts, goals and uploads. */
const BadgesCard = () => {
  const { user } = useAuth();
  const [badges, setBadges] = useState<BadgeDef[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const run = async () => {
      if (!user) { setLoading(false); return; }
      const [pts, attempts, goals, notes] = await Promise.all([
        supabase.from('user_points').select('*').eq('user_id', user.id).maybeSingle(),
        supabase.from('kpss_attempts').select('id').eq('user_id', user.id),
        supabase.from('kpss_goals').select('completed_at').eq('user_id', user.id),
        supabase.from('notes').select('id').eq('user_id', user.id),
      ]);
      const p: any = pts.data || {};
      setBadges(buildBadges({
        points: p.points ?? 0,
        currentStreak: p.current_streak ?? 0,
        longestStreak: p.longest_streak ?? 0,
        totalLogins: p.total_logins ?? 0,
        attempts: (attempts.data || []).length,
        goalsCompleted: ((goals.data as any[]) || []).filter(g => g.completed_at).length,
        notes: (notes.data || []).length,
      }));
      setLoading(false);
    };
    void run();
  }, [user]);

  const unlocked = badges.filter(b => b.value >= b.goal).length;

  return (
    <Card className="glass-card">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-lg">
          <span className="flex items-center gap-2"><Award className="h-5 w-5 text-primary" /> Rozetlerim</span>
          <span className="font-mono text-xs text-muted-foreground">{unlocked}/{badges.length}</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Skeleton className="h-20 w-full" /><Skeleton className="h-20 w-full" />
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {badges.map(b => {
              const done = b.value >= b.goal;
              const Icon = done ? b.icon : Lock;
              return (
                <div
                  key={b.key}
                  className={`rounded-xl border p-3 transition-colors ${done ? 'border-primary/40 bg-primary/5' : 'border-border/60 bg-card/50 opacity-80'}`}
                >
                  <div className="flex items-center gap-2">
                    <Icon className={`h-4 w-4 ${done ? b.tone : 'text-muted-foreground'}`} />
                    <p className="text-sm font-semibold">{b.label}</p>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{b.description}</p>
                  <Progress value={Math.min(100, (b.value / b.goal) * 100)} className="mt-2 h-1.5" />
                  <p className="mt-1 text-right font-mono text-[10px] text-muted-foreground">
                    {Math.min(b.value, b.goal)}/{b.goal}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default BadgesCard;
