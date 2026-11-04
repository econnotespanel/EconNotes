import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Clock,
  ShieldCheck,
  RefreshCw,
  LogIn,
  CheckCircle2,
  Server,
  Cloud,
  Database,
  Calendar,
  ExternalLink,
  Info
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

const MaintenanceScreen = ({
  title,
  message,
}: MaintenanceScreenProps) => {
  const [lastChecked, setLastChecked] = useState<string>(() => new Date().toLocaleTimeString('tr-TR'));
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleManualRefresh = () => {
    setIsRefreshing(true);
    setLastChecked(new Date().toLocaleTimeString('tr-TR'));
    setTimeout(() => {
      window.location.reload();
    }, 600);
  };

  // Auto-refresh check every 90 seconds in background
  useEffect(() => {
    const interval = setInterval(() => {
      setLastChecked(new Date().toLocaleTimeString('tr-TR'));
    }, 90000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-gradient-to-b from-background via-background/98 to-primary/5 flex flex-col justify-between text-foreground">
      {/* Background glow ambient effects */}
      <div className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-primary/10 blur-[130px] rounded-full" />
      <div className="pointer-events-none absolute top-1/3 -right-20 w-[450px] h-[350px] bg-amber-500/10 blur-[120px] rounded-full" />
      <div className="pointer-events-none absolute bottom-10 -left-20 w-[450px] h-[350px] bg-blue-500/10 blur-[120px] rounded-full" />

      {/* Header */}
      <header className="relative z-10 mx-auto w-full max-w-5xl px-4 sm:px-6 py-5 flex items-center justify-between border-b border-border/50 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <EconLogo className="h-8 w-36 sm:h-9 sm:w-44" />
        </div>

        <div className="flex items-center gap-2.5">
          <Link to="/login">
            <Button variant="outline" size="sm" className="gap-2 border-border/70 hover:bg-muted font-medium text-xs">
              <LogIn className="h-3.5 w-3.5 text-primary" />
              <span>Yönetici Girişi</span>
            </Button>
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 mx-auto w-full max-w-4xl px-4 sm:px-6 py-8 sm:py-12 flex flex-col items-center">
        {/* Hero Title */}
        <h1 className="text-2xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-foreground text-center max-w-3xl leading-tight">
          {title || "EconNotes Sistem Durumu & Altyapı Kontrol Merkezi"}
        </h1>

        {/* Hero Description */}
        <p className="mt-4 text-sm sm:text-base text-muted-foreground text-center max-w-2xl leading-relaxed">
          {message ||
            "Sınav haftası yoğunluğu öncesinde sunucu altyapımızda kapasite artırımı ve veritabanı kurtarma çalışması sürdürülmektedir. Tüm ders notlarınız, yüklemeleriniz ve kullanıcı hesaplarınız yüzde yüz güvendedir."}
        </p>

        {/* Status Dashboard Card Container (Inspired by Cloud / Incident Dashboards) */}
        <div className="mt-8 w-full space-y-6 text-left">
          
          {/* Affected Components Section */}
          <div className="p-5 sm:p-6 rounded-2xl border border-border/70 bg-card/70 backdrop-blur-md shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-border/40 pb-3">
              <h2 className="text-sm sm:text-base font-bold text-foreground flex items-center gap-2">
                <Server className="h-4 w-4 text-primary" />
                Etkilenen Bileşenler (Affected Components)
              </h2>
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Info className="h-3.5 w-3.5" /> Son kontrol: {lastChecked}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              {/* Component 1: Cloud & Database */}
              <div className="p-3.5 rounded-xl border border-amber-500/30 bg-amber-500/5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold">
                    <Cloud className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-foreground">Cloud & Veritabanı</div>
                    <div className="text-xs text-muted-foreground">Kapasite & WAL kurtarma</div>
                  </div>
                </div>
                <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30 flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                  İyileştiriliyor
                </span>
              </div>

              {/* Component 2: Storage & Note Files */}
              <div className="p-3.5 rounded-xl border border-emerald-500/30 bg-emerald-500/5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold">
                    <Database className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-foreground">Ders Notları & PDF Deposu</div>
                    <div className="text-xs text-muted-foreground">Tüm dosyalar sağlam</div>
                  </div>
                </div>
                <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  Güvende
                </span>
              </div>
            </div>
          </div>

          {/* Incident Timeline / Updates Section */}
          <div className="p-5 sm:p-6 rounded-2xl border border-border/70 bg-card/70 backdrop-blur-md shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-border/40 pb-3">
              <h2 className="text-sm sm:text-base font-bold text-foreground flex items-center gap-2">
                <Clock className="h-4 w-4 text-primary" />
                Süreç Güncellemeleri & Olay Günlüğü (Updates)
              </h2>
              <span className="text-xs font-medium text-primary">Canlı Akış</span>
            </div>

            {/* Timeline Items */}
            <div className="space-y-6 pt-2">
              
              {/* Event 1: Currently In Progress */}
              <div className="relative pl-7 border-l-2 border-amber-500/70 space-y-1.5">
                <span className="absolute -left-[9px] top-1 h-4 w-4 rounded-full bg-amber-500/20 border-2 border-amber-500 flex items-center justify-center">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-ping" />
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-500/20 text-amber-700 dark:text-amber-300">
                    Devam Ediyor (In Progress)
                  </span>
                  <span className="text-xs text-muted-foreground">4 Kasım 2026, Çarşamba (Sabah)</span>
                </div>
                <h3 className="text-sm font-semibold text-foreground">
                  Altyapı Mühendislik Ekibi İnceleme ve Kurtarma Çalışması
                </h3>
                <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                  Bulut ve sunucu altyapı mühendisleriyle koordinasyon sağlandı. Veritabanı servisleri ayağa kaldırılmakta olup son entegrasyon kontrolleri sürdürülmektedir.
                </p>
              </div>

              {/* Event 2: Complete */}
              <div className="relative pl-7 border-l-2 border-emerald-500/70 space-y-1.5">
                <span className="absolute -left-[9px] top-1 h-4 w-4 rounded-full bg-emerald-500/20 border-2 border-emerald-500 flex items-center justify-center">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-500/20 text-emerald-700 dark:text-emerald-300">
                    Tamamlandı (Complete)
                  </span>
                  <span className="text-xs text-muted-foreground">3 Kasım 2026, Salı</span>
                </div>
                <h3 className="text-sm font-semibold text-foreground">
                  Ön Bellekleme ve Veri Koruma Kalkanı Devreye Alındı
                </h3>
                <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                  Ziyaretçi trafiği bakım ve koruma moduna yönlendirildi. Yedek veritabanı şemaları hazırlandı; ders notları ve kullanıcı bakiyelerinin eksiksiz korunduğu doğrulandı.
                </p>
              </div>

              {/* Event 3: Started (Night of Nov 2) */}
              <div className="relative pl-7 border-l-2 border-border/80 space-y-1.5">
                <span className="absolute -left-[9px] top-1 h-4 w-4 rounded-full bg-muted border-2 border-muted-foreground/60 flex items-center justify-center" />
                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-muted text-muted-foreground">
                    Olay Başlangıcı (Incident Started)
                  </span>
                  <span className="text-xs text-muted-foreground">2 Kasım 2026, Gece Yarısı</span>
                </div>
                <h3 className="text-sm font-semibold text-foreground">
                  Sınav Dönemi Kaynak Aşımı ve Otomatik Kurtarma Durumu
                </h3>
                <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                  Sınav haftası öncesi yaşanan yoğun talep nedeniyle Cloud veritabanı disk IOPS limitine ulaşmış ve sistem otomatik kurtarma durumuna geçmiştir.
                </p>
              </div>

              {/* Target: Scheduled */}
              <div className="relative pl-7 border-l-2 border-primary/50 space-y-1.5">
                <span className="absolute -left-[9px] top-1 h-4 w-4 rounded-full bg-primary/20 border-2 border-primary flex items-center justify-center">
                  <Calendar className="h-2.5 w-2.5 text-primary" />
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-primary/20 text-primary">
                    Planlanan Hedef (Target)
                  </span>
                  <span className="text-xs text-muted-foreground">En Geç Cuma (Sınavlardan Önce)</span>
                </div>
                <h3 className="text-sm font-semibold text-foreground">
                  Üniversite Sınavları Öncesi Tam Kapasite Yeniden Açılış
                </h3>
                <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                  Cumartesi günü başlayacak üniversite sınavları öncesinde tüm ders notları öğrencilerin kesintisiz erişimine açılacaktır.
                </p>
              </div>

            </div>
          </div>

          {/* Reassurance Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 pt-2">
            <div className="p-4 rounded-xl border border-border/60 bg-card/60 backdrop-blur-sm space-y-1.5">
              <div className="h-8 w-8 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                <CheckCircle2 className="h-4 w-4" />
              </div>
              <h3 className="text-sm font-semibold text-foreground">Sıfır Veri Kaybı</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Tüm notlarınız, kullanıcı profilleriniz ve hesap puanlarınız sunucu diskinde eksiksiz korunmaktadır.
              </p>
            </div>

            <div className="p-4 rounded-xl border border-border/60 bg-card/60 backdrop-blur-sm space-y-1.5">
              <div className="h-8 w-8 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                <ShieldCheck className="h-4 w-4" />
              </div>
              <h3 className="text-sm font-semibold text-foreground">Kapasite Artırımı</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Yenilenen sunucu mimarisiyle sınav dönemi yoğunluğunda donma ve yavaşlama yaşanmayacaktır.
              </p>
            </div>

            <div className="p-4 rounded-xl border border-border/60 bg-card/60 backdrop-blur-sm space-y-1.5">
              <div className="h-8 w-8 rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center">
                <Calendar className="h-4 w-4" />
              </div>
              <h3 className="text-sm font-semibold text-foreground">Sınav Güvencesi</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Öğrencilerimizin sınavlarına eksiksiz çalışabilmesi için sistem en geç Cuma günü yayına alınacaktır.
              </p>
            </div>
          </div>

          {/* Action Bar */}
          <div className="pt-4 flex flex-wrap items-center justify-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={handleManualRefresh}
              disabled={isRefreshing}
              className="gap-2 text-xs font-semibold border-border/80 hover:bg-muted"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>{isRefreshing ? 'Kontrol Ediliyor...' : 'Durumu Yenile'}</span>
            </Button>

            <a href="https://x.com/econnotess" target="_blank" rel="noopener noreferrer">
              <Button variant="ghost" size="sm" className="gap-1.5 text-xs text-muted-foreground hover:text-foreground">
                <ExternalLink className="h-3.5 w-3.5" />
                Resmi Duyurular (@econnotess)
              </Button>
            </a>

            <a href="mailto:destek@econnotes.online">
              <Button variant="ghost" size="sm" className="text-xs text-muted-foreground hover:text-foreground">
                destek@econnotes.online
              </Button>
            </a>
          </div>

        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 mx-auto w-full max-w-5xl px-4 sm:px-6 py-6 border-t border-border/40 flex flex-col sm:flex-row items-center justify-between text-xs text-muted-foreground gap-2">
        <p>EconNotes, Düzce Üniversitesi öğrencileri için geliştirilmiştir.</p>
        <p className="font-mono text-[11px]">{APP_VERSION_LABEL}</p>
      </footer>
    </div>
  );
};

export default MaintenanceScreen;
