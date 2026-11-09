import lightLogo from '@/assets/econnotes-brand-light.png';
import darkLogo from '@/assets/econnotes-brand-dark.png';
import Ataturk10KasimEmblem from '@/components/Ataturk10KasimEmblem';
import { cn } from '@/lib/utils';

/** The supplied EconNotes logo with a dark-mode wordmark variant and 10 Kasım commemorative emblem support. */
export default function EconLogo({
  className = '',
  onDark = false,
  allWhite = false,
  show10Kasim = false,
}: {
  className?: string;
  onDark?: boolean;
  allWhite?: boolean;
  show10Kasim?: boolean;
}) {
  return (
    <span className={cn('inline-flex max-w-full shrink-0 items-center overflow-hidden', className)}>
      <img
        src={lightLogo}
        alt="EconNotes"
        className={cn(
          'h-full w-auto max-h-full max-w-full object-contain object-center',
          allWhite ? 'brightness-0 invert' : onDark ? 'hidden' : 'block dark:hidden'
        )}
      />
      {!allWhite && (
        <img
          src={darkLogo}
          alt="EconNotes"
          className={cn(
            'h-full w-auto max-h-full max-w-full object-contain object-center',
            onDark ? 'block' : 'hidden dark:block'
          )}
        />
      )}
      {show10Kasim && (
        <span className="ml-2 pl-2 border-l border-current/30 inline-flex items-center shrink-0 h-full">
          <Ataturk10KasimEmblem className="h-full aspect-square" allWhite={allWhite} onDark={onDark} />
        </span>
      )}
    </span>
  );
}
