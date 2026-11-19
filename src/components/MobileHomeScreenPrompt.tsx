import { useEffect, useState, useCallback, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Download,
  Smartphone,
  Share,
  PlusSquare,
  MoreVertical,
  X,
  CheckCircle2,
  ExternalLink,
  BellRing,
  Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import {
  BeforeInstallPromptEvent,
  dismissMobilePrompt,
  hasAttemptedAutoInstallInSession,
  isAndroidDevice,
  isInAppBrowser,
  isIOSDevice,
  isIOSSafari,
  isMobileDevice,
  isMobilePromptDismissed,
  isPwaMarkedInstalled,
  isStandalonePwa,
  markAutoInstallAttemptedInSession,
  setMobileInstallPromptVisible,
  subscribeToInstallPrompt,
  triggerNativePwaInstall,
} from '@/lib/pwaInstall';

interface MobileHomeScreenPromptProps {
  splashActive?: boolean;
}

const MobileHomeScreenPrompt = ({ splashActive = false }: MobileHomeScreenPromptProps) => {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState<boolean>(() => isPwaMarkedInstalled());
  const [dismissed, setDismissed] = useState<boolean>(() => isMobilePromptDismissed());
  const [visible, setVisible] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [showSteps, setShowSteps] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const autoAttemptedRef = useRef(false);
  const cardRef = useRef<HTMLElement | null>(null);

  const isMobile = isMobileDevice();
  const isIOS = isIOSDevice();
  const isAndroid = isAndroidDevice();
  const inApp = isInAppBrowser();
  const iosNonSafari = isIOS && !isIOSSafari();

  // Listen for PWA beforeinstallprompt and appinstalled events
  useEffect(() => {
    return subscribeToInstallPrompt((prompt, standalone) => {
      setDeferredPrompt(prompt);
      if (standalone || isPwaMarkedInstalled()) {
        setIsInstalled(true);
      }
    });
  }, []);

  // Hide while mobile sidebar drawer is open
  useEffect(() => {
    const handleSidebarState = (e: Event) => {
      const customEvent = e as CustomEvent<{ open: boolean }>;
      if (customEvent.detail && typeof customEvent.detail.open === 'boolean') {
        setIsSidebarOpen(customEvent.detail.open);
      }
    };
    window.addEventListener('econnotes:sidebar-state', handleSidebarState as EventListener);
    return () => window.removeEventListener('econnotes:sidebar-state', handleSidebarState as EventListener);
  }, []);

  const shouldSuppress =
    !isMobile ||
    isInstalled ||
    isStandalonePwa() ||
    dismissed ||
    splashActive ||
    isSidebarOpen ||
    location.pathname === '/install' ||
    location.pathname === '/welcome';

  // Delay appearance slightly after page hydration so it feels smooth
  useEffect(() => {
    if (shouldSuppress) {
      setVisible(false);
      return;
    }

    const timer = window.setTimeout(() => {
      setVisible(true);
    }, 900);

    return () => window.clearTimeout(timer);
  }, [shouldSuppress]);

  // Broadcast visibility state so DeviceNotificationBanner avoids overlapping
  useEffect(() => {
    setMobileInstallPromptVisible(visible);
    return () => setMobileInstallPromptVisible(false);
  }, [visible]);

  const handleDismiss = useCallback((e?: React.MouseEvent) => {
    e?.stopPropagation();
    dismissMobilePrompt(24);
    setDismissed(true);
    setVisible(false);
  }, []);

  const handleAutoInstall = useCallback(async () => {
    if (installing) return;

    if (!deferredPrompt) {
      setShowSteps(true);
      return;
    }

    setInstalling(true);
    markAutoInstallAttemptedInSession();
    try {
      const outcome = await triggerNativePwaInstall();
      if (outcome === 'accepted') {
        setIsInstalled(true);
        setVisible(false);
        toast.success('EconNotes ana ekranınıza başarıyla yüklendi!', {
          description: 'Artık uygulamayı doğrudan telefonunuzun ana ekranından açabilirsiniz.',
          duration: 6000,
        });
      } else if (outcome === 'dismissed') {
        setDeferredPrompt(null);
        toast.info('Kurulumu daha sonra tarayıcı menüsünden veya Kurulum sayfasından tamamlayabilirsiniz.');
      } else if (outcome === 'unavailable') {
        setShowSteps(true);
      }
    } finally {
      setInstalling(false);
    }
  }, [deferredPrompt, installing]);

  // Automatic one-shot native install prompt on first user touch/click on supported Android/Chromium browsers.
  // Browsers forbid silent installation without a user gesture; arming the first interaction lets the
  // native OS "Install EconNotes to Home Screen" sheet pop up automatically without extra navigation.
  useEffect(() => {
    if (!visible || !deferredPrompt || isIOS || isInstalled || dismissed) return;
    if (autoAttemptedRef.current || hasAttemptedAutoInstallInSession()) return;

    const triggerOnFirstGesture = (ev: Event) => {
      if (!ev.isTrusted) return;
      // Ignore taps on the dismiss or explicit install button inside our card
      const target = ev.target as HTMLElement | null;
      if (target?.closest?.('[data-pwa-dismiss="true"]')) {
        window.removeEventListener('click', triggerOnFirstGesture, { capture: true });
        return;
      }
      if (target?.closest?.('[data-pwa-install-btn="true"]')) {
        window.removeEventListener('click', triggerOnFirstGesture, { capture: true });
        return;
      }

      if (autoAttemptedRef.current || hasAttemptedAutoInstallInSession()) {
        window.removeEventListener('click', triggerOnFirstGesture, { capture: true });
        return;
      }

      window.removeEventListener('click', triggerOnFirstGesture, { capture: true });
      autoAttemptedRef.current = true;
      markAutoInstallAttemptedInSession();

      void triggerNativePwaInstall().then((outcome) => {
        if (outcome === 'accepted') {
          setIsInstalled(true);
          setVisible(false);
          toast.success('EconNotes ana ekranınıza başarıyla yüklendi!', {
            description: 'Ana ekranınızdaki EconNotes simgesinden tek dokunuşla giriş yapabilirsiniz.',
            duration: 6000,
          });
        } else if (outcome === 'dismissed') {
          setDeferredPrompt(null);
        } else if (outcome === 'gesture-required') {
          // Gesture was not considered activating; allow the explicit install button to handle it
          autoAttemptedRef.current = false;
        }
      });
    };

    window.addEventListener('click', triggerOnFirstGesture, { capture: true });
    return () => {
      window.removeEventListener('click', triggerOnFirstGesture, { capture: true });
    };
  }, [visible, deferredPrompt, isIOS, isInstalled, dismissed]);

  if (!visible) return null;

  const isAuthShellRoute =
    Boolean(user) &&
    !['/login', '/register', '/forgot-password', '/reset-password', '/install', '/welcome'].includes(
      location.pathname,
    );

  const bottomOffset = isAuthShellRoute
    ? 'calc(env(safe-area-inset-bottom, 0px) + 5.25rem)'
    : 'calc(env(safe-area-inset-bottom, 0px) + 1rem)';

  const canOneTapInstall = Boolean(deferredPrompt) && !isIOS;

  return (
    <aside
      ref={cardRef}
      role="dialog"
      aria-label="EconNotes Uygulamasını Ana Ekrana Ekle"
      style={{ bottom: bottomOffset }}
      className="fixed inset-x-3 z-[75] mx-auto max-w-md md:hidden pointer-events-auto animate-in slide-in-from-bottom-4 fade-in duration-300"
    >
      <div className="relative overflow-hidden rounded-2xl border border-primary/35 bg-card/95 dark:bg-[#0b1528]/95 p-4 shadow-[0_18px_45px_rgba(0,18,56,0.32)] backdrop-blur-2xl">
        {/* Top subtle glow accent */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-6 top-0 h-[1.5px] bg-gradient-to-r from-transparent via-primary/80 to-transparent"
        />

        {/* Header Row */}
        <div className="flex items-start gap-3">
          <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 shadow-inner overflow-hidden">
            <img
              src="/icons/icon-192x192.png"
              alt="EconNotes"
              className="h-9 w-9 rounded-lg object-cover"
            />
          </div>

          <div className="min-w-0 flex-1 pr-5">
            <div className="flex items-center gap-1.5">
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold text-primary">
                <Sparkles className="h-2.5 w-2.5" />
                Mobil Uygulama
              </span>
            </div>
            <h3 className="mt-1 text-sm font-bold leading-snug text-foreground">
              EconNotes&apos;u Ana Ekranınıza Taşıyın
            </h3>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              {canOneTapInstall
                ? 'Tek dokunuşla ana ekranınıza otomatik olarak yükleyin; tam ekran hızına ve anlık duyuru bildirimlerine kavuşun.'
                : isIOS
                  ? 'EconNotes\'u ana ekranınıza ekleyerek tam ekran uygulama deneyimi ve iPhone duyuru bildirimlerini aktif edin.'
                  : 'Web uygulamasını ana ekranınıza taşıyarak her seferinde tarayıcı açmadan tek dokunuşla notlarınıza ulaşın.'}
            </p>
          </div>

          <button
            type="button"
            data-pwa-dismiss="true"
            onClick={handleDismiss}
            aria-label="Kapat"
            className="absolute right-2.5 top-2.5 flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Highlights Pill Row */}
        <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-background/70 px-2.5 py-0.5">
            <CheckCircle2 className="h-3 w-3 text-emerald-500" />
            Tam ekran deneyim
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-background/70 px-2.5 py-0.5">
            <BellRing className="h-3 w-3 text-primary" />
            Anlık duyuru bildirimleri
          </span>
        </div>

        {/* Inline Step-by-Step Instructions (iOS or manual Android fallback) */}
        {(isIOS || showSteps) && (
          <div className="mt-3 space-y-2 rounded-xl border border-border/70 bg-background/75 p-3 text-xs">
            {iosNonSafari && (
              <div className="rounded-lg border border-amber-500/35 bg-amber-500/10 px-2.5 py-2 text-[11px] font-medium text-amber-700 dark:text-amber-300">
                iOS&apos;ta ana ekrana eklemek için bu sayfayı <strong>Safari</strong> tarayıcısında açmanız gerekir.
              </div>
            )}
            {!isIOS && inApp && (
              <div className="rounded-lg border border-amber-500/35 bg-amber-500/10 px-2.5 py-2 text-[11px] font-medium text-amber-700 dark:text-amber-300">
                Şu an uygulama içi tarayıcıdasınız. Otomatik kurulum için sağ üst menüden{' '}
                <strong>&quot;Chrome&apos;da Aç&quot;</strong> seçeneğini seçin.
              </div>
            )}

            {isIOS ? (
              <ol className="space-y-1.5 text-[11.5px] text-foreground/90">
                <li className="flex items-center gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">
                    1
                  </span>
                  <span className="flex items-center gap-1 flex-wrap">
                    Alt bardaki <Share className="inline h-3.5 w-3.5 text-primary" />{' '}
                    <strong>Paylaş</strong> simgesine dokunun.
                  </span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">
                    2
                  </span>
                  <span className="flex items-center gap-1 flex-wrap">
                    <PlusSquare className="inline h-3.5 w-3.5 text-primary" />{' '}
                    <strong>Ana Ekrana Ekle</strong> seçeneğine dokunun.
                  </span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">
                    3
                  </span>
                  <span>
                    Sağ üstten <strong>Ekle</strong> butonuna basıp tamamlayın.
                  </span>
                </li>
              </ol>
            ) : (
              <ol className="space-y-1.5 text-[11.5px] text-foreground/90">
                <li className="flex items-center gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">
                    1
                  </span>
                  <span className="flex items-center gap-1 flex-wrap">
                    Sağ üstteki <MoreVertical className="inline h-3.5 w-3.5 text-primary" />{' '}
                    <strong>Menü</strong> simgesine dokunun.
                  </span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">
                    2
                  </span>
                  <span>
                    <strong>&quot;Uygulamayı yükle&quot;</strong> veya{' '}
                    <strong>&quot;Ana ekrana ekle&quot;</strong> seçeneğine dokunun.
                  </span>
                </li>
              </ol>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div className="mt-3.5 flex items-center gap-2">
          {canOneTapInstall ? (
            <button
              type="button"
              data-pwa-install-btn="true"
              disabled={installing}
              onClick={() => void handleAutoInstall()}
              className="flex-1 inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#00439c] via-[#0070d1] to-[#0099ff] px-4 text-xs font-bold text-white shadow-md shadow-primary/30 transition-all active:scale-[0.98] disabled:opacity-60"
            >
              <Download className="h-4 w-4" />
              <span>{installing ? 'Yükleniyor...' : 'Ana Ekrana Otomatik Yükle'}</span>
            </button>
          ) : isAndroid && !showSteps ? (
            <button
              type="button"
              data-pwa-install-btn="true"
              onClick={() => setShowSteps(true)}
              className="flex-1 inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#00439c] via-[#0070d1] to-[#0099ff] px-4 text-xs font-bold text-white shadow-md shadow-primary/30 transition-all active:scale-[0.98]"
            >
              <Smartphone className="h-4 w-4" />
              <span>Ana Ekrana Nasıl Eklenir?</span>
            </button>
          ) : (
            <button
              type="button"
              data-pwa-install-btn="true"
              onClick={() => {
                setVisible(false);
                navigate('/install');
              }}
              className="flex-1 inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-[#00439c] via-[#0070d1] to-[#0099ff] px-4 text-xs font-bold text-white shadow-md shadow-primary/30 transition-all active:scale-[0.98]"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              <span>Detaylı Kurulum Rehberi</span>
            </button>
          )}

          <button
            type="button"
            data-pwa-dismiss="true"
            onClick={handleDismiss}
            className="h-10 rounded-xl border border-border/70 bg-background/70 px-3.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground"
          >
            Sonra
          </button>
        </div>
      </div>
    </aside>
  );
};

export default MobileHomeScreenPrompt;
