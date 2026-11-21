import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Crown, Sparkles, Trophy, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import {
  getTriviaUnlimitedRemainingLabel,
  isTriviaUnlimitedActive,
} from '@/lib/dailyTrivia';
import { cn } from '@/lib/utils';

/**
 * Bağımsız Günlük Genel Kültür Bilgi Yarışması hızlı başlatıcı kutusu.
 * Herhangi bir mevcut menüye veya sekmeye bağlı olmadan yalnızca ana sayfada
 * (Pazartesi Şans Çarkı kutusunun hemen üzerinde, çakışmadan) görünür.
 */
const DailyTriviaLauncher = () => {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [dismissed, setDismissed] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [, setTick] = useState(0);

  useEffect(() => {
    const handleSidebarState = (e: Event) => {
      const customEvent = e as CustomEvent<{ open: boolean }>;
      if (customEvent.detail && typeof customEvent.detail.open === 'boolean') {
        setIsSidebarOpen(customEvent.detail.open);
      }
    };
    const handleTriviaUpdated = () => setTick((t) => t + 1);
    window.addEventListener('econnotes:sidebar-state', handleSidebarState as EventListener);
    window.addEventListener('econnotes:trivia-updated', handleTriviaUpdated);
    return () => {
      window.removeEventListener('econnotes:sidebar-state', handleSidebarState as EventListener);
      window.removeEventListener('econnotes:trivia-updated', handleTriviaUpdated);
    };
  }, []);

  const unlimitedActive = isTriviaUnlimitedActive(user, profile as any);

  useEffect(() => {
    if (!unlimitedActive) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 15_000);
    return () => window.clearInterval(id);
  }, [unlimitedActive]);

  if (!user || dismissed || location.pathname !== '/') return null;

  const remainingLabel = unlimitedActive
    ? getTriviaUnlimitedRemainingLabel(user, profile as any)
    : '';

  return (
    <div
      className={cn(
        'fixed bottom-[calc(env(safe-area-inset-bottom,0px)+10.35rem)] right-3.5 z-30 md:bottom-[5.95rem] md:right-5 items-center',
        isSidebarOpen ? 'hidden md:flex' : 'flex',
      )}
    >
      <div
        className={cn(
          'group relative flex items-center gap-3 overflow-hidden rounded-[22px] p-2.5 pr-3 text-white',
          unlimitedActive
            ? 'border border-amber-300/45 bg-gradient-to-r from-amber-600/95 via-orange-600/95 to-[#003791]/95 shadow-[0_16px_40px_-8px_rgba(245,158,11,0.45)]'
            : 'border border-indigo-300/35 bg-gradient-to-r from-[#0f172a]/95 via-[#1e3a8a]/95 to-[#2563eb]/95 shadow-[0_16px_40px_-8px_rgba(30,58,138,0.5)]',
          'backdrop-blur-2xl transition-all duration-300 hover:-translate-y-0.5',
        )}
      >
        <div className="pointer-events-none absolute inset-x-5 top-0 h-px bg-gradient-to-r from-transparent via-amber-300/75 to-transparent" />

        <button
          type="button"
          onClick={() => navigate('/gunluk-yarisma')}
          className="relative z-10 flex items-center gap-3 text-left focus:outline-none"
        >
          <div
            className={cn(
              'relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border shadow-inner',
              unlimitedActive
                ? 'border-amber-200/40 bg-amber-400/20 text-amber-200'
                : 'border-amber-300/35 bg-gradient-to-br from-amber-500/25 via-indigo-900/60 to-blue-600/40 text-amber-300',
            )}
          >
            {unlimitedActive ? <Crown className="h-5 w-5" /> : <Trophy className="h-5 w-5" />}
            <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-amber-400 ring-2 ring-[#0f172a] animate-pulse" />
          </div>

          <div className="min-w-0 pr-0.5">
            <span className="block whitespace-nowrap text-[13px] font-extrabold tracking-tight text-white">
              Günlük Bilgi Yarışması
            </span>
            <p className="mt-0.5 flex items-center gap-1 whitespace-nowrap text-[11px] font-medium text-blue-100/90">
              <Sparkles className="h-3 w-3 shrink-0 text-amber-300" />
              <span>
                {unlimitedActive
                  ? `2 Saat Sınırsız: ${remainingLabel}`
                  : '15 Soru · 375 XP & 2 Saat Sınırsız'}
              </span>
            </p>
          </div>
        </button>

        <div className="relative z-10 flex items-center border-l border-white/15 pl-1">
          <button
            type="button"
            aria-label="Günlük yarışma kutusunu gizle"
            onClick={(e) => {
              e.stopPropagation();
              setDismissed(true);
            }}
            className="flex h-7 w-7 items-center justify-center rounded-full text-blue-100/75 transition-colors hover:bg-white/15 hover:text-white active:scale-90"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default DailyTriviaLauncher;
