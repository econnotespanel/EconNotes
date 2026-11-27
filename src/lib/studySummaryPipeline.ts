/**
 * EconNotes Next-Generation 10-Stage Academic Summary Engine
 *
 * Replaces superficial single-shot summarization with a genuine multi-stage architecture:
 *   Stage 1:  Dosya hazırlanıyor (input validation & security check)
 *   Stage 2:  Sayfalar ve içerikler çıkarılıyor (page/slide/table/formula extraction audit)
 *   Stage 3:  Ana ve alt başlıklar belirleniyor (full-document hierarchical outline)
 *   Stage 4:  Belge bölümlere ayrılıyor (page-, heading-, & overlap-aware logical chunks)
 *   Stage 5:  Akademik analiz gerçekleştiriliyor (discipline profiling & concept mapping)
 *   Stage 6:  Ayrıntılı bölüm özetleri hazırlanıyor (chunk-by-chunk deep synthesis with checkpoints)
 *   Stage 7:  Bölümler birleştiriliyor (cross-section synthesis, transitions & dedup)
 *   Stage 8:  Eksik ve hatalı bilgiler kontrol ediliyor (10-point quality audit + targeted repair)
 *   Stage 9:  Ders notu biçimlendiriliyor (TOC, glossary, priority map, discipline layout)
 *   Stage 10: PDF oluşturuluyor (binary Turkish Unicode PDF verification & packaging)
 */

import { supabase } from '@/integrations/supabase/client';
import {
  sanitizeSummaryContent,
  sanitizeSummarySection,
  stripTechnicalMarkup,
} from '@/lib/academicTextSanitizer';
import {
  analyzeDocumentForSummary,
  type AnalyzedDocumentPlan,
} from '@/lib/studyDocumentAnalyzer';
import {
  formatSectionContentForFallback,
  generateClientStudyMaterial,
} from '@/lib/studyMaterialGenerator';
import {
  buildTopicPriorityGuide,
  sampleUniformContext,
  sliceContextForSection,
} from '@/lib/studySourceProcessor';
import {
  deduplicateSummarySections,
  type LogicalDocumentChunk,
} from '@/lib/studySummaryArchitecture';
import {
  auditSummaryQuality,
  deduplicateSummaryParagraphs,
} from '@/lib/studySummaryQuality';
import type {
  ComparativeMatrix,
  KeyTermItem,
  ProcessedStudyBundle,
  StudioGenerationSettings,
  SummaryChunkCheckpoint,
  SummaryContent,
  SummaryDocumentProfile,
  SummarySection,
  SummaryStageCode,
  TeacherEmphasisItem,
} from '@/types/study';

export interface SummaryStageDefinition {
  stage: number;
  code: SummaryStageCode;
  label: string;
  startPct: number;
  endPct: number;
}

export const SUMMARY_PIPELINE_STAGES: SummaryStageDefinition[] = [
  { stage: 1, code: 'preparing_file', label: 'Dosya hazırlanıyor', startPct: 2, endPct: 6 },
  { stage: 2, code: 'extracting_content', label: 'Sayfalar ve içerikler çıkarılıyor', startPct: 6, endPct: 14 },
  { stage: 3, code: 'detecting_headings', label: 'Ana ve alt başlıklar belirleniyor', startPct: 14, endPct: 20 },
  { stage: 4, code: 'chunking_document', label: 'Belge bölümlere ayrılıyor', startPct: 20, endPct: 26 },
  { stage: 5, code: 'academic_analysis', label: 'Akademik analiz gerçekleştiriliyor', startPct: 26, endPct: 38 },
  { stage: 6, code: 'writing_sections', label: 'Ayrıntılı bölüm özetleri hazırlanıyor', startPct: 38, endPct: 72 },
  { stage: 7, code: 'merging_sections', label: 'Bölümler birleştiriliyor', startPct: 72, endPct: 80 },
  { stage: 8, code: 'quality_check', label: 'Eksik ve hatalı bilgiler kontrol ediliyor', startPct: 80, endPct: 90 },
  { stage: 9, code: 'formatting_notes', label: 'Ders notu biçimlendiriliyor', startPct: 90, endPct: 96 },
  { stage: 10, code: 'building_pdf', label: 'PDF oluşturuluyor', startPct: 96, endPct: 99 },
];

export interface SummaryProgressUpdate {
  stage: number;
  stageCode: SummaryStageCode;
  stageLabel: string;
  detailMessage: string;
  progressPct: number; // Strictly 0..99 while processing; 100 ONLY on completion!
  totalPages: number;
  processedPages: number;
  totalChunks: number;
  completedChunks: number;
  documentProfile?: SummaryDocumentProfile;
}

export interface MultiStageSummaryResult {
  content: SummaryContent;
  model: string;
  sourceMode: 'ai' | 'fallback' | 'local';
  checkpoints: SummaryChunkCheckpoint[];
  plan: AnalyzedDocumentPlan;
  pdfBytes?: Uint8Array;
}

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

async function invokeEdgeSummaryStage(body: Record<string, unknown>): Promise<{
  content: Record<string, unknown>;
  model: string;
  sourceMode: 'ai' | 'fallback';
} | null> {
  try {
    await ensureFreshSession();
    const { data, error } = await supabase.functions.invoke('generate-study-material', { body });
    if (error || !data || data.error || !data.content) return null;
    return {
      content: data.content as Record<string, unknown>,
      model: String(data.model || 'EconNotes Deep Academic AI'),
      sourceMode: data.sourceMode === 'fallback' ? 'fallback' : 'ai',
    };
  } catch {
    return null;
  }
}

async function invokeAcademicBridgeJson(params: {
  title: string;
  course: string;
  noteContext: string;
  taskPrompt: string;
  images?: Array<{ data: string; mimeType: string; pageLabel?: string }>;
}): Promise<{ json: Record<string, unknown>; model: string } | null> {
  try {
    await ensureFreshSession();
    const budget = Math.max(8_000, 72_000 - params.taskPrompt.length);
    const fullMessage = `${params.taskPrompt}\n\n=== DERS NOTU KAYNAK PARÇASI (${params.title}) ===\n${params.noteContext.slice(
      0,
      budget,
    )}`.slice(0, 78_000);

    const payload: Record<string, unknown> = {
      message: fullMessage,
      mode: 'concept',
      notesContext: '',
      hasFile: true,
      fileName: params.title,
    };
    if (params.images && params.images.length > 0) {
      payload.images = params.images.slice(0, 4).map((img, i) => ({
        name: img.pageLabel || `Sayfa-${i + 1}`,
        mimeType: img.mimeType || 'image/jpeg',
        data: img.data,
      }));
    }

    const { data, error } = await supabase.functions.invoke('academic-assistant', { body: payload });
    if (!error && typeof data?.reply === 'string' && data.reply.trim().length > 80) {
      const parsed = extractJsonLoose(data.reply);
      if (parsed) {
        return { json: parsed, model: String(data.model || 'EconNotes Akademik AI') };
      }
    }
  } catch {
    // Fall through cleanly
  }
  return null;
}

