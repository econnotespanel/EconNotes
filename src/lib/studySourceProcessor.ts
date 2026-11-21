import { extractFile, type ExtractedImagePage } from '@/lib/extractFile';
import {
  detectCourseIdentity,
  foldTurkishToAscii,
  isGenericCoursePlaceholder,
} from '@/lib/courseDetector';
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

  // Primary: delegate to Unicode-safe Turkish course identity detector so specific courses
  // (Para Teorisi, Hukuk, İstatistik, Mikro İktisat, etc.) are never misrouted by broken ASCII \b regexes.
  const identity = detectCourseIdentity({
    text: text || '',
    fileNameOrTitle: undefined,
    explicitCourse: !isGenericCoursePlaceholder(course) ? course : undefined,
  });

  if (identity.course && identity.discipline) {
    // Map economics sub-courses cleanly to broader faculty label ONLY for broad discipline tagging,
    // while keeping exact course name in identity.course everywhere in the UI and AI prompts.
    const d = identity.discipline;
    if (
      d === 'Para Teorisi ve Politikası' ||
      d === 'Mikro İktisat' ||
      d === 'Makro İktisat' ||
      d === 'Ekonometri' ||
      d === 'Kamu Maliyesi' ||
      d === 'Uluslararası İktisat'
    ) {
      return 'İktisat & Ekonometri';
    }
    if (d === 'Hukuk') {
      return 'Hukuk & Kamu Yönetimi';
    }
    if (d === 'Tarih & İktisat Tarihi' || d === 'Tarih') {
      return 'Tarih & Siyaset Bilimi';
    }
    return d;
  }

  // Fallback check on folded text for short snippets (e.g. 1-line unit test strings)
  const hay = foldTurkishToAscii(`${course || ''} ${(text || '').slice(0, 16_000)}`);
  const rules: Array<[string, RegExp]> = [
    [
      'Hukuk & Kamu Yönetimi',
      /(?<![a-z0-9])(kanun|anayasa|yargitay|danistay|madde\s*\d+|hukuk|borclar|ceza|medeni|idare|ticaret\s+hukuku|icra|mahkeme|sozlesme|tuzel|yaptirim|mueyyide|tbk|tmk|tck|mevzuat|ictihat|ehliyet|butlan|zilyetlik|mulkiyet|miras|haksiz\s+fiil)[a-z]{0,7}(?![a-z0-9])/g,
    ],
    [
      'Matematik & İstatistik',
      /(?<![a-z0-9])(istatistik|olasilik|dagilim|hipotez\s+test|p-deger|varyans|standart\s+sapma|kovaryans|korelasyon|anova|ki-kare|bayes|teorem|ispat|integral|turev|matris|determinant|ozdeger|limit|diferansiyel|kalkulus|lineer\s+cebir)[a-z]{0,7}(?![a-z0-9])/g,
    ],
    [
      'Uluslararası İlişkiler',
      /(?<![a-z0-9])(uluslararasi\s+iliskiler|diplomasi|dis\s+politika|jeopolitik|realizm|neorealizm|konstruktivizm|birlesmis\s+milletler|nato|avrupa\s+birligi|soguk\s+savas|uluslararasi\s+orgut|guvenlik\s+ikilemi|hegemonya)[a-z]{0,7}(?![a-z0-9])/g,
    ],
    [
      'Siyaset Bilimi ve Kamu Yönetimi',
      /(?<![a-z0-9])(siyaset\s+bilimi|kamu\s+yonetimi|kamu\s+politikasi|burokrasi|yerel\s+yonetim|belediye|parlamenter\s+sistem|baskanlik\s+sistemi|siyasal\s+dusunceler|secim\s+sistemi|demokrasi|egemenlik|kuvvetler\s+ayriligi|yonetisim)[a-z]{0,7}(?![a-z0-9])/g,
    ],
    [
      'Eğitim Bilimleri',
      /(?<![a-z0-9])(egitim\s+bilimleri|pedagoji|ogretim\s+ilke|ogretim\s+yontem|mufredat|program\s+gelistirme|olcme\s+ve\s+degerlendirme|gecerlik|guvenirlik|gelisim\s+psikolojisi|ogrenme\s+psikolojisi|sinif\s+yonetimi|rehberlik|bloom\s+taksonomi|yapilandirmacilik|piaget|vygotsky)[a-z]{0,7}(?![a-z0-9])/g,
    ],
    [
      'Tıp Bilimleri',
      /(?<![a-z0-9])(anatomi|fizyoloji|patoloji|patofizyoloji|farmakoloji|histoloji|embriyoloji|immunoloji|mikrobiyoloji|dahiliye|kardiyoloji|noroloji|pediatri|cerrahi|endokrinoloji|semptom|etiyoloji|prognoz|sendrom|ayirici\s+tani|biyokimya)[a-z]{0,7}(?![a-z0-9])/g,
    ],
    [
      'Sağlık Bilimleri',
      /(?<![a-z0-9])(saglik\s+bilimleri|hemsirelik|fizyoterapi|rehabilitasyon|beslenme\s+ve\s+diyetetik|diyetetik|ebelik|eczacilik|ergoterapi|odyoloji|hasta\s+bakimi|halk\s+sagligi|epidemiyoloji|vital\s+bulgu)[a-z]{0,7}(?![a-z0-9])/g,
    ],
    [
      'Spor Bilimleri',
      /(?<![a-z0-9])(spor\s+bilimleri|antrenorluk|beden\s+egitimi|egzersiz\s+fizyolojisi|spor\s+biyomekanigi|kinesiyoloji|motor\s+ogrenme|spor\s+psikolojisi|vo2\s*max|laktat|hipertrofi|periyotlama)[a-z]{0,7}(?![a-z0-9])/g,
    ],
    [
      'Ziraat & Tarım Bilimleri',
      /(?<![a-z0-9])(ziraat|tarim|bitki\s+koruma|tarla\s+bitkileri|bahce\s+bitkileri|toprak\s+bilimi|zootekni|bitki\s+besleme|fitopatoloji|entomoloji|sulama|gubreleme|seracilik|tohumculuk)[a-z]{0,7}(?![a-z0-9])/g,
    ],
    [
      'Tarih & Siyaset Bilimi',
      /(?<![a-z0-9])(tarih|osmanli|cumhuriyet|inkilap|padisah|tanzimat|mesrutiyet|iktisat\s+tarihi|merkantilizm|fizyokrasi|selcuklu|bizans|timar)[a-z]{0,7}(?![a-z0-9])/g,
    ],
    [
      'Sosyoloji, Psikoloji & Felsefe',
      /(?<![a-z0-9])(sosyoloji|psikoloji|felsefe|antropoloji|epistemoloji|ontoloji|durkheim|weber|freud|kant|platon|aristoteles|anomi)[a-z]{0,7}(?![a-z0-9])/g,
    ],
    [
      'Fen-Edebiyat Bilimleri',
      /(?<![a-z0-9])(edebiyat|siir|roman|edebi\s+akim|dilbilim|organik\s+kimya|analitik\s+kimya|kuantum|elektromanyetizma|molekuler\s+biyoloji|genetik|ekoloji)[a-z]{0,7}(?![a-z0-9])/g,
    ],
    [
      'İktisat & Ekonometri',
      /(?<![a-z0-9])(ekonometri|mikroekonomi|makroekonomi|enflasyon|gsyih|gsyh|elastikiyet|esneklik|merkez\s+bankasi|para\s+politikasi|maliye\s+politikasi|arz\s+ve\s+talep|arz\s+egrisi|talep\s+egrisi|marjinal\s+fayda|piyasa\s+dengesi|is-lm|solow|keynes|tcmb|iktisat|para\s+teorisi|deflasyon|stagflasyon|cari\s+acik|doviz\s+kuru)[a-z]{0,7}(?![a-z0-9])/g,
    ],
    [
      'Finans & İşletme',
      /(?<![a-z0-9])(finans|isletme|bilanco|nakit\s+akisi|iskonto|npv|irr|capm|portfoy|hisse|tahvil|turev|opsiyon|pazarlama|muhasebe|stratejik\s+yonetim|insan\s+kaynaklari|tedarik\s+zinciri)[a-z]{0,7}(?![a-z0-9])/g,
    ],
    [
      'Bilgisayar & Mühendislik',
      /(?<![a-z0-9])(muhendislik|algoritma|veri\s+yapi|karmasik|big-o|python|java|sql|veritabani|makine\s+ogrenmesi|derin\s+ogrenme|devre|termodinamik|mukavemet|yazilim|akiskanlar\s+mekanigi|kontrol\s+sistemleri)[a-z]{0,7}(?![a-z0-9])/g,
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
  return bestScore >= 2 ? bestLabel : 'Üniversite Akademik Çalışma';
}

export function classifyStudyDomain(
  text: string,
  course?: string,
  title?: string,
  explicitFaculty?: string,
): {
  discipline: string;
  detectedCourse: string | null;
  confidence: 'high' | 'medium' | 'uncertain';
  needsConfirmation: boolean;
  mode: AcademicDomainMode;
  examStyleHint: string;
} {
  const identity = detectCourseIdentity({
    text: text || '',
    fileNameOrTitle: title,
    explicitCourse: !isGenericCoursePlaceholder(course) ? course : undefined,
  });

  const fullCourse = [course, title].filter(Boolean).join(' ');
  const discipline = detectDiscipline(text, fullCourse, explicitFaculty);
  const facultyItem =
    explicitFaculty && explicitFaculty !== 'auto'
      ? getFacultyCatalogItem(explicitFaculty)
      : FACULTY_CATALOG.find((f) => f.disciplineLabel === discipline) || FACULTY_CATALOG[0];

  const resolvedHint = identity.course ? identity.examStyleHint : facultyItem.examStyleHint;
  const resolvedMode =
    explicitFaculty && explicitFaculty !== 'auto'
      ? facultyItem.defaultMode
      : identity.domainMode;

  return {
    discipline,
    detectedCourse: identity.course,
    confidence: identity.confidence,
    needsConfirmation: identity.needsConfirmation,
    mode: resolvedMode,
    examStyleHint: resolvedHint,
  };
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

    const sourceMatch = line.match(/^===\s*KAYNAK\s+\d+(?:\s*\|[^|]*)*:\s*(.+?)\s*===$/i) ||
      line.match(/^===\s*KAYNAK\s+\d+\s*\|\s*DERS:\s*[^|]+\|\s*BELGE:\s*(.+?)\s*===$/i);
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
    const imgDetect = detectCourseIdentity({
      text: bodyText,
      fileNameOrTitle: cleanName,
    });
    onProgress?.(98, 'Görsel kaynağı eklendi.');
    return {
      id: `file-${file.name}-${file.size}-${Date.now()}`,
      name: cleanName,
      kind: 'file',
      course: imgDetect.course,
      detectedCourse: imgDetect.course,
      detectedDiscipline: imgDetect.discipline,
      courseConfidence: imgDetect.confidence,
      courseNeedsConfirmation: imgDetect.needsConfirmation,
      courseCandidates: imgDetect.candidates,
      courseEvidence: imgDetect.evidence,
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
    const audioDetect = detectCourseIdentity({
      text: bodyText,
      fileNameOrTitle: cleanName,
    });
    return {
      id: `file-${file.name}-${file.size}-${Date.now()}`,
      name: cleanName,
      kind: 'file',
      course: audioDetect.course,
      detectedCourse: audioDetect.course,
      detectedDiscipline: audioDetect.discipline,
      courseConfidence: audioDetect.confidence,
      courseNeedsConfirmation: audioDetect.needsConfirmation,
      courseCandidates: audioDetect.candidates,
      courseEvidence: audioDetect.evidence,
      text: bodyText,
      pagesOrSlides: 1,
      wordCount: countWords(bodyText),
      charCount: bodyText.length,
      audio: { data: extracted.data, mimeType: extracted.mime },
    };
  }

  const textDetect = detectCourseIdentity({
    text: extracted.text,
    fileNameOrTitle: cleanName,
  });

  return {
    id: `file-${file.name}-${file.size}-${Date.now()}`,
    name: cleanName,
    kind: 'file',
    course: textDetect.course,
    detectedCourse: textDetect.course,
    detectedDiscipline: textDetect.discipline,
    courseConfidence: textDetect.confidence,
    courseNeedsConfirmation: textDetect.needsConfirmation,
    courseCandidates: textDetect.candidates,
    courseEvidence: textDetect.evidence,
    text: extracted.text,
    pagesOrSlides: estimatePagesOrSlides(extracted.text, extracted.pages),
    totalPagesInFile: extracted.totalPages,
    unreadablePages: extracted.unreadablePages,
    extractionWarnings: extracted.warnings,
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
  extraMeta?: {
    totalPages?: number;
    unreadablePages?: number[];
    warnings?: string[];
  },
): ExtractedSourceItem {
  const baseParts = [
    note.title ? `Başlık: ${note.title}` : '',
    !extraExtractedText && note.description ? note.description : '',
    note.content || '',
    extraExtractedText || '',
  ]
    .map((s) => s.trim())
    .filter(Boolean);

  const combined = baseParts.join('\n\n');
  const detected = detectCourseIdentity({
    text: combined,
    fileNameOrTitle: note.title,
    explicitCourse: !isGenericCoursePlaceholder(note.course) ? note.course : undefined,
  });

  return {
    id: `note-${note.origin}-${note.id}`,
    name: note.title,
    kind: 'note',
    originNoteId: note.id,
    originType: note.origin,
    course: detected.course,
    detectedCourse: detected.course,
    detectedDiscipline: detected.discipline,
    courseConfidence: detected.confidence,
    courseNeedsConfirmation: detected.needsConfirmation,
    courseCandidates: detected.candidates,
    courseEvidence: detected.evidence,
    text: combined,
    pagesOrSlides: estimatePagesOrSlides(combined, extraMeta?.totalPages),
    totalPagesInFile: extraMeta?.totalPages,
    unreadablePages: extraMeta?.unreadablePages,
    extractionWarnings: extraMeta?.warnings,
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
  const detected = detectCourseIdentity({
    text: clean,
    fileNameOrTitle: label,
    explicitCourse: !isGenericCoursePlaceholder(course) ? course : undefined,
  });
  return {
    id: `pasted-${Date.now()}`,
    name: label,
    kind: 'pasted',
    course: detected.course,
    detectedCourse: detected.course,
    detectedDiscipline: detected.discipline,
    courseConfidence: detected.confidence,
    courseNeedsConfirmation: detected.needsConfirmation,
    courseCandidates: detected.candidates,
    courseEvidence: detected.evidence,
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
      detectedCourse: null,
      courseConfidence: 'uncertain',
      sourceCourses: [],
      isMultiCourse: false,
      extractionWarnings: [],
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

  // Evaluate EVERY source independently so earlier sources never contaminate newer sources
  const enrichedItems = validItems.map((src) => {
    const det = detectCourseIdentity({
      text: src.text || '',
      fileNameOrTitle: src.name,
      explicitCourse: !isGenericCoursePlaceholder(src.course) ? src.course : undefined,
      confirmedByUser: Boolean(src.courseConfirmedByUser),
    });
    return {
      ...src,
      course: src.courseConfirmedByUser && !isGenericCoursePlaceholder(src.course) ? src.course : det.course,
      detectedCourse: det.course,
      detectedDiscipline: det.discipline,
      courseConfidence: src.courseConfirmedByUser ? ('high' as const) : det.confidence,
      courseNeedsConfirmation: src.courseConfirmedByUser ? false : det.needsConfirmation,
      courseCandidates: det.candidates,
      courseEvidence: det.evidence,
    };
  });

  const sourceCourses = Array.from(
    new Set(
      enrichedItems
        .map((s) => s.course)
        .filter((c): c is string => Boolean(c && !isGenericCoursePlaceholder(c))),
    ),
  );
  const isMultiCourse = sourceCourses.length > 1;

  const combinedText =
    enrichedItems.length === 1
      ? enrichedItems[0].text
      : enrichedItems
          .map(
            (src, idx) =>
              `=== KAYNAK ${idx + 1}: ${src.name}${src.course ? ` (Ders: ${src.course})` : ''} ===\n${src.text}`,
          )
          .join('\n\n');

  const images = enrichedItems
    .flatMap((s) => s.images || [])
    .slice(0, 10);
  const audio = enrichedItems.find((s) => s.audio)?.audio;

  const inferredCourse = isMultiCourse
    ? sourceCourses.join(' · ')
    : sourceCourses[0] || (!isGenericCoursePlaceholder(explicitCourse) ? explicitCourse!.trim() : '');

  const inferredTitle =
    explicitTitle?.trim() ||
    (enrichedItems.length === 1
      ? enrichedItems[0].name
      : `${enrichedItems[0].name} + ${enrichedItems.length - 1} Kaynak`);

  const totalWords = enrichedItems.reduce((sum, s) => sum + s.wordCount, 0);
  const totalPagesOrSlides = enrichedItems.reduce((sum, s) => sum + s.pagesOrSlides, 0);
  const extractionWarnings = Array.from(
    new Set(enrichedItems.flatMap((s) => s.extractionWarnings || [])),
  );

  const distinctDisciplines = Array.from(
    new Set(
      enrichedItems
        .map((s) => detectDiscipline(s.text, s.course || undefined))
        .filter((d) => d && d !== 'Üniversite Akademik Çalışma'),
    ),
  );

  const resolvedDetectedDiscipline =
    distinctDisciplines.length === 1
      ? distinctDisciplines[0]
      : isMultiCourse
      ? `Çoklu Ders (${sourceCourses.join(', ')})`
      : detectDiscipline(combinedText, inferredCourse);

  return {
    title: inferredTitle,
    course: inferredCourse,
    detectedCourse: inferredCourse || null,
    courseConfidence: enrichedItems.some((s) => s.courseNeedsConfirmation)
      ? 'uncertain'
      : enrichedItems.every((s) => s.courseConfidence === 'high')
      ? 'high'
      : 'medium',
    sourceCourses,
    isMultiCourse,
    extractionWarnings,
    combinedText,
    totalWords,
    totalChars: combinedText.length,
    totalPagesOrSlides,
    sourceCount: enrichedItems.length,
    detectedDiscipline: resolvedDetectedDiscipline,
    outlinePreview: extractOutlinePreview(combinedText, 20),
    images,
    audio,
    sources: enrichedItems,
    hasScannedOcr: enrichedItems.some((s) => Boolean(s.isScannedOcr)),
  };
}
