import { supabase } from '@/integrations/supabase/client';
import { generateClientStudyMaterial, type GeneratePayload } from '@/lib/studyMaterialGenerator';
import { sampleUniformContext, sliceContextForSection } from '@/lib/studySourceProcessor';
import type {
  CoachMode,
  OpenEndedGradeResult,
  ProcessedStudyBundle,
  StudyContentPayload,
  StudioGenerationSettings,
  SummaryContent,
  SummarySection,
} from '@/types/study';

export interface OrchestrationResult {
  content: StudyContentPayload;
  model: string;
  sourceMode: 'ai' | 'fallback' | 'local';
}

export type ProgressCallback = (pct: number, label: string) => void;

const PUBLIC_REASONING_URL = 'https://text.pollinations.ai/openai';

function extractJsonLoose(raw: string): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    // continue
  }
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) {
    try {
      return JSON.parse(fence[1].trim()) as Record<string, unknown>;
    } catch {
      // continue
    }
  }
  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first !== -1 && last > first) {
    try {
      return JSON.parse(trimmed.slice(first, last + 1)) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  return null;
}

async function ensureFreshSession() {
  try {
    const { data } = await supabase.auth.getSession();
    const expiresAt = data.session?.expires_at;
    if (expiresAt && expiresAt * 1000 - Date.now() < 60_000) {
      await supabase.auth.refreshSession().catch(() => {});
    }
  } catch {
    // Ignore in test environments
  }
}

async function invokeEdgeGenerate(body: Record<string, unknown>): Promise<{
  content: StudyContentPayload & Record<string, unknown>;
  model: string;
  sourceMode: 'ai' | 'fallback';
} | null> {
  try {
    await ensureFreshSession();
    const { data, error } = await supabase.functions.invoke('generate-study-material', {
      body,
    });
    if (error || !data || data.error || !data.content) {
      return null;
    }
    return {
      content: data.content as StudyContentPayload & Record<string, unknown>,
      model: String(data.model || 'EconNotes Deep Academic AI'),
      sourceMode: data.sourceMode === 'fallback' ? 'fallback' : 'ai',
    };
  } catch {
    return null;
  }
}

async function postPublicJsonAttempt(
  systemPrompt: string,
  userPrompt: string,
  useResponseFormat: boolean,
): Promise<Record<string, unknown> | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 38_000);
    const bodyPayload: Record<string, unknown> = {
      model: 'openai',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt.slice(0, 15_500) },
      ],
      temperature: 0.28,
    };
    if (useResponseFormat) {
      bodyPayload.response_format = { type: 'json_object' };
    }
    const res = await fetch(PUBLIC_REASONING_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bodyPayload),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const json = await res.json();
    const text = json?.choices?.[0]?.message?.content;
    if (typeof text !== 'string' || !text.trim()) return null;
    return extractJsonLoose(text);
  } catch {
    return null;
  }
}

async function invokePublicJsonFallback(
  systemPrompt: string,
  userPrompt: string,
): Promise<Record<string, unknown> | null> {
  const first = await postPublicJsonAttempt(systemPrompt, userPrompt, true);
  if (first) return first;
  // Bazı genel uç noktalar response_format: json_object ile 400 döndürür; kısıtsız JSON istemiyle tekrar dene
  return postPublicJsonAttempt(
    `${systemPrompt}\n\nKRİTİK: Yalnızca ham JSON nesnesi ({...}) döndür, ek sohbet veya markdown açıklaması yazma.`,
    userPrompt,
    false,
  );
}

function averageSectionWords(sections: SummarySection[]): number {
  if (!sections.length) return 0;
  const totalWords = sections.reduce(
    (sum, s) => sum + String(s.content || '').trim().split(/\s+/).filter(Boolean).length,
    0,
  );
  return totalWords / sections.length;
}

function buildSectionExpansionSystemPrompt(settings: StudioGenerationSettings): string {
  const wordsTarget =
    settings.summaryDepth === 'short'
      ? '180-250'
      : settings.summaryDepth === 'textbook'
      ? '360-520'
      : settings.summaryDepth === 'comprehensive'
      ? '300-440'
      : '240-340';
  return `Sen seçkin bir üniversite kürsü profesörüsün. Sana verilen ders bölümü taslağını ve kaynak metin kesitini kullanarak derin, akıcı, akademik ders kitabı düzeyinde Türkçe özet bölümleri yaz.
${settings.deepResearch ? 'Derin Araştırma aktif: teorik arka plan, literatür bağlamı ve Türkiye/küresel uygulama örneğini "deepResearchNote" alanında sun.' : ''}
Kurallar:
- Her bölüm ${wordsTarget} kelime civarında eksiksiz Markdown prose olsun (### alt başlıklar, madde işaretleri, uygunsa formül $...$ veya $$...$$ ve Markdown karşılaştırma tablosu |...|...| kullan).
- Kopya/yüzeysel cümle dizimi veya genel şablon klişeler asla kullanma; kaynak metindeki kavramları sebep-sonuç zinciriyle açıkla.
YALNIZCA JSON döndür:
{
  "sections": [
    {
      "index": 0,
      "heading": "Bölüm başlığı",
      "pageRange": "Varsa sayfa",
      "content": "Zengin Türkçe Markdown ders bölümü...",
      "takeaways": ["Net çıkarım 1", "Net çıkarım 2", "Net çıkarım 3"],
      "deepResearchNote": "Varsa ek akademik bağlam / vaka",
      "commonPitfalls": ["Sınavda en sık karıştırılan tuzak"],
      "checkpointQuestion": { "question": "Soru?", "options": ["A","B","C","D"], "correctIndex": 0, "explanation": "Açıklama" }
    }
  ]
}`;
}

