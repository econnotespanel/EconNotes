import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import JSZip from 'jszip';
import { PDFDocument } from 'pdf-lib';
// @ts-expect-error legacy CJS/ESM bundle for Node/Vitest PDF text extraction verification
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.js';
import { extractFile } from '@/lib/extractFile';
import {
  containsTechnicalMarkupLeak,
  findTechnicalMarkupLeaks,
  sanitizeSummaryContent,
  stripTechnicalMarkup,
} from '@/lib/academicTextSanitizer';
import { combineStudySources } from '@/lib/studySourceProcessor';
import { buildCanonicalSourceAnalysis } from '@/lib/studySourceAnalysis';
import { analyzeDocumentForSummary } from '@/lib/studyDocumentAnalyzer';
import { auditSummaryQuality } from '@/lib/studySummaryQuality';
import { runMultiStageAcademicSummaryPipeline } from '@/lib/studySummaryPipeline';
import { generateAcademicSummaryPdfBytes } from '@/lib/academicSummaryPdf';
import { buildLectureSummaryHtml } from '@/lib/liveLectureReport';
import { summaryJobManager } from '@/lib/studySummaryJobManager';
import { AcademicMarkdown } from '@/components/AcademicMarkdown';
import { NeuralSummaryWorkspace } from '@/components/study/neural/NeuralSummaryWorkspace';
import type {
  ExtractedSourceItem,
  StudioGenerationSettings,
  StudyMaterial,
  SummaryContent,
} from '@/types/study';

// ==================== SUPABASE MOCK ====================
const functionsInvokeMock = vi.fn();
const rpcMock = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  SUPABASE_URL: 'https://test.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'test-anon-key',
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: null } }),
      refreshSession: async () => ({ data: { session: null } }),
    },
    functions: {
      invoke: (...args: unknown[]) => functionsInvokeMock(...args),
    },
    rpc: (...args: unknown[]) => rpcMock(...args),
    from: () => ({
      insert: (payload: Record<string, unknown>) => ({
        select: () => ({
          single: async () => ({
            data: { id: `mat-integrity-${Date.now()}`, created_at: new Date().toISOString(), ...payload },
            error: null,
          }),
        }),
      }),
      upsert: async () => ({ data: null, error: null }),
      select: () => ({
        eq: () => ({
          order: () => ({
            limit: async () => ({ data: [], error: null }),
          }),
        }),
      }),
    }),
  },
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'user-integrity-1' },
    profile: { university: 'İstanbul Üniversitesi', department: 'İktisat' },
  }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

const FORBIDDEN_XML_FRAGMENTS = [
  '</a:r>',
  '<a:br>',
  '<a:br/>',
  '<a:rPr',
  '</a:t>',
  '<a:p>',
  '<a:tab',
  '<a:endParaRPr',
  '<w:rPr',
  '</w:r>',
  '<w:tab',
  'lang="tr-TR"',
];

function assertZeroXmlLeak(text: string, contextLabel: string): void {
  expect(containsTechnicalMarkupLeak(text), `${contextLabel} leaked XML/HTML: ${findTechnicalMarkupLeaks(text).join(', ')}`).toBe(false);
  for (const frag of FORBIDDEN_XML_FRAGMENTS) {
    expect(text, `${contextLabel} contained raw OOXML fragment "${frag}"`).not.toContain(frag);
  }
}

async function extractTextFromPdfBytes(pdfBytes: Uint8Array): Promise<{ pageCount: number; fullText: string }> {
  const loadingTask = pdfjsLib.getDocument({
    data: pdfBytes.slice(),
    useWorkerFetch: false,
    isEvalSupported: false,
    disableFontFace: true,
  });
  const doc = await loadingTask.promise;
  const pages: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    pages.push(
      tc.items
        .map((item) => ('str' in item ? item.str : ''))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim(),
    );
  }
  await doc.destroy();
  return { pageCount: pages.length, fullText: pages.join('\n') };
}

/**
 * Builds a REAL binary .pptx for "Osmanlı İktisat Tarihi — Osmanlı Toplumsal Yapısı"
 * intentionally packed with real-world PowerPoint OOXML constructs that previously caused
 * `</a:r><a:br><a:rPr lang="tr-TR"...></a:t><a:p>` leakage:
 * - `<a:tab/>` inside paragraphs AND inside `<a:tc>` table cells (previously matched by `/<a:t[^>]*>/`)
 * - `<a:br><a:rPr lang="tr-TR" sz="1800" dirty="0"/></a:br>`
 * - `<a:rPr lang="tr-TR" b="1" dirty="0"/>`, `<a:endParaRPr lang="tr-TR" sz="1600"/>`, `<a:pPr algn="l"/>`
 * - `<a:fld>` slide field & speaker notes
 */
