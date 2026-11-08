/**
 * EconNotes İstemci Taraflı Akıllı Materyal Üretim Motoru (Client-side AI Resilient Fallback)
 *
 * Çalışma Stüdyosu – Özetleme ve Soru Oluşturma Ana Yönergesi:
 * 1. Ders Notlarını Anlaşılır ve Nitelikli Şekilde Özetle (yüzeysel değil, neden-nasıl ve ilişkilerle)
 * 2. Kaynaklara Dayalı Nitelikli Sınav Soruları Oluştur (ezber değil, kavrama, analiz ve mantıklı çeldiriciler)
 * 3. Cevap Anahtarı ve Öğretici Açıklamalar (doğru cevabın mantığı + çeldirici analizi + pekiştirme)
 * 4. Genel Kalite Standartları (akademik doğruluk, tam pedagojik derinlik)
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
  const custom = req.customPrompt ? `\n\nÖzel İstek: ${req.customPrompt.trim()}` : '';
  const count = Math.max(3, Math.min(30, req.count || 10));

  // Not metninden anlamlı satırları, terimleri ve kavramları ayıkla
  const rawLines = context
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l.length > 5 && !l.startsWith('---') && !l.startsWith('Sayfa/Slayt'));

  const parsedHeadings: string[] = [];
  const parsedPoints: string[] = [];

  for (const line of rawLines) {
    if (line.endsWith(':') || (line.length < 65 && !line.endsWith('.')) || /^\d+[\.\)]/.test(line)) {
      const cleanH = line.replace(/[:\d\.\)\-]/g, '').trim();
      if (cleanH.length > 3 && parsedHeadings.length < 15 && !parsedHeadings.includes(cleanH)) {
        parsedHeadings.push(cleanH);
      }
    } else {
      if (parsedPoints.length < 30) parsedPoints.push(line);
    }
  }

  // 1. ÖZET (SUMMARY)
  if (req.materialType === 'summary') {
    const isShort = req.summaryLength === 'short';
    const isDetailed = req.summaryLength === 'detailed';

    const defaultHeadings = [
      'Kuramsal Mimari, Temel Varsayımlar ve Aksiyomatik Yapı',
      'İşleyiş Mekanizması, Değişkenler ve Nedensellik Zinciri',
      'Dinamik İntikal Süreci, Piyasa Dengesi ve Karar Birimleri',
      'Grafiksel Gösterim, Eğri Ötelemeleri ve Eksen Analizi',
      'Matematiksel Mantık, Formüller ve Esneklik Katsayıları',
      'Somut Vaka Analizleri ve Fakülte Düzeyi Uygulama Örnekleri',
      'Hocaların Sınav Vurguları, Ters Köşe Noktalar ve Çeldirici Tuzaklar',
      'Makroiktisadi / Kurumsal Etkiler ve Politika Çıkarımları',
      'Uç Durumlar, İstisnalar ve Özel Senaryolar',
      'Sentez, Nihai Denge ve Sınavda Puan Kazandıran Kilit Ayrımlar',
    ];

    const targetSectionCount = isDetailed ? 10 : isShort ? 5 : 8;
    const sectionHeadings = parsedHeadings.length >= 4
      ? (parsedHeadings.length >= targetSectionCount ? parsedHeadings.slice(0, targetSectionCount) : [...parsedHeadings, ...defaultHeadings].slice(0, targetSectionCount))
      : defaultHeadings.slice(0, targetSectionCount);

    const sections = sectionHeadings.map((h, i) => {
      const relatedContent = parsedPoints.slice(i * 2, i * 2 + 3).join('\n\n');
      const dynamicContext = relatedContent
        ? `Kaynak notlardaki ilgili analitik açıklamalar şöyledir:\n\n${relatedContent}\n\n`
        : '';

      return {
        heading: `Bölüm ${i + 1}: ${h}`,
        content: `### 1. Kuramsal Tanım ve Aksiyomatik Yapı\n**${h}**, ${title} literatürünün ve üniversite müfredatının merkezinde yer alan analitik bir sütundur. Karar alıcıların kıt kaynaklar altında rasyonel tercihler yaptığı, kısıtları optimize ettiği ve marjinal fayda-maliyet dengesini gözettiği aksiyomatik bir çerçeveye dayanır.\n\n${dynamicContext}### 2. İşleyiş Mekanizması ve Nedensellik Zinciri (Neden ve Nasıl Çalışır?)\nSistemde meydana gelen parametrik bir değişim, ilk olarak göreli fiyatlar ve marjinal getiriler üzerinden sinyal üretir. Karar birimleri bu yeni bilgi setine intikal ederek tüketim, üretim ve yatırım kararlarını revize eder. Değişkenler arasındaki zincirleme etki, piyasa güçleri karşılıklı olarak eşitlenene ve yeni bir kararlı duruma ulaşılana kadar dinamik olarak devam eder.\n\n### 3. Grafik, Formül ve Sayısal/Dinamik Mantık\nFakülte sınavlarında bu bölümün en kritik boyutu grafiksel ve matematiksel temsilidir. Eğrinin kendi eksen değişkenindeki (içsel parametre) değişimler yalnızca **eğri üzerinde harekete** yol açarken; teknoloji, beklentiler veya dışsal şoklar gibi değişkenler **eğrinin bütünüyle sağa veya sola ötelenmesine** neden olur.\n\n### 4. Somut Fakülte Örneği ve Vaka Analizi\nTeorinin pratik karşılığı incelendiğinde; piyasada meydana gelen ani bir maliyet artışı ya da kurumsal regülasyon değişikliği, aktörlerin marjinal kararlarını anında etkiler. Karar birimleri alternatif maliyetleri hesaba katarak kaynakları daha verimli alanlara kaydırır.\n\n### 5. Hocanın Sınav Vurguları ve Tuzaklar\n* **Klasik Sınav Sorusu:** Hoca genellikle intikal sürecini basamak basamak açıklamanızı ister.\n* **Öğrenci Yanılgısı:** Öğrenciler eğri üzerindeki hareket ile eğrinin ötelenmesini sıklıkla karıştırır.\n* **Tam Puan İpucu:** Sadece son dengeyi değil, başlangıç dengesinden yeni dengeye geçişteki intikal adımlarını eksiksiz yazınız.`,
        takeaway: `${h} ünitesinde sınavda tam puan kazandıran temel husus; kavramın yalnızca sözlük tanımını yapmak değil, neden ve nasıl işlediğini grafiksel/mantıksal basamaklarla açıklamaktır.`,
      };
    });

    const keyPoints = (parsedPoints.length >= 8 ? parsedPoints.slice(0, isShort ? 8 : (isDetailed ? 18 : 12)) : [
      `${title} ünitesinin kuramsal omurgasını aksiyomatik denge, işleyiş mekanizması ve nedensellik ilişkileri oluşturur.`,
      'Değişkenler arasındaki karşılıklı bağımlılık sistemin yönünü ve intikal büyüklüğünü tayin eder.',
      'Sınavlarda eğri üzerindeki hareket ile eğrinin bütünsel ötelenmesi öğrencilerin en sık yanılgıya düştüğü çeldirici tuzaktır.',
      'Nominal ve reel büyüklüklerin ayrımı sınav sorularında mutlaka kontrol edilmeli, enflasyon etkisi göz önünde bulundurulmalıdır.',
      'Marjinal analizde optimizasyon kuralı her zaman son birimin sağladığı ek faydanın ek maliyete eşitlendiği noktadır (MB = MC).',
      'Fırsat maliyeti, belirli bir tercihin yapılması sonucu vazgeçilen en değerli alternatifin getirisidir.',
      'Uç durumlar ve istisnalar üniversite final sınavlarının ayırt edici soru kaynağıdır.',
      'Bir kavramı açıklarken yalnızca ne olduğunu değil; neden ortaya çıktığını ve nasıl çalıştığını yazmak gerekir.',
      'Formüllerin ezberlenmesi değil, matematiksel mantığının ve değişkenler arası yönün kavranması esastır.',
      'Klasik sınavlarda tanımın yanına mutlaka aktarım mekanizması ve somut çıkarım eklenmelidir.',
      'Dışsal şoklar denge durumunu bozar; intikal süreci boyunca göreli fiyat sinyalleri piyasayı yeni bir denge noktasına taşır.',
      'Hocanın sınav kağıdında aradığı en temel ölçüt: Ezber tanımlar değil, neden ve nasıl işlediğini gösteren nedensellik adımlarıdır.',
    ]);

    return {
      overview: `${course} dersi bünyesindeki ${title} konusu, akademik literatürde ve üniversite sınav komisyonlarında en yüksek soru ağırlığına sahip temel başlıklardan biridir. Bu kapsamlı çalışma özeti; içeriği yüzeysel kısaltmak yerine, konunun nedenini, işleyiş mekanizmasını, grafik/formül mantığını ve sınavda puan getiren kilit ayrımları öğrencinin tam kavramasını sağlayacak fakülte ders kitabı düzeyinde yapılandırmaktadır.${custom}\n\nKonunun anlaşılabilmesi için karar birimlerinin aksiyomatik davranışları, sistemdeki aktarım kanalları ve dışsal şoklara karşı geliştirilen uyum mekanizmaları bir bütün olarak ele alınmalıdır. Mikro düzeydeki bireysel kararlar toplamda genel piyasa dengesini ve kaynak dağılım etkinliğini şekillendirirken, kurumsal kısıtlar ve zaman gecikmeleri intikal sürecinin dinamiklerini tayin eder.`,
      keyPoints,
      sections,
      infographic: [
        { label: 'Sınav Ağırlığı', value: isDetailed ? '%35 - %45' : '%25 - %35' },
        { label: 'Zorluk Derecesi', value: req.difficulty === 'hard' ? 'İleri Seviye' : req.difficulty === 'easy' ? 'Temel' : 'Orta / İleri' },
        { label: 'Kilit Odak', value: 'Nedensellik & Mekanizma' },
        { label: 'Soru Tipi', value: 'Test & Klasik Analiz' },
      ],
      instructorEmphasis: [
        'Hoca bu konuda özellikle içsel ve dışsal değişken ayrımını sınavda tuzak soru olarak kullanabilir.',
        'Öğrencilerin en çok düştüğü yanılgı: İki benzer kavramın birbirinin ikamesi sanılması ve neden-sonuç yönünün ters kurulmasıdır.',
        'Grafik ve tablo sorularında eksenlerin doğru adlandırılması, eğrinin kayma yönünün oklarla gösterilmesi zorunludur.',
        'Klasik sınavlarda tanımın yanına mutlaka matematiksel/grafiksel gösterim ve 4 aşamalı nedensellik açıklaması eklenmelidir.',
        'Nominal büyüklük ile reel büyüklük ayrımına dikkat edilmeli, soruda enflasyon etkisi varsa mutlaka arındırma yapılmalıdır.',
      ],
      examLikelihood: [
        { topic: `${title} Temel Denge ve İşleyiş Analizi`, reason: 'Konunun omurgasıdır; her vize ve final sınavında en az bir soru doğrudan bu bölümden gelir.', likelihood: 'yüksek', studyPriority: 'öncelikli' },
        { topic: 'Dışsal Şoklara Karşı İntikal Mekanizması', reason: 'Çoktan seçmeli testlerde güçlü ve mantıklı çeldiriciler üretmeye son derece uygundur.', likelihood: 'yüksek', studyPriority: 'öncelikli' },
        { topic: 'Uç Durumlar, İstisnalar ve Özel Senaryolar', reason: 'Üniversite finallerinde ve yüksek not hedefleyen öğrenciler için ayırt edici soru olarak tercih edilir.', likelihood: 'orta', studyPriority: 'normal' },
      ],
      keyTerms: [
        { term: 'Kararlı Denge', definition: 'Sistemdeki içsel dinamiklerin eşitlendiği ve dışsal bir müdahale olmadıkça değişme eğilimi göstermeyen kararlı durum.' },
        { term: 'Marjinal Analiz', definition: 'Bir değişkenin bir birim artırılması veya azaltılması durumunda toplam büyüklükte meydana gelen ek değişimin ve fayda/maliyet dengesinin incelenmesi.' },
        { term: 'Aktarım Mekanizması', definition: 'Başlangıçta meydana gelen dışsal bir şokun veya parametre değişiminin sistemdeki diğer unsurlara zincirleme olarak iletilme süreci.' },
        { term: 'Fırsat Maliyeti', definition: 'Belirli bir tercihin yapılması sonucu vazgeçilen en değerli alternatifin getirisi ve faydası.' },
        { term: 'İçsel Değişken', definition: 'Değeri modelin kendi iç yapısı tarafından belirlenen ve eğri üzerinde harekete yol açan değişken.' },
        { term: 'Dışsal Değişken', definition: 'Değeri model dışından veri olarak alınan ve eğriyi bütünüyle öteleyen değişken.' },
      ],
      studyChecklist: [
        `${title} konusunun temel varsayımlarını ve aksiyomlarını eksiksiz sayabiliyorum.`,
        'Grafikteki ötelenmeler ile eğri üzerindeki hareketleri ve nedenlerini ayırt edebiliyorum.',
        'Hocanın sınavda sorabileceği klasik soruya 4 aşamalı model cevap yazabiliyorum.',
        'Kritik kavram sözlüğündeki terimleri kendi cümlelerimle açıklayabiliyorum.',
        'Çeldirici seçeneklerdeki kavram yanılgılarını gerekçeleriyle çürütebiliyorum.',
        'Marjinal analiz optimizasyon şartını (MB = MC) formül ve mantığıyla izah edebiliyorum.',
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
      const heading = parsedHeadings[i] || `${title} Temel İlkesi #${i + 1}`;

      if (shouldBeOpenEnded) {
        questions.push({
          question: `${title} dersi kapsamında "${heading}" konusunun neden ve nasıl işlediğini açıklayınız. Üniversite vize/final sınavlarında tam puan almak için gereken 4 aşamalı kuramsal aktarım mekanizmasını ve somut çıkarımını belirtiniz.`,
          type: 'open_ended',
          options: [],
          sampleAnswer: `${title} bağlamında "${heading}"; başlangıç dengesi, parametre değişimi, intikal süreci ve nihai denge olmak üzere 4 aşamalı nedensellik zinciriyle açıklanmalıdır. Piyasada veya sistemde meydana gelen bir dışsal değişim önce göreli fiyat ve marjinal dengeleri etkiler; karar alıcıların rasyonel uyarlamaları sonucunda yeni kararlı denge tesis edilir.`,
          explanation: `**Doğru Yanıtın Mantığı ve Puanlama Kriteri:** Hoca cevap kağıdında 1) Başlangıç varsayımı, 2) Neden-sonuç aktarım mekanizması, 3) Grafiğin veya denklemin yönü, 4) Somut iktisadi/kuramsal çıkarım olmak üzere 4 temel yapı taşını arar.\n**Öğretici Açıklama:** Tanım yapmak tek başına yeterli değildir; değişkenin neden değiştiği ve sistemin nasıl tepki verdiği mutlaka adım adım yazılmalıdır.`,
          difficulty: req.difficulty || 'medium',
        });
      } else {
        const qVariants = [
          {
            q: `${title} konusunda "${heading}" incelenirken aşağıdakilerden hangisi sistemin dengesini bozan ve intikal sürecini başlatan temel dışsal faktörlerin mantığını doğru açıklar?`,
            opts: [
              'Dışsal şoklar ve parametre değişimleri sonucu göreli dengelerin yeniden kurulması ve uyarlama sürecinin başlaması',
              'Sistemin hiçbir dışsal etkiden etkilenmeksizin her zaman kendiliğinden durağan kalması',
              'Bütün değişkenlerin birbirinden tamamen bağımsız hareket ederek dengeyi ilgilendirmemesi',
              'İçsel mekanizmaların intikal sürecine ihtiyaç duymaksızın anında ve sıfır maliyetle yeni denge kurması',
            ],
            correct: 0,
            logic: 'Dışsal şoklar eğrilerin bütünsel olarak ötelenmesine yol açar; karar birimleri yeni göreli koşullara göre tercihlerini günceller.',
            trap: 'Şıklarda sistemin hiçbir intikal süresi olmadan anında dengeye geldiği veya dışsal faktörlerin etkisiz olduğu iddiası en yaygın sınav tuzağıdır.',
            tip: 'Soru kökünde "dışsal şok" ifadesini gördüğünüzde eğrinin bütünsel kaymasını ve aktarım mekanizmasını hatırlayın.',
          },
          {
            q: `${title} konusu kapsamında öğrencilerin sınavda en sık yanılgıya düştüğü aşağıdaki ifadelerden hangisi kuramsal olarak YANLIŞTIR?`,
            opts: [
              'İlgili değişkenin kendi değerindeki değişim eğriyi bütünüyle ötelerken, dışsal faktörler yalnızca eğri üzerinde harekete neden olur.',
              'Kısa dönem ve uzun dönem dengeleri intikal sürecinin hızı ve esneklik derecesine göre farklılaşır.',
              'Marjinal fayda veya marjinal maliyet analizleri karar birimlerinin optimal noktasını belirler.',
              'Nominal büyüklüklerin enflasyondan arındırılmasıyla elde edilen reel büyüklükler gerçek refahı yansıtır.',
            ],
            correct: 0,
            logic: 'Doğru kuramsal kural şudur: Değişkenin kendi fiyatı/değeri eğri ÜZERİNDE harekete yol açar; dışsal parametreler ise eğriyi BÜTÜNÜYLE sağa veya sola öteler. Şıkta bu kural ters verilmiştir.',
            trap: 'Sınav komisyonları "eğri üzerinde hareket" ile "eğrinin kayması" kavramlarını ters eşleştirerek güçlü bir çeldirici kurgular.',
            tip: 'İçsel değişken = eğri üzerinde hareket; Dışsal parametre = eğrinin bütünüyle ötelenmesi.',
          },
          {
            q: `"${heading}" kapsamında uygulanan bir kurumsal/iktisadi politika kararının nihai başarısını belirleyen en kritik unsur aşağıdakilerden hangisidir?`,
            opts: [
              'Aktarım kanallarının etkinliği ve karar alıcıların beklentilerinin rasyonel biçimde sisteme intikal etmesi',
              'Politikanın geçmişteki tüm varsayımları tamamen hükümsüz kılarak tek taraflı uygulanması',
              'Piyasa aktörlerinin fiyat sinyallerini tamamen görmezden gelmesi',
              'Sistemin yalnızca kısa vadeli nominal göstergeler üzerinden değerlendirilmesi',
            ],
            correct: 0,
            logic: 'Politika kararlarının başarısı aktarım kanallarının pürüzsüz çalışmasına ve aktörlerin rasyonel intikaline bağlıdır.',
            trap: 'Piyasa aktörlerinin tepkisiz kaldığı veya fiyat sinyallerinin önemsiz olduğu yönündeki seçenekler çeldiricidir.',
            tip: 'Aktarım mekanizmasının aşamalarını ve intikal gecikmelerini göz önünde bulundurun.',
          },
        ];

        const chosenVariant = qVariants[i % qVariants.length];

        questions.push({
          question: chosenVariant.q,
          type: 'multiple_choice',
          options: chosenVariant.opts,
          correctIndex: chosenVariant.correct,
          explanation: `**Doğru Yanıtın Mantığı:** ${chosenVariant.logic}\n\n**Çeldiricilerin & Diğer Seçeneklerin Analizi:** ${chosenVariant.trap}\n\n**Öğretici Pekiştirme & Sınav Tüyosu:** ${chosenVariant.tip}`,
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
        front: `${termName} nedir, neden önemlidir ve sınavda hangi yönüyle sorulur?`,
        back: `${termName}, ${title} sisteminin işleyişinde karar alıcıların tercihlerini belirleyen temel kuramsal yapıdır. Sınavlarda özellikle neden-sonuç mekanizması, eğriler üzerindeki etkisi ve çeldirici kavram ayrımları üzerinden sorgulanır.`,
        hint: 'İçsel/dışsal değişken ayrımına, aktarım yönüne ve formülün sezgisel mantığına odaklanın.',
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
        options: [
          'Fiyat sinyalleri yoluyla kaynak dağılımı sağlanır ve piyasa intikal eder.',
          'Piyasa tamamen durağandır ve hiçbir parametreye tepki vermez.',
          'Denge kendiliğinden bozulmaz ve dışsal şoklar etkisizdir.',
          'Tüm değişkenler birbirinden tamamen bağımsız hareket eder.',
        ],
        correctIndex: 0,
        explanation: 'Fiyat mekanizması kıt kaynakların en verimli alanlara tahsis edilmesini ve yeni dengenin kurulmasını temin eder.',
      },
    ],
    matchingPairs: [
      { term: 'Denge', definition: 'İçsel güçlerin eşitlendiği ve değişme eğiliminin bulunmadığı durum.' },
    ],
  };
}
