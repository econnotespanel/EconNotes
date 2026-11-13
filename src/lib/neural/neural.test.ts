import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  classifyHardwareTier,
  estimateModelFit,
  LOCAL_MODEL_CATALOG,
  type HardwareProfile,
} from '@/lib/neural/hardwareProbe';
import { shouldUseLocalGpu } from '@/lib/neural/engineRouter';
import { neuralEngine } from '@/lib/neural/neuralEngine';
import {
  analyzeWeakTopics,
  buildExamStudyPlan,
  computeSm2Review,
  type SrsCardState,
} from '@/lib/neural/studyPlanner';
import {
  chunkDocument,
  clearVectorIndex,
  rankChunksHybrid,
  searchChunks,
  upsertDocumentChunks,
} from '@/lib/neural/vectorIndex';
import type { StudyMaterial, StudyProgressRow } from '@/types/study';

describe('Neural Studio Hardware Probe & Model Fit', () => {
  it('classifies ultra, pro, standard, and cloud hardware tiers accurately', () => {
    const ultra = classifyHardwareTier({
      webgpuSupported: true,
      cpuCores: 12,
      deviceMemoryGb: 16,
      adapter: {
        vendor: 'nvidia',
        architecture: 'ada',
        device: 'rtx',
        description: 'RTX GPU',
        isFallbackAdapter: false,
        shaderF16: true,
        maxBufferSizeMb: 2048,
        maxStorageBufferMb: 1024,
        maxWorkgroupInvocations: 1024,
      },
    });
    expect(ultra.tier).toBe('ultra');
    expect(ultra.recommendedModelId).toBe('Qwen2.5-3B-Instruct-q4f16_1-MLC');

    const pro = classifyHardwareTier({
      webgpuSupported: true,
      cpuCores: 8,
      deviceMemoryGb: 8,
      adapter: {
        vendor: 'apple',
        architecture: 'metal',
        device: 'm2',
        description: 'Apple GPU',
        isFallbackAdapter: false,
        shaderF16: false,
        maxBufferSizeMb: 512,
        maxStorageBufferMb: 512,
        maxWorkgroupInvocations: 512,
      },
    });
    expect(pro.tier).toBe('pro');
    expect(pro.recommendedModelId).toBe('Qwen2.5-1.5B-Instruct-q4f32_1-MLC');

    const standard = classifyHardwareTier({
      webgpuSupported: true,
      cpuCores: 4,
      deviceMemoryGb: 4,
      adapter: {
        vendor: 'intel',
        architecture: 'gen9',
        device: 'uhd',
        description: 'UHD',
        isFallbackAdapter: false,
        shaderF16: true,
        maxBufferSizeMb: 128,
        maxStorageBufferMb: 128,
        maxWorkgroupInvocations: 256,
      },
    });
    expect(standard.tier).toBe('standard');
    expect(standard.recommendedModelId).toBe('Qwen2.5-0.5B-Instruct-q4f16_1-MLC');

    const cloud = classifyHardwareTier({
      webgpuSupported: false,
      cpuCores: 4,
      deviceMemoryGb: 8,
      adapter: null,
    });
    expect(cloud.tier).toBe('cloud');
  });

  it('evaluates model fit with FP16 capability and VRAM pressure', () => {
    const f16Spec = LOCAL_MODEL_CATALOG.find((m) => m.id === 'Qwen2.5-3B-Instruct-q4f16_1-MLC')!;
    const f32Spec = LOCAL_MODEL_CATALOG.find((m) => m.id === 'Qwen2.5-0.5B-Instruct-q4f32_1-MLC')!;

    const noF16Profile: HardwareProfile = {
      probedAt: Date.now(),
      webgpuSupported: true,
      wasmSimd: true,
      indexedDbAvailable: true,
      cpuCores: 8,
      deviceMemoryGb: 8,
      tier: 'pro',
      tierLabel: 'Pro',
      tierDescription: '',
      recommendedModelId: f32Spec.id,
      adapter: {
        vendor: 'amd',
        architecture: 'rdna',
        device: 'gpu',
        description: 'GPU',
        isFallbackAdapter: false,
        shaderF16: false,
        maxBufferSizeMb: 512,
        maxStorageBufferMb: 512,
        maxWorkgroupInvocations: 512,
      },
    };

    expect(estimateModelFit(f16Spec, noF16Profile)).toBe('unsupported');
    expect(estimateModelFit(f32Spec, noF16Profile)).toBe('fits');

    const cloudProfile: HardwareProfile = {
      ...noF16Profile,
      webgpuSupported: false,
      adapter: null,
      tier: 'cloud',
    };
    expect(estimateModelFit(f32Spec, cloudProfile)).toBe('unsupported');
  });
});

