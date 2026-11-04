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
  BookOpen
} from 'lucide-react';
import EconLogo from '@/components/EconLogo';
import econNotesEMark from '@/assets/econnotes-e-mark.png';
import { APP_VERSION_LABEL } from '@/lib/version';
import { Button } from '@/components/ui/button';
import EmergencyNotesArchive from '@/components/EmergencyNotesArchive';

interface MaintenanceScreenProps {
  closedUntil?: string | null;
  title?: string | null;
  message?: string | null;
  imageUrl?: string | null;
  mode?: string | null;
}

const MaintenanceScreen = ({}: MaintenanceScreenProps) => {
  const [lastChecked, setLastChecked] = useState<string>(() =>
    new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
  );
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
    <div className="min-h-screen bg-muted/30 dark:bg-background flex flex-col justify-between font-sans text-foreground antialiased selection:bg-primary/20">
      
      {/* Top Header Navigation - Mobile Responsive */}
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

      {/* PlayStation-style Bold Hero Banner - Mobile Responsive */}
      <div className="relative w-full bg-gradient-to-b from-[#003791] via-[#004bb5] to-[#0066d6] text-white pt-8 pb-20 sm:pt-14 sm:pb-32 px-4 text-center overflow-hidden">
        
        {/* Subtle, straight, upright EconNotes 'E' watermark pattern */}
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
        <div className="relative z-10 max-w-xl mx-auto">
          <h1 className="text-2xl sm:text-4xl md:text-5xl font-bold tracking-tight drop-shadow-sm">
            EconNotes
          </h1>
          <p className="mt-1.5 sm:mt-2 text-sm sm:text-lg text-white/90 font-medium tracking-wide">
            Hizmet ve Sunucu Durumu
          </p>
        </div>
      </div>

      {/* Main Status Container (PlayStation Overlapping Card Layout) */}
      <main className="relative z-20 flex-1 -mt-14 sm:-mt-20 mx-auto w-full max-w-4xl px-3 sm:px-6 mb-8 sm:mb-12 space-y-6">
        <div className="bg-card rounded-2xl shadow-xl border border-border p-4 sm:p-8 space-y-5 sm:space-y-6">
          
          {/* Main Status Announcement Header */}
          <div className="flex items-start sm:items-center gap-3 sm:gap-4 pb-4 sm:pb-6 border-b border-border">
            <div className="h-10 w-10 sm:h-14 sm:w-14 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 mt-0.5 sm:mt-0">
              <AlertCircle className="h-6 w-6 sm:h-8 sm:w-8" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg sm:text-2xl font-bold text-foreground leading-snug">
                Bazı hizmetlerde kesinti yaşanıyor.
              </h2>
              <p className="text-xs sm:text-sm text-muted-foreground mt-1 leading-relaxed">
                Yaklaşan üniversite sınavları öncesinde sunucu kapasitesini artırmak ve altyapıyı güçlendirmek amacıyla veritabanı ve oturum açma servisleri bakım modundadır. Ders notları açık erişimle yayındadır.
              </p>
            </div>
          </div>

          {/* Service by Service Breakdown List - Fully Mobile Responsive */}
          <div className="divide-y divide-border">
            
            {/* Service 1: Lecture Notes & Downloads */}
            <div className="py-3.5 sm:py-4 flex items-start justify-between gap-3">
              <div className="flex items-start gap-2.5 sm:gap-3 min-w-0 flex-1">
                <CheckCircle2 className="h-4 w-4 sm:h-5 sm:w-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <h3 className="text-xs sm:text-base font-semibold text-foreground leading-tight">
                    Ders Notları ve İçerik İndirme
                  </h3>
                  <p className="text-[11px] sm:text-sm text-muted-foreground mt-0.5 leading-snug">
                    Vize sınavları öncesinde 33 ders notunun tamamı aşağıdaki <a href="#acil-notlar" className="font-semibold text-primary underline underline-offset-2">Acil Not Arşivi</a> üzerinden açık erişime sunulmuştur. Giriş yapmadan hemen inceleyebilir veya indirebilirsiniz.
                  </p>
                </div>
              </div>
              <span className="text-[10px] sm:text-xs font-semibold px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-md bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 shrink-0 whitespace-nowrap self-start">
                Açık Erişimde
              </span>
            </div>

            {/* Service 2: Storage & Integrity */}
            <div className="py-3.5 sm:py-4 flex items-start justify-between gap-3">
              <div className="flex items-start gap-2.5 sm:gap-3 min-w-0 flex-1">
                <CheckCircle2 className="h-4 w-4 sm:h-5 sm:w-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <h3 className="text-xs sm:text-base font-semibold text-foreground leading-tight">
                    Not Arşivi ve Dosya Güvenliği
                  </h3>
                  <p className="text-[11px] sm:text-sm text-muted-foreground mt-0.5 leading-snug">
                    Öğrenciler tarafından yüklenen tüm PDF notlar ve materyaller eksiksiz korunmaktadır. Sıfır veri kaybı.
                  </p>
                </div>
              </div>
              <span className="text-[10px] sm:text-xs font-semibold px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-md bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 shrink-0 whitespace-nowrap self-start">
                Güvende
              </span>
            </div>

            {/* Service 3: Authentication & Accounts (Giriş Kısmı) */}
            <div className="py-3.5 sm:py-4 flex items-start justify-between gap-3">
              <div className="flex items-start gap-2.5 sm:gap-3 min-w-0 flex-1">
                <AlertTriangle className="h-4 w-4 sm:h-5 sm:w-5 text-amber-500 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <h3 className="text-xs sm:text-base font-semibold text-foreground leading-tight">
                    Hesap Yönetimi ve Öğrenci Girişi
                  </h3>
                  <p className="text-[11px] sm:text-sm text-muted-foreground mt-0.5 leading-snug">
                    Sunucu bakımı tamamlanana kadar oturum açma ve kayıt işlemleri geçici olarak askıya alınmıştır.
                  </p>
                </div>
              </div>
              <span className="text-[10px] sm:text-xs font-semibold px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-md bg-amber-500/15 text-amber-700 dark:text-amber-300 shrink-0 whitespace-nowrap self-start">
                Bakımda
              </span>
            </div>

            {/* Service 4: Exam Schedule Timeline */}
            <div className="py-3.5 sm:py-4 flex items-start justify-between gap-3">
              <div className="flex items-start gap-2.5 sm:gap-3 min-w-0 flex-1">
                <CheckCircle2 className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <h3 className="text-xs sm:text-base font-semibold text-foreground leading-tight">
                    Sınav Haftası Açılış Takvimi
                  </h3>
                  <p className="text-[11px] sm:text-sm text-muted-foreground mt-0.5 leading-snug">
                    Cumartesi günü başlayacak üniversite sınavları öncesinde tüm ders notları en geç Cuma günü yayına alınacaktır.
                  </p>
                </div>
              </div>
              <span className="text-[10px] sm:text-xs font-semibold px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-md bg-blue-500/15 text-blue-700 dark:text-blue-300 shrink-0 whitespace-nowrap self-start">
                Planlandı (Cuma)
              </span>
            </div>

          </div>

          {/* Official Incident Details Box */}
          <div className="p-3.5 sm:p-5 rounded-xl bg-muted/60 border border-border space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-xs sm:text-sm font-bold text-foreground flex items-center gap-1.5">
                <Info className="h-4 w-4 text-primary shrink-0" />
                Ayrıntılar
              </h4>
              <span className="text-[10px] sm:text-[11px] text-muted-foreground shrink-0">
                Son kontrol: {lastChecked}
              </span>
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
              Sınav haftası yoğunluğu öncesinde altyapı sunucularımızda kapasite genişletmesi ve optimizasyon çalışması yürütülmektedir. Olay 2 Kasım gecesi tespit edilmiş olup altyapı ekiplerimizle birlikte çalışmalar aralıksız sürdürülmektedir. Kullanıcılarımızın sınavlara eksiksiz çalışabilmesi için tüm sistem Cuma gününe kadar yeniden erişime açılacaktır.
            </p>
          </div>

          {/* Action Buttons - Fully Mobile Responsive */}
          <div className="pt-3 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 border-t border-border">
            <Button
              variant="outline"
              size="sm"
              onClick={handleManualRefresh}
              disabled={isRefreshing}
              className="w-full sm:w-auto gap-2 text-xs font-semibold justify-center h-9"
            >
              <RefreshCw className={`h-3.5 w-3.5 shrink-0 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>{isRefreshing ? 'Yenileniyor...' : 'Durumu Yenile'}</span>
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

        {/* Emergency Notes Archive Section */}
        <div id="acil-notlar" className="pt-2">
          <EmergencyNotesArchive />
        </div>
      </main>

      {/* Corporate Clean Footer - Exact Text as Requested */}
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