async function generatePublicMapReduceSummary(
  bundle: ProcessedStudyBundle,
  settings: StudioGenerationSettings,
  onProgress?: ProgressCallback,
): Promise<SummaryContent | null> {
  const targetCount =
    settings.summaryDepth === 'short'
      ? 4
      : settings.summaryDepth === 'textbook'
      ? 8
      : settings.summaryDepth === 'comprehensive'
      ? 7
      : 6;

  onProgress?.(32, 'Bulut yapay zekâ ile ders planı ve kavram mimarisi çıkarılıyor...');
  const bpSystem = `Sen seçkin bir üniversite profesörüsün. Verilen ders materyalini tarayarak ${targetCount} ana bölümlük kapsamlı bir özet mimarisi oluştur.
YALNIZCA JSON döndür:
{
  "overview": "Konunun amacını, kuramsal çerçevesini ve büyük resmini anlatan 2 güçlü paragraf",
  "disciplineTag": "Örn: Para Teorisi & Makroekonomi",
  "keyPoints": ["6-8 kapsamlı anahtar çıkarım"],
  "sectionsPlan": [
    { "index": 0, "title": "Net akademik bölüm başlığı", "pageRange": "", "focusPoints": ["Odak 1", "Odak 2", "Odak 3"] }
  ],
  "teacherEmphasis": [{ "point": "Kritik kavram", "whyImportant": "Sınavda neden sorulur", "examProbability": "Yüksek" }],
  "comparativeMatrix": { "title": "Karşılaştırma Tablosu", "columns": ["Boyut", "Özellik / Etki", "Sınav Ayrımı"], "rows": [["...", "...", "..."]] },
  "keyTerms": [{ "term": "Terim", "definition": "Tam tanım", "formula": "" }],
  "studyChecklist": ["Öğrenme hedefi 1", "Öğrenme hedefi 2"]
}`;
  const bpUser = `DERS: ${bundle.course || bundle.detectedDiscipline}\nBAŞLIK: ${bundle.title}\n${
    settings.customPrompt ? `ÖZEL İSTEK: ${settings.customPrompt}\n` : ''
  }\nKAYNAK ÖZETİ:\n${sampleUniformContext(bundle.combinedText, 14_000)}`;

  const bp = await invokePublicJsonFallback(bpSystem, bpUser);
  const rawPlan = Array.isArray(bp?.sectionsPlan)
    ? (bp.sectionsPlan as Array<{ index?: number; title?: string; pageRange?: string; focusPoints?: string[] }>)
    : [];

  if (rawPlan.length === 0) {
    // Plan çıkarılamazsa kompakt tek seferlik bulut sentezini dene
    const singlePrompt = buildPublicSummaryPrompt(bundle, settings);
    const singleJson = await invokePublicJsonFallback(singlePrompt.system, singlePrompt.user);
    if (singleJson && Array.isArray(singleJson.sections) && singleJson.sections.length > 0) {
      return {
        ...(singleJson as unknown as SummaryContent),
        disciplineTag: String(singleJson.disciplineTag || bundle.detectedDiscipline),
        metadata: {
          sourceMode: 'ai',
          deepResearch: settings.deepResearch,
          summaryDepth: settings.summaryDepth,
          sourceStats: {
            sourceCount: bundle.sourceCount,
            wordCount: bundle.totalWords,
            pagesOrSlides: bundle.totalPagesOrSlides,
            sectionCount: singleJson.sections.length,
          },
        },
      };
    }
    return null;
  }

  const normalizedPlan = rawPlan.map((p, idx) => ({
    index: typeof p.index === 'number' ? p.index : idx,
    title: String(p.title || `Bölüm ${idx + 1}`),
    pageRange: p.pageRange ? String(p.pageRange) : undefined,
    focusPoints: Array.isArray(p.focusPoints) ? p.focusPoints.map(String) : [],
  }));

  const expandSys = buildSectionExpansionSystemPrompt(settings);
  const expandedSections: SummarySection[] = [];
  const batchSize = 2;

  for (let i = 0; i < normalizedPlan.length; i += batchSize) {
    const batch = normalizedPlan.slice(i, i + batchSize);
    const pct = Math.min(92, Math.round(45 + ((i + batch.length) / Math.max(1, normalizedPlan.length)) * 45));
    onProgress?.(pct, `Bulut ders kitabı bölümleri yazılıyor (${i + 1}-${Math.min(i + batchSize, normalizedPlan.length)}/${normalizedPlan.length})...`);

    const batchPayload = batch.map((b) => ({
      index: b.index,
      heading: b.title,
      focusPoints: b.focusPoints,
      sourceExcerpt: sliceContextForSection(bundle.combinedText, b.title, b.index, normalizedPlan.length, b.focusPoints, 4_200),
    }));

    const batchUser = `DERS: ${bundle.course || bundle.detectedDiscipline} | BAŞLIK: ${bundle.title}\nGENEL ÖZET: ${String(
      bp?.overview || '',
    )}\nBÖLÜMLER:\n${JSON.stringify(batchPayload)}`;
    const expandedJson = await invokePublicJsonFallback(expandSys, batchUser);
    const gotSections = Array.isArray(expandedJson?.sections)
      ? (expandedJson.sections as SummarySection[])
      : [];

    batch.forEach((b, bi) => {
      const matched = gotSections.find((s) => s.index === b.index) || gotSections[bi];
      if (matched && String(matched.content || '').trim().length > 40) {
        expandedSections.push({
          ...matched,
          index: b.index,
          heading: matched.heading || b.title,
          pageRange: matched.pageRange || b.pageRange,
        });
      } else {
        expandedSections.push({
          index: b.index,
          heading: b.title,
          pageRange: b.pageRange,
          content: batchPayload[bi].sourceExcerpt,
          takeaways: b.focusPoints.slice(0, 3),
        });
      }
    });
  }

  expandedSections.sort((a, b) => (a.index ?? 0) - (b.index ?? 0));

  return {
    overview: String(bp?.overview || `${bundle.title} çalışma özeti`),
    disciplineTag: String(bp?.disciplineTag || bundle.detectedDiscipline),
    keyPoints: Array.isArray(bp?.keyPoints) ? bp.keyPoints.map(String) : [],
    sections: expandedSections,
    teacherEmphasis: Array.isArray(bp?.teacherEmphasis) ? (bp.teacherEmphasis as SummaryContent['teacherEmphasis']) : [],
    comparativeMatrix: bp?.comparativeMatrix as SummaryContent['comparativeMatrix'],
    deepResearchTopics: Array.isArray(bp?.deepResearchTopics)
      ? (bp.deepResearchTopics as SummaryContent['deepResearchTopics'])
      : [],
    keyTerms: Array.isArray(bp?.keyTerms) ? (bp.keyTerms as SummaryContent['keyTerms']) : [],
    studyChecklist: Array.isArray(bp?.studyChecklist) ? bp.studyChecklist.map(String) : [],
    metadata: {
      sourceMode: 'ai',
      deepResearch: settings.deepResearch,
      summaryDepth: settings.summaryDepth,
      sourceStats: {
        sourceCount: bundle.sourceCount,
        wordCount: bundle.totalWords,
        pagesOrSlides: bundle.totalPagesOrSlides,
        sectionCount: expandedSections.length,
      },
    },
  };
}

