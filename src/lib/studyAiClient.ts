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

async function invokePublicJsonFallback(
  systemPrompt: string,
  userPrompt: string,
): Promise<Record<string, unknown> | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 38_000);
    const res = await fetch(PUBLIC_REASONING_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'openai',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.25,
      }),
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

function buildPublicSummaryPrompt(
  bundle: ProcessedStudyBundle,
  settings: StudioGenerationSettings,
): { system: string; user: string } {
  const depthHint =
    settings.summaryDepth === 'short'
      ? '4-5 bölüm, bölüm başına 180-250 kelime'
      : settings.summaryDepth === 'textbook'
      ? '7-10 bölüm, bölüm başına 350-550 kelime, çok derin ders kitabı düzeyi'
      : '6-8 bölüm, bölüm başına 280-450 kelime, kapsamlı fakülte düzeyi';

  const system = `Sen seçkin bir üniversite kürsü profesörüsün. Verilen notlardan kapsamlı, formüllü ($...$, $$...$$), Markdown tablolu ve sıfır şablon cümleli Türkçe Çalışma Özeti üret.
${
  settings.deepResearch
    ? 'Derin Araştırma aktif: teorik arka plan, literatür bağlamı ve Türkiye/dünya vaka örneklerini [Derin Akademik Araştırma] etiketiyle ekle.'
    : ''
}
Hedef uzunluk: ${depthHint}.
YALNIZCA geçerli JSON döndür:
{
  "overview": "2-3 paragraf yönetici özeti",
  "keyPoints": ["6-10 madde"],
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
  "deepResearchTopics": [{ "topic": "...", "literatureContext": "...", "realWorldApplication": "..." }],
  "keyTerms": [{ "term": "...", "definition": "...", "formula": "..." }],
  "studyChecklist": ["Kendini değerlendirme maddesi"]
}`;

  const user = `DERS: ${bundle.course || bundle.detectedDiscipline}\nBAŞLIK: ${bundle.title}\n${
    settings.customPrompt ? `ÖZEL İSTEK: ${settings.customPrompt}\n` : ''
  }\nKAYNAK METİN:\n${sampleUniformContext(bundle.combinedText, 24_000)}`;

  return { system, user };
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

  // Tier-2 Client Public AI Synthesis fallback (if Edge returned fallback or is unreachable)
  if (bundle.images.length === 0 && bundle.combinedText.trim().length >= 30) {
    onProgress?.(55, 'Bulut akademik sentez motoruna bağlanılıyor...');
    const { system, user } = buildPublicSummaryPrompt(bundle, settings);
    const pubJson = await invokePublicJsonFallback(system, user);
    if (pubJson && Array.isArray(pubJson.sections) && pubJson.sections.length > 0) {
      return {
        content: {
          ...pubJson,
          disciplineTag: pubJson.disciplineTag || bundle.detectedDiscipline,
          metadata: {
            sourceMode: 'ai',
            deepResearch: settings.deepResearch,
            summaryDepth: settings.summaryDepth,
            sourceStats: {
              sourceCount: bundle.sourceCount,
              wordCount: bundle.totalWords,
              pagesOrSlides: bundle.totalPagesOrSlides,
              sectionCount: pubJson.sections.length,
            },
          },
        },
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
      : 'İnteraktif video ders sahneleri hazırlanıyor...',
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

  // Tier-2 Public Cloud AI fallback for quiz / flashcards when Edge unreachable
  if (
    bundle.images.length === 0 &&
    (settings.materialType === 'quiz' || settings.materialType === 'flashcards')
  ) {
    onProgress?.(60, 'Alternatif bulut zekâ üzerinden üretiliyor...');
    const isQuiz = settings.materialType === 'quiz';
    const system = isQuiz
      ? `Üniversite hocası olarak ${settings.questionCount} adet ${settings.difficulty} zorlukta Türkçe sınav sorusu üret. Şık sırasını (correctIndex: 0..3) dengeli dağıt. JSON döndür: { "questions": [{ "type": "multiple_choice", "question": "...", "options": ["A","B","C","D"], "correctIndex": 0, "explanation": "...", "topic": "...", "difficulty": "medium", "bloomLevel": "Analiz" }] }`
      : `Aktif hatırlama uzmanı olarak ${settings.cardCount} adet Türkçe flashcard üret. JSON döndür: { "cards": [{ "front": "...", "back": "...", "hint": "...", "topic": "...", "difficulty": "medium" }] }`;
    const user = `DERS: ${bundle.course || bundle.detectedDiscipline}\nBAŞLIK: ${bundle.title}\n\n${sampleUniformContext(
      bundle.combinedText,
      22_000,
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
  return null;
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
