import React from 'react';
import { cn } from '@/lib/utils';

interface PlayStationSymbolsProps {
  className?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  animated?: boolean;
  variant?: 'color' | 'mono' | 'glass';
}

/**
 * Authentic PlayStation DualSense Geometric Shapes (▲ ● ✕ ■)
 * Renders Triangle (Emerald), Circle (Coral), Cross (PS Blue), Square (Magenta)
 * with precise SVG geometry, smooth hover effects, and optional subtle pulse.
 */
export const PlayStationSymbols: React.FC<PlayStationSymbolsProps> = ({
  className,
  size = 'sm',
  animated = false,
  variant = 'color',
}) => {
  const sizeMap = {
    xs: 'h-3.5 gap-1.5',
    sm: 'h-4 gap-2',
    md: 'h-5 gap-2.5',
    lg: 'h-7 gap-3.5',
  };

  const iconSizes = {
    xs: 'w-3 h-3',
    sm: 'w-3.5 h-3.5',
    md: 'w-4 h-4',
    lg: 'w-6 h-6',
  };

  const isColor = variant === 'color';
  const isGlass = variant === 'glass';

  return (
    <div
      aria-label="PlayStation Shapes"
      className={cn(
        'inline-flex items-center select-none',
        sizeMap[size],
        className
      )}
    >
      {/* Triangle (Emerald/Cyan) */}
      <span
        title="PlayStation Triangle"
        className={cn(
          'inline-flex items-center justify-center transition-transform duration-300 hover:scale-125',
          animated && 'animate-pulse [animation-duration:3s]',
          isGlass && 'p-1 rounded-md bg-emerald-500/10 border border-emerald-500/20'
        )}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke={isColor ? '#00e699' : 'currentColor'}
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={cn(iconSizes[size], isColor && 'drop-shadow-[0_0_6px_rgba(0,230,153,0.5)]')}
        >
          <path d="M12 4L3 20h18L12 4z" />
        </svg>
      </span>

      {/* Circle (Coral/Red) */}
      <span
        title="PlayStation Circle"
        className={cn(
          'inline-flex items-center justify-center transition-transform duration-300 hover:scale-125',
          animated && 'animate-pulse [animation-duration:3s] [animation-delay:0.5s]',
          isGlass && 'p-1 rounded-md bg-red-500/10 border border-red-500/20'
        )}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke={isColor ? '#ff3b5c' : 'currentColor'}
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={cn(iconSizes[size], isColor && 'drop-shadow-[0_0_6px_rgba(255,59,92,0.5)]')}
        >
          <circle cx="12" cy="12" r="8" />
        </svg>
      </span>

      {/* Cross (PlayStation Royal Blue / Sky Cyan) */}
      <span
        title="PlayStation Cross"
        className={cn(
          'inline-flex items-center justify-center transition-transform duration-300 hover:scale-125',
          animated && 'animate-pulse [animation-duration:3s] [animation-delay:1s]',
          isGlass && 'p-1 rounded-md bg-blue-500/10 border border-blue-500/20'
        )}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke={isColor ? '#0090ff' : 'currentColor'}
          strokeWidth="3.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={cn(iconSizes[size], isColor && 'drop-shadow-[0_0_6px_rgba(0,144,255,0.6)]')}
        >
          <line x1="6" y1="6" x2="18" y2="18" />
          <line x1="18" y1="6" x2="6" y2="18" />
        </svg>
      </span>

      {/* Square (Magenta/Pink) */}
      <span
        title="PlayStation Square"
        className={cn(
          'inline-flex items-center justify-center transition-transform duration-300 hover:scale-125',
          animated && 'animate-pulse [animation-duration:3s] [animation-delay:1.5s]',
          isGlass && 'p-1 rounded-md bg-pink-500/10 border border-pink-500/20'
        )}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke={isColor ? '#ff3388' : 'currentColor'}
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={cn(iconSizes[size], isColor && 'drop-shadow-[0_0_6px_rgba(255,51,136,0.5)]')}
        >
          <rect x="5" y="5" width="14" height="14" rx="2" />
        </svg>
      </span>
    </div>
  );
};

export default PlayStationSymbols;