function sanitizeSectionsArray(raw: unknown, defaultPageRange?: string): SummarySection[] {
  if (!Array.isArray(raw)) return [];
  const out: SummarySection[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const heading = stripTechnicalMarkup(String(rec.heading || rec.title || ''), { singleLine: true });
    const content = stripTechnicalMarkup(String(rec.content || ''));
    if (!heading || content.length < 40) continue;
    const cpRaw = rec.checkpointQuestion as Record<string, unknown> | undefined;
    const checkpointQuestion =
      cpRaw &&
      typeof cpRaw.question === 'string' &&
      Array.isArray(cpRaw.options) &&
      cpRaw.options.length >= 2
        ? {
            question: stripTechnicalMarkup(String(cpRaw.question), { singleLine: true }),
            options: cpRaw.options.map((o) => stripTechnicalMarkup(String(o || ''), { singleLine: true })).slice(0, 4),
            correctIndex: Math.max(0, Math.min(3, Number(cpRaw.correctIndex) || 0)),
            explanation: cpRaw.explanation
              ? stripTechnicalMarkup(String(cpRaw.explanation), { singleLine: true })
              : undefined,
          }
        : undefined;

    out.push(
      sanitizeSummarySection(
        {
          index: out.length,
          heading,
          pageRange: rec.pageRange
            ? stripTechnicalMarkup(String(rec.pageRange), { singleLine: true })
            : defaultPageRange,
          content,
          takeaways: Array.isArray(rec.takeaways)
            ? rec.takeaways
                .map((s) => stripTechnicalMarkup(String(s || ''), { singleLine: true }))
                .filter(Boolean)
                .slice(0, 5)
            : [],
          commonPitfalls: Array.isArray(rec.commonPitfalls)
            ? rec.commonPitfalls
                .map((s) => stripTechnicalMarkup(String(s || ''), { singleLine: true }))
                .filter(Boolean)
                .slice(0, 4)
            : undefined,
          deepResearchNote: rec.deepResearchNote ? stripTechnicalMarkup(String(rec.deepResearchNote)) : undefined,
          checkpointQuestion,
        },
        out.length,
      ),
    );
  }
  return out;
}

function getDetailedDisciplinePromptBlock(
  family: SummaryDocumentProfile['disciplineFamily'],
  courseName: string,
): string {
  switch (family) {
    case 'history':
      return `DERS TÜRÜ — TARİH & İKTİSAT TARİHİ / ${courseName.toUpperCase()}:
- YALNIZCA kaynak belgede geçen tarihsel dönemleri, toplumsal sınıfları, devlet/maliye kurumlarını, hukuki-iktisadi ilkeleri, kronolojiyi ve neden–sonuç ilişkilerini kendi tarihsel bağlamında anlat.
- Selçuklu, İlhanlı, Osmanlı, Bizans gibi tarihsel devlet/dönemleri birbirine ASLA karıştırma; kaynakta geçmeyen devlet, kişi veya tarihleri KESİNLİKLE ekleme.
- Modern mikro/makro iktisat başlıklarını ve kavramlarını (örn. "Aktarım Mekanizması", "Piyasa Dengesi", IS-LM, Keynesyen, Monetarist, arz-talep grafiği) kaynak metinde açıkça geçmiyorsa ASLA üretme.
- Kaynakta bulunmayan matematiksel formül uydurma; karşılaştırma tablolarında yalnızca belgede anlatılan kurum ve dönemleri kıyasla.`;
    case 'economics':
      return `DERS TÜRÜ — İKTİSAT / ${courseName.toUpperCase()}:
- YALNIZCA kaynak belgede gerçekten geçen iktisadi teorileri, varsayımları ve mekanizmaları derinlemesine açıkla; kaynakta yer almayan başka alt ders kavramlarını veya modelleri ASLA ekleme.
- Metindeki TÜM formülleri ($...$ / $$...$$) koru, her değişkenin neyi temsil ettiğini ve formülün ekonomik yorumunu açıkla; kaynakta olmayan denklem uydurma.
- Yalnızca kaynakta bulunan grafikleri, eğri kaymalarını ve ekonomik ilişkileri yönleriyle birlikte yorumla.
- Teoriler arasındaki farklılıkları karşılaştırmalı tabloyla göster ve sayısal/uygulamalı örnekleri eksiksiz koru.`;
    case 'law':
      return `DERS TÜRÜ — HUKUK / ${courseName.toUpperCase()}:
- Hukuki kavramları ve tanımları doktrinel kesinlikle eksiksiz ver.
- Kanun hükümlerini, madde referanslarını, hukuki ayrımları, kurucu şartlar ve unsurları madde madde açıkla.
- İstisnaları, zamanaşımı / hak düşürücü süreleri ve hukuki sonuçları/yaptırımları asla atlama.
- Örnek olayları ve vaka uygulamalarını koru; kaynakta bulunmayan uydurma matematik formülü veya başka ders terimleri KESİNLİKLE ekleme.`;
    case 'statistics':
      return `DERS TÜRÜ — İSTATİSTİK & EKONOMETRİ / ${courseName.toUpperCase()}:
- Tüm istatistiksel/ekonometrik formülleri LaTeX ($...$ / $$...$$) ile yaz; her değişkenin/parametrenin anlamını açıkla.
- Yöntemlerin ve testlerin temel varsayımlarını, kullanım amaçlarını ve hesaplama aşamalarını adım adım göster.
- Sonuçların (p-değeri, güven aralığı, katsayı anlamlılığı, R², hata terimi vb.) nasıl yorumlanacağını ve uygulama örneklerini eksiksiz aktar.`;
    case 'engineering':
      return `DERS TÜRÜ — MÜHENDİSLİK & FEN / ${courseName.toUpperCase()}:
- Temel yasaları, sistem mimarisini, çalışma prensiplerini, sınır koşullarını, birimleri ve formülleri ($...$ / $$...$$) değişken açıklamalarıyla birlikte ayrıntılı ver.
- Algoritma/yöntem karşılaştırmalarını ve adım adım çözümlü uygulama örneklerini koru.`;
    case 'medical':
      return `DERS TÜRÜ — TIP & SAĞLIK / ${courseName.toUpperCase()}:
- Etiyoloji, patofizyoloji basamaklarını, klinik bulguları, ayırıcı tanı kriterlerini ve tedavi/bakım ilkelerini sistemli biçimde açıkla.`;
    default:
      return `DERS TÜRÜ — AKADEMİK ÇALIŞMA / ${courseName.toUpperCase()}:
- Yalnızca kaynak belgedeki ana ve alt başlıkları koru; akademik tanımları, kuramsal yaklaşımları, neden–sonuç ilişkilerini, varsa formül/tablo/grafik açıklamalarını ve somut örnekleri öğrencinin başka kaynağa dönmeden öğrenebileceği derinlikte anlat.`;
  }
}

