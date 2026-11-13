import {
  Activity,
  CheckCircle2,
  Cloud,
  Cpu,
  Download,
  Gauge,
  HardDrive,
  Loader2,
  Play,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Zap,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  estimateModelFit,
  LOCAL_EMBEDDING_MODEL,
  LOCAL_MODEL_CATALOG,
} from '@/lib/neural/hardwareProbe';
import { neuralEngine, type NeuralEngineState, type RoutingPolicy } from '@/lib/neural/neuralEngine';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface NeuralEnginePanelViewProps {
  engine: NeuralEngineState;
}

const POLICIES: Array<{ id: RoutingPolicy; title: string; desc: string }> = [
  {
    id: 'auto',
    title: 'Akıllı Hibrit (Önerilen)',
    desc: 'Anlık sohbet & RAG hazır olduğunda yerel WebGPU; uzun özet ve video senaryosu bulut AI.',
  },
  {
    id: 'gpu_prefer',
    title: 'Önce Yerel GPU',
    desc: 'Uygun tüm görevleri cihaz GPU’suna yönlendirir, GPU yüklü değilse buluta geçer.',
  },
  {
    id: 'local_privacy',
    title: 'Tamamen Yerel Gizlilik',
    desc: 'Harici sunuculara veri göndermez; tüm RAG ve soru-cevap yalnızca cihazda çalışır.',
  },
  {
    id: 'cloud_only',
    title: 'Yalnızca Bulut Akademik AI',
    desc: 'GPU belleğini kullanmadan tüm üretimleri yüksek kapasiteli bulut modellerle yürütür.',
  },
];

