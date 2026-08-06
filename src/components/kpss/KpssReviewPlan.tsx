import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Repeat, CalendarClock, Sparkles, Check, Trash2, Loader2, AlertTriangle, Brain, RotateCcw,
} from 'lucide-react';
import { toast } from 'sonner';
import type { AttemptRow } from './KpssPerformance';

export interface ReviewRow {
  id: string;
  subject: string | null;
  topic: string;
  stage: number;
  due_at: string;
  last_result: number | null;
  status: string;
}

// spaced repetition intervals (days) per stage
const INTERVALS = [1, 3, 7, 14, 30, 60];
const STAGE_LABEL = ['1. tekrar (1 gün)', '2. tekrar (3 gün)', '3. tekrar (1 hafta)', '4. tekrar (2 hafta)', '5. tekrar (1 ay)', 'Uzun dönem (2 ay)'];

const fmtDay = (iso: string) =>
  new Date(iso).toLocaleDateString('tr-TR', { day: '2-digit', month: 'long' });

const dayDiff = (iso: string) => {
  const d = new Date(iso); d.setHours(0, 0, 0, 0);
  const t = new Date(); t.setHours(0, 0, 0, 0);
  return Math.round((+d - +t) / 86400000);
};

const KpssReviewPlan = ({
  userId,
  attempts,
  onStudyTopic,
}: {
  userId: string;
  attempts: AttemptRow[];
  onStudyTopic: (subject: string | null, topic: string) => void;
}) => {
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [building, setBuilding] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('kpss_reviews')
      .select('*')
      .eq('user_id', userId)
      .order('due_at', { ascending: true });
    setRows(((data as any[]) || []) as ReviewRow[]);
    setLoading(false);
  }, [userId]);

  useEffect(() => { void load(); }, [load]);

  // weak topics from wrong-answer analysis
  const weak = useMemo(() => {
    const map = new Map<string, { subject: string | null; wrong: number; total: number }>();
    attempts.forEach(a => {
      (a.answers || []).forEach(q => {
        const key = ((q as any).topic || a.topic || a.subject || 'Genel').trim();
        const cur = map.get(key) || { subject: a.subject, wrong: 0, total: 0 };
        cur.total += 1;
        if ((q as any).picked == null || (q as any).picked !== (q as any).correctIndex) cur.wrong += 1;
        map.set(key, cur);
      });
    });
    return [...map.entries()]
      .map(([topic, v]) => ({ topic, ...v, basari: Math.round(((v.total - v.wrong) / Math.max(v.total, 1)) * 100) }))
      .filter(t => t.basari < 70)
      .sort((a, b) => a.basari - b.basari);
  }, [attempts]);

  const buildPlan = async () => {
    if (!weak.length) {
      toast.info('Zayıf konu bulunamadı. Önce çözümlü test bitir, plan yanlışlarından otomatik oluşur.');
      return;
    }
    setBuilding(true);
    const now = new Date();
    const payload = weak.slice(0, 12).map((t, i) => {
      const due = new Date(now);
      // hardest topics first: schedule today, then spread over following days
      due.setDate(due.getDate() + Math.floor(i / 3));
      due.setHours(9, 0, 0, 0);
      return {
        user_id: userId,
        subject: t.subject,
        topic: t.topic,
        stage: 0,
        due_at: due.toISOString(),
        last_result: t.basari,
        status: 'active',
      };
    });
    const { error } = await supabase.from('kpss_reviews').upsert(payload, { onConflict: 'user_id,topic' });
    setBuilding(false);
    if (error) { toast.error('Plan oluşturulamadı.'); return; }
    toast.success(`${payload.length} konu için tekrarlı çalışma planı hazır.`);
    void load();
  };

  const complete = async (r: ReviewRow) => {
    const nextStage = Math.min(r.stage + 1, INTERVALS.length - 1);
    const due = new Date();
    due.setDate(due.getDate() + INTERVALS[nextStage]);
    due.setHours(9, 0, 0, 0);
    const finished = r.stage >= INTERVALS.length - 1;
    await supabase
      .from('kpss_reviews')
      .update({ stage: nextStage, due_at: due.toISOString(), status: finished ? 'done' : 'active' })
      .eq('id', r.id);
    toast.success(finished ? 'Bu konu uzun dönem hafızaya alındı.' : `Sonraki tekrar: ${fmtDay(due.toISOString())}`);
    void load();
  };

  const reset = async (r: ReviewRow) => {
    const due = new Date(); due.setHours(9, 0, 0, 0);
    await supabase.from('kpss_reviews').update({ stage: 0, due_at: due.toISOString(), status: 'active' }).eq('id', r.id);
    void load();
  };

  const remove = async (id: string) => {
    await supabase.from('kpss_reviews').delete().eq('id', id);
    void load();
  };

  const active = rows.filter(r => r.status === 'active');
  const due = active.filter(r => dayDiff(r.due_at) <= 0);
  const upcoming = active.filter(r => dayDiff(r.due_at) > 0);
  const done = rows.filter(r => r.status === 'done');

  if (loading) {
    return <div className="space-y-4"><Skeleton className="h-28 rounded-2xl" /><Skeleton className="h-56 rounded-2xl" /></div>;
  }

  const Item = ({ r }: { r: ReviewRow }) => {
    const d = dayDiff(r.due_at);
    return (
      <div className={`rounded-2xl border p-3 ${d <= 0 ? 'border-primary/40 bg-primary/5' : 'border-border/70 bg-card/70'}`}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-[160px] flex-1">
            <p className="font-display font-semibold">{r.topic}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {r.subject ? `${r.subject} · ` : ''}{STAGE_LABEL[r.stage]} · {d <= 0 ? 'bugün yapılmalı' : `${d} gün sonra (${fmtDay(r.due_at)})`}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            {r.last_result != null && (
              <Badge variant={r.last_result < 40 ? 'destructive' : 'secondary'} className="text-[10px]">son %{r.last_result}</Badge>
            )}
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => void remove(r.id)} aria-label="Konuyu plandan çıkar">
              <Trash2 className="h-3.5 w-3.5 text-destructive" />
            </Button>
          </div>
        </div>
        <Progress value={Math.round(((r.stage) / (INTERVALS.length - 1)) * 100)} className="mt-2 h-1.5" />
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" className="gap-1.5" onClick={() => onStudyTopic(r.subject, r.topic)}>
            <Sparkles className="h-3.5 w-3.5" /> Bu konudan test üret
          </Button>
          <Button size="sm" className="gap-1.5" onClick={() => void complete(r)}>
            <Check className="h-3.5 w-3.5" /> Tekrarı tamamladım
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-5">
      <div className="hud-panel p-5">
        <div className="hud-scanline" />
        <div className="relative flex flex-wrap items-center gap-4">
          <div className="hud-bar h-12 w-1.5 shrink-0" aria-hidden="true" />
          <div className="min-w-[220px] flex-1">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Spaced repetition · 1-3-7-14-30-60 gün</p>
            <p className="mt-1 font-display text-xl font-bold">
              Bugün tekrar edilecek: <span className="text-primary">{due.length} konu</span>
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Yanlış analizinden çıkan zayıf konular aralıklı tekrar takvimine dizilir. Her tamamlanan tekrar bir sonraki tarihi uzatır.
            </p>
          </div>
          <Button className="gap-2 gradient-primary border-0 text-primary-foreground" disabled={building} onClick={() => void buildPlan()}>
            {building ? <Loader2 className="h-4 w-4 animate-spin" /> : <Brain className="h-4 w-4" />} Planı otomatik oluştur
          </Button>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="hud-panel p-12 text-center">
          <Repeat className="mx-auto mb-3 h-12 w-12 text-muted-foreground/50" />
          <p className="text-muted-foreground">
            Henüz tekrar planı yok. Çözdüğün testlerdeki yanlışlardan zayıf konular çıkarılır; "Planı otomatik oluştur" ile aralıklı tekrar takvimin hazırlanır.
          </p>
          {weak.length > 0 && (
            <div className="mt-4 flex flex-wrap justify-center gap-1.5">
              {weak.slice(0, 8).map(w => <Badge key={w.topic} variant="outline">{w.topic} · %{w.basari}</Badge>)}
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="hud-panel p-5">
            <div className="relative">
              <h3 className="flex items-center gap-2 font-display text-base font-semibold">
                <CalendarClock className="h-4 w-4 text-primary" /> Bugünün tekrarları
              </h3>
              {due.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">Bugün için tekrar yok. Sıradaki tekrarların aşağıda listelendi.</p>
              ) : (
                <div className="mt-4 space-y-3">{due.map(r => <Item key={r.id} r={r} />)}</div>
              )}
            </div>
          </div>

          {upcoming.length > 0 && (
            <div className="hud-panel p-5">
              <div className="relative">
                <h3 className="flex items-center gap-2 font-display text-base font-semibold">
                  <Repeat className="h-4 w-4 text-accent" /> Yaklaşan tekrarlar
                </h3>
                <div className="mt-4 space-y-3">{upcoming.map(r => <Item key={r.id} r={r} />)}</div>
              </div>
            </div>
          )}

          {done.length > 0 && (
            <div className="hud-panel p-5">
              <div className="relative">
                <h3 className="flex items-center gap-2 font-display text-base font-semibold">
                  <Check className="h-4 w-4 text-success" /> Tamamlanan konular
                </h3>
                <div className="mt-3 space-y-2">
                  {done.map(r => (
                    <div key={r.id} className="flex flex-wrap items-center gap-2 rounded-2xl border border-success/30 bg-success/5 p-3">
                      <span className="flex-1 text-sm font-medium">{r.topic}</span>
                      <Button size="sm" variant="outline" className="gap-1.5" onClick={() => void reset(r)}>
                        <RotateCcw className="h-3.5 w-3.5" /> Tekrar döngüye al
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {weak.length > 0 && (
            <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
              Yeni testler çözdükçe zayıf konu listesi güncellenir. Planı yeniden oluşturarak yeni konuları takvime ekleyebilirsin.
            </p>
          )}
        </>
      )}
    </div>
  );
};

export default KpssReviewPlan;
