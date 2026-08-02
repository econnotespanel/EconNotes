import { useMemo, useState } from 'react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  BarChart, Bar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Cell,
} from 'recharts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  TrendingUp, TrendingDown, AlertTriangle, FileDown, Check, X, Target,
  BarChart3, History, Lightbulb, Minus,
} from 'lucide-react';
import { downloadKpssReport, type ReportQuestion } from '@/lib/kpssReport';

export interface AttemptRow {
  id: string;
  subject: string | null;
  topic?: string | null;
  difficulty?: string | null;
  score: number;
  total_questions: number;
  created_at: string;
  answers?: ReportQuestion[] | null;
}

const fmt = (iso: string) =>
  new Date(iso).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' });
const fmtFull = (iso: string) =>
  new Date(iso).toLocaleString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });

const diffLabel = (d?: string | null) => (d === 'easy' ? 'Kolay' : d === 'hard' ? 'Zor' : d === 'medium' ? 'Orta' : null);

const chartTip = {
  contentStyle: {
    background: 'hsl(var(--card))',
    border: '1px solid hsl(var(--border))',
    borderRadius: 12,
    fontSize: 12,
    color: 'hsl(var(--foreground))',
  },
} as const;

const KpssPerformance = ({ attempts, userName }: { attempts: AttemptRow[]; userName?: string }) => {
  const [detail, setDetail] = useState<AttemptRow | null>(null);

  const ordered = useMemo(
    () => [...attempts].sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at)),
    [attempts],
  );

  const trend = useMemo(
    () =>
      ordered.map((a, i) => ({
        name: fmt(a.created_at),
        deneme: `#${i + 1}`,
        basari: a.total_questions ? Math.round((a.score / a.total_questions) * 100) : 0,
      })),
    [ordered],
  );

  const bySubject = useMemo(() => {
    const map = new Map<string, { score: number; total: number; count: number }>();
    attempts.forEach(a => {
      const key = a.subject || 'Genel';
      const cur = map.get(key) || { score: 0, total: 0, count: 0 };
      cur.score += a.score;
      cur.total += a.total_questions;
      cur.count += 1;
      map.set(key, cur);
    });
    return [...map.entries()]
      .map(([subject, v]) => ({
        subject,
        basari: v.total ? Math.round((v.score / v.total) * 100) : 0,
        deneme: v.count,
        soru: v.total,
      }))
      .sort((a, b) => b.soru - a.soru);
  }, [attempts]);

  const byTopic = useMemo(() => {
    const map = new Map<string, { wrong: number; total: number }>();
    attempts.forEach(a => {
      (a.answers || []).forEach(q => {
        const key = (q.topic || a.topic || a.subject || 'Genel').trim();
        const cur = map.get(key) || { wrong: 0, total: 0 };
        cur.total += 1;
        if (q.picked == null || q.picked !== q.correctIndex) cur.wrong += 1;
        map.set(key, cur);
      });
    });
    return [...map.entries()]
      .map(([topic, v]) => ({
        topic,
        ...v,
        basari: Math.round(((v.total - v.wrong) / Math.max(v.total, 1)) * 100),
      }))
      .sort((a, b) => a.basari - b.basari);
  }, [attempts]);

  const weakTopics = byTopic.filter(t => t.basari < 70 && t.total >= 1).slice(0, 6);

  const totals = useMemo(() => {
    const q = attempts.reduce((s, a) => s + a.total_questions, 0);
    const c = attempts.reduce((s, a) => s + a.score, 0);
    const last3 = trend.slice(-3).map(t => t.basari);
    const prev3 = trend.slice(-6, -3).map(t => t.basari);
    const avg = (arr: number[]) => (arr.length ? arr.reduce((s, n) => s + n, 0) / arr.length : 0);
    const delta = prev3.length ? Math.round(avg(last3) - avg(prev3)) : 0;
    return { q, c, wrong: q - c, pct: q ? Math.round((c / q) * 100) : 0, delta };
  }, [attempts, trend]);

  if (!attempts.length) {
    return (
      <div className="hud-panel p-12 text-center">
        <BarChart3 className="mx-auto mb-3 h-12 w-12 text-muted-foreground/50" />
        <p className="text-muted-foreground">
          Henüz deneme yok. Bir çözümlü test üretip bitirdiğinde skorların, konu bazlı performans grafiklerin ve yanlış analizin burada oluşur.
        </p>
      </div>
    );
  }

  const barColor = (v: number) =>
    v >= 75 ? 'hsl(var(--success))' : v >= 50 ? 'hsl(var(--warning))' : 'hsl(var(--destructive))';

  const exportAttempt = (a: AttemptRow) => {
    const qs = a.answers || [];
    downloadKpssReport({
      title: `${a.subject || 'KPSS'} denemesi`,
      subject: a.subject || 'KPSS',
      topic: a.topic,
      difficulty: a.difficulty,
      score: a.score,
      total: a.total_questions,
      date: fmtFull(a.created_at),
      userName,
      questions: qs,
      weakTopics: weakTopics.map(w => ({ topic: w.topic, wrong: w.wrong, total: w.total })),
    });
  };

  return (
    <div className="space-y-5">
      {/* Overview */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { code: 'DNM', label: 'Deneme', value: attempts.length, tone: 'text-primary' },
          { code: 'NET', label: 'Doğru', value: `${totals.c}/${totals.q}`, tone: 'text-success' },
          { code: 'ERR', label: 'Yanlış / boş', value: totals.wrong, tone: 'text-destructive' },
          { code: 'AVG', label: 'Genel başarı', value: `%${totals.pct}`, tone: 'text-accent' },
        ].map(s => (
          <div key={s.code} className="relative overflow-hidden rounded-2xl border border-border/70 bg-card/70 p-3">
            <div className="hud-scanline" />
            <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              <span>{s.code}</span>
              <span className={`h-1.5 w-1.5 rounded-full bg-current ${s.tone}`} />
            </div>
            <div className="mt-1 flex items-end gap-1.5">
              <span className="font-display text-2xl font-bold leading-none">{s.value}</span>
              <span className="text-[11px] text-muted-foreground">{s.label}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Trend */}
      <div className="hud-panel p-5">
        <div className="relative">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 font-display text-base font-semibold">
              <TrendingUp className="h-4 w-4 text-primary" /> Başarı gelişimi
            </h3>
            <Badge variant={totals.delta > 0 ? 'default' : totals.delta < 0 ? 'destructive' : 'secondary'} className="gap-1">
              {totals.delta > 0 ? <TrendingUp className="h-3 w-3" /> : totals.delta < 0 ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
              {totals.delta > 0 ? '+' : ''}{totals.delta} puan
            </Badge>
          </div>
          <div className="mt-4 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend} margin={{ top: 5, right: 8, left: -22, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                <Tooltip {...chartTip} formatter={(v: any) => [`%${v}`, 'Başarı']} />
                <Line
                  type="monotone" dataKey="basari" stroke="hsl(var(--primary))" strokeWidth={2.5}
                  dot={{ r: 3, fill: 'hsl(var(--primary))' }} activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Subject bars */}
        <div className="hud-panel p-5">
          <div className="relative">
            <h3 className="flex items-center gap-2 font-display text-base font-semibold">
              <BarChart3 className="h-4 w-4 text-accent" /> Ders bazlı başarı
            </h3>
            <div className="mt-4 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={bySubject} margin={{ top: 5, right: 8, left: -22, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
                  <XAxis dataKey="subject" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} interval={0} angle={-18} textAnchor="end" height={50} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                  <Tooltip {...chartTip} formatter={(v: any) => [`%${v}`, 'Başarı']} />
                  <Bar dataKey="basari" radius={[6, 6, 0, 0]}>
                    {bySubject.map((d, i) => <Cell key={i} fill={barColor(d.basari)} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Topic radar */}
        <div className="hud-panel p-5">
          <div className="relative">
            <h3 className="flex items-center gap-2 font-display text-base font-semibold">
              <Target className="h-4 w-4 text-success" /> Konu haritası
            </h3>
            {byTopic.length >= 3 ? (
              <div className="mt-4 h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={byTopic.slice(0, 8).map(t => ({ topic: t.topic.length > 16 ? t.topic.slice(0, 15) + '…' : t.topic, basari: t.basari }))}>
                    <PolarGrid stroke="hsl(var(--border))" />
                    <PolarAngleAxis dataKey="topic" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                    <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} />
                    <Tooltip {...chartTip} formatter={(v: any) => [`%${v}`, 'Başarı']} />
                    <Radar dataKey="basari" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.3} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">
                Konu haritası için en az 3 farklı konudan soru çözmen gerekiyor.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Recommendations */}
      <div className="hud-panel p-5">
        <div className="relative">
          <h3 className="flex items-center gap-2 font-display text-base font-semibold">
            <Lightbulb className="h-4 w-4 text-warning" /> Tekrar önerileri
          </h3>
          {weakTopics.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              Zayıf konu tespit edilmedi. Tüm konularda %70 üzeri başarın var, zorluk seviyesini yükselterek devam et.
            </p>
          ) : (
            <div className="mt-4 space-y-3">
              {weakTopics.map(t => (
                <div key={t.topic} className="rounded-2xl border border-warning/30 bg-warning/5 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">{t.topic}</span>
                    <Badge variant={t.basari < 40 ? 'destructive' : 'secondary'}>
                      {t.wrong}/{t.total} hatalı · %{t.basari} başarı
                    </Badge>
                  </div>
                  <Progress value={t.basari} className="mt-2 h-1.5" />
                  <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
                    {t.basari < 40
                      ? 'Öncelikli: bu konunun özetini üret, ardından kolay seviyede test çözerek temeli sağlamlaştır.'
                      : 'Bu konuda bilgi kartları ile hızlı tekrar yap, sonra orta seviyede 10 soruluk deneme çöz.'}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* History */}
      <div className="hud-panel p-5">
        <div className="relative">
          <h3 className="flex items-center gap-2 font-display text-base font-semibold">
            <History className="h-4 w-4 text-primary" /> Deneme geçmişi
          </h3>
          <div className="mt-4 space-y-2">
            {[...attempts]
              .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))
              .map(a => {
                const pct = a.total_questions ? Math.round((a.score / a.total_questions) * 100) : 0;
                const hasDetail = !!(a.answers && a.answers.length);
                return (
                  <div key={a.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-border/70 bg-card/70 p-3">
                    <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border font-display text-sm font-bold ${pct >= 75 ? 'border-success/40 bg-success/10 text-success' : pct >= 50 ? 'border-warning/40 bg-warning/10 text-warning' : 'border-destructive/40 bg-destructive/10 text-destructive'}`}>
                      %{pct}
                    </div>
                    <div className="min-w-[140px] flex-1">
                      <p className="font-medium">{a.subject || 'KPSS'}{a.topic ? ` · ${a.topic}` : ''}</p>
                      <p className="text-xs text-muted-foreground">
                        {fmtFull(a.created_at)} · {a.score}/{a.total_questions} doğru
                        {diffLabel(a.difficulty) ? ` · ${diffLabel(a.difficulty)}` : ''}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="gap-1.5" disabled={!hasDetail} onClick={() => setDetail(a)}>
                        <X className="h-3.5 w-3.5" /> Yanlış analizi
                      </Button>
                      <Button variant="secondary" size="sm" className="gap-1.5" disabled={!hasDetail} onClick={() => exportAttempt(a)}>
                        <FileDown className="h-3.5 w-3.5" /> PDF
                      </Button>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      </div>

      {/* Wrong-answer analysis dialog */}
      <Dialog open={!!detail} onOpenChange={o => { if (!o) setDetail(null); }}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">Yanlış analizi</DialogTitle>
            <DialogDescription>
              {detail?.subject}{detail?.topic ? ` · ${detail.topic}` : ''} · {detail ? fmtFull(detail.created_at) : ''}
            </DialogDescription>
          </DialogHeader>
          {detail && <WrongAnalysis attempt={detail} onExport={() => exportAttempt(detail)} />}
        </DialogContent>
      </Dialog>
    </div>
  );
};

const WrongAnalysis = ({ attempt, onExport }: { attempt: AttemptRow; onExport: () => void }) => {
  const qs = attempt.answers || [];
  const wrong = qs.filter(q => q.picked == null || q.picked !== q.correctIndex);

  const topicCount = new Map<string, number>();
  wrong.forEach(q => {
    const k = (q.topic || attempt.topic || attempt.subject || 'Genel').trim();
    topicCount.set(k, (topicCount.get(k) || 0) + 1);
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="destructive">{wrong.length} hatalı soru</Badge>
        <Badge variant="secondary">{qs.length - wrong.length} doğru</Badge>
        <Button variant="outline" size="sm" className="ml-auto gap-1.5" onClick={onExport}>
          <FileDown className="h-3.5 w-3.5" /> Tam raporu PDF indir
        </Button>
      </div>

      {topicCount.size > 0 && (
        <div className="rounded-2xl border border-warning/30 bg-warning/5 p-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-warning">Bu denemede zayıf konular</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {[...topicCount.entries()].sort((a, b) => b[1] - a[1]).map(([t, c]) => (
              <Badge key={t} variant="outline">{t} · {c} yanlış</Badge>
            ))}
          </div>
        </div>
      )}

      {wrong.length === 0 ? (
        <p className="text-sm text-muted-foreground">Bu denemede hatalı soru yok. Tebrikler.</p>
      ) : (
        wrong.map((q, i) => (
          <div key={i} className="rounded-2xl border border-border/70 bg-card/70 p-4">
            <div className="flex items-start justify-between gap-2">
              <p className="font-medium">{q.question}</p>
              {q.topic && <Badge variant="outline" className="shrink-0 text-[10px]">{q.topic}</Badge>}
            </div>
            <div className="mt-3 space-y-1.5 text-sm">
              {(q.options || []).map((opt, oi) => {
                const correct = oi === q.correctIndex;
                const picked = oi === q.picked;
                return (
                  <div
                    key={oi}
                    className={`flex items-start gap-2 rounded-xl border px-3 py-2 ${correct ? 'border-success bg-success/10' : picked ? 'border-destructive bg-destructive/10' : 'border-border'}`}
                  >
                    <span className="font-mono text-xs text-muted-foreground">{String.fromCharCode(65 + oi)})</span>
                    <span className="flex-1">{opt}</span>
                    {correct && <Check className="h-4 w-4 shrink-0 text-success" />}
                    {picked && !correct && <X className="h-4 w-4 shrink-0 text-destructive" />}
                  </div>
                );
              })}
            </div>
            {q.picked == null && <p className="mt-2 text-xs text-muted-foreground">Bu soruyu boş bıraktın.</p>}
            {q.solution && (
              <div className="mt-3 rounded-xl border border-primary/30 bg-primary/5 p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-primary">Neden yanlış · tam çözüm</p>
                <p className="mt-1.5 whitespace-pre-wrap text-sm text-muted-foreground">{q.solution}</p>
                {!!q.optionAnalysis?.length && (
                  <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                    {q.optionAnalysis.map((a, ai) => (
                      <li key={ai}><span className="font-mono">{String.fromCharCode(65 + ai)})</span> {a}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
};

export default KpssPerformance;
