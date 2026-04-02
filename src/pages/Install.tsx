import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Download, Smartphone, Monitor, Apple, ChevronDown, ChevronUp, CheckCircle2 } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const Install = () => {
  const navigate = useNavigate();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [showIosGuide, setShowIosGuide] = useState(false);
  const [showAndroidGuide, setShowAndroidGuide] = useState(false);

  useEffect(() => {
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

  const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const isAndroid = /Android/.test(navigator.userAgent);

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-lg space-y-6">
        <div className="text-center space-y-2">
          <img
            src="/lovable-uploads/a5765ea4-3377-40fa-9db1-09e12e58860c.png"
            alt="EconNotes Logo"
            className="h-16 mx-auto"
            style={{ filter: "var(--logo-filter)" }}
          />
          <h1 className="text-2xl font-bold text-foreground">EconNotes Uygulamasını İndir</h1>
          <p className="text-muted-foreground">
            EconNotes'u telefonuna veya bilgisayarına kurarak hızlı erişim sağla.
          </p>
        </div>

        {isInstalled ? (
          <Card>
            <CardContent className="flex flex-col items-center py-8 space-y-3">
              <CheckCircle2 className="h-12 w-12 text-green-500" />
              <p className="text-lg font-semibold text-foreground">Uygulama Zaten Kurulu!</p>
              <p className="text-sm text-muted-foreground text-center">
                EconNotes uygulaması cihazınıza kurulmuş durumda.
              </p>
              <Button onClick={() => navigate("/")} className="mt-2">
                Panele Dön
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Direct install button for supported browsers */}
            {deferredPrompt && (
              <Card className="border-primary">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Download className="h-5 w-5 text-primary" />
                    Hızlı Kurulum
                  </CardTitle>
                  <CardDescription>Tek tıkla cihazına kur</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button onClick={handleInstall} className="w-full" size="lg">
                    <Download className="mr-2 h-5 w-5" />
                    Uygulamayı Kur
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* iOS Guide */}
            <Card>
              <CardHeader
                className="cursor-pointer pb-3"
                onClick={() => setShowIosGuide(!showIosGuide)}
              >
                <CardTitle className="flex items-center justify-between text-lg">
                  <span className="flex items-center gap-2">
                    <Apple className="h-5 w-5" />
                    iPhone / iPad Kurulumu
                  </span>
                  {showIosGuide ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </CardTitle>
                {isIos && (
                  <CardDescription className="text-primary font-medium">
                    Bu cihaz için önerilen yöntem
                  </CardDescription>
                )}
              </CardHeader>
              {showIosGuide && (
                <CardContent className="space-y-3 pt-0">
                  <div className="space-y-2">
                    <Step number={1} text="Safari tarayıcısında bu sayfayı açın" />
                    <Step number={2} text='Alt kısımdaki "Paylaş" (Share) butonuna dokunun' />
                    <Step number={3} text='"Ana Ekrana Ekle" (Add to Home Screen) seçeneğini bulun' />
                    <Step number={4} text='"Ekle" butonuna dokunarak kurulumu tamamlayın' />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Not: iOS'ta yalnızca Safari tarayıcısı üzerinden kurulum yapılabilir.
                  </p>
                </CardContent>
              )}
            </Card>

            {/* Android Guide */}
            <Card>
              <CardHeader
                className="cursor-pointer pb-3"
                onClick={() => setShowAndroidGuide(!showAndroidGuide)}
              >
                <CardTitle className="flex items-center justify-between text-lg">
                  <span className="flex items-center gap-2">
                    <Smartphone className="h-5 w-5" />
                    Android Kurulumu
                  </span>
                  {showAndroidGuide ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </CardTitle>
                {isAndroid && (
                  <CardDescription className="text-primary font-medium">
                    Bu cihaz için önerilen yöntem
                  </CardDescription>
                )}
              </CardHeader>
              {showAndroidGuide && (
                <CardContent className="space-y-3 pt-0">
                  <div className="space-y-2">
                    <Step number={1} text="Chrome tarayıcısında bu sayfayı açın" />
                    <Step number={2} text="Sağ üst köşedeki üç nokta menüsüne dokunun" />
                    <Step number={3} text='"Uygulamayı yükle" veya "Ana ekrana ekle" seçeneğine dokunun' />
                    <Step number={4} text='"Yükle" butonuna dokunarak kurulumu tamamlayın' />
                  </div>
                </CardContent>
              )}
            </Card>

            {/* Desktop Guide */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Monitor className="h-5 w-5" />
                  Bilgisayar Kurulumu
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Chrome veya Edge tarayıcısında adres çubuğundaki kurulum simgesine tıklayarak
                  uygulamayı bilgisayarınıza kurabilirsiniz.
                </p>
              </CardContent>
            </Card>
          </>
        )}

        <div className="text-center">
          <Button variant="ghost" onClick={() => navigate("/login")}>
            Giriş sayfasına dön
          </Button>
        </div>
      </div>
    </div>
  );
};

const Step = ({ number, text }: { number: number; text: string }) => (
  <div className="flex items-start gap-3">
    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">
      {number}
    </span>
    <p className="text-sm text-foreground">{text}</p>
  </div>
);

export default Install;
