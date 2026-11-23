import { ArrowRight, ListOrdered } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import type { LeaderboardRow } from '@/hooks/usePoints';
import { cn } from '@/lib/utils';

interface DashboardLeaderboardCardProps {
  leaderboard: LeaderboardRow[];
  currentUserId?: string;
  currentUserName: string;
  currentUserAvatar?: string | null;
  currentUserPoints: number;
  loading: boolean;
  isNovember10?: boolean;
  onViewAll: () => void;
  className?: string;
}

const getInitials = (name: string) => {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'Ö';
  if (parts.length === 1) return parts[0].slice(0, 2).toLocaleUpperCase('tr-TR');
  return `${parts[0][0] || ''}${parts[1][0] || ''}`.toLocaleUpperCase('tr-TR');
};

const getRankBadgeClass = (rank: number, isNovember10: boolean) => {
  if (isNovember10) {
    if (rank === 1) return 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950 font-extrabold shadow-sm';
    if (rank === 2) return 'bg-zinc-200 text-zinc-900 dark:bg-zinc-700 dark:text-zinc-100 font-bold';
    if (rank === 3) return 'bg-zinc-100 text-zinc-700 border border-zinc-300 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700 font-bold';
    return 'bg-muted text-muted-foreground font-semibold';
  }
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

const DashboardLeaderboardCard = ({
  leaderboard,
  currentUserId,
  currentUserName,
  currentUserAvatar,
  currentUserPoints,
  loading,
  isNovember10 = false,
  onViewAll,
  className,
}: DashboardLeaderboardCardProps) => {
  const topRows = leaderboard.slice(0, 5);
  const currentUserEntry = currentUserId
    ? leaderboard.find((row) => row.user_id === currentUserId) ?? null
    : null;
  const isCurrentUserInTop = Boolean(
    currentUserId && topRows.some((row) => row.user_id === currentUserId),
  );

  const renderRow = (row: {
    user_id: string;
    full_name: string;
    avatar_url: string | null;
    points: number;
    rank: number | null;
    isSelf: boolean;
  }) => {
    const rankNum = row.rank;
    const isTopThree = rankNum !== null && rankNum >= 1 && rankNum <= 3;

    return (
      <div
        key={row.user_id}
        className={cn(
          'flex min-w-0 items-center gap-2.5 rounded-full border px-2.5 py-2 transition-colors',
          row.isSelf
            ? isNovember10
              ? 'border-zinc-900/40 bg-zinc-900/5 ring-1 ring-zinc-900/15 dark:border-zinc-200/40 dark:bg-zinc-100/10'
              : 'border-blue-500/40 bg-blue-50/90 ring-1 ring-blue-500/15 dark:border-blue-400/35 dark:bg-blue-500/15 dark:ring-blue-400/20'
            : isTopThree
              ? 'border-slate-200/80 bg-slate-50/70 dark:border-slate-800/80 dark:bg-slate-900/50'
              : 'border-slate-200/60 bg-card dark:border-slate-800/60',
        )}
      >
        {/* Clean Numeric Rank Pill (zero decorative trophy/medal art) */}
        <span
          className={cn(
            'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs tabular-nums',
            rankNum !== null
              ? getRankBadgeClass(rankNum, isNovember10)
              : 'bg-muted text-muted-foreground font-semibold',
          )}
          aria-label={rankNum !== null ? `${rankNum}. sıra` : 'Sıralama dışı'}
        >
          {rankNum !== null ? rankNum : '—'}
        </span>

        {/* Profile Photo or Turkish Initials Avatar */}
        <Avatar className="h-8 w-8 shrink-0 border border-slate-200/80 dark:border-slate-700/80">
          {row.avatar_url ? <AvatarImage src={row.avatar_url} alt={row.full_name} /> : null}
          <AvatarFallback
            className={cn(
              'text-[11px] font-bold',
              row.isSelf
                ? 'bg-primary text-white'
                : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
            )}
          >
            {getInitials(row.full_name)}
          </AvatarFallback>
        </Avatar>

        {/* Display Name (privacy-masked server-side) */}
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <span
              className={cn(
                'truncate text-[13px] leading-tight',
                row.isSelf ? 'font-bold text-foreground' : 'font-semibold text-foreground',
              )}
            >
              {row.full_name || 'Kullanıcı'}
            </span>
            {row.isSelf && (
              <span
                className={cn(
                  'shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none',
                  isNovember10
                    ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950'
                    : 'bg-primary text-white',
                )}
              >
                Sen
              </span>
            )}
          </div>
        </div>

        {/* XP Score Pill */}
        <span
          className={cn(
            'shrink-0 rounded-full px-2.5 py-1 text-xs font-extrabold tabular-nums',
            row.isSelf
              ? isNovember10
                ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950'
                : 'bg-primary/15 text-primary dark:bg-blue-500/25 dark:text-blue-200'
              : 'bg-slate-100/90 text-slate-700 dark:bg-slate-800/80 dark:text-slate-200',
          )}
        >
          {row.points.toLocaleString('tr-TR')} XP
        </span>
      </div>
    );
  };

  return (
    <div
      className={cn(
        'flex flex-col justify-between rounded-[22px] border border-slate-200/85 dark:border-slate-800/90 bg-card p-4 sm:p-5 shadow-[0_6px_24px_rgba(15,23,42,0.035)]',
        className,
      )}
    >
      <div>
        {/* Header */}
        <div className="mb-3.5 flex flex-wrap items-center justify-between gap-x-2.5 gap-y-1.5">
          <div className="flex items-center gap-2">
            <ListOrdered className="h-[18px] w-[18px] shrink-0 text-primary" strokeWidth={2} />
            <h2 className="whitespace-nowrap text-[15.5px] font-bold leading-snug tracking-tight text-foreground sm:text-[16px]">
              Liderlik Tablosu
            </h2>
          </div>

          <button
            type="button"
            onClick={onViewAll}
            className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 py-1 -mr-2 text-xs font-semibold text-primary transition-colors hover:bg-primary/10"
          >
            <span>Tümünü Gör</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Signed-in User Rank Summary Pill */}
        {!loading && currentUserId && (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-full border border-slate-200/80 dark:border-slate-800/90 bg-slate-50/90 dark:bg-slate-900/60 px-3.5 py-1.5 text-xs">
            <span className="font-medium text-muted-foreground">
              Senin sıran:{' '}
              <strong className="font-extrabold text-foreground tabular-nums">
                {currentUserEntry
                  ? `#${currentUserEntry.rank}`
                  : currentUserPoints > 0
                    ? '#100+'
                    : 'Henüz yok'}
              </strong>
            </span>
            <span className="font-bold text-primary tabular-nums">
              {currentUserPoints.toLocaleString('tr-TR')} XP
            </span>
          </div>
        )}

        {/* Leaderboard Rows */}
        {loading ? (
          <div className="space-y-2.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-2.5 rounded-full border border-border/50 px-2.5 py-2">
                <Skeleton className="h-7 w-7 rounded-full shrink-0" />
                <Skeleton className="h-8 w-8 rounded-full shrink-0" />
                <Skeleton className="h-3.5 flex-1 rounded-full" />
                <Skeleton className="h-6 w-16 rounded-full shrink-0" />
              </div>
            ))}
          </div>
        ) : topRows.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/80 px-4 py-9 text-center">
            <ListOrdered className="mb-2 h-6 w-6 text-muted-foreground/60" />
            <p className="text-sm font-semibold text-foreground">Sıralama henüz oluşmadı</p>
            <p className="mt-1 text-xs text-muted-foreground">
              XP kazanmaya başladığında sıralama burada canlı güncellenir.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {topRows.map((row) =>
              renderRow({
                user_id: row.user_id,
                full_name: row.full_name,
                avatar_url: row.avatar_url,
                points: row.points,
                rank: row.rank,
                isSelf: row.user_id === currentUserId,
              }),
            )}

            {/* If signed-in user is outside top 5, pin their real standing cleanly below */}
            {currentUserId && !isCurrentUserInTop && (
              <div className="border-t border-dashed border-slate-200/80 dark:border-slate-800/80 pt-2 mt-2">
                {renderRow({
                  user_id: currentUserId,
                  full_name: currentUserEntry?.full_name || currentUserName,
                  avatar_url: currentUserEntry?.avatar_url ?? currentUserAvatar ?? null,
                  points: currentUserEntry?.points ?? currentUserPoints,
                  rank: currentUserEntry?.rank ?? null,
                  isSelf: true,
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer Note + Full Leaderboard Link */}
      <div className="mt-4 flex items-center justify-between gap-2 border-t border-slate-100 dark:border-slate-800/80 pt-3 text-xs text-muted-foreground">
        <span className="truncate">Canlı XP sıralaması</span>
        <button
          type="button"
          onClick={onViewAll}
          className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary transition-colors hover:bg-primary/15"
        >
          <span>Tüm Sıralama</span>
          <ArrowRight className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
};

export default DashboardLeaderboardCard;
