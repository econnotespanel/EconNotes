import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Study from '@/pages/Study';
import { SummaryWorkspace } from '@/components/study/SummaryWorkspace';
import { QuizWorkspace } from '@/components/study/QuizWorkspace';
import { FlashcardWorkspace } from '@/components/study/FlashcardWorkspace';
import { generateClientStudyMaterial } from '@/lib/studyMaterialGenerator';
import { generateMaterialWithOrchestration } from '@/lib/studyAiClient';
import type { ProcessedStudyBundle, StudioGenerationSettings, StudyMaterial } from '@/types/study';

// JSDOM stubs for ResizeObserver and scrollIntoView
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = ResizeObserverStub as any;
Element.prototype.scrollIntoView = vi.fn();

const mockUseAuth = vi.fn();
const mockFrom = vi.fn();
const mockInvoke = vi.fn();

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock('@/components/Layout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div data-testid="layout">{children}</div>,
}));

vi.mock('@/components/study/InteractiveVideoStudio', () => ({
  default: () => <div data-testid="video-studio">Video Studio</div>,
}));

vi.mock('@/components/study/LiveLectureCapture', () => ({
  default: () => <div data-testid="live-lecture-capture">Live Capture</div>,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      refreshSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    },
    functions: {
      invoke: (...args: any[]) => mockInvoke(...args),
    },
    from: (...args: any[]) => mockFrom(...args),
    storage: {
      from: () => ({
        upload: vi.fn().mockResolvedValue({ error: null }),
      }),
    },
  },
}));

const SAMPLE_SUMMARY: StudyMaterial = {
  id: 'mat-sum-1',
  user_id: 'u1',
  source_type: 'own',
  source_note_id: null,
  material_type: 'summary',
  title: 'Makroekonomi: IS-LM ve Para Politikası',
  course: 'Makroekonomi II',
  model: 'EconNotes Deep Academic AI',
  created_at: '2026-11-10T10:00:00Z',
  content: {
    overview: 'IS eğrisi mal piyasası dengesini, LM eğrisi ise para piyasası dengesini temsil eder.',
    disciplineTag: 'İktisat & Ekonometri',
    keyPoints: ['Faiz oranı düştükçe yatırımlar artar.', 'Likidite tuzağında para politikası etkisizleşir.'],
    sections: [
      {
        index: 0,
        heading: '1. Mal Piyasası ve IS Eğrisi',
        pageRange: 'Sayfa 1-3',
        content:
          'Planlanan harcama denkleminde $Y = C(Y - T) + I(r) + G$ dengesi kurulur.\n\n| Politika | IS Etkisi | Çıktı |\n|---|---|---|\n| Kamu Harcaması Artışı | Sağa Kayar | Artar |',
        takeaways: ['Otonom harcama çarpanı etkilidir.'],
        deepResearchNote: 'Keynesyen modelde yatırımın faiz esnekliği eğimin ana belirleyicisidir.',
        commonPitfalls: ['Faiz değişimi eğriyi kaydırmaz, eğri boyunca hareket yaratır.'],
        checkpointQuestion: {
          question: 'Kamu harcamaları (G) artırıldığında IS eğrisi nasıl değişir?',
          options: ['Sola kayar', 'Sağa kayar', 'Dikey olur', 'Değişmez'],
          correctIndex: 1,
          explanation: 'Genişletici maliye politikası IS eğrisini sağa kaydırır.',
        },
      },
    ],
    comparativeMatrix: {
      title: 'Politika Karşılaştırması',
      columns: ['Politika', 'Araç', 'IS-LM Etkisi'],
      rows: [['Maliye', 'G / T', 'IS kayar']],
    },
    keyTerms: [{ term: 'Dışlama Etkisi', definition: 'Artan kamu harcamalarının faizi yükselterek özel yatırımları azaltması.' }],
    studyChecklist: ['IS eğrisinin eğimini açıklayabilirim.'],
    metadata: { sourceMode: 'ai', deepResearch: true, summaryDepth: 'comprehensive' },
  },
};

