import { describe, expect, it } from 'vitest';
import { detectCourseIdentity } from './courseDetector';
import {
  analyzeSingleSource,
  buildBundleFromCanonicalAnalysis,
  buildCanonicalSourceAnalysis,
} from './studySourceAnalysis';
import { buildNoteSourceItem } from './studySourceProcessor';
import {
  computeDynamicSummaryPlan,
  deduplicateSummarySections,
  getDisciplineSummaryGuidance,
  splitDocumentIntoLogicalChunks,
} from './studySummaryArchitecture';
import { generateClientStudyMaterial } from './studyMaterialGenerator';
import type { ExtractedSourceItem, NoteSourceOption, SummaryContent } from '@/types/study';

function makeParaTeorisiText(pages: number): string {
  const parts: string[] = [];
  for (let p = 1; p <= pages; p++) {
    parts.push(
      `--- Sayfa ${p} ---\n` +
        `# ${p}. Bölüm: Para Teorisi ve Parasal Aktarım Mekanizması (${p}. Ünite)\n` +
        `Para Arzı ve Likidite Tercihi ${p}: Merkez Bankası açık piyasa işlemleri, zorunlu karşılık oranı ve reeskont faiz oranı aracılığıyla parasal tabanı kontrol eder. ` +
        `Klasik miktar teorisine göre $M \\cdot V = P \\cdot Y$ özdeşliği uzun dönemde paranın yansızlığını ifade eder; çünkü dolaşım hızı $V$ ve reel hasıla $Y$ kısa dönemde sabit kabul edilir.\n` +
        `Keynesyen Likidite Tercihi ${p}: İşlem, ihtiyat ve spekülasyon güdüsüyle para talebi faiz oranıyla ters yönlüdür. Ancak likidite tuzağı durumunda faiz esnekliği sonsuza yaklaşır ve genişletici para politikası hasılayı artırmada etkisiz kalır.\n` +
        `Friedman Modern Miktar Teorisi ${p}: Para talebi sürekli gelirin istikrarlı bir fonksiyonudur; dolayısıyla parasal büyüme kuralı enflasyon beklentilerini çıpalamak için temel koşuldur.`,
    );
  }
  return parts.join('\n\n');
}

describe('EconNotes Study Studio — Course Matching & Conflict Override', () => {
  it('overrides wrong unconfirmed Turizm Ekonomisi metadata when document is genuinely Para Teorisi – 6. Hafta', () => {
    const paraText = makeParaTeorisiText(6);
    const detected = detectCourseIdentity({
      text: paraText,
      fileNameOrTitle: 'Para_Teorisi_6_Hafta.pdf',
      explicitCourse: 'Turizm Ekonomisi',
      confirmedByUser: false,
    });

    expect(detected.course).toBe('Para Teorisi ve Politikası');
    expect(detected.course).not.toBe('Turizm Ekonomisi');
    expect(detected.needsConfirmation).toBe(false);
  });

  it('prevents buildNoteSourceItem from poisoning extracted text with wrong DB course tag', () => {
    const wrongTaggedNote: NoteSourceOption = {
      id: 'note-para-6',
      title: 'Para Teorisi - 6. Hafta',
      course: 'Turizm Ekonomisi',
      department: 'İktisat',
      description: 'Klasik miktar teorisi, Keynesyen para talebi, likidite tuzağı, IS-LM ve parasal aktarım.',
      origin: 'platform',
    };

    const item = buildNoteSourceItem(wrongTaggedNote, makeParaTeorisiText(5));
    expect(item.text).not.toContain('Ders: Turizm Ekonomisi');
    expect(item.course).toBe('Para Teorisi ve Politikası');

    const profile = analyzeSingleSource(item);
    expect(profile.resolvedCourse).toBe('Para Teorisi ve Politikası');
    expect(profile.resolvedCourse).not.toBe('Turizm Ekonomisi');
  });

  it('respects explicit user confirmation when the user deliberately chooses a course', () => {
    const detected = detectCourseIdentity({
      text: 'Kısa ders özeti ve genel değerlendirme notu.',
      fileNameOrTitle: 'Haftalık Not',
      explicitCourse: 'Turizm Ekonomisi',
      confirmedByUser: true,
    });

    expect(detected.course).toBe('Turizm Ekonomisi');
    expect(detected.needsConfirmation).toBe(false);
  });
});

