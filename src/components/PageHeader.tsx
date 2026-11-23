import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { getSeasonalTheme, useSiteConfig } from '@/contexts/SiteConfigContext';
import { cn } from '@/lib/utils';

export interface PageHeaderProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  badge?: ReactNode;
  actions?: ReactNode;
  surface?: 'clean' | 'hero';
  className?: string;
}

/**
 * EconNotes 2026 Unified Page Header.
 *
 * Keeps every page's own purpose and density while sharing a consistent
 * typography, icon tile, spacing, navy/blue accent, dark-mode, 10 Kasım,
 * and mobile-responsive stack across the entire platform.
 */
export default function PageHeader({
  title,
  description,
  icon: Icon,
  badge,
  actions,
  surface = 'clean',
  className,
}: PageHeaderProps) {
  const { config } = useSiteConfig();
  const seasonalTheme = getSeasonalTheme(config.theme.seasonalMode || 'default');
  const isNovember10 = seasonalTheme?.id === 'november10';

  if (surface === 'hero') {
    return (
      <section
        className={cn(
          'relative overflow-hidden rounded-[22px] sm:rounded-[24px] px-5 py-5 sm:px-7 sm:py-6 text-white shadow-[0_14px_34px_-12px_rgba(7,26,66,0.42)]',
          isNovember10
            ? 'bg-gradient-to-r from-zinc-950 via-zinc-900 to-zinc-800'
            : 'bg-gradient-to-r from-[#06183d] via-[#0b2a6e] to-[#0f3a8f]',
          className,
        )}
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-12 -top-16 h-48 w-48 rounded-full bg-sky-400/20 blur-3xl"
        />
        <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3.5 sm:items-center">
            {Icon && (
              <div
                className={cn(
                  'flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border',
                  isNovember10
                    ? 'border-white/15 bg-white/10 text-zinc-100'
                    : 'border-sky-200/25 bg-sky-300/15 text-sky-100',
                )}
              >
                <Icon className="h-5 w-5" strokeWidth={1.9} />
              </div>
            )}
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-extrabold tracking-tight text-white sm:text-2xl">
                  {title}
                </h1>
                {badge}
              </div>
              {description && (
                <p className="max-w-2xl text-xs leading-relaxed text-blue-100/85 sm:text-sm">
                  {description}
                </p>
              )}
            </div>
          </div>

          {actions && (
            <div className="flex w-full shrink-0 flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
              {actions}
            </div>
          )}
        </div>
      </section>
    );
  }

  return (
    <div
      className={cn(
        'flex flex-col gap-3.5 sm:flex-row sm:items-center sm:justify-between',
        className,
      )}
    >
      <div className="flex min-w-0 items-start gap-3 sm:items-center">
        {Icon && (
          <div
            className={cn(
              'flex h-10 w-10 sm:h-11 sm:w-11 shrink-0 items-center justify-center rounded-2xl border',
              isNovember10
                ? 'border-border bg-muted text-foreground'
                : 'border-blue-200/80 bg-blue-50 text-blue-600 dark:border-blue-500/25 dark:bg-blue-500/15 dark:text-blue-400',
            )}
          >
            <Icon className="h-5 w-5" strokeWidth={1.9} />
          </div>
        )}
        <div className="min-w-0 space-y-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-extrabold tracking-tight text-foreground sm:text-2xl">
              {title}
            </h1>
            {badge}
          </div>
          {description && (
            <p className="text-xs leading-relaxed text-muted-foreground sm:text-sm">
              {description}
            </p>
          )}
        </div>
      </div>

      {actions && (
        <div className="flex w-full shrink-0 flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
          {actions}
        </div>
      )}
    </div>
  );
}
