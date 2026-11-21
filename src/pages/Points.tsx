import Layout from '@/components/Layout';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sparkles, TrendingUp, CalendarDays, Trophy } from 'lucide-react';
import { usePoints } from '@/hooks/usePoints';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

interface EventRow { id: string; amount: number; reason: string; created_at: string }

const REASON_LABEL: Record<string, string> = {
  daily_login: 'Günlük giriş',
  note_uploaded: 'Not yükleme',
  kpss_attempt: 'Deneme bitirme',
  study_material: 'Materyal üretimi',
};

const normalizeReasonKey = (reason: string) => {
  if (reason.startsWith('mission_checkin_')) return 'mission_checkin';
  if (reason.startsWith('mission_blitz_')) return 'mission_blitz';
  if (reason.startsWith('mission_match_')) return 'mission_match';
  if (reason.startsWith('mission_focus_')) return 'mission_focus';
  if (reason.startsWith('mission:')) return 'mission';
  if (reason.startsWith('monday_wheel')) return 'monday_wheel';
  if (reason.startsWith('mission_trivia_') || reason.startsWith('daily_trivia')) return 'daily_trivia';
  return reason;
};

const labelFor = (reason: string) => {
  if (reason === 'mission_checkin' || reason.startsWith('mission_checkin_')) return 'Günlük seri sandığı';
  if (reason === 'mission_blitz' || reason.startsWith('mission_blitz_')) return 'Günün iktisat düellosu';
  if (reason === 'mission_match' || reason.startsWith('mission_match_')) return 'Kavram eşleştirme arenası';
  if (reason === 'mission_focus' || reason.startsWith('mission_focus_')) return 'Derin odak stüdyosu';
  if (reason === 'daily_trivia' || reason.startsWith('daily_trivia') || reason.startsWith('mission_trivia_')) return 'Günlük Bilgi Yarışması';
  if (reason === 'mission' || reason.startsWith('mission:')) return 'Mini görev bonusu';
  if (reason === 'monday_wheel' || reason.startsWith('monday_wheel')) return 'Pazartesi Şans Çarkı';
  return REASON_LABEL[reason] || reason;
};

const TONES = ['hsl(var(--primary))', 'hsl(var(--success))', 'hsl(var(--warning))', 'hsl(var(--accent))', 'hsl(var(--destructive))'];

const Points = () => {
  const { user } = useAuth();
  const { points: pointsState } = usePoints(10);
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
    const handlePointsUpdated = () => { void run(); };
    window.addEventListener('econnotes:points-updated', handlePointsUpdated);
    return () => {
      window.removeEventListener('econnotes:points-updated', handlePointsUpdated);
    };
  }, [user]);

  const reasons = useMemo(() => {
    const set = new Set(events.map(e => normalizeReasonKey(e.reason)));
    return [...set];
  }, [events]);

  const filtered = useMemo(() => {
    const from = Date.now() - Number(range) * 86400000;
    return events.filter(e => {
      if (new Date(e.created_at).getTime() < from) return false;
      if (reasonFilter === 'all') return true;
      return normalizeReasonKey(e.reason) === reasonFilter;
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

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="glass-card border-primary/25"><CardContent className="p-4"><p className="text-xs text-muted-foreground">Toplam puanım</p><p className="flex items-center gap-1.5 text-2xl font-bold"><Trophy className="h-5 w-5 text-primary" />{(pointsState?.points ?? total).toLocaleString('tr-TR')}</p></CardContent></Card>
          <Card className="glass-card"><CardContent className="p-4"><p className="text-xs text-muted-foreground">Dönem kazancı ({range} gün)</p><p className="flex items-center gap-1.5 text-2xl font-bold"><Sparkles className="h-5 w-5 text-primary" />{total.toLocaleString('tr-TR')}</p></CardContent></Card>
          <Card className="glass-card"><CardContent className="p-4"><p className="text-xs text-muted-foreground">En yüksek {granularity === 'daily' ? 'gün' : 'hafta'}</p><p className="flex items-center gap-1.5 text-2xl font-bold"><TrendingUp className="h-5 w-5 text-success" />{best.toLocaleString('tr-TR')}</p></CardContent></Card>
          <Card className="glass-card"><CardContent className="p-4"><p className="text-xs text-muted-foreground">Ortalama</p><p className="flex items-center gap-1.5 text-2xl font-bold"><CalendarDays className="h-5 w-5 text-warning" />{avg.toLocaleString('tr-TR')}</p></CardContent></Card>
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
