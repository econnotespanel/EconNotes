import lightLogo from '@/assets/econnotes-brand-light.png';
import darkLogo from '@/assets/econnotes-brand-dark.png';
import { cn } from '@/lib/utils';

/** The supplied EconNotes logo with a dark-mode wordmark variant. */
export default function EconLogo({ className = '', onDark = false, allWhite = false }: { className?: string; onDark?: boolean; allWhite?: boolean }) {
  return <span className={cn('inline-flex max-w-full shrink-0 items-center', className)}>
    <img
      src={lightLogo}
      alt="EconNotes"
      className={cn('h-full w-full object-contain object-center', allWhite ? 'brightness-0 invert' : onDark ? 'hidden' : 'block dark:hidden')}
    />
    {!allWhite && (
      <img
        src={darkLogo}
        alt="EconNotes"
        className={cn('h-full w-full object-contain object-center', onDark ? 'block' : 'hidden dark:block')}
      />
    )}
  </span>;
}