import { extractFile, type ExtractedImagePage } from '@/lib/extractFile';
import type {
  ExtractedSourceItem,
  NoteSourceOption,
  ProcessedStudyBundle,
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

export function detectDiscipline(text: string, course?: string): string {
  const hay = `${course || ''} ${text.slice(0, 10_000)}`.toLocaleLowerCase('tr-TR');
  const rules: Array<[string, RegExp]> = [
    [
      'Hukuk & Kamu Yönetimi',
      /\b(kanun|anayasa|yargıtay|danıştay|madde\s*\d+|hukuk|borçlar|ceza|medeni|idare|ticaret\s+hukuku|icra|mahkeme|sözleşme|tüzel|yaptırım|müeyyide|tbk|tmk|tck|mevzuat|içtihat|ehliyet|butlan|zilyetlik|mülkiyet|miras|kamu\s+yönetimi)\b/g,
    ],
    [
      'Tarih & Siyaset Bilimi',
      /\b(tarih|osmanlı|cumhuriyet|inkılap|devrim|antlaşma|savaş|dönem|padişah|tanzimat|meşrutiyet|siyaset|ideoloji|demokrasi|devlet|rejim|egemenlik|uluslararası\s+ilişkiler|diplomasi|jeopolitik|soğuk\s+savaş|iktisat\s+tarihi|merkantilizm|fizyokrasi)\b/g,
    ],
    [
      'Sosyoloji, Psikoloji & Felsefe',
      /\b(sosyoloji|psikoloji|felsefe|antropoloji|etik|epistemoloji|ontoloji|bilişsel|davranış|toplum|kültür|norm|statü|rol|durkheim|weber|marx|freud|kant|platon|aristoteles|algı|bellek|motivasyon|kişilik|anomi)\b/g,
    ],
    [
      'Edebiyat, Eğitim & İletişim',
      /\b(edebiyat|şiir|roman|hikaye|edebi\s+akım|romantizm|realizm|sembolizm|divan|serüvet-i\s+fünun|pedagoji|eğitim\s+bilimleri|öğretim|müfredat|iletişim|medya|söylem|retorik|anlatım)\b/g,
    ],
    [
      'İktisat & Ekonometri',
      /\b(ekonometri|mikroekonomi|makroekonomi|enflasyon|gsyih|elastikiyet|regresyon|ols|merkez\s+bankası|para\s+politikası|maliye\s+politikası|arz|talep|fayda|denge|is-lm|solow|keynes|tcmb|iktisat)\b/g,
    ],
    [
      'Finans & İşletme',
      /\b(finans|bilanço|nakit\s+akışı|iskonto|npv|irr|capm|portföy|hisse|tahvil|türev|opsiyon|pazarlama|yönetim|organizasyon|muhasebe|maliyet|kârlılık|roe|stratejik\s+yönetim|insan\s+kaynakları)\b/g,
    ],
    [
      'Bilgisayar & Mühendislik',
      /\b(algoritma|veri\s+yapısı|kompleksite|big-o|python|java|sql|veritabanı|network|makine\s+öğrenmesi|derin\s+öğrenme|yapay\s+zeka|devre|termodinamik|mukavemet|yazılım)\b/g,
    ],
    [
      'Matematik & İstatistik',
      /\b(teorem|ispat|integral|türev|matris|determinant|özdeğer|olasılık|dağılım|hipotez\s+testi|p-değeri|varyans|kovaryans|limit|diferansiyel|hipotez)\b/g,
    ],
    [
      'Tıp & Yaşam Bilimleri',
      /\b(anatomi|fizyoloji|patoloji|farmakoloji|biyokimya|hücre|genetik|protein|enzim|klinik|semptom|tanı|histoloji)\b/g,
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
): { discipline: string; mode: AcademicDomainMode } {
  const fullCourse = [course, title].filter(Boolean).join(' ');
  const discipline = detectDiscipline(text, fullCourse);
  const sample = text.slice(0, 14_000);
  const lowerHeader = `${fullCourse} ${sample.slice(0, 1200)}`.toLocaleLowerCase('tr-TR');

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
    discipline === 'Tarih & Siyaset Bilimi' ||
    discipline === 'Sosyoloji, Psikoloji & Felsefe' ||
    discipline === 'Edebiyat, Eğitim & İletişim'
  ) {
    return {
      discipline,
      mode: mathSignals >= 8 ? 'hybrid' : 'verbal',
    };
  }

  if (strongVerbalTopic && mathSignals < 4) {
    return { discipline, mode: 'verbal' };
  }

  if (
    discipline === 'Matematik & İstatistik' ||
    discipline === 'Bilgisayar & Mühendislik' ||
    mathSignals >= 6
  ) {
    return { discipline, mode: 'quantitative' };
  }

  // Metinde denklem yok ve sınıflandırılamayan düz anlatım ise sözel kabul et
  if (discipline === 'Üniversite Akademik Çalışma' && mathSignals === 0 && sample.length > 180) {
    return { discipline, mode: 'verbal' };
  }

  return { discipline, mode: 'hybrid' };
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
  const sliceCount = 7;
  const perSlice = Math.floor(maxChars / sliceCount) - 80;
  const step = Math.floor(clean.length / sliceCount);
  const parts: string[] = [];
  for (let i = 0; i < sliceCount; i++) {
    const start = i * step;
    const pct = Math.round((start / clean.length) * 100);
    parts.push(`[--- KESİT ${i + 1}/${sliceCount} (~%${pct}) ---]\n${clean.slice(start, start + perSlice)}`);
  }
  return parts.join('\n\n');
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

  // Compute positional window matching sectionIndex / totalSections
  const ratioStart = Math.max(0, sectionIndex / Math.max(1, totalSections) - 0.08);
  const posStart = Math.floor(clean.length * ratioStart);
  const positionalSlice = clean.slice(posStart, posStart + Math.floor(maxSliceChars * 0.65));

  // Keyword scan across paragraphs for sectionTitle + focusPoints
  const keywords = `${sectionTitle} ${focusPoints.join(' ')}`
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3);

  if (keywords.length === 0) return clean.slice(posStart, posStart + maxSliceChars);

  const paragraphs = clean.split(/\n{2,}/).filter((p) => p.trim().length > 20);
  const scored = paragraphs.map((p, idx) => {
    const lower = p.toLowerCase();
    let score = 0;
    for (const kw of keywords) {
      if (lower.includes(kw)) score += 1;
    }
    return { p, idx, score };
  });

  scored.sort((a, b) => b.score - a.score || a.idx - b.idx);
  const matchedChunks: string[] = [];
  let budget = Math.floor(maxSliceChars * 0.35);
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
