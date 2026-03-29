import "https://esm.sh/@anthropic-ai/sdk@0.39.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { message, notesContext, history } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ reply: 'AI servisi yapılandırılmamış.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const systemPrompt = `Sen EconNotes Akademik Asistanısın. Üniversite öğrencilerine ders konularını anlatıyorsun.
Aşağıda platformdaki mevcut ders notları listesi var. Kullanıcı bir ders veya konu sorduğunda, bu notlara referans vererek açıklama yap.
Türkçe yanıt ver. Akademik ve anlaşılır bir dille açıkla. Markdown formatı kullan.

Mevcut Notlar:
${notesContext || 'Henüz not yüklenmemiş.'}`;

    const messages = [
      ...(history || []).map((m: any) => ({ role: m.role, content: m.content })),
      { role: 'user', content: message },
    ];

    const response = await fetch('https://api.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages,
        ],
        max_tokens: 2000,
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
