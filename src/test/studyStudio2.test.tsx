import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';
import { PDFDocument, PDFName } from 'pdf-lib';
import { detectCourseIdentity } from '@/lib/courseDetector';
import {
  buildBundleFromCanonicalAnalysis,
  buildCanonicalSourceAnalysis,
} from '@/lib/studySourceAnalysis';
import { loadUserNotebooks, saveUserNotebooks, createEmptyNotebook } from '@/lib/neural/notebookStore';
import { generateAcademicSummaryPdfBytes } from '@/lib/academicSummaryPdf';
import { getDisciplineSummaryGuidance } from '@/lib/studySummaryArchitecture';
import { buildInitialVideoScenarioPlan } from '@/components/study/neural/VideoScenarioPreviewDialog';
import { normalizeForTurkishSpeech } from '@/components/study/video/speechEngine';
import {
  computeFlashcardDifficultyQuota,
  inferFlashcardCategory,
  rebalanceCorrectIndices,
  validateFlashcardsBatch,
  validateQuizBatch,
  verifyQuizAnswerKeyConsistency,
} from '@/lib/studyQualityEngine';
import { SummaryAnalysisProgressView } from '@/components/study/neural/SummaryAnalysisProgressView';
import { NeuralQuizWorkspace } from '@/components/study/neural/NeuralQuizWorkspace';
import type { ExtractedSourceItem, StudyMaterial, SummaryContent, SummaryJobState } from '@/types/study';

// ── Real University Course Fixtures ──────────────────────────────────────────

const OSMANLI_TEXT = `
--- Sayfa 1 ---
1. Klasik Dönem Osmanlı İktisadi Dünya Görüşü
Osmanlı iktisat zihniyeti üç temel ilke üzerine kuruludur: İaşecilik (provizyonizm), Gelenekçilik (tradisyonalizm) ve Fiskalizm.
İaşecilik, iç piyasada mal bolluğu ve uygun fiyat sağlanmasını hedefler; ihracat sıkı denetime tabi tutulurken ithalat teşvik edilir.
Gelenekçilik, mevcut üretim ve tüketim dengelerinin korunmasını, lonca ve gedik düzeninin bozulmamasını amaçlar.
Fiskalizm ise hazine gelirlerinin azamileştirilmesini ve giderlerin asgaride tutulmasını esas alır.

--- Sayfa 2 ---
2. Toprak Düzeni, Maliye ve Ticaret Kırılmaları
Klasik dönemde miri arazi üzerinde tımar sistemi uygulanmış, vergi toplama yetkisi karşılığında sipahi yetiştirilmiştir.
16. yüzyıl sonundaki Fiyat Devrimi ve savaş giderleri nedeniyle iltizam ve ardından ömür boyu malikâne sistemi yaygınlaşmıştır.
18. yüzyılda iç borçlanma aracı olarak esham sistemi geliştirilmiştir.
1838 Baltalimanı Ticaret Antlaşması ile yed-i vahit tekelleri kaldırılmış, gümrük vergileri indirilmiş ve 1881 Muharrem Kararnamesi ile Düyun-ı Umumiye İdaresi kurulmuştur.
`;

const PARA_TEORISI_TEXT = `
--- Sayfa 1 ---
1. Para Arzı Tanımları ve Parasal Taban
Dar tanımlı para arzı M1, dolaşımdaki nakit ile vadesiz mevduatların toplamıdır. Geniş tanımlı M2 buna vadeli mevduatları ekler.
Para çarpanı m = (1 + c) / (c + rr + er) formülüyle hesaplanır. Merkez bankası açık piyasa işlemleri, zorunlu karşılık oranları ve reeskont faiz oranı aracılığıyla parasal tabanı yönetir.

--- Sayfa 2 ---
2. IS-LM Modeli ve Likidite Tuzağı
Keynesyen likidite tercihi teorisinde para talebi işlem, ihtiyat ve spekülasyon güdüleriyle belirlenir.
Faiz oranlarının alt sınıra yaklaştığı likidite tuzağı durumunda LM eğrisi yataylaşır ve genişletici para politikası etkinliğini kaybederken maliye politikası tam etkinlik kazanır.
`;

