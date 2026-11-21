import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
// @ts-expect-error Vite resolves worker asset URL natively
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.js?url';
import {
  Loader2,
  Search,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Sparkles,
  ShieldCheck,
  Lock,
  Hand,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import EconLogo from '@/components/EconLogo';
import DynamicWatermarkOverlay from '@/components/DynamicWatermarkOverlay';
import {
  isAuthorizedDownloadActive,
  overwriteClipboardWithSecurityImage,
} from '@/components/ScreenshotProtection';
import type { WatermarkIdentity } from '@/lib/watermarkIdentity';

if (typeof window !== 'undefined' && pdfjsLib.GlobalWorkerOptions) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
}

interface NotePreviewViewerProps {
  previewUrl: string;
  previewType: string | null;
  watermarkIdentity?: WatermarkIdentity | null;
}

interface LoupeState {
  active: boolean;
  pageIndex: number;
  normX: number;
  normY: number;
  clientX: number;
  clientY: number;
  imgWidth: number;
  imgHeight: number;
  isTouch: boolean;
}

const LOUPE_SIZE = 164;
const LOUPE_ZOOM = 2.4;

const NotePreviewViewer: React.FC<NotePreviewViewerProps> = ({
  previewUrl,
  previewType,
  watermarkIdentity,
}) => {
  const [pages, setPages] = useState<string[]>([]);
  const [totalPages, setTotalPages] = useState<number>(0);
  const [loadingPdf, setLoadingPdf] = useState<boolean>(false);
  const [pdfFailed, setPdfFailed] = useState<boolean>(false);
  const [zoom, setZoom] = useState<number>(100);
  const [magnifierEnabled, setMagnifierEnabled] = useState<boolean>(false);
  const [loupe, setLoupe] = useState<LoupeState | null>(null);
  // Anti-SS Kalkanı: Kullanıcı ekrana basılı tutarken / fareyle basılı tutarken veya aktif etkileşimdeyken açılır;
  // elini çektiği anda (iOS/Android Güç+Ses SS tuşlarına basmak için veya PC'de SS almak için) 0ms'de kapanır!
  const [isHoldingToView, setIsHoldingToView] = useState<boolean>(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const isPdf = previewType === 'application/pdf';
  const isImage = Boolean(previewType?.startsWith('image/'));

  useEffect(() => {
    let cancelled = false;
    setZoom(100);
    setLoupe(null);
    setPdfFailed(false);
    setIsHoldingToView(false);

    if (isImage) {
      setPages([previewUrl]);
      setTotalPages(1);
      setLoadingPdf(false);
      return;
    }

    if (!isPdf) {
      setPages([]);
      setTotalPages(0);
      setLoadingPdf(false);
      return;
    }

    const renderPdf = async () => {
      setLoadingPdf(true);
      setPages([]);
      try {
        const loadingTask = pdfjsLib.getDocument({
          url: previewUrl,
          isEvalSupported: false,
        });
        const pdf = await loadingTask.promise;
        if (cancelled) return;
        setTotalPages(pdf.numPages);

        const rendered: string[] = [];
        for (let i = 1; i <= pdf.numPages; i++) {
          if (cancelled) return;
          const page = await pdf.getPage(i);
          const baseViewport = page.getViewport({ scale: 1 });
          const targetScale = Math.min(2.4, Math.max(1.5, 1400 / Math.max(baseViewport.width, 1)));
          const viewport = page.getViewport({ scale: targetScale });

          const canvas = document.createElement('canvas');
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          const ctx = canvas.getContext('2d');
          if (!ctx) continue;

          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);

          await page.render({ canvasContext: ctx, viewport }).promise;
          if (cancelled) return;

          const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
          rendered.push(dataUrl);
          setPages([...rendered]);
          if (i === 1) {
            setLoadingPdf(false);
          }
        }
      } catch (err) {
        console.warn('PDF canvas render fallback to native viewer:', err);
        if (!cancelled) {
          setPdfFailed(true);
        }
      } finally {
        if (!cancelled) {
          setLoadingPdf(false);
        }
      }
    };

    void renderPdf();
    return () => {
      cancelled = true;
    };
  }, [previewUrl, isPdf, isImage]);

  // Donanım SS tuşları, pencere kaybı veya klavye kısayollarında kalkanı 0ms'de kapat
  useEffect(() => {
    const lockShieldImmediately = () => {
      setIsHoldingToView(false);
      setLoupe(null);
      void overwriteClipboardWithSecurityImage();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === 'PrintScreen' ||
        e.code === 'PrintScreen' ||
        e.keyCode === 44 ||
        e.key === 'Meta' ||
        e.key === 'OS' ||
        e.key === 'Shift' ||
        e.key === 'Control' ||
        e.key === 'Alt' ||
        e.metaKey ||
        e.ctrlKey ||
        e.altKey ||
        e.shiftKey
      ) {
        lockShieldImmediately();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'PrintScreen' || e.code === 'PrintScreen' || e.keyCode === 44) {
        lockShieldImmediately();
      }
    };

    const handleBlur = () => {
      if (isAuthorizedDownloadActive()) return;
      lockShieldImmediately();
    };

    const handleVisibilityOrBackground = () => {
      if (document.visibilityState === 'hidden') {
        lockShieldImmediately();
      }
    };

    window.addEventListener('blur', handleBlur);
    window.addEventListener('pagehide', lockShieldImmediately);
    document.addEventListener('freeze', lockShieldImmediately);
    window.addEventListener('keydown', handleKeyDown, { capture: true });
    window.addEventListener('keyup', handleKeyUp, { capture: true });
    document.addEventListener('visibilitychange', handleVisibilityOrBackground);
    document.addEventListener('touchcancel', lockShieldImmediately, { capture: true });

    return () => {
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('pagehide', lockShieldImmediately);
      document.removeEventListener('freeze', lockShieldImmediately);
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
      window.removeEventListener('keyup', handleKeyUp, { capture: true });
      document.removeEventListener('visibilitychange', handleVisibilityOrBackground);
      document.removeEventListener('touchcancel', lockShieldImmediately, { capture: true });
    };
  }, []);

  const updateLoupeFromPoint = useCallback(
    (
      pageIndex: number,
      imgEl: HTMLImageElement,
      clientX: number,
      clientY: number,
      isTouch: boolean,
    ) => {
      const rect = imgEl.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;

      const relX = clientX - rect.left;
      const relY = clientY - rect.top;

      if (relX < 0 || relY < 0 || relX > rect.width || relY > rect.height) {
        setLoupe(null);
        return;
      }

      setLoupe({
        active: true,
        pageIndex,
        normX: Math.min(1, Math.max(0, relX / rect.width)),
        normY: Math.min(1, Math.max(0, relY / rect.height)),
        clientX,
        clientY,
        imgWidth: rect.width,
        imgHeight: rect.height,
        isTouch,
      });
    },
    [],
  );

  const handleZoomOut = () => setZoom((z) => Math.max(75, z - 25));
  const handleZoomIn = () => setZoom((z) => Math.min(275, z + 25));
  const handleZoomReset = () => {
    setZoom(100);
    setLoupe(null);
  };

  return (
    <div
      onContextMenu={(e) => e.preventDefault()}
      onDragStart={(e) => e.preventDefault()}
      className="econnotes-ss-protected relative flex h-full w-full flex-col overflow-hidden rounded-xl border border-white/10 bg-[#070d19] shadow-inner select-none [-webkit-touch-callout:none] [-webkit-user-select:none]"
    >
      {/* Üst Kontrol & Büyüteç Araç Çubuğu */}
      <div className="z-30 flex flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-gradient-to-r from-[#001845]/95 via-[#0a1936]/95 to-[#002b75]/95 px-2.5 py-2 sm:px-4 backdrop-blur-xl">
        {/* Sol: Büyüteç (Mercek) Modu Butonu + SS Korumalı Rozeti */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={() => {
              setMagnifierEnabled((v) => {
                if (v) setLoupe(null);
                return !v;
              });
            }}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition-all duration-200 active:scale-95',
              magnifierEnabled
                ? 'bg-gradient-to-r from-[#0070d1] to-cyan-500 text-white shadow-[0_0_18px_rgba(14,165,233,0.55)] ring-1 ring-cyan-300/60'
                : 'border border-cyan-400/30 bg-white/[0.08] text-cyan-100 hover:bg-white/[0.15]',
            )}
          >
            <Search className={cn('h-3.5 w-3.5', magnifierEnabled && 'animate-pulse')} />
            <span>{magnifierEnabled ? 'Büyüteç Açık' : 'Büyüteç'}</span>
          </button>

          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/35 bg-emerald-500/15 px-2.5 py-1 text-[10.5px] font-semibold text-emerald-200">
            <ShieldCheck className="h-3 w-3 text-emerald-300 shrink-0" />
            <span>Canlı SS Koruması</span>
          </span>

          {totalPages > 1 && (
            <span className="hidden sm:inline-flex items-center rounded-full border border-white/15 bg-white/[0.06] px-2.5 py-1 text-[11px] font-medium text-blue-100/85">
              {totalPages} Sayfa
            </span>
          )}
        </div>

        {/* Sağ: Yakınlaştırma / Ekrana Sığdırma Kontrolleri */}
        <div className="flex items-center gap-1 rounded-full border border-white/15 bg-slate-950/60 p-1 backdrop-blur-md">
          <button
            type="button"
            onClick={handleZoomOut}
            disabled={zoom <= 75}
            aria-label="Küçült"
            title="Küçült"
            className="flex h-7 w-7 items-center justify-center rounded-full text-white/85 transition hover:bg-white/15 disabled:opacity-35 active:scale-90"
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </button>

          <button
            type="button"
            onClick={handleZoomReset}
            title="Ekrana Sığdır (%100)"
            className="min-w-[52px] rounded-full px-2 py-0.5 text-center font-mono text-[11px] font-bold text-cyan-300 transition hover:bg-white/10"
          >
            %{zoom}
          </button>

          <button
            type="button"
            onClick={handleZoomIn}
            disabled={zoom >= 275}
            aria-label="Büyüt"
            title="Büyüt"
            className="flex h-7 w-7 items-center justify-center rounded-full text-white/85 transition hover:bg-white/15 disabled:opacity-35 active:scale-90"
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </button>

          {zoom !== 100 && (
            <button
              type="button"
              onClick={handleZoomReset}
              aria-label="Ekrana Sığdır"
              title="Ekrana Sığdır"
              className="flex h-7 items-center gap-1 rounded-full bg-primary/30 px-2 text-[10.5px] font-semibold text-cyan-200 transition hover:bg-primary/45"
            >
              <RotateCcw className="h-3 w-3" />
              <span className="hidden sm:inline">Sığdır</span>
            </button>
          )}
        </div>
      </div>

      {/* Büyüteç aktif bilgi şeridi */}
      {magnifierEnabled && (
        <div className="z-20 flex items-center justify-center gap-1.5 border-b border-cyan-400/20 bg-cyan-500/15 px-3 py-1.5 text-center text-[11px] font-medium text-cyan-200">
          <Sparkles className="h-3 w-3 shrink-0 text-cyan-300" />
          <span>Parmağınızı veya farenizi not üzerinde basılı tutarak büyüteç merceğiyle inceleyin.</span>
        </div>
      )}

      {/* İçerik Alanı: Basılı Tutarak Görüntüleme (Hold-to-View Anti-SS Kalkanı) */}
      <div
        onMouseDown={(e) => {
          if (e.button === 0) setIsHoldingToView(true);
        }}
        onMouseUp={() => {
          setIsHoldingToView(false);
          setLoupe(null);
        }}
        onMouseLeave={() => {
          setIsHoldingToView(false);
          setLoupe(null);
        }}
        onTouchStart={(e) => {
          // Çoklu parmak (örn. 2-3 parmak SS hareketi) algılanırsa anında kilitle!
          if (e.touches.length > 1) {
            setIsHoldingToView(false);
            setLoupe(null);
            return;
          }
          setIsHoldingToView(true);
        }}
        onTouchEnd={() => {
          setIsHoldingToView(false);
          setLoupe(null);
        }}
        onTouchCancel={() => {
          setIsHoldingToView(false);
          setLoupe(null);
        }}
        className="relative flex-1 min-h-0 w-full overflow-hidden"
      >
        <div
          ref={containerRef}
          className={cn(
            'h-full w-full overflow-auto p-2 sm:p-4',
            magnifierEnabled && 'touch-none sm:touch-auto',
          )}
        >
          {loadingPdf && pages.length === 0 ? (
            <div className="flex h-full w-full flex-col items-center justify-center gap-3 text-white">
              <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
              <p className="text-xs sm:text-sm font-medium text-blue-100/85">
                Not sayfaları ekranınıza uygun hazırlanıyor...
              </p>
            </div>
          ) : pdfFailed && isPdf ? (
            <div
              className={cn(
                'relative h-full w-full overflow-hidden rounded-xl bg-white transition-none',
                !isHoldingToView && 'opacity-0 invisible blur-3xl',
              )}
            >
              <iframe
                src={previewUrl}
                title="EconNotes belge önizlemesi"
                className="h-full w-full border-0"
              />
              <DynamicWatermarkOverlay identity={watermarkIdentity} tone="on-light" />
            </div>
          ) : (
            <div
              className={cn(
                'mx-auto flex w-full flex-col items-center gap-3 sm:gap-4 pb-6 transition-none',
                !isHoldingToView && 'opacity-0 invisible blur-3xl pointer-events-none',
              )}
            >
              {pages.map((pageSrc, idx) => (
                <div
                  key={idx}
                  style={{
                    width: zoom === 100 ? '100%' : `${zoom}%`,
                    maxWidth: zoom === 100 ? '820px' : 'none',
                  }}
                  className="relative mx-auto transition-[width] duration-150 ease-out"
                >
                  {totalPages > 1 && (
                    <div className="mb-1.5 flex items-center justify-between px-1 text-[11px] font-medium text-blue-200/75">
                      <span>
                        Sayfa {idx + 1} / {totalPages}
                      </span>
                    </div>
                  )}
                  <div className="relative overflow-hidden rounded-xl border border-white/15 bg-white shadow-[0_12px_32px_rgba(0,0,0,0.45)]">
                    <img
                      src={pageSrc}
                      alt={`Not sayfası ${idx + 1}`}
                      draggable={false}
                      onMouseMove={(e) => {
                        if (!magnifierEnabled || !isHoldingToView) return;
                        updateLoupeFromPoint(idx, e.currentTarget, e.clientX, e.clientY, false);
                      }}
                      onTouchMove={(e) => {
                        if (e.touches.length > 1) {
                          setIsHoldingToView(false);
                          setLoupe(null);
                          return;
                        }
                        if (!magnifierEnabled || !isHoldingToView) return;
                        const touch = e.touches[0];
                        if (touch) {
                          updateLoupeFromPoint(
                            idx,
                            e.currentTarget,
                            touch.clientX,
                            touch.clientY,
                            true,
                          );
                        }
                      }}
                      className={cn(
                        'block w-full h-auto select-none object-contain pointer-events-auto',
                        magnifierEnabled ? 'cursor-crosshair' : 'cursor-pointer',
                      )}
                    />
                    <DynamicWatermarkOverlay identity={watermarkIdentity} tone="on-light" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Donanım SS (iPhone Güç+Ses / PC PrintScreen) Engelleyici Aktif Dokunma Kalkanı */}
        {!loadingPdf && !isHoldingToView && (
          <div className="pointer-events-none absolute inset-0 z-20 flex h-full w-full flex-col items-center justify-center bg-black p-4 text-center select-none">
            <div className="max-w-sm space-y-3.5 rounded-[26px] border border-white/10 bg-[#0d0d0d] p-6 text-white shadow-2xl">
              <div className="flex justify-center">
                <EconLogo allWhite className="h-5 w-auto" />
              </div>

              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-cyan-300/35 bg-cyan-400/15 text-cyan-300 shadow-[0_0_24px_rgba(56,189,248,0.35)]">
                <Hand className="h-7 w-7 animate-pulse" />
              </div>

              <div className="space-y-1.5">
                <div className="inline-flex items-center gap-1 rounded-full border border-cyan-300/30 bg-cyan-400/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-cyan-200">
                  <Lock className="h-3 w-3 text-cyan-300" />
                  <span>Ekran Görüntüsü (SS) Koruması</span>
                </div>
                <h3 className="text-base sm:text-lg font-extrabold tracking-tight text-white">
                  Notu Görüntülemek İçin Basılı Tutun
                </h3>
                <p className="text-xs leading-relaxed text-blue-100/85">
                  Cihaz veya bilgisayardan ekran görüntüsü (SS) alınmasını engellemek için notu incelerken{' '}
                  <strong className="text-cyan-200">
                    parmağınızı (veya farenin sol tuşunu) ekran üzerinde basılı tutun ve kaydırın.
                  </strong>{' '}
                  Elinizi çektiğiniz veya SS tuşlarına bastığınız anda not otomatik olarak gizlenir.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Yüzen EconNotes Büyüteç Merceği (Loupe) */}
      {magnifierEnabled && isHoldingToView && loupe && loupe.active && pages[loupe.pageIndex] && (
        <div
          aria-hidden="true"
          style={{
            width: `${LOUPE_SIZE}px`,
            height: `${LOUPE_SIZE}px`,
            left: `${Math.min(
              window.innerWidth - LOUPE_SIZE - 12,
              Math.max(12, loupe.clientX - LOUPE_SIZE / 2),
            )}px`,
            top: `${Math.max(
              16,
              loupe.clientY - (loupe.isTouch ? LOUPE_SIZE + 28 : LOUPE_SIZE / 2),
            )}px`,
            backgroundImage: `url(${pages[loupe.pageIndex]})`,
            backgroundRepeat: 'no-repeat',
            backgroundSize: `${loupe.imgWidth * LOUPE_ZOOM}px ${loupe.imgHeight * LOUPE_ZOOM}px`,
            backgroundPosition: `${-loupe.normX * loupe.imgWidth * LOUPE_ZOOM + LOUPE_SIZE / 2}px ${
              -loupe.normY * loupe.imgHeight * LOUPE_ZOOM + LOUPE_SIZE / 2
            }px`,
          }}
          className="pointer-events-none fixed z-[80] rounded-full border-[3px] border-cyan-400 bg-white shadow-[0_18px_50px_rgba(0,24,69,0.75),0_0_0_4px_rgba(0,112,209,0.35),inset_0_2px_10px_rgba(0,55,145,0.25)]"
        >
          <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-transparent via-transparent to-white/20" />
          <DynamicWatermarkOverlay identity={watermarkIdentity} tone="on-light" className="rounded-full" />
          <div className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-500/50 bg-cyan-400/15" />
        </div>
      )}
    </div>
  );
};

export default NotePreviewViewer;
