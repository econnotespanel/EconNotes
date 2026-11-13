/**
 * Hybrid AI Engine Router for EconNotes Neural Studio.
 * Coordinates Local WebGPU (neuralEngine), Cloud Multi-Stage AI (studyAiClient),
 * and IndexedDB RAG Retrieval (vectorIndex) while collecting live performance metrics.
 */

import {
  askStudyCoach,
  generateMaterialWithOrchestration,
  gradeOpenEndedAnswer,
  type OrchestrationResult,
  type ProgressCallback,
} from '@/lib/studyAiClient';
import { neuralEngine } from '@/lib/neural/neuralEngine';
import { classifyStudyDomain } from '@/lib/studySourceProcessor';
import {
  chunkDocument,
  searchChunks,
  upsertDocumentChunks,
  type SearchHit,
} from '@/lib/neural/vectorIndex';
import type {
  CoachMode,
  OpenEndedGradeResult,
  ProcessedStudyBundle,
  StudyContentPayload,
  StudioGenerationSettings,
  StudyMaterial,
} from '@/types/study';

export type TaskWeight = 'instant' | 'heavy';

export interface RoutedRagResponse {
  answer: string;
  hits: SearchHit[];
  engineUsed: 'gpu' | 'cloud' | 'local';
  model: string;
  tokensPerSec: number | null;
  latencyMs: number;
}

export function shouldUseLocalGpu(task: TaskWeight): boolean {
  const snap = neuralEngine.getSnapshot();
  const policy = snap.prefs.routingPolicy;
  const gpuReady = snap.llmStatus === 'ready';

  if (!gpuReady || policy === 'cloud_only') return false;
  if (policy === 'local_privacy') return true;
  if (policy === 'gpu_prefer') return true;
  // Auto policy: instant interactive tasks use ready GPU, heavy long docs prefer Cloud unless local_privacy
  return task === 'instant';
}

export function extractSearchableTextFromMaterial(material: StudyMaterial): string {
  const c = material.content || {};
  const parts: string[] = [];
  if (c.overview) parts.push(`Genel Bakış\n${c.overview}`);
  if (Array.isArray(c.keyPoints) && c.keyPoints.length > 0) {
    parts.push(`Kilit Noktalar\n${c.keyPoints.join('\n')}`);
  }
  if (Array.isArray(c.sections)) {
    for (const sec of c.sections) {
      parts.push(`# ${sec.heading}\n${sec.content}`);
    }
  }
  if (Array.isArray(c.questions)) {
    for (const q of c.questions) {
      parts.push(`Soru: ${q.question}\nAçıklama: ${q.explanation || q.sampleAnswer || ''}`);
    }
  }
  if (Array.isArray(c.cards)) {
    for (const card of c.cards) {
      parts.push(`${card.front}: ${card.back}`);
    }
  }
  if (Array.isArray(c.keyTerms)) {
    for (const kt of c.keyTerms) {
      parts.push(`${kt.term}: ${kt.definition}${kt.formula ? ` (${kt.formula})` : ''}`);
    }
  }
  if (c.videoScript) parts.push(c.videoScript);
  return parts.join('\n\n');
}

/**
 * Indexes a material or raw text document into IndexedDB, computing dense vectors
 * when the local embedder is already loaded (otherwise storing fast lexical tokens).
 */
export async function indexDocumentInVectorStore(params: {
  docId: string;
  title: string;
  course: string | null;
  text: string;
  computeEmbeddings?: boolean;
}): Promise<number> {
  const chunks = chunkDocument(params.docId, params.title, params.course, params.text);
  if (chunks.length === 0) return 0;

  const snap = neuralEngine.getSnapshot();
  if (params.computeEmbeddings || snap.embedderStatus === 'ready') {
    const vectors = await neuralEngine.embedTexts(
      chunks.map((c) => `passage: ${c.sectionHeading} — ${c.text.slice(0, 420)}`),
    );
    if (vectors.length === chunks.length) {
      chunks.forEach((ch, idx) => {
        ch.embedding = vectors[idx];
      });
    }
  }

  await upsertDocumentChunks(params.docId, chunks);
  return chunks.length;
}

