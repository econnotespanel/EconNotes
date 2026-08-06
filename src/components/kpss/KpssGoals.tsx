import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Slider } from '@/components/ui/slider';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from 'recharts';
import { Flag, Plus, Trash2, Trophy, Target, CheckCircle2, CalendarDays, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { AttemptRow } from './KpssPerformance';

type Metric = 'questions' | 'attempts' | 'accuracy' | 'materials';

export interface GoalRow {
  id: string;
  metric: Metric;
  target: number;
  week_start: string;
  label: string | null;
  completed_at: string | null;
  notified: boolean;
}

const METRICS: Record<Metric, { label: string; unit: string; hint: string; max: number; step: number; def: number }> = {
  questions: { label: 'Çözülen soru', unit: 'soru', hint: 'Bu hafta çözdüğün toplam soru sayısı.', max: 500, step: 10, def: 100 },
  attempts: { label: 'Deneme sayısı', unit: 'deneme', hint: 'Bu hafta bitirdiğin test sayısı.', max: 30, step: 1, def: 5 },
  accuracy: { label: 'Başarı yüzdesi', unit: '%', hint: 'Bu haftaki denemelerinin ortalama başarısı.', max: 100, step: 5, def: 70 },
  materials: { label: 'Üretilen materyal', unit: 'materyal', hint: 'Bu hafta ürettiğin özet, kart ve test sayısı.', max: 40, step: 1, def: 6 },
};

const weekStartOf = (d: Date) => {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7; // Monday = 0
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - day);
  return x;
};
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fmtRange = (start: Date) => {
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const f = (x: Date) => x.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' });
  return `${f(start)} – ${f(end)}`;
};

