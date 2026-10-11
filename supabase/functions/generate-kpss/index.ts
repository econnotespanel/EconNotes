// KPSS Çalışma Merkezi — AI ile çıkabilecek konular, konu özeti, çözümlü test ve kart üretimi
import {
  getAuthenticatedUser,
  isTrustedOrigin,
  jsonResponse,
  preflightResponse,
  readJsonBody,
  RequestError,
} from '../_shared/request-security.ts';

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
  if (req.method === 'OPTIONS') return preflightResponse(req);
  if (!isTrustedOrigin(req.headers.get('origin'))) {
    return jsonResponse(req, { error: 'Bu kaynaktan isteğe izin verilmiyor.' }, 403);
  }
  if (req.method !== 'POST') return jsonResponse(req, { error: 'Yalnızca POST istekleri desteklenir.' }, 405);

  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return jsonResponse(req, { error: 'Bu işlem için giriş yapmalısınız.' }, 401);

    const body = await readJsonBody<KpssRequest>(req, 1_048_576);
    if (!body?.type || !schemas[body.type] || !body.subject) {
      throw new RequestError('Geçersiz istek: ders ve materyal türü zorunlu.', 400);
    }
    if (
      typeof body.subject !== 'string'
      || body.subject.length > 200
      || (body.topic !== undefined && (typeof body.topic !== 'string' || body.topic.length > 300))
      || (body.examGroup !== undefined && (typeof body.examGroup !== 'string' || body.examGroup.length > 100))
      || (body.extraFocus !== undefined && (typeof body.extraFocus !== 'string' || body.extraFocus.length > 2_000))
      || (body.count !== undefined && (!Number.isInteger(body.count) || body.count < 1 || body.count > 50))
      || (body.difficulty !== undefined && !['easy', 'medium', 'hard'].includes(body.difficulty))
    ) {
      throw new RequestError('İstek içeriği geçersiz.', 400);
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      return jsonResponse(req, { error: 'AI yapılandırılmamış.' }, 500);
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
      return jsonResponse(req, { error: 'Yoğunluk var: birazdan tekrar deneyin.' }, 429);
    }
    if (response.status === 402) {
      return jsonResponse(req, { error: 'AI kredisi tükendi.' }, 402);
    }
    if (!response.ok) {
      const detail = await response.text();
      console.error(`AI gateway hata [${response.status}]: ${detail}`);
      return jsonResponse(req, { error: 'AI servisi yanıt vermedi.' }, 502);
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      return jsonResponse(req, { error: 'Materyal üretilemedi, tekrar deneyin.' }, 502);
    }

    const content = JSON.parse(toolCall.function.arguments);
    return jsonResponse(req, { content, model });
  } catch (error) {
    if (error instanceof RequestError) return jsonResponse(req, { error: error.message }, error.status);
    console.error('generate-kpss request failed:', error);
    return jsonResponse(req, { error: 'İstek işlenemedi.' }, 500);
  }
});
