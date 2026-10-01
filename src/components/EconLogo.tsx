import lightLogo from '@/assets/econnotes-logo-light.png.asset.json';
import darkLogo from '@/assets/econnotes-logo-dark.png.asset.json';
import { cn } from '@/lib/utils';

/** Original supplied lettering, with contrast-adjusted ink for dark surfaces. */
export default function EconLogo({ className = '' }: { className?: string }) {
  return <span className={cn('inline-flex shrink-0 items-center', className)}>
    <img src={lightLogo.url} alt="EconNotes" className="block h-full w-full object-contain object-left dark:hidden" />
    <img src={darkLogo.url} alt="EconNotes" className="hidden h-full w-full object-contain object-left dark:block" />
  </span>;
}