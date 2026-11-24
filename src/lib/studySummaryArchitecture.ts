import { foldTurkishToAscii, type CourseDomainMode } from '@/lib/courseDetector';
import type { ExamStudyMode, SummaryDepth, SummarySection } from '@/types/study';

export type DocumentScaleTier = 'compact' | 'medium' | 'large' | 'massive';

export interface DynamicSummaryPlan {
  tier: DocumentScaleTier;
  minSections: number;
  maxSections: number;
  targetSectionsLabel: string;
  targetSectionCount: number;
  minWordsPerSection: number;
  maxWordsPerSection: number;
  targetKeyTerms: number;
  targetKeyPoints: number;
  maxChunks: number;
  chunkCharBudget: number;
  needsChunkedPipeline: boolean;
}

export interface LogicalDocumentChunk {
  index: number;
  total: number;
  text: string;
  /** Trailing paragraphs from the immediately preceding chunk so cross-boundary concepts never break */
  overlapPrefix?: string;
  headingHints?: string[];
  pageStart?: number;
  pageEnd?: number;
  pageRangeLabel?: string;
  wordCount: number;
}

export interface DisciplineSummaryGuidance {
  disciplineFamily: 'law' | 'economics' | 'statistics' | 'engineering' | 'medical' | 'general';
  structureFocus: string;
  formulaRule: string;
  comparisonHint: string;
  examFocusHint: string;
}

/**
 * Dynamically scales summary depth, section count, key terms, and chunking strategy
 * proportionally to the actual size and density of the uploaded document.
 * Guarantees a 190-page textbook/slide deck receives far deeper multi-chapter coverage
 * than a 10-page lecture note — never producing a short few-paragraph summary on long notes.
 */
export function computeDynamicSummaryPlan(params: {
  totalWords: number;
  totalPagesOrSlides: number;
  summaryDepth?: SummaryDepth;
  examMode?: ExamStudyMode;
}): DynamicSummaryPlan {
  const words = Math.max(0, params.totalWords || 0);
  const pages = Math.max(1, params.totalPagesOrSlides || 1);
  const depth = params.summaryDepth || 'comprehensive';
  const examMode = params.examMode || 'balanced';

  let tier: DocumentScaleTier = 'compact';
  if (pages >= 100 || words >= 26_000) {
    tier = 'massive';
  } else if (pages >= 40 || words >= 10_000) {
    tier = 'large';
  } else if (pages >= 14 || words >= 2_800) {
    tier = 'medium';
  }

  const depthBoost =
    depth === 'textbook' || examMode === 'large_note'
      ? 1.25
      : depth === 'short' || examMode === 'cram_24h'
      ? 0.78
      : 1.0;

  const baseByTier: Record<
    DocumentScaleTier,
    {
      minSec: number;
      maxSec: number;
      minWords: number;
      maxWords: number;
      terms: number;
      points: number;
      maxChunks: number;
      chunkChars: number;
    }
  > = {
    compact: {
      minSec: 5,
      maxSec: 8,
      minWords: 380,
      maxWords: 600,
      terms: 14,
      points: 10,
      maxChunks: 2,
      chunkChars: 22_000,
    },
    medium: {
      minSec: 8,
      maxSec: 12,
      minWords: 450,
      maxWords: 700,
      terms: 22,
      points: 12,
      maxChunks: 6,
      chunkChars: 22_000,
    },
    large: {
      minSec: 12,
      maxSec: 17,
      minWords: 480,
      maxWords: 760,
      terms: 32,
      points: 15,
      maxChunks: 10,
      chunkChars: 24_000,
    },
    massive: {
      minSec: 16,
      maxSec: 26,
      minWords: 500,
      maxWords: 850,
      terms: 48,
      points: 20,
      maxChunks: 24,
      chunkChars: 24_000,
    },
  };

  const base = baseByTier[tier];
  const minSections = Math.max(4, Math.round(base.minSec * depthBoost));
  const maxSections = Math.max(minSections + 2, Math.round(base.maxSec * depthBoost));
  const targetSectionCount = Math.round((minSections + maxSections) / 2);

  return {
    tier,
    minSections,
    maxSections,
    targetSectionsLabel: `${minSections}-${maxSections}`,
    targetSectionCount,
    minWordsPerSection: Math.max(300, Math.round(base.minWords * (depth === 'short' ? 0.8 : 1))),
    maxWordsPerSection: Math.max(480, Math.round(base.maxWords * (depth === 'textbook' ? 1.1 : 1))),
    targetKeyTerms: Math.round(base.terms * depthBoost),
    targetKeyPoints: base.points,
    maxChunks: base.maxChunks,
    chunkCharBudget: base.chunkChars,
    needsChunkedPipeline: tier !== 'compact' || words >= 2_500 || pages >= 12,
  };
}

