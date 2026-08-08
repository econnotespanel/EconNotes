import Layout from '@/components/Layout';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sparkles, TrendingUp, CalendarDays } from 'lucide-react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

interface EventRow { id: string; amount: number; reason: string; created_at: string }

const REASON_LABEL: Record<string, string> = {
  daily_login: 'Günlük giriş',
  note_uploaded: 'Not yükleme',
  kpss_attempt: 'Deneme bitirme',
  study_material: 'Materyal üretimi',
};

const labelFor = (reason: string) => {
  if (reason.startsWith('mission:')) return 'Mini görev bonusu';
  return REASON_LABEL[reason] || reason;
};

const TONES = ['hsl(var(--primary))', 'hsl(var(--success))', 'hsl(var(--warning))', 'hsl(var(--accent))', 'hsl(var(--destructive))'];

const Points = () => {
  const { user } = useAuth();
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<'7' | '30' | '90'>('30');
  const [granularity, setGranularity] = useState<'daily' | 'weekly'>('daily');
  const [reasonFilter, setReasonFilter] = useState<string>('all');

  useEffect(() => {
    const run = async () => {
      if (!user) { setLoading(false); return; }
      const { data } = await supabase
        .from('point_events').select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1000);
      setEvents((data as EventRow[]) || []);
      setLoading(false);
    };
    void run();
  }, [user]);

  const reasons = useMemo(() => {
    const set = new Set(events.map(e => (e.reason.startsWith('mission:') ? 'mission' : e.reason)));
    return [...set];
  }, [events]);

  const filtered = useMemo(() => {
    const from = Date.now() - Number(range) * 86400000;
    return events.filter(e => {
      if (new Date(e.created_at).getTime() < from) return false;
      if (reasonFilter === 'all') return true;
      if (reasonFilter === 'mission') return e.reason.startsWith('mission:');
      return e.reason === reasonFilter;
    });
  }, [events, range, reasonFilter]);

  const series = useMemo(() => {
    const map = new Map<string, number>();
    filtered.forEach(e => {
      const d = new Date(e.created_at);
      let key: string;
      if (granularity === 'daily') {
        key = d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' });
      } else {
        const monday = new Date(d);
        monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
        key = monday.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' }) + ' hf.';
      }
      map.set(key, (map.get(key) || 0) + e.amount);
    });
    return [...map.entries()].reverse().map(([label, puan]) => ({ label, puan }));
  }, [filtered, granularity]);

  const breakdown = useMemo(() => {
    const map = new Map<string, number>();
    filtered.forEach(e => {
      const k = labelFor(e.reason);
      map.set(k, (map.get(k) || 0) + e.amount);
    });
    return [...map.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [filtered]);

  const total = filtered.reduce((s, e) => s + e.amount, 0);
  const best = series.reduce((m, s) => Math.max(m, s.puan), 0);
  const avg = series.length ? Math.round(total / series.length) : 0;

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold">Puan Geçmişim</h1>
          <p className="text-sm text-muted-foreground">Giriş, not yükleme, deneme bitirme ve görev bonuslarının detaylı dökümü.</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Tabs value={granularity} onValueChange={(v) => setGranularity(v as any)}>
            <TabsList>
              <TabsTrigger value="daily">Günlük</TabsTrigger>
              <TabsTrigger value="weekly">Haftalık</TabsTrigger>
            </TabsList>
          </Tabs>
          <Select value={range} onValueChange={(v) => setRange(v as any)}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Son 7 gün</SelectItem>
              <SelectItem value="30">Son 30 gün</SelectItem>
              <SelectItem value="90">Son 90 gün</SelectItem>
            </SelectContent>
          </Select>
          <Select value={reasonFilter} onValueChange={setReasonFilter}>
            <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tüm kaynaklar</SelectItem>
              {reasons.map(r => (
                <SelectItem key={r} value={r}>{r === 'mission' ? 'Mini görev bonusu' : labelFor(r)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Card className="glass-card"><CardContent className="p-4"><p className="text-xs text-muted-foreground">Toplam kazanç</p><p className="flex items-center gap-1.5 text-2xl font-bold"><Sparkles className="h-5 w-5 text-primary" />{total}</p></CardContent></Card>
          <Card className="glass-card"><CardContent className="p-4"><p className="text-xs text-muted-foreground">En yüksek {granularity === 'daily' ? 'gün' : 'hafta'}</p><p className="flex items-center gap-1.5 text-2xl font-bold"><TrendingUp className="h-5 w-5 text-success" />{best}</p></CardContent></Card>
          <Card className="glass-card"><CardContent className="p-4"><p className="text-xs text-muted-foreground">Ortalama</p><p className="flex items-center gap-1.5 text-2xl font-bold"><CalendarDays className="h-5 w-5 text-warning" />{avg}</p></CardContent></Card>
        </div>

        {loading ? (
          <Skeleton className="h-72 w-full" />
        ) : (
          <>
            <Card className="glass-card">
              <CardHeader className="pb-2"><CardTitle className="text-base">Puan akışı</CardTitle></CardHeader>
              <CardContent className="h-72">
                {series.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Bu aralıkta puan hareketi yok.</p>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={series}>
                      <defs>
                        <linearGradient id="ptFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.5} />
                          <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                      <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                      <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 12 }} />
                      <Area type="monotone" dataKey="puan" stroke="hsl(var(--primary))" fill="url(#ptFill)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <div className="grid gap-4 lg:grid-cols-2">
              <Card className="glass-card">
                <CardHeader className="pb-2"><CardTitle className="text-base">Kaynak dağılımı</CardTitle></CardHeader>
                <CardContent className="h-72">
                  {breakdown.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Veri yok.</p>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={breakdown} dataKey="value" nameKey="name" innerRadius={50} outerRadius={85} paddingAngle={3}>
                          {breakdown.map((_, i) => <Cell key={i} fill={TONES[i % TONES.length]} />)}
                        </Pie>
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 12 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              <Card className="glass-card">
                <CardHeader className="pb-2"><CardTitle className="text-base">Kaynak bazlı puan</CardTitle></CardHeader>
                <CardContent className="h-72">
                  {breakdown.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Veri yok.</p>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={breakdown}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="name" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                        <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                        <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 12 }} />
                        <Bar dataKey="value" name="Puan" radius={[6, 6, 0, 0]} fill="hsl(var(--primary))" />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            </div>

            <Card className="glass-card">
              <CardHeader className="pb-2"><CardTitle className="text-base">Hareket listesi</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {filtered.slice(0, 50).map(e => (
                  <div key={e.id} className="flex items-center justify-between rounded-xl border border-border/60 bg-card/50 px-3 py-2">
                    <div>
                      <p className="text-sm font-medium">{labelFor(e.reason)}</p>
                      <p className="text-xs text-muted-foreground">{new Date(e.created_at).toLocaleString('tr-TR')}</p>
                    </div>
                    <Badge variant="outline" className="font-mono">+{e.amount}</Badge>
                  </div>
                ))}
                {filtered.length === 0 && <p className="text-sm text-muted-foreground">Kayıt bulunamadı.</p>}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </Layout>
  );
};

export default Points;