function buildPublicSummaryPrompt(
  bundle: ProcessedStudyBundle,
  settings: StudioGenerationSettings,
): { system: string; user: string } {
  const depthHint =
    settings.summaryDepth === 'short'
      ? '4 bölüm, bölüm başına 180-240 kelime'
      : settings.summaryDepth === 'textbook'
      ? '6-7 bölüm, bölüm başına 280-420 kelime, çok derin ders kitabı düzeyi'
      : '5-6 bölüm, bölüm başına 240-350 kelime, kapsamlı fakülte düzeyi';

  const system = `Sen seçkin bir üniversite kürsü profesörüsün. Verilen notlardan kapsamlı, formüllü ($...$, $$...$$), Markdown tablolu ve sıfır şablon cümleli Türkçe Çalışma Özeti üret.
${
  settings.deepResearch
    ? 'Derin Araştırma aktif: teorik arka plan, literatür bağlamı ve Türkiye/dünya vaka örneklerini [Derin Akademik Araştırma] etiketiyle ekle.'
    : ''
}
Hedef uzunluk: ${depthHint}.
YALNIZCA geçerli JSON döndür:
{
  "overview": "2 paragraf yönetici özeti",
  "keyPoints": ["6-8 madde"],
  "sections": [{
    "heading": "Bölüm başlığı",
    "content": "Zengin Markdown + LaTeX + örnek + tablo metni",
    "takeaways": ["3 çıkarım"],
    "deepResearchNote": "Varsa derin akademik araştırma notu",
    "commonPitfalls": ["Yaygın hata"],
    "checkpointQuestion": { "question": "...", "options": ["A","B","C","D"], "correctIndex": 0, "explanation": "..." }
  }],
  "teacherEmphasis": [{ "point": "...", "whyImportant": "...", "examProbability": "Yüksek" }],
  "comparativeMatrix": { "title": "...", "columns": ["Boyut","A","B"], "rows": [["...","...","..."]] },
  "keyTerms": [{ "term": "...", "definition": "...", "formula": "..." }],
  "studyChecklist": ["Kendini değerlendirme maddesi"]
}`;

  const user = `DERS: ${bundle.course || bundle.detectedDiscipline}\nBAŞLIK: ${bundle.title}\n${
    settings.customPrompt ? `ÖZEL İSTEK: ${settings.customPrompt}\n` : ''
  }\nKAYNAK METİN:\n${sampleUniformContext(bundle.combinedText, 14_000)}`;

  return { system, user };
}

