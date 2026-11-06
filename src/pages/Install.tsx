import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Download,
  Monitor,
  CheckCircle2,
  Smartphone,
  Share,
  PlusSquare,
  MoreVertical,
  Laptop,
  Zap,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Info,
  Check,
  ChevronRight,
  AppWindow,
  HardDrive,
  FolderDown
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import EconLogo from "@/components/EconLogo";
import { APP_VERSION } from "@/lib/version";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

type PlatformTab = "ios" | "android" | "desktop";

// Orijinal Apple Logosu (Isırılmış elma simgesi)
const AppleLogo = ({ className = "h-5 w-5" }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    className={className}
    fill="currentColor"
    aria-hidden="true"
  >
    <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
  </svg>
);

// Orijinal Windows Logosu (4 parçalı pencere simgesi)
const WindowsLogo = ({ className = "h-5 w-5" }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    className={className}
    fill="currentColor"
    aria-hidden="true"
  >
    <path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-13.051-1.802" />
  </svg>
);

const Install = () => {
  const navigate = useNavigate();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [activeTab, setActiveTab] = useState<PlatformTab>("ios");
  const [detectedPlatform, setDetectedPlatform] = useState<PlatformTab>("desktop");

  useEffect(() => {
    // Cihaz tespiti
    const ua = navigator.userAgent || "";
    const isIos = /iPad|iPhone|iPod/.test(ua);
    const isAndroid = /Android/.test(ua);

    if (isIos) {
      setActiveTab("ios");
      setDetectedPlatform("ios");
    } else if (isAndroid) {
      setActiveTab("android");
      setDetectedPlatform("android");
    } else {
      setActiveTab("desktop");
      setDetectedPlatform("desktop");
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handler);

    if (window.matchMedia("(display-mode: standalone)").matches) {
      setIsInstalled(true);
    }

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setIsInstalled(true);
    }
    setDeferredPrompt(null);
  };

  return (
    <div
      className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between px-4 sm:px-6 relative overflow-x-hidden selection:bg-blue-600 selection:text-white"
      style={{
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 1.5rem)',
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 2rem)',
      }}
    >
      {/* Arka plan yumuşak aydınlatması */}
      <div className="fixed inset-0 pointer-events-none -z-10 overflow-hidden">
        <div className="absolute top-[-10%] left-1/2 -translate-x-1/2 w-[700px] h-[350px] bg-gradient-to-b from-blue-600/20 via-sky-600/10 to-transparent blur-3xl opacity-60 rounded-full" />
      </div>

      <div className="w-full max-w-3xl mx-auto space-y-8">
        {/* Başlık ve Logo Alanı */}
        <div className="text-center space-y-3 pt-2">
          <div className="flex justify-center items-center">
            <EconLogo className="h-14 sm:h-16 w-auto drop-shadow-md cursor-pointer transition-transform hover:scale-105" />
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
            EconNotes Uygulamasını Yükleyin
          </h1>
          <p className="text-base sm:text-lg text-slate-300 max-w-xl mx-auto leading-relaxed">
            Telefonunuza veya bilgisayarınıza saniyeler içinde ekleyin. Mağaza araması ve hafıza kaybı olmadan doğrudan ana ekranınızdan derslerinize çalışın.
          </p>

          {/* Cihaz Bilgisi Rozeti (Efektsiz, Doğal ve Sade) */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-900/90 border border-slate-700/80 text-xs sm:text-sm text-slate-300 font-medium">
            {detectedPlatform === "ios" && (
              <>
                <AppleLogo className="h-3.5 w-3.5 text-slate-200" />
                <span>Kullandığınız Cihaz: <strong className="text-white">iPhone / iPad</strong></span>
              </>
            )}
            {detectedPlatform === "android" && (
              <>
                <Smartphone className="h-3.5 w-3.5 text-emerald-400" />
                <span>Kullandığınız Cihaz: <strong className="text-white">Android</strong></span>
              </>
            )}
            {detectedPlatform === "desktop" && (
              <>
                <WindowsLogo className="h-3.5 w-3.5 text-sky-400" />
                <span>Kullandığınız Cihaz: <strong className="text-white">Windows Bilgisayar</strong></span>
              </>
            )}
          </div>
        </div>

        {/* Zaten Kurulu Durumu */}
        {isInstalled ? (
          <Card className="bg-slate-900/80 border border-emerald-500/30 backdrop-blur-md shadow-2xl">
            <CardContent className="flex flex-col items-center py-10 px-6 text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shadow-inner">
                <CheckCircle2 className="h-9 w-9" />
              </div>
              <div className="space-y-1">
                <h3 className="text-xl font-bold text-white">Uygulama Cihazınızda Zaten Kurulu!</h3>
                <p className="text-slate-300 text-sm max-w-md">
                  EconNotes cihazınıza başarıyla eklenmiş durumda. Ana ekranınızdaki veya masaüstünüzdeki uygulama simgesine dokunarak hemen çalışmaya başlayabilirsiniz.
                </p>
              </div>
              <div className="pt-2 flex flex-wrap gap-3 justify-center">
                <Button
                  onClick={() => navigate("/")}
                  className="bg-blue-600 hover:bg-blue-500 text-white font-semibold px-6 shadow-lg shadow-blue-600/30"
                >
                  Ana Sayfaya Git
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  onClick={() => navigate("/dashboard")}
                  className="border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-slate-200"
                >
                  Çalışma Paneli
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Tek Tıkla Hızlı Kurulum (Tarayıcı PWA Prompt Hazırsa) */}
            {deferredPrompt && (
              <div className="p-[1px] rounded-2xl bg-gradient-to-r from-blue-600/70 via-blue-500/50 to-indigo-600/60 shadow-xl shadow-blue-500/10">
                <Card className="bg-slate-900/95 border-0 rounded-2xl overflow-hidden backdrop-blur-md">
                  <CardContent className="p-6 flex flex-col sm:flex-row items-center justify-between gap-5">
                    <div className="flex items-start gap-4">
                      <div className="p-3 rounded-xl bg-blue-600/20 border border-blue-500/30 text-blue-400">
                        <Download className="h-7 w-7" />
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">
                            Önerilen
                          </span>
                          <h3 className="text-lg font-bold text-white">Tek Tıkla Hemen Kur</h3>
                        </div>
                        <p className="text-sm text-slate-300">
                          Tarayıcınız EconNotes'u anında yüklemeyi destekliyor. Butona basarak hemen masaüstünüze veya ana ekranınıza ekleyin.
                        </p>
                      </div>
                    </div>
                    <Button
                      onClick={handleInstall}
                      size="lg"
                      className="w-full sm:w-auto shrink-0 bg-blue-600 hover:bg-blue-500 text-white font-bold px-7 py-6 shadow-lg shadow-blue-600/40 transition-all hover:scale-[1.02]"
                    >
                      <Download className="mr-2 h-5 w-5" />
                      Uygulamayı Şimdi Kur
                    </Button>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Platform Seçim Sekmeleri */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase tracking-wider text-slate-400 font-semibold">
                  Cihazınızı Seçin
                </span>
                <span className="text-xs text-slate-400">
                  Adım adım kurulum kılavuzu
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 p-1.5 rounded-xl bg-slate-900/90 border border-slate-800">
                <button
                  type="button"
                  onClick={() => setActiveTab("ios")}
                  className={`flex flex-col sm:flex-row items-center justify-center gap-2 py-3 px-3 rounded-lg font-medium text-xs sm:text-sm transition-all ${
                    activeTab === "ios"
                      ? "bg-blue-600 text-white shadow-md shadow-blue-600/30 font-semibold"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
                  }`}
                >
                  <AppleLogo className="h-4 w-4 sm:h-5 sm:w-5 shrink-0" />
                  <span>iPhone / iPad</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab("android")}
                  className={`flex flex-col sm:flex-row items-center justify-center gap-2 py-3 px-3 rounded-lg font-medium text-xs sm:text-sm transition-all ${
                    activeTab === "android"
                      ? "bg-blue-600 text-white shadow-md shadow-blue-600/30 font-semibold"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
                  }`}
                >
                  <Smartphone className="h-4 w-4 sm:h-5 sm:w-5 shrink-0" />
                  <span>Android</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab("desktop")}
                  className={`flex flex-col sm:flex-row items-center justify-center gap-2 py-3 px-3 rounded-lg font-medium text-xs sm:text-sm transition-all ${
                    activeTab === "desktop"
                      ? "bg-blue-600 text-white shadow-md shadow-blue-600/30 font-semibold"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
                  }`}
                >
                  <WindowsLogo className="h-4 w-4 sm:h-5 sm:w-5 shrink-0" />
                  <span>Windows (PC)</span>
                </button>
              </div>
            </div>

            {/* TAB 1: iOS (iPhone & iPad) */}
            {activeTab === "ios" && (
              <Card className="bg-slate-900/90 border border-slate-800/90 shadow-xl overflow-hidden">
                <CardHeader className="bg-slate-850/50 border-b border-slate-800/80 pb-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white">
                        <AppleLogo className="h-6 w-6" />
                      </div>
                      <div>
                        <CardTitle className="text-xl font-bold text-white">
                          iPhone ve iPad için Kurulum
                        </CardTitle>
                        <CardDescription className="text-slate-300 text-sm">
                          Safari tarayıcısı üzerinden 10 saniyede ana ekranınıza ekleyin.
                        </CardDescription>
                      </div>
                    </div>
                    {detectedPlatform === "ios" && (
                      <span className="hidden sm:inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">
                        <Check className="h-3.5 w-3.5 text-blue-400" />
                        Cihazınız
                      </span>
                    )}
                  </div>
                </CardHeader>

                <CardContent className="p-6 space-y-6">
                  {/* Önemli Uyarı Kutusu */}
                  <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-sm flex items-start gap-3">
                    <Info className="h-5 w-5 shrink-0 text-amber-400 mt-0.5" />
                    <div>
                      <span className="font-semibold text-amber-300">Önemli Hatırlatma:</span> Apple iOS kuralları gereği kurulum işlemi yalnızca <strong>Safari</strong> tarayıcısında çalışır. Eğer şu an Chrome, Instagram veya WhatsApp içinden bu sayfayı görüyorsanız, sağ alttaki menüden <strong>"Safari'de Aç"</strong> seçeneğini seçin.
                    </div>
                  </div>

                  {/* Adımlar */}
                  <div className="space-y-4">
                    <InstructionStep
                      stepNumber={1}
                      title="Safari ile EconNotes'a girin"
                      description="iPhone veya iPad'inizde Safari tarayıcısını açıp econnotes.online adresinde olduğunuzdan emin olun."
                      badge="Safari"
                    />

                    <InstructionStep
                      stepNumber={2}
                      title="Alt kısımdaki Paylaş simgesine dokunun"
                      description="Safari ekranının en altında (iPad'lerde sağ üstte) yer alan, kare içinden yukarı doğru ok çıkan Paylaş simgesine basın."
                      badge="Paylaş (Share)"
                      icon={<Share className="h-4 w-4 text-blue-400" />}
                    />

                    <InstructionStep
                      stepNumber={3}
                      title="Açılan menüden 'Ana Ekrana Ekle'yi seçin"
                      description="Aşağı doğru açılan pencereyi parmağınızla hafifçe yukarı kaydırın. Gri kare içinde '+' işareti olan 'Ana Ekrana Ekle' seçeneğine dokunun."
                      badge="Ana Ekrana Ekle"
                      icon={<PlusSquare className="h-4 w-4 text-blue-400" />}
                    />

                    <InstructionStep
                      stepNumber={4}
                      title="Sağ üstteki mavi 'Ekle' butonuna dokunun"
                      description="Sağ üst köşedeki 'Ekle' yazısına dokunarak işlemi tamamlayın. EconNotes logosu anında ana ekranınıza eklenecektir."
                      badge="Ekle"
                    />
                  </div>

                  {/* Tamamlandı Özeti */}
                  <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700/60 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                      <Sparkles className="h-5 w-5" />
                    </div>
                    <p className="text-sm text-slate-200">
                      <strong>Kurulum Tamam!</strong> Artık ana ekrandaki EconNotes simgesine dokunarak, hiçbir tarayıcı çubuğu olmadan tam ekran bir uygulama deneyimiyle notlarınızı okuyabilirsiniz.
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* TAB 2: Android */}
            {activeTab === "android" && (
              <Card className="bg-slate-900/90 border border-slate-800/90 shadow-xl overflow-hidden">
                <CardHeader className="bg-slate-850/50 border-b border-slate-800/80 pb-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white">
                        <Smartphone className="h-6 w-6 text-emerald-400" />
                      </div>
                      <div>
                        <CardTitle className="text-xl font-bold text-white">
                          Android Cihazlar için Kurulum
                        </CardTitle>
                        <CardDescription className="text-slate-300 text-sm">
                          Google Chrome, Samsung Internet veya Xiaomi tarayıcısı ile anında ekleyin.
                        </CardDescription>
                      </div>
                    </div>
                    {detectedPlatform === "android" && (
                      <span className="hidden sm:inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        <Check className="h-3.5 w-3.5 text-emerald-400" />
                        Cihazınız
                      </span>
                    )}
                  </div>
                </CardHeader>

                <CardContent className="p-6 space-y-6">
                  {/* Adımlar */}
                  <div className="space-y-4">
                    <InstructionStep
                      stepNumber={1}
                      title="Google Chrome veya Samsung Internet ile açın"
                      description="Android cihazınızda web sayfasının Chrome veya Samsung Internet tarayıcısında açık olduğundan emin olun."
                      badge="Chrome / Samsung"
                    />

                    <InstructionStep
                      stepNumber={2}
                      title="Sağ üstteki Üç Nokta (⋮) menüsüne dokunun"
                      description="Tarayıcınızın sağ üst köşesinde yer alan alt alta üç nokta simgesine dokunarak ayarlar menüsünü açın."
                      badge="Seçenekler Menüsü"
                      icon={<MoreVertical className="h-4 w-4 text-emerald-400" />}
                    />

                    <InstructionStep
                      stepNumber={3}
                      title="'Uygulamayı Yükle' veya 'Ana Ekrana Ekle' seçin"
                      description="Menü listesinde 'Uygulamayı Yükle' (veya bazı cihazlarda 'Ana Ekrana Ekle') seçeneğine dokunun. (Eğer ekranın altında açılır bir bildirim çıkarsa doğrudan oradan da basabilirsiniz)."
                      badge="Uygulamayı Yükle"
                      icon={<Download className="h-4 w-4 text-emerald-400" />}
                    />

                    <InstructionStep
                      stepNumber={4}
                      title="'Yükle' onayına basarak tamamlayın"
                      description="Ekrana gelen onay penceresinde 'Yükle' butonuna basın. Telefonunuz arka planda uygulamayı ana ekranınıza ve uygulama çekmecenize yerleştirecektir."
                      badge="Onayla"
                    />
                  </div>

                  {/* Tamamlandı Özeti */}
                  <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700/60 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                      <Sparkles className="h-5 w-5" />
                    </div>
                    <p className="text-sm text-slate-200">
                      <strong>Kurulum Tamam!</strong> EconNotes telefonunuza yerleşti. Artık tıpkı Play Store'dan indirilmiş gibi bağımsız, hızlı ve kesintisiz çalışır.
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* TAB 3: Bilgisayar (Windows & Mac) */}
            {activeTab === "desktop" && (
              <div className="space-y-6">
                {/* 1. ÖNCELİKLİ WINDOWS KURULUM DOSYASI (.EXE) */}
                <div className="p-[1px] rounded-2xl bg-gradient-to-r from-blue-600/70 via-blue-500/50 to-indigo-600/60 shadow-2xl shadow-blue-500/10">
                  <Card className="bg-slate-900/95 border-0 rounded-2xl overflow-hidden backdrop-blur-md">
                    <CardHeader className="bg-slate-850/60 border-b border-slate-800/80 pb-5">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="p-2.5 rounded-xl bg-blue-600/20 border border-blue-500/40 text-blue-400">
                            <WindowsLogo className="h-6 w-6" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <CardTitle className="text-xl font-bold text-white">
                                Windows Masaüstü Kurulumu (.exe)
                              </CardTitle>
                              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">
                                Önerilen
                              </span>
                            </div>
                            <CardDescription className="text-slate-300 text-sm mt-0.5">
                              Doğrudan kurulum dosyası halinde indirin ve Türkçe kurulum sihirbazı ekranları ile bilgisayarınıza ekleyin.
                            </CardDescription>
                          </div>
                        </div>

                        {detectedPlatform === "desktop" && (
                          <span className="self-start sm:self-auto inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1 rounded-full bg-sky-500/20 text-sky-300 border border-sky-500/30">
                            <Check className="h-3.5 w-3.5 text-sky-400" />
                            Cihazınızla %100 Uyumlu
                          </span>
                        )}
                      </div>
                    </CardHeader>

                    <CardContent className="p-6 space-y-6">
                      {/* İndirme Butonları ve Özellikler */}
                      <div className="flex flex-col gap-4 p-5 rounded-xl bg-slate-950/60 border border-slate-800/90">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
                          <span className="font-semibold text-white">EconNotes Desktop</span>
                          <span className="text-slate-500">•</span>
                          <span className="text-sky-300 font-medium">Sürüm {APP_VERSION}</span>
                          <span className="text-slate-500">•</span>
                          <span>Windows 10 / 11 (64-Bit & 32-Bit)</span>
                          <span className="text-slate-500">•</span>
                          <span className="text-emerald-400 font-semibold">Dijital İmzalı & Hafif</span>
                        </div>
                        <p className="text-xs sm:text-sm text-slate-300 leading-relaxed max-w-2xl">
                          Kurulum sihirbazı; masaüstü ve Başlat menüsü kısayollarını otomatik oluşturur, EconNotes'u tarayıcı sekmelerinden bağımsız hızlı bir masaüstü penceresinde çalıştırır.
                        </p>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                          {/* 1. SEÇENEK: ZIP PAKETİ (UYARISIZ) */}
                          <div className="flex flex-col justify-between p-4 rounded-xl bg-slate-900 border border-emerald-500/30 space-y-3">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-white">Windows ZIP Paketi (.zip)</span>
                                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                  Uyarısız İndirme
                                </span>
                              </div>
                              <p className="text-xs text-slate-400 leading-relaxed">
                                Tarayıcı güvenlik uyarısına takılmaz. İndirip arşivden çıkararak kurulum sihirbazını hemen çalıştırabilirsiniz.
                              </p>
                            </div>
                            <a
                              href="/downloads/EconNotes-Kurulum.zip"
                              download="EconNotes-Kurulum.zip"
                              className="inline-flex items-center justify-center gap-2 w-full px-5 py-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-bold text-xs sm:text-sm shadow-md shadow-emerald-600/30 transition-all"
                            >
                              <Download className="h-4 w-4" />
                              <span>ZIP Olarak İndir (Önerilen)</span>
                            </a>
                          </div>

                          {/* 2. SEÇENEK: DOĞRUDAN SETUP (.EXE) */}
                          <div className="flex flex-col justify-between p-4 rounded-xl bg-slate-900 border border-blue-500/30 space-y-3">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-white">Kurulum Dosyası (.exe)</span>
                                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">
                                  Tek Dosya
                                </span>
                              </div>
                              <p className="text-xs text-slate-400 leading-relaxed">
                                Doğrudan çalıştırılabilir kurulum dosyası. Çift tıklayarak Türkçe kurulum sihirbazı ekranlarını açabilirsiniz.
                              </p>
                            </div>
                            <a
                              href="/downloads/EconNotes-Kurulum.exe"
                              download="EconNotes-Kurulum.exe"
                              className="inline-flex items-center justify-center gap-2 w-full px-5 py-3 rounded-lg bg-blue-600 hover:bg-blue-500 active:scale-95 text-white font-bold text-xs sm:text-sm shadow-md shadow-blue-600/30 transition-all"
                            >
                              <Download className="h-4 w-4" />
                              <span>Kurulum Dosyasını İndir (.exe)</span>
                            </a>
                          </div>
                        </div>
                      </div>

                      {/* 2. ADIM ADIM KURULUM SİHİRBAZI EKRANLARI */}
                      <div className="space-y-4 pt-1">
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                            <AppWindow className="h-4 w-4 text-sky-400" />
                            Kurulum Sihirbazı Ekranları (Nasıl Kurulur?)
                          </h3>
                          <span className="text-xs text-slate-400">4 Hızlı Ekran</span>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                          {/* 1. Ekran: Karşılama */}
                          <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4 space-y-3">
                            <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                              <span className="text-xs font-bold text-sky-400">1. Ekran: Karşılama ve Hoş Geldiniz</span>
                              <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300">Sihirbaz Başlangıcı</span>
                            </div>
                            <div className="rounded-lg bg-slate-900 border border-slate-800 p-3 text-xs space-y-2 text-slate-300 shadow-inner">
                              <div className="flex items-center gap-2 font-bold text-white">
                                <img src="/icons/icon-192x192.png" className="h-5 w-5 rounded-md shadow-xs shrink-0" alt="EconNotes Logo" />
                                <EconLogo className="h-4 w-auto" />
                              </div>
                              <p className="text-[11px] text-slate-400 leading-relaxed">
                                "EconNotes İktisat ve Akademik Not Platformu bilgisayarınıza kurulacaktır. Kuruluma devam etmek için İleri butonuna tıklayın."
                              </p>
                              <div className="pt-1 flex justify-end">
                                <span className="px-2.5 py-1 rounded bg-blue-600 text-white font-semibold text-[10px]">İleri &gt;</span>
                              </div>
                            </div>
                            <p className="text-xs text-slate-300">
                              İndirilen <strong>EconNotes-Kurulum.exe</strong> dosyasını çift tıklayın ve hoş geldiniz ekranında <strong>İleri</strong> butonuna basın.
                            </p>
                          </div>

                          {/* 2. Ekran: Hedef Dizin & Kısayollar */}
                          <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4 space-y-3">
                            <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                              <span className="text-xs font-bold text-sky-400">2. Ekran: Kurulum Konumu & Kısayollar</span>
                              <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300">Tercihler</span>
                            </div>
                            <div className="rounded-lg bg-slate-900 border border-slate-800 p-3 text-xs space-y-2 text-slate-300 shadow-inner">
                              <div className="flex items-center justify-between text-[11px] text-slate-400">
                                <span>Hedef:</span>
                                <span className="text-[10px] text-slate-500 font-mono">AppData\Programs\EconNotes</span>
                              </div>
                              <div className="space-y-1 text-[11px]">
                                <div className="flex items-center gap-1.5 text-emerald-400">
                                  <Check className="h-3 w-3" />
                                  <span className="text-slate-200">Masaüstüne EconNotes kısayolu ekle</span>
                                </div>
                                <div className="flex items-center gap-1.5 text-emerald-400">
                                  <Check className="h-3 w-3" />
                                  <span className="text-slate-200">Başlat Menüsü'ne EconNotes ekle</span>
                                </div>
                              </div>
                              <div className="pt-1 flex justify-end gap-1.5">
                                <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-400 text-[10px]">&lt; Geri</span>
                                <span className="px-2.5 py-1 rounded bg-blue-600 text-white font-semibold text-[10px]">Kur &gt;</span>
                              </div>
                            </div>
                            <p className="text-xs text-slate-300">
                              Masaüstü ve Başlat menüsü kısayol onayları varsayılan olarak seçilidir. Doğrudan <strong>Kur</strong> butonuna basabilirsiniz.
                            </p>
                          </div>

                          {/* 3. Ekran: İlerleme */}
                          <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4 space-y-3">
                            <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                              <span className="text-xs font-bold text-sky-400">3. Ekran: Dosyaların Yüklenmesi</span>
                              <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300">Yükleniyor</span>
                            </div>
                            <div className="rounded-lg bg-slate-900 border border-slate-800 p-3 text-xs space-y-2.5 text-slate-300 shadow-inner">
                              <span className="text-[11px] text-slate-300">EconNotes masaüstü istemcisi yükleniyor...</span>
                              <div className="w-full bg-slate-800 rounded-full h-2.5 overflow-hidden">
                                <div className="bg-gradient-to-r from-blue-500 to-emerald-400 h-2.5 rounded-full w-full" />
                              </div>
                              <div className="flex justify-between text-[10px] text-slate-400">
                                <span>Kısayollar ve simgeler hazırlandı</span>
                                <span className="text-emerald-400 font-semibold">%100</span>
                              </div>
                            </div>
                            <p className="text-xs text-slate-300">
                              Kurulum 2-3 saniye içinde tamamlanır; sisteminize ayrı kaldırma aracı (Uninstall) ve masaüstü simgeleri yerleştirilir.
                            </p>
                          </div>

                          {/* 4. Ekran: Tamamlandı */}
                          <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4 space-y-3">
                            <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                              <span className="text-xs font-bold text-emerald-400">4. Ekran: Kurulum Tamamlandı</span>
                              <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300">Tamamlandı</span>
                            </div>
                            <div className="rounded-lg bg-slate-900 border border-slate-800 p-3 text-xs space-y-2 text-slate-300 shadow-inner">
                              <div className="flex items-center gap-2 font-bold text-emerald-400">
                                <img src="/icons/icon-192x192.png" className="h-5 w-5 rounded-md shadow-xs shrink-0" alt="EconNotes Logo" />
                                <span>Kurulum Başarıyla Tamamlandı!</span>
                              </div>
                              <div className="flex items-center gap-1.5 text-[11px] text-sky-300">
                                <Check className="h-3 w-3 text-emerald-400" />
                                <span>EconNotes uygulamasını şimdi başlat</span>
                              </div>
                              <div className="pt-1 flex justify-end">
                                <span className="px-3 py-1 rounded bg-emerald-600 text-white font-semibold text-[10px]">Bitir</span>
                              </div>
                            </div>
                            <p className="text-xs text-slate-300">
                              <strong>Bitir</strong> butonuna tıkladığınızda uygulama bağımsız pencerede anında açılır ve hemen çalışmaya başlayabilirsiniz.
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* 3. İNDİRME VE DEFENDER GÜVENLİK REHBERİ */}
                      <div className="space-y-3 pt-1">
                        {/* Edge / Chrome Uyarısı Çözümü */}
                        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-3.5 text-xs sm:text-sm text-amber-200">
                          <Info className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
                          <div className="space-y-2">
                            <span className="font-semibold text-white">
                              Edge veya Chrome'da "Yaygın olarak indirilen bir dosya değil" Uyarısı Çıkarsa:
                            </span>
                            <p className="text-amber-200/90 text-xs leading-relaxed">
                              Microsoft Edge ve Chrome, yeni yayımlanan bağımsız kurulum dosyalarında bu güvenlik uyarısını gösterir. Dosyayı 2 saniyede açmak için:
                            </p>
                            <ol className="list-decimal list-inside space-y-1 text-xs text-amber-100 font-medium">
                              <li>İndirilen dosya satırının üzerine gelip sağdaki <strong>üç nokta (···)</strong> simgesine tıklayın.</li>
                              <li>Menüden <strong>"Sakla" (Keep)</strong> seçeneğini seçin.</li>
                              <li>Açılan pencerede <strong>"Daha fazla göster" ➔ "Yine de sakla"</strong> butonuna basın.</li>
                            </ol>
                            <p className="text-[11px] text-amber-300">
                              💡 <em>İpucu: Bu adımlarla karşılaşmak istemiyorsanız yukarıdaki yeşil <strong>"Windows ZIP Paketi (.zip)"</strong> butonunu kullanabilirsiniz; ZIP dosyaları hiçbir güvenlik uyarısına takılmadan doğrudan iner.</em>
                            </p>
                          </div>
                        </div>

                        {/* Windows SmartScreen Mavi Ekran Çözümü */}
                        <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 flex items-start gap-3.5 text-xs sm:text-sm text-slate-300">
                          <ShieldCheck className="h-5 w-5 text-sky-400 shrink-0 mt-0.5" />
                          <div className="space-y-1">
                            <span className="font-semibold text-white">Windows "Kişisel bilgisayarınızı korudu" Mavi Ekranı Görürseniz:</span>
                            <p className="text-slate-300 text-xs leading-relaxed">
                              Dosyayı açtığınızda Windows SmartScreen mavi ekranı belirirse: Ekrandaki <strong>"Ek Bilgi"</strong> (More info) linkine tıklayıp açılan <strong>"Yine de Çalıştır"</strong> (Run anyway) butonuna basmanız yeterlidir. Kurulum sihirbazı güvenle açılacaktır.
                            </p>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* 2. ALTERNATİF: TARAYICIDAN KURULUM (MAC & PWA) */}
                <Card className="bg-slate-900/80 border border-slate-800/80 shadow-md overflow-hidden">
                  <CardHeader className="bg-slate-850/40 border-b border-slate-800/80 pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-300">
                          <Monitor className="h-5 w-5 text-slate-300" />
                        </div>
                        <div>
                          <CardTitle className="text-base font-semibold text-white">
                            Alternatif Yöntem: Tarayıcı Üzerinden Ekleme (Mac & Tarayıcı Modu)
                          </CardTitle>
                          <CardDescription className="text-slate-400 text-xs">
                            Kurulum dosyası indirmeden Google Chrome veya Microsoft Edge adres çubuğundaki yükleme simgesiyle ekleyin.
                          </CardDescription>
                        </div>
                      </div>
                      <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-slate-800 text-slate-400">
                        Mac / Web
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent className="p-5 space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div className="p-3 rounded-lg bg-slate-950/40 border border-slate-800/70 space-y-1">
                        <span className="font-semibold text-white">1. Adres Çubuğundaki Simge:</span>
                        <p className="text-slate-300">Tarayıcı adres çubuğunun sağındaki bilgisayar veya aşağı ok simgesine tıklayın.</p>
                      </div>
                      <div className="p-3 rounded-lg bg-slate-950/40 border border-slate-800/70 space-y-1">
                        <span className="font-semibold text-white">2. Onayla ve Yükle:</span>
                        <p className="text-slate-300">"EconNotes uygulaması yüklensin mi?" sorusuna "Yükle" diyerek masaüstünüze ekleyin.</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Neden Uygulama Olarak Yüklemelisiniz? - Avantajlar Kartı */}
            <div className="pt-2">
              <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-blue-400" />
                Neden Uygulama Olarak Yüklemelisiniz?
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <BenefitCard
                  icon={<Zap className="h-5 w-5 text-amber-400" />}
                  title="Tek Dokunuşla Hızlı Erişim"
                  description="Her seferinde tarayıcıyı açıp arama yapmanıza gerek kalmaz; ana ekranınızdan tek tıkla doğrudan notlarınıza ulaşırsınız."
                />

                <BenefitCard
                  icon={<Sparkles className="h-5 w-5 text-sky-400" />}
                  title="Tam Ekran Çalışma Modu"
                  description="Tarayıcı sekmeleri, butonlar ve adres çubukları kaybolur. Dikkatiniz dağılmadan tam odaklanmış şekilde çalışırsınız."
                />

                <BenefitCard
                  icon={<ShieldCheck className="h-5 w-5 text-emerald-400" />}
                  title="Cihazda Sıfır Hafıza Yükü"
                  description="Telefonunuzun hafızasını şişirmez (~1 MB'tan az yer kaplar). Ağır dosya indirmeleri olmadan hafif ve hızlı çalışır."
                />

                <BenefitCard
                  icon={<CheckCircle2 className="h-5 w-5 text-blue-400" />}
                  title="Her Zaman En Güncel Sürüm"
                  description="Uygulama mağazalarından manuel güncelleme beklemezsiniz. Yeni özellikler ve notlar otomatik olarak sisteminize yansır."
                />
              </div>
            </div>
          </>
        )}

        {/* Alt Butonlar */}
        <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-4 text-center">
          <Button
            variant="outline"
            onClick={() => navigate("/login")}
            className="w-full sm:w-auto border-slate-700 bg-slate-900/60 hover:bg-slate-800 text-slate-200"
          >
            Giriş Sayfasına Dön
          </Button>
          <Button
            variant="ghost"
            onClick={() => navigate("/")}
            className="w-full sm:w-auto text-slate-400 hover:text-white hover:bg-slate-800/50"
          >
            Ana Sayfaya Git
            <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Alt Bilgi */}
      <footer className="w-full max-w-3xl mx-auto text-center pt-10 text-xs text-slate-500">
        EconNotes Akademik Not Paylaşım ve Çalışma Platformu
      </footer>
    </div>
  );
};