const KpssGoals = ({
  userId,
  attempts,
  materialDates,
}: {
  userId: string;
  attempts: AttemptRow[];
  materialDates: string[];
}) => {
  const [goals, setGoals] = useState<GoalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [metric, setMetric] = useState<Metric>('questions');
  const [target, setTarget] = useState(METRICS.questions.def);
  const [label, setLabel] = useState('');

  const monday = useMemo(() => weekStartOf(new Date()), []);
  const weekKey = iso(monday);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('kpss_goals')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });
    setGoals(((data as any[]) || []) as GoalRow[]);
    setLoading(false);
  }, [userId]);

  useEffect(() => { void load(); }, [load]);

  // ---- progress per metric for a given week
  const progressFor = useCallback(
    (m: Metric, weekStart: string) => {
      const start = new Date(weekStart + 'T00:00:00');
      const end = new Date(start);
      end.setDate(end.getDate() + 7);
      const inRange = (d: string) => {
        const t = +new Date(d);
        return t >= +start && t < +end;
      };
      const weekAttempts = attempts.filter(a => inRange(a.created_at));
      if (m === 'attempts') return weekAttempts.length;
      if (m === 'questions') return weekAttempts.reduce((s, a) => s + (a.total_questions || 0), 0);
      if (m === 'materials') return materialDates.filter(inRange).length;
      const q = weekAttempts.reduce((s, a) => s + (a.total_questions || 0), 0);
      const c = weekAttempts.reduce((s, a) => s + (a.score || 0), 0);
      return q ? Math.round((c / q) * 100) : 0;
    },
    [attempts, materialDates],
  );

  const current = goals.filter(g => g.week_start === weekKey);
  const past = goals.filter(g => g.week_start !== weekKey).slice(-6);

  // ---- completion notification
  useEffect(() => {
    if (loading) return;
    const done = current.filter(g => !g.completed_at && progressFor(g.metric, g.week_start) >= g.target);
    if (!done.length) return;
    (async () => {
      for (const g of done) {
        await supabase
          .from('kpss_goals')
          .update({ completed_at: new Date().toISOString(), notified: true })
          .eq('id', g.id);
        toast.success(`Hedef tamamlandı: ${METRICS[g.metric].label} ${g.target}${METRICS[g.metric].unit === '%' ? '%' : ''}`, {
          description: g.label || 'Haftalık hedefini bitirdin. Yeni bir hedef koyarak devam et.',
          duration: 7000,
        });
      }
      void load();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, goals, attempts, materialDates]);

  const add = async () => {
    setSaving(true);
    const { error } = await supabase.from('kpss_goals').insert({
      user_id: userId,
      metric,
      target,
      week_start: weekKey,
      label: label.trim() || null,
    });
    setSaving(false);
    if (error) {
      toast.error('Hedef eklenemedi.');
      return;
    }
    setOpen(false);
    setLabel('');
    toast.success('Haftalık hedef eklendi.');
    void load();
  };

  const remove = async (id: string) => {
    await supabase.from('kpss_goals').delete().eq('id', id);
    void load();
  };

  const chartData = current.map(g => {
    const val = progressFor(g.metric, g.week_start);
    return { name: METRICS[g.metric].label, oran: Math.min(Math.round((val / Math.max(g.target, 1)) * 100), 100) };
  });

  const overall = current.length
    ? Math.round(chartData.reduce((s, d) => s + d.oran, 0) / chartData.length)
    : 0;

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-28 rounded-2xl" />
        <Skeleton className="h-56 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="hud-panel p-5">
        <div className="hud-scanline" />
        <div className="relative flex flex-wrap items-center gap-4">
          <div className="hud-bar h-12 w-1.5 shrink-0" aria-hidden="true" />
          <div className="min-w-[200px] flex-1">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              <CalendarDays className="mr-1 inline h-3 w-3" /> Hafta {fmtRange(monday)}
            </p>
            <p className="mt-1 font-display text-xl font-bold">
              Haftalık hedef tamamlama: <span className="text-primary">%{overall}</span>
            </p>
            <Progress value={overall} className="mt-2 h-2" />
          </div>
          <Button className="gap-2 gradient-primary border-0 text-primary-foreground" onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" /> Hedef ekle
          </Button>
        </div>
      </div>

      {current.length === 0 ? (
        <div className="hud-panel p-12 text-center">
          <Flag className="mx-auto mb-3 h-12 w-12 text-muted-foreground/50" />
          <p className="text-muted-foreground">
            Bu hafta için hedef yok. "Hedef ekle" ile soru, deneme, başarı yüzdesi veya materyal hedefi koy; ilerlemen otomatik takip edilir.
          </p>
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            {current.map(g => {
              const meta = METRICS[g.metric];
              const val = progressFor(g.metric, g.week_start);
              const pct = Math.min(Math.round((val / Math.max(g.target, 1)) * 100), 100);
              const done = pct >= 100;
              return (
                <div key={g.id} className={`hud-panel p-4 ${done ? 'border-success/50' : ''}`}>
                  <div className="hud-scanline" />
                  <div className="relative">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-display font-semibold">{meta.label}</p>
                        {g.label && <p className="text-xs text-muted-foreground">{g.label}</p>}
                      </div>
                      <div className="flex items-center gap-1.5">
                        {done ? (
                          <Badge className="gap-1 bg-success text-success-foreground"><Trophy className="h-3 w-3" /> Tamam</Badge>
                        ) : (
                          <Badge variant="secondary">%{pct}</Badge>
                        )}
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => void remove(g.id)} aria-label="Hedefi sil">
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    </div>
                    <Progress value={pct} className="mt-3 h-2" />
                    <p className="mt-2 font-mono text-xs text-muted-foreground">
                      {val} / {g.target} {meta.unit === '%' ? '%' : meta.unit}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">{meta.hint}</p>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="hud-panel p-5">
            <div className="relative">
              <h3 className="flex items-center gap-2 font-display text-base font-semibold">
                <Target className="h-4 w-4 text-primary" /> Hedef tamamlama grafiği
              </h3>
              <div className="mt-4 h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 5, right: 8, left: -22, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} interval={0} angle={-15} textAnchor="end" height={54} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                    <Tooltip
                      contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 12, fontSize: 12, color: 'hsl(var(--foreground))' }}
                      formatter={(v: any) => [`%${v}`, 'Tamamlama']}
                    />
                    <Bar dataKey="oran" radius={[6, 6, 0, 0]}>
                      {chartData.map((d, i) => (
                        <Cell key={i} fill={d.oran >= 100 ? 'hsl(var(--success))' : d.oran >= 50 ? 'hsl(var(--primary))' : 'hsl(var(--warning))'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </>
      )}

      {past.length > 0 && (
        <div className="hud-panel p-5">
          <div className="relative">
            <h3 className="flex items-center gap-2 font-display text-base font-semibold">
              <CheckCircle2 className="h-4 w-4 text-success" /> Geçmiş haftalar
            </h3>
            <div className="mt-3 space-y-2">
              {past.map(g => {
                const val = progressFor(g.metric, g.week_start);
                const pct = Math.min(Math.round((val / Math.max(g.target, 1)) * 100), 100);
                return (
                  <div key={g.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-border/70 bg-card/70 p-3">
                    <span className="font-mono text-xs text-muted-foreground">{fmtRange(new Date(g.week_start + 'T00:00:00'))}</span>
                    <span className="flex-1 text-sm">{METRICS[g.metric].label} · {g.target} {METRICS[g.metric].unit === '%' ? '%' : METRICS[g.metric].unit}</span>
                    <Badge variant={pct >= 100 ? 'default' : 'secondary'}>%{pct}</Badge>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-display"><Flag className="h-4 w-4 text-primary" /> Haftalık hedef</DialogTitle>
            <DialogDescription>Bu hafta ({fmtRange(monday)}) için bir hedef belirle. İlerlemen denemelerinden otomatik hesaplanır.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Hedef türü</Label>
              <div className="grid grid-cols-2 gap-2">
                {(Object.keys(METRICS) as Metric[]).map(m => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => { setMetric(m); setTarget(METRICS[m].def); }}
                    aria-pressed={metric === m}
                    className={`rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors ${metric === m ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-primary/50 hover:text-foreground'}`}
                  >
                    {METRICS[m].label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">{METRICS[metric].hint}</p>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Hedef değeri</Label>
                <span className="font-display text-lg font-bold text-primary">{target} {METRICS[metric].unit === '%' ? '%' : METRICS[metric].unit}</span>
              </div>
              <Slider value={[target]} min={METRICS[metric].step} max={METRICS[metric].max} step={METRICS[metric].step} onValueChange={v => setTarget(v[0])} />
            </div>
            <div className="space-y-1.5">
              <Label>Not (opsiyonel)</Label>
              <Input value={label} onChange={e => setLabel(e.target.value)} placeholder="Örn. Tarih ağırlıklı çalışacağım" />
            </div>
            <Button className="w-full gap-2 gradient-primary border-0 text-primary-foreground" disabled={saving} onClick={() => void add()}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Hedefi kaydet
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default KpssGoals;
