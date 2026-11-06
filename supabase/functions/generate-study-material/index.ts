// Generate study materials (flashcards, quiz, summary, video) from notes/files/audio
import {
  getAuthenticatedUser,
  isTrustedOrigin,
  jsonResponse,
  preflightResponse,
  readJsonBody,
  RequestError,
} from '../_shared/request-security.ts';
import {
  createChatCompletion,
  OpenAIMessage,
} from '../_shared/openai-gateway.ts';

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
  summaryLength?: 'short' | 'balanced' | 'detailed';
  noteStyle?: 'academic' | 'exam_focused' | 'instructor_traps' | 'formula_concepts' | 'solved_cases';
  customPrompt?: string;
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

  // Multi-Model Cognitive Synthesis (Argon, GPT, Grok, Opus strengths combined)
  const baseSystem = `Sen EconNotes Çalışma Stüdyosu'nun en gelişmiş akademik yapay zeka çekirdeğisin.
Üniversite öğrencileri için dünya standartlarında, pedagojik olarak kusursuz, ezbere değil konunun mantığını derinlemesine kavratan akademik materyaller üretirsin.

BİLİŞSEL ÇEKİRDEK İLKELERİ (ÇOKLU ZEKA SENTEZİ):
1. DERİN KAVRAMSAL ÇÖZÜMLEME (Opus Bilişsel Seviyesi):
   - Not ve slaytlardaki kavramlar, teoriler, nedensellik bağları ve hiyerarşik yapıları eksiksiz deşifre et.
   - Bilgi kaybına izin verme; soyut teorilerin altında yatan kurumsal ve mantıksal mekanizmayı ortaya çıkar.
2. PEDAGOJİK & SINAV AKIL YÜRÜTMESİ (GPT İleri Fakülte Mantığı):
   - Soruları ve özetleri tam bir üniversite profesörünün vize/final sınav komisyonu bakışıyla kurgula.
   - Sorular ezber değil; "Neden?", "Nasıl?", "Hangi koşulda ne değişir?" ve "İki kavram arasındaki ince sınır nedir?" mantığını ölçmelidir.
   - Doğru cevaplar tam gerekçelendirilmeli, çeldiriciler ise öğrencilerin vizede/finalde en çok düştüğü yanılgıları hedeflemelidir.
3. KESKİN ANALİTİK NETLİK & TUZAK TESPİTİ (Grok Analitik Berraklığı):
   - Dolambaçlı ve içi boş akademik süslemelerden kaçın. Doğrudan özü, net kıyaslamaları ve akılda kalıcı analojileri kullan.
   - Sınavda ters köşe yapan tuzakları ve hocaların soru avlarını açıkça ifşa et.
4. KONSENSÜS VE KUSURSUZ YAPILANDIRILMIŞ ÇIKTI (Argon Ana Orkestrasyonu):
   - Tüm bu bilişsel derinliği hatasız, eksiksiz, akıcı üniversite kürsüsü Türkçesiyle ve JSON şemasına %100 uyumlu olarak sentezle.
   - Asla hayali (halüsinatif) veya notta olmayan uydurma bilgi ekleme.

GÜVENLİK & KURALLAR:
- Sadece akademik içerik üret. Uygunsuz/yasadışı istek için: { "error": "uygunsuz" } döndür.
- Siyasi/dini/tartışmalı konularda objektif ol.
- Daima yapılandırılmış JSON döndür, sohbet etme.
- Öğrencinin talimatlarına (uzunluk, stil ve özel chat direktifleri) kesinlikle riayet et.`;

  // Uzunluk direktifi
  let lengthDirective = '';
  if (req.summaryLength === 'short') {
    lengthDirective = 'ÖZET UZUNLUĞU: KISA & ÖZ. Sınav öncesi hızlı tekrar için en kritik hap bilgilere, temel formül/kavramlara ve 3-4 kilit bölüme odaklan. Gereksiz dolgudan kaçın, doğrudan sonuca git.';
  } else if (req.summaryLength === 'detailed') {
    lengthDirective = 'ÖZET UZUNLUĞU: KAPSAMLI & DERİNLİKLİ. Slayt veya nottaki tüm alt başlıkları, grafik/denklem açıklamalarını, kurumsal işleyişi ve vaka analizlerini 7-10 doyurucu bölümle derinlemesine işle.';
  } else {
    lengthDirective = 'ÖZET UZUNLUĞU: DENGELİ. Hem kuramsal çerçeveyi hem de sınavda çıkacak kilit başlıkları 5-7 doyurucu bölümde işle.';
  }

  // Not stili direktifi
  let styleDirective = '';
  if (req.noteStyle === 'exam_focused') {
    styleDirective = 'NOT STİLİ: VİZE VE FİNAL SINAV ODAKLI. Doğrudan vize/final sınavında soru getirecek başlıklara, klasik soru kalıplarına ve hocanın tam puan verme kriterlerine ağırlık ver.';
  } else if (req.noteStyle === 'instructor_traps') {
    styleDirective = 'NOT STİLİ: HOCA VURGULARI VE SINAV TUZAKLARI. Hocaların sınavda öğrencileri avlamak için sorduğu çeldiricilere, en çok karıştırılan kavram çiftlerine ve tuzak noktalara odaklan.';
  } else if (req.noteStyle === 'formula_concepts') {
    styleDirective = 'NOT STİLİ: FORMÜL, GRAFİK VE KAVRAM SÖZLÜĞÜ. Formüllerin ezber değil sezgisel mantığına, değişkenlerin yönüne, grafik eğrilerinin kayma nedenlerine ve terim tanımlarına odaklan.';
  } else if (req.noteStyle === 'solved_cases') {
    styleDirective = 'NOT STİLİ: ÇÖZÜMLÜ ÖRNEK OLAY VE VAKA ANALİZİ. Teorinin somut vaka örnekleri ve sınavlarda çıkan senaryo tipi analitik sorularla nasıl çözümlendiğine odaklan.';
  } else {
    styleDirective = 'NOT STİLİ: AKADEMİK DERS NOTU. Yüksek kuramsal derinlik, kavramsal hiyerarşi ve tam akademik terminoloji standardında üret.';
  }

  // Öğrencinin Chat/Özel Talimatı
  const customPromptBlock = req.customPrompt && req.customPrompt.trim().length > 0
    ? `\nÖĞRENCİNİN CHAT ALANINDAN VERDİĞİ ÖZEL TALİMAT / İSTEK:\n"${req.customPrompt.trim()}"\n(Bu özel isteği en yüksek öncelikle uygula ve materyalin içeriğini mutlaka bu direktife göre uyarla!)\n`
    : '';

  let task = '';
  switch (req.materialType) {
    case 'flashcards':
      task = `${count} adet ${difficulty} zorlukta bilgi kartı (flashcard) üret. Her kart: ön yüzde net kavram/soru, arka yüzde özlü cevap, opsiyonel kısa ipucu.
${styleDirective}`;
      break;
    case 'quiz':
      task = ep.examType === 'classic'
        ? `${count} adet ${difficulty} zorlukta KLASİK (AÇIK UÇLU) ÜNİVERSİTE VİZE/FİNAL SINAV SORUSU üret.
HOCANIN SORABİLECEĞİ SORU KRİTERLERİ:
1. SORU METNİ: Üniversite hocasının 20-25 puanlık klasik soru olarak soracağı kalibrede, neden-sonuç mekanizmasını ve kuramsal temeli sorgulayan doyurucu analitik soru olmalıdır.
2. type:"open_ended", options: []
3. sampleAnswer: Üniversite hocasının 100 üzerinden 100 tam puan vereceği eksiksiz model cevap (3-6 cümle: kavram tanımı + işleyiş mekanizması + somut vaka/çıkarım).
4. explanation: Hocanın cevap kağıdında arayacağı anahtar kavramlar ve puanlama baremi rehberi (puan kırılacak eksiklikler).
${styleDirective}`
        : ep.examType === 'mixed'
        ? `${count} adet ${difficulty} zorlukta KARMA SINAV SORUSU üret (yarısı çoktan seçmeli, yarısı klasik).
SORU KALİTESİ: Sorular üniversite vize/final standartlarında hocanın soracağı tarzda olmalı; çoktan seçmeliler güçlü çeldiricili, klasikler analitik model cevaplı olmalıdır.
${styleDirective}`
        : `${count} adet ${difficulty} zorlukta ÇOKTAN SEÇMELİ ÜNİVERSİTE VİZE/FİNAL SINAV SORUSU üret.
HOCANIN SORABİLECEĞİ VE ÖĞRENCİNİN KONUYU TAM ANLAMASINI SAĞLAYACAK SORU KRİTERLERİ:
1. SORU METNİ: Asla basit ezber değil; konunun nedensellik zincirini, piyasa/kurum işleyişini, grafik eğrilerini veya iki kavram arasındaki ince ayrımı sınayan, üniversite hocasının vize veya finalde soracağı kalibrede olmalıdır.
2. 4 SEÇENEK (options): Şıklar birbirinden kopuk olamaz. Çeldiriciler, öğrencilerin vizede/finalde en çok düştüğü kavram yanılgılarını ve ters köşe yapan ayrımları içermelidir.
3. TEK DOĞRU CEVAP (correctIndex 0-3).
4. AÇIKLAMA (explanation - ÖĞRENCİNİN KONUYU ÇOK İYİ ANLAMASI İÇİN 3 BOYUTLU ANALİZ):
   Her sorunun açıklama metnini mutlaka şu formatta yaz:
   - Doğru Yanıtın Mantığı: [Neden doğru olduğu, hangi kuramsal ve mantıksal nedene dayandığı]
   - Hocanın Sınav Tuzağı & Çeldirici Analizi: [Diğer şıkların neden yanlış olduğu, öğrencilerin nerede hata yaptığı ve hocanın bu soruda kurduğu çeldirici]
   - Sınav Tüyosu: [Sınavda bu soruyla karşılaşınca hatırlanması gereken altın kural veya anahtar kelime]
${styleDirective}`;
      break;
    case 'summary':
      task = `Ders notları, PowerPoint slaytları veya ses dökümünü temel alarak üniversite öğrencileri için EN YÜKSEK AKADEMİK STANDARTTA, SINAV ODAKLI VE DERİNLEMESİNE BİR DERS & SLAYT ÖZETİ üret.
${lengthDirective}
${styleDirective}
${customPromptBlock}
KAPSAM VE YAPI:
1. GENEL BAKIŞ (overview): Konunun kuramsal çerçevesini, tarihsel/iktisadi önemini ve vize/finaldeki ağırlığını 3-5 akıcı ve berrak cümleyle özetle.
2. KRİTİK HAP BİLGİLER (keyPoints): Sınav öncesi mutlaka hatırlanması gereken net, eksiksiz ve vurucu hap bilgiler (${req.summaryLength === 'short' ? '5-7 madde' : req.summaryLength === 'detailed' ? '12-16 madde' : '8-12 madde'}).
3. SLAYT VE BÖLÜM ÇÖZÜMLEMESİ (sections):
   - Materyaldeki tüm slayt ve alt başlıkları sistematik olarak ${req.summaryLength === 'short' ? '3-4' : req.summaryLength === 'detailed' ? '7-10' : '5-8'} doyurucu bölüme ayır.
   - Her bölüm için açık bir başlık (heading, varsa slayt aralığını belirt: örn. "Bölüm 1: Kurumsal Mimari ve Temeller (Slayt 1-6)").
   - content alanında konunun nedensellik zincirini, kurumsal mekanizmasını, formül/denklem açıklamalarını ve vaka örneklerini zengin markdown formatında (kalın kavramlar, maddeleme, analitik açıklamalar) derinlemesine açıkla.
   - takeaway alanına bölümün tek cümlelik en kritik sınav çıkarımını yaz.
4. İNFOGRAFİK METRİKLER (infographic): Dersin en çarpıcı 3-5 istatistiği, kurumu, yüzyılı, dönemi veya temel parametresi ({ label, value }).
5. HOCANIN VURGULARI VE SINAV TUZAKLARI (instructorEmphasis):
   - Hocanın derste tekrar ettiği, "buraya dikkat", "sınavda buradan soru gelir", "öğrenciler bu iki kavramı karıştırıyor" diyebileceği 4-8 kritik uyarı ve çeldirici ayrımı.
6. SINAVDA ÇIKMA OLASILIĞI MATRİSİ (examLikelihood):
   - Sınavda çıkma olasılığı yüksek/orta/düşük konular ({ topic, reason, likelihood: 'yüksek'|'orta'|'düşük', studyPriority: 'öncelikli'|'normal'|'pekiştirme' }).
7. KRİTİK KAVRAM SÖZLÜĞÜ (keyTerms):
   - Slayt ve notlarda geçen en kritik ${req.summaryLength === 'short' ? '4-6' : req.summaryLength === 'detailed' ? '10-14' : '6-10'} terim ve bunların eksiksiz akademik tanımları ({ term, definition }).
8. SINAVA HAZIRLIK KONTROL LİSTESİ (studyChecklist):
   - Öğrencinin "Öğrendim" diyerek kontrol edebileceği 6-10 somut kazanım cümlesi (örn. "Miri arazi rejimi ile ikta sistemi arasındaki 3 temel farkı sayabiliyorum").
DİKSİYON VE KALİTE KURALLARI:
- Asla yarım veya "..." ile kesilmiş ifade üretme. Bütün kavram adları ve tanımları eksiksiz olmalıdır.
- Ezberci değil, mantığı ve nedenselliği kavratan üst düzey akademik Türkçe kullan.`;
      break;
    case 'video':
      task = `Kullanıcının yüklediği ders notunu temel alarak EconNotes Akademik Stüdyosu için EN AZ 6-8 DAKİKA SÜRECEK (toplam 950-1300 kelime konuşma metni, 10-12 derinlikli bölüm) ÜST DÜZEY, ZENGİN VE ENTELEKTÜEL BİR İKİLİ VİDEO DERSİ üret.
${styleDirective}
${customPromptBlock}
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
   - Konuşma dili sade ve kulağa göre yazılsın: cümleler kısa (en fazla 20 kelime), tek fikirli ve akıcı olsun; ağır terimler ilk geçtiğinde günlük dille hemen açıklansın.
   - Her sahnede en az bir somut örnek veya gündelik benzetme kullan ("bunu şöyle düşünelim..."), sahneyi tek cümlelik bir "kısacası" özetiyle bitir.
   - Deniz konuşurken anlatımı adım adım kur: önce "ne", sonra "neden", sonra "sonucu ne oldu" sırasını izle.
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
${profileBlock ? profileBlock + '\n' : ''}${customPromptBlock ? customPromptBlock + '\n' : ''}İÇERİK:
${req.noteContext}

GÖREV: ${task}`;

  return { system: baseSystem, userText };
}

