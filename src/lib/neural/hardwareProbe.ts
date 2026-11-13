/**
 * Hardware Capability Probe for EconNotes Neural Studio.
 * Detects WebGPU GPU adapter capabilities (shader-f16, buffer limits, architecture),
 * CPU concurrency, device memory, and recommends the optimal quantized local model.
 */

export type HardwareTier = 'ultra' | 'pro' | 'standard' | 'cloud';

export interface LocalModelSpec {
  id: string;
  label: string;
  family: 'Qwen2.5';
  paramsLabel: string;
  quantization: 'q4f16' | 'q4f32';
  requiresF16: boolean;
  downloadEstimateMb: number;
  vramRequiredMb: number;
  description: string;
  speedRating: 1 | 2 | 3 | 4 | 5;
  turkishQuality: 1 | 2 | 3 | 4 | 5;
}

export interface GpuAdapterSummary {
  vendor: string;
  architecture: string;
  device: string;
  description: string;
  isFallbackAdapter: boolean;
  shaderF16: boolean;
  maxBufferSizeMb: number;
  maxStorageBufferMb: number;
  maxWorkgroupInvocations: number;
}

export interface HardwareProfile {
  probedAt: number;
  webgpuSupported: boolean;
  wasmSimd: boolean;
  indexedDbAvailable: boolean;
  cpuCores: number;
  deviceMemoryGb: number | null;
  adapter: GpuAdapterSummary | null;
  tier: HardwareTier;
  tierLabel: string;
  tierDescription: string;
  recommendedModelId: string;
}

interface GpuAdapterLike {
  features?: { has: (feature: string) => boolean };
  limits?: {
    maxBufferSize?: number;
    maxStorageBufferBindingSize?: number;
    maxComputeInvocationsPerWorkgroup?: number;
  };
  info?: {
    vendor?: string;
    architecture?: string;
    device?: string;
    description?: string;
  };
  isFallbackAdapter?: boolean;
  requestAdapterInfo?: () => Promise<{
    vendor?: string;
    architecture?: string;
    device?: string;
    description?: string;
  }>;
}

interface GpuLike {
  requestAdapter: (options?: {
    powerPreference?: 'high-performance' | 'low-power';
  }) => Promise<GpuAdapterLike | null>;
}

export const LOCAL_EMBEDDING_MODEL = 'Xenova/multilingual-e5-small';

export const LOCAL_MODEL_CATALOG: LocalModelSpec[] = [
  {
    id: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC',
    label: 'Qwen 2.5 · 0.5B Hızlı (FP16)',
    family: 'Qwen2.5',
    paramsLabel: '0.5B',
    quantization: 'q4f16',
    requiresF16: true,
    downloadEstimateMb: 390,
    vramRequiredMb: 945,
    description: 'Anında yüklenen ultra hafif model; hızlı arama ve kısa soru-cevap için ideal.',
    speedRating: 5,
    turkishQuality: 3,
  },
  {
    id: 'Qwen2.5-0.5B-Instruct-q4f32_1-MLC',
    label: 'Qwen 2.5 · 0.5B Uyumlu (FP32)',
    family: 'Qwen2.5',
    paramsLabel: '0.5B',
    quantization: 'q4f32',
    requiresF16: false,
    downloadEstimateMb: 450,
    vramRequiredMb: 1061,
    description: 'FP16 desteği olmayan GPU’larda bile çalışan hafif yerel model.',
    speedRating: 4,
    turkishQuality: 3,
  },
  {
    id: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC',
    label: 'Qwen 2.5 · 1.5B Dengeli (FP16)',
    family: 'Qwen2.5',
    paramsLabel: '1.5B',
    quantization: 'q4f16',
    requiresF16: true,
    downloadEstimateMb: 950,
    vramRequiredMb: 1630,
    description: 'Hız ve Türkçe akademik mantık yürütme arasında en iyi denge.',
    speedRating: 4,
    turkishQuality: 4,
  },
  {
    id: 'Qwen2.5-1.5B-Instruct-q4f32_1-MLC',
    label: 'Qwen 2.5 · 1.5B Dengeli (FP32)',
    family: 'Qwen2.5',
    paramsLabel: '1.5B',
    quantization: 'q4f32',
    requiresF16: false,
    downloadEstimateMb: 1100,
    vramRequiredMb: 1889,
    description: 'FP16 olmayan masaüstü/dizüstü GPU’lar için yüksek doğruluklu dengeli model.',
    speedRating: 3,
    turkishQuality: 4,
  },
  {
    id: 'Qwen2.5-3B-Instruct-q4f16_1-MLC',
    label: 'Qwen 2.5 · 3B Akademik Ultra (FP16)',
    family: 'Qwen2.5',
    paramsLabel: '3B',
    quantization: 'q4f16',
    requiresF16: true,
    downloadEstimateMb: 1850,
    vramRequiredMb: 2505,
    description: 'Güçlü GPU’lar için yüksek Türkçe kavrama, derin RAG sentezi ve gizlilik modu.',
    speedRating: 3,
    turkishQuality: 5,
  },
];