describe('EconNotes Study Studio — Multi-Course Adaptive Comprehensive Summarization', () => {
  it('generates structured economics summary for Para Teorisi with formulas, memorizeVsInterpret, and summarySynthesis', () => {
    const guidance = getDisciplineSummaryGuidance('Para Teorisi ve Politikası', 'hybrid');
    expect(guidance.disciplineFamily).toBe('economics');

    const result = generateClientStudyMaterial({
      materialType: 'summary',
      noteTitle: 'Para Teorisi – 6. Hafta',
      course: 'Para Teorisi ve Politikası',
      noteContext: makeParaTeorisiText(8),
      totalPagesOrSlides: 8,
      summaryDepth: 'comprehensive',
    }) as unknown as SummaryContent;

    expect(result.disciplineTag).toContain('Para Teorisi');
    expect(result.sections.length).toBeGreaterThanOrEqual(4);
    expect(result.memorizeVsInterpret?.memorize.length).toBeGreaterThan(0);
    expect(result.memorizeVsInterpret?.interpret.length).toBeGreaterThan(0);
    expect(result.summarySynthesis).toBeTruthy();
    expect(result.comparativeMatrix?.rows.length).toBeGreaterThan(0);
  });

  it('adapts naturally to Law (Borçlar Hukuku) without fabricated mathematical formulas', () => {
    const lawText = `
--- Sayfa 1 ---
# 1. Sözleşmenin Kurulması ve Geçerlilik Şartları
İcap ve Kabul: Türk Borçlar Kanunu uyarınca sözleşme, tarafların iradelerini karşılıklı ve birbirine uygun olarak açıklamalarıyla kurulur. İcap, sözleşmenin esaslı unsurlarını içeren ve bağlanma iradesi taşıyan öneridir.
Şekil Şartı: Kanunda aksi öngörülmedikçe sözleşmelerin geçerliliği hiçbir şekle bağlı değildir; ancak taşınmaz satış vaadi ve kefalet sözleşmesi resmi veya nitelikli yazılı şekle tabidir.

--- Sayfa 2 ---
# 2. Kesin Hükümsüzlük (Butlan) ve İptal Edilebilirlik Ayrımı
Kesin Hükümsüzlük: Kanunun emredici hükümlerine, ahlaka, kamu düzenine veya kişilik haklarına aykırı sözleşmeler baştan itibaren geçersizdir ve hakim tarafından re'sen dikkate alınır.
İrade Sakatlıkları: Yanılma, aldatma veya korkutma hallerinde sözleşme kesin hükümsüz değil, iptal edilebilir niteliktedir; ancak hak düşürücü süre olan 1 yıl içinde iptal hakkı kullanılmazsa sözleşme geçerlilik kazanır.

--- Sayfa 3 ---
# 3. Borca Aykırılık, Temerrüt ve Kusur Sorumluluğu
Borçlu Temerrüdü: Muaccel bir borcun ifa edilmemesi ve alacaklının ihtarı sonucunda borçlu temerrüde düşer; dolayısıyla gecikme tazminatı ve temerrüt faizi doğar.
Kusursuz Sorumluluk: Adam çalıştıranın sorumluluğu ve tehlike sorumluluğu istisnai olarak kusur şartı aramadan tazminat yükümlülüğü doğurur.
`;

    const guidance = getDisciplineSummaryGuidance('Borçlar Hukuku', 'verbal');
    expect(guidance.disciplineFamily).toBe('law');

    const result = generateClientStudyMaterial({
      materialType: 'summary',
      noteTitle: 'Borçlar Hukuku Genel Hükümler',
      course: 'Borçlar Hukuku',
      noteContext: lawText,
      totalPagesOrSlides: 3,
      summaryDepth: 'comprehensive',
    }) as unknown as SummaryContent;

    const joined = result.sections.map((s) => s.content).join('\n');
    expect(joined).toContain('Hukuki Çerçeve');
    expect(joined).not.toContain('Kaynak Formül, Denklem');
    expect(result.memorizeVsInterpret?.memorize.length).toBeGreaterThan(0);
    expect(result.memorizeVsInterpret?.interpret.length).toBeGreaterThan(0);
    expect(result.summarySynthesis).toContain('kurucu unsur');
  });

  it('adapts naturally to Statistics (İstatistik ve Olasılık) preserving formulas and test logic', () => {
    const statsText = `
--- Sayfa 1 ---
# 1. Merkezi Eğilim, Yayılım ve Normal Dağılım
Standart Sapma ve Varyans: Örneklem varyansı $s^2 = \\frac{\\sum (x_i - \\bar{x})^2}{n - 1}$ formülü ile hesaplanır; paydada $n - 1$ serbestlik derecesi yansız tahmin edici elde etmek için kullanılır.
Z-Skoru Standardizasyonu: $Z = \\frac{X - \\mu}{\\sigma}$ dönüşümü gözlemin ortalamadan kaç standart sapma uzaklıkta olduğunu ölçer.

--- Sayfa 2 ---
# 2. Hipotez Testleri, p-Değeri ve Hata Türleri
Hipotez Testi: Sıfır hipotezi ($H_0$) ile alternatif hipotez ($H_1$) arasındaki karar, test istatistiğinin kritik bölgeye düşmesine veya $p < \\alpha$ koşuluna göre verilir.
Tip I ve Tip II Hata: Doğru olan $H_0$ hipotezini reddetmek Tip I hata ($\\alpha$), yanlış olan $H_0$ hipotezini reddetmemek ise Tip II hata ($\\beta$) anlamına gelir; ancak anlamlılık düzeyi küçüldükçe testin gücü $1 - \\beta$ azalabilir.
`;

    const guidance = getDisciplineSummaryGuidance('İstatistik ve Olasılık', 'quantitative');
    expect(guidance.disciplineFamily).toBe('statistics');

    const result = generateClientStudyMaterial({
      materialType: 'summary',
      noteTitle: 'İstatistik ve Olasılık – Hipotez Testleri',
      course: 'İstatistik ve Olasılık',
      noteContext: statsText,
      totalPagesOrSlides: 2,
      summaryDepth: 'comprehensive',
    }) as unknown as SummaryContent;

    const joined = result.sections.map((s) => s.content).join('\n');
    expect(joined).toContain('İstatistiksel Yapı');
    expect(joined).toContain('Kaynak Formül');
    expect(result.memorizeVsInterpret?.memorize.length).toBeGreaterThan(0);
    expect(result.summarySynthesis).toContain('dağılım varsayımı');
  });
});

