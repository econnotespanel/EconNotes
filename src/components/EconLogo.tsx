import lightLogo from '@/assets/econnotes-logo-new.png.asset.json';
import darkLogo from '@/assets/econnotes-logo-new-dark.png.asset.json';
import { cn } from '@/lib/utils';

/** Uploaded EconNotes lettering, closely cropped for legible navigation sizing. */
export default function EconLogo({ className = '', onDark = false }: { className?: string; onDark?: boolean }) {
  return <span className={cn('inline-flex shrink-0 items-center', className)}>
    <img src={lightLogo.url} alt="EconNotes" className={cn('h-full w-full object-contain object-left', onDark ? 'hidden' : 'block dark:hidden')} />
    <img src={darkLogo.url} alt={onDark ? 'EconNotes' : ''} className={cn('h-full w-full object-contain object-left', onDark ? 'block' : 'hidden dark:block')} />
  </span>;
}