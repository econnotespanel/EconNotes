import { supabase, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from '@/integrations/supabase/client';
import { AssistantImageItem, combineImagesForSingleDocument } from '@/lib/assistantAttachments';
import { extractMathTextFromImages } from '@/lib/imageMathOcr';
import { matchConversationalIntent, solveLocallyAsLastResort } from '@/lib/localMathSolver';

export type AssistantSolveMode = 'step_by_step' | 'check_solution' | 'concept';

export interface InvokeAssistantParams {
  userQuestion: string;
  fullMessageWithDoc: string;
  documentText?: string;
  documentName?: string;
  mode: AssistantSolveMode;
  notesContext: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  images: AssistantImageItem[];
  onStatus?: (statusText: string) => void;
}

interface EdgeCallResult<T = any> {
  ok: boolean;
  status: number;
  data: T | null;
  errorMessage?: string;
}

const PUBLIC_REASONING_ENDPOINT = 'https://text.pollinations.ai/openai';

let edgeUnavailableUntil = 0;
let edgeHasSucceededOnce = false;
let nextAllowedReasoningAt = 0;

/** Test helper to reset module-level circuit-breaker state between unit tests */
export function __resetAssistantClientStateForTests(): void {
  edgeUnavailableUntil = 0;
  edgeHasSucceededOnce = false;
  nextAllowedReasoningAt = 0;
}

async function getValidAccessToken(): Promise<string | null> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (session?.access_token) {
      const expiresAtMs = (session.expires_at ?? 0) * 1000;
      if (!expiresAtMs || expiresAtMs - Date.now() > 45_000) {
        return session.access_token;
      }
    }

    const { data: refreshed } = await supabase.auth.refreshSession();
    return refreshed.session?.access_token ?? session?.access_token ?? null;
  } catch {
    return null;
  }
}

/**
 * Direct fetch to Supabase Edge Functions using strictly standard CORS-allowed headers
 * (`Authorization`, `apikey`, `Content-Type`) so browser preflights never fail.
 */
async function postEdgeFunction<T = any>(
  functionName: string,
  payload: Record<string, unknown>,
  timeoutMs = 35_000,
): Promise<EdgeCallResult<T>> {
  const token = await getValidAccessToken();
  if (!token) {
    return {
      ok: false,
      status: 401,
      data: null,
      errorMessage: 'Oturum doğrulanamadı.',
    };
  }

  const controller = new AbortController();
  const timer = globalThis.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/${functionName}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: SUPABASE_PUBLISHABLE_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const rawText = await res.text();
    let parsed: any = null;
    try {
      parsed = rawText ? JSON.parse(rawText) : null;
    } catch {
      parsed = null;
    }

    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        data: parsed,
        errorMessage:
          (typeof parsed?.error === 'string' && parsed.error) ||
          (typeof parsed?.message === 'string' && parsed.message) ||
          `Sunucu yanıt hatası (${res.status})`,
      };
    }

    return { ok: true, status: res.status, data: parsed as T };
  } catch (err: any) {
    const isAbort = err?.name === 'AbortError';
    return {
      ok: false,
      status: isAbort ? 408 : 0,
      data: null,
      errorMessage: isAbort ? 'Zaman aşımı' : 'Bağlantı hatası',
    };
  } finally {
    globalThis.clearTimeout(timer);
  }
}