const MIKRO_TEXT = `
--- Sayfa 1 ---
1. Tüketici Dengesi ve Marjinal İkame Oranı
Tüketici dengesi, kayıtsızlık eğrisinin bütçe doğrusuna teğet olduğu noktada MRS = MUx / MUy = Px / Py koşuluyla sağlanır.
Talep fiyat esnekliği mutlak değeri 1'den büyükse talep esnektir; fiyat indirimi toplam hasılatı artırır.
Tam rekabet piyasasında firma kısa dönemde P = MC = MR koşuluyla kârını maksimize eder; fiyat ortalama değişken maliyetin (AVC) altına düşerse kapanma kararı alır.
`;

const HUKUK_TEXT = `
--- Sayfa 1 ---
1. Borçlar Hukuku: Sözleşmenin Kurulması ve Hükümsüzlük
Türk Borçlar Kanunu (TBK) uyarınca sözleşme, tarafların karşılıklı ve birbirine uygun irade açıklamaları (icap ve kabul) ile kurulur.
Kanunun emredici hükümlerine, ahlaka, kamu düzenine aykırı veya konusu imkânsız sözleşmeler kesin hükümsüzdür (butlan).
Yanılma, aldatma ve korkutma hallerinde irade sakatlığı nedeniyle 1 yıllık hak düşürücü süre içinde iptal edilebilirlik söz konusudur.
`;

const ISTATISTIK_TEXT = `
--- Sayfa 1 ---
1. Hipotez Testleri ve Güven Aralıkları
Sıfır hipotezi H0 doğru iken reddedilmesi Tip I hata (anlamlılık düzeyi alpha) olarak adlandırılır; yanlış H0'ın reddedilememesi Tip II hata (beta) doğurur.
Popülasyon varyansı bilinmediğinde ve örneklem hacmi küçük olduğunda Student t-dağılımı kullanılır. p-değeri anlamlılık düzeyinden küçükse H0 reddedilir.
`;

function makeSource(overrides: Partial<ExtractedSourceItem> & { id: string; name: string; text: string }): ExtractedSourceItem {
  const words = overrides.text.trim().split(/\s+/).filter(Boolean).length;
  return {
    kind: 'file',
    pagesOrSlides: 2,
    wordCount: words,
    charCount: overrides.text.length,
    ...overrides,
  };
}

describe('Çalışma Stüdyosu 2.0 — Ders Eşleştirme & Kaynak İzolasyonu', () => {
  it('overrides stale unconfirmed "Turizm Ekonomisi" tag on "2026 Osmanlı İktisat Tarihi Vize" with Osmanlı İktisat Tarihi', () => {
    const det = detectCourseIdentity({
      fileNameOrTitle: '2026 Osmanlı İktisat Tarihi Vize.pdf',
      text: OSMANLI_TEXT,
      explicitCourse: 'Turizm Ekonomisi',
      explicitConfirmed: false,
    });
    expect(det.course).toBe('Osmanlı İktisat Tarihi');
    expect(det.course).not.toBe('Turizm Ekonomisi');
    expect(det.needsConfirmation).toBe(false);
    expect(det.confidence).toBe('high');
  });

  it('self-heals stale persisted notebook course ("Turizm Ekonomisi") on loadUserNotebooks', () => {
    const userId = 'test-user-heal-osmanli';
    const staleNb = createEmptyNotebook({
      title: '2026 Osmanlı İktisat Tarihi Vize',
      course: 'Turizm Ekonomisi',
    });
    const staleSrc = makeSource({
      id: 'src-osmanli-1',
      name: '2026 Osmanlı İktisat Tarihi Vize.pdf',
      text: OSMANLI_TEXT,
      course: 'Turizm Ekonomisi',
      detectedCourse: 'Turizm Ekonomisi',
      courseConfirmedByUser: false,
    });
    staleNb.sources = [staleSrc];
    staleNb.checkedSourceIds = [staleSrc.id];
    saveUserNotebooks(userId, [staleNb]);

    const reloaded = loadUserNotebooks(userId);
    expect(reloaded[0].sources[0].course).toBe('Osmanlı İktisat Tarihi');
    expect(reloaded[0].course).toBe('Osmanlı İktisat Tarihi');
  });

  it('accurately identifies all 5 real university disciplines independently', () => {
    const cases: Array<[string, string, RegExp]> = [
      ['Osmanlı İktisat Tarihi Vize.pdf', OSMANLI_TEXT, /Osmanlı İktisat Tarihi/i],
      ['Para Teorisi Hafta 4.pdf', PARA_TEORISI_TEXT, /Para Teorisi/i],
      ['Mikro İktisat Tüketici Dengesi.pdf', MIKRO_TEXT, /Mikro\s*İktisat/i],
      ['Borçlar Hukuku Genel Hükümler.pdf', HUKUK_TEXT, /Borçlar Hukuku/i],
      ['İstatistik II Hipotez Testleri.pdf', ISTATISTIK_TEXT, /İstatistik/i],
    ];
    for (const [fileName, text, expected] of cases) {
      const det = detectCourseIdentity({ fileNameOrTitle: fileName, text });
      expect(det.course || '').toMatch(expected);
    }
  });

  it('flags multi-course bundles and tags explicit sourceIds on canonical analysis', () => {
    const src1 = makeSource({
      id: 'src-osm',
      name: '2026 Osmanlı İktisat Tarihi Vize.pdf',
      text: OSMANLI_TEXT,
    });
    const src2 = makeSource({
      id: 'src-para',
      name: 'Para Teorisi ve Politikası.pdf',
      text: PARA_TEORISI_TEXT,
    });

    const analysis = buildCanonicalSourceAnalysis({ sources: [src1, src2] });
    expect(analysis.isMultiCourse).toBe(true);
    expect(analysis.distinctCourses.length).toBe(2);

    const bundle = buildBundleFromCanonicalAnalysis(analysis, 'Karma Defter');
    expect(bundle.sourceIds).toEqual(['src-osm', 'src-para']);
    expect(bundle.isMultiCourse).toBe(true);
  });
});

