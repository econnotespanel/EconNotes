import React from 'react';
import kasimLogoLight from '@/assets/ataturk-10-kasim-light.png';
import kasimLogoDark from '@/assets/ataturk-10-kasim-dark.png';
import { cn } from '@/lib/utils';

export interface Ataturk10KasimEmblemProps {
  className?: string;
  allWhite?: boolean;
  onDark?: boolean;
}

/**
 * 10 Kasım Atatürk'ü Anma Günü (193∞) Amblemi.
 * Siyah arka plansız, şeffaf PNG formatında; temaya göre aydınlık modda koyu, karanlık modda beyaz renk alır.
 */
export const Ataturk10KasimEmblem: React.FC<Ataturk10KasimEmblemProps> = ({
  className = 'h-6 w-6 sm:h-7 sm:w-7',
  allWhite = false,
  onDark = false,
}) => {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center select-none overflow-hidden',
        className
      )}
      title="10 Kasım Atatürk'ü Anma Günü (1881-193∞)"
      aria-label="10 Kasım 193∞"
    >
      <img
        src={kasimLogoLight}
        alt="10 Kasım 193∞"
        className={cn(
          'h-full w-full object-contain',
          allWhite
            ? 'brightness-0 invert'
            : onDark
            ? 'hidden'
            : 'block dark:hidden'
        )}
      />
      {!allWhite && (
        <img
          src={kasimLogoDark}
          alt="10 Kasım 193∞"
          className={cn(
            'h-full w-full object-contain filter drop-shadow-[0_0_6px_rgba(255,255,255,0.25)]',
            onDark ? 'block' : 'hidden dark:block'
          )}
        />
      )}
    </span>
  );
};

export default Ataturk10KasimEmblem;
