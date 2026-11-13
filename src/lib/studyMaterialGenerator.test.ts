import { describe, it, expect } from 'vitest';
import { generateClientStudyMaterial } from './studyMaterialGenerator';

describe('generateClientStudyMaterial (Zero-Boilerplate Authentic Generator)', () => {
  const sampleHistoryNote = `
--- Sayfa 1 ---
# İktisat Tarihi ve Merkantilizm
Merkantilizm, 16. ve 18. yüzyıllar arasında Avrupa'da egemen olan iktisadi düşünce akımıdır.
Temel varsayımı, bir ulusun zenginliğinin sahip olduğu altın ve gümüş gibi değerli maden miktarıyla ölçüleceğidir.
Devlet müdahalesi merkantilist sistemde zorunludur; ihracat teşvik edilirken ithalat ağır gümrük vergileriyle sınırlandırılmıştır.

--- Sayfa 2 ---
# Sanayi Devrimi ve Fabrika Sistemi
Sanayi Devrimi, 18. yüzyılın ikinci yarısında İngiltere'de buhar makinesinin icadıyla başlamıştır.
Üretim atölye ve lonca tipi imalattan büyük makineleşmiş fabrika sistemine geçmiştir.
Kırsal nüfus şehirlere göç etmiş, proletarya adı verilen işçi sınıfı ve modern kapitalist sermaye birikimi ortaya çıkmıştır.

--- Sayfa 3 ---
# Klasik İktisat ve Adam Smith
Adam Smith, 1776 yılında yazdığı 'Ulusların Zenginliği' eseriyle klasik iktisadın kurucusu kabul edilir.
Görünmez el kavramı, bireylerin kendi kişisel çıkarlarını maksimize ederken toplumsal refahı da en üst düzeye çıkaracağını savunur.
Smith, merkantilist korumacılığa şiddetle karşı çıkmış ve serbest dış ticareti savunmuştur.
`;

  it('generates an authentic summary completely derived from the uploaded document text', () => {
    const result = generateClientStudyMaterial({
      materialType: 'summary',
      noteTitle: 'İktisat Tarihi',
      course: 'İktisat Tarihi',
      noteContext: sampleHistoryNote,
      summaryLength: 'detailed',
    });

    expect(result).toBeDefined();
    expect(result.overview).toContain('İktisat Tarihi');
    expect(result.sections.length).toBeGreaterThanOrEqual(3);

    // Should include the actual historical topics from the note
    const allSectionHeadings = result.sections.map((s: any) => s.heading).join(' ');
    expect(allSectionHeadings).toMatch(/Merkantilizm|Sanayi Devrimi|Klasik İktisat|Adam Smith/i);

    // CRITICAL: Must NOT contain hardcoded microeconomics boilerplate
    const fullText = JSON.stringify(result);
    expect(fullText).not.toContain('eğri üzerindeki hareket');
    expect(fullText).not.toContain('eğrinin bütünüyle ötelenmesi');
    expect(fullText).not.toContain('MB = MC');
    expect(fullText).not.toContain('Marjinal Denge');

    // Key points should contain real historical facts from the note
    const pointsText = result.keyPoints.join(' ');
    expect(pointsText).toMatch(/Merkantilizm|Sanayi Devrimi|Adam Smith|değerli maden|buhar makinesi/i);

    // Key terms must contain genuine terms extracted from the text
    const termNames = result.keyTerms.map((t: any) => t.term);
    expect(termNames.some((t: string) => /Merkantilizm|Adam Smith|Sanayi Devrimi/i.test(t))).toBe(true);
  });

  it('generates high quality quiz questions testing the actual facts in the document', () => {
    const result = generateClientStudyMaterial({
      materialType: 'quiz',
      noteTitle: 'İktisat Tarihi',
      course: 'İktisat Tarihi',
      noteContext: sampleHistoryNote,
      count: 6,
    });

    expect(result.questions).toHaveLength(6);

    for (const q of result.questions) {
      expect(q.question).toBeDefined();
      expect(q.explanation).toBeDefined();
      if (q.type === 'multiple_choice') {
        expect(q.options.length).toBe(4);
        expect(q.correctIndex).toBeGreaterThanOrEqual(0);
        expect(q.correctIndex).toBeLessThan(4);
      }
    }

    // Verify questions test the actual content (Adam Smith, Merkantilizm, etc.)
    const questionsText = JSON.stringify(result.questions);
    expect(questionsText).toMatch(/Merkantilizm|Sanayi Devrimi|Adam Smith|Ulusların Zenginliği/i);

    // Distribute correct answers across indices, not always 0
    const indices = result.questions
      .filter((q: any) => q.type === 'multiple_choice')
      .map((q: any) => q.correctIndex);
    const uniqueIndices = new Set(indices);
    expect(uniqueIndices.size).toBeGreaterThan(1);
  });

  it('generates authentic flashcards derived from the text', () => {
    const result = generateClientStudyMaterial({
      materialType: 'flashcards',
      noteTitle: 'İktisat Tarihi',
      course: 'İktisat Tarihi',
      noteContext: sampleHistoryNote,
      count: 6,
    });

    expect(result.cards).toHaveLength(6);
    const cardText = JSON.stringify(result.cards);
    expect(cardText).toMatch(/Merkantilizm|Sanayi Devrimi|Adam Smith/i);
    expect(cardText).not.toContain('eğri üzerindeki hareket');
  });

  it('generates video lesson scenes without boilerplate', () => {
    const result = generateClientStudyMaterial({
      materialType: 'video',
      noteTitle: 'İktisat Tarihi',
      course: 'İktisat Tarihi',
      noteContext: sampleHistoryNote,
    });

    expect(result.scenes.length).toBeGreaterThanOrEqual(2);
    const videoText = JSON.stringify(result);
    expect(videoText).not.toContain('eğri üzerindeki hareket');
    expect(videoText).toMatch(/Merkantilizm|Sanayi Devrimi|Adam Smith/i);
  });

  it('formats deterministic summary sections with Analitik Çerçeve, concept table, Sınav Odağı, and zero greeting chatter', () => {
    const monetaryNote = `
Merhaba arkadaşlar. Bugün Para Teorisi dersimizde merkez bankası emisyon mekanizmasını inceliyoruz.

--- Sayfa 1 ---
# Merkez Bankası ve Emisyon Yetkisi
Merkez bankası ülkedeki yasal banknot ihracı tekeline sahiptir. Zorunlu karşılık oranları ticari bankaların kredi yaratma kapasitesini ve para çarpanını doğrudan belirler. Likidite yönetimi fiyat istikrarının temel aracıdır.

--- Sayfa 2 ---
# Açık Piyasa İşlemleri ve Faiz Aktarım Kanalı
Açık piyasa işlemleri merkez bankasının tahvil alım-satımıyla piyasadaki rezerv miktarını artırması veya çekmesidir. Politika faizi değişimi kısa vadeli piyasa faizlerini ve enflasyon beklentilerini yönlendirir.
`;

    const result = generateClientStudyMaterial({
      materialType: 'summary',
      noteTitle: 'Para Teorisi - 5. Hafta',
      course: 'Para Teorisi',
      noteContext: monetaryNote,
      summaryDepth: 'comprehensive',
    });

    expect(result.overview).toContain('Para Teorisi - 5. Hafta');
    expect(result.sections.length).toBeGreaterThanOrEqual(2);

    const joinedContent = result.sections.map((s: { content: string }) => s.content).join('\n');
    expect(joinedContent).toContain('Analitik Çerçeve');
    expect(joinedContent).toContain('Kavramsal Yapı Tablosu');
    expect(joinedContent).toContain('|');
    expect(joinedContent).toContain('> **Sınav Odağı:**');

    for (const emp of result.teacherEmphasis || []) {
      expect(String(emp.point)).not.toMatch(/^\s*merhaba/i);
    }
  });

  it('generates video scenes with turns, diverse diagramType values, >=3 nodes, and greeting-free examTip', () => {
    const monetaryNote = `
Merhaba arkadaşlar. Para Teorisi 5. hafta notlarımıza başlıyoruz.
# Emisyon ve Merkez Bankası Bilançosu
Emisyon hacmi merkez bankası pasif kalemidir. Rezervler ve açık piyasa işlemleri likiditeyi ayarlar.
# Para Arzı ve Likidite Tercihi
Para arzı Ms dışsal iken para talebi Md faiz ve gelir düzeyine bağlıdır.
# Enflasyon ve Parasal Aktarım
Parasal genişleme kısa dönemde çıktı açığını daraltırken uzun dönemde fiyatlar genel düzeyini etkiler.
`;

    const result = generateClientStudyMaterial({
      materialType: 'video',
      noteTitle: 'Para Teorisi - 5. Hafta',
      course: 'Para Teorisi',
      noteContext: monetaryNote,
    });

    expect(result.scenes.length).toBeGreaterThanOrEqual(4);
    const seenTypes = new Set<string>();

    for (const sc of result.scenes) {
      expect(Array.isArray(sc.turns)).toBe(true);
      expect(sc.turns.length).toBeGreaterThanOrEqual(2);
      expect(sc.diagramData).toBeDefined();
      expect(sc.diagramData.nodes.length).toBeGreaterThanOrEqual(3);
      seenTypes.add(sc.diagramData.diagramType);
      if (sc.examTip) {
        expect(String(sc.examTip)).not.toMatch(/^\s*merhaba/i);
      }
    }

    expect(seenTypes.size).toBeGreaterThanOrEqual(3);
  });
});