export function findModelSpec(modelId: string): LocalModelSpec {
  return (
    LOCAL_MODEL_CATALOG.find((m) => m.id === modelId) ||
    LOCAL_MODEL_CATALOG[2]
  );
}

export function classifyHardwareTier(params: {
  webgpuSupported: boolean;
  adapter: GpuAdapterSummary | null;
  cpuCores: number;
  deviceMemoryGb: number | null;
}): {
  tier: HardwareTier;
  tierLabel: string;
  tierDescription: string;
  recommendedModelId: string;
} {
  const { webgpuSupported, adapter, cpuCores, deviceMemoryGb } = params;
  if (!webgpuSupported || !adapter) {
    return {
      tier: 'cloud',
      tierLabel: 'Bulut Yapay Zekâ Modu',
      tierDescription:
        'Bu tarayıcıda WebGPU GPU hızlandırması algılanmadı; tüm materyaller yüksek doğruluklu bulut motorlarıyla çalışır.',
      recommendedModelId: LOCAL_MODEL_CATALOG[2].id,
    };
  }

  const maxBuf = adapter.maxBufferSizeMb;
  const f16 = adapter.shaderF16;
  const mem = deviceMemoryGb ?? 8;

  if (f16 && maxBuf >= 1024 && (mem >= 8 || cpuCores >= 8) && !adapter.isFallbackAdapter) {
    return {
      tier: 'ultra',
      tierLabel: 'Neural Ultra · Güçlü GPU',
      tierDescription:
        'FP16 WebGPU hızlandırması ve yüksek bellek limiti algılandı; 3B yerel model yüksek hızda çalışabilir.',
      recommendedModelId: 'Qwen2.5-3B-Instruct-q4f16_1-MLC',
    };
  }

  if (maxBuf >= 256 && !adapter.isFallbackAdapter) {
    return {
      tier: 'pro',
      tierLabel: 'Neural Pro · GPU Hızlandırmalı',
      tierDescription: f16
        ? 'FP16 destekli WebGPU GPU algılandı; 1.5B yerel model anlık sohbet ve RAG için uygundur.'
        : 'WebGPU GPU algılandı (FP32); uyumlu 1.5B FP32 model önerilir.',
      recommendedModelId: f16
        ? 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC'
        : 'Qwen2.5-1.5B-Instruct-q4f32_1-MLC',
    };
  }

  return {
    tier: 'standard',
    tierLabel: 'Neural Standart · Temel WebGPU',
    tierDescription:
      'Sınırlı GPU bellek tamponu algılandı; hızlı yanıt için 0.5B hafif yerel model veya bulut önerilir.',
    recommendedModelId: f16
      ? 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC'
      : 'Qwen2.5-0.5B-Instruct-q4f32_1-MLC',
  };
}

