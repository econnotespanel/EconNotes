export type ArenaCategory =
  | 'mikro'
  | 'makro'
  | 'para'
  | 'maliye'
  | 'ekonometri';

export interface ArenaQuestion {
  id: string;
  category: ArenaCategory;
  difficulty: 'kolay' | 'orta' | 'zor';
  question: string;
  options: [string, string, string, string];
  correctIndex: 0 | 1 | 2 | 3;
  tip: string;
}

export interface MatchPair {
  id: string;
  deck: 'iktisatcilar' | 'kavramlar' | 'finans';
  term: string;
  definition: string;
}

export interface AcademicRank {
  id: string;
  title: string;
  minPoints: number;
  emoji: string;
  accent: string;
  tagline: string;
}

export interface SevenDayReward {
  day: number;
  label: string;
  xp: number;
  perk: string;
  isGrand?: boolean;
}

export interface DailyStudySpark {
  technique: string;
  advice: string;
  econFact: string;
}

export const ARENA_CATEGORY_META: Record<
  ArenaCategory | 'all',
  { label: string; shortLabel: string; colorClass: string }
> = {
  all: {
    label: 'Tüm Dersler',
    shortLabel: 'Tümü',
    colorClass: 'bg-primary/15 text-primary border-primary/30',
  },
  mikro: {
    label: 'Mikro İktisat',
    shortLabel: 'Mikro',
    colorClass: 'bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30',
  },
  makro: {
    label: 'Makro İktisat',
    shortLabel: 'Makro',
    colorClass: 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border-indigo-500/30',
  },
  para: {
    label: 'Para & Banka',
    shortLabel: 'Para',
    colorClass: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
  },
  maliye: {
    label: 'Maliye & Türkiye Ek.',
    shortLabel: 'Maliye',
    colorClass: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30',
  },
  ekonometri: {
    label: 'İstatistik & Ekonometri',
    shortLabel: 'Ekonometri',
    colorClass: 'bg-violet-500/15 text-violet-600 dark:text-violet-400 border-violet-500/30',
  },
};

export const ACADEMIC_RANKS: AcademicRank[] = [
  {
    id: 'caylak',
    title: 'Çaylak İktisatçı',
    minPoints: 0,
    emoji: '🌱',
    accent: 'from-slate-500 to-sky-500',
    tagline: 'İlk grafikleri çizmeye başladın.',
  },
  {
    id: 'gozlemci',
    title: 'Piyasa Gözlemcisi',
    minPoints: 150,
    emoji: '📊',
    accent: 'from-sky-500 to-cyan-400',
    tagline: 'Arz ve talebin ritmini yakaladın.',
  },
  {
    id: 'analist',
    title: 'Veri Analisti',
    minPoints: 400,
    emoji: '🧠',
    accent: 'from-blue-600 to-cyan-400',
    tagline: 'Sınav sorularında örüntüleri görüyorsun.',
  },
  {
    id: 'stratejist',
    title: 'Stratejist',
    minPoints: 800,
    emoji: '♟️',
    accent: 'from-indigo-600 to-sky-400',
    tagline: 'Nash dengesi senden sorulur.',
  },
  {
    id: 'bas_ekonomist',
    title: 'Baş Ekonomist',
    minPoints: 1400,
    emoji: '🏛️',
    accent: 'from-blue-700 via-indigo-500 to-cyan-400',
    tagline: 'Amfinin en disiplinli zihinlerinden biri.',
  },
  {
    id: 'nobel',
    title: 'Nobel Adayı',
    minPoints: 2200,
    emoji: '🏆',
    accent: 'from-amber-500 via-orange-500 to-yellow-400',
    tagline: 'Her gün gelen nadir istikrar şampiyonu.',
  },
  {
    id: 'efsane',
    title: 'EconNotes Efsanesi',
    minPoints: 3500,
    emoji: '👑',
    accent: 'from-cyan-400 via-blue-500 to-amber-400',
    tagline: 'Zirvedesin. Akademik disiplin sende alışkanlık oldu.',
  },
];

export const getRankForPoints = (points: number) => {
  let current = ACADEMIC_RANKS[0];
  let next: AcademicRank | null = ACADEMIC_RANKS[1] ?? null;

  for (let i = 0; i < ACADEMIC_RANKS.length; i++) {
    if (points >= ACADEMIC_RANKS[i].minPoints) {
      current = ACADEMIC_RANKS[i];
      next = ACADEMIC_RANKS[i + 1] ?? null;
    }
  }

  const progress = next
    ? Math.min(
        100,
        Math.max(
          0,
          Math.round(((points - current.minPoints) / (next.minPoints - current.minPoints)) * 100),
        ),
      )
    : 100;

  return {
    current,
    next,
    progress,
    pointsToNext: next ? Math.max(0, next.minPoints - points) : 0,
  };
};

export const SEVEN_DAY_REWARDS: SevenDayReward[] = [
  { day: 1, label: '1. Gün', xp: 10, perk: 'Başlangıç Kıvılcımı' },
  { day: 2, label: '2. Gün', xp: 15, perk: 'Ritim Yakalandı' },
  { day: 3, label: '3. Gün', xp: 20, perk: 'Seri Kalkanı Aktif' },
  { day: 4, label: '4. Gün', xp: 25, perk: 'Odak Hızlandırıcı' },
  { day: 5, label: '5. Gün', xp: 30, perk: 'Hafta İçi Şampiyonu' },
  { day: 6, label: '6. Gün', xp: 35, perk: 'Büyük Sandığa 1 Gün' },
  { day: 7, label: '7. Gün', xp: 50, perk: 'Büyük Haftalık Sandık', isGrand: true },
];