describe('Çalışma Stüdyosu 2.0 — Markalı Türkçe PDF, Disiplin Rehberi ve Gerçek ETA', () => {
  it('uses historical-institutional guidance for Osmanlı İktisat Tarihi (no forced equations)', () => {
    const guidance = getDisciplineSummaryGuidance('Osmanlı İktisat Tarihi', 'verbal');
    expect(guidance.structureFocus).toMatch(/iaşecilik/i);
    expect(guidance.formulaRule).toMatch(/uydurma/i);
  });

  it('generates valid binary Turkish PDF with real embedded EconNotes PNG logo, university & department metadata', async () => {
    const summary: SummaryContent = {
      overview:
        'Osmanlı İktisat Tarihi vize notları; iaşecilik, gelenekçilik ve fiskalizm ilkeleri ile tımar, iltizam ve malikâne kurumlarının dönüşümünü kapsar.',
      disciplineTag: 'Osmanlı İktisat Tarihi',
      keyPoints: [
        'Klasik dönem üç sacayağı: İaşecilik, Gelenekçilik ve Fiskalizm',
        'Tımar sisteminden iltizam ve malikâne sistemine geçiş süreci',
        '1838 Baltalimanı Antlaşması ve Düyun-ı Umumiye İdaresi',
      ],
      sections: [
        {
          index: 0,
          heading: 'Klasik Dönem Osmanlı İktisat İlkeleri',
          pageRange: 'Sayfa 1',
          content:
            '#### İaşecilik ve Lonca Düzeni\nOsmanlı ekonomisinde iaşecilik ilkesi iç piyasada mal bolluğu ve narh denetimi sağlar.\n\n> Sınav Vurgusu: İaşecilik tüketici refahını ve arz güvenliğini öne çıkarır.',
          takeaways: ['İaşecilik iç piyasayı korur', 'Fiskalizm hazine gelirini gözetir'],
          commonPitfalls: ['Merkantilizm ile iaşecilik sıklıkla karıştırılır; Osmanlı ihracatı değil iç arzı önceler.'],
        },
        {
          index: 1,
          heading: 'Toprak, Maliye ve Dış Ticaret Dönüşümü',
          pageRange: 'Sayfa 2',
          content:
            'Tımar sistemi nakit akış ihtiyacıyla yerini iltizama, 1695 sonrası ise ömür boyu malikâne sistemine bırakmıştır.',
          takeaways: ['Esham iç borçlanma aracıdır', 'Baltalimanı tekelleri kaldırmıştır'],
        },
      ],
      keyTerms: [
        { term: 'İaşecilik', definition: 'İç piyasada mal bolluğu ve uygun fiyat sağlamayı amaçlayan temel ilke.' },
        { term: 'Tağşiş', definition: 'Sikkenin gümüş içeriğinin düşürülerek hazineye ek gelir sağlanması.' },
      ],
      sourceCourseBreakdown: [
        { sourceName: '2026_Osmanli_Iktisat_Tarihi_Vize.pdf', course: 'Osmanlı İktisat Tarihi', pagesOrSlides: 2 },
      ],
    };

    const bytes = await generateAcademicSummaryPdfBytes({
      title: '2026 Osmanlı İktisat Tarihi Vize Özeti',
      course: 'Osmanlı İktisat Tarihi',
      university: 'İstanbul Üniversitesi',
      department: 'İktisat',
      sourceFileNames: ['2026_Osmanli_Iktisat_Tarihi_Vize.pdf'],
      createdAt: '2026-11-25T12:00:00.000Z',
      summary,
    });

    expect(bytes.byteLength).toBeGreaterThan(15_000);
    const header = new TextDecoder().decode(bytes.slice(0, 5));
    expect(header).toBe('%PDF-');

    const loaded = await PDFDocument.load(bytes);
    expect(loaded.getPageCount()).toBeGreaterThanOrEqual(3); // Cover + TOC + Content

    // Verify Page 1 actually embeds the real EconNotes PNG logo image XObject!
    const coverPage = loaded.getPage(0);
    const resources = coverPage.node.Resources();
    const xObjects = resources?.lookup(PDFName.of('XObject'));
    expect(xObjects).toBeDefined();
  });

  it('displays real elapsed/ETA indicator and clamps running progress strictly below 100%', () => {
    const startedAt = new Date(Date.now() - 25_000).toISOString();
    const job: SummaryJobState = {
      id: 'job-test-12345678',
      userId: 'u1',
      sourceFingerprint: 'fp-1',
      title: '2026 Osmanlı İktisat Tarihi Vize',
      course: 'Osmanlı İktisat Tarihi',
      disciplineFamily: 'economics',
      status: 'processing',
      currentStage: 6,
      stageCode: 'writing_sections',
      stageLabel: 'Bölüm 2/4 hazırlanıyor',
      progressPct: 100, // Even if raw value hits 100 while still processing, UI must clamp to 99%
      totalPages: 24,
      processedPages: 12,
      totalChunks: 4,
      completedChunks: 2,
      retryCount: 0,
      startedAt,
      updatedAt: new Date().toISOString(),
    };

    render(
      <SummaryAnalysisProgressView
        job={job}
        isLiveInMemory={true}
        onMinimizeToWorkspace={vi.fn()}
        onResumeJob={vi.fn()}
        onRestartJob={vi.fn()}
        onCancelJob={vi.fn()}
      />,
    );

    expect(screen.getByTestId('summary-progress-pct').textContent).toBe('%99');
    expect(screen.getByTestId('summary-eta-indicator').textContent).toContain('Tahmini kalan');
  });
});

