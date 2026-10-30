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
      studyChecklist: {
        type: 'array',
        items: { type: 'string' },
      },
    },
    required: ['overview', 'keyPoints', 'sections', 'instructorEmphasis', 'examLikelihood', 'keyTerms', 'studyChecklist'],
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
            turns: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  speaker: { type: 'string', enum: ['Deniz', 'Barış'] },
                  text: { type: 'string' },
                },
                required: ['speaker', 'text'],
                additionalProperties: false,
              },
            },
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
                  enum: ['visual', 'shapes', 'table', 'chart', 'scenario', 'timeline', 'comparison', 'network', 'structure', 'curve'],
                },
                visualTheme: {
                  type: 'string',
                  enum: ['history', 'economics', 'law', 'science', 'society'],
                },
                mainTitle: { type: 'string' },
                nodes: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      label: { type: 'string' },
                      subtext: { type: 'string' },
                      badge: { type: 'string' },
                      value: { type: 'number' },
                    },
                    required: ['label', 'subtext'],
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
      examQuestions: {
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
      matchingPairs: {
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
    required: ['outline', 'podcastTitle', 'scenes', 'keyFacts', 'suggestedSearches', 'examQuestions', 'matchingPairs'],
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
      task = `Ders notları, PowerPoint slaytları veya ses dökümünü temel alarak üniversite öğrencileri için EN YÜKSEK AKADEMİK STANDARTTA, SINAV ODAKLI VE DERİNLEMESİNE BİR DERS & SLAYT ÖZETİ üret.
KAPSAM VE YAPI:
1. GENEL BAKIŞ (overview): Konunun kuramsal çerçevesini, tarihsel/iktisadi önemini ve vize/finaldeki ağırlığını 3-5 akıcı ve berrak cümleyle özetle.
2. KRİTİK HAP BİLGİLER (keyPoints): Sınav öncesi mutlaka hatırlanması gereken 8-12 net, eksiksiz ve vurucu hap bilgi.
3. SLAYT VE BÖLÜM ÇÖZÜMLEMESİ (sections):
   - Materyaldeki tüm slayt ve alt başlıkları sistematik olarak 5-8 doyurucu bölüme ayır.
   - Her bölüm için açık bir başlık (heading, varsa slayt aralığını belirt: örn. "Bölüm 1: Kurumsal Mimari ve Temeller (Slayt 1-6)").
   - content alanında konunun nedensellik zincirini, kurumsal mekanizmasını, formül/denklem açıklamalarını ve vaka örneklerini zengin markdown formatında (kalın kavramlar, maddeleme, analitik açıklamalar) derinlemesine açıkla.
   - takeaway alanına bölümün tek cümlelik en kritik sınav çıkarımını yaz.
4. İNFOGRAFİK METRİKLER (infographic): Dersin en çarpıcı 3-5 istatistiği, kurumu, yüzyılı, dönemi veya temel parametresi ({ label, value }).
5. HOCANIN VURGULARI VE SINAV TUZAKLARI (instructorEmphasis):
   - Hocanın derste tekrar ettiği, "buraya dikkat", "sınavda buradan soru gelir", "öğrenciler bu iki kavramı karıştırıyor" diyebileceği 4-7 kritik uyarı ve çeldirici ayrımı.
6. SINAVDA ÇIKMA OLASILIĞI MATRİSİ (examLikelihood):
   - Sınavda çıkma olasılığı yüksek/orta/düşük konular ({ topic, reason, likelihood: 'yüksek'|'orta'|'düşük', studyPriority: 'öncelikli'|'normal'|'pekiştirme' }).
7. KRİTİK KAVRAM SÖZLÜĞÜ (keyTerms):
   - Slayt ve notlarda geçen en kritik 6-10 terim ve bunların eksiksiz akademik tanımları ({ term, definition }).
8. SINAVA HAZIRLIK KONTROL LİSTESİ (studyChecklist):
   - Öğrencinin "Öğrendim" diyerek kontrol edebileceği 6-10 somut kazanım cümlesi (örn. "Miri arazi rejimi ile ikta sistemi arasındaki 3 temel farkı sayabiliyorum").
DİKSİYON VE KALİTE KURALLARI:
- Asla yarım veya "..." ile kesilmiş ifade üretme. Bütün kavram adları ve tanımları eksiksiz olmalıdır.
- Ezberci değil, mantığı ve nedenselliği kavratan üst düzey akademik Türkçe kullan.`;
      break;
    case 'video':
      task = `Kullanıcının yüklediği ders notunu temel alarak EconNotes Akademik Stüdyosu için EN AZ 6-8 DAKİKA SÜRECEK (toplam 950-1300 kelime konuşma metni, 10-12 derinlikli bölüm) ÜST DÜZEY, ZENGİN VE ENTELEKTÜEL BİR İKİLİ VİDEO DERSİ üret.
KATI AKADEMİK VE DİKSİYON KURALLARI:
1. %100 NOTA SADAKAT VE DERİNLİK:
   - YALNIZCA kullanıcının verdiği ders notundaki kavramları, kurumları, dönemleri, kişileri, teorileri, sayıları, formülleri ve nedensellik bağlarını işle. Notta olmayan uydurma bilgi ekleme.
   - Yüzeysel, basit veya tekrara düşen kalıp cümleler KESİNLİKLE YASAKTIR. Her sahne konunun farklı bir analitik katmanını (kuramsal temel, kurumsal mekanizma, karşılaştırmalı tablo, aktarım kanalları, nicel/yapısal ağırlık, uygulamalı vaka analizi ve sınav çeldiricileri) derinlemesine açmalıdır.
2. ÜST DÜZEY TÜRKÇE AKADEMİK DİYALOG (10 İLA 12 BÖLÜM):
   - Toplam 10 ila 12 sahne üret. Her sahne 90-120 kelimelik doyurucu, akıcı ve yüksek entelektüel kalitede bir tartışma içersin.
   - Her sahnede "turns" dizisini doldur (sahne başına 3-4 karşılıklı konuşma turu). Ayrıca "narration" alanına turların birleşik akıcı metnini yaz.
   - Deniz (Dr. Deniz): Seçkin bir üniversite hocası berraklığında konuşur; kavramların tarihsel/iktisadi/kurumsal mantığını, arka plandaki neden-sonuç zincirini ve mekanizmanın nasıl işlediğini somutlaştırır.
   - Barış: Keskin zekâlı, analitik araştırmacı; basit sorular sormaz, "Peki Deniz, burada X mekanizması zayıflarsa sistemin dengesi nasıl bozulur?", "İki kavram arasındaki ince sınır sınavda nasıl çeldiriciye dönüştürülüyor?" gibi derinleştirici sorular ve sentezlerle tartışmayı yükseltir.
   - Metinler derin sinir ağı ses motoruyla seslendirileceği için ASLA parantez içi not, kısaltma ("vb.", "yy.", "örn.", "vs."), sembol veya kesik madde işareti kullanma; tüm sayıları, yüzyılları ve hükümdar/dönem sıra sayılarını tam Türkçe kelimelerle, kusursuz TRT/üniversite kürsüsü Türkçesiyle yaz.
3. ÇOK-MODLU AKILLI TAHTA SAHNE TÜRLERİ (diagramData.diagramType — TÜMÜNÜ DENGELİ DAĞIT):
   - 'visual': Konunun bütünsel mimarisini ve atmosferini gösteren illüstratif görsel analiz. visualTheme alanını ('history', 'economics', 'law', 'science', 'society') konuya göre seç.
   - 'table': Yakın kavramları, dönemleri veya politikaları 4-5 satırda kıyaslayan akademik karşılaştırma tablosu.
   - 'shapes': Unsurlar arasındaki döngüsel geri besleme ve nedensellik zincirini gösteren geometrik mekanizma şeması.
   - 'chart': Faktörlerin yapısal ağırlığını ve etki hiyerarşisini gösteren sütun + eğri grafiği (her düğüme 35..96 arası anlamlı bir "value" ver).
   - 'scenario': Nottaki bilginin 4 aşamalı somut vaka simülasyonu (1. Başlangıç Koşulu, 2. Kurumsal Müdahale, 3. Saha İşleyişi, 4. Uzun Vadeli Sonuç).
   - 'timeline' ve 'comparison': Kronolojik kırılmalar ve ikili analitik matrisler.
4. DÜĞÜM VE NOT ZENGİNLİĞİ (nodes, keyTakeaways, keyTerms, examTip):
   - Her sahnede 4 somut ve bilgi dolu düğüm üret.
   - label: 2-4 kelimelik tam, anlamlı akademik başlık (bağlaç/edat ile biten yarım başlık YASAK).
   - subtext: label'ı tekrar etmeyen, doğrudan mekanizmayı veya sonucu açıklayan zengin, net 1 cümle (15-28 kelime).
   - highlightMetric: Sahnenin alt bandında yer alacak en çarpıcı akademik/sınav çıkarımı.
   - keyTakeaways (sahne başına 3-4 zengin madde), keyTerms (sahne başına 3-4 terim ve eksiksiz tanımı), examTip (somut sınav çeldirici uyarısı), keyFacts (tüm dersten 8-10 üst düzey hap bilgi), outline (3 cümlelik kapsamlı akademik çerçeve), suggestedSearches (5 ileri okuma başlığı).
5. ÖĞRENCİ ANLAŞILIRLIĞI VE HOCANIN SORABİLECEĞİ NOKTALAR:
   - Her sahnede önce kavramı sade ve anlaşılır bir dille açıkla, sonra akademik derinliğe in; öğrenci konuyu ilk dinleyişte kavrayabilmeli.
   - Her sahnede Barış en az bir kez "Hoca bunu sınavda nasıl sorar?" bakışıyla soru sorsun, Deniz doğru cevabın nasıl kurulacağını açıklasın.
   - Son bölümlerden biri tamamen "Hocanın Sorabileceği Sorular" olsun: tanım, ayırt etme ve neden-sonuç soru tiplerini cevaplarıyla işle.
6. DERS SONU DEĞERLENDİRME:
   - examQuestions: Nottaki en kritik noktalardan, hocanın sınavda sorabileceği 6 adet çoktan seçmeli soru (4 şık, tek doğru cevap correctIndex 0-3, şıklar birbirine yakın ve öğretici çeldiricili, explanation 1-2 cümle). Soru metni kısaltma içermesin.
   - matchingPairs: Eşleştirme oyunu için nottan 6 adet kavram ve kısa, net tanım çifti (tanım 8-18 kelime, kavram adını içermesin).`;
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
        max_tokens: body.materialType === 'video' ? 24000 : body.materialType === 'summary' ? 5000 : undefined,
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
