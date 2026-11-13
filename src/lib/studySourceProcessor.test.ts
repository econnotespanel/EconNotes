import { describe, it, expect, vi } from 'vitest';
import JSZip from 'jszip';
import { extractFile } from '@/lib/extractFile';
import {
  buildNoteSourceItem,
  buildPastedSourceItem,
  combineStudySources,
  detectDiscipline,
  extractOutlinePreview,
  sampleUniformContext,
  sliceContextForSection,
} from '@/lib/studySourceProcessor';

vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: { workerSrc: '' },
  getDocument: vi.fn(({ data }: any) => {
    // Signal empty-page scanned PDF when buffer byte 0 is 99
    const firstByte = data ? new Uint8Array(data)[0] : 0;
    if (firstByte === 99) {
      return {
        promise: Promise.resolve({
          numPages: 2,
          getPage: async () => ({
            getTextContent: async () => ({ items: [] }),
            getViewport: () => ({ width: 100, height: 100 }),
            render: () => ({ promise: Promise.resolve() }),
          }),
        }),
      };
    }
    return {
      promise: Promise.resolve({
        numPages: 2,
        getPage: async (pageNum: number) => ({
          getTextContent: async () => ({
            items: [
              { str: `Sayfa ${pageNum} başlığı`, hasEOL: true, transform: [1, 0, 0, 1, 10, 700] },
              {
                str: `Enflasyon ve para politikası aktarımı sayfa ${pageNum} üzerinde detaylı olarak ele alınmaktadır.`,
                hasEOL: true,
                transform: [1, 0, 0, 1, 10, 680],
              },
            ],
          }),
        }),
      }),
    };
  }),
}));

