import React, { useMemo } from 'react';
import EconLogo from '@/components/EconLogo';
import { RefreshCw, Home } from 'lucide-react';

export interface FatalErrorScreenProps {
  error?: Error | null;
  errorCode?: string;
  application?: string;
  status?: string;
  request?: string;
  timestamp?: string;
  onReload?: () => void;
  onGoHome?: () => void;
}

export const FatalErrorScreen: React.FC<FatalErrorScreenProps> = ({
  error,
  errorCode = 'ECON-FATAL-500',
  application = 'ECONNOTES-WEB',
  status = 'SERVICE_UNAVAILABLE',
  request = 'ACCESS_BLOCKED_FOR_MAINTENANCE',
  timestamp,
  onReload,
  onGoHome,
}) => {
  const formattedTimestamp = useMemo(() => {
    if (timestamp) return timestamp;
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(now.getDate())}.${pad(now.getMonth() + 1)}.${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  }, [timestamp]);

  const handleReload = () => {
    if (onReload) {
      onReload();
    } else {
      window.location.reload();
    }
  };

  const handleGoHome = () => {
    if (onGoHome) {
      onGoHome();
    } else {
      window.location.href = '/';
    }
  };

  return (
    <div className="relative min-h-screen w-full bg-[#1b0307] text-white flex flex-col justify-between overflow-hidden select-none">
      {/* Background Deep Crimson Gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#24050a] via-[#350810] to-[#120205] z-0 pointer-events-none" />

      {/* Diagonal Ribbons / Laser Slashes exactly as in the reference image */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden z-0">
        {/* Soft radial ambient glow */}
        <div className="absolute top-1/2 left-1/4 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] bg-red-600/15 rounded-full blur-[140px]" />

        {/* Laser line top */}
        <div 
          className="absolute left-[-25%] right-[-25%] top-[32%] h-[1.5px] bg-gradient-to-r from-transparent via-red-400/80 to-transparent -rotate-[16deg]" 
        />

        {/* Main prominent crimson red diagonal ribbon */}
        <div 
          className="absolute left-[-25%] right-[-25%] top-[42%] h-24 sm:h-28 md:h-36 bg-gradient-to-r from-[#b91c1c]/70 via-[#e11d48]/85 to-[#b91c1c]/70 -rotate-[16deg] shadow-[0_0_60px_rgba(225,29,72,0.45)] border-y border-red-400/60" 
        />

        {/* Secondary thinner diagonal band */}
        <div 
          className="absolute left-[-25%] right-[-25%] top-[62%] h-10 sm:h-14 bg-red-900/35 -rotate-[16deg] border-t border-red-500/30" 
        />

        {/* Thin razor laser line bottom */}
        <div 
          className="absolute left-[-25%] right-[-25%] top-[74%] h-[2px] bg-gradient-to-r from-transparent via-red-400/90 to-transparent -rotate-[16deg]" 
        />
      </div>

      {/* Top Header Bar */}
      <header className="relative z-10 w-full px-6 sm:px-10 lg:px-16 py-6 border-b border-white/20">
        <div className="flex items-center gap-4">
          <EconLogo allWhite className="h-7 w-auto" />
          <span className="text-white/40 text-lg font-light select-none">|</span>
          <span className="font-mono text-xs sm:text-sm uppercase tracking-[0.28em] text-white/90 font-semibold">
            SYSTEM STATUS
          </span>
        </div>
      </header>

      {/* Main Grid Content */}
      <main className="relative z-10 flex-1 w-full max-w-7xl mx-auto px-6 sm:px-10 lg:px-16 py-10 lg:py-16 flex flex-col justify-center">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14 items-start">
          
          {/* Left Column: Error Headline & User Message */}
          <div className="lg:col-span-7 flex flex-col justify-center space-y-4 md:space-y-6">
            <div className="font-mono text-xs sm:text-sm font-semibold tracking-[0.25em] text-white/90 uppercase">
              CRITICAL SERVICE INTERRUPTION
            </div>

            <div className="text-8xl sm:text-9xl md:text-[11rem] font-black tracking-tight text-white leading-none drop-shadow-sm select-text">
              500
            </div>

            <div className="text-xl sm:text-2xl md:text-3xl font-bold text-white tracking-wide">
              500 — Sunucu Hatası
            </div>

            {/* Accent divider line */}
            <div className="w-28 sm:w-36 h-[2px] bg-white/40 my-2" />

            <p className="text-sm sm:text-base md:text-lg text-white/85 max-w-xl leading-relaxed">
              EconNotes şu anda beklenmeyen bir sunucu hatası nedeniyle kullanılamıyor. Teknik ekip bilgilendirildi ve hizmetin yeniden başlatılması için çalışmalar sürdürülüyor.
            </p>

            {/* Recovery actions */}
            <div className="flex flex-wrap items-center gap-3 pt-4">
              <button
                type="button"
                onClick={handleReload}
                className="inline-flex items-center gap-2.5 px-6 py-2.5 rounded font-mono text-xs sm:text-sm font-bold uppercase tracking-wider text-white bg-white/10 hover:bg-white/20 border border-white/30 backdrop-blur-md transition-all active:scale-95 shadow-md"
              >
                <RefreshCw className="h-4 w-4" />
                Sayfayı Yenile
              </button>
              <button
                type="button"
                onClick={handleGoHome}
                className="inline-flex items-center gap-2.5 px-6 py-2.5 rounded font-mono text-xs sm:text-sm font-bold uppercase tracking-wider text-white/80 hover:text-white bg-transparent hover:bg-white/10 border border-white/20 transition-all active:scale-95"
              >
                <Home className="h-4 w-4" />
                Ana Sayfaya Dön
              </button>
            </div>
          </div>

          {/* Right Column: Monospace Metadata & System Diagnostic Box */}
          <div className="lg:col-span-5 lg:border-l lg:border-white/20 lg:pl-10 space-y-8">
            
            {/* Key-Value Technical Grid */}
            <div className="space-y-3 font-mono text-xs sm:text-sm">
              <div className="grid grid-cols-12 gap-2 py-0.5">
                <span className="col-span-5 text-white/70 font-semibold tracking-wider uppercase">
                  ERROR CODE
                </span>
                <span className="col-span-7 text-white font-bold tracking-wider select-text">
                  {errorCode}
                </span>
              </div>

              <div className="grid grid-cols-12 gap-2 py-0.5">
                <span className="col-span-5 text-white/70 font-semibold tracking-wider uppercase">
                  TIMESTAMP
                </span>
                <span className="col-span-7 text-white font-bold tracking-wider select-text">
                  {formattedTimestamp}
                </span>
              </div>

              <div className="grid grid-cols-12 gap-2 py-0.5">
                <span className="col-span-5 text-white/70 font-semibold tracking-wider uppercase">
                  APPLICATION
                </span>
                <span className="col-span-7 text-white font-bold tracking-wider select-text">
                  {application}
                </span>
              </div>

              <div className="grid grid-cols-12 gap-2 py-0.5">
                <span className="col-span-5 text-white/70 font-semibold tracking-wider uppercase">
                  STATUS
                </span>
                <span className="col-span-7 text-white font-bold tracking-wider select-text">
                  {status}
                </span>
              </div>

              <div className="grid grid-cols-12 gap-2 py-0.5">
                <span className="col-span-5 text-white/70 font-semibold tracking-wider uppercase">
                  REQUEST
                </span>
                <span className="col-span-7 text-white font-bold tracking-wider select-text break-all">
                  {request}
                </span>
              </div>
            </div>

            {/* System Diagnostic Box */}
            <div className="border border-white/40 bg-black/20 backdrop-blur-sm p-6 sm:p-7 space-y-3">
              <div className="font-mono text-sm sm:text-base font-bold text-white tracking-wide uppercase">
                System diagnostic
              </div>
              <p className="text-xs sm:text-sm text-white/85 leading-relaxed font-sans">
                Runtime could not establish a healthy application state. Administrator intervention is required before service can resume.
              </p>
              {error?.message && (
                <div className="pt-3 border-t border-white/20 mt-3">
                  <span className="font-mono text-[11px] text-red-300 font-semibold block mb-1">
                    DETAIL:
                  </span>
                  <p className="font-mono text-xs text-white/70 break-words max-h-28 overflow-y-auto select-text">
                    {error.message}
                  </p>
                </div>
              )}
            </div>

          </div>

        </div>
      </main>

      {/* Footer subtle spacer */}
      <footer className="relative z-10 w-full px-6 py-4 text-center text-xs font-mono text-white/30">
        ECONNOTES INFRASTRUCTURE MONITORING
      </footer>
    </div>
  );
};

export default FatalErrorScreen;
