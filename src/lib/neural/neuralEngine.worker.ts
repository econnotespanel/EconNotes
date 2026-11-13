/**
 * Web Worker running WebLLM (WebGPU local LLM) and Transformers.js embeddings
 * completely off the main React thread so UI animations stay at 60-120 FPS.
 */

export interface ChatTurnMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export type WorkerCommand =
  | { id: string; type: 'load_llm'; payload: { modelId: string } }
  | {
      id: string;
      type: 'chat';
      payload: {
        messages: ChatTurnMessage[];
        temperature?: number;
        maxTokens?: number;
        jsonMode?: boolean;
      };
    }
  | { id: string; type: 'abort_chat' }
  | { id: string; type: 'unload_llm' }
  | { id: string; type: 'delete_llm_cache'; payload: { modelId: string } }
  | { id: string; type: 'load_embedder'; payload?: { modelId?: string } }
  | { id: string; type: 'embed'; payload: { texts: string[] } }
  | { id: string; type: 'benchmark' };

export type WorkerOutboundMessage =
  | { event: 'progress'; task: 'llm' | 'embedder'; modelId: string; progress: number; text: string }
  | { event: 'token'; id: string; delta: string; tokenCount: number; tokensPerSec: number }
  | { event: 'result'; id: string; result: unknown }
  | { event: 'error'; id: string; message: string };

interface WebLlmEngineLike {
  chat: {
    completions: {
      create: (opts: {
        messages: ChatTurnMessage[];
        temperature?: number;
        max_tokens?: number;
        stream: boolean;
        response_format?: { type: 'json_object' };
      }) => Promise<AsyncIterable<{ choices?: Array<{ delta?: { content?: string } }> }>>;
    };
  };
  interruptGenerate: () => void;
  unload: () => Promise<void>;
}

type EmbedExtractorFn = (
  inputs: string | string[],
  opts: { pooling: 'mean'; normalize: boolean },
) => Promise<{ tolist: () => number[][] }>;

let llmEngine: WebLlmEngineLike | null = null;
let loadedLlmModelId: string | null = null;
let embedder: EmbedExtractorFn | null = null;
let embedderDevice: 'webgpu' | 'wasm' = 'wasm';

function postOut(msg: WorkerOutboundMessage) {
  self.postMessage(msg);
}

async function handleLoadLlm(modelId: string) {
  if (llmEngine && loadedLlmModelId === modelId) {
    return { modelId };
  }
  if (llmEngine) {
    try {
      await llmEngine.unload();
    } catch {
      // ignore
    }
    llmEngine = null;
    loadedLlmModelId = null;
  }

  const webllm = await import('@mlc-ai/web-llm');
  const engine = await webllm.CreateMLCEngine(modelId, {
    initProgressCallback: (report) => {
      postOut({
        event: 'progress',
        task: 'llm',
        modelId,
        progress: Number.isFinite(report.progress) ? report.progress : 0,
        text: report.text || 'Model hazırlanıyor...',
      });
    },
  });

  llmEngine = engine as unknown as WebLlmEngineLike;
  loadedLlmModelId = modelId;
  return { modelId };
}

async function handleChat(
  id: string,
  payload: Extract<WorkerCommand, { type: 'chat' }>['payload'],
) {
  if (!llmEngine) {
    throw new Error('Yerel GPU modeli yüklü değil.');
  }

  const startedAt = performance.now();
  let fullText = '';
  let tokenCount = 0;

  const stream = await llmEngine.chat.completions.create({
    messages: payload.messages,
    temperature: payload.temperature ?? 0.35,
    max_tokens: payload.maxTokens ?? 1024,
    stream: true,
    ...(payload.jsonMode ? { response_format: { type: 'json_object' } } : {}),
  });

  for await (const chunk of stream) {
    const delta = chunk.choices?.[0]?.delta?.content || '';
    if (!delta) continue;
    fullText += delta;
    tokenCount += 1;
    const elapsedSec = Math.max(0.05, (performance.now() - startedAt) / 1000);
    const tps = Number((tokenCount / elapsedSec).toFixed(1));
    postOut({ event: 'token', id, delta, tokenCount, tokensPerSec: tps });
  }

  const elapsedMs = Math.max(1, Math.round(performance.now() - startedAt));
  const tokensPerSec = Number((tokenCount / Math.max(0.05, elapsedMs / 1000)).toFixed(1));
  return {
    text: fullText,
    tokensGenerated: tokenCount,
    elapsedMs,
    tokensPerSec,
    modelId: loadedLlmModelId,
  };
}

async function handleLoadEmbedder(modelId = 'Xenova/multilingual-e5-small') {
  if (embedder) {
    return { modelId, device: embedderDevice };
  }

  const transformers = await import('@huggingface/transformers');
  if (transformers.env) {
    transformers.env.allowLocalModels = false;
  }

  const hasWebGpu = typeof navigator !== 'undefined' && 'gpu' in navigator;
  let pipe: unknown = null;
  let usedDevice: 'webgpu' | 'wasm' = hasWebGpu ? 'webgpu' : 'wasm';

  try {
    pipe = await transformers.pipeline('feature-extraction', modelId, {
      device: usedDevice,
      dtype: 'q8',
      progress_callback: (info: { status?: string; progress?: number; file?: string }) => {
        if (typeof info.progress === 'number') {
          postOut({
            event: 'progress',
            task: 'embedder',
            modelId,
            progress: Math.max(0, Math.min(1, info.progress / 100)),
            text: info.file ? `Embedding indiriliyor: ${info.file}` : 'Embedding modeli yükleniyor...',
          });
        }
      },
    });
  } catch {
    usedDevice = 'wasm';
    pipe = await transformers.pipeline('feature-extraction', modelId, {
      device: 'wasm',
      dtype: 'q8',
    });
  }

  embedder = pipe as EmbedExtractorFn;
  embedderDevice = usedDevice;
  return { modelId, device: usedDevice };
}

