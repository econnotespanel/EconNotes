import { Lightbulb, X } from 'lucide-react';
import { useOnboarding } from '@/contexts/OnboardingContext';
import { CONTEXTUAL_TIPS, type ContextualTipId } from '@/lib/onboarding';
import { cn } from '@/lib/utils';

interface ContextualTipBannerProps {
  tipId: ContextualTipId;
  className?: string;
  compact?: boolean;
}

/**
 * Non-intrusive, per-user dismissible contextual hint shown on key pages
 * only after initial onboarding has been experienced or skipped.
 */
export const ContextualTipBanner = ({
  tipId,
  className,
  compact = false,
}: ContextualTipBannerProps) => {
  const { isTipVisible, dismissTip } = useOnboarding();

  if (!isTipVisible(tipId)) return null;

  const tip = CONTEXTUAL_TIPS[tipId];
  if (!tip) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid={`contextual-tip-${tipId}`}
      className={cn(
        'flex items-center justify-between gap-3 rounded-2xl border border-blue-200/85 bg-blue-50/75 text-[#0b2a6e] shadow-sm dark:border-blue-500/25 dark:bg-blue-500/10 dark:text-blue-100',
        compact ? 'px-3 py-2 text-xs' : 'px-4 py-2.5 text-xs sm:text-[13px]',
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#174ec4]/12 text-[#174ec4] dark:bg-blue-400/20 dark:text-blue-300">
          <Lightbulb className="h-3.5 w-3.5" strokeWidth={2} />
        </span>
        <p className="min-w-0 leading-snug">
          <span className="font-bold text-[#0b2a6e] dark:text-blue-200">İpucu: </span>
          <span className="font-medium text-foreground/90">{tip.message}</span>
        </p>
      </div>

      <button
        type="button"
        onClick={() => dismissTip(tipId)}
        aria-label={`${tip.title} ipucunu kapat`}
        className="inline-flex h-7 shrink-0 items-center gap-1 rounded-full px-2.5 text-[11px] font-semibold text-[#174ec4] transition-colors hover:bg-[#174ec4]/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:text-blue-300 dark:hover:bg-blue-400/15"
      >
        <span className="hidden sm:inline">Anladım</span>
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
};

export default ContextualTipBanner;