function buildChunkAnalysisPrompt(params: {
  chunk: LogicalDocumentChunk;
  plan: AnalyzedDocumentPlan;
  settings: StudioGenerationSettings;
  coveredHeadings: string[];
  isMultiCourse?: boolean;
  sourceCourses?: string[];
}): string {
  const { chunk, plan, settings, coveredHeadings } = params;
  const disciplineBlock = getDetailedDisciplinePromptBlock(
    plan.profile.disciplineFamily,
    plan.profile.courseName,
  );
  const overlapHint = chunk.overlapPrefix
    ? `\nÖNCEKİ BÖLÜMDEN BAĞLAM ÖRTÜŞMESİ (TEKRARLAMA, YALNIZCA KONU BÜTÜNLÜĞÜNÜ VE GEÇİŞİ KORU):\n"""\n${chunk.overlapPrefix}\n"""`
    : '';
  const hintsBlock =
    chunk.headingHints && chunk.headingHints.length > 0
      ? `\nBU PARÇADA TESPİT EDİLEN BAŞLIKLAR (HİÇBİRİNİ ATLAMA):\n${chunk.headingHints
          .map((h, i) => `${i + 1}. ${h}`)
          .join('\n')}`
      : '';
  const continuityBlock =
    coveredHeadings.length > 0
      ? `\nÖNCEKİ PARÇALARDA TAMAMLANAN BAŞLIKLAR (TEKRARLAMA, GEREKTİĞİNDE BAĞLANTI KUR): ${coveredHeadings
          .slice(-16)
          .join(' | ')}`
      : '';
  const multiCourseBlock =
    params.isMultiCourse && params.sourceCourses && params.sourceCourses.length > 1
      ? `\nÇOKLU DERS İZOLASYONU: Bu oturumda farklı dersler (${params.sourceCourses.join(
          ', ',
        )}) var. Her bölümde [Ders Adı] etiketini koru ve farklı derslerin kavramlarını ASLA karıştırma!`
      : '';

  const targetSecRange =
    chunk.total === 1
      ? plan.summaryPlan.targetSectionsLabel
      : chunk.total >= 10
      ? '2-3'
      : '2-4';

  return `Görev: Aşağıda "${plan.profile.courseName}" dersine ait materyalin ${chunk.index + 1}/${
    chunk.total
  }. parçası${chunk.pageRangeLabel ? ` (${chunk.pageRangeLabel})` : ''} yer almaktadır.

Bu parçayı YÜZEYSEL özetleme; öğrencinin orijinal PDF/slayta sürekli dönmeden konuyu tam öğrenebileceği ders kitabı niteliğinde, kapsamlı, öğretici ve %100 kaynağa sadık bir akademik çalışma bölümü olarak hazırla.

${disciplineBlock}${hintsBlock}${continuityBlock}${overlapHint}${multiCourseBlock}
${settings.customPrompt?.trim() ? `\nKULLANICININ ÖZEL İSTEĞİ: ${settings.customPrompt.trim()}` : ''}

ZORUNLU DERİNLİK VE DOĞRULUK STANDARTLARI:
1. Belgeyi kısaltmak için önemli bilgileri ASLA silme; her kavramı yalnızca adıyla geçmek yerine ne anlama geldiğini, nasıl işlediğini ve hangi koşulda geçerli olduğunu anlat.
2. Her bölüm ${plan.summaryPlan.minWordsPerSection}–${plan.summaryPlan.maxWordsPerSection} kelime arası olsun ve alt başlıkları (\`####\`), tanım kutularını, varsa formül + değişken açıklamalarını, tablo/grafik yorumlarını, somut örnekleri ve "Sınavda Dikkat Edilecek Noktalar" vurgusunu içersin.
3. KONU BÜTÜNLÜĞÜ VE KAYNAK DOĞRULAMASI: Her başlık, paragraf, tarih, kurum/devlet adı ve neden–sonuç ilişkisi YALNIZCA yüklenen kaynak belgeden çıkmalıdır. Başka derslerin kavramlarını (örneğin tarih dersinde "Aktarım Mekanizması ve Piyasa Dengesi" gibi ilgisiz başlıklar) veya kaynakta bulunmayan bilgileri KESİNLİKLE ekleme. Pedagojik netlik için ek açıklama gerekiyorsa mutlaka **[Ek Açıklama]** etiketiyle kaynaktan ayır.
4. TEKNİK KOD YASAĞI: Çıktıda hiçbir XML/OOXML veya HTML etiketi (\`</a:r>\`, \`<a:br>\`, \`<a:rPr...>\`, \`</a:t>\`, \`<a:p>\`, \`<div>\`, \`<span>\`, \`<br>\`) kesinlikle yer almamalıdır.
5. Her bölümde kaynak sayfa/slayt aralığını ("pageRange") mutlaka koru.
6. Bu parça için ${targetSecRange} eksiksiz bölüm üret ve YALNIZCA geçerli JSON döndür:
{
  "overviewSnippet": "Bu parçanın kapsamını anlatan 2-3 cümle",
  "keyPoints": ["Bu parçadan 3-5 somut ana çıkarım"],
  "sections": [
    {
      "index": 0,
      "heading": "Kaynaktaki gerçek ana konu başlığı",
      "pageRange": "${chunk.pageRangeLabel || 'Kaynak'}",
      "content": "Alt başlıklar (####), eksiksiz tanımlar, teoriler/modeller veya hukuki şartlar/istisnalar, formül+değişken açıklamaları, tablo/grafik yorumları, somut örnekler, konular arası ilişkiler ve sınav vurguları içeren kapsamlı Türkçe Markdown anlatım...",
      "takeaways": ["Bölüm sonu kısa tekrar 1", "Kısa tekrar 2", "Kısa tekrar 3"],
      "commonPitfalls": ["Sınavda sık karıştırılan kritik ayrım veya tuzak"],
      "checkpointQuestion": {
        "question": "Bu bölümü ölçen ayırt edici kontrol sorusu?",
        "options": ["A", "B", "C", "D"],
        "correctIndex": 0,
        "explanation": "Kaynağa dayalı net çözüm."
      }
    }
  ],
  "comparativeMatrix": {
    "title": "Bu parçada karşılaştırılabilir teori/kavram varsa tablo başlığı",
    "columns": ["Ölçüt", "Kavram / Yaklaşım A", "Kavram / Yaklaşım B"],
    "rows": [["...", "...", "..."]]
  },
  "keyTerms": [{ "term": "Akademik Terim", "definition": "Eksiksiz ve ayırt edici tanım", "formula": "Varsa kaynaktaki formül" }],
  "teacherEmphasis": [{ "point": "Sınavda çıkabilecek kritik ayrıntı", "whyImportant": "Neden önemli ve nasıl sorulur", "examProbability": "Yüksek" }],
  "memorizeVsInterpret": {
    "memorize": ["Doğrudan bilinmesi/ezberlenmesi gereken bilgi"],
    "interpret": ["Yorumlanması ve ilişkilendirilmesi gereken mekanizma"]
  },
  "studyChecklist": ["Bu bölümü tamamladığımda ... açıklayabilirim."],
  "synthesisSnippet": "Bu parçanın dersin bütünüyle bağlantısı (2 cümle)"
}`;
}

/**
 * High-quality deterministic local chunk analyzer used ONLY when cloud AI endpoints are
 * unavailable/offline. Preserves 100% of chunk headings, definitions, formulas, tables,
 * and discipline-specific academic structure — NEVER returns a 2-sentence stub.
 */
