// Bağlamsal AI Akıl Hocası & Stüdyo Neural Seslendirme (TTS) Servisi
import {
  getAuthenticatedUser,
  isTrustedOrigin,
  jsonResponse,
  preflightResponse,
  readJsonBody,
  RequestError,
} from '../_shared/request-security.ts';

interface ChatMsg { role: 'user' | 'assistant'; content: string }

interface CoachReq {
  mode?: 'chat' | 'tts';
  // Chat alanları
  materialTitle?: string;
  materialType?: 'flashcards' | 'quiz' | 'summary' | 'video';
  course?: string;
  materialContent?: any;
  messages?: ChatMsg[];
  // TTS alanları
  text?: string;
  speaker?: 'Deniz' | 'Barış';
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

/** Ham 16-bit mono PCM (24kHz) verisini standart RIFF WAV başlığıyla sarar */
function wrapPcm16ToWav(pcm: Uint8Array, sampleRate = 24000, numChannels = 1): Uint8Array {
  const byteRate = sampleRate * numChannels * 2;
  const blockAlign = numChannels * 2;
  const wav = new Uint8Array(44 + pcm.length);
  const view = new DataView(wav.buffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + pcm.length, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM
  view.setUint16(20, 1, true);  // Linear PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true); // 16-bit
  writeStr(36, 'data');
  view.setUint32(40, pcm.length, true);
  wav.set(pcm, 44);
  return wav;
}

function looksLikeContainerAudio(bytes: Uint8Array): boolean {
  if (bytes.length < 4) return false;
  // RIFF (WAV), ID3 / MPEG sync (MP3), OggS (OGG)
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) return true;
  if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) return true;
  if (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) return true;
  if (bytes[0] === 0x4f && bytes[1] === 0x67 && bytes[2] === 0x67 && bytes[3] === 0x53) return true;
  return false;
}

