import React, { useMemo, useState, useEffect } from 'react';
import EconLogo from '@/components/EconLogo';
import { RefreshCw, Home, Shield, Globe, Layers } from 'lucide-react';

export interface MultilingualNotice {
  code: string;
  language: string;
  flag: string;
  message: string;
}

export const MULTILINGUAL_NOTICES: MultilingualNotice[] = [
  {
    code: 'TR',
    language: 'Türkçe',
    flag: '🇹🇷',
    message: 'Ciddi bir hata oluştu. Yardım için teknik destek ekibiyle iletişime geçin.',
  },
  {
    code: 'EN',
    language: 'English',
    flag: '🇬🇧',
    message: 'A serious error has occurred. Contact technical support for assistance.',
  },
  {
    code: 'PT-BR',
    language: 'Português (Brasil)',
    flag: '🇧🇷',
    message: 'Ocorreu um erro grave. Entre em contato com o suporte técnico para obter assistência.',
  },
  {
    code: 'PT-PT',
    language: 'Português (Portugal)',
    flag: '🇵🇹',
    message: 'Ocorreu um erro grave. Contacte o apoio técnico para assistência.',
  },
  {
    code: 'RU',
    language: 'Русский',
    flag: '🇷🇺',
    message: 'Произошла неустранимая ошибка. Обратитесь в центр технической поддержки.',
  },
  {
    code: 'SV',
    language: 'Svenska',
    flag: '🇸🇪',
    message: 'Ett allvarligt fel har uppstått. Kontakta teknisk support om du vill ha hjälp.',
  },
  {
    code: 'JA',
    language: '日本語',
    flag: '🇯🇵',
    message: '予期せぬエラーが発生しました。インフォメーションセンターへお問い合わせください。',
  },
  {
    code: 'KO',
    language: '한국어',
    flag: '🇰🇷',
    message: '심각한 에러가 발생했습니다. 인포메이션 센터로 문의해 주십시오.',
  },
  {
    code: 'ZH-CN',
    language: '简体中文',
    flag: '🇨🇳',
    message: '发生了严重错误。请拨打服务热线寻求技术支持。',
  },
  {
    code: 'ZH-TW',
    language: '繁體中文',
    flag: '🇹🇼',
    message: '發生未預期錯誤。請聯絡技術支援中心，以取得必要協助。',
  },
  {
    code: 'DE',
    language: 'Deutsch',
    flag: '🇩🇪',
    message: 'Ein schwerwiegender Fehler ist aufgetreten. Bitte wenden Sie sich an den technischen Support.',
  },
  {
    code: 'FR',
    language: 'Français',
    flag: '🇫🇷',
    message: 'Une erreur grave est survenue. Contactez l\'assistance technique pour obtenir de l\'aide.',
  },
  {
    code: 'ES',
    language: 'Español',
    flag: '🇪🇸',
    message: 'Se ha producido un error grave. Póngase en contacto con el servicio de soporte técnico.',
  },
  {
    code: 'IT',
    language: 'Italiano',
    flag: '🇮🇹',
    message: 'Si è verificato un errore grave. Contattare l\'assistenza tecnica per ricevere supporto.',
  },
  {
    code: 'NL',
    language: 'Nederlands',
    flag: '🇳🇱',
    message: 'Er is een ernstige fout opgetreden. Neem contact op met de technische ondersteuning.',
  },
  {
    code: 'PL',
    language: 'Polski',
    flag: '🇵🇱',
    message: 'Wystąpił poważny błąd. Skontaktuj się z działem pomocy technicznej.',
  },
  {
    code: 'AR',
    language: 'العربية',
    flag: '🇸🇦',
    message: 'حدث خطأ فادح في النظام. يرجى التواصل مع فريق الدعم الفني للحصول على المساعدة.',
  },
  {
    code: 'EL',
    language: 'Ελληνικά',
    flag: '🇬🇷',
    message: 'Παρουσιάστηκε σοβαρό σφάλμα. Επικοινωνήστε με την τεχνική υποστήριξη.',
  },
  {
    code: 'HI',
    language: 'हिन्दी',
    flag: '🇮🇳',
    message: 'एक गंभीर त्रुटि उत्पन्न हुई है। सहायता के लिए तकनीकी सहायता टीम से संपर्क करें।',
  },
];

export interface FatalErrorScreenProps {
  error?: Error | null;
  errorCode?: string;
  application?: string;
  status?: string;
  request?: string;
  timestamp?: string;
  title?: string | null;
  message?: string | null;
  onReload?: () => void;
  onGoHome?: () => void;
  adminControls?: React.ReactNode;
}

