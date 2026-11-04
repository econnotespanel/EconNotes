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
  Mail
} from 'lucide-react';
import EconLogo from '@/components/EconLogo';
import { APP_VERSION_LABEL } from '@/lib/version';
import { Button } from '@/components/ui/button';

interface MaintenanceScreenProps {
  closedUntil?: string | null;
  title?: string | null;
  message?: string | null;
  imageUrl?: string | null;
  mode?: string | null;
}

const MaintenanceScreen = ({}: MaintenanceScreenProps) => {
  const [lastChecked, setLastChecked] = useState<string>(() => new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }));
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleManualRefresh = () => {
    setIsRefreshing(true);
    setLastChecked(new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }));
    setTimeout(() => {
      window.location.reload();
    }, 500);
  };

  // Background auto-refresh check every 2 minutes
  useEffect(() => {
    const interval = setInterval(() => {
      setLastChecked(new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }));
    }, 120000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-muted/30 dark:bg-background flex flex-col justify-between font-sans text-foreground">
      
      {/* Top Header Navigation */}
      <header className="w-full bg-[#003791] border-b border-white/10 relative z-20">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <EconLogo className="h-7 w-32 sm:h-8 sm:w-36 brightness-0 invert" />
          </div>
          <Link to="/login">
            <Button
              variant="ghost"
              size="sm"
              className="text-white/90 hover:text-white hover:bg-white/10 text-xs font-medium gap-1.5"
            >
              <LogIn className="h-3.5 w-3.5" />
              <span>Yönetici Girişi</span>
            </Button>
          </Link>
        </div>
      </header>

      {/* PlayStation-style Bold Hero Banner with Subtle Repeating EconNotes 'E' Brand Watermark */}
      <div className="relative w-full bg-gradient-to-b from-[#003791] via-[#004bb5] to-[#0066d6] text-white pt-10 pb-24 sm:pt-14 sm:pb-32 px-4 text-center overflow-hidden">
        
        {/* Subtle, faint, semi-transparent EconNotes 'E' watermark pattern */}
        <div className="pointer-events-none absolute inset-0 z-0 select-none overflow-hidden" aria-hidden="true">
          <svg className="h-full w-full" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern
                id="econnotes-e-pattern"
                width="68"
                height="68"
                patternUnits="userSpaceOnUse"
                patternTransform="rotate(-25)"
              >
                <g fill="white" opacity="0.065">
                  {/* Stylized capital E */}
                  <path d="M14 18 h19 v7 h-11 v5 h9 v7 h-9 v6 h11 v7 h-19 z" />
                  {/* Energy badge top-right */}
                  <circle cx="35" cy="13" r="6" fill="none" stroke="white" stroke-width="1.8" />
                  <path d="M35.5 8.5 l-3 4.5 h2.5 l-.5 4.5 3.5 -5 h-2.5 z" fill="white" />
                </g>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#econnotes-e-pattern)" />
          </svg>
        </div>

        {/* Content sits cleanly above watermark */}
        <div className="relative z-10">
          <h1 className="text-3xl sm:text-5xl font-bold tracking-tight drop-shadow-sm">
            EconNotes
          </h1>
          <p className="mt-2 text-base sm:text-lg text-white/85 font-medium tracking-wide">
            Hizmet ve Sunucu Durumu
          </p>
        </div>
      </div>

      {/* Main Status Container (PlayStation Overlapping Card Layout) */}
      <main className="relative z-20 flex-1 -mt-16 sm:-mt-20 mx-auto w-full max-w-3xl px-4 sm:px-6 mb-12">
        <div className="bg-card rounded-2xl shadow-xl border border-border p-6 sm:p-8 space-y-6">
          
          {/* Main Status Announcement Header */}
          <div className="flex items-start sm:items-center gap-4 pb-6 border-b border-border">
            <div className="h-12 w-12 sm:h-14 sm:w-14 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
              <AlertCircle className="h-7 w-7 sm:h-8 sm:w-8" />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-foreground">
                Bazı hizmetlerde kesinti yaşanıyor.
              </h2>
              <p className="text-xs sm:text-sm text-muted-foreground mt-1 leading-relaxed">
                Yaklaşan üniversite sınavları öncesinde sunucu kapasitesini artırmak ve veritabanı altyapısını güçlendirmek amacıyla çalışma yürütülmektedir.
              </p>
            </div>
          </div>

          {/* Service by Service Breakdown List (PlayStation Network Style) */}
          <div className="divide-y divide-border">
            
            {/* Service 1: Lecture Notes & Downloads */}
            <div className="py-4 flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-sm sm:text-base font-semibold text-foreground">
                    Ders Notları ve İçerik İndirme
                  </h3>
                  <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
                    Kapasite genişletme çalışması süresince erişim geçici olarak duraklatılmıştır.
                  </p>
                </div>
              </div>
              <span className="text-[11px] sm:text-xs font-semibold px-2.5 py-1 rounded-md bg-amber-500/15 text-amber-700 dark:text-amber-300 shrink-0">
                Bakım Sürüyor
              </span>
            </div>

            {/* Service 2: Storage & Integrity */}
            <div className="py-4 flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-sm sm:text-base font-semibold text-foreground">
                    Not Arşivi ve Dosya Güvenliği
                  </h3>
                  <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
                    Öğrenciler tarafından yüklenen tüm PDF notlar, materyaller ve dosyalar eksiksiz korunmaktadır. Sıfır veri kaybı.
                  </p>
                </div>
              </div>
              <span className="text-[11px] sm:text-xs font-semibold px-2.5 py-1 rounded-md bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 shrink-0">
                Çalışıyor / Güvende
              </span>
            </div>

            {/* Service 3: Authentication & Accounts */}
            <div className="py-4 flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-sm sm:text-base font-semibold text-foreground">
                    Hesap Yönetimi ve Öğrenci Girişi
                  </h3>
                  <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
                    Sunucu bakımı tamamlanana kadar oturum açma ve yeni kayıt işlemleri geçici olarak askıya alınmıştır.
                  </p>
                </div>
              </div>
              <span className="text-[11px] sm:text-xs font-semibold px-2.5 py-1 rounded-md bg-amber-500/15 text-amber-700 dark:text-amber-300 shrink-0">
                Geçici Olarak Kapalı
              </span>
            </div>

            {/* Service 4: Exam Schedule Timeline */}
            <div className="py-4 flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-sm sm:text-base font-semibold text-foreground">
                    Sınav Haftası Açılış Takvimi
                  </h3>
                  <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
                    Cumartesi günü başlayacak üniversite sınavları öncesinde tüm ders notları en geç Cuma günü tam kapasiteyle yayına alınacaktır.
                  </p>
                </div>
              </div>
              <span className="text-[11px] sm:text-xs font-semibold px-2.5 py-1 rounded-md bg-blue-500/15 text-blue-700 dark:text-blue-300 shrink-0">
                Planlandı (En Geç Cuma)
              </span>
            </div>

          </div>

          {/* Official Incident Details Box */}
          <div className="p-4 sm:p-5 rounded-xl bg-muted/60 border border-border space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs sm:text-sm font-bold text-foreground flex items-center gap-1.5">
                <Info className="h-4 w-4 text-primary" />
                Ayrıntılar
              </h4>
              <span className="text-[11px] text-muted-foreground">
                Son kontrol: {lastChecked}
              </span>
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
              Sınav haftası yoğunluğu öncesinde altyapı sunucularımızda kapasite genişletmesi ve optimizasyon çalışması yürütülmektedir. Olay 2 Kasım gecesi tespit edilmiş olup altyapı ekiplerimizle birlikte çalışmalar aralıksız sürdürülmektedir. Kullanıcılarımızın sınavlara eksiksiz çalışabilmesi için tüm sistem Cuma gününe kadar yeniden erişime açılacaktır.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="pt-2 flex flex-wrap items-center justify-between gap-3 border-t border-border">
            <Button
              variant="outline"
              size="sm"
              onClick={handleManualRefresh}
              disabled={isRefreshing}
              className="gap-2 text-xs font-semibold"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>{isRefreshing ? 'Yenileniyor...' : 'Durumu Yenile'}</span>
            </Button>

            <div className="flex items-center gap-2">
              <a
                href="https://x.com/econnotess"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button variant="ghost" size="sm" className="gap-1.5 text-xs text-muted-foreground hover:text-foreground">
                  <ExternalLink className="h-3.5 w-3.5" />
                  X (@econnotess)
                </Button>
              </a>

              <a href="mailto:destek@econnotes.online">
                <Button variant="ghost" size="sm" className="gap-1.5 text-xs text-muted-foreground hover:text-foreground">
                  <Mail className="h-3.5 w-3.5" />
                  destek@econnotes.online
                </Button>
              </a>
            </div>
          </div>

        </div>
      </main>

      {/* Corporate Clean Footer */}
      <footer className="w-full border-t border-border bg-card/50 py-6 text-center text-xs text-muted-foreground">
        <div className="mx-auto max-w-5xl px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <p>© 2026 EconNotes. Düzce Üniversitesi öğrencileri için geliştirilmiştir.</p>
          <p className="font-mono text-[11px]">{APP_VERSION_LABEL}</p>
        </div>
      </footer>

    </div>
  );
};

export default MaintenanceScreen;
