import { cn } from '@/lib/utils';

interface TriviaArenaBackdropProps {
  variant?: 'lobby' | 'quiz' | 'result' | 'grand_prize' | 'cancelled';
}

/**
 * Architectural CSS + SVG ambient background for EconNotes Daily Trivia.
 * Uses deep navy, electric blue, and light blue transitions with restrained
 * low-opacity geometric curves — zero external images, zero distracting patterns
 * during active question reading, fully tuned for both Light and Dark themes.
 */
export function TriviaArenaBackdrop({ variant = 'lobby' }: TriviaArenaBackdropProps) {
  const isCalmQuiz = variant === 'quiz';
  const isGrandPrize = variant === 'grand_prize';

  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
      {/* Base directional gradient wash (Light & Dark tuned separately) */}
      <div
        className={cn(
          'absolute inset-0 transition-colors duration-300',
          isCalmQuiz
            ? 'bg-gradient-to-b from-[#edf3ff] via-[#f6f9ff] to-[#f8fafc] dark:from-[#040c1f] dark:via-[#061128] dark:to-[#040914]'
            : 'bg-gradient-to-br from-[#e6efff] via-[#f4f8ff] to-[#edf4ff] dark:from-[#040d22] dark:via-[#071636] dark:to-[#040a18]',
        )}
      />

      {/* Restrained radial electric-blue ambient light transitions */}
      <div
        className={cn(
          'absolute -top-44 left-1/2 h-[480px] w-[860px] -translate-x-1/2 rounded-full blur-[120px] transition-opacity duration-300',
          isCalmQuiz
            ? 'bg-gradient-to-b from-[#174ec4]/15 via-[#3b82f6]/10 to-transparent opacity-80 dark:from-[#1f62e8]/20 dark:via-[#0b2a6e]/15'
            : 'bg-gradient-to-b from-[#174ec4]/20 via-[#3b82f6]/15 to-transparent dark:from-[#2563eb]/30 dark:via-[#0c2d73]/20',
        )}
      />

      <div
        className={cn(
          'absolute -bottom-32 -right-24 h-[400px] w-[540px] rounded-full blur-[120px]',
          isGrandPrize
            ? 'bg-gradient-to-tl from-amber-400/20 via-[#2563eb]/15 to-transparent dark:from-amber-400/20 dark:via-[#1f62e8]/20'
            : isCalmQuiz
            ? 'bg-gradient-to-tl from-[#60a5fa]/10 via-[#1d4ed8]/5 to-transparent dark:from-[#1d4ed8]/15 dark:via-[#0ea5e9]/10'
            : 'bg-gradient-to-tl from-[#38bdf8]/15 via-[#1d4ed8]/10 to-transparent dark:from-[#1d4ed8]/20 dark:via-[#38bdf8]/10',
        )}
      />

      {/* Crisp low-opacity geometric SVG curves & hairline structure */}
      <svg
        viewBox="0 0 1440 900"
        fill="none"
        preserveAspectRatio="xMidYMid slice"
        className={cn(
          'absolute inset-0 h-full w-full transition-opacity duration-300',
          isCalmQuiz
            ? 'text-[#174ec4] opacity-[0.045] dark:text-[#60a5fa] dark:opacity-[0.065]'
            : 'text-[#174ec4] opacity-[0.075] dark:text-[#60a5fa] dark:opacity-[0.11]',
        )}
      >
        <path
          d="M-80 180 C 260 60, 540 310, 960 150 C 1180 65, 1340 120, 1540 20"
          stroke="currentColor"
          strokeWidth="1.25"
        />
        <path
          d="M-120 740 C 240 610, 620 820, 1080 650 C 1260 585, 1390 610, 1560 520"
          stroke="currentColor"
          strokeWidth="1.15"
        />
        <circle cx="1220" cy="140" r="210" stroke="currentColor" strokeWidth="1" strokeDasharray="4 8" />
        <circle cx="180" cy="760" r="170" stroke="currentColor" strokeWidth="1" />
      </svg>
    </div>
  );
}

/**
 * Subtle curved architectural line overlay placed strictly in the deepest
 * background layer of Navy/Electric-Blue card headers (behind all text/badges).
 */
export function TriviaHeroBannerPattern({ goldAccent = false }: { goldAccent?: boolean }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden="true">
      <div
        className={cn(
          'absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent to-transparent',
          goldAccent ? 'via-amber-200/80' : 'via-sky-200/60',
        )}
      />
      <div className="absolute -right-16 -top-16 h-52 w-52 rounded-full bg-sky-400/20 blur-3xl" />
      <div
        className={cn(
          'absolute -bottom-20 -left-12 h-48 w-48 rounded-full blur-3xl',
          goldAccent ? 'bg-amber-400/25' : 'bg-blue-400/20',
        )}
      />
      <svg
        viewBox="0 0 800 260"
        fill="none"
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full opacity-[0.14]"
      >
        <path
          d="M-40 230 C 190 120, 460 190, 840 30"
          stroke="white"
          strokeWidth="1.3"
        />
        <path
          d="M-20 175 C 230 70, 520 135, 830 -25"
          stroke="white"
          strokeWidth="0.9"
          strokeOpacity="0.65"
        />
      </svg>
    </div>
  );
}
