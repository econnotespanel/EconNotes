import { Cloud, Cpu, Gauge, Lock, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { NeuralEngineState } from '@/lib/neural/neuralEngine';

interface NeuralStatusPillProps {
  engine: NeuralEngineState;
  onClick?: () => void;
  compact?: boolean;
}

export function NeuralStatusPill({ engine, onClick, compact = false }: NeuralStatusPillProps) {
  const gpuReady = engine.llmStatus === 'ready' || engine.llmStatus === 'generating';
  const downloading = engine.llmStatus === 'downloading' || engine.llmStatus === 'compiling';
  const isPrivacy = engine.prefs.routingPolicy === 'local_privacy';
  const hasWebGpu = Boolean(engine.hardware?.webgpuSupported);

  const label = isPrivacy
    ? gpuReady
      ? 'Yerel GPU · Gizli'
      : 'Yerel Gizlilik Modu'
    : downloading
    ? `GPU Yükleniyor %${Math.round(engine.downloadProgress * 100)}`
    : gpuReady
    ? `WebGPU Aktif${engine.lastTokensPerSec > 0 ? ` · ${engine.lastTokensPerSec} tok/sn` : ''}`
    : hasWebGpu
    ? 'Hibrit Hazır (WebGPU + Bulut)'
    : 'Bulut AI Akademik Motor';

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
        gpuReady
          ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300'
          : downloading
          ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-600 dark:text-cyan-300'
          : isPrivacy
          ? 'border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-300'
          : hasWebGpu
          ? 'border-primary/35 bg-primary/10 text-primary'
          : 'border-border bg-muted/60 text-muted-foreground',
      )}
    >
      <span
        className={cn(
          'h-2 w-2 rounded-full',
          gpuReady
            ? 'bg-emerald-500 neural-pulse-dot'
            : downloading
            ? 'bg-cyan-400 animate-ping'
            : hasWebGpu
            ? 'bg-primary'
            : 'bg-sky-500',
        )}
      />
      {isPrivacy ? (
        <Lock className="h-3.5 w-3.5 shrink-0" />
      ) : gpuReady ? (
        <Zap className="h-3.5 w-3.5 shrink-0" />
      ) : hasWebGpu ? (
        <Cpu className="h-3.5 w-3.5 shrink-0" />
      ) : (
        <Cloud className="h-3.5 w-3.5 shrink-0" />
      )}
      <span className={cn(compact && 'hidden sm:inline')}>{label}</span>
      {!compact && engine.peakTokensPerSec > 0 && (
        <span className="hidden md:inline-flex items-center gap-1 border-l border-current/25 pl-2 opacity-80">
          <Gauge className="h-3 w-3" />
          Zirve {engine.peakTokensPerSec} t/s
        </span>
      )}
    </button>
  );
}