describe('studySourceProcessor & extractFile upgrades', () => {
  it('detects academic disciplines accurately from course and text', () => {
    expect(detectDiscipline('TCMB faiz kararı, IS-LM dengesi ve enflasyon beklentileri')).toBe(
      'İktisat & Ekonometri',
    );
    expect(detectDiscipline('Türk Borçlar Kanunu madde 49 haksız fiil ve yargıtay içtihadı')).toBe(
      'Hukuk & Kamu Yönetimi',
    );
    expect(detectDiscipline('Algoritma karmaşıklığı Big-O analizi ve veri yapıları')).toBe(
      'Bilgisayar & Mühendislik',
    );
  });

  it('extracts outline headings cleanly without leaking page markers', () => {
    const sample = `
--- Sayfa 1 ---
# 1. Tüketici Tercihleri ve Kayıtsızlık Eğrileri
Tüketiciler fayda maksimizasyonu hedefler.
--- Sayfa 2 ---
## 1.2 Marjinal İkame Oranı (MRS)
Eğim her noktada azalır.
BÜTÇE KISITI VE DENGE
Fiyat oranına eşitlik koşulu geçerlidir.
`;
    const outline = extractOutlinePreview(sample);
    expect(outline).toContain('1. Tüketici Tercihleri ve Kayıtsızlık Eğrileri');
    expect(outline).toContain('1.2 Marjinal İkame Oranı (MRS)');
    expect(outline).toContain('BÜTÇE KISITI VE DENGE');
    expect(outline.some((h) => h.includes('Sayfa 1'))).toBe(false);
  });

  it('combines pasted text and library notes into a unified multi-source bundle', () => {
    const pasted = buildPastedSourceItem(
      'IS-LM Ders Notu',
      'IS eğrisi mal piyasası dengesini gösterir ve faiz oranı ile gelir arasında ters ilişki kurar.',
      'Makroekonomi',
    );
    const note = buildNoteSourceItem({
      id: 'n1',
      title: 'Para Politikası Aktarım Mekanizması',
      course: 'Para Banka',
      description: 'Merkez bankası politika faizi üzerinden toplam talebi etkiler.',
      origin: 'platform',
    });

    const bundle = combineStudySources([pasted, note]);
    expect(bundle.sourceCount).toBe(2);
    expect(bundle.totalWords).toBeGreaterThan(20);
    expect(bundle.combinedText).toContain('=== KAYNAK 1: IS-LM Ders Notu');
    expect(bundle.combinedText).toContain('=== KAYNAK 2: Para Politikası Aktarım Mekanizması');
    expect(bundle.detectedDiscipline).toBe('İktisat & Ekonometri');
  });

  it('samples long documents uniformly across start, middle, and tail', () => {
    const startBlock = 'BASLANGIC_BOLUMU '.repeat(600);
    const midBlock = 'ORTA_TEOREM '.repeat(600);
    const endBlock = 'SONUC_SENTEZI '.repeat(600);
    const full = `${startBlock}\n\n${midBlock}\n\n${endBlock}`;

    const sampled = sampleUniformContext(full, 12_000);
    expect(sampled.length).toBeLessThanOrEqual(12_500);
    expect(sampled).toContain('BASLANGIC_BOLUMU');
    expect(sampled).toContain('SONUC_SENTEZI');
  });

  it('slices section context preserving matching focus keywords', () => {
    const prefix = 'Giriş metni '.repeat(1500);
    const target = '\n\nSolow büyüme modelinde durağan durum sermaye birikimi tasarruf oranına bağlıdır.\n\n';
    const suffix = 'Diğer konular '.repeat(1500);
    const slice = sliceContextForSection(`${prefix}${target}${suffix}`, 'Solow Büyüme Modeli', 1, 3, [
      'durağan durum',
      'sermaye birikimi',
    ]);
    expect(slice).toContain('Solow büyüme modelinde durağan durum');
  });

  it('extracts PPTX slide content AND speaker notes with XML entity decoding', async () => {
    const zip = new JSZip();
    zip.file(
      'ppt/slides/slide1.xml',
      `<p:sld><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>Arz &amp; Talep Esnekliği</a:t></a:r></a:p><a:p><a:r><a:t>P &lt; MC durumu</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`,
    );
    zip.file(
      'ppt/notesSlides/notesSlide1.xml',
      `<p:notes><a:p><a:r><a:t>Hoca Sınav Notu: Kısa dönem vs uzun dönem ayrımını mutlaka sorarım.</a:t></a:r></a:p></p:notes>`,
    );
    const buffer = await zip.generateAsync({ type: 'arraybuffer' });
    const file = new File([buffer], 'mikro-sunum.pptx', {
      type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    });

    const extracted = await extractFile(file);
    expect(extracted.kind).toBe('text');
    if (extracted.kind === 'text') {
      expect(extracted.text).toContain('Arz & Talep Esnekliği');
      expect(extracted.text).toContain('P < MC durumu');
      expect(extracted.text).toContain('Kısa dönem vs uzun dönem ayrımını mutlaka sorarım');
      expect(extracted.pages).toBe(1);
    }
  });

  it('detects empty scanned PDFs cleanly instead of returning empty page headers', async () => {
    const scannedBytes = new Uint8Array([99, 1, 2, 3]);
    const scannedFile = new File([scannedBytes], 'taranmis.pdf', { type: 'application/pdf' });
    await expect(extractFile(scannedFile)).rejects.toThrow(/taranmış olabilir/i);
  });

  it('preserves PDF line breaks and page counts for digital PDFs', async () => {
    const digitalBytes = new Uint8Array([37, 80, 68, 70]);
    const pdfFile = new File([digitalBytes], 'dijital.pdf', { type: 'application/pdf' });
    const extracted = await extractFile(pdfFile);
    expect(extracted.kind).toBe('text');
    if (extracted.kind === 'text') {
      expect(extracted.pages).toBe(2);
      expect(extracted.text).toContain('Sayfa 1 başlığı');
      expect(extracted.text).toContain('Sayfa 2 başlığı');
    }
  });
});