function buildModeDirective(mode: AssistantSolveMode, hasImages: boolean): string {
  if (mode === 'check_solution') {
    return [
      'MOD: ÇÖZÜM KONTROLÜ VE HATA ANALİZİ',
      '- Öğrencinin çözümünü satır satır kontrol et; doğru adımları onayla.',
      '- İşlem, işaret, türev/integral veya birim hatası varsa tam olarak hangi adımda hata yapıldığını ve nedenini açıkla.',
      '- Hatalı adımdan itibaren doğru çözümü hiçbir ara işlemi atlamadan LaTeX ($...$ ve $$...$$) ile tamamla ve sağlamasını yap.',
    ].join('\n');
  }
  if (mode === 'concept') {
    return [
      'MOD: DERİNLEMESİNE KONU VE FORMÜL ANLATIMI',
      '- Konuyu ezberletmeden sezgisel mantığıyla anlata anlata açıkla.',
      '- Formüllerdeki her sembolün anlamını ve birimini LaTeX ($...$ ve $$...$$) ile göster.',
      '- 1 adet adım adım çözümlü örnek ekle ve vize/final sınavlarında dikkat edilmesi gereken noktaları belirt.',
    ].join('\n');
  }
  return [
    `MOD: ADIM ADIM "ANLATA ANLATA" SORU ÇÖZÜMÜ (${hasImages ? 'GÖRSELDEN OKUNAN SORU' : 'MATEMATİK & MÜHENDİSLİK UZMANI'})`,
    'Soruyu şu 5 pedagojik aşamayla, HİÇBİR ARA CEBİRSEL İŞLEMİ ATLAMADAN çöz:',
    '1. **📌 Sorunun Analizi ve Verilenler:** Sorunun konusunu, verilen değerleri/denklemi ve isteneni net biçimde yaz.',
    '2. **🧭 Çözüm Stratejisi ve Formül:** Neden bu teoremi/yöntemi seçtiğimizi açıkla ve ana formülü LaTeX ile yaz.',
    '3. **✍️ Adım Adım, Anlata Anlata Çözüm:** **Adım 1**, **Adım 2**, **Adım 3**... şeklinde her adımda önce Türkçe olarak ne yaptığımızı samimi bir hoca gibi anlat, hemen altında denklemi göster.',
    '4. **✅ Nihai Sonuç ve Sağlama:** Nihai cevabı `\\boxed{...}` içinde birimiyle (ve varsa doğru şık harfiyle) vurgula; mümkünse kısa sağlama yap.',
    '5. **💡 Sınav Püf Noktası:** Bu soru tipinde sık yapılan 1-2 hatayı kısaca hatırlat.',
  ].join('\n');
}

function buildStemSystemPrompt(mode: AssistantSolveMode, hasImages: boolean, notesContext: string): string {
  return [
    'Sen **EconNotes Akademik Asistanı**sın. Üniversite öğrencilerine Matematik (Kalkülüs / Analiz, Lineer Cebir, Diferansiyel Denklemler, Olasılık ve İstatistik, Sayısal Yöntemler), Mühendislik (Fizik, Statik, Dinamik, Mukavemet, Elektrik-Elektronik Devreleri, Sinyal ve Sistemler, Termodinamik, Akışkanlar Mekaniği, Algoritma) ve İktisat/Ekonometri derslerinde en yüksek kalitede destek veren kıdemli bir akademik problem çözme hocasısın.',
    '',
    'YAZIM KURALLARI:',
    '- Daima akıcı, anlaşılır, sabırlı ve öğretici bir Türkçe kullan.',
    '- Satır içi matematiksel ifadeleri `$...$` içinde (ör. `$f\'(x) = 2x$`), ana denklemleri kendi satırında `$$...$$` içinde yaz.',
    '- Matrislerde `\\begin{bmatrix}...\\end{bmatrix}`, çok satırlı türetmelerde `\\begin{aligned}...\\end{aligned}`, nihai sonuçta `\\boxed{...}` kullan.',
    '- Uygunsuz veya akademik dışı/yasadışı isteklere kibarca yanıt veremeyeceğini belirt.',
    '',
    buildModeDirective(mode, hasImages),
    notesContext
      ? `\nPlatformdaki Mevcut Ders Notları (yalnızca ilgiliyse referans al):\n${notesContext.slice(0, 3_500)}`
      : '',
  ]
    .filter(Boolean)
    .join('\n');
}

