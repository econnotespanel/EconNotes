import React, { useState, useEffect, useMemo } from 'react';
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
  Sparkles,
  Terminal,
  Gamepad2,
  Bell,
  Check,
  Activity,
  Server,
  Database,
  Lock,
  HelpCircle,
  ChevronDown,
} from 'lucide-react';
import EconLogo from '@/components/EconLogo';
import FatalErrorScreen from '@/components/FatalErrorScreen';
import econNotesEMark from '@/assets/econnotes-e-mark.png';
import { APP_VERSION_LABEL } from '@/lib/version';
import { Button } from '@/components/ui/button';
import { EconMiniGame } from '@/components/maintenance/EconMiniGame';
import { LiveConsole } from '@/components/maintenance/LiveConsole';

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

  // Active navigation tab
  const [activeTab, setActiveTab] = useState<'services' | 'console' | 'game' | 'faq'>('services');

  // Time & refresh states
  const [lastChecked, setLastChecked] = useState<string>(() =>
    new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
  );
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Dynamic ping latency simulator for high-tech feeling
  const [pingLatency, setPingLatency] = useState<number>(18);
  useEffect(() => {
    const timer = setInterval(() => {
      setPingLatency(16 + Math.floor(Math.random() * 8));
    }, 4000);
    return () => clearInterval(timer);
  }, []);

  // Live countdown state
  const [countdownParts, setCountdownParts] = useState<{
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
    isPassed: boolean;
    formattedString: string;
  } | null>(null);

  // Email notification signup state
  const [notifyEmail, setNotifyEmail] = useState('');
  const [notifyStatus, setNotifyStatus] = useState<'idle' | 'saved'>('idle');

  useEffect(() => {
    try {
      const saved = localStorage.getItem('econnotes_maintenance_notify');
      if (saved) {
        setNotifyStatus('saved');
        setNotifyEmail(saved);
      }
    } catch {
      // ignore
    }
  }, []);

  const handleNotifySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!notifyEmail || !notifyEmail.includes('@')) return;
    try {
      localStorage.setItem('econnotes_maintenance_notify', notifyEmail);
    } catch {
      // ignore
    }
    setNotifyStatus('saved');
  };

  // 1-second interval live countdown if closedUntil is set
  useEffect(() => {
    if (!closedUntil) {
      setCountdownParts(null);
      return;
    }

    const updateCountdown = () => {
      const target = new Date(closedUntil).getTime();
      const now = Date.now();
      const diff = target - now;

      if (diff <= 0) {
        setCountdownParts({
          days: 0,
          hours: 0,
          minutes: 0,
          seconds: 0,
          isPassed: true,
          formattedString: 'Açılış saati geldi, sistem kontrol ediliyor...',
        });
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
      const minutes = Math.floor((diff / (1000 * 60)) % 60);
      const seconds = Math.floor((diff / 1000) % 60);

      const parts: string[] = [];
      if (days > 0) parts.push(`${days} gün`);
      if (hours > 0 || days > 0) parts.push(`${hours} saat`);
      parts.push(`${minutes} dakika`);
      parts.push(`${seconds} saniye`);

      setCountdownParts({
        days,
        hours,
        minutes,
        seconds,
        isPassed: false,
        formattedString: parts.join(' '),
      });
    };

    updateCountdown();
    const timer = setInterval(updateCountdown, 1000);
    return () => clearInterval(timer);
  }, [closedUntil]);

  const handleManualRefresh = () => {
    setIsRefreshing(true);
    setLastChecked(new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }));
    window.dispatchEvent(new Event('econnotes:system-changed'));
    setTimeout(() => {
      window.location.reload();
    }, 600);
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

  const modeBadge = useMemo(() => {
    if (isSummer) {
      return {
        label: 'Yaz Tatili',
        icon: Sun,
        pillBg: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
        glow: 'from-amber-500/20 to-orange-500/20',
        ring: 'ring-amber-500/30',
      };
    }
    if (isTermBreak) {
      return {
        label: 'Dönem Arası',
        icon: Calendar,
        pillBg: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
        glow: 'from-indigo-500/20 to-purple-500/20',
        ring: 'ring-indigo-500/30',
      };
    }
    if (isExamBreak) {
      return {
        label: 'Sınav Hazırlığı',
        icon: GraduationCap,
        pillBg: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
        glow: 'from-cyan-500/20 to-blue-500/20',
        ring: 'ring-cyan-500/30',
      };
    }
    return {
      label: 'Sistem Bakımı',
      icon: Activity,
      pillBg: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
      glow: 'from-blue-600/20 to-cyan-500/20',
      ring: 'ring-blue-500/30',
    };
  }, [isSummer, isTermBreak, isExamBreak]);

  const ModeIcon = modeBadge.icon;

  // FAQ Accordion items
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const faqs = [
    {
      q: 'Yüklediğim ders notları, özetler veya kazandığım puanlar silinecek mi?',
      a: 'Kesinlikle hayır! Tüm ders notlarınız, PDF dökümanları, öğrenci puanlarınız ve profil verileriniz bağımsız şifrelenmiş yedekleme sunucularında güvende tutulmaktadır. Sıfır veri kaybı garantisi altındasınız.',
    },
    {
      q: 'Bakım çalışması ne kadar sürecek?',
      a: 'Planlanan bitiş saati yukarıdaki geri sayım panosunda belirtilmektedir. Mühendislik optimizasyonları tamamlandığında platform otomatik olarak normal yayına geçecektir.',
    },
    {
      q: 'Acil sınav hazırlığı için bir nota ihtiyacım var, ne yapabilirim?',
      a: 'Acil akademik materyal talepleriniz ve öğrenci destek ihtiyaçlarınız için destek@econnotes.online veya X (@econnotess) üzerinden teknik ekibimize 7/24 ulaşabilirsiniz.',
    },
    {
      q: 'Bakım sonrasında platformda hangi yenilikler olacak?',
      a: 'Veritabanı indeksleri yenilenerek arama hızı 3 kat artırılmakta, sunucu bant genişliği vize/final yoğunluğu için genişletilmekte ve güvenlik sertifikaları güncellenmektedir.',
    },
  ];

  return (
    <div className="relative min-h-screen w-full bg-[#030712] text-white flex flex-col justify-between selection:bg-cyan-500/25 selection:text-white font-sans overflow-x-hidden">
      {/* Dynamic Cyber Ambient Background */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        {/* Radial Neon Blooms */}
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[800px] h-[550px] bg-gradient-to-b from-blue-600/20 via-cyan-500/10 to-transparent rounded-full blur-[120px]" />
        <div className="absolute top-1/3 -left-48 w-[500px] h-[500px] bg-indigo-600/15 rounded-full blur-[140px]" />
        <div className="absolute bottom-10 -right-48 w-[600px] h-[600px] bg-cyan-600/10 rounded-full blur-[140px]" />

        {/* Blueprint Grid Lines */}
        <div
          className="absolute inset-0 opacity-[0.035]"
          style={{
            backgroundImage:
              'linear-gradient(to right, #38bdf8 1px, transparent 1px), linear-gradient(to bottom, #38bdf8 1px, transparent 1px)',
            backgroundSize: '48px 48px',
          }}
        />

        {/* Subtle Watermark EconNotes Pattern */}
        <div
          className="absolute inset-0 opacity-[0.03] select-none"
          style={{
            backgroundImage: `url(${econNotesEMark})`,
            backgroundRepeat: 'repeat',
            backgroundSize: '64px 64px',
            backgroundPosition: 'center',
            filter: 'brightness(0) invert(1)',
          }}
        />
      </div>

      {/* Top Glass Navigation Header */}
      <header className="relative z-20 w-full border-b border-white/10 bg-[#030712]/75 backdrop-blur-xl">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          {/* Logo & Platform Status Tag */}
          <div className="flex items-center gap-3">
            <Link to="/" className="flex items-center gap-2 group">
              <EconLogo allWhite className="h-7 w-32 sm:h-8 sm:w-36 shrink-0 transition-opacity group-hover:opacity-90" />
            </Link>

            {/* Live Status Beacon */}
            <div className="hidden md:flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-emerald-300 text-xs font-medium">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              <span>Sistem Koruması Aktif</span>
              <span className="text-emerald-500/50">•</span>
              <span className="font-mono text-[11px] text-emerald-400">0 Veri Kaybı</span>
            </div>
          </div>

          {/* Quick Stats & Admin Entry */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Live Ping Indicator */}
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-[11px] text-slate-300 font-mono">
              <Activity className="h-3.5 w-3.5 text-cyan-400 animate-pulse" />
              <span>{pingLatency} ms</span>
            </div>

            {/* Admin Login Button */}
            <Link to="/login">
              <Button
                variant="outline"
                size="sm"
                className="bg-white/5 hover:bg-white/15 text-white border-white/15 hover:border-white/30 text-xs font-semibold gap-1.5 px-3 h-8.5 rounded-xl transition-all shadow-sm"
              >
                <LogIn className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
                <span>Yönetici Girişi</span>
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content Arena */}
      <main className="relative z-10 flex-1 mx-auto w-full max-w-6xl px-4 sm:px-6 py-8 sm:py-12 space-y-8">
        
        {/* Hero Section */}
        <div className="text-center space-y-4 max-w-3xl mx-auto pt-2">
          
          {/* Mode Pill Badge */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border text-xs font-semibold tracking-wide backdrop-blur-md shadow-lg shadow-black/20 animate-in fade-in duration-500">
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full ${modeBadge.pillBg}`}>
              <ModeIcon className="h-3.5 w-3.5" />
              <span>{modeBadge.label}</span>
            </span>
            <span className="text-slate-300 font-normal hidden sm:inline">
              Altyapı ve Veri İyileştirme Modu
            </span>
          </div>

          {/* Main Title */}
          <div className="space-y-2">
            <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-white">
              <span className="bg-gradient-to-r from-white via-slate-100 to-blue-200 bg-clip-text text-transparent">
                {displayTitle}
              </span>
            </h1>
            <p className="text-sm sm:text-base text-slate-300/90 leading-relaxed max-w-2xl mx-auto font-normal">
              {displayMessage}
            </p>
          </div>

          {/* Quick Metrics Badge Strip */}
          <div className="pt-2 flex flex-wrap items-center justify-center gap-2 sm:gap-4 text-xs text-slate-300">
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/5 border border-white/10">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
              <span>%100 Veri Bütünlüğü</span>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/5 border border-white/10">
              <Lock className="h-3.5 w-3.5 text-blue-400" />
              <span>256-Bit SSL Koruması</span>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/5 border border-white/10">
              <Server className="h-3.5 w-3.5 text-cyan-400" />
              <span>Bulut Sunucu Kümesi</span>
            </div>
          </div>
        </div>

        {/* Admin Uploaded Image if available */}
        {imageUrl && (
          <div className="max-w-3xl mx-auto rounded-2xl overflow-hidden border border-white/15 shadow-2xl bg-black/40">
            <img
              src={imageUrl}
              alt="Bakım Duyurusu"
              className="w-full max-h-80 object-cover object-center transition-transform hover:scale-[1.01] duration-500"
            />
          </div>
        )}

        {/* Live Countdown & Scheduled Reopen Box */}
        {closedUntil && (
          <div className="max-w-3xl mx-auto rounded-2xl bg-gradient-to-b from-blue-950/60 to-slate-900/60 border border-blue-500/30 p-5 sm:p-7 shadow-2xl backdrop-blur-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 -mt-8 -mr-8 w-40 h-40 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-b border-white/10 pb-5">
              <div className="flex items-center gap-3 text-center sm:text-left">
                <div className="h-10 w-10 rounded-xl bg-blue-500/20 border border-blue-500/40 flex items-center justify-center text-cyan-400 shrink-0">
                  <Clock className="h-5 w-5 animate-pulse" />
                </div>
                <div>
                  <div className="text-xs text-slate-400 uppercase font-semibold tracking-wider">
                    Planlanan Yeniden Açılış
                  </div>
                  <div className="text-base sm:text-lg font-bold text-white">
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

              {countdownParts && (
                <div className="px-3 py-1 rounded-full bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 text-xs font-mono font-semibold">
                  {countdownParts.isPassed ? 'Sistem Hazırlanıyor' : 'Geri Sayım Sürüyor'}
                </div>
              )}
            </div>

            {/* Cyber Countdown Flip Tiles */}
            {countdownParts && !countdownParts.isPassed && (
              <div className="mt-5 grid grid-cols-4 gap-2 sm:gap-4 text-center">
                <div className="p-2 sm:p-4 rounded-xl bg-black/40 border border-white/10 shadow-inner">
                  <div className="text-2xl sm:text-4xl font-extrabold font-mono text-cyan-300">
                    {String(countdownParts.days).padStart(2, '0')}
                  </div>
                  <div className="text-[10px] sm:text-xs text-slate-400 uppercase font-semibold mt-1">
                    Gün
                  </div>
                </div>

                <div className="p-2 sm:p-4 rounded-xl bg-black/40 border border-white/10 shadow-inner">
                  <div className="text-2xl sm:text-4xl font-extrabold font-mono text-cyan-300">
                    {String(countdownParts.hours).padStart(2, '0')}
                  </div>
                  <div className="text-[10px] sm:text-xs text-slate-400 uppercase font-semibold mt-1">
                    Saat
                  </div>
                </div>

                <div className="p-2 sm:p-4 rounded-xl bg-black/40 border border-white/10 shadow-inner">
                  <div className="text-2xl sm:text-4xl font-extrabold font-mono text-cyan-300">
                    {String(countdownParts.minutes).padStart(2, '0')}
                  </div>
                  <div className="text-[10px] sm:text-xs text-slate-400 uppercase font-semibold mt-1">
                    Dakika
                  </div>
                </div>

                <div className="p-2 sm:p-4 rounded-xl bg-black/40 border border-white/10 shadow-inner">
                  <div className="text-2xl sm:text-4xl font-extrabold font-mono text-amber-400">
                    {String(countdownParts.seconds).padStart(2, '0')}
                  </div>
                  <div className="text-[10px] sm:text-xs text-slate-400 uppercase font-semibold mt-1">
                    Saniye
                  </div>
                </div>
              </div>
            )}

            {/* Text description of remaining time for accessibility & test readers */}
            {countdownParts && (
              <div className="mt-4 text-center text-xs text-slate-400 font-medium">
                Kalan Tahmini Süre: <span className="text-white font-semibold">{countdownParts.formattedString}</span>
              </div>
            )}
          </div>
        )}

        {/* Without closedUntil: Indeterminate Phase Pipeline */}
        {!closedUntil && (
          <div className="max-w-3xl mx-auto rounded-2xl bg-gradient-to-b from-blue-950/40 to-slate-900/40 border border-white/10 p-5 shadow-xl backdrop-blur-md space-y-3">
            <div className="flex items-center justify-between text-xs font-semibold">
              <span className="text-slate-300 flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-cyan-400" />
                Altyapı İyileştirme Fazı
              </span>
              <span className="text-cyan-400 font-mono">Aşama 2 / 3 Devam Ediyor</span>
            </div>

            {/* Animated Indeterminate Progress Bar */}
            <div className="w-full h-2.5 rounded-full bg-white/10 overflow-hidden relative">
              <div className="h-full rounded-full bg-gradient-to-r from-blue-600 via-cyan-400 to-blue-500 w-3/4 animate-pulse" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 text-[11px] text-slate-400">
              <div className="flex items-center gap-1.5 text-emerald-400 font-medium">
                <Check className="h-3 w-3" /> Veritabanı Yedekleme (Tamam)
              </div>
              <div className="flex items-center gap-1.5 text-cyan-300 font-medium">
                <span className="h-2 w-2 rounded-full bg-cyan-400 animate-ping inline-block" />
                Kapasite & İndeks Güçlendirme
              </div>
              <div className="flex items-center gap-1.5 text-slate-400">
                ⏳ Güvenlik & Doğrulama Testi
              </div>
            </div>
          </div>
        )}

        {/* Interactive Hub Navigation Tabs */}
        <div className="max-w-4xl mx-auto">
          {/* Tab Buttons */}
          <div className="flex items-center justify-center p-1.5 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-md max-w-xl mx-auto gap-1">
            <button
              type="button"
              onClick={() => setActiveTab('services')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-semibold transition-all ${
                activeTab === 'services'
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                  : 'text-slate-300 hover:text-white hover:bg-white/5'
              }`}
            >
              <Server className="h-3.5 w-3.5" />
              <span>Servis Durumu</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('console')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-semibold transition-all ${
                activeTab === 'console'
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                  : 'text-slate-300 hover:text-white hover:bg-white/5'
              }`}
            >
              <Terminal className="h-3.5 w-3.5" />
              <span>Canlı Konsol</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('game')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-semibold transition-all relative ${
                activeTab === 'game'
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                  : 'text-slate-300 hover:text-white hover:bg-white/5'
              }`}
            >
              <Gamepad2 className="h-3.5 w-3.5 text-amber-400" />
              <span>Mini Oyun</span>
              <span className="hidden sm:inline-block h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('faq')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-semibold transition-all ${
                activeTab === 'faq'
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                  : 'text-slate-300 hover:text-white hover:bg-white/5'
              }`}
            >
              <HelpCircle className="h-3.5 w-3.5" />
              <span>S.S.S.</span>
            </button>
          </div>

          {/* Tab Content Display */}
          <div className="mt-5">
            {/* TAB 1: Microservices Health Matrix */}
            {activeTab === 'services' && (
              <div className="space-y-4 animate-in fade-in duration-300">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  {/* Service 1: Lecture Notes & Studio */}
                  <div className="p-4 sm:p-5 rounded-2xl bg-white/5 border border-white/10 hover:border-amber-500/30 transition-all backdrop-blur-md space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <div className="h-9 w-9 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                          <AlertTriangle className="h-4 w-4" />
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-white">Ders Notları ve Çalışma Stüdyosu</h3>
                          <span className="text-[10px] text-slate-400 font-mono">Ders Havuzu & Sınav Soruları</span>
                        </div>
                      </div>
                      <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30">
                        Bakımda
                      </span>
                    </div>
                    <p className="text-xs text-slate-300/90 leading-relaxed">
                      Bakım çalışması süresince yeni materyal üretimi ve indirme işlemleri geçici olarak duraklatılmıştır.
                    </p>
                  </div>

                  {/* Service 2: Note Archive & Security */}
                  <div className="p-4 sm:p-5 rounded-2xl bg-white/5 border border-white/10 hover:border-emerald-500/30 transition-all backdrop-blur-md space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <div className="h-9 w-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
                          <ShieldCheck className="h-4 w-4" />
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-white">Not Arşivi ve Veri Güvenliği</h3>
                          <span className="text-[10px] text-slate-400 font-mono">Bulut S3 & Şifreli Depolama</span>
                        </div>
                      </div>
                      <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                        Güvende
                      </span>
                    </div>
                    <p className="text-xs text-slate-300/90 leading-relaxed">
                      Öğrenciler tarafından yüklenen tüm PDF ders notları, sınav soruları ve hesaplar eksiksiz korunmaktadır. Sıfır veri kaybı.
                    </p>
                  </div>

                  {/* Service 3: Authentication & Accounts */}
                  <div className="p-4 sm:p-5 rounded-2xl bg-white/5 border border-white/10 hover:border-amber-500/30 transition-all backdrop-blur-md space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <div className="h-9 w-9 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                          <AlertTriangle className="h-4 w-4" />
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-white">Öğrenci Girişi ve Kayıt</h3>
                          <span className="text-[10px] text-slate-400 font-mono">Oturum Yönetimi & Auth</span>
                        </div>
                      </div>
                      <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30">
                        Askıda
                      </span>
                    </div>
                    <p className="text-xs text-slate-300/90 leading-relaxed">
                      Bakım tamamlanana kadar genel öğrenci oturumları askıya alınmıştır. Yöneticiler üst menüden giriş yapabilir.
                    </p>
                  </div>

                  {/* Service 4: Infrastructure Status */}
                  <div className="p-4 sm:p-5 rounded-2xl bg-white/5 border border-white/10 hover:border-cyan-500/30 transition-all backdrop-blur-md space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <div className="h-9 w-9 rounded-xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shrink-0">
                          <CheckCircle2 className="h-4 w-4" />
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-white">Altyapı ve Veritabanı Yedekleri</h3>
                          <span className="text-[10px] text-slate-400 font-mono">Postgres & Redis Cluster</span>
                        </div>
                      </div>
                      <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                        Aktif
                      </span>
                    </div>
                    <p className="text-xs text-slate-300/90 leading-relaxed">
                      Bulut veritabanı yedekleme ve sunucu sağlık kontrolleri kesintisiz çalışmaktadır.
                    </p>
                  </div>
                </div>

                {/* Explanatory Details Box */}
                <div className="p-4 sm:p-5 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-md space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-xs sm:text-sm font-bold text-white flex items-center gap-1.5">
                      <Info className="h-4 w-4 text-cyan-400 shrink-0" />
                      Ayrıntılar ve Açıklama
                    </h4>
                    <span className="text-[11px] text-slate-400 font-mono">
                      Son kontrol: {lastChecked}
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm text-slate-300 leading-relaxed whitespace-pre-line">
                    {displayMessage}
                  </p>
                </div>
              </div>
            )}

            {/* TAB 2: Live Ops SysLog Console */}
            {activeTab === 'console' && (
              <div className="animate-in fade-in duration-300">
                <LiveConsole />
              </div>
            )}

            {/* TAB 3: Arcade Mini Game */}
            {activeTab === 'game' && (
              <div className="animate-in fade-in duration-300">
                <EconMiniGame />
              </div>
            )}

            {/* TAB 4: Student FAQ Accordion */}
            {activeTab === 'faq' && (
              <div className="space-y-3 animate-in fade-in duration-300">
                {faqs.map((faq, idx) => (
                  <div
                    key={idx}
                    className="rounded-xl bg-white/5 border border-white/10 overflow-hidden transition-colors"
                  >
                    <button
                      type="button"
                      onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
                      className="w-full text-left p-4 flex items-center justify-between gap-3 text-xs sm:text-sm font-bold text-white hover:text-cyan-300"
                    >
                      <span>{faq.q}</span>
                      <ChevronDown
                        className={`h-4 w-4 text-slate-400 shrink-0 transition-transform duration-200 ${
                          openFaq === idx ? 'rotate-180 text-cyan-400' : ''
                        }`}
                      />
                    </button>
                    {openFaq === idx && (
                      <div className="px-4 pb-4 pt-1 text-xs text-slate-300 leading-relaxed border-t border-white/5">
                        {faq.a}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Reopen Notification Box */}
        <div className="max-w-3xl mx-auto rounded-2xl bg-gradient-to-r from-blue-900/40 via-cyan-900/30 to-blue-900/40 border border-white/15 p-5 sm:p-6 backdrop-blur-xl shadow-xl flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3 text-center sm:text-left">
            <div className="h-10 w-10 rounded-xl bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shrink-0">
              <Bell className="h-5 w-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-white">Sistem Açıldığında Bildirim Al</h4>
              <p className="text-xs text-slate-300">
                Bakım biter bitmez e-posta adresine bilgilendirme gönderelim.
              </p>
            </div>
          </div>

          {notifyStatus === 'saved' ? (
            <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-xs font-semibold">
              <Check className="h-4 w-4" />
              <span>Bildirim Kaydedildi ({notifyEmail})</span>
            </div>
          ) : (
            <form onSubmit={handleNotifySubmit} className="flex items-center gap-2 w-full sm:w-auto">
              <input
                type="email"
                required
                placeholder="ornek@ogrenci.edu.tr"
                value={notifyEmail}
                onChange={(e) => setNotifyEmail(e.target.value)}
                className="w-full sm:w-56 h-9 px-3 rounded-xl bg-black/40 border border-white/15 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-400 transition-colors"
              />
              <Button
                type="submit"
                size="sm"
                className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs h-9 px-4 rounded-xl shrink-0"
              >
                Haber Ver
              </Button>
            </form>
          )}
        </div>

        {/* Global Action Bar */}
        <div className="max-w-3xl mx-auto pt-2 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border-t border-white/10">
          <Button
            variant="outline"
            size="sm"
            onClick={handleManualRefresh}
            disabled={isRefreshing}
            className="bg-white/5 hover:bg-white/10 text-white border-white/15 hover:border-white/25 text-xs font-semibold gap-2 h-9 rounded-xl"
          >
            <RefreshCw className={`h-3.5 w-3.5 text-cyan-400 ${isRefreshing ? 'animate-spin' : ''}`} />
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
                className="w-full sm:w-auto text-xs text-slate-300 hover:text-white hover:bg-white/10 gap-1.5 h-9 rounded-xl border border-white/10 sm:border-transparent"
              >
                <ExternalLink className="h-3.5 w-3.5 text-slate-400" />
                X (@econnotess)
              </Button>
            </a>

            <a href="mailto:destek@econnotes.online" className="w-full sm:w-auto">
              <Button
                variant="ghost"
                size="sm"
                className="w-full sm:w-auto text-xs text-slate-300 hover:text-white hover:bg-white/10 gap-1.5 h-9 rounded-xl border border-white/10 sm:border-transparent"
              >
                <Mail className="h-3.5 w-3.5 text-slate-400" />
                destek@econnotes.online
              </Button>
            </a>
          </div>
        </div>
      </main>

      {/* Corporate Academic Footer */}
      <footer className="relative z-20 w-full border-t border-white/10 bg-[#030712]/90 backdrop-blur-md py-6 text-xs text-slate-400">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
          <div className="space-y-0.5">
            <p className="text-xs sm:text-sm font-medium text-slate-300">
              EconNotes, Düzce Üniversitesi öğrencileri tarafından geliştirilmiştir.
            </p>
            <p className="text-[11px] text-slate-500">
              Tüm hakları saklıdır. Akademik dayanışma ve açık not paylaşım platformu.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 font-mono text-[11px] px-2.5 py-1 rounded-md bg-white/5 border border-white/10 text-slate-300">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 inline-block" />
              {APP_VERSION_LABEL}
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default MaintenanceScreen;
