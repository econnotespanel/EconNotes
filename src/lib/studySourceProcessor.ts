import { extractFile, type ExtractedImagePage } from '@/lib/extractFile';
import type {
  ExtractedSourceItem,
  KeyTermItem,
  NoteSourceOption,
  ProcessedStudyBundle,
  StudyTopicPriorityItem,
  SummarySection,
  TeacherEmphasisItem,
  TopicPriorityLevel,
} from '@/types/study';

function countWords(text: string): number {
  const cleaned = text.trim();
  if (!cleaned) return 0;
  return cleaned.split(/\s+/).filter(Boolean).length;
}

function estimatePagesOrSlides(text: string, explicitPages?: number): number {
  if (explicitPages && explicitPages > 0) return explicitPages;
  const pageMatches = text.match(/---\s*(Sayfa|Slayt)\s+\d+\s*---/gi);
  if (pageMatches && pageMatches.length > 0) return pageMatches.length;
  return Math.max(1, Math.ceil(countWords(text) / 280));
}

export type AcademicDomainMode = 'verbal' | 'quantitative' | 'hybrid';

export interface FacultyCatalogItem {
  id: string;
  label: string;
  disciplineLabel: string;
  defaultMode: AcademicDomainMode;
  sampleCourses: string;
  examStyleHint: string;
}

export const FACULTY_CATALOG: FacultyCatalogItem[] = [
  {
    id: 'auto',
    label: 'Otomatik Algıla (Tüm Fakülteler)',
    disciplineLabel: 'Üniversite Akademik Çalışma',
    defaultMode: 'hybrid',
    sampleCourses: 'Ders notundaki terimlerden alan otomatik belirlenir',
    examStyleHint: 'Notun kendi terminolojisi ve akademik yapısına %100 bağlı kal.',
  },
  {
    id: 'iktisat',
    label: 'İktisat & İİBF',
    disciplineLabel: 'İktisat & Ekonometri',
    defaultMode: 'hybrid',
    sampleCourses: 'Mikro/Makro İktisat, Para Teorisi, Maliye, Ekonometri, İktisat Tarihi',
    examStyleHint: 'Denge koşulları, politika aktarım mekanizmaları ve varsayım ayrımlarını vurgula.',
  },
  {
    id: 'siyaset_kamu',
    label: 'Siyaset Bilimi ve Kamu Yönetimi',
    disciplineLabel: 'Siyaset Bilimi ve Kamu Yönetimi',
    defaultMode: 'verbal',
    sampleCourses: 'Anayasa, Siyasal Düşünceler, Kamu Politikası, İdare Hukuku, Yerel Yönetimler',
    examStyleHint: 'Kurumsal yapılar, düşünür-ekol farkları, yetki sınırları ve hukuki/siyasal neden-sonuç zincirini netleştir.',
  },
  {
    id: 'uluslararasi_iliskiler',
    label: 'Uluslararası İlişkiler',
    disciplineLabel: 'Uluslararası İlişkiler',
    defaultMode: 'verbal',
    sampleCourses: 'Uluslararası İlişkiler Kuramları, Diplomasi Tarihi, Uluslararası Hukuk, Dış Politika',
    examStyleHint: 'Kuramların (Realizm, Liberalizm, Konstrüktivizm vb.) aktör, güvenlik ve iş birliği farklarını karşılaştır.',
  },
  {
    id: 'muhendislik',
    label: 'Mühendislik Fakültesi',
    disciplineLabel: 'Bilgisayar & Mühendislik',
    defaultMode: 'quantitative',
    sampleCourses: 'Algoritmalar, Termodinamik, Mukavemet, Devre Analizi, Lineer Cebir, Kontrol Sistemleri',
    examStyleHint: 'Formülleri, birim/koşul sınırlarını, tasarım ilkelerini ve adım adım problem çözüm mantığını öne çıkar.',
  },
  {
    id: 'egitim',
    label: 'Eğitim Fakültesi',
    disciplineLabel: 'Eğitim Bilimleri',
    defaultMode: 'verbal',
    sampleCourses: 'Öğretim İlke ve Yöntemleri, Ölçme ve Değerlendirme, Gelişim/Öğrenme Psikolojisi, PDR',
    examStyleHint: 'Öğrenme kuramları, kuramcı-ilke eşleştirmeleri, ölçme kavramları (geçerlik/güvenirlik) ve sınıf içi uygulama farklarını vurgula.',
  },
  {
    id: 'tip',
    label: 'Tıp Fakültesi',
    disciplineLabel: 'Tıp Bilimleri',
    defaultMode: 'hybrid',
    sampleCourses: 'Anatomi, Fizyoloji, Biyokimya, Patoloji, Farmakoloji, Mikrobiyoloji, Klinik Bilimler',
    examStyleHint: 'Etiyoloji, patofizyoloji mekanizması, ayırt edici tanı/semptom farkları ve klinik kırmızı bayrakları sistematik sun.',
  },
  {
    id: 'fen_edebiyat',
    label: 'Fen-Edebiyat Fakültesi',
    disciplineLabel: 'Fen-Edebiyat Bilimleri',
    defaultMode: 'hybrid',
    sampleCourses: 'Fizik, Kimya, Biyoloji, Matematik, Tarih, Sosyoloji, Psikoloji, Felsefe, Edebiyat',
    examStyleHint: 'Sayısal derslerde yasa/ispat ve tepkime mekanizmalarını; sözel derslerde dönem, akım, düşünür ve metin analizini öne çıkar.',
  },
  {
    id: 'saglik',
    label: 'Sağlık Bilimleri Fakültesi',
    disciplineLabel: 'Sağlık Bilimleri',
    defaultMode: 'hybrid',
    sampleCourses: 'Hemşirelik, Fizyoterapi ve Rehabilitasyon, Beslenme ve Diyetetik, Ebelik, Eczacılık',
    examStyleHint: 'Klinik protokoller, bakım/rehabilitasyon basamakları, fizyolojik mekanizmalar ve hasta güvenliği kritiklerini vurgula.',
  },
  {
    id: 'isletme',
    label: 'İşletme Fakültesi',
    disciplineLabel: 'Finans & İşletme',
    defaultMode: 'hybrid',
    sampleCourses: 'Finansal Muhasebe, Pazarlama, Stratejik Yönetim, Kurumsal Finans, İK, Üretim/Lojistik',
    examStyleHint: 'Yönetsel modeller, finansal oran/değerleme adımları, stratejik analiz çerçeveleri ve vaka karar kriterlerini netleştir.',
  },
  {
    id: 'spor',
    label: 'Spor Bilimleri Fakültesi',
    disciplineLabel: 'Spor Bilimleri',
    defaultMode: 'hybrid',
    sampleCourses: 'Egzersiz Fizyolojisi, Spor Biyomekaniği, Antrenman Bilimi, Kinesiyoloji, Motor Öğrenme',
    examStyleHint: 'Enerji sistemleri (ATP-PC, anaerobik, aerobik), kas-eklem biyomekaniği, antrenman yüklenme ilkeleri ve performans adaptasyonlarını netleştir.',
  },
  {
    id: 'ziraat',
    label: 'Ziraat Fakültesi',
    disciplineLabel: 'Ziraat & Tarım Bilimleri',
    defaultMode: 'hybrid',
    sampleCourses: 'Toprak Bilimi, Bitki Koruma, Tarla/Bahçe Bitkileri, Zootekni, Bitki Besleme, Tarım Ekonomisi',
    examStyleHint: 'Bitki fizyolojisi, toprak-su-besin dengesi, hastalık/zararlı ayırt edicileri ve tarımsal verim faktörlerini sistematik özetle.',
  },
  {
    id: 'hukuk',
    label: 'Hukuk Fakültesi',
    disciplineLabel: 'Hukuk & Kamu Yönetimi',
    defaultMode: 'verbal',
    sampleCourses: 'Medeni Hukuk, Borçlar Hukuku, Ceza Hukuku, Ticaret Hukuku, Anayasa ve İdare Hukuku',
    examStyleHint: 'Kanun maddeleri, unsurlar, istisnalar, süreler, yaptırım türleri ve pratik olay çözüm mantığını öne çıkar.',
  },
];