async function enrichThinAiSections(
  rawSummary: SummaryContent,
  bundle: ProcessedStudyBundle,
  settings: StudioGenerationSettings,
  onProgress?: ProgressCallback,
): Promise<SummaryContent> {
  const existing = Array.isArray(rawSummary.sections) ? rawSummary.sections : [];
  if (existing.length === 0) return rawSummary;

  const avgWords = averageSectionWords(existing);
  const needsDeepening =
    (settings.summaryDepth !== 'short' && avgWords < 175) ||
    (settings.deepResearch && !existing.some((s) => Boolean(s.deepResearchNote)));

  if (!needsDeepening || bundle.images.length > 0) {
    return rawSummary;
  }

  onProgress?.(68, 'Yapay zekâ özet bölümleri fakülte ders kitabı düzeyine derinleştiriliyor...');
  const expandSys = buildSectionExpansionSystemPrompt(settings);
  const enriched: SummarySection[] = [];
  const batchSize = 2;

  for (let i = 0; i < existing.length; i += batchSize) {
    const batch = existing.slice(i, i + batchSize);
    const batchPayload = batch.map((sec, bi) => ({
      index: i + bi,
      heading: sec.heading,
      existingDraft: sec.content,
      sourceExcerpt: sliceContextForSection(bundle.combinedText, sec.heading, i + bi, existing.length, sec.takeaways || [], 3_800),
    }));
    const res = await invokePublicJsonFallback(
      expandSys,
      `DERS: ${bundle.course || bundle.detectedDiscipline} | BAŞLIK: ${bundle.title}\nMEVCUT BÖLÜMLERİ GENİŞLET:\n${JSON.stringify(
        batchPayload,
      )}`,
    );
    const expanded = Array.isArray(res?.sections) ? (res.sections as SummarySection[]) : [];
    batch.forEach((orig, bi) => {
      const match = expanded.find((s) => s.index === i + bi) || expanded[bi];
      if (match && String(match.content || '').length > String(orig.content || '').length) {
        enriched.push({
          ...orig,
          ...match,
          index: i + bi,
          heading: match.heading || orig.heading,
        });
      } else {
        enriched.push({ ...orig, index: i + bi });
      }
    });
  }

  return {
    ...rawSummary,
    sections: enriched,
  };
}

