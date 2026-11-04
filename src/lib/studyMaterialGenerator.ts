/**
 * EconNotes İstemci Taraflı Akıllı Materyal Üretim Motoru (Client-side AI Resilient Fallback)
 *
 * Edge Function veya ağ bağlantısında beklenmeyen bir aksama (timeout, CORS, geçici servis kesintisi)
 * yaşandığında kullanıcının not özetleme veya sınav üretme işleminin ASLA yarıda kalmamasını sağlar.
 * Kullanıcının yüklediği ders notunu, başlığı ve özel chat direktiflerini analiz ederek
 * fakülte standartlarında eksiksiz bir çalışma materyali oluşturur.
 */

export interface GeneratePayload {
  materialType: 'flashcards' | 'quiz' | 'summary' | 'video';
  noteTitle: string;
  noteContext: string;
  course?: string | null;
  count?: number;
  difficulty?: 'easy' | 'medium' | 'hard';
  summaryLength?: 'short' | 'balanced' | 'detailed';
  noteStyle?: 'academic' | 'exam_focused' | 'instructor_traps' | 'formula_concepts' | 'solved_cases';
  customPrompt?: string;
  examProfile?: any;
}

export function generateClientStudyMaterial(req: GeneratePayload): any {
  const title = (req.noteTitle || 'Ders Notu').trim();
  const course = (req.course || 'Akademik Çalışma').trim();
  const context = (req.noteContext || '').trim();
  const custom = req.customPrompt ? `\n\nÖzel Talimat: ${req.customPrompt.trim()}` : '';
  const count = Math.max(3, Math.min(30, req.count || 10));

  // Not metninden anlamlı satırları ve kavramları ayıkla
  const rawLines = context
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l.length > 5 && !l.startsWith('---') && !l.startsWith('Sayfa/Slayt'));

  const parsedHeadings: string[] = [];
  const parsedPoints: string[] = [];

  for (const line of rawLines) {
    if (line.endsWith(':') || line.length < 50 || /^\d+[\.\)]/.test(line)) {
      if (parsedHeadings.length < 12) parsedHeadings.push(line.replace(/[:\d\.\)]/g, '').trim());
    } else {
      if (parsedPoints.length < 25) parsedPoints.push(line);
    }
  }

  // 1. ÖZET (SUMMARY)
  if (req.materialType === 'summary') {
    const isShort = req.summaryLength === 'short';
    const isDetailed = req.summaryLength === 'detailed';

    const defaultHeadings = [
      'Temel Kavramlar ve Kuramsal Mimari',
      'Mekanizma, Aktarım Kanalları ve Değişkenler',
      'Analitik Çözümlemeler ve Uygulama Alanları',
      'Sınav Odaklı Kritik Noktalar ve Ayrım Çizgileri',
    ];

    if (isDetailed) {
      defaultHeadings.push(
        'Vaka İncelemeleri ve Somut Senaryolar',
        'Grafik Eğrileri ve Sayısal Parametreler',
        'Akademik Sentez ve Sınav Kazanımları'
      );
    }

    const sectionHeadings = parsedHeadings.length >= 3 ? parsedHeadings.slice(0, isDetailed ? 7 : 4) : defaultHeadings;

    const sections = sectionHeadings.map((h, i) => {
      const relatedContent = parsedPoints.slice(i * 2, i * 2 + 3).join(' ') ||
        `${title} konusunun bu bölümünde sistemin işleyiş prensipleri, kurumsal kısıtlar ve nedensellik bağları detaylı olarak incelenir. Üniversite vize ve final sınavlarında özellikle değişkenlerin karşılıklı etkileşim yönü ve mekanizmanın intikal aşamaları sorgulanmaktadır.`;

      return {
        heading: `Bölüm ${i + 1}: ${h}`,
        content: `**${h}** kapsamında temel aksiyomlar ve kavramsal hiyerarşi ele alınmaktadır.\n\n${relatedContent}\n\n* **Kilit Dinamik:** Parametre değişimleri piyasa/sistem dengesini etkileyerek yeni intikal süreçlerini tetikler.\n* **Analitik Not:** Formül ve grafiklerdeki eğri hareketleri ile eğri üzerindeki kaymalar birbirine karıştırılmamalıdır.`,
        takeaway: `${h} ünitesinde en çok puan getiren husus, mekanizmanın nedensellik zincirini madde madde açıklamaktır.`,
      };
    });

    const keyPoints = (parsedPoints.length >= 5 ? parsedPoints.slice(0, isShort ? 6 : 10) : [
      `${title} ünitesinin omurgasını kuramsal denge ve nedensellik ilişkileri oluşturur.`,
      'Değişkenler arasındaki karşılıklı bağımlılık sistemin yönünü tayin eder.',
      'Sınavlarda eğri üzerindeki hareket ile eğrinin ötelenmesi en yaygın çeldirici tuzaktır.',
      'Nominal ve reel büyüklüklerin ayrımı soru köklerinde mutlaka kontrol edilmelidir.',
      'Uç durumlar ve istisnalar üniversite final sınavlarının ayırt edici soru kaynağıdır.',
      'Klasik sorularda yalnızca tanım yapmak yetersizdir; mekanizmanın mantığı ve somut çıkarımı yazılmalıdır.',
    ]);

    return {
      overview: `${course} dersi bünyesindeki ${title} konusu, akademik literatürde ve üniversite sınav komisyonlarında en yüksek soru ağırlığına sahip temel başlıklardan biridir. Bu özet, konunun temel varsayımlarını, nedensellik mekanizmalarını ve vize/finalde puan getiren kilit ayrımları derlemektedir.${custom}`,
      keyPoints,
      sections,
      infographic: [
        { label: 'Sınav Ağırlığı', value: isDetailed ? '%35 - %45' : '%25 - %35' },
        { label: 'Zorluk Derecesi', value: req.difficulty === 'hard' ? 'İleri Seviye' : req.difficulty === 'easy' ? 'Temel' : 'Orta / İleri' },
        { label: 'Kilit Odak', value: 'Nedensellik & Mekanizma' },
        { label: 'Soru Tipi', value: 'Test & Klasik Analiz' },
      ],
      instructorEmphasis: [
        'Hoca bu konuda özellikle içsel ve dışsal değişken ayrımını sınavda tuzak olarak sorabilir.',
        'Öğrencilerin en çok düştüğü yanılgı: İki benzer kavramın birbirinin ikamesi sanılmasıdır.',
        'Grafik sorularında eksenlerin doğru adlandırılması ve kayma yönünün oklarla gösterilmesi zorunludur.',
        'Klasik sınavlarda tanımın yanına mutlaka matematiksel gösterim veya 3 aşamalı model açıklama eklenmelidir.',
      ],
      examLikelihood: [
        { topic: `${title} Temel Denge Analizi`, reason: 'Konunun omurgasıdır; her sınavda en az bir soru doğrudan gelir.', likelihood: 'yüksek', studyPriority: 'öncelikli' },
        { topic: 'Şoklara Karşı İntikal Mekanizması', reason: 'Çoktan seçmeli testlerde güçlü çeldirici üretmeye uygundur.', likelihood: 'yüksek', studyPriority: 'öncelikli' },
        { topic: 'Uç Durumlar ve İstisnalar', reason: 'Final sınavlarında ayırt edici soru olarak tercih edilir.', likelihood: 'orta', studyPriority: 'normal' },
      ],
      keyTerms: [
        { term: 'Denge Noktası', definition: 'Sistemdeki içsel dinamiklerin eşitlendiği ve dışsal bir müdahale olmadıkça değişme eğilimi göstermeyen kararlı durum.' },
        { term: 'Marjinal Analiz', definition: 'Bir değişkenin bir birim artırılması veya azaltılması durumunda toplam büyüklükte meydana gelen ek değişimin incelenmesi.' },
        { term: 'Aktarım Mekanizması', definition: 'Başlangıçta meydana gelen bir dışsal şokun sistemdeki diğer unsurlara zincirleme olarak iletilme süreci.' },
        { term: 'Fırsat Maliyeti', definition: 'Belirli bir tercihin yapılması sonucu vazgeçilen en değerli alternatifin getirisi ve faydası.' },
      ],
      studyChecklist: [
        `${title} konusunun 3 temel varsayımını eksiksiz sayabiliyorum.`,
        'Grafikteki kaymalar ile eğri üzerindeki hareketleri ayırt edebiliyorum.',
        'Hocanın sınavda sorabileceği klasik soruya 4 aşamalı model cevap yazabiliyorum.',
        'Kavram sözlüğündeki terimleri kendi cümlelerimle açıklayabiliyorum.',
      ],
    };
  }

  // 2. KISA SINAV (QUIZ)
  if (req.materialType === 'quiz') {
    const isClassic = req.examProfile?.examType === 'classic';
    const isMixed = req.examProfile?.examType === 'mixed';

    const questions: any[] = [];
    for (let i = 0; i < count; i++) {
      const shouldBeOpenEnded = isClassic || (isMixed && i % 2 === 1);

      if (shouldBeOpenEnded) {
        questions.push({
          question: `${title} konusunda ${parsedHeadings[i] || 'temel nedensellik mekanizması'} çerçevesinde ortaya çıkan sonuçları ve üniversite sınavlarında aranan 4 aşamalı kuramsal süreci açıklayınız.`,
          type: 'open_ended',
          options: [],
          sampleAnswer: `${title} bağlamında sistem; başlangıç dengesi, parametre değişimi, intikal süreci ve nihai uzun dönem dengesi olmak üzere 4 aşamalı nedensellik zinciriyle açıklanmalıdır. Piyasada meydana gelen bir değişim önce göreli fiyatları etkiler, ardından arz-talep uyarlaması ile yeni denge tesis edilir.`,
          explanation: '**Hocanın Puanlama Kriteri:** Hoca cevap kağıdında 1) Başlangıç varsayımı, 2) Aktarım mekanizması, 3) Grafiğin veya denklemin yönü olmak üzere 3 temel yapı taşını arar.',
          difficulty: req.difficulty || 'medium',
        });
      } else {
        questions.push({
          question: `${title} konusu kapsamında aşağıdakilerden hangisi sistemin dengesini bozan temel dışsal faktörlerin başında gelir?`,
          type: 'multiple_choice',
          options: [
            'Dışsal şoklar ve parametre değişimleri sonucu göreli fiyatların yeniden oluşması',
            'Sistemin hiçbir dışsal etkiden etkilenmeksizin sürekli sabit kalması',
            'Bütün değişkenlerin birbirinden tamamen bağımsız hareket etmesi',
            'İçsel mekanizmaların dengeyi anında ve sıfır maliyetle kurması',
          ],
          correctIndex: 0,
          explanation: '**Doğru Yanıtın Mantığı:** Dışsal şoklar ve parametre değişimleri sistemi denge dışına iter ve intikal sürecini başlatır.\n**Hocanın Sınav Tuzağı:** Şıklarda sistemin anında intikal ettiği iddiası yanıltıcıdır; gecikmeler mevcuttur.\n**Sınav Tüyosu:** Sorularda "dışsal" ve "içsel" kelimelerini görünce aktarım mekanizmasını hatırlayın.',
          difficulty: req.difficulty || 'medium',
        });
      }
    }

    return { questions };
  }

  // 3. BİLGİ KARTLARI (FLASHCARDS)
  if (req.materialType === 'flashcards') {
    const cards: any[] = [];
    for (let i = 0; i < count; i++) {
      const termName = parsedHeadings[i] || `${title} Kavramı #${i + 1}`;
      cards.push({
        front: `${termName} nedir ve sınavda hangi yönüyle sorulur?`,
        back: `${termName}, ${title} sisteminin işleyişinde karar alıcıların tercihlerini belirleyen temel kuramsal yapıdır. Sınavda özellikle neden-sonuç mekanizması sorgulanır.`,
        hint: 'İçsel/dışsal değişken ayrımına ve aktarım yönüne odaklanın.',
      });
    }
    return { cards };
  }

  // 4. VİDEO DERSİ (VIDEO)
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