export function formatStructuredSolutionToMarkdown(content: any): string | null {
  if (!content || typeof content !== 'object') return null;
  const overview = typeof content.overview === 'string' ? content.overview.trim() : '';

  // Reject static fallback placeholder from generate-study-material so we never show generic text
  if (
    !overview ||
    overview.includes('kuramsal temelleri ve sınav ağırlığı bakımından en kritik ünitelerden biridir')
  ) {
    return null;
  }

  const blocks: string[] = [];
  blocks.push(`### 📌 Sorunun Analizi ve Çözüm Planı\n\n${overview}`);

  if (Array.isArray(content.sections) && content.sections.length > 0) {
    for (const sec of content.sections) {
      if (!sec || typeof sec.content !== 'string') continue;
      const heading =
        typeof sec.heading === 'string' && sec.heading.trim() ? sec.heading.trim() : 'Çözüm Adımı';
      blocks.push(`### ${heading}\n\n${sec.content.trim()}`);
      if (typeof sec.takeaway === 'string' && sec.takeaway.trim()) {
        blocks.push(`> **✅ Adım Özeti / Sonuç:** ${sec.takeaway.trim()}`);
      }
    }
  }

  if (Array.isArray(content.instructorEmphasis) && content.instructorEmphasis.length > 0) {
    const tips = content.instructorEmphasis
      .filter((t: unknown): t is string => typeof t === 'string' && t.trim().length > 0)
      .slice(0, 3);
    if (tips.length > 0) {
      blocks.push(
        `### 💡 Sınav Püf Noktası & Dikkat Edilecekler\n\n${tips.map((t) => `- ${t.trim()}`).join('\n')}`,
      );
    }
  }

  return blocks.join('\n\n');
}

async function sleepWithCountdown(
  totalSeconds: number,
  onStatus?: (statusText: string) => void,
): Promise<void> {
  const clamped = Math.min(46, Math.max(1, Math.ceil(totalSeconds)));
  for (let remaining = clamped; remaining > 0; remaining--) {
    onStatus?.(`Yoğunluk sırası bekleniyor, çözümünüz hazırlanıyor (${remaining} sn)...`);
    await new Promise((r) => globalThis.setTimeout(r, 1000));
  }
  onStatus?.('Adım adım çözüm ve LaTeX denklemler oluşturuluyor...');
}

/**
 * Calls the public CORS-enabled Reasoning STEM model (`GPT-OSS 20B Reasoning`) with
 * automatic cooldown queueing when rapid consecutive requests hit the per-IP window.
 */
async function invokePublicReasoningStemEngine(params: {
  systemPrompt: string;
  userContent: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  onStatus?: (statusText: string) => void;
}): Promise<string | null> {
  const { systemPrompt, userContent, history, onStatus } = params;

  const waitMs = nextAllowedReasoningAt - Date.now();
  if (waitMs > 1000 && waitMs <= 46_000) {
    await sleepWithCountdown(Math.ceil(waitMs / 1000), onStatus);
  }

  const messages = [
    { role: 'system', content: systemPrompt },
    ...history.slice(-6).map((m) => ({
      role: m.role,
      content: m.content.slice(0, 4_000),
    })),
    { role: 'user', content: userContent.slice(0, 24_000) },
  ];

  for (let attempt = 0; attempt < 3; attempt++) {
    const controller = new AbortController();
    const timer = globalThis.setTimeout(() => controller.abort(), 65_000);

    try {
      onStatus?.('Adım adım çözüm ve LaTeX denklemler hazırlanıyor...');
      const res = await fetch(PUBLIC_REASONING_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'openai',
          messages,
          temperature: 0.15,
        }),
        signal: controller.signal,
      });

      const rawText = await res.text();
      globalThis.clearTimeout(timer);

      if (res.ok && rawText) {
        nextAllowedReasoningAt = Date.now() + 45_500;
        try {
          const parsed = JSON.parse(rawText);
          const content = parsed?.choices?.[0]?.message?.content;
          if (typeof content === 'string' && content.trim().length > 0) {
            return content.trim();
          }
        } catch {
          if (!rawText.trim().startsWith('{') && rawText.trim().length > 0) {
            return rawText.trim();
          }
        }
      }

      // Check if rate-limited with explicit Retry after Xs
      const retryMatch = rawText.match(/Retry after\s+(\d+)\s*s/i);
      if ((res.status === 402 || res.status === 429) && retryMatch && attempt < 2) {
        const waitSec = Math.min(46, Math.max(2, Number(retryMatch[1]) + 1));
        nextAllowedReasoningAt = Date.now() + waitSec * 1000;
        await sleepWithCountdown(waitSec, onStatus);
        continue;
      }

      return null;
    } catch {
      globalThis.clearTimeout(timer);
      return null;
    }
  }

  return null;
}