async function generateSummaryMapReduce(
  bundle: ProcessedStudyBundle,
  settings: StudioGenerationSettings,
  onProgress?: ProgressCallback,
): Promise<OrchestrationResult> {
  onProgress?.(12, '1/3 • Kaynak mimarisi ve ders haritası çıkarılıyor...');

  const commonReq = {
    noteTitle: bundle.title,
    course: bundle.course || bundle.detectedDiscipline,
    summaryDepth: settings.summaryDepth,
    deepResearch: settings.deepResearch,
    pedagogicalStyle: settings.pedagogicalStyle,
    customPrompt: settings.customPrompt || undefined,
    examFocus: settings.examFocus || undefined,
  };

  // Use single pass ONLY when short depth AND compact text (< 300 words) AND not deep research
  if (settings.summaryDepth === 'short' && bundle.totalWords < 300 && !settings.deepResearch) {
    const singleEdge = await invokeEdgeGenerate({
      ...commonReq,
      materialType: 'summary',
      stage: 'single',
      noteContext: bundle.combinedText,
      images: bundle.images.length > 0 ? bundle.images : undefined,
      audio: bundle.audio,
    });
    if (singleEdge && singleEdge.sourceMode === 'ai') {
      return {
        content: {
          ...singleEdge.content,
          metadata: {
            sourceMode: 'ai',
            deepResearch: settings.deepResearch,
            summaryDepth: settings.summaryDepth,
            sourceStats: {
              sourceCount: bundle.sourceCount,
              wordCount: bundle.totalWords,
              pagesOrSlides: bundle.totalPagesOrSlides,
              sectionCount: singleEdge.content?.sections?.length || 0,
            },
          },
        },
        model: singleEdge.model,
        sourceMode: 'ai',
      };
    }
  }

  // Stage 1: Blueprint
  const blueprintRes = await invokeEdgeGenerate({
    ...commonReq,
    materialType: 'summary',
    stage: 'blueprint',
    noteContext: sampleUniformContext(bundle.combinedText, 68_000),
    images: bundle.images.length > 0 ? bundle.images : undefined,
    audio: bundle.audio,
  });

  if (blueprintRes && blueprintRes.sourceMode === 'ai' && Array.isArray(blueprintRes.content?.sectionsPlan)) {
    const blueprint = blueprintRes.content;
    const plan: Array<{
      index: number;
      title: string;
      pageRange?: string;
      focusPoints?: string[];
      keyConcepts?: string[];
    }> = blueprint.sectionsPlan;

    const batchSize = 3;
    const batches: typeof plan[] = [];
    for (let i = 0; i < plan.length; i += batchSize) {
      batches.push(plan.slice(i, i + batchSize));
    }

    const expandedSections: SummarySection[] = [];
    let allBatchesAi = true;

    for (let bIdx = 0; bIdx < batches.length; bIdx++) {
      const batch = batches[bIdx];
      const pct = Math.min(92, Math.round(35 + ((bIdx + 1) / Math.max(1, batches.length)) * 55));
      const rangeLabel = `${batch[0].index + 1}-${batch[batch.length - 1].index + 1}/${plan.length}`;
      onProgress?.(pct, `2/3 • Bölümler derinlemesine yazılıyor (${rangeLabel})...`);

      const sectionTargets = batch.map((item) => ({
        ...item,
        contextSlice: sliceContextForSection(
          bundle.combinedText,
          item.title,
          item.index,
          plan.length,
          item.focusPoints || [],
        ),
      }));

      const batchRes = await invokeEdgeGenerate({
        ...commonReq,
        materialType: 'summary',
        stage: 'expand_batch',
        noteContext: sampleUniformContext(bundle.combinedText, 32_000),
        globalOutline: {
          overview: blueprint.overview,
          keyPoints: blueprint.keyPoints,
          courseTitle: bundle.course,
        },
        sectionTargets,
      });

      if (batchRes?.content?.sections && Array.isArray(batchRes.content.sections)) {
        if (batchRes.sourceMode !== 'ai') allBatchesAi = false;
        for (const sec of batchRes.content.sections) {
          expandedSections.push(sec);
        }
      } else {
        // Edge expand_batch başarısız olduysa Tier-2 Public AI ile bu bölümü kurtar
        const pubBatch = await invokePublicJsonFallback(
          buildSectionExpansionSystemPrompt(settings),
          `DERS: ${bundle.course || bundle.detectedDiscipline}\nBÖLÜMLER:\n${JSON.stringify(sectionTargets)}`,
        );
        if (Array.isArray(pubBatch?.sections) && pubBatch.sections.length > 0) {
          for (const sec of pubBatch.sections as SummarySection[]) {
            expandedSections.push(sec);
          }
        } else {
          allBatchesAi = false;
          for (const target of sectionTargets) {
            expandedSections.push({
              index: target.index,
              heading: target.title,
              pageRange: target.pageRange,
              content: target.contextSlice || '',
              takeaways: (target.focusPoints || []).slice(0, 3),
            });
          }
        }
      }
    }

    expandedSections.sort((a, b) => (a.index ?? 0) - (b.index ?? 0));

    onProgress?.(96, '3/3 • Karşılaştırma matrisi ve kontrol listesi birleştiriliyor...');
    const finalSummary: SummaryContent = {
      overview: blueprint.overview,
      disciplineTag: blueprint.disciplineTag || bundle.detectedDiscipline,
      keyPoints: blueprint.keyPoints || [],
      sections: expandedSections,
      teacherEmphasis: blueprint.teacherEmphasis || [],
      comparativeMatrix: blueprint.comparativeMatrix,
      deepResearchTopics: blueprint.deepResearchTopics || [],
      keyTerms: blueprint.keyTerms || [],
      studyChecklist: blueprint.studyChecklist || [],
      metadata: {
        sourceMode: allBatchesAi ? 'ai' : 'fallback',
        deepResearch: settings.deepResearch,
        summaryDepth: settings.summaryDepth,
        sourceStats: {
          sourceCount: bundle.sourceCount,
          wordCount: bundle.totalWords,
          pagesOrSlides: bundle.totalPagesOrSlides,
          sectionCount: expandedSections.length,
        },
      },
    };

    return {
      content: finalSummary,
      model: blueprintRes.model,
      sourceMode: allBatchesAi ? 'ai' : 'fallback',
    };
  }

  // Eski/tek-atışlı Supabase Edge sürümü sectionsPlan yerine doğrudan sections döndürdüyse kurtar ve derinleştir!
  if (
    blueprintRes &&
    blueprintRes.sourceMode === 'ai' &&
    Array.isArray(blueprintRes.content?.sections) &&
    blueprintRes.content.sections.length > 0
  ) {
    const deepened = await enrichThinAiSections(
      blueprintRes.content as unknown as SummaryContent,
      bundle,
      settings,
      onProgress,
    );
    return {
      content: {
        ...deepened,
        disciplineTag: deepened.disciplineTag || bundle.detectedDiscipline,
        metadata: {
          sourceMode: 'ai',
          deepResearch: settings.deepResearch,
          summaryDepth: settings.summaryDepth,
          sourceStats: {
            sourceCount: bundle.sourceCount,
            wordCount: bundle.totalWords,
            pagesOrSlides: bundle.totalPagesOrSlides,
            sectionCount: deepened.sections?.length || 0,
          },
        },
      },
      model: blueprintRes.model,
      sourceMode: 'ai',
    };
  }

  // Tier-2 Client Public AI Map-Reduce Synthesis (Blueprint + Batched Expansion)
  if (bundle.images.length === 0 && bundle.combinedText.trim().length >= 30) {
    const pubSummary = await generatePublicMapReduceSummary(bundle, settings, onProgress);
    if (pubSummary && pubSummary.sections.length > 0) {
      return {
        content: pubSummary,
        model: 'EconNotes Cloud Academic AI',
        sourceMode: 'ai',
      };
    }
  }

  // Tier-3 Local Deterministic Structured Parser (guarantees zero crash + zero foreign boilerplate)
  onProgress?.(90, 'Yerel yapısal ders ayrıştırıcı ile özet hazırlanıyor...');
  const local = generateClientStudyMaterial({
    materialType: 'summary',
    noteTitle: bundle.title,
    course: bundle.course || bundle.detectedDiscipline,
    noteContext: bundle.combinedText,
    summaryDepth: settings.summaryDepth,
    deepResearch: settings.deepResearch,
    pedagogicalStyle: settings.pedagogicalStyle,
    customPrompt: settings.customPrompt,
  });
  return {
    content: {
      ...local,
      disciplineTag: bundle.detectedDiscipline,
      metadata: {
        sourceMode: 'local',
        deepResearch: settings.deepResearch,
        summaryDepth: settings.summaryDepth,
        sourceStats: {
          sourceCount: bundle.sourceCount,
          wordCount: bundle.totalWords,
          pagesOrSlides: bundle.totalPagesOrSlides,
          sectionCount: local.sections?.length || 0,
        },
      },
    },
    model: 'EconNotes Yerel Yapısal Ayrıştırıcı',
    sourceMode: 'local',
  };
}

