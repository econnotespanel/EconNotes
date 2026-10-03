import lightLogo from '@/assets/econnotes-logo-new.png.asset.json';
import darkLogo from '@/assets/econnotes-logo-new-dark.png.asset.json';
import { cn } from '@/lib/utils';

/** The supplied EconNotes logo, tightly cropped for compact placement. */
export default function EconLogo({ className = '', onDark = false }: { className?: string; onDark?: boolean }) {
  return <span className={cn('inline-flex max-h-10 max-w-44 shrink-0 items-center', className)}>
    <img src={lightLogo.url} alt="EconNotes" className={cn('h-full w-full object-contain object-left', onDark ? 'hidden' : 'block dark:hidden')} />
    <img src={darkLogo.url} alt={onDark ? 'EconNotes' : ''} className={cn('h-full w-full object-contain object-left', onDark ? 'block' : 'hidden dark:block')} />
  </span>;
}