// Adım Adım Açıklama Bileşeni
interface InstructionStepProps {
  stepNumber: number;
  title: string;
  description: string;
  badge?: string;
  icon?: React.ReactNode;
}

const InstructionStep = ({ stepNumber, title, description, badge, icon }: InstructionStepProps) => {
  return (
    <div className="flex items-start gap-4 p-4 rounded-xl bg-slate-950/40 border border-slate-800/80 hover:border-slate-700 transition-colors">
      <div className="w-8 h-8 rounded-full bg-blue-600/20 border border-blue-500/40 text-blue-400 flex items-center justify-center font-bold text-sm shrink-0 shadow-sm">
        {stepNumber}
      </div>
      <div className="space-y-1 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="font-semibold text-slate-100 text-sm sm:text-base leading-snug">
            {title}
          </h4>
          {badge && (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md bg-slate-800 border border-slate-700 text-slate-300">
              {icon}
              {badge}
            </span>
          )}
        </div>
        <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
          {description}
        </p>
      </div>
    </div>
  );
};

// Avantaj Kartı Bileşeni
const BenefitCard = ({
  icon,
  title,
  description
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) => {
  return (
    <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 flex items-start gap-3 hover:border-slate-700/80 transition-colors">
      <div className="p-2 rounded-lg bg-slate-800 border border-slate-700 shrink-0">
        {icon}
      </div>
      <div className="space-y-1">
        <h4 className="text-sm font-semibold text-white">{title}</h4>
        <p className="text-xs text-slate-300 leading-relaxed">{description}</p>
      </div>
    </div>
  );
};

export default Install;