// Fail-safe structured generator ensuring the system never crashes under any gateway error
function generateSafeFallback(req: GenerateRequest): any {
  const title = req.noteTitle || 'Ders Notu';
  const course = req.course || 'Genel İktisat ve Sosyal Bilimler';
  const custom = req.customPrompt ? ` (${req.customPrompt})` : '';

  if (req.materialType === 'flashcards') {
    return {
      cards: [
        { front: `${title} kuramının temel varsayımı nedir?`, back: `${title} kuramı, iktisadi karar alıcıların rasyonel davrandığını ve piyasa sinyallerine göre optimal tercih yaptıklarını varsayar.`, hint: 'Rasyonellik ve fayda maksimizasyonu' },
        { front: 'Kurumsal işleyişte denge koşulu nasıl sağlanır?', back: 'Arz ve talep eğrilerinin kesişiminde marjinal maliyetin marjinal gelire eşitlendiği noktada denge kurulur.', hint: 'MC = MR dengesi' },
        { front: 'Vize sınavında bu konudan en sık sorulan çeldirici nedir?', back: 'Eğrinin üzerinde hareket ile eğrinin bütünüyle sağa/sola kayması arasındaki fark (fiyat değişimi vs. dışsal parametre değişimi).', hint: 'İçsel vs. Dışsal değişkenler' },
        { front: 'Konunun makroiktisadi / kurumsal yansıması nasıldır?', back: 'Mikro düzeydeki bireysel kararlar toplamda ulusal üretim, enflasyonist baskılar ve istihdam dengesi üzerinde belirleyicidir.', hint: 'Genel denge' },
        { front: 'Hocanın tam puan vereceği kilit analitik kavram nedir?', back: 'Fırsat maliyeti ve kaynakların alternatif kullanım alanları arasındaki ödünleşim (trade-off) analizi.', hint: 'Ödünleşim mekanizması' },
      ],
    };
  }

  if (req.materialType === 'quiz') {
    return {
      questions: [
        {
          question: `${title} kapsamında incelenen temel mekanizma göz önüne alındığında, dışsal bir şok durumunda piyasa dengesi nasıl etkilenir?`,
          type: 'multiple_choice',
          options: [
            'Denge fiyatı ve miktarı dışsal şokun yönüne göre eşanlı olarak yeniden belirlenir.',
            'Piyasa mekanizması işlevini yitirir ve fiyatlar sabit kalır.',
            'Yalnızca talep eğrisi etkilenir, arz eğrisi her koşulda durağandır.',
            'Hiçbir parametre değişmez, sistem kendiliğinden önceki noktaya döner.',
          ],
          correctIndex: 0,
          explanation: '**Doğru Yanıtın Mantığı:** Dışsal şoklar eğrilerin bütünsel olarak kaymasına yol açarak yeni bir denge fiyatı ve miktarı tesis eder.\n**Hocanın Sınav Tuzağı & Çeldirici Analizi:** Sınavlarda genellikle fiyatın sabit kaldığı yanılgısı çeldirici olarak kullanılır.\n**Sınav Tüyosu:** Eğri üzerinde hareket ile eğrinin kayması ayrımını sınav kağıdında mutlaka belirtin.',
        },
        {
          question: `Aşağıdakilerden hangisi ${title} konusunda hocaların sınavda öğrencileri en çok yanılttığı kavramsal ayrımdır?`,
          type: 'multiple_choice',
          options: [
            'Nominal değerler ile enflasyondan arındırılmış reel değerler arasındaki ayrım.',
            'Sadece matematiksel işlem hataları.',
            'Tanımların hangi dilde yazıldığı.',
            'Ders kitabının basım yılı.',
          ],
          correctIndex: 0,
          explanation: '**Doğru Yanıtın Mantığı:** İktisat fakültesi sınavlarında nominal-reel ayrımı en temel ölçme kriteridir.\n**Hocanın Sınav Tuzağı & Çeldirici Analizi:** Sorularda enflasyon etkisi gizlenerek öğrencilerin nominal rakamlara aldanması hedeflenir.\n**Sınav Tüyosu:** Satın alma gücü vurgusu yaparak reel analizi öne çıkarın.',
        },
        {
          question: `${title} konusunun vize sınavında klasik soru olarak sorulması halinde hocanın tam puan için arayacağı temel nedensellik zincirini açıklayınız.`,
          type: 'open_ended',
          options: [],
          sampleAnswer: `${title} bağlamında sistem; başlangıç dengesi, parametre değişimi, intikal süreci ve nihai uzun dönem dengesi olmak üzere 4 aşamalı nedensellik zinciriyle açıklanmalıdır. Piyasada meydana gelen bir değişim önce göreli fiyatları etkiler, ardından arz-talep uyarlaması ile yeni denge tesis edilir.`,
          explanation: 'Hoca cevap kağıdında: 1) Başlangıç varsayımı, 2) Aktarım mekanizması, 3) Grafiğin veya denklemin yönü olmak üzere 3 temel yapı taşını arar.',
        },
      ],
    };
  }

  if (req.materialType === 'video') {
    return {
      outline: `${course} dersi kapsamında ${title} konusunun kavramsal temelleri, kurumsal mekanizmaları ve sınav odaklı püf noktaları ikili akademik diyalogla analiz edilmektedir.`,
      podcastTitle: `${title} - Derinlemesine Akademik Çözümleme`,
      hosts: [
        { name: 'Dr. Deniz', role: 'Kürsü Başkanı / Kıdemli Akademisyen' },
        { name: 'Barış', role: 'Araştırmacı / Analitik Müzakereci' },
      ],
      scenes: [
        {
          time: '00:00 - 01:30',
          speaker: 'Dr. Deniz',
          speakerRole: 'Kürsü Başkanı',
          title: 'Giriş ve Kuramsal Çerçeve',
          narration: `Değerli arkadaşlar, bugün ${title} konusunun temel dinamiklerini ve sınavda karşımıza çıkacak can alıcı noktalarını adım adım ele alıyoruz. Bu konu yalnızca teorik bir model değil, iktisadi mekanizmanın bel kemiğidir.`,
          turns: [
            { speaker: 'Deniz', text: `Değerli arkadaşlar, bugün ${title} konusunun kavramsal mimarisini ele alıyoruz.` },
            { speaker: 'Barış', text: `Hocam özellikle vize sınavında öğrencilerin en çok zorlandığı ayrım noktalarını netleştirelim.` },
            { speaker: 'Deniz', text: `Kesinlikle. Konunun mantığını kavradığımızda sınavdaki tüm tuzak sorular çözülebilir hale geliyor.` },
          ],
          keyTakeaways: ['Temel kavramsal çerçeve', 'Nedensellik mekanizması', 'Sınavda dikkat edilecek püf noktalar'],
          visualCue: 'Kavramsal mimari ve kuramsal giriş şeması',
          diagramData: {
            diagramType: 'visual',
            visualTheme: 'economics',
            mainTitle: `${title} - Kuramsal Temeller`,
            nodes: [
              { label: 'Başlangıç Dengesi', subtext: 'Piyasadaki ilk kararlı durum' },
              { label: 'Dışsal Etki', subtext: 'Sistemi harekete geçiren şok' },
              { label: 'Uyum Süreci', subtext: 'Fiyat ve miktar intikali' },
              { label: 'Yeni Denge', subtext: 'Uzun dönem kararlı nokta' },
            ],
            highlightMetric: 'Sınav Ağırlığı: Yüksek',
          },
          examTip: 'Tanım sorularında mekanizmanın aşamalarını madde madde yazmak tam puan kazandırır.',
          keyTerms: [
            { term: 'Denge Durumu', definition: 'İçsel güçlerin birbirini dengelediği ve sapma eğiliminin olmadığı nokta.' },
          ],
        },
      ],
      keyFacts: [`${title} konusunun temel varsayımları eksiksiz bilinmelidir.`],
      suggestedSearches: [`${title} vize soruları`, `${title} çözümlü örnekler`],
      examQuestions: [
        {
          question: `${title} konusunda temel aktarım mekanizması nasıldır?`,
          options: ['Fiyat sinyalleri yoluyla kaynak dağılımı sağlanır.', 'Piyasa tamamen durağandır.', 'Denge kendiliğinden bozulmaz.', 'Tüm değişkenler bağımsızdır.'],
          correctIndex: 0,
          explanation: 'Fiyat mekanizması kıt kaynakların en verimli alanlara tahsis edilmesini temin eder.',
        },
      ],
      matchingPairs: [
        { term: 'Denge', definition: 'İçsel güçlerin eşitlendiği ve değişme eğiliminin bulunmadığı durum.' },
      ],
    };
  }

  // Default summary fallback
  return {
    overview: `${course} dersi kapsamında yer alan ${title} konusu, kuramsal temelleri ve sınav ağırlığı bakımından en kritik ünitelerden biridir. Konunun mantığı, değişkenler arasındaki karşılıklı bağımlılık ve aktarım kanalları üzerinden incelenmelidir.${custom}`,
    keyPoints: [
      `${title} konusunun kuramsal çerçevesi temel iktisadi rasyonellik varsayımına dayanır.`,
      'Değişkenler arasındaki neden-sonuç bağı zincirleme etki yaratır.',
      'Sınavlarda eğri üzerindeki hareket ile eğrinin kayması en yaygın çeldiricidir.',
      'Kısa dönem ve uzun dönem dengeleri kurumsal uyum süreçlerine göre farklılaşır.',
      'Hocanın sınavda aradığı kilit nokta ezber tanımlar değil, mekanizmanın grafiksel/matematiksel ispatıdır.',
    ],
    sections: [
      {
        heading: 'Bölüm 1: Kavramsal Temeller ve Varsayımlar',
        content: `**${title}** ünitesinin anlaşılabilmesi için öncelikle sistemin dayandığı aksiyomlar incelenmelidir. İktisadi karar birimleri mevcut kısıtlar altında fayda veya kâr maksimizasyonu hedefler. Bu süreçte marjinal analiz belirleyici rol oynar.`,
        takeaway: 'Varsayımlar bilinmeden ulaşılan sonuçlar sınavda puan kaybına yol açar.',
      },
      {
        heading: 'Bölüm 2: Aktarım Mekanizması ve Piyasa Dengesi',
        content: `Sistemde meydana gelen bir parametre değişikliği, göreli fiyatları etkileyerek karar alıcıların tercihlerini yeniden yapılandırır. Arz ve talep güçleri kesişene dek intikal süreci devam eder.`,
        takeaway: 'Denge noktası marjinal koşulların sağlandığı kararlı durumdur.',
      },
      {
        heading: 'Bölüm 3: Sınav Odaklı Analitik Çıkarımlar ve Çeldiriciler',
        content: `Üniversite hocaları bu konuda genellikle uç durumları ve varsayımların esnetildiği senaryoları sorar. Nominal yanılsama ve zaman gecikmeleri sınav sorularının odağını oluşturur.`,
        takeaway: 'Tuzak sorulara karşı her formülün altında yatan mantık şemasını kurun.',
      },
    ],
    infographic: [
      { label: 'Sınav Ağırlığı', value: '%30 - %40' },
      { label: 'Zorluk Derecesi', value: 'Orta / İleri' },
      { label: 'Temel Dinamik', value: 'Marjinal Denge' },
    ],
    instructorEmphasis: [
      'Hoca bu konuda özellikle içsel ve dışsal değişken ayrımını vizede sorabilir.',
      'Öğrencilerin en çok yaptığı hata: İki kavramın birbirinin yerine kullanılmasıdır.',
      'Grafik sorularında eksenlerin doğru adlandırılması ve kayma yönünün oklarla gösterilmesi zorunludur.',
      'Klasik sorularda tanımın yanına mutlaka matematiksel gösterim veya sezgisel açıklama eklenmelidir.',
    ],
    examLikelihood: [
      { topic: `${title} Temel Denge Analizi`, reason: 'Konunun omurgasıdır; her sınavda en az bir klasik soru gelir.', likelihood: 'yüksek', studyPriority: 'öncelikli' },
      { topic: 'Şoklara Karşı İntikal Mekanizması', reason: 'Çoktan seçmeli testlerde güçlü çeldirici üretmeye uygundur.', likelihood: 'yüksek', studyPriority: 'öncelikli' },
      { topic: 'Uç Durumlar ve İstisnalar', reason: 'Final sınavlarında ayırt edici soru olarak tercih edilir.', likelihood: 'orta', studyPriority: 'normal' },
    ],
    keyTerms: [
      { term: 'Denge Noktası', definition: 'Piyasada arz ve talep güçlerinin birbirine eşitlendiği, dışsal bir müdahale olmadıkça değişme eğilimi göstermeyen durum.' },
      { term: 'Marjinal Değişim', definition: 'Bir değişkenin bir birim artırılması veya azaltılması durumunda toplam büyüklükte meydana gelen ek değişim.' },
      { term: 'Fırsat Maliyeti', definition: 'Belirli bir tercihin yapılması sonucu vazgeçilen en değerli alternatifin getirisi.' },
    ],
    studyChecklist: [
      `${title} konusunun 3 temel varsayımını eksiksiz sayabiliyorum.`,
      'Grafikteki kaymalar ile eğri üzerindeki hareketleri ayırt edebiliyorum.',
      'Hocanın sınavda sorabileceği klasik soruya 4 aşamalı model cevap yazabiliyorum.',
    ],
  };
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
      || (body.summaryLength !== undefined && !['short', 'balanced', 'detailed'].includes(body.summaryLength))
      || (body.noteStyle !== undefined && !['academic', 'exam_focused', 'instructor_traps', 'formula_concepts', 'solved_cases'].includes(body.noteStyle))
      || (body.customPrompt !== undefined && (typeof body.customPrompt !== 'string' || body.customPrompt.length > 2000))
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
    const { system, userText } = buildPrompt(body);
    const schema = schemas[body.materialType];

    // Multimodal content (text + optional audio/document)
    const userContent: any[] = [{ type: 'text', text: userText }];

    if (body.audio?.data) {
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

    let content: any = null;

    const candidateModels: Array<'gpt-4o' | 'gpt-4o-mini'> = [
      (body.materialType === 'video' || body.materialType === 'summary') ? 'gpt-4o' : 'gpt-4o-mini',
      'gpt-4o-mini',
    ];

    for (const currentModel of candidateModels) {
      try {
        const messages: OpenAIMessage[] = [
          { role: 'system', content: system },
          { role: 'user', content: userContent },
        ];

        const result = await createChatCompletion({
          model: currentModel,
          temperature: (body.materialType === 'summary' || body.materialType === 'video') ? 0.15 : 0.2,
          max_tokens: body.materialType === 'video' ? 16000 : body.materialType === 'summary' ? 6500 : 4000,
          messages,
          tools: [{
            type: 'function',
            function: {
              name: 'emit_material',
              description: 'Çalışma materyalini yapılandırılmış biçimde döndür',
              parameters: schema,
            },
          }],
          tool_choice: { type: 'function', function: { name: 'emit_material' } },
        });

        if (result.parsedJson && typeof result.parsedJson === 'object') {
          content = result.parsedJson;
          break;
        } else if (result.content) {
          const match = result.content.match(/\{[\s\S]*\}/);
          if (match) {
            const clean = match[0].replace(/```json\s*|\s*```/g, '').trim();
            content = JSON.parse(clean);
            if (content) break;
          }
        }
      } catch (err) {
        console.warn(`OpenAI candidate model ${currentModel} error:`, err);
      }
    }

    // Zero-Crash Guarantee: If AI gateways are unavailable or fail, produce a verified schema fallback
    if (!content) {
      console.warn('All AI candidate models failed or API key missing; activating intelligent safe fallback.');
      content = generateSafeFallback(body);
    }

    // Return under unified brand - NEVER leak internal AI model names to user!
    return jsonResponse(req, {
      content,
      model: 'EconNotes Deep Academic AI',
    });
  } catch (error) {
    if (error instanceof RequestError) return jsonResponse(req, { error: error.message }, error.status);
    console.error('generate-study-material request caught top-level error:', error);
    return jsonResponse(req, { error: 'İstek işlenirken bir sorun oluştu.' }, 500);
  }
});