export async function generateMaterialWithOrchestration(
  bundle: ProcessedStudyBundle,
  settings: StudioGenerationSettings,
  onProgress?: ProgressCallback,
): Promise<OrchestrationResult> {
  if (settings.materialType === 'summary') {
    return generateSummaryMapReduce(bundle, settings, onProgress);
  }

  onProgress?.(
    25,
    settings.materialType === 'quiz'
      ? 'Soru bankası ve rubrikler oluşturuluyor...'
      : settings.materialType === 'flashcards'
      ? 'Aktif hatırlama kartları sentezleniyor...'
      : 'İnteraktif video ders sahneleri ve görsel diyagramlar hazırlanıyor...',
  );

  const edgeRes = await invokeEdgeGenerate({
    materialType: settings.materialType,
    stage: 'single',
    noteTitle: bundle.title,
    course: bundle.course || bundle.detectedDiscipline,
    noteContext: sampleUniformContext(bundle.combinedText, 68_000),
    questionCount: settings.questionCount,
    cardCount: settings.cardCount,
    difficulty: settings.difficulty,
    quizFormat: settings.quizFormat,
    deepResearch: settings.deepResearch,
    pedagogicalStyle: settings.pedagogicalStyle,
    customPrompt: settings.customPrompt || undefined,
    examFocus: settings.examFocus || undefined,
    images: bundle.images.length > 0 ? bundle.images : undefined,
    audio: bundle.audio,
  });

  if (edgeRes && edgeRes.sourceMode === 'ai') {
    onProgress?.(95, 'Materyal hazırlandı.');
    return {
      content: {
        ...edgeRes.content,
        metadata: {
          sourceMode: 'ai',
          deepResearch: settings.deepResearch,
        },
      },
      model: edgeRes.model,
      sourceMode: 'ai',
    };
  }

  // Tier-2 Public Cloud AI fallback (quiz / flashcards / interactive video!)
  if (bundle.images.length === 0 && bundle.combinedText.trim().length >= 30) {
    onProgress?.(60, 'Alternatif bulut zekâ üzerinden zenginleştirilerek üretiliyor...');
    if (settings.materialType === 'video') {
      const videoSys = `Sen 3Blue1Brown ve MIT OpenCourseWare tarzında etkileşimli video ders senaristisin.
Verilen ders notlarından 6 sahneli, HER SAHNEDE FARKLI GÖRSEL ŞEMA ('visual', 'curve', 'table', 'shapes', 'chart', 'scenario', 'comparison') kullanan ve Dr. Deniz ile Barış arasındaki diyalogla ilerleyen JSON üret.
KESİN KURAL: Her sahnenin 'diagramData.nodes' dizisinde 3-4 dolu kavram kartı olmalı; 'examTip' asla selamlama veya 'Merhaba' içermemeli; iktisat/para konularında 'visualTheme': 'economics' olmalı.
YALNIZCA JSON döndür:
{
  "videoTitle": "...",
  "outline": "...",
  "keyFacts": ["...","...","..."],
  "scenes": [{
    "title": "...",
    "turns": [
      { "speaker": "Deniz", "text": "..." },
      { "speaker": "Barış", "text": "..." },
      { "speaker": "Deniz", "text": "..." }
    ],
    "diagramData": {
      "diagramType": "visual | curve | table | shapes | chart | scenario | comparison",
      "visualTheme": "economics | history | law | science | society",
      "mainTitle": "...",
      "highlightMetric": "...",
      "nodes": [
        { "label": "Kavram 1", "subtext": "Açıklama", "badge": "Temel İlke", "value": 85 },
        { "label": "Kavram 2", "subtext": "Açıklama", "badge": "Mekanizma", "value": 78 },
        { "label": "Kavram 3", "subtext": "Açıklama", "badge": "Koşul", "value": 72 }
      ]
    },
    "keyTakeaways": ["...","..."],
    "keyTerms": [{ "term": "...", "definition": "..." }],
    "examTip": "Sınav ayrımı"
  }],
  "matchingPairs": [{ "term": "...", "definition": "..." }],
  "examQuestions": [{ "question": "...", "options": ["A","B","C","D"], "correctIndex": 0, "explanation": "..." }]
}`;
      const videoUser = `DERS: ${bundle.course || bundle.detectedDiscipline}\nBAŞLIK: ${bundle.title}\n\nKAYNAK:\n${sampleUniformContext(
        bundle.combinedText,
        14_000,
      )}`;
      const pubVideo = await invokePublicJsonFallback(videoSys, videoUser);
      if (Array.isArray(pubVideo?.scenes) && pubVideo.scenes.length > 0) {
        return {
          content: { ...pubVideo, metadata: { sourceMode: 'ai', deepResearch: settings.deepResearch } },
          model: 'EconNotes Cloud Academic AI',
          sourceMode: 'ai',
        };
      }
    } else {
      const isQuiz = settings.materialType === 'quiz';
      const system = isQuiz
        ? `Üniversite hocası olarak ${settings.questionCount} adet ${settings.difficulty} zorlukta Türkçe sınav sorusu üret. Şık sırasını (correctIndex: 0..3) dengeli dağıt. JSON döndür: { "questions": [{ "type": "multiple_choice", "question": "...", "options": ["A","B","C","D"], "correctIndex": 0, "explanation": "...", "topic": "...", "difficulty": "medium", "bloomLevel": "Analiz" }] }`
        : `Aktif hatırlama uzmanı olarak ${settings.cardCount} adet Türkçe flashcard üret. JSON döndür: { "cards": [{ "front": "...", "back": "...", "hint": "...", "topic": "...", "difficulty": "medium" }] }`;
      const user = `DERS: ${bundle.course || bundle.detectedDiscipline}\nBAŞLIK: ${bundle.title}\n\n${sampleUniformContext(
        bundle.combinedText,
        14_500,
      )}`;

      const pub = await invokePublicJsonFallback(system, user);
      if ((isQuiz && Array.isArray(pub?.questions) && pub.questions.length > 0) || (!isQuiz && Array.isArray(pub?.cards) && pub.cards.length > 0)) {
        return {
          content: { ...pub, metadata: { sourceMode: 'ai', deepResearch: settings.deepResearch } },
          model: 'EconNotes Cloud Academic AI',
          sourceMode: 'ai',
        };
      }
    }
  }

  onProgress?.(90, 'Yerel ayrıştırıcı ile hazırlanıyor...');
  const payload: GeneratePayload = {
    materialType: settings.materialType,
    noteTitle: bundle.title,
    course: bundle.course || bundle.detectedDiscipline,
    noteContext: bundle.combinedText,
    questionCount: settings.questionCount,
    cardCount: settings.cardCount,
    difficulty: settings.difficulty,
    quizFormat: settings.quizFormat,
    deepResearch: settings.deepResearch,
    pedagogicalStyle: settings.pedagogicalStyle,
    customPrompt: settings.customPrompt,
    examFocus: settings.examFocus,
  };
  const localContent = generateClientStudyMaterial(payload);
  return {
    content: localContent,
    model: 'EconNotes Yerel Yapısal Ayrıştırıcı',
    sourceMode: 'local',
  };
}

