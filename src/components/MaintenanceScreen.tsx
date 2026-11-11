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
  Calendar,
  Clock,
  ShieldCheck,
  GraduationCap,
} from 'lucide-react';
import EconLogo from '@/components/EconLogo';
import FatalErrorScreen from '@/components/FatalErrorScreen';
import econNotesEMark from '@/assets/econnotes-e-mark.png';
import { APP_VERSION_LABEL } from '@/lib/version';
import { Button } from '@/components/ui/button';

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

  const defaultTitle = isSummer
    ? 'EconNotes Yaz Tatili Döneminde'
    : isTermBreak
    ? 'EconNotes Dönem Arası Tatilinde'
    : isExamBreak
    ? 'Sınav Hazırlık ve Altyapı Güçlendirmesi'
    : 'Platformumuzda Bakım Çalışması Yürütülüyor';

  const defaultMessage = isSummer
    ? 'Platformumuz yaz dönemi boyunca yeni akademik yıla hazırlık ve altyapı güncellemeleri nedeniyle geçici olarak kapalıdır. Tüm ders notları, kullanıcı puanları ve hesap verileri güvendedir.'
    : isTermBreak
    ? 'Dönem arası tatili kapsamında sunucu optimizasyonları yapılmaktadır. Bahar dönemi başlangıcında görüşmek üzere!'
    : isExamBreak
    ? 'Yaklaşan sınav haftası öncesinde öğrenci yoğunluğunu karşılamak üzere sunucu kapasitesi artırılmakta ve veritabanı indeksleri güçlendirilmektedir.'
    : 'Üniversite sınavları öncesinde sunucu kapasitesini artırmak ve altyapıyı güçlendirmek amacıyla sistemimiz planlı bakım modundadır.';

  const displayTitle = title?.trim() || defaultTitle;
  const displayMessage = message?.trim() || defaultMessage;

  const modeBadge = isSummer
    ? { label: 'Yaz Tatili', icon: Sun, color: 'bg-amber-500/15 text-amber-700 dark:text-amber-300' }
    : isTermBreak
    ? { label: 'Dönem Arası', icon: Calendar, color: 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300' }
    : isExamBreak
    ? { label: 'Sınav Hazırlığı', icon: GraduationCap, color: 'bg-blue-500/15 text-blue-700 dark:text-blue-300' }
    : { label: 'Sistem Bakımı', icon: AlertCircle, color: 'bg-amber-500/15 text-amber-700 dark:text-amber-300' };

  const ModeIcon = modeBadge.icon;

  return (
    <div className="min-h-screen bg-muted/30 dark:bg-background flex flex-col justify-between font-sans text-foreground antialiased selection:bg-primary/20">
      
      {/* Top Header Navigation */}
      <header className="w-full bg-[#003791] border-b border-white/10 relative z-20">
        <div className="mx-auto max-w-5xl px-3 sm:px-6 h-14 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <EconLogo className="h-6 w-28 sm:h-8 sm:w-36 brightness-0 invert shrink-0" />
          </div>
          <Link to="/login">
            <Button
              variant="ghost"
              size="sm"
              className="text-white/90 hover:text-white hover:bg-white/10 text-xs font-medium gap-1.5 px-2.5 sm:px-3 h-8 sm:h-9"
            >
              <LogIn className="h-3.5 w-3.5 shrink-0" />
              <span>Yönetici Girişi</span>
            </Button>
          </Link>
        </div>
      </header>

      {/* Hero Header Banner */}
      <div className="relative w-full bg-gradient-to-b from-[#003791] via-[#004bb5] to-[#0066d6] text-white pt-8 pb-20 sm:pt-14 sm:pb-32 px-4 text-center overflow-hidden">
        
        {/* Subtle upright EconNotes 'E' watermark pattern */}
        <div
          className="pointer-events-none absolute inset-0 z-0 select-none overflow-hidden"
          aria-hidden="true"
        >
          <div
            className="w-full h-full"
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

        {/* Content sits cleanly above watermark */}
        <div className="relative z-10 max-w-xl mx-auto space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 backdrop-blur-sm text-xs font-medium text-white/90 border border-white/15">
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
              <p className="text-xs sm:text-sm text-muted-foreground mt-1.5 leading-relaxed">
                {displayMessage}
              </p>
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

          {/* Incident / Maintenance Details Box */}
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
