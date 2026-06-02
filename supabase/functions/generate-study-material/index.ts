// Generate study materials (flashcards, quiz, summary, video suggestions) from a note
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface GenerateRequest {
  materialType: 'flashcards' | 'quiz' | 'summary' | 'video';
  noteContext: string;        // title + course + description + file metadata
  noteTitle: string;
  course?: string;
  count?: number;             // flashcards / quiz items
  difficulty?: 'easy' | 'medium' | 'hard';
}

const schemas: Record<string, any> = {
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
            explanation: { type: 'string' },
          },
          required: ['question', 'options', 'correctIndex', 'explanation'],
          additionalProperties: false,
        },
      },
    },
    required: ['questions'],
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
            takeaway: { type: 'string' },
          },
          required: ['heading', 'content'],
          additionalProperties: false,
        },
      },
      infographic: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            label: { type: 'string' },
            value: { type: 'string' },
            icon: { type: 'string' },
          },
          required: ['label', 'value'],
          additionalProperties: false,
        },
      },
    },
    required: ['overview', 'keyPoints', 'sections'],
    additionalProperties: false,
  },
  video: {
    type: 'object',
    properties: {
      outline: { type: 'string' },
      scenes: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            time: { type: 'string' },
            title: { type: 'string' },
            narration: { type: 'string' },
          },
          required: ['time', 'title', 'narration'],
          additionalProperties: false,
        },
      },
      suggestedSearches: {
        type: 'array',
        items: { type: 'string' },
      },
    },
    required: ['outline', 'scenes', 'suggestedSearches'],
    additionalProperties: false,
  },
};

function buildPrompt(req: GenerateRequest): { system: string; user: string } {
  const count = req.count ?? (req.materialType === 'flashcards' ? 10 : req.materialType === 'quiz' ? 8 : 0);
  const difficulty = req.difficulty ?? 'medium';

  const baseSystem = `Sen EconNotes Akademik Çalışma Asistanısın. Üniversite öğrencileri için Türkçe çalışma materyali üretirsin.
GÜVENLİK:
- Sadece akademik içerik üret. Uygunsuz/yasadışı/hakaret içerikli not için: { "error": "uygunsuz" } döndür.
- Siyasi, dini, tartışmalı konularda objektif ol.
ÇIKTI:
- Daima geçerli JSON üret, açıklama yazma.
- Türkçe, akademik ve net dil kullan.`;

  switch (req.materialType) {
    case 'flashcards':
      return {
        system: baseSystem,
        user: `Aşağıdaki ders notundan ${count} adet ${difficulty} zorlukta bilgi kartı (flashcard) üret.
Her kart: ön yüzde kavram/soru, arka yüzde net cevap, opsiyonel ipucu.

DERS: ${req.course ?? '-'}
BAŞLIK: ${req.noteTitle}
İÇERİK:
${req.noteContext}`,
      };
    case 'quiz':
      return {
        system: baseSystem,
        user: `Aşağıdaki ders notundan ${count} soruluk çoktan seçmeli quiz oluştur (her soruda 4 şık, sadece 1 doğru, kısa açıklama).
Zorluk: ${difficulty}.

DERS: ${req.course ?? '-'}
BAŞLIK: ${req.noteTitle}
İÇERİK:
${req.noteContext}`,
      };
    case 'summary':
      return {
        system: baseSystem,
        user: `Aşağıdaki ders notunu kapsamlı şekilde özetle: kısa overview, 5-8 maddelik anahtar noktalar, 3-5 bölüm (heading + içerik + takeaway), ve 4-6 elemanlı infografik veri (label + kısa value + ikon önerisi - lucide ikon ismi).

DERS: ${req.course ?? '-'}
BAŞLIK: ${req.noteTitle}
İÇERİK:
${req.noteContext}`,
      };
    case 'video':
      return {
        system: baseSystem,
        user: `Aşağıdaki ders notu için 3-5 dakikalık özet video taslağı hazırla:
- outline: 2-3 cümle genel açıklama
- scenes: 5-7 sahne (zaman damgası "00:00" formatı, başlık, anlatım metni)
- suggestedSearches: 3-5 YouTube arama sorgusu (konuyla ilgili Türkçe ders videoları için)

DERS: ${req.course ?? '-'}
BAŞLIK: ${req.noteTitle}
İÇERİK:
${req.noteContext}`,
      };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const body: GenerateRequest = await req.json();
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: 'AI yapılandırılmamış' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { system, user } = buildPrompt(body);
    const schema = schemas[body.materialType];

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        tools: [{
          type: 'function',
          function: {
            name: 'emit_material',
            description: 'Çalışma materyalini yapılandırılmış biçimde döndür',
            parameters: schema,
          },
        }],
        tool_choice: { type: 'function', function: { name: 'emit_material' } },
      }),
    });

    if (response.status === 429) return new Response(JSON.stringify({ error: 'Yoğunluk: Birazdan tekrar deneyin.' }), { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    if (response.status === 402) return new Response(JSON.stringify({ error: 'AI kredisi tükendi.' }), { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      return new Response(JSON.stringify({ error: 'Materyal üretilemedi.' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const content = JSON.parse(toolCall.function.arguments);
    return new Response(JSON.stringify({ content, model: 'google/gemini-2.5-flash' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
