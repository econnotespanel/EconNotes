// Bağlamsal AI Akıl Hocası — kullanıcı üretilen bir çalışma materyali hakkında
// takip soruları sorar; AI o materyalin içeriğini bağlam olarak kullanır.
import {
  getAuthenticatedUser,
  isTrustedOrigin,
  jsonResponse,
  preflightResponse,
  readJsonBody,
  RequestError,
} from '../_shared/request-security.ts';

interface ChatMsg { role: 'user' | 'assistant'; content: string }

interface Req {
  materialTitle: string;
  materialType: 'flashcards' | 'quiz' | 'summary' | 'video';
  course?: string;
  materialContent: any;
  messages: ChatMsg[];
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

    const body = await readJsonBody<Req>(req, 1_048_576);
    if (
      typeof body.materialTitle !== 'string'
      || body.materialTitle.length > 300
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

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      return jsonResponse(req, { error: 'AI yapılandırılmamış.' }, 500);
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
