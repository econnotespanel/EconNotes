import type { CourseDetectionConfidence } from '@/types/study';

export type CourseDomainMode = 'verbal' | 'quantitative' | 'hybrid';

export interface CourseProfile {
  id: string;
  courseName: string;
  disciplineLabel: string;
  domainMode: CourseDomainMode;
  examStyleHint: string;
  /** High-specificity phrases (title, heading, or body strongly point to this exact course) */
  strongPhrases: string[];
  /** Supporting domain terms (counted with frequency cap to prevent single-word hijacking) */
  terms: string[];
  /** Explicit filename/title aliases (ASCII-folded matched too, e.g. 'para teorisi', 'borclar hukuku') */
  titleAliases: string[];
}

export interface CourseDetectionResult {
  /** Exact detected course name, or null if uncertain and user selection is required */
  course: string | null;
  /** Broader academic discipline (faculty/field), or null if uncertain */
  discipline: string | null;
  domainMode: CourseDomainMode;
  examStyleHint: string;
  confidence: CourseDetectionConfidence;
  needsConfirmation: boolean;
  /** Top candidate course names to suggest to the user when confirming/editing */
  candidates: string[];
  /** Transparent matched evidence signals (title/heading/content matches) */
  evidence: string[];
  /** Internal top score for diagnostics/tests */
  score: number;
}

const GENERIC_COURSE_PLACEHOLDERS = new Set([
  '',
  '-',
  'genel',
  'diğer',
  'diger',
  'ders',
  'ders notu',
  'ders materyali',
  'akademik ders',
  'üniversite dersi',
  'universite dersi',
  'üniversite akademik çalışma',
  'universite akademik calisma',
  'not',
  'notlar',
  'belge',
  'materyal',
  'çalışma seti',
  'calisma seti',
  'çalışma defterim',
  'calisma defterim',
  'yeni çalışma defteri',
  'yeni calisma defteri',
  'bilinmiyor',
  'belirtilmemiş',
  'belirtilmemis',
]);

