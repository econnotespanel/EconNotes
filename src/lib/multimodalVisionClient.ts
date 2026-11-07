import { AssistantImageItem } from '@/lib/assistantAttachments';
import { AssistantProgressStage } from '@/lib/assistantClient';

const MINICPM_V47_SPACE = 'https://openbmb-minicpm-v-4-7-demo.hf.space';
const MINIMAX_VL01_SPACE = 'https://minimaxai-minimax-vl-01.hf.space';
const PADDLE_OCRVL_15_SPACE = 'https://paddlepaddle-paddleocr-vl-1-5-online-demo.hf.space';
const PADDLE_OCRVL_10_SPACE = 'https://paddlepaddle-paddleocr-vl-online-demo.hf.space';

interface GradioFileData {
  path: string;
  url: string;
  orig_name: string;
  mime_type: string;
  meta: { _type: 'gradio.FileData' };
}

export interface MultimodalVisionSolveParams {
  systemPrompt: string;
  userQuestion: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  images: AssistantImageItem[];
  report: (stage: AssistantProgressStage, percent: number, label: string) => void;
}

function createSessionHash(prefix = 'econ'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function base64ToUint8Array(base64Data: string): Uint8Array {
  const clean = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
  if (typeof globalThis.atob === 'function') {
    const bin = globalThis.atob(clean);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) {
      bytes[i] = bin.charCodeAt(i);
    }
    return bytes;
  }
  // Node / test fallback
  const buf = Buffer.from(clean, 'base64');
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}

function isUsableAssistantReply(text: unknown): text is string {
  if (typeof text !== 'string') return false;
  const trimmed = text.trim();
  if (trimmed.length < 25) return false;
  if (
    /^error:/i.test(trimmed) ||
    /^failed to get response/i.test(trimmed) ||
    trimmed.includes('<!DOCTYPE html>') ||
    trimmed.includes('503 Service Temporarily Unavailable') ||
    trimmed.includes('You have exceeded your ZeroGPU quota') ||
    trimmed.includes('Please provide a valid')
  ) {
    return false;
  }
  return true;
}

async function uploadImagesToGradioSpace(
  baseUrl: string,
  images: AssistantImageItem[],
  sessionHash: string,
  signal: AbortSignal,
): Promise<GradioFileData[]> {
  if (images.length === 0) return [];

  const form = new FormData();
  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    const bytes = base64ToUint8Array(img.base64Data);
    const safeName = img.name || `soru_${i + 1}.jpg`;
    form.append('files', new Blob([bytes], { type: img.mimeType || 'image/jpeg' }), safeName);
  }

  const res = await fetch(`${baseUrl}/gradio_api/upload?upload_id=${encodeURIComponent(sessionHash)}`, {
    method: 'POST',
    body: form,
    signal,
  });

  if (!res.ok) {
    throw new Error(`Görsel yükleme hatası (${res.status})`);
  }

  const paths = (await res.json()) as string[];
  if (!Array.isArray(paths) || paths.length === 0) {
    throw new Error('Görsel yolu alınamadı');
  }

  return paths.map((uploadedPath, idx) => ({
    path: uploadedPath,
    url: `${baseUrl}/gradio_api/file=${uploadedPath}`,
    orig_name: images[idx]?.name || `soru_${idx + 1}.jpg`,
    mime_type: images[idx]?.mimeType || 'image/jpeg',
    meta: { _type: 'gradio.FileData' },
  }));
}

