// Bağlamsal AI Akıl Hocası — kullanıcı üretilen bir çalışma materyali hakkında
// takip soruları sorar; AI o materyalin içeriğini bağlam olarak kullanır.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ChatMsg { role: 'user' | 'assistant'; content: string }

interface Req {
  materialTitle: string;
  materialType: 'flashcards' | 'quiz' | 'summary' | 'video';
  course?: string;
  materialContent: any;
  messages: ChatMsg[];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const body: Req = await req.json();
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: 'AI yapılandırılmamış' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
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

    if (r.status === 429) return new Response(JSON.stringify({ error: 'Yoğunluk: Birazdan tekrar deneyin.' }), { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    if (r.status === 402) return new Response(JSON.stringify({ error: 'AI kredisi tükendi.' }), { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const data = await r.json();
    const reply = data.choices?.[0]?.message?.content ?? 'Yanıt üretilemedi.';
    return new Response(JSON.stringify({ reply }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