export function normalizeTurkish(input: string): string {
  return String(input || '')
    .toLocaleLowerCase('tr-TR')
    .replace(/[_/\\|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function foldTurkishToAscii(input: string): string {
  return normalizeTurkish(input)
    .replace(/ç/g, 'c')
    .replace(/ğ/g, 'g')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ş/g, 's')
    .replace(/ü/g, 'u')
    .replace(/â/g, 'a')
    .replace(/î/g, 'i')
    .replace(/û/g, 'u');
}

export function isGenericCoursePlaceholder(course?: string | null): boolean {
  if (!course) return true;
  const norm = normalizeTurkish(course);
  return norm.length < 2 || GENERIC_COURSE_PLACEHOLDERS.has(norm);
}

export const COURSE_PROFILES: CourseProfile[] = [
  // --- EKONOMİ & FİNANS ALT DALLARI (Her ders bağımsız!) ---
  {
    id: 'para_teorisi',
    courseName: 'Para Teorisi ve Politikası',
    disciplineLabel: 'Para Teorisi ve Politikası',
    domainMode: 'hybrid',
    examStyleHint:
      'Parasal aktarım mekanizmaları, para arzı-para talebi kuramları, merkez bankası araçları ve enflasyon-faiz ilişkilerini netleştir.',
    titleAliases: [
      'para teorisi',
      'para politikasi',
      'para ve banka',
      'para banka',
      'parasal iktisat',
      'merkez bankaciligi',
      'monetary theory',
      'monetary policy',
    ],
    strongPhrases: [
      'para teorisi',
      'para politikasi',
      'parasal aktarim',
      'para arzi',
      'para talebi',
      'parasal taban',
      'para carpani',
      'miktar teorisi',
      'fisher denklemi',
      'cambridge yaklasimi',
      'likidite tercihi',
      'likidite tuzagi',
      'acik piyasa islemleri',
      'zorunlu karsilik',
      'reeskont orani',
      'faiz koridoru',
      'enflasyon hedeflemesi',
      'taylor kurali',
      'baumol tobin',
      'merkez bankasi bilancosu',
      'emisyon hacmi',
      'senyoraj',
      'monetarizm',
      'kredi kanali',
    ],
    terms: [
      'merkez bankasi',
      'tcmb',
      'politika faizi',
      'emisyon',
      'rezerv',
      'mevduat',
      'banknot',
      'enflasyon',
      'deflasyon',
      'likidite',
      'spekulatif',
      'ihtiyat gudusu',
      'islem gudusu',
      'friedman',
      'velosite',
      'dolanim hizi',
      'm1',
      'm2',
      'm3',
      'repo',
      'sterilizasyon',
      'fiyat istikrari',
    ],
  },
  {
    id: 'mikro_iktisat',
    courseName: 'Mikro İktisat',
    disciplineLabel: 'Mikro İktisat',
    domainMode: 'hybrid',
    examStyleHint:
      'Tüketici-üretici denge koşullarını, esneklik formüllerini, piyasa türlerini (tam rekabet, monopol, oligopol) ve grafiksel kaymaları netleştir.',
    titleAliases: [
      'mikro iktisat',
      'mikroekonomi',
      'mikro ekonomi',
      'microeconomics',
      'fiyat teorisi',
    ],
    strongPhrases: [
      'mikro iktisat',
      'mikroekonomi',
      'tuketici teorisi',
      'tuketici dengesi',
      'uretici dengesi',
      'kayitsizlik egrisi',
      'farksizlik egrisi',
      'butce kisiti',
      'marjinal ikame orani',
      'marjinal fayda',
      'es urun egrisi',
      'es maliyet',
      'talep esnekligi',
      'arz esnekligi',
      'tam rekabet',
      'monopolcu rekabet',
      'oligopol',
      'cournot',
      'bertrand',
      'stackelberg',
      'nash dengesi',
      'oyun teorisi',
      'pareto etkinligi',
      'slutsky denklemi',
      'gelir ve ikame etkisi',
      'engel egrisi',
      'giffen mali',
      'tuketici ranti',
      'uretici ranti',
      'marjinal maliyet',
      'cobb douglas',
    ],
    terms: [
      'monopol',
      'tekel',
      'esneklik',
      'fayda fonksiyonu',
      'uretim fonksiyonu',
      'olcege gore getiri',
      'azalan verimler',
      'ortalama maliyet',
      'sabit maliyet',
      'degisken maliyet',
      'arz egrisi',
      'talep egrisi',
      'piyasa dengesi',
      'mrs',
      'mrts',
      'mc',
      'mr',
      'atc',
      'avc',
      'duopol',
      'kartel',
      'fiyat farklilastirmasi',
    ],
  },
  {
    id: 'makro_iktisat',
    courseName: 'Makro İktisat',
    disciplineLabel: 'Makro İktisat',
    domainMode: 'hybrid',
    examStyleHint:
      'Milli gelir özdeşliklerini, IS-LM / AD-AS dengesini, büyüme modellerini ve maliye-para politikası etkilerini adım adım açıkla.',
    titleAliases: [
      'makro iktisat',
      'makroekonomi',
      'makro ekonomi',
      'macroeconomics',
      'iktisadi buyume',
    ],
    strongPhrases: [
      'makro iktisat',
      'makroekonomi',
      'milli gelir',
      'gayrisafi yurtici hasila',
      'is-lm',
      'is lm',
      'ad-as',
      'ad as',
      'toplam talep',
      'toplam arz',
      'phillips egrisi',
      'okun yasasi',
      'solow buyume',
      'solow modeli',
      'keynesyen capraz',
      'tuketim fonksiyonu',
      'marjinal tuketim egilimi',
      'dislama etkisi',
      'crowding out',
      'mundell fleming',
      'dogal issizlik',
      'harrod domar',
      'otonom harcama',
      'harcama carpani',
    ],
    terms: [
      'gsyh',
      'gsyih',
      'gsmh',
      'issizlik',
      'stagflasyon',
      'resesyon',
      'konjonktur',
      'tasarruf fonksiyonu',
      'yatirim harcamasi',
      'cari acik',
      'odemeler bilancosu',
      'keynes',
      'klasik model',
      'yeni keynesyen',
      'rasyonel beklentiler',
      'sermaye birikimi',
      'duragan durum',
      'deflator',
    ],
  },
  {
    id: 'ekonometri',
    courseName: 'Ekonometri',
    disciplineLabel: 'Ekonometri',
    domainMode: 'quantitative',
    examStyleHint:
      'Regresyon varsayımlarını (Gauss-Markov/BLUE), sapma-tutarlılık koşullarını, tanısal testleri ve ampirik model yorumunu açıkla.',
    titleAliases: [
      'ekonometri',
      'econometrics',
      'zaman serileri analizi',
      'zaman serisi ekonometrisi',
      'panel veri ekonometrisi',
    ],
    strongPhrases: [
      'ekonometri',
      'gauss markov',
      'en kucuk kareler',
      'coklu dogrusal baglanti',
      'multicollinearity',
      'degisen varyans',
      'heteroskedastisite',
      'heteroscedasticity',
      'otokorelasyon',
      'durbin watson',
      'breusch pagan',
      'breusch godfrey',
      'white testi',
      'arac degisken',
      'iki asamali en kucuk kareler',
      '2sls',
      'birim kok',
      'adf testi',
      'dickey fuller',
      'esbutunlesme',
      'cointegration',
      'granger nedensellik',
      'panel veri',
      'sabit etkiler',
      'rassal etkiler',
      'hausman testi',
      'probit',
      'logit',
      'kukla degisken',
      'icsellik sorunu',
    ],
    terms: [
      'ekk',
      'ols',
      'blue',
      'hata terimi',
      'kalinti',
      'belirlilik katsayisi',
      'r-kare',
      'vif',
      'duraganlik',
      'arima',
      'var modeli',
      'arch',
      'garch',
      'sapmasizlik',
      'tutarlilik',
      'etkinlik',
      't-istatistigi',
      'f-istatistigi',
    ],
  },
  {
    id: 'istatistik',
    courseName: 'İstatistik ve Olasılık',
    disciplineLabel: 'Matematik & İstatistik',
    domainMode: 'quantitative',
    examStyleHint:
      'Olasılık kurallarını, dağılım özelliklerini, hipotez testi adımlarını, formüllerdeki her değişkeni ve karar kriterlerini eksiksiz göster.',
    titleAliases: [
      'istatistik',
      'olasilik ve istatistik',
      'olasilik',
      'uygulamali istatistik',
      'betimsel istatistik',
      'cikarimsal istatistik',
      'statistics',
      'probability',
    ],
    strongPhrases: [
      'istatistik',
      'olasilik teorisi',
      'kosullu olasilik',
      'bayes teoremi',
      'rassal degisken',
      'rastgele degisken',
      'normal dagilim',
      'standart normal',
      'binom dagilimi',
      'poisson dagilimi',
      'ustel dagilim',
      'ki kare',
      'ki-kare',
      't dagilimi',
      'f dagilimi',
      'merkezi limit teoremi',
      'hipotez testi',
      'sifir hipotezi',
      'alternatif hipotez',
      'guven araligi',
      'anlamlilik duzeyi',
      'p degeri',
      'p-degeri',
      'varyans analizi',
      'anova',
      'tip i hata',
      'tip ii hata',
      'ornekleme dagilimi',
      'merkezi egilim olculeri',
      'dagilim olculeri',
      'korelasyon katsayisi',
      'pearson korelasyon',
      'spearman',
      'frekans dagilimi',
    ],
    terms: [
      'olasilik',
      'aritmetik ortalama',
      'medyan',
      'mod',
      'standart sapma',
      'varyans',
      'kovaryans',
      'korelasyon',
      'orneklem',
      'anakutle',
      'populas',
      'beklenen deger',
      'z tablosu',
      'z skoru',
      'histogram',
      'kutu grafigi',
      'carpiklik',
      'basiklik',
      'ceyreklik',
      'kombinasyon',
      'permutasyon',
      'regresyon',
      'olasilik yogunluk',
      'kumulatif dagilim',
      'h0',
      'h1',
    ],
  },
  {
    id: 'kamu_maliyesi',
    courseName: 'Kamu Maliyesi',
    disciplineLabel: 'Kamu Maliyesi',
    domainMode: 'hybrid',
    examStyleHint:
      'Kamu harcamaları, vergi teorisi, bütçe ilkeleri, vergi yansıması ve maliye politikası araçlarını ayrım noktalarıyla açıkla.',
    titleAliases: [
      'kamu maliyesi',
      'maliye',
      'vergi hukuku',
      'vergi teorisi',
      'maliye politikasi',
      'butce hukuku',
      'public finance',
    ],
    strongPhrases: [
      'kamu maliyesi',
      'vergi teorisi',
      'vergi yansimasi',
      'kamu harcamalari',
      'kamu gelirleri',
      'butce hakki',
      'butce ilkeleri',
      'devlet borclanmasi',
      'laffer egrisi',
      'wagner kanunu',
      'kamusal mal',
      'yari kamusal mal',
      'bedavacilik sorunu',
      'mali suruklenme',
      'vergi tarhi',
      'vergi tebligi',
      'vergi tahakkuku',
      'vergi tahsili',
      'maliye politikasi',
      'ic borclanma',
      'dis borclanma',
    ],
    terms: [
      'vergi',
      'mukellef',
      'matrah',
      'tarife',
      'artan oranli',
      'gelir vergisi',
      'kurumlar vergisi',
      'kdv',
      'otv',
      'butce acigi',
      'faiz disi fazla',
      'hazine bonosu',
      'konsolidasyon',
      'konversiyon',
      'dissallik',
      'pigou vergisi',
      'sayistay',
    ],
  },
  {
    id: 'uluslararasi_iktisat',
    courseName: 'Uluslararası İktisat',
    disciplineLabel: 'Uluslararası İktisat',
    domainMode: 'hybrid',
    examStyleHint:
      'Dış ticaret teorilerini (Ricardo, Heckscher-Ohlin), tarife-kota etkilerini ve döviz kuru mekanizmalarını karşılaştırmalı açıkla.',
    titleAliases: [
      'uluslararasi iktisat',
      'uluslararasi ticaret',
      'dis ticaret teorisi',
      'international economics',
    ],
    strongPhrases: [
      'uluslararasi iktisat',
      'karsilastirmali ustunluk',
      'mutlak ustunluk',
      'heckscher ohlin',
      'stolper samuelson',
      'rybczynski',
      'leontief paradoksu',
      'gumruk tarifesi',
      'ithalat kotasi',
      'dis ticaret hadleri',
      'satin alma gucu paritesi',
      'faiz paritesi',
      'marshall lerner',
      'j egrisi',
      'doviz kuru rejimi',
      'ekonomik entegrasyon',
      'gumruk birligi',
    ],
    terms: [
      'ihracat',
      'ithalat',
      'damping',
      'devaluasyon',
      'revaluasyon',
      'doviz kuru',
      'faktor donatimi',
      'endustri ici ticaret',
      'serbest ticaret bolgesi',
      'ortak pazar',
      'dunya ticaret orgutu',
    ],
  },
  {
    id: 'iktisat_tarihi',
    courseName: 'İktisat Tarihi',
    disciplineLabel: 'Tarih & İktisat Tarihi',
    domainMode: 'verbal',
    examStyleHint:
      'Tarihsel dönemleri, iktisadi düşünce okullarını, kurumsal dönüşümleri ve neden-sonuç zincirini kronolojik ve karşılaştırmalı sun.',
    titleAliases: [
      'iktisat tarihi',
      'iktisadi dusunceler tarihi',
      'ekonomi tarihi',
      'turkiye ekonomisi tarihi',
      'economic history',
    ],
    strongPhrases: [
      'iktisat tarihi',
      'iktisadi dusunceler',
      'merkantilizm',
      'fizyokrasi',
      'sanayi devrimi',
      'klasik iktisat',
      'adam smith',
      'uluslarin zenginligi',
      'david ricardo',
      'osmanli iktisat',
      'timar sistemi',
      'iltizam',
      'lonca sistemi',
      'kapitulasyonlar',
      'izmir iktisat kongresi',
      'devletcilik',
      'bretton woods',
      '1929 buyuk buhrani',
    ],
    terms: [
      'feodalizm',
      'kapitalizm',
      'lonca',
      'vakif',
      'narh',
      'iaşecilik',
      'gelenekcilik',
      'fiskalizm',
      'duyunu umumiye',
      'baltalimani',
      'tanzimat',
      'proletarya',
      'buhar makinesi',
      'tarim devrimi',
    ],
  },
  // --- HUKUK DALLARI ---
  {
    id: 'anayasa_hukuku',
    courseName: 'Anayasa Hukuku',
    disciplineLabel: 'Hukuk',
    domainMode: 'verbal',
    examStyleHint:
      'Anayasal ilkeleri, normlar hiyerarşisini, yasama-yürütme-yargı yetkilerini ve Anayasa Mahkemesi denetim yollarını netleştir.',
    titleAliases: ['anayasa hukuku', 'anayasa', 'constitutional law'],
    strongPhrases: [
      'anayasa hukuku',
      'normlar hiyerarsisi',
      'anayasa mahkemesi',
      'kuvvetler ayriligi',
      'hukuk devleti',
      'temel hak ve hurriyetler',
      'temel hak ve ozgurlukler',
      'yasama dokunulmazligi',
      'cumhurbaskanligi kararnamesi',
      'olaganustu hal',
      'bireysel basvuru',
      'iptal davasi',
      'itiraz yolu',
      'somut norm denetimi',
      'soyut norm denetimi',
      'kurucu iktidar',
      'parlamenter sistem',
      'baskanlik sistemi',
      '1982 anayasasi',
    ],
    terms: [
      'anayasa',
      'yasama',
      'yurutme',
      'yargi',
      'tbmm',
      'egemenlik',
      'laiklik',
      'sosyal devlet',
      'kanun',
      'meclis',
      'secim',
      'vekil',
      'olcululuk',
      'ozune dokunmama',
    ],
  },
  {
    id: 'borclar_hukuku',
    courseName: 'Borçlar Hukuku',
    disciplineLabel: 'Hukuk',
    domainMode: 'verbal',
    examStyleHint:
      'Borç kaynaklarını (sözleşme, haksız fiil, sebepsiz zenginleşme), TBK maddelerini, unsurları, süreleri ve pratik olay çözümünü vurgula.',
    titleAliases: ['borclar hukuku', 'borclar genel', 'borclar ozel', 'law of obligations'],
    strongPhrases: [
      'borclar hukuku',
      'turk borclar kanunu',
      'haksiz fiil',
      'sebepsiz zenginlesme',
      'borc iliskisi',
      'sozlesmenin kurulmasi',
      'icap ve kabul',
      'oneri ve kabul',
      'irade bozuklugu',
      'yanilma aldatma korkutma',
      'gabin',
      'asiri yararlanma',
      'muvazaa',
      'borclunun temerrudu',
      'alacaklinin temerrudu',
      'ifa imkansizligi',
      'kusursuz sorumluluk',
      'vekaletsiz is gorme',
      'muteselsil borcluluk',
      'cezai sart',
      'alacagin temliki',
      'borcun ustlenilmesi',
    ],
    terms: [
      'tbk',
      'edim',
      'borclu',
      'alacakli',
      'sozlesme',
      'ifa',
      'temerrut',
      'tazminat',
      'kusur',
      'illiyet bagi',
      'zamanasimi',
      'butlan',
      'iptal edilebilirlik',
      'kefalet',
      'kira sozlesmesi',
      'satis sozlesmesi',
      'eser sozlesmesi',
      'vekalet',
      'ibra',
      'takas',
      'yenileme',
    ],
  },
  {
    id: 'medeni_hukuk',
    courseName: 'Medeni Hukuk',
    disciplineLabel: 'Hukuk',
    domainMode: 'verbal',
    examStyleHint:
      'TMK ilkelerini, hak-fiil ehliyeti ayrımlarını, kişilik/aile/miras/eşya hukuku kavramlarını ve iyiniyet-dürüstlük kurallarını açıkla.',
    titleAliases: [
      'medeni hukuk',
      'kisiler hukuku',
      'aile hukuku',
      'miras hukuku',
      'esya hukuku',
      'civil law',
    ],
    strongPhrases: [
      'medeni hukuk',
      'turk medeni kanunu',
      'hak ehliyeti',
      'fiil ehliyeti',
      'ayirt etme gucu',
      'erginlik',
      'kisitlilik',
      'kisilik haklari',
      'tuzel kisilik',
      'gaiplik',
      'durustluk kurali',
      'iyiniyet ilkesi',
      'hakkin kotuye kullanilmasi',
      'zilyetlik',
      'tapu sicili',
      'ayni haklar',
      'mulkiyet hakki',
      'sinirli ayni hak',
      'sakli pay',
      'yasal mirasci',
      'vasiyetname',
      'vesayet',
    ],
    terms: [
      'tmk',
      'gercek kisi',
      'tuzel kisi',
      'dernek',
      'vakif',
      'ikametgah',
      'yerlesim yeri',
      'hisimlik',
      'nisanlanma',
      'evlenme',
      'bosanma',
      'velayet',
      'nafaka',
      'tereke',
      'miras',
      'ipotek',
      'rehin',
      'irtifak',
      'karine',
    ],
  },
  {
    id: 'ceza_hukuku',
    courseName: 'Ceza Hukuku',
    disciplineLabel: 'Hukuk',
    domainMode: 'verbal',
    examStyleHint:
      'Suçun maddi ve manevi unsurlarını, hukuka uygunluk sebeplerini, kusurluluğu, teşebbüs-iştirak-içtima kurallarını TCK maddeleriyle açıkla.',
    titleAliases: ['ceza hukuku', 'ceza genel', 'ceza ozel', 'criminal law'],
    strongPhrases: [
      'ceza hukuku',
      'turk ceza kanunu',
      'sucun unsurlari',
      'kanunilik ilkesi',
      'sucta ve cezada kanunilik',
      'mesru savunma',
      'zorunluluk hali',
      'hukuka uygunluk',
      'hukuka aykirilik',
      'olasi kast',
      'bilincli taksir',
      'kusurluluk',
      'suca tesebbus',
      'gonullu vazgecme',
      'suca istirak',
      'azmettirme',
      'suclarin ictimai',
      'zincirleme suc',
      'fikri ictima',
      'haksiz tahrik',
    ],
    terms: [
      'tck',
      'cmk',
      'fail',
      'magdur',
      'kast',
      'taksir',
      'tipiklik',
      'maddi unsur',
      'manevi unsur',
      'ceza sorumlulugu',
      'hapis cezasi',
      'adli para cezasi',
      'guvenlik tedbiri',
      'erteleme',
      'kovusturma',
      'sorusturma',
      'beraat',
    ],
  },
  {
    id: 'idare_hukuku',
    courseName: 'İdare Hukuku',
    disciplineLabel: 'Hukuk',
    domainMode: 'verbal',
    examStyleHint:
      'İdari teşkilat, idari işlemin unsurları, idari sözleşmeler, kamu hizmeti, idari vesayet/hiyerarşi ve Danıştay yargı yollarını netleştir.',
    titleAliases: ['idare hukuku', 'idari yargi', 'administrative law'],
    strongPhrases: [
      'idare hukuku',
      'idari islem',
      'idari sozlesme',
      'idari vesayet',
      'kamu hizmeti',
      'kamulastirma',
      'tam yargi davasi',
      'yurutmenin durdurulmasi',
      'yetki gaspi',
      'fonksiyon gaspi',
      'hizmet kusuru',
      'idarenin sorumlulugu',
      'merkezden yonetim',
      'yerinden yonetim',
      'kolluk faaliyeti',
      'idari yaptirim',
    ],
    terms: [
      'danistay',
      'iyuk',
      'hiyerarsi',
      'idare mahkemesi',
      'kamu tuzel kisisi',
      'memur',
      'disiplin cezasi',
      'yonetmelik',
      'genelge',
      'imtiyaz',
      'istimval',
      're sen',
      'kamu yarari',
    ],
  },
  {
    id: 'ticaret_hukuku',
    courseName: 'Ticaret Hukuku',
    disciplineLabel: 'Hukuk',
    domainMode: 'verbal',
    examStyleHint:
      'Ticari işletme, tacir sıfatı, şirket türleri, kıymetli evrak (poliçe, bono, çek) ve TTK düzenlemelerini karşılaştırmalı sun.',
    titleAliases: [
      'ticaret hukuku',
      'sirketler hukuku',
      'kiymetli evrak hukuku',
      'commercial law',
    ],
    strongPhrases: [
      'ticaret hukuku',
      'turk ticaret kanunu',
      'ticari isletme',
      'tacir sifati',
      'ticaret sicili',
      'ticaret unvani',
      'haksiz rekabet',
      'kiymetli evrak',
      'kambiyo senedi',
      'anonim sirket',
      'limited sirket',
      'kollektif sirket',
      'komandit sirket',
      'ticari defter',
      'cari hesap',
      'ticari is karinesi',
    ],
    terms: [
      'ttk',
      'tacir',
      'esnaf',
      'police',
      'bono',
      'cek',
      'ciro',
      'aval',
      'protesto',
      'acente',
      'simsar',
      'komisyoncu',
      'ticari temsilci',
      'genel kurul',
      'yonetim kurulu',
      'tasfiye',
    ],
  },
  {
    id: 'hukuk_genel',
    courseName: 'Hukuk Başlangıcı / Hukuk',
    disciplineLabel: 'Hukuk',
    domainMode: 'verbal',
    examStyleHint:
      'Hukuk kurallarının türlerini, kaynaklarını, yaptırım biçimlerini, hak kavramını ve yargı kollarını net ayrımlarla açıkla.',
    titleAliases: [
      'hukuka giris',
      'hukukun temel kavramlari',
      'hukuk baslangici',
      'temel hukuk',
      'hukuk',
      'introduction to law',
    ],
    strongPhrases: [
      'hukukun temel kavramlari',
      'hukuka giris',
      'hukuk baslangici',
      'hukuk kurallari',
      'emredici hukuk',
      'tamamlayici hukuk',
      'yorumlayici hukuk',
      'tanimlayici hukuk',
      'orf ve adet hukuku',
      'yazili kaynaklar',
      'kanun boslugu',
      'hukuk boslugu',
      'yargi kollari',
      'adli yargi',
      'idari yargi',
      'maddi mueyyide',
      'hukuki islem',
      'hukuki olay',
      'hukuki fiil',
      'mutlak butlan',
      'nispi butlan',
      'yokluk yaptirimi',
    ],
    terms: [
      'hukuk',
      'kanun',
      'mevzuat',
      'ictihat',
      'yargitay',
      'mahkeme',
      'hakim',
      'dava',
      'mueyyide',
      'yaptirim',
      'yururluk',
      'resmi gazete',
      'doktrin',
      'ogreti',
      'hakkin kazanilmasi',
      'kamu hukuku',
      'ozel hukuk',
      'madde',
    ],
  },
  // --- İŞLETME, MUHASEBE, FİNANS ---
  {
    id: 'muhasebe',
    courseName: 'Muhasebe',
    disciplineLabel: 'Finans & İşletme',
    domainMode: 'quantitative',
    examStyleHint:
      'Hesap işleyiş kurallarını (borç-alacak), yevmiye kayıtlarını, mali tabloları (bilanço, gelir tablosu) ve dönem sonu işlemlerini adım adım açıkla.',
    titleAliases: [
      'muhasebe',
      'genel muhasebe',
      'finansal muhasebe',
      'maliyet muhasebesi',
      'accounting',
    ],
    strongPhrases: [
      'genel muhasebe',
      'finansal muhasebe',
      'maliyet muhasebesi',
      'tekduzen hesap plani',
      'yevmiye defteri',
      'buyuk defter',
      'kebir',
      'gelir tablosu',
      'donen varliklar',
      'duran varliklar',
      'kisa vadeli yabanci kaynak',
      'ozkaynaklar',
      'amortisman',
      'envanter islemleri',
      'cift tarafli kayit',
      'mizan',
      'satilan ticari mallar maliyeti',
    ],
    terms: [
      'bilanco',
      'aktif',
      'pasif',
      'borc kaydi',
      'alacak kaydi',
      'kasa hesabi',
      'alicilar',
      'saticilar',
      'stok',
      'fifo',
      'lifo',
      'brut kar',
      'net kar',
      'hesap kodu',
      'yevmiye',
      'defteri kebir',
    ],
  },
  {
    id: 'finansal_yonetim',
    courseName: 'Finansal Yönetim',
    disciplineLabel: 'Finans & İşletme',
    domainMode: 'quantitative',
    examStyleHint:
      'Paranın zaman değeri, yatırım değerleme (NPV, IRR), risk-getiri modelleri (CAPM, WACC) ve sermaye yapısı formüllerini çözümlü anlat.',
    titleAliases: [
      'finansal yonetim',
      'kurumsal finans',
      'finans',
      'sermaye piyasalari',
      'portfoy yonetimi',
      'corporate finance',
    ],
    strongPhrases: [
      'finansal yonetim',
      'kurumsal finans',
      'paranin zaman degeri',
      'net bugunku deger',
      'ic verim orani',
      'sermaye maliyeti',
      'agirlikli ortalama sermaye maliyeti',
      'tahvil degerleme',
      'hisse senedi degerleme',
      'portfoy teorisi',
      'markowitz',
      'etkin piyasalar hipotezi',
      'turev piyasalar',
      'sermaye butcelemesi',
      'nakit akis tablosu',
      'finansal oranlar',
      'kaldirac derecesi',
    ],
    terms: [
      'npv',
      'irr',
      'capm',
      'wacc',
      'beta katsayisi',
      'iskonto orani',
      'temettu',
      'kupon faizi',
      'opsiyon',
      'vadeli islem',
      'swap',
      'roe',
      'roa',
      'cari oran',
      'likidite orani',
      'sistematik risk',
      'cesitlendirme',
    ],
  },
  {
    id: 'isletme_yonetim',
    courseName: 'İşletme ve Yönetim',
    disciplineLabel: 'Finans & İşletme',
    domainMode: 'verbal',
    examStyleHint:
      'Yönetim kuramlarını, stratejik analiz çerçevelerini (SWOT, Porter), organizasyon yapılarını ve örgütsel davranış modellerini karşılaştır.',
    titleAliases: [
      'isletme',
      'isletme bilimine giris',
      'yonetim ve organizasyon',
      'stratejik yonetim',
      'orgutsel davranis',
      'insan kaynaklari yonetimi',
      'management',
    ],
    strongPhrases: [
      'yonetim ve organizasyon',
      'stratejik yonetim',
      'orgutsel davranis',
      'insan kaynaklari yonetimi',
      'swot analizi',
      'porter bes guc',
      'bilimsel yonetim',
      'klasik yonetim',
      'neoklasik yonetim',
      'hawthorne arastirmalari',
      'maslow ihtiyaclar hiyerarsisi',
      'herzberg cift faktor',
      'tedarik zinciri',
      'toplam kalite yonetimi',
      'girisimcilik',
    ],
    terms: [
      'isletme',
      'planlama',
      'orgutleme',
      'yoneltme',
      'koordinasyon',
      'denetim',
      'liderlik',
      'motivasyon',
      'misyon',
      'vizyon',
      'rekabet stratejisi',
      'kurum kulturu',
      'performans degerleme',
      'taylor',
      'fayol',
    ],
  },
  {
    id: 'pazarlama',
    courseName: 'Pazarlama',
    disciplineLabel: 'Finans & İşletme',
    domainMode: 'verbal',
    examStyleHint:
      'Pazarlama karması (4P/7P), segmentasyon-hedefleme-konumlandırma (STP), marka stratejileri ve tüketici karar süreçlerini netleştir.',
    titleAliases: ['pazarlama', 'pazarlama ilkeleri', 'dijital pazarlama', 'marketing'],
    strongPhrases: [
      'pazarlama ilkeleri',
      'pazarlama karmasi',
      'tuketici davranislari',
      'pazar bolumlendirme',
      'hedef pazar',
      'konumlandirma',
      'urun yasam egrisi',
      'marka degeri',
      'butunlesik pazarlama iletisimi',
      'tutundurma karmasi',
      'dagitim kanallari',
      'fiyatlandirma stratejileri',
    ],
    terms: [
      'pazarlama',
      'segmentasyon',
      '4p',
      '7p',
      'stp',
      'marka',
      'reklam',
      'halkla iliskiler',
      'musteri sadakati',
      'crm',
      'b2b',
      'b2c',
      'kotler',
    ],
  },
  // --- SİYASET BİLİMİ, ULUSLARARASI İLİŞKİLER ---
  {
    id: 'siyaset_kamu',
    courseName: 'Siyaset Bilimi ve Kamu Yönetimi',
    disciplineLabel: 'Siyaset Bilimi ve Kamu Yönetimi',
    domainMode: 'verbal',
    examStyleHint:
      'Siyasal kuramları, devlet biçimlerini, bürokrasi modellerini ve kamu politikası süreçlerini düşünür ve kurum ayrımlarıyla açıkla.',
    titleAliases: [
      'siyaset bilimi',
      'kamu yonetimi',
      'siyasal dusunceler tarihi',
      'kamu politikasi',
      'yerel yonetimler',
      'political science',
    ],
    strongPhrases: [
      'siyaset bilimi',
      'kamu yonetimi',
      'kamu politikasi',
      'siyasal dusunceler',
      'yerel yonetimler',
      'siyasal katilma',
      'siyasal kultur',
      'siyasal sistem',
      'burokrasi modeli',
      'yeni kamu isletmeciligi',
      'toplum sozlesmesi',
      'secim sistemleri',
      'siyasal partiler',
      'baski gruplari',
    ],
    terms: [
      'burokrasi',
      'belediye',
      'demokrasi',
      'otoriter',
      'totaliter',
      'ideoloji',
      'liberalizm',
      'muhafazakarlik',
      'sosyalizm',
      'yonetisim',
      'merkezi yonetim',
      'hobbes',
      'locke',
      'rousseau',
      'machiavelli',
      'weber',
    ],
  },
  {
    id: 'uluslararasi_iliskiler',
    courseName: 'Uluslararası İlişkiler',
    disciplineLabel: 'Uluslararası İlişkiler',
    domainMode: 'verbal',
    examStyleHint:
      'Uluslararası ilişkiler kuramlarının (Realizm, Liberalizm, Konstrüktivizm) varsayımlarını, güvenlik kavramlarını ve diplomasi tarihini kıyasla.',
    titleAliases: [
      'uluslararasi iliskiler',
      'dis politika',
      'diplomasi tarihi',
      'uluslararasi orgutler',
      'international relations',
    ],
    strongPhrases: [
      'uluslararasi iliskiler',
      'uluslararasi iliskiler kuramlari',
      'dis politika',
      'diplomasi tarihi',
      'guvenlik ikilemi',
      'guc dengesi',
      'neorealizm',
      'konstruktivizm',
      'birlesmis milletler',
      'soguk savas',
      'vestfalya',
      'uluslararasi orgutler',
      'kolektif guvenlik',
      'yumusak guc',
      'hegemonik istikrar',
    ],
    terms: [
      'diplomasi',
      'jeopolitik',
      'realizm',
      'nato',
      'avrupa birligi',
      'hegemonya',
      'anarsi',
      'egemen devlet',
      'antlasma',
      'waltz',
      'morgenthau',
      'wendt',
      'disisleri',
    ],
  },
  // --- MATEMATİK, MÜHENDİSLİK, FEN ---
  {
    id: 'matematik_kalkulus',
    courseName: 'Matematik / Kalkülüs',
    disciplineLabel: 'Matematik & İstatistik',
    domainMode: 'quantitative',
    examStyleHint:
      'Teoremleri, limit-türev-integral kurallarını, varsayım koşullarını ve adım adım çözümleri temiz LaTeX ile sun.',
    titleAliases: [
      'matematik',
      'genel matematik',
      'kalkulus',
      'analiz',
      'diferansiyel denklemler',
      'calculus',
    ],
    strongPhrases: [
      'kalkulus',
      'diferansiyel denklem',
      'kismi turev',
      'belirli integral',
      'belirsiz integral',
      'kismi integrasyon',
      'degisken degistirme',
      'taylor serisi',
      'maclaurin',
      'l hopital',
      'ortalama deger teoremi',
      'rolle teoremi',
      'lagrange carpanlari',
      'laplace donusumu',
      'fourier serisi',
    ],
    terms: [
      'limit',
      'sureklilik',
      'turev',
      'integral',
      'fonksiyon',
      'seri',
      'yakinsak',
      'iraksak',
      'ekstremum',
      'asimptot',
      'teorem',
      'ispat',
      'polinom',
      'logaritma',
    ],
  },
  {
    id: 'lineer_cebir',
    courseName: 'Lineer Cebir',
    disciplineLabel: 'Matematik & İstatistik',
    domainMode: 'quantitative',
    examStyleHint:
      'Matris işlemlerini, vektör uzaylarını, determinant, özdeğer-özvektör ve doğrusal dönüşüm adımlarını açıkla.',
    titleAliases: ['lineer cebir', 'dogrusal cebir', 'linear algebra'],
    strongPhrases: [
      'lineer cebir',
      'vektor uzayi',
      'lineer bagimsizlik',
      'gauss eliminasyon',
      'gauss jordan',
      'ozdeger',
      'ozvektor',
      'dogrusal donusum',
      'kosegenlestirme',
      'gram schmidt',
      'matris tersi',
      'cramer kurali',
    ],
    terms: [
      'matris',
      'determinant',
      'rank',
      'iz',
      'transpoz',
      'vektor',
      'alt uzay',
      'taban',
      'boyut',
      'cekirdek',
      'ortogonal',
    ],
  },
  {
    id: 'bilgisayar_muhendisligi',
    courseName: 'Bilgisayar Mühendisliği / Yazılım',
    disciplineLabel: 'Bilgisayar & Mühendislik',
    domainMode: 'quantitative',
    examStyleHint:
      'Algoritma karmaşıklığını, veri yapılarını, sistem mimarisini ve kod/pseudocode mantığını adım adım açıkla.',
    titleAliases: [
      'algoritmalar',
      'veri yapilari',
      'bilgisayar muhendisligi',
      'veritabani sistemleri',
      'isletim sistemleri',
      'yazilim muhendisligi',
      'makine ogrenmesi',
      'yapay zeka',
      'computer science',
    ],
    strongPhrases: [
      'veri yapilari',
      'algoritma analizi',
      'zaman karmasikligi',
      'big-o',
      'ikili arama agaci',
      'bagli liste',
      'dinamik programlama',
      'isletim sistemleri',
      'veritabani yonetim',
      'normalizasyon',
      'makine ogrenmesi',
      'derin ogrenme',
      'yapay sinir aglari',
      'nesne yonelimli programlama',
      'bilgisayar aglari',
      'tcp/ip',
    ],
    terms: [
      'algoritma',
      'python',
      'java',
      'sql',
      'hash',
      'graf',
      'yigin',
      'kuyruk',
      'ozyineleme',
      'is parcacigi',
      'deadlock',
      'derleyici',
      'api',
      'http',
      'yazilim',
    ],
  },
  {
    id: 'muhendislik_genel',
    courseName: 'Mühendislik',
    disciplineLabel: 'Bilgisayar & Mühendislik',
    domainMode: 'quantitative',
    examStyleHint:
      'Fiziksel yasaları, denge/korunum denklemlerini, birimleri, sınır koşullarını ve tasarım adımlarını eksiksiz göster.',
    titleAliases: [
      'termodinamik',
      'mukavemet',
      'devre analizi',
      'akiskanlar mekanigi',
      'statik',
      'dinamik',
      'kontrol sistemleri',
      'sinyal ve sistemler',
      'muhendislik',
    ],
    strongPhrases: [
      'termodinamik',
      'mukavemet',
      'devre analizi',
      'akiskanlar mekanigi',
      'kontrol sistemleri',
      'sinyal isleme',
      'kirchhoff',
      'thevenin',
      'norton',
      'serbest cisim diyagrami',
      'kesme kuvveti',
      'egilme momenti',
      'bernoulli denklemi',
      'reynolds sayisi',
      'carnot cevrimi',
      'entropi',
      'entalpi',
    ],
    terms: [
      'gerilme',
      'sekil degistirme',
      'elastiklik modulu',
      'empedans',
      'direnç',
      'kondansator',
      'bobin',
      'transfer fonksiyonu',
      'bode diyagrami',
      'viskozite',
      'isi transferi',
      'tork',
      'atalet momenti',
    ],
  },
  {
    id: 'fizik',
    courseName: 'Fizik',
    disciplineLabel: 'Fen-Edebiyat Bilimleri',
    domainMode: 'quantitative',
    examStyleHint:
      'Fizik yasalarını, vektörel büyüklükleri, SI birimlerini, türetmeleri ve problem çözüm basamaklarını açıkla.',
    titleAliases: ['fizik', 'genel fizik', 'elektromanyetizma', 'kuantum fizigi', 'physics'],
    strongPhrases: [
      'newton yasalari',
      'elektromanyetizma',
      'maxwell denklemleri',
      'kuantum mekanigi',
      'schrodinger',
      'enerjinin korunumu',
      'momentumun korunumu',
      'gauss yasasi',
      'faraday yasasi',
      'coulomb yasasi',
      'harmonik hareket',
      'optik kirilma',
    ],
    terms: [
      'fizik',
      'ivme',
      'kuvvet',
      'kinetik enerji',
      'potansiyel enerji',
      'elektrik alan',
      'manyetik alan',
      'dalga boyu',
      'frekans',
      'foton',
      'mercek',
      'vektor',
    ],
  },
  {
    id: 'kimya',
    courseName: 'Kimya',
    disciplineLabel: 'Fen-Edebiyat Bilimleri',
    domainMode: 'quantitative',
    examStyleHint:
      'Tepkime mekanizmalarını, stokiyometri ve denge hesaplamalarını, bağ türlerini ve kimyasal kuralları netleştir.',
    titleAliases: ['kimya', 'genel kimya', 'organik kimya', 'analitik kimya', 'chemistry'],
    strongPhrases: [
      'organik kimya',
      'analitik kimya',
      'fizikokimya',
      'kimyasal denge',
      'asit baz dengesi',
      'le chatelier',
      'kovalent bag',
      'iyonik bag',
      'redoks tepkimesi',
      'mol kavrami',
      'titrasyon',
      'tampon cozelti',
      'orbital teorisi',
    ],
    terms: [
      'kimya',
      'atom',
      'molekul',
      'elektron',
      'molarite',
      'ph',
      'katalizor',
      'izomer',
      'hidrokarbon',
      'alkan',
      'alken',
      'polimer',
      'periyodik tablo',
    ],
  },
  {
    id: 'biyoloji',
    courseName: 'Biyoloji',
    disciplineLabel: 'Fen-Edebiyat Bilimleri',
    domainMode: 'hybrid',
    examStyleHint:
      'Hücresel süreçleri, genetik mekanizmaları, yapı-işlev ilişkilerini ve biyolojik sistemleri aşamalı açıkla.',
    titleAliases: ['biyoloji', 'molekuler biyoloji', 'genetik', 'hucre biyolojisi', 'biology'],
    strongPhrases: [
      'molekuler biyoloji',
      'hucre biyolojisi',
      'dna replikasyonu',
      'transkripsiyon',
      'translasyon',
      'protein sentezi',
      'mitoz bolunme',
      'mayoz bolunme',
      'hucresel solunum',
      'krebs dongusu',
      'mendel genetigi',
      'evrim teorisi',
      'ekosistem ekolojisi',
    ],
    terms: [
      'biyoloji',
      'hucre',
      'organel',
      'mitokondri',
      'ribozom',
      'kromozom',
      'gen',
      'alel',
      'enzim',
      'atp',
      'fotosentez',
      'mrna',
      'mutasyon',
    ],
  },
  // --- TIP, SAĞLIK, EĞİTİM, BEŞERİ & DİĞER FAKÜLTELER ---
  {
    id: 'tip',
    courseName: 'Tıp Bilimleri',
    disciplineLabel: 'Tıp Bilimleri',
    domainMode: 'hybrid',
    examStyleHint:
      'Etiyoloji, patofizyoloji mekanizması, semptom/bulgu ayrımları, tanı kriterleri ve klinik tedavi ilkelerini sistematik sun.',
    titleAliases: [
      'anatomi',
      'fizyoloji',
      'patoloji',
      'farmakoloji',
      'mikrobiyoloji',
      'biyokimya',
      'histoloji',
      'dahiliye',
      'kardiyoloji',
      'noroloji',
      'tip',
    ],
    strongPhrases: [
      'patofizyoloji',
      'ayirici tani',
      'farmakokinetik',
      'farmakodinamik',
      'sinir sistemi',
      'kardiyovaskuler sistem',
      'solunum fizyolojisi',
      'endokrin sistem',
      'immun sistem',
      'aksiyon potansiyeli',
      'inflamasyon',
      'neoplazi',
      'antibiyotik direnci',
    ],
    terms: [
      'anatomi',
      'fizyoloji',
      'patoloji',
      'farmakoloji',
      'histoloji',
      'embriyoloji',
      'immünoloji',
      'mikrobiyoloji',
      'biyokimya',
      'semptom',
      'etiyoloji',
      'prognoz',
      'sendrom',
      'reseptor',
      'hormon',
      'arter',
      'ven',
      'noron',
    ],
  },
  {
    id: 'saglik_bilimleri',
    courseName: 'Sağlık Bilimleri',
    disciplineLabel: 'Sağlık Bilimleri',
    domainMode: 'hybrid',
    examStyleHint:
      'Klinik bakım protokollerini, değerlendirme basamaklarını, fizyolojik temeli ve hasta güvenliği ilkelerini netleştir.',
    titleAliases: [
      'hemsirelik',
      'fizyoterapi',
      'beslenme ve diyetetik',
      'ebelik',
      'eczacilik',
      'halk sagligi',
      'saglik bilimleri',
    ],
    strongPhrases: [
      'hemsirelik sureci',
      'hasta bakimi',
      'fizyoterapi ve rehabilitasyon',
      'beslenme ve diyetetik',
      'klinik beslenme',
      'halk sagligi',
      'epidemiyoloji',
      'vital bulgular',
      'farmasotik teknoloji',
    ],
    terms: [
      'hemsirelik',
      'rehabilitasyon',
      'diyetetik',
      'ebelik',
      'eczacilik',
      'ergoterapi',
      'odyoloji',
      'antropometri',
      'malnutrisyon',
      'asepsi',
      'sterilizasyon',
    ],
  },
  {
    id: 'egitim_bilimleri',
    courseName: 'Eğitim Bilimleri',
    disciplineLabel: 'Eğitim Bilimleri',
    domainMode: 'verbal',
    examStyleHint:
      'Öğrenme-gelişim kuramlarını, kuramcı-ilke eşleştirmelerini, ölçme kavramlarını ve öğretim yöntemlerini karşılaştırmalı açıkla.',
    titleAliases: [
      'egitim bilimleri',
      'ogretim ilke ve yontemleri',
      'olcme ve degerlendirme',
      'gelisim psikolojisi',
      'ogrenme psikolojisi',
      'sinif yonetimi',
      'rehberlik ve pdr',
      'program gelistirme',
    ],
    strongPhrases: [
      'egitim bilimleri',
      'ogretim ilke ve yontemleri',
      'olcme ve degerlendirme',
      'gelisim psikolojisi',
      'ogrenme psikolojisi',
      'program gelistirme',
      'sinif yonetimi',
      'bloom taksonomisi',
      'yapilandirmacilik',
      'klasik kosullanma',
      'edimsel kosullanma',
      'sosyal ogrenme kurami',
      'yakinsak gelisim alani',
      'kapsam gecerligi',
      'yapi gecerligi',
    ],
    terms: [
      'pedagoji',
      'mufredat',
      'gecerlik',
      'guvenirlik',
      'piaget',
      'vygotsky',
      'bandura',
      'skinner',
      'pavlov',
      'erikson',
      'kohlberg',
      'rehberlik',
      'pdr',
      'ogretmenlik',
      'kazanim',
      'rubrik',
    ],
  },
  {
    id: 'tarih',
    courseName: 'Tarih',
    disciplineLabel: 'Tarih',
    domainMode: 'verbal',
    examStyleHint:
      'Tarihsel olayların neden-sonuç zincirini, dönem özelliklerini, antlaşmaları ve siyasal-toplumsal etkilerini kronolojik sun.',
    titleAliases: [
      'tarih',
      'osmanli tarihi',
      'inkilap tarihi',
      'ataturk ilkeleri',
      'cumhuriyet tarihi',
      'cagdas dunya tarihi',
      'history',
    ],
    strongPhrases: [
      'inkilap tarihi',
      'ataturk ilkeleri',
      'osmanli tarihi',
      'kurtulus savasi',
      'lozan antlasmasi',
      'mondros ateskes',
      'tanzimat fermani',
      'islahat fermani',
      'mesrutiyet',
      'fransiz ihtilali',
      'selcuklu devleti',
      'bizans imparatorlugu',
    ],
    terms: [
      'osmanli',
      'padisah',
      'sadrazam',
      'divan',
      'fetih',
      'antlasma',
      'savas',
      'imparatorluk',
      'cumhuriyet',
      'kongre',
      'kronoloji',
      'yuzyil',
    ],
  },
  {
    id: 'sosyoloji',
    courseName: 'Sosyoloji',
    disciplineLabel: 'Sosyoloji, Psikoloji & Felsefe',
    domainMode: 'verbal',
    examStyleHint:
      'Sosyolojik kuramları, kuramcıların kavram setlerini ve toplumsal yapı-değişim ilişkilerini karşılaştırmalı açıkla.',
    titleAliases: ['sosyoloji', 'toplumbilim', 'sociology'],
    strongPhrases: [
      'sosyoloji',
      'toplumsal tabakalas',
      'toplumsal degisme',
      'toplumsal hareketlilik',
      'sosyallesme sureci',
      'mekanik dayanisma',
      'organik dayanisma',
      'sosyal olgu',
      'sembolik etkilesimcilik',
      'yapisal islevselcilik',
      'catisma kurami',
    ],
    terms: [
      'anomi',
      'durkheim',
      'comte',
      'bourdieu',
      'habermas',
      'foucault',
      'toplum',
      'kultur',
      'norm',
      'statu',
      'toplumsal rol',
      'yabancilasma',
      'kentlesme',
    ],
  },
  {
    id: 'psikoloji',
    courseName: 'Psikoloji',
    disciplineLabel: 'Sosyoloji, Psikoloji & Felsefe',
    domainMode: 'verbal',
    examStyleHint:
      'Psikolojik yaklaşımları, bilişsel-davranışsal süreçleri, deney bulgularını ve kuram farklarını netleştir.',
    titleAliases: [
      'psikoloji',
      'sosyal psikoloji',
      'bilissel psikoloji',
      'klinik psikoloji',
      'psychology',
    ],
    strongPhrases: [
      'psikoloji',
      'bilissel psikoloji',
      'sosyal psikoloji',
      'klinik psikoloji',
      'savunma mekanizmalari',
      'kisa sureli bellek',
      'uzun sureli bellek',
      'bilissel celiski',
      'baglanma kurami',
      'psikanaliz',
      'davraniscilik',
      'gestalt psikolojisi',
    ],
    terms: [
      'freud',
      'jung',
      'rogers',
      'algi',
      'bellek',
      'dikkat',
      'kisilik',
      'bilincalti',
      'duygu',
      'stres',
      'tutum',
      'onyargi',
      'empati',
    ],
  },
  {
    id: 'felsefe',
    courseName: 'Felsefe',
    disciplineLabel: 'Sosyoloji, Psikoloji & Felsefe',
    domainMode: 'verbal',
    examStyleHint:
      'Felsefi akımları, bilgi-varlık-ahlak problemlerini ve filozofların argümanlarını karşılaştırmalı açıkla.',
    titleAliases: ['felsefe', 'felsefe tarihi', 'mantik', 'etik', 'philosophy'],
    strongPhrases: [
      'felsefe tarihi',
      'bilgi felsefesi',
      'varlik felsefesi',
      'ahlak felsefesi',
      'epistemoloji',
      'ontoloji',
      'rasyonalizm',
      'empirizm',
      'kategorik imperatif',
      'idealar kurami',
      'fenomenoloji',
      'varolusc',
    ],
    terms: [
      'felsefe',
      'platon',
      'aristoteles',
      'descartes',
      'kant',
      'hegel',
      'nietzsche',
      'hume',
      'spinoza',
      'sartre',
      'diyalektik',
      'metafizik',
      'etik',
      'estetik',
    ],
  },
  {
    id: 'edebiyat',
    courseName: 'Türk Dili ve Edebiyatı',
    disciplineLabel: 'Fen-Edebiyat Bilimleri',
    domainMode: 'verbal',
    examStyleHint:
      'Edebi dönemleri, akımları, tür özelliklerini, şair-yazar ve eser analizlerini sistematik sun.',
    titleAliases: ['edebiyat', 'turk edebiyati', 'turk dili', 'dilbilim', 'literature'],
    strongPhrases: [
      'turk edebiyati',
      'divan edebiyati',
      'halk edebiyati',
      'tanzimat edebiyati',
      'servet-i funun',
      'fecr-i ati',
      'milli edebiyat',
      'edebi akimlar',
      'soz sanatlari',
      'aruz olcusu',
      'hece olcusu',
      'dilbilim',
    ],
    terms: [
      'edebiyat',
      'siir',
      'roman',
      'hikaye',
      'tiyatro',
      'gazel',
      'kaside',
      'mesnevi',
      'romantizm',
      'sembolizm',
      'parnasizm',
      'anlatici',
      'kurgu',
    ],
  },
  {
    id: 'spor_bilimleri',
    courseName: 'Spor Bilimleri',
    disciplineLabel: 'Spor Bilimleri',
    domainMode: 'hybrid',
    examStyleHint:
      'Enerji sistemlerini, egzersiz fizyolojisini, biyomekanik ilkeleri ve antrenman periyotlamasını netleştir.',
    titleAliases: [
      'spor bilimleri',
      'egzersiz fizyolojisi',
      'antrenman bilimi',
      'spor biyomekanigi',
      'kinesiyoloji',
    ],
    strongPhrases: [
      'egzersiz fizyolojisi',
      'antrenman bilimi',
      'spor biyomekanigi',
      'motor ogrenme',
      'spor psikolojisi',
      'vo2 max',
      'laktat esigi',
      'kas kasilmasi',
      'hipertrofi',
      'periyotlama',
    ],
    terms: [
      'aerobik',
      'anaerobik',
      'kinesiyoloji',
      'antrenorluk',
      'dayaniklilik',
      'kuvvet antrenmani',
      'surat',
      'esneklik',
      'rekreasyon',
      'spor yonetimi',
    ],
  },
  {
    id: 'ziraat',
    courseName: 'Ziraat ve Tarım Bilimleri',
    disciplineLabel: 'Ziraat & Tarım Bilimleri',
    domainMode: 'hybrid',
    examStyleHint:
      'Toprak-bitki-su ilişkilerini, bitki koruma/besleme ilkelerini ve tarımsal verim faktörlerini sistematik açıkla.',
    titleAliases: [
      'ziraat',
      'toprak bilimi',
      'bitki koruma',
      'tarla bitkileri',
      'bahce bitkileri',
      'zootekni',
      'tarim ekonomisi',
    ],
    strongPhrases: [
      'toprak bilimi',
      'bitki koruma',
      'tarla bitkileri',
      'bahce bitkileri',
      'bitki besleme',
      'tarim ekonomisi',
      'organik tarim',
      'hayvansal uretim',
      'toprak ph',
      'fitopatoloji',
      'entomoloji',
    ],
    terms: [
      'ziraat',
      'tarim',
      'zootekni',
      'sulama',
      'gubreleme',
      'seracilik',
      'tohumculuk',
      'hasat',
      'verim',
      'pestisit',
      'peyzaj',
    ],
  },
];

export const COMMON_UNIVERSITY_COURSES: string[] = COURSE_PROFILES.map((p) => p.courseName);

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Counts occurrences of a folded ASCII phrase in folded text.
 * Uses left word boundary + allows Turkish agglutinative suffixes on the right
 * for words >= 4 chars (so "hukuk" matches "hukuku", "hukukunda"; "kanun" matches "kanunu").
 */
function countFoldedMatches(foldedText: string, foldedPhrase: string): number {
  if (!foldedText || !foldedPhrase) return 0;
  const escaped = escapeRegex(foldedPhrase).replace(/\s+/g, '\\s+');
  const isShortAcronym = foldedPhrase.length <= 3 && !foldedPhrase.includes(' ');
  const pattern = isShortAcronym
    ? `(?<![a-z0-9])${escaped}(?![a-z0-9])`
    : `(?<![a-z0-9])${escaped}(?:[a-z]{0,7})(?![a-z0-9])`;
  try {
    const re = new RegExp(pattern, 'g');
    const matches = foldedText.match(re);
    return matches ? matches.length : 0;
  } catch {
    return 0;
  }
}

/**
 * Samples beginning, middle, and end of a document so course detection analyzes
 * the ENTIRE source (never only the first page!).
 */
function sampleDocumentForClassification(text: string, maxChars = 42_000): string {
  const clean = (text || '').trim();
  if (clean.length <= maxChars) return clean;
  const slices = 5;
  const perSlice = Math.floor(maxChars / slices);
  const maxStart = Math.max(0, clean.length - perSlice);
  const parts: string[] = [];
  for (let i = 0; i < slices; i++) {
    const start =
      i === slices - 1 ? maxStart : Math.floor((maxStart * i) / Math.max(1, slices - 1));
    parts.push(clean.slice(start, start + perSlice));
  }
  return parts.join('\n');
}

/**
 * Extracts explicit course declarations like "Dersin Adı: Para Teorisi" or "Ders: Borçlar Hukuku"
 * from the opening pages/slides of the document.
 */
function extractExplicitCourseHeader(text: string): string | null {
  const head = (text || '').slice(0, 3500);
  const lines = head.split('\n').map((l) => l.trim()).filter(Boolean);
  for (const line of lines.slice(0, 45)) {
    const m = line.match(
      /^(?:ders(?:in)?\s*(?:ad[ıi]|ismi)?|course(?:\s*name)?|konu\s*alan[ıi])\s*[:\-–]\s*(.{3,80})$/i,
    );
    if (m?.[1]) {
      const candidate = m[1].replace(/[|•·].*$/, '').trim();
      if (!isGenericCoursePlaceholder(candidate) && candidate.length >= 3 && candidate.length <= 72) {
        return candidate;
      }
    }
  }
  return null;
}

/**
 * Extracts structural headings across the entire document (start -> finish) for high-weight course signals.
 */
function extractHeadingSample(text: string): string {
  const lines = (text || '').split('\n');
  const picked: string[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (line.length < 4 || line.length > 95) continue;
    if (/^---\s*(Sayfa|Slayt)\s+\d+\s*---$/i.test(line)) continue;
    if (/^===\s*KAYNAK/i.test(line)) continue;
    const isHeading =
      /^#{1,4}\s+/.test(line) ||
      /^(\d+(\.\d+){0,2}|[IVX]+\.)\s+[A-ZÇĞİÖŞÜ]/.test(line) ||
      /^[A-ZÇĞİÖŞÜ][^.!?]{3,55}:$/.test(line) ||
      (line.length >= 6 &&
        line.length <= 65 &&
        line === line.toUpperCase() &&
        /[A-ZÇĞİÖŞÜ]{3}/.test(line) &&
        !/^\d+$/.test(line));
    if (isHeading) {
      picked.push(line.replace(/^#{1,4}\s+/, '').replace(/:$/, '').trim());
      if (picked.length >= 40) break;
    }
  }
  return picked.join('\n');
}

function estimateDomainModeFromText(text: string, profileMode: CourseDomainMode): CourseDomainMode {
  const sample = (text || '').slice(0, 18_000);
  const mathSignals = (
    sample.match(
      /(\$\$[^$]+\$\$|\$[^$\n]+\$|\\frac|\\sum|\\int|\\partial|[∑∫∂√±≤≥≠σμχβλ]|[a-zA-Z]\s*=\s*[-+0-9a-zA-Z(]|\d+\s*[*/=]\s*\d+|d[xy]\s*\/\s*d[xt])/g,
    ) || []
  ).length;
  if (profileMode === 'verbal') {
    return mathSignals >= 10 ? 'hybrid' : 'verbal';
  }
  if (profileMode === 'quantitative') {
    return 'quantitative';
  }
  if (mathSignals >= 8) return 'quantitative';
  if (mathSignals === 0 && sample.length > 200) return 'verbal';
  return 'hybrid';
}

export function findCourseProfileByName(courseName?: string | null): CourseProfile | null {
  if (!courseName || isGenericCoursePlaceholder(courseName)) return null;
  const folded = foldTurkishToAscii(courseName);
  // Exact courseName or alias match first
  for (const p of COURSE_PROFILES) {
    if (foldTurkishToAscii(p.courseName) === folded) return p;
    if (p.titleAliases.some((a) => a === folded || folded.includes(a))) return p;
  }
  return null;
}

/**
 * Independent, per-source course detector.
 * Analyzes ONLY the given source's filename/title, explicit headers, section headings, and full-document text.
 * Never defaults to "İktisat & Ekonometri" or leaks previous sources' courses.
 */
export function detectCourseIdentity(params: {
  text: string;
  fileNameOrTitle?: string | null;
  explicitCourse?: string | null;
  confirmedByUser?: boolean;
}): CourseDetectionResult {
  const rawText = params.text || '';
  const cleanTitle = (params.fileNameOrTitle || '')
    .replace(/\.(pdf|pptx?|docx?|txt|md|png|jpe?g|webp|mp3|wav|m4a)$/i, '')
    .trim();
  const explicitCourseClean = (params.explicitCourse || '').trim();

  // 1) Respect explicit user-confirmed course immediately
  if (params.confirmedByUser && !isGenericCoursePlaceholder(explicitCourseClean)) {
    const matchedProfile = findCourseProfileByName(explicitCourseClean);
    const mode = estimateDomainModeFromText(rawText, matchedProfile?.domainMode || 'hybrid');
    return {
      course: explicitCourseClean,
      discipline: matchedProfile?.disciplineLabel || explicitCourseClean,
      domainMode: mode,
      examStyleHint:
        matchedProfile?.examStyleHint ||
        'Notun kendi terminolojisi, başlık hiyerarşisi ve akademik yapısına %100 bağlı kal.',
      confidence: 'high',
      needsConfirmation: false,
      candidates: [explicitCourseClean],
      evidence: [`Kullanıcı tarafından doğrulandı: ${explicitCourseClean}`],
      score: 100,
    };
  }

  // 2) Check explicit metadata course (e.g., from EconNotes note.course) or explicit syllabus header inside text
  const headerCourse = extractExplicitCourseHeader(rawText);
  const explicitSignalText = [
    !isGenericCoursePlaceholder(explicitCourseClean) ? explicitCourseClean : '',
    headerCourse || '',
  ]
    .filter(Boolean)
    .join(' ');

  const foldedExplicit = foldTurkishToAscii(explicitSignalText);
  const foldedTitle = foldTurkishToAscii(cleanTitle);
  const foldedHeadings = foldTurkishToAscii(extractHeadingSample(rawText));
  const foldedBody = foldTurkishToAscii(sampleDocumentForClassification(rawText, 42_000));

  interface ScoredProfile {
    profile: CourseProfile;
    score: number;
    titleHit: boolean;
    explicitHit: boolean;
    evidence: string[];
  }

  const scored: ScoredProfile[] = COURSE_PROFILES.map((profile) => {
    let score = 0;
    let titleHit = false;
    let explicitHit = false;
    const evidence: string[] = [];

    // A) Explicit metadata / document header match (highest authority; multi-word specific aliases score higher)
    let bestExplicitBoost = 0;
    let bestExplicitAlias = '';
    for (const alias of profile.titleAliases) {
      if (foldedExplicit && countFoldedMatches(foldedExplicit, alias) > 0) {
        const boost = alias.includes(' ') ? 16 : 12;
        if (boost > bestExplicitBoost) {
          bestExplicitBoost = boost;
          bestExplicitAlias = alias;
        }
      }
    }
    if (bestExplicitBoost > 0) {
      score += bestExplicitBoost;
      explicitHit = true;
      evidence.push(`Ders bilgisi: "${bestExplicitAlias}"`);
    }

    // B) Filename / document title match (multi-word exact course titles beat single-word general aliases)
    let bestTitleBoost = 0;
    let bestTitleAlias = '';
    for (const alias of profile.titleAliases) {
      if (foldedTitle && countFoldedMatches(foldedTitle, alias) > 0) {
        const boost = alias.includes(' ') ? 13 : 9;
        if (boost > bestTitleBoost) {
          bestTitleBoost = boost;
          bestTitleAlias = alias;
        }
      }
    }
    if (bestTitleBoost > 0) {
      score += bestTitleBoost;
      titleHit = true;
      evidence.push(`Dosya/Başlık: "${bestTitleAlias}"`);
    }
    if (!titleHit && foldedTitle) {
      for (const phrase of profile.strongPhrases) {
        if (countFoldedMatches(foldedTitle, phrase) > 0) {
          score += 8.5;
          titleHit = true;
          evidence.push(`Başlık kavramı: "${phrase}"`);
          break;
        }
      }
    }

    // C) Structural headings across the entire document
    let headingMatches = 0;
    for (const phrase of [...profile.titleAliases, ...profile.strongPhrases]) {
      if (headingMatches >= 5) break;
      const cnt = countFoldedMatches(foldedHeadings, phrase);
      if (cnt > 0) {
        score += Math.min(2, cnt) * 4.2;
        headingMatches += 1;
        if (evidence.length < 4) evidence.push(`Bölüm başlığı: "${phrase}"`);
      }
    }

    // D) Full-document strong phrase density (capped per phrase to prevent repetition distortion)
    let distinctStrongHits = 0;
    for (const phrase of profile.strongPhrases) {
      const cnt = countFoldedMatches(foldedBody, phrase);
      if (cnt > 0) {
        distinctStrongHits += 1;
        score += 3.2 + Math.min(3, cnt - 1) * 0.9;
        if (evidence.length < 5) evidence.push(`Kavram: "${phrase}"`);
      }
    }

    // E) Supporting domain terms (capped per term)
    let distinctTermHits = 0;
    for (const term of profile.terms) {
      const cnt = countFoldedMatches(foldedBody, term);
      if (cnt > 0) {
        distinctTermHits += 1;
        score += 1.2 + Math.min(2, cnt - 1) * 0.35;
      }
    }

    // Breadth bonus for rich multi-concept coverage of the exact course
    if (distinctStrongHits >= 3) score += 3.5;
    if (distinctTermHits >= 5) score += 2.5;

    return {
      profile,
      score: Number(score.toFixed(2)),
      titleHit,
      explicitHit,
      evidence: Array.from(new Set(evidence)).slice(0, 5),
    };
  });

  scored.sort((a, b) => b.score - a.score);
  const top = scored[0];
  const second = scored[1];

  // If user passed an explicit platform note.course (e.g. "Sigorta Hukuku" or custom elective not in catalog)
  // and catalog didn't find a conflicting strong match, preserve that real course name directly!
  if (!isGenericCoursePlaceholder(explicitCourseClean)) {
    const matched = findCourseProfileByName(explicitCourseClean);
    if (matched) {
      const mode = estimateDomainModeFromText(rawText, matched.domainMode);
      return {
        course: explicitCourseClean,
        discipline: matched.disciplineLabel,
        domainMode: mode,
        examStyleHint: matched.examStyleHint,
        confidence: 'high',
        needsConfirmation: false,
        candidates: Array.from(
          new Set([explicitCourseClean, ...scored.filter((s) => s.score >= 5).slice(0, 3).map((s) => s.profile.courseName)]),
        ).slice(0, 4),
        evidence: [`Kayıtlı ders bilgisi: ${explicitCourseClean}`],
        score: Math.max(top?.score || 0, 20),
      };
    }
    // Custom course name from EconNotes catalog or syllabus header (not in built-in list)
    const fallbackDiscipline = top && top.score >= 8 ? top.profile.disciplineLabel : explicitCourseClean;
    const mode = estimateDomainModeFromText(rawText, top && top.score >= 8 ? top.profile.domainMode : 'hybrid');
    return {
      course: explicitCourseClean,
      discipline: fallbackDiscipline,
      domainMode: mode,
      examStyleHint:
        top && top.score >= 8
          ? top.profile.examStyleHint
          : 'Notun kendi terminolojisi ve akademik yapısına %100 bağlı kal.',
      confidence: 'high',
      needsConfirmation: false,
      candidates: [explicitCourseClean, ...scored.filter((s) => s.score >= 5).slice(0, 3).map((s) => s.profile.courseName)].slice(0, 4),
      evidence: [`Kayıtlı ders bilgisi: ${explicitCourseClean}`],
      score: Math.max(top?.score || 0, 18),
    };
  }

  // If an explicit syllabus header inside the document names a custom course (not covered by catalog)
  if (headerCourse && (!top || top.score < 10)) {
    const mode = estimateDomainModeFromText(rawText, 'hybrid');
    return {
      course: headerCourse,
      discipline: headerCourse,
      domainMode: mode,
      examStyleHint: 'Notun kendi terminolojisi ve akademik yapısına %100 bağlı kal.',
      confidence: 'medium',
      needsConfirmation: false,
      candidates: [headerCourse, ...scored.filter((s) => s.score >= 4).slice(0, 3).map((s) => s.profile.courseName)].slice(0, 4),
      evidence: [`Belge üstbilgisinden okundu: ${headerCourse}`],
      score: 12,
    };
  }

  const candidates = scored
    .filter((s) => s.score >= 3.5)
    .slice(0, 4)
    .map((s) => s.profile.courseName);

  // Strict uncertainty gate: NEVER guess or silently default to "İktisat & Ekonometri"!
  const scoreGap = top && second ? top.score - second.score : top?.score || 0;
  const hasStrongAnchor = Boolean(top && (top.explicitHit || top.titleHit));

  // Special case: two sub-branches of Law competing closely -> cleanly classify as general "Hukuk" if both are Law
  if (
    top &&
    second &&
    top.profile.disciplineLabel === 'Hukuk' &&
    second.profile.disciplineLabel === 'Hukuk' &&
    top.score >= 7 &&
    !hasStrongAnchor &&
    scoreGap < 2.2
  ) {
    return {
      course: 'Hukuk',
      discipline: 'Hukuk',
      domainMode: estimateDomainModeFromText(rawText, 'verbal'),
      examStyleHint: top.profile.examStyleHint,
      confidence: 'medium',
      needsConfirmation: false,
      candidates: Array.from(new Set(['Hukuk', top.profile.courseName, second.profile.courseName])),
      evidence: [...top.evidence, ...second.evidence].slice(0, 4),
      score: top.score,
    };
  }

  // If no strong evidence or ambiguous tie between different disciplines -> ask the user!
  const isUncertain =
    !top ||
    top.score < 6.5 ||
    (!hasStrongAnchor && top.score < 12 && scoreGap < 2.2);

  if (isUncertain) {
    return {
      course: null,
      discipline: null,
      domainMode: estimateDomainModeFromText(rawText, 'hybrid'),
      examStyleHint: 'Notun kendi terminolojisi, başlıkları ve akademik yapısına %100 bağlı kal.',
      confidence: 'uncertain',
      needsConfirmation: true,
      candidates,
      evidence: top?.evidence || [],
      score: top?.score || 0,
    };
  }

  const confidence: CourseDetectionConfidence =
    hasStrongAnchor || top.score >= 14 || scoreGap >= 5 ? 'high' : 'medium';

  return {
    course: top.profile.courseName,
    discipline: top.profile.disciplineLabel,
    domainMode: estimateDomainModeFromText(rawText, top.profile.domainMode),
    examStyleHint: top.profile.examStyleHint,
    confidence,
    needsConfirmation: false,
    candidates: candidates.length > 0 ? candidates : [top.profile.courseName],
    evidence: top.evidence,
    score: top.score,
  };
}