async function runGradioQueueSession(params: {
  baseUrl: string;
  fnIndex: number;
  data: unknown[];
  sessionHash: string;
  signal: AbortSignal;
  onGenerating?: (outputData: any[]) => void;
}): Promise<any[]> {
  const { baseUrl, fnIndex, data, sessionHash, signal, onGenerating } = params;

  const joinRes = await fetch(`${baseUrl}/gradio_api/queue/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      data,
      fn_index: fnIndex,
      session_hash: sessionHash,
    }),
    signal,
  });

  if (!joinRes.ok) {
    throw new Error(`Queue join başarısız (${joinRes.status})`);
  }

  const sseRes = await fetch(
    `${baseUrl}/gradio_api/queue/data?session_hash=${encodeURIComponent(sessionHash)}`,
    { signal },
  );

  if (!sseRes.ok) {
    throw new Error(`Queue stream başarısız (${sseRes.status})`);
  }

  let completedData: any[] | null = null;

  const processLine = (rawLine: string) => {
    const line = rawLine.trim();
    if (!line.startsWith('data:')) return;
    const jsonPart = line.slice(5).trim();
    if (!jsonPart) return;

    let parsed: any;
    try {
      parsed = JSON.parse(jsonPart);
    } catch {
      return;
    }

    if (parsed.msg === 'process_generating' && Array.isArray(parsed.output?.data)) {
      onGenerating?.(parsed.output.data);
    } else if (parsed.msg === 'process_completed') {
      if (!parsed.success || !Array.isArray(parsed.output?.data)) {
        throw new Error('Model yanıt üretemedi');
      }
      completedData = parsed.output.data;
    }
  };

  if (sseRes.body && typeof sseRes.body.getReader === 'function') {
    const reader = sseRes.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        processLine(line);
        if (completedData) {
          try {
            await reader.cancel();
          } catch {
            // ignore reader cancel error
          }
          return completedData;
        }
      }
    }

    if (buffer.trim()) {
      processLine(buffer);
    }
  } else {
    const fullText = await sseRes.text();
    for (const line of fullText.split('\n')) {
      processLine(line);
    }
  }

  if (!completedData) {
    throw new Error('SSE akışı tamamlanmadı');
  }
  return completedData;
}

function buildMultimodalPrompt(
  systemPrompt: string,
  userQuestion: string,
  hasImages: boolean,
): string {
  const visionGuidance = hasImages
    ? [
        'GÖRSEL OKUMA VE ÇÖZÜM TALİMATI:',
        '- Kareli/çizgili defter kağıdı üzerindeki el yazısı denklemleri, indisleri ($x_1, x_2, x_3$), eksi işaretlerini, genişletilmiş matrisleri ($\\left[\\begin{array}{ccc|c}...\\end{array}\\right]$), satır işlemlerini, tabloları ve mühendislik diyagramlarını %100 dikkatle oku; defter karelerini işlem çizgisiyle karıştırma.',
        '- İlk olarak görselden okuduğun soruyu / denklem sistemini temiz ve standart LaTeX ile yaz.',
        '- Ardından hiçbir ara cebirsel veya matris satır işlemini atlamadan, samimi bir üniversite hocası gibi anlata anlata adım adım çöz ve nihai cevabı `\\boxed{...}` içine al.',
        '- Görselde öğrencinin kendi el yazısı çözümü de yer alıyorsa, kendi adım adım çözümünün sonunda öğrencinin el yazısı adımlarının ve bulduğu sonucun doğru olup olmadığını da açıkça doğrula (varsa işlem/işaret hatasını nazikçe göster).',
      ].join('\n')
    : '';

  return [
    systemPrompt,
    visionGuidance,
    `ÖĞRENCİNİN İSTEĞİ / SORUSU:\n${userQuestion}`,
    '⚠️ ZORUNLU DİL VE FORMAT KURALI: Düşünme sürecin hangi dilde olursa olsun, öğrenciye sunduğun nihai yanıtın, tüm başlıkların ("Adım 1", "Adım 2" vb.) ve tüm açıklamaların TAMAMI %100 akıcı, anlaşılır TÜRKÇE olmalıdır. İngilizce başlık kullanma.',
  ]
    .filter(Boolean)
    .join('\n\n');
}

function pairHistoryTurns(
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
): Array<[string, string]> {
  const pairs: Array<[string, string]> = [];
  const recent = history.slice(-6);
  let pendingUser = '';

  for (const item of recent) {
    const clean = item.content.slice(0, 2_500);
    if (item.role === 'user') {
      pendingUser = clean;
    } else if (item.role === 'assistant' && pendingUser) {
      pairs.push([pendingUser, clean]);
      pendingUser = '';
    }
  }
  return pairs;
}

/**
 * Tier 1 Cloud Multimodal STEM Reasoning VLM (`MiniCPM-V-4.7-35B-A3B` with Thinking Mode).
 * Supports 1-3 gallery PNG/JPG images (handwritten math, matrices, circuits, tables) AND text/PDF STEM failover.
 */
async function invokeMiniCpmVisionEngine(
  params: MultimodalVisionSolveParams,
): Promise<string | null> {
  const { systemPrompt, userQuestion, history, images, report } = params;
  const controller = new AbortController();
  const timer = globalThis.setTimeout(() => controller.abort(), 70_000);

  try {
    const sessionHash = createSessionHash('cpm');
    if (images.length > 0) {
      report('ocr', 24, 'Görsel yapay zeka vizyon motoruna aktarılıyor...');
    }

    const uploadedFiles = await uploadImagesToGradioSpace(
      MINICPM_V47_SPACE,
      images,
      sessionHash,
      controller.signal,
    );

    if (images.length > 0) {
      report('ocr', 38, 'El yazısı denklemler, matrisler ve şekiller okunuyor...');
    } else {
      report('solve', 48, 'Akademik muhakeme motoru çözümü hazırlıyor...');
    }

    const combinedPrompt = buildMultimodalPrompt(systemPrompt, userQuestion, images.length > 0);
    const pairedHistory = pairHistoryTurns(history);

    const args = [
      combinedPrompt,
      pairedHistory,
      uploadedFiles,
      true, // thinking_mode = true for rigorous math/matrix verification
      10240, // max_new_tokens (shared across reasoning + full step-by-step LaTeX answer, max 16384)
      0.2, // temperature
      0.8, // top_p
      100, // top_k
      64, // max_frames
      'Sampling',
      true, // streaming_mode
      2, // beam_width
      '4x', // downsample_mode (preserves fine handwritten subscripts & minus signs)
      null,
      null,
      'auto',
      null,
      'MiniCPM-V-4.7-35B-A3B',
    ];

    let lastStreamContent = '';
    const out = await runGradioQueueSession({
      baseUrl: MINICPM_V47_SPACE,
      fnIndex: 0,
      data: args,
      sessionHash,
      signal: controller.signal,
      onGenerating: (data) => {
        const payload = data?.[0];
        if (!payload || typeof payload !== 'object') return;
        const reasoningLen = typeof payload.reasoning === 'string' ? payload.reasoning.length : 0;
        const contentStr = typeof payload.content === 'string' ? payload.content : '';
        if (contentStr.length > 0) {
          lastStreamContent = contentStr;
          const pct = Math.min(93, 66 + Math.floor(contentStr.length / 95));
          report('solve', pct, 'Adım adım Türkçe ve LaTeX çözüm yazılıyor...');
        } else if (reasoningLen > 0) {
          const pct = Math.min(64, 40 + Math.floor(reasoningLen / 160));
          report(
            images.length > 0 ? 'ocr' : 'solve',
            pct,
            images.length > 0
              ? 'Denklemler ve matris işlemleri satır satır doğrulanıyor...'
              : 'Matematiksel adımlar doğrulanıyor...',
          );
        }
      },
    });

    const finalContent = out?.[0]?.content || lastStreamContent;
    if (isUsableAssistantReply(finalContent)) {
      return finalContent.trim();
    }
    return null;
  } catch {
    return null;
  } finally {
    globalThis.clearTimeout(timer);
  }
}

/**
 * Tier 2 Cloud Multimodal VLM (`MiniMax-VL-01`).
 */
async function invokeMiniMaxVisionEngine(
  params: MultimodalVisionSolveParams,
): Promise<string | null> {
  const { systemPrompt, userQuestion, images, report } = params;
  const controller = new AbortController();
  const timer = globalThis.setTimeout(() => controller.abort(), 48_000);

  try {
    const sessionHash = createSessionHash('mmvl');
    if (images.length > 0) {
      report('ocr', 42, 'Alternatif görsel matematik motoru bağlanıyor...');
    }

    const uploadedFiles = await uploadImagesToGradioSpace(
      MINIMAX_VL01_SPACE,
      images,
      sessionHash,
      controller.signal,
    );

    const combinedPrompt = buildMultimodalPrompt(systemPrompt, userQuestion, images.length > 0);
    let streamedReply = '';

    const out = await runGradioQueueSession({
      baseUrl: MINIMAX_VL01_SPACE,
      fnIndex: 16,
      data: [{ text: combinedPrompt, files: uploadedFiles }, null, 3500, 0.2, 0.9],
      sessionHash,
      signal: controller.signal,
      onGenerating: (data) => {
        const partial = data?.[0];
        if (typeof partial === 'string' && partial.length > 0) {
          streamedReply = partial;
          const pct = Math.min(92, 58 + Math.floor(partial.length / 90));
          report('solve', pct, 'Adım adım matematiksel çözüm oluşturuluyor...');
        }
      },
    });

    const finalReply = typeof out?.[0] === 'string' ? out[0] : streamedReply;
    if (isUsableAssistantReply(finalReply)) {
      return finalReply.trim();
    }
    return null;
  } catch {
    return null;
  } finally {
    globalThis.clearTimeout(timer);
  }
}

/**
 * Tier 3 Specialized Handwritten Math, Matrix & Document Layout VLM (`PaddleOCR-VL-1.5` / `1.0`).
 * Extracts structured Markdown + LaTeX (`$$...$$`, `\begin{bmatrix}`, tables) when direct VLM chat spaces are busy.
 */
export async function extractHandwrittenLatexViaVisionOcr(
  images: AssistantImageItem[],
  report: (stage: AssistantProgressStage, percent: number, label: string) => void,
): Promise<string> {
  if (images.length === 0) return '';

  const extractedPages: string[] = [];

  for (let idx = 0; idx < images.length; idx++) {
    const img = images[idx];
    report(
      'ocr',
      Math.round(35 + (idx / images.length) * 20),
      images.length > 1
        ? `Görsel ${idx + 1}/${images.length} formül ve el yazısı taramasından geçiriliyor...`
        : 'El yazısı formül ve matris taraması yapılıyor...',
    );

    let pageLatex = '';

    // Attempt PaddleOCR-VL-1.5 first
    try {
      const controller = new AbortController();
      const timer = globalThis.setTimeout(() => controller.abort(), 28_000);
      try {
        const sh = createSessionHash('pad15');
        const [fileObj] = await uploadImagesToGradioSpace(
          PADDLE_OCRVL_15_SPACE,
          [img],
          sh,
          controller.signal,
        );
        await runGradioQueueSession({
          baseUrl: PADDLE_OCRVL_15_SPACE,
          fnIndex: 1,
          data: [fileObj],
          sessionHash: sh,
          signal: controller.signal,
        });
        const out = await runGradioQueueSession({
          baseUrl: PADDLE_OCRVL_15_SPACE,
          fnIndex: 2,
          data: [fileObj, null, false, false, false],
          sessionHash: sh,
          signal: controller.signal,
        });
        if (typeof out?.[0] === 'string' && out[0].trim().length > 3) {
          pageLatex = out[0].trim();
        }
      } finally {
        globalThis.clearTimeout(timer);
      }
    } catch {
      // failover to PaddleOCR-VL-1.0 below
    }

    // Attempt PaddleOCR-VL-1.0 if 1.5 did not return text
    if (!pageLatex) {
      try {
        const controller = new AbortController();
        const timer = globalThis.setTimeout(() => controller.abort(), 25_000);
        try {
          const sh = createSessionHash('pad10');
          const [fileObj] = await uploadImagesToGradioSpace(
            PADDLE_OCRVL_10_SPACE,
            [img],
            sh,
            controller.signal,
          );
          await runGradioQueueSession({
            baseUrl: PADDLE_OCRVL_10_SPACE,
            fnIndex: 1,
            data: [fileObj],
            sessionHash: sh,
            signal: controller.signal,
          });
          const out = await runGradioQueueSession({
            baseUrl: PADDLE_OCRVL_10_SPACE,
            fnIndex: 2,
            data: [fileObj, null, false, false, false],
            sessionHash: sh,
            signal: controller.signal,
          });
          if (typeof out?.[0] === 'string' && out[0].trim().length > 3) {
            pageLatex = out[0].trim();
          }
        } finally {
          globalThis.clearTimeout(timer);
        }
      } catch {
        // ignore
      }
    }

    if (pageLatex) {
      extractedPages.push(
        images.length > 1 ? `[Görsel ${idx + 1}: ${img.name}]\n${pageLatex}` : pageLatex,
      );
    }
  }

  return extractedPages.join('\n\n');
}

/**
 * Orchestrates our True Multimodal Vision Cascade (`MiniCPM-V-4.7-35B-A3B Thinking` -> `MiniMax-VL-01`)
 * for end-to-end visual reading + step-by-step Turkish STEM solution.
 */
export async function invokeMultimodalVisionCascade(
  params: MultimodalVisionSolveParams,
): Promise<string | null> {
  const primaryReply = await invokeMiniCpmVisionEngine(params);
  if (primaryReply) {
    return primaryReply;
  }

  const secondaryReply = await invokeMiniMaxVisionEngine(params);
  if (secondaryReply) {
    return secondaryReply;
  }

  return null;
}