/**
 * Adapts the 9-part study guide framework naturally to the specific academic discipline
 * (Law vs Economics/Monetary Theory vs Statistics vs Engineering vs Medical vs General)
 * so no course is ever forced into an artificial template.
 */
export function getDisciplineSummaryGuidance(
  courseName: string,
  domainMode: CourseDomainMode,
): DisciplineSummaryGuidance {
  const folded = foldTurkishToAscii(courseName || '');

  if (
    /\b(hukuk|anayasa|borclar|medeni|ceza|ticaret hukuku|idare hukuku|icra|iflas|usul|vergi hukuku|is hukuku)\b/.test(
      folded,
    )
  ) {
    return {
      disciplineFamily: 'law',
      structureFocus:
        'Hukuk dersi odak yapısı: Kanun hükümleri ve maddeleri, hukuki kavramlar, kurucu unsurlar, geçerlilik şartları, istisnalar, hak düşürücü/zamanaşımı süreleri, yaptırım türleri ve hukuki ayrımları sistemli şekilde aç.',
      formulaRule:
        'Hukuk dersinde matematiksel formül uydurma; bunun yerine "Kurallar, Unsurlar ve Hukuki Şartlar" yapısıyla kanun maddeleri, unsurlar ve istisnaları netleştir.',
      comparisonHint:
        'Karşılaştırma tablosunda benzer hukuki kurumları (örn. kesin hükümsüzlük vs iptal edilebilirlik, kusurlu vs kusursuz sorumluluk) şartları, sonuçları ve süreleri bakımından karşılaştır.',
      examFocusHint:
        'Ezberlenecekler (kanun maddeleri, süreler, istisnalar, şekil şartları) ile Yorumlanacaklar (pratik olay çözüm mantığı, kusur/illiyet analizi) ayrımını açıkça göster.',
    };
  }

  if (
    /\b(para teorisi|para politikasi|iktisat|ekonomi|makro|mikro|maliye|uluslararasi iktisat|kalkinma|turizm ekonomisi|finans|bankacilik)\b/.test(
      folded,
    )
  ) {
    return {
      disciplineFamily: 'economics',
      structureFocus:
        'İktisat & Para Teorisi odak yapısı: İktisadi teorileri, akımları/ekolleri, varsayımları, parasal/mali aktarım mekanizmalarını, denge koşullarını, grafik/eğri kaymalarını ve politika sonuçlarını derinlemesine açıkla.',
      formulaRule:
        'Kaynaktaki TÜM iktisadi denklemleri ve formülleri ($...$ / $$...$$) eksiksiz koru; her değişkenin neyi temsil ettiğini, formülün hangi amaçla ve hangi varsayımlar altında kullanıldığını açıkla.',
      comparisonHint:
        'Karşılaştırma tablosunda iktisadi yaklaşımları/ekolleri (örn. Klasik vs Keynesyen vs Monetarist) temel varsayım, denge mekanizması ve politika etkinliği boyutlarıyla kıyasla.',
      examFocusHint:
        'Ezberlenecekler (temel tanımlar, denklem sembolleri, politika araçları) ile Yorumlanacaklar (bir parametredeki değişimin eğrileri, faizi, çıktıyı veya enflasyonu nasıl etkilediği) ayrımını netleştir.',
    };
  }

  if (
    /\b(istatistik|olasilik|ekonometri|matematik|kalkulus|lineer cebir|sayisal|yoneylem)\b/.test(
      folded,
    )
  ) {
    return {
      disciplineFamily: 'statistics',
      structureFocus:
        'İstatistik & Sayısal odak yapısı: Dağılımları, tahmin edicileri, hipotez test adımlarını ($H_0 / H_1$), karar kurallarını, varsayım koşullarını, formüllerin kullanım amacını ve sayısal/tablo yorumlarını adım adım açıkla.',
      formulaRule:
        'Her formülü LaTeX ($...$ / $$...$$) ile yaz, her sembolü/değişkeni tanımla, hangi koşullarda bu formülün seçildiğini ve hesaplama adımlarını örnekle göster.',
      comparisonHint:
        'Karşılaştırma tablosunda test/dağılım/yöntem seçimlerini (örn. z-testi vs t-testi, parametrik vs parametrik olmayan, R² vs düzeltilmiş R²) varsayım ve kullanım alanına göre karşılaştır.',
      examFocusHint:
        'Ezberlenecekler (test istatistiği formülleri, dağılım varsayımları, kritik bölge kuralları) ile Yorumlanacaklar (p-değeri ve güven aralığı yorumu, Tip I/II hata anlamı) ayrımını netleştir.',
    };
  }

  if (
    /\b(muhendislik|bilgisayar|algoritma|veri yapilari|termodinamik|mukavemet|devre|elektronik|fizik|kimya)\b/.test(
      folded,
    )
  ) {
    return {
      disciplineFamily: 'engineering',
      structureFocus:
        'Mühendislik & Fen odak yapısı: Temel yasaları, sistem/model mimarisini, çalışma prensiplerini, sınır koşullarını, formülleri ve adım adım çözüm/uygulama örneklerini ayrıntılı biçimde açıkla.',
      formulaRule:
        'Kaynaktaki tüm denklem, birim ve algoritmik karmaşıklık ifadelerini LaTeX ile yaz; değişken anlamlarını ve geçerlilik sınırlarını belirt.',
      comparisonHint:
        'Karşılaştırma tablosunda yöntem, algoritma veya sistem alternatiflerini verimlilik, koşul ve sınırlılık boyutlarıyla kıyasla.',
      examFocusHint:
        'Ezberlenecekler (temel yasalar, birimler, sabitler) ile Yorumlanacaklar (problem kurulumu, sınır analizi ve tasarım kararları) ayrımını belirt.',
    };
  }

  if (/\b(tip|anatomi|fizyoloji|patoloji|farmakoloji|biyokimya|hemsirelik|eczacilik|saglik)\b/.test(folded)) {
    return {
      disciplineFamily: 'medical',
      structureFocus:
        'Tıp & Sağlık odak yapısı: Mekanizmaları, etiyoloji/patofizyoloji basamaklarını, klinik bulguları, ayırt edici tanı farklarını ve tedavi/bakım ilkelerini sistemli biçimde açıkla.',
      formulaRule:
        'Yalnızca kaynakta geçen klinik hesaplama/indeks formüllerini koru; biyolojik süreçleri aşama aşama şematize et.',
      comparisonHint:
        'Karşılaştırma tablosunda benzer hastalık/sendrom veya ilaç gruplarını mekanizma, bulgu ve ayırt edici kriterlere göre kıyasla.',
      examFocusHint:
        'Ezberlenecekler (referans aralıkları, temel sınıflandırmalar, kırmızı bayraklar) ile Yorumlanacaklar (klinik vaka mekanizması ve ayırıcı tanı) ayrımını belirt.',
    };
  }

  return {
    disciplineFamily: 'general',
    structureFocus:
      domainMode === 'verbal'
        ? 'Sözel & Kuramsal odak yapısı: Ana kavramları, kuramsal yaklaşımları, tarihsel/kurumsal bağlamı, neden–sonuç ilişkilerini, sınıflandırmaları ve eleştirel karşılaştırmaları derinlemesine açıkla.'
        : 'Bütüncül akademik odak yapısı: Ana ve alt başlıkları, eksiksiz kavram tanımlarını, teorileri, modelleri, varsa formülleri, grafik/tablo yorumlarını ve somut örnekleri öğretici biçimde açıkla.',
    formulaRule:
      domainMode === 'verbal'
        ? 'Sözel metinde uydurma matematiksel formül ekleme; bunun yerine kavramsal şemalar, sınıflandırmalar ve karşılaştırma tabloları kullan.'
        : 'Kaynakta geçen tüm formülleri ve modelleri LaTeX ile yaz, her değişkenin anlamını ve kullanım amacını açıkla.',
    comparisonHint:
      'Karşılaştırma tablosunda kaynakta geçen yaklaşım, kavram veya modelleri ortak ve farklı yönleriyle kıyasla.',
    examFocusHint:
      'Ezberlenecek temel tanım/kavramlar ile yorumlanması gereken neden–sonuç ve uygulama ilişkilerini açıkça ayır.',
  };
}

