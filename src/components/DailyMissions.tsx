import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { CheckCircle2, Gift, ListChecks, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { awardPoints } from '@/hooks/usePoints';
import { missionReason, missionsForWeek, todayKey, weekKey, type MissionDef } from '@/lib/gamification';
import LoadingMessage from '@/components/ui/loading-message';

interface Progressed extends MissionDef {
  current: number;
  done: boolean;
  claimed: boolean;
}

/** Weekly-rotating daily mini missions with a one-time bonus per mission per day. */
const DailyMissions = () => {
  const { user } = useAuth();
  const [rows, setRows] = useState<Progressed[]>([]);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    const day = todayKey();
    const since = new Date(`${day}T00:00:00+03:00`).toISOString();

    const [points, attempts, kpssMat, studyMat, notes, events] = await Promise.all([
      supabase.from('user_points').select('last_login_date').eq('user_id', user.id).maybeSingle(),
      supabase.from('kpss_attempts').select('id').eq('user_id', user.id).gte('created_at', since),
      supabase.from('kpss_materials').select('id').eq('user_id', user.id).gte('created_at', since),
      supabase.from('study_materials').select('id').eq('user_id', user.id).gte('created_at', since),
      supabase.from('notes').select('id').eq('user_id', user.id).gte('created_at', since),
      supabase.from('point_events').select('amount, reason').eq('user_id', user.id).gte('created_at', since),
    ]);

    const evs = (events.data as any[]) || [];
    const earned = evs.filter(e => !String(e.reason).startsWith('mission:')).reduce((s, e) => s + e.amount, 0);
    const claimedKeys = new Set(evs.filter(e => String(e.reason).startsWith('mission:')).map(e => String(e.reason)));

    const counts: Record<string, number> = {
      login: (points.data as any)?.last_login_date === day ? 1 : 0,
      attempt: (attempts.data || []).length,
      material: (kpssMat.data || []).length + (studyMat.data || []).length,
      note: (notes.data || []).length,
      points: earned,
    };

    setRows(missionsForWeek().map(m => {
      const current = Math.min(counts[m.metric] ?? 0, m.target);
      return { ...m, current, done: current >= m.target, claimed: claimedKeys.has(missionReason(m.key, day)) };
    }));
    setLoading(false);
  }, [user]);

  useEffect(() => { void load(); }, [load]);

  const claim = async (m: Progressed) => {
    setClaiming(m.key);
    const res = await awardPoints(missionReason(m.key), m.reward);
    setClaiming(null);
    if (res == null) { toast.error('Bonus alınamadı, tekrar deneyin.'); return; }
    toast.success(`Görev tamamlandı. +${m.reward} bonus puan.`, { description: `Toplam puanın: ${res}` });
    void load();
  };

  const completed = rows.filter(r => r.claimed).length;

  return (
    <Card className="glass-card">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-base">
          <span className="flex items-center gap-2"><ListChecks className="h-4 w-4 text-primary" /> Günlük Mini Görevler</span>
          <span className="font-mono text-[11px] text-muted-foreground">{weekKey()} · {completed}/{rows.length}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <>
            <LoadingMessage />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </>
        ) : rows.map(m => (
          <div key={m.key} className="rounded-xl border border-border/70 bg-card/60 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{m.label}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">Ödül: +{m.reward} puan · {m.current}/{m.target}</p>
              </div>
              {m.claimed ? (
                <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-success">
                  <CheckCircle2 className="h-4 w-4" /> Alındı
                </span>
              ) : (
                <Button size="sm" className="shrink-0 gap-1.5" disabled={!m.done || claiming === m.key} onClick={() => void claim(m)}>
                  {claiming === m.key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Gift className="h-3.5 w-3.5" />}
                  {m.done ? 'Bonusu al' : 'Devam et'}
                </Button>
              )}
            </div>
            <Progress value={(m.current / m.target) * 100} className="mt-2 h-1.5" />
          </div>
        ))}
        <p className="text-[11px] text-muted-foreground">Görev listesi her hafta otomatik yenilenir.</p>
      </CardContent>
    </Card>
  );
};

export default DailyMissions;
