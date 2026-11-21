import { describe, it, expect, beforeEach } from 'vitest';
import {
  buildAvoidanceAndRotationPlan,
  computeDifficultyQuota,
  computeQuestionSemanticSimilarity,
  extractContentTokens,
  inferCognitiveDifficultyAndBloom,
  loadSourceQuestionHistory,
  normalizeForComparison,
  recordValidatedQuestionsToHistory,
  resolveVideoThemeForCourse,
  validateAndRepairVideoContent,
  validateFlashcardsBatch,
  validateQuizBatch,
} from '@/lib/studyQualityEngine';
import { generateClientStudyMaterial } from '@/lib/studyMaterialGenerator';
import { buildCanonicalSourceAnalysis } from '@/lib/studySourceAnalysis';
import type { ExtractedSourceItem, QuizQuestion, StudyMaterial } from '@/types/study';

const PARA_TEORISI_NOTE = `
--- Sayfa 1 ---
# Merkez Bankası ve Emisyon Mekanizması
Emisyon Hacmi: Merkez bankasının dolaşıma çıkardığı yasal banknot ve madeni para toplamıdır ve merkez bankası bilançosunun pasif kalemidir.
Zorunlu Karşılık Oranı: Ticari bankaların topladıkları mevduatın merkez bankasında tutmak zorunda oldukları yasal paydır; yükseltilmesi kredi yaratma kapasitesini ve para çarpanını azaltır.
Açık Piyasa İşlemleri: Merkez bankasının ikincil piyasada devlet tahvili alım satımı yaparak piyasa likiditesini ve kısa vadeli faizleri doğrudan yönlendirmesidir.

--- Sayfa 2 ---
# Miktar Kuramı ve Likidite Tercihi
Miktar Kuramı: $M \\cdot V = P \\cdot Y$ özdeşliği üzerinden uzun dönemde para arzı artışının fiyatlar genel düzeyini orantılı biçimde yükselttiğini savunur.
Likidite Tuzağı: Nominal faiz oranlarının sıfıra çok yaklaştığı ve para talebinin faize karşı sonsuz esnek hâle geldiği durumda genişletici para politikasının etkisizleşmesidir.
Taylor Kuralı: Merkez bankasının politika faizini enflasyon açığı ve çıktı açığına göre sistematik biçimde ayarlamasını öneren para politikası kuralıdır.
`;

const MIKRO_IKTISAT_NOTE = `
--- Sayfa 1 ---
# Tüketici Dengesi ve Marjinal Fayda
Azalan Marjinal Fayda: Bir maldan ardışık birimler tüketildikçe her ek birimin sağladığı ilave tatminin giderek düşmesidir.
Farksızlık Eğrisi: Tüketiciye aynı toplam fayda düzeyini sağlayan farklı iki mal bileşimlerini birleştiren ve orijine dışbükey olan eğridir.
Fiyat Esnekliği: Talep edilen miktardaki yüzde değişimin fiyattaki yüzde değişime oranıdır; mutlak değeri birden büyükse talep esnektir.

--- Sayfa 2 ---
# Piyasa Yapıları ve Kâr Maksimizasyonu
Tam Rekabet Piyasası: Çok sayıda alıcı ve satıcının bulunduğu, homojen mal üretilen ve firmaların fiyat alıcı konumda olduğu piyasa yapısıdır.
Monopol Piyasası: Tek bir satıcının yakın ikamesi olmayan bir malı ürettiği ve fiyatı marjinal maliyetin üzerinde belirleyebildiği aksak rekabet yapısıdır.
Marjinal Denge Kuralı: Kârını maksimize eden bir firma üretim miktarını marjinal hasılatın marjinal maliyete eşitlendiği ($MR = MC$) noktada belirler.
`;