export async function expandSingleSummarySection(params: {
  title: string;
  course?: string | null;
  sectionIndex: number;
  section: SummarySection;
  existingOverview?: string;
}): Promise<SummarySection | null> {
  const edgeRes = await invokeEdgeGenerate({
    materialType: 'summary',
    stage: 'expand_batch',
    noteTitle: params.title,
    course: params.course || undefined,
    deepResearch: true,
    pedagogicalStyle: 'academic_rigor',
    customPrompt:
      'Bu bölümü çok daha ayrıntılı genişlet: ek çözümlü sayısal/somut örnek, formül türetimi veya vaka analizi ve karşılaştırma tablosu ekle.',
    globalOutline: {
      overview: params.existingOverview || params.title,
      courseTitle: params.course || undefined,
    },
    sectionTargets: [
      {
        index: params.sectionIndex,
        title: params.section.heading,
        pageRange: params.section.pageRange,
        focusPoints: params.section.takeaways || [],
        contextSlice: params.section.content,
      },
    ],
    noteContext: params.section.content,
  });

  if (edgeRes?.sourceMode === 'ai' && Array.isArray(edgeRes.content?.sections) && edgeRes.content.sections[0]) {
    return edgeRes.content.sections[0];
  }

  const pub = await invokePublicJsonFallback(
    'Üniversite profesörü olarak verilen ders özet bölümünü çözümlü somut örnek, formül ve Markdown karşılaştırma tablosu ekleyerek iki kat derinleştir. YALNIZCA JSON döndür: { "sections": [{ "index": 0, "heading": "...", "content": "...", "takeaways": ["..."], "deepResearchNote": "..." }] }',
    `DERS: ${params.course || '-'} | BAŞLIK: ${params.title}\nBÖLÜM: ${params.section.heading}\nMEVCUT METİN:\n${params.section.content}`,
  );
  const pubSec = Array.isArray(pub?.sections) ? (pub.sections[0] as SummarySection | undefined) : undefined;
  return pubSec || null;
}

