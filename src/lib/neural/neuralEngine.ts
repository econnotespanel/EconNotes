/**
 * Main-thread singleton controller & observable React store for WebGPU Local AI.
 * Lazily spawns neuralEngine.worker.ts only on user opt-in, streams tokens with
 * live tokens/sec telemetry, and never blocks or fails outside browser environments.
 */

import {
  probeHardware,
  type HardwareProfile,
  LOCAL_MODEL_CATALOG,
} from '@/lib/neural/hardwareProbe';
import type {
  ChatTurnMessage,
  WorkerCommand,
  WorkerOutboundMessage,
} from '@/lib/neural/neuralEngine.worker';

export type RoutingPolicy = 'auto' | 'gpu_prefer' | 'cloud_only' | 'local_privacy';
export type LlmLoadStatus =
  | 'idle'
  | 'downloading'
  | 'compiling'
  | 'ready'
  | 'generating'
  | 'error';

export interface TelemetryEntry {
  id: string;
  timestamp: number;
  task: string;
  engine: 'gpu' | 'cloud' | 'local';
  model: string;
  tokensPerSec: number | null;
  latencyMs: number;
}

export interface BenchmarkResult {
  ranAt: number;
  cpuScoreMs: number;
  gpuComputeMs: number | null;
  gpuActive: boolean;
}

export interface NeuralPrefs {
  routingPolicy: RoutingPolicy;
  selectedModelId: string;
  downloadedModels: string[];
}

export interface NeuralEngineState {
  hardware: HardwareProfile | null;
  probing: boolean;
  llmStatus: LlmLoadStatus;
  activeModelId: string | null;
  downloadProgress: number;
  downloadText: string;
  llmError: string | null;
  embedderStatus: 'idle' | 'loading' | 'ready' | 'error';
  embedderDevice: 'webgpu' | 'wasm' | null;
  lastTokensPerSec: number;
  peakTokensPerSec: number;
  totalLocalTokens: number;
  benchmark: BenchmarkResult | null;
  benchmarking: boolean;
  telemetry: TelemetryEntry[];
  prefs: NeuralPrefs;
}

const PREFS_KEY = 'econnotes:neural:prefs_v1';

function readInitialPrefs(): NeuralPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<NeuralPrefs>;
      return {
        routingPolicy: parsed.routingPolicy || 'auto',
        selectedModelId: parsed.selectedModelId || LOCAL_MODEL_CATALOG[2].id,
        downloadedModels: Array.isArray(parsed.downloadedModels) ? parsed.downloadedModels : [],
      };
    }
  } catch {
    // ignore in SSR/test
  }
  return {
    routingPolicy: 'auto',
    selectedModelId: LOCAL_MODEL_CATALOG[2].id,
    downloadedModels: [],
  };
}

function persistPrefs(prefs: NeuralPrefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // ignore
  }
}

class NeuralEngineManager {
  private state: NeuralEngineState = {
    hardware: null,
    probing: false,
    llmStatus: 'idle',
    activeModelId: null,
    downloadProgress: 0,
    downloadText: '',
    llmError: null,
    embedderStatus: 'idle',
    embedderDevice: null,
    lastTokensPerSec: 0,
    peakTokensPerSec: 0,
    totalLocalTokens: 0,
    benchmark: null,
    benchmarking: false,
    telemetry: [],
    prefs: readInitialPrefs(),
  };

