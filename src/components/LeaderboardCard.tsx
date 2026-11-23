import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Flame, Sparkles, ListOrdered, TrendingUp } from 'lucide-react';
import { usePoints } from '@/hooks/usePoints';
import { useAuth } from '@/contexts/AuthContext';
import LoadingMessage from '@/components/ui/loading-message';
import { cn } from '@/lib/utils';

const getInitials = (name: string) => {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'Ö';
  if (parts.length === 1) return parts[0].slice(0, 2).toLocaleUpperCase('tr-TR');
  return `${parts[0][0] || ''}${parts[1][0] || ''}`.toLocaleUpperCase('tr-TR');
};

const getRankBadgeClass = (rank: number) => {
  if (rank === 1) {
    return 'bg-gradient-to-br from-[#0b2a6e] via-[#174ec4] to-[#2e78f6] text-white font-extrabold shadow-sm';
  }
  if (rank === 2) {
    return 'border border-blue-200/90 bg-blue-100/90 text-blue-700 dark:border-blue-400/30 dark:bg-blue-500/20 dark:text-blue-200 font-extrabold';
  }
  if (rank === 3) {
    return 'border border-sky-200/90 bg-sky-100/90 text-sky-700 dark:border-sky-400/30 dark:bg-sky-500/20 dark:text-sky-200 font-extrabold';
  }
  return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 font-bold';
};

const LeaderboardCard = () => {
  const { user } = useAuth();
  const { points, leaderboard, loading } = usePoints(10);

  const nextLevelStep = 250;
  const level = points ? Math.floor(points.points / nextLevelStep) + 1 : 1;
  const levelProgress = points ? ((points.points % nextLevelStep) / nextLevelStep) * 100 : 0;

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_1.4fr]">
      <Card className="glass-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base sm:text-lg flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" /> Puanım
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <>
              <LoadingMessage />
              <Skeleton className="h-10 w-28" />
              <Skeleton className="h-2 w-full" />
              <Skeleton className="h-4 w-40" />
            </>
          ) : (
            <>
              <div className="flex items-end gap-3">
                <span className="text-4xl font-extrabold tracking-tight tabular-nums">
                  {(points?.points ?? 0).toLocaleString('tr-TR')}
                </span>
                <span className="text-xs text-muted-foreground mb-1.5">XP</span>
                <span className="ml-auto text-xs px-3 py-1 rounded-full bg-primary/10 text-primary font-semibold">
                  Seviye {level}
                </span>
              </div>
              <div>
                <Progress value={levelProgress} className="h-2" />
                <p className="text-[11px] text-muted-foreground mt-1.5">
                  Seviye {level + 1} için {nextLevelStep - ((points?.points ?? 0) % nextLevelStep)} XP kaldı.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-2xl border border-slate-200/75 dark:border-slate-800 bg-muted/40">
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Flame className="h-3.5 w-3.5 text-orange-500" /> Günlük seri
                  </p>
                  <p className="mt-1 text-lg font-bold tabular-nums">{points?.current_streak ?? 0} gün</p>
                </div>
                <div className="p-3 rounded-2xl border border-slate-200/75 dark:border-slate-800 bg-muted/40">
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <TrendingUp className="h-3.5 w-3.5 text-primary" /> En uzun seri
                  </p>
                  <p className="mt-1 text-lg font-bold tabular-nums">{points?.longest_streak ?? 0} gün</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Her gün giriş yaptığında, not yüklediğinde, günlük yarışma ve çalışma görevlerini tamamladığında XP kazanırsın.
              </p>
            </>
          )}
        </CardContent>
      </Card>

      <Card className="glass-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base sm:text-lg flex items-center gap-2">
            <ListOrdered className="h-5 w-5 text-primary" /> Liderlik Tablosu
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {loading ? (
            <>
              <LoadingMessage className="mb-3" />
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded-full" />
              ))}
            </>
          ) : leaderboard.length === 0 ? (
            <p className="text-sm text-muted-foreground">Henüz puan toplayan yok. İlk sırayı sen kap.</p>
          ) : (
            leaderboard.map((row) => {
              const isSelf = row.user_id === user?.id;
              return (
                <div
                  key={row.user_id}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2 rounded-full border transition-colors',
                    isSelf
                      ? 'border-blue-500/45 bg-blue-50/90 dark:border-blue-400/35 dark:bg-blue-500/15 shadow-sm'
                      : 'border-slate-200/75 dark:border-slate-800 bg-card hover:bg-muted/40',
                  )}
                >
                  <span
                    className={cn(
                      'h-7 w-7 shrink-0 rounded-full inline-flex items-center justify-center text-xs tabular-nums',
                      getRankBadgeClass(row.rank),
                    )}
                  >
                    {row.rank}
                  </span>
                  <Avatar className="h-8 w-8 shrink-0">
                    {row.avatar_url ? <AvatarImage src={row.avatar_url} alt={row.full_name} /> : null}
                    <AvatarFallback className="text-xs font-bold">{getInitials(row.full_name)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground truncate">
                      {row.full_name}
                      {isSelf && (
                        <span className="ml-1.5 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-white">
                          Sen
                        </span>
                      )}
                    </p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {row.university || 'EconNotes Öğrencisi'}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs font-extrabold text-foreground tabular-nums">
                      {row.points.toLocaleString('tr-TR')} XP
                    </p>
                    <p className="text-[10px] text-muted-foreground flex items-center gap-1 justify-end tabular-nums">
                      <Flame className="h-3 w-3 text-orange-500" /> {row.current_streak}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default LeaderboardCard;