const BORCLAR_HUKUKU_NOTE = `
--- Sayfa 1 ---
# Sözleşmenin Kurulması: İcap ve Kabul
İcap (Öneri): Bir sözleşmenin esaslı unsurlarını içeren ve karşı tarafın kabulüyle hukuki sonuç doğurma iradesini yansıtan bağlayıcı irade beyanıdır.
Kabul Beyanı: Önerinin içeriğine tamamen uygun olarak sözleşmeyi kurma yönünde açıklanan ve önerene ulaştığında sözleşmeyi tamamlayan irade açıklamasıdır.
Gabin (Aşırı Yararlanma): Bir tarafın zor durumundan, düşüncesizliğinden veya deneyimsizliğinden yararlanılarak edimler arasında açık oransızlık yaratılmasıdır.

--- Sayfa 2 ---
# Borcun İfası ve Temerrüt
Borçlu Temerrüdü: Muaccel bir borcun borçlunun kusurlu veya kusursuz gecikmesi nedeniyle zamanında ifa edilmemesi hâlidir ve gecikme tazminatı doğurur.
İfa İmkânsızlığı: Sözleşme kurulduktan sonra borçlunun sorumlu tutulamayacağı bir sebeple edimin yerine getirilmesinin objektif olarak olanaksız hâle gelmesiyle borcun sona ermesidir.
Haksız Fiil Sorumluluğu: Hukuka aykırı ve kusurlu bir fiille başkasına zarar veren kişinin bu zararı giderme yükümlülüğüdür.
`;

const ISTATISTIK_NOTE = `
--- Sayfa 1 ---
# Olasılık Dağılımları ve Merkezi Limit Teoremi
Merkezi Limit Teoremi: Örneklem büyüklüğü yeterince arttığında örneklem ortalamalarının örnekleme dağılımının ana kütle dağılımından bağımsız olarak normal dağılıma yakınsamasıdır.
Standart Sapma: Veri değerlerinin aritmetik ortalamadan ortalama yayılımını ölçen ve varyansın kareköküne eşit olan istatistiksel ölçüttür ($\\sigma = \\sqrt{\\sigma^2}$).

--- Sayfa 2 ---
# Hipotez Testleri ve Hata Türleri
Sıfır Hipotezi: İstatistiksel testte aksine yeterli kanıt bulunana kadar geçerli kabul edilen ve fark olmadığını öne süren $H_0$ önermesidir.
Birinci Tip Hata: Gerçekte doğru olan sıfır hipotezinin ($H_0$) yanlışlıkla reddedilmesi hatasıdır ve olasılığı anlamlılık düzeyi $\\alpha$ ile gösterilir.
İkinci Tip Hata: Gerçekte yanlış olan sıfır hipotezinin reddedilememesi hatasıdır ve olasılığı $\\beta$ ile ifade edilir.
`;

