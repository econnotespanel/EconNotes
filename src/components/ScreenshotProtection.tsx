import React, { useEffect, useState, useCallback, useRef } from 'react';
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
 * Panodaki (Clipboard) ekran görüntüsünü (image/png + text/plain) EconNotes güvenlik görseli ile ezer.
 */
export const overwriteClipboardWithSecurityImage = async (viewerName?: string) => {
  const securityText =
    'EconNotes Güvenlik Koruması: Notlar bölümünde ekran görüntüsü (SS) alınmasına izin verilmemektedir.';
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 960;
    canvas.height = 540;
    const ctx = canvas.getContext('2d');
    if (ctx && typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
      const grad = ctx.createLinearGradient(0, 0, 960, 540);
      grad.addColorStop(0, '#001438');
      grad.addColorStop(0.5, '#002b75');
      grad.addColorStop(1, '#020817');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 960, 540);

      ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)';
      ctx.lineWidth = 4;
      ctx.strokeRect(24, 24, 912, 492);

      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 34px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('ECONNOTES GÜVENLİK KALKANI', 480, 210);

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 26px Arial, sans-serif';
      ctx.fillText('Bu İçeriğin Ekran Görüntüsü (SS) Alınamaz', 480, 265);

      ctx.fillStyle = 'rgba(191, 219, 254, 0.85)';
      ctx.font = '18px Arial, sans-serif';
      ctx.fillText(
        `İçerik güvenliği politikası gereği ekran görüntüsü engellenmiştir.${viewerName ? ` (${viewerName})` : ''}`,
        480,
        320,
      );

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), 'image/png'),
      );
      if (blob) {
        const item = new ClipboardItem({
          'image/png': blob,
          'text/plain': new Blob([securityText], { type: 'text/plain' }),
        });
        await navigator.clipboard.write([item]);
        return;
      }
    }
  } catch {
    // Fallback to writeText
  }

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(securityText);
    }
  } catch {
    // Ignore permission errors
  }
};

