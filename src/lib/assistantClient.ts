import { supabase, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from '@/integrations/supabase/client';
import { AssistantImageItem, combineImagesForSingleDocument } from '@/lib/assistantAttachments';
import { extractMathTextFromImages } from '@/lib/imageMathOcr';
import { matchConversationalIntent, solveLocallyAsLastResort } from '@/lib/localMathSolver';
import {
  extractHandwrittenLatexViaVisionOcr,
  invokeMultimodalVisionCascade,
} from '@/lib/multimodalVisionClient';

export type AssistantSolveMode = 'step_by_step' | 'check_solution' | 'concept';
export type AssistantProgressStage = 'prepare' | 'ocr' | 'solve' | 'verify';

export interface AssistantProgressInfo {
  stage: AssistantProgressStage;
  percent: number;
  label: string;
}

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
  onProgress?: (info: AssistantProgressInfo) => void;
}

interface EdgeCallResult<T = any> {
  ok: boolean;
  status: number;
  data: T | null;
  errorMessage?: string;
}

const PUBLIC_REASONING_ENDPOINT = 'https://text.pollinations.ai/openai';
const EDGE_COOLDOWN_STORAGE_KEY = 'econnotes_assistant_edge_cooldown_v1';

let edgeUnavailableUntil = 0;
let edgeHasSucceededOnce = false;
let nextAllowedReasoningAt = 0;

function getEdgeCooldownUntil(): number {
  if (edgeUnavailableUntil > 0) return edgeUnavailableUntil;
  try {
    const raw = globalThis.sessionStorage?.getItem(EDGE_COOLDOWN_STORAGE_KEY);
    if (raw) {
      const parsed = Number(raw);
      if (Number.isFinite(parsed) && parsed > Date.now()) {
        edgeUnavailableUntil = parsed;
        return parsed;
      }
    }
  } catch {
    // ignore storage errors
  }
  return 0;
}

function setEdgeCooldown(durationMs: number): void {
  const until = Date.now() + durationMs;
  edgeUnavailableUntil = until;
  try {
    globalThis.sessionStorage?.setItem(EDGE_COOLDOWN_STORAGE_KEY, String(until));
  } catch {
    // ignore storage errors
  }
}

/** Test helper to reset module-level circuit-breaker state between unit tests */
export function __resetAssistantClientStateForTests(): void {
  edgeUnavailableUntil = 0;
  edgeHasSucceededOnce = false;
  nextAllowedReasoningAt = 0;
  try {
    globalThis.sessionStorage?.removeItem(EDGE_COOLDOWN_STORAGE_KEY);
  } catch {
    // ignore
  }
}

/**
 * Selects the most relevant pages/sections from large uploaded PDF/DOCX/PPTX lecture notes
 * so the Reasoning LLM answers 3x faster without choking on 35,000+ characters of unrelated pages.
 */
