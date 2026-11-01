// Tarayıcı İçi 22.05 kHz Derin Sinir Ağı (VITS ONNX) Akıcı Türkçe Stüdyo Ses Motoru v2
// - Dört farklı doğal Türkçe Neural Stüdyo sesi (Eren Akıcı Akademik, Fahrettin Stüdyo, Obadiah Kürsü, Fettah Belgesel).
// - Özel phoneme_id_map kodlaması, akıcı legato prozodi (düşük durasyon titremesi noise_w=0.30..0.34),
//   ve cümleler arası örneklem-hassasiyetli (sample-accurate) kesintisiz konuşma bloğu birleştirme.
// - OPFS kalıcı önbellekleme + stüdyo ses mastering (DC-offset temizliği, sıcak mikrofon tonu ve ses seviyesi dengeleme).

import * as ort from 'onnxruntime-web';

export type VitsTurkishVoiceId =
  | 'tr_TR-eren-fluid'
  | 'tr_TR-fahrettin-medium'
  | 'tr_TR-dfki-medium'
  | 'tr_TR-fettah-medium';

export interface VitsVoiceDescriptor {
  voiceId: VitsTurkishVoiceId;
  optionId: `vits:${VitsTurkishVoiceId}`;
  cleanName: string;
  roleHint: string;
  gender: 'male' | 'female' | 'neutral';
  score: number;
  defaultLengthScale: number;
  noiseScale: number;
  noiseW: number;
  onnxUrl: string;
  jsonUrl: string;
}

const HF_PIPER_BASE = 'https://huggingface.co/diffusionstudio/piper-voices/resolve/main';
const HF_EREN_BASE = 'https://huggingface.co/99eren99/piper-turkish-tts/resolve/main';
const ONNX_WASM_BASE = 'https://cdnjs.cloudflare.com/ajax/libs/onnxruntime-web/1.18.0/';
const PIPER_WASM_BASE = 'https://cdn.jsdelivr.net/npm/@diffusionstudio/piper-wasm@1.0.0/build/piper_phonemize';

