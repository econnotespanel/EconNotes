import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Trophy, Flame, Sparkles, Crown } from 'lucide-react';
import { usePoints } from '@/hooks/usePoints';
import { useAuth } from '@/contexts/AuthContext';

const rankStyles = [
  'bg-warning/15 text-warning border-warning/40',
  'bg-muted text-foreground border-border',
  'bg-primary/15 text-primary border-primary/40',
];

const LeaderboardCard = () => {
  const { user } = useAuth();
  const { points, leaderboard, loading } = usePoints(10);

  const nextLevelStep = 250;
  const level = points ? Math.floor(points.points / nextLevelStep) + 1 : 1;
  const levelProgress = points ? ((points.points % nextLevelStep) / nextLevelStep) * 100 : 0;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
      <Card className="glass-card aurora-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" /> Puanım
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <>
              <Skeleton className="h-10 w-28" />
              <Skeleton className="h-2 w-full" />
              <Skeleton className="h-4 w-40" />
            </>
          ) : (
            <>
              <div className="flex items-end gap-3">
                <span className="text-4xl font-bold tracking-tight">{points?.points ?? 0}</span>
                <span className="text-xs text-muted-foreground mb-1.5">puan</span>
                <span className="ml-auto text-xs px-2 py-1 rounded-full bg-primary/10 text-primary font-semibold">
                  Seviye {level}
                </span>
              </div>
              <div>
                <Progress value={levelProgress} className="h-2" />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Seviye {level + 1} için {nextLevelStep - ((points?.points ?? 0) % nextLevelStep)} puan kaldı.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-xl bg-accent/50">
                  <p className="text-xs text-muted-foreground flex items-center gap-1"><Flame className="h-3 w-3 text-warning" /> Günlük seri</p>
                  <p className="text-lg font-bold">{points?.current_streak ?? 0} gün</p>
                </div>
                <div className="p-3 rounded-xl bg-accent/50">
                  <p className="text-xs text-muted-foreground flex items-center gap-1"><Trophy className="h-3 w-3 text-primary" /> En uzun seri</p>
                  <p className="text-lg font-bold">{points?.longest_streak ?? 0} gün</p>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Her gün giriş yaptığında puan kazanırsın. Seri büyüdükçe günlük puan da artar. Not yüklemek, test çözmek ve materyal üretmek ekstra puan getirir.
              </p>
            </>
          )}
        </CardContent>
      </Card>

      <Card className="glass-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Crown className="h-5 w-5 text-warning" /> Liderlik Tablosu
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-xl" />)
          ) : leaderboard.length === 0 ? (
            <p className="text-sm text-muted-foreground">Henüz puan toplayan yok. İlk sırayı sen kap.</p>
          ) : (
            leaderboard.map((row) => (
              <div
                key={row.user_id}
                className={`flex items-center gap-3 p-2.5 rounded-xl border transition-colors ${
                  row.user_id === user?.id ? 'border-primary/50 bg-primary/5' : 'border-transparent bg-accent/40 hover:bg-accent'
                }`}
              >
                <span className={`h-7 w-7 shrink-0 rounded-lg border inline-flex items-center justify-center text-xs font-bold ${rankStyles[row.rank - 1] ?? 'bg-accent text-muted-foreground border-border'}`}>
                  {row.rank}
                </span>
                <Avatar className="h-8 w-8">
                  <AvatarImage src={row.avatar_url || ''} />
                  <AvatarFallback className="text-xs">{row.full_name?.charAt(0)?.toUpperCase() || 'U'}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">
                    {row.full_name}
                    {row.user_id === user?.id && <span className="ml-2 text-[10px] text-primary">sen</span>}
                  </p>
                  <p className="text-[11px] text-muted-foreground truncate">{row.university || 'Üniversite belirtilmemiş'}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold">{row.points}</p>
                  <p className="text-[10px] text-muted-foreground flex items-center gap-1 justify-end"><Flame className="h-3 w-3" /> {row.current_streak}</p>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default LeaderboardCard;
