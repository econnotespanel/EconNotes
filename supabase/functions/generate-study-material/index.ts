import { createClient } from 'npm:@supabase/supabase-js@2';
import { createChatCompletion, extractJsonFromText } from '../_shared/openai-gateway.ts';
import {
  ANTI_INJECTION_SYSTEM_GUARD,
  enforceRateLimit,
  getAuthenticatedUser,
  isTrustedOrigin,
  jsonResponse,
  preflightResponse,
  readJsonBody,
  RequestError,
  wrapUntrustedPromptData,
} from '../_shared/request-security.ts';

const ALLOWED_STAGES = new Set([
  'single',
  'blueprint',
  'expand_batch',
  'analyze_chunk',
  'synthesize_merge',
  'quality_repair',
  'grade_answer',
]);
const ALLOWED_IMAGE_MIME_RE = /^image\/(png|jpe?g|webp|gif)$/i;
const ALLOWED_AUDIO_MIME_RE = /^audio\/(mpeg|mp3|wav|x-wav|webm|ogg|mp4|m4a|aac|flac)$/i;
const BASE64_CLEAN_RE = /^[A-Za-z0-9+/=]+$/;

interface MediaPart {
  data: string;
  mimeType: string;
  pageLabel?: string;
}

interface SectionTarget {
  index: number;
  title: string;
  focusPoints?: string[];
  pageRange?: string;
  keyConcepts?: string[];
  contextSlice?: string;
}

interface GenerateReq {
  materialType: 'flashcards' | 'quiz' | 'summary' | 'video';
  stage?:
    | 'single'
    | 'blueprint'
    | 'expand_batch'
    | 'analyze_chunk'
    | 'synthesize_merge'
    | 'quality_repair'
    | 'grade_answer';
  noteTitle?: string;
  course?: string;
  noteContext?: string;
  customPrompt?: string;
  detailLevel?: 'concise' | 'standard' | 'deep' | 'textbook';
  summaryDepth?: 'short' | 'standard' | 'comprehensive' | 'textbook';
  deepResearch?: boolean;
  pedagogicalStyle?:
    | 'balanced'
    | 'academic_rigor'
    | 'feynman'
    | 'case_study'
    | 'quantitative'
    | 'exam_blitz';
  questionCount?: number;
  cardCount?: number;
  difficulty?: 'easy' | 'medium' | 'hard' | 'mixed';
  difficultyQuota?: { easy: number; medium: number; hard: number };
  quizFormat?: 'multiple_choice' | 'open_ended' | 'mixed';
  examFocus?: string;
  faculty?: string;
  examMode?: string;
  fullOutlineHint?: string[];
  isMultiCourse?: boolean;
  sourceCourses?: string[];
  canonicalAnalysisDigest?: string;
  extractionWarnings?: string[];
  avoidQuestions?: string[];
  priorityTopics?: string[];
  generationNonce?: string;
  sourceFingerprint?: string;
  sourceIds?: string[];
  videoScenarioPlan?: {
    lessonTitle?: string;
    courseName?: string;
    learningObjectives?: string[];
    chapters?: Array<{ title: string; focusNotes?: string; diagramType?: string }>;
    narrationStyle?: string;
  };
  targetSectionRange?: string;
  minWordsPerSection?: number;
  maxWordsPerSection?: number;
  disciplineGuidance?: string;
  chunkMeta?: {
    index?: number;
    total?: number;
    pageRangeLabel?: string;
    overlapPrefix?: string;
    coveredHeadings?: string[];
  };
  sectionTargets?: SectionTarget[];
  globalOutline?: {
    overview?: string;
    keyPoints?: string[];
    courseTitle?: string;
  };
  gradePayload?: {
    question: string;
    rubricAnswer: string;
    studentAnswer: string;
    topic?: string;
  };
  audio?: MediaPart;
  document?: MediaPart;
  images?: MediaPart[];
}

const VALID_MATERIAL_TYPES = ['flashcards', 'quiz', 'summary', 'video'] as const;