/**
 * Hybrid RAG Question Answering over indexed student notes & materials.
 */
export async function routedRagAnswer(params: {
  question: string;
  docIds?: string[];
  onToken?: (partial: string, tokensPerSec: number) => void;
}): Promise<RoutedRagResponse> {
  const startedAt = performance.now();
  const snap = neuralEngine.getSnapshot();
  let queryVector: number[] | undefined;

  if (snap.embedderStatus === 'ready') {
    const qVecs = await neuralEngine.embedTexts([`query: ${params.question}`]);
    if (qVecs[0]) queryVector = qVecs[0];
  }

  const hits = await searchChunks({
    query: params.question,
    docIds: params.docIds,
    topK: 5,
    queryVector,
  });

  if (hits.length === 0) {
    return {
      answer:
        'Seçili kaynaklarda bu soruya doğrudan karşılık gelen bir pasaj bulunamadı. Lütfen önce kütüphaneden veya materyallerden en az bir kaynağı indeksleyin.',
      hits: [],
      engineUsed: 'local',
      model: 'EconNotes Vektör Arama',
      tokensPerSec: null,
      latencyMs: Math.round(performance.now() - startedAt),
    };
  }

  const contextBlock = hits
    .map(
      (h, i) =>
        `[Kaynak ${i + 1}: ${h.chunk.docTitle} · ${h.chunk.sectionHeading}]\n${h.chunk.text}`,
    )
    .join('\n\n---\n\n');

  if (shouldUseLocalGpu('instant')) {
    try {
      const gpuRes = await neuralEngine.streamChat({
        taskLabel: 'Notlarıma Sor (RAG)',
        temperature: 0.25,
        maxTokens: 700,
        messages: [
          {
            role: 'system',
            content:
              'Sen EconNotes Neural Studio akademik asistanısın. YALNIZCA verilen kaynak parçalarına dayanarak Türkçe, net ve sınav odaklı cevap ver. İlgili yerlerde [Kaynak 1], [Kaynak 2] gibi atıf yap.',
          },
          {
            role: 'user',
            content: `KAYNAKLAR:\n${contextBlock}\n\nSORU: ${params.question}`,
          },
        ],
        onToken: params.onToken,
      });

      return {
        answer: gpuRes.text,
        hits,
        engineUsed: 'gpu',
        model: snap.activeModelId || 'WebGPU GPU',
        tokensPerSec: gpuRes.tokensPerSec,
        latencyMs: gpuRes.elapsedMs,
      };
    } catch {
      if (snap.prefs.routingPolicy === 'local_privacy') {
        throw new Error('Yerel GPU gizlilik modu aktif ancak GPU yanıt veremedi.');
      }
    }
  }

  if (snap.prefs.routingPolicy === 'local_privacy') {
    // Strictly avoid external network in privacy mode even if GPU isn't ready; synthesize directly from top chunks
    const summary = hits
      .slice(0, 3)
      .map((h, i) => `**${i + 1}. ${h.chunk.docTitle} (${h.chunk.sectionHeading})**\n${h.chunk.text}`)
      .join('\n\n');
    return {
      answer: `*(Yerel Gizlilik Modu — En ilgili pasajlar derlendi)*\n\n${summary}`,
      hits,
      engineUsed: 'local',
      model: 'Yerel Gizlilik Arama',
      tokensPerSec: null,
      latencyMs: Math.round(performance.now() - startedAt),
    };
  }

  // Cloud RAG Synthesis via askStudyCoach
  const cloudRes = await askStudyCoach({
    materialTitle: 'Kişisel Bilgi Tabanı (RAG)',
    course: hits[0]?.chunk.course,
    materialType: 'summary',
    materialContent: { overview: contextBlock },
    coachMode: 'tutor',
    messages: [{ role: 'user', content: params.question }],
  });

  const latencyMs = Math.round(performance.now() - startedAt);
  neuralEngine.recordTelemetry({
    task: 'Notlarıma Sor (RAG)',
    engine: 'cloud',
    model: cloudRes.model,
    tokensPerSec: null,
    latencyMs,
  });

  return {
    answer: cloudRes.reply,
    hits,
    engineUsed: 'cloud',
    model: cloudRes.model,
    tokensPerSec: null,
    latencyMs,
  };
}