export const ScreenshotProtection: React.FC<ScreenshotProtectionProps> = ({
  isPreviewOpen = false,
  viewerName,
  children,
}) => {
  const [shieldReason, setShieldReason] = useState<'screenshot' | 'focus_lost' | null>(null);
  const wipeTimersRef = useRef<number[]>([]);

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

  const scheduleClipboardWipes = useCallback(() => {
    wipeTimersRef.current.forEach((id) => window.clearTimeout(id));
    wipeTimersRef.current = [];
    void overwriteClipboardWithSecurityImage(viewerName);
    for (const delay of [25, 80, 180, 350, 650]) {
      const id = window.setTimeout(() => {
        void overwriteClipboardWithSecurityImage(viewerName);
      }, delay);
      wipeTimersRef.current.push(id);
    }
  }, [viewerName]);

  const triggerScreenshotBlock = useCallback(
    (sourceLabel?: string) => {
      activateSyncDomShield();
      setShieldReason('screenshot');
      scheduleClipboardWipes();
      toast.error('Ekran Görüntüsü Engellendi!', {
        description:
          sourceLabel ||
          'EconNotes güvenlik politikası gereği ders notlarının ekran görüntüsü alınmasına izin verilmemektedir.',
        duration: 4500,
      });
    },
    [activateSyncDomShield, scheduleClipboardWipes],
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

      // 2. Önizleme açıkken herhangi bir SS başlangıç tuşuna (Shift, Ctrl, Alt, Win/Cmd) basıldığı anda
      // Win+Shift+S, Cmd+Shift+3/4/5, Alt+PrtScn, Ctrl+PrtScn daha tamamlanmadan 0ms'de ekranı karart!
      if (
        isPreviewOpen &&
        (key === 'Meta' ||
          key === 'OS' ||
          key === 'Shift' ||
          key === 'Control' ||
          key === 'Alt' ||
          e.metaKey ||
          e.ctrlKey ||
          e.altKey)
      ) {
        activateSyncDomShield();
        setShieldReason('focus_lost');
      }

      // 3. Windows Snipping Tool (Win + Shift + S) veya macOS Screenshot (Cmd + Shift + 3/4/5/6/S)
      if (
        (e.metaKey && e.shiftKey) ||
        (e.ctrlKey && e.shiftKey && ['s', 'S', '3', '4', '5', 'i', 'I'].includes(key))
      ) {
        activateSyncDomShield();
        e.preventDefault();
        e.stopPropagation();
        triggerScreenshotBlock(
          'Ekran alıntısı kısayolu algılandı. EconNotes üzerinde ekran görüntüsü alınmasına izin verilmemektedir.',
        );
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
      // Windows PrintScreen tuşu yalnızca keyup gönderir: panodaki görüntüyü anında güvenlik görseliyle ez!
      if (key === 'PrintScreen' || code === 'PrintScreen' || e.keyCode === 44) {
        activateSyncDomShield();
        e.preventDefault();
        e.stopPropagation();
        triggerScreenshotBlock();
        return;
      }
    };

    // Pencere odağı kaybolduğunda (Snipping Tool, Lightshot, iOS Kontrol Merkezi / App Switcher açıldığında)
    const handleWindowBlur = () => {
      activateSyncDomShield();
      setShieldReason((prev) => prev || 'focus_lost');
      scheduleClipboardWipes();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        activateSyncDomShield();
        setShieldReason((prev) => prev || 'focus_lost');
        scheduleClipboardWipes();
      }
    };

    // Fare tarayıcı penceresinden çıktığında (görev çubuğundaki Ekran Alıntısı Aracına tıklamak için) önizlemeyi anında gizle
    const handleMouseLeaveDocument = (e: MouseEvent) => {
      if (!isPreviewOpen) return;
      if (
        e.clientY <= 0 ||
        e.clientX <= 0 ||
        e.clientX >= window.innerWidth ||
        e.clientY >= window.innerHeight
      ) {
        activateSyncDomShield();
        setShieldReason((prev) => prev || 'focus_lost');
      }
    };

    // Mobilde çoklu dokunma veya touchcancel (iOS/Android donanım SS tuşlarına basıldığında tetiklenir)
    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches && e.touches.length >= 3) {
        activateSyncDomShield();
        e.preventDefault();
        triggerScreenshotBlock(
          'Çoklu dokunma ekran görüntüsü hareketi engellendi. EconNotes notlarının ekran görüntüsü alınamaz.',
        );
      }
    };

    const handleTouchCancel = () => {
      // iOS ve Android, fiziksel Güç + Ses tuşlarıyla SS alındığı anda aktif dokunmayı 'touchcancel' ile keser!
      activateSyncDomShield();
      setShieldReason('screenshot');
      scheduleClipboardWipes();
    };

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
        scheduleClipboardWipes();
      }
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    window.addEventListener('keyup', handleKeyUp, { capture: true });
    window.addEventListener('blur', handleWindowBlur);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    document.documentElement.addEventListener('mouseleave', handleMouseLeaveDocument);
    document.addEventListener('touchstart', handleTouchStart, { passive: false, capture: true });
    document.addEventListener('touchcancel', handleTouchCancel, { capture: true });
    document.addEventListener('contextmenu', handleContextMenu, { capture: true });
    document.addEventListener('copy', handleCopy, { capture: true });

    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
      window.removeEventListener('keyup', handleKeyUp, { capture: true });
      window.removeEventListener('blur', handleWindowBlur);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      document.documentElement.removeEventListener('mouseleave', handleMouseLeaveDocument);
      document.removeEventListener('touchstart', handleTouchStart, { capture: true });
      document.removeEventListener('touchcancel', handleTouchCancel, { capture: true });
      document.removeEventListener('contextmenu', handleContextMenu, { capture: true });
      document.removeEventListener('copy', handleCopy, { capture: true });
      wipeTimersRef.current.forEach((id) => window.clearTimeout(id));
      deactivateSyncDomShield();
    };
  }, [
    isPreviewOpen,
    activateSyncDomShield,
    deactivateSyncDomShield,
    triggerScreenshotBlock,
    scheduleClipboardWipes,
  ]);

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
          filter: blur(48px) brightness(0) !important;
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

      <div className="econnotes-ss-protected">{children}</div>

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
                  : 'Ekran yakalama ve ekran görüntüsü araçlarına karşı koruma nedeniyle not içeriği otomatik olarak gizlenmiştir.'}
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
