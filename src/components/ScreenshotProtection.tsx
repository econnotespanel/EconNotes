import React, { useEffect, useState, useCallback } from 'react';
import { ShieldAlert, Lock, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import EconLogo from '@/components/EconLogo';

interface ScreenshotProtectionProps {
  /** Whether the note preview modal is currently open */
  isPreviewOpen?: boolean;
  /** Viewer's display name for the security notice */
  viewerName?: string;
  children: React.ReactNode;
}

const SHIELD_BODY_CLASS = 'econnotes-ss-shield-active';

/**
 * EconNotes Notlar & Önizleme Ekran Görüntüsü (SS) ve Ekran Yakalama Engelleyici Kalkanı
 * - Senkron DOM sınıfı (`econnotes-ss-shield-active`) ile 0ms gecikmeyle anında karartma uygular.
 * - PC: PrintScreen, Win+Shift+S (Ekran Alıntısı Aracı), Alt+PrintScreen, Ctrl+P, Ctrl+S, Ctrl+Shift+S
 * - Mac: Cmd+Shift+3, Cmd+Shift+4, Cmd+Shift+5, Cmd+P, Cmd+S
 * - Mobil & Masaüstü: Sağ tık / Uzun basma ile görsel kaydetme, sürükle-bırak, 3 parmak ekran görüntüsü,
 *   pencere odağı kaybı (Snipping Tool / Kontrol Merkezi / Uygulama Değiştirici açıldığında anında karartma).
 */
export const ScreenshotProtection: React.FC<ScreenshotProtectionProps> = ({
  isPreviewOpen = false,
  viewerName,
  children,
}) => {
  const [shieldReason, setShieldReason] = useState<'screenshot' | 'focus_lost' | null>(null);

  const activateSyncDomShield = useCallback(() => {
    if (typeof document !== 'undefined') {
      document.body.classList.add(SHIELD_BODY_CLASS);
    }
  }, []);

  const deactivateSyncDomShield = useCallback(() => {
    if (typeof document !== 'undefined') {
      document.body.classList.remove(SHIELD_BODY_CLASS);
    }
  }, []);

  const clearClipboard = useCallback(() => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        void navigator.clipboard.writeText(
          'EconNotes Güvenlik Koruması: Notlar bölümünde ekran görüntüsü alınmasına izin verilmemektedir.',
        );
      }
    } catch {
      // Clipboard API izin vermezse sessizce geç
    }
  }, []);

  const triggerScreenshotBlock = useCallback(
    (sourceLabel?: string) => {
      activateSyncDomShield();
      setShieldReason('screenshot');
      clearClipboard();
      toast.error('Ekran Görüntüsü Engellendi!', {
        description:
          sourceLabel ||
          'EconNotes güvenlik politikası gereği ders notlarının ekran görüntüsü alınmasına izin verilmemektedir.',
        duration: 4500,
      });
    },
    [activateSyncDomShield, clearClipboard],
  );

  const dismissShield = useCallback(() => {
    deactivateSyncDomShield();
    setShieldReason(null);
  }, [deactivateSyncDomShield]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key || '';
      const code = e.code || '';

      // 1. PrintScreen tuşu
      if (key === 'PrintScreen' || code === 'PrintScreen' || e.keyCode === 44) {
        activateSyncDomShield();
        e.preventDefault();
        e.stopPropagation();
        triggerScreenshotBlock();
        return;
      }

      // 2. Windows Snipping Tool (Win + Shift + S) veya macOS Screenshot (Cmd + Shift + 3/4/5/6/S)
      if (
        (e.metaKey && e.shiftKey) ||
        (e.ctrlKey && e.shiftKey && ['s', 'S', '3', '4', '5'].includes(key))
      ) {
        activateSyncDomShield();
        e.preventDefault();
        e.stopPropagation();
        triggerScreenshotBlock(
          'Ekran alıntısı kısayolu algılandı. EconNotes üzerinde ekran görüntüsü alınmasına izin verilmemektedir.',
        );
        return;
      }

      // 3. Windows / Command tuşuna basıldığı anda önizleme açıksa önleyici koruma kalkanını 0ms'de devreye sok
      if (isPreviewOpen && (key === 'Meta' || key === 'OS')) {
        activateSyncDomShield();
        setShieldReason('focus_lost');
        return;
      }

      // 4. Yazdırma (Ctrl/Cmd + P) veya Sayfayı Kaydetme (Ctrl/Cmd + S) engelleme
      if ((e.ctrlKey || e.metaKey) && ['p', 'P', 's', 'S'].includes(key)) {
        activateSyncDomShield();
        e.preventDefault();
        e.stopPropagation();
        triggerScreenshotBlock(
          'Notların yazdırılmasına veya ekran görüntüsü olarak kaydedilmesine izin verilmemektedir.',
        );
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const key = e.key || '';
      const code = e.code || '';
      if (key === 'PrintScreen' || code === 'PrintScreen' || e.keyCode === 44) {
        activateSyncDomShield();
        e.preventDefault();
        e.stopPropagation();
        triggerScreenshotBlock();
      }
    };

    // Pencere odağı kaybolduğunda (Snipping Tool, Lightshot, iOS Kontrol Merkezi / App Switcher açıldığında)
    const handleWindowBlur = () => {
      activateSyncDomShield();
      setShieldReason((prev) => prev || 'focus_lost');
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        activateSyncDomShield();
        setShieldReason((prev) => prev || 'focus_lost');
      }
    };

    // Mobilde 3 parmakla ekran görüntüsü alma hareketini yakala
    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches && e.touches.length >= 3) {
        activateSyncDomShield();
        e.preventDefault();
        triggerScreenshotBlock(
          'Çoklu dokunma ekran görüntüsü hareketi engellendi. EconNotes notlarının ekran görüntüsü alınamaz.',
        );
      }
    };

    // Sağ tık / mobilde uzun basarak görsel kaydetmeyi engelle
    const handleContextMenu = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        isPreviewOpen ||
        (target &&
          (target.tagName === 'IMG' ||
            target.tagName === 'CANVAS' ||
            target.closest('.econnotes-ss-protected')))
      ) {
        e.preventDefault();
      }
    };

    const handleCopy = (e: ClipboardEvent) => {
      if (isPreviewOpen) {
        e.preventDefault();
        clearClipboard();
      }
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    window.addEventListener('keyup', handleKeyUp, { capture: true });
    window.addEventListener('blur', handleWindowBlur);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    document.addEventListener('touchstart', handleTouchStart, { passive: false, capture: true });
    document.addEventListener('contextmenu', handleContextMenu, { capture: true });
    document.addEventListener('copy', handleCopy, { capture: true });

    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
      window.removeEventListener('keyup', handleKeyUp, { capture: true });
      window.removeEventListener('blur', handleWindowBlur);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      document.removeEventListener('touchstart', handleTouchStart, { capture: true });
      document.removeEventListener('contextmenu', handleContextMenu, { capture: true });
      document.removeEventListener('copy', handleCopy, { capture: true });
      deactivateSyncDomShield();
    };
  }, [
    isPreviewOpen,
    activateSyncDomShield,
    deactivateSyncDomShield,
    triggerScreenshotBlock,
    clearClipboard,
  ]);

  // Pencere tekrar odaklandığında 'focus_lost' kalkanını kaldır (açıkça SS tuşuna basıldıysa kullanıcı butona basana kadar kalkanı koru)
  useEffect(() => {
    const handleWindowFocus = () => {
      setShieldReason((prev) => {
        if (prev === 'focus_lost') {
          deactivateSyncDomShield();
          return null;
        }
        return prev;
      });
    };
    window.addEventListener('focus', handleWindowFocus);
    return () => window.removeEventListener('focus', handleWindowFocus);
  }, [deactivateSyncDomShield]);

  return (
    <div
      onContextMenu={(e) => e.preventDefault()}
      onDragStart={(e) => e.preventDefault()}
      className="relative select-none [-webkit-touch-callout:none] [-webkit-user-select:none]"
    >
      {/* Senkron 0ms Karartma & Yazdırma Engelleyici CSS */}
      <style>{`
        body.${SHIELD_BODY_CLASS} .econnotes-ss-protected {
          opacity: 0 !important;
          visibility: hidden !important;
          filter: blur(40px) brightness(0) !important;
          transition: none !important;
        }
        @media print {
          body * {
            display: none !important;
            visibility: hidden !important;
          }
          body::after {
            content: "EconNotes Güvenlik Koruması: Ders notlarının ekran görüntüsü alınamaz ve yazdırılamaz.";
            display: block !important;
            visibility: visible !important;
            padding: 48px;
            font-size: 20px;
            font-weight: bold;
            text-align: center;
          }
        }
      `}</style>

      <div className="econnotes-ss-protected">
        {children}
      </div>

      {/* Tam Ekran EconNotes Ekran Görüntüsü Engelleyici Güvenlik Kalkanı */}
      {shieldReason && (
        <div
          role="alertdialog"
          aria-live="assertive"
          onClick={dismissShield}
          className="fixed inset-0 z-[250] flex flex-col items-center justify-center bg-gradient-to-b from-[#001438] via-[#00225e] to-[#020817] p-6 text-center text-white backdrop-blur-3xl"
        >
          <div className="max-w-md space-y-4 rounded-[28px] border border-cyan-300/30 bg-white/[0.07] p-6 sm:p-7 shadow-[0_24px_70px_rgba(0,18,56,0.85)] backdrop-blur-2xl">
            <div className="flex justify-center">
              <EconLogo allWhite className="h-6 w-auto" />
            </div>

            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-cyan-300/35 bg-cyan-400/15 text-cyan-300 shadow-[0_0_28px_rgba(56,189,248,0.35)]">
              <ShieldAlert className="h-8 w-8" />
            </div>

            <div className="space-y-1.5">
              <h2 className="text-lg sm:text-xl font-extrabold tracking-tight text-white">
                Ekran Görüntüsü Koruması Aktif
              </h2>
              <p className="text-xs sm:text-sm leading-relaxed text-blue-100/85">
                {shieldReason === 'screenshot'
                  ? 'EconNotes içerik güvenliği politikası gereği Notlar bölümünde ve not önizlemelerinde ekran görüntüsü (SS) alınmasına izin verilmemektedir.'
                  : 'Ekran yakalama ve ekran görüntüsü araçlarına karşı koruma nedeniyle pencere odağı dışındayken not içeriği otomatik olarak gizlenmiştir.'}
              </p>
            </div>

            {viewerName && (
              <div className="inline-flex items-center gap-1.5 rounded-full border border-cyan-300/25 bg-white/[0.06] px-3 py-1 text-[11px] font-medium text-cyan-200">
                <Lock className="h-3 w-3 text-cyan-300" />
                <span>Oturum: {viewerName}</span>
              </div>
            )}

            <div className="pt-1">
              <Button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  dismissShield();
                }}
                className="w-full h-11 rounded-xl bg-gradient-to-r from-[#0055b8] via-[#0070d1] to-[#0ea5e9] text-white font-bold text-xs gap-2 border border-cyan-300/30 shadow-lg"
              >
                <Eye className="h-4 w-4" />
                <span>Anladım, Notlara Dön</span>
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ScreenshotProtection;
