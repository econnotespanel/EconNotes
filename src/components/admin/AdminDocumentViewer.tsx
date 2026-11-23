import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
// @ts-expect-error Vite resolves worker asset URL natively
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.js?url';
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  FileImage,
  FileSpreadsheet,
  FileText,
  Layers,
  Loader2,
  Maximize2,
  Minimize2,
  Presentation,
  RefreshCw,
  RotateCcw,
  RotateCw,
  Square,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  formatFileSizeLabel,
  getPreviewFileKindLabel,
  parseDocxForPreview,
  parsePptxForPreview,
  type AdminNotePreviewResolution,
  type ParsedDocxDocument,
  type ParsedPptxDocument,
} from '@/lib/adminNotePreview';

if (typeof window !== 'undefined' && pdfjsLib.GlobalWorkerOptions) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
}

interface AdminDocumentViewerProps {
  noteTitle: string;
  resolution: AdminNotePreviewResolution | null;
  loading: boolean;
  onRetry: () => void;
}

export const AdminDocumentViewer: React.FC<AdminDocumentViewerProps> = ({
  noteTitle,
  resolution,
  loading,
  onRetry,
}) => {
  const [fullscreen, setFullscreen] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [imageRotation, setImageRotation] = useState(0);
  const [imageLoadError, setImageLoadError] = useState(false);

  // PDF state
  const [pdfPages, setPdfPages] = useState<string[]>([]);
  const [pdfTotalPages, setPdfTotalPages] = useState(0);
  const [pdfCurrentPage, setPdfCurrentPage] = useState(1);
  const [pdfViewMode, setPdfViewMode] = useState<'single' | 'all'>('single');
  const [pdfRendering, setPdfRendering] = useState(false);
  const [pdfRenderError, setPdfRenderError] = useState<string | null>(null);
  const [pdfFallbackIframe, setPdfFallbackIframe] = useState(false);

  // PPTX state
  const [pptxDoc, setPptxDoc] = useState<ParsedPptxDocument | null>(null);
  const [pptxCurrentSlide, setPptxCurrentSlide] = useState(1);
  const [pptxViewMode, setPptxViewMode] = useState<'single' | 'all'>('single');
  const [pptxParsing, setPptxParsing] = useState(false);
  const [pptxError, setPptxError] = useState<string | null>(null);

  // DOCX state
  const [docxDoc, setDocxDoc] = useState<ParsedDocxDocument | null>(null);
  const [docxParsing, setDocxParsing] = useState(false);
  const [docxError, setDocxError] = useState<string | null>(null);

  // Text state
  const [textContent, setTextContent] = useState<string | null>(null);

  const pdfDocRef = useRef<any>(null);

  // Escape exits fullscreen cleanly
  useEffect(() => {
    if (!fullscreen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setFullscreen(false);
      } else if (e.key === 'ArrowRight') {
        if (resolution?.fileKind === 'pdf' && pdfTotalPages > 1) {
          setPdfCurrentPage((p) => Math.min(pdfTotalPages, p + 1));
        } else if (resolution?.fileKind === 'pptx' && pptxDoc && pptxDoc.slideCount > 1) {
          setPptxCurrentSlide((s) => Math.min(pptxDoc.slideCount, s + 1));
        }
      } else if (e.key === 'ArrowLeft') {
        if (resolution?.fileKind === 'pdf' && pdfTotalPages > 1) {
          setPdfCurrentPage((p) => Math.max(1, p - 1));
        } else if (resolution?.fileKind === 'pptx' && pptxDoc && pptxDoc.slideCount > 1) {
          setPptxCurrentSlide((s) => Math.max(1, s - 1));
        }
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [fullscreen, resolution?.fileKind, pdfTotalPages, pptxDoc]);

  // Reset & decode document whenever resolution changes
  useEffect(() => {
    let cancelled = false;

    setZoom(100);
    setImageRotation(0);
    setImageLoadError(false);

    setPdfPages([]);
    setPdfTotalPages(0);
    setPdfCurrentPage(1);
    setPdfViewMode('single');
    setPdfRendering(false);
    setPdfRenderError(null);
    setPdfFallbackIframe(false);
    pdfDocRef.current = null;

    setPptxDoc(null);
    setPptxCurrentSlide(1);
    setPptxViewMode('single');
    setPptxParsing(false);
    setPptxError(null);

    setDocxDoc(null);
    setDocxParsing(false);
    setDocxError(null);

    setTextContent(null);

    if (!resolution || !resolution.ok || !resolution.arrayBuffer) {
      return;
    }

    const kind = resolution.fileKind;
    const buf = resolution.arrayBuffer;

    if (kind === 'pdf') {
      setPdfRendering(true);
      const runPdf = async () => {
        try {
          // Always pass a copy so worker transfer never detaches resolution.arrayBuffer
          const loadingTask = pdfjsLib.getDocument({
            data: new Uint8Array(buf.slice(0)),
            isEvalSupported: false,
          });
          const pdf = await loadingTask.promise;
          if (cancelled) return;
          pdfDocRef.current = pdf;
          setPdfTotalPages(pdf.numPages);

          const rendered: string[] = [];
          for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
            if (cancelled) return;
            const page = await pdf.getPage(pageNo);
            const baseViewport = page.getViewport({ scale: 1 });
            const scale = Math.min(2.2, Math.max(1.35, 1300 / Math.max(baseViewport.width, 1)));
            const viewport = page.getViewport({ scale });

            const canvas = document.createElement('canvas');
            canvas.width = Math.floor(viewport.width);
            canvas.height = Math.floor(viewport.height);
            const ctx = canvas.getContext('2d');
            if (!ctx) continue;

            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            await page.render({ canvasContext: ctx, viewport }).promise;
            if (cancelled) return;

            rendered.push(canvas.toDataURL('image/jpeg', 0.92));
            setPdfPages([...rendered]);
            if (pageNo === 1) {
              setPdfRendering(false);
            }
          }
        } catch (err) {
          if (cancelled) return;
          const msg = err instanceof Error ? err.message : 'PDF sayfaları oluşturulamadı.';
          console.warn('Admin PDF canvas render fallback:', err);
          setPdfRenderError(msg);
          setPdfFallbackIframe(true);
        } finally {
          if (!cancelled) setPdfRendering(false);
        }
      };
      void runPdf();
    } else if (kind === 'pptx') {
      setPptxParsing(true);
      let parsedRef: ParsedPptxDocument | null = null;
      parsePptxForPreview(buf.slice(0))
        .then((doc) => {
          if (cancelled) {
            doc.revokeUrls();
            return;
          }
          parsedRef = doc;
          setPptxDoc(doc);
        })
        .catch((err) => {
          if (!cancelled) {
            setPptxError(
              err instanceof Error
                ? `PowerPoint dosyası okunamadı: ${err.message}`
                : 'PowerPoint sunumu çözümlenemedi.',
            );
          }
        })
        .finally(() => {
          if (!cancelled) setPptxParsing(false);
        });

      return () => {
        cancelled = true;
        parsedRef?.revokeUrls();
      };
    } else if (kind === 'docx') {
      setDocxParsing(true);
      let parsedRef: ParsedDocxDocument | null = null;
      parseDocxForPreview(buf.slice(0))
        .then((doc) => {
          if (cancelled) {
            doc.revokeUrls();
            return;
          }
          parsedRef = doc;
          setDocxDoc(doc);
        })
        .catch((err) => {
          if (!cancelled) {
            setDocxError(
              err instanceof Error
                ? `Word belgesi okunamadı: ${err.message}`
                : 'Word belgesi çözümlenemedi.',
            );
          }
        })
        .finally(() => {
          if (!cancelled) setDocxParsing(false);
        });

      return () => {
        cancelled = true;
        parsedRef?.revokeUrls();
      };
    } else if (kind === 'text') {
      try {
        const decoded = new TextDecoder('utf-8').decode(new Uint8Array(buf));
        setTextContent(decoded);
      } catch {
        setTextContent('Metin içeriği çözümlenemedi.');
      }
    }

    return () => {
      cancelled = true;
    };
  }, [resolution]);

  const handleDownload = useCallback(() => {
    const href = resolution?.blobUrl || resolution?.signedUrl;
    if (!href) return;
    const link = document.createElement('a');
    link.href = href;
    link.download = resolution?.fileName || `${noteTitle || 'econnotes-not'}`;
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [resolution, noteTitle]);

  const handleOpenNewTab = useCallback(() => {
    const href = resolution?.blobUrl || resolution?.signedUrl;
    if (!href) return;
    window.open(href, '_blank', 'noopener,noreferrer');
  }, [resolution]);

  const fileKind = resolution?.fileKind ?? 'unsupported';
  const isPdf = fileKind === 'pdf';
  const isPptx = fileKind === 'pptx';
  const isDocx = fileKind === 'docx';
  const isImage = fileKind === 'image';
  const isText = fileKind === 'text';

  const canZoom = Boolean(resolution?.ok && (isPdf || isPptx || isDocx || isImage || isText));
  const totalCount = isPdf ? pdfTotalPages : isPptx ? pptxDoc?.slideCount ?? 0 : 0;
  const currentNum = isPdf ? pdfCurrentPage : isPptx ? pptxCurrentSlide : 1;
  const viewMode = isPdf ? pdfViewMode : pptxViewMode;

  const setCurrentNum = (next: number) => {
    if (isPdf) setPdfCurrentPage(Math.max(1, Math.min(Math.max(1, pdfTotalPages), next)));
    if (isPptx) setPptxCurrentSlide(Math.max(1, Math.min(Math.max(1, pptxDoc?.slideCount ?? 1), next)));
  };

  const toggleViewMode = () => {
    if (isPdf) setPdfViewMode((m) => (m === 'single' ? 'all' : 'single'));
    if (isPptx) setPptxViewMode((m) => (m === 'single' ? 'all' : 'single'));
  };

  const KindIcon = isPptx
    ? Presentation
    : isImage
    ? FileImage
    : isDocx
    ? FileSpreadsheet
    : FileText;

  const sizeLabel = formatFileSizeLabel(resolution?.fileSize);

  const renderSlideCard = (slide: ParsedPptxDocument['slides'][number]) => {
    const hasBodyContent =
      slide.paragraphs.length > 0 ||
      slide.tables.length > 0 ||
      slide.images.length > 0 ||
      slide.extras.length > 0;

    return (
      <div
        key={slide.slideNumber}
        style={{
          width: zoom === 100 ? '100%' : `${zoom}%`,
          maxWidth: zoom === 100 ? '880px' : 'none',
        }}
        className="mx-auto space-y-2.5 transition-[width] duration-150"
      >
        <div className="overflow-hidden rounded-2xl border border-border/80 bg-white text-slate-900 shadow-lg dark:border-slate-700/80">
          {/* EconNotes Blue Slide Accent Bar */}
          <div className="flex items-center justify-between gap-3 bg-gradient-to-r from-[#001d52] via-[#003791] to-[#0070d1] px-5 py-3 text-white">
            <h4 className="min-w-0 flex-1 truncate text-sm font-extrabold tracking-tight sm:text-base">
              {slide.title}
            </h4>
            <span className="shrink-0 rounded-full border border-white/25 bg-white/15 px-2.5 py-0.5 font-mono text-[11px] font-bold tabular-nums">
              Slayt {slide.slideNumber} / {pptxDoc?.slideCount ?? 1}
            </span>
          </div>

          <div className="min-h-[260px] space-y-4 p-5 sm:p-7">
            {/* Embedded slide images */}
            {slide.images.length > 0 && (
              <div
                className={cn(
                  'grid gap-3',
                  slide.images.length > 1 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1',
                )}
              >
                {slide.images.map((img, idx) => (
                  <div
                    key={`${slide.slideNumber}-img-${idx}`}
                    className="flex items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50 p-2"
                  >
                    <img
                      src={img.url}
                      alt={`${slide.title} — ${img.name}`}
                      className="max-h-[340px] w-auto max-w-full object-contain"
                    />
                  </div>
                ))}
              </div>
            )}

            {/* Structured bullet/paragraph content */}
            {slide.paragraphs.length > 0 && (
              <ul className="space-y-2 text-sm leading-relaxed text-slate-800">
                {slide.paragraphs.map((para, idx) => (
                  <li key={idx} className="flex items-start gap-2.5">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#0055b8]" />
                    <span className="whitespace-pre-wrap break-words">{para}</span>
                  </li>
                ))}
              </ul>
            )}

            {/* Extracted PowerPoint tables */}
            {slide.tables.map((rows, tIdx) => (
              <div key={tIdx} className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full border-collapse text-left text-xs">
                  <tbody>
                    {rows.map((row, rIdx) => (
                      <tr
                        key={rIdx}
                        className={cn(
                          'border-b border-slate-200 last:border-b-0',
                          rIdx === 0 ? 'bg-blue-50/90 font-bold text-[#001d52]' : 'bg-white text-slate-800',
                        )}
                      >
                        {row.map((cell, cIdx) => (
                          <td key={cIdx} className="border-r border-slate-200 px-3 py-2 last:border-r-0">
                            {cell || '—'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}

            {/* SmartArt / Chart extras */}
            {slide.extras.length > 0 && (
              <div className="space-y-1.5 rounded-xl border border-blue-200 bg-blue-50/60 p-3 text-xs text-slate-700">
                {slide.extras.map((ext, eIdx) => (
                  <p key={eIdx} className="leading-relaxed">
                    {ext}
                  </p>
                ))}
              </div>
            )}

            {!hasBodyContent && (
              <p className="py-8 text-center text-xs text-slate-500">
                Bu slaytta yalnızca başlık veya vektörel çizim bulunuyor.
              </p>
            )}
          </div>
        </div>

        {/* Speaker notes when available */}
        {slide.speakerNotes && (
          <div className="rounded-xl border border-primary/20 bg-primary/[0.05] px-4 py-2.5 text-xs text-foreground">
            <span className="font-bold text-primary">Konuşmacı Notları: </span>
            <span className="whitespace-pre-wrap text-muted-foreground">{slide.speakerNotes}</span>
          </div>
        )}
      </div>
    );
  };

  const viewerShell = (
    <div
      className={cn(
        'flex flex-col overflow-hidden border border-border/80 bg-muted/20',
        fullscreen
          ? 'fixed inset-0 z-[100] h-[100dvh] w-screen rounded-none bg-background shadow-none'
          : 'rounded-2xl shadow-sm',
      )}
      style={
        fullscreen
          ? {
              paddingTop: 'env(safe-area-inset-top, 0px)',
              paddingBottom: 'env(safe-area-inset-bottom, 0px)',
            }
          : undefined
      }
    >
      {/* Unified EconNotes Document Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 bg-gradient-to-r from-[#001d52] via-[#003791] to-[#0055b8] px-3 py-2.5 text-white sm:px-4">
        {/* Left: File identity & page indicator */}
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-white/20 bg-white/10">
            <KindIcon className="h-4 w-4 text-cyan-200" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-xs font-bold text-white sm:max-w-[260px]" title={resolution?.fileName || noteTitle}>
              {resolution?.fileName || noteTitle}
            </p>
            <div className="flex flex-wrap items-center gap-1.5 text-[10.5px] text-blue-100/90">
              <span>{getPreviewFileKindLabel(fileKind)}</span>
              {sizeLabel && <span>• {sizeLabel}</span>}
              {totalCount > 0 && (
                <Badge
                  variant="outline"
                  className="h-4 border-white/25 bg-white/15 px-1.5 text-[10px] font-bold text-white"
                >
                  {isPdf ? `${pdfTotalPages} Sayfa` : `${pptxDoc?.slideCount ?? 0} Slayt`}
                </Badge>
              )}
            </div>
          </div>
        </div>

        {/* Center/Right: Page Navigation, Zoom, Fullscreen, Download */}
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Page / Slide Controls */}
          {resolution?.ok && totalCount > 1 && (
            <div className="flex items-center gap-1 rounded-xl border border-white/20 bg-white/10 p-0.5">
              <button
                type="button"
                onClick={() => setCurrentNum(currentNum - 1)}
                disabled={currentNum <= 1}
                aria-label={isPdf ? 'Önceki sayfa' : 'Önceki slayt'}
                title={isPdf ? 'Önceki sayfa' : 'Önceki slayt'}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-white transition hover:bg-white/15 disabled:opacity-35"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="min-w-[54px] text-center font-mono text-[11px] font-bold tabular-nums">
                {currentNum} / {totalCount}
              </span>
              <button
                type="button"
                onClick={() => setCurrentNum(currentNum + 1)}
                disabled={currentNum >= totalCount}
                aria-label={isPdf ? 'Sonraki sayfa' : 'Sonraki slayt'}
                title={isPdf ? 'Sonraki sayfa' : 'Sonraki slayt'}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-white transition hover:bg-white/15 disabled:opacity-35"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={toggleViewMode}
                title={viewMode === 'single' ? 'Tümünü Listele' : 'Tekli Görünüm'}
                className="hidden h-7 items-center gap-1 rounded-lg px-2 text-[11px] font-semibold text-cyan-100 transition hover:bg-white/15 sm:inline-flex"
              >
                {viewMode === 'single' ? <Layers className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
                <span>{viewMode === 'single' ? 'Tümü' : 'Tekli'}</span>
              </button>
            </div>
          )}

          {/* Zoom Controls */}
          {canZoom && (
            <div className="flex items-center gap-0.5 rounded-xl border border-white/20 bg-white/10 p-0.5">
              <button
                type="button"
                onClick={() => setZoom((z) => Math.max(50, z - 25))}
                disabled={zoom <= 50}
                aria-label="Uzaklaştır"
                title="Uzaklaştır"
                className="flex h-7 w-7 items-center justify-center rounded-lg text-white transition hover:bg-white/15 disabled:opacity-35"
              >
                <ZoomOut className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setZoom(100)}
                title="Varsayılan Yakınlaştırma (%100)"
                className="min-w-[44px] rounded-lg px-1.5 py-0.5 text-center font-mono text-[11px] font-bold text-cyan-200 hover:bg-white/10"
              >
                %{zoom}
              </button>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.min(250, z + 25))}
                disabled={zoom >= 250}
                aria-label="Yakınlaştır"
                title="Yakınlaştır"
                className="flex h-7 w-7 items-center justify-center rounded-lg text-white transition hover:bg-white/15 disabled:opacity-35"
              >
                <ZoomIn className="h-3.5 w-3.5" />
              </button>
              {zoom !== 100 && (
                <button
                  type="button"
                  onClick={() => setZoom(100)}
                  aria-label="Sıfırla"
                  title="Sıfırla"
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-cyan-200 transition hover:bg-white/15"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}

          {/* Rotate button for Images */}
          {resolution?.ok && isImage && (
            <button
              type="button"
              onClick={() => setImageRotation((r) => (r + 90) % 360)}
              title="90° Döndür"
              className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/20 bg-white/10 text-white transition hover:bg-white/20"
            >
              <RotateCw className="h-3.5 w-3.5" />
            </button>
          )}

          {/* Download & Open in New Tab */}
          {(resolution?.blobUrl || resolution?.signedUrl) && (
            <>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={handleDownload}
                className="h-8 gap-1.5 rounded-xl border border-white/20 bg-white/10 px-2.5 text-xs font-semibold text-white hover:bg-white/20 hover:text-white"
                title="Dosyayı İndir"
              >
                <Download className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">İndir</span>
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={handleOpenNewTab}
                className="h-8 w-8 rounded-xl border border-white/20 bg-white/10 p-0 text-white hover:bg-white/20 hover:text-white"
                title="Yeni Sekmede Aç"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </Button>
            </>
          )}

          {/* Fullscreen Toggle */}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setFullscreen((f) => !f)}
            className="h-8 gap-1.5 rounded-xl border border-white/25 bg-white/15 px-2.5 text-xs font-bold text-white hover:bg-white/25 hover:text-white"
            title={fullscreen ? 'Tam Ekrandan Çık (Esc)' : 'Tam Ekran Önizleme'}
          >
            {fullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            <span className="hidden md:inline">{fullscreen ? 'Küçült' : 'Tam Ekran'}</span>
          </Button>
        </div>
      </div>

      {/* Main Preview Viewport */}
      <div
        className={cn(
          'relative w-full overflow-auto bg-slate-100/80 p-3 dark:bg-slate-950/70 sm:p-5',
          fullscreen ? 'flex-1' : 'min-h-[360px] max-h-[540px]',
        )}
      >
        {/* 1. LOADING STATE */}
        {loading ? (
          <div className="flex min-h-[320px] flex-col items-center justify-center gap-3 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-bold text-foreground">Belge hazırlanıyor...</p>
              <p className="text-xs text-muted-foreground">
                Yönetici erişimi doğrulanıyor ve dosya içeriği güvenli bağlantı üzerinden yükleniyor.
              </p>
            </div>
          </div>
        ) : /* 2. REAL ERROR STATE */ !resolution || !resolution.ok ? (
          <div className="flex min-h-[320px] flex-col items-center justify-center gap-4 p-4 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400">
              <AlertTriangle className="h-7 w-7" />
            </div>
            <div className="max-w-md space-y-1.5">
              <h4 className="text-sm font-extrabold text-foreground">Dosya Önizlemesi Açılamadı</h4>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {resolution?.error || 'Belge bağlantısı alınamadı. Lütfen tekrar deneyin.'}
              </p>
              {resolution?.resolvedPath && (
                <p className="break-all rounded-lg border border-border/70 bg-background/80 px-2.5 py-1 font-mono text-[10.5px] text-muted-foreground">
                  Aranan yol: {resolution.resolvedPath}
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button type="button" size="sm" onClick={onRetry} className="gap-1.5 rounded-xl">
                <RefreshCw className="h-3.5 w-3.5" />
                Tekrar Dene
              </Button>
              {resolution?.signedUrl && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleDownload}
                  className="gap-1.5 rounded-xl"
                >
                  <Download className="h-3.5 w-3.5" />
                  Dosyayı İndirmeyi Dene
                </Button>
              )}
            </div>
          </div>
        ) : /* 3. PDF RENDERER */ isPdf ? (
          pdfRendering && pdfPages.length === 0 ? (
            <div className="flex min-h-[320px] flex-col items-center justify-center gap-3 text-center">
              <Loader2 className="h-7 w-7 animate-spin text-primary" />
              <p className="text-xs font-semibold text-muted-foreground">
                PDF sayfaları yüksek çözünürlükte işleniyor...
              </p>
            </div>
          ) : pdfFallbackIframe && resolution.blobUrl ? (
            <div className="space-y-2">
              {pdfRenderError && (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                  Yerleşik sayfa işleyici yedek görünüme geçti ({pdfRenderError}). Tarayıcı PDF görüntüleyicisi gösteriliyor.
                </div>
              )}
              <iframe
                src={resolution.blobUrl}
                title={noteTitle}
                className={cn(
                  'w-full rounded-xl border border-border bg-white',
                  fullscreen ? 'h-[calc(100dvh-110px)]' : 'h-[480px]',
                )}
              />
            </div>
          ) : (
            <div className="space-y-4">
              {pdfTotalPages > pdfPages.length && (
                <div className="flex items-center justify-center gap-2 rounded-xl border border-primary/20 bg-primary/[0.06] px-3 py-1.5 text-xs font-medium text-primary">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>
                    Sayfalar yükleniyor: {pdfPages.length} / {pdfTotalPages}
                  </span>
                </div>
              )}

              {pdfViewMode === 'single' ? (
                <div
                  style={{
                    width: zoom === 100 ? '100%' : `${zoom}%`,
                    maxWidth: zoom === 100 ? '840px' : 'none',
                  }}
                  className="mx-auto space-y-2 transition-[width] duration-150"
                >
                  {pdfPages[pdfCurrentPage - 1] ? (
                    <div className="overflow-hidden rounded-xl border border-border/80 bg-white shadow-md">
                      <img
                        src={pdfPages[pdfCurrentPage - 1]}
                        alt={`${noteTitle} — Sayfa ${pdfCurrentPage}`}
                        className="block h-auto w-full object-contain"
                      />
                    </div>
                  ) : (
                    <div className="flex min-h-[280px] items-center justify-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      Sayfa {pdfCurrentPage} hazırlanıyor...
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  {pdfPages.map((src, idx) => (
                    <div
                      key={idx}
                      style={{
                        width: zoom === 100 ? '100%' : `${zoom}%`,
                        maxWidth: zoom === 100 ? '840px' : 'none',
                      }}
                      className="mx-auto space-y-1.5 transition-[width] duration-150"
                    >
                      <div className="flex items-center justify-between px-1 text-[11px] font-semibold text-muted-foreground">
                        <span>
                          Sayfa {idx + 1} / {pdfTotalPages}
                        </span>
                      </div>
                      <div className="overflow-hidden rounded-xl border border-border/80 bg-white shadow-md">
                        <img
                          src={src}
                          alt={`${noteTitle} — Sayfa ${idx + 1}`}
                          className="block h-auto w-full object-contain"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Quick page strip for multi-page PDFs in single mode */}
              {pdfViewMode === 'single' && pdfTotalPages > 1 && (
                <div className="flex flex-wrap items-center justify-center gap-1.5 pt-1">
                  {Array.from({ length: Math.min(pdfTotalPages, 30) }).map((_, idx) => {
                    const pNo = idx + 1;
                    const active = pNo === pdfCurrentPage;
                    return (
                      <button
                        key={pNo}
                        type="button"
                        onClick={() => setPdfCurrentPage(pNo)}
                        className={cn(
                          'h-7 min-w-7 rounded-lg border px-2 text-xs font-bold tabular-nums transition',
                          active
                            ? 'border-primary bg-primary text-primary-foreground shadow-xs'
                            : 'border-border bg-card text-muted-foreground hover:border-primary/50 hover:text-foreground',
                        )}
                      >
                        {pNo}
                      </button>
                    );
                  })}
                  {pdfTotalPages > 30 && (
                    <span className="px-1.5 text-[11px] text-muted-foreground">
                      +{pdfTotalPages - 30} sayfa (üst oklarla gezin)
                    </span>
                  )}
                </div>
              )}
            </div>
          )
        ) : /* 4. POWERPOINT (.PPTX) SLIDE RENDERER */ isPptx ? (
          pptxParsing ? (
            <div className="flex min-h-[320px] flex-col items-center justify-center gap-3 text-center">
              <Loader2 className="h-7 w-7 animate-spin text-primary" />
              <p className="text-xs font-semibold text-muted-foreground">
                PowerPoint slaytları, tablolar ve görseller çözümleniyor...
              </p>
            </div>
          ) : pptxError || !pptxDoc || pptxDoc.slides.length === 0 ? (
            <div className="flex min-h-[300px] flex-col items-center justify-center gap-3 p-6 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-600 dark:text-amber-400">
                <Presentation className="h-7 w-7" />
              </div>
              <p className="text-sm font-bold text-foreground">{resolution.fileName}</p>
              <p className="max-w-md text-xs text-muted-foreground">
                {pptxError || 'Sunum içinde okunabilir slayt içeriği bulunamadı. Dosyayı indirerek doğrudan PowerPoint uygulamasında inceleyebilirsiniz.'}
              </p>
              <Button type="button" onClick={handleDownload} className="gap-2 rounded-xl">
                <Download className="h-4 w-4" />
                Sunumu Güvenli İndir
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {pptxViewMode === 'single' ? (
                renderSlideCard(pptxDoc.slides[Math.min(pptxCurrentSlide - 1, pptxDoc.slides.length - 1)])
              ) : (
                <div className="space-y-5">{pptxDoc.slides.map((s) => renderSlideCard(s))}</div>
              )}

              {/* Quick slide strip */}
              {pptxViewMode === 'single' && pptxDoc.slideCount > 1 && (
                <div className="flex flex-wrap items-center justify-center gap-1.5 pt-1">
                  {pptxDoc.slides.map((s) => {
                    const active = s.slideNumber === pptxCurrentSlide;
                    return (
                      <button
                        key={s.slideNumber}
                        type="button"
                        onClick={() => setPptxCurrentSlide(s.slideNumber)}
                        title={`Slayt ${s.slideNumber}: ${s.title}`}
                        className={cn(
                          'h-7 min-w-7 rounded-lg border px-2 text-xs font-bold tabular-nums transition',
                          active
                            ? 'border-primary bg-primary text-primary-foreground shadow-xs'
                            : 'border-border bg-card text-muted-foreground hover:border-primary/50 hover:text-foreground',
                        )}
                      >
                        {s.slideNumber}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )
        ) : /* 5. WORD (.DOCX) RENDERER */ isDocx ? (
          docxParsing ? (
            <div className="flex min-h-[320px] flex-col items-center justify-center gap-3 text-center">
              <Loader2 className="h-7 w-7 animate-spin text-primary" />
              <p className="text-xs font-semibold text-muted-foreground">
                Word belgesi içeriği hazırlanıyor...
              </p>
            </div>
          ) : docxError || !docxDoc || docxDoc.blocks.length === 0 ? (
            <div className="flex min-h-[300px] flex-col items-center justify-center gap-3 p-6 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <FileText className="h-7 w-7" />
              </div>
              <p className="text-sm font-bold text-foreground">{resolution.fileName}</p>
              <p className="max-w-md text-xs text-muted-foreground">
                {docxError || 'Word belgesinde okunabilir metin bulunamadı. Dosyayı indirerek inceleyebilirsiniz.'}
              </p>
              <Button type="button" onClick={handleDownload} className="gap-2 rounded-xl">
                <Download className="h-4 w-4" />
                Belgeyi Güvenli İndir
              </Button>
            </div>
          ) : (
            <div
              style={{
                width: zoom === 100 ? '100%' : `${zoom}%`,
                maxWidth: zoom === 100 ? '820px' : 'none',
              }}
              className="mx-auto rounded-2xl border border-border/80 bg-white p-6 text-slate-900 shadow-md transition-[width] duration-150 sm:p-8"
            >
              <div className="mb-4 flex items-center justify-between border-b border-slate-200 pb-3 text-xs text-slate-500">
                <span className="font-semibold text-[#003791]">{resolution.fileName}</span>
                <span>~{docxDoc.wordCount.toLocaleString('tr-TR')} kelime</span>
              </div>
              <div className="space-y-3 text-sm leading-relaxed">
                {docxDoc.blocks.map((block, bIdx) => {
                  if (block.type === 'heading') {
                    return (
                      <h4
                        key={bIdx}
                        className={cn(
                          'font-extrabold text-[#001d52]',
                          block.level === 1 ? 'pt-2 text-lg' : block.level === 2 ? 'pt-1 text-base' : 'text-sm',
                        )}
                      >
                        {block.text}
                      </h4>
                    );
                  }
                  if (block.type === 'image') {
                    return (
                      <div
                        key={bIdx}
                        className="my-2 flex justify-center rounded-xl border border-slate-200 bg-slate-50 p-2"
                      >
                        <img
                          src={block.url}
                          alt={block.name}
                          className="max-h-[360px] w-auto max-w-full object-contain"
                        />
                      </div>
                    );
                  }
                  if (block.type === 'table') {
                    return (
                      <div key={bIdx} className="overflow-x-auto rounded-xl border border-slate-200">
                        <table className="w-full border-collapse text-left text-xs">
                          <tbody>
                            {block.rows.map((row, rIdx) => (
                              <tr
                                key={rIdx}
                                className={cn(
                                  'border-b border-slate-200 last:border-b-0',
                                  rIdx === 0 ? 'bg-blue-50/90 font-bold text-[#001d52]' : 'bg-white text-slate-800',
                                )}
                              >
                                {row.map((cell, cIdx) => (
                                  <td key={cIdx} className="border-r border-slate-200 px-3 py-2 last:border-r-0">
                                    {cell || '—'}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    );
                  }
                  return (
                    <p
                      key={bIdx}
                      className={cn(
                        'whitespace-pre-wrap break-words text-slate-800',
                        block.isBullet && 'pl-4 before:mr-2 before:text-[#0055b8] before:content-["•"]',
                      )}
                    >
                      {block.text}
                    </p>
                  );
                })}
              </div>
            </div>
          )
        ) : /* 6. IMAGE VIEWER */ isImage && resolution.blobUrl && !imageLoadError ? (
          <div className="flex min-h-[300px] items-center justify-center">
            <div
              style={{
                width: zoom === 100 ? 'auto' : `${zoom}%`,
                maxWidth: zoom === 100 ? '100%' : 'none',
              }}
              className="mx-auto overflow-hidden rounded-xl border border-border/80 bg-white p-2 shadow-md transition-[width] duration-150"
            >
              <img
                src={resolution.blobUrl}
                alt={noteTitle}
                onError={() => setImageLoadError(true)}
                style={{ transform: `rotate(${imageRotation}deg)` }}
                className={cn(
                  'mx-auto block object-contain transition-transform duration-200',
                  fullscreen ? 'max-h-[calc(100dvh-120px)]' : 'max-h-[480px]',
                )}
              />
            </div>
          </div>
        ) : /* 7. TEXT VIEWER */ isText && textContent !== null ? (
          <div
            style={{
              width: zoom === 100 ? '100%' : `${zoom}%`,
              maxWidth: zoom === 100 ? '820px' : 'none',
            }}
            className="mx-auto rounded-2xl border border-border/80 bg-white p-5 text-slate-900 shadow-md"
          >
            <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed">
              {textContent}
            </pre>
          </div>
        ) : (
          /* 8. UNSUPPORTED / LEGACY BINARY (.ppt / .doc / zip / etc.) -> SAFE DOWNLOAD */
          <div className="flex min-h-[300px] flex-col items-center justify-center gap-4 p-6 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
              <KindIcon className="h-8 w-8" />
            </div>
            <div className="max-w-md space-y-1.5">
              <p className="text-sm font-extrabold text-foreground">{resolution.fileName}</p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {fileKind === 'ppt_legacy'
                  ? 'Eski ikili PowerPoint (.ppt) formatı tarayıcı içinde doğrudan çözümlenemez. Dosyayı güvenli olarak indirip inceleyebilirsiniz.'
                  : fileKind === 'doc_legacy'
                  ? 'Eski ikili Word (.doc) formatı tarayıcı içinde doğrudan çözümlenemez. Dosyayı güvenli olarak indirip inceleyebilirsiniz.'
                  : 'Bu dosya biçimi tarayıcı içi önizlemeyi teknik olarak desteklemiyor. Dosyayı yetkili yönetici oturumunuzla güvenli şekilde indirip inceleyebilirsiniz.'}
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button
                type="button"
                onClick={handleDownload}
                className="gap-2 rounded-xl bg-gradient-to-r from-[#003791] via-[#0055b8] to-[#0070d1] font-bold text-white hover:opacity-95"
              >
                <Download className="h-4 w-4" />
                Dosyayı Güvenli İndir
              </Button>
              {resolution.signedUrl && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleOpenNewTab}
                  className="gap-1.5 rounded-xl"
                >
                  <ExternalLink className="h-4 w-4" />
                  Yeni Sekmede Aç
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return viewerShell;
};

export default AdminDocumentViewer;
