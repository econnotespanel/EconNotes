import {
  getAuthenticatedUser,
  isTrustedOrigin,
  jsonResponse,
  preflightResponse,
  readJsonBody,
  RequestError,
} from '../_shared/request-security.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflightResponse(req);
  if (!isTrustedOrigin(req.headers.get('origin'))) {
    return jsonResponse(req, { error: 'Bu kaynaktan isteğe izin verilmiyor.' }, 403);
  }
  if (req.method !== 'POST') return jsonResponse(req, { error: 'Yalnızca POST istekleri desteklenir.' }, 405);

  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return jsonResponse(req, { error: 'Bu işlem için giriş yapmalısınız.' }, 401);

    const body = await readJsonBody<{
      message: string;
      notesContext?: string;
      history?: Array<{ role: 'user' | 'assistant'; content: string }>;
      hasFile?: boolean;
      fileName?: string;
    }>(req, 1_048_576);
    const { message, notesContext, history, hasFile, fileName } = body;
    if (
      typeof message !== 'string'
      || message.length > 30_000
      || (notesContext !== undefined && (typeof notesContext !== 'string' || notesContext.length > 40_000))
      || (fileName !== undefined && (typeof fileName !== 'string' || fileName.length > 256))
      || (history !== undefined && (
        !Array.isArray(history)
        || history.length > 12
        || history.some((item) =>
          !item
          || !['user', 'assistant'].includes(item.role)
          || typeof item.content !== 'string'
          || item.content.length > 10_000
        )
      ))
    ) {
      throw new RequestError('İstek içeriği geçersiz.', 400);
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      return jsonResponse(req, { reply: 'AI servisi yapılandırılmamış.' }, 500);
    }

    let systemPrompt = `Sen EconNotes Akademik Asistanısın. Üniversite öğrencilerine ders konularını anlatıyorsun.
Türkçe yanıt ver. Akademik ve anlaşılır bir dille açıkla. Markdown formatı kullan.
Kullanıcı sana dosya gönderebilir. Dosya içeriğini analiz et, özetle ve önemli noktaları çıkar.
Ders özeti istendiğinde detaylı ve düzenli bir şekilde özetle.

ÖNEMLİ GÜVENLİK KURALLARI:
- Uygunsuz, müstehcen, hakaret içeren veya yasadışı içerikli mesajlara ASLA yanıt verme.
- Eğer kullanıcı uygunsuz bir mesaj veya dosya paylaşırsa, kibarca reddet ve şu mesajı ver: "Bu tür içeriklere yanıt veremiyorum. Lütfen akademik konularla ilgili sorular sorun."
- Sadece eğitim ve akademik konularda yardımcı ol.
- Siyasi, dini veya tartışmalı konularda taraf tutma, objektif kal.
- Kişisel bilgi isteme veya paylaşma.

Mevcut Platformdaki Notlar:
${notesContext || 'Henüz not yüklenmemiş.'}`;

    if (hasFile && fileName) {
      systemPrompt += `\n\nKullanıcı "${fileName}" adlı bir dosya yükledi. Dosya içeriği mesajda yer alıyor. İçeriği analiz et ve kullanıcının sorusuna göre yanıt ver.`;
    }

    const messages = [
      ...(history || []).map((m: any) => ({ role: m.role, content: m.content })),
      { role: 'user', content: message },
    ];

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-pro',
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages,
        ],
        max_tokens: 4000,
      }),
    });

    if (response.status === 429) return jsonResponse(req, { error: 'Yoğunluk: Birazdan tekrar deneyin.' }, 429);
    if (response.status === 402) return jsonResponse(req, { error: 'AI kredisi tükendi.' }, 402);
    if (!response.ok) {
      console.error(`academic-assistant gateway error: ${response.status}`);
      return jsonResponse(req, { error: 'AI servisi yanıt vermedi.' }, 502);
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content || 'Yanıt alınamadı.';

    return jsonResponse(req, { reply });
  } catch (error) {
    if (error instanceof RequestError) return jsonResponse(req, { error: error.message }, error.status);
    console.error('academic-assistant request failed:', error);
    return jsonResponse(req, { error: 'Bir hata oluştu. Lütfen tekrar deneyin.' }, 500);
  }
});
