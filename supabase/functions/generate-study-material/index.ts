// Generate study materials (flashcards, quiz, summary, video) from notes/files/audio
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ExamProfile {
  examType?: 'test' | 'classic' | 'mixed';
  totalQuestions?: number;
  examDate?: string;
  focus?: string;
  level?: string;
}

interface MediaPart {
  // base64 data
  data: string;
  mimeType: string;
}

interface GenerateRequest {
  materialType: 'flashcards' | 'quiz' | 'summary' | 'video';
  noteContext: string;
  noteTitle: string;
  course?: string;
  count?: number;
  difficulty?: 'easy' | 'medium' | 'hard';
  examProfile?: ExamProfile;
  audio?: MediaPart;     // sesli not
  document?: MediaPart;  // PDF/görsel vb.
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
            type: { type: 'string', enum: ['multiple_choice', 'open_ended'] },
            options: { type: 'array', items: { type: 'string' } },
            correctIndex: { type: 'integer' },
            sampleAnswer: { type: 'string' },
            explanation: { type: 'string' },
            difficulty: { type: 'string' },
          },
          required: ['question', 'type', 'explanation'],
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

function buildPrompt(req: GenerateRequest): { system: string; userText: string } {
  const ep = req.examProfile || {};
  const count = req.count ?? (req.materialType === 'flashcards' ? 10 : req.materialType === 'quiz' ? (ep.totalQuestions ?? 8) : 0);
  const difficulty = req.difficulty ?? ep.level ?? 'medium';
  const examTypeLine = ep.examType
    ? `Sınav türü: ${ep.examType === 'test' ? 'Test (çoktan seçmeli)' : ep.examType === 'classic' ? 'Klasik (açık uçlu)' : 'Karma'}`
    : '';
  const examDateLine = ep.examDate ? `Sınav tarihi: ${ep.examDate}` : '';
  const focusLine = ep.focus ? `Öğrenci odak istiyor: ${ep.focus}` : '';
  const profileBlock = [examTypeLine, examDateLine, focusLine].filter(Boolean).join('\n');

  const baseSystem = `Sen EconNotes Çalışma Stüdyosu'nun başyapay zekasısın — üniversite öğrencileri için Türkçe akademik çalışma materyali üretirsin.
GÜVENLİK:
- Sadece akademik içerik üret. Uygunsuz/yasadışı/hakaret içerikli istek için: { "error": "uygunsuz" } döndür.
- Siyasi/dini/tartışmalı konularda objektif ol.
ÜRETİM:
- Daima yapılandırılmış JSON üret, sohbet etme.
- Türkçe, akademik, net, ezbere değil anlamaya yönelik.
- Sınav profiline (test/klasik), zorluğa ve odak konusuna kesinlikle uy.
- Sesli ya da görsel (PDF) materyal verilmişse onu öncelikli kaynak olarak kullan, başlık ve açıklamayı bağlam olarak.`;

  let task = '';
  switch (req.materialType) {
    case 'flashcards':
      task = `${count} adet ${difficulty} zorlukta bilgi kartı (flashcard) üret. Her kart: ön yüzde net kavram/soru, arka yüzde özlü cevap, opsiyonel kısa ipucu.`;
      break;
    case 'quiz':
      task = ep.examType === 'classic'
        ? `${count} adet ${difficulty} zorlukta KLASİK (açık uçlu) soru üret. Her soru için "type":"open_ended", sampleAnswer (örnek model cevap, 3-5 cümle) ve explanation (kısa değerlendirme rehberi) ekle. options boş bırak.`
        : ep.examType === 'mixed'
        ? `${count} adet ${difficulty} zorlukta KARMA soru üret: yarısı çoktan seçmeli (type:"multiple_choice", 4 seçenek, correctIndex, kısa explanation), yarısı klasik (type:"open_ended", sampleAnswer + explanation).`
        : `${count} adet ${difficulty} zorlukta ÇOKTAN SEÇMELİ soru üret. type:"multiple_choice", 4 şık, tek doğru cevap (correctIndex 0-3), neden doğru/yanlış olduğunu özetleyen 1-2 cümlelik explanation.`;
      break;
    case 'summary':
      task = `Kapsamlı konu özeti üret: 2-3 cümlelik overview, 5-8 anahtar nokta, 3-5 bölüm (heading + içerik + 1 cümle takeaway), ve 4-6 elemanlı infografik veri (label + kısa value + lucide ikon önerisi).`;
      break;
    case 'video':
      task = `3-5 dakikalık özet video taslağı: outline (2-3 cümle), 5-7 sahne (time "MM:SS", title, narration), ve 3-5 YouTube arama sorgusu.`;
      break;
  }

  const userText = `KAYNAK BAĞLAM:
DERS: ${req.course ?? '-'}
BAŞLIK: ${req.noteTitle}
${profileBlock ? profileBlock + '\n' : ''}İÇERİK:
${req.noteContext}

GÖREV: ${task}`;

  return { system: baseSystem, userText };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const body: GenerateRequest = await req.json();
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: 'AI yapılandırılmamış' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { system, userText } = buildPrompt(body);
    const schema = schemas[body.materialType];

    // Multimodal content (text + optional audio/document)
    const userContent: any[] = [{ type: 'text', text: userText }];

    if (body.audio?.data) {
      // Gemini supports audio via OpenAI-compatible image_url with audio data URI
      userContent.push({
        type: 'image_url',
        image_url: { url: `data:${body.audio.mimeType};base64,${body.audio.data}` },
      });
    }
    if (body.document?.data) {
      userContent.push({
        type: 'image_url',
        image_url: { url: `data:${body.document.mimeType};base64,${body.document.data}` },
      });
    }

    const model = (body.audio || body.document) ? 'google/gemini-2.5-pro' : 'google/gemini-2.5-flash';

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: userContent },
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
    return new Response(JSON.stringify({ content, model }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
