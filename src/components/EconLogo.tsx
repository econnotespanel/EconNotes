import lightLogo from '@/assets/econnotes-logo-light.png.asset.json';
import darkLogo from '@/assets/econnotes-logo-dark.png.asset.json';
import { cn } from '@/lib/utils';

/** Original supplied lettering, with contrast-adjusted ink for dark surfaces. */
export default function EconLogo({ className = '', onDark = false }: { className?: string; onDark?: boolean }) {
  return <span className={cn('inline-flex shrink-0 items-center', className)}>
    <img src={lightLogo.url} alt="EconNotes" className={cn('h-full w-full object-contain object-left', onDark ? 'hidden' : 'block dark:hidden')} />
    <img src={darkLogo.url} alt={onDark ? 'EconNotes' : ''} className={cn('h-full w-full object-contain object-left', onDark ? 'block' : 'hidden dark:block')} />
  </span>;
}