export const DAILY_STUDY_SPARKS: DailyStudySpark[] = [
  {
    technique: 'Feynman Tekniği',
    advice: 'Bir konuyu gerçekten anladığından emin olmak için 10 yaşındaki birine anlatır gibi sade cümlelerle sesli özetle.',
    econFact: 'Fırsat maliyeti yalnızca parayı değil, şu an ertelediğin en iyi alternatifi de kapsar.',
  },
  {
    technique: 'Aktif Hatırlama (Active Recall)',
    advice: 'Notu 3 kez okumak yerine, sayfayı kapatıp aklında kalan 3 ana kavramı yaz. Hafıza tutumu 2 kat artar.',
    econFact: 'Azalan marjinal verim çalışma saatlerinde de geçerlidir: 4 saat aralıksız yerine 4x25 dk verimi zirveye çıkarır.',
  },
  {
    technique: '2 Dakika Kuralı',
    advice: 'Başlamak zor geliyorsa kendine sadece "2 dakika bakacağım" de. Beyin harekete geçtiğinde devam etmek kolaylaşır.',
    econFact: 'Keynes "Uzun dönemde hepimiz ölüyüz" derken kısa dönem politikalarının önemini vurgulamıştır.',
  },
  {
    technique: 'Aralıklı Tekrar (Spaced Repetition)',
    advice: 'Bugün öğrendiğin zor bir kavramı yarın, 3 gün sonra ve 1 hafta sonra 2 dakikalık mini tekrarlarla kalıcı hafızaya taşı.',
    econFact: 'Giffen malı, fiyatı arttıkça talep miktarı artan istisnai bir düşük mal türüdür.',
  },
  {
    technique: 'Önce Test, Sonra Not',
    advice: 'Konuya başlamadan 5 dakikalık hızlı bir mini test çözmek, beynin kritik kavramlara radar açmasını sağlar.',
    econFact: 'Phillips Eğrisi kısa dönemde enflasyon ile işsizlik arasındaki ters yönlü ödünleşimi gösterir.',
  },
  {
    technique: 'Bloklama Yerine Karma Çalışma',
    advice: 'Tek bir dersin aynı tip sorularını 2 saat çözmek yerine, 2 farklı konudan karışık soru çözmek sınav refleksini güçlendirir.',
    econFact: 'Pareto etkinliği, kimsenin durumunu kötüleştirmeden bir başkasının durumunun iyileştirilemediği denge noktasıdır.',
  },
  {
    technique: 'Uyku Öncesi 5 Dakika Kuralı',
    advice: 'Uyumadan hemen önce 5 dakika kavram eşleştirme veya özet kartlarına bakmak, uykuda hafıza pekiştirmesini hızlandırır.',
    econFact: 'Likidite tuzağında faiz oranları o kadar düşüktür ki genişletici para politikası faizleri daha fazla düşüremez.',
  },
];