const SAMPLE_QUIZ: StudyMaterial = {
  id: 'mat-quiz-1',
  user_id: 'u1',
  source_type: 'own',
  source_note_id: null,
  material_type: 'quiz',
  title: 'Mikroekonomi Ara Sınavı',
  course: 'Mikroekonomi',
  model: 'EconNotes Deep Academic AI',
  created_at: '2026-11-11T10:00:00Z',
  content: {
    questions: [
      {
        type: 'multiple_choice',
        question: 'Tam rekabet piyasasında kısa dönem denge koşulu nedir?',
        options: ['MR > MC', 'P = MC', 'ATC = 0', 'P < AVC'],
        correctIndex: 1,
        explanation: 'Fiyatın marjinal maliyete eşit olduğu düzey kârı maksimize eder.',
        topic: 'Tam Rekabet',
        difficulty: 'medium',
        bloomLevel: 'Anlama',
      },
      {
        type: 'short_answer',
        question: 'Talep fiyat esnekliğinin sıfıra eşit olması ne anlama gelir? Açıklayın.',
        sampleAnswer: 'Fiyat değişse bile talep edilen miktarın hiç değişmediği tam inelastik taleptir.',
        explanation: 'Dikey talep eğrisi söz konusudur.',
        topic: 'Esneklik',
        difficulty: 'hard',
        bloomLevel: 'Analiz',
      },
    ],
  },
};

const SAMPLE_FLASHCARDS: StudyMaterial = {
  id: 'mat-fc-1',
  user_id: 'u1',
  source_type: 'own',
  source_note_id: null,
  material_type: 'flashcards',
  title: 'Ekonometri Temel Kartlar',
  course: 'Ekonometri',
  model: 'EconNotes Deep Academic AI',
  created_at: '2026-11-12T10:00:00Z',
  content: {
    cards: [
      {
        front: 'Gauss-Markov teoremi neyi garanti eder?',
        back: 'Klasik varsayımlar altında EKK (OLS) tahmincisinin BLUE (En İyi Doğrusal Sapmasız Tahminci) olduğunu garanti eder.',
        hint: 'BLUE kısaltması',
        topic: 'OLS Varsayımları',
        difficulty: 'medium',
        examTip: 'Çoklu doğrusallık BLUE özelliğini bozmaz ancak varyansı büyütür.',
      },
    ],
  },
};

function createChainMock(resolvedData: any) {
  const chain: any = {
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    limit: () => Promise.resolve({ data: resolvedData, error: null }),
    single: () => Promise.resolve({ data: resolvedData?.[0] ?? resolvedData, error: null }),
    insert: (payload: any) => ({
      select: () => ({
        single: () =>
          Promise.resolve({
            data: { id: 'new-mat-99', created_at: '2026-11-13T12:00:00Z', ...payload },
            error: null,
          }),
      }),
    }),
    update: () => ({ eq: () => Promise.resolve({ error: null }) }),
    delete: () => ({ eq: () => Promise.resolve({ error: null }) }),
    then: (resolve: any) => resolve({ data: resolvedData, error: null }),
  };
  return chain;
}