async function buildHostileOoxmlOttomanPptx(): Promise<File> {
  const zip = new JSZip();

  const slide1 = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld><p:spTree><p:sp><p:txBody>
    <a:bodyPr/><a:lstStyle/>
    <a:p>
      <a:pPr algn="ctr"/>
      <a:r><a:rPr lang="tr-TR" sz="2800" b="1" dirty="0"/><a:t>1. Osmanlı Toplumsal Yapısı ve İktisadi İlkeler</a:t></a:r>
      <a:endParaRPr lang="tr-TR" sz="2800"/>
    </a:p>
    <a:p>
      <a:pPr marL="228600"/>
      <a:r><a:rPr lang="tr-TR" sz="1800" dirty="0"/><a:t>Osmanlı klasik toplum düzeni işlevsel olarak iki ana tabakaya ayrılır:</a:t></a:r>
      <a:r><a:rPr lang="tr-TR" sz="1800"/><a:tab/></a:r>
      <a:br><a:rPr lang="tr-TR" sz="1800" dirty="0"/></a:br>
      <a:r><a:rPr lang="tr-TR" b="1" sz="1800"/><a:t>Askeri (Yönetenler)</a:t></a:r>
      <a:r><a:rPr lang="tr-TR" sz="1800"/><a:t> ve </a:t></a:r>
      <a:r><a:rPr lang="tr-TR" b="1" sz="1800"/><a:t>Reaya (Yönetilenler)</a:t></a:r>
      <a:r><a:rPr lang="tr-TR" sz="1800"/><a:t>. Klasik Osmanlı iktisadi zihniyeti iaşecilik (provizyonizm), gelenekçilik ve fiskalizm ilkelerine dayanır.</a:t></a:r>
      <a:endParaRPr lang="tr-TR" sz="1800"/>
    </a:p>
  </p:txBody></p:sp></p:spTree></p:cSld>
</p:sld>`;

  const slide2 = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld><p:spTree>
    <p:sp><p:txBody>
      <a:p><a:r><a:rPr lang="tr-TR" b="1"/><a:t>2. Askeri Sınıfın Alt Kolları ve Reaya Tabakası</a:t></a:r></a:p>
      <a:p>
        <a:r><a:rPr lang="tr-TR"/><a:t>Askeri sınıf vergi muafiyetine sahip olup Seyfiye (idari-askeri), İlmiye (hukuk-eğitim-din) ve Kalemiye (maliye-bürokrasi) kollarından oluşur.</a:t></a:r>
        <a:br><a:rPr lang="tr-TR" dirty="0"/></a:br>
        <a:r><a:rPr lang="tr-TR"/><a:t>Reaya ise tarım, zanaat ve ticaretle uğraşarak vergi ödeyen üretici kesimdir; köylüler, şehirli esnaf ve konargöçerlerden meydana gelir.</a:t></a:r>
      </a:p>
    </p:txBody></p:sp>
    <a:tbl>
      <a:tblPr/><a:tblGrid/>
      <a:tr>
        <a:tc><a:txBody><a:p><a:r><a:rPr lang="tr-TR" b="1"/><a:t>Toplumsal Zümre</a:t></a:r></a:p></a:txBody></a:tc>
        <a:tc><a:txBody><a:p><a:r><a:rPr lang="tr-TR" b="1"/><a:t>Temel İşlev</a:t></a:r><a:r><a:tab/></a:r><a:r><a:t>ve Sorumluluk</a:t></a:r></a:p></a:txBody></a:tc>
        <a:tc><a:txBody><a:p><a:r><a:rPr lang="tr-TR" b="1"/><a:t>Vergi Statüsü</a:t></a:r></a:p></a:txBody></a:tc>
      </a:tr>
      <a:tr>
        <a:tc><a:txBody><a:p><a:r><a:rPr lang="tr-TR"/><a:t>Askeri (Seyfiye, İlmiye, Kalemiye)</a:t></a:r></a:p></a:txBody></a:tc>
        <a:tc><a:txBody><a:p><a:r><a:rPr lang="tr-TR"/><a:t>Yönetim, yargı, savunma</a:t></a:r><a:br><a:rPr lang="tr-TR"/></a:br><a:r><a:t>ve bürokrasi hizmetleri</a:t></a:r></a:p></a:txBody></a:tc>
        <a:tc><a:txBody><a:p><a:r><a:rPr lang="tr-TR"/><a:t>Vergiden muaf (dirlik/maaş alır)</a:t></a:r></a:p></a:txBody></a:tc>
      </a:tr>
      <a:tr>
        <a:tc><a:txBody><a:p><a:r><a:rPr lang="tr-TR"/><a:t>Reaya (Köylü, Esnaf, Tüccar)</a:t></a:r></a:p></a:txBody></a:tc>
        <a:tc><a:txBody><a:p><a:r><a:rPr lang="tr-TR"/><a:t>Tarımsal üretim, lonca zanaatı</a:t></a:r><a:r><a:tab/></a:r><a:r><a:t>ve ticari faaliyetler</a:t></a:r></a:p></a:txBody></a:tc>
        <a:tc><a:txBody><a:p><a:r><a:rPr lang="tr-TR"/><a:t>Öşür, haraç, cizye ve avarız öder</a:t></a:r></a:p></a:txBody></a:tc>
      </a:tr>
    </a:tbl>
  </p:spTree></p:cSld>
</p:sld>`;

  const slide3 = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld><p:spTree><p:sp><p:txBody>
    <a:p><a:r><a:rPr lang="tr-TR" b="1"/><a:t>3. Tımar Sistemi, Çifthane ve Lonca Teşkilatı</a:t></a:r></a:p>
    <a:p>
      <a:r><a:rPr lang="tr-TR"/><a:t>Miri arazi rejimi içinde uygulanan Tımar Sistemi ile devlet, vergi toplama yetkisini sipahilere devrederek hem taşra güvenliğini hem de cebelü yetiştirilmesini sağlamıştır.</a:t></a:r>
      <a:br><a:rPr lang="tr-TR" dirty="0"/></a:br>
      <a:r><a:rPr lang="tr-TR"/><a:t>Çifthane sistemi bir köylü ailesinin bir çift öküzle işleyebileceği toprağı esas alır. Şehir ekonomisinde ise Lonca teşkilatı, gedik hakkı ve narh uygulaması ile üretim kalitesini ve fiyat istikrarını denetlemiştir.</a:t></a:r>
    </a:p>
  </p:txBody></p:sp></p:spTree></p:cSld>
</p:sld>`;

  const slide4 = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld><p:spTree><p:sp><p:txBody>
    <a:p><a:r><a:rPr lang="tr-TR" b="1"/><a:t>4. Vakıf Kurumu, Millet Sistemi ve Dikey Hareketlilik</a:t></a:r></a:p>
    <a:p>
      <a:r><a:rPr lang="tr-TR"/><a:t>Vakıflar eğitim, sağlık, imaret ve bayındırlık hizmetlerini kamu hazinesine yük olmadan finanse etmiştir.</a:t></a:r>
      <a:r><a:tab/></a:r>
      <a:r><a:rPr lang="tr-TR"/><a:t>Millet sistemi gayrimüslim tebaanın dini ve hukuki özerkliğini düzenlemiştir. Avrupa feodalitesinden farklı olarak Osmanlıda kast düzeni yoktur; medrese eğitimi veya devlet hizmeti yoluyla reayadan askeri sınıfa dikey hareketlilik mümkündür.</a:t></a:r>
    </a:p>
  </p:txBody></p:sp></p:spTree></p:cSld>
</p:sld>`;

  zip.file('ppt/slides/slide1.xml', slide1);
  zip.file('ppt/slides/slide2.xml', slide2);
  zip.file('ppt/slides/slide3.xml', slide3);
  zip.file('ppt/slides/slide4.xml', slide4);
  zip.file(
    'ppt/notesSlides/notesSlide2.xml',
    `<p:notes xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:p><a:r><a:rPr lang="tr-TR"/><a:t>Sınavda askeri ile reaya arasındaki işlevsel ayrım ve dikey hareketlilik farkı sıkça sorulur.</a:t></a:r></a:p></p:notes>`,
  );

  const bytes = await zip.generateAsync({ type: 'uint8array' });
  const file = new File([bytes], 'Osmanli_Iktisat_Tarihi_Toplumsal_Yapi.pptx', {
    type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  });
  Object.defineProperty(file, 'arrayBuffer', {
    value: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  });
  return file;
}

