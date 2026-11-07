import { supabase, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from '@/integrations/supabase/client';
import { AssistantImageItem, combineImagesForSingleDocument } from '@/lib/assistantAttachments';

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
}

interface EdgeCallResult<T = any> {
  ok: boolean;
  status: number;
  data: T | null;
  errorMessage?: string;
}

async function getValidAccessToken(): Promise<string | null> {
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
}

/**
 * Direct fetch to Supabase Edge Functions using strictly standard CORS-allowed headers
 * (`Authorization`, `apikey`, `Content-Type`) so browser preflights never fail with
 * `FunctionsFetchError: Failed to send a request to the Edge Function`.
 */
async function postEdgeFunction<T = any>(
  functionName: string,
  payload: Record<string, unknown>,
  timeoutMs = 115_000,
): Promise<EdgeCallResult<T>> {
  const token = await getValidAccessToken();
  if (!token) {
    return {
      ok: false,
      status: 401,
      data: null,
      errorMessage: 'Oturumunuz doğrulanamadı. Lütfen tekrar giriş yapın.',
    };
  }

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);

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
      errorMessage: isAbort
        ? 'Soru çözümü zaman aşımına uğradı. Lütfen daha net/küçük bir görselle tekrar deneyin.'
        : ' Bağlantı kurulamadı.',
    };
  } finally {
    window.clearTimeout(timer);
  }
}

function buildModeDirective(mode: AssistantSolveMode, hasImages: boolean): string {
  if (mode === 'check_solution') {
    return [
      'GÖREV: Öğrencinin çözümünü satır satır kontrol et.',
      '- Doğru yapılan adımları onayla; işlem, işaret, formül veya birim hatası varsa tam olarak hangi adımda hata yapıldığını ve nedenini açıkla.',
      '- Hatanın olduğu yerden itibaren doğru çözümü hiçbir ara işlemi atlamadan LaTeX ($...$ ve $$...$$) ile tamamla ve sağlamasını yap.',
    ].join('\n');
  }
  if (mode === 'concept') {
    return [
      'GÖREV: Konuyu ve formülleri sezgisel mantığıyla anlata anlata açıkla.',
      '- Formüllerdeki her sembolün anlamını ve birimini LaTeX ($...$ ve $$...$$) ile yaz.',
      '- Öğretici 1 adet adım adım çözümlü örnek ekle ve sınav tuzaklarını belirt.',
    ].join('\n');
  }
  return [
    `GÖREV: ${hasImages ? 'Yüklenen görseldeki' : 'Sorulan'} matematik/mühendislik/akademik soruyu HİÇBİR ARA İŞLEMİ ATLAMADAN, anlata anlata adım adım çöz.`,
    '- Önce sorudan okuduğun denklemi/verilenleri ve isteneni net biçimde yaz.',
    '- Kullanacağın teorem veya formülün neden seçildiğini açıkla.',
    '- Adım 1, Adım 2, Adım 3... şeklinde her adımda ne yaptığını Türkçe anlatıp denklemleri standart LaTeX ($...$ ve $$...$$) ile göster.',
    '- Nihai cevabı \\boxed{...} içinde birimiyle (ve varsa doğru şık harfiyle) vurgula ve sonunda sağlama yap.',
  ].join('\n');
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
      const heading = typeof sec.heading === 'string' && sec.heading.trim() ? sec.heading.trim() : 'Çözüm Adımı';
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

/**
 * Invokes `academic-assistant` first, and transparently fails over to the live
 * multimodal `generate-study-material` (for PNG/JPG images) and `study-coach` (for text/PDF)
 * endpoints if `academic-assistant` is unavailable or returns a server error.
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
  } = params;

  // 1. Primary call: dedicated `academic-assistant` edge function
  const primaryRes = await postEdgeFunction<{ reply?: string; error?: string }>('academic-assistant', {
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
  });

  if (primaryRes.ok && primaryRes.data?.reply) {
    return primaryRes.data.reply;
  }

  if (primaryRes.status === 401) {
    throw new Error('Oturum süreniz dolmuş olabilir. Lütfen sayfayı yenileyip tekrar deneyin.');
  }
  if (primaryRes.status === 429 || primaryRes.status === 402) {
    throw new Error(primaryRes.errorMessage || 'AI servisi şu anda yoğun, lütfen birazdan tekrar deneyin.');
  }

  console.warn(
    '[AcademicAssistant] Primary endpoint returned non-OK, activating seamless multimodal failover:',
    primaryRes.status,
    primaryRes.errorMessage,
  );

  const directive = buildModeDirective(mode, images.length > 0);

  // 2. Failover A (Text / PDF / Word questions without images): `study-coach` conversational endpoint
  if (images.length === 0) {
    const coachHistory = history.slice(-8).map((m) => ({
      role: m.role,
      content: m.content.slice(0, 6_000),
    }));

    const coachUserPrompt = `${directive}\n\nÖĞRENCİNİN SORUSU:\n${userQuestion}`.slice(0, 7_800);

    const coachRes = await postEdgeFunction<{ reply?: string }>('study-coach', {
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
    });

    if (coachRes.ok && coachRes.data?.reply) {
      return coachRes.data.reply;
    }
  }

  // 3. Failover B (Multimodal Vision for PNG/JPG Gallery Images & Universal Backup): `generate-study-material`
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

  const recentContext = history
    .slice(-4)
    .map((m) => `${m.role === 'user' ? 'Öğrenci' : 'Asistan'}: ${m.content.slice(0, 1_500)}`)
    .join('\n\n');

  const noteContextPayload = [
    images.length > 0
      ? `Öğrenci galeriden ${images.length} adet soru görseli (${images.map((i) => i.name).join(', ')}) gönderdi. Görseldeki tüm matematiksel sembolleri, üsleri, indisleri, devre/şekil değerlerini ve şıkları dikkatle okuyup adım adım anlata anlata çöz.`
      : '',
    documentText ? `Yüklenen Belge (${documentName}):\n${documentText.slice(0, 35_000)}` : '',
    recentContext ? `Önceki Sohbet Bağlamı:\n${recentContext}` : '',
    `Öğrencinin İsteği:\n${userQuestion}`,
  ]
    .filter(Boolean)
    .join('\n\n')
    .slice(0, 120_000);

  const studyMatRes = await postEdgeFunction<{ content?: any }>('generate-study-material', {
    materialType: 'summary',
    noteTitle:
      mode === 'check_solution'
        ? 'Çözüm Kontrolü ve Adım Adım Hata Analizi'
        : 'Adım Adım Matematik ve Mühendislik Soru Çözümü',
    course: 'Matematik, Mühendislik ve Temel Bilimler',
    summaryLength: 'detailed',
    noteStyle: mode === 'concept' ? 'formula_concepts' : 'solved_cases',
    customPrompt: customDirective,
    noteContext: noteContextPayload || userQuestion,
    ...(singleDocImage ? { document: singleDocImage } : {}),
  });

  if (studyMatRes.ok && studyMatRes.data?.content) {
    const formatted = formatStructuredSolutionToMarkdown(studyMatRes.data.content);
    if (formatted) {
      return formatted;
    }
  }

  throw new Error(
    primaryRes.errorMessage && !/failed|edge function/i.test(primaryRes.errorMessage)
      ? primaryRes.errorMessage
      : 'Şu anda soru çözüm servisine ulaşılamadı. Lütfen birkaç saniye bekleyip tekrar gönderin.',
  );
}
