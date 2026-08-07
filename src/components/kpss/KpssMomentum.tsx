import { usePoints } from '@/hooks/usePoints';
import { Flame, Sparkles, Trophy, Crown } from 'lucide-react';

/** Compact motivation strip: points, streak and current leaderboard rank. */
const KpssMomentum = () => {
  const { points, leaderboard } = usePoints(10);
  const myRank = leaderboard.find(r => r.points === points?.points && r.current_streak === points?.current_streak)?.rank;

  const chips = [
    { icon: Sparkles, label: 'Puan', value: points?.points ?? 0, tone: 'text-primary' },
    { icon: Flame, label: 'Günlük seri', value: `${points?.current_streak ?? 0} gün`, tone: 'text-warning' },
    { icon: Trophy, label: 'En uzun seri', value: `${points?.longest_streak ?? 0} gün`, tone: 'text-success' },
    { icon: Crown, label: 'Sıralama', value: myRank ? `#${myRank}` : '—', tone: 'text-primary' },
  ];

  return (
    <div className="relative mt-5 flex flex-wrap gap-2">
      {chips.map(c => (
        <div key={c.label} className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-card/70 px-3 py-1.5">
          <c.icon className={`h-3.5 w-3.5 ${c.tone}`} />
          <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{c.label}</span>
          <span className="text-sm font-bold leading-none">{c.value}</span>
        </div>
      ))}
      <div className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 text-[11px] font-medium text-primary">
        Her tamamlanan deneme +10 ile +30 puan kazandırır.
      </div>
    </div>
  );
};

export default KpssMomentum;