describe('EconNotes Study Studio — Long Document Scaling (190 Pages vs 10 Pages)', () => {
  it('scales plan, chunking, section count, and key terms proportionally for a 190-page textbook vs 10-page note', () => {
    const plan10 = computeDynamicSummaryPlan({
      totalWords: 2_200,
      totalPagesOrSlides: 10,
      summaryDepth: 'comprehensive',
    });
    const plan190 = computeDynamicSummaryPlan({
      totalWords: 48_000,
      totalPagesOrSlides: 190,
      summaryDepth: 'comprehensive',
    });

    expect(plan10.tier).toBe('compact');
    expect(plan190.tier).toBe('massive');
    expect(plan190.targetSectionCount).toBeGreaterThanOrEqual(plan10.targetSectionCount * 2);
    expect(plan190.targetKeyTerms).toBeGreaterThan(plan10.targetKeyTerms * 2);
    expect(plan190.maxChunks).toBeGreaterThanOrEqual(12);

    const text10 = makeParaTeorisiText(10);
    const text190 = makeParaTeorisiText(190);

    // Logical page-boundary chunking must span Sayfa 1 through Sayfa 190 without dropping the tail
    const chunks190 = splitDocumentIntoLogicalChunks(
      text190,
      plan190.chunkCharBudget,
      plan190.maxChunks,
    );
    expect(chunks190.length).toBeGreaterThanOrEqual(6);
    expect(chunks190[0].pageStart).toBe(1);
    expect(chunks190[chunks190.length - 1].pageEnd).toBe(190);

    const sum10 = generateClientStudyMaterial({
      materialType: 'summary',
      noteTitle: 'Para Teorisi 10 Sayfa',
      course: 'Para Teorisi ve Politikası',
      noteContext: text10,
      totalPagesOrSlides: 10,
      summaryDepth: 'comprehensive',
    }) as unknown as SummaryContent;

    const sum190 = generateClientStudyMaterial({
      materialType: 'summary',
      noteTitle: 'Para Teorisi 190 Sayfa Ders Kitabı',
      course: 'Para Teorisi ve Politikası',
      noteContext: text190,
      totalPagesOrSlides: 190,
      summaryDepth: 'comprehensive',
    }) as unknown as SummaryContent;

    expect(sum190.sections.length).toBeGreaterThan(sum10.sections.length);
    expect((sum190.keyTerms || []).length).toBeGreaterThan((sum10.keyTerms || []).length);
  });

  it('deduplicates near-identical cross-chunk headings while keeping richer content', () => {
    const deduped = deduplicateSummarySections([
      {
        index: 0,
        heading: 'Parasal Aktarım Mekanizmaları',
        pageRange: 'Sayfa 1-12',
        content: 'Kısa taslak açıklama.',
        takeaways: ['Çıkarım A'],
      },
      {
        index: 1,
        heading: 'Parasal Aktarım Mekanizmaları',
        pageRange: 'Sayfa 13-20',
        content:
          'Çok daha kapsamlı ve ayrıntılı parasal aktarım mekanizması açıklaması, faiz kanalı, kredi kanalı ve varlık fiyatları kanalı detayları.',
        takeaways: ['Çıkarım B'],
      },
      {
        index: 2,
        heading: 'Likidite Tuzağı ve Politika Etkinliği',
        pageRange: 'Sayfa 21-30',
        content: 'Keynesyen likidite tuzağı analizi ve maliye politikasının rolü.',
        takeaways: ['Çıkarım C'],
      },
    ]);

    expect(deduped.length).toBe(2);
    expect(deduped[0].content).toContain('faiz kanalı');
    expect(deduped[0].takeaways).toContain('Çıkarım A');
    expect(deduped[0].takeaways).toContain('Çıkarım B');
  });
});

describe('EconNotes Study Studio — Cross-Tool Canonical Analysis Consistency', () => {
  it('shares the exact verified course across all AI tools without cross-contamination', () => {
    const src: ExtractedSourceItem = {
      id: 'src-para-6',
      name: 'Para_Teorisi_6_Hafta.pdf',
      kind: 'file',
      course: 'Turizm Ekonomisi', // Stale/wrong unconfirmed tag from an old cache!
      courseConfirmedByUser: false,
      text: makeParaTeorisiText(6),
      wordCount: 520,
      pagesOrSlides: 6,
      charCount: 3800,
    };

    const canonical = buildCanonicalSourceAnalysis({
      sources: [src],
      allMaterials: [],
    });

    expect(canonical.primaryCourseLabel).toBe('Para Teorisi ve Politikası');
    expect(canonical.distinctCourses).toEqual(['Para Teorisi ve Politikası']);
    expect(canonical.distinctCourses).not.toContain('Turizm Ekonomisi');

    const bundle = buildBundleFromCanonicalAnalysis(canonical, 'Para Teorisi – 6. Hafta');
    expect(bundle.course).toBe('Para Teorisi ve Politikası');
    expect(bundle.sourceCourses).toEqual(['Para Teorisi ve Politikası']);
  });
});
