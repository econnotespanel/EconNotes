// Tarayıcı İçi 22.05 kHz Derin Sinir Ağı (VITS ONNX) Türkçe Stüdyo Ses Motoru
// Sunucuya veya işletim sisteminin eski SAPI5 seslerine bağımlı kalmadan, OPFS kalıcı
// önbellekleme ve bellekte derlenmiş ONNX oturumu ile stüdyo kalitesinde Türkçe insan sesi üretir.

import * as ort from 'onnxruntime-web';

export type VitsTurkishVoiceId =
  | 'tr_TR-fahrettin-medium'
  | 'tr_TR-fettah-medium'
  | 'tr_TR-dfki-medium';

export interface VitsVoiceDescriptor {
  voiceId: VitsTurkishVoiceId;
  optionId: `vits:${VitsTurkishVoiceId}`;
  cleanName: string;
  gender: 'male' | 'female' | 'neutral';
  score: number;
  defaultLengthScale: number;
}

export const VITS_TURKISH_VOICES: VitsVoiceDescriptor[] = [
  {
    voiceId: 'tr_TR-fahrettin-medium',
    optionId: 'vits:tr_TR-fahrettin-medium',
    cleanName: 'Fahrettin · Stüdyo Neural HD',
    gender: 'male',
    score: 98,
    defaultLengthScale: 0.98,
  },
  {
    voiceId: 'tr_TR-fettah-medium',
    optionId: 'vits:tr_TR-fettah-medium',
    cleanName: 'Fettah · Akademik Neural HD',
    gender: 'male',
    score: 97,
    defaultLengthScale: 1.0,
  },
  {
    voiceId: 'tr_TR-dfki-medium',
    optionId: 'vits:tr_TR-dfki-medium',
    cleanName: 'DFKI · Stüdyo Neural HD',
    gender: 'neutral',
    score: 95,
    defaultLengthScale: 0.99,
  },
];

export interface VitsEngineStatus {
  state: 'idle' | 'downloading' | 'compiling' | 'ready' | 'error';
  progressPct: number;
  activeLabel: string;
}

export interface SynthesizedSpeechClip {
  blobUrl: string;
  durationSec: number;
  /** 50 Hz (20ms adımlı) normalize edilmiş gerçek ses enerjisi zarfı [0..1] */
  envelope: number[];
}

const HF_BASE = 'https://huggingface.co/diffusionstudio/piper-voices/resolve/main';
const ONNX_WASM_BASE = 'https://cdnjs.cloudflare.com/ajax/libs/onnxruntime-web/1.18.0/';
const PIPER_WASM_BASE = 'https://cdn.jsdelivr.net/npm/@diffusionstudio/piper-wasm@1.0.0/build/piper_phonemize';

const MODEL_PATHS: Record<VitsTurkishVoiceId, string> = {
  'tr_TR-fahrettin-medium': 'tr/tr_TR/fahrettin/medium/tr_TR-fahrettin-medium.onnx',
  'tr_TR-fettah-medium': 'tr/tr_TR/fettah/medium/tr_TR-fettah-medium.onnx',
  'tr_TR-dfki-medium': 'tr/tr_TR/dfki/medium/tr_TR-dfki-medium.onnx',
};

interface CompiledVitsModel {
  session: ort.InferenceSession;
  config: {
    audio: { sample_rate: number };
    espeak: { voice: string };
    inference: { noise_scale: number; length_scale: number; noise_w: number };
    speaker_id_map?: Record<string, number>;
  };
}

let ortConfigured = false;
function configureOrtOnce() {
  if (ortConfigured) return;
  ortConfigured = true;
  ort.env.allowLocalModels = false;
  ort.env.wasm.wasmPaths = ONNX_WASM_BASE;
  const isolated = typeof self !== 'undefined' && Boolean((self as any).crossOriginIsolated);
  const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 2 : 1;
  ort.env.wasm.numThreads = isolated ? Math.min(4, cores) : 1;
}

