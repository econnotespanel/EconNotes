import logoMark from '@/assets/econnotes-logo.png';
import { cn } from '@/lib/utils';

/** A locally bundled EconNotes mark and wordmark for every app surface. */
export default function EconLogo({ className = '', onDark = false, allWhite = false }: { className?: string; onDark?: boolean; allWhite?: boolean }) {
  const white = onDark || allWhite;

  return (
    <span
      role="img"
      aria-label="EconNotes"
      className={cn('inline-flex max-h-10 max-w-44 shrink-0 items-center overflow-hidden', className)}
    >
      <img
        src={logoMark}
        alt=""
        aria-hidden="true"
        className={cn('aspect-square h-full w-auto shrink-0 object-contain', white ? 'brightness-0 invert' : 'dark:brightness-0 dark:invert')}
      />
      <span className={cn('ml-1 inline-flex shrink-0 whitespace-nowrap text-sm font-black tracking-tight', white ? 'text-white' : 'text-foreground')}>
        <span>Econ</span>
        <span className={white ? 'text-white' : 'text-primary'}>Notes</span>
      </span>
    </span>
  );
}