export function NeuralEnginePanelView({ engine }: NeuralEnginePanelViewProps) {
  const hw = engine.hardware;

  const handleDownloadModel = async (modelId: string) => {
    try {
      await neuralEngine.enableAndLoadModel(modelId);
      toast.success(`${modelId} ekran kartınıza yüklendi ve hazır!`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Model yüklenemedi.');
    }
  };

  const handleLoadEmbedder = async () => {
    await neuralEngine.loadEmbedder();
    if (neuralEngine.getSnapshot().embedderStatus === 'ready') {
      toast.success('Çok dilli anlamsal vektör motoru hazır.');
    } else {
      toast.error('Embedding motoru başlatılamadı; kelime tabanlı hibrit arama aktif kalır.');
    }
  };

  const handleBenchmark = async () => {
    const res = await neuralEngine.runBenchmark();
    toast.success(
      res.gpuComputeMs
        ? `GPU Compute: ${res.gpuComputeMs} ms · CPU: ${res.cpuScoreMs} ms`
        : `CPU Skoru: ${res.cpuScoreMs} ms (WebGPU Compute yok)`,
    );
  };

  const chartSeries = [...engine.telemetry]
    .slice(0, 8)
    .reverse()
    .map((t, i) => ({
      name: `${i + 1}. ${t.task.slice(0, 12)}`,
      latencyMs: t.latencyMs,
      tps: t.tokensPerSec ?? 0,
    }));

  return (
    <div className="space-y-5">
      {/* Hardware Telemetry Header */}
      <div className="neural-card p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-base font-bold">
              <Cpu className="h-5 w-5 text-cyan-500" />
              Donanım Algılama & WebGPU Komuta Merkezi
            </h2>
            <p className="text-xs text-muted-foreground">
              Cihazınızın işlemci ve ekran kartı yeteneklerini canlı denetleyin; yerel yapay zekâ modelleri yalnızca sizin onayınızla indirilir.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={engine.probing}
              onClick={() => void neuralEngine.reprobeHardware()}
              className="gap-1.5 text-xs"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', engine.probing && 'animate-spin')} />
              Donanımı Tara
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={engine.benchmarking}
              onClick={() => void handleBenchmark()}
              className="gap-1.5 text-xs"
            >
              {engine.benchmarking ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Gauge className="h-3.5 w-3.5" />
              )}
              GPU + CPU Benchmark
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <div className="rounded-xl border border-border/60 bg-background/60 p-3">
            <p className="text-[10px] uppercase text-muted-foreground">WebGPU API</p>
            <p className="mt-1 text-sm font-bold">
              {hw?.webgpuSupported ? 'Aktif' : 'Desteklenmiyor'}
            </p>
          </div>
          <div className="rounded-xl border border-border/60 bg-background/60 p-3">
            <p className="text-[10px] uppercase text-muted-foreground">Ekran Kartı</p>
            <p className="mt-1 truncate text-xs font-bold">
              {hw?.adapter?.device || 'Algılanmadı'}
            </p>
          </div>
          <div className="rounded-xl border border-border/60 bg-background/60 p-3">
            <p className="text-[10px] uppercase text-muted-foreground">FP16 Shader</p>
            <p className="mt-1 text-sm font-bold">
              {hw?.adapter?.shaderF16 ? 'Destekli (2x Hız)' : hw?.adapter ? 'FP32' : '—'}
            </p>
          </div>
          <div className="rounded-xl border border-border/60 bg-background/60 p-3">
            <p className="text-[10px] uppercase text-muted-foreground">Max Buffer</p>
            <p className="mt-1 text-sm font-bold">
              {hw?.adapter ? `${hw.adapter.maxBufferSizeMb} MB` : '—'}
            </p>
          </div>
          <div className="rounded-xl border border-border/60 bg-background/60 p-3">
            <p className="text-[10px] uppercase text-muted-foreground">İşlemci / RAM</p>
            <p className="mt-1 text-sm font-bold">
              {hw?.cpuCores || 4} Çekirdek{hw?.deviceMemoryGb ? ` · ${hw.deviceMemoryGb} GB` : ''}
            </p>
          </div>
          <div className="rounded-xl border border-border/60 bg-background/60 p-3">
            <p className="text-[10px] uppercase text-muted-foreground">Benchmark</p>
            <p className="mt-1 text-xs font-bold">
              {engine.benchmark
                ? engine.benchmark.gpuComputeMs
                  ? `GPU ${engine.benchmark.gpuComputeMs} ms`
                  : `CPU ${engine.benchmark.cpuScoreMs} ms`
                : 'Test edilmedi'}
            </p>
          </div>
        </div>
      </div>

      {/* Routing Policy */}
      <div className="neural-card p-5">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-bold">
          <ShieldCheck className="h-4 w-4 text-primary" />
          Akıllı Motor Yönlendirme Politikası
        </h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {POLICIES.map((pol) => {
            const active = engine.prefs.routingPolicy === pol.id;
            return (
              <button
                key={pol.id}
                type="button"
                onClick={() => neuralEngine.setPrefs({ routingPolicy: pol.id })}
                className={cn(
                  'rounded-xl border p-3.5 text-left transition-all',
                  active
                    ? 'border-primary bg-primary/10 shadow-sm'
                    : 'border-border/60 bg-background/60 hover:bg-muted/60',
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold">{pol.title}</span>
                  {active && <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />}
                </div>
                <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
                  {pol.desc}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Opt-in WebLLM Catalog & Vector Embedder */}
      <div className="grid gap-5 lg:grid-cols-12">
        <div className="neural-card p-5 lg:col-span-8">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="flex items-center gap-2 text-sm font-bold">
                <Zap className="h-4 w-4 text-emerald-500" />
                Ekran Kartı Üzerinde Yerel Yapay Zekâ Modelleri (WebLLM)
              </h3>
              <p className="text-xs text-muted-foreground">
                İndirilen ağırlıklar tarayıcınızın kalıcı önbelleğinde saklanır; sonraki açılışlarda internet gerektirmez.
              </p>
            </div>
            {engine.activeModelId && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void neuralEngine.unloadModel()}
                className="text-xs"
              >
                VRAM’den Boşalt
              </Button>
            )}
          </div>

          {(engine.llmStatus === 'downloading' || engine.llmStatus === 'compiling') && (
            <div className="mb-4 rounded-xl border border-cyan-500/40 bg-cyan-500/10 p-3.5">
              <div className="mb-1.5 flex items-center justify-between text-xs">
                <span className="font-semibold text-cyan-600 dark:text-cyan-300">
                  {engine.downloadText || 'Model hazırlanıyor...'}
                </span>
                <span className="font-mono font-bold">
                  %{Math.round(engine.downloadProgress * 100)}
                </span>
              </div>
              <Progress value={Math.round(engine.downloadProgress * 100)} className="h-2" />
            </div>
          )}

          <div className="space-y-2.5">
            {LOCAL_MODEL_CATALOG.map((spec) => {
              const fit = hw ? estimateModelFit(spec, hw) : 'fits';
              const isActive = engine.activeModelId === spec.id && engine.llmStatus === 'ready';
              const isCached = engine.prefs.downloadedModels.includes(spec.id);
              const isBusy =
                engine.llmStatus === 'downloading' || engine.llmStatus === 'compiling';

              return (
                <div
                  key={spec.id}
                  className={cn(
                    'flex flex-col justify-between gap-3 rounded-xl border p-3.5 sm:flex-row sm:items-center',
                    isActive
                      ? 'border-emerald-500/50 bg-emerald-500/10'
                      : 'border-border/60 bg-background/60',
                  )}
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-bold">{spec.label}</span>
                      {hw?.recommendedModelId === spec.id && (
                        <Badge variant="default" className="text-[10px]">
                          Önerilen
                        </Badge>
                      )}
                      {isActive && (
                        <Badge className="bg-emerald-600 text-[10px] text-white">
                          GPU’da Aktif
                        </Badge>
                      )}
                      {isCached && !isActive && (
                        <Badge variant="outline" className="text-[10px]">
                          Önbellekte
                        </Badge>
                      )}
                      {fit === 'unsupported' && (
                        <Badge variant="outline" className="border-destructive/40 text-[10px] text-destructive">
                          Donanım Uyumsuz
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">{spec.description}</p>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      İndirme: ~{spec.downloadEstimateMb} MB · Gerekli VRAM: {spec.vramRequiredMb} MB
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      disabled={isBusy || fit === 'unsupported' || !hw?.webgpuSupported}
                      onClick={() => void handleDownloadModel(spec.id)}
                      className="gap-1.5 text-xs"
                    >
                      {isActive ? <Play className="h-3.5 w-3.5" /> : <Download className="h-3.5 w-3.5" />}
                      {isActive ? 'Hazır' : isCached ? 'GPU’ya Yükle' : 'İndir & Başlat'}
                    </Button>
                    {isCached && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => void neuralEngine.deleteModelCache(spec.id)}
                        title="Önbellekten sil"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Col: Semantic Embedder + Live Telemetry Chart */}
        <div className="space-y-5 lg:col-span-4">
          <div className="neural-card p-5">
            <h3 className="flex items-center gap-2 text-sm font-bold">
              <HardDrive className="h-4 w-4 text-cyan-500" />
              Anlamsal Vektör Motoru
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Not pasajlarını tarayıcı içinde vektör uzayına çevirerek RAG araması yapar ({LOCAL_EMBEDDING_MODEL}).
            </p>
            <div className="mt-3 flex items-center justify-between rounded-xl border border-border/60 bg-background/60 p-3 text-xs">
              <span>Durum</span>
              <Badge variant={engine.embedderStatus === 'ready' ? 'default' : 'outline'} className="text-[10px]">
                {engine.embedderStatus === 'ready'
                  ? `Hazır (${engine.embedderDevice?.toUpperCase()})`
                  : engine.embedderStatus === 'loading'
                  ? 'Yükleniyor...'
                  : 'Beklemede (~120 MB)'}
              </Badge>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={engine.embedderStatus === 'loading' || engine.embedderStatus === 'ready'}
              onClick={() => void handleLoadEmbedder()}
              className="mt-3 w-full gap-1.5 text-xs"
            >
              {engine.embedderStatus === 'loading' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
              {engine.embedderStatus === 'ready' ? 'Vektör Motoru Aktif' : 'Embedding Motorunu Başlat'}
            </Button>
          </div>

          <div className="neural-card p-5">
            <h3 className="mb-2 flex items-center gap-2 text-sm font-bold">
              <Activity className="h-4 w-4 text-violet-500" />
              Canlı Performans & Token/sn
            </h3>
            <div className="mb-3 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg border border-border/60 bg-background/60 p-2">
                <span className="text-[10px] text-muted-foreground">Zirve Hız</span>
                <p className="font-mono font-bold text-emerald-500">
                  {engine.peakTokensPerSec} tok/sn
                </p>
              </div>
              <div className="rounded-lg border border-border/60 bg-background/60 p-2">
                <span className="text-[10px] text-muted-foreground">Toplam Yerel</span>
                <p className="font-mono font-bold">{engine.totalLocalTokens} token</p>
              </div>
            </div>

            {chartSeries.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-4 text-center text-[11px] text-muted-foreground">
                AI sohbeti veya RAG sorusu çalıştırıldığında canlı gecikme ve hız grafiği burada görünür.
              </div>
            ) : (
              <div className="h-36 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartSeries}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                    <Tooltip />
                    <Bar dataKey="latencyMs" name="Gecikme (ms)" fill="#06b6d4" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {engine.telemetry.slice(0, 4).map((t) => (
              <div
                key={t.id}
                className="mt-2 flex items-center justify-between border-t border-border/40 pt-1.5 text-[11px]"
              >
                <span className="flex items-center gap-1.5 truncate">
                  {t.engine === 'gpu' ? (
                    <Zap className="h-3 w-3 text-emerald-500" />
                  ) : (
                    <Cloud className="h-3 w-3 text-sky-500" />
                  )}
                  <span className="truncate">{t.task}</span>
                </span>
                <span className="font-mono text-muted-foreground">
                  {t.tokensPerSec ? `${t.tokensPerSec} t/s · ` : ''}
                  {t.latencyMs}ms
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
