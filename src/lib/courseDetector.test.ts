import { describe, it, expect } from 'vitest';
import { detectCourseIdentity, foldTurkishToAscii } from '@/lib/courseDetector';
import {
  buildBundleFromCanonicalAnalysis,
  buildCanonicalSourceAnalysis,
  extractFormulasFromText,
} from '@/lib/studySourceAnalysis';
import { generateClientStudyMaterial } from '@/lib/studyMaterialGenerator';
import type { ExtractedSourceItem } from '@/types/study';

describe('Course Detection, Canonical Source Analysis & Study Studio Integrity', () => {
  it('1. identifies a Para Teorisi PDF accurately (never collapses to generic İktisat & Ekonometri)', () => {
    const paraTeorisiText = `
--- Sayfa 1 ---
# Para Teorisi ve Politikası - 4. Hafta
Merkez bankası bilançosu, parasal taban (H) ve para çarpanı mekanizması.
Emisyon hacmi ve zorunlu karşılık oranları bankaların kaydi para yaratma gücünü belirler.

--- Sayfa 2 ---
# Klasik Miktar Teorisi ve Keynesyen Likidite Tercihi
Fisher değişim denklemi: M * V = P * Y.
Keynes para talebini işlem, ihtiyat ve spekülasyon güdüleriyle açıklar; faiz oranları aşırı düştüğünde likidite tuzağı oluşur.
Taylor kuralı ve açık piyasa işlemleri (APİ) parasal aktarım mekanizmasının temel araçlarıdır.
`;

    const result = detectCourseIdentity({
      fileNameOrTitle: 'Para_Teorisi_Hafta4.pdf',
      text: paraTeorisiText,
    });

    expect(result.course).toBe('Para Teorisi ve Politikası');
    expect(result.course).not.toBe('İktisat & Ekonometri');
    expect(result.confidence).toBe('high');
    expect(result.needsConfirmation).toBe(false);
  });

  it('2. identifies Hukuk PDFs accurately with verbal mode and zero economics contamination', () => {
    const borclarHukukuText = `
--- Sayfa 1 ---
# Borçlar Hukuku Genel Hükümler - Sözleşmenin Kurulması
Türk Borçlar Kanunu (TBK) m. 1 uyarınca sözleşme, tarafların iradelerini karşılıklı ve birbirine uygun olarak açıklamalarıyla kurulur.
İcap (öneri) ve kabul beyanları hukuki sonuç doğurur.

--- Sayfa 2 ---
# Haksız Fiil Sorumluluğu ve Kusur (TBK m. 49)
Haksız fiilin unsurları: hukuka aykırı fiil, zarar, kusur ve uygun illiyet bağıdır.
Sebepsiz zenginleşme ve borçlunun temerrüdü durumlarında tazminat yükümlülüğü ve zamanaşımı süreleri yargıtay içtihatlarıyla netleşir.
`;

    const result = detectCourseIdentity({
      fileNameOrTitle: 'TBK_Borclar_Hukuku_Notlari.pdf',
      text: borclarHukukuText,
    });

    expect(result.course).toBe('Borçlar Hukuku');
    expect(result.discipline).toBe('Hukuk');
    expect(result.domainMode).toBe('verbal');
    expect(result.needsConfirmation).toBe(false);

    const anayasaResult = detectCourseIdentity({
      fileNameOrTitle: 'Anayasa_Hukuku_Ozet.pdf',
      text: `
# 1982 Anayasası ve Temel Hakların Sınırlandırılması
Anayasa Mahkemesi norm denetimi, yasama yetkisinin devredilmezliği, yürütme organı ve kuvvetler ayrılığı ilkesi incelenir.
Kanun hükmünde kararname ve cumhurbaşkanlığı kararnamesi arasındaki anayasal sınırlar.
`,
    });

    expect(anayasaResult.course).toBe('Anayasa Hukuku');
    expect(anayasaResult.discipline).toBe('Hukuk');
    expect(anayasaResult.domainMode).toBe('verbal');
  });

  it('3. identifies an İstatistik presentation accurately and preserves formulas and tables', () => {
    const istatistikSlideText = `
--- Slayt 1 ---
# İstatistik ve Olasılık - Hipotez Testleri ve ANOVA
Sıfır hipotezi (H₀) ve alternatif hipotez (H₁) kurulumu, anlamlılık düzeyi α = 0.05 ve p-değeri yorumu.
Tip I hata (α) ve Tip II hata (β) olasılıkları ile testin gücü (1 - β).

--- Slayt 2 ---
# Temel Formüller ve Dağılımlar
Örneklem varyansı: s² = ∑(x_i - x̄)² / (n - 1)
Standart normal z istatistiği: Z = (x̄ - μ) / (σ / √n)
Ki-kare uyum iyiliği testi: χ² = ∑((O - E)² / E)
Basit doğrusal regresyon ve Pearson korelasyon katsayısı r ile belirginlik katsayısı R².

| Test Türü | Dağılım | Kullanım Koşulu |
| --- | --- | --- |
| Z-Testi | Normal Dağılım | Anakütle varyansı biliniyor veya n >= 30 |
| t-Testi | Student-t | Küçük örneklem ve σ bilinmiyor |
| ANOVA | F-Dağılımı | Üç veya daha fazla grup ortalaması karşılaştırması |
`;

    const detected = detectCourseIdentity({
      fileNameOrTitle: 'Istatistik_Sunum_Hafta8.pptx',
      text: istatistikSlideText,
    });

    expect(detected.course).toBe('İstatistik ve Olasılık');
    expect(detected.course).not.toBe('İktisat & Ekonometri');
    expect(detected.domainMode).toBe('quantitative');
    expect(detected.needsConfirmation).toBe(false);

    const formulas = extractFormulasFromText(istatistikSlideText);
    expect(formulas.length).toBeGreaterThanOrEqual(2);
    expect(formulas.some((f) => /Z\s*=|s²|χ²/i.test(f))).toBe(true);
  });

  it('4. isolates multi-course sources in one session without cross-contaminating courses', () => {
    const paraSource: ExtractedSourceItem = {
      id: 'src-para',
      name: 'Para_Teorisi_Notu.pdf',
      kind: 'file',
      text: `
--- Sayfa 1 ---
# Para Arzı ve Merkez Bankası
Merkez bankası açık piyasa işlemleri, zorunlu karşılık oranları, emisyon, para çarpanı ve likidite tuzağı mekanizmalarını yönetir.
Fisher denklemi M * V = P * Y ile para talebi analizi yapılır.
`,
      pagesOrSlides: 3,
      wordCount: 35,
      charCount: 240,
    };

    const hukukSource: ExtractedSourceItem = {
      id: 'src-hukuk',
      name: 'Borclar_Hukuku_Ders2.pdf',
      kind: 'file',
      text: `
--- Sayfa 1 ---
# Haksız Fiil ve Sözleşme Sorumluluğu
Türk Borçlar Kanunu madde 49 uyarınca kusur, zarar, hukuka aykırılık ve illiyet bağı haksız fiilin kurucu unsurlarıdır.
İcap, kabul, sebepsiz zenginleşme ve borçlunun temerrüdü hükümleri uygulanır.
`,
      pagesOrSlides: 4,
      wordCount: 36,
      charCount: 255,
    };

    const istatistikSource: ExtractedSourceItem = {
      id: 'src-stat',
      name: 'Istatistik_Hipotez.pptx',
      kind: 'file',
      text: `
--- Slayt 1 ---
# Hipotez Testleri ve Varyans Analizi (ANOVA)
Sıfır hipotezi H₀, p-değeri, güven aralığı, standart sapma, t-testi ve ki-kare bağımsızlık testi örneklem verileriyle hesaplanır.
Z = (x̄ - μ) / (σ / √n)
`,
      pagesOrSlides: 5,
      wordCount: 34,
      charCount: 230,
    };

    const analysis = buildCanonicalSourceAnalysis({
      sources: [paraSource, hukukSource, istatistikSource],
    });

    expect(analysis.isMultiCourse).toBe(true);
    expect(analysis.distinctCourses).toEqual([
      'Para Teorisi ve Politikası',
      'Borçlar Hukuku',
      'İstatistik ve Olasılık',
    ]);
    expect(analysis.profiles[0].resolvedCourse).toBe('Para Teorisi ve Politikası');
    expect(analysis.profiles[1].resolvedCourse).toBe('Borçlar Hukuku');
    expect(analysis.profiles[2].resolvedCourse).toBe('İstatistik ve Olasılık');
    expect(analysis.canonicalDigest).toContain('ÇOKLU DERS İZOLASYON KURALI');

    const bundle = buildBundleFromCanonicalAnalysis(analysis);
    expect(bundle.isMultiCourse).toBe(true);
    expect(bundle.sourceCourses).toHaveLength(3);
    expect(bundle.combinedText).toContain('DERS: Para Teorisi ve Politikası');
    expect(bundle.combinedText).toContain('DERS: Borçlar Hukuku');
    expect(bundle.combinedText).toContain('DERS: İstatistik ve Olasılık');

    const summary = generateClientStudyMaterial({
      materialType: 'summary',
      noteTitle: bundle.title,
      course: bundle.course,
      noteContext: bundle.combinedText,
      summaryDepth: 'comprehensive',
    });

    expect(summary.sections.length).toBeGreaterThanOrEqual(3);
    const headingsJoined = summary.sections.map((s: { heading: string }) => s.heading).join(' ');
    expect(headingsJoined).toMatch(/Para Arzı|Merkez Bankası/i);
    expect(headingsJoined).toMatch(/Haksız Fiil|Sözleşme/i);
    expect(headingsJoined).toMatch(/Hipotez Testleri|ANOVA/i);
  });

  it('5. refuses to auto-assign İktisat & Ekonometri when a source is ambiguous and asks user confirmation', () => {
    const ambiguous = detectCourseIdentity({
      fileNameOrTitle: 'Ders_Notu_Final_V2.pdf',
      text: `
--- Sayfa 1 ---
# Bölüm 1: Genel Giriş ve Değerlendirme
Bu notta haftalık ödevlerin teslim tarihleri, grup çalışması kuralları ve sunum değerlendirme kriterleri listelenmiştir.
Öğrencilerin kaynakça formatına dikkat etmesi gerekmektedir.
`,
    });

    expect(ambiguous.course).toBeNull();
    expect(ambiguous.confidence).toBe('uncertain');
    expect(ambiguous.needsConfirmation).toBe(true);
  });

  it('6. covers start, middle, and end of long documents and surfaces unreadable page warnings', () => {
    const pages: string[] = [];
    for (let p = 1; p <= 24; p++) {
      pages.push(
        `--- Sayfa ${p} ---\n# Bölüm ${p}: Mikro İktisat Konu ${p} - ${
          p === 1
            ? 'Tüketici Dengesi ve Kayıtsızlık Eğrileri'
            : p === 12
            ? 'Üretim Fonksiyonu ve Eşürün Eğrileri'
            : p === 24
            ? 'Oligopol Piyasaları Cournot ve Nash Dengesi'
            : `Talep Esnekliği ve Marjinal Analiz Aşaması ${p}`
        }\nBu bölümde tüketici fayda maksimizasyonu, bütçe kısıtı, marjinal ikame oranı (MRS) ve piyasa dengesi analiz edilir.`,
      );
    }

    const longMicroSource: ExtractedSourceItem = {
      id: 'src-long-micro',
      name: 'Mikro_Iktisat_Tam_Kitap.pdf',
      kind: 'file',
      text: pages.join('\n\n'),
      pagesOrSlides: 24,
      totalPagesInFile: 26,
      unreadablePages: [7, 19],
      extractionWarnings: [
        '2 sayfa (Sayfa 7, 19) yalnızca görsel/şekil içerdiği veya metin katmanı bulunmadığı için doğrudan metin olarak okunamadı.',
      ],
      wordCount: 900,
      charCount: pages.join('\n\n').length,
    };

    const analysis = buildCanonicalSourceAnalysis({
      sources: [longMicroSource],
    });

    expect(analysis.profiles[0].resolvedCourse).toBe('Mikro İktisat');
    expect(analysis.profiles[0].resolvedCourse).not.toBe('İktisat & Ekonometri');
    expect(analysis.extractionWarnings).toHaveLength(1);
    expect(analysis.extractionWarnings[0]).toContain('Sayfa 7, 19');

    const outlineText = analysis.masterOutline.map((m) => m.heading).join(' | ');
    expect(outlineText).toContain('Tüketici Dengesi');
    expect(outlineText).toContain('Oligopol Piyasaları');

    const summary = generateClientStudyMaterial({
      materialType: 'summary',
      noteTitle: 'Mikro İktisat Tam Not',
      course: 'Mikro İktisat',
      noteContext: longMicroSource.text,
      extractionWarnings: analysis.extractionWarnings,
      summaryDepth: 'textbook',
    });

    expect(summary.extractionNotices).toBeDefined();
    expect(summary.extractionNotices.join(' ')).toContain('Sayfa 7, 19');
    const summaryText = JSON.stringify(summary);
    expect(summaryText).toContain('Tüketici Dengesi');
    expect(summaryText).toContain('Oligopol Piyasaları');
  });

  it('7. folds Turkish characters reliably including dotted İ and dotless ı', () => {
    expect(foldTurkishToAscii('İstatistik ve Olasılık — Şekil Çizimi')).toBe(
      'istatistik ve olasilik - sekil cizimi',
    );
    expect(foldTurkishToAscii('Üniversite İktisat Öğretimi')).toBe(
      'universite iktisat ogretimi',
    );
  });
});
