import Layout from '@/components/Layout';
import PageHeader from '@/components/PageHeader';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { getSeasonalTheme, useSiteConfig } from '@/contexts/SiteConfigContext';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Sparkles,
  TrendingUp,
  CalendarDays,
  ListOrdered,
  Flame,
  Search,
  ShieldCheck,
  BarChart3,
} from 'lucide-react';
import { usePoints } from '@/hooks/usePoints';
import { cn } from '@/lib/utils';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

interface EventRow {
  id: string;
  amount: number;
  reason: string;
  created_at: string;
}

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
  if (reason === 'daily_trivia' || reason.startsWith('daily_trivia') || reason.startsWith('mission_trivia_')) {
    return 'Günlük Bilgi Yarışması';
  }
  if (reason === 'mission' || reason.startsWith('mission:')) return 'Mini görev bonusu';
  if (reason === 'monday_wheel' || reason.startsWith('monday_wheel')) return 'Pazartesi Şans Çarkı';
  return REASON_LABEL[reason] || reason;
};

const getInitials = (name: string) => {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'Ö';
  if (parts.length === 1) return parts[0].slice(0, 2).toLocaleUpperCase('tr-TR');
  return `${parts[0][0] || ''}${parts[1][0] || ''}`.toLocaleUpperCase('tr-TR');
};

const TONES = ['#2563eb', '#4f46e5', '#0ea5e9', '#10b981', '#f59e0b'];