// Durum abonelik sistemi (UI ilerleme göstergesi için)
let engineStatus: VitsEngineStatus = {
  state: 'idle',
  progressPct: 0,
  activeLabel: '',
};
const statusListeners = new Set<(status: VitsEngineStatus) => void>();

function updateStatus(patch: Partial<VitsEngineStatus>) {
  engineStatus = { ...engineStatus, ...patch };
  statusListeners.forEach(fn => {
    try {
      fn(engineStatus);
    } catch {
      // ignore
    }
  });
}

export function getVitsEngineStatus(): VitsEngineStatus {
  return engineStatus;
}

export function subscribeVitsStatus(listener: (status: VitsEngineStatus) => void): () => void {
  statusListeners.add(listener);
  listener(engineStatus);
  return () => {
    statusListeners.delete(listener);
  };
}

// OPFS + RAM önbellek katmanı (Gizli sekmede OPFS kapalı olsa bile RAM önbelleği tekrar indirmeyi önler)
const memoryModelBytes = new Map<string, ArrayBuffer>();
const compiledModelCache = new Map<VitsTurkishVoiceId, Promise<CompiledVitsModel>>();
const synthesizedClipCache = new Map<string, SynthesizedSpeechClip>();
const MAX_CLIP_CACHE = 96;

async function readOpfsFile(fileName: string): Promise<ArrayBuffer | null> {
  const mem = memoryModelBytes.get(fileName);
  if (mem) return mem;
  if (typeof navigator === 'undefined' || !navigator.storage?.getDirectory) return null;
  try {
    const root = await navigator.storage.getDirectory();
    const dir = await root.getDirectoryHandle('piper', { create: true });
    const handle = await dir.getFileHandle(fileName);
    const file = await handle.getFile();
    if (file.size < 32) return null;
    const buf = await file.arrayBuffer();
    return buf;
  } catch {
    return null;
  }
}

async function writeOpfsFile(fileName: string, buffer: ArrayBuffer): Promise<void> {
  if (typeof navigator === 'undefined' || !navigator.storage?.getDirectory) {
    memoryModelBytes.set(fileName, buffer);
    return;
  }
  try {
    const root = await navigator.storage.getDirectory();
    const dir = await root.getDirectoryHandle('piper', { create: true });
    const handle = await dir.getFileHandle(fileName, { create: true });
    const writable = await (handle as any).createWritable();
    await writable.write(buffer);
    await writable.close();
  } catch {
    memoryModelBytes.set(fileName, buffer);
  }
}