  private listeners = new Set<() => void>();
  private worker: Worker | null = null;
  private pending = new Map<
    string,
    {
      resolve: (val: unknown) => void;
      reject: (err: Error) => void;
      onToken?: (delta: string, tps: number) => void;
    }
  >();
  private reqCounter = 0;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): NeuralEngineState => this.state;

  private update(patch: Partial<NeuralEngineState>) {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }

  setPrefs(patch: Partial<NeuralPrefs>) {
    const next: NeuralPrefs = { ...this.state.prefs, ...patch };
    persistPrefs(next);
    this.update({ prefs: next });
  }

  recordTelemetry(entry: Omit<TelemetryEntry, 'id' | 'timestamp'>) {
    const item: TelemetryEntry = {
      ...entry,
      id: `tel-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: Date.now(),
    };
    this.update({
      telemetry: [item, ...this.state.telemetry].slice(0, 20),
    });
  }

  async ensureProbed(): Promise<HardwareProfile> {
    if (this.state.hardware) return this.state.hardware;
    return this.reprobeHardware();
  }

  async reprobeHardware(): Promise<HardwareProfile> {
    this.update({ probing: true });
    try {
      const hw = await probeHardware();
      // If user hasn't explicitly chosen a model yet, align default with detected tier
      let nextPrefs = this.state.prefs;
      if (!localStorage.getItem(PREFS_KEY) && hw.recommendedModelId) {
        nextPrefs = { ...nextPrefs, selectedModelId: hw.recommendedModelId };
        persistPrefs(nextPrefs);
      }
      this.update({ hardware: hw, probing: false, prefs: nextPrefs });
      return hw;
    } catch {
      const fallbackHw = await probeHardware();
      this.update({ hardware: fallbackHw, probing: false });
      return fallbackHw;
    }
  }

  private getWorker(): Worker {
    if (typeof Worker === 'undefined') {
      throw new Error('Bu ortam Web Worker desteklemiyor.');
    }
    if (this.worker) return this.worker;

    const w = new Worker(new URL('./neuralEngine.worker.ts', import.meta.url), {
      type: 'module',
    });

    w.onmessage = (ev: MessageEvent<WorkerOutboundMessage>) => {
      const msg = ev.data;
      if (msg.event === 'progress') {
        if (msg.task === 'llm') {
          const pct = Math.max(0, Math.min(1, msg.progress));
          this.update({
            llmStatus: pct >= 0.99 ? 'compiling' : 'downloading',
            downloadProgress: pct,
            downloadText: msg.text,
          });
        }
        return;
      }
      if (msg.event === 'token') {
        const entry = this.pending.get(msg.id);
        this.update({ lastTokensPerSec: msg.tokensPerSec });
        entry?.onToken?.(msg.delta, msg.tokensPerSec);
        return;
      }
      if (msg.event === 'result') {
        const entry = this.pending.get(msg.id);
        if (entry) {
          this.pending.delete(msg.id);
          entry.resolve(msg.result);
        }
        return;
      }
      if (msg.event === 'error') {
        const entry = this.pending.get(msg.id);
        if (entry) {
          this.pending.delete(msg.id);
          entry.reject(new Error(msg.message));
        }
      }
    };

    w.onerror = (ev) => {
      for (const [, p] of this.pending.entries()) {
        p.reject(new Error(ev.message || 'WebGPU Worker beklenmedik şekilde sonlandı.'));
      }
      this.pending.clear();
      this.update({ llmStatus: 'error', llmError: ev.message || 'Worker hatası' });
    };

    this.worker = w;
    return w;
  }

  private callWorker<T>(
    cmd: Omit<WorkerCommand, 'id'> & Record<string, unknown>,
    onToken?: (delta: string, tps: number) => void,
  ): Promise<T> {
    const id = `cmd-${++this.reqCounter}`;
    const w = this.getWorker();
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, {
        resolve: resolve as (v: unknown) => void,
        reject,
        onToken,
      });
      w.postMessage({ ...cmd, id });
    });
  }

  async enableAndLoadModel(modelId?: string): Promise<string> {
    const targetId = modelId || this.state.prefs.selectedModelId || LOCAL_MODEL_CATALOG[2].id;
    const hw = await this.ensureProbed();
    if (!hw.webgpuSupported) {
      const msg = 'Tarayıcınız WebGPU desteklemiyor; Bulut Yapay Zekâ modu aktif.';
      this.update({ llmStatus: 'error', llmError: msg });
      throw new Error(msg);
    }

    this.update({
      llmStatus: 'downloading',
      downloadProgress: 0.02,
      downloadText: `${targetId} indiriliyor ve GPU için derleniyor...`,
      llmError: null,
    });

    try {
      await this.callWorker<{ modelId: string }>({
        type: 'load_llm',
        payload: { modelId: targetId },
      });

      const downloaded = Array.from(new Set([...this.state.prefs.downloadedModels, targetId]));
      const nextPrefs: NeuralPrefs = {
        ...this.state.prefs,
        selectedModelId: targetId,
        downloadedModels: downloaded,
      };
      persistPrefs(nextPrefs);

      this.update({
        llmStatus: 'ready',
        activeModelId: targetId,
        downloadProgress: 1,
        downloadText: 'GPU üzerinde hazır',
        llmError: null,
        prefs: nextPrefs,
      });
      return targetId;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Yerel GPU modeli yüklenemedi.';
      this.update({ llmStatus: 'error', llmError: msg });
      throw err;
    }
  }

  async unloadModel(): Promise<void> {
    if (!this.worker) return;
    await this.callWorker({ type: 'unload_llm' }).catch(() => undefined);
    this.update({
      llmStatus: 'idle',
      activeModelId: null,
      downloadProgress: 0,
      downloadText: '',
    });
  }

  async deleteModelCache(modelId: string): Promise<void> {
    if (this.state.activeModelId === modelId) {
      await this.unloadModel();
    }
    if (typeof Worker !== 'undefined') {
      await this.callWorker({ type: 'delete_llm_cache', payload: { modelId } }).catch(
        () => undefined,
      );
    }
    this.setPrefs({
      downloadedModels: this.state.prefs.downloadedModels.filter((m) => m !== modelId),
    });
  }

  async streamChat(params: {
    messages: ChatTurnMessage[];
    taskLabel: string;
    temperature?: number;
    maxTokens?: number;
    jsonMode?: boolean;
    onToken?: (partialText: string, tokensPerSec: number) => void;
  }): Promise<{ text: string; tokensGenerated: number; elapsedMs: number; tokensPerSec: number }> {
    if (this.state.llmStatus !== 'ready' && this.state.llmStatus !== 'generating') {
      throw new Error('Yerel GPU modeli henüz yüklenmedi.');
    }
    this.update({ llmStatus: 'generating' });
    let accumulated = '';

    try {
      const res = await this.callWorker<{
        text: string;
        tokensGenerated: number;
        elapsedMs: number;
        tokensPerSec: number;
        modelId: string | null;
      }>(
        {
          type: 'chat',
          payload: {
            messages: params.messages,
            temperature: params.temperature,
            maxTokens: params.maxTokens,
            jsonMode: params.jsonMode,
          },
        },
        (delta, tps) => {
          accumulated += delta;
          params.onToken?.(accumulated, tps);
        },
      );

      this.update({
        llmStatus: 'ready',
        lastTokensPerSec: res.tokensPerSec,
        peakTokensPerSec: Math.max(this.state.peakTokensPerSec, res.tokensPerSec),
        totalLocalTokens: this.state.totalLocalTokens + res.tokensGenerated,
      });

      this.recordTelemetry({
        task: params.taskLabel,
        engine: 'gpu',
        model: res.modelId || this.state.activeModelId || 'WebGPU LLM',
        tokensPerSec: res.tokensPerSec,
        latencyMs: res.elapsedMs,
      });

      return res;
    } catch (err) {
      this.update({ llmStatus: this.state.activeModelId ? 'ready' : 'idle' });
      throw err;
    }
  }

  async abortGeneration(): Promise<void> {
    if (!this.worker) return;
    await this.callWorker({ type: 'abort_chat' }).catch(() => undefined);
    this.update({ llmStatus: this.state.activeModelId ? 'ready' : 'idle' });
  }

  async loadEmbedder(): Promise<void> {
    if (this.state.embedderStatus === 'ready') return;
    this.update({ embedderStatus: 'loading' });
    try {
      const res = await this.callWorker<{ device: 'webgpu' | 'wasm' }>({
        type: 'load_embedder',
      });
      this.update({ embedderStatus: 'ready', embedderDevice: res.device });
    } catch {
      this.update({ embedderStatus: 'error' });
    }
  }

  async embedTexts(texts: string[]): Promise<number[][]> {
    if (typeof Worker === 'undefined' || texts.length === 0) return [];
    if (this.state.embedderStatus === 'idle') {
      this.update({ embedderStatus: 'loading' });
    }
    try {
      const res = await this.callWorker<{ vectors: number[][]; device: 'webgpu' | 'wasm' }>({
        type: 'embed',
        payload: { texts },
      });
      this.update({ embedderStatus: 'ready', embedderDevice: res.device });
      return res.vectors;
    } catch {
      this.update({ embedderStatus: 'error' });
      return [];
    }
  }

  async runBenchmark(): Promise<BenchmarkResult> {
    this.update({ benchmarking: true });
    try {
      await this.ensureProbed();
      const raw = await this.callWorker<{
        cpuScoreMs: number;
        gpuComputeMs: number | null;
        gpuActive: boolean;
      }>({ type: 'benchmark' });
      const result: BenchmarkResult = {
        ranAt: Date.now(),
        ...raw,
      };
      this.update({ benchmark: result, benchmarking: false });
      return result;
    } catch {
      const fallback: BenchmarkResult = {
        ranAt: Date.now(),
        cpuScoreMs: 0,
        gpuComputeMs: null,
        gpuActive: false,
      };
      this.update({ benchmark: fallback, benchmarking: false });
      return fallback;
    }
  }
}

export const neuralEngine = new NeuralEngineManager();
