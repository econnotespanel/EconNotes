// KPSS Çalışma Merkezi — AI ile çıkabilecek konular, konu özeti, çözümlü test ve kart üretimi
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type KpssType = 'topics' | 'summary' | 'quiz' | 'flashcards';

interface KpssRequest {
  type: KpssType;
  subject: string;          // örn. "Tarih", "Vatandaşlık", "İktisat"
  topic?: string;           // opsiyonel alt konu
  examGroup?: string;       // Lisans / Önlisans / Ortaöğretim / A Grubu
  difficulty?: 'easy' | 'medium' | 'hard';
  count?: number;
  extraFocus?: string;
}

const schemas: Record<KpssType, any> = {
  topics: {
    type: 'object',
    properties: {
      overview: { type: 'string' },
      topics: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            probability: { type: 'integer' },
            expectedQuestions: { type: 'string' },
            whyImportant: { type: 'string' },
            trap: { type: 'string' },
            subTopics: { type: 'array', items: { type: 'string' } },
          },
          required: ['name', 'probability', 'whyImportant'],
          additionalProperties: false,
        },
      },
      studyPlan: { type: 'array', items: { type: 'string' } },
    },
    required: ['overview', 'topics', 'studyPlan'],
    additionalProperties: false,
  },
  summary: {
    type: 'object',
    properties: {
      overview: { type: 'string' },
      keyPoints: { type: 'array', items: { type: 'string' } },
      sections: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            heading: { type: 'string' },
            content: { type: 'string' },
            examNote: { type: 'string' },
          },
          required: ['heading', 'content'],
          additionalProperties: false,
        },
      },
      mnemonics: { type: 'array', items: { type: 'string' } },
      commonMistakes: { type: 'array', items: { type: 'string' } },
    },
    required: ['overview', 'keyPoints', 'sections'],
    additionalProperties: false,
  },
  quiz: {
    type: 'object',
    properties: {
      questions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            question: { type: 'string' },
            options: { type: 'array', items: { type: 'string' } },
            correctIndex: { type: 'integer' },
            solution: { type: 'string' },
            optionAnalysis: { type: 'array', items: { type: 'string' } },
            topic: { type: 'string' },
            difficulty: { type: 'string' },
          },
          required: ['question', 'options', 'correctIndex', 'solution'],
          additionalProperties: false,
        },
      },
    },
    required: ['questions'],
    additionalProperties: false,
  },
  flashcards: {
    type: 'object',
    properties: {
      cards: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            front: { type: 'string' },
            back: { type: 'string' },
            hint: { type: 'string' },
          },
          required: ['front', 'back'],
          additionalProperties: false,
        },
      },
    },
    required: ['cards'],
    additionalProperties: false,
  },
};

function buildPrompt(body: KpssRequest) {
  const difficulty = body.difficulty ?? 'medium';
  const group = body.examGroup ?? 'KPSS Lisans';
  const topicLine = body.topic ? `ALT KONU: ${body.topic}` : 'ALT KONU: (tüm ders genelinde)';
  const focusLine = body.extraFocus ? `ÖĞRENCİ ODAĞI: ${body.extraFocus}` : '';

  const system = `Sen EconNotes KPSS Çalışma Merkezi'nin uzman yapay zekasısın. ÖSYM'nin KPSS sınavlarına (Genel Yetenek - Genel Kültür ve Alan Bilgisi) hazırlanan adaylara Türkçe, sınav odaklı materyal üretirsin.

İLKELER:
- ÖSYM'nin gerçek soru tarzını, dil kalıplarını ve ölçme mantığını taklit et.
- Bilgiler güncel ve doğru olmalı. Emin olmadığın kesin veriyi (tarih, madde numarası, oran) uydurmak yerine daha genel ama doğru ifade kullan.
- Anayasa, mevzuat ve kurumsal yapılarda güncel Türkiye Cumhuriyeti düzenlemelerini esas al.
- Siyasi yorum yapma, tarafsız ve akademik kal.
- Uygunsuz/yasadışı istek gelirse { "error": "uygunsuz" } döndür.
- Daima yapılandırılmış JSON üret, sohbet etme.`;

  let task = '';
  switch (body.type) {
    case 'topics':
      task = `Bu ders için KPSS'de ÇIKMASI EN OLASI konuları çıkar. 8-12 konu ver; her biri için probability (0-100 arası çıkma olasılığı yüzdesi), expectedQuestions (örn. "2-3 soru"), whyImportant (neden sık sorulur), trap (adayların en sık düştüğü tuzak) ve 3-5 subTopics. Sonda 5-7 maddelik studyPlan (hangi sırayla, ne kadar süre çalışılmalı) ver. overview 2-3 cümle olsun.`;
      break;
    case 'summary':
      task = `KPSS'ye yönelik yoğun konu özeti üret: 2-3 cümlelik overview, 6-10 sınavda işe yarayan keyPoints, 4-6 bölüm (heading + net içerik + examNote: bu bölümden nasıl soru gelir), 3-5 mnemonics (akılda kalıcı kodlama/hafıza tekniği) ve 3-5 commonMistakes.`;
      break;
    case 'quiz':
      task = `${body.count ?? 10} adet ${difficulty} zorlukta ÖSYM tarzı ÇOKTAN SEÇMELİ KPSS sorusu üret. Her soruda 5 şık (A-E sırasıyla options dizisi), tek doğru cevap (correctIndex 0-4), solution (adım adım tam çözüm, neden bu cevap doğru), optionAnalysis (her şık için tek cümlelik "neden doğru/yanlış" analizi — options ile aynı sırada 5 eleman) ve topic alanı bulunsun. Sorular ezber değil ölçme mantığına dayalı olsun.`;
      break;
    case 'flashcards':
      task = `${body.count ?? 15} adet KPSS bilgi kartı üret: ön yüzde sınavda sorulabilecek net bilgi/kavram, arka yüzde özlü doğru cevap, opsiyonel kısa ipucu.`;
      break;
  }

  const userText = `SINAV: ${group}
DERS: ${body.subject}
${topicLine}
ZORLUK: ${difficulty}
${focusLine}

GÖREV: ${task}`;

  return { system, userText };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const body: KpssRequest = await req.json();
    if (!body?.type || !schemas[body.type] || !body.subject) {
      return new Response(JSON.stringify({ error: 'Geçersiz istek: ders ve materyal türü zorunlu.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: 'AI yapılandırılmamış.' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { system, userText } = buildPrompt(body);
    const model = 'google/gemini-2.5-pro';

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: userText },
        ],
        tools: [{
          type: 'function',
          function: {
            name: 'emit_kpss_material',
            description: 'KPSS çalışma materyalini yapılandırılmış biçimde döndür',
            parameters: schemas[body.type],
          },
        }],
        tool_choice: { type: 'function', function: { name: 'emit_kpss_material' } },
      }),
    });

    if (response.status === 429) {
      return new Response(JSON.stringify({ error: 'Yoğunluk var: birazdan tekrar deneyin.' }), {
        status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (response.status === 402) {
      return new Response(JSON.stringify({ error: 'AI kredisi tükendi.' }), {
        status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!response.ok) {
      const detail = await response.text();
      console.error(`AI gateway hata [${response.status}]: ${detail}`);
      return new Response(JSON.stringify({ error: 'AI servisi yanıt vermedi.', status: response.status }), {
        status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      return new Response(JSON.stringify({ error: 'Materyal üretilemedi, tekrar deneyin.' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const content = JSON.parse(toolCall.function.arguments);
    return new Response(JSON.stringify({ content, model }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('generate-kpss hata:', (e as Error).message);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