describe('Redesigned EconNotes Çalışma Stüdyosu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('offline in unit tests')) as any;
    mockUseAuth.mockReturnValue({
      user: { id: 'u1', email: 'student@uni.edu.tr', user_metadata: { full_name: 'Deniz' } },
      isAdmin: false,
    });
    mockFrom.mockImplementation((table: string) => {
      if (table === 'study_materials') return createChainMock([SAMPLE_SUMMARY]);
      if (table === 'notes') return createChainMock([]);
      if (table === 'study_progress') {
        return createChainMock([
          { id: 'p1', material_id: 'mat-quiz-1', score: 8, total_questions: 10, completed_at: '2026-11-12T10:00:00Z' },
        ]);
      }
      return createChainMock([]);
    });
    mockInvoke.mockResolvedValue({ data: null, error: { message: 'offline in test' } });
  });

  it('renders redesigned Study Studio hub, composes pasted lecture notes, and opens StudyWorkspace on generation', async () => {
    render(
      <MemoryRouter>
        <Study />
      </MemoryRouter>,
    );

    expect(
      await screen.findByText(/Ders notlarını derin üniversite kaynaklarına dönüştür/i),
    ).toBeInTheDocument();

    // Activate Metin Yapıştır tab (Radix Tabs responds to mouseDown / keyDown)
    const pasteTab = screen.getByRole('tab', { name: /Metin Yapıştır/i });
    fireEvent.mouseDown(pasteTab, { button: 0 });
    fireEvent.click(pasteTab);

    const textarea = await screen.findByPlaceholderText(/Ders notunuzu, makale özetini/i);
    fireEvent.change(textarea, {
      target: {
        value:
          '# Tüketici Dengesi\nFayda maksimizasyonu altında marjinal ikame oranı fiyat oranına eşittir. Bütçe kısıtı doğrusal bir sınırdır ve gelir arttıkça sağa kayar.',
      },
    });

    // Source X-Ray live indicator updates
    expect(await screen.findByText(/İktisat & Ekonometri/i)).toBeInTheDocument();

    // Generate button becomes enabled
    const genBtn = screen.getByRole('button', { name: /Çalışma Materyalini Oluştur/i });
    expect(genBtn).toBeEnabled();
    fireEvent.click(genBtn);

    // Full-page StudyWorkspace opens cleanly
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Stüdyo Ana Sayfa/i })).toBeInTheDocument();
    });
  });

  it('renders SummaryWorkspace chapters, LaTeX/tables, and interactive mini-checkpoint', () => {
    render(
      <SummaryWorkspace
        material={SAMPLE_SUMMARY}
        onConvertTo={vi.fn()}
        convertingTo={null}
        onExpandSection={vi.fn().mockResolvedValue(undefined)}
        expandingSectionIdx={null}
        onRegenerateDeep={vi.fn().mockResolvedValue(undefined)}
        isRegenerating={false}
        onAskCoach={vi.fn()}
      />,
    );

    expect(screen.getAllByText('1. Mal Piyasası ve IS Eğrisi').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/Politika Karşılaştırması/i)).toBeInTheDocument();
    expect(screen.getByText(/Dışlama Etkisi/i)).toBeInTheDocument();

    // Answer inline checkpoint mini-question
    fireEvent.click(screen.getByText('Sağa kayar'));
    expect(screen.getByText(/Genişletici maliye politikası IS eğrisini sağa kaydırır/i)).toBeInTheDocument();
  });

  it('supports QuizWorkspace study mode, AI rubric grading for open-ended questions, and records progress', async () => {
    const onRecordProgress = vi.fn();
    mockInvoke.mockResolvedValue({
      data: {
        content: {
          score: 88,
          verdict: 'Güçlü Cevap',
          feedback: 'Tam inelastik talep doğru tanımlanmış.',
          strengths: ['Dikey talep eğrisi vurgusu'],
          missingConcepts: ['Fiyat esnekliği E=0 formülü'],
          improvedAnswer: 'Talep fiyat esnekliği E_p = 0 olduğunda eğri dikeydir.',
        },
        sourceMode: 'ai',
      },
      error: null,
    });

    render(
      <QuizWorkspace
        material={SAMPLE_QUIZ}
        onRecordProgress={onRecordProgress}
        onAskCoach={vi.fn()}
      />,
    );

    // Answer Q1 multiple choice
    fireEvent.click(screen.getByText('P = MC'));
    expect(screen.getByText(/Fiyatın marjinal maliyete eşit olduğu düzey/i)).toBeInTheDocument();

    // Move to Q2 open-ended
    fireEvent.click(screen.getByRole('button', { name: /Sonraki Soru/i }));
    const answerBox = screen.getByPlaceholderText(/Akademik cevabınızı yazın/i);
    fireEvent.change(answerBox, {
      target: { value: 'Fiyat değişse bile miktar değişmez, tam inelastik talep eğrisi dikeydir.' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Cevabımı AI ile Puanla/i }));
    expect(await screen.findByText(/88 \/ 100 Puan/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Sınavı Bitir & Kaydet/i }));
    await waitFor(() => {
      expect(onRecordProgress).toHaveBeenCalledWith(2, 2);
    });
  });

  it('flips FlashcardWorkspace cards and supports mastery tracking', () => {
    const onRecordProgress = vi.fn();
    render(
      <FlashcardWorkspace
        material={SAMPLE_FLASHCARDS}
        onRecordProgress={onRecordProgress}
        onAskCoach={vi.fn()}
      />,
    );

    expect(screen.getByText(/Gauss-Markov teoremi neyi garanti eder/i)).toBeInTheDocument();
    fireEvent.click(screen.getByText(/Gauss-Markov teoremi neyi garanti eder/i));
    expect(screen.getAllByText(/BLUE/i).length).toBeGreaterThanOrEqual(1);

    fireEvent.click(screen.getByRole('button', { name: /Bunu Tam Öğrendim/i }));
    expect(onRecordProgress).toHaveBeenCalledWith(1, 1);
  });

  it('produces open-ended and mixed quiz questions cleanly in studyMaterialGenerator', () => {
    const mixed = generateClientStudyMaterial({
      materialType: 'quiz',
      noteTitle: 'Ekonometri Regresyon',
      course: 'Ekonometri',
      quizFormat: 'open_ended',
      questionCount: 4,
      noteContext:
        'Çoklu regresyon modelinde varsayımların sağlanması gerekir. Değişen varyans durumunda standart hatalar sapmalıdır. Beyaz testi değişen varyansı sınar. Otokorelasyon zaman serilerinde ortaya çıkar.',
    });

    expect(mixed.questions).toHaveLength(4);
    expect(mixed.questions[0].type).toBe('short_answer');
    expect(mixed.questions[0].sampleAnswer.length).toBeGreaterThan(15);
    expect(mixed.questions[0].rubric.length).toBeGreaterThan(0);
  });
});