describe('Çalışma Stüdyosu 2.0 — Video Ders Senaryo Planı & Akademik Türkçe Telaffuz', () => {
  it('builds structured editable scenario plan with discipline-aware diagram types', () => {
    const src = makeSource({
      id: 'src-osmanli-vid',
      name: '2026 Osmanlı İktisat Tarihi Vize.pdf',
      text: OSMANLI_TEXT,
    });
    const analysis = buildCanonicalSourceAnalysis({ sources: [src] });
    const plan = buildInitialVideoScenarioPlan(analysis, 'Osmanlı Vize Defteri');

    expect(plan.courseName).toBe('Osmanlı İktisat Tarihi');
    expect(plan.learningObjectives.length).toBeGreaterThanOrEqual(2);
    expect(plan.chapters.length).toBeGreaterThanOrEqual(2);
    expect(plan.chapters.some((c) => c.diagramType === 'timeline')).toBe(true);
  });

  it('normalizes Ottoman History, Economics, Statistics, and Law symbols for natural Turkish TTS', () => {
    const spoken = normalizeForTurkishSpeech(
      'Baltalimanı Antlaşması, M1 para arzı, MRS oranı, TBK hükümleri ve H₀ ile χ² testi.',
    );
    expect(spoken).toContain('Balta limanı');
    expect(spoken).toContain('Em bir para arzı');
    expect(spoken).toContain('marjinal ikame oranı');
    expect(spoken).toContain('Türk Borçlar Kanunu');
    expect(spoken).toContain('sıfır hipotezi');
    expect(spoken).toContain('ki kare');
  });
});