export async function routedAskCoach(params: {
  materialTitle: string;
  course?: string | null;
  materialType: 'summary' | 'quiz' | 'flashcards' | 'video';
  materialContent: StudyContentPayload;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  coachMode: CoachMode;
  onToken?: (partial: string, tokensPerSec: number) => void;
}): Promise<{ reply: string; model: string; engineUsed: 'gpu' | 'cloud' | 'local' }> {
  const startedAt = performance.now();
  const snap = neuralEngine.getSnapshot();

  if (shouldUseLocalGpu('instant')) {
    try {
      const compactContext = JSON.stringify(params.materialContent).slice(0, 5000);
      const modeHint =
        params.coachMode === 'feynman'
          ? 'Konuyu bir üniversite öğrencisine sıfırdan, sezgisel ve analoji ile öğret.'
          : params.coachMode === 'socratic'
          ? 'Cevabı direkt verme, Sokratik sorularla öğrencinin bulmasını sağla.'
          : params.coachMode === 'deep_research'
          ? 'Literatür bağlantısı, matematiksel sezgi ve vaka örneğiyle derinlemesine açıkla.'
          : 'Üniversite hocası gibi net, formüllü ve sınav odaklı cevap ver.';

      const gpuRes = await neuralEngine.streamChat({
        taskLabel: 'AI Çalışma Koçu',
        temperature: 0.35,
        maxTokens: 700,
        messages: [
          {
            role: 'system',
            content: `Sen EconNotes Akademik Çalışma Koçusun. ${modeHint}\nDERS: ${params.course || 'Genel'} | MATERYAL: ${params.materialTitle}\nBAĞLAM:\n${compactContext}`,
          },
          ...params.messages.slice(-6).map((m) => ({
            role: m.role as 'user' | 'assistant',
            content: m.content,
          })),
        ],
        onToken: params.onToken,
      });

      return {
        reply: gpuRes.text,
        model: snap.activeModelId || 'WebGPU GPU',
        engineUsed: 'gpu',
      };
    } catch {
      if (snap.prefs.routingPolicy === 'local_privacy') {
        return {
          reply: 'Yerel GPU gizlilik modu aktif; lütfen Motor Panelinden yerel modeli yükleyin.',
          model: 'Yerel Gizlilik Modu',
          engineUsed: 'local',
        };
      }
    }
  }

  const res = await askStudyCoach({
    materialTitle: params.materialTitle,
    course: params.course,
    materialType: params.materialType,
    materialContent: params.materialContent,
    messages: params.messages,
    coachMode: params.coachMode,
  });

  neuralEngine.recordTelemetry({
    task: 'AI Çalışma Koçu',
    engine: 'cloud',
    model: res.model,
    tokensPerSec: null,
    latencyMs: Math.round(performance.now() - startedAt),
  });

  return { ...res, engineUsed: 'cloud' };
}

export async function routedGradeOpenEnded(params: {
  course?: string | null;
  topic?: string;
  question: string;
  rubricAnswer: string;
  studentAnswer: string;
}): Promise<OpenEndedGradeResult> {
  const startedAt = performance.now();
  const res = await gradeOpenEndedAnswer(params);
  neuralEngine.recordTelemetry({
    task: 'Açık Uçlu Rubrik Puanlama',
    engine: 'cloud',
    model: 'EconNotes Rubrik AI',
    tokensPerSec: null,
    latencyMs: Math.round(performance.now() - startedAt),
  });
  return res;
}

