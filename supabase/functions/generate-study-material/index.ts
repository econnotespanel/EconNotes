// Generate study materials (flashcards, quiz, summary, video) from notes/files/audio
import {
  getAuthenticatedUser,
  isTrustedOrigin,
  jsonResponse,
  preflightResponse,
  readJsonBody,
  RequestError,
} from '../_shared/request-security.ts';

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
      instructorEmphasis: {
        type: 'array',
        items: { type: 'string' },
      },
      examLikelihood: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            topic: { type: 'string' },
            reason: { type: 'string' },
            likelihood: { type: 'string', enum: ['yüksek', 'orta', 'düşük'] },
            studyPriority: { type: 'string', enum: ['öncelikli', 'normal', 'pekiştirme'] },
          },
          required: ['topic', 'reason', 'likelihood', 'studyPriority'],
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
      podcastTitle: { type: 'string' },
      hosts: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            role: { type: 'string' },
          },
          required: ['name', 'role'],
          additionalProperties: false,
        },
      },
      scenes: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            time: { type: 'string' },
            speaker: { type: 'string' },
            speakerRole: { type: 'string' },
            title: { type: 'string' },
            narration: { type: 'string' },
            keyTakeaways: {
              type: 'array',
              items: { type: 'string' },
            },
            visualCue: { type: 'string' },
            diagramData: {
              type: 'object',
              properties: {
                diagramType: {
                  type: 'string',
                  enum: ['network', 'timeline', 'structure', 'comparison', 'curve'],
                },
                mainTitle: { type: 'string' },
                nodes: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      label: { type: 'string' },
                      subtext: { type: 'string' },
                    },
                    required: ['label'],
                    additionalProperties: false,
                  },
                },
                highlightMetric: { type: 'string' },
              },
              required: ['diagramType', 'mainTitle', 'nodes'],
              additionalProperties: false,
            },
            examTip: { type: 'string' },
            keyTerms: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  term: { type: 'string' },
                  definition: { type: 'string' },
                },
                required: ['term', 'definition'],
                additionalProperties: false,
              },
            },
          },
          required: ['time', 'speaker', 'title', 'narration', 'keyTakeaways', 'visualCue', 'diagramData', 'examTip', 'keyTerms'],
          additionalProperties: false,
        },
      },
      keyFacts: {
        type: 'array',
        items: { type: 'string' },
      },
      suggestedSearches: {
        type: 'array',
        items: { type: 'string' },
      },
    },
    required: ['outline', 'podcastTitle', 'scenes', 'keyFacts', 'suggestedSearches'],
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
      task = `Kapsamlı ve sınava hazırlanırken doğrudan kullanılabilecek bir ders özeti üret.
3-4 cümlelik overview, 6-10 anahtar nokta ve 4-7 bölüm oluştur.
Her bölümde konu açıklaması, kritik kavramlar, varsa formüller/tarihler/sayılar ve kaynakta geçen örnekler yer alsın; uygun olduğunda takeaway ekle.
Sesli dökümdeki tekrarları ve konuşma dolgu kelimelerini temizle, fakat anlamı, neden-sonuç ilişkisini veya öğretmenin vurgusunu kaybetme.
Duyulamayan ya da belirsiz kısımları uydurma; belirsiz olduğunu açıkça belirt.
Akademik terimleri, özel adları, sayıları, tarihleri ve formülleri kaynakta geçtiği biçime mümkün olduğunca sadık kalarak koru.
Kaynakta olmayan bilgi ekleme.
Ayrıca instructorEmphasis alanında hocanın açıkça vurguladığı, tekrar ettiği, "önemli", "sınavda", "dikkat" gibi ifadelerle belirttiği noktaları listele.
examLikelihood alanında döküme dayalı olarak sınavda çıkma olasılığı yüksek/orta/düşük görünen konuları topic, reason, likelihood ve studyPriority alanlarıyla sınıflandır.
Sınav olasılığını yalnızca döküme dayalı değerlendir; kesin sınav garantisi verme ve dökümde kanıt yoksa olasılığı yüksek gösterme.`;
      break;
    case 'video':
      task = `Kullanıcının yüklediği ders notunu temel alarak EconNotes Stüdyosu için Full HD kalitede, gerçek bir yayın stüdyosu doğallığında İKİLİ VİDEO DERSİ üret.
KATI KURALLAR:
1. KONU VE KAPSAM: YALNIZCA ve DOĞRUDAN kullanıcının verdiği ders notundaki konuyu, dersi, tarihleri, kurumları, şahısları, terimleri ve olayları ele al. ASLA notta bulunmayan genel kalıplar veya alakasız ders terimleri kullanma.
2. İNSAN DOĞALLIĞINDA KONUŞMA DİLİ (ROBOTİK KİTAP DİLİ YASAK):
   - Deniz (Dr. Deniz): Konuya hâkim, sıcak, berrak ve analitik anlatıcı. Neden-sonuç ilişkilerini somutlaştırır.
   - Barış: Zeki, meraklı araştırmacı. Deniz'in sözünü doğal biçimde devralır, öğrencinin tam o an aklına takılacak kritik soruyu sorar ("Peki Deniz, burada şu ayrımı nasıl yapıyoruz?", "Dur bir saniye, yani köylü toprağın mülkiyetine sahip değil ama kullanım hakkı onda, doğru mu?"), bağlantıları yakalar.
   - Metinler sesli okunacağı için ASLA parantez içi liste, kısaltma ("vb.", "yy.", "örn."), madde işareti veya ansiklopedi cümlesi kurma. Doğal konuşma ritminde, akıcı, kısa-orta uzunlukta cümleler kur; sayıları ve yüzyılları okunaklı yaz.
3. SAHNE KURGUSU: 6-9 sahne üret. Deniz ve Barış sırayla birbirine pas atarak ilerlesin; her sahne notun belirgin bir alt başlığını derinlemesine işlesin.
4. diagramData (AKILLI TAHTA — TEKRARSIZ VE ÇEŞİTLİ):
   - Ardışık sahnelerde tek tip şema kullanma; içeriğe göre 'timeline' (tarihsel süreç/aşamalar), 'structure' (kurumsal yapı/unsurlar), 'comparison' (iki dönem/kavram/rejim kıyaslaması), 'network' (kavram ilişkileri) ve yalnızca gerçekten grafiksel eğri varsa 'curve' arasında çeşitlilik sağla.
   - mainTitle: Sahnenin net tahta başlığı (en fazla 6-7 kelime).
   - nodes: 3-5 somut düğüm. label alanı SADECE 2-4 kelimelik net kavram adı olsun (yarım cümle YASAK). subtext alanı ise label'ı tekrar etmeyen, doğrudan açıklayıcı 1 net cümle olsun.
   - highlightMetric: Sınav için akılda kalması gereken en çarpıcı tek cümlelik bilgi.
   - Düğümleri konuşma akış sırasına göre diz.
5. keyTakeaways: Her sahne için 3-4 adet, öğrencinin defterine yazacağı somut ders notu.
6. keyTerms: Her sahnede geçen 2-4 kritik terim ve nottaki anlamına sadık net tanımı.
7. examTip: Her sahne için sınavda nasıl sorulabileceğine dair tek cümlelik somut uyarı.
8. keyFacts: Tüm nottan sınav öncesi ezberlenmesi gereken 6-8 kritik hap bilgi.
9. outline: Notun ana çerçevesini özetleyen 2-3 cümle.
10. suggestedSearches: Konuyu pekiştirecek 3-5 akademik arama sorgusu.
Kaynakta bulunmayan bilgi uydurma.`;
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
  if (req.method === 'OPTIONS') return preflightResponse(req);
  if (!isTrustedOrigin(req.headers.get('origin'))) {
    return jsonResponse(req, { error: 'Bu kaynaktan isteğe izin verilmiyor.' }, 403);
  }
  if (req.method !== 'POST') return jsonResponse(req, { error: 'Yalnızca POST istekleri desteklenir.' }, 405);

  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return jsonResponse(req, { error: 'Bu işlem için giriş yapmalısınız.' }, 401);

    const body = await readJsonBody<GenerateRequest>(req, 35 * 1024 * 1024);
    if (
      !['flashcards', 'quiz', 'summary', 'video'].includes(body.materialType)
      || typeof body.noteTitle !== 'string'
      || body.noteTitle.length > 300
      || typeof body.noteContext !== 'string'
      || body.noteContext.length > 200_000
      || (body.course !== undefined && (typeof body.course !== 'string' || body.course.length > 300))
      || (body.count !== undefined && (!Number.isInteger(body.count) || body.count < 1 || body.count > 50))
      || (body.difficulty !== undefined && !['easy', 'medium', 'hard'].includes(body.difficulty))
      || [body.audio, body.document].some((part) =>
        part !== undefined
        && (
          typeof part.data !== 'string'
          || part.data.length === 0
          || part.data.length > 34 * 1024 * 1024
          || typeof part.mimeType !== 'string'
          || !/^(application\/pdf|image\/[a-z0-9.+-]+|audio\/[a-z0-9.+-]+)$/i.test(part.mimeType)
        )
      )
      || (body.audio && body.document)
    ) {
      throw new RequestError('İstek içeriği geçersiz.', 400);
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      return jsonResponse(req, { error: 'AI yapılandırılmamış.' }, 500);
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

    const model = 'google/gemini-2.5-pro';

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: (body.materialType === 'summary' || body.materialType === 'video') ? 0.15 : 0.2,
        max_tokens: body.materialType === 'video' ? 16000 : body.materialType === 'summary' ? 5000 : undefined,
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

    if (response.status === 429) return jsonResponse(req, { error: 'Yoğunluk: Birazdan tekrar deneyin.' }, 429);
    if (response.status === 402) return jsonResponse(req, { error: 'AI kredisi tükendi.' }, 402);
    if (!response.ok) {
      console.error(`generate-study-material gateway error: ${response.status}`);
      return jsonResponse(req, { error: 'AI servisi yanıt vermedi.' }, 502);
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      return jsonResponse(req, { error: 'Materyal üretilemedi.' }, 502);
    }

    const content = JSON.parse(toolCall.function.arguments);
    return jsonResponse(req, { content, model });
  } catch (error) {
    if (error instanceof RequestError) return jsonResponse(req, { error: error.message }, error.status);
    console.error('generate-study-material request failed:', error);
    return jsonResponse(req, { error: 'İstek işlenemedi.' }, 500);
  }
});