export function getFacultyCatalogItem(facultyId?: string): FacultyCatalogItem {
  if (!facultyId) return FACULTY_CATALOG[0];
  return (
    FACULTY_CATALOG.find(
      (f) => f.id === facultyId || f.label.toLowerCase() === facultyId.toLowerCase() || f.disciplineLabel.toLowerCase() === facultyId.toLowerCase(),
    ) || FACULTY_CATALOG[0]
  );
}

export function detectDiscipline(text: string, course?: string, explicitFaculty?: string): string {
  if (explicitFaculty && explicitFaculty !== 'auto') {
    const matched = getFacultyCatalogItem(explicitFaculty);
    if (matched.id !== 'auto') return matched.disciplineLabel;
  }

  const hay = `${course || ''} ${text.slice(0, 12_000)}`.toLocaleLowerCase('tr-TR');
  const rules: Array<[string, RegExp]> = [
    [
      'Hukuk & Kamu Yönetimi',
      /\b(kanun|anayasa|yargıtay|danıştay|madde\s*\d+|hukuk|borçlar|ceza|medeni|idare|ticaret\s+hukuku|icra|mahkeme|sözleşme|tüzel|yaptırım|müeyyide|tbk|tmk|tck|mevzuat|içtihat|ehliyet|butlan|zilyetlik|mülkiyet|miras|haksız\s+fiil)\b/g,
    ],
    [
      'Uluslararası İlişkiler',
      /\b(uluslararası\s+ilişkiler|diplomasi|dış\s+politika|jeopolitik|realizm|neorealizm|konstrüktivizm|birleşmiş\s+milletler|nato|avrupa\s+birliği|soğuk\s+savaş|uluslararası\s+örgüt|güvenlik\s+ikilemi|hegemonya|dışişleri|antlaşma)\b/g,
    ],
    [
      'Siyaset Bilimi ve Kamu Yönetimi',
      /\b(siyaset\s+bilimi|kamu\s+yönetimi|kamu\s+politikası|bürokrasi|yerel\s+yönetim|belediye|parlamenter\s+sistem|başkanlık\s+sistemi|siyasal\s+düşünceler|seçim\s+sistemi|siyasal\s+parti|demokrasi|egemenlik|kuvvetler\s+ayrılığı|yönetişim|merkezi\s+yönetim)\b/g,
    ],
    [
      'Eğitim Bilimleri',
      /\b(eğitim\s+bilimleri|pedagoji|öğretim\s+ilke|öğretim\s+yöntem|müfredat|program\s+geliştirme|ölçme\s+ve\s+değerlendirme|geçerlik|güvenirlik|gelişim\s+psikolojisi|öğrenme\s+psikolojisi|sınıf\s+yönetimi|rehberlik|pdr|özel\s+eğitim|bloom\s+taksonomi|yapılandırmacılık|piaget|vygotsky|öğretmenlik)\b/g,
    ],
    [
      'Tıp Bilimleri',
      /\b(tıp|anatomi|fizyoloji|patoloji|patofizyoloji|farmakoloji|histoloji|embriyoloji|immünoloji|mikrobiyoloji|dahiliye|kardiyoloji|nöroloji|pediatri|cerrahi|endokrinoloji|semptom|etiyoloji|prognoz|sendrom|ayırıcı\s+tanı|biyokimya|hücre\s+zarı|mitokondri|metabolizma)\b/g,
    ],
    [
      'Sağlık Bilimleri',
      /\b(sağlık\s+bilimleri|hemşirelik|fizyoterapi|rehabilitasyon|beslenme\s+ve\s+diyetetik|diyetetik|ebelik|eczacılık|diş\s+hekimliği|ergoterapi|odyoloji|hasta\s+bakımı|halk\s+sağlığı|epidemiyoloji|vital\s+bulgu|klinik\s+beslenme|farmasötik|antropometri)\b/g,
    ],
    [
      'Spor Bilimleri',
      /\b(spor\s+bilimleri|antrenörlük|beden\s+eğitimi|egzersiz\s+fizyolojisi|spor\s+biyomekaniği|kinesiyoloji|motor\s+öğrenme|spor\s+psikolojisi|spor\s+yönetimi|rekreasyon|aerobik|anaerobik|vo2\s*max|laktat|kas\s+kasılması|hipertrofi|periyotlama|sürat|dayanıklılık|kuvvet\s+antrenmanı)\b/g,
    ],
    [
      'Ziraat & Tarım Bilimleri',
      /\b(ziraat|tarım|bitki\s+koruma|tarla\s+bitkileri|bahçe\s+bitkileri|toprak\s+bilimi|zootekni|bitki\s+besleme|fitopatoloji|entomoloji|sulama|gübreleme|seracılık|tohumculuk|tarım\s+ekonomisi|fotosentez|verim\s+unsurları|organik\s+tarım|hayvansal\s+üretim|peyzaj|toprak\s+ph)\b/g,
    ],
    [
      'Tarih & Siyaset Bilimi',
      /\b(tarih|osmanlı|cumhuriyet|inkılap|devrim|savaş|dönem|padişah|tanzimat|meşrutiyet|siyaset|ideoloji|devlet|rejim|iktisat\s+tarihi|merkantilizm|fizyokrasi|selçuklu|bizans|vakıf|ikta|tımar)\b/g,
    ],
    [
      'Sosyoloji, Psikoloji & Felsefe',
      /\b(sosyoloji|psikoloji|felsefe|antropoloji|etik|epistemoloji|ontoloji|bilişsel|davranış|toplum|kültür|norm|statü|rol|durkheim|weber|marx|freud|kant|platon|aristoteles|algı|bellek|motivasyon|kişilik|anomi)\b/g,
    ],
    [
      'Fen-Edebiyat Bilimleri',
      /\b(fen-edebiyat|edebiyat|şiir|roman|hikaye|edebi\s+akım|romantizm|realizm|sembolizm|divan|dilbilim|organik\s+kimya|analitik\s+kimya|kuantum|elektromanyetizma|optik|moleküler\s+biyoloji|genetik|ekoloji|coğrafya|arkeoloji|sanat\s+tarihi)\b/g,
    ],
    [
      'İktisat & Ekonometri',
      /\b(ekonometri|mikroekonomi|makroekonomi|enflasyon|gsyih|elastikiyet|regresyon|ols|merkez\s+bankası|para\s+politikası|maliye\s+politikası|arz|talep|fayda|denge|is-lm|solow|keynes|tcmb|iktisat|para\s+teorisi)\b/g,
    ],
    [
      'Finans & İşletme',
      /\b(finans|işletme|bilanço|nakit\s+akışı|iskonto|npv|irr|capm|portföy|hisse|tahvil|türev|opsiyon|pazarlama|yönetim|organizasyon|muhasebe|maliyet|kârlılık|roe|stratejik\s+yönetim|insan\s+kaynakları|tedarik\s+zinciri|girişimcilik)\b/g,
    ],
    [
      'Bilgisayar & Mühendislik',
      /\b(mühendislik|algoritma|veri\s+yapısı|veri\s+yapıları|kompleksite|karmaşıklığı|big-o|python|java|sql|veritabanı|network|makine\s+öğrenmesi|derin\s+öğrenme|yapay\s+zeka|devre|termodinamik|mukavemet|yazılım|akışkanlar\s+mekaniği|statik|dinamik|sinyal\s+işleme|kontrol\s+sistemleri)\b/g,
    ],
    [
      'Matematik & İstatistik',
      /\b(teorem|ispat|integral|türev|matris|determinant|özdeğer|olasılık|dağılım|hipotez\s+testi|p-değeri|varyans|kovaryans|limit|diferansiyel|kalkülüs|lineer\s+cebir)\b/g,
    ],
  ];

  let bestLabel = 'Üniversite Akademik Çalışma';
  let bestScore = 0;

  for (const [label, regex] of rules) {
    const matches = hay.match(regex);
    const score = matches ? matches.length : 0;
    if (score > bestScore) {
      bestScore = score;
      bestLabel = label;
    }
  }
  return bestLabel;
}

