import lightLogo from '@/assets/econnotes-brand-light.png';
import darkLogo from '@/assets/econnotes-brand-dark.png';
import { cn } from '@/lib/utils';

/** The supplied EconNotes logo with a dark-mode wordmark variant. */
export default function EconLogo({ className = '', onDark = false, allWhite = false }: { className?: string; onDark?: boolean; allWhite?: boolean }) {
  return <span className={cn('inline-flex max-h-10 max-w-44 shrink-0 items-center', className)}>
    <img
      src={allWhite ? darkLogo : lightLogo}
      alt="EconNotes"
      className={cn('h-full w-full object-contain object-left', allWhite ? 'brightness-0 invert' : onDark ? 'hidden' : 'block dark:hidden')}
    />
    {!allWhite && (
      <img
        src={darkLogo}
        alt=""
        aria-hidden="true"
        className={cn('h-full w-full object-contain object-left', onDark ? 'block' : 'hidden dark:block')}
      />
    )}
  </span>;
}