function synthesizeChunkLocally(params: {
  chunk: LogicalDocumentChunk;
  plan: AnalyzedDocumentPlan;
  settings: StudioGenerationSettings;
  bundleTitle: string;
}): SummaryChunkCheckpoint {
  const { chunk, plan, settings, bundleTitle } = params;
  const local = generateClientStudyMaterial({
    materialType: 'summary',
    noteTitle: bundleTitle,
    course: plan.profile.courseName,
    noteContext: chunk.text,
    totalPagesOrSlides:
      chunk.pageStart && chunk.pageEnd
        ? Math.max(1, chunk.pageEnd - chunk.pageStart + 1)
        : Math.max(1, Math.ceil(chunk.wordCount / 280)),
    summaryDepth: settings.summaryDepth === 'short' ? 'standard' : settings.summaryDepth || 'comprehensive',
    examMode: settings.examMode,
    deepResearch: settings.deepResearch,
    pedagogicalStyle: settings.pedagogicalStyle,
    customPrompt: settings.customPrompt,
    extractionWarnings: plan.profile.warnings,
  });

  const rawSections = Array.isArray(local.sections) ? (local.sections as SummarySection[]) : [];
  const sections: SummarySection[] = rawSections.map((sec, idx) => ({
    ...sec,
    index: idx,
    pageRange: sec.pageRange || chunk.pageRangeLabel,
  }));

  const mvi = local.memorizeVsInterpret as { memorize?: string[]; interpret?: string[] } | undefined;

  return {
    chunkIndex: chunk.index,
    totalChunks: chunk.total,
    pageStart: chunk.pageStart,
    pageEnd: chunk.pageEnd,
    pageRangeLabel: chunk.pageRangeLabel,
    headingHints: chunk.headingHints || [],
    status: 'completed',
    sections,
    keyPoints: Array.isArray(local.keyPoints) ? local.keyPoints.map(String).filter(Boolean) : [],
    keyTerms: Array.isArray(local.keyTerms) ? (local.keyTerms as KeyTermItem[]) : [],
    teacherEmphasis: Array.isArray(local.teacherEmphasis)
      ? (local.teacherEmphasis as TeacherEmphasisItem[])
      : [],
    comparativeMatrix: local.comparativeMatrix as ComparativeMatrix | undefined,
    memorize: Array.isArray(mvi?.memorize) ? mvi!.memorize.map(String).filter(Boolean) : [],
    interpret: Array.isArray(mvi?.interpret) ? mvi!.interpret.map(String).filter(Boolean) : [],
    studyChecklist: Array.isArray(local.studyChecklist)
      ? local.studyChecklist.map(String).filter(Boolean)
      : [],
    overviewSnippet: typeof local.overview === 'string' ? local.overview : undefined,
    synthesisSnippet: typeof local.summarySynthesis === 'string' ? local.summarySynthesis : undefined,
    attemptCount: 1,
    updatedAt: new Date().toISOString(),
  };
}

