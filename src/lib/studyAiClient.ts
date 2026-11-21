import { supabase } from '@/integrations/supabase/client';
import {
  formatSectionContentForFallback,
  generateClientStudyMaterial,
  type GeneratePayload,
} from '@/lib/studyMaterialGenerator';
import {
  buildTopicPriorityGuide,
  classifyStudyDomain,
  extractFullDocumentOutline,
  isLargeStudyBundle,
  sampleUniformContext,
  sliceContextForSection,
  type AcademicDomainMode,
} from '@/lib/studySourceProcessor';
import {
  buildAvoidanceAndRotationPlan,
  computeDifficultyQuota,
  loadSourceFlashcardHistory,
  loadSourceQuestionHistory,
  recordValidatedFlashcardsToHistory,
  recordValidatedQuestionsToHistory,
  resolveVideoThemeForCourse,
  validateAndRepairVideoContent,
  validateFlashcardsBatch,
  validateQuizBatch,
  type DifficultyQuota,
} from '@/lib/studyQualityEngine';
import type {
  CoachMode,
  FlashcardItem,
  OpenEndedGradeResult,
  ProcessedStudyBundle,
  QuizQuestion,
  StudyContentPayload,
  StudioGenerationSettings,
  StudyTopicPriorityItem,
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

/**
 * Tier-1.5 Resilient Live Server AI Bridge:
 * Calls already-live Supabase Edge Functions (`academic-assistant` running GPT-4o / Gemini 2.5 Pro
 * with 6500 output tokens & low 0.15 temperature, and `study-coach` running GPT-4o-mini) whenever
 * `generate-study-material` fails or returns fallback, guaranteeing real ChatGPT-level summaries,
 * crystal-clear exam questions, flashcards, and on-topic videos immediately.
 */
async function invokeLiveServerAiText(params: {
  materialType: 'summary' | 'quiz' | 'flashcards' | 'video';
  title: string;
  course?: string;
  noteContext: string;
  taskPrompt: string;
  preferPro?: boolean;
  images?: Array<{ data: string; mimeType: string; pageLabel?: string }>;
}): Promise<{ text: string; model: string } | null> {
  await ensureFreshSession();
  const safeTitle = (params.title || 'Ders Notu').slice(0, 240);
  const safeCourse = (params.course || safeTitle).slice(0, 120);
  const safeTask = params.taskPrompt.slice(0, 7_200);
  const hasImages = Array.isArray(params.images) && params.images.length > 0;

  const tryAcademicAssistant = async (): Promise<{ text: string; model: string } | null> => {
    try {
      const noteBudget = Math.max(8_000, 73_500 - safeTask.length);
      const sourceText = sampleUniformContext(params.noteContext, noteBudget);
      const fullMessage = `${safeTask}\n\nKRİTİK BAĞLAM KURALI: YALNIZCA aşağıda verilen ders notunun kendi konusuna, terimlerine ve içeriğine sadık kal. Notta bulunmayan başka derslerden (veya alakasız alanlardan) kavram, grafik ya da formül ASLA ekleme.\n\n=== YÜKLENEN DERS NOTU (${safeTitle}) ===\n${sourceText}`.slice(
        0,
        78_500,
      );

      const payload: Record<string, unknown> = {
        message: fullMessage,
        mode: 'concept',
        notesContext: '',
        hasFile: true,
        fileName: safeTitle,
      };
      if (hasImages && params.images) {
        payload.images = params.images.slice(0, 4).map((img, i) => ({
          name: img.pageLabel || `Sayfa-${i + 1}`,
          mimeType: img.mimeType || 'image/jpeg',
          data: img.data,
        }));
      }

      const { data, error } = await supabase.functions.invoke('academic-assistant', {
        body: payload,
      });
      if (!error && typeof data?.reply === 'string' && data.reply.trim().length > 60) {
        return {
          text: data.reply.trim(),
          model: String(data.model || 'EconNotes Akademik AI'),
        };
      }
    } catch {
      // Fall through to secondary live bridge
    }
    return null;
  };

  const tryStudyCoach = async (): Promise<{ text: string; model: string } | null> => {
    if (hasImages) return null;
    try {
      const { data, error } = await supabase.functions.invoke('study-coach', {
        body: {
          materialTitle: safeTitle,
          materialType: params.materialType,
          course: safeCourse,
          materialContent: {
            dersNotu: sampleUniformContext(params.noteContext, 52_000),
          },
          coachMode: 'tutor',
          messages: [{ role: 'user', content: safeTask }],
        },
      });
      if (!error && typeof data?.reply === 'string' && data.reply.trim().length > 60) {
        return {
          text: data.reply.trim(),
          model: String(data.model || 'EconNotes Akademik AI'),
        };
      }
    } catch {
      // Fall through
    }
    return null;
  };

  if (params.preferPro || hasImages) {
    const proRes = await tryAcademicAssistant();
    if (proRes) return proRes;
    return await tryStudyCoach();
  }

  const coachRes = await tryStudyCoach();
  if (coachRes) return coachRes;
  return await tryAcademicAssistant();
}

/**
 * Converts a fluent ChatGPT-style Markdown lecture summary into structured SummaryContent
 * if the AI responded in natural Markdown instead of strict JSON.
 */
function parseMarkdownSummaryToSections(
  markdown: string,
  title: string,
  discipline: string,
): SummaryContent | null {
  const clean = markdown.trim();
  if (clean.length < 180) return null;

  const lines = clean.split('\n');
  const introLines: string[] = [];
  const rawSections: Array<{ heading: string; bodyLines: string[] }> = [];
  let current: { heading: string; bodyLines: string[] } | null = null;

  for (const line of lines) {
    const hMatch = line.match(/^#{1,3}\s+(.+)$/);
    if (hMatch) {
      const heading = hMatch[1].replace(/\*\*/g, '').trim();
      if (heading.length >= 2) {
        if (current && current.bodyLines.join('\n').trim().length > 20) {
          rawSections.push(current);
        }
        current = { heading, bodyLines: [] };
        continue;
      }
    }
    if (current) {
      current.bodyLines.push(line);
    } else {
      introLines.push(line);
    }
  }
  if (current && current.bodyLines.join('\n').trim().length > 20) {
    rawSections.push(current);
  }

  if (rawSections.length === 0) {
    // Split long prose into readable sections cleanly
    const paragraphs = clean.split(/\n{2,}/).filter((p) => p.trim().length > 25);
    if (paragraphs.length === 0) return null;
    const overview = paragraphs[0];
    const rest = paragraphs.slice(1);
    const perGroup = Math.max(1, Math.ceil(rest.length / Math.min(5, Math.max(1, rest.length))));
    const sections: SummarySection[] = [];
    for (let i = 0; i < rest.length; i += perGroup) {
      const chunk = rest.slice(i, i + perGroup).join('\n\n');
      sections.push({
        index: sections.length,
        heading: `${title} — Bölüm ${sections.length + 1}`,
        content: chunk,
        takeaways: [],
      });
    }
    return {
      overview,
      disciplineTag: discipline,
      keyPoints: [],
      sections: sections.length > 0 ? sections : [{ index: 0, heading: title, content: clean, takeaways: [] }],
      studyPriorityMap: buildTopicPriorityGuide({
        sections: sections.length > 0 ? sections : [{ index: 0, heading: title, content: clean }],
        overview,
        disciplineTag: discipline,
      }),
    };
  }

  const sections: SummarySection[] = rawSections.map((rs, idx) => {
    const body = rs.bodyLines.join('\n').trim();
    const bulletTakeaways = rs.bodyLines
      .filter((l) => /^\s*[-*•]\s+/.test(l))
      .map((l) => l.replace(/^\s*[-*•]\s+/, '').replace(/\*\*/g, '').trim())
      .filter((l) => l.length >= 12 && l.length <= 180)
      .slice(0, 3);
    return {
      index: idx,
      heading: rs.heading,
      content: body,
      takeaways: bulletTakeaways,
    };
  });

  const overview =
    introLines.join('\n').trim() ||
    `${title} ders notu ${sections.length} ana başlık altında ayrıntılı ve anlaşılır biçimde özetlenmiştir.`;

  const keyPoints = sections
    .map((s) => (s.takeaways && s.takeaways[0] ? `**${s.heading}:** ${s.takeaways[0]}` : `**${s.heading}**`))
    .slice(0, 8);

  return {
    overview,
    disciplineTag: discipline,
    keyPoints,
    sections,
    studyPriorityMap: buildTopicPriorityGuide({
      sections,
      overview,
      disciplineTag: discipline,
    }),
  };
}

function buildChatGptStyleSummaryPrompt(
  bundle: ProcessedStudyBundle,
  settings: StudioGenerationSettings,
  courseOrDisciplineLabel: string,
  outlineList: string[],
): string {
  const isLarge = isLargeStudyBundle(bundle) || settings.examMode === 'large_note';
  const sectionRange =
    settings.summaryDepth === 'short'
      ? '5-6'
      : settings.summaryDepth === 'textbook' || isLarge
      ? '9-14'
      : '7-10';
  const outlineHint =
    outlineList.length > 0
      ? `\nNottaki baştan sona tespit edilen başlıklar (hiçbirini atlama): ${outlineList.slice(0, 28).join(' | ')}`
      : '';
  const multiCourseHint =
    bundle.isMultiCourse && bundle.sourceCourses && bundle.sourceCourses.length > 1
      ? `\nÇOKLU DERS İZOLASYONU: Bu oturumda farklı dersler (${bundle.sourceCourses.join(', ')}) var. Her dersin içeriğini yalnızca kendi [Ders Adı] başlığı altında işle; farklı derslerin bilgilerini ASLA karıştırma!`
      : '';
  const warningsHint =
    bundle.extractionWarnings && bundle.extractionWarnings.length > 0
      ? `\nEKSİK / OKUNAMAYAN BELGE UYARILARI (extractionNotices alanında dürüstçe belirt): ${bundle.extractionWarnings.join(' | ')}`
      : '';
  const customRule = settings.customPrompt?.trim()
    ? `\nÖğrencinin özel isteği: ${settings.customPrompt.trim()}`
    : '';
  const examRule =
    settings.examMode === 'cram_24h'
      ? '\nOdak: Sınava son 24 saat — en yüksek sınav olasılıklı kavramları, kritik ayrımları ve formülleri özellikle öne çıkar.'
      : '';

  return `Görev: Aşağıdaki ders materyalini ilk sayfadan son sayfaya kadar eksiksiz analiz edip, öğrencinin konuyu gerçekten öğrenmesini ve sınava tam hazırlanmasını sağlayacak kapsamlı, nitelikli bir Türkçe çalışma özeti hazırla.
KESİN KURALLAR:
1. YÜZEYSEL VE KISA ÖZET YASAKTIR: Birkaç kısa paragraf yazıp geçme. Belgedeki TÜM ana ve alt başlıkları (####), kavramları, tanımları, teorileri, yaklaşımları, modelleri, formülleri (LaTeX $...$ / $$...$$ ile ve her değişkeni açıklayarak), grafikleri, tabloları ve örnekleri ayrıntılı biçimde açıkla.
2. %100 KAYNAK SADAKATİ: Yalnızca yüklenen belgede bulunan gerçek bilgilere dayan. Kaynakta olmayan teorileri, tanımları veya başka bir dersin konularını içeriği uzatmak için KESİNLİKLE ekleme. Kaynaktaki akademik terminoloji ve konu sıralamasını koru.
3. ŞEFFAF EK AÇIKLAMA: Öğrencinin zorlanabileceği bir noktayı sadeleştirmek için kaynaktaki metnin ötesinde kısa açıklama ekliyorsan, bunu mutlaka **[Ek Açıklama]** etiketiyle kaynak bilgisinden ayır.
4. KONULAR ARASI BAĞLANTI, TABLO VE SINAV VURGUSU: Kavramlar arası ilişkileri kur, gerektiğinde karşılaştırmalı Markdown tabloları (|...|) ekle, sınavda sorulabilecek ayrıntıları ve sık karıştırılan tuzakları özellikle vurgula.
5. Belgedeki ilk sayfadan son sayfaya kadar önemli hiçbir bölümü atlama (${sectionRange} kapsamlı bölüm oluştur, her bölüm 380-620 kelime arası doyurucu olsun). Okunamayan/eksik sayfa varsa "extractionNotices" dizisinde açıkça belirt.${outlineHint}${multiCourseHint}${warningsHint}${examRule}${customRule}

YANITINI YALNIZCA AŞAĞIDAKİ GEÇERLİ JSON FORMATINDA DÖNDÜR (başka sohbet metni yazma):
{
  "overview": "Ders materyalinin bütününü, kapsamını ve temel konu akışını anlatan 2-3 paragraf nitelikli giriş özeti",
  "disciplineTag": "${courseOrDisciplineLabel}",
  "extractionNotices": ["Varsa okunamayan veya eksik kalan sayfa/slayt uyarısı; yoksa []"],
  "keyPoints": ["Nottaki 8-12 en önemli somut kavram/çıkarım"],
  "sections": [
    {
      "index": 0,
      "heading": "Nottaki gerçek ana konu başlığı",
      "pageRange": "Varsa sayfa/slayt aralığı",
      "content": "Alt başlıklar (####), detaylı kavram/teori/formül/tablo/örnek açıklaması, konular arası bağlantı ve sınav vurgusu içeren 380-620 kelimelik Türkçe Markdown anlatım...",
      "takeaways": ["Net çıkarım 1", "Net çıkarım 2", "Net çıkarım 3"],
      "commonPitfalls": ["Sınavda karıştırılabilecek 1-2 kritik nokta"],
      "checkpointQuestion": { "question": "Bölüme özel kontrol sorusu?", "options": ["A","B","C","D"], "correctIndex": 0, "explanation": "Kaynağa dayalı açıklama." }
    }
  ],
  "studyPriorityMap": [
    {
      "topic": "Nottaki gerçek konu başlığı",
      "priority": "critical",
      "reason": "Sınavda neden mutlaka bakılması gerektiği (1-2 net cümle)",
      "estimatedMinutes": 10,
      "focusConcepts": ["Kavram 1", "Kavram 2"],
      "likelyQuestionType": "Tanım / Karşılaştırma / Formül & Uygulama / Yorum",
      "sectionIndex": 0
    }
  ],
  "comparativeMatrix": {
    "title": "Kaynaktaki Kavram / Teori Karşılaştırma Tablosu (karşılaştırma varsa)",
    "columns": ["Ölçüt", "Kavram A", "Kavram B"],
    "rows": [["...", "...", "..."]]
  },
  "teacherEmphasis": [{ "point": "Nottaki kritik sınav ayrıntısı", "whyImportant": "Neden önemli", "examProbability": "Yüksek" }],
  "keyTerms": [{ "term": "Nottaki terim", "definition": "Ayrıntılı ve doğru tanım", "formula": "Varsa kaynaktaki formül" }],
  "studyChecklist": ["Bu notu bitirdiğimde ... konusunu ve ayrımlarını açıklayabilirim."]
}`;
}

function buildStrictQuizPrompt(
  settings: StudioGenerationSettings,
  bundle?: ProcessedStudyBundle,
  options?: {
    targetCount?: number;
    quota?: DifficultyQuota;
    avoidSummaries?: string[];
    priorityTopics?: string[];
    generationNonce?: string;
    isRepairPass?: boolean;
  },
): string {
  const count = Math.min(Math.max(options?.targetCount ?? settings.questionCount ?? 10, 1), 25);
  const quota = options?.quota ?? computeDifficultyQuota(count, settings.difficulty || 'mixed');
  const formatRule =
    settings.quizFormat === 'open_ended'
      ? 'Tüm sorular klasik / açık uçlu (short_answer) olsun; her biri için net örnek cevap (sampleAnswer) ve puanlama rubriği yaz.'
      : settings.quizFormat === 'mixed'
      ? 'Soruların yaklaşık %75i 4 şıklı çoktan seçmeli (multiple_choice), %25i açık uçlu (short_answer) olsun.'
      : 'Tüm sorular TAM OLARAK 4 şıklı çoktan seçmeli (multiple_choice) olsun.';
  const difficultyRule = `ZORLUK DAĞILIMI (BİLİŞSEL DÜZEYE GÖRE, KELİME SAYISINA GÖRE DEĞİL):
- ${quota.easy} adet "easy" (Temel bilgi ve kavrama — doğrudan tanım, sınıflandırma, ilke tanıma)
- ${quota.medium} adet "medium" (Yorumlama ve uygulama — mekanizma, neden-sonuç etkisi, örnek/senaryo veya kaynaktaki formül uygulaması)
- ${quota.hard} adet "hard" (Analiz ve karşılaştırma — iki yaklaşım/teori karşılaştırması, varsayım bozulması, hangisi söylenemez / çıkarılamaz analizi)`;
  const multiRule =
    bundle?.isMultiCourse && bundle.sourceCourses?.length
      ? `\nÇOKLU DERS İZOLASYONU: Seçili dersler (${bundle.sourceCourses.join(', ')}) birbirine ASLA karıştırılmamalı; her sorunun "topic" alanında "[Ders Adı] — Konu" biçimini kullan.`
      : '';
  const priorityRule =
    options?.priorityTopics && options.priorityTopics.length > 0
      ? `\nÖNCELİKLİ KONU DÖNGÜSÜ (BU SINAVDA ÖZELLİKLE KAPSA): ${options.priorityTopics.slice(0, 10).join(' | ')}`
      : '';
  const avoidRule =
    options?.avoidSummaries && options.avoidSummaries.length > 0
      ? `\nKESİN TEKRAR YASAĞI — DAHA ÖNCE SORULMUŞ SORULAR VE KAVRAMLAR (BUNLARI, AYNI OLGUNUN FARKLI KELİMELERLE YENİDEN YAZIMINI VEYA AYNI CEVABI ÖLÇEN BENZER SORULARI ASLA ÜRETME):\n${options.avoidSummaries
          .slice(0, 22)
          .map((s, idx) => `${idx + 1}. ${s}`)
          .join('\n')}`
      : '';
  const nonceHint = options?.generationNonce
    ? `\nÜRETİM OTURUMU: ${options.generationNonce} (Önceki denemelerden farklı alt başlıklar, farklı kazanımlar ve farklı soru kurguları seç.)`
    : '';
  const repairHint = options?.isRepairPass
    ? '\nONARIM TURU: Kalite kontrolünden geçemeyen veya tekrar eden soruları telafi etmek için YALNIZCA istenen eksik adet ve zorluklarda, yukarıdaki yasaklı listeden tamamen bağımsız yeni sorular üret.'
    : '';
  const digestHint = bundle?.canonicalAnalysisDigest
    ? `\nORTAK KAYNAK ANALİZİ (ÖZET VE DİĞER ARAÇLARLA %100 AYNI KAPSAM):\n${bundle.canonicalAnalysisDigest.slice(0, 3_000)}`
    : '';

  return `Görev: Yalnızca yüklenen ders notuna ve ortak kaynak analizine dayanarak tam ${count} adet özgün, akademik açıdan kusursuz ve doğrulanmış Türkçe üniversite sınav sorusu üret.
${formatRule}
${difficultyRule}${multiRule}${priorityRule}${avoidRule}${nonceHint}${repairHint}
${settings.customPrompt?.trim() ? `Özel istek: ${settings.customPrompt.trim()}` : ''}${digestHint}

KESİN AKADEMİK KALİTE VE DOĞRULAMA KURALLARI:
1. %100 KAYNAK BAĞLILIĞI: Sorular doğrudan yüklenen belgedeki gerçek kavram, teori, model, formül ve örneklerden üretilmelidir. Kaynakta anlatılmayan konulardan veya başka derslerden rastgele soru ASLA üretme.
2. TEKRAR VE BENZERLİK YASAĞI: Aynı kavramı, aynı tanımı veya aynı mekanizmayı kelimeleri hafifçe değiştirerek iki kez sorma. Soru sayısını doldurmak için varyasyon üretme; belgenin farklı başlık ve kazanımlarına yayıl.
3. TEK VE KESİN DOĞRU CEVAP: Çoktan seçmeli sorularda TAM 4 şık olmalı; YALNIZCA 1 şık kaynak metne göre kesinlikle doğru, diğer 3 şık ise açıkça yanlış ama akademik olarak mantıklı ve birbirinden farklı çeldiriciler olmalıdır. İki şıkkın aynı anda doğru olması, benzer/kopya şıklar, yarıda kesilmiş ("...") ifadeler ve anlamsız çeldiriciler kesinlikle yasaktır.
4. CEVAP ANAHTARI VE AÇIKLAMA TUTARLILIĞI: "correctIndex" (0=A, 1=B, 2=C, 3=D) değerini bağımsız olarak doğrula; "explanation" alanındaki çözüm işaretlenen doğru şık ile birebir örtüşmeli ve kaynağa dayanmalıdır. Doğru şıkları 0, 1, 2, 3 arasında dengeli dağıt.
5. KAYNAK REFERANSI: Her soruda "sourceSection" (ilgili konu başlığı), varsa "sourcePage" (örn. "Sayfa 4" / "Slayt 7") ve kısa benzersiz "conceptKey" belirt.

YANITINI YALNIZCA GEÇERLİ JSON OLARAK DÖNDÜR:
{
  "questions": [
    {
      "type": "multiple_choice",
      "question": "Net, eksiksiz ve akademik açıdan tutarlı soru kökü?",
      "options": ["Şık A", "Şık B", "Şık C", "Şık D"],
      "correctIndex": 1,
      "sampleAnswer": "",
      "rubric": [],
      "explanation": "Doğru şıkkın neden doğru olduğunu kaynak nottaki dayanağıyla açıklayan 2-3 cümle.",
      "topic": "Nottaki ilgili konu başlığı",
      "sourceSection": "Belgedeki ilgili başlık",
      "sourcePage": "Sayfa/Slayt no (varsa)",
      "conceptKey": "kisa_kavram_anahtari",
      "difficulty": "easy | medium | hard",
      "bloomLevel": "Bilgi ve Kavrama | Yorumlama ve Uygulama | Analiz ve Karşılaştırma"
    }
  ]
}`;
}

function buildStrictFlashcardsPrompt(
  settings: StudioGenerationSettings,
  bundle?: ProcessedStudyBundle,
  options?: {
    targetCount?: number;
    avoidFronts?: string[];
    priorityTopics?: string[];
    generationNonce?: string;
  },
): string {
  const count = Math.min(Math.max(options?.targetCount ?? settings.cardCount ?? 14, 2), 30);
  const multiRule =
    bundle?.isMultiCourse && bundle.sourceCourses?.length
      ? `\nÇOKLU DERS KURALI: Her kartı kendi dersine ait tut ve "topic" alanında "[Ders Adı] — Konu" kullan (${bundle.sourceCourses.join(', ')}).`
      : '';
  const priorityRule =
    options?.priorityTopics && options.priorityTopics.length > 0
      ? `\nÖNCELİKLİ BÖLÜMLER: ${options.priorityTopics.slice(0, 10).join(' | ')}`
      : '';
  const avoidRule =
    options?.avoidFronts && options.avoidFronts.length > 0
      ? `\nTEKRAR YASAĞI — DAHA ÖNCE ÜRETİLEN KARTLAR (AYNISINI VEYA BENZERİNİ ÜRETME):\n${options.avoidFronts
          .slice(0, 20)
          .map((f, i) => `${i + 1}. ${f}`)
          .join('\n')}`
      : '';
  const digestHint = bundle?.canonicalAnalysisDigest
    ? `\nORTAK KAYNAK ANALİZİ:\n${bundle.canonicalAnalysisDigest.slice(0, 3_000)}`
    : '';
  return `Görev: Yalnızca yüklenen ders notuna ve ortak kaynak analizine dayanarak tam ${count} adet özgün, tekrarsız, sınav tekrarında gerçekten işe yarayan Türkçe çalışma kartı (flashcard) üret.${multiRule}${priorityRule}${avoidRule}${
    options?.generationNonce ? `\nOTURUM: ${options.generationNonce}` : ''
  }${digestHint}
KESİN KURALLAR:
1. Sadece bu ders notunda yer alan gerçek dersin kavram, tanım, teori, formül, karşılaştırma ve mekanizmalarını kullan; başka bir dersin bilgilerini ASLA ekleme.
2. Belgenin başından sonuna tüm önemli başlıkları kapsa; aynı kavramı iki kartta tekrarlama.
3. Ön yüz (front) net, kesintisiz ("..." olmadan) bir soru veya kavram olsun; arka yüz (back) sade, doğru ve kaynakla birebir uyumlu bir cevap olsun.
YANITINI YALNIZCA GEÇERLİ JSON OLARAK DÖNDÜR:
{
  "cards": [
    {
      "front": "Net soru veya kavram?",
      "back": "Anlaşılır, doğru ve net cevap.",
      "hint": "Kısa hatırlatıcı ipucu",
      "topic": "Nottaki ilgili başlık",
      "sourceSection": "Belgedeki başlık",
      "sourcePage": "Sayfa/Slayt (varsa)",
      "difficulty": "easy | medium | hard"
    }
  ]
}`;
}

function buildStrictVideoPrompt(
  courseOrDisciplineLabel: string,
  customPrompt?: string,
  bundle?: ProcessedStudyBundle,
  options?: {
    partIndex?: number;
    totalParts?: number;
    sceneRangeHint?: string;
  },
): string {
  const lockedTheme = resolveVideoThemeForCourse(
    courseOrDisciplineLabel,
    bundle?.title || '',
    bundle?.combinedText || '',
  );
  const extra = customPrompt?.trim() ? `\nÖğrencinin özel isteği: ${customPrompt.trim()}` : '';
  const multiRule =
    bundle?.isMultiCourse && bundle.sourceCourses?.length
      ? `\nÇOKLU DERS İZOLASYONU: Farklı derslerin (${bundle.sourceCourses.join(', ')}) sahnelerini ayrı tut ve her sahne başlığında [Ders Adı] belirt.`
      : '';
  const partRule =
    options?.totalParts && options.totalParts > 1
      ? `\nPARÇALI BELGE AKIŞI (${(options.partIndex ?? 0) + 1}/${options.totalParts}. BÖLÜM): Bu parça ders notunun sıralı bir bölümüdür. Sadece bu parçadaki başlıkları sırasıyla ve atlamadan ${
          options.sceneRangeHint || '2-3'
        } sahne halinde işle.`
      : `\nTAM BELGE AKIŞI: Belgenin başından sonuna tüm ana ve alt başlıkları mantıklı öğrenme sırasıyla (${
          options?.sceneRangeHint || '5-8'
        } sahne) kapsa; rastgele konu atlama veya yüzeysel geçiştirme yapma.`;
  const warningRule =
    bundle?.extractionWarnings && bundle.extractionWarnings.length > 0
      ? `\nEKSİK/OKUNAMAYAN SAYFA BİLGİSİ: ${bundle.extractionWarnings.join(' | ')}`
      : '';
  const digestHint = bundle?.canonicalAnalysisDigest
    ? `\nORTAK KAYNAK ANALİZİ (ÖZET VE SINAVLA %100 AYNI KAPSAM):\n${bundle.canonicalAnalysisDigest.slice(0, 3_000)}`
    : '';
  const curveChartRule =
    lockedTheme === 'economics'
      ? `4. GÖRSEL ŞEMA TİPİ: 'visual', 'table', 'comparison', 'timeline', 'scenario', 'structure', 'network', 'shapes' türlerini içeriğe uygun seç. 'curve' türünü YALNIZCA sahnede gerçekten arz-talep/para piyasası/faiz/eğri dengesi anlatılıyorsa, 'chart' türünü YALNIZCA sayısal oran/karşılaştırma varsa kullan.`
      : `4. GÖRSEL ŞEMA TİPİ: Bu dersin alanı '${lockedTheme}' olduğundan ekonomik arz-talep eğrisi ('curve') ASLA kullanma. Yalnızca içeriğe uygun şemalar seç: 'visual', 'table', 'comparison', 'timeline', 'scenario', 'structure', 'network', 'shapes'${
          lockedTheme === 'science' || lockedTheme === 'engineering'
            ? " (ve yalnızca gerçek sayısal veri/dağılım varsa 'chart')"
            : ''
        }.`;

  return `Görev: Yüklenen ders notundan ve ortak kaynak analizinden Dr. Deniz (anlatıcı akademisyen) ile Barış (soru soran öğrenci) arasında geçen, ekranda net okunabilir, ses-görsel-altyazı tam uyumlu ve %100 kaynağa sadık Türkçe Video Ders JSON'u üret.${partRule}${extra}${multiRule}${warningRule}${digestHint}
KESİN KURALLAR:
1. %100 KAYNAK VE DERS SADAKATİ: Yalnızca yüklenen ders notundaki gerçek kavram, teori, model, formül, tablo ve örnekleri anlat. Kaynakta bulunmayan veya başka bir derse ait terimleri ASLA ekleme. Klişe giriş/dolgu cümlelerini ("Merhaba arkadaşlar", "Akıllı tahtamızda", "Harika bir soru") KESİNLİKLE yazma.
2. SES–GÖRSEL–ALTYAZI BİREBİR UYUMU: Her sahnedeki "diagramData.nodes" kartlarında yer alan 3-4 kavram, o sahnenin "turns" konuşmalarında BİZZAT anlatılan ve açıklanan kavramlarla birebir aynı olmalıdır. Ekranda konuşulmayan başlık veya kavram gösterilmemelidir.
3. YÜKSEK OKUNABİLİRLİK: Her sahnenin "diagramData.nodes" dizisinde 3-4 net kart üret. "label" en fazla 34 karakter (üç nokta "..." olmadan), "subtext" en fazla 125 karakterlik tam ve sade cümle olsun.
${curveChartRule}
5. KİLİTLİ GÖRSEL TEMA: Tüm sahnelerde "visualTheme" değeri kesinlikle "${lockedTheme}" olsun (Tespit edilen ders: ${courseOrDisciplineLabel}).
6. HER SAHNEDE DERİN VE DENGELİ ANLATIM: Dr. Deniz'in açıklamaları öğretici, kavramlar arası bağlantıyı ve gerekiyorsa kaynaktaki formülü/örneği net biçimde veren 45-85 kelimelik tam cümleler olsun.
YANITINI YALNIZCA GEÇERLİ JSON OLARAK DÖNDÜR:
{
  "videoTitle": "Yüklenen ders notunun gerçek ve net başlığı",
  "outline": "2-3 cümlelik doğrudan ders notuna sadık genel özet",
  "keyFacts": ["Ders notundan net çıkarım 1", "Çıkarım 2", "Çıkarım 3"],
  "scenes": [
    {
      "title": "Nottaki gerçek bölüm/konu başlığı",
      "turns": [
        { "speaker": "Deniz", "text": "Nottaki kavramı, teoriyi veya mekanizmayı net akademik dille açıkla..." },
        { "speaker": "Barış", "text": "Deniz hocam, bu mekanizmanın temel koşulu veya ayırt edici sonucu nedir?" },
        { "speaker": "Deniz", "text": "Nottaki gerçek mekanizma, formül, tablo veya örnekle net yanıt..." }
      ],
      "diagramData": {
        "diagramType": "visual",
        "visualTheme": "${lockedTheme}",
        "mainTitle": "Slayt başlığı",
        "highlightMetric": "Nottaki en kritik sınav çıkarımı",
        "nodes": [
          { "label": "Sahnede Anlatılan Kavram 1", "subtext": "Kısa, net ve ekranda kolayca okunabilir açıklama.", "badge": "Temel Kavram" },
          { "label": "Sahnede Anlatılan Kavram 2", "subtext": "İkinci bileşenin işleyişi veya ayırt edici yönü.", "badge": "Mekanizma" },
          { "label": "Sahnede Anlatılan Kavram 3", "subtext": "Üçüncü unsur, koşul veya sonuç.", "badge": "Sonuç" }
        ]
      },
      "keyTakeaways": ["Net çıkarım 1", "Net çıkarım 2", "Net çıkarım 3"],
      "keyTerms": [{ "term": "Nottaki terim", "definition": "Kısa ve net tanım" }],
      "examTip": "Bu konuya özgü gerçek sınav ipucu veya kavram ayrımı"
    }
  ],
  "matchingPairs": [{ "term": "Nottaki terim", "definition": "Kısa tanım" }],
  "examQuestions": [
    { "question": "Nottan tek doğru cevaplı net soru?", "options": ["Şık A", "Şık B", "Şık C", "Şık D"], "correctIndex": 1, "explanation": "Nottaki dayanağıyla net açıklama.", "difficulty": "medium" }
  ]
}`;
}

function sanitizeAiSummarySections(raw: unknown): SummarySection[] {
  if (!Array.isArray(raw)) return [];
  const cleaned: SummarySection[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const heading = String(rec.heading || rec.title || '').trim();
    const content = String(rec.content || '').trim();
    if (!heading || content.length < 30) continue;
    cleaned.push({
      index: cleaned.length,
      heading,
      pageRange: rec.pageRange ? String(rec.pageRange).trim() : undefined,
      content,
      takeaways: Array.isArray(rec.takeaways)
        ? rec.takeaways.map(String).map((s) => s.trim()).filter(Boolean).slice(0, 5)
        : [],
      commonPitfalls: Array.isArray(rec.commonPitfalls)
        ? rec.commonPitfalls.map(String).map((s) => s.trim()).filter(Boolean).slice(0, 3)
        : undefined,
      deepResearchNote: rec.deepResearchNote ? String(rec.deepResearchNote).trim() : undefined,
    });
  }
  return cleaned;
}

function splitNoteIntoSequentialChunks(text: string, maxChunkChars: number, maxChunks: number): string[] {
  const clean = text.trim();
  if (clean.length <= maxChunkChars) return [clean];
  const targetChunks = Math.min(maxChunks, Math.max(2, Math.ceil(clean.length / maxChunkChars)));
  const chunkSize = Math.ceil(clean.length / targetChunks);
  const chunks: string[] = [];
  let cursor = 0;

  for (let i = 0; i < targetChunks && cursor < clean.length; i++) {
    if (i === targetChunks - 1) {
      chunks.push(clean.slice(cursor).trim());
      break;
    }
    let end = Math.min(clean.length, cursor + chunkSize);
    const paraBreak = clean.lastIndexOf('\n\n', end);
    if (paraBreak > cursor + Math.floor(chunkSize * 0.6)) {
      end = paraBreak;
    } else {
      const lineBreak = clean.lastIndexOf('\n', end);
      if (lineBreak > cursor + Math.floor(chunkSize * 0.6)) {
        end = lineBreak;
      }
    }
    const piece = clean.slice(cursor, end).trim();
    if (piece.length > 0) chunks.push(piece);
    cursor = end;
  }

  return chunks.filter((c) => c.length > 40);
}

/**
 * Tier-1.5 ChatGPT-Style Multi-Page Summary Synthesizer via live server AI (`academic-assistant` / `study-coach`).
 * Reads the entire uploaded lecture note (single pass <= 32k chars, or 2-4 sequential contiguous chunks for huge PDFs)
 * and produces fluent, clean, 100% source-faithful summaries with zero off-topic invention.
 */
async function buildSummaryFromLiveAi(
  bundle: ProcessedStudyBundle,
  settings: StudioGenerationSettings,
  domain: ReturnType<typeof classifyStudyDomain>,
  fullOutlineHint: string[],
  onProgress?: ProgressCallback,
): Promise<OrchestrationResult | null> {
  const largeBundle = isLargeStudyBundle(bundle) || settings.examMode === 'large_note';
  const courseLabel =
    bundle.course?.trim() ||
    bundle.detectedCourse?.trim() ||
    domain.detectedCourse ||
    bundle.title;

  const sourceCourseBreakdown = bundle.sources.map((s) => ({
    sourceName: s.name,
    course: s.course || s.detectedCourse || courseLabel,
    pagesOrSlides: s.pagesOrSlides,
  }));

  // Case A: Short/medium notes (<= 22k chars, ~1-12 pages) -> ONE cohesive deep multi-section pass
  if (bundle.combinedText.length <= 22_000) {
    onProgress?.(45, 'Ders notu baştan sona incelenip kapsamlı özet yazılıyor...');
    const taskPrompt = buildChatGptStyleSummaryPrompt(
      bundle,
      settings,
      courseLabel,
      fullOutlineHint,
    );
    const liveRes = await invokeLiveServerAiText({
      materialType: 'summary',
      title: bundle.title,
      course: courseLabel,
      noteContext: bundle.combinedText,
      taskPrompt,
      preferPro: true,
      images: bundle.images,
    });
    if (!liveRes) return null;

    const parsed = extractJsonLoose(liveRes.text);
    const jsonSections = sanitizeAiSummarySections(parsed?.sections);
    if (parsed && jsonSections.length > 0) {
      const overview =
        String(parsed.overview || '').trim() ||
        `${bundle.title} ders notu ${jsonSections.length} ana başlık altında ayrıntılı biçimde özetlenmiştir.`;
      const keyPoints = Array.isArray(parsed.keyPoints)
        ? parsed.keyPoints.map(String).filter(Boolean).slice(0, 12)
        : jsonSections.map((s) => `**${s.heading}**`).slice(0, 8);
      const keyTerms = Array.isArray(parsed.keyTerms)
        ? (parsed.keyTerms as SummaryContent['keyTerms'])
        : [];
      const teacherEmphasis = Array.isArray(parsed.teacherEmphasis)
        ? (parsed.teacherEmphasis as SummaryContent['teacherEmphasis'])
        : [];
      const disciplineTag = String(parsed.disciplineTag || courseLabel);
      const extractionNotices = Array.from(
        new Set([
          ...(bundle.extractionWarnings || []),
          ...(Array.isArray(parsed.extractionNotices)
            ? parsed.extractionNotices.map(String).filter(Boolean)
            : []),
        ]),
      );

      onProgress?.(94, 'Özet ve sınav öncelik rehberi düzenleniyor...');
      const summary: SummaryContent = {
        overview,
        disciplineTag,
        keyPoints,
        sections: jsonSections,
        teacherEmphasis,
        comparativeMatrix: parsed.comparativeMatrix as SummaryContent['comparativeMatrix'],
        keyTerms,
        extractionNotices: extractionNotices.length > 0 ? extractionNotices : undefined,
        sourceCourseBreakdown,
        studyChecklist: Array.isArray(parsed.studyChecklist)
          ? parsed.studyChecklist.map(String).filter(Boolean)
          : [],
        studyPriorityMap: normalizePriorityMap(
          parsed.studyPriorityMap,
          jsonSections,
          keyTerms,
          teacherEmphasis,
          overview,
          disciplineTag,
        ),
        metadata: {
          sourceMode: 'ai',
          deepResearch: settings.deepResearch,
          summaryDepth: settings.summaryDepth,
          examMode: settings.examMode,
          faculty: settings.faculty,
          isLargeBundle: largeBundle,
          sourceFingerprint: bundle.sourceFingerprint,
          analyzedCourses: bundle.sourceCourses,
          isMultiCourse: bundle.isMultiCourse,
          sourceStats: {
            sourceCount: bundle.sourceCount,
            wordCount: bundle.totalWords,
            pagesOrSlides: bundle.totalPagesOrSlides,
            sectionCount: jsonSections.length,
          },
        },
      };
      return { content: summary, model: liveRes.model, sourceMode: 'ai' };
    }

    // Fallback parser if the AI responded in natural Markdown instead of JSON
    const mdSummary = parseMarkdownSummaryToSections(liveRes.text, bundle.title, courseLabel);
    if (mdSummary && mdSummary.sections.length > 0) {
      onProgress?.(94, 'Özet düzenleniyor...');
      return {
        content: {
          ...mdSummary,
          extractionNotices: bundle.extractionWarnings?.length ? bundle.extractionWarnings : undefined,
          sourceCourseBreakdown,
          metadata: {
            sourceMode: 'ai',
            deepResearch: settings.deepResearch,
            summaryDepth: settings.summaryDepth,
            examMode: settings.examMode,
            faculty: settings.faculty,
            isLargeBundle: largeBundle,
            sourceFingerprint: bundle.sourceFingerprint,
            analyzedCourses: bundle.sourceCourses,
            isMultiCourse: bundle.isMultiCourse,
            sourceStats: {
              sourceCount: bundle.sourceCount,
              wordCount: bundle.totalWords,
              pagesOrSlides: bundle.totalPagesOrSlides,
              sectionCount: mdSummary.sections.length,
            },
          },
        },
        model: liveRes.model,
        sourceMode: 'ai',
      };
    }

    return null;
  }

  // Case B: Long multi-page PDF / PowerPoint (> 22k chars) -> up to 8 sequential contiguous passes covering 100% of pages!
  const chunks = splitNoteIntoSequentialChunks(bundle.combinedText, 24_000, 8);
  const allSections: SummarySection[] = [];
  const allKeyPoints: string[] = [];
  const allKeyTerms: NonNullable<SummaryContent['keyTerms']> = [];
  const allEmphasis: NonNullable<SummaryContent['teacherEmphasis']> = [];
  const allChecklists: string[] = [];
  const overviewParts: string[] = [];
  let usedModel = 'EconNotes Akademik AI';

  for (let c = 0; c < chunks.length; c++) {
    const pct = Math.min(90, Math.round(28 + ((c + 1) / chunks.length) * 60));
    onProgress?.(pct, `Kapsamlı ders notu baştan sona özetleniyor (${c + 1}/${chunks.length}. kısım)...`);

    const chunkPrompt = `Görev: Aşağıda kapsamlı bir ders materyalinin ${c + 1}/${chunks.length}. kısmı yer alıyor. Bu kısımdaki TÜM sayfaları/slaytları, ana ve alt başlıkları (####), tanımları, teorileri, modelleri, formülleri ($...$ / $$...$$ ve değişken açıklamalarıyla), grafikleri, tabloları ve örnekleri ATLAMADAN ayrıntılı ve anlaşılır Türkçe Markdown ile özetle.
KESİN KURALLAR:
1. YALNIZCA bu kısımdaki gerçek dersin konularını, kavramlarını ve örneklerini anlat. Başka bir dersin bilgilerini veya kaynakta olmayan teorileri ASLA ekleme. Ek pedagojik açıklama gerekirse **[Ek Açıklama]** etiketiyle ayır.${
      bundle.isMultiCourse && bundle.sourceCourses?.length
        ? `\n2. ÇOKLU DERS: Farklı dersler (${bundle.sourceCourses.join(', ')}) varsa bölüm başlıklarında [Ders Adı] etiketini koru ve dersleri birbirine karıştırma.`
        : ''
    }
3. Bu kısım için 3-4 kapsamlı, sınava hazırlayıcı bölüm (her biri 350-580 kelime) yaz.${
      settings.customPrompt?.trim() ? `\nÖğrencinin özel isteği: ${settings.customPrompt.trim()}` : ''
    }
YANITINI YALNIZCA GEÇERLİ JSON OLARAK DÖNDÜR:
{
  "overview": "Bu kısmın 2-3 cümlelik net özeti",
  "keyPoints": ["Bu kısımdan 3-4 ana nokta"],
  "sections": [
    {
      "index": 0,
      "heading": "Nottaki gerçek konu başlığı",
      "pageRange": "Varsa sayfa/slayt",
      "content": "Alt başlıklı (####), ayrıntılı, formül/tablo/örnek/bağlantı içeren 350-580 kelimelik Markdown özet...",
      "takeaways": ["Net çıkarım 1", "Net çıkarım 2", "Net çıkarım 3"],
      "commonPitfalls": ["Varsa sınavda karıştırılabilecek nokta"]
    }
  ],
  "teacherEmphasis": [{ "point": "Önemli sınav ayrıntısı", "whyImportant": "Neden önemli", "examProbability": "Yüksek" }],
  "keyTerms": [{ "term": "Nottaki terim", "definition": "Net ve ayrıntılı tanım", "formula": "" }],
  "studyChecklist": ["Öğrenme hedefi"]
}`;

    const liveRes = await invokeLiveServerAiText({
      materialType: 'summary',
      title: `${bundle.title} (${c + 1}/${chunks.length})`,
      course: courseLabel,
      noteContext: chunks[c],
      taskPrompt: chunkPrompt,
      preferPro: true,
      images: c === 0 ? bundle.images : undefined,
    });
    if (!liveRes) continue;
    usedModel = liveRes.model;

    const parsed = extractJsonLoose(liveRes.text);
    const chunkSections = sanitizeAiSummarySections(parsed?.sections);
    if (parsed && chunkSections.length > 0) {
      if (typeof parsed.overview === 'string' && parsed.overview.trim()) {
        overviewParts.push(parsed.overview.trim());
      }
      for (const sec of chunkSections) {
        allSections.push({ ...sec, index: allSections.length });
      }
      if (Array.isArray(parsed.keyPoints)) {
        for (const kp of parsed.keyPoints) {
          const s = String(kp || '').trim();
          if (s && !allKeyPoints.includes(s)) allKeyPoints.push(s);
        }
      }
      if (Array.isArray(parsed.keyTerms)) {
        for (const kt of parsed.keyTerms) {
          if (kt && typeof kt === 'object') {
            const rec = kt as Record<string, unknown>;
            const term = String(rec.term || '').trim();
            const definition = String(rec.definition || '').trim();
            if (term && definition && !allKeyTerms.some((x) => x.term.toLowerCase() === term.toLowerCase())) {
              allKeyTerms.push({
                term,
                definition,
                formula: rec.formula ? String(rec.formula).trim() : undefined,
              });
            }
          }
        }
      }
      if (Array.isArray(parsed.teacherEmphasis)) {
        for (const te of parsed.teacherEmphasis) {
          if (te && typeof te === 'object') {
            const rec = te as Record<string, unknown>;
            const point = String(rec.point || '').trim();
            if (point) {
              allEmphasis.push({
                point,
                whyImportant: String(rec.whyImportant || '').trim(),
                examProbability: String(rec.examProbability || 'Yüksek'),
              });
            }
          }
        }
      }
      if (Array.isArray(parsed.studyChecklist)) {
        for (const cl of parsed.studyChecklist) {
          const s = String(cl || '').trim();
          if (s) allChecklists.push(s);
        }
      }
    } else {
      const mdPart = parseMarkdownSummaryToSections(liveRes.text, bundle.title, domain.discipline);
      if (mdPart && mdPart.sections.length > 0) {
        if (mdPart.overview) overviewParts.push(mdPart.overview);
        for (const sec of mdPart.sections) {
          allSections.push({ ...sec, index: allSections.length });
        }
      }
    }
  }

  if (allSections.length === 0) return null;

  onProgress?.(95, 'Tüm bölümler ve sınav öncelik haritası birleştiriliyor...');
  const finalOverview =
    overviewParts.slice(0, 2).join('\n\n') ||
    `${bundle.title} ders notu ${allSections.length} ana başlık altında baştan sona eksiksiz özetlenmiştir.`;
  const finalKeyPoints =
    allKeyPoints.length > 0
      ? allKeyPoints.slice(0, 10)
      : allSections.map((s) => `**${s.heading}**`).slice(0, 8);

  const summary: SummaryContent = {
    overview: finalOverview,
    disciplineTag: courseLabel,
    keyPoints: finalKeyPoints,
    sections: allSections,
    teacherEmphasis: allEmphasis.slice(0, 10),
    keyTerms: allKeyTerms.slice(0, 28),
    extractionNotices: bundle.extractionWarnings?.length ? bundle.extractionWarnings : undefined,
    sourceCourseBreakdown,
    studyChecklist: allChecklists.slice(0, 10),
    studyPriorityMap: normalizePriorityMap(
      undefined,
      allSections,
      allKeyTerms,
      allEmphasis,
      finalOverview,
      courseLabel,
    ),
    metadata: {
      sourceMode: 'ai',
      deepResearch: settings.deepResearch,
      summaryDepth: settings.summaryDepth,
      examMode: settings.examMode,
      faculty: settings.faculty,
      isLargeBundle: largeBundle,
      sourceFingerprint: bundle.sourceFingerprint,
      analyzedCourses: bundle.sourceCourses,
      isMultiCourse: bundle.isMultiCourse,
      sourceStats: {
        sourceCount: bundle.sourceCount,
        wordCount: bundle.totalWords,
        pagesOrSlides: bundle.totalPagesOrSlides,
        sectionCount: allSections.length,
      },
    },
  };

  return { content: summary, model: usedModel, sourceMode: 'ai' };
}

async function postPublicJsonAttempt(
  systemPrompt: string,
  userPrompt: string,
  useResponseFormat: boolean,
  temperature = 0.28,
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
      temperature,
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
  temperature = 0.28,
): Promise<Record<string, unknown> | null> {
  const first = await postPublicJsonAttempt(systemPrompt, userPrompt, true, temperature);
  if (first) return first;
  // Bazı genel uç noktalar response_format: json_object ile 400 döndürür; kısıtsız JSON istemiyle tekrar dene
  return postPublicJsonAttempt(
    `${systemPrompt}\n\nKRİTİK: Yalnızca ham JSON nesnesi ({...}) döndür, ek sohbet veya markdown açıklaması yazma.`,
    userPrompt,
    false,
    temperature,
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

function sectionsLackStructure(sections: SummarySection[]): boolean {
  if (!sections.length) return true;
  const structuredCount = sections.filter((s) => {
    const c = String(s.content || '');
    return /^#{2,4}\s+/m.test(c) && (/\n[-*]\s+/.test(c) || /\|[^|\n]+\|/.test(c));
  }).length;
  return structuredCount < Math.ceil(sections.length / 2);
}

function getDomainSummaryDirective(domainMode: AcademicDomainMode, examStyleHint?: string): string {
  const facultyHint = examStyleHint ? `\nFAKÜLTE / ALAN ODAĞI: ${examStyleHint}` : '';
  if (domainMode === 'verbal') {
    return `SÖZEL / KURAMSAL & SOSYAL BİLİMLER ANLATIM STANDARDI:${facultyHint}
- KESİN KAYNAK SADAKATİ: Yalnızca yüklenen ders notundaki konulara, kavramlara ve örneklere odaklan; not dışından başka bir dersin veya alanın kavramlarını kesinlikle ekleme.
- ASLA uydurma matematiksel formül veya yapay sembol ekleme ($...$ / $$...$$ yalnız metinde gerçekten denklem varsa kullan).
- Her bölümü akıcı, sade, birkaç sayfalık temiz bir ders özeti okur gibi anlaşılır Markdown ile yaz (alt başlıklar ####, akıcı paragraflar, madde listeleri; yalnızca metinde gerçek karşılaştırma varsa kısa Markdown tablosu).`;
  }
  return `ANALİTİK / UYGULAMALI DERS ANLATIM STANDARDI:${facultyHint}
- KESİN KAYNAK SADAKATİ: Yalnızca yüklenen ders notunun gerçek terminolojisine ve içeriğine sadık kal; konu dışı alakasız bölüm örnekleri veya uydurma veriler kesinlikle ekleme.
- Her bölümü sade, anlaşılır ve akıcı Markdown ile yaz (alt başlıklar ####, adım adım açıklamalar, yalnızca notta geçiyorsa formüller $...$ / $$...$$ ve varsa kısa karşılaştırma tablosu).`;
}

function getExamModeDirective(examMode?: StudioGenerationSettings['examMode']): string {
  if (examMode === 'cram_24h') {
    return 'SINAV MODU — SON 24 SAAT ACİL KURTARMA: Sınavda çıkma olasılığı en yüksek çekirdek kavramları, kritik ayrımları, sık yapılan tuzakları ve hızlı hatırlama tablolarını öne çıkar. Gereksiz uzatmalardan kaçın.';
  }
  if (examMode === 'large_note') {
    return 'SINAV MODU — KALIN / ÇOKLU DERS NOTU TAM KAPSAM: Kullanıcının yüklediği kapsamlı/çok sayfalı notun başından sonuna TEK BİR ÜNİTEYİ BİLE ATLAMADAN tüm önemli detayları bölüm bölüm eksiksiz özetle ve mutlaka "studyPriorityMap" ile hangi konulara öncelik vermesi gerektiğini derecelendir.';
  }
  if (examMode === 'deep_mastery') {
    return 'SINAV MODU — DERİN KAVRAMA (FEYNMAN): Karmaşık kavramları adım adım sadeleştirip somut vaka örnekleriyle kalıcı öğrenme sağla.';
  }
  return 'SINAV MODU — VİZE/FİNAL TAM KAPSAM: Tüm önemli ayrıntıları sistematik biçimde özetle, sınavda çıkabilecek noktaları işaretle ve "studyPriorityMap" ile öncelikli çalışma sırası sun.';
}

function normalizePriorityMap(
  raw: unknown,
  sections: SummarySection[],
  keyTerms?: SummaryContent['keyTerms'],
  teacherEmphasis?: SummaryContent['teacherEmphasis'],
  overview?: string,
  disciplineTag?: string,
): StudyTopicPriorityItem[] {
  if (Array.isArray(raw) && raw.length >= 2) {
    const cleaned: StudyTopicPriorityItem[] = [];
    for (const item of raw) {
      if (!item || typeof item !== 'object') continue;
      const rec = item as Record<string, unknown>;
      const topic = String(rec.topic || '').trim();
      if (!topic) continue;
      const rawPri = String(rec.priority || '').toLowerCase();
      const priority: StudyTopicPriorityItem['priority'] =
        rawPri === 'critical' || rawPri.includes('kritik') || rawPri.includes('yüksek')
          ? 'critical'
          : rawPri === 'review' || rawPri.includes('göz') || rawPri.includes('düşük')
          ? 'review'
          : 'important';
      const secIdx =
        typeof rec.sectionIndex === 'number' && rec.sectionIndex >= 0 && rec.sectionIndex < sections.length
          ? rec.sectionIndex
          : sections.findIndex((s) =>
              s.heading.toLocaleLowerCase('tr-TR').includes(topic.toLocaleLowerCase('tr-TR').slice(0, 14)),
            );
      cleaned.push({
        topic,
        priority,
        reason: String(rec.reason || 'Sınav kapsamı ve temel kavram bağlantısı nedeniyle önceliklidir.').trim(),
        estimatedMinutes: Math.max(3, Math.min(25, Number(rec.estimatedMinutes) || 8)),
        focusConcepts: Array.isArray(rec.focusConcepts)
          ? rec.focusConcepts.map(String).filter(Boolean).slice(0, 4)
          : [],
        likelyQuestionType: rec.likelyQuestionType ? String(rec.likelyQuestionType) : undefined,
        sectionIndex: secIdx >= 0 ? secIdx : undefined,
      });
    }
    if (cleaned.length >= 2) return cleaned;
  }
  return buildTopicPriorityGuide({
    sections,
    keyTerms,
    teacherEmphasis,
    overview,
    disciplineTag,
  });
}

function buildSectionExpansionSystemPrompt(
  settings: StudioGenerationSettings,
  domainMode: AcademicDomainMode = 'hybrid',
  examStyleHint?: string,
): string {
  const wordsTarget =
    settings.summaryDepth === 'short'
      ? '180-260'
      : settings.summaryDepth === 'textbook'
      ? '380-540'
      : settings.summaryDepth === 'comprehensive'
      ? '320-460'
      : '250-350';
  const domainDirective = getDomainSummaryDirective(domainMode, examStyleHint);
  const examDirective = getExamModeDirective(settings.examMode);
  return `Sen seçkin bir üniversite kürsü profesörüsün. Sana verilen ders bölümü taslağını ve kaynak metin kesitini kullanarak derin, akıcı, akademik ders kitabı düzeyinde Türkçe özet bölümleri yaz.
${domainDirective}
${examDirective}
${settings.deepResearch ? 'Derin Araştırma aktif: teorik arka plan, literatür bağlamı ve güncel uygulama örneğini "deepResearchNote" alanında sun.' : ''}
Kurallar:
- Her bölüm ${wordsTarget} kelime civarında eksiksiz Markdown prose olsun.
- Kopya/yüzeysel cümle dizimi, konu dışı bilgi veya genel şablon klişeler asla kullanma; kaynak metindeki kavramları sebep-sonuç zinciriyle, net başlıklar ve karşılaştırmalarla sentezle.
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
      "commonPitfalls": ["Sınavda en sık karıştırılan kavram veya tuzak"],
      "checkpointQuestion": { "question": "Soru?", "options": ["A","B","C","D"], "correctIndex": 0, "explanation": "Açıklama" }
    }
  ]
}`;
}

async function generatePublicMapReduceSummary(
  bundle: ProcessedStudyBundle,
  settings: StudioGenerationSettings,
  domainMode: AcademicDomainMode,
  examStyleHint: string,
  onProgress?: ProgressCallback,
): Promise<SummaryContent | null> {
  const largeBundle = isLargeStudyBundle(bundle) || settings.examMode === 'large_note';
  const targetCount =
    settings.summaryDepth === 'short'
      ? 4
      : settings.summaryDepth === 'textbook'
      ? largeBundle
        ? 11
        : 8
      : settings.summaryDepth === 'comprehensive'
      ? largeBundle
        ? 10
        : 7
      : largeBundle
      ? 8
      : 6;

  const fullOutlineAnchors = extractFullDocumentOutline(bundle.combinedText, 24);
  const outlineMapText =
    fullOutlineAnchors.length > 0
      ? `\nDOKÜMANIN TAM BAŞLIK HARİTASI (BAŞTAN SONA HİÇBİR ÜNİTEYİ ATLAMA):\n${fullOutlineAnchors
          .map((a, i) => `${i + 1}. ${a.heading}${a.pageHint ? ` (${a.pageHint})` : ''}`)
          .join('\n')}\n`
      : '';

  onProgress?.(
    32,
    largeBundle
      ? `Büyük ders notu (${bundle.totalWords} kelime) baştan sona taranıyor ve öncelik haritası kuruluyor...`
      : 'Akademik ders planı ve kavram mimarisi çıkarılıyor...',
  );
  const bpSystem = `Sen seçkin bir üniversite profesörüsün. Verilen ders materyalinin TAMAMINI (ilk sayfadan son sayfaya kadar hiçbir önemli konuyu atlamadan) tarayarak ${targetCount} ana bölümlük kapsamlı bir özet mimarisi ve "Hangi Konulara Bakmalıyım?" sınav öncelik haritası oluştur.
${getDomainSummaryDirective(domainMode, examStyleHint)}
${getExamModeDirective(settings.examMode)}
YALNIZCA JSON döndür:
{
  "overview": "Konunun amacını, temel tezini ve büyük resmini anlatan 2 güçlü paragraf",
  "disciplineTag": "${bundle.detectedDiscipline}",
  "keyPoints": ["6-10 kapsamlı anahtar çıkarım"],
  "sectionsPlan": [
    { "index": 0, "title": "Net akademik bölüm başlığı", "pageRange": "", "focusPoints": ["Odak 1", "Odak 2", "Odak 3"] }
  ],
  "studyPriorityMap": [
    {
      "topic": "Bölüm / Konu adı",
      "priority": "critical | important | review",
      "reason": "Sınavda neden mutlaka bakılması veya pekiştirilmesi gerektiği (1-2 net cümle)",
      "estimatedMinutes": 10,
      "focusConcepts": ["Anahtar kavram 1", "Anahtar kavram 2"],
      "likelyQuestionType": "Karşılaştırma / Tanım / Uygulama / Vaka",
      "sectionIndex": 0
    }
  ],
  "teacherEmphasis": [{ "point": "Kritik kavram veya ayrım", "whyImportant": "Sınavda neden sorulur ve nasıl cevaplanmalı", "examProbability": "Yüksek" }],
  "comparativeMatrix": { "title": "Karşılaştırma Tablosu", "columns": ["Boyut", "Yaklaşım / Kavram A", "Yaklaşım / Kavram B"], "rows": [["...", "...", "..."], ["...", "...", "..."]] },
  "deepResearchTopics": [{ "topic": "İleri Okuma Başlığı", "literatureContext": "Kuramsal / akademik bağlam", "realWorldApplication": "Güncel veya uygulamalı örnek" }],
  "keyTerms": [{ "term": "Terim", "definition": "Tam tanım", "formula": "" }],
  "studyChecklist": ["Öğrenme hedefi 1", "Öğrenme hedefi 2"]
}`;
  const bpUser = `DERS: ${bundle.course || bundle.detectedDiscipline}\nBAŞLIK: ${bundle.title}\nKAYNAK İSTATİSTİĞİ: ${bundle.sourceCount} kaynak, ~${bundle.totalWords} kelime, ~${bundle.totalPagesOrSlides} sayfa/slayt\n${
    settings.customPrompt ? `ÖZEL İSTEK: ${settings.customPrompt}\n` : ''
  }${outlineMapText}\nKAYNAK ÖZETİ:\n${sampleUniformContext(bundle.combinedText, 13_500)}`;

  const bp = await invokePublicJsonFallback(bpSystem, bpUser);
  const rawPlan = Array.isArray(bp?.sectionsPlan)
    ? (bp.sectionsPlan as Array<{ index?: number; title?: string; pageRange?: string; focusPoints?: string[] }>)
    : [];

  if (rawPlan.length === 0) {
    // Plan çıkarılamazsa kompakt tek seferlik bulut sentezini dene
    const singlePrompt = buildPublicSummaryPrompt(bundle, settings, domainMode);
    const singleJson = await invokePublicJsonFallback(singlePrompt.system, singlePrompt.user);
    if (singleJson && Array.isArray(singleJson.sections) && singleJson.sections.length > 0) {
      const singleSections = singleJson.sections as SummarySection[];
      return {
        ...(singleJson as unknown as SummaryContent),
        disciplineTag: String(singleJson.disciplineTag || bundle.detectedDiscipline),
        studyPriorityMap: normalizePriorityMap(
          singleJson.studyPriorityMap,
          singleSections,
          singleJson.keyTerms as SummaryContent['keyTerms'],
          singleJson.teacherEmphasis as SummaryContent['teacherEmphasis'],
          String(singleJson.overview || ''),
          String(singleJson.disciplineTag || bundle.detectedDiscipline),
        ),
        metadata: {
          sourceMode: 'ai',
          deepResearch: settings.deepResearch,
          summaryDepth: settings.summaryDepth,
          examMode: settings.examMode,
          faculty: settings.faculty,
          isLargeBundle: largeBundle,
          sourceStats: {
            sourceCount: bundle.sourceCount,
            wordCount: bundle.totalWords,
            pagesOrSlides: bundle.totalPagesOrSlides,
            sectionCount: singleSections.length,
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

  const expandSys = buildSectionExpansionSystemPrompt(settings, domainMode, examStyleHint);
  const expandedSections: SummarySection[] = [];
  const batchSize = 2;

  for (let i = 0; i < normalizedPlan.length; i += batchSize) {
    const batch = normalizedPlan.slice(i, i + batchSize);
    const pct = Math.min(92, Math.round(45 + ((i + batch.length) / Math.max(1, normalizedPlan.length)) * 45));
    onProgress?.(pct, `Ders bölümleri ayrıntılarıyla yazılıyor (${i + 1}-${Math.min(i + batchSize, normalizedPlan.length)}/${normalizedPlan.length})...`);

    const batchPayload = batch.map((b) => ({
      index: b.index,
      heading: b.title,
      focusPoints: b.focusPoints,
      sourceExcerpt: sliceContextForSection(
        bundle.combinedText,
        b.title,
        b.index,
        normalizedPlan.length,
        b.focusPoints,
        largeBundle ? 5_200 : 4_200,
      ),
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
      if (matched && String(matched.content || '').trim().length > 60) {
        expandedSections.push({
          ...matched,
          index: b.index,
          heading: matched.heading || b.title,
          pageRange: matched.pageRange || b.pageRange,
        });
      } else {
        // Asla ham metin parçası basma — yapısal sözel/sayısal biçimlendirici ile düzenle
        expandedSections.push(
          formatSectionContentForFallback({
            index: b.index,
            heading: b.title,
            pageRange: b.pageRange,
            rawSlice: batchPayload[bi].sourceExcerpt,
            focusPoints: b.focusPoints,
            course: bundle.course || bundle.detectedDiscipline,
            title: bundle.title,
            deepResearch: settings.deepResearch,
          }),
        );
      }
    });
  }

  expandedSections.sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  const finalKeyTerms = Array.isArray(bp?.keyTerms) ? (bp.keyTerms as SummaryContent['keyTerms']) : [];
  const finalEmphasis = Array.isArray(bp?.teacherEmphasis) ? (bp.teacherEmphasis as SummaryContent['teacherEmphasis']) : [];
  const finalOverview = String(bp?.overview || `${bundle.title} çalışma özeti`);
  const finalDiscipline = String(bp?.disciplineTag || bundle.detectedDiscipline);

  return {
    overview: finalOverview,
    disciplineTag: finalDiscipline,
    keyPoints: Array.isArray(bp?.keyPoints) ? bp.keyPoints.map(String) : [],
    sections: expandedSections,
    teacherEmphasis: finalEmphasis,
    comparativeMatrix: bp?.comparativeMatrix as SummaryContent['comparativeMatrix'],
    deepResearchTopics: Array.isArray(bp?.deepResearchTopics)
      ? (bp.deepResearchTopics as SummaryContent['deepResearchTopics'])
      : [],
    keyTerms: finalKeyTerms,
    studyChecklist: Array.isArray(bp?.studyChecklist) ? bp.studyChecklist.map(String) : [],
    studyPriorityMap: normalizePriorityMap(
      bp?.studyPriorityMap,
      expandedSections,
      finalKeyTerms,
      finalEmphasis,
      finalOverview,
      finalDiscipline,
    ),
    metadata: {
      sourceMode: 'ai',
      deepResearch: settings.deepResearch,
      summaryDepth: settings.summaryDepth,
      examMode: settings.examMode,
      faculty: settings.faculty,
      isLargeBundle: largeBundle,
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
  domainMode: AcademicDomainMode = 'hybrid',
): { system: string; user: string } {
  const depthHint =
    settings.summaryDepth === 'short'
      ? '4 bölüm, bölüm başına 190-260 kelime'
      : settings.summaryDepth === 'textbook'
      ? '6-8 bölüm, bölüm başına 300-450 kelime, çok derin ders kitabı düzeyi'
      : '5-7 bölüm, bölüm başına 260-380 kelime, kapsamlı fakülte düzeyi';

  const domainDirective = getDomainSummaryDirective(domainMode);

  const system = `Sen üniversite ders notlarını sade, akıcı ve eksiksiz özetleyen akademik asistansın. YALNIZCA verilen ders notundaki gerçek konuları, kavramları ve örnekleri kullanarak anlaşılır Türkçe Çalışma Özeti üret.
${domainDirective}
${
  settings.deepResearch
    ? 'İsteğe bağlı ek akademik bağlam gerekiyorsa bunu yalnızca "deepResearchNote" alanında ve konuyla %100 ilgili biçimde kısaca belirt.'
    : 'Notta bulunmayan dış konu veya başka ders örneklerini KESİNLİKLE ekleme.'
}
Hedef uzunluk: ${depthHint}.
YALNIZCA geçerli JSON döndür:
{
  "overview": "2 paragraf yönetici özeti",
  "keyPoints": ["6-8 madde"],
  "sections": [{
    "heading": "Bölüm başlığı",
    "content": "Zengin Markdown + alt başlıklar + karşılaştırma tablosu + örnek metni",
    "takeaways": ["3 çıkarım"],
    "deepResearchNote": "Varsa derin akademik araştırma notu",
    "commonPitfalls": ["Sık karıştırılan kavram / sınav tuzağı"],
    "checkpointQuestion": { "question": "...", "options": ["A","B","C","D"], "correctIndex": 0, "explanation": "..." }
  }],
  "teacherEmphasis": [{ "point": "...", "whyImportant": "...", "examProbability": "Yüksek" }],
  "comparativeMatrix": { "title": "...", "columns": ["Boyut","Yaklaşım A","Yaklaşım B"], "rows": [["...","...","..."]] },
  "deepResearchTopics": [{ "topic": "...", "literatureContext": "...", "realWorldApplication": "..." }],
  "keyTerms": [{ "term": "...", "definition": "...", "formula": "" }],
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
  domainMode: AcademicDomainMode,
  onProgress?: ProgressCallback,
): Promise<SummaryContent> {
  const existing = Array.isArray(rawSummary.sections) ? rawSummary.sections : [];
  if (existing.length === 0) return rawSummary;

  const avgWords = averageSectionWords(existing);
  const needsDeepening =
    (settings.summaryDepth !== 'short' && (avgWords < 175 || sectionsLackStructure(existing))) ||
    (settings.deepResearch && !existing.some((s) => Boolean(s.deepResearchNote)));

  if (!needsDeepening || bundle.images.length > 0) {
    return rawSummary;
  }

  onProgress?.(68, 'Yapay zekâ özet bölümleri fakülte ders kitabı düzeyine derinleştiriliyor...');
  const expandSys = buildSectionExpansionSystemPrompt(settings, domainMode);
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
  const largeBundle = isLargeStudyBundle(bundle) || settings.examMode === 'large_note';
  onProgress?.(
    12,
    largeBundle
      ? `1/3 • Kapsamlı ders notu (~${bundle.totalWords} kelime) baştan sona taranıyor...`
      : '1/3 • Kaynak mimarisi ve ders haritası çıkarılıyor...',
  );
  const domain = classifyStudyDomain(bundle.combinedText, bundle.course, bundle.title, settings.faculty);
  const fullOutlineHint = extractFullDocumentOutline(bundle.combinedText, 32).map(
    (a) => `${a.heading}${a.pageHint ? ` (${a.pageHint})` : ''}`,
  );

  const resolvedCourse =
    bundle.course?.trim() ||
    bundle.detectedCourse?.trim() ||
    domain.detectedCourse ||
    bundle.title;

  const sourceCourseBreakdown = bundle.sources.map((s) => ({
    sourceName: s.name,
    course: s.course || s.detectedCourse || resolvedCourse,
    pagesOrSlides: s.pagesOrSlides,
  }));

  const commonReq = {
    noteTitle: bundle.title,
    course: resolvedCourse,
    faculty: settings.faculty && settings.faculty !== 'auto' ? domain.discipline : undefined,
    examMode: settings.examMode || undefined,
    fullOutlineHint: fullOutlineHint.length > 0 ? fullOutlineHint : undefined,
    isMultiCourse: bundle.isMultiCourse || undefined,
    sourceCourses: bundle.sourceCourses?.length ? bundle.sourceCourses : undefined,
    canonicalAnalysisDigest: bundle.canonicalAnalysisDigest || undefined,
    extractionWarnings: bundle.extractionWarnings?.length ? bundle.extractionWarnings : undefined,
    summaryDepth: settings.summaryDepth,
    deepResearch: settings.deepResearch,
    pedagogicalStyle: settings.pedagogicalStyle,
    customPrompt: settings.customPrompt || undefined,
    examFocus: settings.examFocus || undefined,
  };

  // Tier-1A: Single cohesive deep pass on `generate-study-material` ONLY for compact notes <= 18k chars
  let needsMapReduceFallback = largeBundle || bundle.combinedText.length > 18_000;
  if (!needsMapReduceFallback) {
    onProgress?.(32, '1/2 • Ders notu baştan sona incelenip kapsamlı özet oluşturuluyor...');
    const singleEdge = await invokeEdgeGenerate({
      ...commonReq,
      materialType: 'summary',
      stage: 'single',
      noteContext: bundle.combinedText,
      images: bundle.images.length > 0 ? bundle.images : undefined,
      audio: bundle.audio,
    });
    if (singleEdge && singleEdge.sourceMode === 'ai') {
      const secs = sanitizeAiSummarySections(singleEdge.content?.sections);
      // Quality gate: reject superficial few-paragraph summaries on substantial notes
      const isSubstantialNote = bundle.totalWords >= 800 || bundle.totalPagesOrSlides >= 4;
      const avgWords = averageSectionWords(secs);
      const isSuperficial =
        isSubstantialNote &&
        settings.summaryDepth !== 'short' &&
        (secs.length < 3 || avgWords < 165);

      if (secs.length > 0 && !isSuperficial) {
        const mergedNotices = Array.from(
          new Set([
            ...(bundle.extractionWarnings || []),
            ...(Array.isArray(singleEdge.content?.extractionNotices)
              ? singleEdge.content.extractionNotices.map(String).filter(Boolean)
              : []),
          ]),
        );
        return {
          content: {
            ...singleEdge.content,
            sections: secs,
            disciplineTag: singleEdge.content?.disciplineTag || resolvedCourse,
            extractionNotices: mergedNotices.length > 0 ? mergedNotices : undefined,
            sourceCourseBreakdown,
            studyPriorityMap: normalizePriorityMap(
              singleEdge.content?.studyPriorityMap,
              secs,
              singleEdge.content?.keyTerms,
              singleEdge.content?.teacherEmphasis,
              singleEdge.content?.overview,
              singleEdge.content?.disciplineTag || resolvedCourse,
            ),
            metadata: {
              sourceMode: 'ai',
              deepResearch: settings.deepResearch,
              summaryDepth: settings.summaryDepth,
              examMode: settings.examMode,
              faculty: settings.faculty,
              isLargeBundle: largeBundle,
              sourceFingerprint: bundle.sourceFingerprint,
              analyzedCourses: bundle.sourceCourses,
              isMultiCourse: bundle.isMultiCourse,
              sourceStats: {
                sourceCount: bundle.sourceCount,
                wordCount: bundle.totalWords,
                pagesOrSlides: bundle.totalPagesOrSlides,
                sectionCount: secs.length,
              },
            },
          },
          model: singleEdge.model,
          sourceMode: 'ai',
        };
      }
      if (isSuperficial) {
        needsMapReduceFallback = true;
      }
    }
  }

  // Tier-1B: Map-Reduce Blueprint + Expand on `generate-study-material` (for medium/long notes or thin single-pass)
  const blueprintRes = needsMapReduceFallback
    ? await invokeEdgeGenerate({
        ...commonReq,
        materialType: 'summary',
        stage: 'blueprint',
        noteContext: sampleUniformContext(bundle.combinedText, 88_000),
        images: bundle.images.length > 0 ? bundle.images : undefined,
        audio: bundle.audio,
      })
    : null;

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
          courseTitle: bundle.course || domain.discipline,
        },
        sectionTargets,
      });

      if (batchRes?.sourceMode === 'ai' && batchRes.content?.sections && Array.isArray(batchRes.content.sections)) {
        for (const sec of batchRes.content.sections) {
          expandedSections.push(sec);
        }
      } else {
        // Edge expand_batch başarısız olduysa önce Tier-1.5 canlı sunucu AI, sonra Tier-2 AI dene
        const liveBatch = await invokeLiveServerAiText({
          materialType: 'summary',
          title: bundle.title,
          course: resolvedCourse,
          noteContext: sectionTargets.map((t) => `### ${t.title}\n${t.contextSlice || ''}`).join('\n\n'),
          taskPrompt: `${buildSectionExpansionSystemPrompt(
            settings,
            domain.mode,
            domain.examStyleHint,
          )}\nAşağıdaki bölümleri sırasıyla (index değerlerini koruyarak) yalnızca verilen ders notu kesitlerine sadık kalarak yaz: ${sectionTargets
            .map((t) => `[index=${t.index}] ${t.title}`)
            .join(' | ')}`,
          preferPro: true,
        });
        const liveBatchParsed = liveBatch ? extractJsonLoose(liveBatch.text) : null;
        const liveBatchSections = sanitizeAiSummarySections(liveBatchParsed?.sections);
        if (liveBatchSections.length > 0) {
          liveBatchSections.forEach((sec, bi) => {
            expandedSections.push({
              ...sec,
              index: sectionTargets[bi]?.index ?? sec.index,
              heading: sec.heading || sectionTargets[bi]?.title || `Bölüm ${bi + 1}`,
            });
          });
          continue;
        }

        const pubBatch = await invokePublicJsonFallback(
          buildSectionExpansionSystemPrompt(settings, domain.mode, domain.examStyleHint),
          `DERS: ${resolvedCourse}\nBÖLÜMLER:\n${JSON.stringify(sectionTargets)}`,
        );
        if (Array.isArray(pubBatch?.sections) && pubBatch.sections.length > 0) {
          for (const sec of pubBatch.sections as SummarySection[]) {
            expandedSections.push(sec);
          }
        } else {
          allBatchesAi = false;
          for (const target of sectionTargets) {
            expandedSections.push(
              formatSectionContentForFallback({
                index: target.index,
                heading: target.title,
                pageRange: target.pageRange,
                rawSlice: target.contextSlice || '',
                focusPoints: target.focusPoints || [],
                course: bundle.course || domain.discipline,
                title: bundle.title,
                deepResearch: settings.deepResearch,
              }),
            );
          }
        }
      }
    }

    expandedSections.sort((a, b) => (a.index ?? 0) - (b.index ?? 0));

    onProgress?.(96, '3/3 • Sınav öncelik haritası, karşılaştırma matrisi ve kontrol listesi birleştiriliyor...');
    const finalSummary: SummaryContent = {
      overview: blueprint.overview,
      disciplineTag: blueprint.disciplineTag || resolvedCourse,
      keyPoints: blueprint.keyPoints || [],
      sections: expandedSections,
      teacherEmphasis: blueprint.teacherEmphasis || [],
      comparativeMatrix: blueprint.comparativeMatrix,
      deepResearchTopics: blueprint.deepResearchTopics || [],
      keyTerms: blueprint.keyTerms || [],
      extractionNotices: Array.from(
        new Set([
          ...(bundle.extractionWarnings || []),
          ...(Array.isArray(blueprint.extractionNotices)
            ? blueprint.extractionNotices.map(String).filter(Boolean)
            : []),
        ]),
      ),
      sourceCourseBreakdown,
      studyChecklist: blueprint.studyChecklist || [],
      studyPriorityMap: normalizePriorityMap(
        blueprint.studyPriorityMap,
        expandedSections,
        blueprint.keyTerms,
        blueprint.teacherEmphasis,
        blueprint.overview,
        blueprint.disciplineTag || resolvedCourse,
      ),
      metadata: {
        sourceMode: allBatchesAi ? 'ai' : 'fallback',
        deepResearch: settings.deepResearch,
        summaryDepth: settings.summaryDepth,
        examMode: settings.examMode,
        faculty: settings.faculty,
        isLargeBundle: largeBundle,
        sourceFingerprint: bundle.sourceFingerprint,
        analyzedCourses: bundle.sourceCourses,
        isMultiCourse: bundle.isMultiCourse,
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
      domain.mode,
      onProgress,
    );
    return {
      content: {
        ...deepened,
        disciplineTag: deepened.disciplineTag || domain.discipline,
        studyPriorityMap: normalizePriorityMap(
          deepened.studyPriorityMap,
          deepened.sections || [],
          deepened.keyTerms,
          deepened.teacherEmphasis,
          deepened.overview,
          deepened.disciplineTag || domain.discipline,
        ),
        metadata: {
          sourceMode: 'ai',
          deepResearch: settings.deepResearch,
          summaryDepth: settings.summaryDepth,
          examMode: settings.examMode,
          faculty: settings.faculty,
          isLargeBundle: largeBundle,
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

  // Tier-1.5: Live Server AI Bridge (GPT-4o / Gemini 2.5 Pro via academic-assistant & study-coach)
  // Guarantees fluent ChatGPT-style multi-page summaries focused 100% on the uploaded note!
  if (bundle.combinedText.trim().length >= 30 || bundle.images.length > 0) {
    const liveSummary = await buildSummaryFromLiveAi(
      bundle,
      settings,
      domain,
      fullOutlineHint,
      onProgress,
    );
    if (liveSummary) {
      return liveSummary;
    }
  }

  // Tier-2 Client Public AI Map-Reduce Synthesis (Blueprint + Batched Expansion)
  if (bundle.images.length === 0 && bundle.combinedText.trim().length >= 30) {
    const pubSummary = await generatePublicMapReduceSummary(
      bundle,
      settings,
      domain.mode,
      domain.examStyleHint,
      onProgress,
    );
    if (pubSummary && pubSummary.sections.length > 0) {
      return {
        content: pubSummary,
        model: 'EconNotes Cloud Academic AI',
        sourceMode: 'ai',
      };
    }
  }

  // Tier-3 Local Deterministic Structured Parser (guarantees zero crash + zero foreign boilerplate)
  onProgress?.(90, 'Yerel yapısal ders ayrıştırıcı ile özet ve öncelik haritası hazırlanıyor...');
  const local = generateClientStudyMaterial({
    materialType: 'summary',
    noteTitle: bundle.title,
    course: resolvedCourse,
    noteContext: bundle.combinedText,
    summaryDepth: settings.summaryDepth,
    deepResearch: settings.deepResearch,
    pedagogicalStyle: settings.pedagogicalStyle,
    customPrompt: settings.customPrompt,
    extractionWarnings: bundle.extractionWarnings,
  });
  const localSections = Array.isArray(local.sections) ? (local.sections as SummarySection[]) : [];
  return {
    content: {
      ...local,
      disciplineTag: resolvedCourse,
      extractionNotices: bundle.extractionWarnings?.length ? bundle.extractionWarnings : undefined,
      sourceCourseBreakdown,
      studyPriorityMap: normalizePriorityMap(
        local.studyPriorityMap,
        localSections,
        local.keyTerms as SummaryContent['keyTerms'],
        local.teacherEmphasis as SummaryContent['teacherEmphasis'],
        String(local.overview || ''),
        resolvedCourse,
      ),
      metadata: {
        sourceMode: 'local',
        deepResearch: settings.deepResearch,
        summaryDepth: settings.summaryDepth,
        examMode: settings.examMode,
        faculty: settings.faculty,
        isLargeBundle: largeBundle,
        sourceFingerprint: bundle.sourceFingerprint,
        analyzedCourses: bundle.sourceCourses,
        isMultiCourse: bundle.isMultiCourse,
        sourceStats: {
          sourceCount: bundle.sourceCount,
          wordCount: bundle.totalWords,
          pagesOrSlides: bundle.totalPagesOrSlides,
          sectionCount: localSections.length,
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
    20,
    settings.materialType === 'quiz'
      ? 'Ortak kaynak analizi ve soru geçmişi taranıyor...'
      : settings.materialType === 'flashcards'
      ? 'Ortak kaynak analizinden tekrarsız çalışma kartları planlanıyor...'
      : 'Ortak kaynak analizinden kaynak odaklı video ders kurgulanıyor...',
  );

  const domain = classifyStudyDomain(bundle.combinedText, bundle.course, bundle.title, settings.faculty);
  const resolvedCourse =
    bundle.course?.trim() ||
    bundle.detectedCourse?.trim() ||
    domain.detectedCourse ||
    bundle.title;
  const outlineHeadings =
    bundle.outlinePreview && bundle.outlinePreview.length > 0
      ? bundle.outlinePreview
      : extractFullDocumentOutline(bundle.combinedText, 24).map((a) => a.heading);
  const generationNonce =
    settings.generationNonce || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

  const sharedMeta = {
    sourceMode: 'ai' as const,
    deepResearch: settings.deepResearch,
    sourceFingerprint: bundle.sourceFingerprint,
    analyzedCourses: bundle.sourceCourses,
    isMultiCourse: bundle.isMultiCourse,
    qualityVerified: true,
  };

  // ==================== QUIZ PIPELINE (7-Point Validation + Anti-Repetition + Targeted Repair) ====================
  if (settings.materialType === 'quiz') {
    const requestedCount = Math.min(Math.max(settings.questionCount || 10, 4), 25);
    const difficultyQuota = computeDifficultyQuota(requestedCount, settings.difficulty || 'mixed');
    const historyEntries = loadSourceQuestionHistory({
      userId: settings.userId,
      sourceFingerprint: bundle.sourceFingerprint,
      course: resolvedCourse,
      previousQuestions: settings.previousQuestions,
    });
    const avoidancePlan = buildAvoidanceAndRotationPlan({
      outlineHeadings,
      historyEntries,
      requestedCount,
      generationNonce,
    });

    const finalizeValidatedQuiz = async (
      rawCandidates: unknown[],
      usedModel: string,
      tier: 'edge' | 'live' | 'public' | 'local',
    ): Promise<OrchestrationResult | null> => {
      const firstPass = validateQuizBatch(rawCandidates, {
        sourceText: bundle.combinedText,
        course: resolvedCourse,
        title: bundle.title,
        outlineHeadings,
        requestedCount,
        requestedDifficulty: settings.difficulty || 'mixed',
        sourceFingerprint: bundle.sourceFingerprint,
        historyEntries,
      });

      let accepted = [...firstPass.accepted];
      let totalRejected = firstPass.rejected.length;
      let regeneratedCount = 0;
      let historyExcluded = firstPass.historyExcludedCount;

      // Single cost-efficient targeted regeneration pass ONLY for rejected/missing slots
      if (
        tier !== 'local' &&
        firstPass.missingCount > 0 &&
        (bundle.combinedText.trim().length >= 60 || bundle.images.length > 0)
      ) {
        onProgress?.(
          76,
          `Kalite doğrulaması: ${firstPass.missingCount} eksik/elenen soru yeniden üretiliyor...`,
        );
        const repairAvoid = [
          ...avoidancePlan.avoidSummaries,
          ...accepted.map((q) => `[${q.topic || resolvedCourse}] ${q.question.slice(0, 110)}`),
        ].slice(0, 28);
        const repairTopics =
          firstPass.uncoveredTopics.length > 0
            ? firstPass.uncoveredTopics
            : avoidancePlan.priorityTopics;
        const repairPrompt = buildStrictQuizPrompt(settings, bundle, {
          targetCount: Math.min(requestedCount, firstPass.missingCount + 2),
          quota: firstPass.missingDifficulties,
          avoidSummaries: repairAvoid,
          priorityTopics: repairTopics,
          generationNonce: `${generationNonce}-repair`,
          isRepairPass: true,
        });

        let repairRaw: unknown[] = [];
        if (tier === 'edge' || tier === 'live') {
          const liveRepair = await invokeLiveServerAiText({
            materialType: 'quiz',
            title: bundle.title,
            course: resolvedCourse,
            noteContext: sampleUniformContext(bundle.combinedText, 52_000),
            taskPrompt: repairPrompt,
            preferPro: true,
            images: bundle.images,
          });
          const parsedRepair = liveRepair ? extractJsonLoose(liveRepair.text) : null;
          if (Array.isArray(parsedRepair?.questions)) repairRaw = parsedRepair.questions;
        } else {
          const pubRepair = await invokePublicJsonFallback(
            repairPrompt,
            `DERS: ${resolvedCourse}\nBAŞLIK: ${bundle.title}\n\nKAYNAK:\n${sampleUniformContext(
              bundle.combinedText,
              14_500,
            )}`,
            0.52,
          );
          if (Array.isArray(pubRepair?.questions)) repairRaw = pubRepair.questions;
        }

        if (repairRaw.length > 0) {
          const beforeLen = accepted.length;
          const repairPass = validateQuizBatch(repairRaw, {
            sourceText: bundle.combinedText,
            course: resolvedCourse,
            title: bundle.title,
            outlineHeadings,
            requestedCount,
            requestedDifficulty: settings.difficulty || 'mixed',
            sourceFingerprint: bundle.sourceFingerprint,
            historyEntries,
            alreadyAccepted: accepted,
          });
          accepted = repairPass.accepted;
          regeneratedCount = Math.max(0, accepted.length - beforeLen);
          totalRejected += repairPass.rejected.length;
          historyExcluded += repairPass.historyExcludedCount;
        }
      }

      // If AI failed to supply enough valid non-duplicate questions, top up ONLY the missing slots cleanly locally
      if (accepted.length < requestedCount && tier !== 'local' && accepted.length > 0) {
        const localSupplement = generateClientStudyMaterial({
          materialType: 'quiz',
          noteTitle: bundle.title,
          course: resolvedCourse,
          noteContext: bundle.combinedText,
          questionCount: Math.max(4, requestedCount - accepted.length + 2),
          difficulty: settings.difficulty,
          quizFormat: settings.quizFormat,
          sourceFingerprint: bundle.sourceFingerprint,
          generationNonce: `${generationNonce}-sup`,
          avoidHistory: historyEntries,
          preferredTopics: firstPass.uncoveredTopics.length > 0 ? firstPass.uncoveredTopics : avoidancePlan.priorityTopics,
        });
        const supRaw = Array.isArray(localSupplement.questions) ? localSupplement.questions : [];
        if (supRaw.length > 0) {
          const supPass = validateQuizBatch(supRaw, {
            sourceText: bundle.combinedText,
            course: resolvedCourse,
            title: bundle.title,
            outlineHeadings,
            requestedCount,
            requestedDifficulty: settings.difficulty || 'mixed',
            sourceFingerprint: bundle.sourceFingerprint,
            historyEntries,
            alreadyAccepted: accepted,
          });
          accepted = supPass.accepted;
        }
      }

      if (accepted.length === 0) return null;

      recordValidatedQuestionsToHistory({
        userId: settings.userId,
        sourceFingerprint: bundle.sourceFingerprint,
        course: resolvedCourse,
        questions: accepted,
      });

      const breakdown = { easy: 0, medium: 0, hard: 0 };
      const coveredTopics = new Set<string>();
      for (const q of accepted) {
        breakdown[q.difficulty || 'medium']++;
        if (q.sourceSection || q.topic) coveredTopics.add((q.sourceSection || q.topic || '').toLowerCase());
      }

      onProgress?.(96, 'Doğrulanmış deneme sınavı hazırlandı.');
      return {
        content: {
          questions: accepted,
          extractionNotices: bundle.extractionWarnings?.length ? bundle.extractionWarnings : undefined,
          qualityReport: {
            validatedCount: accepted.length,
            rejectedCount: totalRejected,
            regeneratedCount,
            historyExcludedCount: historyExcluded,
            difficultyBreakdown: breakdown,
            topicCoverageCount: coveredTopics.size,
          },
          metadata: {
            ...sharedMeta,
            sourceMode: tier === 'local' ? 'local' : 'ai',
          },
        },
        model: usedModel,
        sourceMode: tier === 'local' ? 'local' : 'ai',
      };
    };

    // Tier 1: Edge Function
    const edgeRes = await invokeEdgeGenerate({
      materialType: 'quiz',
      stage: 'single',
      noteTitle: bundle.title,
      course: resolvedCourse,
      faculty: settings.faculty && settings.faculty !== 'auto' ? domain.discipline : undefined,
      examMode: settings.examMode || undefined,
      isMultiCourse: bundle.isMultiCourse || undefined,
      sourceCourses: bundle.sourceCourses?.length ? bundle.sourceCourses : undefined,
      canonicalAnalysisDigest: bundle.canonicalAnalysisDigest || undefined,
      extractionWarnings: bundle.extractionWarnings?.length ? bundle.extractionWarnings : undefined,
      noteContext: sampleUniformContext(bundle.combinedText, 85_000),
      questionCount: requestedCount,
      difficulty: settings.difficulty,
      difficultyQuota,
      quizFormat: settings.quizFormat,
      deepResearch: settings.deepResearch,
      pedagogicalStyle: settings.pedagogicalStyle,
      customPrompt: settings.customPrompt || undefined,
      examFocus: settings.examFocus || undefined,
      avoidQuestions: avoidancePlan.avoidSummaries.slice(0, 22),
      priorityTopics: avoidancePlan.priorityTopics.slice(0, 10),
      generationNonce,
      sourceFingerprint: bundle.sourceFingerprint,
      images: bundle.images.length > 0 ? bundle.images : undefined,
      audio: bundle.audio,
    });

    if (edgeRes && edgeRes.sourceMode === 'ai' && Array.isArray(edgeRes.content?.questions)) {
      const checked = await finalizeValidatedQuiz(edgeRes.content.questions, edgeRes.model, 'edge');
      if (checked) return checked;
    }

    // Tier 1.5: Live Server AI Bridge
    if (bundle.combinedText.trim().length >= 30 || bundle.images.length > 0) {
      onProgress?.(48, 'Ders notunuzdan tekrarsız, zorluk dengeli sınav soruları hazırlanıyor...');
      const liveQuiz = await invokeLiveServerAiText({
        materialType: 'quiz',
        title: bundle.title,
        course: resolvedCourse,
        noteContext: sampleUniformContext(bundle.combinedText, 56_000),
        taskPrompt: buildStrictQuizPrompt(settings, bundle, {
          targetCount: requestedCount,
          quota: difficultyQuota,
          avoidSummaries: avoidancePlan.avoidSummaries,
          priorityTopics: avoidancePlan.priorityTopics,
          generationNonce,
        }),
        preferPro: true,
        images: bundle.images,
      });
      if (liveQuiz) {
        const parsed = extractJsonLoose(liveQuiz.text);
        if (Array.isArray(parsed?.questions) && parsed.questions.length > 0) {
          const checked = await finalizeValidatedQuiz(parsed.questions, liveQuiz.model, 'live');
          if (checked) return checked;
        }
      }
    }

    // Tier 2: Public Cloud AI
    if (bundle.images.length === 0 && bundle.combinedText.trim().length >= 30) {
      onProgress?.(68, 'Bulut yapay zekâ üzerinden sınav soruları doğrulanıyor...');
      const system = buildStrictQuizPrompt(settings, bundle, {
        targetCount: requestedCount,
        quota: difficultyQuota,
        avoidSummaries: avoidancePlan.avoidSummaries,
        priorityTopics: avoidancePlan.priorityTopics,
        generationNonce,
      });
      const user = `DERS: ${resolvedCourse}\nBAŞLIK: ${bundle.title}\n\nKAYNAK DERS NOTU (YALNIZCA BU METNE SADIK KAL):\n${sampleUniformContext(
        bundle.combinedText,
        14_500,
      )}`;
      const pub = await invokePublicJsonFallback(system, user, 0.46);
      if (Array.isArray(pub?.questions) && pub.questions.length > 0) {
        const checked = await finalizeValidatedQuiz(pub.questions, 'EconNotes Cloud Academic AI', 'public');
        if (checked) return checked;
      }
    }

    // Tier 3: Overhauled History-Aware Local Quiz Synthesizer
    onProgress?.(90, 'Yerel akademik soru motoru ile hazırlanıyor...');
    const localQuiz = generateClientStudyMaterial({
      materialType: 'quiz',
      noteTitle: bundle.title,
      course: resolvedCourse,
      noteContext: bundle.combinedText,
      questionCount: requestedCount,
      difficulty: settings.difficulty,
      quizFormat: settings.quizFormat,
      deepResearch: settings.deepResearch,
      pedagogicalStyle: settings.pedagogicalStyle,
      customPrompt: settings.customPrompt,
      examFocus: settings.examFocus,
      extractionWarnings: bundle.extractionWarnings,
      sourceFingerprint: bundle.sourceFingerprint,
      generationNonce,
      avoidHistory: historyEntries,
      preferredTopics: avoidancePlan.priorityTopics,
    });
    const localQs = Array.isArray(localQuiz.questions) ? (localQuiz.questions as QuizQuestion[]) : [];
    if (localQs.length > 0) {
      recordValidatedQuestionsToHistory({
        userId: settings.userId,
        sourceFingerprint: bundle.sourceFingerprint,
        course: resolvedCourse,
        questions: localQs,
      });
    }
    return {
      content: localQuiz as StudyContentPayload,
      model: 'EconNotes Yerel Yapısal Ayrıştırıcı',
      sourceMode: 'local',
    };
  }

  // ==================== FLASHCARDS PIPELINE (Deduplicated + History-Aware) ====================
  if (settings.materialType === 'flashcards') {
    const requestedCards = Math.min(Math.max(settings.cardCount || 14, 4), 30);
    const fcHistory = loadSourceFlashcardHistory({
      userId: settings.userId,
      sourceFingerprint: bundle.sourceFingerprint,
      previousFlashcards: settings.previousFlashcards,
    });
    const avoidFronts = fcHistory.slice(0, 20).map((h) => `[${h.topic}] ${h.frontPreview}`);

    const finalizeValidatedCards = (
      rawCards: unknown[],
      usedModel: string,
      isLocal = false,
    ): OrchestrationResult | null => {
      const checked = validateFlashcardsBatch(rawCards, {
        sourceText: bundle.combinedText,
        course: resolvedCourse,
        title: bundle.title,
        outlineHeadings,
        requestedCount: requestedCards,
        sourceFingerprint: bundle.sourceFingerprint,
        historyEntries: fcHistory,
      });
      if (checked.accepted.length === 0) return null;
      recordValidatedFlashcardsToHistory({
        userId: settings.userId,
        sourceFingerprint: bundle.sourceFingerprint,
        cards: checked.accepted,
      });
      onProgress?.(95, 'Çalışma kartları doğrulandı ve hazırlandı.');
      return {
        content: {
          cards: checked.accepted,
          extractionNotices: bundle.extractionWarnings?.length ? bundle.extractionWarnings : undefined,
          metadata: { ...sharedMeta, sourceMode: isLocal ? 'local' : 'ai' },
        },
        model: usedModel,
        sourceMode: isLocal ? 'local' : 'ai',
      };
    };

    const edgeRes = await invokeEdgeGenerate({
      materialType: 'flashcards',
      stage: 'single',
      noteTitle: bundle.title,
      course: resolvedCourse,
      faculty: settings.faculty && settings.faculty !== 'auto' ? domain.discipline : undefined,
      examMode: settings.examMode || undefined,
      isMultiCourse: bundle.isMultiCourse || undefined,
      sourceCourses: bundle.sourceCourses?.length ? bundle.sourceCourses : undefined,
      canonicalAnalysisDigest: bundle.canonicalAnalysisDigest || undefined,
      extractionWarnings: bundle.extractionWarnings?.length ? bundle.extractionWarnings : undefined,
      noteContext: sampleUniformContext(bundle.combinedText, 85_000),
      cardCount: requestedCards,
      difficulty: settings.difficulty,
      deepResearch: settings.deepResearch,
      pedagogicalStyle: settings.pedagogicalStyle,
      customPrompt: settings.customPrompt || undefined,
      avoidQuestions: avoidFronts,
      priorityTopics: outlineHeadings.slice(0, 10),
      generationNonce,
      sourceFingerprint: bundle.sourceFingerprint,
      images: bundle.images.length > 0 ? bundle.images : undefined,
      audio: bundle.audio,
    });
    if (edgeRes && edgeRes.sourceMode === 'ai' && Array.isArray(edgeRes.content?.cards)) {
      const ok = finalizeValidatedCards(edgeRes.content.cards, edgeRes.model);
      if (ok) return ok;
    }

    if (bundle.combinedText.trim().length >= 30 || bundle.images.length > 0) {
      onProgress?.(52, 'Ders notunuzdaki temel kavramlardan tekrarsız çalışma kartları hazırlanıyor...');
      const liveCards = await invokeLiveServerAiText({
        materialType: 'flashcards',
        title: bundle.title,
        course: resolvedCourse,
        noteContext: sampleUniformContext(bundle.combinedText, 52_000),
        taskPrompt: buildStrictFlashcardsPrompt(settings, bundle, {
          targetCount: requestedCards,
          avoidFronts,
          priorityTopics: outlineHeadings.slice(0, 10),
          generationNonce,
        }),
        preferPro: false,
        images: bundle.images,
      });
      if (liveCards) {
        const parsed = extractJsonLoose(liveCards.text);
        if (Array.isArray(parsed?.cards)) {
          const ok = finalizeValidatedCards(parsed.cards, liveCards.model);
          if (ok) return ok;
        }
      }
    }

    if (bundle.images.length === 0 && bundle.combinedText.trim().length >= 30) {
      onProgress?.(72, 'Bulut yapay zekâ üzerinden çalışma kartları hazırlanıyor...');
      const pub = await invokePublicJsonFallback(
        buildStrictFlashcardsPrompt(settings, bundle, {
          targetCount: requestedCards,
          avoidFronts,
          priorityTopics: outlineHeadings.slice(0, 10),
          generationNonce,
        }),
        `DERS: ${resolvedCourse}\nBAŞLIK: ${bundle.title}\n\nKAYNAK:\n${sampleUniformContext(
          bundle.combinedText,
          14_500,
        )}`,
        0.44,
      );
      if (Array.isArray(pub?.cards)) {
        const ok = finalizeValidatedCards(pub.cards, 'EconNotes Cloud Academic AI');
        if (ok) return ok;
      }
    }

    onProgress?.(90, 'Yerel ayrıştırıcı ile çalışma kartları hazırlanıyor...');
    const localCards = generateClientStudyMaterial({
      materialType: 'flashcards',
      noteTitle: bundle.title,
      course: resolvedCourse,
      noteContext: bundle.combinedText,
      cardCount: requestedCards,
      difficulty: settings.difficulty,
      extractionWarnings: bundle.extractionWarnings,
      sourceFingerprint: bundle.sourceFingerprint,
      generationNonce,
      avoidFlashcardHistory: fcHistory,
    });
    const finalLocalCards = Array.isArray(localCards.cards) ? (localCards.cards as FlashcardItem[]) : [];
    if (finalLocalCards.length > 0) {
      recordValidatedFlashcardsToHistory({
        userId: settings.userId,
        sourceFingerprint: bundle.sourceFingerprint,
        cards: finalLocalCards,
      });
    }
    return {
      content: localCards as StudyContentPayload,
      model: 'EconNotes Yerel Yapısal Ayrıştırıcı',
      sourceMode: 'local',
    };
  }

  // ==================== VIDEO LESSON PIPELINE (Chunked Coverage + Course-Locked Alignment Gate) ====================
  const validateVideoCandidate = (
    rawCandidate: Record<string, unknown> | null | undefined,
    usedModel: string,
    isLocal = false,
  ): OrchestrationResult | null => {
    if (!rawCandidate) return null;
    const repaired = validateAndRepairVideoContent(rawCandidate, {
      sourceText: bundle.combinedText,
      course: resolvedCourse,
      title: bundle.title,
      outlineHeadings,
      extractionWarnings: bundle.extractionWarnings,
      sourceFingerprint: bundle.sourceFingerprint,
      analyzedCourses: bundle.sourceCourses,
      isMultiCourse: bundle.isMultiCourse,
    });
    if (!repaired) return null;
    onProgress?.(96, 'Ses, görsel ve altyazı uyumlu video ders hazırlandı.');
    return {
      content: {
        ...repaired,
        metadata: {
          ...sharedMeta,
          sourceMode: isLocal ? 'local' : 'ai',
        },
      } as StudyContentPayload,
      model: usedModel,
      sourceMode: isLocal ? 'local' : 'ai',
    };
  };

  // Tier 1: Edge Function
  const edgeVideoRes = await invokeEdgeGenerate({
    materialType: 'video',
    stage: 'single',
    noteTitle: bundle.title,
    course: resolvedCourse,
    faculty: settings.faculty && settings.faculty !== 'auto' ? domain.discipline : undefined,
    examMode: settings.examMode || undefined,
    isMultiCourse: bundle.isMultiCourse || undefined,
    sourceCourses: bundle.sourceCourses?.length ? bundle.sourceCourses : undefined,
    canonicalAnalysisDigest: bundle.canonicalAnalysisDigest || undefined,
    extractionWarnings: bundle.extractionWarnings?.length ? bundle.extractionWarnings : undefined,
    noteContext: sampleUniformContext(bundle.combinedText, 85_000),
    deepResearch: settings.deepResearch,
    pedagogicalStyle: settings.pedagogicalStyle,
    customPrompt: settings.customPrompt || undefined,
    examFocus: settings.examFocus || undefined,
    sourceFingerprint: bundle.sourceFingerprint,
    images: bundle.images.length > 0 ? bundle.images : undefined,
    audio: bundle.audio,
  });

  if (edgeVideoRes && edgeVideoRes.sourceMode === 'ai') {
    const validatedEdgeVideo = validateVideoCandidate(
      edgeVideoRes.content as Record<string, unknown>,
      edgeVideoRes.model,
    );
    if (validatedEdgeVideo) return validatedEdgeVideo;
  }

  // Tier 1.5: Live Server AI (Sequential Chunked Coverage for Long Documents > 20k chars!)
  if (bundle.combinedText.trim().length >= 30 || bundle.images.length > 0) {
    if (bundle.combinedText.length > 20_000) {
      const videoChunks = splitNoteIntoSequentialChunks(bundle.combinedText, 19_000, 3);
      const stitchedScenes: unknown[] = [];
      const stitchedFacts: string[] = [];
      const stitchedTerms: unknown[] = [];
      const stitchedPairs: unknown[] = [];
      const stitchedExamQs: unknown[] = [];
      let usedModel = 'EconNotes Akademik AI';
      let firstOutline = '';

      for (let c = 0; c < videoChunks.length; c++) {
        const pct = Math.min(88, Math.round(35 + ((c + 1) / videoChunks.length) * 50));
        onProgress?.(pct, `Uzun ders notu bölüm bölüm video derse dönüştürülüyor (${c + 1}/${videoChunks.length})...`);
        const livePart = await invokeLiveServerAiText({
          materialType: 'video',
          title: `${bundle.title} (${c + 1}/${videoChunks.length})`,
          course: resolvedCourse,
          noteContext: videoChunks[c],
          taskPrompt: buildStrictVideoPrompt(resolvedCourse, settings.customPrompt, bundle, {
            partIndex: c,
            totalParts: videoChunks.length,
            sceneRangeHint: '2-3',
          }),
          preferPro: true,
          images: c === 0 ? bundle.images : undefined,
        });
        if (!livePart) continue;
        usedModel = livePart.model;
        const parsed = extractJsonLoose(livePart.text);
        if (!parsed) continue;
        if (!firstOutline && typeof parsed.outline === 'string') firstOutline = parsed.outline;
        if (Array.isArray(parsed.scenes)) stitchedScenes.push(...parsed.scenes);
        if (Array.isArray(parsed.keyFacts)) stitchedFacts.push(...parsed.keyFacts.map(String));
        if (Array.isArray(parsed.keyTerms)) stitchedTerms.push(...parsed.keyTerms);
        if (Array.isArray(parsed.matchingPairs)) stitchedPairs.push(...parsed.matchingPairs);
        if (Array.isArray(parsed.examQuestions)) stitchedExamQs.push(...parsed.examQuestions);
      }

      if (stitchedScenes.length > 0) {
        const validatedChunked = validateVideoCandidate(
          {
            videoTitle: bundle.title,
            outline: firstOutline,
            overview: firstOutline,
            scenes: stitchedScenes,
            keyFacts: stitchedFacts,
            keyTerms: stitchedTerms,
            matchingPairs: stitchedPairs,
            examQuestions: stitchedExamQs,
          },
          usedModel,
        );
        if (validatedChunked) return validatedChunked;
      }
    } else {
      onProgress?.(52, 'Ders notunuza birebir sadık, görsel-anlatım uyumlu video ders hazırlanıyor...');
      const liveVideo = await invokeLiveServerAiText({
        materialType: 'video',
        title: bundle.title,
        course: resolvedCourse,
        noteContext: bundle.combinedText,
        taskPrompt: buildStrictVideoPrompt(resolvedCourse, settings.customPrompt, bundle),
        preferPro: true,
        images: bundle.images,
      });
      if (liveVideo) {
        const parsed = extractJsonLoose(liveVideo.text);
        const validatedLiveVideo = validateVideoCandidate(parsed, liveVideo.model);
        if (validatedLiveVideo) return validatedLiveVideo;
      }
    }
  }

  // Tier 2: Public Cloud AI Video
  if (bundle.images.length === 0 && bundle.combinedText.trim().length >= 30) {
    onProgress?.(74, 'Bulut yapay zekâ üzerinden video ders sahneleri doğrulanıyor...');
    const pubVideo = await invokePublicJsonFallback(
      buildStrictVideoPrompt(resolvedCourse, settings.customPrompt, bundle),
      `DERS: ${resolvedCourse}\nBAŞLIK: ${bundle.title}\n\nKAYNAK DERS NOTU (YALNIZCA BU METNE SADIK KAL):\n${sampleUniformContext(
        bundle.combinedText,
        14_500,
      )}`,
      0.32,
    );
    const validatedPubVideo = validateVideoCandidate(pubVideo, 'EconNotes Cloud Academic AI');
    if (validatedPubVideo) return validatedPubVideo;
  }

  // Tier 3: Overhauled Grounded Local Video Synthesizer
  onProgress?.(90, 'Yerel video ders ayrıştırıcısı ile hazırlanıyor...');
  const localVideo = generateClientStudyMaterial({
    materialType: 'video',
    noteTitle: bundle.title,
    course: resolvedCourse,
    noteContext: bundle.combinedText,
    deepResearch: settings.deepResearch,
    pedagogicalStyle: settings.pedagogicalStyle,
    customPrompt: settings.customPrompt,
    examFocus: settings.examFocus,
    extractionWarnings: bundle.extractionWarnings,
    sourceFingerprint: bundle.sourceFingerprint,
  });
  return {
    content: localVideo as StudyContentPayload,
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
  const domain = classifyStudyDomain(
    `${params.existingOverview || ''} ${params.section.content}`,
    params.course || undefined,
    params.title,
  );
  const expandDirective =
    domain.mode === 'verbal'
      ? 'Bu bölümü yalnızca kendi ders konusuna sadık kalarak iki kat daha anlaşılır ve ayrıntılı hale getir: akıcı açıklamalar, neden-sonuç ilişkileri ve gerekiyorsa kısa karşılaştırma tablosu ekle. Başka derslerden kavram veya uydurma formül ekleme.'
      : 'Bu bölümü yalnızca kendi ders konusuna sadık kalarak daha ayrıntılı ve anlaşılır hale getir: adım adım açıklama, somut örnek ve yalnızca notta varsa formül açıklaması ekle.';

  const edgeRes = await invokeEdgeGenerate({
    materialType: 'summary',
    stage: 'expand_batch',
    noteTitle: params.title,
    course: params.course || undefined,
    deepResearch: false,
    pedagogicalStyle: 'balanced',
    customPrompt: expandDirective,
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

  // Tier-1.5 Live Server AI expansion
  const liveExpand = await invokeLiveServerAiText({
    materialType: 'summary',
    title: params.title,
    course: params.course || params.title,
    noteContext: `BÖLÜM BAŞLIĞI: ${params.section.heading}\nMEVCUT ÖZET:\n${params.section.content}`,
    taskPrompt: `${expandDirective}\nYANITINI YALNIZCA GEÇERLİ JSON OLARAK DÖNDÜR:\n{ "sections": [{ "index": ${params.sectionIndex}, "heading": "${params.section.heading}", "content": "Daha ayrıntılı, akıcı ve anlaşılır Türkçe Markdown anlatım...", "takeaways": ["Net çıkarım 1", "Net çıkarım 2", "Net çıkarım 3"] }] }`,
    preferPro: true,
  });
  if (liveExpand) {
    const parsed = extractJsonLoose(liveExpand.text);
    const secs = sanitizeAiSummarySections(parsed?.sections);
    if (secs[0]) return { ...params.section, ...secs[0], index: params.sectionIndex };
    if (liveExpand.text.length > params.section.content.length) {
      return {
        ...params.section,
        index: params.sectionIndex,
        content: liveExpand.text,
      };
    }
  }

  const pub = await invokePublicJsonFallback(
    `Verilen ders özet bölümünü yalnızca kendi konusuna sadık kalarak daha ayrıntılı ve anlaşılır biçimde genişlet. YALNIZCA JSON döndür: { "sections": [{ "index": 0, "heading": "...", "content": "...", "takeaways": ["..."] }] }`,
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

  // Tier-1.5 Live Server AI rubric grading
  const liveGrade = await invokeLiveServerAiText({
    materialType: 'quiz',
    title: params.topic || 'Klasik Soru Değerlendirme',
    course: params.course || undefined,
    noteContext: `SORU: ${params.question}\nÖRNEK DOĞRU CEVAP: ${params.rubricAnswer}\nÖĞRENCİNİN CEVABI: ${params.studentAnswer}`,
    taskPrompt:
      'Öğrencinin cevabını örnek doğru cevapla karşılaştırarak 0-100 arası adil biçimde puanla ve kısa, yapıcı Türkçe geri bildirim yaz. YALNIZCA GEÇERLİ JSON DÖNDÜR: { "score": 80, "verdict": "Güçlü Cevap | Kısmi Doğru | Geliştirilmeli", "feedback": "Kısa net değerlendirme", "strengths": ["Doğru yön"], "missingConcepts": ["Eksik kavram"], "improvedAnswer": "Tam puan örnek cevap" }',
    preferPro: false,
  });
  if (liveGrade) {
    const parsed = extractJsonLoose(liveGrade.text);
    if (parsed && typeof parsed.score === 'number') {
      return {
        score: Math.max(0, Math.min(100, Math.round(parsed.score))),
        verdict: String(parsed.verdict || 'Değerlendirildi'),
        feedback: String(parsed.feedback || ''),
        strengths: Array.isArray(parsed.strengths) ? parsed.strengths.map(String) : [],
        missingConcepts: Array.isArray(parsed.missingConcepts) ? parsed.missingConcepts.map(String) : [],
        improvedAnswer: String(parsed.improvedAnswer || params.rubricAnswer),
      };
    }
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

function flattenMaterialContextForCoach(materialContent: StudyContentPayload | Record<string, unknown> | undefined): string {
  if (!materialContent || typeof materialContent !== 'object') return '';
  const c = materialContent as Record<string, unknown>;
  const parts: string[] = [];
  if (typeof c.overview === 'string' && c.overview.trim()) {
    parts.push(c.overview.trim());
  }
  if (Array.isArray(c.keyPoints) && c.keyPoints.length > 0) {
    parts.push(`Anahtar Noktalar:\n- ${c.keyPoints.map(String).join('\n- ')}`);
  }
  if (Array.isArray(c.sections)) {
    for (const sec of c.sections) {
      if (sec && typeof sec === 'object') {
        const s = sec as Record<string, unknown>;
        parts.push(`## ${String(s.heading || 'Bölüm')}\n${String(s.content || '')}`);
      }
    }
  }
  if (Array.isArray(c.keyTerms)) {
    const terms = c.keyTerms
      .filter((t): t is Record<string, unknown> => Boolean(t && typeof t === 'object'))
      .map((t) => `${String(t.term || '')}: ${String(t.definition || '')}`)
      .filter(Boolean);
    if (terms.length > 0) parts.push(`Kavramlar:\n${terms.join('\n')}`);
  }
  if (Array.isArray(c.cards)) {
    const cards = c.cards
      .filter((t): t is Record<string, unknown> => Boolean(t && typeof t === 'object'))
      .map((t) => `S: ${String(t.front || '')} | C: ${String(t.back || '')}`);
    if (cards.length > 0) parts.push(`Kartlar:\n${cards.join('\n')}`);
  }
  if (Array.isArray(c.questions)) {
    const qs = c.questions
      .filter((t): t is Record<string, unknown> => Boolean(t && typeof t === 'object'))
      .map((t) => `Soru: ${String(t.question || '')} | Açıklama: ${String(t.explanation || t.sampleAnswer || '')}`);
    if (qs.length > 0) parts.push(`Sorular:\n${qs.join('\n')}`);
  }
  if (typeof c.videoScript === 'string' && c.videoScript.trim()) {
    parts.push(c.videoScript.trim());
  }
  if (parts.length > 0) return parts.join('\n\n');
  return JSON.stringify(materialContent).slice(0, 14_000);
}

export async function askStudyCoach(params: {
  materialTitle: string;
  course?: string | null;
  materialType: string;
  materialContent: StudyContentPayload | Record<string, unknown>;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  coachMode: CoachMode;
  images?: Array<{ data: string; mimeType: string; name?: string }>;
}): Promise<{ reply: string; model: string }> {
  await ensureFreshSession();
  const hasImages = Array.isArray(params.images) && params.images.length > 0;
  try {
    const { data, error } = await supabase.functions.invoke('study-coach', {
      body: {
        materialTitle: params.materialTitle,
        course: params.course,
        materialType: params.materialType,
        materialContent: params.materialContent,
        messages: params.messages.slice(-14),
        coachMode: params.coachMode,
        images: hasImages ? params.images!.slice(0, 3) : undefined,
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

  const plainContext = flattenMaterialContextForCoach(params.materialContent);
  const lastUserQuestion =
    [...params.messages].reverse().find((m) => m.role === 'user')?.content || '';
  const focusedContext =
    plainContext.length > 13_000
      ? sliceContextForSection(plainContext, lastUserQuestion || params.materialTitle, 0, 1, [], 13_000)
      : plainContext;

  // Tier-1.5 Live Vision & Step-by-Step Bridge via academic-assistant (GPT-4o Vision ready)
  if (hasImages || params.coachMode === 'step_by_step') {
    try {
      const { data, error } = await supabase.functions.invoke('academic-assistant', {
        body: {
          message: lastUserQuestion || 'Görseldeki soruyu adım adım çöz ve anlat.',
          mode: params.coachMode === 'step_by_step' || hasImages ? 'step_by_step' : 'concept',
          notesContext: focusedContext.slice(0, 12_000) || undefined,
          history: params.messages.slice(-10, -1),
          hasFile: hasImages,
          fileName: hasImages ? params.images![0]?.name : undefined,
          images: hasImages ? params.images!.slice(0, 3) : undefined,
        },
      });
      const replyText = data?.reply || data?.answer || data?.content;
      if (!error && typeof replyText === 'string' && replyText.trim()) {
        return {
          reply: replyText.trim(),
          model: 'EconNotes AI Öğretmen (Görsel & Adım Adım)',
        };
      }
    } catch {
      // Fall through to Tier-2
    }
  }

  // Tier-2 Public Reasoning fallback with strict source-fidelity & zero-nonsense guardrails
  const modeNote =
    params.coachMode === 'step_by_step'
      ? 'ADIM ADIM ÇÖZÜM MODU: Soruyu (1) Verilenler & İstenen, (2) Yöntem/Formül, (3) Adım 1, Adım 2... şeklinde ara basamak atlamadan çözüm, (4) Sonuç & Kontrol adımlarıyla çöz.'
      : params.coachMode === 'reinforce'
      ? 'PEKİŞTİREREK ANLAT MODU: (1) Konuyu sade ve anlaşılır biçimde adım adım açıkla, (2) Öğrencinin notundaki/slaytındaki gerçek kavram veya örneğe doğrudan bağla, (3) En sık karıştırılan 1 noktaya dikkat çek, (4) Sonunda öğrencinin anlayıp anlamadığını ölçen 1 kısa kontrol sorusu sor.'
      : params.coachMode === 'feynman'
      ? 'FEYNMAN MODU: Konuyu önce sade bir günlük hayat örneğiyle sezdir, ardından nottaki gerçek akademik tanıma bağla ve öğrenciden tek cümleyle özetlemesini iste.'
      : params.coachMode === 'socratic'
      ? 'SOKRATİK MOD: Hazır cevabı hemen verme; 1-2 cümlelik net ipucu verip öğrenciyi doğru sonuca götüren tek bir soru sor.'
      : params.coachMode === 'deep_research'
      ? 'DERİN ARAŞTIRMA MODU: Teorik arka plan, varsa formüller ve alana özgü somut vaka örneğiyle derinlemesine açıkla. Notta olmayan bilgileri [Not Dışı Genel Bilgi] diye açıkça işaretle.'
      : 'NET VE KAYNAKLI ANLATIM: Doğrudan nottaki içeriğe dayanarak sade, net, adım adım ve pekiştirici Türkçe yanıt ver.';

  try {
    const res = await fetch(PUBLIC_REASONING_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'openai',
        messages: [
          {
            role: 'system',
            content: `Sen EconNotes Akıl Hocası'sın. Ders/Alan: ${params.course || 'Üniversite Dersi'} | Materyal: ${
              params.materialTitle
            }.
${modeNote}
KESİN DOĞRULUK KURALI:
- Yalnızca aşağıdaki ders notu/slayt içeriğine ve bu bilim dalının doğrulanmış akademik bilgisine sadık kal.
- Uydurma veri, konu dışı alakasız bölüm örnekleri veya boş dolgu cümleler KESİNLİKLE YASAKTIR.
- Sorulan bilgi notta geçmiyorsa "Yüklediğin notta bu bilgi doğrudan geçmiyor." diyerek dürüstçe belirt.

DERS NOTU / SLAYT BAĞLAMI:
${focusedContext}`,
          },
          ...params.messages.slice(-10),
        ],
        temperature: 0.25,
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
    // Ignore and fall back to grounded local excerpt
  }

  // Tier-3 Honest Grounded Excerpt Fallback (never hallucinates even if cloud is temporarily busy)
  if (focusedContext.trim().length > 40) {
    const queryWords = lastUserQuestion
      .toLocaleLowerCase('tr-TR')
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 3);
    const blocks = plainContext.split(/\n{2,}/).filter((b) => b.trim().length > 25);
    const ranked = blocks
      .map((b) => {
        const lower = b.toLocaleLowerCase('tr-TR');
        const score = queryWords.reduce((s, w) => s + (lower.includes(w) ? 1 : 0), 0);
        return { b, score };
      })
      .sort((a, b) => b.score - a.score);
    const best = ranked.filter((r) => r.score > 0).slice(0, 2).map((r) => r.b.trim());
    if (best.length > 0) {
      return {
        reply: `Şu an bulut yanıt motorunda kısa bir yoğunluk var; ancak uydurma bilgi vermek yerine doğrudan notunda bu soruyla en ilgili bölümleri çıkardım:\n\n${best
          .map((p, idx) => `**${idx + 1}. İlgili Not Pasajı:**\n${p.slice(0, 650)}`)
          .join('\n\n')}\n\nBirkaç saniye sonra tekrar sorarsan bu bölümü adım adım pekiştirerek anlatabilirim.`,
        model: 'EconNotes Kaynaklı Pasaj Tarayıcı',
      };
    }
  }

  throw new Error('Akıl Hocası şu anda yanıt veremedi. Lütfen biraz sonra tekrar deneyin.');
}
