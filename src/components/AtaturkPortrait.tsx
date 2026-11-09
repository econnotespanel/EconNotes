import React from 'react';
import ataturkPortrait from '@/assets/ataturk-portrait-oval-bw.png';
import { cn } from '@/lib/utils';

export interface AtaturkPortraitProps {
  className?: string;
  imageClassName?: string;
}

/**
 * Gazi Mustafa Kemal Atatürk'ün 10 Kasım anma portresi.
 * Şeffaf arka planlı, saygın monokrom oval portre.
 */
export const AtaturkPortrait: React.FC<AtaturkPortraitProps> = ({
  className = 'h-7 w-auto sm:h-8',
  imageClassName = '',
}) => {
  return (
    <span
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center select-none',
        className
      )}
      title="Ulu Önder Gazi Mustafa Kemal Atatürk (1881 - 193∞)"
      aria-label="Mustafa Kemal Atatürk portresi"
    >
      <img
        src={ataturkPortrait}
        alt="Mustafa Kemal Atatürk"
        className={cn(
          'h-full w-auto object-contain filter drop-shadow-xs transition-transform hover:scale-105',
          imageClassName
        )}
        loading="eager"
      />
    </span>
  );
};

export default AtaturkPortrait;