const Points = () => {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { config } = useSiteConfig();
  const seasonalTheme = getSeasonalTheme(config.theme.seasonalMode || 'default');
  const isNovember10 = seasonalTheme?.id === 'november10';

  const initialTab = searchParams.get('tab') === 'leaderboard' ? 'leaderboard' : 'history';
  const [activeTab, setActiveTab] = useState<'history' | 'leaderboard'>(initialTab);
  const { points: pointsState, leaderboard, loading: pointsLoading } = usePoints(100);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<'7' | '30' | '90'>('30');
  const [granularity, setGranularity] = useState<'daily' | 'weekly'>('daily');
  const [reasonFilter, setReasonFilter] = useState<string>('all');
  const [leaderboardSearch, setLeaderboardSearch] = useState('');

  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam === 'leaderboard' || tabParam === 'history') {
      setActiveTab(tabParam);
    }
  }, [searchParams]);

  const handleTabChange = (nextTab: 'history' | 'leaderboard') => {
    setActiveTab(nextTab);
    const next = new URLSearchParams(searchParams);
    if (nextTab === 'leaderboard') {
      next.set('tab', 'leaderboard');
    } else {
      next.delete('tab');
    }
    setSearchParams(next, { replace: true });
  };

  useEffect(() => {
    const run = async () => {
      if (!user) {
        setLoading(false);
        return;
      }
      const { data } = await supabase
        .from('point_events')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1000);
      setEvents((data as EventRow[]) || []);
      setLoading(false);
    };
    void run();
    const handlePointsUpdated = () => {
      void run();
    };
    window.addEventListener('econnotes:points-updated', handlePointsUpdated);
    window.addEventListener('econnotes:trivia-updated', handlePointsUpdated);
    window.addEventListener('econnotes:wheel-updated', handlePointsUpdated);
    return () => {
      window.removeEventListener('econnotes:points-updated', handlePointsUpdated);
      window.removeEventListener('econnotes:trivia-updated', handlePointsUpdated);
      window.removeEventListener('econnotes:wheel-updated', handlePointsUpdated);
    };
  }, [user]);

  const reasons = useMemo(() => {
    const set = new Set(events.map((e) => normalizeReasonKey(e.reason)));
    return [...set];
  }, [events]);

  const filtered = useMemo(() => {
    const from = Date.now() - Number(range) * 86400000;
    return events.filter((e) => {
      if (new Date(e.created_at).getTime() < from) return false;
      if (reasonFilter === 'all') return true;
      return normalizeReasonKey(e.reason) === reasonFilter;
    });
  }, [events, range, reasonFilter]);

  const series = useMemo(() => {
    const map = new Map<string, number>();
    filtered.forEach((e) => {
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
    filtered.forEach((e) => {
      const k = labelFor(e.reason);
      map.set(k, (map.get(k) || 0) + e.amount);
    });
    return [...map.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [filtered]);

  const filteredLeaderboard = useMemo(() => {
    const q = leaderboardSearch.trim().toLocaleLowerCase('tr-TR');
    if (!q) return leaderboard;
    return leaderboard.filter(
      (row) =>
        (row.full_name || '').toLocaleLowerCase('tr-TR').includes(q) ||
        (row.university || '').toLocaleLowerCase('tr-TR').includes(q),
    );
  }, [leaderboard, leaderboardSearch]);

  const currentUserRankRow = useMemo(
    () => (user ? leaderboard.find((r) => r.user_id === user.id) ?? null : null),
    [leaderboard, user],
  );

  const total = filtered.reduce((s, e) => s + e.amount, 0);
  const best = series.reduce((m, s) => Math.max(m, s.puan), 0);
  const avg = series.length ? Math.round(total / series.length) : 0;
  const totalPointsValue = pointsState?.points ?? total;

  const getRankBadgeClass = (rank: number) => {
    if (isNovember10) {
      if (rank === 1) return 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950 font-extrabold';
      if (rank === 2) return 'bg-zinc-200 text-zinc-900 dark:bg-zinc-700 dark:text-zinc-100 font-bold';
      if (rank === 3) return 'border border-zinc-300 bg-zinc-100 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 font-bold';
      return 'bg-muted text-muted-foreground font-semibold';
    }
    if (rank === 1) return 'bg-gradient-to-br from-[#0b2a6e] via-[#174ec4] to-[#2e78f6] text-white font-extrabold shadow-sm';
    if (rank === 2) return 'border border-blue-200/90 bg-blue-100/90 text-blue-700 dark:border-blue-400/30 dark:bg-blue-500/20 dark:text-blue-200 font-extrabold';
    if (rank === 3) return 'border border-sky-200/90 bg-sky-100/90 text-sky-700 dark:border-sky-400/30 dark:bg-sky-500/20 dark:text-sky-200 font-extrabold';
    return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 font-bold';
  };

  return (
    <Layout>
      <div className="space-y-5">
        <PageHeader
          title={activeTab === 'leaderboard' ? 'Liderlik Tablosu' : 'Puan Geçmişim'}
          description={
            activeTab === 'leaderboard'
              ? 'Gerçek XP kayıtlarına göre canlı öğrenci sıralaması. Gizlilik ayarlarını profilinden yönetebilirsin.'
              : 'Giriş, not yükleme, bilgi yarışması ve çalışma görevlerinden kazandığın XP dökümü.'
          }
          icon={activeTab === 'leaderboard' ? ListOrdered : Sparkles}
          actions={
            <div
              role="tablist"
              aria-label="Puan görünümü"
              className="inline-flex w-full items-center gap-1 rounded-full border border-slate-200/90 dark:border-slate-800 bg-slate-100/80 dark:bg-slate-900/70 p-1 sm:w-auto"
            >
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'history'}
                onClick={() => handleTabChange('history')}
                className={cn(
                  'inline-flex flex-1 sm:flex-none h-9 items-center justify-center gap-1.5 rounded-full px-4 text-xs font-semibold transition-all',
                  activeTab === 'history'
                    ? 'bg-gradient-to-r from-[#174ec4] to-[#2e78f6] text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-300 hover:text-foreground',
                )}
              >
                <BarChart3 className="h-3.5 w-3.5" />
                <span>Puan Geçmişim</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'leaderboard'}
                onClick={() => handleTabChange('leaderboard')}
                className={cn(
                  'inline-flex flex-1 sm:flex-none h-9 items-center justify-center gap-1.5 rounded-full px-4 text-xs font-semibold transition-all',
                  activeTab === 'leaderboard'
                    ? 'bg-gradient-to-r from-[#174ec4] to-[#2e78f6] text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-300 hover:text-foreground',
                )}
              >
                <ListOrdered className="h-3.5 w-3.5" />
                <span>Liderlik Tablosu</span>
              </button>
            </div>
          }
        />

        {/* KPI Summary Row — Zero Truncation on Narrow Mobile */}
        <div className="grid grid-cols-2 max-[359px]:grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-4">
          <Card className="glass-card">
            <CardContent className="flex flex-col gap-2.5 p-4 sm:p-5">
              <span className="flex h-9 w-9 sm:h-11 sm:w-11 shrink-0 items-center justify-center rounded-xl sm:rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400">
                <Sparkles className="h-[18px] w-[18px] sm:h-5 sm:w-5" />
              </span>
              <div>
                <p className="text-xs font-medium text-muted-foreground">Toplam XP</p>
                <p className="text-[22px] sm:text-2xl font-extrabold tracking-tight tabular-nums">
                  {totalPointsValue.toLocaleString('tr-TR')}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardContent className="flex flex-col gap-2.5 p-4 sm:p-5">
              <span className="flex h-9 w-9 sm:h-11 sm:w-11 shrink-0 items-center justify-center rounded-xl sm:rounded-2xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400">
                <ListOrdered className="h-[18px] w-[18px] sm:h-5 sm:w-5" />
              </span>
              <div>
                <p className="text-xs font-medium text-muted-foreground">Güncel Sıran</p>
                <p className="text-[22px] sm:text-2xl font-extrabold tracking-tight tabular-nums">
                  {currentUserRankRow
                    ? `#${currentUserRankRow.rank}`
                    : totalPointsValue > 0
                      ? '#100+'
                      : '—'}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardContent className="flex flex-col gap-2.5 p-4 sm:p-5">
              <span className="flex h-9 w-9 sm:h-11 sm:w-11 shrink-0 items-center justify-center rounded-xl sm:rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400">
                <TrendingUp className="h-[18px] w-[18px] sm:h-5 sm:w-5" />
              </span>
              <div>
                <p className="text-xs font-medium text-muted-foreground">Dönem ({range} gün)</p>
                <p className="text-[22px] sm:text-2xl font-extrabold tracking-tight tabular-nums">
                  {total.toLocaleString('tr-TR')}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardContent className="flex flex-col gap-2.5 p-4 sm:p-5">
              <span className="flex h-9 w-9 sm:h-11 sm:w-11 shrink-0 items-center justify-center rounded-xl sm:rounded-2xl bg-orange-50 text-orange-500 dark:bg-orange-500/15 dark:text-orange-400">
                <Flame className="h-[18px] w-[18px] sm:h-5 sm:w-5" />
              </span>
              <div>
                <p className="text-xs font-medium text-muted-foreground">Günlük Seri</p>
                <p className="text-[22px] sm:text-2xl font-extrabold tracking-tight tabular-nums">
                  {pointsState?.current_streak ?? 0} gün
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {activeTab === 'leaderboard' ? (
          <Card className="glass-card">
            <CardHeader className="pb-4 space-y-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="text-base sm:text-lg font-bold">
                    Genel XP Sıralaması
                  </CardTitle>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Toplam {leaderboard.length} aktif öğrenci listeleniyor · XP kazandıkça otomatik güncellenir.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative flex-1 sm:w-64 sm:flex-none">
                    <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={leaderboardSearch}
                      onChange={(e) => setLeaderboardSearch(e.target.value)}
                      placeholder="Öğrenci veya üniversite ara..."
                      className="h-9 rounded-full pl-9 text-xs"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => navigate('/profile')}
                    className="inline-flex h-9 items-center gap-1.5 rounded-full border border-slate-200/90 dark:border-slate-800 bg-card px-3.5 text-xs font-semibold text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
                  >
                    <ShieldCheck className="h-3.5 w-3.5" />
                    <span>Gizlilik</span>
                  </button>
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-2">
              {pointsLoading ? (
                <div className="space-y-2.5">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <Skeleton key={i} className="h-14 w-full rounded-full" />
                  ))}
                </div>
              ) : filteredLeaderboard.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border/80 px-4 py-10 text-center">
                  <p className="text-sm font-semibold text-foreground">
                    {leaderboard.length === 0
                      ? 'Henüz sıralama kaydı bulunmuyor'
                      : 'Aramana uygun öğrenci bulunamadı'}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {leaderboard.length === 0
                      ? 'İlk XP puanlarını kazanarak liderlik tablosunun başına geçebilirsin.'
                      : 'Farklı bir isim veya üniversite terimi deneyebilirsin.'}
                  </p>
                </div>
              ) : (
                filteredLeaderboard.map((row) => {
                  const isSelf = row.user_id === user?.id;
                  const isTopThree = row.rank <= 3;

                  return (
                    <div
                      key={row.user_id}
                      className={cn(
                        'flex min-w-0 items-center gap-3 rounded-full border px-3 py-2.5 transition-colors',
                        isSelf
                          ? isNovember10
                            ? 'border-zinc-900/45 bg-zinc-900/5 ring-1 ring-zinc-900/15 dark:border-zinc-200/40 dark:bg-zinc-100/10'
                            : 'border-blue-500/45 bg-blue-50/90 ring-1 ring-blue-500/20 dark:border-blue-400/35 dark:bg-blue-500/15'
                          : isTopThree
                            ? 'border-slate-200/85 bg-slate-50/75 dark:border-slate-800 dark:bg-slate-900/55'
                            : 'border-slate-200/65 bg-card dark:border-slate-800/70 hover:bg-muted/40',
                      )}
                    >
                      <span
                        className={cn(
                          'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs tabular-nums',
                          getRankBadgeClass(row.rank),
                        )}
                      >
                        {row.rank}
                      </span>

                      <Avatar className="h-9 w-9 shrink-0 border border-slate-200/80 dark:border-slate-700/80">
                        {row.avatar_url ? <AvatarImage src={row.avatar_url} alt={row.full_name} /> : null}
                        <AvatarFallback
                          className={cn(
                            'text-xs font-bold',
                            isSelf
                              ? 'bg-primary text-white'
                              : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
                          )}
                        >
                          {getInitials(row.full_name)}
                        </AvatarFallback>
                      </Avatar>

                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <span className="truncate text-sm font-semibold text-foreground">
                            {row.full_name || 'Kullanıcı'}
                          </span>
                          {isSelf && (
                            <span className="shrink-0 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-white leading-none">
                              Sen
                            </span>
                          )}
                        </div>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {row.university || 'EconNotes Öğrencisi'}
                        </p>
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        {row.current_streak > 0 && (
                          <span className="hidden sm:inline-flex items-center gap-1 rounded-full bg-orange-500/10 px-2.5 py-1 text-[11px] font-semibold text-orange-600 dark:text-orange-300 tabular-nums">
                            <Flame className="h-3 w-3" />
                            {row.current_streak} gün
                          </span>
                        )}
                        <span
                          className={cn(
                            'rounded-full px-3 py-1 text-xs font-extrabold tabular-nums',
                            isSelf
                              ? 'bg-primary text-white'
                              : 'bg-slate-100 text-foreground dark:bg-slate-800',
                          )}
                        >
                          {row.points.toLocaleString('tr-TR')} XP
                        </span>
                      </div>
                    </div>
                  );
                })
              )}

              {!pointsLoading && user && !currentUserRankRow && !leaderboardSearch && (
                <div className="mt-3 rounded-2xl border border-dashed border-primary/30 bg-primary/5 px-4 py-3 text-xs text-muted-foreground">
                  <strong className="font-semibold text-foreground">
                    {profile?.full_name || 'Sen'}:
                  </strong>{' '}
                  {totalPointsValue > 0
                    ? `Toplam ${totalPointsValue.toLocaleString('tr-TR')} XP ile ilk 100 dışındasın — XP kazandıkça üst sıralara çıkarsın.`
                    : 'Henüz XP kaydın yok. Günlük giriş, ders notu paylaşımı veya Günlük Bilgi Yarışması ile sıralamaya katılabilirsin.'}
                </div>
              )}
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Tabs value={granularity} onValueChange={(v) => setGranularity(v as 'daily' | 'weekly')}>
                <TabsList className="h-10">
                  <TabsTrigger value="daily">Günlük</TabsTrigger>
                  <TabsTrigger value="weekly">Haftalık</TabsTrigger>
                </TabsList>
              </Tabs>
              <Select value={range} onValueChange={(v) => setRange(v as '7' | '30' | '90')}>
                <SelectTrigger className="w-[136px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">Son 7 gün</SelectItem>
                  <SelectItem value="30">Son 30 gün</SelectItem>
                  <SelectItem value="90">Son 90 gün</SelectItem>
                </SelectContent>
              </Select>
              <Select value={reasonFilter} onValueChange={setReasonFilter}>
                <SelectTrigger className="w-full sm:w-52">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tüm kaynaklar</SelectItem>
                  {reasons.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r === 'mission' ? 'Mini görev bonusu' : labelFor(r)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="ml-auto hidden sm:flex items-center gap-3 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <CalendarDays className="h-3.5 w-3.5 text-primary" />
                  En yüksek: <strong className="text-foreground tabular-nums">{best.toLocaleString('tr-TR')}</strong>
                </span>
                <span>
                  Ort: <strong className="text-foreground tabular-nums">{avg.toLocaleString('tr-TR')}</strong>
                </span>
              </div>
            </div>

            {loading ? (
              <Skeleton className="h-72 w-full rounded-[20px]" />
            ) : (
              <>
                <Card className="glass-card">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Puan akışı</CardTitle>
                  </CardHeader>
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
                          <Tooltip
                            contentStyle={{
                              background: 'hsl(var(--card))',
                              border: '1px solid hsl(var(--border))',
                              borderRadius: 12,
                            }}
                          />
                          <Area
                            type="monotone"
                            dataKey="puan"
                            stroke="hsl(var(--primary))"
                            fill="url(#ptFill)"
                            strokeWidth={2}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    )}
                  </CardContent>
                </Card>

                <div className="grid gap-4 lg:grid-cols-2">
                  <Card className="glass-card">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">Kaynak dağılımı</CardTitle>
                    </CardHeader>
                    <CardContent className="h-72">
                      {breakdown.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Veri yok.</p>
                      ) : (
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={breakdown}
                              dataKey="value"
                              nameKey="name"
                              innerRadius={50}
                              outerRadius={85}
                              paddingAngle={3}
                            >
                              {breakdown.map((_, i) => (
                                <Cell key={i} fill={TONES[i % TONES.length]} />
                              ))}
                            </Pie>
                            <Legend wrapperStyle={{ fontSize: 11 }} />
                            <Tooltip
                              contentStyle={{
                                background: 'hsl(var(--card))',
                                border: '1px solid hsl(var(--border))',
                                borderRadius: 12,
                              }}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                      )}
                    </CardContent>
                  </Card>

                  <Card className="glass-card">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">Kaynak bazlı puan</CardTitle>
                    </CardHeader>
                    <CardContent className="h-72">
                      {breakdown.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Veri yok.</p>
                      ) : (
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={breakdown}>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                            <XAxis dataKey="name" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                            <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                            <Tooltip
                              contentStyle={{
                                background: 'hsl(var(--card))',
                                border: '1px solid hsl(var(--border))',
                                borderRadius: 12,
                              }}
                            />
                            <Bar dataKey="value" name="Puan" radius={[8, 8, 0, 0]} fill="hsl(var(--primary))" />
                          </BarChart>
                        </ResponsiveContainer>
                      )}
                    </CardContent>
                  </Card>
                </div>

                <Card className="glass-card">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Hareket listesi</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {filtered.slice(0, 50).map((e) => (
                      <div
                        key={e.id}
                        className="flex items-center justify-between gap-3 rounded-full border border-slate-200/75 dark:border-slate-800/80 bg-card/70 px-4 py-2.5"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-foreground">{labelFor(e.reason)}</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(e.created_at).toLocaleString('tr-TR')}
                          </p>
                        </div>
                        <Badge variant="outline" className="shrink-0 rounded-full font-mono font-bold">
                          +{e.amount} XP
                        </Badge>
                      </div>
                    ))}
                    {filtered.length === 0 && (
                      <p className="text-sm text-muted-foreground">Kayıt bulunamadı.</p>
                    )}
                  </CardContent>
                </Card>
              </>
            )}
          </>
        )}
      </div>
    </Layout>
  );
};

export default Points;