export const ARENA_QUESTIONS: ArenaQuestion[] = [
  // MİKRO İKTİSAT
  {
    id: 'm1',
    category: 'mikro',
    difficulty: 'kolay',
    question: 'Bir malın fiyatı arttığında talep miktarı da artıyorsa bu mal hangisidir?',
    options: ['Normal mal', 'Giffen malı', 'Tamamlayıcı mal', 'Zorunlu mal'],
    correctIndex: 1,
    tip: 'Giffen mallarında negatif gelir etkisi, ikame etkisinden daha güçlü olduğu için talep eğrisi pozitif eğimlidir.',
  },
  {
    id: 'm2',
    category: 'mikro',
    difficulty: 'kolay',
    question: 'Tüketicinin bir birim daha fazla tüketimden elde ettiği ek tatmine ne ad verilir?',
    options: ['Toplam fayda', 'Marjinal fayda', 'Ortalama fayda', 'Fırsat maliyeti'],
    correctIndex: 1,
    tip: 'Azalan marjinal fayda yasasına göre tüketim arttıkça her ek birimin sağladığı ek fayda düşer.',
  },
  {
    id: 'm3',
    category: 'mikro',
    difficulty: 'orta',
    question: 'Tam rekabet piyasasında uzun dönemde firmaların iktisadi kârı ne olur?',
    options: ['Pozitif ve artan', 'Sıfır (normal kâr)', 'Negatif', 'Fiyat esnekliğine göre sonsuz'],
    correctIndex: 1,
    tip: 'Serbest giriş-çıkış sayesinde aşırı kâr varsa yeni firmalar girer, fiyat düşer ve uzun dönemde iktisadi kâr sıfırlanır.',
  },
  {
    id: 'm4',
    category: 'mikro',
    difficulty: 'orta',
    question: 'Çapraz talep esnekliği negatif ise bu iki mal nasıl mallardır?',
    options: ['İkame mallar', 'Tamamlayıcı mallar', 'Bağımsız mallar', 'Düşük mallar'],
    correctIndex: 1,
    tip: 'Kahve ve şeker gibi tamamlayıcı mallarda birinin fiyatı artınca diğerinin talebi düşer (negatif işaret).',
  },
  {
    id: 'm5',
    category: 'mikro',
    difficulty: 'orta',
    question: 'Bir tekelci (monopol) firma kârını maksimize etmek için hangi koşulu sağlar?',
    options: ['P = MC', 'MR = MC', 'AR = AC', 'TR = TC'],
    correctIndex: 1,
    tip: 'Tüm piyasa türlerinde kâr maksimizasyonu kuralı MR = MC’dir; monopolde ayrıca P > MR olduğu için P > MC olur.',
  },
  {
    id: 'm6',
    category: 'mikro',
    difficulty: 'kolay',
    question: 'Gelir arttıkça talebi azalan mallara ne ad verilir?',
    options: ['Lüks mal', 'Düşük (adi) mal', 'Tamamlayıcı mal', 'Kamusal mal'],
    correctIndex: 1,
    tip: 'Gelir esnekliği sıfırdan küçük olan mallar düşük maldır; gelir artınca tüketiciler daha kaliteli ikamelere geçer.',
  },
  {
    id: 'm7',
    category: 'mikro',
    difficulty: 'zor',
    question: 'Oyun teorisinde hiçbir oyuncunun tek taraflı strateji değiştirerek kazancını artıramadığı duruma ne denir?',
    options: ['Walras dengesi', 'Nash dengesi', 'Marshall dengesi', 'Cobweb dengesi'],
    correctIndex: 1,
    tip: 'John Nash’in bu kavramı oligopol rekabeti ve mahkûmlar ikilemi sorularının vazgeçilmez anahtarıdır.',
  },
  {
    id: 'm8',
    category: 'mikro',
    difficulty: 'orta',
    question: 'Kayıtsızlık (farksızlık) eğrilerinin orijine göre dışbükey olmasının temel nedeni nedir?',
    options: [
      'Sabit fırsat maliyeti',
      'Azalan marjinal ikame oranı (MRS)',
      'Artan ölçek getirisi',
      'Fiyatların sabit olması',
    ],
    correctIndex: 1,
    tip: 'Tüketici bir maldan daha fazla sahip oldukça, ondan ek birim almak için diğer maldan vazgeçmeye razı olduğu miktar azalır.',
  },
  {
    id: 'm9',
    category: 'mikro',
    difficulty: 'orta',
    question: 'Fiyat esnekliği mutlak değerce 1’den küçük (inelastik) olan bir malda fiyat artarsa toplam hasılat nasıl değişir?',
    options: ['Azalır', 'Artar', 'Değişmez', 'Sıfıra iner'],
    correctIndex: 1,
    tip: 'İnelastik mallarda fiyat artışı satış miktarını görece az düşürdüğü için toplam hasılat (P × Q) artar.',
  },
  {
    id: 'm10',
    category: 'mikro',
    difficulty: 'zor',
    question: 'Fiyatın ortalama değişken maliyetin (AVC) altına düştüğü kısa dönem noktasına ne ad verilir?',
    options: ['Başabaş noktası', 'Kapanma noktası', 'Doyum noktası', 'Bükülme noktası'],
    correctIndex: 1,
    tip: 'P < AVC iken firma üretim yaparak değişken maliyetini bile karşılayamaz ve kısa dönemde üretimi durdurur.',
  },
  {
    id: 'm11',
    category: 'mikro',
    difficulty: 'kolay',
    question: 'Tüketicinin bir mal için ödemeye razı olduğu maksimum tutar ile fiilen ödediği fiyat arasındaki fark nedir?',
    options: ['Üretici rantı', 'Tüketici rantı', 'Dara kaybı', 'Marjinal gelir'],
    correctIndex: 1,
    tip: 'Tüketici rantı, talep eğrisinin altında ve piyasa fiyatının üstünde kalan üçgen alandır.',
  },
  {
    id: 'm12',
    category: 'mikro',
    difficulty: 'orta',
    question: 'Eş-ürün (isoquant) eğrisinin eğimini veren oran aşağıdakilerden hangisidir?',
    options: ['MRS', 'MRTS (Marjinal Teknik İkame Oranı)', 'MPC', 'MPS'],
    correctIndex: 1,
    tip: 'Üretim tarafında sermaye-emek ikamesini gösteren eğim MRTS’dir; tüketim tarafında ise MRS kullanılır.',
  },

  // MAKRO İKTİSAT
  {
    id: 'ma1',
    category: 'makro',
    difficulty: 'kolay',
    question: 'Aynı anda hem yüksek enflasyon hem de ekonomik durgunluk (yüksek işsizlik) yaşanmasına ne denir?',
    options: ['Deflasyon', 'Stagflasyon', 'Dezenflasyon', 'Hiperenflasyon'],
    correctIndex: 1,
    tip: 'Stagflasyon genellikle olumsuz arz şokları (örneğin petrol krizi) ile AS eğrisinin sola kayması sonucu ortaya çıkar.',
  },
  {
    id: 'ma2',
    category: 'makro',
    difficulty: 'orta',
    question: 'Marjinal tüketim eğilimi (MPC) 0,8 olan kapalı ve vergisiz bir ekonomide basit harcama çarpanı kaçtır?',
    options: ['2', '4', '5', '8'],
    correctIndex: 2,
    tip: 'Basit harcama çarpanı k = 1 / (1 - MPC) = 1 / (1 - 0,8) = 5 bulunur.',
  },
  {
    id: 'ma3',
    category: 'makro',
    difficulty: 'orta',
    question: 'IS-LM modelinde genişletici maliye politikası (kamu harcaması artışı) hangi eğriyi ne yöne kaydırır?',
    options: ['IS eğrisini sağa', 'IS eğrisini sola', 'LM eğrisini sağa', 'LM eğrisini sola'],
    correctIndex: 0,
    tip: 'Mal piyasası dengesini temsil eden IS eğrisi, otonom harcamalar (G, I, C₀) arttığında sağa kayar.',
  },
  {
    id: 'ma4',
    category: 'makro',
    difficulty: 'orta',
    question: 'Kamu harcamalarındaki artışın faizleri yükselterek özel sektör yatırımlarını azaltmasına ne ad verilir?',
    options: ['Çarpan etkisi', 'Dışlama (Crowding-out) etkisi', 'Hızlandıran etkisi', 'Pigou etkisi'],
    correctIndex: 1,
    tip: 'Klasik bölgede LM dik olduğu için genişletici maliye politikası tam dışlama etkisi yaratır.',
  },
  {
    id: 'ma5',
    category: 'makro',
    difficulty: 'kolay',
    question: 'Kısa dönemde enflasyon ile işsizlik arasındaki ters yönlü ilişkiyi gösteren eğri hangisidir?',
    options: ['Lorenz eğrisi', 'Laffer eğrisi', 'Phillips eğrisi', 'Engel eğrisi'],
    correctIndex: 2,
    tip: 'Uzun dönemde ise Phillips eğrisi doğal işsizlik oranında dikey kabul edilir.',
  },
  {
    id: 'ma6',
    category: 'makro',
    difficulty: 'orta',
    question: 'Bir ülkede yerleşik vatandaşların yurt içi ve yurt dışında ürettiği toplam nihai mal ve hizmet değeri hangisidir?',
    options: ['GSYH', 'GSMH (GSYİH dışı net faktör gelirleri dahil)', 'Net Yatırım', 'Ödemeler Bilançosu'],
    correctIndex: 1,
    tip: 'GSYH coğrafi sınır (yurt içi) bazlıdır; GSMH ise vatandaşlık (millî) bazlıdır.',
  },
  {
    id: 'ma7',
    category: 'makro',
    difficulty: 'zor',
    question: 'Okun Yasası hangi iki makroekonomik değişken arasındaki ilişkiyi ifade eder?',
    options: [
      'Faiz oranı ile döviz kuru',
      'İşsizlik oranı ile reel GSYH büyümesi',
      'Enflasyon ile para arzı',
      'Bütçe açığı ile cari açık',
    ],
    correctIndex: 1,
    tip: 'Okun Yasasına göre işsizliğin doğal oranın üzerine çıkması, potansiyel GSYH’den belirgin üretim kaybı yaratır.',
  },
  {
    id: 'ma8',
    category: 'makro',
    difficulty: 'orta',
    question: 'Enflasyon oranının hâlâ pozitif olmasına rağmen hızının yavaşlayarak düşmesine ne ad verilir?',
    options: ['Deflasyon', 'Dezenflasyon', 'Resesyon', 'Slumpflasyon'],
    correctIndex: 1,
    tip: 'Deflasyon fiyatlar genel düzeyinin düşmesidir (negatif enflasyon); dezenflasyon ise enflasyon hızının azalmasıdır.',
  },
  {
    id: 'ma9',
    category: 'makro',
    difficulty: 'zor',
    question: 'Solow Büyüme Modeli’nde uzun dönemde kişi başına üretimin sürekli artmasını sağlayan temel unsur nedir?',
    options: ['Nüfus artışı', 'Teknolojik ilerleme', 'Sadece tasarruf artışı', 'Kamu tüketimi'],
    correctIndex: 1,
    tip: 'Tasarruf artışı yalnızca geçiş sürecinde düzey etkisi yaratır; uzun dönemli sürekli büyüme teknolojik ilerleme ile gelir.',
  },
  {
    id: 'ma10',
    category: 'makro',
    difficulty: 'kolay',
    question: 'Bir ekonomide gelirin dağılımındaki eşitsizliği 0 ile 1 arasında ölçen katsayı hangisidir?',
    options: ['Gini katsayısı', 'Herfindahl endeksi', 'Lerner endeksi', 'Laspeyres endeksi'],
    correctIndex: 0,
    tip: 'Gini katsayısı 0’a yaklaştıkça gelir dağılımı eşitlenir, 1’e yaklaştıkça eşitsizlik artar.',
  },
  {
    id: 'ma11',
    category: 'makro',
    difficulty: 'orta',
    question: 'Kişilerin meslek değiştirirken veya yeni mezun olup iş ararken geçici olarak işsiz kalması hangi işsizlik türüdür?',
    options: ['Yapısal işsizlik', 'Friksiyonel (geçici) işsizlik', 'Konjonktürel işsizlik', 'Gizli işsizlik'],
    correctIndex: 1,
    tip: 'Friksiyonel ve yapısal işsizliğin toplamı doğal işsizlik oranını oluşturur.',
  },
  {
    id: 'ma12',
    category: 'makro',
    difficulty: 'zor',
    question: 'Bütçe açığı ile cari açığın aynı anda yükselmesi iktisat literatüründe nasıl adlandırılır?',
    options: ['İkiz açık', 'Üçlü açmaz', 'Likidite tuzağı', 'Parasal yanılsama'],
    correctIndex: 0,
    tip: 'İkiz açık hipotezine göre kamu tasarrufunun düşmesi ulusal tasarrufu azaltarak cari açığı büyütebilir.',
  },

  // PARA & BANKA
  {
    id: 'p1',
    category: 'para',
    difficulty: 'kolay',
    question: 'Merkez Bankası’nın piyasadan devlet tahvili satın alması (Açık Piyasa İşlemi) para arzını nasıl etkiler?',
    options: ['Azaltır', 'Artırır', 'Değiştirmez', 'Zorunlu karşılığı sıfırlar'],
    correctIndex: 1,
    tip: 'Merkez Bankası tahvil aldığında karşılığında piyasaya nakit (likidite) sürer; böylece para arzı genişler.',
  },
  {
    id: 'p2',
    category: 'para',
    difficulty: 'kolay',
    question: 'Fisher denklemine göre yaklaşık reel faiz oranı nasıl hesaplanır?',
    options: [
      'Nominal faiz + Enflasyon',
      'Nominal faiz − Beklenen enflasyon',
      'Enflasyon − Nominal faiz',
      'Nominal faiz × Enflasyon',
    ],
    correctIndex: 1,
    tip: 'r ≈ i − πᵉ formülü para politikası ve yatırım kararlarında temel referans noktasıdır.',
  },
  {
    id: 'p3',
    category: 'para',
    difficulty: 'orta',
    question: 'Zorunlu karşılık oranının yükseltilmesi bankaların kredi yaratma kapasitesini nasıl etkiler?',
    options: ['Artırır', 'Azaltır', 'Etkilemez', 'Mevduatı iki katına çıkarır'],
    correctIndex: 1,
    tip: 'Bankalar mevduatın daha büyük kısmını Merkez Bankası’nda tutmak zorunda kalır; para çarpanı ve kredi arzı düşer.',
  },
  {
    id: 'p4',
    category: 'para',
    difficulty: 'orta',
    question: 'Faiz oranlarının çok düşük olduğu ve ek para arzının faizleri düşüremediği duruma ne ad verilir?',
    options: ['Likidite tuzağı', 'Gresham yasası', 'Senyoraj etkisi', 'Döviz krizi'],
    correctIndex: 0,
    tip: 'Likidite tuzağında LM eğrisi yataydır; para politikası etkisiz, maliye politikası ise tam etkindir.',
  },
  {
    id: 'p5',
    category: 'para',
    difficulty: 'orta',
    question: 'Miktar Teorisi’nin temel özdeşliği olan M · V = P · Y denkleminde "V" neyi temsil eder?',
    options: ['Vergi oranı', 'Paranın dolanım hızı', 'Verimlilik katsayısı', 'Vade yapısı'],
    correctIndex: 1,
    tip: 'Klasik yaklaşımda V ve Y kısa dönemde sabit kabul edildiğinden para arzındaki (M) artış doğrudan fiyatları (P) yükseltir.',
  },
  {
    id: 'p6',
    category: 'para',
    difficulty: 'kolay',
    question: 'Devletin para basma tekelinden elde ettiği gelire ne ad verilir?',
    options: ['Reeskont', 'Senyoraj', 'Arbitraj', 'Spekülasyon'],
    correctIndex: 1,
    tip: 'Senyoraj geliri paranın nominal değeri ile basım maliyeti arasındaki farktan doğar.',
  },
  {
    id: 'p7',
    category: 'para',
    difficulty: 'orta',
    question: '"Kötü para iyi parayı piyasadan kovar" ifadesi hangi iktisat yasasıdır?',
    options: ['Say Yasası', 'Gresham Yasası', 'Walras Yasası', 'Engel Yasası'],
    correctIndex: 1,
    tip: 'İnsanlar değeri yüksek olan parayı saklayıp (istifleyip), görece değersiz olanı harcamaya eğilimlidir.',
  },
  {
    id: 'p8',
    category: 'para',
    difficulty: 'zor',
    question: 'Mundell-Fleming Üçlü Açmazı’na (Trilemma) göre bir ekonomi aynı anda hangilerini BİRDEN sağlayamaz?',
    options: [
      'Sabit kur, serbest sermaye hareketi, bağımsız para politikası',
      'Esnek kur, düşük enflasyon, büyüme',
      'Serbest ticaret, bütçe dengesi, vergi indirimi',
      'Enflasyon hedeflemesi, faiz koridoru, zorunlu karşılık',
    ],
    correctIndex: 0,
    tip: 'Üçlü açmazda bir ülke bu üç hedeften en fazla ikisini aynı anda seçebilir.',
  },
  {
    id: 'p9',
    category: 'para',
    difficulty: 'orta',
    question: 'En likit para arzı tanımı olan M1 aşağıdakilerden hangilerini kapsar?',
    options: [
      'Dolaşımdaki nakit + Vadesiz mevduat',
      'Sadece vadeli mevduat + Hazine bonosu',
      'Sadece altın rezervleri',
      'Repo + Yatırım fonları',
    ],
    correctIndex: 0,
    tip: 'M1 dar tanımlı para arzıdır; buna vadeli mevduat eklendiğinde M2 elde edilir.',
  },
  {
    id: 'p10',
    category: 'para',
    difficulty: 'zor',
    question: 'Tahvil fiyatları ile piyasa faiz oranları arasında nasıl bir ilişki vardır?',
    options: ['Doğru yönlü', 'Ters yönlü', 'İlişkisiz', 'Sadece vade sonunda doğru yönlü'],
    correctIndex: 1,
    tip: 'Piyasa faizleri yükseldiğinde eski düşük kuponlu tahvillerin cazibesi azalır ve fiyatları düşer.',
  },
  {
    id: 'p11',
    category: 'para',
    difficulty: 'orta',
    question: 'Kredi piyasasında borç alanın riskli projelere yönelmesi, sözleşme SONRASI oluşan hangi sorundur?',
    options: ['Ters seçim', 'Ahlaki tehlike (Moral hazard)', 'Bedavacılık', 'Dışsallık'],
    correctIndex: 1,
    tip: 'Sözleşme öncesi bilgi asimetrisi "ters seçim", sözleşme sonrası davranış değişikliği ise "ahlaki tehlike"dir.',
  },
  {
    id: 'p12',
    category: 'para',
    difficulty: 'kolay',
    question: 'Merkez Bankası’nın bankalara son çare olarak likidite sağlaması hangi rolüdür?',
    options: ['Maliye bakanlığı rolü', 'Son kredi mercii', 'Ticari banka rolü', 'Borsa aracı kurumu'],
    correctIndex: 1,
    tip: 'Bankacılık paniğini önlemek için Merkez Bankası finansal sistemin "Lender of Last Resort" kurumudur.',
  },

  // MALİYE & TÜRKİYE EKONOMİSİ
  {
    id: 'f1',
    category: 'maliye',
    difficulty: 'kolay',
    question: 'Vergi oranları ile toplam vergi gelirleri arasındaki ters-U ilişkisini gösteren eğri hangisidir?',
    options: ['Lorenz eğrisi', 'Laffer eğrisi', 'Kuznets eğrisi', 'J eğrisi'],
    correctIndex: 1,
    tip: 'Laffer eğrisine göre vergi oranı optimum eşiği aşarsa kayıt dışılık ve üretim düşüşü nedeniyle vergi geliri azalabilir.',
  },
  {
    id: 'f2',
    category: 'maliye',
    difficulty: 'kolay',
    question: 'Tüketimde rekabetin olmadığı ve kimsenin dışlanamadığı (ör. ulusal savunma) mallara ne denir?',
    options: ['Özel mal', 'Tam kamusal mal', 'Kulüp malı', 'İkame mal'],
    correctIndex: 1,
    tip: 'Tam kamusal mallarda dışlanamama özelliği "bedavacılık (free-rider)" sorununa yol açar.',
  },
  {
    id: 'f3',
    category: 'maliye',
    difficulty: 'orta',
    question: 'KDV ve ÖTV gibi harcama üzerinden alınan vergiler hangi vergi grubundadır?',
    options: ['Dolaysız vergiler', 'Dolaylı vergiler', 'Servet vergileri', 'Baş vergisi'],
    correctIndex: 1,
    tip: 'Dolaylı vergiler fiyatın içine yansıtılabilir ve düşük gelirli gruplar üzerinde nispeten daha ağır (tersine artan) etki yaratır.',
  },
  {
    id: 'f4',
    category: 'maliye',
    difficulty: 'orta',
    question: 'Ekonomide durgunluk başlarken yasa değişikliği gerekmeden bütçeyi dengeleyici etki yapan mekanizma nedir?',
    options: ['Otomatik istikrar sağlayıcılar', 'Açık piyasa işlemleri', 'Devalüasyon', 'Sermaye kontrolü'],
    correctIndex: 0,
    tip: 'Artan oranlı gelir vergisi ve işsizlik sigortası, parlamentodan yeni karar çıkmadan ekonomiyi yumuşatır.',
  },
  {
    id: 'f5',
    category: 'maliye',
    difficulty: 'orta',
    question: 'Türkiye ekonomisinde 24 Ocak 1980 kararlarının temel yapısal dönüşüm yönü hangisidir?',
    options: [
      'İthal ikameci kapalı yapıya geçiş',
      'İhracata dayalı dışa açık piyasa ekonomisine geçiş',
      'Merkezi planlı komuta ekonomisine geçiş',
      'Gümrük duvarlarının tamamen yükseltilmesi',
    ],
    correctIndex: 1,
    tip: '24 Ocak kararları serbest fiyat oluşumu, ihracat teşvikleri ve dışa açılma sürecinin dönüm noktasıdır.',
  },
  {
    id: 'f6',
    category: 'maliye',
    difficulty: 'zor',
    question: 'Kamu harcamalarının zamanla milli gelirden daha hızlı arttığını öne süren yasa hangisidir?',
    options: ['Wagner Yasası', 'Say Yasası', 'Okun Yasası', 'Walras Yasası'],
    correctIndex: 0,
    tip: 'Adolph Wagner’e göre sanayileşme ve kentleşme arttıkça kamu hizmetlerine olan talep gelir artışından hızlı büyür.',
  },
  {
    id: 'f7',
    category: 'maliye',
    difficulty: 'orta',
    question: 'Bir malın vergisi yasal mükellefinden fiyat mekanizmasıyla alıcıya aktarılıyorsa bu olaya ne denir?',
    options: ['Vergi kaçakçılığı', 'Vergi yansıması', 'Vergi muafiyeti', 'Vergi tarhı'],
    correctIndex: 1,
    tip: 'Talep esnekliği ne kadar düşükse (inelastikse), verginin tüketiciye yansıtılma oranı o kadar yükselir.',
  },
  {
    id: 'f8',
    category: 'maliye',
    difficulty: 'kolay',
    question: 'Ödemeler bilançosunda mal ihracatı-ithalatı, hizmetler ve birincil gelirleri kapsayan ana hesap hangisidir?',
    options: ['Cari işlemler hesabı', 'Finans hesabı', 'Rezerv varlıklar', 'Net hata ve noksan'],
    correctIndex: 0,
    tip: 'Dış ticaret dengesi + turizm/taşımacılık gibi hizmetler cari işlemler hesabının omurgasını oluşturur.',
  },
  {
    id: 'f9',
    category: 'maliye',
    difficulty: 'zor',
    question: 'Negatif dışsallık (örneğin çevre kirliliği) yaratan üretimi toplumsal maliyete eşitlemek için uygulanan vergi nedir?',
    options: ['Pigou vergisi', 'Tobin vergisi', 'Gümrük vergisi', 'Damga vergisi'],
    correctIndex: 0,
    tip: 'Arthur Pigou, marjinal dışsal zarar kadar vergi koyarak piyasa başarısızlığının içselleştirilmesini önermiştir.',
  },
  {
    id: 'f10',
    category: 'maliye',
    difficulty: 'orta',
    question: 'Kısa vadeli spekülatif döviz işlemlerini caydırmak amacıyla önerilen işlem vergisine ne ad verilir?',
    options: ['Pigou vergisi', 'Tobin vergisi', 'Kurumlar vergisi', 'Emlak vergisi'],
    correctIndex: 1,
    tip: 'Nobel ödüllü James Tobin, uluslararası sıcak para dalgalanmalarını yavaşlatmak için küçük oranlı döviz işlem vergisi önermiştir.',
  },
  {
    id: 'f11',
    category: 'maliye',
    difficulty: 'orta',
    question: 'Türkiye’nin Avrupa Birliği ile 1996 yılında yürürlüğe giren ekonomik entegrasyon aşaması hangisidir?',
    options: ['Ekonomik ve Parasal Birlik', 'Gümrük Birliği', 'Siyasi Birlik', 'Serbest Dolaşım Birliği'],
    correctIndex: 1,
    tip: 'Gümrük Birliği sanayi ürünleri ve işlenmiş tarım ürünlerinde ortak gümrük tarifesini kapsar.',
  },
  {
    id: 'f12',
    category: 'maliye',
    difficulty: 'zor',
    question: 'Faiz dışı fazla, devlet bütçesinde neyi ifade eder?',
    options: [
      'Vergi gelirlerinin toplam borçtan büyük olması',
      'Faiz harcamaları hariç tutulduğunda bütçe gelirlerinin giderlerden büyük olması',
      'Sadece merkez bankası kârının artması',
      'İhracatın ithalattan fazla olması',
    ],
    correctIndex: 1,
    tip: 'Faiz dışı denge, mali disiplinin ve borç sürdürülebilirliğinin temel göstergesidir.',
  },

  // İSTATİSTİK & EKONOMETRİ
  {
    id: 'e1',
    category: 'ekonometri',
    difficulty: 'kolay',
    question: 'Regresyon modelinde bağımsız değişkenlerin bağımlı değişkendeki değişimin yüzde kaçını açıkladığını gösteren ölçü nedir?',
    options: ['p-değeri', 'R² (Belirlilik katsayısı)', 'Durbin-Watson', 'Standart sapma'],
    correctIndex: 1,
    tip: 'R² 0 ile 1 arasında değer alır; çoklu regresyonda gereksiz değişken eklemeyi cezalandırmak için Düzeltilmiş R² izlenir.',
  },
  {
    id: 'e2',
    category: 'ekonometri',
    difficulty: 'orta',
    question: 'Hata teriminin varyansının gözlemler boyunca sabit olmamasına ne ad verilir?',
    options: ['Otokorelasyon', 'Değişen varyans (Heteroskedastisite)', 'Çoklu doğrusal bağlantı', 'Durağanlık'],
    correctIndex: 1,
    tip: 'Değişen varyans EKK tahmincilerini sapmalı yapmaz ama standart hataları bozarak t ve F testlerini geçersiz kılar.',
  },
  {
    id: 'e3',
    category: 'ekonometri',
    difficulty: 'orta',
    question: 'Zaman serisi modellerinde ardışık hata terimlerinin birbiriyle ilişkili olması (otokorelasyon) hangi testle sınanır?',
    options: ['Durbin-Watson testi', 'White testi', 'VIF testi', 'Jarque-Bera testi'],
    correctIndex: 0,
    tip: 'Durbin-Watson istatistiğinin 2’ye yakın olması birinci dereceden otokorelasyon olmadığını gösterir.',
  },
  {
    id: 'e4',
    category: 'ekonometri',
    difficulty: 'kolay',
    question: 'Bir hipotez testinde p-değeri 0,01 ve anlamlılık düzeyi α = 0,05 ise karar ne olur?',
    options: [
      'H₀ kabul edilir (reddedilemez)',
      'H₀ reddedilir (istatistiksel olarak anlamlı)',
      'Örneklem silinir',
      'R² sıfır olur',
    ],
    correctIndex: 1,
    tip: 'Kısa sınav kuralı: "p küçükse α’dan, H₀ gider hemen!" (p < α → H₀ red).',
  },
  {
    id: 'e5',
    category: 'ekonometri',
    difficulty: 'orta',
    question: 'Açıklayıcı (bağımsız) değişkenler arasında yüksek doğrusal ilişki bulunmasına ne ad verilir?',
    options: ['Çoklu doğrusal bağlantı (Multicollinearity)', 'Otokorelasyon', 'Normallik', 'Eşbütünleşme'],
    correctIndex: 0,
    tip: 'VIF (Varyans Büyütme Faktörü) 10’un üzerindeyse ciddi çoklu doğrusal bağlantı sinyali verir.',
  },
  {
    id: 'e6',
    category: 'ekonometri',
    difficulty: 'zor',
    question: 'Gauss-Markov Teoremi’ne göre klasik varsayımlar sağlandığında EKK (OLS) tahmincileri hangi özelliğe sahiptir?',
    options: ['BLUE (En İyi Doğrusal Sapmasız)', 'Sadece tutarlı', 'Sapmalı ama etkin', 'Maksimum varyanslı'],
    correctIndex: 0,
    tip: 'BLUE = Best Linear Unbiased Estimator; yani doğrusal ve sapmasız tüm tahminciler içinde en küçük varyansa sahiptir.',
  },
  {
    id: 'e7',
    category: 'ekonometri',
    difficulty: 'kolay',
    question: 'Aykırı (çok uç) değerlerden EN AZ etkilenen merkezi eğilim ölçüsü hangisidir?',
    options: ['Aritmetik ortalama', 'Medyan (Ortanca)', 'Ağırlıklı ortalama', 'Geometrik ortalama'],
    correctIndex: 1,
    tip: 'Gelir dağılımı gibi çarpık verilerde ortalama uç değerlerle şişerken medyan gerçek ortadaki kişiyi yansıtır.',
  },
  {
    id: 'e8',
    category: 'ekonometri',
    difficulty: 'orta',
    question: 'Doğru olan sıfır hipotezini (H₀) yanlışlıkla reddetmek hangi tür hatadır?',
    options: ['I. Tip Hata (α)', 'II. Tip Hata (β)', 'Ölçüm hatası', 'Model tanımlama hatası'],
    correctIndex: 0,
    tip: 'Suçsuz birini suçlu bulmak I. Tip Hata (α), suçluyu serbest bırakmak II. Tip Hata (β) benzetmesiyle kolayca hatırlanır.',
  },
  {
    id: 'e9',
    category: 'ekonometri',
    difficulty: 'zor',
    question: 'Zaman serisinin durağan olup olmadığını (birim kök varlığını) test etmek için en sık kullanılan test hangisidir?',
    options: ['ADF (Genişletilmiş Dickey-Fuller)', 'Goldfeld-Quandt', 'Hausman testi', 'Chow testi'],
    correctIndex: 0,
    tip: 'Durağan olmayan serilerle kurulan regresyonlarda "sahte regresyon" (yüksek R² ama anlamsız ilişki) riski doğar.',
  },
  {
    id: 'e10',
    category: 'ekonometri',
    difficulty: 'orta',
    question: 'Hata terimlerinin normal dağılıp dağılmadığını çarpıklık ve basıklık üzerinden sınayan test hangisidir?',
    options: ['Jarque-Bera testi', 'Durbin-Watson testi', 'Breusch-Godfrey testi', 'Granger testi'],
    correctIndex: 0,
    tip: 'Jarque-Bera testinde H₀ "hata terimleri normal dağılmaktadır" şeklindedir.',
  },
  {
    id: 'e11',
    category: 'ekonometri',
    difficulty: 'kolay',
    question: 'İki değişken arasındaki doğrusal ilişkinin yönünü ve şiddetini −1 ile +1 arasında ölçen değer hangisidir?',
    options: ['Korelasyon katsayısı (r)', 'Varyans', 'Ki-kare', 'F istatistiği'],
    correctIndex: 0,
    tip: 'Unutma: Korelasyon nedensellik demek değildir; yalnızca birlikte hareketin doğrusal derecesini ölçer.',
  },
  {
    id: 'e12',
    category: 'ekonometri',
    difficulty: 'zor',
    question: 'Panel veri analizinde Sabit Etkiler ile Tesadüfi Etkiler modelleri arasında seçim yapmak için hangi test kullanılır?',
    options: ['Hausman testi', 'White testi', 'Park testi', 'Ramsey RESET'],
    correctIndex: 0,
    tip: 'Hausman testinde p < 0,05 ise H₀ reddedilir ve Sabit Etkiler (Fixed Effects) modeli tercih edilir.',
  },
];