describe('EconNotes Study Quality, Anti-Repetition & Video Alignment Engine', () => {
  beforeEach(() => {
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
  });

  it('enforces 30% easy / 40% medium / 30% hard cognitive difficulty quotas and Bloom classification', () => {
    expect(computeDifficultyQuota(10, 'mixed')).toEqual({ easy: 3, medium: 4, hard: 3 });
    expect(computeDifficultyQuota(15, 'mixed')).toEqual({ easy: 5, medium: 5, hard: 5 });
    expect(computeDifficultyQuota(6, 'mixed')).toEqual({ easy: 2, medium: 2, hard: 2 });
    expect(computeDifficultyQuota(8, 'hard')).toEqual({ easy: 0, medium: 0, hard: 8 });

    // Cognitive demand (NOT word length) determines difficulty
    const easyCheck = inferCognitiveDifficultyAndBloom({
      type: 'multiple_choice',
      question: 'Likidite tuzağı kavramı nedir?',
    });
    const medCheck = inferCognitiveDifficultyAndBloom({
      type: 'multiple_choice',
      question: 'Zorunlu karşılık oranı artarsa para çarpanını nasıl etkiler?',
    });
    const hardCheck = inferCognitiveDifficultyAndBloom({
      type: 'multiple_choice',
      question: 'Tam rekabet ile monopol piyasası karşılaştırıldığında aşağıdakilerden hangisi söylenemez?',
    });
    expect(easyCheck.difficulty).toBe('easy');
    expect(medCheck.difficulty).toBe('medium');
    expect(hardCheck.difficulty).toBe('hard');
  });

  it('rejects off-source hallucinations, duplicate options, invalid correctIndex, answer-key contradictions, and paraphrases', () => {
    const rawBadAndGood = [
      // 1. Off-course hallucination (Hukuk question inside Para Teorisi note)
      {
        type: 'multiple_choice',
        question: 'Borçlar Hukuku kapsamında gabin nedeniyle sözleşmenin iptali hangi süreye tabidir?',
        options: ['1 yıl', '2 yıl', '5 yıl', '10 yıl'],
        correctIndex: 0,
        explanation: 'Aşırı yararlanma halinde bir yıllık hak düşürücü süre uygulanır.',
        topic: 'Borçlar Hukuku',
      },
      // 2. Duplicate options
      {
        type: 'multiple_choice',
        question: 'Açık piyasa işlemleri merkez bankasının hangi aracını ifade eder?',
        options: ['Tahvil alım satımı', 'Tahvil alım satımı', 'Vergi indirimi', 'Gümrük tarifesi'],
        correctIndex: 0,
        explanation: 'Açık piyasa işlemleri ikincil piyasada devlet tahvili alım satımıdır.',
      },
      // 3. Invalid out-of-range correctIndex (must be rejected, NEVER clamped to 0!)
      {
        type: 'multiple_choice',
        question: 'Zorunlu karşılık oranının yükseltilmesi ticari bankaların kredi hacmini nasıl etkiler?',
        options: ['Kredi kapasitesini azaltır', 'Kredi kapasitesini artırır', 'Hiç etkilemez', 'Banknot ihracını durdurur'],
        correctIndex: 9,
        explanation: 'Zorunlu karşılık oranı yükseldiğinde kredi yaratma kapasitesi ve para çarpanı azalır.',
      },
      // 4. Explanation explicitly contradicts marked correctIndex
      {
        type: 'multiple_choice',
        question: 'Merkez bankası bilançosunda emisyon hacmi hangi tarafta yer alır?',
        options: ['Aktif kalemidir', 'Pasif kalemidir', 'Gelir kalemidir', 'Özkaynak dışı kalemdir'],
        correctIndex: 0,
        explanation: 'Doğru cevap B şıkkıdır. Emisyon hacmi merkez bankası bilançosunun pasif kalemidir.',
      },
      // 5. Truncated stem with ellipsis
      {
        type: 'multiple_choice',
        question: 'Taylor kuralı kapsamında merkez bankası...',
        options: ['Faizi ayarlar', 'Vergi toplar', 'İthalatı yasaklar', 'Ücretleri sabitler'],
        correctIndex: 0,
        explanation: 'Taylor kuralı enflasyon açığı ve çıktı açığına göre politika faizini belirler.',
      },
      // 6. VALID question #1
      {
        type: 'multiple_choice',
        question: 'Zorunlu karşılık oranının yükseltilmesi ticari bankaların kredi yaratma kapasitesini nasıl etkiler?',
        options: [
          'Kredi yaratma kapasitesini ve para çarpanını azaltır',
          'Ticari bankaların kredi hacmini doğrudan artırır',
          'Merkez bankasının tahvil satış zorunluluğunu ortadan kaldırır',
          'Nominal faiz oranlarını otomatik olarak sıfıra indirir',
        ],
        correctIndex: 0,
        explanation: 'Ders notuna göre zorunlu karşılık oranı yükseltildiğinde ticari bankaların kredi yaratma kapasitesi ve para çarpanı azalır.',
        topic: 'Merkez Bankası ve Emisyon Mekanizması',
        difficulty: 'medium',
      },
      // 7. Semantic paraphrase duplicate of #6 (MUST be rejected!)
      {
        type: 'multiple_choice',
        question: 'Zorunlu karşılık oranları yükseltildiğinde ticari bankaların kredi yaratma kapasitesi nasıl etkilenir?',
        options: [
          'Kredi yaratma kapasitesi ve para çarpanı azalır',
          'Para arzı sınırsız biçimde genişler',
          'Bankalar mevduat toplamayı bırakır',
          'Enflasyon beklentisi sıfırlanır',
        ],
        correctIndex: 0,
        explanation: 'Zorunlu karşılık oranının artırılması kredi yaratma kapasitesini ve para çarpanını azaltır.',
        topic: 'Merkez Bankası ve Emisyon Mekanizması',
        difficulty: 'medium',
      },
    ];

    const res = validateQuizBatch(rawBadAndGood, {
      sourceText: PARA_TEORISI_NOTE,
      course: 'Para Teorisi ve Politikası',
      title: 'Para Teorisi - 5. Hafta',
      outlineHeadings: ['Merkez Bankası ve Emisyon Mekanizması', 'Miktar Kuramı ve Likidite Tercihi'],
      requestedCount: 5,
      requestedDifficulty: 'mixed',
      sourceFingerprint: 'fp_para_1',
    });

    expect(res.accepted).toHaveLength(1);
    expect(res.rejected).toHaveLength(6);
    expect(res.missingCount).toBe(4);
    expect(res.accepted[0].sourceSection).toBe('Merkez Bankası ve Emisyon Mekanizması');
    expect(res.accepted[0].sourcePage).toBe('Sayfa 1');
    // Verify specific rejection codes
    const allReasons = res.rejected.flatMap((r) => r.reasons).join(' ');
    expect(allReasons).toContain('ungrounded_off_source');
    expect(allReasons).toContain('duplicate_options');
    expect(allReasons).toContain('invalid_correct_index');
    expect(allReasons).toContain('explanation_letter_mismatch');
    expect(allReasons).toContain('truncated_stem');
    expect(allReasons).toContain('batch_duplicate');
  });

  it('prevents repeated questions across 3 consecutive Quiz runs on the same note (Para Teorisi, Mikro İktisat, Borçlar Hukuku, İstatistik)', () => {
    const courses = [
      { name: 'Para Teorisi ve Politikası', fp: 'fp_para', text: PARA_TEORISI_NOTE },
      { name: 'Mikro İktisat', fp: 'fp_mikro', text: MIKRO_IKTISAT_NOTE },
      { name: 'Borçlar Hukuku', fp: 'fp_hukuk', text: BORCLAR_HUKUKU_NOTE },
      { name: 'İstatistik', fp: 'fp_stat', text: ISTATISTIK_NOTE },
    ];

    for (const c of courses) {
      const seenQuestions: QuizQuestion[] = [];
      for (let run = 1; run <= 3; run++) {
        const history = loadSourceQuestionHistory({
          userId: 'student-1',
          sourceFingerprint: c.fp,
          course: c.name,
        });
        const plan = buildAvoidanceAndRotationPlan({
          outlineHeadings: ['Bölüm 1', 'Bölüm 2'],
          historyEntries: history,
          requestedCount: 4,
          generationNonce: `run-${run}-${c.fp}`,
        });

        const res = generateClientStudyMaterial({
          materialType: 'quiz',
          noteTitle: c.name,
          course: c.name,
          noteContext: c.text,
          questionCount: 4,
          difficulty: 'mixed',
          sourceFingerprint: c.fp,
          generationNonce: `run-${run}-${c.fp}`,
          avoidHistory: history,
          preferredTopics: plan.priorityTopics,
        });

        const qs = (res.questions as QuizQuestion[]) || [];
        expect(qs.length).toBeGreaterThanOrEqual(2);

        // Verify ZERO semantic duplicates against every question from earlier runs!
        for (const q of qs) {
          for (const prev of seenQuestions) {
            const sim = computeQuestionSemanticSimilarity(
              {
                stemNormalized: normalizeForComparison(q.question),
                stemTokens: extractContentTokens(q.question),
                answerTokens: extractContentTokens(
                  q.type === 'short_answer' ? q.sampleAnswer || '' : q.options?.[q.correctIndex ?? 0] || '',
                ),
                conceptKey: q.conceptKey,
              },
              {
                stemNormalized: normalizeForComparison(prev.question),
                stemTokens: extractContentTokens(prev.question),
                answerTokens: extractContentTokens(
                  prev.type === 'short_answer' ? prev.sampleAnswer || '' : prev.options?.[prev.correctIndex ?? 0] || '',
                ),
                conceptKey: prev.conceptKey,
              },
            );
            expect(sim.isDuplicate).toBe(false);
          }
          if (q.type === 'multiple_choice') {
            expect(q.options).toHaveLength(4);
            expect(new Set(q.options?.map(normalizeForComparison)).size).toBe(4);
            expect(q.explanation && q.explanation.length).toBeGreaterThan(15);
          }
        }

        seenQuestions.push(...qs);
        recordValidatedQuestionsToHistory({
          userId: 'student-1',
          sourceFingerprint: c.fp,
          course: c.name,
          questions: qs,
        });
      }
      expect(seenQuestions.length).toBeGreaterThanOrEqual(8);
    }
  });

  it('locks Video visualTheme, bans economics curves on Borçlar Hukuku, synchronizes turns<->narration, and aligns slide nodes', () => {
    expect(resolveVideoThemeForCourse('Para Teorisi ve Politikası', 'Para Teorisi', PARA_TEORISI_NOTE)).toBe('economics');
    expect(resolveVideoThemeForCourse('Mikro İktisat', 'Mikro İktisat', MIKRO_IKTISAT_NOTE)).toBe('economics');
    expect(resolveVideoThemeForCourse('Borçlar Hukuku', 'Borçlar Hukuku', BORCLAR_HUKUKU_NOTE)).toBe('law');
    expect(resolveVideoThemeForCourse('İstatistik', 'İstatistik', ISTATISTIK_NOTE)).toBe('science');

    // Feed a misconfigured AI video for Borçlar Hukuku (wrong economics theme, illegal curve diagram, generic nodes, greeting chatter)
    const flawedLawVideo = {
      videoTitle: 'Borçlar Hukuku Dersi',
      scenes: [
        {
          title: 'Sözleşmenin Kurulması: İcap ve Kabul',
          turns: [
            { speaker: 'Deniz', text: 'Merhaba arkadaşlar! Akıllı tahtamızda bugün başlıyoruz.' },
            { speaker: 'Deniz', text: 'İcap, bir sözleşmenin esaslı unsurlarını içeren bağlayıcı irade beyanıdır.' },
            { speaker: 'Barış', text: 'Deniz hocam, kabul beyanı ne zaman sözleşmeyi tamamlar?' },
            { speaker: 'Deniz', text: 'Kabul beyanı öneriye tamamen uygun biçimde önerene ulaştığında sözleşmeyi kurar.' },
          ],
          narration: 'UYUMSUZ FARKLI ALTYAZI METNİ',
          diagramData: {
            diagramType: 'curve',
            visualTheme: 'economics',
            mainTitle: 'Sözleşme',
            nodes: [
              { label: 'Temel Kavram 1', subtext: 'Arz ve talep eğrisi dengesi', badge: 'Genel' },
            ],
          },
        },
      ],
    };

    const repaired = validateAndRepairVideoContent(flawedLawVideo, {
      sourceText: BORCLAR_HUKUKU_NOTE,
      course: 'Borçlar Hukuku',
      title: 'Borçlar Hukuku Ders Notu',
      extractionWarnings: ['"Borçlar.pdf" kaynağında okunamayan 1 görsel sayfa var (Sayfa 5).'],
      sourceFingerprint: 'fp_hukuk_vid',
    });

    expect(repaired).not.toBeNull();
    const scenes = repaired!.scenes as Array<Record<string, any>>;
    expect(scenes).toHaveLength(1);
    // 1. Visual theme strictly locked to 'law' (NOT 'economics')
    expect(scenes[0].diagramData.visualTheme).toBe('law');
    // 2. Illegal 'curve' diagram stripped on Law course
    expect(scenes[0].diagramData.diagramType).not.toBe('curve');
    expect(scenes[0].diagramData.diagramType).not.toBe('chart');
    // 3. Greeting chatter stripped & narration strictly synced with turns
    expect(scenes[0].narration).not.toMatch(/Merhaba arkadaşlar/i);
    expect(scenes[0].narration).toBe(
      scenes[0].turns.map((t: { text: string }) => t.text).join(' '),
    );
    // 4. Generic/off-course node replaced with real grounded nodes from scene narration
    expect(scenes[0].diagramData.nodes.length).toBeGreaterThanOrEqual(2);
    const nodesText = JSON.stringify(scenes[0].diagramData.nodes);
    expect(nodesText).not.toContain('Arz ve talep');
    expect(nodesText).toMatch(/İcap|Kabul|sözleşme/i);
    // 5. Extraction warnings preserved honestly
    expect(repaired!.extractionNotices).toContain(
      '"Borçlar.pdf" kaynağında okunamayan 1 görsel sayfa var (Sayfa 5).',
    );
  });

  it('prevents faulty/ungrounded summary outputs from poisoning CanonicalSourceAnalysis for sibling tools', () => {
    const source: ExtractedSourceItem = {
      id: 'src-para-1',
      name: 'Para Teorisi Hafta 5.pdf',
      kind: 'file',
      course: 'Para Teorisi ve Politikası',
      courseConfirmedByUser: true,
      text: PARA_TEORISI_NOTE,
      pagesOrSlides: 2,
      wordCount: 160,
      charCount: PARA_TEORISI_NOTE.length,
    };

    const initialAnalysis = buildCanonicalSourceAnalysis({ sources: [source] });
    const poisonedSummary: StudyMaterial = {
      id: 'bad-sum-1',
      source_type: 'own',
      source_note_id: null,
      material_type: 'summary',
      title: 'Hatalı Özet',
      course: 'Borçlar Hukuku',
      model: 'Test',
      created_at: new Date().toISOString(),
      content: {
        overview: 'Tamamen ilgisiz anatomi ve roma hukuku özeti',
        sections: [
          { heading: 'Anatomi ve Kas Sistemi', content: 'Kas kasılması fizyolojisi.' },
          { heading: 'Roma Hukukunda Kölelik', content: 'Ius civile.' },
        ],
        metadata: {
          sourceMode: 'ai',
          sourceFingerprint: initialAnalysis.fingerprint,
        },
      },
    };

    const cleanAnalysis = buildCanonicalSourceAnalysis({
      sources: [source],
      allMaterials: [poisonedSummary],
    });
    expect(cleanAnalysis.syncedSummaryMaterial).toBeNull();
    expect(cleanAnalysis.canonicalDigest).not.toContain('Anatomi');
    expect(cleanAnalysis.canonicalDigest).toContain('Merkez Bankası ve Emisyon Mekanizması');
  });

  it('deduplicates and validates flashcards cleanly without raw truncation dumps', () => {
    const rawCards = [
      { front: 'Para Teorisi (#1): "Emisyon..." nedir?', back: 'Kötü şablon', topic: 'Para' },
      {
        front: 'Likidite tuzağı ne anlama gelir ve para politikasını nasıl etkiler?',
        back: 'Nominal faiz oranları sıfıra yaklaştığında para talebi sonsuz esnek olur ve genişletici para politikası etkisizleşir.',
        topic: 'Likidite Tercihi',
      },
      {
        front: 'Likidite tuzağı ne demektir ve para politikasına etkisi nedir?',
        back: 'Nominal faiz sıfıra yaklaştığında para talebi sonsuz esnek hâle gelir ve para politikası etkisizleşir.',
        topic: 'Likidite Tercihi',
      },
    ];
    const check = validateFlashcardsBatch(rawCards, {
      sourceText: PARA_TEORISI_NOTE,
      course: 'Para Teorisi ve Politikası',
      requestedCount: 5,
    });
    expect(check.accepted).toHaveLength(1);
    expect(check.rejectedCount).toBe(2);
  });
});
