import { createChatCompletion, extractJsonFromText } from '../_shared/openai-gateway.ts';
import {
  getAuthenticatedUser,
  isTrustedOrigin,
  jsonResponse,
  preflightResponse,
  readJsonBody,
  RequestError,
} from '../_shared/request-security.ts';

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
  stage?: 'single' | 'blueprint' | 'expand_batch' | 'grade_answer';
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
  quizFormat?: 'multiple_choice' | 'open_ended' | 'mixed';
  examFocus?: string;
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
    .replace(/\r\n/g, '\n')
    .trim();
}

/**
 * Evenly samples context from beginning, middle, and end when source exceeds single-prompt budget,
 * so slide decks and textbooks never lose later chapters.
 */
function sampleBalancedContext(text: string, maxChars = 75_000): string {
  const clean = sanitizeText(text);
  if (clean.length <= maxChars) return clean;

  const chunkCount = 7;
  const perChunk = Math.floor(maxChars / chunkCount) - 80;
  const step = Math.floor(clean.length / chunkCount);
  const parts: string[] = [];
  for (let i = 0; i < chunkCount; i++) {
    const start = i * step;
    const end = Math.min(clean.length, start + perChunk);
    const pct = Math.round((start / clean.length) * 100);
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
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(
          geminiKey,
        )}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: 'Bu ders ses kaydını Türkçe ve varsa İngilizce/akademik terimleri koruyarak kelimesi kelimesine eksiksiz transkribe et.',
                  },
                  {
                    inlineData: {
                      mimeType: audio.mimeType || 'audio/mpeg',
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
    } catch (err) {
      console.warn('Gemini audio transcription failed:', err);
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
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(
        geminiKey,
      )}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: 'Bu PDF belgesindeki tüm sayfa metinlerini, başlıkları, formülleri (LaTeX $...$ formatında) ve tabloları sayfa numaralarıyla birlikte eksiksiz çıkar.',
                },
                {
                  inlineData: {
                    mimeType: doc.mimeType || 'application/pdf',
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
  if (!deepResearch) {
    return 'KAYNAK SADAKATİ: Kaynak notlardaki hiçbir terimi, denklemi, tarihi veya vakayı atlama; uydurma detay ekleme.';
  }
  const domainTail =
    domainMode === 'verbal'
      ? '3. Sözel/sosyal bilimler konularında kavram ikiliklerini ayırt et, tarihsel/hukuki neden–sonuç zincirini kur, Markdown karşılaştırma tabloları (`|...|`) ekle ve uydurma matematik formülü üretme.'
      : '3. Sayısal/ekonomik/teknik konular için LaTeX formülleri ($...$ / $$...$$), karşılaştırma tabloları (Markdown |...|) ve yaygın kavram yanılgılarını ekle.';
  return `DERİN ARAŞTIRMA & ÖĞRENME MODU AKTİF:
1. Yalnızca slayt/not özetlemekle kalma; üniversite ders kitabı düzeyinde akademik sentez yap.
2. KAYNAK SADAKATİ + ŞEFFAF AYRIM: Kaynak nottan gelen bilgileri anlatırken doğrudan temellendir; notun kısa geçtiği yerleri üniversite literatüründen teorik arka plan, tarihsel bağlam, alternatif modeller ve ampirik/Türkiye örnekleriyle derinleştirirken bunu **[Derin Akademik Araştırma]** etiketiyle açıkça belirt.
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
    /(hukuk|anayasa|borçlar|ceza|medeni|idare|tarih|osmanlı|cumhuriyet|sosyoloji|psikoloji|felsefe|edebiyat|siyaset|kamu yönetimi|uluslararası ilişkiler|iktisat tarihi|iktisadi düşünceler|yönetim|insan kaynakları|eğitim|etik)/.test(
      header,
    );
  const quantTopic =
    /(ekonometri|matematik|istatistik|kalkülüs|integral|türev|algoritma|fizik|muhasebe|mühendislik)/.test(
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
  const courseName = req.course || 'Üniversite Dersi';
  const noteTitle = req.noteTitle || 'Yüklenen Ders Materyali';
  const domainMode = detectEdgeDomainMode(enrichedContext, courseName, noteTitle);
  const styleInstruction = getStyleDirective(req.pedagogicalStyle);
  const researchInstruction = getResearchDirective(req.deepResearch, domainMode);
  const verbalInstruction =
    domainMode === 'verbal'
      ? `\nSÖZEL / KURAMSAL UZMANLIĞI AKTİF: Bu metin sözel/sosyal bilimler ağırlıklıdır. Uydurma matematiksel formül üretme! Her bölümde şu net yapıyı uygula: (1) \`#### Kavramsal Öz ve Ana Tez\`, (2) \`#### Neden–Sonuç Zinciri ve Süreç\`, (3) \`#### Karşılaştırma ve Ayrım Tablosu\` (Markdown \`|...|...|\`), (4) \`#### Klasik Sınav & Yorum Sorusu Çerçevesi\`.`
      : '';
  const customDirective = req.customPrompt?.trim()
    ? `\nKULLANICININ ÖZEL İSTEĞİ (Öncelikli uygula): "${req.customPrompt.trim()}"`
    : '';
  const stage = req.stage || 'single';

  // --- GRADE OPEN-ENDED ANSWER ---
  if (stage === 'grade_answer' && req.gradePayload) {
    const system = `Sen Türkiye'nin önde gelen üniversitelerinden kıdemli bir akademisyen ve sınav değerlendiricisisin.
Öğrencinin açık uçlu sınav cevabını örnek çözüm ve akademik rubrik üzerinden adil, yapıcı ve öğretici şekilde değerlendir.
Yanıtını YALNIZCA geçerli bir JSON objesi olarak döndür:
{
  "score": 0-100 arası tam sayı,
  "verdict": "Tam İsabet" | "Güçlü Ama Eksik Var" | "Kısmi Doğru" | "Kavram Yanılgısı",
  "feedback": "2-4 cümlelik yapıcı akademik değerlendirme (Markdown ve LaTeX destekli)",
  "strengths": ["Doğru ifade edilen nokta 1", "..."],
  "missingConcepts": ["Eksik bırakılan kritik kavram/adım 1", "..."],
  "improvedAnswer": "Tam puan alacak ideal örnek cevap paragrafı"
}`;
    const userText = `DERS: ${courseName}\nSORU (${req.gradePayload.topic || 'Genel'}): ${req.gradePayload.question}\n\nBEKLENEN ÖRNEK CEVAP / RUBRİK:\n${req.gradePayload.rubricAnswer}\n\nÖĞRENCİNİN YAZDIĞI CEVAP:\n${req.gradePayload.studentAnswer}`;
    return { system, userText, maxTokens: 2500, temperature: 0.2 };
  }

  // --- STAGE 1: SUMMARY BLUEPRINT ---
  if (req.materialType === 'summary' && stage === 'blueprint') {
    const targetSections =
      req.summaryDepth === 'short'
        ? '4-5'
        : req.summaryDepth === 'standard'
        ? '6-8'
        : req.summaryDepth === 'textbook'
        ? '8-12'
        : '7-10';

    const system = `Sen üst düzey bir üniversite kürsü profesörü ve akademik editörsün.
Görevin, verilen ders materyalinin TAMAMINI (ilk sayfadan son sayfaya kadar hiçbir bölümü atlamadan) tarayıp eksiksiz bir Çalışma Stüdyosu Ders Mimarisi (Blueprint) oluşturmaktır.
${styleInstruction}
${researchInstruction}${verbalInstruction}
${customDirective}

KRİTİK KURALLAR:
1. Kesinlikle genel geçer şablon cümleler kullanma. Her başlık kaynak metindeki gerçek konulara özel olmalıdır.
2. ${domainMode === 'verbal' ? 'Sözel derslerde kavram ayrımlarına, neden-sonuç zincirine ve ekol/kuram kıyaslamalarına odaklan; gereksiz formül ekleme.' : 'Matematiksel ifadeleri LaTeX ($...$ veya $$...$$) ile yaz.'}
3. YALNIZCA geçerli JSON döndür (ekstra düz metin yok):
{
  "overview": "Dersin ana tezini, kapsamını, metodolojisini ve neden önemli olduğunu anlatan 2-3 paragraflık kapsamlı yönetici özeti.",
  "disciplineTag": "Örn: Mikroekonomi / Ekonometri / Türk Hukuku / Bilgisayar Bilimleri",
  "keyPoints": ["Madde 1 — somut kavram ve mekanizma", "Madde 2...", "... (8-12 güçlü madde)"],
  "sectionsPlan": [
    {
      "index": 0,
      "title": "Bölüm 1: ...",
      "pageRange": "Sayfa 1-4 veya Slayt 1-6",
      "focusPoints": ["Alt başlık A", "Alt başlık B", "Formül/model C"],
      "keyConcepts": ["Terim 1", "Terim 2"]
    }
  ],
  "teacherEmphasis": [
    {
      "point": "Kritik kavram veya ayrım",
      "whyImportant": "Sınavda neden sık sorulur veya öğrencilerin en çok karıştırdığı nokta nedir?",
      "examProbability": "Yüksek" | "Orta"
    }
  ],
  "comparativeMatrix": {
    "title": "Kavram / Model Karşılaştırma Tablosu",
    "columns": ["Boyut", "Model / Kavram A", "Model / Kavram B"],
    "rows": [["Temel Varsayım", "...", "..."], ["Avantaj / Sınır", "...", "..."]]
  },
  "deepResearchTopics": [
    {
      "topic": "İleri Okuma / Akademik Bağlam Başlığı",
      "literatureContext": "Teorinin literatürdeki yeri, tarihsel gelişimi veya ampirik bulgular",
      "realWorldApplication": "Türkiye veya küresel ekonomiden/dünyadan somut güncel uygulama"
    }
  ],
  "keyTerms": [
    { "term": "Akademik Terim", "definition": "Net, derinlemesine ve ayırt edici tanım", "formula": "Varsa LaTeX formül" }
  ],
  "studyChecklist": [
    "Bu bölümü bitirdiğimde ... arasındaki farkı grafikle açıklayabilirim.",
    "..."
  ]
}
sectionsPlan dizisi tam ${targetSections} bölüm içermeli ve kaynak notun BAŞINDAN SONUNA tüm sayfalarını kapsayacak şekilde sıralanmalıdır.`;

    const userText = `DERS: ${courseName}\nMATERYAL BAŞLIĞI: ${noteTitle}\n\nKAYNAK İÇERİĞİ:\n${sampleBalancedContext(
      enrichedContext,
      70_000,
    )}`;

    return { system, userText, maxTokens: 7000, temperature: 0.25 };
  }

  // --- STAGE 2: SUMMARY EXPAND BATCH ---
  if (req.materialType === 'summary' && stage === 'expand_batch') {
    const targets = req.sectionTargets || [];
    const system = `Sen bir üniversite ders kitabı yazarı ve derin akademik araştırma uzmanısın.
Sana verilen ders mimarisi bağlamı içinde, SADECE aşağıdaki hedef bölümlerin her birini çok derin, öğretici, eksiksiz ve akıcı Türkçe ile yazacaksın.
${styleInstruction}
${researchInstruction}${verbalInstruction}
${customDirective}

HER BÖLÜM İÇİN KALİTE STANDARDI:
- Uzunluk: Bölüm başına 350–600 kelime arası DOLGUN, SOMUT, akıcı akademik anlatım. Boş laf veya tekrar eden şablon alt başlıklar YASAK!
- Yapı: İçeriği Markdown alt başlıkları (\`####\`), numaralı mantık akışı, madde imleri, kalın vurgu${domainMode === 'verbal' ? '' : ', LaTeX denklemler (`$...$` ve `$$...$$`)'} ve en az 1 Markdown karşılaştırma/özet tablosu veya somut vaka örneği ile zenginleştir.
- Bilimsel Doğruluk: Kaynak materyaldeki tüm tanım, formül, yazar, tarih ve kanıtları birebir koru.
- Derin Araştırma Katmanı: Eğer Derin Araştırma aktifse, her bölümde \`deepResearchNote\` alanında konunun teorik derinliğini, literatürdeki tartışmayı veya güncel gerçek dünya / Türkiye örneğini ver.
- Kendini Sına Mini Sorusu: Her bölümün sonunda öğrencinin o bölümü anlayıp anlamadığını ölçen 1 zorlayıcı mini çoktan seçmeli soru (`checkpointQuestion`) üret.

YALNIZCA geçerli JSON döndür:
{
  "sections": [
    {
      "index": 0,
      "heading": "Bölüm başlığı",
      "pageRange": "Sayfa / Slayt aralığı",
      "content": "Zengin Markdown + LaTeX + Tablo + Çözümlü/Somut Örnek içeren 350-600 kelimelik tam bölüm metni...",
      "takeaways": ["Bu bölümden çıkarılacak en kritik 3-4 net çıkarım"],
      "deepResearchNote": "Teorik arka plan, literatür perspektifi ve gerçek hayat uygulaması (Derin Araştırma)",
      "commonPitfalls": ["Öğrencilerin bu konuda sık düştüğü 1-2 kavramsal tuzak"],
      "checkpointQuestion": {
        "question": "Bölüme özel ayırt edici kavramsal soru?",
        "options": ["A", "B", "C", "D"],
        "correctIndex": 0,
        "explanation": "Doğru şıkkın kısa akademik gerekçesi."
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
            t.contextSlice ? `\nİLGİLİ KAYNAK METİN PARÇASI:\n${t.contextSlice.slice(0, 14_000)}` : ''
          }`,
      )
      .join('\n\n====================\n\n');

    const userText = `DERS: ${courseName}\nMATERYAL: ${noteTitle}\nGENEL ÇERÇEVE: ${
      req.globalOutline?.overview || 'Üniversite ders notları sentezi'
    }\n\nİŞLENECEK HEDEF BÖLÜMLER (${targets.length} adet — her birini mutlaka 'sections' dizisine eksiksiz yaz):\n\n${planText}\n\nDESTEKLEYİCİ TAM METİN KESİTİ:\n${sampleBalancedContext(
      enrichedContext,
      36_000,
    )}`;

    return { system, userText, maxTokens: 14_000, temperature: 0.3 };
  }

  // --- SINGLE-CALL SUMMARY (backward compatible e.g. LiveLectureCapture) ---
  if (req.materialType === 'summary') {
    const isShort = req.summaryDepth === 'short' || req.detailLevel === 'concise';
    const secCount = isShort ? '4-5' : '6-8';
    const system = `Sen üniversite düzeyinde uzman bir akademisyen ve derin öğrenme editörüsün.
Verilen kaynak notlardan kapsamlı, tutarlı ve sınav başarısını maksimize eden bir Çalışma Özeti üret.
${styleInstruction}
${researchInstruction}${verbalInstruction}
${customDirective}

KURALLAR:
- Genel şablon ifadeler asla kullanma; metnin gerçek kavramlarını${domainMode === 'verbal' ? ', neden-sonuç ilişkilerini, karşılaştırma tablosunu ve klasik sınav ayrımlarını' : ', formüllerini ($...$, $$...$$), mekanizmalarını ve örneklerini'} derinlemesine yaz.
- YALNIZCA geçerli JSON döndür:
{
  "overview": "2-3 paragraflık yönetici özeti",
  "disciplineTag": "Ders disiplini",
  "keyPoints": ["8-10 güçlü madde"],
  "sections": [
    {
      "heading": "Bölüm Başlığı",
      "pageRange": "Sayfa/Slayt",
      "content": "${isShort ? '200-320' : '350-550'} kelimelik Markdown + LaTeX + somut örnek + tablo içeren derin bölüm anlatımı",
      "takeaways": ["3-4 ana çıkarım"],
      "deepResearchNote": "Teorik derinlik / literatür / vaka analizi",
      "commonPitfalls": ["Yaygın hata / tuzak"]
    }
  ],
  "teacherEmphasis": [
    { "point": "...", "whyImportant": "...", "examProbability": "Yüksek" }
  ],
  "comparativeMatrix": {
    "title": "Karşılaştırma Tablosu",
    "columns": ["Kriter", "Kavram A", "Kavram B"],
    "rows": [["...", "...", "..."]]
  },
  "keyTerms": [{ "term": "...", "definition": "...", "formula": "..." }],
  "studyChecklist": ["Kendini değerlendirme maddesi 1", "..."]
}
Tam ${secCount} bölüm üret ve kaynağın tamamını kapsa.`;

    const userText = `DERS: ${courseName}\nBAŞLIK: ${noteTitle}\n\nKAYNAK NOT:\n${sampleBalancedContext(
      enrichedContext,
      68_000,
    )}`;
    return { system, userText, maxTokens: 14_000, temperature: 0.25 };
  }

  // --- FLASHCARDS ---
  if (req.materialType === 'flashcards') {
    const cardCount = Math.min(Math.max(req.cardCount || 18, 6), 40);
    const system = `Sen aktif hatırlama (Active Recall) ve aralıklı tekrar (Spaced Repetition) pedagojisinde uzman bir üniversite hocasısın.
Verilen kaynak materyali tarayarak tam ${cardCount} adet yüksek kalitede bilgi kartı üret.
${styleInstruction}
${researchInstruction}
${customDirective}

KURALLAR:
1. Kartların yarısı kavramsal derinlik/karşılaştırma ("Neden?", "Farkı nedir?", "Koşulu nedir?"), kalanı formül ($...$), mekanizma ve sınav tuzağı sormalıdır.
2. Basit tek kelimelik sözlük tanımları yerine gerçek üniversite sınavı refleksi kazandıran sorular yaz.
3. YALNIZCA geçerli JSON döndür:
{
  "cards": [
    {
      "front": "Net, düşündürücü soru veya kavram istemi (LaTeX destekli)",
      "back": "Kapsamlı, net, ezbersiz kavrayış sağlayan cevap + gerekiyorsa formül veya ayırt edici mekanizma",
      "hint": "Cevabı hatırlamayı tetikleyen 1 kısa ipucu",
      "topic": "Alt konu etiketi",
      "difficulty": "easy" | "medium" | "hard",
      "examTip": "Sınavda sorulursa dikkat edilecek kritik tuzak veya püf noktası"
    }
  ]
}`;

    const userText = `DERS: ${courseName}\nBAŞLIK: ${noteTitle}\nZORLUK: ${
      req.difficulty || 'mixed'
    }\nADET: ${cardCount}\n\nKAYNAK MATERYAL:\n${sampleBalancedContext(enrichedContext, 68_000)}`;
    return { system, userText, maxTokens: 9000, temperature: 0.3 };
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
        : 'Tüm sorular 4 şıklı çoktan seçmeli (multiple_choice) formatında olsun.';

    const system = `Sen seçkin bir üniversite sınav komisyonu başkanısın. Bloom Taksonomisi'ne uygun (Bilgi -> Uygulama -> Analiz/Sentez) tam ${qCount} soruluk üniversite sınav simülasyonu üret.
${formatInstruction}
ZORLUK SEVİYESİ: ${req.difficulty || 'mixed'}
${styleInstruction}
${researchInstruction}
${customDirective}

KRİTİK KURALLAR:
1. ÇOKTAN SEÇMELİ ŞIK DENGESİ: Doğru şıkkın sırasını (0, 1, 2, 3) dengeli dağıt (asla hepsini 0 yapma!). Çeldiriciler mantıklı yaygın öğrenci hatalarından oluşsun.
2. Matematiksel ifadeleri LaTeX ($...$ veya $$...$$) ile yaz.
3. Her soru için 3 katmanlı çözüm açıklaması yaz: doğru cevabın mantığı + yanlış şıkların neden elendiği + hatırlatıcı not.
4. YALNIZCA geçerli JSON döndür:
{
  "questions": [
    {
      "type": "multiple_choice" | "short_answer",
      "question": "Soru metni (senaryo, denklem veya grafik yorumu içerebilir)",
      "options": ["Şık A", "Şık B", "Şık C", "Şık D"],
      "correctIndex": 0,
      "sampleAnswer": "Açık uçlu ise tam puanlık model cevap",
      "rubric": ["Puanlama kriteri 1", "Puanlama kriteri 2"],
      "explanation": "Kapsamlı adım adım çözüm açıklaması ve çeldirici analizleri",
      "topic": "Alt konu",
      "difficulty": "easy" | "medium" | "hard",
      "bloomLevel": "Anlama" | "Uygulama" | "Analiz" | "Değerlendirme"
    }
  ]
}`;

    const userText = `DERS: ${courseName}\nBAŞLIK: ${noteTitle}\nSINAV ODAĞI: ${
      req.examFocus || 'Vize/Final kapsamlı akademik değerlendirme'
    }\n\nKAYNAK MATERYAL:\n${sampleBalancedContext(enrichedContext, 68_000)}`;
    return { system, userText, maxTokens: 10_000, temperature: 0.3 };
  }

  // --- VIDEO (InteractiveVideoStudio compatible: turns + diagramData + 4-node visual schemas) ---
  const system = `Sen 3Blue1Brown, Kurzgesagt ve MIT OpenCourseWare düzeyinde etkileşimli akademik video ders senaristi ve görsel yönetmensin.
Verilen ders materyalinden 6-8 sahneli, HER SAHNEDE FARKLI GÖRSEL MOD ('visual', 'curve', 'chart', 'table', 'shapes', 'scenario', 'timeline', 'comparison') kullanan ve Dr. Deniz (anlatıcı akademisyen) ile Barış (meraklı öğrenci) arasında geçen doğal Türkçe Video Ders paketi oluştur.
${styleInstruction}
${customDirective}

KESİN KURALLAR:
1. Görsellik asla tekdüze olmasın: ardışık sahnelerde 'diagramData.diagramType' değerini sürekli değiştir ('visual' -> 'curve' -> 'table' -> 'shapes' -> 'chart' -> 'scenario' -> 'comparison'). Sayısal/iktisat derslerinde en az 1 'curve' (arz-talep/para piyasası) ve 1 'chart' sahnesi koy.
2. Her sahnenin 'diagramData.nodes' dizisinde EN AZ 3-4 tane dolu, eksiksiz, kesintisiz kavram kartı üret (asla tek kart bırakma!).
3. 'examTip' alanı KESİNLİKLE 'Merhaba arkadaşlar' veya selamlama olmasın; o sahneye özgü gerçek sınav tuzağını veya kavram ayrımını yaz.
4. 'visualTheme' değerini dersin gerçek alanına göre seç: iktisat/para/banka/maliye için "economics", tarih/imparatorluk için "history", hukuk için "law", fen/veri için "science".

YALNIZCA geçerli JSON döndür:
{
  "videoTitle": "Dersin net akademik video başlığı",
  "overview": "Video dersin amacı ve genel çerçevesi",
  "outline": "3-4 cümlelik bütünsel ders kapsamı",
  "keyFacts": ["Sınavlık kritik çıkarım 1", "Sınavlık kritik çıkarım 2", "Sınavlık kritik çıkarım 3"],
  "scenes": [
    {
      "id": "scene-1",
      "order": 1,
      "title": "Somut ve çarpıcı sahne başlığı",
      "turns": [
        { "speaker": "Deniz", "text": "Konunun çekirdeğini kuran net akademik açıklama (50-90 kelime)" },
        { "speaker": "Barış", "text": "Deniz hocam hitabıyla analitik veya neden-sonuç sorusu (20-35 kelime)" },
        { "speaker": "Deniz", "text": "Soruyu somut mekanizma ve sınav ayrımıyla yanıtlayan devam cümlesi (45-80 kelime)" }
      ],
      "diagramData": {
        "diagramType": "visual | curve | table | shapes | chart | scenario | timeline | comparison",
        "visualTheme": "economics | history | law | science | society",
        "mainTitle": "Tahta üzerindeki ana şema başlığı",
        "highlightMetric": "Tek cümlelik analitik formül veya ana bulgu",
        "nodes": [
          { "label": "Kısa Terim 1", "subtext": "Tam cümlelik açık tanım veya işleyiş (80-150 karakter)", "badge": "Temel İlke", "value": 88 },
          { "label": "Kısa Terim 2", "subtext": "İkinci bileşen veya aktarım kanalı", "badge": "Mekanizma", "value": 76 },
          { "label": "Kısa Terim 3", "subtext": "Üçüncü yapısal etken veya koşul", "badge": "Koşul", "value": 69 },
          { "label": "Kısa Terim 4", "subtext": "Sonuç veya politika çıktısı", "badge": "Çıktı", "value": 82 }
        ]
      },
      "keyTakeaways": ["Madde 1", "Madde 2", "Madde 3"],
      "keyTerms": [{ "term": "Terim", "definition": "Tam tanım" }],
      "examTip": "Bu sahneye özgü gerçek sınav ayrımı veya çeldirici uyarısı",
      "visualCue": "Ekranda görülecek animasyon/şema tarifi",
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

  const userText = `DERS: ${courseName}\nBAŞLIK: ${noteTitle}\n\nKAYNAK MATERYAL:\n${sampleBalancedContext(
    enrichedContext,
    60_000,
  )}`;
  return { system, userText, maxTokens: 12_500, temperature: 0.32 };
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
      keyPoints: Array.isArray(raw.keyPoints) ? raw.keyPoints.map(String) : [],
      sectionsPlan,
      teacherEmphasis: Array.isArray(raw.teacherEmphasis) ? raw.teacherEmphasis : [],
      comparativeMatrix: raw.comparativeMatrix?.columns && Array.isArray(raw.comparativeMatrix?.rows)
        ? raw.comparativeMatrix
        : undefined,
      deepResearchTopics: Array.isArray(raw.deepResearchTopics) ? raw.deepResearchTopics : [],
      keyTerms: Array.isArray(raw.keyTerms) ? raw.keyTerms : [],
      studyChecklist: Array.isArray(raw.studyChecklist) ? raw.studyChecklist.map(String) : [],
    };
  }

  if (stage === 'expand_batch') {
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

  if (materialType === 'summary') {
    const sections = Array.isArray(raw.sections) ? raw.sections : [];
    if (!raw.overview && sections.length === 0) return null;
    return {
      overview: String(raw.overview || ''),
      disciplineTag: raw.disciplineTag ? String(raw.disciplineTag) : undefined,
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
      studyChecklist: Array.isArray(raw.studyChecklist) ? raw.studyChecklist.map(String) : [],
    };
  }

  if (materialType === 'flashcards') {
    const cards = Array.isArray(raw.cards)
      ? raw.cards
          .filter((c: any) => c?.front && c?.back)
          .map((c: any) => ({
            front: String(c.front),
            back: String(c.back),
            hint: c.hint ? String(c.hint) : undefined,
            topic: c.topic ? String(c.topic) : req.course || 'Genel',
            difficulty: ['easy', 'medium', 'hard'].includes(c.difficulty) ? c.difficulty : 'medium',
            examTip: c.examTip ? String(c.examTip) : undefined,
          }))
      : [];
    return cards.length > 0 ? { cards } : null;
  }

  if (materialType === 'quiz') {
    const questions = Array.isArray(raw.questions)
      ? raw.questions
          .filter((q: any) => q?.question)
          .map((q: any, idx: number) => {
            const isOpen = q.type === 'short_answer' || !Array.isArray(q.options) || q.options.length < 2;
            const opts = isOpen ? [] : q.options.slice(0, 4).map(String);
            const rawCorrect = Number(q.correctIndex);
            const correctIndex = isOpen
              ? 0
              : Number.isFinite(rawCorrect) && rawCorrect >= 0 && rawCorrect < opts.length
              ? rawCorrect
              : idx % Math.max(1, opts.length);
            return {
              type: isOpen ? 'short_answer' : 'multiple_choice',
              question: String(q.question),
              options: opts,
              correctIndex,
              sampleAnswer: q.sampleAnswer ? String(q.sampleAnswer) : undefined,
              rubric: Array.isArray(q.rubric) ? q.rubric.map(String) : undefined,
              explanation: String(q.explanation || ''),
              topic: q.topic ? String(q.topic) : req.course || 'Genel',
              difficulty: ['easy', 'medium', 'hard'].includes(q.difficulty) ? q.difficulty : 'medium',
              bloomLevel: q.bloomLevel ? String(q.bloomLevel) : 'Anlama',
            };
          })
      : [];
    return questions.length > 0 ? { questions } : null;
  }

  if (materialType === 'video') {
    const rawScenes = Array.isArray(raw.scenes) ? raw.scenes : [];
    if (rawScenes.length === 0) return null;
    const scenes = rawScenes.map((sc: any, idx: number) => {
      const turns = Array.isArray(sc?.turns) ? sc.turns : [];
      const narration =
        String(sc?.narration || '').trim() ||
        turns.map((t: any) => String(t?.text || '').trim()).filter(Boolean).join(' ');
      return {
        ...sc,
        id: String(sc?.id || `scene-${idx + 1}`),
        order: Number(sc?.order || idx + 1),
        title: String(sc?.title || `Bölüm ${idx + 1}`),
        narration,
        turns,
      };
    });
    return {
      videoTitle: String(raw.videoTitle || req.noteTitle || ''),
      overview: String(raw.overview || raw.outline || ''),
      outline: String(raw.outline || raw.overview || ''),
      videoScript: String(raw.videoScript || scenes.map((s: any) => s.narration || '').join('\n\n')),
      totalEstimatedDurationSec: Number(raw.totalEstimatedDurationSec || scenes.length * 60),
      scenes,
      keyFacts: Array.isArray(raw.keyFacts) ? raw.keyFacts : [],
      matchingPairs: Array.isArray(raw.matchingPairs) ? raw.matchingPairs : [],
      examQuestions: Array.isArray(raw.examQuestions) ? raw.examQuestions : [],
      keyTerms: Array.isArray(raw.keyTerms) ? raw.keyTerms : [],
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
        const hint = s.split(' ').slice(0, 5).join(' ');
        return {
          front: `${title} (#${idx + 1}): "${hint}..." bağlamındaki temel çıkarım nedir?`,
          back: s,
          topic: course,
          difficulty: idx % 3 === 0 ? 'hard' : idx % 2 === 0 ? 'medium' : 'easy',
        };
      }),
    };
  }

  if (req.materialType === 'quiz') {
    const count = Math.min(req.questionCount || 6, Math.max(3, sentences.length));
    return {
      questions: Array.from({ length: count }, (_, idx) => {
        const correct = sentences[idx % Math.max(1, sentences.length)] || `${title} temel kavramı`;
        const distractors = sentences
          .filter((_, j) => j !== idx)
          .slice(0, 3)
          .map((d) => `${d.slice(0, 120)} (farklı bağlam)`);
        while (distractors.length < 3) {
          distractors.push(`Alternatif yorum ${distractors.length + 1}`);
        }
        const correctIndex = idx % 4;
        const options = [...distractors];
        options.splice(correctIndex, 0, correct.slice(0, 150));
        return {
          type: 'multiple_choice',
          question: `${title} içeriğine göre aşağıdaki ifadelerden hangisi metinle doğrulanır? (Soru ${idx + 1})`,
          options: options.slice(0, 4),
          correctIndex,
          explanation: `Kaynak metin doğrultusunda doğru ifade: "${correct.slice(0, 180)}"`,
          topic: course,
          difficulty: 'medium',
          bloomLevel: 'Anlama',
        };
      }),
    };
  }

  if (req.materialType === 'video') {
    const diagramPalette = ['visual', 'curve', 'table', 'shapes', 'scenario', 'comparison'] as const;
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
  if (!isTrustedOrigin(req)) {
    return jsonResponse(req, { error: 'Yetkisiz istek kaynağı.' }, 403);
  }

  try {
    const authUser = await getAuthenticatedUser(req);
    if (!authUser) {
      return jsonResponse(req, { error: 'Oturum doğrulanamadı. Lütfen tekrar giriş yapın.' }, 401);
    }

    const body = await readJsonBody<GenerateReq>(req, 12_000_000);
    if (!body?.materialType || !VALID_MATERIAL_TYPES.includes(body.materialType)) {
      return jsonResponse(req, { error: 'Geçersiz materyal türü.' }, 400);
    }

    let enrichedContext = sanitizeText(body.noteContext || '');

    // Transcribe audio attachment cleanly instead of invalid image_url audio injection
    if (body.audio?.data) {
      const transcript = await transcribeAudioMedia(body.audio);
      if (transcript) {
        enrichedContext = enrichedContext
          ? `${enrichedContext}\n\n[SES KAYDI TRANSKRİPTİ]\n${transcript}`
          : transcript;
      }
    }

    // Handle raw PDF document attachment cleanly via Gemini PDF OCR if needed
    const imageParts: Array<{ type: 'image_url'; image_url: { url: string; detail: 'high' } }> = [];
    if (body.document?.data) {
      if (body.document.mimeType?.startsWith('image/')) {
        const cleanB64 = body.document.data.includes(',')
          ? body.document.data.split(',').pop()
          : body.document.data;
        imageParts.push({
          type: 'image_url',
          image_url: {
            url: `data:${body.document.mimeType};base64,${cleanB64}`,
            detail: 'high',
          },
        });
      } else if (body.document.mimeType?.includes('pdf')) {
        const pdfText = await extractPdfViaGemini(body.document);
        if (pdfText) {
          enrichedContext = enrichedContext ? `${enrichedContext}\n\n${pdfText}` : pdfText;
        }
      }
    }

    if (Array.isArray(body.images) && body.images.length > 0) {
      for (const img of body.images.slice(0, 8)) {
        if (!img?.data) continue;
        const cleanB64 = img.data.includes(',') ? img.data.split(',').pop() : img.data;
        imageParts.push({
          type: 'image_url',
          image_url: {
            url: `data:${img.mimeType || 'image/jpeg'};base64,${cleanB64}`,
            detail: 'high',
          },
        });
      }
    }

    const stage = body.stage || 'single';
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

    const { system, userText, maxTokens, temperature } = buildStagePrompts(body, enrichedContext);

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
      const preferPro =
        body.materialType === 'summary' || body.materialType === 'video' || Boolean(body.deepResearch);
      const completion = await createChatCompletion({
        model: preferPro ? 'google/gemini-2.5-pro' : 'gpt-4o-mini',
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: userContent },
        ],
        responseFormat: 'json_object',
        temperature,
        max_tokens: maxTokens,
        timeoutMs: 95_000,
        allowPublicFallback: imageParts.length === 0,
      });

      const candidate =
        completion.parsedJson ?? extractJsonFromText(completion.content || '');
      if (candidate) {
        normalizedContent = normalizeMaterialContent(body.materialType, stage, candidate, body);
        if (normalizedContent) {
          usedAi = true;
        }
      }
    } catch (aiErr) {
      console.warn('Edge AI synthesis fell back after gateway error:', aiErr);
    }

    if (!normalizedContent) {
      normalizedContent = buildServerFallback(body, enrichedContext);
    }

    return jsonResponse(req, {
      content: normalizedContent,
      model: usedAi ? 'EconNotes Deep Academic AI' : 'EconNotes Yerel Yapısal Ayrıştırıcı',
      sourceMode: usedAi ? 'ai' : 'fallback',
    });
  } catch (e) {
    console.error('generate-study-material error:', e);
    if (e instanceof RequestError) {
      return jsonResponse(req, { error: e.message }, e.status);
    }
    return jsonResponse(
      req,
      { error: e instanceof Error ? e.message : 'Materyal oluşturulurken beklenmeyen hata.' },
      500,
    );
  }
});