export const MATCH_PAIRS: MatchPair[] = [
  // İKTİSATÇILAR & KURAMLAR
  { id: 'ik1', deck: 'iktisatcilar', term: 'Adam Smith', definition: 'Görünmez El & Ulusların Zenginliği' },
  { id: 'ik2', deck: 'iktisatcilar', term: 'John M. Keynes', definition: 'Efektif Talep & Aktif Maliye Politikası' },
  { id: 'ik3', deck: 'iktisatcilar', term: 'David Ricardo', definition: 'Karşılaştırmalı Üstünlükler Teorisi' },
  { id: 'ik4', deck: 'iktisatcilar', term: 'Milton Friedman', definition: 'Monetarizm & Sürekli Gelir Hipotezi' },
  { id: 'ik5', deck: 'iktisatcilar', term: 'Joseph Schumpeter', definition: 'Yaratıcı Yıkım & Girişimci İnovasyonu' },
  { id: 'ik6', deck: 'iktisatcilar', term: 'John Nash', definition: 'Oyun Teorisi & Stratejik Denge' },
  { id: 'ik7', deck: 'iktisatcilar', term: 'Vilfredo Pareto', definition: 'Kaynak Dağılımında Etkinlik Kriteri' },
  { id: 'ik8', deck: 'iktisatcilar', term: 'Arthur Pigou', definition: 'Dışsallıkları Düzelten Çevre Vergisi' },
  { id: 'ik9', deck: 'iktisatcilar', term: 'A. W. Phillips', definition: 'Enflasyon-İşsizlik Ödünleşim Eğrisi' },
  { id: 'ik10', deck: 'iktisatcilar', term: 'Robert Solow', definition: 'Neoklasik Büyüme & Teknoloji Faktörü' },
  { id: 'ik11', deck: 'iktisatcilar', term: 'Arthur Laffer', definition: 'Vergi Oranı – Vergi Geliri Ters-U Eğrisi' },
  { id: 'ik12', deck: 'iktisatcilar', term: 'Irving Fisher', definition: 'Nominal-Reel Faiz & Mübadele Denklemi' },

  // MİKRO & MAKRO KAVRAMLAR
  { id: 'km1', deck: 'kavramlar', term: 'Giffen Malı', definition: 'Fiyatı arttıkça talebi artan istisnai mal' },
  { id: 'km2', deck: 'kavramlar', term: 'Stagflasyon', definition: 'Durgunluk + yüksek enflasyonun bir arada olması' },
  { id: 'km3', deck: 'kavramlar', term: 'Dışlama Etkisi', definition: 'Kamu harcamasının faiz yoluyla özel yatırımı azaltması' },
  { id: 'km4', deck: 'kavramlar', term: 'Likidite Tuzağı', definition: 'Çok düşük faizde para politikasının etkisizleşmesi' },
  { id: 'km5', deck: 'kavramlar', term: 'Gini Katsayısı', definition: 'Gelir dağılımı eşitsizliğini 0-1 arası ölçen endeks' },
  { id: 'km6', deck: 'kavramlar', term: 'Fırsat Maliyeti', definition: 'Vazgeçilen en iyi ikinci alternatifin değeri' },
  { id: 'km7', deck: 'kavramlar', term: 'Tüketici Rantı', definition: 'Ödemeye razı olunan tutar ile piyasa fiyatı farkı' },
  { id: 'km8', deck: 'kavramlar', term: 'Dezenflasyon', definition: 'Enflasyon artış hızının yavaşlayarak düşmesi' },
  { id: 'km9', deck: 'kavramlar', term: 'İkiz Açık', definition: 'Bütçe açığı ile cari açığın eşzamanlı artması' },
  { id: 'km10', deck: 'kavramlar', term: 'Okun Yasası', definition: 'İşsizlik artışı ile reel GSYH kaybı ilişkisi' },
  { id: 'km11', deck: 'kavramlar', term: 'Kapanma Noktası', definition: 'Fiyatın ortalama değişken maliyetin altına düşmesi' },
  { id: 'km12', deck: 'kavramlar', term: 'Ahlaki Tehlike', definition: 'Sözleşme sonrası taraflardan birinin riskli davranması' },

  // FİNANS, MALİYE & EKONOMETRİ
  { id: 'fn1', deck: 'finans', term: 'R² (Belirlilik)', definition: 'Modelin bağımlı değişkendeki değişimi açıklama oranı' },
  { id: 'fn2', deck: 'finans', term: 'Senyoraj', definition: 'Devletin para basma tekelinden elde ettiği gelir' },
  { id: 'fn3', deck: 'finans', term: 'Zorunlu Karşılık', definition: 'Bankaların mevduattan Merkez Bankasında tuttuğu pay' },
  { id: 'fn4', deck: 'finans', term: 'Durbin-Watson', definition: 'Hata terimlerinde otokorelasyon sınama testi' },
  { id: 'fn5', deck: 'finans', term: 'Heteroskedastisite', definition: 'Hata terimi varyansının sabit olmaması durumu' },
  { id: 'fn6', deck: 'finans', term: 'Hausman Testi', definition: 'Panel veride Sabit vs. Tesadüfi Etkiler seçimi' },
  { id: 'fn7', deck: 'finans', term: 'BLUE Özelliği', definition: 'En iyi doğrusal ve sapmasız EKK tahmincisi' },
  { id: 'fn8', deck: 'finans', term: 'Tobin Vergisi', definition: 'Kısa vadeli spekülatif döviz işlemlerine önerilen vergi' },
  { id: 'fn9', deck: 'finans', term: 'ADF Testi', definition: 'Zaman serisinde birim kök / durağanlık sınaması' },
  { id: 'fn10', deck: 'finans', term: 'VIF Değeri', definition: 'Çoklu doğrusal bağlantı şiddetini ölçen katsayı' },
  { id: 'fn11', deck: 'finans', term: 'Faiz Dışı Fazla', definition: 'Faiz ödemeleri hariç bütçe gelir fazlası' },
  { id: 'fn12', deck: 'finans', term: 'Vergi Yansıması', definition: 'Vergi yükünün fiyat yoluyla başkasına aktarılması' },
];

