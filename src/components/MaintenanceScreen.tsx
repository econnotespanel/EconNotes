import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  LogIn,
  ExternalLink,
  Info,
  Mail,
  Sun,
  Moon,
  Calendar,
  Clock,
  ShieldCheck,
  GraduationCap,
  Sparkles,
} from 'lucide-react';
import EconLogo from '@/components/EconLogo';
import FatalErrorScreen from '@/components/FatalErrorScreen';
import econNotesEMark from '@/assets/econnotes-e-mark.png';
import { APP_VERSION_LABEL } from '@/lib/version';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';

const GTA6_BG_URL = '/gta6-maintenance-bg.jpg';

interface MaintenanceScreenProps {
  closedUntil?: string | null;
  title?: string | null;
  message?: string | null;
  imageUrl?: string | null;
  mode?: string | null;
}

export const MaintenanceScreen: React.FC<MaintenanceScreenProps> = ({
  closedUntil,
  title,
  message,
  imageUrl,
  mode = 'maintenance',
}) => {
  const { theme, toggleTheme } = useTheme();
  const { isAdmin } = useAuth();

  if (mode === 'fatal_error') {
    return (
      <FatalErrorScreen
        errorCode="ECON-FATAL-500"
        application="ECONNOTES-WEB"
        status="SERVICE_UNAVAILABLE"
        request="ACCESS_BLOCKED_FOR_MAINTENANCE"
        title={title}
        message={message}
      />
    );
  }

  const [lastChecked, setLastChecked] = useState<string>(() =>
    new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
  );
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState<string | null>(null);

  // Live countdown if closedUntil is set
  useEffect(() => {
    if (!closedUntil) {
      setTimeRemaining(null);
      return;
    }

    const updateCountdown = () => {
      const target = new Date(closedUntil).getTime();
      const now = Date.now();
      const diff = target - now;

      if (diff <= 0) {
        setTimeRemaining('Açılış saati geldi, sistem kontrol ediliyor...');
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
      const minutes = Math.floor((diff / (1000 * 60)) % 60);

      const parts: string[] = [];
      if (days > 0) parts.push(`${days} gün`);
      if (hours > 0 || days > 0) parts.push(`${hours} saat`);
      parts.push(`${minutes} dakika`);

      setTimeRemaining(parts.join(' '));
    };

    updateCountdown();
    const timer = setInterval(updateCountdown, 30000);
    return () => clearInterval(timer);
  }, [closedUntil]);

  const handleManualRefresh = () => {
    setIsRefreshing(true);
    setLastChecked(new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }));
    window.dispatchEvent(new Event('econnotes:system-changed'));
    setTimeout(() => {
      window.location.reload();
    }, 500);
  };

  // Background auto-refresh check every 60 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setLastChecked(new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }));
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  // Mode based titles and badges
  const isSummer = mode === 'summer';
  const isTermBreak = mode === 'term_break';
  const isExamBreak = mode === 'exam_break';
  const isGtaTheme = !isSummer && !isTermBreak && !isExamBreak;

  const defaultTitle = isSummer
    ? 'EconNotes Yaz Tatili Döneminde'
    : isTermBreak
    ? 'EconNotes Dönem Arası Tatilinde'
    : isExamBreak
    ? 'Sınav Hazırlık ve Altyapı Güçlendirmesi'
    : 'EconNotes Güncelleniyor';

  // Filter out any lingering legacy university exam capacity pretext
  const cleanMessage = (rawMessage?: string | null) => {
    if (!rawMessage) return '';
    const trimmed = rawMessage.trim();
    if (trimmed.includes('Üniversite sınavları öncesinde sunucu kapasitesini artırmak')) {
      return '';
    }
    return trimmed;
  };

  const defaultMessage = isSummer
    ? 'Platformumuz yaz dönemi boyunca yeni akademik yıla hazırlık ve altyapı güncellemeleri nedeniyle geçici olarak kapalıdır. Tüm ders notları, kullanıcı puanları ve hesap verileri güvendedir.'
    : isTermBreak
    ? 'Dönem arası tatili kapsamında sunucu optimizasyonları yapılmaktadır. Bahar dönemi başlangıcında görüşmek üzere!'
    : isExamBreak
    ? 'Yaklaşan sınav haftası öncesinde öğrenci yoğunluğunu karşılamak üzere sunucu kapasitesi artırılmakta ve veritabanı indeksleri güçlendirilmektedir.'
    : '';

  const displayTitle = title?.trim() || defaultTitle;
  const displayMessage = cleanMessage(message) || defaultMessage;

  const modeBadge = isSummer
    ? { label: 'Yaz Tatili', icon: Sun, color: 'bg-amber-500/15 text-amber-700 dark:text-amber-300' }
    : isTermBreak
    ? { label: 'Dönem Arası', icon: Calendar, color: 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300' }
    : isExamBreak
    ? { label: 'Sınav Hazırlığı', icon: GraduationCap, color: 'bg-blue-500/15 text-blue-700 dark:text-blue-300' }
    : {
        label: 'Güncelleme Modu',
        icon: Sparkles,
        color: 'bg-pink-500/20 text-amber-200 border border-pink-400/35',
      };

  const ModeIcon = modeBadge.icon;

  if (isGtaTheme) {
    return (
      <div className="min-h-screen bg-[#0c0318] flex flex-col justify-between font-sans text-white antialiased selection:bg-pink-500/40 selection:text-white relative overflow-x-hidden">
        {/* Ambient Full-Page Sunset Glow Echo */}
        <div
          className="fixed inset-0 bg-cover bg-center opacity-20 blur-2xl scale-105 pointer-events-none z-0"
          style={{ backgroundImage: `url(${GTA6_BG_URL})` }}
          aria-hidden="true"
        />
        <div
          className="fixed inset-0 bg-gradient-to-b from-[#1a0533]/40 via-[#100422]/85 to-[#090214] pointer-events-none z-0"
          aria-hidden="true"
        />

        {/* Hero GTA 6 Vice City Sunset Wallpaper Banner */}
        <div className="absolute top-0 inset-x-0 h-[29rem] sm:h-[36rem] pointer-events-none z-0 overflow-hidden">
          <div
            className="absolute inset-0 bg-cover bg-center sm:bg-[center_45%]"
            style={{ backgroundImage: `url(${GTA6_BG_URL})` }}
          />
          {/* Subtle top vignette for header readability */}
          <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-[#120424]/75 via-[#120424]/30 to-transparent" />
          {/* Gentle center radial scrim so GTA VI typography stays ultra sharp */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(18,4,36,0.38)_0%,rgba(18,4,36,0.12)_55%,rgba(12,3,24,0.45)_100%)]" />
          {/* Smooth bottom horizon merge into deep Vice twilight */}
          <div className="absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-[#0c0318] via-[#0c0318]/80 to-transparent" />
        </div>

        {/* Vice City Frosted Floating Header */}
        <header
          className="sticky top-0 z-50 w-full px-3 sm:px-4 md:px-6 pointer-events-auto"
          style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.5rem)' }}
        >
          <div className="relative mx-auto max-w-5xl flex h-[3.75rem] sm:h-[4.25rem] items-center justify-between gap-2 overflow-hidden rounded-[20px] sm:rounded-[24px] border border-pink-400/30 bg-[#140526]/75 px-3.5 sm:px-5 shadow-[0_12px_40px_rgba(255,46,147,0.22)] backdrop-blur-2xl">
            <div className="pointer-events-none absolute inset-x-6 top-0 h-[1.5px] bg-gradient-to-r from-amber-300 via-pink-500 to-cyan-400 opacity-85" />

            <div className="flex items-center gap-3">
              <Link to="/" className="flex items-center gap-2 transition-transform active:scale-95">
                <EconLogo className="h-6 w-auto sm:h-7" allWhite />
              </Link>
              <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-amber-300/35 bg-gradient-to-r from-amber-400/20 via-pink-500/25 to-fuchsia-500/20 px-2.5 py-0.5 font-gta-condensed text-xs text-amber-200 tracking-[0.16em]">
                VICE UPDATE · VI
              </span>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2">
              {isAdmin ? (
                <Link to="/admin">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 sm:h-9 px-2.5 sm:px-3.5 text-xs font-semibold gap-1.5 rounded-full border-pink-400/40 bg-pink-500/15 text-white hover:bg-pink-500/30 hover:text-white shadow-sm backdrop-blur-sm transition-all active:scale-95 shrink-0"
                  >
                    <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-amber-300" />
                    <span>Yönetici Paneli</span>
                  </Button>
                </Link>
              ) : (
                <Link to="/login">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 sm:h-9 px-2.5 sm:px-3.5 text-xs font-semibold gap-1.5 rounded-full border-pink-400/40 bg-pink-500/15 text-white hover:bg-pink-500/30 hover:text-white shadow-sm backdrop-blur-sm transition-all active:scale-95 shrink-0"
                  >
                    <LogIn className="h-3.5 w-3.5 shrink-0 text-amber-300" />
                    <span>Yönetici Girişi</span>
                  </Button>
                </Link>
              )}
            </div>
          </div>
        </header>

        {/* GTA VI Typographic Hero Centerpiece */}
        <div className="relative z-10 w-full pt-8 pb-24 sm:pt-12 sm:pb-32 px-4 text-center">
          <div className="relative max-w-3xl mx-auto flex flex-col items-center">
            {/* Iconic Translucent Roman Numeral VI Watermark Behind Wordmark */}
            <span
              aria-hidden="true"
              className="pointer-events-none select-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-[46%] gta-roman-vi text-[10rem] sm:text-[14rem] md:text-[16rem] leading-none opacity-75"
            >
              VI
            </span>

            {/* Neon Event Pill */}
            <div className="relative z-10 inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#160529]/75 backdrop-blur-md text-[11px] sm:text-xs font-bold uppercase tracking-[0.18em] text-amber-200 border border-pink-400/40 shadow-[0_0_25px_rgba(255,46,147,0.35)] mb-4">
              <Sparkles className="h-3.5 w-3.5 text-amber-300 shrink-0" />
              <span>GTA VI ÖZEL · SİSTEM GÜNCELLEMESİ</span>
            </div>

            {/* GTA 6 Style Typography Lockup: ECONNOTES GÜNCELLENİYOR */}
            <h1 className="relative z-10 flex flex-col items-center leading-[0.95] select-none">
              <span className="font-gta-display gta-wordmark-white text-4xl sm:text-6xl md:text-7xl uppercase tracking-[0.06em]">
                EconNotes
              </span>
              <span className="font-gta-display gta-wordmark-sunset text-4xl sm:text-6xl md:text-7xl uppercase tracking-[0.05em] mt-1">
                Güncelleniyor
              </span>
            </h1>

            <p className="relative z-10 mt-5 inline-flex items-center gap-2 rounded-full bg-[#120424]/70 border border-white/15 px-4 py-1.5 text-xs sm:text-sm font-medium text-pink-100/95 backdrop-blur-md shadow-lg">
              <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse shadow-[0_0_10px_#fbbf24]" />
              <span>Yeni özellikler ve performans geliştirmeleri yükleniyor</span>
            </p>
          </div>
        </div>

        {/* Main Vice City Frosted Status Container */}
        <main className="relative z-20 flex-1 -mt-12 sm:-mt-16 mx-auto w-full max-w-3xl px-3 sm:px-6 mb-8 sm:mb-12">
          <div className="relative overflow-hidden rounded-3xl border border-pink-400/25 bg-[#130624]/90 shadow-[0_24px_80px_rgba(6,2,18,0.85)] backdrop-blur-2xl">
            {/* Animated GTA Vice Sunset Top Loading Strip */}
            <div className="h-1.5 w-full gta-loading-bar" />

            <div className="p-4 sm:p-8 space-y-5 sm:space-y-6">
              {/* GTA Loading Status Bar Strip */}
              <div className="rounded-2xl border border-pink-400/20 bg-gradient-to-r from-[#24093d]/80 via-[#1d0833]/80 to-[#14072b]/80 p-3.5 sm:p-4 space-y-2.5">
                <div className="flex items-center justify-between gap-2 text-[11px] sm:text-xs font-semibold">
                  <span className="flex items-center gap-2 text-amber-200 uppercase tracking-wider font-gta-condensed text-sm sm:text-base">
                    <Sparkles className="h-3.5 w-3.5 text-pink-400" />
                    VICE ENGINE GÜNCELLEME AKIŞI
                  </span>
                  <span className="text-pink-200/80 font-mono text-[11px]">
                    Son kontrol: {lastChecked}
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
                  <div className="h-full w-3/4 rounded-full gta-loading-bar shadow-[0_0_16px_rgba(255,46,147,0.75)]" />
                </div>
              </div>

              {/* Main Status Announcement Header */}
              <div className="flex items-start sm:items-center gap-3 sm:gap-4 pb-4 sm:pb-6 border-b border-white/10">
                <div className="h-11 w-11 sm:h-14 sm:w-14 rounded-2xl flex items-center justify-center shrink-0 mt-0.5 sm:mt-0 bg-gradient-to-br from-amber-400/25 via-pink-500/25 to-fuchsia-600/30 border border-pink-400/40 text-amber-300 shadow-[0_0_24px_rgba(255,46,147,0.28)]">
                  <ModeIcon className="h-6 w-6 sm:h-7 sm:w-7" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg sm:text-2xl font-extrabold text-white leading-snug tracking-tight">
                      {displayTitle}
                    </h2>
                    <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-gradient-to-r from-amber-400/20 to-pink-500/25 text-amber-200 border border-pink-400/35">
                      {modeBadge.label}
                    </span>
                  </div>
                  {displayMessage ? (
                    <p className="text-xs sm:text-sm text-pink-100/80 mt-1.5 leading-relaxed">
                      {displayMessage}
                    </p>
                  ) : null}
                </div>
              </div>

              {/* Optional Admin Uploaded Image */}
              {imageUrl && (
                <div className="rounded-2xl overflow-hidden border border-pink-400/25 shadow-lg">
                  <img
                    src={imageUrl}
                    alt="Güncelleme Duyurusu"
                    className="w-full max-h-72 object-cover object-center"
                  />
                </div>
              )}

              {/* Countdown & Scheduled Reopen Box if configured */}
              {closedUntil && (
                <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-500/15 via-pink-500/15 to-fuchsia-500/15 border border-pink-400/35 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <Clock className="h-5 w-5 text-amber-300 shrink-0" />
                    <div>
                      <div className="text-xs text-pink-200/80 font-medium">Planlanan Yeniden Açılış</div>
                      <div className="text-sm font-bold text-white">
                        {new Date(closedUntil).toLocaleString('tr-TR', {
                          day: 'numeric',
                          month: 'long',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </div>
                    </div>
                  </div>
                  {timeRemaining && (
                    <div className="px-3 py-1.5 rounded-xl bg-amber-400/20 border border-amber-300/35 text-amber-200 text-xs font-bold">
                      Kalan: {timeRemaining}
                    </div>
                  )}
                </div>
              )}

              {/* Service by Service Breakdown List */}
              <div className="divide-y divide-white/10">
                {/* Service 1 */}
                <div className="py-3.5 sm:py-4 flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5 sm:gap-3 min-w-0 flex-1">
                    <AlertTriangle className="h-4 w-4 sm:h-5 sm:w-5 text-amber-400 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <h3 className="text-xs sm:text-base font-semibold text-white leading-tight">
                        Ders Notları ve Çalışma Stüdyosu
                      </h3>
                      <p className="text-[11px] sm:text-sm text-pink-100/70 mt-0.5 leading-snug">
                        Güncelleme süresince yeni materyal üretimi ve indirme işlemleri geçici olarak duraklatılmıştır.
                      </p>
                    </div>
                  </div>
                  <span className="text-[10px] sm:text-xs font-bold px-2.5 py-1 rounded-lg bg-pink-500/20 border border-pink-400/30 text-amber-200 shrink-0 whitespace-nowrap self-start">
                    Güncelleniyor
                  </span>
                </div>

                {/* Service 2 */}
                <div className="py-3.5 sm:py-4 flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5 sm:gap-3 min-w-0 flex-1">
                    <ShieldCheck className="h-4 w-4 sm:h-5 sm:w-5 text-emerald-400 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <h3 className="text-xs sm:text-base font-semibold text-white leading-tight">
                        Not Arşivi ve Veri Güvenliği
                      </h3>
                      <p className="text-[11px] sm:text-sm text-pink-100/70 mt-0.5 leading-snug">
                        Öğrenciler tarafından yüklenen tüm PDF ders notları, sınav soruları ve hesaplar eksiksiz korunmaktadır. Sıfır veri kaybı.
                      </p>
                    </div>
                  </div>
                  <span className="text-[10px] sm:text-xs font-bold px-2.5 py-1 rounded-lg bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 shrink-0 whitespace-nowrap self-start">
                    Güvende
                  </span>
                </div>

                {/* Service 3 */}
                <div className="py-3.5 sm:py-4 flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5 sm:gap-3 min-w-0 flex-1">
                    <AlertTriangle className="h-4 w-4 sm:h-5 sm:w-5 text-pink-400 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <h3 className="text-xs sm:text-base font-semibold text-white leading-tight">
                        Öğrenci Girişi ve Kayıt
                      </h3>
                      <p className="text-[11px] sm:text-sm text-pink-100/70 mt-0.5 leading-snug">
                        Güncelleme tamamlanana kadar genel öğrenci oturumları askıya alınmıştır. Yöneticiler üst menüden giriş yapabilir.
                      </p>
                    </div>
                  </div>
                  <span className="text-[10px] sm:text-xs font-bold px-2.5 py-1 rounded-lg bg-amber-500/20 border border-amber-400/30 text-amber-200 shrink-0 whitespace-nowrap self-start">
                    Askıda
                  </span>
                </div>

                {/* Service 4 */}
                <div className="py-3.5 sm:py-4 flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5 sm:gap-3 min-w-0 flex-1">
                    <CheckCircle2 className="h-4 w-4 sm:h-5 sm:w-5 text-cyan-400 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <h3 className="text-xs sm:text-base font-semibold text-white leading-tight">
                        Altyapı ve Veritabanı Yedekleri
                      </h3>
                      <p className="text-[11px] sm:text-sm text-pink-100/70 mt-0.5 leading-snug">
                        Bulut veritabanı yedekleme ve sunucu sağlık kontrolleri kesintisiz çalışmaktadır.
                      </p>
                    </div>
                  </div>
                  <span className="text-[10px] sm:text-xs font-bold px-2.5 py-1 rounded-lg bg-cyan-500/20 border border-cyan-400/30 text-cyan-200 shrink-0 whitespace-nowrap self-start">
                    Aktif
                  </span>
                </div>
              </div>

              {/* Incident / Maintenance Details Box */}
              {displayMessage ? (
                <div className="p-3.5 sm:p-5 rounded-2xl bg-white/[0.05] border border-pink-400/20 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-xs sm:text-sm font-bold text-amber-200 flex items-center gap-1.5">
                      <Info className="h-4 w-4 text-pink-400 shrink-0" />
                      Güncelleme Ayrıntıları
                    </h4>
                    <span className="text-[10px] sm:text-[11px] text-pink-200/70 shrink-0">
                      Son kontrol: {lastChecked}
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm text-pink-100/85 leading-relaxed whitespace-pre-line">
                    {displayMessage}
                  </p>
                </div>
              ) : null}

              {/* Action Buttons */}
              <div className="pt-3 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 border-t border-white/10">
                <Button
                  size="sm"
                  onClick={handleManualRefresh}
                  disabled={isRefreshing}
                  className="w-full sm:w-auto gap-2 text-xs font-bold justify-center h-9 rounded-xl bg-gradient-to-r from-amber-400 via-pink-500 to-fuchsia-600 text-white border-0 shadow-[0_8px_28px_rgba(255,46,147,0.4)] hover:brightness-110 transition-all"
                >
                  <RefreshCw className={`h-3.5 w-3.5 shrink-0 ${isRefreshing ? 'animate-spin' : ''}`} />
                  <span>{isRefreshing ? 'Kontrol Ediliyor...' : 'Durumu Yenile'}</span>
                </Button>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  <a
                    href="https://x.com/econnotess"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full sm:w-auto"
                  >
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full sm:w-auto gap-1.5 text-xs text-pink-100/85 hover:text-white hover:bg-white/10 justify-center h-9 rounded-xl border border-white/15"
                    >
                      <ExternalLink className="h-3.5 w-3.5 shrink-0 text-amber-300" />
                      X (@econnotess)
                    </Button>
                  </a>

                  <a href="mailto:destek@econnotes.online" className="w-full sm:w-auto">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full sm:w-auto gap-1.5 text-xs text-pink-100/85 hover:text-white hover:bg-white/10 justify-center h-9 rounded-xl border border-white/15"
                    >
                      <Mail className="h-3.5 w-3.5 shrink-0 text-pink-400" />
                      destek@econnotes.online
                    </Button>
                  </a>
                </div>
              </div>
            </div>
          </div>
        </main>

        {/* Vice Night Footer */}
        <footer className="relative z-10 w-full border-t border-pink-500/20 bg-[#090214]/90 backdrop-blur-xl py-5 text-center text-xs text-pink-200/70">
          <div className="mx-auto max-w-5xl px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
            <p className="text-xs sm:text-sm font-medium text-pink-100/85">
              EconNotes, Düzce Üniversitesi öğrencileri tarafından geliştirilmiştir.
            </p>
            <p className="font-mono text-[11px] text-amber-200/80">{APP_VERSION_LABEL} · GTA VI Edition</p>
          </div>
        </footer>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 dark:bg-background flex flex-col justify-between font-sans text-foreground antialiased selection:bg-primary/20 relative">
      
      {/* Top Banner Gradient Background (spans top of screen behind status bar down into hero) */}
      <div className="absolute top-0 inset-x-0 h-96 sm:h-[28rem] bg-gradient-to-b from-[#002e7a] via-[#004bb5] to-[#0066d6] pointer-events-none z-0 overflow-hidden">
        {/* Subtle upright EconNotes 'E' watermark pattern */}
        <div
          className="absolute inset-0 select-none overflow-hidden"
          style={{
            backgroundImage: `url(${econNotesEMark})`,
            backgroundRepeat: 'repeat',
            backgroundSize: '44px 44px',
            backgroundPosition: 'center',
            filter: 'brightness(0) invert(1)',
            opacity: 0.065,
          }}
        />
      </div>

      {/* Modern Floating Oval Header with iOS Safe Area */}
      <header
        className="sticky top-0 z-50 w-full px-3 sm:px-4 md:px-6 pointer-events-auto"
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.5rem)' }}
      >
        <div className="relative mx-auto max-w-5xl flex h-[3.75rem] sm:h-[4.25rem] items-center justify-between gap-2 overflow-hidden rounded-[20px] sm:rounded-[24px] border border-white/25 dark:border-primary/30 bg-[#00205b]/85 dark:bg-[#070e1c]/90 px-3.5 sm:px-5 shadow-[0_12px_36px_rgba(0,18,50,0.4)] backdrop-blur-2xl">
          <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-white/40 dark:via-primary/50 to-transparent" />
          
          <Link to="/" className="flex items-center gap-2 transition-transform active:scale-95">
            <EconLogo className="h-6 w-auto sm:h-7" allWhite />
          </Link>

          <div className="flex items-center gap-1.5 sm:gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleTheme}
              className="h-8 w-8 sm:h-9 sm:w-9 p-0 rounded-full text-white/90 hover:text-white hover:bg-white/15 transition-colors"
              title="Temayı Değiştir"
              aria-label="Temayı Değiştir"
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>

            {isAdmin ? (
              <Link to="/admin">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 sm:h-9 px-2.5 sm:px-3.5 text-xs font-semibold gap-1.5 rounded-full border-white/25 bg-white/10 text-white hover:bg-white/20 hover:text-white shadow-sm backdrop-blur-sm transition-all active:scale-95 shrink-0"
                >
                  <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
                  <span>Yönetici Paneli</span>
                </Button>
              </Link>
            ) : (
              <Link to="/login">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 sm:h-9 px-2.5 sm:px-3.5 text-xs font-semibold gap-1.5 rounded-full border-white/25 bg-white/10 text-white hover:bg-white/20 hover:text-white shadow-sm backdrop-blur-sm transition-all active:scale-95 shrink-0"
                >
                  <LogIn className="h-3.5 w-3.5 shrink-0" />
                  <span>Yönetici Girişi</span>
                </Button>
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Hero Header Content */}
      <div className="relative z-10 w-full text-white pt-4 pb-20 sm:pt-8 sm:pb-28 px-4 text-center">
        <div className="max-w-xl mx-auto space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 backdrop-blur-sm text-xs font-medium text-white/90 border border-white/15 shadow-sm">
            <ModeIcon className="h-3.5 w-3.5" />
            <span>{modeBadge.label}</span>
          </div>
          <h1 className="text-2xl sm:text-4xl md:text-5xl font-bold tracking-tight drop-shadow-sm">
            EconNotes
          </h1>
          <p className="text-sm sm:text-lg text-white/90 font-medium tracking-wide">
            Hizmet ve Sunucu Durumu
          </p>
        </div>
      </div>

      {/* Main Status Container */}
      <main className="relative z-20 flex-1 -mt-14 sm:-mt-20 mx-auto w-full max-w-3xl px-3 sm:px-6 mb-8 sm:mb-12">
        <div className="bg-card rounded-2xl shadow-xl border border-border p-4 sm:p-8 space-y-5 sm:space-y-6">
          
          {/* Main Status Announcement Header */}
          <div className="flex items-start sm:items-center gap-3 sm:gap-4 pb-4 sm:pb-6 border-b border-border">
            <div className={`h-10 w-10 sm:h-14 sm:w-14 rounded-full flex items-center justify-center shrink-0 mt-0.5 sm:mt-0 ${modeBadge.color}`}>
              <ModeIcon className="h-6 w-6 sm:h-8 sm:w-8" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg sm:text-2xl font-bold text-foreground leading-snug">
                  {displayTitle}
                </h2>
                <span className={`text-[10px] sm:text-xs font-semibold px-2 py-0.5 rounded-full ${modeBadge.color}`}>
                  {modeBadge.label}
                </span>
              </div>
              {displayMessage ? (
                <p className="text-xs sm:text-sm text-muted-foreground mt-1.5 leading-relaxed">
                  {displayMessage}
                </p>
              ) : null}
            </div>
          </div>

          {/* Optional Admin Uploaded Image */}
          {imageUrl && (
            <div className="rounded-xl overflow-hidden border border-border shadow-sm">
              <img
                src={imageUrl}
                alt="Bakım Duyurusu"
                className="w-full max-h-72 object-cover object-center"
              />
            </div>
          )}

          {/* Countdown & Scheduled Reopen Box if configured */}
          {closedUntil && (
            <div className="p-4 rounded-xl bg-primary/5 border border-primary/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <Clock className="h-5 w-5 text-primary shrink-0" />
                <div>
                  <div className="text-xs text-muted-foreground font-medium">Planlanan Yeniden Açılış</div>
                  <div className="text-sm font-semibold text-foreground">
                    {new Date(closedUntil).toLocaleString('tr-TR', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </div>
                </div>
              </div>
              {timeRemaining && (
                <div className="px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-semibold">
                  Kalan: {timeRemaining}
                </div>
              )}
            </div>
          )}

          {/* Service by Service Breakdown List */}
          <div className="divide-y divide-border">
            
            {/* Service 1: Lecture Notes & Downloads */}
            <div className="py-3.5 sm:py-4 flex items-start justify-between gap-3">
              <div className="flex items-start gap-2.5 sm:gap-3 min-w-0 flex-1">
                <AlertTriangle className="h-4 w-4 sm:h-5 sm:w-5 text-amber-500 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <h3 className="text-xs sm:text-base font-semibold text-foreground leading-tight">
                    Ders Notları ve Çalışma Stüdyosu
                  </h3>
                  <p className="text-[11px] sm:text-sm text-muted-foreground mt-0.5 leading-snug">
                    Bakım çalışması süresince yeni materyal üretimi ve indirme işlemleri geçici olarak duraklatılmıştır.
                  </p>
                </div>
              </div>
              <span className="text-[10px] sm:text-xs font-semibold px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-md bg-amber-500/15 text-amber-700 dark:text-amber-300 shrink-0 whitespace-nowrap self-start">
                Bakımda
              </span>
            </div>

            {/* Service 2: Storage & Data Integrity */}
            <div className="py-3.5 sm:py-4 flex items-start justify-between gap-3">
              <div className="flex items-start gap-2.5 sm:gap-3 min-w-0 flex-1">
                <ShieldCheck className="h-4 w-4 sm:h-5 sm:w-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <h3 className="text-xs sm:text-base font-semibold text-foreground leading-tight">
                    Not Arşivi ve Veri Güvenliği
                  </h3>
                  <p className="text-[11px] sm:text-sm text-muted-foreground mt-0.5 leading-snug">
                    Öğrenciler tarafından yüklenen tüm PDF ders notları, sınav soruları ve hesaplar eksiksiz korunmaktadır. Sıfır veri kaybı.
                  </p>
                </div>
              </div>
              <span className="text-[10px] sm:text-xs font-semibold px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-md bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 shrink-0 whitespace-nowrap self-start">
                Güvende
              </span>
            </div>

            {/* Service 3: Authentication & Accounts */}
            <div className="py-3.5 sm:py-4 flex items-start justify-between gap-3">
              <div className="flex items-start gap-2.5 sm:gap-3 min-w-0 flex-1">
                <AlertTriangle className="h-4 w-4 sm:h-5 sm:w-5 text-amber-500 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <h3 className="text-xs sm:text-base font-semibold text-foreground leading-tight">
                    Öğrenci Girişi ve Kayıt
                  </h3>
                  <p className="text-[11px] sm:text-sm text-muted-foreground mt-0.5 leading-snug">
                    Bakım tamamlanana kadar genel öğrenci oturumları askıya alınmıştır. Yöneticiler üst menüden giriş yapabilir.
                  </p>
                </div>
              </div>
              <span className="text-[10px] sm:text-xs font-semibold px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-md bg-amber-500/15 text-amber-700 dark:text-amber-300 shrink-0 whitespace-nowrap self-start">
                Askıda
              </span>
            </div>

            {/* Service 4: Infrastructure Status */}
            <div className="py-3.5 sm:py-4 flex items-start justify-between gap-3">
              <div className="flex items-start gap-2.5 sm:gap-3 min-w-0 flex-1">
                <CheckCircle2 className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <h3 className="text-xs sm:text-base font-semibold text-foreground leading-tight">
                    Altyapı ve Veritabanı Yedekleri
                  </h3>
                  <p className="text-[11px] sm:text-sm text-muted-foreground mt-0.5 leading-snug">
                    Bulut veritabanı yedekleme ve sunucu sağlık kontrolleri kesintisiz çalışmaktadır.
                  </p>
                </div>
              </div>
              <span className="text-[10px] sm:text-xs font-semibold px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-md bg-blue-500/15 text-blue-700 dark:text-blue-300 shrink-0 whitespace-nowrap self-start">
                Aktif
              </span>
            </div>

          </div>

          {/* Incident / Maintenance Details Box (only shown when an announcement message exists) */}
          {displayMessage ? (
            <div className="p-3.5 sm:p-5 rounded-xl bg-muted/60 border border-border space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-xs sm:text-sm font-bold text-foreground flex items-center gap-1.5">
                  <Info className="h-4 w-4 text-primary shrink-0" />
                  Ayrıntılar ve Açıklama
                </h4>
                <span className="text-[10px] sm:text-[11px] text-muted-foreground shrink-0">
                  Son kontrol: {lastChecked}
                </span>
              </div>
              <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
                {displayMessage}
              </p>
            </div>
          ) : null}

          {/* Action Buttons */}
          <div className="pt-3 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 border-t border-border">
            <Button
              variant="outline"
              size="sm"
              onClick={handleManualRefresh}
              disabled={isRefreshing}
              className="w-full sm:w-auto gap-2 text-xs font-semibold justify-center h-9"
            >
              <RefreshCw className={`h-3.5 w-3.5 shrink-0 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>{isRefreshing ? 'Kontrol Ediliyor...' : 'Durumu Yenile'}</span>
            </Button>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <a
                href="https://x.com/econnotess"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full sm:w-auto"
              >
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full sm:w-auto gap-1.5 text-xs text-muted-foreground hover:text-foreground justify-center h-9 border border-border/50 sm:border-transparent"
                >
                  <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                  X (@econnotess)
                </Button>
              </a>

              <a href="mailto:destek@econnotes.online" className="w-full sm:w-auto">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full sm:w-auto gap-1.5 text-xs text-muted-foreground hover:text-foreground justify-center h-9 border border-border/50 sm:border-transparent"
                >
                  <Mail className="h-3.5 w-3.5 shrink-0" />
                  destek@econnotes.online
                </Button>
              </a>
            </div>
          </div>

        </div>
      </main>

      {/* Clean Corporate Footer */}
      <footer className="w-full border-t border-border bg-card/50 py-5 text-center text-xs text-muted-foreground">
        <div className="mx-auto max-w-5xl px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <p className="text-xs sm:text-sm font-medium text-foreground/80">
            EconNotes, Düzce Üniversitesi öğrencileri tarafından geliştirilmiştir.
          </p>
          <p className="font-mono text-[11px] text-muted-foreground">{APP_VERSION_LABEL}</p>
        </div>
      </footer>

    </div>
  );
};

export default MaintenanceScreen;