export const VITS_TURKISH_VOICES: VitsVoiceDescriptor[] = [
  {
    voiceId: 'tr_TR-eren-fluid',
    optionId: 'vits:tr_TR-eren-fluid',
    cleanName: 'Eren · Akademik Anlatıcı',
    roleHint: 'Sıcak, akıcı kıdemli akademisyen tonu',
    gender: 'male',
    score: 102,
    // config.json length_scale=1.2 olduğu için 1.2 * 0.87 = 1.044 doğal akıcı tempo verir
    defaultLengthScale: 0.87,
    noiseScale: 0.4,
    noiseW: 0.3,
    onnxUrl: `${HF_EREN_BASE}/model.onnx`,
    jsonUrl: `${HF_EREN_BASE}/config.json`,
  },
  {
    voiceId: 'tr_TR-fahrettin-medium',
    optionId: 'vits:tr_TR-fahrettin-medium',
    cleanName: 'Fahrettin · Stüdyo Anlatıcı',
    roleHint: 'Dinamik, berrak araştırmacı tonu',
    gender: 'male',
    score: 101,
    defaultLengthScale: 0.96,
    noiseScale: 0.42,
    noiseW: 0.34,
    onnxUrl: `${HF_PIPER_BASE}/tr/tr_TR/fahrettin/medium/tr_TR-fahrettin-medium.onnx`,
    jsonUrl: `${HF_PIPER_BASE}/tr/tr_TR/fahrettin/medium/tr_TR-fahrettin-medium.onnx.json`,
  },
  {
    voiceId: 'tr_TR-dfki-medium',
    optionId: 'vits:tr_TR-dfki-medium',
    cleanName: 'Obadiah · Kürsü Anlatıcı',
    roleHint: 'Duru, tane tane kürsü anlatımı',
    gender: 'male',
    score: 99,
    defaultLengthScale: 0.95,
    noiseScale: 0.42,
    noiseW: 0.34,
    onnxUrl: `${HF_PIPER_BASE}/tr/tr_TR/dfki/medium/tr_TR-dfki-medium.onnx`,
    jsonUrl: `${HF_PIPER_BASE}/tr/tr_TR/dfki/medium/tr_TR-dfki-medium.onnx.json`,
  },
  {
    voiceId: 'tr_TR-fettah-medium',
    optionId: 'vits:tr_TR-fettah-medium',
    cleanName: 'Fettah · Belgesel Anlatıcı',
    roleHint: 'Tok, sakin belgesel anlatımı',
    gender: 'male',
    score: 98,
    defaultLengthScale: 0.98,
    noiseScale: 0.42,
    noiseW: 0.34,
    onnxUrl: `${HF_PIPER_BASE}/tr/tr_TR/fettah/medium/tr_TR-fettah-medium.onnx`,
    jsonUrl: `${HF_PIPER_BASE}/tr/tr_TR/fettah/medium/tr_TR-fettah-medium.onnx.json`,
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
  /** Çok cümleli konuşma bloklarında her cümlenin bittiği tam saniye zaman damgası */
  sentenceEndSec: number[];
}

interface CompiledVitsModel {
  descriptor: VitsVoiceDescriptor;
  /** Worker kullanılamadığında yedek ana iş parçacığı oturumu */
  session: ort.InferenceSession | null;
  useWorker: boolean;
  config: {
    audio: { sample_rate: number };
    espeak: { voice: string };
    inference: { noise_scale: number; length_scale: number; noise_w: number };
    phoneme_id_map?: Record<string, number[]>;
    speaker_id_map?: Record<string, number>;
  };
}

// Arka Plan Ses Çıkarım Worker Yöneticisi (Ana arayüzü hiçbir zaman dondurmaz)
let synthWorker: Worker | null = null;
let synthWorkerFailed = false;
let workerMsgSeq = 0;
const workerPending = new Map<
  number,
  { resolve: (data: any) => void; reject: (err: Error) => void }
>();

function getSynthWorker(): Worker | null {
  if (synthWorkerFailed || typeof window === 'undefined' || typeof Worker === 'undefined') {
    return null;
  }
  if (synthWorker) return synthWorker;
  try {
    const w = new Worker(new URL('./vitsSynthesis.worker.ts', import.meta.url), {
      type: 'module',
    });
    w.onmessage = (ev: MessageEvent) => {
      const data = ev.data;
      if (!data || typeof data.id !== 'number') return;
      const entry = workerPending.get(data.id);
      if (!entry) return;
      workerPending.delete(data.id);
      if (data.ok) entry.resolve(data);
      else entry.reject(new Error(data.error || 'Worker hatası'));
    };
    w.onerror = () => {
      synthWorkerFailed = true;
      synthWorker = null;
      workerPending.forEach(({ reject }) => reject(new Error('Ses worker kesildi')));
      workerPending.clear();
    };
    synthWorker = w;
    return w;
  } catch {
    synthWorkerFailed = true;
    return null;
  }
}

function callSynthWorker(
  payload: Record<string, any>,
  transfer: Transferable[] = [],
): Promise<any> {
  const w = getSynthWorker();
  if (!w) return Promise.reject(new Error('Worker desteklenmiyor'));
  const id = ++workerMsgSeq;
  return new Promise((resolve, reject) => {
    workerPending.set(id, { resolve, reject });
    try {
      w.postMessage({ ...payload, id }, transfer);
    } catch (e: any) {
      workerPending.delete(id);
      reject(e instanceof Error ? e : new Error(String(e)));
    }
  });
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

// OPFS + RAM önbellek katmanı (çakışmasız model anahtarlarıyla)
const memoryModelBytes = new Map<string, ArrayBuffer>();
const compiledModelCache = new Map<VitsTurkishVoiceId, Promise<CompiledVitsModel>>();
const synthesizedClipCache = new Map<string, SynthesizedSpeechClip>();
const MAX_CLIP_CACHE = 96;

async function readOpfsFile(cacheFileName: string): Promise<ArrayBuffer | null> {
  const mem = memoryModelBytes.get(cacheFileName);
  if (mem) return mem;
  if (typeof navigator === 'undefined' || !navigator.storage?.getDirectory) return null;
  try {
    const root = await navigator.storage.getDirectory();
    const dir = await root.getDirectoryHandle('econnotes-vits-v2', { create: true });
    const handle = await dir.getFileHandle(cacheFileName);
    const file = await handle.getFile();
    if (file.size < 64) return null;
    return await file.arrayBuffer();
  } catch {
    return null;
  }
}

async function writeOpfsFile(cacheFileName: string, buffer: ArrayBuffer): Promise<void> {
  if (typeof navigator === 'undefined' || !navigator.storage?.getDirectory) {
    memoryModelBytes.set(cacheFileName, buffer);
    return;
  }
  try {
    const root = await navigator.storage.getDirectory();
    const dir = await root.getDirectoryHandle('econnotes-vits-v2', { create: true });
    const handle = await dir.getFileHandle(cacheFileName, { create: true });
    const writable = await (handle as any).createWritable();
    await writable.write(buffer);
    await writable.close();
  } catch {
    memoryModelBytes.set(cacheFileName, buffer);
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
      onProgress?.(loaded, total || 63_500_000);
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
  cacheFileName: string,
  url: string,
  onProgress?: (loaded: number, total: number) => void,
): Promise<ArrayBuffer> {
  const existing = await readOpfsFile(cacheFileName);
  if (existing) {
    onProgress?.(existing.byteLength, existing.byteLength);
    return existing;
  }
  const downloaded = await fetchWithProgress(url, onProgress);
  await writeOpfsFile(cacheFileName, downloaded);
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

function encodePhonemesWithModelMap(
  phonemes: string[],
  phonemeMap?: Record<string, number[]>,
  fallbackIds?: number[],
): number[] {
  if (!phonemeMap || Object.keys(phonemeMap).length === 0 || phonemes.length === 0) {
    return fallbackIds || [];
  }

  const bos = phonemeMap['^']?.[0] ?? 1;
  const eos = phonemeMap['$']?.[0] ?? 2;
  const pad = phonemeMap['_']?.[0] ?? 0;
  const spaceIds = phonemeMap[' '] ?? [3];

  const out: number[] = [bos, pad];
  for (let i = 0; i < phonemes.length; i++) {
    const sym = phonemes[i];
    const mapped = phonemeMap[sym];
    if (mapped && mapped.length > 0) {
      for (const id of mapped) {
        out.push(id, pad);
      }
    }
    // Cümle sonu noktalama işaretlerinden sonra eSpeak boşluk koymadıysa doğal nefes boşluğu ekle
    if ((sym === '.' || sym === '?' || sym === '!' || sym === ';' || sym === ':') && i + 1 < phonemes.length) {
      if (phonemes[i + 1] !== ' ') {
        for (const sid of spaceIds) {
          out.push(sid, pad);
        }
      }
    }
  }
  out.push(eos);
  return out.length > 3 ? out : fallbackIds || [];
}

async function phonemizeTurkishClauses(
  clauses: string[],
  espeakVoice: string,
  phonemeMap?: Record<string, number[]>,
): Promise<number[][]> {
  const cleanClauses = clauses.map(c => c.trim()).filter(Boolean);
  if (cleanClauses.length === 0) return [];

  const createPiperPhonemize = await loadPiperPhonemizerFactory();
  return new Promise<number[][]>((resolve, reject) => {
    const collected: number[][] = [];
    let failed = false;

    createPiperPhonemize({
      print: (line: string) => {
        if (failed) return;
        try {
          const parsed = JSON.parse(line);
          if (Array.isArray(parsed?.phonemes) || Array.isArray(parsed?.phoneme_ids)) {
            const ids = encodePhonemesWithModelMap(
              Array.isArray(parsed.phonemes) ? parsed.phonemes : [],
              phonemeMap,
              Array.isArray(parsed.phoneme_ids) ? parsed.phoneme_ids : [],
            );
            collected.push(ids);
          }
        } catch {
          // Bilgi satırlarını yoksay
        }
      },
      printErr: (errLine: string) => {
        if (!failed && /fatal/i.test(errLine)) {
          failed = true;
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
          JSON.stringify(cleanClauses.map(text => ({ text }))),
          '--espeak_data',
          '/espeak-ng-data',
        ]);
        if (!failed) {
          resolve(collected);
        }
      })
      .catch(err => {
        if (!failed) {
          failed = true;
          reject(err);
        }
      });
  });
}

/**
 * Ham VITS PCM dizisinin başındaki ve sonundaki ölü sessizliği nazikçe kırpar,
 * tıklama önleyici kosinüs zarfı (14ms) uygular.
 */
function trimAndSmoothClausePcm(raw: Float32Array, sampleRate: number): Float32Array {
  if (raw.length === 0) return raw;
  const threshold = 0.0035;
  const padSamples = Math.floor(sampleRate * 0.025);

  let start = 0;
  while (start < raw.length - 1 && Math.abs(raw[start]) < threshold) start++;
  start = Math.max(0, start - padSamples);

  let end = raw.length - 1;
  while (end > start && Math.abs(raw[end]) < threshold) end--;
  end = Math.min(raw.length, end + padSamples * 2);

  const sliced = raw.slice(start, end);
  const fade = Math.min(Math.floor(sampleRate * 0.014), Math.floor(sliced.length / 6));
  for (let i = 0; i < fade; i++) {
    const w = 0.5 - 0.5 * Math.cos((Math.PI * i) / Math.max(1, fade));
    sliced[i] *= w;
    sliced[sliced.length - 1 - i] *= w;
  }
  return sliced;
}

/**
 * Stüdyo ses mastering katmanı:
 * - DC-offset giderme
 * - Hafif sıcak mikrofon yumuşatma filtresi (metalik tizleri törpüler, konuşma netliğini korur)
 * - Konuşmacılar arası dengeli ses yüksekliği (-1.3 dBFS normalize + yumuşak tanh limiter)
 * - 16-bit RIFF WAV + 50 Hz gerçek RMS dudak enerjisi zarfı
 */
function masterAndEncodeStudioWav(
  clausesPcm: Float32Array[],
  clausesText: string[],
  sampleRate: number,
): { wavBuffer: ArrayBuffer; durationSec: number; envelope: number[]; sentenceEndSec: number[] } {
  // Cümleler arası doğal akıcı nefes aralığı (soru/ünlem sonrası 185ms, düz cümle sonrası 145ms)
  const gapsSamples: number[] = clausesPcm.map((_, idx) => {
    if (idx >= clausesPcm.length - 1) return Math.floor(sampleRate * 0.04);
    const txt = (clausesText[idx] || '').trim();
    const pauseSec = /[?!]$/.test(txt)
      ? 0.24
      : /[;:]$/.test(txt)
      ? 0.19
      : /[,،]$/.test(txt)
      ? 0.12
      : 0.16;
    return Math.floor(sampleRate * pauseSec);
  });

  let totalSamples = 0;
  for (let i = 0; i < clausesPcm.length; i++) {
    totalSamples += clausesPcm[i].length + gapsSamples[i];
  }
  totalSamples = Math.max(1, totalSamples);

  const merged = new Float32Array(totalSamples);
  const sentenceEndSec: number[] = [];
  let writeCursor = 0;

  for (let i = 0; i < clausesPcm.length; i++) {
    const seg = clausesPcm[i];
    merged.set(seg, writeCursor);
    writeCursor += seg.length + gapsSamples[i];
    sentenceEndSec.push(writeCursor / Math.max(1, sampleRate));
  }

  // DC-offset ve tepe genlik ölçümü
  let dcSum = 0;
  for (let i = 0; i < totalSamples; i++) dcSum += merged[i];
  const dcMean = dcSum / totalSamples;

  let peak = 0.001;
  let sumSquares = 0;
  let prev = 0;
  for (let i = 0; i < totalSamples; i++) {
    const centered = merged[i] - dcMean;
    // Hafif mikrofon sıcaklığı; yüksek frekansları fazla bastırmadan netliği korur.
    const warmed = centered * 0.94 + prev * 0.06;
    prev = warmed;
    merged[i] = warmed;
    const abs = Math.abs(warmed);
    if (abs > peak) peak = abs;
    sumSquares += warmed * warmed;
  }

  // Peak + RMS birlikte kullanılır; böylece farklı anlatıcı modelleri aynı algılanan
  // yüksekliğe gelirken tıkırtı ve aşırı yükseltme engellenir.
  const rms = Math.sqrt(sumSquares / Math.max(1, totalSamples));
  const peakGain = 0.84 / peak;
  const loudnessGain = 0.22 / Math.max(0.001, rms);
  const normGain = Math.min(2.05, Math.max(0.62, Math.min(peakGain, loudnessGain)));

  // 50 Hz (20 ms pencere) RMS konuşma enerjisi zarfı
  const windowSize = Math.max(1, Math.floor(sampleRate / 50));
  const envelope: number[] = [];
  for (let start = 0; start < totalSamples; start += windowSize) {
    const end = Math.min(totalSamples, start + windowSize);
    let sumSq = 0;
    for (let i = start; i < end; i++) {
      const s = merged[i] * normGain;
      sumSq += s * s;
    }
    const rms = Math.sqrt(sumSq / Math.max(1, end - start));
    envelope.push(Math.min(1, rms * 3.8));
  }

  const headerBytes = 44;
  const view = new DataView(new ArrayBuffer(headerBytes + totalSamples * 2));

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
  view.setUint32(40, totalSamples * 2, true);

  const outerFade = Math.min(Math.floor(sampleRate * 0.015), Math.floor(totalSamples / 8));
  let byteOffset = headerBytes;
  for (let i = 0; i < totalSamples; i++) {
    let envFade = 1;
    if (i < outerFade) {
      envFade = i / Math.max(1, outerFade);
    } else if (i > totalSamples - outerFade) {
      envFade = (totalSamples - i) / Math.max(1, outerFade);
    }
    const amplified = merged[i] * normGain * envFade;
    // Yumuşak analog doygunluk sınırı (çıtırtı/clipping sıfırlanır)
    const softLimited = Math.abs(amplified) > 0.85 ? Math.tanh(amplified) : amplified;
    const clamped = Math.max(-1, Math.min(1, softLimited));
    view.setInt16(byteOffset, clamped < 0 ? clamped * 32768 : clamped * 32767, true);
    byteOffset += 2;
  }

  return {
    wavBuffer: view.buffer,
    durationSec: totalSamples / Math.max(1, sampleRate),
    envelope,
    sentenceEndSec,
  };
}

function getCompiledModel(voiceId: VitsTurkishVoiceId): Promise<CompiledVitsModel> {
  const existing = compiledModelCache.get(voiceId);
  if (existing) return existing;

  const descriptor =
    VITS_TURKISH_VOICES.find(v => v.voiceId === voiceId) || VITS_TURKISH_VOICES[0];
  const label = descriptor.cleanName;

  const loadPromise = (async () => {
    configureOrtOnce();
    updateStatus({ state: 'downloading', progressPct: 3, activeLabel: label });

    const [jsonBuf, onnxBuf, _phonemizer] = await Promise.all([
      getOrDownloadAsset(`${descriptor.voiceId}.json`, descriptor.jsonUrl),
      getOrDownloadAsset(`${descriptor.voiceId}.onnx`, descriptor.onnxUrl, (loaded, total) => {
        const pct = total > 0 ? Math.min(92, Math.max(4, Math.round((loaded / total) * 92))) : 50;
        updateStatus({ state: 'downloading', progressPct: pct, activeLabel: label });
      }),
      loadPiperPhonemizerFactory(),
    ]);

    updateStatus({ state: 'compiling', progressPct: 96, activeLabel: label });
    const configText = new TextDecoder('utf-8').decode(jsonBuf);
    const config = JSON.parse(configText);

    const hasOpfs = typeof navigator !== 'undefined' && Boolean(navigator.storage?.getDirectory);
    if (hasOpfs) {
      memoryModelBytes.delete(`${descriptor.voiceId}.onnx`);
    }

    let session: ort.InferenceSession | null = null;
    let useWorker = false;
    const worker = getSynthWorker();
    if (worker) {
      try {
        // OPFS önbelleği varsa belleği sıfır kopyayla (Transferable) doğrudan worker'a aktar
        const bufForWorker = hasOpfs ? onnxBuf : onnxBuf.slice(0);
        await callSynthWorker(
          { type: 'compile', voiceId: descriptor.voiceId, onnxBuffer: bufForWorker },
          [bufForWorker],
        );
        useWorker = true;
      } catch {
        useWorker = false;
      }
    }

    if (!useWorker) {
      const freshOnnx = onnxBuf.byteLength > 0
        ? onnxBuf
        : await getOrDownloadAsset(`${descriptor.voiceId}.onnx`, descriptor.onnxUrl);
      session = await ort.InferenceSession.create(freshOnnx, {
        executionProviders: ['wasm'],
        graphOptimizationLevel: 'all',
      });
    }

    updateStatus({ state: 'ready', progressPct: 100, activeLabel: label });
    return { descriptor, session, useWorker, config } as CompiledVitsModel;
  })().catch(err => {
    compiledModelCache.delete(voiceId);
    updateStatus({ state: 'error', progressPct: 0, activeLabel: label });
    throw err;
  });

  compiledModelCache.set(voiceId, loadPromise);
  return loadPromise;
}

export function warmupVitsVoice(voiceId: VitsTurkishVoiceId = 'tr_TR-eren-fluid'): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  return getCompiledModel(voiceId).then(() => {});
}

// Eşzamanlı ONNX WASM çıkarımlarını sıraya al
let inferenceQueue: Promise<any> = Promise.resolve();

function enqueueInference<T>(task: () => Promise<T>): Promise<T> {
  const next = inferenceQueue.then(task, task);
  inferenceQueue = next.catch(() => {});
  return next;
}

/**
 * Bir konuşmacının ardışık Türkçe cümlelerini tek bir akıcı, kesintisiz,
 * örneklem-hassasiyetli (sample-accurate) stüdyo WAV akışı olarak sentezler.
 */
export async function synthesizeVitsTurkishTurn(
  spokenClauses: string[],
  voiceId: VitsTurkishVoiceId,
  customLengthScale?: number,
): Promise<SynthesizedSpeechClip | null> {
  if (typeof window === 'undefined') return null;
  const cleaned = spokenClauses.map(s => s.trim()).filter(Boolean);
  if (cleaned.length === 0) return null;

  const descriptor =
    VITS_TURKISH_VOICES.find(v => v.voiceId === voiceId) || VITS_TURKISH_VOICES[0];
  const lengthScale = customLengthScale ?? descriptor.defaultLengthScale;
  const cacheKey = `${descriptor.voiceId}::${lengthScale.toFixed(2)}::${cleaned.join(' || ')}`;

  const cached = synthesizedClipCache.get(cacheKey);
  if (cached) return cached;

  try {
    const model = await getCompiledModel(descriptor.voiceId);

    const clip = await enqueueInference(async () => {
      const again = synthesizedClipCache.get(cacheKey);
      if (again) return again;

      const sampleRate = model.config.audio?.sample_rate || 22050;
      const allPhonemeArrays = await phonemizeTurkishClauses(
        cleaned,
        model.config.espeak?.voice || 'tr',
        model.config.phoneme_id_map,
      );

      if (!allPhonemeArrays.length) return null;

      const noiseScale = descriptor.noiseScale;
      const baseLen = (model.config.inference?.length_scale ?? 1.0) * lengthScale;
      const noiseW = descriptor.noiseW;
      const hasSid =
        Boolean(model.config.speaker_id_map) &&
        Object.keys(model.config.speaker_id_map || {}).length > 0;

      const pcmSegments: Float32Array[] = [];
      let ranInWorker = false;

      if (model.useWorker) {
        try {
          const res = await callSynthWorker({
            type: 'infer',
            voiceId: descriptor.voiceId,
            phonemeArrays: allPhonemeArrays,
            sampleRate,
            noiseScale,
            baseLen,
            noiseW,
            hasSid,
          });
          if (Array.isArray(res?.pcmBuffers)) {
            for (const buf of res.pcmBuffers) {
              pcmSegments.push(new Float32Array(buf));
            }
            ranInWorker = true;
          }
        } catch {
          ranInWorker = false;
        }
      }

      if (!ranInWorker && model.session) {
        for (let i = 0; i < allPhonemeArrays.length; i++) {
          if (i > 0) {
            await new Promise(r => setTimeout(r, 0));
          }
          const phonemeIds = allPhonemeArrays[i];
          if (!phonemeIds || phonemeIds.length < 3) {
            pcmSegments.push(new Float32Array(Math.floor(sampleRate * 0.08)));
            continue;
          }
          const inputIds = BigInt64Array.from(phonemeIds, id => BigInt(id));
          const inputLengths = BigInt64Array.from([BigInt(phonemeIds.length)]);
          const feeds: Record<string, ort.Tensor> = {
            input: new ort.Tensor('int64', inputIds, [1, inputIds.length]),
            input_lengths: new ort.Tensor('int64', inputLengths, [1]),
            scales: new ort.Tensor('float32', new Float32Array([noiseScale, baseLen, noiseW]), [3]),
          };
          if (hasSid) {
            feeds.sid = new ort.Tensor('int64', BigInt64Array.from([0n]), [1]);
          }

          const results = await model.session.run(feeds);
          const outputTensor = results.output || Object.values(results)[0];
          if (outputTensor?.data) {
            pcmSegments.push(trimAndSmoothClausePcm(outputTensor.data as Float32Array, sampleRate));
          }
        }
      }

      if (pcmSegments.length === 0) return null;

      const { wavBuffer, durationSec, envelope, sentenceEndSec } = masterAndEncodeStudioWav(
        pcmSegments,
        cleaned,
        sampleRate,
      );
      const blob = new Blob([wavBuffer], { type: 'audio/x-wav' });
      const blobUrl = URL.createObjectURL(blob);

      const built: SynthesizedSpeechClip = {
        blobUrl,
        durationSec,
        envelope,
        sentenceEndSec,
      };

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
    return null;
  }
}

export async function synthesizeVitsTurkish(
  spokenText: string,
  voiceId: VitsTurkishVoiceId,
  customLengthScale?: number,
): Promise<SynthesizedSpeechClip | null> {
  return synthesizeVitsTurkishTurn([spokenText], voiceId, customLengthScale);
}
