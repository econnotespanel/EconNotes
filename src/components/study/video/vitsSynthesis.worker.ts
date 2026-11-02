// Arka Plan Web Worker — ONNX Runtime WASM Türkçe Ses Derleme ve Çıkarım Motoru
// Ana arayüz iş parçacığını (60 FPS sahne ve menü etkileşimlerini) hiçbir zaman bloklamaz.

import * as ort from 'onnxruntime-web';

const ONNX_WASM_BASE = 'https://cdnjs.cloudflare.com/ajax/libs/onnxruntime-web/1.18.0/';

ort.env.allowLocalModels = false;
ort.env.wasm.wasmPaths = ONNX_WASM_BASE;
ort.env.wasm.numThreads = 1;

const sessions = new Map<string, ort.InferenceSession>();

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

self.onmessage = async (event: MessageEvent) => {
  const msg = event.data;
  if (!msg || typeof msg.id !== 'number') return;

  try {
    if (msg.type === 'compile') {
      const { voiceId, onnxBuffer } = msg as {
        id: number;
        voiceId: string;
        onnxBuffer: ArrayBuffer;
      };
      if (!sessions.has(voiceId)) {
        const session = await ort.InferenceSession.create(onnxBuffer, {
          executionProviders: ['wasm'],
          graphOptimizationLevel: 'all',
        });
        sessions.set(voiceId, session);
      }
      (self as unknown as Worker).postMessage({ id: msg.id, ok: true });
      return;
    }

    if (msg.type === 'infer') {
      const {
        voiceId,
        phonemeArrays,
        sampleRate,
        noiseScale,
        baseLen,
        noiseW,
        hasSid,
      } = msg as {
        id: number;
        voiceId: string;
        phonemeArrays: number[][];
        sampleRate: number;
        noiseScale: number;
        baseLen: number;
        noiseW: number;
        hasSid: boolean;
      };

      const session = sessions.get(voiceId);
      if (!session) {
        throw new Error(`Model oturumu bulunamadı: ${voiceId}`);
      }

      const pcmBuffers: ArrayBuffer[] = [];
      for (let i = 0; i < phonemeArrays.length; i++) {
        const phonemeIds = phonemeArrays[i];
        if (!phonemeIds || phonemeIds.length < 3) {
          const empty = new Float32Array(Math.floor(sampleRate * 0.08));
          pcmBuffers.push(empty.buffer);
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

        const results = await session.run(feeds);
        const outputTensor = results.output || Object.values(results)[0];
        if (outputTensor?.data) {
          const trimmed = trimAndSmoothClausePcm(outputTensor.data as Float32Array, sampleRate);
          pcmBuffers.push(trimmed.buffer as ArrayBuffer);
        }
      }

      (self as unknown as Worker).postMessage(
        { id: msg.id, ok: true, pcmBuffers },
        pcmBuffers,
      );
      return;
    }

    throw new Error('Bilinmeyen worker komutu');
  } catch (err: any) {
    (self as unknown as Worker).postMessage({
      id: msg.id,
      ok: false,
      error: err?.message || String(err),
    });
  }
};