describe('Study AI Orchestration Phase 2 (Legacy Edge Enrichment & Tier-2 Map-Reduce)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    mockInvoke.mockReset();
  });

  const sampleBundle: ProcessedStudyBundle = {
    title: 'Para Teorisi - 5. Hafta',
    course: 'Para Teorisi',
    combinedText:
      'Merkez bankası emisyon yetkisine sahiptir. Zorunlu karşılık oranları ve açık piyasa işlemleri para arzını ve bankacılık likiditesini doğrudan belirler. Para piyasasında Ms ile Md kesişimi denge faiz oranını tayin eder.',
    totalWords: 320,
    totalChars: 2400,
    totalPagesOrSlides: 5,
    sourceCount: 1,
    detectedDiscipline: 'İktisat',
    outlinePreview: ['1. Emisyon ve Rezervler', '2. Açık Piyasa İşlemleri'],
    images: [],
    sources: [],
    hasScannedOcr: false,
  };

  const sampleSettings: StudioGenerationSettings = {
    materialType: 'summary',
    summaryDepth: 'comprehensive',
    deepResearch: true,
    pedagogicalStyle: 'university_lecture',
    questionCount: 8,
    cardCount: 12,
    difficulty: 'medium',
    quizFormat: 'mixed',
    customPrompt: '',
    examFocus: '',
  };

  it('rescues and deepens thin legacy single-shot Edge summary via Tier-2 expansion', async () => {
    mockInvoke.mockResolvedValueOnce({
      data: {
        sourceMode: 'ai',
        model: 'legacy-edge-v1',
        content: {
          overview: 'Para Teorisi özet girişi.',
          keyPoints: ['Emisyon tekel yetkisidir.'],
          sections: [
            {
              index: 0,
              heading: '1. Merkez Bankası Bilançosu',
              pageRange: 'Sayfa 1',
              content: 'Çok kısa özet taslağı.',
            },
          ],
        },
      },
      error: null,
    });

    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                sections: [
                  {
                    index: 0,
                    heading: '1. Merkez Bankası Bilançosu',
                    content:
                      '#### Analitik Çerçeve\nMerkez bankası bilançosunun pasif kaleminde yer alan emisyon hacmi $M_0 = C + R$ parasal tabanının temel unsurudur.\n\n> **Sınav Odağı:** Zorunlu karşılık artışı para çarpanını düşürür.',
                    takeaways: ['Parasal taban emisyon ve rezerv toplamıdır.'],
                    deepResearchNote: '[Derin Akademik Araştırma] TCMB enflasyon hedeflemesi rejimi.',
                    commonPitfalls: ['Emisyonu aktif kalem sanmak.'],
                  },
                ],
              }),
            },
          },
        ],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await generateMaterialWithOrchestration(sampleBundle, sampleSettings);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(res.sourceMode).toBe('ai');
    expect(res.content.sections?.[0].content).toContain('Analitik Çerçeve');
    expect(res.content.sections?.[0].deepResearchNote).toContain('TCMB');
  });

  it('executes Tier-2 2-stage Map-Reduce (blueprint + batched expansion) when Edge fails', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: { message: 'Edge function unavailable' } });

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  overview: 'Para Teorisi 5. hafta kapsamlı ders özeti.',
                  disciplineTag: 'İktisat',
                  keyPoints: ['Emisyon hacmi', 'Açık piyasa işlemleri'],
                  sectionsPlan: [
                    { index: 0, title: '1. Emisyon ve Rezervler', pageRange: 'Sayfa 1-2', focusPoints: ['Parasal taban'] },
                    { index: 1, title: '2. Açık Piyasa İşlemleri', pageRange: 'Sayfa 3-5', focusPoints: ['Faiz koridoru'] },
                  ],
                  teacherEmphasis: [{ point: 'Ms dışsallığı', whyImportant: 'Vize konusu', examProbability: 'Yüksek' }],
                  comparativeMatrix: {
                    title: 'Para Politikası Araçları',
                    columns: ['Araç', 'Likidite Etkisi'],
                    rows: [['APİ Alımı', 'Genişletici']],
                  },
                  deepResearchTopics: [],
                  keyTerms: [{ term: 'Emisyon', definition: 'Banknot ihracı' }],
                  studyChecklist: ['Ms-Md dengesini analiz et'],
                }),
              },
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  sections: [
                    {
                      index: 0,
                      heading: '1. Emisyon ve Rezervler',
                      pageRange: 'Sayfa 1-2',
                      content: '#### Analitik Çerçeve\nParasal taban $B = C + R$ eşitliği üzerinden para arzı çarpanını besler.',
                      takeaways: ['Emisyon parasal tabanın ana bileşenidir.'],
                      deepResearchNote: '[Derin Akademik Araştırma] Likidite yönetimi.',
                    },
                    {
                      index: 1,
                      heading: '2. Açık Piyasa İşlemleri',
                      pageRange: 'Sayfa 3-5',
                      content: '#### Politika İletimi\nMerkez bankası DİBS alımıyla bankacılık sistemine kalıcı veya geçici likidite sağlar.',
                      takeaways: ['DİBS alımı piyasa faizini aşağı çeker.'],
                      commonPitfalls: ['Tahvil fiyatı ile faiz arasındaki ters yönlü ilişkiyi gözden kaçırmak.'],
                    },
                  ],
                }),
              },
            },
          ],
        }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const res = await generateMaterialWithOrchestration(sampleBundle, sampleSettings);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(res.sourceMode).toBe('ai');
    expect(res.model).toBe('EconNotes Cloud Academic AI');
    expect(res.content.sections).toHaveLength(2);
    expect(res.content.sections?.[0].content).toContain('$B = C + R$');
    expect(res.content.sections?.[1].heading).toBe('2. Açık Piyasa İşlemleri');
  });
});