export const FatalErrorScreen: React.FC<FatalErrorScreenProps> = ({
  error,
  errorCode = 'ECON-FATAL-500',
  application = 'ECONNOTES-WEB',
  status = 'SERVICE_UNAVAILABLE',
  request = 'ACCESS_BLOCKED_FOR_MAINTENANCE',
  timestamp,
  title,
  message,
  onReload,
  onGoHome,
  adminControls,
}) => {
  const [currentLangIndex, setCurrentLangIndex] = useState(0);
  const [isFading, setIsFading] = useState(false);
  const [showAllLanguages, setShowAllLanguages] = useState(false);

  // Smooth fade-in / fade-out cycling through 19 languages every 3.2 seconds
  useEffect(() => {
    if (showAllLanguages) return;

    const interval = setInterval(() => {
      setIsFading(true);
      setTimeout(() => {
        setCurrentLangIndex((prev) => (prev + 1) % MULTILINGUAL_NOTICES.length);
        setIsFading(false);
      }, 350);
    }, 3200);

    return () => clearInterval(interval);
  }, [showAllLanguages]);

  const currentLang = MULTILINGUAL_NOTICES[currentLangIndex] || MULTILINGUAL_NOTICES[0];

  const formattedTimestamp = useMemo(() => {
    if (timestamp) return timestamp;
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(now.getDate())}.${pad(now.getMonth() + 1)}.${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  }, [timestamp]);

  const displayTitle = title?.trim() || '500 — Sunucu Hatası';
  const displayMessage =
    message?.trim() ||
    'EconNotes şu anda beklenmeyen bir sunucu hatası nedeniyle kullanılamıyor. Teknik ekip bilgilendirildi ve hizmetin yeniden başlatılması için çalışmalar sürdürülüyor.';

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
      <header className="relative z-10 w-full px-6 sm:px-10 lg:px-16 py-6 border-b border-white/20 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <EconLogo allWhite className="h-7 w-auto" />
          <span className="text-white/40 text-lg font-light select-none">|</span>
          <span className="font-mono text-xs sm:text-sm uppercase tracking-[0.28em] text-white/90 font-semibold">
            SYSTEM STATUS
          </span>
        </div>

        <div className="flex items-center gap-3">
          {adminControls}
          <a
            href="/admin"
            className="hidden sm:inline-flex items-center gap-1.5 font-mono text-xs text-white/60 hover:text-white border border-white/20 hover:border-white/50 px-3 py-1.5 rounded transition-all bg-black/20"
          >
            <Shield className="h-3.5 w-3.5" />
            <span>YÖNETİCİ PANELİ</span>
          </a>
        </div>
      </header>

      {/* Main Grid Content */}
      <main className="relative z-10 flex-1 w-full max-w-7xl mx-auto px-6 sm:px-10 lg:px-16 py-8 lg:py-14 flex flex-col justify-center">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-14 items-start">
          
          {/* Left Column: Error Headline, Multilingual Cycling Banner & Actions */}
          <div className="lg:col-span-7 flex flex-col justify-center space-y-4 md:space-y-5">
            <div className="font-mono text-xs sm:text-sm font-semibold tracking-[0.25em] text-white/90 uppercase">
              CRITICAL SERVICE INTERRUPTION
            </div>

            <div className="text-8xl sm:text-9xl md:text-[10.5rem] font-black tracking-tight text-white leading-none drop-shadow-sm select-text">
              500
            </div>

            <div className="text-xl sm:text-2xl md:text-3xl font-bold text-white tracking-wide">
              {displayTitle}
            </div>

            {/* Accent divider line */}
            <div className="w-28 sm:w-36 h-[2px] bg-white/40 my-1" />

            <p className="text-sm sm:text-base text-white/85 max-w-xl leading-relaxed">
              {displayMessage}
            </p>

            {/* Multilingual RSOD System Banner (19 Languages cycling with fade in/out) */}
            <div className="w-full max-w-xl rounded-lg border border-white/20 bg-black/35 backdrop-blur-md p-3.5 sm:p-4 shadow-xl">
              <div className="flex items-center justify-between border-b border-white/10 pb-2 mb-2.5">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-red-500 animate-ping" />
                  <span className="font-mono text-[10px] sm:text-xs uppercase tracking-widest text-red-200 font-bold flex items-center gap-1.5">
                    <Globe className="h-3.5 w-3.5" />
                    MULTILINGUAL NOTICE // ÇOK DİLLİ UYARI
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10px] text-white/60">
                    {currentLang.code} ({currentLangIndex + 1}/{MULTILINGUAL_NOTICES.length})
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowAllLanguages((prev) => !prev)}
                    className="inline-flex items-center gap-1 font-mono text-[10px] text-white/80 hover:text-white bg-white/10 hover:bg-white/20 px-2 py-0.5 rounded transition-colors"
                  >
                    <Layers className="h-2.5 w-2.5" />
                    {showAllLanguages ? 'Döngü' : 'Tümü'}
                  </button>
                </div>
              </div>

              {!showAllLanguages ? (
                <div className="min-h-[56px] sm:min-h-[60px] flex flex-col justify-center">
                  <div
                    className={`transition-all duration-300 ease-in-out ${
                      isFading ? 'opacity-0 -translate-y-1' : 'opacity-100 translate-y-0'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm select-none">{currentLang.flag}</span>
                      <span className="font-mono text-xs font-bold text-white tracking-wide">
                        {currentLang.language}
                      </span>
                    </div>
                    <p className="text-xs sm:text-sm text-white/90 leading-snug font-sans select-text">
                      {currentLang.message}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="max-h-48 overflow-y-auto space-y-2 pr-1 font-sans text-xs text-white/85 select-text divide-y divide-white/10">
                  {MULTILINGUAL_NOTICES.map((item, idx) => (
                    <div key={idx} className="pt-2 first:pt-0">
                      <div className="flex items-center gap-1.5 font-mono text-[11px] text-white/70 mb-0.5">
                        <span>{item.flag}</span>
                        <span className="font-bold text-white/90">{item.language}</span>
                        <span className="text-white/40">[{item.code}]</span>
                      </div>
                      <p className="leading-snug">{item.message}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Recovery actions */}
            <div className="flex flex-wrap items-center gap-3 pt-2">
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
          <div className="lg:col-span-5 lg:border-l lg:border-white/20 lg:pl-10 space-y-7">
            
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

              <div className="grid grid-cols-12 gap-2 py-0.5">
                <span className="col-span-5 text-white/70 font-semibold tracking-wider uppercase">
                  ACTIVE LOCALE
                </span>
                <span className="col-span-7 text-white font-bold tracking-wider select-text">
                  {currentLang.code} ({currentLang.language})
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