export function classifyStudyDomain(
  text: string,
  course?: string,
  title?: string,
  explicitFaculty?: string,
): { discipline: string; mode: AcademicDomainMode; examStyleHint: string } {
  const fullCourse = [course, title].filter(Boolean).join(' ');
  const discipline = detectDiscipline(text, fullCourse, explicitFaculty);
  const facultyItem =
    explicitFaculty && explicitFaculty !== 'auto'
      ? getFacultyCatalogItem(explicitFaculty)
      : FACULTY_CATALOG.find((f) => f.disciplineLabel === discipline) || FACULTY_CATALOG[0];

  const sample = text.slice(0, 14_000);
  const lowerHeader = `${fullCourse} ${sample.slice(0, 1400)}`.toLocaleLowerCase('tr-TR');

  const mathSignals = (
    sample.match(
      /(\$\$[^$]+\$\$|\$[^$\n]+\$|\\frac|\\sum|\\int|\\partial|\b[a-zA-Z]\s*=\s*[-+0-9a-zA-Z(]|\d+\s*[*/=]\s*\d+|d[xy]\s*\/\s*d[xt])/g,
    ) || []
  ).length;

  const strongVerbalTopic =
    /\b(hukuk|anayasa|borçlar|ceza|medeni|idare|tarih|sosyoloji|psikoloji|felsefe|edebiyat|siyaset|uluslararası\s+ilişkiler|kamu\s+yönetimi|iktisat\s+tarihi|iktisadi\s+düşünceler|ekonomi\s+tarihi|kalkınma\s+iktisadı|kuram|doktrin|yönetim\s+ve\s+organizasyon|insan\s+kaynakları|pazarlama|eğitim|etik|iletişim)\b/.test(
      lowerHeader,
    );

  if (
    discipline === 'Hukuk & Kamu Yönetimi' ||
    discipline === 'Siyaset Bilimi ve Kamu Yönetimi' ||
    discipline === 'Uluslararası İlişkiler' ||
    discipline === 'Eğitim Bilimleri' ||
    discipline === 'Tarih & Siyaset Bilimi' ||
    discipline === 'Sosyoloji, Psikoloji & Felsefe'
  ) {
    return {
      discipline,
      mode: mathSignals >= 8 ? 'hybrid' : 'verbal',
      examStyleHint: facultyItem.examStyleHint,
    };
  }

  if (strongVerbalTopic && mathSignals < 4) {
    return { discipline, mode: 'verbal', examStyleHint: facultyItem.examStyleHint };
  }

  if (
    discipline === 'Matematik & İstatistik' ||
    discipline === 'Bilgisayar & Mühendislik' ||
    mathSignals >= 6
  ) {
    return { discipline, mode: 'quantitative', examStyleHint: facultyItem.examStyleHint };
  }

  if (discipline === 'Üniversite Akademik Çalışma' && mathSignals === 0 && sample.length > 180) {
    return { discipline, mode: 'verbal', examStyleHint: facultyItem.examStyleHint };
  }

  return { discipline, mode: 'hybrid', examStyleHint: facultyItem.examStyleHint };
}

export function isLargeStudyBundle(bundle: Pick<ProcessedStudyBundle, 'totalWords' | 'totalPagesOrSlides' | 'sourceCount' | 'totalChars'>): boolean {
  return (
    bundle.totalWords >= 2800 ||
    bundle.totalPagesOrSlides >= 12 ||
    bundle.sourceCount >= 2 ||
    bundle.totalChars >= 18_000
  );
}

export interface FullOutlineAnchor {
  heading: string;
  positionRatio: number;
  pageHint?: string;
  excerpt: string;
}

/**
 * Scans the ENTIRE document from start (0%) to finish (100%) to capture all structural
 * chapters/headings so heavy multi-page PDFs and multi-note uploads never drop later sections.
 */
export function extractFullDocumentOutline(text: string, maxHeadings = 22): FullOutlineAnchor[] {
  const clean = text.trim();
  if (!clean) return [];
  const totalLen = Math.max(1, clean.length);
  const lines = clean.split('\n');
  const anchors: FullOutlineAnchor[] = [];
  const seen = new Set<string>();

  let offset = 0;
  let currentPage: string | undefined;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trim();
    const pageMatch = line.match(/^---\s*(Sayfa|Slayt)\s+(\d+)\s*---$/i);
    if (pageMatch) {
      currentPage = `${pageMatch[1]} ${pageMatch[2]}`;
      offset += raw.length + 1;
      continue;
    }

    const sourceMatch = line.match(/^===\s*KAYNAK\s+\d+:\s*(.+?)\s*===$/i);
    if (sourceMatch) {
      const heading = sourceMatch[1].trim();
      const key = heading.toLocaleLowerCase('tr-TR');
      if (!seen.has(key) && heading.length >= 3) {
        seen.add(key);
        anchors.push({
          heading,
          positionRatio: Number((offset / totalLen).toFixed(3)),
          pageHint: currentPage,
          excerpt: clean.slice(offset + raw.length, offset + raw.length + 240).replace(/\s+/g, ' ').trim(),
        });
      }
      offset += raw.length + 1;
      continue;
    }

    if (line.length >= 4 && line.length <= 95) {
      const isMarkdownHeading = /^#{1,4}\s+/.test(line);
      const isNumberedHeading = /^(\d+(\.\d+){0,2}|[IVX]+\.)\s+[A-ZÇĞİÖŞÜ]/.test(line);
      const isColonTitle = /^[A-ZÇĞİÖŞÜ][^.!?]{3,55}:$/.test(line);
      const isUpperShort =
        line.length >= 6 &&
        line.length <= 65 &&
        line === line.toUpperCase() &&
        /[A-ZÇĞİÖŞÜ]{3}/.test(line) &&
        !/^\d+$/.test(line);

      if (isMarkdownHeading || isNumberedHeading || isColonTitle || isUpperShort) {
        const cleaned = line.replace(/^#{1,4}\s+/, '').replace(/:$/, '').trim();
        const key = cleaned.toLocaleLowerCase('tr-TR');
        if (!seen.has(key) && cleaned.length >= 4) {
          seen.add(key);
          anchors.push({
            heading: cleaned,
            positionRatio: Number((offset / totalLen).toFixed(3)),
            pageHint: currentPage,
            excerpt: clean.slice(offset + raw.length, offset + raw.length + 240).replace(/\s+/g, ' ').trim(),
          });
        }
      }
    }
    offset += raw.length + 1;
  }

  if (anchors.length <= maxHeadings) return anchors;

  // Uniformly downsample headings from start to finish so late chapters are never dropped
  const sampled: FullOutlineAnchor[] = [];
  for (let i = 0; i < maxHeadings; i++) {
    const idx = Math.min(anchors.length - 1, Math.round((i * (anchors.length - 1)) / Math.max(1, maxHeadings - 1)));
    const candidate = anchors[idx];
    if (!sampled.some((s) => s.heading === candidate.heading)) {
      sampled.push(candidate);
    }
  }
  return sampled;
}

/**
 * Deterministically generates or enriches the "Hangi Konulara Bakmalıyım?" study priority map
 * from any summary's sections, teacher emphasis, and key terms so BOTH newly generated
 * and previously saved summaries offer instant exam-priority guidance.
 */
export function buildTopicPriorityGuide(params: {
  sections?: SummarySection[];
  keyTerms?: KeyTermItem[];
  teacherEmphasis?: TeacherEmphasisItem[];
  overview?: string;
  disciplineTag?: string;
}): StudyTopicPriorityItem[] {
  const sections = Array.isArray(params.sections) ? params.sections : [];
  if (sections.length === 0) return [];

  const keyTerms = Array.isArray(params.keyTerms) ? params.keyTerms : [];
  const teacherEmphasis = Array.isArray(params.teacherEmphasis) ? params.teacherEmphasis : [];

  const examSignalRe =
    /\b(sınav|vize|final|kritik|önemli|temel|istisna|fark|karşılaştır|koşul|kural|yasa|teorem|formül|tanı|sendrom|etiyoloji|mekanizma|neden|sonuç|ilke|kavram|süreç|aşam|tuzak|dikkat)\b/gi;

  const scored = sections.map((sec, idx) => {
    const body = `${sec.heading || ''} ${sec.content || ''} ${(sec.takeaways || []).join(' ')} ${(sec.commonPitfalls || []).join(' ')}`;
    const lower = body.toLocaleLowerCase('tr-TR');

    const matchedTerms = keyTerms.filter(
      (kt) => kt.term && lower.includes(kt.term.toLocaleLowerCase('tr-TR')),
    );
    const matchedEmphasis = teacherEmphasis.filter(
      (te) =>
        te.point &&
        (lower.includes(te.point.toLocaleLowerCase('tr-TR')) ||
          te.point.toLocaleLowerCase('tr-TR').includes((sec.heading || '').toLocaleLowerCase('tr-TR').slice(0, 12))),
    );

    const hasHighEmphasis = matchedEmphasis.some((te) =>
      String(te.examProbability || '').toLocaleLowerCase('tr-TR').includes('yüksek'),
    );
    const hasTable = /\|.+\|.+\|/.test(sec.content || '');
    const hasFormula = /\$[^$]+\$|\\frac|=/.test(sec.content || '');
    const pitfallsCount = Array.isArray(sec.commonPitfalls) ? sec.commonPitfalls.length : 0;
    const examSignals = (body.match(examSignalRe) || []).length;
    const wordCount = countWords(sec.content || '');

    let score =
      matchedTerms.length * 3 +
      matchedEmphasis.length * 5 +
      (hasHighEmphasis ? 7 : 0) +
      (hasTable ? 3 : 0) +
      (hasFormula ? 3 : 0) +
      pitfallsCount * 2 +
      Math.min(8, examSignals) +
      Math.min(4, Math.floor(wordCount / 140));

    // Give core foundational sections a slight boost
    if (idx === 0) score += 2;

    const likelyQuestionType = hasFormula
      ? 'Uygulama / Formül & Yorum'
      : hasTable
      ? 'Karşılaştırma & Ayırt Edici Fark'
      : pitfallsCount > 0
      ? 'Kavram Tuzağı & Çoktan Seçmeli'
      : 'Kavramsal Tanım & Klasik Yorum';

    const focusConcepts = Array.from(
      new Set([
        ...matchedTerms.map((t) => t.term),
        ...matchedEmphasis.map((te) => te.point),
        ...(sec.takeaways || []).slice(0, 2).map((t) => t.split(/[:–-]/)[0].trim().slice(0, 42)),
      ]),
    )
      .filter((c) => c && c.length >= 3)
      .slice(0, 4);

    const estimatedMinutes = Math.max(4, Math.min(20, Math.round(wordCount / 75) + (hasFormula || hasTable ? 3 : 2)));

    const reasonParts: string[] = [];
    if (hasHighEmphasis && matchedEmphasis[0]) {
      reasonParts.push(`Yüksek sınav potansiyelli "${matchedEmphasis[0].point}" vurgusunu içerir`);
    } else if (matchedTerms.length >= 2) {
      reasonParts.push(`${matchedTerms.length} temel sınav terimini (${matchedTerms.slice(0, 2).map((t) => t.term).join(', ')}) kapsar`);
    }
    if (hasTable) reasonParts.push('karşılaştırma ve ayrım tablosu barındırır');
    if (hasFormula) reasonParts.push('sayısal/analitik ilişki veya formül içerir');
    if (pitfallsCount > 0) reasonParts.push('sınavda sık karıştırılan kavram tuzaklarına dikkat çeker');
    if (reasonParts.length === 0) {
      reasonParts.push(
        sec.takeaways?.[0]?.slice(0, 120) ||
          'Konunun bütünlüğünü anlamak ve yorum sorularında bağlam kurmak için gereklidir',
      );
    }

    const reason =
      reasonParts[0].charAt(0).toLocaleUpperCase('tr-TR') +
      reasonParts[0].slice(1) +
      (reasonParts.length > 1 ? `; ${reasonParts.slice(1).join(', ')}.` : '.');

    return {
      sectionIndex: idx,
      topic: sec.heading || `Bölüm ${idx + 1}`,
      score,
      estimatedMinutes,
      focusConcepts,
      likelyQuestionType,
      reason,
    };
  });

  const sortedByScore = [...scored].sort((a, b) => b.score - a.score || a.sectionIndex - b.sectionIndex);
  const criticalCount = Math.max(1, Math.min(4, Math.ceil(sections.length * 0.38)));
  const importantCount = Math.max(1, Math.ceil(sections.length * 0.35));

  return sortedByScore.map((item, rank) => {
    const priority: TopicPriorityLevel =
      rank < criticalCount ? 'critical' : rank < criticalCount + importantCount ? 'important' : 'review';
    return {
      topic: item.topic,
      priority,
      reason: item.reason,
      estimatedMinutes: item.estimatedMinutes,
      focusConcepts: item.focusConcepts,
      likelyQuestionType: item.likelyQuestionType,
      sectionIndex: item.sectionIndex,
    };
  });
}

export function extractOutlinePreview(text: string, maxHeadings = 14): string[] {
  const headings: string[] = [];
  const seen = new Set<string>();
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  for (const line of lines) {
    if (headings.length >= maxHeadings) break;
    // Skip page markers and trivial footers
    if (/^---\s*(Sayfa|Slayt)\s+\d+\s*---$/i.test(line)) continue;
    if (/^===\s*KAYNAK/i.test(line)) continue;
    if (line.length < 4 || line.length > 95) continue;

    const isMarkdownHeading = /^#{1,4}\s+/.test(line);
    const isNumberedHeading = /^(\d+(\.\d+){0,2}|[IVX]+\.)\s+[A-ZÇĞİÖŞÜ]/.test(line);
    const isColonTitle = /^[A-ZÇĞİÖŞÜ][^.!?]{3,55}:$/.test(line);
    const isUpperShort =
      line.length >= 6 &&
      line.length <= 65 &&
      line === line.toUpperCase() &&
      /[A-ZÇĞİÖŞÜ]{3}/.test(line) &&
      !/^\d+$/.test(line);

    if (isMarkdownHeading || isNumberedHeading || isColonTitle || isUpperShort) {
      const cleaned = line.replace(/^#{1,4}\s+/, '').replace(/:$/, '').trim();
      const key = cleaned.toLowerCase();
      if (!seen.has(key) && cleaned.length >= 4) {
        seen.add(key);
        headings.push(cleaned);
      }
    }
  }

  return headings;
}

export function sampleUniformContext(text: string, maxChars = 70_000): string {
  const clean = text.trim();
  if (clean.length <= maxChars) return clean;
  const sliceCount = clean.length > 45_000 ? 11 : 7;
  const overheadPerSlice = 48;
  const perSlice = Math.max(400, Math.floor(maxChars / sliceCount) - overheadPerSlice);
  const maxStart = Math.max(0, clean.length - perSlice);
  const parts: string[] = [];
  for (let i = 0; i < sliceCount; i++) {
    const start =
      i === sliceCount - 1
        ? maxStart
        : Math.floor((maxStart * i) / Math.max(1, sliceCount - 1));
    const pct = Math.round((start / Math.max(1, clean.length)) * 100);
    parts.push(`[--- KESİT ${i + 1}/${sliceCount} (~%${pct}) ---]\n${clean.slice(start, start + perSlice)}`);
  }
  return parts.join('\n\n').slice(0, maxChars);
}

export function sliceContextForSection(
  combinedText: string,
  sectionTitle: string,
  sectionIndex: number,
  totalSections: number,
  focusPoints: string[] = [],
  maxSliceChars = 14_000,
): string {
  const clean = combinedText.trim();
  if (clean.length <= maxSliceChars) return clean;

  // Prefer exact heading/title anchor anywhere in huge documents before falling back to proportional position
  const normalizedTitle = sectionTitle
    .replace(/^\d+(\.\d+)*\.?\s*/, '')
    .trim()
    .toLocaleLowerCase('tr-TR');
  const lowerClean = clean.toLocaleLowerCase('tr-TR');
  let posStart = -1;
  if (normalizedTitle.length >= 6) {
    const anchorIdx = lowerClean.indexOf(normalizedTitle.slice(0, 32));
    if (anchorIdx >= 0) {
      posStart = Math.max(0, anchorIdx - 280);
    }
  }
  if (posStart < 0) {
    const ratioStart = Math.max(0, sectionIndex / Math.max(1, totalSections) - 0.06);
    posStart = Math.floor(clean.length * ratioStart);
  }
  const positionalSlice = clean.slice(posStart, posStart + Math.floor(maxSliceChars * 0.62));

  // Keyword scan across paragraphs for sectionTitle + focusPoints
  const keywords = `${sectionTitle} ${focusPoints.join(' ')}`
    .toLocaleLowerCase('tr-TR')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3);

  if (keywords.length === 0) return clean.slice(posStart, posStart + maxSliceChars);

  const paragraphs = clean.split(/\n{2,}/).filter((p) => p.trim().length > 20);
  const scored = paragraphs.map((p, idx) => {
    const lower = p.toLocaleLowerCase('tr-TR');
    let score = 0;
    for (const kw of keywords) {
      if (lower.includes(kw)) score += 1;
    }
    return { p, idx, score };
  });

  scored.sort((a, b) => b.score - a.score || a.idx - b.idx);
  const matchedChunks: string[] = [];
  let budget = Math.floor(maxSliceChars * 0.38);
  for (const item of scored) {
    if (item.score <= 0 || budget <= 0) break;
    if (positionalSlice.includes(item.p.slice(0, 80))) continue;
    matchedChunks.push(item.p.slice(0, budget));
    budget -= item.p.length + 2;
  }

  return [positionalSlice, ...matchedChunks].filter(Boolean).join('\n\n').slice(0, maxSliceChars);
}

export async function extractUploadedSource(
  file: File,
  onProgress?: (pct: number, label: string) => void,
): Promise<ExtractedSourceItem> {
  const extracted = await extractFile(file, onProgress);
  const cleanName = file.name.replace(/\.[^.]+$/, '');

  if (extracted.kind === 'image') {
    let ocrText = '';
    try {
      onProgress?.(60, 'Görsel üzerindeki yazılar ve formüller okunuyor...');
      const { extractMathTextFromImages } = await import('@/lib/imageMathOcr');
      ocrText = await Promise.race([
        extractMathTextFromImages(
          [
            {
              id: `img-${Date.now()}`,
              name: file.name,
              mimeType: extracted.mime,
              dataUrl: `data:${extracted.mime};base64,${extracted.data}`,
            },
          ],
          () => {},
        ),
        new Promise<string>((resolve) => setTimeout(() => resolve(''), 12_000)),
      ]);
    } catch {
      ocrText = '';
    }

    const bodyText =
      ocrText.trim() || `[Görsel Ders Notu: ${file.name} — Görsel Zekâ ile Doğrudan Analiz Edilecek]`;
    onProgress?.(98, 'Görsel kaynağı eklendi.');
    return {
      id: `file-${file.name}-${file.size}-${Date.now()}`,
      name: cleanName,
      kind: 'file',
      text: bodyText,
      pagesOrSlides: 1,
      wordCount: countWords(bodyText),
      charCount: bodyText.length,
      isScannedOcr: true,
      images: [{ data: extracted.data, mimeType: extracted.mime, pageLabel: cleanName }],
    };
  }

  if (extracted.kind === 'audio') {
    const bodyText = `[Ses Kaydı: ${file.name} (${Math.max(
      1,
      Math.round(file.size / (1024 * 1024)),
    )} MB) — Sunucu Transkripsiyon Motoruna Hazır]`;
    return {
      id: `file-${file.name}-${file.size}-${Date.now()}`,
      name: cleanName,
      kind: 'file',
      text: bodyText,
      pagesOrSlides: 1,
      wordCount: countWords(bodyText),
      charCount: bodyText.length,
      audio: { data: extracted.data, mimeType: extracted.mime },
    };
  }

  return {
    id: `file-${file.name}-${file.size}-${Date.now()}`,
    name: cleanName,
    kind: 'file',
    text: extracted.text,
    pagesOrSlides: estimatePagesOrSlides(extracted.text, extracted.pages),
    wordCount: countWords(extracted.text),
    charCount: extracted.text.length,
    isScannedOcr: extracted.isScannedOcr,
    images: extracted.images,
  };
}

export function buildNoteSourceItem(
  note: NoteSourceOption,
  extraExtractedText?: string,
  extraImages?: ExtractedImagePage[],
): ExtractedSourceItem {
  const baseParts = [
    note.title ? `Başlık: ${note.title}` : '',
    note.course ? `Ders: ${note.course}` : '',
    note.description || '',
    note.content || '',
    extraExtractedText || '',
  ]
    .map((s) => s.trim())
    .filter(Boolean);

  const combined = baseParts.join('\n\n');
  return {
    id: `note-${note.origin}-${note.id}`,
    name: note.title,
    kind: 'note',
    originNoteId: note.id,
    originType: note.origin,
    course: note.course,
    text: combined,
    pagesOrSlides: estimatePagesOrSlides(combined),
    wordCount: countWords(combined),
    charCount: combined.length,
    images: extraImages,
  };
}

export function buildPastedSourceItem(
  title: string,
  pastedText: string,
  course?: string,
): ExtractedSourceItem {
  const clean = pastedText.trim();
  const label = title.trim() || 'Yapıştırılan Ders Metni';
  return {
    id: `pasted-${Date.now()}`,
    name: label,
    kind: 'pasted',
    course: course || null,
    text: clean,
    pagesOrSlides: estimatePagesOrSlides(clean),
    wordCount: countWords(clean),
    charCount: clean.length,
  };
}

export function combineStudySources(
  items: ExtractedSourceItem[],
  explicitTitle?: string,
  explicitCourse?: string,
): ProcessedStudyBundle {
  const validItems = items.filter((item) => item.text.trim().length > 0 || (item.images?.length || 0) > 0 || !!item.audio);
  if (validItems.length === 0) {
    return {
      title: explicitTitle?.trim() || 'Çalışma Seti',
      course: explicitCourse?.trim() || '',
      combinedText: '',
      totalWords: 0,
      totalChars: 0,
      totalPagesOrSlides: 0,
      sourceCount: 0,
      detectedDiscipline: 'Üniversite Akademik Çalışma',
      outlinePreview: [],
      images: [],
      sources: [],
      hasScannedOcr: false,
    };
  }

  const combinedText =
    validItems.length === 1
      ? validItems[0].text
      : validItems
          .map(
            (src, idx) =>
              `=== KAYNAK ${idx + 1}: ${src.name}${src.course ? ` (${src.course})` : ''} ===\n${src.text}`,
          )
          .join('\n\n');

  const images = validItems
    .flatMap((s) => s.images || [])
    .slice(0, 8);
  const audio = validItems.find((s) => s.audio)?.audio;

  const inferredCourse =
    explicitCourse?.trim() ||
    validItems.find((s) => s.course && s.course.trim().length > 0)?.course?.trim() ||
    '';

  const inferredTitle =
    explicitTitle?.trim() ||
    (validItems.length === 1
      ? validItems[0].name
      : `${validItems[0].name} + ${validItems.length - 1} Kaynak`);

  const totalWords = validItems.reduce((sum, s) => sum + s.wordCount, 0);
  const totalPagesOrSlides = validItems.reduce((sum, s) => sum + s.pagesOrSlides, 0);

  return {
    title: inferredTitle,
    course: inferredCourse,
    combinedText,
    totalWords,
    totalChars: combinedText.length,
    totalPagesOrSlides,
    sourceCount: validItems.length,
    detectedDiscipline: detectDiscipline(combinedText, inferredCourse),
    outlinePreview: extractOutlinePreview(combinedText, 14),
    images,
    audio,
    sources: validItems,
    hasScannedOcr: validItems.some((s) => Boolean(s.isScannedOcr)),
  };
}
