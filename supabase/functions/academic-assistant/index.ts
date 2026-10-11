const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { message, notesContext, history, hasFile, fileName } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ reply: 'AI servisi yapılandırılmamış.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
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

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content || 'Yanıt alınamadı.';

    return new Response(JSON.stringify({ reply }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ reply: 'Bir hata oluştu. Lütfen tekrar deneyin.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
