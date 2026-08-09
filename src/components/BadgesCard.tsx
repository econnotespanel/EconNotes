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
        <p className="text-xs text-muted-foreground">
          Her rozetin kazanılma koşulu ve ilerlemen aşağıda gösterilir. Koşulu tamamladığında rozet otomatik açılır.
        </p>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Skeleton className="h-28 w-full" /><Skeleton className="h-28 w-full" />
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {badges.map(b => {
              const done = b.value >= b.goal;
              const Icon = done ? b.icon : Lock;
              const pct = Math.min(100, Math.round((b.value / b.goal) * 100));
              const left = Math.max(0, b.goal - b.value);
              return (
                <div
                  key={b.key}
                  className={`rounded-xl border p-3 transition-colors ${done ? 'border-primary/40 bg-primary/5' : 'border-border/60 bg-card/50'}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Icon className={`h-4 w-4 ${done ? b.tone : 'text-muted-foreground'}`} />
                      <p className="text-sm font-semibold">{b.label}</p>
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${done ? 'bg-success/15 text-success' : 'bg-muted text-muted-foreground'}`}>
                      {done ? 'Kazanıldı' : 'Kilitli'}
                    </span>
                  </div>
                  <p className="mt-1.5 text-xs font-medium text-foreground/80">Nasıl kazanılır?</p>
                  <p className="text-xs text-muted-foreground">{b.requirement}</p>
                  <Progress value={pct} className="mt-2 h-1.5" />
                  <div className="mt-1 flex items-center justify-between font-mono text-[10px] text-muted-foreground">
                    <span>{pct}% tamamlandı</span>
                    <span>
                      {Math.min(b.value, b.goal)}/{b.goal} {b.unit}
                      {!done && ` · ${left} ${b.unit} kaldı`}
                    </span>
                  </div>
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