async function handleStudioTts(req: Request, body: CoachReq, apiKey: string): Promise<Response> {
  const text = (body.text ?? '').trim();
  const speaker = body.speaker === 'Barış' ? 'Barış' : 'Deniz';

  if (!text || text.length > 2400) {
    throw new RequestError('Seslendirilecek metin geçersiz.', 400);
  }

  // Resmi yapılandırılmış sağlayıcı denemeleri (varsa özel anahtar, yoksa Lovable AI Gateway TTS)
  const openaiKey = Deno.env.get('OPENAI_API_KEY');
  if (openaiKey) {
    const r = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini-tts',
        voice: speaker === 'Deniz' ? 'nova' : 'onyx',
        input: text,
        instructions: speaker === 'Deniz'
          ? 'Sıcak, doğal, akıcı ve anlaşılır bir üniversite akademisyeni tonuyla Türkçe konuş.'
          : 'Meraklı, enerjik, doğal ve samimi bir araştırmacı tonuyla Türkçe konuş.',
        response_format: 'mp3',
      }),
    });
    if (r.ok) {
      const buf = new Uint8Array(await r.arrayBuffer());
      if (buf.length > 256) {
        return jsonResponse(req, { audioBase64: encodeBase64(buf), mimeType: 'audio/mpeg', provider: 'openai-tts' });
      }
    }
  }

  const gatewayAttempts = [
    {
      model: 'google/gemini-2.5-flash-tts',
      voice: speaker === 'Deniz' ? 'Kore' : 'Orus',
    },
    {
      model: 'google/gemini-3.1-flash-tts-preview',
      voice: speaker === 'Deniz' ? 'Kore' : 'Puck',
    },
    {
      model: 'openai/gpt-4o-mini-tts',
      voice: speaker === 'Deniz' ? 'nova' : 'onyx',
    },
  ];

  for (const attempt of gatewayAttempts) {
    try {
      const r = await fetch('https://ai.gateway.lovable.dev/v1/audio/speech', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: attempt.model,
          input: text,
          voice: attempt.voice,
          response_format: 'mp3',
        }),
      });

      if (!r.ok) continue;

      const ct = (r.headers.get('content-type') || '').toLowerCase();
      if (ct.includes('application/json')) {
        const j = await r.json();
        const b64 = j?.audio || j?.audioBase64 || j?.data;
        if (typeof b64 === 'string' && b64.length > 200) {
          return jsonResponse(req, {
            audioBase64: b64,
            mimeType: j?.mimeType || 'audio/mpeg',
            provider: attempt.model,
          });
        }
        continue;
      }

      const rawBytes = new Uint8Array(await r.arrayBuffer());
      if (rawBytes.length < 256) continue;

      if (ct.includes('pcm') || ct.includes('l16') || !looksLikeContainerAudio(rawBytes)) {
        const wavBytes = wrapPcm16ToWav(rawBytes, 24000, 1);
        return jsonResponse(req, {
          audioBase64: encodeBase64(wavBytes),
          mimeType: 'audio/wav',
          provider: attempt.model,
        });
      }

      const mimeType = ct.includes('wav')
        ? 'audio/wav'
        : ct.includes('ogg')
        ? 'audio/ogg'
        : 'audio/mpeg';

      return jsonResponse(req, {
        audioBase64: encodeBase64(rawBytes),
        mimeType,
        provider: attempt.model,
      });
    } catch {
      // Bir sonraki modeli dene
    }
  }

  return jsonResponse(req, { fallback: true }, 200);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflightResponse(req);
  if (!isTrustedOrigin(req.headers.get('origin'))) {
    return jsonResponse(req, { error: 'Bu kaynaktan isteğe izin verilmiyor.' }, 403);
  }
  if (req.method !== 'POST') return jsonResponse(req, { error: 'Yalnızca POST istekleri desteklenir.' }, 405);

  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return jsonResponse(req, { error: 'Bu işlem için giriş yapmalısınız.' }, 401);

    const body = await readJsonBody<CoachReq>(req, 1_048_576);
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      return jsonResponse(req, { error: 'AI yapılandırılmamış.' }, 500);
    }

    if (body.mode === 'tts') {
      return await handleStudioTts(req, body, LOVABLE_API_KEY);
    }

    if (
      typeof body.materialTitle !== 'string'
      || body.materialTitle.length > 300
      || !body.materialType
      || !['flashcards', 'quiz', 'summary', 'video'].includes(body.materialType)
      || !Array.isArray(body.messages)
      || body.messages.length > 40
      || body.messages.some((message) =>
        !message
        || !['user', 'assistant'].includes(message.role)
        || typeof message.content !== 'string'
        || message.content.length > 8_000
      )
    ) {
      throw new RequestError('İstek içeriği geçersiz.', 400);
    }

    const contextJson = JSON.stringify(body.materialContent).slice(0, 60_000);

    const system = `Sen EconNotes Akıl Hocası'sın — üniversite öğrencisinin yanı başında oturan, sabırlı ve net konuşan bir Türkçe ders koçusun.
KURALLAR:
- Sadece akademik, öğrenmeye yönelik içerik. Uygunsuz/yasadışı/sınav kopyası vb. isteklere kibarca hayır de.
- Cevapların kısa, somut, örnekli, Türkçe ve akademik dilde olsun. Madde işaretleri ve kısa paragraflar kullan.
- Öğrencinin önündeki materyali kaynak al; gerekirse alıntı yap. Materyalde yoksa "materyalde geçmiyor ama genel olarak..." diye belirt.
- Cevap veremeyecek kadar belirsiz soruda 1 tane netleştirme sorusu sor.

ÇALIŞILAN MATERYAL:
- Tür: ${body.materialType}
- Başlık: ${body.materialTitle}
- Ders: ${body.course ?? '-'}
- İçerik (JSON): ${contextJson}`;

    const messages = [
      { role: 'system', content: system },
      ...body.messages.slice(-12),
    ];

    const r = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'google/gemini-2.5-pro', messages }),
    });

    if (r.status === 429) return jsonResponse(req, { error: 'Yoğunluk: Birazdan tekrar deneyin.' }, 429);
    if (r.status === 402) return jsonResponse(req, { error: 'AI kredisi tükendi.' }, 402);
    if (!r.ok) {
      console.error(`study-coach gateway error: ${r.status}`);
      return jsonResponse(req, { error: 'AI servisi yanıt vermedi.' }, 502);
    }

    const data = await r.json();
    const reply = data.choices?.[0]?.message?.content ?? 'Yanıt üretilemedi.';
    return jsonResponse(req, { reply });
  } catch (error) {
    if (error instanceof RequestError) return jsonResponse(req, { error: error.message }, error.status);
    console.error('study-coach request failed:', error);
    return jsonResponse(req, { error: 'İstek işlenemedi.' }, 500);
  }
});