/**
 * Splits a long PDF/PPTX/DOCX text into logical, page- and heading-aware contiguous chunks
 * so every single page from start to finish is analyzed without cutting mid-sentence or silently skipping the end.
 */
export function splitDocumentIntoLogicalChunks(
  text: string,
  maxChunkChars = 24_000,
  maxChunks = 24,
  overlapChars = 520,
): LogicalDocumentChunk[] {
  const clean = (text || '').trim();
  if (!clean) return [];

  const extractPageBounds = (slice: string): { start?: number; end?: number; label?: string } => {
    const matches = Array.from(slice.matchAll(/---\s*(Sayfa|Slayt)\s+(\d+)\s*---/gi));
    if (matches.length === 0) return {};
    const unit = matches[0][1];
    const nums = matches.map((m) => parseInt(m[2], 10)).filter((n) => Number.isFinite(n));
    if (nums.length === 0) return {};
    const start = Math.min(...nums);
    const end = Math.max(...nums);
    return {
      start,
      end,
      label: start === end ? `${unit} ${start}` : `${unit} ${start}-${end}`,
    };
  };

  const extractChunkHeadings = (slice: string): string[] => {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const rawLine of slice.split('\n')) {
      const line = rawLine.trim();
      if (!line || line.length < 4 || line.length > 96) continue;
      if (/^---\s*(Sayfa|Slayt)\s+\d+\s*---$/i.test(line)) continue;
      if (/^===\s*KAYNAK/i.test(line)) continue;
      const isHeading =
        /^#{1,4}\s+/.test(line) ||
        /^(\d+(\.\d+){0,2}|[IVX]+\.)\s+[A-ZÇĞİÖŞÜ]/.test(line) ||
        /^[A-ZÇĞİÖŞÜ][^.!?]{3,55}:$/.test(line) ||
        (line.length >= 6 && line.length <= 65 && line === line.toUpperCase() && /[A-ZÇĞİÖŞÜ]{3}/.test(line));
      if (isHeading) {
        const cleaned = line.replace(/^#{1,4}\s+/, '').replace(/:$/, '').trim();
        const key = cleaned.toLocaleLowerCase('tr-TR');
        if (!seen.has(key) && cleaned.length >= 4) {
          seen.add(key);
          out.push(cleaned);
          if (out.length >= 8) break;
        }
      }
    }
    return out;
  };

  const extractTailOverlap = (prevPiece: string): string => {
    if (!prevPiece || overlapChars <= 0) return '';
    const paras = prevPiece
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter((p) => p.length >= 30 && !/^---\s*(Sayfa|Slayt)\s+\d+\s*---$/i.test(p));
    if (paras.length === 0) return prevPiece.slice(-overlapChars).trim();
    const chosen: string[] = [];
    let len = 0;
    for (let i = paras.length - 1; i >= 0 && len < overlapChars; i--) {
      chosen.unshift(paras[i]);
      len += paras[i].length + 2;
    }
    return chosen.join('\n\n').slice(-overlapChars).trim();
  };

  if (clean.length <= maxChunkChars) {
    const bounds = extractPageBounds(clean);
    return [
      {
        index: 0,
        total: 1,
        text: clean,
        headingHints: extractChunkHeadings(clean),
        pageStart: bounds.start,
        pageEnd: bounds.end,
        pageRangeLabel: bounds.label,
        wordCount: clean.split(/\s+/).filter(Boolean).length,
      },
    ];
  }

  // Split into atomic page/slide segments first whenever page markers exist
  const pageMarkerRe = /(?=---\s*(?:Sayfa|Slayt)\s+\d+\s*---)/gi;
  const pageSegments = clean.split(pageMarkerRe).map((s) => s.trim()).filter(Boolean);

  const effectiveTargetChunks = Math.min(
    maxChunks,
    Math.max(2, Math.ceil(clean.length / maxChunkChars)),
  );
  const targetChunkSize = Math.ceil(clean.length / effectiveTargetChunks);

  const rawPieces: string[] = [];

  if (pageSegments.length >= effectiveTargetChunks) {
    let bucket: string[] = [];
    let bucketLen = 0;

    for (let i = 0; i < pageSegments.length; i++) {
      const seg = pageSegments[i];
      const remainingChunksAllowed = effectiveTargetChunks - rawPieces.length;
      const shouldFlush =
        bucket.length > 0 &&
        remainingChunksAllowed > 1 &&
        bucketLen + seg.length > targetChunkSize &&
        bucketLen >= Math.floor(targetChunkSize * 0.55);

      if (shouldFlush) {
        rawPieces.push(bucket.join('\n\n'));
        bucket = [seg];
        bucketLen = seg.length;
      } else {
        bucket.push(seg);
        bucketLen += seg.length + 2;
      }
    }
    if (bucket.length > 0) {
      rawPieces.push(bucket.join('\n\n'));
    }
  } else {
    // Paragraph / heading aware sequential slicing
    let cursor = 0;
    for (let i = 0; i < effectiveTargetChunks && cursor < clean.length; i++) {
      if (i === effectiveTargetChunks - 1) {
        const tail = clean.slice(cursor).trim();
        if (tail) rawPieces.push(tail);
        break;
      }
      let end = Math.min(clean.length, cursor + targetChunkSize);
      const minCut = cursor + Math.floor(targetChunkSize * 0.6);

      // Prefer cutting right before a markdown/numbered heading or paragraph boundary
      const windowStr = clean.slice(minCut, end);
      const headingRel = windowStr.search(/\n(?:#{1,4}\s+|\d+(?:\.\d+){0,2}\s+[A-ZÇĞİÖŞÜ])/);
      if (headingRel > 0) {
        end = minCut + headingRel;
      } else {
        const paraBreak = clean.lastIndexOf('\n\n', end);
        if (paraBreak > minCut) {
          end = paraBreak;
        } else {
          const lineBreak = clean.lastIndexOf('\n', end);
          if (lineBreak > minCut) end = lineBreak;
        }
      }
      const piece = clean.slice(cursor, end).trim();
      if (piece.length > 0) rawPieces.push(piece);
      cursor = end;
    }
  }

  const filtered = rawPieces.filter((p) => p.length > 35);
  return filtered.map((piece, idx) => {
    const bounds = extractPageBounds(piece);
    const overlapPrefix = idx > 0 ? extractTailOverlap(filtered[idx - 1]) : undefined;
    return {
      index: idx,
      total: filtered.length,
      text: piece,
      overlapPrefix: overlapPrefix || undefined,
      headingHints: extractChunkHeadings(piece),
      pageStart: bounds.start,
      pageEnd: bounds.end,
      pageRangeLabel: bounds.label,
      wordCount: piece.split(/\s+/).filter(Boolean).length,
    };
  });
}

/**
 * Deduplicates merged sections across sequential chunks while preserving chronological order
 * and keeping the richer version whenever two adjacent chunks cover the same boundary topic.
 */
export function deduplicateSummarySections(sections: SummarySection[]): SummarySection[] {
  const result: SummarySection[] = [];
  const normHeading = (h: string) =>
    foldTurkishToAscii(h)
      .replace(/^\d+(?:\.\d+)*\s*/, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  for (const sec of sections) {
    const key = normHeading(sec.heading || '');
    if (!key) continue;

    const existingIdx = result.findIndex((prev) => {
      const prevKey = normHeading(prev.heading || '');
      if (prevKey === key) return true;
      const aWords = new Set(prevKey.split(' ').filter((w) => w.length >= 3));
      const bWords = new Set(key.split(' ').filter((w) => w.length >= 3));
      if (aWords.size < 2 || bWords.size < 2) return false;
      let inter = 0;
      for (const w of aWords) if (bWords.has(w)) inter++;
      const union = aWords.size + bWords.size - inter;
      return union > 0 && inter / union >= 0.78;
    });

    if (existingIdx >= 0) {
      // Keep whichever version has richer explanation (or merge unique takeaways)
      const prev = result[existingIdx];
      const longerContent =
        (sec.content || '').length > (prev.content || '').length ? sec.content : prev.content;
      const mergedTakeaways = Array.from(
        new Set([...(prev.takeaways || []), ...(sec.takeaways || [])]),
      ).slice(0, 5);
      const mergedPitfalls = Array.from(
        new Set([...(prev.commonPitfalls || []), ...(sec.commonPitfalls || [])]),
      ).slice(0, 3);
      result[existingIdx] = {
        ...prev,
        pageRange: prev.pageRange || sec.pageRange,
        content: longerContent,
        takeaways: mergedTakeaways,
        commonPitfalls: mergedPitfalls.length > 0 ? mergedPitfalls : undefined,
        checkpointQuestion: prev.checkpointQuestion || sec.checkpointQuestion,
      };
    } else {
      result.push({ ...sec, index: result.length });
    }
  }

  return result.map((s, idx) => ({ ...s, index: idx }));
}