export function estimateModelFit(
  spec: LocalModelSpec,
  profile: HardwareProfile,
): 'fits' | 'tight' | 'unsupported' {
  if (!profile.webgpuSupported || !profile.adapter) return 'unsupported';
  if (spec.requiresF16 && !profile.adapter.shaderF16) return 'unsupported';
  const maxBuf = profile.adapter.maxBufferSizeMb;
  if (maxBuf > 0 && maxBuf < 256 && spec.vramRequiredMb > 1200) return 'tight';
  if (profile.deviceMemoryGb !== null && profile.deviceMemoryGb <= 4 && spec.vramRequiredMb > 1800) {
    return 'tight';
  }
  if (spec.vramRequiredMb > 2200 && profile.tier === 'standard') return 'tight';
  return 'fits';
}

function checkWasmSimd(): boolean {
  try {
    return typeof WebAssembly === 'object' && WebAssembly.validate(new Uint8Array([
      0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x01, 0x05, 0x01, 0x60,
      0x00, 0x01, 0x7b, 0x03, 0x02, 0x01, 0x00, 0x0a, 0x0a, 0x01, 0x08, 0x00,
      0x41, 0x00, 0xfd, 0x0f, 0x26, 0x0b,
    ]));
  } catch {
    return false;
  }
}

export async function probeHardware(): Promise<HardwareProfile> {
  const nav = typeof navigator !== 'undefined'
    ? (navigator as Navigator & { gpu?: GpuLike; deviceMemory?: number })
    : undefined;

  const cpuCores = Math.max(1, nav?.hardwareConcurrency || 4);
  const deviceMemoryGb =
    typeof nav?.deviceMemory === 'number' && Number.isFinite(nav.deviceMemory)
      ? nav.deviceMemory
      : null;
  const wasmSimd = checkWasmSimd();
  const indexedDbAvailable = typeof indexedDB !== 'undefined';

  let adapterSummary: GpuAdapterSummary | null = null;
  let webgpuSupported = Boolean(nav?.gpu);

  if (nav?.gpu) {
    try {
      const adapter = await nav.gpu.requestAdapter({ powerPreference: 'high-performance' });
      if (adapter) {
        const adapterExt = adapter as GpuAdapterLike;
        const info = adapterExt.info || (await adapterExt.requestAdapterInfo?.().catch(() => undefined)) || {};
        const maxBufferBytes = Number(adapterExt.limits?.maxBufferSize || 0);
        const maxStorageBytes = Number(adapterExt.limits?.maxStorageBufferBindingSize || 0);
        adapterSummary = {
          vendor: String(info.vendor || 'WebGPU GPU'),
          architecture: String(info.architecture || 'Standart Mimari'),
          device: String(info.device || info.description || 'Donanım Hızlandırıcı'),
          description: String(info.description || info.vendor || 'WebGPU Adaptörü'),
          isFallbackAdapter: Boolean(adapterExt.isFallbackAdapter),
          shaderF16: Boolean(adapterExt.features?.has('shader-f16')),
          maxBufferSizeMb: Math.round(maxBufferBytes / (1024 * 1024)),
          maxStorageBufferMb: Math.round(maxStorageBytes / (1024 * 1024)),
          maxWorkgroupInvocations: Number(adapterExt.limits?.maxComputeInvocationsPerWorkgroup || 256),
        };
      } else {
        webgpuSupported = false;
      }
    } catch {
      webgpuSupported = false;
    }
  }

  const classification = classifyHardwareTier({
    webgpuSupported,
    adapter: adapterSummary,
    cpuCores,
    deviceMemoryGb,
  });

  return {
    probedAt: Date.now(),
    webgpuSupported,
    wasmSimd,
    indexedDbAvailable,
    cpuCores,
    deviceMemoryGb,
    adapter: adapterSummary,
    ...classification,
  };
}