export const MATCH_DECK_META: Record<
  MatchPair['deck'],
  { label: string; description: string }
> = {
  iktisatcilar: {
    label: 'İktisatçılar & Kuramlar',
    description: 'Büyük düşünürleri ünlü teorileriyle hızla eşleştir.',
  },
  kavramlar: {
    label: 'Mikro & Makro Kavramlar',
    description: 'Vize ve finallerin en kritik kavramlarını refleks haline getir.',
  },
  finans: {
    label: 'Finans, Maliye & Ekonometri',
    description: 'Para politikası, vergiler ve ekonometri testlerini pekiştir.',
  },
};

/** Deterministic hash from a date string like "2026-11-19" */
const hashSeed = (seedStr: string): number => {
  let h = 2166136261;
  for (let i = 0; i < seedStr.length; i++) {
    h ^= seedStr.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
};

/** Picks 5 deterministic daily questions (1 from each category!) so every day feels fresh and balanced. */
export const getDailyBlitzQuestions = (dayKey: string): ArenaQuestion[] => {
  const categories: ArenaCategory[] = ['mikro', 'makro', 'para', 'maliye', 'ekonometri'];
  let seed = hashSeed(`econnotes-daily-blitz-${dayKey}`);

  const picked: ArenaQuestion[] = [];
  for (const cat of categories) {
    const pool = ARENA_QUESTIONS.filter((q) => q.category === cat);
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    picked.push(pool[seed % pool.length]);
  }

  // Deterministic shuffle of the 5 questions
  for (let i = picked.length - 1; i > 0; i--) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const j = seed % (i + 1);
    [picked[i], picked[j]] = [picked[j], picked[i]];
  }

  return picked;
};

/** Picks a rotating daily study tip + economics fact */
export const getDailyStudySpark = (dayKey: string): DailyStudySpark => {
  const idx = hashSeed(`spark-${dayKey}`) % DAILY_STUDY_SPARKS.length;
  return DAILY_STUDY_SPARKS[idx];
};

/** Picks a shuffled round of 4 pairs (8 tiles) for Concept Match */
export const getMatchRoundPairs = (deck: MatchPair['deck'], count = 4): MatchPair[] => {
  const pool = [...MATCH_PAIRS.filter((p) => p.deck === deck)];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count);
};
