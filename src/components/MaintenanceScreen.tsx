import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Clock, Zap, ShieldCheck, RefreshCw, LogIn, CheckCircle2, Server, ArrowRight } from 'lucide-react';
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

const DEFAULT_TARGET_TIME = new Date('2026-11-03T20:00:00+03:00').getTime();

const MaintenanceScreen = ({
  closedUntil,
  title,
  message,
}: MaintenanceScreenProps) => {
  const targetTimestamp = closedUntil ? new Date(closedUntil).getTime() : DEFAULT_TARGET_TIME;

  const [timeLeft, setTimeLeft] = useState<{
    hours: number;
    minutes: number;
    seconds: number;
    isFinished: boolean;
  }>(() => {
    const diff = Math.max(0, targetTimestamp - Date.now());
    return {
      hours: Math.floor(diff / (1000 * 60 * 60)),
      minutes: Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)),
      seconds: Math.floor((diff % (1000 * 60)) / 1000),
      isFinished: diff <= 0,
    };
  });

  useEffect(() => {
    const timer = setInterval(() => {
      const diff = Math.max(0, targetTimestamp - Date.now());
      if (diff <= 0) {
        setTimeLeft({ hours: 0, minutes: 0, seconds: 0, isFinished: true });
        clearInterval(timer);
        // Automatically refresh once target time is hit
        setTimeout(() => {
          window.location.reload();
        }, 1500);
      } else {
        setTimeLeft({
          hours: Math.floor(diff / (1000 * 60 * 60)),
          minutes: Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)),
          seconds: Math.floor((diff % (1000 * 60)) / 1000),
          isFinished: false,
        });
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [targetTimestamp]);

  const pad = (n: number) => n.toString().padStart(2, '0');

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-b from-background via-background/95 to-primary/5 flex flex-col justify-between text-foreground">
      {/* Background glowing orbs */}
      <div className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 w-[700px] h-[350px] bg-primary/15 blur-[120px] rounded-full" />
      <div className="pointer-events-none absolute -bottom-40 right-10 w-[500px] h-[300px] bg-blue-500/10 blur-[100px] rounded-full" />

      {/* Header */}
      <header className="relative z-10 mx-auto w-full max-w-6xl px-6 py-6 flex items-center justify-between border-b border-border/40">
        <div className="flex items-center gap-3">
          <EconLogo className="h-8 w-36 sm:h-9 sm:w-44" />
        </div>

        <div className="flex items-center gap-3">
          <Link to="/login">
            <Button variant="outline" size="sm" className="gap-2 border-border/60 hover:bg-muted font-medium text-xs">
              <LogIn className="h-3.5 w-3.5 text-primary" />
              <span>Yönetici Girişi</span>
            </Button>
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 mx-auto w-full max-w-4xl px-6 py-12 flex flex-col items-center text-center">
        {/* Title */}
        <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-foreground max-w-2xl leading-tight">
          {title || "EconNotes Yenilenen Altyapısıyla Saat 22:00'da Açılıyor!"}
        </h1>

        {/* Description */}
        <p className="mt-4 text-sm sm:text-base text-muted-foreground max-w-2xl leading-relaxed">
          {message ||
            "Sınav haftası yoğunluğu öncesinde EconNotes'u çok daha hızlı, kesintisiz ve yüksek kapasiteli Cloudflare sunucularına taşıdık. Tüm notlar ve veriler eksiksiz şekilde korundu. Son teknik kontrollerin ardından sistemimiz bu akşam saat 22:00'da tüm öğrencilerin kullanımına açılacaktır."}
        </p>

        {/* Live Status Card */}
        <div className="mt-8 w-full max-w-lg">
          <div className="p-6 rounded-2xl border border-primary/30 bg-primary/5 shadow-lg backdrop-blur-sm flex flex-col items-center justify-center gap-2.5">
            <div className="flex items-center gap-2 text-primary font-bold text-sm sm:text-base">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-primary"></span>
              </span>
              Altyapı Güçlendirme Çalışması Sürüyor
            </div>
            <p className="text-xs text-muted-foreground max-w-md">
              Teknik optimizasyon tamamlanır tamamlanmaz sistemimiz kesintisiz olarak açılacaktır. Sayfa periyodik olarak kontrol edilmektedir.
            </p>
          </div>
        </div>

        {/* Feature / Improvement Cards */}
        <div className="mt-12 grid grid-cols-1 sm:grid-cols-3 gap-4 w-full text-left">
          <div className="p-4 rounded-xl border border-border/60 bg-card/60 backdrop-blur-sm space-y-1.5">
            <div className="h-8 w-8 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <Server className="h-4 w-4" />
            </div>
            <h3 className="text-sm font-semibold text-foreground">Cloudflare Altyapısı</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Global CDN desteğiyle sıfır donma, anlık sayfa yüklemeleri ve kesintisiz not indirme.
            </p>
          </div>

          <div className="p-4 rounded-xl border border-border/60 bg-card/60 backdrop-blur-sm space-y-1.5">
            <div className="h-8 w-8 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <CheckCircle2 className="h-4 w-4" />
            </div>
            <h3 className="text-sm font-semibold text-foreground">Sıfır Veri Kaybı</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Tüm ders notlarınız, yüklemeleriniz ve hesap puanlarınız eksiksiz korunmaktadır.
            </p>
          </div>

          <div className="p-4 rounded-xl border border-border/60 bg-card/60 backdrop-blur-sm space-y-1.5">
            <div className="h-8 w-8 rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center">
              <ShieldCheck className="h-4 w-4" />
            </div>
            <h3 className="text-sm font-semibold text-foreground">Gelişmiş Güvenlik</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              DDoS koruması ve optimize edilmiş kota kontrolü ile sistem koruma altında.
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.location.reload()}
            className="gap-2 text-xs font-semibold border-border/70 hover:bg-muted"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Sayfayı Yenile
          </Button>
          <a href="mailto:destek@econnotes.online">
            <Button variant="ghost" size="sm" className="text-xs text-muted-foreground hover:text-foreground">
              Teknik Destek: destek@econnotes.online
            </Button>
          </a>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 mx-auto w-full max-w-6xl px-6 py-6 border-t border-border/40 flex flex-col sm:flex-row items-center justify-between text-xs text-muted-foreground gap-2">
        <p>EconNotes, Düzce Üniversitesi öğrencileri için geliştirilmiştir.</p>
        <p className="font-mono text-[11px]">{APP_VERSION_LABEL}</p>
      </footer>
    </div>
  );
};

export default MaintenanceScreen;