function sanitizeText(raw: string): string {
  return String(raw || '')
    .replace(/\u0000/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/<(script|style|noscript|iframe|object)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\?xml[\s\S]*?\?>|<!--[\s\S]*?-->|<!DOCTYPE[\s\S]*?>/gi, ' ')
    .replace(/<(?:\w+):(?:br|cr)\b[^>]*>(?:[\s\S]*?<\/(?:\w+):(?:br|cr)>)?|<(?:\w+):(?:br|cr)\b[^>]*\/>/gi, '\n')
    .replace(/<(?:\w+):tab\b[^>]*\/?>(?:<\/(?:\w+):tab>)?/gi, ' ')
    .replace(/<\/?(?:a|p|w|c|r|mc|xdr|pic|wp|v|o|dgm|dsp|m|w14|w15|a14|a16|p14|p15|xml|xmlns|svg):[a-zA-Z_][\w.-]*(?:\s+[^<>]*)?\/?>/gi, '')
    .replace(/&lt;\/?(?:a|p|w|c|r|mc):[a-zA-Z_][\w.-]*(?:\s+[^&<>]*)?\/?&gt;/gi, '')
    .replace(/<\/?(?:a|p|w|c|r|mc):[a-zA-Z_][\w.-]*(?:\s+[a-zA-Z_:][\w.-]*=(?:"[^"]*"|'[^']*'))*\s*\/?>?/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(?:html|head|body|div|span|table|thead|tbody|tfoot|tr|th|td|font|center)(?:\s+[^<>]*)?\/?>/gi, '')
    .replace(/<\/(?:p|b|i|u|strong|em)\s*>/gi, '')
    .replace(/<(?:p|b|i|u|strong|em)\s*\/?>/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function sanitizeJsonStringsDeep<T>(value: T): T {
  if (typeof value === 'string') return sanitizeText(value) as unknown as T;
  if (Array.isArray(value)) return value.map((item) => sanitizeJsonStringsDeep(item)) as unknown as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = sanitizeJsonStringsDeep(v);
    }
    return out as T;
  }
  return value;
}

/**
 * Evenly samples context from beginning, middle, and end when source exceeds single-prompt budget,
 * so slide decks and textbooks never lose later chapters.
 */
function sampleBalancedContext(text: string, maxChars = 95_000): string {
  const clean = sanitizeText(text);
  if (clean.length <= maxChars) return clean;

  const chunkCount = clean.length > 140_000 ? 11 : 9;
  const overhead = 72;
  const perChunk = Math.max(1200, Math.floor(maxChars / chunkCount) - overhead);
  const maxStart = Math.max(0, clean.length - perChunk);
  const parts: string[] = [];
  for (let i = 0; i < chunkCount; i++) {
    const start =
      i === chunkCount - 1
        ? maxStart
        : Math.floor((maxStart * i) / Math.max(1, chunkCount - 1));
    const end = Math.min(clean.length, start + perChunk);
    const pct = Math.round((start / Math.max(1, clean.length)) * 100);
    parts.push(`[--- BÖLÜM ${i + 1}/${chunkCount} (~%${pct} konum) ---]\n${clean.slice(start, end)}`);
  }
  return parts.join('\n\n');
}

function base64ToUint8Array(base64: string): Uint8Array {
  const cleaned = base64.includes(',') ? base64.split(',').pop() || '' : base64;
  const binary = atob(cleaned);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Transcribe audio attachment via OpenAI Whisper or Gemini native audio if keys exist.
 */
async function transcribeAudioMedia(audio: MediaPart): Promise<string> {
  const openaiKey = Deno.env.get('OPENAI_API_KEY');
  if (openaiKey && !openaiKey.startsWith('la-')) {
    try {
      const bytes = base64ToUint8Array(audio.data);
      const ext = audio.mimeType.includes('wav')
        ? 'wav'
        : audio.mimeType.includes('webm')
        ? 'webm'
        : audio.mimeType.includes('m4a')
        ? 'm4a'
        : 'mp3';
      const form = new FormData();
      form.append('file', new Blob([bytes], { type: audio.mimeType || 'audio/mpeg' }), `lecture.${ext}`);
      form.append('model', 'whisper-1');
      form.append('language', 'tr');

      const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${openaiKey}` },
        body: form,
        signal: AbortSignal.timeout(45_000),
      });
      if (res.ok) {
        const json = await res.json();
        if (typeof json?.text === 'string' && json.text.trim().length > 0) {
          return json.text.trim();
        }
      }
    } catch (err) {
      console.warn('Whisper audio transcription failed:', err);
    }
  }

  const geminiKey = Deno.env.get('GEMINI_API_KEY') || Deno.env.get('GOOGLE_API_KEY');
  if (geminiKey) {
    try {
      const res = await fetch(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': geminiKey,
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: 'Bu ders ses kaydını Türkçe ve varsa İngilizce/akademik terimleri koruyarak kelimesi kelimesine eksiksiz transkribe et.',
                  },
                  {
                    inlineData: {
                      mimeType: ALLOWED_AUDIO_MIME_RE.test(audio.mimeType || '') ? audio.mimeType : 'audio/mpeg',
                      data: audio.data.includes(',') ? audio.data.split(',').pop() : audio.data,
                    },
                  },
                ],
              },
            ],
          }),
          signal: AbortSignal.timeout(45_000),
        },
      );
      if (res.ok) {
        const data = await res.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (typeof text === 'string' && text.trim()) return text.trim();
      }
    } catch {
      console.warn('Gemini audio transcription failed');
    }
  }

  return '';
}

/**
 * Extract raw text from a PDF document attachment directly via Gemini inlineData if text layer was missing.
 */
async function extractPdfViaGemini(doc: MediaPart): Promise<string> {
  const geminiKey = Deno.env.get('GEMINI_API_KEY') || Deno.env.get('GOOGLE_API_KEY');
  if (!geminiKey) return '';
  try {
    const res = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': geminiKey,
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: 'Bu PDF belgesindeki tüm sayfa metinlerini, başlıkları, formülleri (LaTeX $...$ formatında) ve tabloları sayfa numaralarıyla birlikte eksiksiz çıkar.',
                },
                {
                  inlineData: {
                    mimeType: 'application/pdf',
                    data: doc.data.includes(',') ? doc.data.split(',').pop() : doc.data,
                  },
                },
              ],
            },
          ],
        }),
        signal: AbortSignal.timeout(50_000),
      },
    );
    if (res.ok) {
      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (typeof text === 'string' && text.trim()) return text.trim();
    }
  } catch (err) {
    console.warn('Gemini PDF extraction failed:', err);
  }
  return '';
}

function getStyleDirective(style?: string): string {
  switch (style) {
    case 'academic_rigor':
      return 'AKADEMİK STİL: Lisansüstü düzeyinde teorik kesinlik. Varsayımları, türetmeleri, teoremleri ve sınır koşullarını eksiksiz göster.';
    case 'feynman':
      return 'AKADEMİK STİL: Feynman Metodu — Her zor kavramı önce kristal netliğinde günlük analoji ile sezgisel açıkla, ardından tam matematiksel/akademik tanıma geç.';
    case 'case_study':
      return 'AKADEMİK STİL: Vaka & Politika Odaklı — Teoriyi gerçek dünya verileri, Türkiye ve küresel vaka analizleri ile somutlaştır.';
    case 'quantitative':
      return 'AKADEMİK STİL: Sayısal & Türetim — Denklemleri $...$ ve $$...$$ LaTeX bloklarıyla adım adım türet, sayısal çözümlü örnek ekle.';
    case 'exam_blitz':
      return 'AKADEMİK STİL: Sınav Stratejisi — Vize/final sorularının geldiği ayrım noktalarına, tuzaklara ve karşılaştırma tablolarına odaklan.';
    default:
      return 'AKADEMİK STİL: Dengeli Fakülte Ders Kitabı — Sezgisel açıklama + formel teori + matematiksel gösterim + karşılaştırma tablosu + somut örnek.';
  }
}

function getResearchDirective(deepResearch?: boolean, domainMode: 'verbal' | 'quantitative' | 'hybrid' = 'hybrid'): string {
  const baseGrounding = `KAYNAK SADAKATİ VE ŞEFFAF AYRIM (ZORUNLU):
1. Temel ve birincil kaynağın YALNIZCA kullanıcının yüklediği ders materyalidir. Kaynaktaki tüm başlıkları, alt başlıkları, tanımları, teorileri, yaklaşımları, modelleri, formülleri, tabloları, grafik açıklamalarını ve örnekleri eksiksiz koru.
2. Kaynakta yer almayan teorileri, kavramları, formülleri veya olguları sırf içeriği uzatmak için KESİNLİKLE uydurma ve kaynakta varmış gibi gösterme.
3. Öğrencinin anlamakta zorlanabileceği bir noktayı sadeleştirmek için kaynak metnin ötesinde kısa pedagojik açıklama eklemen gerekirse, bu kısmı mutlaka **[Ek Açıklama]** etiketiyle kaynak bilgisinden açıkça ayır.
4. Kaynaktaki akademik terminolojiyi ve konu sıralamasını koru. Belgede okunamayan, görsel/taranmış ya da eksik kalmış sayfalar varsa bunları uydurmadan "extractionNotices" alanında ve ilgili bölümde açıkça belirt.`;

  if (!deepResearch) {
    return baseGrounding;
  }
  const domainTail =
    domainMode === 'verbal'
      ? '5. Sözel/hukuk/sosyal bilimler derslerinde kavram ikiliklerini, kanun/ilke unsurlarını, neden–sonuç zincirini ve Markdown karşılaştırma tablolarını (`|...|`) öne çıkar; uydurma matematik formülü üretme.'
      : '5. Sayısal/istatistik/ekonomi/mühendislik derslerinde kaynaktaki her formülü LaTeX ($...$ / $$...$$) ile yaz, her değişkenin anlamını açıkla, çözümlü örnekleri adım adım aç ve karşılaştırma tabloları (`|...|`) ekle.';
  return `${baseGrounding}
DERİN ÖĞRENME KATMANI AKTİF:
- Kaynakta yer alan kavramların arka planını ve sınav bağlantısını netleştirirken, kaynak dışından gelen her akademik tamamlayıcı bilgiyi mutlaka **[Ek Açıklama]** etiketiyle işaretle.
${domainTail}`;
}

function detectEdgeDomainMode(
  text: string,
  course?: string,
  title?: string,
): 'verbal' | 'quantitative' | 'hybrid' {
  const header = `${course || ''} ${title || ''} ${text.slice(0, 1200)}`.toLowerCase();
  const sample = text.slice(0, 14_000);
  const mathSignals = (
    sample.match(/(\$\$[^$]+\$\$|\$[^$\n]+\$|\\frac|\\sum|\\int|\\partial|\b[a-zA-Z]\s*=\s*[-+0-9a-zA-Z(])/g) ||
    []
  ).length;
  const verbalTopic =
    /(hukuk|anayasa|borçlar|ceza|medeni|idare|tarih|osmanlı|cumhuriyet|sosyoloji|psikoloji|felsefe|edebiyat|siyaset|kamu yönetimi|uluslararası ilişkiler|diplomasi|iktisat tarihi|iktisadi düşünceler|yönetim|insan kaynakları|eğitim|pedagoji|etik|iletişim)/.test(
      header,
    );
  const quantTopic =
    /(ekonometri|matematik|istatistik|kalkülüs|integral|türev|algoritma|fizik|kimya|muhasebe|mühendislik|termodinamik|mukavemet|devre)/.test(
      header,
    );

  if (verbalTopic && mathSignals < 6) return 'verbal';
  if (quantTopic || mathSignals >= 6) return 'quantitative';
  if (mathSignals <= 1 && sample.length > 180) return 'verbal';
  return 'hybrid';
}

function buildStagePrompts(req: GenerateReq, enrichedContext: string): {
  system: string;
  userText: string;
  maxTokens: number;
  temperature: number;
} {
  const courseName = req.course || 'Belgeden Analiz Edilen Ders';
  const noteTitle = req.noteTitle || 'Yüklenen Ders Materyali';
  const domainMode = detectEdgeDomainMode(enrichedContext, courseName, noteTitle);
  const styleInstruction = getStyleDirective(req.pedagogicalStyle);
  const researchInstruction = getResearchDirective(req.deepResearch, domainMode);
  const multiCourseDirective =
    req.isMultiCourse && Array.isArray(req.sourceCourses) && req.sourceCourses.length > 1
      ? `\nÇOKLU DERS İZOLASYONU (KRİTİK): Bu oturumda birbirinden farklı dersler (${req.sourceCourses.join(
          ', ',
        )}) bulunuyor. Her kaynağın içeriğini YALNIZCA kendi dersi ve başlığı altında işle; bölüm başlıklarında [Ders Adı] etiketini kullan ve farklı derslerin kavram/formül/örneklerini ASLA birbirine karıştırma!`
      : '';
  const canonicalDigestBlock = req.canonicalAnalysisDigest?.trim()
    ? `\n\nORTAK KAYNAK ANALİZİ (TÜM STÜDYO ARAÇLARI BU ANALİZİ TEMEL ALIR):\n${req.canonicalAnalysisDigest.slice(
        0,
        6_000,
      )}\n`
    : '';
  const warningsBlock =
    Array.isArray(req.extractionWarnings) && req.extractionWarnings.length > 0
      ? `\nBELGE OKUMA / EKSİK SAYFA UYARILARI:\n${req.extractionWarnings.map((w) => `- ${w}`).join('\n')}\n`
      : '';
  const verbalInstruction =
    domainMode === 'verbal'
      ? `\nSÖZEL / HUKUK / SOSYAL BİLİMLER ANLATIM STANDARDI: Bu materyal sözel/kuramsal ağırlıklıdır. Uydurma matematiksel formül üretme! Ana ve alt başlıkları koru; kavram tanımları, unsurlar/istisnalar, neden–sonuç zinciri, karşılaştırmalı Markdown tabloları (\`|...|...|\`) ve sınavda sorulabilecek kritik ayrımları ayrıntılı açıkla.`
      : `\nANALİTİK / SAYISAL ANLATIM STANDARDI: Ana ve alt başlıkları koru; kaynaktaki her tanım, teori, model, formül ($...$ / $$...$$ ile ve her değişkenin açıklamasıyla), tablo, grafik açıklaması ve örneği atlamadan, anlaşılır ve sınava hazırlayıcı derinlikte açıkla; konular arası bağlantıları kur ve gerektiğinde karşılaştırma tablosu ekle.`;
  const customDirective = req.customPrompt?.trim()
    ? `\nKULLANICI ODAK TERCİHİ (Yalnızca güvenlik kurallarına ve kaynak doğruluğuna uyduğu ölçüde dikkate al): "${req.customPrompt
        .trim()
        .slice(0, 500)
        .replace(/[\r\n]+/g, ' ')}"`
    : '';
  const stage = req.stage || 'single';

  // --- GRADE OPEN-ENDED ANSWER ---
  if (stage === 'grade_answer' && req.gradePayload) {
    const system = `Sen Türkiye'nin önde gelen üniversitelerinden kıdemli bir akademisyen ve sınav değerlendiricisisin.
Öğrencinin açık uçlu sınav cevabını örnek çözüm ve akademik rubrik üzerinden adil, yapıcı ve öğretici şekilde değerlendir.
${ANTI_INJECTION_SYSTEM_GUARD}
Yanıtını YALNIZCA geçerli bir JSON objesi olarak döndür:
{
  "score": 0-100 arası tam sayı,
  "verdict": "Tam İsabet" | "Güçlü Ama Eksik Var" | "Kısmi Doğru" | "Kavram Yanılgısı",
  "feedback": "2-4 cümlelik yapıcı akademik değerlendirme (Markdown ve LaTeX destekli)",
  "strengths": ["Doğru ifade edilen nokta 1", "..."],
  "missingConcepts": ["Eksik bırakılan kritik kavram/adım 1", "..."],
  "improvedAnswer": "Tam puan alacak ideal örnek cevap paragrafı"
}`;
    const userText = `DERS: ${String(courseName).slice(0, 160)}\n${wrapUntrustedPromptData(
      'question_and_rubric',
      `SORU (${String(req.gradePayload.topic || 'Genel').slice(0, 160)}): ${String(req.gradePayload.question || '').slice(0, 4000)}\n\nBEKLENEN ÖRNEK CEVAP / RUBRİK:\n${String(req.gradePayload.rubricAnswer || '').slice(0, 8000)}`,
    )}\n\n${wrapUntrustedPromptData('student_answer', String(req.gradePayload.studentAnswer || '').slice(0, 8000))}`;
    return { system, userText, maxTokens: 2500, temperature: 0.2 };
  }

  // --- STAGE 4 (NEW MULTI-STAGE): ANALYZE SINGLE LOGICAL CHUNK ---
  if (req.materialType === 'summary' && stage === 'analyze_chunk') {
    const chunkIdx = Number(req.chunkMeta?.index ?? 0);
    const chunkTotal = Math.max(1, Number(req.chunkMeta?.total ?? 1));
    const pageRange = req.chunkMeta?.pageRangeLabel || 'Kaynak';
    const wordBudget = `${req.minWordsPerSection || 420}–${req.maxWordsPerSection || 760}`;
    const secRange = req.targetSectionRange?.trim() || (chunkTotal === 1 ? '5-8' : '2-4');
    const disciplineGuidanceBlock = req.disciplineGuidance?.trim()
      ? `\nDERSİN NİTELİĞİNE ÖZGÜ AKADEMİK YAPI:\n${req.disciplineGuidance.trim()}`
      : '';
    const overlapBlock = req.chunkMeta?.overlapPrefix?.trim()
      ? `\nÖNCEKİ PARÇADAN BAĞLAM ÖRTÜŞMESİ (TEKRARLAMA; YALNIZCA KOPUKSUZ GEÇİŞ İÇİN REFERANS AL):\n"""\n${req.chunkMeta.overlapPrefix.slice(0, 700)}\n"""`
      : '';
    const coveredBlock =
      Array.isArray(req.chunkMeta?.coveredHeadings) && req.chunkMeta.coveredHeadings.length > 0
        ? `\nÖNCEKİ PARÇALARDA TAMAMLANAN BAŞLIKLAR (TEKRARLAMA): ${req.chunkMeta.coveredHeadings
            .slice(-16)
            .join(' | ')}`
        : '';
    const hintsBlock =
      Array.isArray(req.fullOutlineHint) && req.fullOutlineHint.length > 0
        ? `\nBU PARÇADAKİ BAŞLIKLAR (HİÇBİRİNİ ATLAMA):\n${req.fullOutlineHint
            .slice(0, 14)
            .map((h, i) => `${i + 1}. ${h}`)
            .join('\n')}`
        : '';

    const system = `Sen üniversite öğrencilerine ders materyallerinden kapsamlı, öğretici ve sınava tam hazırlık sağlayan ders notları üreten kıdemli akademisyensin.
Sana belgenin ${chunkIdx + 1}/${chunkTotal}. mantıksal parçası (${pageRange}) verilmektedir.
${multiCourseDirective}${disciplineGuidanceBlock}
${styleInstruction}
${researchInstruction}${verbalInstruction}
${customDirective}

KESİN AKADEMİK KURALLAR:
1. YÜZEYSEL ÖZET YASAKTIR: Önemli bilgileri silerek metni kısaltma! Öğrencinin orijinal PDF'ye dönmek zorunda kalmadan konuyu tam öğrenebilmesi için her kavramı, teoriyi, modeli, formülü/değişkeni (hukukta kanun maddesi, şart, unsur, istisna ve hukuki sonucu), tablo/grafik yorumunu ve örneği ayrıntılı anlat.
2. HER BÖLÜM ${wordBudget} KELİME: Ana başlığı koru, alt başlıkları (\`####\`) oluştur, konular arası bağlantıyı ve sınavda sorulabilecek ayrıntıları vurgula.
3. KAYNAK SADAKATİ: Kaynakta olmayan bilgiyi kaynakta varmış gibi uydurma; pedagojik açıklama gerekiyorsa **[Ek Açıklama]** etiketiyle kaynaktan açıkça ayır.
4. Bu parça için ${secRange} kapsamlı bölüm üret ve YALNIZCA geçerli JSON döndür:
{
  "overviewSnippet": "Bu parçanın kapsamını anlatan 2-3 cümle",
  "keyPoints": ["Bu parçadan 3-5 somut ana nokta"],
  "sections": [
    {
      "index": 0,
      "heading": "Kaynaktaki gerçek ana başlık",
      "pageRange": "${pageRange}",
      "content": "${wordBudget} kelimelik alt başlıklı (####), tanımlı, teorili/formüllü veya kanun unsurlu, tablolu/örnekli Türkçe Markdown anlatımı",
      "takeaways": ["Bölüm sonu kısa tekrar 1", "Kısa tekrar 2", "Kısa tekrar 3"],
      "commonPitfalls": ["Sınavda dikkat edilecek 1-2 kritik ayrım veya tuzak"],
      "checkpointQuestion": { "question": "Kontrol sorusu?", "options": ["A","B","C","D"], "correctIndex": 0, "explanation": "Kaynağa dayalı çözüm." }
    }
  ],
  "comparativeMatrix": {
    "title": "Karşılaştırma tablosu başlığı (metinde karşılaştırma varsa)",
    "columns": ["Ölçüt", "Yaklaşım / Kavram A", "Yaklaşım / Kavram B"],
    "rows": [["...", "...", "..."]]
  },
  "keyTerms": [{ "term": "Terim", "definition": "Eksiksiz tanım", "formula": "" }],
  "teacherEmphasis": [{ "point": "Kritik ayrıntı", "whyImportant": "Sınavda neden önemli", "examProbability": "Yüksek" }],
  "memorizeVsInterpret": { "memorize": ["Ezberlenecekler"], "interpret": ["Yorumlanacaklar"] },
  "studyChecklist": ["Öğrenme hedefi"],
  "synthesisSnippet": "Bu parçanın bütüne katkısı (2 cümle)"
}`;

    const userText = `DERS: ${courseName}\nMATERYAL: ${noteTitle}\nPARÇA: ${chunkIdx + 1}/${chunkTotal} (${pageRange})${hintsBlock}${coveredBlock}${overlapBlock}${warningsBlock}\n\nKAYNAK METİN PARÇASI:\n${enrichedContext.slice(
      0,
      46_000,
    )}`;
    return { system, userText, maxTokens: 12_500, temperature: 0.22 };
  }

  // --- STAGE 5 (NEW MULTI-STAGE): SYNTHESIZE & MERGE ALL CHUNKS ---
  if (req.materialType === 'summary' && stage === 'synthesize_merge') {
    const system = `Sen çok parçalı ders analizini bütünlüklü, akıcı ve tutarlı tek bir fakülte ders notuna dönüştüren akademik baş editörsün.
Sana belgenin tüm parçalarından çıkarılan bölüm özetleri verilmiştir. Görevin, hiçbir bilgiyi eksiltmeden genel çerçeveyi, konular arası bağlantıları, kapsayıcı karşılaştırma tablosunu ve kapanış değerlendirmesini sentezlemektir.
YALNIZCA geçerli JSON döndür:
{
  "overview": "Belgenin tamamını (ilk sayfadan son sayfaya) kapsayan 2-3 paragraflık güçlü giriş ve konu akışı",
  "comparativeMatrix": {
    "title": "Dersin Temel Kavram / Teori Karşılaştırma Tablosu",
    "columns": ["Ölçüt", "Yaklaşım / Kavram A", "Yaklaşım / Kavram B"],
    "rows": [["...", "...", "..."], ["...", "...", "..."]]
  },
  "summarySynthesis": "Tüm bölümleri birbirine bağlayan, sınava stratejik çalışma sırasını özetleyen 2 paragraflık kapsamlı konu değerlendirmesi"
}`;
    const userText = `DERS: ${courseName}\nMATERYAL: ${noteTitle}\n${
      req.disciplineGuidance ? `DERS ODAĞI:\n${req.disciplineGuidance}\n` : ''
    }\nTAMAMLANAN BÖLÜMLER:\n${enrichedContext.slice(0, 42_000)}`;
    return { system, userText, maxTokens: 4_500, temperature: 0.2 };
  }

  // --- STAGE 6 (NEW MULTI-STAGE): TARGETED QUALITY REPAIR ---
  if (req.materialType === 'summary' && stage === 'quality_repair') {
    const targets = req.sectionTargets || [];
    const wordBudget = `${req.minWordsPerSection || 420}–${req.maxWordsPerSection || 760}`;
    const system = `Sen akademik kalite denetimi sırasında eksik veya yüzeysel bulunan ders bölümlerini orijinal kaynak metne dayanarak eksiksiz tamamlayan uzman akademisyensin.
${req.disciplineGuidance ? `DERS ODAĞI:\n${req.disciplineGuidance}\n` : ''}${researchInstruction}${verbalInstruction}
Her hedef bölüm için ${wordBudget} kelime aralığında alt başlıklı (\`####\`), eksiksiz tanımlı, örnekli, sayfa referanslı ve sınav odaklı bölüm yaz. YALNIZCA geçerli JSON döndür:
{
  "sections": [
    {
      "index": 0,
      "heading": "Bölüm başlığı",
      "pageRange": "Sayfa/Slayt",
      "content": "Kapsamlı Türkçe Markdown ders bölümü...",
      "takeaways": ["Çıkarım 1", "Çıkarım 2", "Çıkarım 3"],
      "commonPitfalls": ["Sınav tuzağı"]
    }
  ]
}`;
    const targetText = targets
      .map(
        (t) =>
          `Index=${t.index} | Başlık: ${t.title} | Sayfa: ${t.pageRange || 'Kaynak'}\nKAYNAK KESİTİ:\n${(
            t.contextSlice || ''
          ).slice(0, 14_000)}`,
      )
      .join('\n\n========\n\n');
    const userText = `DERS: ${courseName}\nMATERYAL: ${noteTitle}\nONARILACAK / EKSİK BÖLÜMLER (${targets.length} adet):\n\n${targetText}`;
    return { system, userText, maxTokens: 12_500, temperature: 0.2 };
  }

  // --- STAGE 1: SUMMARY BLUEPRINT ---
  if (req.materialType === 'summary' && stage === 'blueprint') {
    const isLargeDoc = enrichedContext.length >= 16_000 || req.examMode === 'large_note';
    const targetSections =
      req.targetSectionRange?.trim() ||
      (req.summaryDepth === 'short'
        ? '5-6'
        : req.summaryDepth === 'standard'
        ? isLargeDoc
          ? '9-13'
          : '6-9'
        : req.summaryDepth === 'textbook'
        ? isLargeDoc
          ? '14-20'
          : '8-12'
        : isLargeDoc
        ? '12-18'
        : '7-10');
    const disciplineGuidanceBlock = req.disciplineGuidance?.trim()
      ? `\nALANA ÖZGÜ PEDAGOJİK YÖNERGE (YAPAY ŞABLON ZORLAMA, DERSE DOĞAL UYARLA):\n${req.disciplineGuidance.trim()}`
      : '';
    const facultyDirective = req.faculty
      ? `\nDERS / ALAN ODAĞI: ${req.faculty}. Yalnızca yüklenen belgenin gerçek dersine, terminolojisine ve içeriğine %100 sadık kal; başka derslerden veya alanlardan alakasız kavram ekleme.`
      : '\nBAĞIMSIZ DERS ANALİZİ: Yüklenen belgenin kendi gerçek dersini (örn. Para Teorisi, Borçlar Hukuku, İstatistik ve Olasılık, Mikro İktisat vb.) başlık ve içerikten birebir koru; asla başka bir dersin kapsamına kaydırma.';
    const outlineBlock =
      Array.isArray(req.fullOutlineHint) && req.fullOutlineHint.length > 0
        ? `\nDOKÜMANIN BAŞTAN SONA BAŞLIK HARİTASI (İLK SAYFADAN SON SAYFAYA HİÇBİR BÖLÜMÜ ATLAMA):\n${req.fullOutlineHint
            .slice(0, 36)
            .map((h, i) => `${i + 1}. ${h}`)
            .join('\n')}\n`
        : '';

    const system = `Sen üst düzey bir üniversite kürsü profesörü ve akademik eğitim materyali mimarısın.
Görevin, verilen ders materyalinin TAMAMINI (ilk sayfadan son sayfaya kadar tek bir önemli başlığı, kavramı, teoriyi, modeli veya formülü bile atlamadan) tarayıp eksiksiz bir 9 Bölümlü Çalışma Stüdyosu Ders Mimarisi (Blueprint), "Ezberlenecekler vs. Yorumlanacaklar" sınav ayrımı, bütüncül Konu Değerlendirmesi ve "Hangi Konulara Bakmalıyım?" sınav öncelik haritası (studyPriorityMap) oluşturmaktır.
${facultyDirective}${multiCourseDirective}${disciplineGuidanceBlock}
${styleInstruction}
${researchInstruction}${verbalInstruction}
${customDirective}

KRİTİK KURALLAR:
1. YÜZEYSEL ÖZET YASAKTIR: Amaç metni kısaltmak değil, öğrencinin konuyu gerçekten öğrenip sınava eksiksiz hazırlanmasını sağlayacak yapısal ders mimarisini kurmaktır. Uzun belgelerde (ör. 100-190 sayfa) tüm üniteleri/haftaları kapsayan geniş bir bölüm haritası oluştur; orta ve son sayfaları asla kesme.
2. KAYNAĞA %100 SADAKAT: Her bölüm başlığı, alt odak noktası, terim ve karşılaştırma tablosu doğrudan kaynak metindeki gerçek içerikten çıkmalıdır. Kaynakta bulunmayan teori, tanım veya formülleri ASLA uydurma.
3. ${domainMode === 'verbal' ? 'Sözel/hukuk derslerinde ana ve alt başlıkları, kanun/ilke unsurlarını, istisnaları, neden-sonuç zincirini ve kavram ayrımlarını koru; uydurma matematiksel formül ekleme.' : 'Formül, denklem, tablo ve grafik içeren derslerde metindeki TÜM formülleri LaTeX ($...$ veya $$...$$) ile keyTerms ve focusPoints içinde koru; her değişkenin anlamını ve formülün kullanım amacını planla.'}
4. Belgede okunamayan veya eksik sayfa/slayt uyarısı varsa "extractionNotices" dizisinde dürüstçe bildir.
5. YALNIZCA geçerli JSON döndür (ekstra düz metin yok):
{
  "overview": "1. Ders ve Konu Genel Çerçevesi: Belgenin bütününü, amacını, konu akışını ve sınav açısından kritik eksenlerini anlatan 2-3 paragraflık nitelikli giriş özeti.",
  "disciplineTag": "${courseName}",
  "extractionNotices": ["Varsa okunamayan/eksik sayfa veya görsel slayt bildirimi; yoksa []"],
  "keyPoints": ["Madde 1 — kaynaktaki somut kavram, teori veya mekanizma", "... (10-16 güçlü madde)"],
  "sectionsPlan": [
    {
      "index": 0,
      "title": "Nottaki gerçek ana başlık (çoklu ders varsa [Ders Adı] etiketiyle)",
      "pageRange": "Sayfa 1-8 veya Slayt 1-10",
      "focusPoints": ["Alt başlık A", "Alt başlık B", "Önemli tanım/teori/formül/örnek C"],
      "keyConcepts": ["Terim 1", "Terim 2", "Formül/Model 3"]
    }
  ],
  "studyPriorityMap": [
    {
      "topic": "Bölüm / Konu başlığı",
      "priority": "critical" | "important" | "review",
      "reason": "Sınavda neden mutlaka bakılması gerektiğini açıklayan 1-2 somut cümle",
      "estimatedMinutes": 10,
      "focusConcepts": ["Kavram 1", "Kavram 2"],
      "likelyQuestionType": "Karşılaştırma / Tanım & Ayrım / Formül & Uygulama / Vaka",
      "sectionIndex": 0
    }
  ],
  "teacherEmphasis": [
    {
      "point": "Sınavda sorulma olasılığı yüksek kritik ayrıntı veya kavram",
      "whyImportant": "Sınavda neden sorulur ve öğrencilerin dikkat etmesi gereken ayrım nedir?",
      "examProbability": "Yüksek" | "Orta"
    }
  ],
  "memorizeVsInterpret": {
    "memorize": ["Kesin olarak ezberlenmesi gereken tanım/formül/madde/süre 1", "... (4-6 madde)"],
    "interpret": ["Sınavda yorumlanması ve ilişki kurulması gereken neden-sonuç/mekanizma 1", "... (4-6 madde)"]
  },
  "comparativeMatrix": {
    "title": "Kaynaktaki Kavram / Teori / Yaklaşım Karşılaştırma Tablosu",
    "columns": ["Boyut", "Yaklaşım / Kavram A", "Yaklaşım / Kavram B"],
    "rows": [["Temel Tanım / Varsayım", "...", "..."], ["Temel Fark / Sınır", "...", "..."]]
  },
  "deepResearchTopics": [
    {
      "topic": "Kavramlar Arası Bağlantı veya Sınav Uygulama Başlığı",
      "literatureContext": "Kaynaktaki teorinin konunun bütünüyle bağlantısı (ek bilgi varsa [Ek Açıklama] olarak belirt)",
      "realWorldApplication": "Kaynaktaki örnek veya sadeleştirilmiş uygulama bağlantısı"
    }
  ],
  "keyTerms": [
    { "term": "Kaynaktaki Akademik Terim", "definition": "Anlaşılır, eksiksiz ve ayırt edici tanım", "formula": "Varsa kaynaktaki LaTeX formül" }
  ],
  "summarySynthesis": "9. Konu Değerlendirmesi: Tüm belgedeki başlıkların birbiriyle nasıl bütünleştiğini ve öğrencinin sınava nasıl stratejik çalışması gerektiğini anlatan 1-2 paragraflık kapsayıcı kapanış değerlendirmesi.",
  "studyChecklist": [
    "Bu bölümü bitirdiğimde ... kavramını/teorisini ve farklarını açıklayabilirim."
  ]
}
sectionsPlan dizisi tam ${targetSections} bölüm içermeli ve belgenin BAŞINDAN SONUNA (ilk sayfadan son sayfaya) tüm konuları sıralı biçimde eksiksiz kapsamalıdır.`;

    const userText = `DERS: ${courseName}\nMATERYAL BAŞLIĞI: ${noteTitle}${outlineBlock}${canonicalDigestBlock}${warningsBlock}\n\nKAYNAK İÇERİĞİ:\n${sampleBalancedContext(
      enrichedContext,
      92_000,
    )}`;

    return { system, userText, maxTokens: 9000, temperature: 0.22 };
  }

  // --- STAGE 2: SUMMARY EXPAND BATCH ---
  if (req.materialType === 'summary' && stage === 'expand_batch') {
    const targets = req.sectionTargets || [];
    const wordBudget = `${req.minWordsPerSection || 450}–${req.maxWordsPerSection || 760}`;
    const disciplineGuidanceBlock = req.disciplineGuidance?.trim()
      ? `\nALANA ÖZGÜ PEDAGOJİK YÖNERGE:\n${req.disciplineGuidance.trim()}`
      : '';
    const system = `Sen üniversite öğrencilerine sınava tam hazırlık sağlayan, kapsamlı ve anlaşılır çalışma rehberleri yazan uzman bir akademisyensin.
Sana verilen ders mimarisi ve kaynak kesitleri doğrultusunda, SADECE aşağıdaki hedef bölümlerin her birini derinlemesine, anlaşılır ve eksiksiz Türkçe Markdown olarak yazacaksın.
${multiCourseDirective}${disciplineGuidanceBlock}
${styleInstruction}
${researchInstruction}${verbalInstruction}
${customDirective}

HER BÖLÜM İÇİN ZORUNLU KALİTE STANDARDI:
1. YÜZEYSEL VE KISA ÖZET YASAKTIR: Her bölüm ${wordBudget} kelime arası DOLGUN, ÖĞRETİCİ ve SINAVA HAZIRLAYICI bir çalışma bölümü olmalıdır (ancak kaynakta olmayan bilgileri uydurarak uzatma — kaynak metindeki tüm detayları, tanımları, alt başlıkları, örnekleri, formülleri ve bağlantıları tam aç!).
2. ANA VE ALT BAŞLIKLARI KORU: Kaynaktaki alt başlıkları \`####\` olarak koru, akademik terminolojiyi ve konu sıralamasını bozma.
3. KAVRAM, TANIM, TEORİ VE MODELLER: Geçen hiçbir önemli kavramı, teoriyi, yaklaşımı veya modeli atlama; karmaşık akademik kavramları akademik terimleri kaybetmeden sade dille açıkla ve benzer yaklaşımların farklarını netleştir.
4. FORMÜL, GRAFİK, TABLO VE ÖRNEKLER: ${domainMode === 'verbal' ? 'Sözel/hukuk/sosyal bilimlerde karşılaştırma veya unsur ayrımı gerektiğinde mutlaka Markdown tablosu (`|...|`) kur; uydurma matematiksel formül ekleme.' : 'Kaynaktaki TÜM formülleri LaTeX (`$...$` ve `$$...$$`) ile yaz, her sembolün/değişkenin ne anlama geldiğini ve formülün hangi amaçla kullanıldığını açıkla; grafik/tablo ve sayısal örnekleri adım adım anlat.'}
5. KONULAR ARASI BAĞLANTI VE SINAV ODAĞI: Bu bölümün önceki/sonraki konularla bağlantısını kur ve sınavlarda sorulabilecek kritik ayrıntıları/tuzakları özel olarak vurgula.
6. ŞEFFAF KAYNAK AYRIMI: Kaynak dışından kısa bir sadeleştirici açıklama eklemen gerekirse mutlaka **[Ek Açıklama]** etiketiyle kaynak bilgisinden ayır. Okunamayan/görsel sayfa uyarısı varsa açıkça belirt.
7. KONTROL SORUSU: Her bölümün sonunda öğrencinin o bölümü kavrayıp kavramadığını ölçen 1 ayırt edici mini soru (\`checkpointQuestion\`) üret.

YALNIZCA geçerli JSON döndür:
{
  "sections": [
    {
      "index": 0,
      "heading": "Bölüm başlığı",
      "pageRange": "Sayfa / Slayt aralığı",
      "content": "Alt başlıklar (####), detaylı kavram/teori açıklamaları, varsa formüller + değişken tanımları + kullanım amacı, tablo/örnek açıklaması, konular arası bağlantı ve sınav vurgusu içeren ${wordBudget} kelimelik eksiksiz Türkçe Markdown metni...",
      "takeaways": ["Bu bölümden akılda kalması gereken 3-4 net çıkarım"],
      "deepResearchNote": "Varsa konular arası kuramsal bağlantı veya [Ek Açıklama] notu",
      "commonPitfalls": ["Sınavda sık yapılan 1-2 kavram tuzağı veya karışıklık"],
      "checkpointQuestion": {
        "question": "Bölüme özel ayırt edici sınav kontrol sorusu?",
        "options": ["A", "B", "C", "D"],
        "correctIndex": 0,
        "explanation": "Doğru şıkkın kaynağa dayalı net gerekçesi."
      }
    }
  ]
}`;

    const planText = targets
      .map(
        (t) =>
          `Bölüm Index=${t.index} | Başlık: ${t.title} | Kapsam: ${t.pageRange || 'Kaynak'}\nOdak Noktaları: ${(
            t.focusPoints || []
          ).join(', ')}\nKavramlar: ${(t.keyConcepts || []).join(', ')}${
            t.contextSlice ? `\nİLGİLİ KAYNAK METİN PARÇASI:\n${t.contextSlice.slice(0, 18_000)}` : ''
          }`,
      )
      .join('\n\n====================\n\n');

    const userText = `DERS: ${courseName}\nMATERYAL: ${noteTitle}\nGENEL ÇERÇEVE: ${
      req.globalOutline?.overview || 'Üniversite ders notları kapsamlı analizi'
    }${warningsBlock}\n\nİŞLENECEK HEDEF BÖLÜMLER (${targets.length} adet — her birini mutlaka 'sections' dizisine eksiksiz yaz):\n\n${planText}\n\nDESTEKLEYİCİ BAĞLAM KESİTİ:\n${sampleBalancedContext(
      enrichedContext,
      44_000,
    )}`;

    return { system, userText, maxTokens: 15_500, temperature: 0.24 };
  }

  // --- SINGLE-CALL SUMMARY (Deep, comprehensive, 100% source-faithful) ---
  if (req.materialType === 'summary') {
    const isShort = req.summaryDepth === 'short' || req.detailLevel === 'concise';
    const secCount = req.targetSectionRange?.trim() || (isShort ? '5-6' : '7-11');
    const wordRange = isShort
      ? '280-400'
      : `${req.minWordsPerSection || 420}-${req.maxWordsPerSection || 680}`;
    const disciplineGuidanceBlock = req.disciplineGuidance?.trim()
      ? `\nALANA ÖZGÜ PEDAGOJİK YÖNERGE:\n${req.disciplineGuidance.trim()}`
      : '';
    const system = `Sen üniversite öğrencilerine ders materyallerinden sınava tam hazırlık sağlayan, kapsamlı ve anlaşılır 9 bölümlü çalışma rehberleri oluşturan uzman bir akademisyensin.
${multiCourseDirective}${disciplineGuidanceBlock}
${styleInstruction}
${researchInstruction}${verbalInstruction}
${customDirective}

KESİN KALİTE VE DOĞRULUK KURALLARI:
1. YÜZEYSEL ÖZET YASAKTIR: Özet asla birkaç kısa paragraftan ibaret olmamalı. Belgedeki TÜM sayfaları/slaytları, ana ve alt başlıkları (\`####\`), tanımları, teorileri, yaklaşımları, modelleri, formülleri ($...$ / $$...$$ — her değişkenin anlamı ve kullanım amacıyla), tabloları, grafik/şekil açıklamalarını ve örnekleri eksiksiz analiz edip öğretici biçimde açıkla.
2. %100 KAYNAK SADAKATİ: Yalnızca yüklenen belgenin gerçek içeriğine dayan. Kaynakta bulunmayan teorileri, tanımları veya başka bir dersin konularını sırf içeriği uzatmak için KESİNLİKLE ekleme.
3. ŞEFFAF EK AÇIKLAMA: Zor bir kavramı sadeleştirmek için kaynaktaki metnin ötesinde kısa açıklama eklersen mutlaka **[Ek Açıklama]** etiketiyle işaretle.
4. EKSİK / OKUNAMAYAN KISIMLAR: Belgede okunamayan, taranmış veya metin katmanı olmayan sayfalar/slaytlar varsa bunları uydurmadan "extractionNotices" listesinde açıkça belirt.
5. SINAV HAZIRLIĞI VE BÜTÜNCÜL DEĞERLENDİRME: Kavramlar/modeller arası bağlantıları kur, Markdown karşılaştırma tablosu (\`|...|\`) ekle, "memorizeVsInterpret" ile ezberlenecek ve yorumlanacak bilgileri net biçimde ayır ve sonunda "summarySynthesis" ile 9. Konu Değerlendirmesini yaz.
6. YALNIZCA geçerli JSON döndür:
{
  "overview": "1. Ders ve Konu Genel Çerçevesi: Belgenin kapsamını, ana konusunu ve tüm bölümlerinin bütüncül bağlantısını anlatan 2-3 paragraflık nitelikli giriş özeti",
  "disciplineTag": "${courseName}",
  "extractionNotices": ["Varsa okunamayan/eksik sayfa uyarısı; yoksa []"],
  "keyPoints": ["Nottan 8-12 net ve somut ana çıkarım"],
  "sections": [
    {
      "heading": "Nottaki gerçek ana konu başlığı",
      "pageRange": "Varsa sayfa/slayt aralığı",
      "content": "${wordRange} kelimelik alt başlıklı (####), ayrıntılı, anlaşılır, formül/değişken/tablo/örnek/bağlantı ve sınav vurgusu içeren Türkçe Markdown anlatımı",
      "takeaways": ["Bu bölümden 3-4 net çıkarım"],
      "commonPitfalls": ["Sınavda karıştırılabilecek 1-2 kritik nokta"],
      "checkpointQuestion": {
        "question": "Bölüme özel kontrol sorusu?",
        "options": ["A", "B", "C", "D"],
        "correctIndex": 0,
        "explanation": "Kaynağa dayalı net açıklama."
      }
    }
  ],
  "studyPriorityMap": [
    {
      "topic": "Nottaki gerçek konu başlığı",
      "priority": "critical" | "important" | "review",
      "reason": "Sınavda neden bakılması gerektiğini açıklayan 1-2 net cümle",
      "estimatedMinutes": 8,
      "focusConcepts": ["Kavram 1", "Kavram 2"],
      "likelyQuestionType": "Tanım / Karşılaştırma / Formül & Uygulama / Yorum",
      "sectionIndex": 0
    }
  ],
  "teacherEmphasis": [
    { "point": "Nottaki kritik kavram/ayrıntı", "whyImportant": "Sınavda neden önemli olduğu", "examProbability": "Yüksek" }
  ],
  "memorizeVsInterpret": {
    "memorize": ["Kesin olarak ezberlenmesi gereken tanım/formül/ilke/süre 1", "... (4-6 madde)"],
    "interpret": ["Sınavda yorumlanması ve ilişki kurulması gereken neden-sonuç/mekanizma 1", "... (4-6 madde)"]
  },
  "comparativeMatrix": {
    "title": "Kaynaktaki Kavram / Teori Karşılaştırma Tablosu (metinde karşılaştırılabilir unsurlar varsa)",
    "columns": ["Ölçüt", "Kavram A", "Kavram B"],
    "rows": [["...", "...", "..."]]
  },
  "keyTerms": [{ "term": "Nottaki terim", "definition": "Ayrıntılı ve doğru tanım", "formula": "Varsa kaynaktaki formül" }],
  "summarySynthesis": "9. Konu Değerlendirmesi: Tüm belgenin ana fikrini ve sınav stratejisini toparlayan 1-2 paragraflık kapsayıcı kapanış değerlendirmesi.",
  "studyChecklist": ["Bu notu bitirdiğimde ... konusunu ve ayrımlarını açıklayabilirim."]
}
Tam ${secCount} kapsamlı bölüm üret ve belgenin ilk sayfasından son sayfasına kadar tamamını kapsa.`;

    const userText = `DERS: ${courseName}\nBAŞLIK: ${noteTitle}${canonicalDigestBlock}${warningsBlock}\n\nKAYNAK NOT (YALNIZCA BU METNE SADIK KAL):\n${sampleBalancedContext(
      enrichedContext,
      92_000,
    )}`;
    return { system, userText, maxTokens: 15_500, temperature: 0.22 };
  }

  // --- FLASHCARDS ---
  if (req.materialType === 'flashcards') {
    const cardCount = Math.min(Math.max(req.cardCount || 18, 6), 40);
    const avoidBlock =
      Array.isArray(req.avoidQuestions) && req.avoidQuestions.length > 0
        ? `\nTEKRAR YASAĞI — ÖNCEKİ KARTLAR (AYNISINI VEYA BENZERİNİ ÜRETME):\n${req.avoidQuestions
            .slice(0, 20)
            .map((a, i) => `${i + 1}. ${a}`)
            .join('\n')}`
        : '';
    const priorityBlock =
      Array.isArray(req.priorityTopics) && req.priorityTopics.length > 0
        ? `\nÖNCELİKLİ BÖLÜMLER: ${req.priorityTopics.slice(0, 10).join(' | ')}`
        : '';
    const system = `Sen aktif hatırlama (Active Recall) ve aralıklı tekrar (Spaced Repetition) pedagojisinde uzman bir üniversite hocasısın.
Verilen kaynak materyali ve ortak kaynak analizini temel alarak tam ${cardCount} adet yüksek kalitede, özgün, tekrarsız ve %100 kaynağa sadık Türkçe bilgi kartı üret.
${multiCourseDirective}
${styleInstruction}
${researchInstruction}
${customDirective}${priorityBlock}${avoidBlock}

KURALLAR:
1. YALNIZCA bu kaynaktaki gerçek dersin kavram, tanım, teori, formül ve ayrımlarından kart üret; başka bir dersin bilgilerini KESİNLİKLE karıştırma.
2. Kartların dağılımı %20 "easy" (temel kavram), %50 "medium" (mekanizma/uygulama/neden-sonuç), %30 "hard" (karşılaştırma/analiz/varsayım) olacak şekilde bilişsel derinlik sağla. Tek kelimelik yüzeysel kartlar YASAKTIR.
3. 8 kart türünü ("cardType") dengeli kullan: "concept" | "theory" | "comparison" | "cause_effect" | "formula_model" | "case_study" | "applied" | "analysis".
4. Belgenin başından sonuna tüm önemli başlıkları dengeli dağıt; aynı kavramı farklı kelimelerle iki kez sorma ve "..." ile kesik ön yüz yazma.
5. YALNIZCA geçerli JSON döndür:
{
  "cards": [
    {
      "front": "Net, düşündürücü soru veya kavram istemi (LaTeX destekli)",
      "back": "Kapsamlı, net, kaynağa sadık cevap + varsa kaynaktaki formül veya ayırt edici mekanizma",
      "hint": "Cevabı hatırlamayı tetikleyen 1 kısa ipucu",
      "topic": "Kaynaktaki alt konu (çoklu derste [Ders Adı] — Konu)",
      "sourceSection": "Belgedeki ilgili başlık",
      "sourcePage": "Sayfa/Slayt no (varsa)",
      "cardType": "concept" | "theory" | "comparison" | "cause_effect" | "formula_model" | "case_study" | "applied" | "analysis",
      "difficulty": "easy" | "medium" | "hard",
      "examTip": "Sınavda sorulursa dikkat edilecek kritik tuzak veya püf noktası"
    }
  ]
}`;

    const userText = `DERS: ${courseName}\nBAŞLIK: ${noteTitle}\nZORLUK: ${
      req.difficulty || 'mixed'
    }\nADET: ${cardCount}${req.generationNonce ? `\nOTURUM: ${req.generationNonce}` : ''}${canonicalDigestBlock}${warningsBlock}\n\nKAYNAK MATERYAL:\n${sampleBalancedContext(
      enrichedContext,
      85_000,
    )}`;
    return { system, userText, maxTokens: 10_000, temperature: 0.44 };
  }

  // --- QUIZ ---
  if (req.materialType === 'quiz') {
    const qCount = Math.min(Math.max(req.questionCount || 12, 4), 30);
    const fmt = req.quizFormat || 'multiple_choice';
    const formatInstruction =
      fmt === 'open_ended'
        ? 'Tüm sorular klasik/açık uçlu (short_answer) formatında olsun; her biri için net örnek cevap (sampleAnswer) ve puanlama rubriği yaz.'
        : fmt === 'mixed'
        ? 'Soruların yaklaşık %75i 4 şıklı çoktan seçmeli (multiple_choice), %25i ise analiz gerektiren açık uçlu (short_answer) olsun.'
        : 'Tüm sorular TAM 4 şıklı çoktan seçmeli (multiple_choice) formatında olsun.';
    const easyQuota =
      req.difficultyQuota?.easy ??
      (req.difficulty === 'easy' ? qCount : req.difficulty === 'medium' || req.difficulty === 'hard' ? 0 : Math.max(1, Math.round(qCount * 0.3)));
    const hardQuota =
      req.difficultyQuota?.hard ??
      (req.difficulty === 'hard' ? qCount : req.difficulty === 'easy' || req.difficulty === 'medium' ? 0 : Math.max(1, Math.round(qCount * 0.3)));
    const mediumQuota =
      req.difficultyQuota?.medium ?? Math.max(0, qCount - easyQuota - hardQuota);
    const avoidBlock =
      Array.isArray(req.avoidQuestions) && req.avoidQuestions.length > 0
        ? `\nKESİN TEKRAR YASAĞI — DAHA ÖNCE SORULMUŞ SORULAR / KAVRAMLAR (BUNLARI VE BENZER VARYASYONLARINI KESİNLİKLE TEKRAR ÜRETME):\n${req.avoidQuestions
            .slice(0, 22)
            .map((a, i) => `${i + 1}. ${a}`)
            .join('\n')}`
        : '';
    const priorityBlock =
      Array.isArray(req.priorityTopics) && req.priorityTopics.length > 0
        ? `\nÖNCELİKLİ KONULAR (BU SINAVDA ÖZELLİKLE KAPSA): ${req.priorityTopics.slice(0, 10).join(' | ')}`
        : '';

    const system = `Sen üniversite düzeyinde çok net, özgün, tekrarsız ve akademik açıdan kusursuz sınav soruları hazırlayan uzman bir öğretim üyesisin.
Kullanıcının yüklediği ders notuna ve ortak kaynak analizine %100 sadık kalarak tam ${qCount} soruluk gerçek vize/final deneme testi üret.
${formatInstruction}
BİLİŞSEL ZORLUK DAĞILIMI (kelime uzunluğuna göre değil, bilişsel talebe göre):
- ${easyQuota} adet "easy" (Bilgi ve Kavrama)
- ${mediumQuota} adet "medium" (Yorumlama ve Uygulama)
- ${hardQuota} adet "hard" (Analiz ve Karşılaştırma)${multiCourseDirective}
${customDirective}${priorityBlock}${avoidBlock}

KESİN KURALLAR:
1. %100 KAYNAK VE DERS SADAKATİ: Her soru YALNIZCA kullanıcının yüklediği ders notundaki gerçek bilgilerden ve aynı kaynak analizindeki konulardan üretilmelidir. Başka bir dersin veya alanın kavramlarını KESİNLİKLE sorma ve karıştırma.
2. TEKRAR VE BENZERLİK YASAĞI: Aynı olguyu veya kavramı kelimeleri hafifçe değiştirerek iki kez sorma. Soru sayısını doldurmak için varyasyon üretme; belgenin başından sonuna farklı alt başlıklara ve kazanımlara yayıl.
3. ANLAŞILIR VE EKSİKSİZ SORU KÖKÜ: Her soru açık, dilbilgisi düzgün, kesik ("...") olmayan ve tek bir net cevabı olan gerçek bir üniversite sınav sorusu olsun.
4. TEK DOĞRU CEVAP & GERÇEK ÇELDİRİCİLER: Çoktan seçmeli sorularda TAM 4 farklı şık bulunmalı; YALNIZCA 1 şık kesinlikle doğru, diğer 3 şık ise açıkça yanlış ama mantıklı çeldiriciler olmalıdır. Doğru şıkkın sırasını (0, 1, 2, 3) dengeli dağıt.
5. CEVAP ANAHTARI DOĞRULAMASI: "correctIndex" değerini "explanation" açıklamasıyla birebir doğrula. Her soruda "sourceSection", varsa "sourcePage" ve benzersiz "conceptKey" döndür.
6. YALNIZCA geçerli JSON döndür:
{
  "questions": [
    {
      "type": "multiple_choice" | "short_answer",
      "question": "Net, anlaşılır üniversite sınav sorusu?",
      "options": ["Şık A", "Şık B", "Şık C", "Şık D"],
      "correctIndex": 0,
      "sampleAnswer": "Açık uçlu ise tam puanlık net örnek cevap",
      "rubric": ["Puanlama kriteri 1", "Puanlama kriteri 2"],
      "explanation": "Doğru cevabın nota dayalı anlaşılır açıklaması",
      "distractorExplanations": { "B": "B şıkkının neden yanlış olduğu", "C": "C şıkkının neden yanlış olduğu", "D": "D şıkkının neden yanlış olduğu" },
      "topic": "Nottaki ilgili alt konu (çoklu derste [Ders Adı] — Konu)",
      "sourceSection": "Belgedeki konu başlığı",
      "sourcePage": "Sayfa/Slayt no (varsa)",
      "conceptKey": "kisa_kavram_anahtari",
      "difficulty": "easy" | "medium" | "hard",
      "bloomLevel": "Bilgi ve Kavrama" | "Yorumlama ve Uygulama" | "Analiz ve Karşılaştırma"
    }
  ]
}`;

    const userText = `DERS: ${courseName}\nBAŞLIK: ${noteTitle}\nSINAV ODAĞI: ${
      req.examFocus || 'Vize/Final kapsamlı akademik değerlendirme'
    }${req.generationNonce ? `\nÜRETİM OTURUMU: ${req.generationNonce}` : ''}${canonicalDigestBlock}${warningsBlock}\n\nKAYNAK MATERYAL:\n${sampleBalancedContext(
      enrichedContext,
      85_000,
    )}`;
    return { system, userText, maxTokens: 11_500, temperature: 0.45 };
  }

  // --- VIDEO (High-readability, strictly source-faithful, visual-narration-subtitle synchronized) ---
  const videoPlanDirective =
    req.videoScenarioPlan && Array.isArray(req.videoScenarioPlan.chapters) && req.videoScenarioPlan.chapters.length > 0
      ? `\nÖĞRENCİNİN ONAYLADIĞI SENARYO VE BÖLÜM PLANI (BU BÖLÜMLERİ VE ŞEMA TÜRLERİNİ TAKİP ET):
- Başlık: ${String(req.videoScenarioPlan.lessonTitle || noteTitle).slice(0, 160)}
- Hedefler: ${(req.videoScenarioPlan.learningObjectives || []).slice(0, 5).map((o) => String(o).slice(0, 140)).join(' | ')}
- Bölümler:
${req.videoScenarioPlan.chapters
  .slice(0, 8)
  .map(
    (ch, i) =>
      `  ${i + 1}. ${String(ch.title || '').slice(0, 120)} [Şema: ${String(ch.diagramType || 'visual')}] — ${String(ch.focusNotes || '').slice(0, 200)}`,
  )
  .join('\n')}`
      : '';
  const system = `Sen tüm üniversite dersleri için ders notlarını yüksek okunabilirlikli, %100 konuya ve ortak kaynak analizine sadık, ses-görsel-altyazı birebir uyumlu etkileşimli video derslere dönüştüren akademik senaristsin.
Verilen ders materyalinden 5-8 sahneli, Dr. Deniz (anlatıcı akademisyen) ile Barış (meraklı öğrenci) arasında geçen doğal, akıcı ve %100 not içeriğine bağlı Türkçe Video Ders paketi oluştur.
${multiCourseDirective}${videoPlanDirective}
${styleInstruction}
${customDirective}

KESİN KURALLAR:
1. KONU DIŞI BİLGİ KESİNLİKLE YASAKTIR: Yalnızca kullanıcının yüklediği ders notundaki gerçek dersin kavram, süreç, teori, formül ve bilgilerini anlat. Başka bir dersin terimlerini, uydurma istatistikleri ve klişe sohbet cümlelerini ("Merhaba arkadaşlar", "Akıllı tahtamızda", "Harika bir soru") kesinlikle EKLEME.
2. BELGENİN TAMAMINI SIRAYLA KAPSA: Sahneler belgenin başından sonuna tüm ana ve alt başlıkları mantıklı öğrenme sırasıyla işlemelidir; konu atlama yapma.
3. SES–GÖRSEL–ALTYAZI BİREBİR UYUMU: Her sahnedeki 'diagramData.nodes' kartlarındaki 3-4 kavram, o sahnenin 'turns' konuşmalarında BİZZAT anlatılan kavramlar olmalıdır. Konuşulmayan başlığı veya genel dolgu etiketini ("Temel Kavram 1") ekrana koyma. 'label' en fazla 34 karakter (üç noktasız); 'subtext' en fazla 125 karakter tam cümle olsun.
4. DOĞRU GÖRSEL ŞEMA: Görsel türü olarak 'visual', 'table', 'comparison', 'timeline', 'scenario', 'structure', 'network', 'shapes' türlerini içeriğe uygun kullan. 'curve' türünü YALNIZCA iktisat dersi arz-talep/faiz/eğri dengesi içeriyorsa kullan; 'chart' türünü YALNIZCA ders notunda gerçek sayısal veriler varsa kullan.
5. 'examTip' alanı o sahneye özgü gerçek sınav tuzağını veya kavram ayrımını yazsın.
6. 'visualTheme' değerini dersin gerçek alanına göre seç: "economics" | "history" | "law" | "politics" | "medicine" | "engineering" | "education" | "sports" | "agriculture" | "science" | "society".

YALNIZCA geçerli JSON döndür:
{
  "videoTitle": "Yüklenen ders notunun gerçek ve net başlığı",
  "overview": "Video dersin amacı ve doğrudan nota dayalı özeti",
  "outline": "2-3 cümlelik ders kapsamı",
  "keyFacts": ["Sınavlık kritik çıkarım 1", "Sınavlık kritik çıkarım 2", "Sınavlık kritik çıkarım 3"],
  "scenes": [
    {
      "id": "scene-1",
      "order": 1,
      "title": "Nottaki gerçek bölüm/konu başlığı",
      "turns": [
        { "speaker": "Deniz", "text": "Nottaki kavramı net ve anlaşılır akademik dille açıkla (45-85 kelime)" },
        { "speaker": "Barış", "text": "Deniz hocam hitabıyla doğrudan bu konuya ait anlamlı bir soru (18-30 kelime)" },
        { "speaker": "Deniz", "text": "Soruyu nottaki gerçek mekanizma, koşul veya örnekle yanıtla (40-75 kelime)" }
      ],
      "diagramData": {
        "diagramType": "visual | table | comparison | timeline | scenario | shapes | curve | chart",
        "visualTheme": "economics | history | law | politics | medicine | engineering | education | sports | agriculture | science | society",
        "mainTitle": "Slayt başlığı",
        "highlightMetric": "Nottaki tek cümlelik ana bulgu",
        "nodes": [
          { "label": "Nottan Gerçek Kavram 1", "subtext": "Kısa, net ve kolay okunabilir açıklama (en fazla 130 karakter)", "badge": "Temel Kavram" },
          { "label": "Nottan Gerçek Kavram 2", "subtext": "İkinci bileşenin işleyişi veya ayırt edici yönü", "badge": "Mekanizma" },
          { "label": "Nottan Gerçek Kavram 3", "subtext": "Üçüncü yapısal etken, koşul veya sonuç", "badge": "Sonuç" }
        ]
      },
      "keyTakeaways": ["Madde 1", "Madde 2", "Madde 3"],
      "keyTerms": [{ "term": "Terim", "definition": "Tam ve kısa tanım" }],
      "examTip": "Bu sahneye özgü gerçek sınav ayrımı veya çeldirici uyarısı",
      "visualCue": "Kısa slayt düzeni notu",
      "checkpointQuestion": {
        "question": "Sahne sonu kontrol sorusu",
        "options": ["A", "B", "C", "D"],
        "correctIndex": 0,
        "explanation": "Açıklama"
      }
    }
  ],
  "matchingPairs": [{ "term": "Terim", "definition": "Kısa tam tanım" }],
  "examQuestions": [{ "question": "Soru", "options": ["A","B","C","D"], "correctIndex": 0, "explanation": "Açıklama" }],
  "keyTerms": [{ "term": "Terim", "definition": "Tanım" }]
}`;

  const userText = `DERS: ${courseName}\nBAŞLIK: ${noteTitle}${canonicalDigestBlock}${warningsBlock}\n\nKAYNAK MATERYAL:\n${sampleBalancedContext(
    enrichedContext,
    76_000,
  )}`;
  return { system, userText, maxTokens: 13_500, temperature: 0.28 };
}

function normalizeMaterialContent(materialType: GenerateReq['materialType'], stage: string, raw: any, req: GenerateReq): any {
  if (!raw || typeof raw !== 'object') return null;

  if (stage === 'grade_answer') {
    return {
      score: Math.min(100, Math.max(0, Number(raw.score ?? 0))),
      verdict: String(raw.verdict || 'Değerlendirildi'),
      feedback: String(raw.feedback || ''),
      strengths: Array.isArray(raw.strengths) ? raw.strengths.map(String) : [],
      missingConcepts: Array.isArray(raw.missingConcepts) ? raw.missingConcepts.map(String) : [],
      improvedAnswer: String(raw.improvedAnswer || ''),
    };
  }

  if (stage === 'blueprint') {
    const sectionsPlan = Array.isArray(raw.sectionsPlan)
      ? raw.sectionsPlan.map((s: any, idx: number) => ({
          index: typeof s?.index === 'number' ? s.index : idx,
          title: String(s?.title || `Bölüm ${idx + 1}`),
          pageRange: s?.pageRange ? String(s.pageRange) : undefined,
          focusPoints: Array.isArray(s?.focusPoints) ? s.focusPoints.map(String) : [],
          keyConcepts: Array.isArray(s?.keyConcepts) ? s.keyConcepts.map(String) : [],
        }))
      : [];
    if (sectionsPlan.length === 0) return null;
    return {
      overview: String(raw.overview || ''),
      disciplineTag: raw.disciplineTag ? String(raw.disciplineTag) : undefined,
      extractionNotices: Array.isArray(raw.extractionNotices)
        ? raw.extractionNotices.map(String).filter(Boolean)
        : req.extractionWarnings?.length
        ? req.extractionWarnings
        : undefined,
      keyPoints: Array.isArray(raw.keyPoints) ? raw.keyPoints.map(String) : [],
      sectionsPlan,
      teacherEmphasis: Array.isArray(raw.teacherEmphasis) ? raw.teacherEmphasis : [],
      comparativeMatrix: raw.comparativeMatrix?.columns && Array.isArray(raw.comparativeMatrix?.rows)
        ? raw.comparativeMatrix
        : undefined,
      deepResearchTopics: Array.isArray(raw.deepResearchTopics) ? raw.deepResearchTopics : [],
      keyTerms: Array.isArray(raw.keyTerms) ? raw.keyTerms : [],
      memorizeVsInterpret:
        raw.memorizeVsInterpret?.memorize || raw.memorizeVsInterpret?.interpret
          ? {
              memorize: Array.isArray(raw.memorizeVsInterpret.memorize)
                ? raw.memorizeVsInterpret.memorize.map(String).filter(Boolean)
                : [],
              interpret: Array.isArray(raw.memorizeVsInterpret.interpret)
                ? raw.memorizeVsInterpret.interpret.map(String).filter(Boolean)
                : [],
            }
          : undefined,
      summarySynthesis: raw.summarySynthesis ? String(raw.summarySynthesis).trim() : undefined,
      studyPriorityMap: Array.isArray(raw.studyPriorityMap) ? raw.studyPriorityMap : [],
      studyChecklist: Array.isArray(raw.studyChecklist) ? raw.studyChecklist.map(String) : [],
    };
  }

  if (stage === 'expand_batch' || stage === 'quality_repair') {
    const sections = Array.isArray(raw.sections)
      ? raw.sections
          .filter((s: any) => s && (s.content || s.heading))
          .map((s: any, idx: number) => ({
            index: typeof s?.index === 'number' ? s.index : idx,
            heading: String(s?.heading || s?.title || `Bölüm ${idx + 1}`),
            pageRange: s?.pageRange ? String(s.pageRange) : undefined,
            content: String(s?.content || ''),
            takeaways: Array.isArray(s?.takeaways) ? s.takeaways.map(String) : [],
            deepResearchNote: s?.deepResearchNote ? String(s.deepResearchNote) : undefined,
            commonPitfalls: Array.isArray(s?.commonPitfalls) ? s.commonPitfalls.map(String) : [],
            checkpointQuestion:
              s?.checkpointQuestion?.question && Array.isArray(s?.checkpointQuestion?.options)
                ? s.checkpointQuestion
                : undefined,
          }))
      : [];
    if (sections.length === 0) return null;
    return { sections };
  }

  if (stage === 'synthesize_merge') {
    return {
      overview: typeof raw.overview === 'string' ? raw.overview.trim() : '',
      comparativeMatrix:
        raw.comparativeMatrix?.columns && Array.isArray(raw.comparativeMatrix?.rows)
          ? raw.comparativeMatrix
          : undefined,
      summarySynthesis: typeof raw.summarySynthesis === 'string' ? raw.summarySynthesis.trim() : '',
    };
  }

  if (stage === 'analyze_chunk') {
    const sections = Array.isArray(raw.sections) ? raw.sections : [];
    if (sections.length === 0) return null;
    return {
      overviewSnippet: String(raw.overviewSnippet || raw.overview || ''),
      keyPoints: Array.isArray(raw.keyPoints) ? raw.keyPoints.map(String) : [],
      sections: sections.map((s: any, idx: number) => ({
        index: typeof s?.index === 'number' ? s.index : idx,
        heading: String(s?.heading || s?.title || `Bölüm ${idx + 1}`),
        pageRange: s?.pageRange ? String(s.pageRange) : req.chunkMeta?.pageRangeLabel,
        content: String(s?.content || ''),
        takeaways: Array.isArray(s?.takeaways) ? s.takeaways.map(String) : [],
        deepResearchNote: s?.deepResearchNote ? String(s.deepResearchNote) : undefined,
        commonPitfalls: Array.isArray(s?.commonPitfalls) ? s.commonPitfalls.map(String) : [],
        checkpointQuestion:
          s?.checkpointQuestion?.question && Array.isArray(s?.checkpointQuestion?.options)
            ? s.checkpointQuestion
            : undefined,
      })),
      comparativeMatrix:
        raw.comparativeMatrix?.columns && Array.isArray(raw.comparativeMatrix?.rows)
          ? raw.comparativeMatrix
          : undefined,
      keyTerms: Array.isArray(raw.keyTerms) ? raw.keyTerms : [],
      teacherEmphasis: Array.isArray(raw.teacherEmphasis) ? raw.teacherEmphasis : [],
      memorizeVsInterpret: raw.memorizeVsInterpret,
      studyChecklist: Array.isArray(raw.studyChecklist) ? raw.studyChecklist.map(String) : [],
      synthesisSnippet: String(raw.synthesisSnippet || raw.summarySynthesis || ''),
    };
  }

  if (materialType === 'summary') {
    const sections = Array.isArray(raw.sections) ? raw.sections : [];
    if (!raw.overview && sections.length === 0) return null;
    return {
      overview: String(raw.overview || ''),
      disciplineTag: raw.disciplineTag ? String(raw.disciplineTag) : undefined,
      extractionNotices: Array.isArray(raw.extractionNotices)
        ? raw.extractionNotices.map(String).filter(Boolean)
        : req.extractionWarnings?.length
        ? req.extractionWarnings
        : undefined,
      keyPoints: Array.isArray(raw.keyPoints) ? raw.keyPoints.map(String) : [],
      sections: sections.map((s: any, idx: number) => ({
        heading: String(s?.heading || s?.title || `Bölüm ${idx + 1}`),
        pageRange: s?.pageRange ? String(s.pageRange) : undefined,
        content: String(s?.content || ''),
        takeaways: Array.isArray(s?.takeaways) ? s.takeaways.map(String) : [],
        deepResearchNote: s?.deepResearchNote ? String(s.deepResearchNote) : undefined,
        commonPitfalls: Array.isArray(s?.commonPitfalls) ? s.commonPitfalls.map(String) : [],
        checkpointQuestion:
          s?.checkpointQuestion?.question && Array.isArray(s?.checkpointQuestion?.options)
            ? s.checkpointQuestion
            : undefined,
      })),
      teacherEmphasis: Array.isArray(raw.teacherEmphasis) ? raw.teacherEmphasis : [],
      comparativeMatrix: raw.comparativeMatrix?.columns && Array.isArray(raw.comparativeMatrix?.rows)
        ? raw.comparativeMatrix
        : undefined,
      deepResearchTopics: Array.isArray(raw.deepResearchTopics) ? raw.deepResearchTopics : [],
      keyTerms: Array.isArray(raw.keyTerms) ? raw.keyTerms : [],
      memorizeVsInterpret:
        raw.memorizeVsInterpret?.memorize || raw.memorizeVsInterpret?.interpret
          ? {
              memorize: Array.isArray(raw.memorizeVsInterpret.memorize)
                ? raw.memorizeVsInterpret.memorize.map(String).filter(Boolean)
                : [],
              interpret: Array.isArray(raw.memorizeVsInterpret.interpret)
                ? raw.memorizeVsInterpret.interpret.map(String).filter(Boolean)
                : [],
            }
          : undefined,
      summarySynthesis: raw.summarySynthesis ? String(raw.summarySynthesis).trim() : undefined,
      studyPriorityMap: Array.isArray(raw.studyPriorityMap) ? raw.studyPriorityMap : [],
      studyChecklist: Array.isArray(raw.studyChecklist) ? raw.studyChecklist.map(String) : [],
    };
  }

  if (materialType === 'flashcards') {
    const seenFronts = new Set<string>();
    const cards = Array.isArray(raw.cards)
      ? raw.cards
          .filter((c: any) => {
            const front = String(c?.front || '').trim();
            const back = String(c?.back || '').trim();
            if (front.length < 6 || back.length < 10) return false;
            const norm = front.toLocaleLowerCase('tr-TR').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
            if (!norm || seenFronts.has(norm)) return false;
            seenFronts.add(norm);
            return true;
          })
          .map((c: any) => ({
            front: String(c.front).trim(),
            back: String(c.back).trim(),
            hint: c.hint ? String(c.hint).trim() : undefined,
            topic: c.topic ? String(c.topic).trim() : req.course || 'Genel',
            sourceSection: c.sourceSection ? String(c.sourceSection).trim() : undefined,
            sourcePage: c.sourcePage ? String(c.sourcePage).trim() : undefined,
            cardType: [
              'concept',
              'theory',
              'comparison',
              'cause_effect',
              'formula_model',
              'case_study',
              'applied',
              'analysis',
            ].includes(c.cardType)
              ? c.cardType
              : undefined,
            difficulty: ['easy', 'medium', 'hard'].includes(c.difficulty) ? c.difficulty : 'medium',
            examTip: c.examTip ? String(c.examTip).trim() : undefined,
          }))
      : [];
    return cards.length > 0 ? { cards } : null;
  }

  if (materialType === 'quiz') {
    const seenStems = new Set<string>();
    const questions = Array.isArray(raw.questions)
      ? raw.questions
          .map((q: any) => {
            const stem = String(q?.question || '').replace(/\s+/g, ' ').trim();
            if (stem.length < 18 || /(?:\.\.\.|…)/.test(stem)) return null;
            const normStem = stem.toLocaleLowerCase('tr-TR').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
            if (!normStem || seenStems.has(normStem)) return null;

            const isOpen = q.type === 'short_answer' || q.type === 'open_ended';
            if (isOpen) {
              const sampleAnswer = String(q.sampleAnswer || q.explanation || '').trim();
              if (sampleAnswer.length < 14) return null;
              seenStems.add(normStem);
              return {
                type: 'short_answer',
                question: stem,
                options: [],
                correctIndex: 0,
                sampleAnswer,
                rubric: Array.isArray(q.rubric) ? q.rubric.map(String).filter(Boolean).slice(0, 5) : undefined,
                explanation: String(q.explanation || sampleAnswer).trim(),
                topic: q.topic ? String(q.topic).trim() : req.course || 'Genel',
                sourceSection: q.sourceSection ? String(q.sourceSection).trim() : undefined,
                sourcePage: q.sourcePage ? String(q.sourcePage).trim() : undefined,
                conceptKey: q.conceptKey ? String(q.conceptKey).trim() : undefined,
                difficulty: ['easy', 'medium', 'hard'].includes(q.difficulty) ? q.difficulty : 'medium',
                bloomLevel: q.bloomLevel ? String(q.bloomLevel).trim() : 'Analiz ve Karşılaştırma',
              };
            }

            if (!Array.isArray(q.options)) return null;
            const opts = q.options
              .map((o: unknown) => String(o || '').replace(/^[A-Da-d]\s*[).:\-]\s*/, '').trim())
              .filter(Boolean)
              .slice(0, 4);
            // Require strictly 4 unique options and an explicit valid correctIndex (never corrupt answer key!)
            if (opts.length !== 4) return null;
            const uniqOpts = new Set(opts.map((o: string) => o.toLocaleLowerCase('tr-TR')));
            if (uniqOpts.size < 4) return null;

            const rawCorrect = Number(q.correctIndex);
            if (
              q.correctIndex === undefined ||
              q.correctIndex === null ||
              !Number.isInteger(rawCorrect) ||
              rawCorrect < 0 ||
              rawCorrect >= 4
            ) {
              return null;
            }
            const explanation = String(q.explanation || '').trim();
            if (explanation.length < 16) return null;

            const cleanedDistractors: Record<string, string> = {};
            if (q.distractorExplanations && typeof q.distractorExplanations === 'object') {
              const correctLetter = String.fromCharCode(65 + rawCorrect);
              for (const [k, v] of Object.entries(q.distractorExplanations as Record<string, unknown>)) {
                const letter = k.trim().toUpperCase();
                const text = String(v || '').trim();
                if (/^[A-D]$/.test(letter) && letter !== correctLetter && text.length >= 6) {
                  cleanedDistractors[letter] = text;
                }
              }
            }

            seenStems.add(normStem);
            return {
              type: 'multiple_choice',
              question: stem,
              options: opts,
              correctIndex: rawCorrect,
              explanation,
              distractorExplanations:
                Object.keys(cleanedDistractors).length > 0 ? cleanedDistractors : undefined,
              topic: q.topic ? String(q.topic).trim() : req.course || 'Genel',
              sourceSection: q.sourceSection ? String(q.sourceSection).trim() : undefined,
              sourcePage: q.sourcePage ? String(q.sourcePage).trim() : undefined,
              conceptKey: q.conceptKey ? String(q.conceptKey).trim() : undefined,
              difficulty: ['easy', 'medium', 'hard'].includes(q.difficulty) ? q.difficulty : 'medium',
              bloomLevel: q.bloomLevel ? String(q.bloomLevel).trim() : 'Yorumlama ve Uygulama',
            };
          })
          .filter(Boolean)
      : [];
    return questions.length > 0 ? { questions } : null;
  }

  if (materialType === 'video') {
    const rawScenes = Array.isArray(raw.scenes) ? raw.scenes : [];
    if (rawScenes.length === 0) return null;
    const scenes = rawScenes.map((sc: any, idx: number) => {
      const turns = Array.isArray(sc?.turns)
        ? sc.turns
            .map((t: any) => ({
              speaker: String(t?.speaker || '').toLocaleLowerCase('tr-TR').includes('bar') ? 'Barış' : 'Deniz',
              text: String(t?.text || '').replace(/\s+/g, ' ').trim(),
            }))
            .filter((t: { text: string }) => t.text.length >= 12)
        : [];
      // Strictly synchronize narration with concatenated turns so TTS and subtitles always match
      const narration =
        turns.length > 0
          ? turns.map((t: { text: string }) => t.text).join(' ')
          : String(sc?.narration || '').replace(/\s+/g, ' ').trim();
      return {
        ...sc,
        id: String(sc?.id || `scene-${idx + 1}`),
        order: Number(sc?.order || idx + 1),
        title: String(sc?.title || `Bölüm ${idx + 1}`).trim(),
        narration,
        turns,
      };
    });
    return {
      videoTitle: String(raw.videoTitle || req.noteTitle || ''),
      overview: String(raw.overview || raw.outline || ''),
      outline: String(raw.outline || raw.overview || ''),
      videoScript: scenes.map((s: any) => s.narration || '').join('\n\n'),
      totalEstimatedDurationSec: Number(raw.totalEstimatedDurationSec || scenes.length * 60),
      scenes,
      keyFacts: Array.isArray(raw.keyFacts) ? raw.keyFacts : [],
      matchingPairs: Array.isArray(raw.matchingPairs) ? raw.matchingPairs : [],
      examQuestions: Array.isArray(raw.examQuestions) ? raw.examQuestions : [],
      keyTerms: Array.isArray(raw.keyTerms) ? raw.keyTerms : [],
      extractionNotices: req.extractionWarnings?.length ? req.extractionWarnings : undefined,
    };
  }

  return raw;
}

/**
 * Clean fallback synthesizer without repetitive boilerplate.
 * Preserves actual parsed sections/sentences from source text.
 */
function buildServerFallback(req: GenerateReq, cleanText: string): any {
  const course = req.course || 'Ders Materyali';
  const title = req.noteTitle || 'Çalışma Özeti';
  const stage = req.stage || 'single';

  const lines = cleanText
    .split(/\n+/)
    .map((l) => l.trim())
    .filter((l) => l.length > 8);

  const sentences = cleanText
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.replace(/^---\s*Sayfa\s*\d+\s*---/i, '').trim())
    .filter((s) => s.length >= 35 && s.length <= 500);

  if (stage === 'grade_answer' && req.gradePayload) {
    const rubricWords = req.gradePayload.rubricAnswer
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 4);
    const ansLower = req.gradePayload.studentAnswer.toLowerCase();
    const matched = rubricWords.filter((w) => ansLower.includes(w));
    const ratio = rubricWords.length > 0 ? matched.length / Math.min(rubricWords.length, 15) : 0.5;
    const score = Math.min(95, Math.max(25, Math.round(ratio * 100)));
    return {
      score,
      verdict: score >= 75 ? 'Güçlü Cevap' : score >= 50 ? 'Kısmi Doğru' : 'Geliştirilmeli',
      feedback:
        'Cevabınız örnek çözümdeki temel anahtar kelimelerle otomatik rubrik üzerinden karşılaştırıldı.',
      strengths: matched.slice(0, 4).map((w) => `İlgili kavram kullanımı: ${w}`),
      missingConcepts: rubricWords
        .filter((w) => !ansLower.includes(w))
        .slice(0, 4)
        .map((w) => `Örnek çözümdeki eksik kavram: ${w}`),
      improvedAnswer: req.gradePayload.rubricAnswer,
    };
  }

  if (stage === 'blueprint') {
    const chunkSize = Math.max(1, Math.ceil(lines.length / 6));
    const sectionsPlan = Array.from({ length: Math.min(6, Math.max(2, Math.ceil(lines.length / 10))) }, (_, i) => {
      const slice = lines.slice(i * chunkSize, (i + 1) * chunkSize);
      const heading = slice.find((l) => l.length < 90 && !l.startsWith('---')) || `${title} — Bölüm ${i + 1}`;
      return {
        index: i,
        title: heading.replace(/^#+\s*/, ''),
        focusPoints: slice.slice(1, 5).map((s) => s.slice(0, 95)),
        keyConcepts: [],
      };
    });
    return {
      overview: sentences.slice(0, 3).join(' ') || `${course} — ${title} yapılandırılmış ders incelemesi.`,
      keyPoints: sentences.slice(0, 8).map((s) => s.slice(0, 180)),
      sectionsPlan,
      teacherEmphasis: sentences.slice(0, 4).map((s, idx) => ({
        point: `${title} — Kritik İlke ${idx + 1}`,
        whyImportant: s.slice(0, 150),
        examProbability: idx < 2 ? 'Yüksek' : 'Orta',
      })),
      keyTerms: [],
      studyChecklist: sectionsPlan.map((s) => `${s.title} konusundaki temel ilkeleri ve ayrımları açıklayabilirim.`),
    };
  }

  if (stage === 'expand_batch') {
    const targets = req.sectionTargets || [];
    return {
      sections: targets.map((t) => {
        const segSents = (t.contextSlice || '')
          .split(/(?<=[.!?])\s+|\n+/)
          .map((s) => s.trim())
          .filter((s) => s.length >= 24);
        const coreProse = segSents.slice(0, 4).join(' ') || t.contextSlice?.trim() || `${t.title} analizi.`;
        const bullets = (t.focusPoints && t.focusPoints.length > 0 ? t.focusPoints : segSents.slice(1, 5))
          .slice(0, 4)
          .map((p) => `- **Anahtar Nokta:** ${p}`);
        const content = [
          `#### Kavramsal Öz ve Ana Tez\n\n${coreProse}`,
          bullets.length > 0 ? `#### Neden–Sonuç Zinciri ve Ayırt Edici İlkeler\n${bullets.join('\n')}` : '',
          segSents[segSents.length - 1] ? `> **Sınav Odağı:** ${segSents[segSents.length - 1]}` : '',
        ]
          .filter(Boolean)
          .join('\n\n');
        return {
          index: t.index,
          heading: t.title,
          pageRange: t.pageRange,
          content,
          takeaways: (t.focusPoints && t.focusPoints.length > 0 ? t.focusPoints : segSents).slice(0, 3),
          commonPitfalls: [],
        };
      }),
    };
  }

  if (req.materialType === 'flashcards') {
    const count = Math.min(req.cardCount || 12, Math.max(4, sentences.length));
    return {
      cards: Array.from({ length: count }, (_, idx) => {
        const s = sentences[idx % Math.max(1, sentences.length)] || `${title} ana ilkesi`;
        const colon = s.split(/[:–—]/);
        const subject =
          colon.length >= 2 && colon[0].trim().length <= 44
            ? colon[0].trim()
            : s.split(/\s+/).slice(0, 4).join(' ').replace(/[,.;:!?]$/, '');
        return {
          front: `${subject} kavramının ${course} kapsamındaki temel tanımı veya işlevi nedir?`,
          back: s,
          topic: course,
          difficulty: idx % 3 === 0 ? 'hard' : idx % 2 === 0 ? 'medium' : 'easy',
        };
      }),
    };
  }

  if (req.materialType === 'quiz') {
    // Clean, valid server fallback using open-ended or distinct concept-pinned items (never broken all-true distractors!)
    const count = Math.min(req.questionCount || 6, Math.max(3, sentences.length));
    const conceptPairs = sentences
      .map((s, idx) => {
        const colon = s.split(/[:–—]/);
        const term =
          colon.length >= 2 && colon[0].trim().length >= 4 && colon[0].trim().length <= 42
            ? colon[0].trim()
            : s.split(/\s+/).slice(0, 3).join(' ').replace(/[,.;:!?]$/, '');
        const predicate =
          colon.length >= 2 && colon.slice(1).join(':').trim().length >= 20
            ? colon.slice(1).join(':').trim()
            : s;
        return { term, predicate, full: s, idx };
      })
      .filter((p) => p.term.length >= 4 && p.predicate.length >= 20);

    return {
      questions: Array.from({ length: count }, (_, idx) => {
        const item = conceptPairs[idx % Math.max(1, conceptPairs.length)];
        const others = conceptPairs.filter((o) => o.term.toLowerCase() !== item?.term.toLowerCase());
        if (!item || others.length < 3 || req.quizFormat === 'open_ended') {
          const sent = sentences[idx % Math.max(1, sentences.length)] || `${title} temel kavramı`;
          return {
            type: 'short_answer',
            question: `${title} kapsamında "${item?.term || course}" kavramının işlevini ve kaynak metindeki temel sonucunu açıklayınız.`,
            options: [],
            correctIndex: 0,
            sampleAnswer: sent,
            rubric: ['Kavramın doğru tanımlanması', 'Kaynak metindeki neden-sonuç ilişkisinin açıklanması'],
            explanation: `Kaynak metne göre: ${sent}`,
            topic: course,
            difficulty: idx % 3 === 0 ? 'hard' : idx % 2 === 0 ? 'medium' : 'easy',
            bloomLevel: 'Yorumlama ve Uygulama',
          };
        }

        const distractors = others.slice(0, 3).map((o) => o.predicate.slice(0, 155));
        const correctIndex = idx % 4;
        const options = [...distractors];
        options.splice(correctIndex, 0, item.predicate.slice(0, 155));
        return {
          type: 'multiple_choice',
          question: `${title} ders notuna göre "${item.term}" kavramı için aşağıdakilerden hangisi doğrudur?`,
          options: options.slice(0, 4),
          correctIndex,
          explanation: `Kaynak metne göre ${item.term}: ${item.full}`,
          topic: course,
          sourceSection: title,
          difficulty: idx % 3 === 0 ? 'hard' : idx % 2 === 0 ? 'medium' : 'easy',
          bloomLevel: idx % 3 === 0 ? 'Analiz ve Karşılaştırma' : idx % 2 === 0 ? 'Yorumlama ve Uygulama' : 'Bilgi ve Kavrama',
        };
      }),
    };
  }

  if (req.materialType === 'video') {
    const diagramPalette = ['visual', 'table', 'timeline', 'shapes', 'scenario', 'comparison'] as const;
    const chunkCount = Math.min(6, Math.max(3, Math.ceil(sentences.length / 3)));
    const scenes = Array.from({ length: chunkCount }, (_, i) => {
      const seg = sentences.slice(i * 3, i * 3 + 4);
      const safeSeg = seg.length > 0 ? seg : [`${title} dersinin ${i + 1}. analitik ekseni incelenmektedir.`];
      const narration = safeSeg.join(' ');
      const nodes = safeSeg.slice(0, 4).map((s, ni) => ({
        label: s.split(/[:–-]/)[0]?.trim().split(/\s+/).slice(0, 4).join(' ') || `İlke ${ni + 1}`,
        subtext: s.slice(0, 160),
        badge: ['Temel İlke', 'Mekanizma', 'Koşul', 'Sonuç'][ni % 4],
        value: 88 - ni * 8,
      }));
      return {
        id: `scene-${i + 1}`,
        order: i + 1,
        title: nodes[0]?.label && nodes[0].label.length >= 6 ? `${title} — ${nodes[0].label}` : `${title} — Bölüm ${i + 1}`,
        turns: [
          { speaker: 'Deniz', text: safeSeg[0] },
          { speaker: 'Barış', text: `Deniz hocam, ${nodes[0]?.label || 'bu başlık'} uygulamada nasıl işliyor?` },
          { speaker: 'Deniz', text: safeSeg.slice(1).join(' ') || safeSeg[0] },
        ],
        diagramData: {
          diagramType: diagramPalette[i % diagramPalette.length],
          mainTitle: `${title} — Görsel Model ${i + 1}`,
          highlightMetric: safeSeg[safeSeg.length - 1]?.slice(0, 140) || title,
          nodes,
        },
        narration,
        keyTakeaways: safeSeg.slice(0, 3),
        examTip: (safeSeg[1] || safeSeg[0]).slice(0, 160),
        keyTerms: [],
      };
    });
    return {
      videoTitle: title,
      outline: sentences.slice(0, 2).join(' ') || `${course} — ${title}`,
      overview: sentences.slice(0, 2).join(' ') || `${course} — ${title}`,
      videoScript: scenes.map((s) => s.narration).join('\n\n'),
      totalEstimatedDurationSec: scenes.length * 60,
      scenes,
      keyTerms: [],
    };
  }

  // Summary fallback formatting cleanly into structured study sections without raw text dumps
  const groupCount = Math.min(6, Math.max(2, Math.ceil(sentences.length / 4)));
  const perGroup = Math.max(1, Math.ceil(sentences.length / groupCount));
  const sections = Array.from({ length: groupCount }, (_, i) => {
    const seg = sentences.slice(i * perGroup, (i + 1) * perGroup);
    const prose = seg.slice(0, 3).join(' ') || cleanText.slice(i * 600, (i + 1) * 600);
    const bullets = seg.slice(0, 4).map((s) => `- **Temel Nokta:** ${s}`);
    return {
      heading: `${title} — Bölüm ${i + 1}`,
      content: `#### Kavramsal Öz ve Temel Çerçeve\n\n${prose}\n\n#### Öne Çıkan İlkeler ve Mekanizma\n${bullets.join('\n')}`,
      takeaways: seg.slice(0, 3).map((s) => s.slice(0, 140)),
    };
  });

  return {
    overview: sentences.slice(0, 3).join(' ') || cleanText.slice(0, 450),
    keyPoints: sentences.slice(0, 6).map((s) => s.slice(0, 175)),
    sections,
    teacherEmphasis: sentences.slice(0, 4).map((s, idx) => ({
      point: `${title} — Önemli Ayrım ${idx + 1}`,
      whyImportant: s.slice(0, 150),
      examProbability: idx < 2 ? 'Yüksek' : 'Orta',
    })),
    keyTerms: [],
    studyChecklist: sections.map((s) => `"${s.heading}" bölümünün ana fikrini açıklayabilirim.`),
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflightResponse(req);
  if (req.method !== 'POST') {
    return jsonResponse(req, { error: 'Yalnızca POST desteklenir.' }, 405);
  }
  if (!isTrustedOrigin(req.headers.get('origin'))) {
    return jsonResponse(req, { error: 'Yetkisiz istek kaynağı.' }, 403);
  }

  try {
    const authUser = await getAuthenticatedUser(req);
    if (!authUser?.id) {
      return jsonResponse(req, { error: 'Oturum doğrulanamadı. Lütfen tekrar giriş yapın.' }, 401);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const adminClient =
      supabaseUrl && serviceKey
        ? createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
        : null;
    await enforceRateLimit(
      adminClient,
      `generate_study_material:${authUser.id}`,
      45,
      600,
      'Çalışma Stüdyosu üretim hız sınırına ulaşıldı. Lütfen birkaç dakika sonra tekrar deneyin.',
    );

    const body = await readJsonBody<GenerateReq>(req, 12_000_000);
    if (!body?.materialType || !VALID_MATERIAL_TYPES.includes(body.materialType)) {
      return jsonResponse(req, { error: 'Geçersiz materyal türü.' }, 400);
    }
    const stage = body.stage || 'single';
    if (!ALLOWED_STAGES.has(stage)) {
      return jsonResponse(req, { error: 'Geçersiz üretim aşaması.' }, 400);
    }
    if (stage === 'grade_answer' && body.gradePayload) {
      const gp = body.gradePayload as unknown as Record<string, unknown>;
      if (
        typeof gp.question !== 'string' ||
        typeof gp.rubricAnswer !== 'string' ||
        typeof gp.studentAnswer !== 'string'
      ) {
        return jsonResponse(req, { error: 'Değerlendirme verisi geçersiz.' }, 400);
      }
    }

    let enrichedContext = sanitizeText(typeof body.noteContext === 'string' ? body.noteContext : '');

    // Transcribe audio attachment cleanly with MIME validation
    if (body.audio?.data && typeof body.audio.data === 'string') {
      if (body.audio.mimeType && !ALLOWED_AUDIO_MIME_RE.test(body.audio.mimeType)) {
        return jsonResponse(req, { error: 'Desteklenmeyen ses dosyası türü.' }, 400);
      }
      const transcript = await transcribeAudioMedia(body.audio);
      if (transcript) {
        enrichedContext = enrichedContext
          ? `${enrichedContext}\n\n[SES KAYDI TRANSKRİPTİ]\n${transcript}`
          : transcript;
      }
    }

    // Strict MIME + base64 validation for images/PDF attachments (blocks SVG/HTML injection in data URIs)
    const imageParts: Array<{ type: 'image_url'; image_url: { url: string; detail: 'high' } }> = [];
    if (body.document?.data && typeof body.document.data === 'string') {
      const docMime = String(body.document.mimeType || '').trim().toLowerCase();
      if (ALLOWED_IMAGE_MIME_RE.test(docMime)) {
        const cleanB64 = (body.document.data.includes(',')
          ? body.document.data.split(',').pop() || ''
          : body.document.data
        ).replace(/\s+/g, '');
        if (cleanB64.length >= 16 && BASE64_CLEAN_RE.test(cleanB64)) {
          imageParts.push({
            type: 'image_url',
            image_url: { url: `data:${docMime};base64,${cleanB64}`, detail: 'high' },
          });
        }
      } else if (docMime === 'application/pdf') {
        const pdfText = await extractPdfViaGemini(body.document);
        if (pdfText) {
          enrichedContext = enrichedContext ? `${enrichedContext}\n\n${pdfText}` : pdfText;
        }
      } else if (docMime) {
        return jsonResponse(req, { error: 'Desteklenmeyen belge formatı.' }, 400);
      }
    }

    if (Array.isArray(body.images) && body.images.length > 0) {
      for (const img of body.images.slice(0, 8)) {
        if (!img?.data || typeof img.data !== 'string') continue;
        const mime = String(img.mimeType || 'image/jpeg').trim().toLowerCase();
        if (!ALLOWED_IMAGE_MIME_RE.test(mime)) continue;
        const cleanB64 = (img.data.includes(',') ? img.data.split(',').pop() || '' : img.data).replace(/\s+/g, '');
        if (cleanB64.length < 16 || !BASE64_CLEAN_RE.test(cleanB64)) continue;
        imageParts.push({
          type: 'image_url',
          image_url: { url: `data:${mime};base64,${cleanB64}`, detail: 'high' },
        });
      }
    }

    const hasUsableContext =
      enrichedContext.length >= 20 || imageParts.length > 0 || (stage === 'grade_answer' && !!body.gradePayload);

    if (!hasUsableContext) {
      return jsonResponse(
        req,
        {
          error:
            'Materyalden yeterli metin veya görsel çıkarılamadı. PDF taranmışsa sayfaların görsel olarak işlenmesini bekleyin veya metin ekleyin.',
        },
        400,
      );
    }

    const { system: rawSystem, userText: rawUserText, maxTokens, temperature } = buildStagePrompts(
      body,
      enrichedContext,
    );
    const system = `${rawSystem}\n\n${ANTI_INJECTION_SYSTEM_GUARD}`;
    const userText =
      stage === 'grade_answer' ? rawUserText : wrapUntrustedPromptData('study_source_document', rawUserText);

    const userContent:
      | string
      | Array<
          | { type: 'text'; text: string }
          | { type: 'image_url'; image_url: { url: string; detail?: 'high' | 'auto' | 'low' } }
        > =
      imageParts.length > 0
        ? [{ type: 'text', text: userText }, ...imageParts]
        : userText;

    let normalizedContent: any = null;
    let usedAi = false;

    try {
      const isHighVolumeChunk =
        stage === 'analyze_chunk' &&
        Number(body.chunkMeta?.total ?? 1) > 4 &&
        imageParts.length === 0 &&
        !body.deepResearch;
      const preferPro =
        !isHighVolumeChunk &&
        (body.materialType === 'summary' ||
          body.materialType === 'video' ||
          stage === 'synthesize_merge' ||
          stage === 'quality_repair' ||
          Boolean(body.deepResearch));
      const completion = await createChatCompletion({
        model: preferPro ? 'google/gemini-2.5-pro' : 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: userContent },
        ],
        responseFormat: 'json_object',
        temperature,
        max_tokens: maxTokens,
        timeoutMs: 95_000,
        allowPublicFallback: false,
      });

      const candidate =
        completion.parsedJson ?? extractJsonFromText(completion.content || '');
      if (candidate) {
        normalizedContent = normalizeMaterialContent(body.materialType, stage, candidate, body);
        if (normalizedContent) {
          usedAi = true;
        }
      }
    } catch {
      console.warn('Edge AI synthesis fell back after gateway error');
    }

    if (!normalizedContent) {
      normalizedContent = buildServerFallback(body, enrichedContext);
    }

    normalizedContent = sanitizeJsonStringsDeep(normalizedContent);

    return jsonResponse(req, {
      content: normalizedContent,
      model: usedAi ? 'EconNotes Deep Academic AI' : 'EconNotes Yerel Yapısal Ayrıştırıcı',
      sourceMode: usedAi ? 'ai' : 'fallback',
    });
  } catch (e) {
    console.error('generate-study-material error');
    if (e instanceof RequestError) {
      return jsonResponse(req, { error: e.message }, e.status);
    }
    return jsonResponse(
      req,
      { error: 'Materyal oluşturulurken beklenmeyen bir hata oluştu.' },
      500,
    );
  }
});