export async function routedGenerateMaterial(
  bundle: ProcessedStudyBundle,
  settings: StudioGenerationSettings,
  onProgress?: ProgressCallback,
): Promise<OrchestrationResult> {
  const startedAt = performance.now();
  const snap = neuralEngine.getSnapshot();

  // Optional strictly-local privacy synthesis when user forces local_privacy mode and model is ready
  if (snap.prefs.routingPolicy === 'local_privacy' && snap.llmStatus === 'ready') {
    onProgress?.(20, 'Yerel gizlilik modunda sentezleniyor (buluta veri gönderilmiyor)...');
    try {
      const domain = classifyStudyDomain(bundle.combinedText, bundle.course, bundle.title);
      const summaryRule =
        domain.mode === 'verbal'
          ? 'Sözel/kuramsal derstir; gereksiz formül ekleme. Her bölümde `#### Kavramsal Öz ve Ana Tez`, `#### Neden–Sonuç Zinciri` ve Markdown karşılaştırma tablosu kur.'
          : 'Her bölümde `#### Analitik Çerçeve`, adım adım mekanizma, varsa formül ($...$) ve karşılaştırma tablosu kur.';
      const prompt =
        settings.materialType === 'flashcards'
          ? `Bu dersten ${Math.min(10, settings.cardCount)} adet Türkçe flashcard üret. JSON formatında döndür: {"cards":[{"front":"...","back":"...","hint":"...","topic":"..."}]}`
          : settings.materialType === 'quiz'
          ? `Bu dersten ${Math.min(8, settings.questionCount)} adet Türkçe çoktan seçmeli soru üret. JSON döndür: {"questions":[{"type":"multiple_choice","question":"...","options":["A","B","C","D"],"correctIndex":0,"explanation":"...","topic":"..."}]}`
          : `Bu dersten üniversite düzeyinde Türkçe akademik özet JSON üret. ${summaryRule} JSON döndür: {"overview":"2 paragraf yönetici özeti","keyPoints":["..."],"sections":[{"index":0,"heading":"...","content":"Markdown alt başlıklı ve tablolu bölüm","takeaways":["..."],"commonPitfalls":["..."]}],"comparativeMatrix":{"title":"Karşılaştırma Tablosu","columns":["Kavram","Özellik","Sınav Ayrımı"],"rows":[["...","...","..."]]},"teacherEmphasis":[{"point":"...","whyImportant":"...","examProbability":"Yüksek"}],"keyTerms":[{"term":"...","definition":"..."}]}`;

      const gpuRes = await neuralEngine.streamChat({
        taskLabel: `Gizlilik Modu (${settings.materialType})`,
        jsonMode: true,
        maxTokens: 1600,
        messages: [
          { role: 'system', content: prompt },
          {
            role: 'user',
            content: `DERS: ${domain.discipline}\nBAŞLIK: ${bundle.title}\nKAYNAK:\n${bundle.combinedText.slice(0, 6500)}`,
          },
        ],
      });

      const parsed = JSON.parse(gpuRes.text) as StudyContentPayload;
      onProgress?.(95, 'Yerel gizli materyal tamamlandı.');
      return {
        content: { ...parsed, metadata: { sourceMode: 'local', deepResearch: false } },
        model: `${snap.activeModelId} (Yerel Gizlilik Modu)`,
        sourceMode: 'local',
      };
    } catch {
      onProgress?.(45, 'Yerel ayrıştırıcıyla güvenli gizli üretim tamamlanıyor...');
    }
  }

  const res = await generateMaterialWithOrchestration(bundle, settings, onProgress);
  neuralEngine.recordTelemetry({
    task: `Materyal Üretimi (${settings.materialType})`,
    engine: res.sourceMode === 'local' ? 'local' : 'cloud',
    model: res.model,
    tokensPerSec: null,
    latencyMs: Math.round(performance.now() - startedAt),
  });
  return res;
}