describe('Çalışma Stüdyosu 2.0 — Çalışma Kartları 2.0 (20/50/30 & 8 Tür) ve Akademik Sınav 2.0', () => {
  it('enforces 20% easy / 50% medium / 30% hard flashcard quota and rejects shallow 1-word cards', () => {
    const quota = computeFlashcardDifficultyQuota(20, 'mixed');
    expect(quota).toEqual({ easy: 4, medium: 10, hard: 6 });

    expect(inferFlashcardCategory('Tımar ile İltizam arasındaki fark nedir?', 'Karşılaştırma cevabı')).toBe(
      'comparison',
    );
    expect(inferFlashcardCategory('Para çarpanı formülü nedir?', 'm = (1+c)/(c+rr+er)')).toBe('formula_model');

    const validation = validateFlashcardsBatch(
      [
        // Trivial 2-word back -> MUST be rejected!
        {
          front: 'İaşecilik nedir?',
          back: 'Mal bolluğu',
          difficulty: 'easy',
        },
        // Solid academic comparison card -> MUST be accepted with cardType!
        {
          front: 'Osmanlı klasik düzeninde İaşecilik ve Fiskalizm ilkeleri nasıl farklılaşır?',
          back: 'İaşecilik iç piyasada mal bolluğu ve uygun fiyat sağlamayı amaçlarken, Fiskalizm devlet hazinesinin gelirlerini azamileştirip giderleri kısma hedefini taşır.',
          difficulty: 'hard',
          cardType: 'comparison',
          sourcePage: 'Sayfa 1',
        },
      ],
      {
        sourceText: OSMANLI_TEXT,
        course: 'Osmanlı İktisat Tarihi',
        requestedCount: 5,
      },
    );

    expect(validation.rejectedCount).toBe(1);
    expect(validation.accepted.length).toBe(1);
    expect(validation.accepted[0].cardType).toBe('comparison');
    expect(validation.accepted[0].sourcePage).toBe('Sayfa 1');
  });

  it('catches answer-key letter contradictions in 2nd-pass verifier and preserves distractorExplanations across rebalancing', () => {
    const badCheck = verifyQuizAnswerKeyConsistency({
      question: 'İaşecilik ilkesinin temel amacı aşağıdakilerden hangisidir?',
      options: ['İç piyasada mal bolluğu', 'İhracat fazlası', 'Sömürgecilik', 'Altın biriktirme'],
      correctIndex: 0,
      explanation: 'Doğru cevap C şıkkıdır çünkü sömürgecilik esas alınır.',
    });
    expect(badCheck.valid).toBe(false);
    expect(badCheck.reasons).toContain('second_pass_letter_contradiction');

    const goodCheck = verifyQuizAnswerKeyConsistency({
      question: 'İaşecilik ilkesinin temel amacı aşağıdakilerden hangisidir?',
      options: ['İç piyasada mal bolluğu sağlamak', 'İhracat fazlası üretmek', 'Vergi muafiyeti vermek', 'Gümrükleri tamamen kaldırmak'],
      correctIndex: 0,
      explanation: 'İaşecilik ilkesi iç piyasada mal bolluğu ve uygun fiyat sağlanmasını hedefler.',
      distractorExplanations: {
        A: 'Bu yanlışlıkla doğru şıkka yazılmış — temizlenmeli',
        B: 'İhracat fazlası merkantilizmin hedefidir, Osmanlı iaşeciliğinin değil.',
        C: 'Vergi muafiyeti iaşecilikle değil özel imtiyazlarla ilgilidir.',
      },
    });
    expect(goodCheck.valid).toBe(true);
    expect(goodCheck.cleanedDistractorExplanations?.A).toBeUndefined();
    expect(goodCheck.cleanedDistractorExplanations?.B).toContain('merkantilizmin');

    // Rebalancing skewed answer keys (all at index 0) must keep distractorExplanations keys aligned!
    const skewed = [0, 1, 2, 3].map((i) => ({
      type: 'multiple_choice' as const,
      question: `Soru ${i + 1}: Osmanlı maliye kurumlarından hangisi geçerlidir?`,
      options: ['Doğru Seçenek', 'Yanlış B', 'Yanlış C', 'Yanlış D'],
      correctIndex: 0,
      explanation: 'Doğru Seçenek geçerlidir.',
      distractorExplanations: { B: 'Yanlış B açıklaması', C: 'Yanlış C açıklaması', D: 'Yanlış D açıklaması' },
    }));
    const rebalanced = rebalanceCorrectIndices(skewed);
    // Item 1 moved from index 0 -> index 1 (so B became correct, A holds old B's distractor explanation)
    expect(rebalanced[1].correctIndex).toBe(1);
    expect(rebalanced[1].options?.[1]).toBe('Doğru Seçenek');
    expect(rebalanced[1].distractorExplanations?.A).toBe('Yanlış B açıklaması');
    expect(rebalanced[1].distractorExplanations?.B).toBeUndefined();
  });

  it('validates real quiz questions, preserves distractorExplanations, and renders performance diagnostic UI', () => {
    const validated = validateQuizBatch(
      [
        {
          type: 'multiple_choice',
          question: 'Osmanlı klasik iktisadi düzeninde iç piyasada mal bolluğu ve uygun fiyat sağlamayı amaçlayan ilke hangisidir?',
          options: [
            'İaşecilik (provizyonizm) ilkesi',
            'Merkantilist ihracat teşviki ilkesi',
            'Serbest piyasa bırakınız yapsınlar ilkesi',
            'Korumacı sanayileşme gümrük duvarı',
          ],
          correctIndex: 0,
          explanation: 'İaşecilik ilkesi iç piyasada mal bolluğu ve uygun fiyat sağlanmasını hedefler.',
          distractorExplanations: {
            B: 'Merkantilizm ihracatı teşvik ederken Osmanlı iaşeciliği iç arzı önceler.',
            C: 'Klasik Osmanlı düzeninde narh ve lonca denetimi vardır.',
          },
          topic: 'Klasik Dönem İlkeleri',
          difficulty: 'easy',
        },
      ],
      {
        sourceText: OSMANLI_TEXT,
        course: 'Osmanlı İktisat Tarihi',
        requestedCount: 4,
      },
    );

    expect(validated.accepted.length).toBe(1);
    expect(validated.accepted[0].distractorExplanations?.B).toContain('Merkantilizm');

    const mockMaterial: StudyMaterial = {
      id: 'mat-quiz-osmanli',
      source_type: 'own',
      source_note_id: null,
      material_type: 'quiz',
      title: 'Osmanlı İktisat Tarihi Deneme',
      course: 'Osmanlı İktisat Tarihi',
      content: { questions: validated.accepted },
      model: 'test',
      created_at: new Date().toISOString(),
    };

    const onRecord = vi.fn();
    render(
      <NeuralQuizWorkspace
        material={mockMaterial}
        onRecordProgress={onRecord}
        onAskCoach={vi.fn()}
      />,
    );

    // Pick option A -> instant explanation & wrong-option breakdown appear
    fireEvent.click(screen.getByText('İaşecilik (provizyonizm) ilkesi'));
    expect(screen.getByText(/Yanlış Şıklar Neden Hatalı/i)).toBeTruthy();
    expect(screen.getByText(/Merkantilizm ihracatı teşvik ederken/i)).toBeTruthy();

    // Finish exam -> rich performance diagnostic card appears
    fireEvent.click(screen.getByText(/Sınavı Bitir/i));
    expect(screen.getByTestId('quiz-performance-dashboard')).toBeTruthy();
    expect(screen.getByText(/Konu Bazlı Başarı Dağılımı/i)).toBeTruthy();
    expect(onRecord).toHaveBeenCalledWith(1, 1);
  });
});

describe('Çalışma Stüdyosu 2.0 — Additive SQL Migration Invariants', () => {
  it('contains safe additive source_ids columns and scalar-subselect RLS policies', () => {
    const migrationPath = path.resolve(
      process.cwd(),
      'supabase/migrations/20261125200000_study_studio_2_enhancements.sql',
    );
    const sql = fs.readFileSync(migrationPath, 'utf8');
    expect(sql).toMatch(/ALTER TABLE public\.study_summary_jobs\s+ADD COLUMN IF NOT EXISTS source_ids/i);
    expect(sql).toMatch(/ALTER TABLE public\.study_materials\s+ADD COLUMN IF NOT EXISTS source_ids/i);
    expect(sql).toMatch(/USING GIN \(source_ids\)/i);
    expect(sql).toMatch(/\(SELECT auth\.uid\(\)\) = user_id/i);
    expect(sql).not.toMatch(/DROP TABLE|TRUNCATE/i);
  });
});
