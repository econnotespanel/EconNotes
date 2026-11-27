import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Clock,
  FileText,
  Layers,
  Loader2,
  Play,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  XCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { SUMMARY_PIPELINE_STAGES } from '@/lib/studySummaryPipeline';
import { cn } from '@/lib/utils';
import type { SummaryJobState } from '@/types/study';
import { STUDIO_BADGE_COURSE, STUDIO_BTN_PRIMARY, STUDIO_BTN_SECONDARY } from './studioDesign';

interface SummaryAnalysisProgressViewProps {
  job: SummaryJobState;
  isLiveInMemory: boolean;
  onMinimizeToWorkspace: () => void;
  onResumeJob: (jobId: string) => void;
  onRestartJob: () => void;
  onCancelJob: (jobId: string) => void;
  onOpenCompleted?: () => void;
}

const DISCIPLINE_LABELS: Record<SummaryJobState['disciplineFamily'], string> = {
  economics: 'İktisat & Para Teorisi',
  history: 'Tarih & İktisat Tarihi',
  law: 'Hukuk Bilimleri',
  statistics: 'İstatistik & Ekonometri',
  engineering: 'Mühendislik & Fen',
  medical: 'Tıp & Sağlık Bilimleri',
  general: 'Genel Akademik',
};

export function SummaryAnalysisProgressView({
  job,
  isLiveInMemory,
  onMinimizeToWorkspace,
  onResumeJob,
  onRestartJob,
  onCancelJob,
  onOpenCompleted,
}: SummaryAnalysisProgressViewProps) {
  const statusMeta = useMemo(() => {
    if (job.status === 'completed') {
      return {
        label: 'Tamamlandı',
        cls: 'border-emerald-500/35 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
      };
    }
    if (job.status === 'failed') {
      return {
        label: 'Hata Oluştu',
        cls: 'border-rose-500/35 bg-rose-500/15 text-rose-700 dark:text-rose-300',
      };
    }
    if (job.status === 'queued') {
      return {
        label: 'Kuyrukta',
        cls: 'border-amber-500/35 bg-amber-500/15 text-amber-700 dark:text-amber-300',
      };
    }
    return {
      label: isLiveInMemory ? 'İşleniyor' : 'Devam Ettirilmeye Hazır',
      cls: 'border-primary/35 bg-primary/15 text-primary',
    };
  }, [job.status, isLiveInMemory]);

  const needsManualResume =
    (job.status === 'processing' || job.status === 'queued') && !isLiveInMemory;

  // Strictly never display 100% unless status === 'completed'
  const safePct =
    job.status === 'completed'
      ? 100
      : Math.min(99, Math.max(0, Math.round(job.progressPct || 0)));

  // Real elapsed timer & real throughput-based ETA (NEVER artificial/fake countdown)
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (job.status !== 'processing' || !isLiveInMemory) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [job.status, isLiveInMemory]);

  const timingInfo = useMemo(() => {
    const startMs = Date.parse(job.startedAt || '');
    if (!Number.isFinite(startMs)) return { elapsedLabel: null, etaLabel: null };
    const endRef =
      job.status === 'completed' && job.completedAt
        ? Date.parse(job.completedAt)
        : nowMs;
    const elapsedSec = Math.max(0, Math.floor((endRef - startMs) / 1000));
    const fmt = (sec: number) => {
      if (sec < 60) return `${sec} sn`;
      const m = Math.floor(sec / 60);
      const s = sec % 60;
      return s > 0 ? `${m} dk ${s} sn` : `${m} dk`;
    };
    const elapsedLabel = fmt(elapsedSec);
    if (job.status !== 'processing' || !isLiveInMemory || safePct < 8 || elapsedSec < 2) {
      return { elapsedLabel, etaLabel: null };
    }
    const remainingSec = Math.max(2, Math.round((elapsedSec / safePct) * (100 - safePct)));
    return {
      elapsedLabel,
      etaLabel: `~${fmt(Math.min(remainingSec, 3600))}`,
    };
  }, [job.startedAt, job.completedAt, job.status, isLiveInMemory, safePct, nowMs]);

  const activeStageDef =
    SUMMARY_PIPELINE_STAGES.find((s) => s.stage === job.currentStage) || SUMMARY_PIPELINE_STAGES[0];

  return (
    <div
      data-testid="summary-analysis-progress-screen"
      className="mx-auto w-full max-w-4xl space-y-5 px-2 py-4 sm:px-4"
    >
      {/* Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-2xl border border-border/80 bg-card px-4 py-3 shadow-sm">
        <div className="flex min-w-0 items-center gap-2.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onMinimizeToWorkspace}
            className={cn(STUDIO_BTN_SECONDARY, 'gap-1.5')}
          >
            <ArrowLeft className="h-4 w-4" />
            Stüdyoya Dön (Arka Planda Devam Eder)
          </Button>
          <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold', statusMeta.cls)}>
            {(job.status === 'processing' || job.status === 'queued') && isLiveInMemory && (
              <Loader2 className="h-3 w-3 animate-spin" />
            )}
            {job.status === 'completed' && <CheckCircle2 className="h-3 w-3" />}
            {job.status === 'failed' && <XCircle className="h-3 w-3" />}
            {statusMeta.label}
          </span>
        </div>

        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="font-mono">Görev: {job.id.slice(0, 8)}</span>
        </div>
      </div>

      {/* Main Hero Progress Card */}
      <div className="relative overflow-hidden rounded-3xl border border-primary/25 bg-card p-5 sm:p-7 shadow-[0_18px_50px_-18px_rgba(0,55,145,0.22)]">
        <div className="pointer-events-none absolute -right-14 -top-14 h-52 w-52 rounded-full bg-primary/10 blur-3xl" />
        <div className="pointer-events-none absolute -left-14 bottom-0 h-44 w-44 rounded-full bg-cyan-500/10 blur-3xl" />

        <div className="relative z-10 space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-1.5 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className={STUDIO_BADGE_COURSE}>
                  <BookOpen className="h-3.5 w-3.5" />
                  {job.course || 'Akademik Ders Analizi'}
                </span>
                <Badge variant="outline" className="text-[11px]">
                  {DISCIPLINE_LABELS[job.disciplineFamily] || 'Genel Akademik'}
                </Badge>
              </div>
              <h1 className="text-lg sm:text-2xl font-bold tracking-tight text-foreground">
                {job.status === 'completed'
                  ? 'Akademik ders özetiniz ve PDF belgeniz hazır!'
                  : job.status === 'failed'
                  ? 'Analiz sırasında bir hata oluştu'
                  : 'Ders notlarınız ayrıntılı olarak analiz ediliyor...'}
              </h1>
              <p className="text-xs sm:text-sm text-muted-foreground truncate max-w-2xl">
                Belge: <strong className="text-foreground">{job.title}</strong>
              </p>
            </div>

            <div className="shrink-0 rounded-2xl border border-primary/25 bg-primary/[0.06] px-4 py-2.5 text-right">
              <div
                data-testid="summary-progress-pct"
                className="font-mono text-2xl sm:text-3xl font-extrabold text-primary tabular-nums"
              >
                %{safePct}
              </div>
              <div className="text-[11px] font-semibold text-muted-foreground">Tamamlandı</div>
            </div>
          </div>

          {/* Real Progress Bar */}
          <div className="space-y-2.5">
            <Progress value={safePct} className="h-3 rounded-full" />
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs sm:text-sm">
              <span
                data-testid="summary-pages-counter"
                className="inline-flex items-center gap-1.5 font-semibold text-foreground"
              >
                <FileText className="h-4 w-4 text-primary" />
                Sayfalar inceleniyor: {job.processedPages} / {job.totalPages}
              </span>
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <Layers className="h-3.5 w-3.5 text-primary" />
                Bölüm analizi: {job.completedChunks} / {job.totalChunks}
              </span>
              {timingInfo.elapsedLabel && (
                <span
                  data-testid="summary-eta-indicator"
                  className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
                >
                  <Clock className="h-3.5 w-3.5 text-primary" />
                  Geçen: {timingInfo.elapsedLabel}
                  {timingInfo.etaLabel ? ` · Tahmini kalan: ${timingInfo.etaLabel}` : ''}
                </span>
              )}
            </div>
          </div>

          {/* Current Stage Description Banner */}
          <div className="rounded-2xl border border-border/80 bg-muted/30 px-4 py-3 text-xs sm:text-sm">
            <div className="flex items-center gap-2 font-semibold text-foreground">
              {job.status === 'processing' && isLiveInMemory ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
              ) : job.status === 'completed' ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
              ) : job.status === 'failed' ? (
                <AlertTriangle className="h-4 w-4 shrink-0 text-rose-500" />
              ) : (
                <Clock className="h-4 w-4 shrink-0 text-amber-500" />
              )}
              <span>
                Mevcut aşama ({job.currentStage}/10): {activeStageDef.label}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
              {job.status === 'failed'
                ? job.errorMessage || 'Beklenmeyen bir hata oluştu.'
                : job.stageLabel}
            </p>
          </div>

          {/* Document Recognition Stats (Stage 1-3 Output) */}
          {job.documentProfile && (
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <div className="rounded-xl border border-border/70 bg-background/70 p-3">
                <div className="text-[11px] text-muted-foreground">Toplam Sayfa / Slayt</div>
                <div className="mt-0.5 text-sm font-bold text-foreground">
                  {job.documentProfile.totalPagesOrSlides}
                </div>
              </div>
              <div className="rounded-xl border border-border/70 bg-background/70 p-3">
                <div className="text-[11px] text-muted-foreground">Tespit Edilen Başlık</div>
                <div className="mt-0.5 text-sm font-bold text-foreground">
                  {job.documentProfile.headingsCount} ana · {job.documentProfile.subheadingsCount} alt
                </div>
              </div>
              <div className="rounded-xl border border-border/70 bg-background/70 p-3">
                <div className="text-[11px] text-muted-foreground">Formül / Tablo / Grafik</div>
                <div className="mt-0.5 text-sm font-bold text-foreground">
                  {job.documentProfile.formulasCount} · {job.documentProfile.tablesCount} ·{' '}
                  {job.documentProfile.figuresOrChartsCount}
                </div>
              </div>
              <div className="rounded-xl border border-border/70 bg-background/70 p-3">
                <div className="text-[11px] text-muted-foreground">İçerik Yoğunluğu</div>
                <div className="mt-0.5 text-sm font-bold text-foreground">
                  {job.documentProfile.totalWords.toLocaleString('tr-TR')} kelime
                </div>
              </div>
            </div>
          )}

          {/* Unreadable Pages Transparency Warning */}
          {job.documentProfile?.warnings && job.documentProfile.warnings.length > 0 && (
            <div className="rounded-xl border border-amber-500/35 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-100">
              <p className="font-bold flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                Belge Okuma Uyarısı
              </p>
              <ul className="mt-1 space-y-0.5">
                {job.documentProfile.warnings.map((w, i) => (
                  <li key={i}>• {w}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Action Controls for Interrupted / Failed / Completed / Running states */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <div className="flex flex-wrap items-center gap-2">
              {(needsManualResume || job.status === 'failed') && (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => onResumeJob(job.id)}
                  className={cn(STUDIO_BTN_PRIMARY, 'gap-1.5')}
                >
                  <Play className="h-4 w-4" />
                  {job.completedChunks > 0
                    ? `Kaldığı Yerden Devam Et (${job.completedChunks}/${job.totalChunks} bölüm korundu)`
                    : 'Analizi Devam Ettir'}
                </Button>
              )}
              {job.status === 'failed' && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={onRestartJob}
                  className={cn(STUDIO_BTN_SECONDARY, 'gap-1.5')}
                >
                  <RefreshCw className="h-4 w-4" />
                  Baştan Başlat
                </Button>
              )}
              {job.status === 'completed' && onOpenCompleted && (
                <Button
                  type="button"
                  size="sm"
                  onClick={onOpenCompleted}
                  className={cn(STUDIO_BTN_PRIMARY, 'gap-1.5')}
                >
                  <Sparkles className="h-4 w-4" />
                  Özeti Görüntüle &amp; PDF İndir
                </Button>
              )}
            </div>

            {job.status === 'processing' && isLiveInMemory && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => onCancelJob(job.id)}
                className="text-xs text-muted-foreground hover:text-destructive"
              >
                Analizi Durdur
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* 10-Stage Live Pipeline Checklist */}
      <div className="rounded-3xl border border-border/80 bg-card p-5 shadow-sm">
        <div className="mb-3.5 flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-sm font-bold text-foreground">
            <ShieldCheck className="h-4 w-4 text-primary" />
            10 Aşamalı Çok Katmanlı Akademik Analiz Süreci
          </h2>
          <span className="text-[11px] text-muted-foreground">
            Tamamlanan bölümler otomatik saklanır; sayfa yenilense bile kaybolmaz.
          </span>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          {SUMMARY_PIPELINE_STAGES.map((st) => {
            const isDone = job.status === 'completed' || job.currentStage > st.stage;
            const isCurrent = job.status !== 'completed' && job.currentStage === st.stage;
            const isFailedHere = job.status === 'failed' && isCurrent;

            return (
              <div
                key={st.stage}
                className={cn(
                  'flex items-center gap-3 rounded-xl border px-3 py-2.5 text-xs transition-all',
                  isFailedHere
                    ? 'border-rose-500/45 bg-rose-500/10 text-rose-700 dark:text-rose-200'
                    : isDone
                    ? 'border-emerald-500/35 bg-emerald-500/10 text-foreground'
                    : isCurrent
                    ? 'border-primary/45 bg-primary/10 text-foreground font-semibold'
                    : 'border-border/60 bg-background/50 text-muted-foreground',
                )}
              >
                <span
                  className={cn(
                    'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold',
                    isFailedHere
                      ? 'bg-rose-500 text-white'
                      : isDone
                      ? 'bg-emerald-500 text-white'
                      : isCurrent
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground',
                  )}
                >
                  {isFailedHere ? (
                    <XCircle className="h-3.5 w-3.5" />
                  ) : isDone ? (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  ) : isCurrent && isLiveInMemory ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    st.stage
                  )}
                </span>
                <span className="min-w-0 truncate">{st.label}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