/**
 * Multi-tier resilient Academic Assistant client:
 * 0. Instant response (<10ms) for pure greetings/courtesy ("selam", "nasılsın", etc.)
 * 1. Primary Supabase `academic-assistant` Edge Function (multimodal GPT-4o / Gemini 2.5 Pro)
 * 2. Secondary Supabase `study-coach` / `generate-study-material` Edge Functions
 * 3. Browser Turkish+Math OCR (`Tesseract.js@5` `tur+eng+equ`) + Cloud 20B Reasoning STEM Engine
 * 4. Offline Symbolic & Numerical Math Solver backup so the assistant never crashes.
 */
export async function invokeAcademicAssistantResilient(
  params: InvokeAssistantParams,
): Promise<string> {
  const {
    userQuestion,
    fullMessageWithDoc,
    documentText,
    documentName,
    mode,
    notesContext,
    history,
    images,
    onStatus,
  } = params;

  // Stage 0: Instant conversational response for pure greetings/courtesies (no math/files/images)
  const instantGreeting = matchConversationalIntent(
    userQuestion,
    images.length > 0 || Boolean(documentText),
  );
  if (instantGreeting) {
    return instantGreeting;
  }

  // Stage 1 & 2: Supabase Edge Functions (skipped for 3 mins if verified unhealthy/quota-exhausted)
  if (Date.now() >= edgeUnavailableUntil) {
    const edgeTimeout = edgeHasSucceededOnce ? 75_000 : 14_000;
    onStatus?.(
      images.length > 0
        ? 'Görsel inceleniyor, çözüm adımları hazırlanıyor...'
        : 'Adım adım çözüm hazırlanıyor...',
    );

    const primaryRes = await postEdgeFunction<{ reply?: string; error?: string }>(
      'academic-assistant',
      {
        message: fullMessageWithDoc,
        mode,
        notesContext: notesContext.slice(0, 35_000),
        history: history.slice(-10).map((m) => ({
          role: m.role,
          content: m.content.slice(0, 10_000),
        })),
        hasFile: Boolean(documentName) || images.length > 0,
        fileName: documentName || images[0]?.name,
        images:
          images.length > 0
            ? images.map((img) => ({
                name: img.name,
                mimeType: img.mimeType,
                data: img.base64Data,
              }))
            : undefined,
      },
      edgeTimeout,
    );

    if (primaryRes.ok && primaryRes.data?.reply) {
      edgeHasSucceededOnce = true;
      return primaryRes.data.reply;
    }

    const directive = buildModeDirective(mode, images.length > 0);

    // Try secondary Edge Function failover unless primary already reported 401/402 project-wide
    if (primaryRes.status !== 401 && primaryRes.status !== 402) {
      if (images.length === 0) {
        const coachHistory = history.slice(-8).map((m) => ({
          role: m.role,
          content: m.content.slice(0, 6_000),
        }));
        const coachUserPrompt = `${directive}\n\nÖĞRENCİNİN SORUSU:\n${userQuestion}`.slice(0, 7_800);

        const coachRes = await postEdgeFunction<{ reply?: string }>(
          'study-coach',
          {
            mode: 'chat',
            materialTitle: documentName
              ? `${documentName} — Soru Çözümü`
              : 'Matematik, Mühendislik ve Akademik Soru Çözümü',
            materialType: 'summary',
            course: 'Üniversite Matematik, Mühendislik ve Akademik Dersler',
            materialContent: {
              belgeAdi: documentName || null,
              belgeMetni: documentText ? documentText.slice(0, 30_000) : null,
              platformNotlari: notesContext.slice(0, 8_000),
            },
            messages: [...coachHistory, { role: 'user', content: coachUserPrompt }],
          },
          edgeTimeout,
        );

        if (coachRes.ok && coachRes.data?.reply) {
          edgeHasSucceededOnce = true;
          return coachRes.data.reply;
        }
      }

      // Multimodal Vision / Universal secondary Edge Function (`generate-study-material`)
      const singleDocImage =
        images.length > 0 ? await combineImagesForSingleDocument(images) : undefined;

      const customDirective = [
        'ÖNEMLİ: Bu bir özet değil, DOĞRUDAN ADIM ADIM SORU ÇÖZÜMÜ isteğidir!',
        directive,
        'overview alanına sorunun okunuşunu, verilenleri/istenenleri ve kullanılacak formülü LaTeX ($...$ ve $$...$$) ile yaz.',
        'sections dizisindeki bölümleri sırasıyla "Adım 1: ...", "Adım 2: ...", ..., "Sonuç ve Sağlama" başlıklarıyla oluştur; hiçbir ara cebirsel işlemi atlama ve nihai sonucu \\boxed{...} içine al.',
        `Öğrencinin notu/sorusu: ${userQuestion.slice(0, 550)}`,
      ]
        .join('\n')
        .slice(0, 1_900);

      const studyMatRes = await postEdgeFunction<{ content?: any }>(
        'generate-study-material',
        {
          materialType: 'summary',
          noteTitle:
            mode === 'check_solution'
              ? 'Çözüm Kontrolü ve Adım Adım Hata Analizi'
              : 'Adım Adım Matematik ve Mühendislik Soru Çözümü',
          course: 'Matematik, Mühendislik ve Temel Bilimler',
          summaryLength: 'detailed',
          noteStyle: mode === 'concept' ? 'formula_concepts' : 'solved_cases',
          customPrompt: customDirective,
          noteContext: fullMessageWithDoc.slice(0, 90_000),
          ...(singleDocImage ? { document: singleDocImage } : {}),
        },
        edgeTimeout,
      );

      if (studyMatRes.ok && studyMatRes.data?.content) {
        const formatted = formatStructuredSolutionToMarkdown(studyMatRes.data.content);
        if (formatted) {
          edgeHasSucceededOnce = true;
          return formatted;
        }
      }
    }

    // Mark Edge Functions temporarily unhealthy for 3 minutes so subsequent messages skip dead roundtrips
    edgeUnavailableUntil = Date.now() + 3 * 60_000;
  }

  // Stage 3: If gallery PNG/JPG images are attached, extract Turkish + Math text via Browser OCR
  let extractedImageText = '';
  if (images.length > 0) {
    try {
      extractedImageText = await extractMathTextFromImages(images, onStatus);
    } catch (ocrErr) {
      console.warn('[AcademicAssistant] Browser OCR fallback warning:', ocrErr);
    }
  }

  // Stage 4: Cloud Reasoning STEM Engine (`GPT-OSS 20B Reasoning`)
  const stemSystemPrompt = buildStemSystemPrompt(mode, images.length > 0, notesContext);

  let reasoningUserPrompt = fullMessageWithDoc;
  if (images.length > 0) {
    if (extractedImageText.trim().length >= 3) {
      reasoningUserPrompt = [
        `Öğrenci galeriden ${images.length} adet soru görseli (${images.map((i) => i.name).join(', ')}) yükledi.`,
        'Görselden OCR ile okunan ham metin ve matematiksel ifadeler aşağıdadır (olası küçük OCR karakter kaymalarını örn. x2 → x^2, kok → \\sqrt{}, kesir/indis yapılarını matematiksel bağlama göre düzelterek yorumla, önce okuduğun denklemi LaTeX ile teyit et ve ardından adım adım anlata anlata çöz):',
        '',
        '--- GÖRSELDEN OKUNAN METİN ---',
        extractedImageText,
        '--- SON ---',
        '',
        `Öğrencinin ek notu / isteği: ${userQuestion}`,
      ].join('\n');
    } else {
      return [
        '### 📷 Görseldeki Metin Net Okunamadı',
        'Yüklediğiniz görseldeki semboller otomatik taramada yeterince net seçilemedi. En doğru adım adım çözümü üretebilmem için:',
        '- Görselin sadece **sorunun bulunduğu kısmını yakınlaştırıp (kırparak)** iyi ışıkta tekrar `PNG` / `JPG` olarak yükleyebilir, **veya**',
        '- Denklemi kısaca metin kutusuna yazabilirsiniz (ör. `int x * e^x dx` veya `2x^2 - 5x + 2 = 0`).',
      ].join('\n');
    }
  }

  const reasoningReply = await invokePublicReasoningStemEngine({
    systemPrompt: stemSystemPrompt,
    userContent: reasoningUserPrompt,
    history,
    onStatus,
  });

  if (reasoningReply) {
    return reasoningReply;
  }

  // Stage 5: Offline / Last-Resort Symbolic & Numerical Math Solver
  return solveLocallyAsLastResort({
    question: userQuestion,
    extractedImageText: extractedImageText || undefined,
    documentText,
    documentName,
  });
}