/**
 * Builds a REAL binary .docx packed with `<w:tab/>`, `<w:br/>`, `<w:rPr>`, and a `<w:tbl>`
 * containing tabs & breaks to verify DOCX XML extraction never leaks markup.
 */
async function buildHostileOoxmlDocx(): Promise<File> {
  const zip = new JSZip();
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:pPr><w:pStyle w:val="Heading1"/></w:pPr>
      <w:r><w:rPr><w:b/><w:lang w:val="tr-TR"/></w:rPr><w:t>1. Borçlar Hukukunda İrade Beyanı ve Sözleşme</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:rPr><w:lang w:val="tr-TR"/></w:rPr><w:t>TBK m. 1 uyarınca sözleşme karşılıklı</w:t><w:tab/><w:t>ve birbirine uygun irade beyanlarıyla kurulur.</w:t><w:br/><w:t>Öneri ve kabul kurucu unsurlardır.</w:t></w:r>
    </w:p>
    <w:tbl>
      <w:tr>
        <w:tc><w:p><w:r><w:t>Yaptırım</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Sonuç</w:t><w:tab/><w:t>ve Süre</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:t>Kesin Hükümsüzlük</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Baştan itibaren geçersiz</w:t><w:br/><w:t>Süreye tabi değildir</w:t></w:r></w:p></w:tc>
      </w:tr>
    </w:tbl>
  </w:body>
</w:document>`;
  zip.file('word/document.xml', documentXml);
  const bytes = await zip.generateAsync({ type: 'uint8array' });
  const file = new File([bytes], 'Borclar_Hukuku_OOXML_Test.docx', {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
  Object.defineProperty(file, 'arrayBuffer', {
    value: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  });
  return file;
}

const DEFAULT_SETTINGS: StudioGenerationSettings = {
  materialType: 'summary',
  summaryDepth: 'comprehensive',
  deepResearch: false,
  pedagogicalStyle: 'balanced',
  questionCount: 10,
  cardCount: 12,
  difficulty: 'mixed',
  quizFormat: 'multiple_choice',
  customPrompt: '',
  examFocus: '',
  userId: 'user-integrity-1',
};

describe('EconNotes Study Studio Integrity: Zero XML Leakage, Topic Grounding & Multi-Discipline Verification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    summaryJobManager.resetForTests();
    rpcMock.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'not deployed' } });
    functionsInvokeMock.mockResolvedValue({ data: null, error: new Error('offline-deterministic') });
  });

  it('1. Hostile OOXML PPTX & DOCX extraction: strips all <a:tab/>, <a:br>, <a:rPr>, </a:r>, </a:t>, <a:p> while preserving tables & math inequalities', async () => {
    const pptxFile = await buildHostileOoxmlOttomanPptx();
    const pptxExt = await extractFile(pptxFile);
    expect(pptxExt.kind).toBe('text');
    if (pptxExt.kind !== 'text') throw new Error('expected text');

    assertZeroXmlLeak(pptxExt.text, 'PPTX extracted text');
    expect(pptxExt.text).toContain('1. Osmanlı Toplumsal Yapısı ve İktisadi İlkeler');
    expect(pptxExt.text).toContain('Askeri (Yönetenler) ve Reaya (Yönetilenler)');
    expect(pptxExt.text).toContain('| Toplumsal Zümre | Temel İşlev ve Sorumluluk | Vergi Statüsü |');
    expect(pptxExt.text).toContain('Yönetim, yargı, savunma ve bürokrasi hizmetleri');
    expect(pptxExt.text).toContain('Tımar Sistemi');
    expect(pptxExt.text).toContain('Lonca teşkilatı');
    expect(pptxExt.text).toContain('Vakıflar');
    expect(pptxExt.text).toContain('[Hoca / Konuşmacı Notu]');

    const docxFile = await buildHostileOoxmlDocx();
    const docxExt = await extractFile(docxFile);
    expect(docxExt.kind).toBe('text');
    if (docxExt.kind !== 'text') throw new Error('expected text');

    assertZeroXmlLeak(docxExt.text, 'DOCX extracted text');
    expect(docxExt.text).toContain('# 1. Borçlar Hukukunda İrade Beyanı ve Sözleşme');
    expect(docxExt.text).toContain('TBK m. 1 uyarınca sözleşme karşılıklı ve birbirine uygun irade beyanlarıyla kurulur.');
    expect(docxExt.text).toContain('| Yaptırım | Sonuç ve Süre |');

    // Sanitizer must NEVER corrupt mathematical inequalities or LaTeX formulas!
    const mathSample = 'Tam rekabette P < min(AVC) kapanma noktasıdır; |E_d| < 1 inelastik talep, p < 0.05 anlamlı ve $MR < P$ olur.';
    expect(containsTechnicalMarkupLeak(mathSample)).toBe(false);
    expect(stripTechnicalMarkup(mathSample)).toBe(mathSample);
  });

  it('2. Osmanlı İktisat Tarihi – Osmanlı Toplumsal Yapısı: zero off-topic economics headings, zero XML tags in summary, UI preview, HTML, and binary PDF', async () => {
    const pptxFile = await buildHostileOoxmlOttomanPptx();
    const pptxExt = await extractFile(pptxFile);
    if (pptxExt.kind !== 'text') throw new Error('expected text');

    const bundle = combineStudySources(
      [
        {
          id: 'src-osmanli-toplum',
          name: pptxFile.name,
          kind: 'file',
          course: 'Osmanlı İktisat Tarihi',
          courseConfirmedByUser: true,
          text: pptxExt.text,
          pagesOrSlides: 4,
          wordCount: pptxExt.text.split(/\s+/).filter(Boolean).length,
          charCount: pptxExt.text.length,
        },
      ],
      'Osmanlı Toplumsal Yapısı',
      'Osmanlı İktisat Tarihi',
    );

    const plan = analyzeDocumentForSummary(bundle, DEFAULT_SETTINGS);
    expect(plan.profile.disciplineFamily).toBe('history');

    const result = await runMultiStageAcademicSummaryPipeline({
      jobId: 'job-osmanli-toplum-1',
      bundle,
      settings: DEFAULT_SETTINGS,
      buildPdfFn: async (summary, meta) =>
        generateAcademicSummaryPdfBytes({
          title: meta.title,
          course: meta.course,
          sourceFileNames: [pptxFile.name],
          createdAt: meta.createdAt,
          summary,
        }),
    });

    expect(result.content.disciplineFamily).toBe('history');
    expect(result.content.qualityAudit?.xmlLeakCount).toBe(0);
    expect(result.content.qualityAudit?.offTopicSectionIndices?.length ?? 0).toBe(0);

    const fullJson = JSON.stringify(result.content);
    assertZeroXmlLeak(fullJson, 'Osmanlı summary JSON');

    // Strictly ZERO off-topic modern economics headings/phrases!
    expect(fullJson).not.toMatch(/Aktarım Mekanizmas[ıi]|Piyasa Dengesi|IS-LM|Keynesyen|Monetarist|Slutsky|Lerner/i);
    // Genuine Ottoman historical content MUST be present!
    expect(fullJson).toMatch(/Askeri|Reaya/i);
    expect(fullJson).toMatch(/Tımar|Çifthane|Lonca/i);
    expect(fullJson).toMatch(/Vakıf|Millet/i);

    // Render live UI Preview (NeuralSummaryWorkspace + AcademicMarkdown) and verify zero XML leakage
    const mockMat: StudyMaterial = {
      id: 'mat-osmanli-1',
      user_id: 'user-integrity-1',
      source_type: 'own',
      source_note_id: null,
      material_type: 'summary',
      title: 'Osmanlı Toplumsal Yapısı',
      course: 'Osmanlı İktisat Tarihi',
      content: result.content,
      model: result.model,
      created_at: '2026-11-27T12:00:00Z',
    };
    const { container, unmount } = render(
      <NeuralSummaryWorkspace
        material={mockMat}
        onConvertTo={vi.fn()}
        convertingTo={null}
        onExpandSection={vi.fn(async () => undefined)}
        expandingSectionIdx={null}
        onRegenerateDeep={vi.fn(async () => undefined)}
        isRegenerating={false}
        onAskCoach={vi.fn()}
      />,
    );
    const renderedText = container.textContent || '';
    assertZeroXmlLeak(renderedText, 'NeuralSummaryWorkspace rendered preview');
    expect(renderedText).not.toMatch(/Aktarım Mekanizmas[ıi]|Piyasa Dengesi/i);
    unmount();

    // Verify HTML report export is also 100% clean
    const htmlExport = buildLectureSummaryHtml({
      title: 'Osmanlı Toplumsal Yapısı',
      course: 'Osmanlı İktisat Tarihi',
      overview: result.content.overview,
      keyPoints: result.content.keyPoints,
      sections: result.content.sections,
      comparativeMatrix: result.content.comparativeMatrix,
      keyTerms: result.content.keyTerms,
      summarySynthesis: result.content.summarySynthesis,
    });
    for (const frag of ['</a:r>', '<a:br>', '<a:rPr', '</a:t>', '<a:p>']) {
      expect(htmlExport).not.toContain(frag);
    }

    // Verify REAL binary PDF bytes contain Turkish Unicode, TOC, source name, and ZERO XML/off-topic text!
    expect(result.pdfBytes).toBeDefined();
    expect(new TextDecoder().decode(result.pdfBytes!.slice(0, 5))).toBe('%PDF-');
    const pdfDoc = await PDFDocument.load(result.pdfBytes!);
    expect(pdfDoc.getPageCount()).toBeGreaterThanOrEqual(3);
    const extractedPdf = await extractTextFromPdfBytes(result.pdfBytes!);
    assertZeroXmlLeak(extractedPdf.fullText, 'Generated PDF text');
    expect(extractedPdf.fullText).toContain('İÇİNDEKİLER');
    expect(extractedPdf.fullText).toContain('Osmanlı');
    expect(extractedPdf.fullText).not.toMatch(/Aktarım Mekanizmas[ıi]|Piyasa Dengesi/i);
  }, 30000);

  it('3. Stage 8 QA Gate detects & automatically strips injected off-topic section ("Bölüm 2: Aktarım Mekanizması ve Piyasa Dengesi"), XML leaks & unverified historical polities', async () => {
    const pptxFile = await buildHostileOoxmlOttomanPptx();
    const pptxExt = await extractFile(pptxFile);
    if (pptxExt.kind !== 'text') throw new Error('expected text');

    const bundle = combineStudySources(
      [
        {
          id: 'src-osmanli-qa',
          name: pptxFile.name,
          kind: 'file',
          course: 'Osmanlı İktisat Tarihi',
          courseConfirmedByUser: true,
          text: pptxExt.text,
          pagesOrSlides: 4,
          wordCount: pptxExt.text.split(/\s+/).filter(Boolean).length,
          charCount: pptxExt.text.length,
        },
      ],
      'Osmanlı Toplumsal Yapısı',
      'Osmanlı İktisat Tarihi',
    );
    const plan = analyzeDocumentForSummary(bundle, DEFAULT_SETTINGS);

    // 3A. Direct QA audit MUST fail on raw polluted summary containing off-topic section + XML tags + unverified İlhanlı entity
    const pollutedSummary: SummaryContent = {
      overview: 'Osmanlı toplumsal yapısı</a:r><a:br><a:rPr lang="tr-TR" dirty="0"/></a:br> incelenmektedir.',
      disciplineFamily: 'history',
      keyPoints: ['Askeri ve Reaya ayrımı'],
      sections: [
        {
          heading: '1. Osmanlı Toplumsal Yapısı ve İktisadi İlkeler',
          pageRange: 'Slayt 1',
          content:
            '#### Toplumsal Tabakalar\nOsmanlı toplumu Askeri ve Reaya olarak ikiye ayrılır. İlhanlı devletinden devralınan gelenekler burada <a:p>anlatılır</a:t>.',
        },
        {
          heading: 'Bölüm 2: Aktarım Mekanizması ve Piyasa Dengesi',
          pageRange: 'Slayt 2',
          content:
            '#### Parasal Aktarım Mekanizması ve IS-LM Dengesi\nMerkez bankası politika faizini değiştirdiğinde parasal aktarım mekanizması kredi kanalı üzerinden piyasa dengesi ve toplam talebi etkiler.',
        },
      ],
    };

    const rawAudit = auditSummaryQuality({
      summary: pollutedSummary,
      bundle,
      profile: plan.profile,
      outline: plan.outline,
      formulas: plan.formulas,
      plan: plan.summaryPlan,
    });
    expect(rawAudit.passed).toBe(false);
    expect(rawAudit.xmlLeakCount).toBeGreaterThanOrEqual(1);
    expect(rawAudit.offTopicSectionIndices).toContain(1);
    expect(rawAudit.offTopicHeadings).toContain('Bölüm 2: Aktarım Mekanizması ve Piyasa Dengesi');
    expect(rawAudit.unverifiedHistoricalEntities).toContain('İlhanlı');
    expect(rawAudit.checks.find((c) => c.id === 'clarity_integrity')?.status).toBe('fail');
    expect(rawAudit.checks.find((c) => c.id === 'source_grounding')?.status).toBe('fail');

    // 3B. Full pipeline MUST automatically excise the off-topic section & strip all XML before returning!
    functionsInvokeMock.mockImplementation(async (fnName: string, opts: { body?: Record<string, unknown> }) => {
      if (fnName !== 'generate-study-material') return { data: null, error: new Error('ignore') };
      if (opts?.body?.stage === 'analyze_chunk') {
        return {
          data: {
            content: {
              overviewSnippet: pollutedSummary.overview,
              sections: pollutedSummary.sections,
              keyPoints: ['Askeri ve Reaya'],
              keyTerms: [{ term: 'Reaya', definition: 'Vergi ödeyen üretici kesim</a:t><a:br>.' }],
            },
            model: 'mock-polluted-llm',
          },
          error: null,
        };
      }
      return { data: null, error: new Error('fallback-repair') };
    });

    const cleanedResult = await runMultiStageAcademicSummaryPipeline({
      jobId: 'job-osmanli-repair-1',
      bundle,
      settings: DEFAULT_SETTINGS,
    });

    const headings = cleanedResult.content.sections.map((s) => s.heading);
    expect(headings.some((h) => /Aktarım Mekanizmas|Piyasa Dengesi/i.test(h))).toBe(false);
    expect(cleanedResult.content.qualityAudit?.xmlLeakCount).toBe(0);
    expect(cleanedResult.content.qualityAudit?.offTopicSectionIndices?.length ?? 0).toBe(0);
    assertZeroXmlLeak(JSON.stringify(cleanedResult.content), 'Pipeline auto-repaired summary');

    // AcademicMarkdown defensive check: even if legacy DB record contains raw XML tags, preview renders ZERO raw tags!
    const { container, unmount } = render(
      <AcademicMarkdown content={'Osmanlı toplumu</a:r><a:br><a:rPr lang="tr-TR" sz="1800"/></a:br><a:p>Askeri ve Reaya</a:t> ayrımı.'} />,
    );
    assertZeroXmlLeak(container.textContent || '', 'AcademicMarkdown defensive sanitization');
    expect(container.textContent).toContain('Osmanlı toplumu');
    expect(container.textContent).toContain('Askeri ve Reaya');
    unmount();
  }, 25000);

  it('4. Multi-discipline test: Mikro İktisat, Para Teorisi (genuine transmission mechanism allowed when in source), Borçlar Hukuku & İstatistik', async () => {
    // A) Para Teorisi (Actively contains Parasal Aktarım Mekanizması -> MUST be accepted as on-topic!)
    const paraSource: ExtractedSourceItem = {
      id: 'src-para-real',
      name: 'Para_Teorisi_Hafta5.pdf',
      kind: 'file',
      course: 'Para Teorisi ve Politikası',
      courseConfirmedByUser: true,
      text: `--- Sayfa 1 ---
# 1. Parasal Aktarım Mekanizması ve Kanalları
Merkez bankasının politika faizi değişiklikleri faiz oranı kanalı, kredi kanalı, döviz kuru kanalı ve varlık fiyatları kanalı üzerinden toplam talebe ve enflasyona aktarılır. Fisher denklemi M * V = P * Y ile para arzı ve fiyat düzeyi arasındaki uzun dönem ilişkisini ifade eder.
--- Sayfa 2 ---
# 2. Taylor Kuralı ve Enflasyon Hedeflemesi
Taylor kuralı i = r* + pi + 0.5*(pi - pi*) + 0.5*(y - y*) şeklinde politika faizini enflasyon açığı ve çıktı açığına bağlar.`,
      pagesOrSlides: 2,
      wordCount: 95,
      charCount: 540,
    };
    const paraBundle = combineStudySources([paraSource], 'Para Teorisi', 'Para Teorisi ve Politikası');
    const paraRes = await runMultiStageAcademicSummaryPipeline({
      jobId: 'job-para-valid',
      bundle: paraBundle,
      settings: DEFAULT_SETTINGS,
    });
    expect(paraRes.content.disciplineFamily).toBe('economics');
    expect(paraRes.content.qualityAudit?.offTopicSectionIndices?.length ?? 0).toBe(0);
    expect(JSON.stringify(paraRes.content)).toMatch(/Parasal Aktarım Mekanizması/i);

    // B) Mikro İktisat (preserves inequalities P < min(AVC) and |E_d| < 1)
    const mikroSource: ExtractedSourceItem = {
      id: 'src-mikro-real',
      name: 'Mikro_Iktisat_Piyasa_Dengesi.pdf',
      kind: 'file',
      course: 'Mikro İktisat',
      courseConfirmedByUser: true,
      text: `--- Sayfa 1 ---
# 1. Tüketici Dengesi ve Talep Esnekliği
Tüketici dengesi MRS = MU_x / MU_y = P_x / P_y koşuluyla sağlanır. İnelastik talepte |E_d| < 1 iken fiyat artışı toplam hasılatı yükseltir.
--- Sayfa 2 ---
# 2. Tam Rekabet ve Kapanma Noktası
Tam rekabette P = MC denge koşuludur. Kısa dönemde P < min(AVC) olduğunda firma üretimi geçici olarak durdurur.`,
      pagesOrSlides: 2,
      wordCount: 72,
      charCount: 420,
    };
    const mikroBundle = combineStudySources([mikroSource], 'Mikro İktisat', 'Mikro İktisat');
    const mikroRes = await runMultiStageAcademicSummaryPipeline({
      jobId: 'job-mikro-valid',
      bundle: mikroBundle,
      settings: DEFAULT_SETTINGS,
    });
    expect(mikroRes.content.disciplineFamily).toBe('economics');
    expect(mikroRes.content.qualityAudit?.xmlLeakCount).toBe(0);
    expect(JSON.stringify(mikroRes.content)).toContain('P < min(AVC)');

    // C) İstatistik (preserves p < 0.05 and hypothesis steps)
    const statSource: ExtractedSourceItem = {
      id: 'src-stat-real',
      name: 'Istatistik_Hipotez_Testleri.pdf',
      kind: 'file',
      course: 'İstatistik ve Olasılık',
      courseConfirmedByUser: true,
      text: `--- Sayfa 1 ---
# 1. Hipotez Testi Adımları ve p-Değeri Karar Kuralı
Sıfır hipotezi H_0 ve alternatif hipotez H_1 kurulduktan sonra test istatistiği z = (x_bar - mu_0) / (sigma / sqrt(n)) hesaplanır. Eğer p < 0.05 ise H_0 reddedilir. Tip I hata doğru H_0 hipotezinin reddedilmesidir.`,
      pagesOrSlides: 1,
      wordCount: 55,
      charCount: 310,
    };
    const statBundle = combineStudySources([statSource], 'Hipotez Testleri', 'İstatistik ve Olasılık');
    const statRes = await runMultiStageAcademicSummaryPipeline({
      jobId: 'job-stat-valid',
      bundle: statBundle,
      settings: DEFAULT_SETTINGS,
    });
    expect(statRes.content.disciplineFamily).toBe('statistics');
    expect(JSON.stringify(statRes.content)).toContain('p < 0.05');
    assertZeroXmlLeak(JSON.stringify(statRes.content), 'Statistics summary');
  }, 30000);

  it('5. Strict Source & User Isolation: prior AI summaries never contaminate new summary digest, and different users/notebooks never share jobs', async () => {
    const ottomanSource: ExtractedSourceItem = {
      id: 'src-isolated-ottoman',
      name: 'Osmanli_Toplumsal_Yapisi.txt',
      kind: 'file',
      course: 'Osmanlı İktisat Tarihi',
      courseConfirmedByUser: true,
      text: 'Osmanlı toplumunda Askeri sınıf ve Reaya ayrımı esastır. Tımar ve vakıf sistemi toplumsal düzeni destekler.',
      pagesOrSlides: 1,
      wordCount: 16,
      charCount: 112,
    };

    const unrelatedOldSummary: StudyMaterial = {
      id: 'old-mat-para',
      user_id: 'user-integrity-1',
      source_type: 'own',
      source_note_id: null,
      material_type: 'summary',
      title: 'Para Teorisi Eski Özet',
      course: 'Para Teorisi ve Politikası',
      content: {
        overview: 'Parasal aktarım mekanizması ve piyasa dengesi.',
        sections: [{ heading: 'Bölüm 2: Aktarım Mekanizması ve Piyasa Dengesi', content: 'IS-LM ve faiz kanalı.' }],
        metadata: { sourceMode: 'ai' },
      },
      model: 'legacy-ai',
      created_at: '2026-11-20T10:00:00Z',
    };

    // includePriorSummarySync: false (used for all fresh summaries) guarantees ZERO prior AI output bleed
    const analysis = buildCanonicalSourceAnalysis({
      sources: [ottomanSource],
      allMaterials: [unrelatedOldSummary],
      includePriorSummarySync: false,
    });
    expect(analysis.syncedSummaryMaterial).toBeNull();
    expect(analysis.canonicalDigest).not.toMatch(/Aktarım Mekanizmas|Piyasa Dengesi|Para Teorisi/i);
    expect(analysis.canonicalDigest).toContain('Osmanlı İktisat Tarihi');

    // sanitizeSummaryContent cleans broken comparativeMatrix rows & XML tags cleanly
    const cleaned = sanitizeSummaryContent({
      overview: 'Özet</a:r><a:br>metni',
      keyPoints: ['Nokta <a:rPr lang="tr-TR"/> 1'],
      sections: [{ heading: 'Başlık<a:p>', content: 'İçerik <a:t>temiz</a:t>.' }],
      comparativeMatrix: {
        title: 'Tablo<a:br>',
        columns: ['Kavram</a:t>', 'Açıklama<a:rPr lang="tr-TR"/>'],
        rows: [
          ['Reaya<a:tab/>', 'Vergi ödeyen üretici</a:r>'],
          ['', ''], // empty row dropped
        ],
      },
    });
    assertZeroXmlLeak(JSON.stringify(cleaned), 'sanitizeSummaryContent output');
    expect(cleaned.comparativeMatrix?.rows.length).toBe(1);
    expect(cleaned.comparativeMatrix?.rows[0]).toEqual(['Reaya', 'Vergi ödeyen üretici']);

    // Verify SummaryJobManager isolates users on hydrateForUser
    await summaryJobManager.hydrateForUser('user-A');
    const bundleA = combineStudySources([ottomanSource], 'Osmanlı', 'Osmanlı İktisat Tarihi');
    const startedA = await summaryJobManager.startSummaryJob({
      userId: 'user-A',
      notebookId: 'nb-A',
      bundle: bundleA,
      settings: DEFAULT_SETTINGS,
    });
    await startedA.promise;
    expect(summaryJobManager.getSnapshot().activeJob?.userId).toBe('user-A');

    // Switching to user-B MUST clear user-A's activeJob & cached PDF immediately
    await summaryJobManager.hydrateForUser('user-B');
    expect(summaryJobManager.getSnapshot().activeJob).toBeNull();
    expect(summaryJobManager.getSnapshot().completedMaterial).toBeNull();
  });
});