describe('Neural Vector Index & Hybrid RAG Retrieval', () => {
  afterEach(async () => {
    await clearVectorIndex();
  });

  it('preserves headings during chunking and retrieves top hits via hybrid ranking', async () => {
    const text = [
      '## Para Arzı ve Merkez Bankası',
      'Merkez bankası zorunlu karşılık oranları ve açık piyasa işlemleri aracılığıyla bankacılık sistemi likiditesini ve para arzını doğrudan yönetir.',
      '',
      '## Maliye Politikası Çarpanı',
      'Genişletici maliye politikası kamu harcamalarını artırarak toplam talebi ve GSYİH denge düzeyini sağa doğru kaydırır.',
    ].join('\n');

    const chunks = chunkDocument('doc-macro-1', 'Makro Ders Notu', 'Makroekonomi', text);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    expect(chunks[0].sectionHeading).toContain('Para Arzı');

    chunks[0].embedding = [1, 0, 0];
    chunks[1].embedding = [0, 1, 0];

    await upsertDocumentChunks('doc-macro-1', chunks);
    const hits = await searchChunks({
      query: 'Merkez bankası açık piyasa işlemleri',
      queryVector: [0.98, 0.05, 0],
      topK: 2,
    });

    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].chunk.sectionHeading).toContain('Para Arzı');
    expect(hits[0].semanticScore).toBeGreaterThan(0.8);

    const lexicalOnly = rankChunksHybrid(chunks, 'maliye çarpanı GSYİH', 1);
    expect(lexicalOnly[0].chunk.sectionHeading).toContain('Maliye');
  });
});

describe('SM-2 Spaced Repetition & Exam Countdown Planner', () => {
  it('computes SM-2 intervals on recall and resets on lapse', () => {
    const now = 1_700_000_000_000;
    const base: SrsCardState = {
      id: 'c1',
      materialId: 'm1',
      materialTitle: 'Ekonometri',
      course: 'Ekonometri',
      front: 'OLS nedir?',
      back: 'Sıradan En Küçük Kareler',
      repetitions: 0,
      intervalDays: 0,
      easeFactor: 2.5,
      lastReviewedAt: null,
      nextReviewAt: now,
      lapses: 0,
    };

    const r1 = computeSm2Review(base, 4, now);
    expect(r1.repetitions).toBe(1);
    expect(r1.intervalDays).toBe(1);

    const r2 = computeSm2Review(r1, 5, now + 86_400_000);
    expect(r2.repetitions).toBe(2);
    expect(r2.intervalDays).toBe(6);

    const r3 = computeSm2Review(r2, 4, now + 7 * 86_400_000);
    expect(r3.repetitions).toBe(3);
    expect(r3.intervalDays).toBeGreaterThan(10);

    const lapsed = computeSm2Review(r3, 1, now + 20 * 86_400_000);
    expect(lapsed.repetitions).toBe(0);
    expect(lapsed.intervalDays).toBe(1);
    expect(lapsed.lapses).toBe(1);
  });

  it('orders weak topics by quiz accuracy and builds structured daily tasks', () => {
    const now = Date.now();
    const materials: StudyMaterial[] = [
      {
        id: 'm-econ',
        source_type: 'own',
        source_note_id: null,
        material_type: 'quiz',
        title: 'Zaman Serileri Sınavı',
        course: 'Ekonometri',
        content: { questions: [] },
        model: null,
        created_at: new Date(now).toISOString(),
      },
      {
        id: 'm-macro',
        source_type: 'own',
        source_note_id: null,
        material_type: 'summary',
        title: 'Büyüme Modelleri',
        course: 'Makroekonomi',
        content: { overview: 'Solow modeli', sections: [] },
        model: null,
        created_at: new Date(now).toISOString(),
      },
    ];

    const progress: StudyProgressRow[] = [
      {
        material_id: 'm-econ',
        score: 4,
        total_questions: 10,
        completed_at: new Date(now).toISOString(),
      },
      {
        material_id: 'm-macro',
        score: 9,
        total_questions: 10,
        completed_at: new Date(now).toISOString(),
      },
    ];

    const weak = analyzeWeakTopics(materials, progress, [], now);
    expect(weak[0].course).toBe('Ekonometri');
    expect(weak[0].status).toBe('critical');
    expect(weak[1].status).toBe('mastered');

    const examIso = new Date(now + 4 * 86_400_000).toISOString().slice(0, 10);
    const plan = buildExamStudyPlan({
      examDateIso: examIso,
      dailyMinutes: 60,
      materials,
      weakTopics: weak,
      dueCardsCount: 8,
      nowMs: now,
    });

    expect(plan.length).toBeGreaterThanOrEqual(3);
    expect(plan[0].tasks.length).toBeGreaterThan(0);
    expect(plan[0].totalMinutes).toBeLessThanOrEqual(60);
  });
});

describe('Hybrid Engine Routing Policy', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('routes instant vs heavy tasks according to policy and GPU readiness', () => {
    const spy = vi.spyOn(neuralEngine, 'getSnapshot');

    spy.mockReturnValue({
      ...neuralEngine.getSnapshot(),
      llmStatus: 'idle',
      prefs: { routingPolicy: 'auto', selectedModelId: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC', downloadedModels: [] },
    });
    expect(shouldUseLocalGpu('instant')).toBe(false);

    spy.mockReturnValue({
      ...neuralEngine.getSnapshot(),
      llmStatus: 'ready',
      prefs: { routingPolicy: 'auto', selectedModelId: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC', downloadedModels: [] },
    });
    expect(shouldUseLocalGpu('instant')).toBe(true);
    expect(shouldUseLocalGpu('heavy')).toBe(false);

    spy.mockReturnValue({
      ...neuralEngine.getSnapshot(),
      llmStatus: 'ready',
      prefs: { routingPolicy: 'gpu_prefer', selectedModelId: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC', downloadedModels: [] },
    });
    expect(shouldUseLocalGpu('heavy')).toBe(true);

    spy.mockReturnValue({
      ...neuralEngine.getSnapshot(),
      llmStatus: 'ready',
      prefs: { routingPolicy: 'cloud_only', selectedModelId: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC', downloadedModels: [] },
    });
    expect(shouldUseLocalGpu('instant')).toBe(false);
  });
});