export function selectRelevantDocumentExcerpt(
  docText: string,
  userQuestion: string,
  maxChars = 11_500,
): string {
  if (!docText || docText.length <= maxChars) return docText;

  const chunks = docText
    .split(/(?=---\s*(?:Sayfa|Slayt)\s+\d+\s*---)/g)
    .map((c) => c.trim())
    .filter(Boolean);

  if (chunks.length <= 1) {
    return `${docText.slice(0, maxChars)}\n\n[...Belgenin devamı kısaltıldı...]`;
  }

  const keywords = userQuestion
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3);

  const scored = chunks.map((chunk, index) => {
    const lower = chunk.toLowerCase();
    let score = index === 0 ? 5 : index === 1 ? 2 : 0; // Always favor intro/title page
    for (const kw of keywords) {
      if (lower.includes(kw)) score += 4;
    }
    return { index, chunk, score };
  });

  scored.sort((a, b) => b.score - a.score || a.index - b.index);

  const selectedIndices = new Set<number>();
  let totalLen = 0;
  for (const item of scored) {
    if (totalLen + item.chunk.length > maxChars && selectedIndices.size > 0) continue;
    selectedIndices.add(item.index);
    totalLen += item.chunk.length + 2;
    if (totalLen >= maxChars * 0.92) break;
  }

  return Array.from(selectedIndices)
    .sort((a, b) => a - b)
    .map((idx) => chunks[idx])
    .join('\n\n')
    .slice(0, maxChars);
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
  timeoutMs = 15_000,
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
    '1. **📌 Sorunun Analizi ve Verilenler:** Sorunun konusunu, verilen değerleri/tabloyu/denklemi ve isteneni net biçimde yaz. (Sayfada birden fazla numaralı soru varsa ve öğrenci tek bir numara belirtmediyse ana/ilk sorudan başlayarak net alt başlıklarla çöz.)',
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
    '- Matrislerde `\\begin{bmatrix}...\\end{bmatrix}`, genişletilmiş (Gauss-Jordan) matrislerde `\\left[\\begin{array}{ccc|c}...\\end{array}\\right]`, çok satırlı türetmelerde `\\begin{aligned}...\\end{aligned}`, nihai sonuçta `\\boxed{...}` kullan.',
    '- Uygunsuz veya akademik dışı/yasadışı isteklere kibarca yanıt veremeyeceğini belirt.',
    '',
    buildModeDirective(mode, hasImages),
    notesContext
      ? `\nPlatformdaki Mevcut Ders Notları (yalnızca ilgiliyse referans al):\n${notesContext.slice(0, 2_500)}`
      : '',
  ]
    .filter(Boolean)
    .join('\n');
}

export function formatStructuredSolutionToMarkdown(content: any): string | null {
  if (!content || typeof content !== 'object') return null;
  const overview = typeof content.overview === 'string' ? content.overview.trim() : '';

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
  report: (stage: AssistantProgressStage, percent: number, label: string) => void,
): Promise<void> {
  const clamped = Math.min(46, Math.max(1, Math.ceil(totalSeconds)));
  for (let remaining = clamped; remaining > 0; remaining--) {
    const doneRatio = (clamped - remaining) / clamped;
    report(
      'solve',
      Math.round(58 + doneRatio * 20),
      `Yoğunluk sırası bekleniyor, çözümünüz hazırlanıyor (${remaining} sn)...`,
    );
    await new Promise((r) => globalThis.setTimeout(r, 1000));
  }
}

