import React from 'react';
import ataturkPortrait from '@/assets/ataturk-portrait-square.png';
import { cn } from '@/lib/utils';

export interface AtaturkPortraitProps {
  className?: string;
  imageClassName?: string;
}

/**
 * Gazi Mustafa Kemal Atatürk'ün 10 Kasım anma portresi.
 * Dairesel rozet, yüksek çözünürlüklü monokrom fotoğraf.
 */
export const AtaturkPortrait: React.FC<AtaturkPortraitProps> = ({
  className = 'h-6 w-6 sm:h-7 sm:w-7',
  imageClassName = '',
}) => {
  return (
    <span
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center rounded-full overflow-hidden border border-foreground/30 shadow-xs ring-1 ring-border/80 bg-black select-none',
        className
      )}
      title="Ulu Önder Gazi Mustafa Kemal Atatürk (1881 - 193∞)"
      aria-label="Mustafa Kemal Atatürk portresi"
    >
      <img
        src={ataturkPortrait}
        alt="Mustafa Kemal Atatürk"
        className={cn('h-full w-full object-cover grayscale contrast-125', imageClassName)}
        loading="eager"
      />
    </span>
  );
};

export default AtaturkPortrait;