async function handleEmbed(texts: string[]) {
  if (!embedder) {
    await handleLoadEmbedder();
  }
  if (!embedder || texts.length === 0) {
    return { vectors: [] as number[][], device: embedderDevice };
  }
  const output = await embedder(texts, { pooling: 'mean', normalize: true });
  return { vectors: output.tolist(), device: embedderDevice };
}

async function handleBenchmark() {
  const cpuStart = performance.now();
  let sum = 0;
  for (let i = 0; i < 600_000; i++) {
    sum += Math.sqrt((i % 97) + 1) * 0.314159;
  }
  const cpuScoreMs = Math.max(1, Number((performance.now() - cpuStart).toFixed(2)));

  let gpuComputeMs: number | null = null;
  let gpuActive = false;

  const navGpu = (self.navigator as unknown as {
    gpu?: {
      requestAdapter: (opts?: { powerPreference?: string }) => Promise<{
        requestDevice: () => Promise<{
          createShaderModule: (desc: { code: string }) => unknown;
          createBuffer: (desc: { size: number; usage: number }) => { destroy: () => void };
          createComputePipeline: (desc: unknown) => unknown;
          createBindGroup: (desc: unknown) => unknown;
          createCommandEncoder: () => {
            beginComputePass: () => {
              setPipeline: (p: unknown) => void;
              setBindGroup: (idx: number, bg: unknown) => void;
              dispatchWorkgroups: (x: number) => void;
              end: () => void;
            };
            finish: () => unknown;
          };
          queue: {
            submit: (cmds: unknown[]) => void;
            onSubmittedWorkDone: () => Promise<void>;
          };
          destroy: () => void;
        }>;
      } | null>;
    };
  }).gpu;

  if (navGpu) {
    try {
      const adapter = await navGpu.requestAdapter({ powerPreference: 'high-performance' });
      const device = adapter ? await adapter.requestDevice() : null;
      if (device) {
        const t0 = performance.now();
        const code = `
          @group(0) @binding(0) var<storage, read_write> data: array<f32>;
          @compute @workgroup_size(64)
          fn main(@builtin(global_invocation_id) id: vec3<u32>) {
            let i = id.x;
            data[i] = fma(f32(i), 1.0001, 0.5);
          }
        `;
        const module = device.createShaderModule({ code });
        const buffer = device.createBuffer({ size: 65536 * 4, usage: 0x0080 /* STORAGE */ });
        const pipeline = device.createComputePipeline({
          layout: 'auto',
          compute: { module, entryPoint: 'main' },
        });
        const bindGroup = device.createBindGroup({
          layout: (pipeline as { getBindGroupLayout: (i: number) => unknown }).getBindGroupLayout(0),
          entries: [{ binding: 0, resource: { buffer } }],
        });
        const encoder = device.createCommandEncoder();
        const pass = encoder.beginComputePass();
        pass.setPipeline(pipeline);
        pass.setBindGroup(0, bindGroup);
        pass.dispatchWorkgroups(1024);
        pass.end();
        device.queue.submit([encoder.finish()]);
        await device.queue.onSubmittedWorkDone();
        gpuComputeMs = Math.max(0.2, Number((performance.now() - t0).toFixed(2)));
        gpuActive = true;
        buffer.destroy();
        device.destroy();
      }
    } catch {
      gpuActive = false;
    }
  }

  return {
    cpuScoreMs,
    gpuComputeMs,
    gpuActive,
    checksum: Math.round(sum),
  };
}

self.onmessage = async (event: MessageEvent<WorkerCommand>) => {
  const msg = event.data;
  try {
    switch (msg.type) {
      case 'load_llm': {
        const res = await handleLoadLlm(msg.payload.modelId);
        postOut({ event: 'result', id: msg.id, result: res });
        break;
      }
      case 'chat': {
        const res = await handleChat(msg.id, msg.payload);
        postOut({ event: 'result', id: msg.id, result: res });
        break;
      }
      case 'abort_chat': {
        llmEngine?.interruptGenerate();
        postOut({ event: 'result', id: msg.id, result: { aborted: true } });
        break;
      }
      case 'unload_llm': {
        if (llmEngine) {
          await llmEngine.unload().catch(() => undefined);
          llmEngine = null;
          loadedLlmModelId = null;
        }
        postOut({ event: 'result', id: msg.id, result: { unloaded: true } });
        break;
      }
      case 'delete_llm_cache': {
        const webllm = await import('@mlc-ai/web-llm');
        await webllm.deleteModelAllInfoInCache(msg.payload.modelId);
        postOut({ event: 'result', id: msg.id, result: { deleted: msg.payload.modelId } });
        break;
      }
      case 'load_embedder': {
        const res = await handleLoadEmbedder(msg.payload?.modelId);
        postOut({ event: 'result', id: msg.id, result: res });
        break;
      }
      case 'embed': {
        const res = await handleEmbed(msg.payload.texts);
        postOut({ event: 'result', id: msg.id, result: res });
        break;
      }
      case 'benchmark': {
        const res = await handleBenchmark();
        postOut({ event: 'result', id: msg.id, result: res });
        break;
      }
    }
  } catch (err) {
    postOut({
      event: 'error',
      id: msg.id,
      message: err instanceof Error ? err.message : 'Bilinmeyen WebGPU motor hatası',
    });
  }
};