async function fetchWithProgress(
  url: string,
  onProgress?: (loaded: number, total: number) => void,
): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Ses modeli indirilemedi (${res.status})`);
  }
  const reader = res.body?.getReader();
  const total = Number(res.headers.get('Content-Length') || 0);
  if (!reader) {
    const buf = await res.arrayBuffer();
    onProgress?.(buf.byteLength, buf.byteLength);
    return buf;
  }

  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      loaded += value.byteLength;
      onProgress?.(loaded, total || 63_200_000);
    }
  }

  const merged = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return merged.buffer;
}

async function getOrDownloadAsset(
  url: string,
  onProgress?: (loaded: number, total: number) => void,
): Promise<ArrayBuffer> {
  const fileName = url.split('/').pop() || 'model.bin';
  const existing = await readOpfsFile(fileName);
  if (existing) {
    onProgress?.(existing.byteLength, existing.byteLength);
    return existing;
  }
  const downloaded = await fetchWithProgress(url, onProgress);
  await writeOpfsFile(fileName, downloaded);
  return downloaded;
}

// Piper eSpeak-NG WASM fonemleştirici yükleyici
type CreatePiperPhonemizeFn = (moduleConfig: Record<string, any>) => Promise<{ callMain: (args: string[]) => void }>;
let phonemizerFactoryPromise: Promise<CreatePiperPhonemizeFn> | null = null;

function loadPiperPhonemizerFactory(): Promise<CreatePiperPhonemizeFn> {
  if (phonemizerFactoryPromise) return phonemizerFactoryPromise;
  phonemizerFactoryPromise = new Promise<CreatePiperPhonemizeFn>((resolve, reject) => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      reject(new Error('Tarayıcı ortamı gerekli'));
      return;
    }
    const existing = (window as any).createPiperPhonemize as CreatePiperPhonemizeFn | undefined;
    if (typeof existing === 'function') {
      resolve(existing);
      return;
    }
    const script = document.createElement('script');
    script.src = `${PIPER_WASM_BASE}.js`;
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.onload = () => {
      const fn = (window as any).createPiperPhonemize as CreatePiperPhonemizeFn | undefined;
      if (typeof fn === 'function') {
        resolve(fn);
      } else {
        phonemizerFactoryPromise = null;
        reject(new Error('Türkçe fonetik motoru başlatılamadı'));
      }
    };
    script.onerror = () => {
      phonemizerFactoryPromise = null;
      reject(new Error('Türkçe fonetik motoru yüklenemedi'));
    };
    document.head.appendChild(script);
  });
  return phonemizerFactoryPromise;
}

async function phonemizeTurkishText(text: string, espeakVoice: string): Promise<number[]> {
  const createPiperPhonemize = await loadPiperPhonemizerFactory();
  return new Promise<number[]>((resolve, reject) => {
    let settled = false;
    createPiperPhonemize({
      print: (line: string) => {
        if (settled) return;
        try {
          const parsed = JSON.parse(line);
          if (Array.isArray(parsed?.phoneme_ids)) {
            settled = true;
            resolve(parsed.phoneme_ids);
          }
        } catch {
          // eSpeak bilgi çıktısıysa yoksay
        }
      },
      printErr: (errLine: string) => {
        if (!settled && /error|fatal/i.test(errLine)) {
          settled = true;
          reject(new Error(errLine));
        }
      },
      locateFile: (file: string) => {
        if (file.endsWith('.wasm')) return `${PIPER_WASM_BASE}.wasm`;
        if (file.endsWith('.data')) return `${PIPER_WASM_BASE}.data`;
        return file;
      },
    })
      .then(instance => {
        instance.callMain([
          '-l',
          espeakVoice || 'tr',
          '--input',
          JSON.stringify([{ text: text.trim() }]),
          '--espeak_data',
          '/espeak-ng-data',
        ]);
        if (!settled) {
          settled = true;
          resolve([]);
        }
      })
      .catch(err => {
        if (!settled) {
          settled = true;
          reject(err);
        }
      });
  });
}

/**
 * 22.05 kHz Float32 PCM verisini 12ms yumuşak giriş/çıkış zarfıyla (tıklama/çıtırtı önleyici)
 * 16-bit RIFF WAV tamponuna çevirir ve 50 Hz gerçek ses enerjisi zarfı çıkarır.
 */
function encodeCleanWavAndEnvelope(
  rawPcm: Float32Array,
  sampleRate: number,
): { wavBuffer: ArrayBuffer; durationSec: number; envelope: number[] } {
  const numSamples = rawPcm.length;
  const fadeSamples = Math.min(Math.floor(sampleRate * 0.014), Math.floor(numSamples / 8));

  // 50 Hz (20 ms pencere) RMS konuşma enerjisi zarfı
  const windowSize = Math.max(1, Math.floor(sampleRate / 50));
  const envelope: number[] = [];
  for (let start = 0; start < numSamples; start += windowSize) {
    const end = Math.min(numSamples, start + windowSize);
    let sumSq = 0;
    for (let i = start; i < end; i++) {
      const s = rawPcm[i];
      sumSq += s * s;
    }
    const rms = Math.sqrt(sumSq / Math.max(1, end - start));
    envelope.push(Math.min(1, rms * 4.4));
  }

  const headerBytes = 44;
  const view = new DataView(new ArrayBuffer(headerBytes + numSamples * 2));

  // RIFF WAVE başlığı
  view.setUint32(0, 0x46464952, true); // "RIFF"
  view.setUint32(4, view.buffer.byteLength - 8, true);
  view.setUint32(8, 0x45564157, true); // "WAVE"
  view.setUint32(12, 0x20746d66, true); // "fmt "
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  view.setUint32(36, 0x61746164, true); // "data"
  view.setUint32(40, numSamples * 2, true);

  let byteOffset = headerBytes;
  for (let i = 0; i < numSamples; i++) {
    let gain = 0.94;
    if (i < fadeSamples) {
      gain *= i / Math.max(1, fadeSamples);
    } else if (i > numSamples - fadeSamples) {
      gain *= (numSamples - i) / Math.max(1, fadeSamples);
    }
    const sample = Math.max(-1, Math.min(1, rawPcm[i] * gain));
    view.setInt16(byteOffset, sample < 0 ? sample * 32768 : sample * 32767, true);
    byteOffset += 2;
  }

  return {
    wavBuffer: view.buffer,
    durationSec: numSamples / Math.max(1, sampleRate),
    envelope,
  };
}

function getCompiledModel(voiceId: VitsTurkishVoiceId): Promise<CompiledVitsModel> {
  const existing = compiledModelCache.get(voiceId);
  if (existing) return existing;

  const descriptor = VITS_TURKISH_VOICES.find(v => v.voiceId === voiceId);
  const label = descriptor?.cleanName || voiceId;

  const loadPromise = (async () => {
    configureOrtOnce();
    const relPath = MODEL_PATHS[voiceId];
    const jsonUrl = `${HF_BASE}/${relPath}.json`;
    const onnxUrl = `${HF_BASE}/${relPath}`;

    updateStatus({ state: 'downloading', progressPct: 2, activeLabel: label });

    const [jsonBuf, onnxBuf, _phonemizer] = await Promise.all([
      getOrDownloadAsset(jsonUrl),
      getOrDownloadAsset(onnxUrl, (loaded, total) => {
        const pct = total > 0 ? Math.min(92, Math.round((loaded / total) * 92)) : 50;
        updateStatus({ state: 'downloading', progressPct: pct, activeLabel: label });
      }),
      loadPiperPhonemizerFactory(),
    ]);

    updateStatus({ state: 'compiling', progressPct: 95, activeLabel: label });
    const configText = new TextDecoder('utf-8').decode(jsonBuf);
    const config = JSON.parse(configText);

    const session = await ort.InferenceSession.create(onnxBuf, {
      executionProviders: ['wasm'],
      graphOptimizationLevel: 'all',
    });

    // OPFS etkinse dev ONNX ikilisini çift kopya tutmamak için geçici RAM haritasından serbest bırak
    if (typeof navigator !== 'undefined' && navigator.storage?.getDirectory) {
      memoryModelBytes.delete(onnxUrl.split('/').pop() || '');
    }

    updateStatus({ state: 'ready', progressPct: 100, activeLabel: label });
    return { session, config } as CompiledVitsModel;
  })().catch(err => {
    compiledModelCache.delete(voiceId);
    updateStatus({ state: 'error', progressPct: 0, activeLabel: label });
    throw err;
  });

  compiledModelCache.set(voiceId, loadPromise);
  return loadPromise;
}

export function warmupVitsVoice(voiceId: VitsTurkishVoiceId = 'tr_TR-fahrettin-medium'): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  return getCompiledModel(voiceId).then(() => {});
}

// ONNX WASM oturumu eşzamanlı run() çağrılarını sıraya alır ("Session already started" hatasını sıfırlar)
let inferenceQueue: Promise<any> = Promise.resolve();

function enqueueInference<T>(task: () => Promise<T>): Promise<T> {
  const next = inferenceQueue.then(task, task);
  inferenceQueue = next.catch(() => {});
  return next;
}

/**
 * Verilen Türkçe konuşma metnini tarayıcı içindeki 22.05 kHz VITS derin sinir ağıyla sentezler.
 */
export async function synthesizeVitsTurkish(
  spokenText: string,
  voiceId: VitsTurkishVoiceId,
  customLengthScale?: number,
): Promise<SynthesizedSpeechClip | null> {
  if (typeof window === 'undefined') return null;
  const trimmed = spokenText.trim();
  if (!trimmed) return null;

  const descriptor = VITS_TURKISH_VOICES.find(v => v.voiceId === voiceId);
  const lengthScale = customLengthScale ?? descriptor?.defaultLengthScale ?? 1.0;
  const cacheKey = `${voiceId}::${lengthScale.toFixed(2)}::${trimmed}`;

  const cached = synthesizedClipCache.get(cacheKey);
  if (cached) return cached;

  try {
    const model = await getCompiledModel(voiceId);

    const clip = await enqueueInference(async () => {
      const again = synthesizedClipCache.get(cacheKey);
      if (again) return again;

      const phonemeIds = await phonemizeTurkishText(trimmed, model.config.espeak?.voice || 'tr');
      if (!phonemeIds || phonemeIds.length === 0) return null;

      const inputIds = BigInt64Array.from(phonemeIds, id => BigInt(id));
      const inputLengths = BigInt64Array.from([BigInt(phonemeIds.length)]);
      const noiseScale = model.config.inference?.noise_scale ?? 0.667;
      const baseLen = (model.config.inference?.length_scale ?? 1.0) * lengthScale;
      const noiseW = model.config.inference?.noise_w ?? 0.8;

      const feeds: Record<string, ort.Tensor> = {
        input: new ort.Tensor('int64', inputIds, [1, inputIds.length]),
        input_lengths: new ort.Tensor('int64', inputLengths, [1]),
        scales: new ort.Tensor('float32', new Float32Array([noiseScale, baseLen, noiseW]), [3]),
      };

      if (model.config.speaker_id_map && Object.keys(model.config.speaker_id_map).length > 0) {
        feeds.sid = new ort.Tensor('int64', BigInt64Array.from([0n]), [1]);
      }

      const results = await model.session.run(feeds);
      const outputTensor = results.output || Object.values(results)[0];
      if (!outputTensor) return null;

      const pcm = outputTensor.data as Float32Array;
      const sampleRate = model.config.audio?.sample_rate || 22050;
      const { wavBuffer, durationSec, envelope } = encodeCleanWavAndEnvelope(pcm, sampleRate);
      const blob = new Blob([wavBuffer], { type: 'audio/x-wav' });
      const blobUrl = URL.createObjectURL(blob);

      const built: SynthesizedSpeechClip = { blobUrl, durationSec, envelope };
      if (synthesizedClipCache.size >= MAX_CLIP_CACHE) {
        const oldestKey = synthesizedClipCache.keys().next().value;
        if (oldestKey) {
          const oldClip = synthesizedClipCache.get(oldestKey);
          if (oldClip) URL.revokeObjectURL(oldClip.blobUrl);
          synthesizedClipCache.delete(oldestKey);
        }
      }
      synthesizedClipCache.set(cacheKey, built);
      return built;
    });

    return clip;
  } catch {
    // Yedek olarak @diffusionstudio/vits-web predict dene
    try {
      const vits = await import('@diffusionstudio/vits-web');
      const wavBlob = await vits.predict({ text: trimmed, voiceId });
      const blobUrl = URL.createObjectURL(wavBlob);
      const fallbackClip: SynthesizedSpeechClip = {
        blobUrl,
        durationSec: Math.max(1.2, trimmed.length / 13.4),
        envelope: [],
      };
      synthesizedClipCache.set(cacheKey, fallbackClip);
      return fallbackClip;
    } catch {
      return null;
    }
  }
}