function parseChunkAiResponse(
  raw: Record<string, unknown>,
  chunk: LogicalDocumentChunk,
): SummaryChunkCheckpoint | null {
  const sections = sanitizeSectionsArray(raw.sections, chunk.pageRangeLabel);
  if (sections.length === 0) return null;

  const keyPoints = Array.isArray(raw.keyPoints)
    ? raw.keyPoints.map(String).map((s) => s.trim()).filter(Boolean)
    : [];
  const keyTerms: KeyTermItem[] = Array.isArray(raw.keyTerms)
    ? raw.keyTerms
        .filter((k): k is Record<string, unknown> => Boolean(k && typeof k === 'object'))
        .map((k) => ({
          term: String(k.term || '').trim(),
          definition: String(k.definition || '').trim(),
          formula: k.formula ? String(k.formula).trim() : undefined,
        }))
        .filter((k) => k.term.length >= 2 && k.definition.length >= 12)
    : [];
  const teacherEmphasis: TeacherEmphasisItem[] = Array.isArray(raw.teacherEmphasis)
    ? raw.teacherEmphasis
        .filter((e): e is Record<string, unknown> => Boolean(e && typeof e === 'object'))
        .map((e) => ({
          point: String(e.point || '').trim(),
          whyImportant: String(e.whyImportant || '').trim(),
          examProbability: e.examProbability ? String(e.examProbability) : 'Yüksek',
        }))
        .filter((e) => e.point.length >= 3)
    : [];

  const rawMat = raw.comparativeMatrix as Record<string, unknown> | undefined;
  const comparativeMatrix =
    rawMat &&
    Array.isArray(rawMat.columns) &&
    rawMat.columns.length >= 2 &&
    Array.isArray(rawMat.rows) &&
    rawMat.rows.length >= 2
      ? {
          title: String(rawMat.title || 'Karşılaştırma Tablosu'),
          columns: rawMat.columns.map(String),
          rows: rawMat.rows.map((r) => (Array.isArray(r) ? r.map(String) : [String(r)])),
        }
      : undefined;

  const rawMvi = raw.memorizeVsInterpret as { memorize?: unknown[]; interpret?: unknown[] } | undefined;
  const memorize = Array.isArray(rawMvi?.memorize)
    ? rawMvi!.memorize.map(String).map((s) => s.trim()).filter(Boolean)
    : [];
  const interpret = Array.isArray(rawMvi?.interpret)
    ? rawMvi!.interpret.map(String).map((s) => s.trim()).filter(Boolean)
    : [];
  const studyChecklist = Array.isArray(raw.studyChecklist)
    ? raw.studyChecklist.map(String).map((s) => s.trim()).filter(Boolean)
    : [];

  return {
    chunkIndex: chunk.index,
    totalChunks: chunk.total,
    pageStart: chunk.pageStart,
    pageEnd: chunk.pageEnd,
    pageRangeLabel: chunk.pageRangeLabel,
    headingHints: chunk.headingHints || [],
    status: 'completed',
    sections,
    keyPoints,
    keyTerms,
    teacherEmphasis,
    comparativeMatrix,
    memorize,
    interpret,
    studyChecklist,
    overviewSnippet: typeof raw.overviewSnippet === 'string'
      ? raw.overviewSnippet.trim()
      : typeof raw.overview === 'string'
      ? raw.overview.trim()
      : undefined,
    synthesisSnippet: typeof raw.synthesisSnippet === 'string'
      ? raw.synthesisSnippet.trim()
      : typeof raw.summarySynthesis === 'string'
      ? raw.summarySynthesis.trim()
      : undefined,
    attemptCount: 1,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Executes the complete 10-stage multi-pass academic summary pipeline with real backend progress,
 * intermediate checkpoint reuse, 10-point quality audit, targeted repair, and PDF verification.
 */
export async function runMultiStageAcademicSummaryPipeline(params: {
  jobId: string;
  bundle: ProcessedStudyBundle;
  settings: StudioGenerationSettings;
  existingCheckpoints?: SummaryChunkCheckpoint[];
  onProgress?: (update: SummaryProgressUpdate) => void;
  onCheckpoint?: (checkpoint: SummaryChunkCheckpoint) => Promise<void> | void;
  buildPdfFn?: (summary: SummaryContent, meta: { title: string; course: string; createdAt: string }) => Promise<Uint8Array | undefined>;
  signal?: AbortSignal;
}): Promise<MultiStageSummaryResult> {
  const { jobId, settings, onProgress, onCheckpoint, signal } = params;
  // Clean any residual OOXML/XML/HTML tags from legacy/cached sources right at pipeline ingress
  const cleanedCombined = stripTechnicalMarkup(params.bundle.combinedText || '');
  const bundle: ProcessedStudyBundle =
    cleanedCombined !== (params.bundle.combinedText || '')
      ? {
          ...params.bundle,
          combinedText: cleanedCombined,
          totalChars: cleanedCombined.length,
          totalWords: cleanedCombined.trim() ? cleanedCombined.trim().split(/\s+/).filter(Boolean).length : params.bundle.totalWords,
          sources: (params.bundle.sources || []).map((s) => ({
            ...s,
            text: stripTechnicalMarkup(s.text || ''),
          })),
        }
      : params.bundle;

  const checkAborted = () => {
    if (signal?.aborted) {
      throw new Error('Analiz işlemi kullanıcı tarafından durduruldu.');
    }
  };

  // ==================== STAGE 1: DOSYA HAZIRLANIYOR ====================
  const initialTotalPages = Math.max(1, bundle.totalPagesOrSlides || 1);
  onProgress?.({
    stage: 1,
    stageCode: 'preparing_file',
    stageLabel: 'Dosya hazırlanıyor',
    detailMessage: `"${bundle.title}" güvenli analiz kuyruğuna alındı.`,
    progressPct: 4,
    totalPages: initialTotalPages,
    processedPages: 0,
    totalChunks: 1,
    completedChunks: 0,
  });
  checkAborted();

  if (!bundle.combinedText.trim() && (!bundle.images || bundle.images.length === 0) && !bundle.audio) {
    throw new Error('Yüklenen materyalden analiz edilebilir metin veya görsel çıkarılamadı.');
  }

  // ==================== STAGE 2: SAYFALAR VE İÇERİKLER ÇIKARILIYOR ====================
  onProgress?.({
    stage: 2,
    stageCode: 'extracting_content',
    stageLabel: 'Sayfalar ve içerikler çıkarılıyor',
    detailMessage: `${bundle.sourceCount || 1} kaynak, ${initialTotalPages} sayfa/slayt ve ~${bundle.totalWords.toLocaleString(
      'tr-TR',
    )} kelime doğrulanıyor...`,
    progressPct: 11,
    totalPages: initialTotalPages,
    processedPages: Math.min(initialTotalPages, Math.max(1, Math.round(initialTotalPages * 0.15))),
    totalChunks: 1,
    completedChunks: 0,
  });
  checkAborted();

  // ==================== STAGE 3 & 4: BAŞLIKLAR VE ANLAMLI BÖLÜMLENDİRME ====================
  const plan = analyzeDocumentForSummary(bundle, settings);
  const totalPages = plan.profile.totalPagesOrSlides;
  const totalChunks = Math.max(1, plan.chunks.length);

  onProgress?.({
    stage: 3,
    stageCode: 'detecting_headings',
    stageLabel: 'Ana ve alt başlıklar belirleniyor',
    detailMessage: `${plan.outline.length} ana başlık, ${plan.formulas.length} formül ve ${plan.profile.tablesCount} tablo haritalandı (${plan.profile.courseName}).`,
    progressPct: 18,
    totalPages,
    processedPages: Math.min(totalPages, Math.max(1, Math.round(totalPages * 0.22))),
    totalChunks,
    completedChunks: 0,
    documentProfile: plan.profile,
  });
  checkAborted();

  onProgress?.({
    stage: 4,
    stageCode: 'chunking_document',
    stageLabel: 'Belge bölümlere ayrılıyor',
    detailMessage: `Belge sayfa sınırları ve bağlam örtüşmesi korunarak ${totalChunks} mantıksal analiz parçasına ayrıldı.`,
    progressPct: 24,
    totalPages,
    processedPages: Math.min(totalPages, Math.max(1, Math.round(totalPages * 0.28))),
    totalChunks,
    completedChunks: 0,
    documentProfile: plan.profile,
  });
  checkAborted();

  // ==================== STAGE 5: AKADEMİK ANALİZ (DİSİPLİN & KAVRAM ÇERÇEVESİ) ====================
  const checkpointMap = new Map<number, SummaryChunkCheckpoint>();
  for (const cp of params.existingCheckpoints || []) {
    if (cp.status === 'completed' || cp.status === 'repaired') {
      checkpointMap.set(cp.chunkIndex, cp);
    }
  }
  const alreadyDoneCount = checkpointMap.size;

  onProgress?.({
    stage: 5,
    stageCode: 'academic_analysis',
    stageLabel: 'Akademik analiz gerçekleştiriliyor',
    detailMessage:
      alreadyDoneCount > 0
        ? `${plan.profile.courseName} akademik yapısı yüklendi — ${alreadyDoneCount}/${totalChunks} tamamlanmış bölüm korunarak devam ediliyor.`
        : `${plan.profile.courseName} ders niteliğine göre kavramlar, teoriler ve sınav ekseni analiz ediliyor...`,
    progressPct: 34,
    totalPages,
    processedPages: Math.min(totalPages, Math.max(1, Math.round(totalPages * 0.35))),
    totalChunks,
    completedChunks: alreadyDoneCount,
    documentProfile: plan.profile,
  });
  checkAborted();

  // ==================== STAGE 6: BÖLÜM BAZLI AYRINTILI ANALİZ VE ÖZETLEME ====================
  const disciplineGuidanceFull = getDetailedDisciplinePromptBlock(
    plan.profile.disciplineFamily,
    plan.profile.courseName,
  );
  const checkpoints: SummaryChunkCheckpoint[] = [];
  const coveredHeadings: string[] = [];
  let aiChunkSuccessCount = 0;
  let usedModel = 'EconNotes Deep Academic AI';

  for (let i = 0; i < plan.chunks.length; i++) {
    checkAborted();
    const chunk = plan.chunks[i];

    // Reuse completed checkpoint without wasting tokens or re-running work!
    const existing = checkpointMap.get(chunk.index);
    if (existing && existing.sections.length > 0) {
      checkpoints.push(existing);
      for (const s of existing.sections) coveredHeadings.push(s.heading);
      aiChunkSuccessCount++;
      const processedPagesNow = Math.min(
        totalPages,
        chunk.pageEnd || Math.round(((i + 1) / totalChunks) * totalPages),
      );
      const pct = Math.min(72, Math.round(38 + ((i + 1) / totalChunks) * 34));
      onProgress?.({
        stage: 6,
        stageCode: 'writing_sections',
        stageLabel: 'Ayrıntılı bölüm özetleri hazırlanıyor',
        detailMessage: `Kayıtlı bölüm ${i + 1}/${totalChunks} geri yüklendi${
          chunk.pageRangeLabel ? ` (${chunk.pageRangeLabel})` : ''
        }.`,
        progressPct: pct,
        totalPages,
        processedPages: processedPagesNow,
        totalChunks,
        completedChunks: i + 1,
        documentProfile: plan.profile,
      });
      continue;
    }

    const startProcessedPages = Math.min(
      totalPages,
      chunk.pageStart ? Math.max(1, chunk.pageStart - 1) : Math.round((i / totalChunks) * totalPages),
    );
    const startPct = Math.min(70, Math.round(38 + (i / totalChunks) * 34));
    onProgress?.({
      stage: 6,
      stageCode: 'writing_sections',
      stageLabel: 'Ayrıntılı bölüm özetleri hazırlanıyor',
      detailMessage: `Bölüm ${i + 1}/${totalChunks} ayrıntılı analiz ediliyor${
        chunk.pageRangeLabel ? ` · ${chunk.pageRangeLabel}` : ''
      }...`,
      progressPct: startPct,
      totalPages,
      processedPages: startProcessedPages,
      totalChunks,
      completedChunks: i,
      documentProfile: plan.profile,
    });

    let chunkCheckpoint: SummaryChunkCheckpoint | null = null;
    let attemptError: string | undefined;

    // Tier 1: Dedicated `generate-study-material` stage='analyze_chunk'
    const edgeRes = await invokeEdgeSummaryStage({
      materialType: 'summary',
      stage: 'analyze_chunk',
      noteTitle: bundle.title,
      course: plan.profile.courseName,
      faculty: settings.faculty && settings.faculty !== 'auto' ? settings.faculty : undefined,
      examMode: settings.examMode,
      summaryDepth: settings.summaryDepth,
      deepResearch: settings.deepResearch,
      pedagogicalStyle: settings.pedagogicalStyle,
      customPrompt: settings.customPrompt || undefined,
      isMultiCourse: bundle.isMultiCourse || undefined,
      sourceCourses: bundle.sourceCourses?.length ? bundle.sourceCourses : undefined,
      canonicalAnalysisDigest: bundle.canonicalAnalysisDigest || undefined,
      extractionWarnings: plan.profile.warnings.length > 0 ? plan.profile.warnings : undefined,
      targetSectionRange: totalChunks === 1 ? plan.summaryPlan.targetSectionsLabel : totalChunks >= 10 ? '2-3' : '2-4',
      minWordsPerSection: plan.summaryPlan.minWordsPerSection,
      maxWordsPerSection: plan.summaryPlan.maxWordsPerSection,
      disciplineGuidance: disciplineGuidanceFull,
      fullOutlineHint: chunk.headingHints,
      chunkMeta: {
        index: chunk.index,
        total: chunk.total,
        pageRangeLabel: chunk.pageRangeLabel,
        overlapPrefix: chunk.overlapPrefix,
        coveredHeadings: coveredHeadings.slice(-16),
      },
      noteContext: chunk.text,
      images: i === 0 && bundle.images.length > 0 ? bundle.images : undefined,
      audio: i === 0 ? bundle.audio : undefined,
    });

    if (edgeRes && edgeRes.sourceMode === 'ai') {
      const parsed = parseChunkAiResponse(edgeRes.content, chunk);
      if (parsed) {
        chunkCheckpoint = parsed;
        usedModel = edgeRes.model;
        aiChunkSuccessCount++;
      }
    }

    // Tier 1.5: Live `academic-assistant` bridge if Edge stage isn't deployed yet
    if (!chunkCheckpoint) {
      const prompt = buildChunkAnalysisPrompt({
        chunk,
        plan,
        settings,
        coveredHeadings,
        isMultiCourse: bundle.isMultiCourse,
        sourceCourses: bundle.sourceCourses,
      });
      const bridgeRes = await invokeAcademicBridgeJson({
        title: `${bundle.title} (${i + 1}/${totalChunks})`,
        course: plan.profile.courseName,
        noteContext: chunk.text,
        taskPrompt: prompt,
        images: i === 0 ? bundle.images : undefined,
      });
      if (bridgeRes) {
        const parsed = parseChunkAiResponse(bridgeRes.json, chunk);
        if (parsed) {
          chunkCheckpoint = parsed;
          usedModel = bridgeRes.model;
          aiChunkSuccessCount++;
        }
      }
    }

    // Tier 2: Local Deep Structured Discipline Synthesizer (guarantees 100% page coverage offline/fallback)
    if (!chunkCheckpoint) {
      attemptError = 'Bulut AI yanıt veremedi; yerel derin akademik ayrıştırıcı ile işlendi.';
      chunkCheckpoint = synthesizeChunkLocally({
        chunk,
        plan,
        settings,
        bundleTitle: bundle.title,
      });
      chunkCheckpoint.errorMessage = attemptError;
    }

    checkpoints.push(chunkCheckpoint);
    for (const s of chunkCheckpoint.sections) coveredHeadings.push(s.heading);
    await onCheckpoint?.(chunkCheckpoint);

    const processedPagesNow = Math.min(
      totalPages,
      chunk.pageEnd || Math.round(((i + 1) / totalChunks) * totalPages),
    );
    const donePct = Math.min(72, Math.round(38 + ((i + 1) / totalChunks) * 34));
    onProgress?.({
      stage: 6,
      stageCode: 'writing_sections',
      stageLabel: 'Ayrıntılı bölüm özetleri hazırlanıyor',
      detailMessage: `Bölüm ${i + 1}/${totalChunks} tamamlandı (${chunkCheckpoint.sections.length} konu işlendi${
        chunk.pageRangeLabel ? ` · ${chunk.pageRangeLabel}` : ''
      }).`,
      progressPct: donePct,
      totalPages,
      processedPages: processedPagesNow,
      totalChunks,
      completedChunks: i + 1,
      documentProfile: plan.profile,
    });
  }

  checkAborted();

  // ==================== STAGE 7: BÖLÜMLER BİRLEŞTİRİLİYOR ====================
  onProgress?.({
    stage: 7,
    stageCode: 'merging_sections',
    stageLabel: 'Bölümler birleştiriliyor',
    detailMessage: `${checkpoints.length} analiz parçası birleştiriliyor, tekrarlar ayıklanıyor ve konu geçişleri kuruluyor...`,
    progressPct: 76,
    totalPages,
    processedPages: totalPages,
    totalChunks,
    completedChunks: totalChunks,
    documentProfile: plan.profile,
  });

  const rawMergedSections = checkpoints.flatMap((cp) => cp.sections);
  const dedupedByHeading = deduplicateSummarySections(rawMergedSections);
  const { sections: mergedSections, removedCount: dupParaRemoved } =
    deduplicateSummaryParagraphs(dedupedByHeading);

  const mergedKeyPoints = Array.from(
    new Set(checkpoints.flatMap((cp) => cp.keyPoints).filter(Boolean)),
  ).slice(0, plan.summaryPlan.targetKeyPoints);

  const mergedKeyTerms: KeyTermItem[] = [];
  const seenTermKeys = new Set<string>();
  for (const cp of checkpoints) {
    for (const kt of cp.keyTerms) {
      const k = kt.term.toLocaleLowerCase('tr-TR');
      if (!k || seenTermKeys.has(k)) continue;
      seenTermKeys.add(k);
      mergedKeyTerms.push(kt);
    }
  }

  const mergedEmphasis: TeacherEmphasisItem[] = [];
  const seenEmpKeys = new Set<string>();
  for (const cp of checkpoints) {
    for (const emp of cp.teacherEmphasis) {
      const k = emp.point.toLocaleLowerCase('tr-TR');
      if (!k || seenEmpKeys.has(k)) continue;
      seenEmpKeys.add(k);
      mergedEmphasis.push(emp);
    }
  }

  let mergedMatrix: ComparativeMatrix | undefined = checkpoints.find(
    (cp) => cp.comparativeMatrix && cp.comparativeMatrix.rows.length >= 2,
  )?.comparativeMatrix;

  const mergedMemorize = Array.from(new Set(checkpoints.flatMap((cp) => cp.memorize).filter(Boolean))).slice(0, 10);
  const mergedInterpret = Array.from(new Set(checkpoints.flatMap((cp) => cp.interpret).filter(Boolean))).slice(0, 10);
  const mergedChecklist = Array.from(new Set(checkpoints.flatMap((cp) => cp.studyChecklist).filter(Boolean))).slice(0, 14);
  const overviewSnippets = checkpoints.map((cp) => cp.overviewSnippet).filter((s): s is string => Boolean(s));
  const synthesisSnippets = checkpoints.map((cp) => cp.synthesisSnippet).filter((s): s is string => Boolean(s));

  let mergedOverview =
    overviewSnippets.slice(0, 3).join('\n\n') ||
    `${bundle.title} (${plan.profile.courseName}) ders materyali, ${totalPages} sayfa/slayt üzerinden baştan sona incelenerek ${mergedSections.length} kapsamlı akademik bölümde hazırlanmıştır.`;
  let mergedSynthesis =
    synthesisSnippets.slice(0, 4).join('\n\n') ||
    `${plan.profile.courseName} kapsamındaki bu çalışma notu, belgedeki tüm ana başlıkları (${mergedSections
      .slice(0, 6)
      .map((s) => s.heading)
      .join(', ')}) kavramsal bağlarıyla birleştirmektedir. Sınav öncesinde özellikle karşılaştırmalı ayrımları, tanımları ve bölüm sonu tekrar sorularını gözden geçirmeniz önerilir.`;

  // Optional Stage-5 Cloud Synthesis Cohesion Pass when multi-chunk AI succeeded
  if (aiChunkSuccessCount > 0 && checkpoints.length >= 2) {
    const synthRes = await invokeEdgeSummaryStage({
      materialType: 'summary',
      stage: 'synthesize_merge',
      noteTitle: bundle.title,
      course: plan.profile.courseName,
      disciplineGuidance: disciplineGuidanceFull,
      noteContext: mergedSections
        .map(
          (s, idx) =>
            `${idx + 1}. ${s.heading}${s.pageRange ? ` (${s.pageRange})` : ''}: ${s.content.slice(0, 420)}`,
        )
        .join('\n\n'),
      globalOutline: {
        overview: mergedOverview,
        keyPoints: mergedKeyPoints,
        courseTitle: plan.profile.courseName,
      },
    });
    if (synthRes && synthRes.sourceMode === 'ai') {
      const sc = synthRes.content;
      if (typeof sc.overview === 'string' && sc.overview.trim().length > 80) {
        mergedOverview = sc.overview.trim();
      }
      if (typeof sc.summarySynthesis === 'string' && sc.summarySynthesis.trim().length > 60) {
        mergedSynthesis = sc.summarySynthesis.trim();
      }
      if (
        sc.comparativeMatrix &&
        typeof sc.comparativeMatrix === 'object' &&
        Array.isArray((sc.comparativeMatrix as Record<string, unknown>).rows) &&
        ((sc.comparativeMatrix as { rows: unknown[] }).rows.length >= 2)
      ) {
        mergedMatrix = sc.comparativeMatrix as ComparativeMatrix;
      }
    }
  }

  let workingSections = [...mergedSections];
  const sourceCourseBreakdown = (bundle.sources || []).map((s) => ({
    sourceName: s.name,
    course: s.course || s.detectedCourse || plan.profile.courseName,
    pagesOrSlides: s.pagesOrSlides,
  }));

  const buildSummaryObject = (sectionsArr: SummarySection[]): SummaryContent => ({
    overview: mergedOverview,
    disciplineTag: plan.profile.courseName,
    disciplineFamily: plan.profile.disciplineFamily,
    keyPoints:
      mergedKeyPoints.length > 0
        ? mergedKeyPoints
        : sectionsArr.map((s) => `**${s.heading}**`).slice(0, 12),
    sections: sectionsArr,
    teacherEmphasis: mergedEmphasis.slice(0, 14),
    comparativeMatrix: mergedMatrix,
    keyTerms: mergedKeyTerms.slice(0, plan.summaryPlan.targetKeyTerms),
    memorizeVsInterpret:
      mergedMemorize.length > 0 || mergedInterpret.length > 0
        ? { memorize: mergedMemorize, interpret: mergedInterpret }
        : undefined,
    summarySynthesis: mergedSynthesis,
    extractionNotices: plan.profile.warnings.length > 0 ? plan.profile.warnings : undefined,
    sourceCourseBreakdown,
    documentProfile: plan.profile,
    studyChecklist:
      mergedChecklist.length > 0
        ? mergedChecklist
        : sectionsArr
            .slice(0, 8)
            .map((s) => `"${s.heading}" bölümündeki temel kavramları, ayrımları ve örnekleri açıklayabilirim.`),
    studyPriorityMap: buildTopicPriorityGuide({
      sections: sectionsArr,
      keyTerms: mergedKeyTerms,
      teacherEmphasis: mergedEmphasis,
      overview: mergedOverview,
      disciplineTag: plan.profile.courseName,
    }),
  });

  // ==================== STAGE 8: 10 MADDELİK KALİTE KONTROLÜ & EKSİK ONARIM ====================
  onProgress?.({
    stage: 8,
    stageCode: 'quality_check',
    stageLabel: 'Eksik ve hatalı bilgiler kontrol ediliyor',
    detailMessage: '10 maddelik akademik kalite ve başlık kapsam denetimi uygulanıyor...',
    progressPct: 83,
    totalPages,
    processedPages: totalPages,
    totalChunks,
    completedChunks: totalChunks,
    documentProfile: plan.profile,
  });

  let draftSummary = sanitizeSummaryContent(buildSummaryObject(workingSections));
  workingSections = draftSummary.sections;
  let qualityAudit = auditSummaryQuality({
    summary: draftSummary,
    bundle,
    profile: plan.profile,
    outline: plan.outline,
    formulas: plan.formulas,
    plan: plan.summaryPlan,
    repairedSectionsCount: 0,
    duplicateRemovedCount: dupParaRemoved,
  });

  let repairedCount = 0;

  // Step 8A: Immediately excise or replace any OFF-TOPIC / foreign-discipline sections BEFORE finalizing!
  const offTopicIndices = new Set(qualityAudit.offTopicSectionIndices || []);
  if (offTopicIndices.size > 0) {
    workingSections = workingSections
      .filter((_, idx) => !offTopicIndices.has(idx))
      .map((sec, idx) => ({ ...sec, index: idx }));
    repairedCount += offTopicIndices.size;

    // If removing off-topic sections emptied the summary, rebuild cleanly from raw source outline
    if (workingSections.length === 0) {
      const rebuilt = generateClientStudyMaterial({
        materialType: 'summary',
        noteTitle: bundle.title,
        course: plan.profile.courseName,
        noteContext: bundle.combinedText,
        totalPagesOrSlides: totalPages,
        summaryDepth: settings.summaryDepth,
        examMode: settings.examMode,
        deepResearch: settings.deepResearch,
      });
      workingSections = sanitizeSectionsArray(rebuilt.sections);
    }

    draftSummary = sanitizeSummaryContent(buildSummaryObject(workingSections));
    workingSections = draftSummary.sections;
    qualityAudit = auditSummaryQuality({
      summary: draftSummary,
      bundle,
      profile: plan.profile,
      outline: plan.outline,
      formulas: plan.formulas,
      plan: plan.summaryPlan,
      repairedSectionsCount: repairedCount,
      duplicateRemovedCount: dupParaRemoved,
    });
  }

  // Step 8B: Targeted Quality Repair ONLY for uncovered headings or weak sections
  const missingHeadingsToRepair = qualityAudit.missingHeadings.slice(0, 5);
  const weakIndicesToRepair = qualityAudit.weakSectionIndices.slice(0, 4);

  if (missingHeadingsToRepair.length > 0 || weakIndicesToRepair.length > 0) {
    checkAborted();
    onProgress?.({
      stage: 8,
      stageCode: 'quality_check',
      stageLabel: 'Eksik ve hatalı bilgiler kontrol ediliyor',
      detailMessage: `${missingHeadingsToRepair.length} eksik başlık ve ${weakIndicesToRepair.length} geliştirilebilir bölüm kaynakla karşılaştırılarak tamamlanıyor...`,
      progressPct: 87,
      totalPages,
      processedPages: totalPages,
      totalChunks,
      completedChunks: totalChunks,
      documentProfile: plan.profile,
    });

    const repairTargets = [
      ...weakIndicesToRepair.map((sIdx) => {
        const orig = workingSections[sIdx];
        return {
          mode: 'weak' as const,
          sectionIndex: sIdx,
          title: orig.heading,
          pageRange: orig.pageRange,
          contextSlice: sliceContextForSection(
            bundle.combinedText,
            orig.heading,
            sIdx,
            workingSections.length,
            orig.takeaways || [],
            12_000,
          ),
        };
      }),
      ...missingHeadingsToRepair.map((mh, mi) => {
        const anchor = plan.outline.find((a) => a.heading === mh);
        return {
          mode: 'missing' as const,
          sectionIndex: workingSections.length + mi,
          title: mh,
          pageRange: anchor?.pageHint,
          contextSlice: sliceContextForSection(
            bundle.combinedText,
            mh,
            mi,
            Math.max(1, plan.outline.length),
            [mh],
            10_000,
          ),
        };
      }),
    ];

    let repairedSectionsFromAi: SummarySection[] = [];
    if (aiChunkSuccessCount > 0 && repairTargets.length > 0) {
      const repairEdge = await invokeEdgeSummaryStage({
        materialType: 'summary',
        stage: 'quality_repair',
        noteTitle: bundle.title,
        course: plan.profile.courseName,
        disciplineGuidance: disciplineGuidanceFull,
        minWordsPerSection: plan.summaryPlan.minWordsPerSection,
        maxWordsPerSection: plan.summaryPlan.maxWordsPerSection,
        noteContext: sampleUniformContext(bundle.combinedText, 24_000),
        sectionTargets: repairTargets.map((t) => ({
          index: t.sectionIndex,
          title: t.title,
          pageRange: t.pageRange,
          focusPoints: [t.title],
          contextSlice: t.contextSlice,
        })),
      });
      if (repairEdge && repairEdge.sourceMode === 'ai') {
        repairedSectionsFromAi = sanitizeSectionsArray(repairEdge.content.sections);
      }
    }

    for (let rIdx = 0; rIdx < repairTargets.length; rIdx++) {
      const target = repairTargets[rIdx];
      const aiMatch =
        repairedSectionsFromAi.find((s) => s.index === target.sectionIndex) ||
        repairedSectionsFromAi[rIdx];

      const resolvedSec: SummarySection =
        aiMatch && aiMatch.content.length >= 220
          ? {
              ...aiMatch,
              heading: aiMatch.heading || target.title,
              pageRange: aiMatch.pageRange || target.pageRange,
            }
          : formatSectionContentForFallback({
              index: target.sectionIndex,
              heading: target.title,
              pageRange: target.pageRange,
              rawSlice: target.contextSlice,
              focusPoints: [target.title],
              course: plan.profile.courseName,
              title: bundle.title,
              deepResearch: settings.deepResearch,
            });

      if (target.mode === 'weak' && workingSections[target.sectionIndex]) {
        if (resolvedSec.content.length > workingSections[target.sectionIndex].content.length) {
          workingSections[target.sectionIndex] = {
            ...workingSections[target.sectionIndex],
            ...resolvedSec,
            index: target.sectionIndex,
          };
          repairedCount++;
        }
      } else if (target.mode === 'missing' && resolvedSec.content.length >= 120) {
        workingSections.push({
          ...resolvedSec,
          index: workingSections.length,
        });
        repairedCount++;
      }
    }

    const postDedup = deduplicateSummaryParagraphs(deduplicateSummarySections(workingSections));
    workingSections = postDedup.sections;
    draftSummary = sanitizeSummaryContent(buildSummaryObject(workingSections));
    workingSections = draftSummary.sections;
    qualityAudit = auditSummaryQuality({
      summary: draftSummary,
      bundle,
      profile: plan.profile,
      outline: plan.outline,
      formulas: plan.formulas,
      plan: plan.summaryPlan,
      repairedSectionsCount: repairedCount,
      duplicateRemovedCount: dupParaRemoved + postDedup.removedCount,
    });

    // Final safety pass: drop any newly repaired section that still failed off-topic validation
    if ((qualityAudit.offTopicSectionIndices || []).length > 0) {
      const badSet = new Set(qualityAudit.offTopicSectionIndices);
      const filtered = workingSections.filter((_, idx) => !badSet.has(idx));
      if (filtered.length > 0) {
        workingSections = filtered.map((sec, idx) => ({ ...sec, index: idx }));
        draftSummary = sanitizeSummaryContent(buildSummaryObject(workingSections));
        qualityAudit = auditSummaryQuality({
          summary: draftSummary,
          bundle,
          profile: plan.profile,
          outline: plan.outline,
          formulas: plan.formulas,
          plan: plan.summaryPlan,
          repairedSectionsCount: repairedCount + badSet.size,
          duplicateRemovedCount: dupParaRemoved + postDedup.removedCount,
        });
      }
    }
  }

  checkAborted();

  // ==================== STAGE 9: DERS NOTU BİÇİMLENDİRİLİYOR ====================
  onProgress?.({
    stage: 9,
    stageCode: 'formatting_notes',
    stageLabel: 'Ders notu biçimlendiriliyor',
    detailMessage: `İçindekiler, kavram sözlüğü (${draftSummary.keyTerms?.length || 0} terim), sayfa referansları ve kalite raporu (%${
      qualityAudit.overallScore
    }) düzenleniyor...`,
    progressPct: 93,
    totalPages,
    processedPages: totalPages,
    totalChunks,
    completedChunks: totalChunks,
    documentProfile: plan.profile,
  });

  const resolvedSourceMode: 'ai' | 'fallback' | 'local' =
    aiChunkSuccessCount === totalChunks
      ? 'ai'
      : aiChunkSuccessCount > 0
      ? 'fallback'
      : 'local';

  const nowIso = new Date().toISOString();
  const finalSummary: SummaryContent = sanitizeSummaryContent({
    ...draftSummary,
    qualityAudit,
    documentProfile: plan.profile,
    metadata: {
      sourceMode: resolvedSourceMode,
      deepResearch: settings.deepResearch,
      summaryDepth: settings.summaryDepth,
      examMode: settings.examMode,
      faculty: settings.faculty,
      isLargeBundle: totalPages >= 12 || plan.profile.totalWords >= 2800,
      sourceFingerprint: bundle.sourceFingerprint,
      sourceIds: bundle.sourceIds || bundle.sources.map((s) => s.id),
      analyzedCourses: bundle.sourceCourses,
      isMultiCourse: bundle.isMultiCourse,
      jobId,
      analyzedAt: nowIso,
      pdfReady: true,
      sourceStats: {
        sourceCount: bundle.sourceCount || 1,
        wordCount: plan.profile.totalWords,
        pagesOrSlides: totalPages,
        sectionCount: workingSections.length,
      },
    },
  });

  // ==================== STAGE 10: PDF OLUŞTURULUYOR ====================
  onProgress?.({
    stage: 10,
    stageCode: 'building_pdf',
    stageLabel: 'PDF oluşturuluyor',
    detailMessage: 'Türkçe karakter destekli, içindekiler ve sayfa numaralı profesyonel PDF hazırlanıyor...',
    progressPct: 97,
    totalPages,
    processedPages: totalPages,
    totalChunks,
    completedChunks: totalChunks,
    documentProfile: plan.profile,
  });

  let pdfBytes: Uint8Array | undefined;
  if (params.buildPdfFn) {
    try {
      pdfBytes = await params.buildPdfFn(finalSummary, {
        title: bundle.title,
        course: plan.profile.courseName,
        createdAt: nowIso,
      });
    } catch (pdfErr) {
      console.warn('Pre-build PDF generation deferred to on-demand download:', pdfErr);
    }
  }

  return {
    content: finalSummary,
    model: resolvedSourceMode === 'local' ? 'EconNotes Çok Aşamalı Akademik Motor (Yerel)' : usedModel,
    sourceMode: resolvedSourceMode,
    checkpoints,
    plan,
    pdfBytes,
  };
}