export async function gradeOpenEndedAnswer(params: {
  course?: string | null;
  topic?: string;
  question: string;
  rubricAnswer: string;
  studentAnswer: string;
}): Promise<OpenEndedGradeResult> {
  const edgeRes = await invokeEdgeGenerate({
    materialType: 'quiz',
    stage: 'grade_answer',
    course: params.course || undefined,
    gradePayload: {
      question: params.question,
      rubricAnswer: params.rubricAnswer,
      studentAnswer: params.studentAnswer,
      topic: params.topic,
    },
  });

  if (edgeRes?.content && typeof edgeRes.content.score === 'number') {
    return edgeRes.content as OpenEndedGradeResult;
  }

  // Honest deterministic lexical rubric scorer when Edge is offline
  const rubricTokens = params.rubricAnswer
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 4);
  const ansLower = params.studentAnswer.toLowerCase();
  const hits = rubricTokens.filter((w) => ansLower.includes(w));
  const misses = rubricTokens.filter((w) => !ansLower.includes(w));
  const uniqueHits = Array.from(new Set(hits));
  const uniqueMisses = Array.from(new Set(misses));
  const denom = Math.max(4, Math.min(12, new Set(rubricTokens).size));
  const score = Math.min(95, Math.max(20, Math.round((uniqueHits.length / denom) * 100)));

  return {
    score,
    verdict: score >= 75 ? 'Güçlü Cevap' : score >= 50 ? 'Kısmi Doğru' : 'Geliştirilmeli',
    feedback:
      'Cevabınız örnek çözümdeki anahtar kavramlarla karşılaştırıldı. Eksik kavramları ekleyerek yanıtınızı güçlendirebilirsiniz.',
    strengths: uniqueHits.slice(0, 4).map((w) => `Doğru kavram: ${w}`),
    missingConcepts: uniqueMisses.slice(0, 4).map((w) => `Eklenebilir kavram: ${w}`),
    improvedAnswer: params.rubricAnswer,
  };
}

export async function askStudyCoach(params: {
  materialTitle: string;
  course?: string | null;
  materialType: string;
  materialContent: StudyContentPayload | Record<string, unknown>;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  coachMode: CoachMode;
}): Promise<{ reply: string; model: string }> {
  await ensureFreshSession();
  try {
    const { data, error } = await supabase.functions.invoke('study-coach', {
      body: {
        materialTitle: params.materialTitle,
        course: params.course,
        materialType: params.materialType,
        materialContent: params.materialContent,
        messages: params.messages.slice(-14),
        coachMode: params.coachMode,
      },
    });
    if (!error && data?.reply) {
      return {
        reply: String(data.reply),
        model: String(data.model || 'EconNotes Akıl Hocası'),
      };
    }
  } catch {
    // Fall through to resilient cloud fallback
  }

  // Tier-2 Public Reasoning fallback so Akıl Hocası keeps working cleanly
  const modeNote =
    params.coachMode === 'feynman'
      ? 'Feynman analojisiyle sadeleştirerek anlat ve ardından öğrenciye geri özet sor.'
      : params.coachMode === 'socratic'
      ? 'Sokratik yöntemle ipucu ver ve tek bir yönlendirici soru sor.'
      : params.coachMode === 'deep_research'
      ? 'Yüksek lisans düzeyinde teorik arka plan, LaTeX formül ($...$) ve gerçek dünya örneğiyle derinlemesine açıkla.'
      : 'Üniversite ders koçu gibi net, adım adım, formüllü ve örnekli Türkçe yanıt ver.';

  try {
    const snippet = JSON.stringify(params.materialContent || {}).slice(0, 12_000);
    const res = await fetch(PUBLIC_REASONING_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'openai',
        messages: [
          {
            role: 'system',
            content: `Sen EconNotes Akıl Hocası'sın. Ders: ${params.course || '-'} | Başlık: ${
              params.materialTitle
            }. ${modeNote} Materyal bağlamı: ${snippet}`,
          },
          ...params.messages.slice(-8),
        ],
        temperature: 0.3,
      }),
    });
    if (res.ok) {
      const json = await res.json();
      const content = json?.choices?.[0]?.message?.content;
      if (typeof content === 'string' && content.trim()) {
        return { reply: content.trim(), model: 'EconNotes Akıl Hocası' };
      }
    }
  } catch {
    // Ignore
  }

  throw new Error('Akıl Hocası şu anda yanıt veremedi. Lütfen biraz sonra tekrar deneyin.');
}