async function invokePublicReasoningStemEngine(params: {
  systemPrompt: string;
  userContent: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  report: (stage: AssistantProgressStage, percent: number, label: string) => void;
}): Promise<string | null> {
  const { systemPrompt, userContent, history, report } = params;

  const waitMs = nextAllowedReasoningAt - Date.now();
  if (waitMs > 1000 && waitMs <= 46_000) {
    await sleepWithCountdown(Math.ceil(waitMs / 1000), report);
  }

  const messages = [
    { role: 'system', content: systemPrompt },
    ...history.slice(-6).map((m) => ({
      role: m.role,
      content: m.content.slice(0, 3_500),
    })),
    { role: 'user', content: userContent.slice(0, 16_000) },
  ];

  for (let attempt = 0; attempt < 3; attempt++) {
    const controller = new AbortController();
    const timer = globalThis.setTimeout(() => controller.abort(), 55_000);

    try {
      report('solve', 68, 'Matematiksel ve akademik çözüm adımları oluşturuluyor...');
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
        report('verify', 94, 'LaTeX formüller ve sağlama adımları düzenleniyor...');
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

      const retryMatch = rawText.match(/Retry after\s+(\d+)\s*s/i);
      if ((res.status === 402 || res.status === 429) && retryMatch && attempt < 2) {
        const waitSec = Math.min(46, Math.max(2, Number(retryMatch[1]) + 1));
        nextAllowedReasoningAt = Date.now() + waitSec * 1000;
        await sleepWithCountdown(waitSec, report);
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
    onProgress,
  } = params;

  const report = (stage: AssistantProgressStage, percent: number, label: string) => {
    onStatus?.(label);
    onProgress?.({ stage, percent, label });
  };

  // Stage 0: Instant conversational response for pure greetings/courtesies
  const instantGreeting = matchConversationalIntent(
    userQuestion,
    images.length > 0 || Boolean(documentText),
  );
  if (instantGreeting) {
    return instantGreeting;
  }

  report(
    'prepare',
    12,
    images.length > 0
      ? 'Soru görseli AI Vision analizi için hazırlanıyor...'
      : documentName
      ? `${documentName} ders notu analiz için hazırlanıyor...`
      : 'Soru analiz ediliyor...',
  );

  // Stage 1 & 2: Supabase Edge Functions (with fast 6s probe & 10-minute session circuit breaker)
  if (Date.now() >= getEdgeCooldownUntil()) {
    const edgeTimeout = edgeHasSucceededOnce ? 45_000 : 6_000;

    const primaryRes = await postEdgeFunction<{ reply?: string; error?: string }>(
      'academic-assistant',
      {
        message: fullMessageWithDoc,
        mode,
        notesContext: notesContext.slice(0, 25_000),
        history: history.slice(-10).map((m) => ({
          role: m.role,
          content: m.content.slice(0, 8_000),
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
      report('verify', 98, 'Çözüm hazır.');
      return primaryRes.data.reply;
    }

    const directive = buildModeDirective(mode, images.length > 0);

    if (primaryRes.status !== 401 && primaryRes.status !== 402 && primaryRes.status !== 0) {
      if (images.length === 0) {
        const coachHistory = history.slice(-8).map((m) => ({
          role: m.role,
          content: m.content.slice(0, 5_000),
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
              belgeMetni: documentText ? selectRelevantDocumentExcerpt(documentText, userQuestion, 18_000) : null,
              platformNotlari: notesContext.slice(0, 5_000),
            },
            messages: [...coachHistory, { role: 'user', content: coachUserPrompt }],
          },
          edgeTimeout,
        );

        if (coachRes.ok && coachRes.data?.reply) {
          edgeHasSucceededOnce = true;
          report('verify', 98, 'Çözüm hazır.');
          return coachRes.data.reply;
        }
      }

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
          noteContext: fullMessageWithDoc.slice(0, 60_000),
          ...(singleDocImage ? { document: singleDocImage } : {}),
        },
        edgeTimeout,
      );

      if (studyMatRes.ok && studyMatRes.data?.content) {
        const formatted = formatStructuredSolutionToMarkdown(studyMatRes.data.content);
        if (formatted) {
          edgeHasSucceededOnce = true;
          report('verify', 98, 'Çözüm hazır.');
          return formatted;
        }
      }
    }

    // Remember unhealthy Edge state for 10 minutes across the session so next uploads take 0ms overhead
    setEdgeCooldown(10 * 60_000);
  }

  const stemSystemPrompt = buildStemSystemPrompt(mode, images.length > 0, notesContext);

  let reasoningUserPrompt = userQuestion;
  if (documentText) {
    const trimmedDoc = selectRelevantDocumentExcerpt(documentText, userQuestion, 11_500);
    report('ocr', 55, `${documentName || 'Ders notu'} içindeki ilgili bölümler seçildi...`);
    reasoningUserPrompt = `[Yüklenen Ders Notu: ${documentName || 'Belge'}]\n\nİlgili Not İçeriği:\n${trimmedDoc}\n\nÖğrencinin İsteği: ${userQuestion}`;
  }

  // Stage 3: True Multimodal Vision-Language Cascade for gallery PNG/JPG photos (handwritten math, matrices, circuits, textbook pages)
  let extractedImageText = '';
  if (images.length > 0) {
    const visionReply = await invokeMultimodalVisionCascade({
      systemPrompt: stemSystemPrompt,
      userQuestion: reasoningUserPrompt,
      history,
      images,
      report,
    });

    if (visionReply) {
      report('verify', 100, 'Çözüm tamamlandı!');
      return visionReply;
    }

    // Fallback 3B: Specialized Handwritten Formula/Layout VLM OCR (`PaddleOCR-VL-1.5`) -> Browser Printed OCR (`Tesseract.js`)
    extractedImageText = await extractHandwrittenLatexViaVisionOcr(images, report);
    if (!extractedImageText) {
      extractedImageText = await extractMathTextFromImages(images, (ocrPct, ocrLabel) => {
        const mappedPct = Math.round(35 + (ocrPct / 100) * 25);
        report('ocr', mappedPct, ocrLabel);
      }).catch(() => '');
    }

    if (extractedImageText.trim().length >= 3) {
      reasoningUserPrompt = [
        `Öğrenci galeriden ${images.length} adet soru görseli (${images.map((i) => i.name).join(', ')}) yükledi.`,
        'Görselden okunan soru/tablo metni ve matematiksel LaTeX ifadeleri aşağıdadır. Olası küçük sembol kaymalarını akademik bağlama göre düzelterek yorumla, önce okuduğun soruyu/denklem sistemini net biçimde yaz ve ardından adım adım anlata anlata çöz:',
        '',
        '--- GÖRSELDEN OKUNAN MATEMATİKSEL METİN ---',
        extractedImageText.slice(0, 9_500),
        '--- SON ---',
        '',
        `Öğrencinin ek notu / isteği: ${userQuestion}`,
      ].join('\n');
    } else {
      return [
        '### 📷 Görseldeki Metin Net Okunamadı',
        'Yüklediğiniz görsel şu an otomatik vizyon taramasında yeterince net seçilemedi. En hızlı ve doğru adım adım çözüm için:',
        '- Fotoğrafta **sadece çözülmesini istediğiniz soruyu yakından kırparak (crop)** iyi ışıkta tekrar `PNG` / `JPG` olarak yükleyebilir, **veya**',
        '- Soruyu / denklem sistemini kısaca metin kutusuna yazabilirsiniz.',
      ].join('\n');
    }
  }

  // Stage 4: Cloud Reasoning STEM Engine (`GPT-OSS 20B Reasoning` + zero-cooldown Cloud STEM failover)
  const isPollinationsInCooldown = Date.now() < nextAllowedReasoningAt - 1_500;
  if (images.length === 0 && isPollinationsInCooldown) {
    const fastCloudReply = await invokeMultimodalVisionCascade({
      systemPrompt: stemSystemPrompt,
      userQuestion: reasoningUserPrompt,
      history,
      images: [],
      report,
    });
    if (fastCloudReply) {
      report('verify', 100, 'Çözüm tamamlandı!');
      return fastCloudReply;
    }
  }

  const reasoningReply = await invokePublicReasoningStemEngine({
    systemPrompt: stemSystemPrompt,
    userContent: reasoningUserPrompt,
    history,
    report,
  });

  if (reasoningReply) {
    report('verify', 100, 'Çözüm tamamlandı!');
    return reasoningReply;
  }

  if (images.length === 0 && !isPollinationsInCooldown) {
    const backupCloudReply = await invokeMultimodalVisionCascade({
      systemPrompt: stemSystemPrompt,
      userQuestion: reasoningUserPrompt,
      history,
      images: [],
      report,
    });
    if (backupCloudReply) {
      report('verify', 100, 'Çözüm tamamlandı!');
      return backupCloudReply;
    }
  }

  // Stage 5: Offline / Last-Resort Symbolic & Numerical Math Solver
  return solveLocallyAsLastResort({
    question: userQuestion,
    extractedImageText: extractedImageText || undefined,
    documentText,
    documentName,
  });
}
