import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import JSZip from 'jszip';
import { PDFDocument } from 'pdf-lib';
// @ts-expect-error legacy CJS/ESM bundle for Node/Vitest PDF text extraction verification
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.js';
import { extractFile } from '@/lib/extractFile';
import { combineStudySources } from '@/lib/studySourceProcessor';
import { analyzeDocumentForSummary } from '@/lib/studyDocumentAnalyzer';
import { auditSummaryQuality, deduplicateSummaryParagraphs } from '@/lib/studySummaryQuality';
import {
  SUMMARY_PIPELINE_STAGES,
  runMultiStageAcademicSummaryPipeline,
  type SummaryProgressUpdate,
} from '@/lib/studySummaryPipeline';
import {
  buildSummaryPdfFileName,
  formatAcademicTextForPdf,
  generateAcademicSummaryPdfBytes,
} from '@/lib/academicSummaryPdf';
import { summaryJobManager } from '@/lib/studySummaryJobManager';
import { SummaryAnalysisProgressView } from '@/components/study/neural/SummaryAnalysisProgressView';
import { NeuralSummaryWorkspace } from '@/components/study/neural/NeuralSummaryWorkspace';
import type {
  ExtractedSourceItem,
  StudioGenerationSettings,
  StudyMaterial,
  SummaryChunkCheckpoint,
  SummaryContent,
  SummaryJobState,
} from '@/types/study';

// ==================== SUPABASE MOCK ====================
const functionsInvokeMock = vi.fn();
const rpcMock = vi.fn();
const insertedMaterials: Array<Record<string, unknown>> = [];

vi.mock('@/integrations/supabase/client', () => ({
  SUPABASE_URL: 'https://test.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'test-anon-key',
  supabase: {
    functions: {
      invoke: (...args: unknown[]) => functionsInvokeMock(...args),
    },
    rpc: (...args: unknown[]) => rpcMock(...args),
    from: (table: string) => ({
      insert: (payload: Record<string, unknown>) => ({
        select: () => ({
          single: async () => {
            const row = {
              id: `mat-${insertedMaterials.length + 1}`,
              created_at: new Date().toISOString(),
              ...payload,
            };
            if (table === 'study_materials') insertedMaterials.push(row);
            return { data: row, error: null };
          },
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

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

// ==================== REALISTIC BINARY DOCUMENT BUILDERS ====================

/**
 * Creates a real binary .docx (OOXML zip) for Borçlar Hukuku with Word Heading1/Heading2
 * styles AND an inline comparison table placed BETWEEN sections so inline order is verified.
 */
async function buildRealBorclarHukukuDocx(): Promise<File> {
  const zip = new JSZip();
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:pPr><w:pStyle w:val="Heading1"/></w:pPr>
      <w:r><w:t>1. Borç İlişkisi ve Sözleşmenin Kurucu Unsurları (TBK m. 1)</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>Borçlar Hukuku, kişiler arasındaki borç ilişkilerinin doğumunu, hükümlerini, türlerini ve sona ermesini düzenleyen özel hukuk dalıdır. Türk Borçlar Kanunu (TBK) m. 1 uyarınca sözleşme, tarafların iradelerini karşılıklı ve birbirine uygun olarak açıklamalarıyla kurulur. İrade açıklaması açık veya örtülü olabilir.</w:t></w:r>
    </w:p>
    <w:p>
      <w:pPr><w:pStyle w:val="Heading2"/></w:pPr>
      <w:r><w:t>1.1. Öneri (İcap) ve Kabul Şartları</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>Öneri, sözleşmenin esaslı unsurlarını içeren ve önereni bağlama iradesi taşıyan tek taraflı irade beyanıdır. Bağlama iradesi yoksa öneriye davet söz konusudur (TBK m. 8). Kabul ise öneriye tam ve kayıtsız şartsız uygun olmalı; değişiklik içeren cevap yeni bir öneri sayılır.</w:t></w:r>
    </w:p>
    <w:p>
      <w:pPr><w:pStyle w:val="Heading1"/></w:pPr>
      <w:r><w:t>2. Sözleşmelerde Geçerlilik Şartları, Kesin Hükümsüzlük ve İptal Edilebilirlik</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>TBK m. 27 uyarınca kanunun emredici hükümlerine, ahlaka, kamu düzenine, kişilik haklarına aykırı veya konusu başlangıçta objektif olarak imkânsız olan sözleşmeler kesin olarak hükümsüzdür (butlan). Buna karşılık irade bozuklukları (yanılma, aldatma, korkutma — TBK m. 30-39) ile aşırı yararlanma (gabin — TBK m. 28) hallerinde iptal edilebilirlik yaptırımı uygulanır.</w:t></w:r>
    </w:p>
    <w:tbl>
      <w:tr>
        <w:tc><w:p><w:r><w:t>Ölçüt</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Kesin Hükümsüzlük (Butlan)</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>İptal Edilebilirlik</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:t>Hukuki Sebep</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>TBK m. 27 emredici hukuk, şekil eksikliği, tam ehliyetsizlik</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Yanılma, aldatma, korkutma (TBK m. 30-39), aşırı yararlanma (TBK m. 28)</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:t>Hâkimin Re'sen Gözetmesi</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Evet, hâkim kendiliğinden (re'sen) dikkate alır ve süreye tabi değildir.</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Hayır, yalnızca korunan taraf 1 yıllık hak düşürücü sürede ileri sürebilir.</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:t>İstisna ve Dürüstlük Kuralı</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>TMK m. 2 hakkın kötüye kullanılması yasağı (şekil eksikliğinin ifadan sonra ileri sürülmesi)</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Süresinde iptal edilmezse sözleşme baştan itibaren geçerli (onaylanmış) sayılır.</w:t></w:r></w:p></w:tc>
      </w:tr>
    </w:tbl>
    <w:p>
      <w:pPr><w:pStyle w:val="Heading1"/></w:pPr>
      <w:r><w:t>3. Haksız Fiil Sorumluluğu (TBK m. 49) ve Kusursuz Sorumluluk İstisnaları</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>TBK m. 49'a göre kusurlu ve hukuka aykırı bir fiille başkasına zarar veren, bu zararı gidermekle yükümlüdür. Haksız fiilin dört kurucu unsuru vardır: hukuka aykırı fiil, zarar, kusur (kast veya ihmal) ve uygun illiyet bağı. İstisna olarak TBK m. 66 (adam çalıştıranın sorumluluğu), TBK m. 69 (yapı malikinin sorumluluğu) ve TBK m. 71 (tehlike sorumluluğu) hallerinde kusursuz sorumluluk geçerlidir. Zamanaşımı süresi zararı ve tazminat yükümlüsünü öğrenmeden itibaren 2 yıl ve her hâlde fiilin işlendiği tarihten itibaren 10 yıldır (TBK m. 72).</w:t></w:r>
    </w:p>
    <w:p>
      <w:pPr><w:pStyle w:val="Heading2"/></w:pPr>
      <w:r><w:t>3.1. Pratik Olay (Vaka) Analizi — Aldatma ve Haksız Fiil Yarışması</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>Örnek Olay: Satıcı A, kilometresi düşürülmüş ikinci el otomobili hasarsız diyerek Alıcı B'ye 950.000 TL bedelle satmıştır. Alıcı B üç ay sonra servis kayıtlarından gerçeği öğrenmiştir. Hukuki Sonuç: TBK m. 36 uyarınca aldatma (hile) koşulları oluşmuştur; B, öğrenme tarihinden itibaren 1 yıllık hak düşürücü süre içinde sözleşmeyi iptal ederek ödediği bedelin iadesini ve menfi zararının tazminini talep edebilir.</w:t></w:r>
    </w:p>
  </w:body>
</w:document>`;

  zip.file('word/document.xml', documentXml);
  const bytes = await zip.generateAsync({ type: 'uint8array' });
  const file = new File([bytes], 'Borclar_Hukuku_Genel_Hukumler_Ders_Notu.docx', {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
  // Ensure arrayBuffer() works cleanly in jsdom
  Object.defineProperty(file, 'arrayBuffer', {
    value: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  });
  return file;
}

/**
 * Creates a real binary 12-slide .pptx (OOXML zip) for Mikro İktisat with slide text,
 * an embedded <a:tbl> market structure table, and speaker notes.
 */
async function buildRealMikroIktisatPptx(): Promise<File> {
  const zip = new JSZip();
  const slides: Array<{ title: string; body: string[]; table?: string[][]; note?: string }> = [
    {
      title: '1. Tüketici Tercihleri ve Fayda Kuramı',
      body: [
        'Kardinal fayda yaklaşımı faydanın ölçülebilir olduğunu savunurken, ordinal fayda yaklaşımı yalnızca tercih sıralamasına dayanır.',
        'Azalan marjinal fayda yasası: Tüketilen mal miktarı arttıkça son birimin sağladığı ek fayda (MU) azalır.',
      ],
      note: 'Sınavda kardinal ve ordinal yaklaşım arasındaki varsayım farkı sıkça sorulur.',
    },
    {
      title: '2. Farksızlık Eğrileri ve Marjinal İkame Oranı (MRS)',
      body: [
        'Farksızlık eğrisi, tüketiciye aynı toplam fayda düzeyini sağlayan X ve Y mal bileşimlerinin geometrik yeridir.',
        'Marjinal İkame Oranı formülü: MRS_xy = -dY / dX = MU_x / MU_y.',
        'Orijine dışbükeylik azalan marjinal ikame oranını yansıtır; farksızlık eğrileri birbirini kesemez.',
      ],
    },
    {
      title: '3. Bütçe Kısıtı ve Tüketici Dengesi',
      body: [
        'Bütçe doğrusu denklemi: I = P_x * X + P_y * Y. Eğimi nispi fiyat oranına (-P_x / P_y) eşittir.',
        'Tüketici dengesi koşulu: MRS_xy = MU_x / MU_y = P_x / P_y (Gossen II. Yasası).',
      ],
    },
    {
      title: '4. Gelir ve İkame Etkisi — Slutsky Ayrıştırması',
      body: [
        'Bir malın fiyatı düştüğünde toplam etki, ikame etkisi ve gelir etkisinin toplamından oluşur.',
        'Slutsky Denklemi: dX / dP_x = (dX / dP_x)|_U=sabit - X * (dX / dI).',
        'Normal mallarda ikame ve gelir etkisi aynı yönlüdür; Giffen mallarında negatif gelir etkisi ikame etkisini aşar ve talep eğrisi pozitif eğimli olur.',
      ],
    },
    {
      title: '5. Talep Esnekliği Türleri ve Gelir İlişkisi',
      body: [
        'Talebin fiyat esnekliği: E_d = (%Delta Q) / (%Delta P) = (dQ / dP) * (P / Q).',
        'Esnek talep (|E_d| > 1) durumunda fiyat indirimi toplam hasılatı (TR = P * Q) artırır; inelastik talepte (|E_d| < 1) fiyat artışı TR artırır.',
      ],
    },
    {
      title: '6. Üretim Fonksiyonu ve Azalan Verimler Yasası',
      body: [
        'Cobb-Douglas Üretim Fonksiyonu: Q = A * K^alpha * L^beta. Kısa dönemde sermaye (K) sabit, emek (L) değişkendir.',
        'Marjinal ürün (MP_L) ortalama ürünü (AP_L) maksimum noktasında yukarıdan aşağıya keser. Ölçeğe göre getiri alpha + beta toplamına bağlıdır.',
      ],
    },
    {
      title: '7. Kısa ve Uzun Dönem Maliyet Eğrileri',
      body: [
        'Toplam Maliyet: TC = TFC + TVC. Ortalama Toplam Maliyet: ATC = AFC + AVC. Marjinal Maliyet: MC = dTC / dQ.',
        'MC eğrisi, AVC ve ATC eğrilerini minimum noktalarından aşağıdan yukarıya keser. Uzun dönem ortalama maliyet (LRAC) zarf eğrisidir.',
      ],
    },
    {
      title: '8. Tam Rekabet Piyasası ve Kâr Maksimizasyonu',
      body: [
        'Tam rekabette firmalar fiyat alıcıdır: P = AR = MR. Kısa dönem denge koşulu: P = MC ve MC artan olmalıdır.',
        'Kapanma noktası: P < min(AVC) ise firma kısa dönemde üretimi durdurur. Uzun dönemde serbest giriş-çıkış nedeniyle iktisadi kâr sıfırlanır (P = min LRAC).',
      ],
    },
    {
      title: '9. Monopol Piyasası, Lerner Endeksi ve Dara Kaybı',
      body: [
        'Monopolcü negatif eğimli talep eğrisiyle karşılaşır; marjinal hasılat her zaman fiyatın altındadır (MR < P).',
        'Monopol gücü ölçüsü — Lerner Endeksi: L = (P - MC) / P = -1 / E_d. Monopol, tam rekabete kıyasla daha az üretim ve daha yüksek fiyatla toplumsal dara kaybı yaratır.',
      ],
    },
    {
      title: '10. Oligopol Modelleri: Cournot, Bertrand ve Nash Dengesi',
      body: [
        'Cournot düopolünde firmalar miktar stratejisi üzerinden eşzamanlı karar verir; tepki fonksiyonlarının kesişimi Nash dengesini verir.',
        'Bertrand modelinde homojen mal üreten firmalar fiyat rekabetiyle P = MC (tam rekabet) sonucuna ulaşır (Bertrand paradoksu).',
      ],
    },
    {
      title: '11. Piyasa Yapılarının Karşılaştırmalı Özeti',
      body: ['Dört temel piyasa yapısının yapısal ve uzun dönem denge karşılaştırması aşağıdadır:'],
      table: [
        ['Özellik', 'Tam Rekabet', 'Monopol', 'Monopolcü Rekabet', 'Oligopol'],
        ['Firma Sayısı', 'Çok fazla', 'Tek firma', 'Çok fazla', 'Az sayıda büyük firma'],
        ['Ürün Niteliği', 'Homojen', 'Yakın ikamesi yok', 'Farklılaştırılmış', 'Homojen veya farklılaştırılmış'],
        ['Fiyat ve MC İlişkisi', 'P = MC', 'P > MC', 'P > MC', 'P > MC (Cournot) / P = MC (Bertrand)'],
        ['Uzun Dönem İktisadi Kâr', 'Sıfır (Normal kâr)', 'Pozitif olabilir', 'Sıfır (Aşırı kapasite)', 'Pozitif olabilir (Giriş engelli)'],
      ],
    },
    {
      title: '12. Sayısal Uygulama Örneği: Monopol Denge Hesabı',
      body: [
        'Örnek: Bir monopolcünün talep fonksiyonu P = 100 - 2Q ve toplam maliyet fonksiyonu TC = 20Q + 200 olsun.',
        'Çözüm: TR = 100Q - 2Q^2 => MR = 100 - 4Q; MC = 20. MR = MC eşitliğinden 100 - 4Q = 20 => Q* = 20 birim, P* = 60 TL ve Kâr = TR - TC = 1200 - 600 = 600 TL bulunur.',
      ],
    },
  ];

  const xmlEsc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  slides.forEach((slide, idx) => {
    const n = idx + 1;
    const paragraphsXml = [slide.title, ...slide.body]
      .map((line) => `<a:p><a:r><a:t>${xmlEsc(line)}</a:t></a:r></a:p>`)
      .join('\n');

    const tableXml = slide.table
      ? `<a:tbl>${slide.table
          .map(
            (row) =>
              `<a:tr>${row
                .map((cell) => `<a:tc><a:txBody><a:p><a:r><a:t>${xmlEsc(cell)}</a:t></a:r></a:p></a:txBody></a:tc>`)
                .join('')}</a:tr>`,
          )
          .join('')}</a:tbl>`
      : '';

    const slideXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld><p:spTree><p:sp><p:txBody>${paragraphsXml}</p:txBody></p:sp>${tableXml}</p:spTree></p:cSld>
</p:sld>`;
    zip.file(`ppt/slides/slide${n}.xml`, slideXml);

    if (slide.note) {
      zip.file(
        `ppt/notesSlides/notesSlide${n}.xml`,
        `<p:notes xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:p><a:r><a:t>${xmlEsc(slide.note)}</a:t></a:r></a:p></p:notes>`,
      );
    }
  });

  const bytes = await zip.generateAsync({ type: 'uint8array' });
  const file = new File([bytes], 'Mikro_Iktisat_Sunum_12_Slayt.pptx', {
    type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  });
  Object.defineProperty(file, 'arrayBuffer', {
    value: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  });
  return file;
}

/**
 * Builds a rich 24-page multi-chapter Para Teorisi ve Politikası document (including formulas,
 * comparison table, numerical example, AND 1 simulated unreadable/scanned page at page 24).
 */
function buildParaTeorisi24PageSource(): ExtractedSourceItem {
  const pages: string[] = [
    `--- Sayfa 1 ---
# 1. Paranın Tanımı, Fonksiyonları ve Parasal Büyüklükler
Para, mal ve hizmet değişiminde genel kabul gören iktisadi araçtır. Modern ekonomilerde paranın dört temel işlevi vardır: değişim aracı olması, hesap birimi (değer ölçüsü) olması, değer saklama aracı olması ve ertelenmiş ödemeler standardı oluşturması. Trampa ekonomisinde yaşanan "isteklerin çifte tesadüfü" sorununu ortadan kaldırarak işlem maliyetlerini dramatik biçimde azaltır.`,
    `--- Sayfa 2 ---
### 1.1. Parasal Büyüklükler (M1, M2, M3)
TCMB tanımlarına göre dar anlamda para arzı M1 = Dolaşımdaki Para + Vadesiz Mevduatlar toplamından oluşur. M2 = M1 + Vadeli Mevduatlar; geniş anlamda para arzı M3 = M2 + Repo + Para Piyasası Fonları + İhraç Edilen Menkul Kıymetler şeklindedir. Likidite derecesi M1'den M3'e doğru azalır.`,
    `--- Sayfa 3 ---
### 1.2. Paranın Tarihsel Evrimi ve Güven Unsuru
Mal paradan (altın, gümüş) temsili paraya ve modern itibari (fiat) paraya geçiş sürecinde paranın değerini belirleyen temel faktör merkez bankasının kredibilitesi ve fiyat istikrarına olan toplumsal güvendir.`,
    `--- Sayfa 4 ---
Örnek Uygulama: Bir ekonomide dolaşımdaki nakit 400 milyar TL, vadesiz mevduatlar 1.100 milyar TL ve vadeli mevduatlar 2.500 milyar TL ise M1 = 1.500 milyar TL ve M2 = 4.000 milyar TL olarak hesaplanır.`,
    `--- Sayfa 5 ---
# 2. Klasik Miktar Teorisi: Fisher ve Cambridge Yaklaşımları
Klasik iktisatta para yalnızca bir değişim aracıdır ve uzun dönemde reel değişkenleri (üretim, istihdam) etkilemez; buna "Paranın Yansızlığı" ve "Klasik Dikotomi" denir.`,
    `--- Sayfa 6 ---
### 2.1. Irving Fisher Mübadele Denklemi
Fisher'ın mübadele özdeşliği M * V = P * T (gelir biçiminde M * V = P * Y) şeklindedir. Burada M para arzını, V paranın dolanım hızını, P genel fiyat düzeyini ve Y reel geliri ifade eder. Klasik varsayımlar altında V kurumsal faktörlere bağlı olarak kısa dönemde sabit, Y ise tam istihdam düzeyinde sabit kabul edilir. Bu nedenle para arzındaki %10'luk artış genel fiyat düzeyini (P) doğrudan %10 artırır.`,
    `--- Sayfa 7 ---
### 2.2. Cambridge Nakit Balans Yaklaşımı
Alfred Marshall ve Arthur Pigou tarafından geliştirilen Cambridge denklemi M_d = k * P * Y biçimindedir. Burada k = 1 / V olup ekonomik birimlerin nominal gelirlerinin ne kadarını nakit olarak elde tutmak istediklerini gösterir. Fisher yaklaşımı mekanik işlem hacmine odaklanırken, Cambridge yaklaşımı bireylerin para tutma tercihini (portföy kararını) öne çıkarır.`,
    `--- Sayfa 8 ---
Tablo 1: Klasik, Keynesyen ve Monetarist Para Talebi Karşılaştırması
| Kriter | Klasik (Fisher/Cambridge) | Keynesyen (Likidite Tercihi) | Monetarist (Friedman) |
| --- | --- | --- | --- |
| Paranın Temel İşlevi | Değişim aracı | Değişim ve değer saklama aracı | Servet tutma biçimlerinden biri |
| Faiz Esnekliği | Sıfır (Faizden bağımsız) | Yüksek (Spekülasyon güdüsü) | Çok düşük (İstikrarlı talep) |
| Dolanım Hızı (V) | Sabit | İstikrarsız (Faizle değişir) | Öngörülebilir ve istikrarlı |
| Politika Önerisi | Sabit para kuralları | Aktif maliye + para politikası | Sabit %k parasal büyüme kuralı |`,
    `--- Sayfa 9 ---
Klasik teoride faiz oranı parasal bir olgu değil, tasarruf ve yatırım piyasasında belirlenen reel bir değişkendir (Ödünç Verilebilir Fonlar Teorisi).`,
    `--- Sayfa 10 ---
# 3. Keynesyen Likidite Tercihi Teorisi ve Likidite Tuzağı
John Maynard Keynes, 1936 tarihli Genel Teori eserinde bireylerin üç farklı güdüyle para talep ettiğini ortaya koymuştur: işlem güdüsü, ihtiyat güdüsü ve spekülasyon güdüsü.`,
    `--- Sayfa 11 ---
### 3.1. İşlem, İhtiyat ve Spekülasyon Güdüleri
İşlem ve ihtiyat amaçlı para talebi gelirin pozitif fonksiyonudur: L_1 = k * Y. Spekülasyon amaçlı para talebi ise faiz oranının negatif fonksiyonudur: L_2 = L_2(i). Tahvil fiyatları ile piyasa faiz oranları ters yönlü hareket ettiğinden, faizler çok düşükken bireyler tahvil fiyatlarının düşeceğini bekleyip nakit tutmayı tercih eder.`,
    `--- Sayfa 12 ---
### 3.2. Likidite Tuzağı ve Politika Etkinliği
Faiz oranlarının kurumsal minimum düzeye gerilediği durumda para talebi eğrisi yatay eksene paralel (sonsuz esnek) hâle gelir. Bu olguya Likidite Tuzağı denir. Grafik 1: Para piyasası dengesinde LM eğrisinin yatay bölgesinde genişletici para politikası faiz oranını daha fazla düşüremez ve üretim üzerinde tamamen etkisiz kalır; bu koşulda genişletici maliye politikası tam etkindir.`,
    `--- Sayfa 13 ---
Örnek Vaka: Japonya'nın 1990'lar sonrası sıfır faiz politikası ve 2008 küresel finans krizi sonrası gelişmiş ülkelerde görülen sıfır alt sınırı (ZLB) likidite tuzağının modern uygulamalarıdır.`,
    `--- Sayfa 14 ---
Baumol-Tobin envanter modeli, işlem amaçlı para talebinin de faiz oranına duyarlı olduğunu karekök formülüyle M_d = sqrt((b * Y) / (2 * i)) göstermiştir.`,
    `--- Sayfa 15 ---
# 4. Parasal Taban, Para Çarpanı ve Kaydi Para Yaratma Süreci
Merkez bankasının doğrudan kontrol edebildiği büyüklük Parasal Taban (B veya H) olup dolaşımdaki nakit (C) ile bankacılık sistemi rezervlerinin (R) toplamıdır: B = C + R.`,
    `--- Sayfa 16 ---
### 4.1. Para Çarpanı Formülü ve Değişkenleri
Para arzı M = m * B eşitliğiyle belirlenir. Para çarpanı denklemi: m = (1 + c) / (r + e + c). Burada c = C / D nakit tutma oranını, r = RR / D zorunlu karşılık oranını, e = ER / D ise serbest (fazla) rezerv oranını temsil eder.`,
    `--- Sayfa 17 ---
### 4.2. Çarpanı Etkileyen Davranışsal Dinamikler
Nakit tutma oranı (c), zorunlu karşılık oranı (r) veya bankaların tuttuğu serbest rezerv oranı (e) yükseldiğinde para çarpanı (m) küçülür ve ekonomideki para arzı daralır. Finansal kriz dönemlerinde bankaların kredi vermekten kaçınıp serbest rezerv (e) artırması para çarpanında sert düşüşe yol açar.`,
    `--- Sayfa 18 ---
### 4.3. Sayısal Para Çarpanı Örneği
Sayısal Örnek: Bir ekonomide parasal taban B = 500 milyar TL, nakit tutma oranı c = 0.25, zorunlu karşılık oranı r = 0.15 ve serbest rezerv oranı e = 0.10 olsun. Para çarpanı m = (1 + 0.25) / (0.15 + 0.10 + 0.25) = 1.25 / 0.50 = 2.5 bulunur. Toplam para arzı M = 2.5 * 500 = 1.250 milyar TL olur.`,
    `--- Sayfa 19 ---
Kaydi para yaratma sürecinde ticari bankalar topladıkları mevduatların zorunlu karşılık dışındaki kısmını krediye dönüştürerek zincirleme mevduat genişlemesi sağlarlar.`,
    `--- Sayfa 20 ---
# 5. Merkez Bankası Para Politikası Araçları ve Enflasyon Hedeflemesi
Merkez bankaları fiyat istikrarı temel amacına ulaşmak için dolaylı ve doğrudan para politikası araçlarını kullanır.`,
    `--- Sayfa 21 ---
### 5.1. Temel Para Politikası Araçları
1) Açık Piyasa İşlemleri (APİ): Repo, ters repo ve kesin alım-satım ile piyasa likiditesinin günlük yönetimi (en esnek araç).
2) Zorunlu Karşılık Oranları: Bankaların mevduatları karşılığında merkez bankasında tutmak zorunda olduğu oran.
3) Reeskont Penceresi ve Faiz Koridoru: Gecelik borç alma ve borç verme faizleri arasında oluşturulan asimetrik veya simetrik koridor.`,
    `--- Sayfa 22 ---
### 5.2. Enflasyon Hedeflemesi ve Taylor Kuralı
Enflasyon hedeflemesi rejimi, kamuoyuna açık bir sayısal enflasyon hedefi ilan edilmesi, merkez bankası bağımsızlığı, şeffaflık ve hesap verebilirlik ilkelerine dayanır. John Taylor'ın geliştirdiği politika faizi kuralı: i = r* + pi + 0.5 * (pi - pi*) + 0.5 * (y - y*). Burada r* denge reel faizini, (pi - pi*) enflasyon açığını ve (y - y*) çıktı açığını gösterir. Enflasyon hedefin 1 puan üzerine çıktığında nominal faizin 1.5 puan artırılması (Taylor İlkesi) reel faizi yükselterek enflasyonu bastırır.`,
    `--- Sayfa 23 ---
Parasal aktarım mekanizması kanalları: faiz oranı kanalı, döviz kuru kanalı, varlık fiyatları (Tobin q) kanalı, kredi kanalı ve beklentiler kanalıdır. Kredibilitesi yüksek merkez bankalarında beklenti kanalı en hızlı işleyen kanaldır.`,
    `--- Sayfa 24 ---
[Taranmış sayfa — düşük çözünürlüklü şekil, okunabilir metin yetersiz]`,
  ];

  const text = pages.join('\n\n');
  return {
    id: 'src-para-24p',
    name: 'Para_Teorisi_ve_Politikasi_24_Sayfa.pdf',
    kind: 'pdf',
    course: 'Para Teorisi ve Politikası',
    courseConfirmedByUser: true,
    text,
    pagesOrSlides: 24,
    wordCount: text.split(/\s+/).filter(Boolean).length,
    charCount: text.length,
    extractionWarnings: [
      'Sayfa 24 görsel ağırlıklı / taranmış içerik barındırdığı için metin katmanı eksik algılandı.',
    ],
  };
}

/**
 * Builds a rich multi-page İstatistik ve Ekonometri source covering OLS Gauss-Markov (BLUE),
 * hypothesis testing, and diagnostic violations.
 */
function buildIstatistikEkonometriSource(): ExtractedSourceItem {
  const text = `--- Sayfa 1 ---
# 1. En Küçük Kareler (EKK / OLS) Yöntemi ve Gauss-Markov Varsayımları
Doğrusal regresyon modeli Y_i = beta_0 + beta_1 * X_i + u_i biçiminde tanımlanır. EKK tahmincisi hata terimleri kareleri toplamını (RSS = sum(u_i^2)) minimize ederek parametre tahminlerini hesaplar: beta_1_hat = Cov(X, Y) / Var(X).

--- Sayfa 2 ---
### 1.1. Klasik Doğrusal Regresyon Varsayımları ve BLUE Özelliği
Gauss-Markov teoremi uyarınca E(u_i | X) = 0, sabit varyans (homoskedastisite: Var(u_i | X) = sigma^2), otokorelasyon yokluğu (Cov(u_i, u_j) = 0), tam çoklu doğrusal bağlantı olmaması ve parametrelerde doğrusallık varsayımları sağlandığında EKK tahmincileri BLUE (En İyi Doğrusal Sapmasız Tahminci) özelliğine sahip olur.

--- Sayfa 3 ---
# 2. Hipotez Testleri, t-İstatistiği, p-Değeri ve Hata Türleri
Sıfır hipotezi H_0: beta_1 = 0 ve alternatif hipotez H_1: beta_1 != 0 test edilir. Test istatistiği t = (beta_1_hat - 0) / SE(beta_1_hat) formülüyle hesaplanır. I. Tip Hata (alpha) doğru olan H_0 hipotezinin reddedilmesidir; II. Tip Hata (beta) yanlış olan H_0 hipotezinin reddedilmemesidir. p-değeri < alpha (örneğin 0.05) ise katsayı istatistiksel olarak anlamlıdır.

--- Sayfa 4 ---
# 3. Değişen Varyans (Heteroskedastisite) ve Otokorelasyon
Değişen varyans durumunda EKK tahmincileri hâlâ sapmasız ve tutarlıdır, ancak artık etkin (minimum varyanslı) değildir ve standart hatalar yanlı olduğundan t ve F testleri geçersizleşir. Breusch-Pagan ve White testleriyle sınanır; White dirençli standart hatalar veya Ağırlıklı EKK (WLS) ile düzeltilir.

--- Sayfa 5 ---
### 3.1. Sayısal Regresyon Uygulaması ve Yorumlama
Örnek Hesaplama: Tüketim fonksiyonu C_hat = 120 + 0.78 * Y (SE = 0.06, R^2 = 0.89, n = 50) olarak tahmin edilmiştir. Marjinal tüketim eğilimi beta_1 = 0.78 olup gelir 100 TL arttığında tüketim ortalama 78 TL artmaktadır. t-istatistiği t = 0.78 / 0.06 = 13.0 > 2.01 (p < 0.001) olduğundan katsayı %1 anlamlılık düzeyinde istatistiksel olarak anlamlıdır.`;

  return {
    id: 'src-ekonometri-5p',
    name: 'Ekonometri_ve_Istatistik_Ders_Notu.pdf',
    kind: 'pdf',
    course: 'Ekonometri',
    courseConfirmedByUser: true,
    text,
    pagesOrSlides: 5,
    wordCount: text.split(/\s+/).filter(Boolean).length,
    charCount: text.length,
  };
}

/**
 * Extracts visible text from generated PDF bytes using pdfjs-dist so we can verify
 * that real binary PDF files render Turkish characters, TOC, page numbers, and headings accurately.
 */
async function extractTextFromPdfBytes(pdfBytes: Uint8Array): Promise<{
  pageCount: number;
  pagesText: string[];
  fullText: string;
}> {
  const loadingTask = pdfjsLib.getDocument({
    data: pdfBytes.slice(),
    useWorkerFetch: false,
    isEvalSupported: false,
    disableFontFace: true,
  });
  const doc = await loadingTask.promise;
  const pagesText: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    const text = tc.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    pagesText.push(text);
  }
  await doc.destroy();
  return {
    pageCount: pagesText.length,
    pagesText,
    fullText: pagesText.join('\n'),
  };
}

const DEFAULT_SETTINGS: StudioGenerationSettings = {
  materialType: 'summary',
  difficulty: 'hard',
  length: 'comprehensive',
  questionCount: 10,
  cardCount: 15,
  userId: 'user-test-academic-1',
};

// ==================== TEST SUITE ====================

describe('EconNotes Next-Gen Academic Summary Engine, Multi-Stage Pipeline & Turkish Binary PDF', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    insertedMaterials.length = 0;
    rpcMock.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'not deployed' } });
    // Default Edge mock: simulate offline/unavailable edge so deterministic local engine runs cleanly,
    // except in tests that explicitly supply structured AI responses.
    functionsInvokeMock.mockResolvedValue({ data: null, error: new Error('offline-test-mode') });
  });

  it('1. Real binary DOCX extraction (Borçlar Hukuku) preserves Word headings & inline table order', async () => {
    const docxFile = await buildRealBorclarHukukuDocx();
    const extracted = await extractFile(docxFile);
    expect(extracted.kind).toBe('text');
    if (extracted.kind !== 'text') throw new Error('expected text');

    expect(extracted.text).toContain('# 1. Borç İlişkisi ve Sözleşmenin Kurucu Unsurları (TBK m. 1)');
    expect(extracted.text).toContain('## 1.1. Öneri (İcap) ve Kabul Şartları');
    expect(extracted.text).toContain('| Ölçüt | Kesin Hükümsüzlük (Butlan) | İptal Edilebilirlik |');
    expect(extracted.text).toContain('# 3. Haksız Fiil Sorumluluğu (TBK m. 49)');

    // Critical regression check: inline table MUST stay between Section 2 and Section 3 (NOT dumped at end!)
    const sec2Idx = extracted.text.indexOf('2. Sözleşmelerde Geçerlilik Şartları');
    const tableIdx = extracted.text.indexOf('| Ölçüt | Kesin Hükümsüzlük (Butlan)');
    const sec3Idx = extracted.text.indexOf('3. Haksız Fiil Sorumluluğu');
    expect(sec2Idx).toBeGreaterThan(-1);
    expect(tableIdx).toBeGreaterThan(sec2Idx);
    expect(sec3Idx).toBeGreaterThan(tableIdx);
  });

  it('2. Real binary PPTX extraction (Mikro İktisat) extracts all 12 slides, formulas, table & speaker notes', async () => {
    const pptxFile = await buildRealMikroIktisatPptx();
    const extracted = await extractFile(pptxFile);
    expect(extracted.kind).toBe('text');
    if (extracted.kind !== 'text') throw new Error('expected text');

    expect(extracted.pages || extracted.totalPages).toBe(12);
    expect(extracted.text).toContain('--- Slayt 1 ---');
    expect(extracted.text).toContain('--- Slayt 12 ---');
    expect(extracted.text).toContain('Slutsky Denklemi');
    expect(extracted.text).toContain('| Özellik | Tam Rekabet | Monopol | Monopolcü Rekabet | Oligopol |');
    expect(extracted.text).toContain('[Hoca / Konuşmacı Notu]');
    expect(extracted.text).toContain('Lerner Endeksi');
  });

  it('3. Para Teorisi (24 pages + unreadable page): 10-stage progress, overlap chunking, 10-point audit & real Turkish Unicode PDF', async () => {
    const source = buildParaTeorisi24PageSource();
    const bundle = combineStudySources([source], 'Para Teorisi ve Politikası', 'Para Teorisi ve Politikası');

    // Verify Stage 1–3 structural analysis
    const plan = analyzeDocumentForSummary(bundle, DEFAULT_SETTINGS);
    expect(plan.profile.disciplineFamily).toBe('economics');
    expect(plan.profile.totalPagesOrSlides).toBe(24);
    expect(plan.profile.formulasCount).toBeGreaterThanOrEqual(2);
    expect(plan.profile.tablesCount).toBeGreaterThanOrEqual(1);
    expect(plan.profile.unreadablePages).toContain(24);
    expect(plan.profile.warnings.length).toBeGreaterThanOrEqual(1);
    expect(plan.chunks.length).toBeGreaterThanOrEqual(2);
    // Verify context overlap between sequential chunks!
    expect(plan.chunks[1].overlapPrefix && plan.chunks[1].overlapPrefix.length > 40).toBe(true);

    // Run full 10-stage pipeline with real binary PDF build at Stage 10
    const progressEvents: SummaryProgressUpdate[] = [];
    const savedCheckpoints: SummaryChunkCheckpoint[] = [];

    const result = await runMultiStageAcademicSummaryPipeline({
      jobId: 'job-para-teorisi-24p',
      bundle,
      settings: DEFAULT_SETTINGS,
      onProgress: (upd) => progressEvents.push(upd),
      onCheckpoint: (cp) => {
        savedCheckpoints.push(cp);
      },
      buildPdfFn: async (summary, meta) =>
        generateAcademicSummaryPdfBytes({
          title: meta.title,
          course: meta.course,
          createdAt: meta.createdAt,
          summary,
        }),
    });

    // Verify all 10 stages ran in monotonic order & progress NEVER hits 100 before completion
    const visitedStages = new Set(progressEvents.map((e) => e.stage));
    for (let s = 1; s <= 10; s++) {
      expect(visitedStages.has(s)).toBe(true);
    }
    expect(progressEvents.every((e) => e.progressPct >= 0 && e.progressPct <= 99)).toBe(true);
    expect(Math.max(...progressEvents.map((e) => e.processedPages))).toBe(24);
    expect(savedCheckpoints.length).toBe(plan.chunks.length);

    // Verify rich academic output & full topic coverage across pages 1..24
    expect(result.content.disciplineFamily).toBe('economics');
    expect(result.content.sections.length).toBeGreaterThanOrEqual(5);
    expect(result.content.extractionNotices?.length).toBeGreaterThanOrEqual(1);
    expect(result.content.qualityAudit).toBeDefined();
    expect(result.content.qualityAudit!.checks.length).toBe(10);
    expect(result.content.qualityAudit!.headingCoveragePct).toBeGreaterThanOrEqual(80);

    const combinedSummaryText = result.content.sections.map((s) => `${s.heading}\n${s.content}`).join('\n');
    expect(combinedSummaryText).toMatch(/Fisher|Mübadele/i);
    expect(combinedSummaryText).toMatch(/Likidite Tuzağı|Keynesyen/i);
    expect(combinedSummaryText).toMatch(/Para Çarpanı|Parasal Taban/i);
    expect(combinedSummaryText).toMatch(/Taylor|Enflasyon Hedeflemesi/i);

    // Verify REAL binary PDF generated in Stage 10!
    expect(result.pdfBytes).toBeDefined();
    expect(result.pdfBytes!.byteLength).toBeGreaterThan(5000);
    // Check %PDF- magic header
    const header = new TextDecoder().decode(result.pdfBytes!.slice(0, 5));
    expect(header).toBe('%PDF-');

    const loadedPdf = await PDFDocument.load(result.pdfBytes!);
    expect(loadedPdf.getPageCount()).toBeGreaterThanOrEqual(3);

    // Extract actual text from generated PDF via pdfjs-dist & verify TOC + page numbers + Turkish Unicode!
    const extractedPdf = await extractTextFromPdfBytes(result.pdfBytes!);
    expect(extractedPdf.pageCount).toBe(loadedPdf.getPageCount());
    expect(extractedPdf.fullText).toContain('İÇİNDEKİLER');
    expect(extractedPdf.fullText).toContain(`Sayfa 1 / ${extractedPdf.pageCount}`);
    expect(extractedPdf.fullText).toContain('Para Teorisi ve Politikası');
    // Turkish Unicode verification (Ç, ğ, İ, ı, Ö, ö, Ş, ş, Ü, ü)
    expect(extractedPdf.fullText).toMatch(/[ğĞ]/);
    expect(extractedPdf.fullText).toMatch(/[şŞ]/);
    expect(extractedPdf.fullText).toMatch(/[ıİ]/);
    expect(extractedPdf.fullText).toMatch(/[öÖ]/);
    expect(extractedPdf.fullText).toMatch(/[üÜ]/);
    expect(extractedPdf.fullText).toMatch(/[çÇ]/);

    // Verify filename contains course + date
    const fileName = buildSummaryPdfFileName('Para Teorisi ve Politikası', 'Para Teorisi', '2026-11-24T12:00:00Z');
    expect(fileName).toBe('econnotes-para-teorisi-ve-politikasi-ozet-2026-11-24.pdf');
  }, 30000);

  it('4. Multi-course discipline fidelity: Borçlar Hukuku (no fake math + PDF), Mikro İktisat PPTX (+ PDF) & Ekonometri', async () => {
    // --- A) BORÇLAR HUKUKU (from real binary .docx) ---
    const docxFile = await buildRealBorclarHukukuDocx();
    const docxExt = await extractFile(docxFile);
    if (docxExt.kind !== 'text') throw new Error('expected docx text');
    const lawBundle = combineStudySources(
      [
        {
          id: 'src-law-docx',
          name: docxFile.name,
          kind: 'docx',
          course: 'Borçlar Hukuku',
          courseConfirmedByUser: true,
          text: docxExt.text,
          pagesOrSlides: Math.max(4, docxExt.pages || docxExt.totalPages || 1),
          wordCount: docxExt.text.split(/\s+/).filter(Boolean).length,
          charCount: docxExt.text.length,
        },
      ],
      'Borçlar Hukuku Genel Hükümler',
      'Borçlar Hukuku',
    );

    const lawRes = await runMultiStageAcademicSummaryPipeline({
      jobId: 'job-law-docx',
      bundle: lawBundle,
      settings: DEFAULT_SETTINGS,
      buildPdfFn: async (summary, meta) =>
        generateAcademicSummaryPdfBytes({ title: meta.title, course: meta.course, summary }),
    });

    expect(lawRes.content.disciplineFamily).toBe('law');
    const lawText = lawRes.content.sections.map((s) => `${s.heading} ${s.content}`).join('\n');
    expect(lawText).toContain('TBK');
    expect(lawText).toMatch(/Kesin Hükümsüzlük|Butlan/i);
    expect(lawText).toMatch(/Haksız Fiil/i);
    // Zero fabricated math formulas in Law!
    expect(lawText).not.toMatch(/\\frac\{|\\sum|\\int/);

    expect(lawRes.pdfBytes).toBeDefined();
    const lawPdfParsed = await extractTextFromPdfBytes(lawRes.pdfBytes!);
    expect(lawPdfParsed.pageCount).toBeGreaterThanOrEqual(3);
    expect(lawPdfParsed.fullText).toContain('Borçlar Hukuku');
    expect(lawPdfParsed.fullText).toContain('İÇİNDEKİLER');

    // --- B) MİKRO İKTİSAT (from real binary 12-slide .pptx) ---
    const pptxFile = await buildRealMikroIktisatPptx();
    const pptxExt = await extractFile(pptxFile);
    if (pptxExt.kind !== 'text') throw new Error('expected pptx text');
    const mikroBundle = combineStudySources(
      [
        {
          id: 'src-mikro-pptx',
          name: pptxFile.name,
          kind: 'pptx',
          course: 'Mikro İktisat',
          courseConfirmedByUser: true,
          text: pptxExt.text,
          pagesOrSlides: pptxExt.pages || pptxExt.totalPages || 12,
          wordCount: pptxExt.text.split(/\s+/).filter(Boolean).length,
          charCount: pptxExt.text.length,
        },
      ],
      'Mikro İktisat Ders Sunumu',
      'Mikro İktisat',
    );

    const mikroRes = await runMultiStageAcademicSummaryPipeline({
      jobId: 'job-mikro-pptx',
      bundle: mikroBundle,
      settings: DEFAULT_SETTINGS,
      buildPdfFn: async (summary, meta) =>
        generateAcademicSummaryPdfBytes({ title: meta.title, course: meta.course, summary }),
    });

    expect(mikroRes.content.disciplineFamily).toBe('economics');
    expect(mikroRes.plan.profile.totalPagesOrSlides).toBe(12);
    const mikroText = mikroRes.content.sections.map((s) => `${s.heading} ${s.content}`).join('\n');
    expect(mikroText).toMatch(/Slutsky|Farksızlık|MRS/i);
    expect(mikroText).toMatch(/Monopol|Cournot|Tam Rekabet/i);
    expect(mikroRes.pdfBytes).toBeDefined();
    const mikroPdfParsed = await extractTextFromPdfBytes(mikroRes.pdfBytes!);
    expect(mikroPdfParsed.pageCount).toBeGreaterThanOrEqual(3);
    expect(mikroPdfParsed.fullText).toContain('Mikro İktisat');

    // --- C) İSTATİSTİK VE EKONOMETRİ ---
    const statSource = buildIstatistikEkonometriSource();
    const statBundle = combineStudySources([statSource], 'Ekonometri ve İstatistik', 'Ekonometri');
    const statRes = await runMultiStageAcademicSummaryPipeline({
      jobId: 'job-stat-ekonometri',
      bundle: statBundle,
      settings: DEFAULT_SETTINGS,
    });
    expect(statRes.content.disciplineFamily).toBe('statistics');
    const statText = statRes.content.sections.map((s) => `${s.heading} ${s.content}`).join('\n');
    expect(statText).toMatch(/Gauss-Markov|BLUE|EKK/i);
    expect(statText).toMatch(/Hipotez|Heteroskedastisite|Değişen Varyans/i);

    // --- D) MULTI-COURSE ISOLATION CHECK ---
    const multiBundle = combineStudySources(
      [buildParaTeorisi24PageSource(), {
        id: 'src-law-2',
        name: docxFile.name,
        kind: 'docx',
        course: 'Borçlar Hukuku',
        courseConfirmedByUser: true,
        text: docxExt.text,
        pagesOrSlides: 4,
        wordCount: docxExt.text.split(/\s+/).filter(Boolean).length,
        charCount: docxExt.text.length,
      }],
      'Karma Çalışma Paketi',
      '',
    );
    expect(multiBundle.isMultiCourse).toBe(true);
    expect(multiBundle.sourceCourses).toEqual(
      expect.arrayContaining(['Para Teorisi ve Politikası', 'Borçlar Hukuku']),
    );
  }, 35000);

  it('5. Stage 8 10-point quality audit detects missing headings, triggers targeted repair, removes duplicates & blocks fake math in Law', async () => {
    const source = buildParaTeorisi24PageSource();
    const bundle = combineStudySources([source], 'Para Teorisi ve Politikası', 'Para Teorisi ve Politikası');
    const plan = analyzeDocumentForSummary(bundle, DEFAULT_SETTINGS);

    // Simulate Edge returning an AI summary that DELIBERATELY omits Section 5 ("Merkez Bankası Para Politikası Araçları ve Enflasyon Hedeflemesi")
    // AND includes a duplicated paragraph, then responds cleanly to `quality_repair`!
    const repairStagesCalled: string[] = [];
    functionsInvokeMock.mockImplementation(async (fnName: string, opts: { body?: Record<string, unknown> }) => {
      if (fnName !== 'generate-study-material') return { data: null, error: new Error('ignore') };
      const stage = String(opts?.body?.stage || '');
      if (stage === 'analyze_chunk') {
        return {
          data: {
            content: {
              overviewSnippet: 'Para Teorisi ve Politikası kapsamında temel parasal teoriler ve likidite mekanizmaları incelenmektedir.',
              sections: [
                {
                  heading: '1. Paranın Tanımı, Fonksiyonları ve Parasal Büyüklükler',
                  content:
                    '#### Paranın Temel İşlevleri\nPara, değişim aracı, hesap birimi, değer saklama aracı ve ertelenmiş ödeme standardı olarak işlev görür. Trampa ekonomisindeki isteklerin çifte tesadüfü sorununu giderir ve işlem maliyetlerini düşürür.\n\nPara, değişim aracı, hesap birimi, değer saklama aracı ve ertelenmiş ödeme standardı olarak işlev görür. Trampa ekonomisindeki isteklerin çifte tesadüfü sorununu giderir ve işlem maliyetlerini düşürür.\n\n#### Parasal Büyüklükler (M1, M2, M3)\nTCMB tanımlarına göre M1 dolaşımdaki para ve vadesiz mevduatları, M2 vadeli mevduatları, M3 ise repo ve para piyasası fonlarını kapsar. Örneğin 400 milyar TL nakit ve 1.100 milyar TL vadesiz mevduat ile M1 = 1.500 milyar TL olur.',
                  sourcePages: 's. 1–4',
                  examTip: 'M1, M2 ve M3 bileşenlerinin likidite sıralaması sınavlarda sorulur.',
                  takeaway: 'Para arzı tanımları likidite derecesine göre dar tanımdan geniş tanıma sıralanır.',
                },
                {
                  heading: '2. Klasik Miktar Teorisi: Fisher ve Cambridge Yaklaşımları',
                  content:
                    '#### Fisher Mübadele Denklemi ve Paranın Yansızlığı\nFisher özdeşliği `M * V = P * Y` şeklindedir. Klasik varsayımlar altında dolanım hızı V ve tam istihdam hasılası Y sabit olduğundan para arzındaki artış birebir fiyat düzeyine (P) yansır.\n\n#### Cambridge Nakit Balans Yaklaşımı\n`M_d = k * P * Y` denklemi bireylerin nakit tutma tercihlerini vurgular ve `k = 1 / V` ilişkisiyle Fisher denklemine bağlanır.',
                  sourcePages: 's. 5–9',
                  examTip: 'Fisher mekanik yaklaşımı ile Cambridge portföy yaklaşımı arasındaki farkı karşılaştırın.',
                  takeaway: 'Klasik dikotomiye göre para uzun dönemde yalnızca nominal değişkenleri etkiler.',
                },
                {
                  heading: '3. Keynesyen Likidite Tercihi Teorisi ve Likidite Tuzağı',
                  content:
                    '#### Üç Para Talebi Güdüsü\nKeynes işlem, ihtiyat ve spekülasyon güdülerini tanımlar. Spekülasyon güdüsü faiz oranıyla ters yönlüdür ve tahvil fiyatlarıyla faiz arasındaki ters ilişkiye dayanır.\n\n#### Likidite Tuzağı ve Politika Etkinliği\nFaiz oranları kurumsal alt sınıra indiğinde para talebi sonsuz esnek hâle gelir. Bu durumda para politikası etkisizleşirken genişletici maliye politikası tam etkin olur. Japonya örneği tipik bir vakadır.',
                  sourcePages: 's. 10–14',
                  examTip: 'Likidite tuzağında LM eğrisi yataydır ve para politikası etkisizdir.',
                  takeaway: 'Keynesyen teoride faiz oranı para piyasasında belirlenen parasal bir değişkendir.',
                },
                {
                  heading: '4. Parasal Taban, Para Çarpanı ve Kaydi Para Yaratma Süreci',
                  content:
                    '#### Para Çarpanı Formülü ve Değişkenleri\nParasal taban `B = C + R` ve para çarpanı `m = (1 + c) / (r + e + c)` olarak tanımlanır. Nakit tutma oranı (c), zorunlu karşılık oranı (r) veya serbest rezerv oranı (e) arttığında çarpan küçülür.\n\n#### Sayısal Örnek\nB = 500 milyar TL, c = 0.25, r = 0.15, e = 0.10 iken m = 1.25 / 0.50 = 2.5 ve M = 1.250 milyar TL hesaplanır.',
                  sourcePages: 's. 15–19',
                  examTip: 'Serbest rezerv artışı finansal krizlerde para çarpanını hızla düşürür.',
                  takeaway: 'Para arzı hem merkez bankasının parasal tabanına hem de bankalar ve halkın davranışlarına bağlıdır.',
                },
              ],
              keyPoints: ['Fisher: MV = PY', 'Likidite Tuzağı', 'Para Çarpanı: m = (1+c)/(r+e+c)'],
              keyTerms: [
                { term: 'Paranın Yansızlığı', definition: 'Para arzı değişimlerinin uzun dönemde reel çıktıyı değil yalnızca fiyatları etkilemesi.' },
                { term: 'Likidite Tuzağı', definition: 'Faizlerin çok düşük olduğu düzeyde para talebinin sonsuz esnek hâle gelmesi.' },
                { term: 'Parasal Taban', definition: 'Dolaşımdaki nakit ile bankacılık sistemi rezervlerinin toplamı (B = C + R).' },
              ],
              teacherEmphasis: [
                {
                  topic: 'Likidite Tuzağı',
                  reason: 'Sınavlarda maliye ve para politikası etkinliği kıyaslamasında sık sorulur.',
                  examTip: 'LM yatayken maliye politikası dışlama etkisi olmadan tam etkindir.',
                },
              ],
            },
            model: 'gemini-2.5-pro',
          },
          error: null,
        };
      }
      if (stage === 'quality_repair') {
        repairStagesCalled.push(String((opts?.body?.chunkMeta as Record<string, unknown>)?.repairTargets || 'repaired'));
        return {
          data: {
            content: {
              sections: [
                {
                  heading: '5. Merkez Bankası Para Politikası Araçları ve Enflasyon Hedeflemesi',
                  content:
                    '#### Para Politikası Araçları\nMerkez bankası fiyat istikrarı için Açık Piyasa İşlemleri (APİ — repo, ters repo, kesin alım-satım), zorunlu karşılık oranları ve reeskont penceresi ile faiz koridoru araçlarını kullanır. APİ günlük likidite yönetiminde en esnek araçtır.\n\n#### Enflasyon Hedeflemesi ve Taylor Kuralı\nEnflasyon hedeflemesi şeffaflık, hesap verebilirlik ve merkez bankası bağımsızlığı gerektirir. Taylor kuralı `i = r* + pi + 0.5*(pi - pi*) + 0.5*(y - y*)` formülüyle enflasyon ve çıktı açığına göre politika faizini belirler. Taylor ilkesine göre enflasyon 1 puan arttığında nominal faiz 1.5 puan artırılmalıdır.',
                  sourcePages: 's. 20–23',
                  examTip: 'Taylor ilkesinde enflasyon katsayısının 1’den büyük olması reel faizi artırır.',
                  takeaway: 'Enflasyon hedeflemesi kredibilite ve beklenti kanalı üzerinden fiyat istikrarını destekler.',
                },
              ],
            },
            model: 'gemini-2.5-pro',
          },
          error: null,
        };
      }
      return { data: null, error: new Error('skip-optional-stage') };
    });

    const result = await runMultiStageAcademicSummaryPipeline({
      jobId: 'job-quality-repair-test',
      bundle,
      settings: DEFAULT_SETTINGS,
    });

    // Verify duplicate paragraph was cleaned!
    expect(result.content.qualityAudit!.duplicateRemovedCount).toBeGreaterThanOrEqual(1);
    // Verify targeted quality_repair ran for the missing Section 5!
    expect(repairStagesCalled.length).toBeGreaterThanOrEqual(1);
    expect(result.content.qualityAudit!.repairedSectionsCount).toBeGreaterThanOrEqual(1);
    expect(result.content.sections.some((s) => /Taylor|Enflasyon Hedeflemesi|Para Politikası Araçları/i.test(s.heading))).toBe(true);
    expect(result.content.qualityAudit!.headingCoveragePct).toBeGreaterThanOrEqual(80);

    // Verify deduplicateSummaryParagraphs directly
    const dedup = deduplicateSummaryParagraphs([
      {
        heading: 'Bölüm 1',
        content:
          'Bu akademik paragraf iktisadi denge koşullarını ve fiyat mekanizmasının kaynak dağılımındaki rolünü ayrıntılı olarak incelemektedir.\n\nBu akademik paragraf iktisadi denge koşullarını ve fiyat mekanizmasının kaynak dağılımındaki rolünü ayrıntılı olarak incelemektedir.',
      },
    ]);
    expect(dedup.removedCount).toBe(1);

    // Verify Law discipline check penalizes fabricated LaTeX math!
    const fakeMathLawAudit = auditSummaryQuality({
      summary: {
        overview: 'Hukuk özeti',
        disciplineFamily: 'law',
        keyPoints: ['Madde 1'],
        sections: [
          {
            heading: 'Sözleşme',
            content: 'Sözleşme kurulumu için $$\\frac{dU}{dX} = \\sum_{i=1}^{n} \\int x^2 dx$$ formülü uygulanır.',
          },
        ],
      },
      bundle,
      profile: { ...plan.profile, disciplineFamily: 'law', courseName: 'Borçlar Hukuku' },
      outline: [],
      formulas: [],
      plan: plan.summaryPlan,
    });
    const disciplineCheck = fakeMathLawAudit.checks.find((c) => c.id === 'discipline_fidelity');
    expect(disciplineCheck?.status).toBe('fail');
    expect(disciplineCheck?.detail).toMatch(/matematiksel formül/i);
  }, 25000);

  it('6. Resilient Background Job Manager: deduplication, checkpoint reuse on resume & account persistence', async () => {
    const source = buildParaTeorisi24PageSource();
    // Create a longer 45k-char bundle so it splits into >= 2 chunks to verify checkpoint reuse!
    const bigText = [source.text, source.text.replace(/Sayfa (\d+)/g, (_, n) => `Sayfa ${Number(n) + 24}`)].join('\n\n');
    const bigBundle = combineStudySources(
      [
        {
          ...source,
          id: 'src-big-resume',
          text: bigText,
          pagesOrSlides: 48,
          charCount: bigText.length,
          wordCount: bigText.split(/\s+/).filter(Boolean).length,
        },
      ],
      'Para Teorisi Büyük Fasikül',
      'Para Teorisi ve Politikası',
    );
    const bigPlan = analyzeDocumentForSummary(bigBundle, DEFAULT_SETTINGS);
    expect(bigPlan.chunks.length).toBeGreaterThanOrEqual(2);

    // Test A: Duplicate active job prevention for same (userId, sourceFingerprint)
    let releaseFirstChunk!: () => void;
    const chunk0Gate = new Promise<void>((resolve) => {
      releaseFirstChunk = resolve;
    });
    let chunk0Calls = 0;

    functionsInvokeMock.mockImplementation(async (fnName: string, opts: { body?: Record<string, unknown> }) => {
      if (fnName !== 'generate-study-material') return { data: null, error: new Error('offline') };
      if (opts?.body?.stage === 'analyze_chunk') {
        const idx = Number((opts?.body?.chunkMeta as Record<string, unknown>)?.index ?? -1);
        if (idx === 0) {
          chunk0Calls++;
          await chunk0Gate;
        }
        return {
          data: {
            content: {
              sections: [
                {
                  heading: `Bölüm ${idx + 1}: Parasal Teori Analizi`,
                  content: `#### Temel Analiz\nParasal teori ve politika mekanizmaları bölüm ${idx + 1} kapsamında ayrıntılı biçimde incelenmiştir. Fisher mübadele denklemi, Cambridge yaklaşımı, likidite tercihi ve para çarpanı mekanizmaları kaynak verileri ışığında analiz edilmiştir.`,
                  sourcePages: `s. ${idx * 10 + 1}–${(idx + 1) * 10}`,
                },
              ],
              keyPoints: [`Bölüm ${idx + 1} anahtar nokta`],
              keyTerms: [{ term: `Kavram ${idx + 1}`, definition: 'Akademik parasal iktisat tanımı ve açıklaması.' }],
            },
            model: 'gemini-2.5-flash',
          },
          error: null,
        };
      }
      return { data: null, error: new Error('skip-optional') };
    });

    const firstStart = await summaryJobManager.startSummaryJob({
      userId: 'user-dedup-1',
      bundle: bigBundle,
      settings: DEFAULT_SETTINGS,
    });
    expect(firstStart.deduplicated).toBe(false);
    expect(firstStart.job.id).toBeTruthy();

    // Second concurrent click on exact same source MUST deduplicate!
    const secondStart = await summaryJobManager.startSummaryJob({
      userId: 'user-dedup-1',
      bundle: bigBundle,
      settings: DEFAULT_SETTINGS,
    });
    expect(secondStart.deduplicated).toBe(true);
    expect(secondStart.job.id).toBe(firstStart.job.id);

    // Release gate and wait for completion
    releaseFirstChunk();
    const savedMaterial = await firstStart.promise;
    expect(savedMaterial).not.toBeNull();
    expect(insertedMaterials.length).toBeGreaterThanOrEqual(1);
    expect(summaryJobManager.getSnapshot().activeJob?.status).toBe('completed');
    expect(summaryJobManager.getSnapshot().activeJob?.progressPct).toBe(100);
    expect(chunk0Calls).toBe(1);

    // Test B: Checkpoint reuse on resume — completed chunk 0 MUST NOT be re-analyzed!
    const invokedChunkIndices: number[] = [];
    functionsInvokeMock.mockImplementation(async (fnName: string, opts: { body?: Record<string, unknown> }) => {
      if (fnName !== 'generate-study-material') return { data: null, error: new Error('offline') };
      if (opts?.body?.stage === 'analyze_chunk') {
        const idx = Number((opts?.body?.chunkMeta as Record<string, unknown>)?.index ?? -1);
        invokedChunkIndices.push(idx);
      }
      return { data: null, error: new Error('use-local-fallback') };
    });

    const preCompletedChunk0: SummaryChunkCheckpoint = {
      chunkIndex: 0,
      chunkTitle: bigPlan.chunks[0].title,
      pageRangeLabel: bigPlan.chunks[0].pageRangeLabel,
      status: 'completed',
      sections: [
        {
          heading: '1. Paranın Tanımı, Fonksiyonları ve Parasal Büyüklükler',
          content: 'Kayıtlı checkpoint bölüm içeriği: Para değişim, hesap ve değer saklama aracıdır.',
          sourcePages: 's. 1–12',
        },
      ],
      keyPoints: ['Checkpoint anahtar nokta'],
      keyTerms: [{ term: 'M1', definition: 'Dolaşımdaki para ve vadesiz mevduatlar.' }],
      teacherEmphasis: [],
      memorize: [],
      interpret: [],
      studyChecklist: [],
      attemptCount: 1,
      updatedAt: new Date().toISOString(),
    };

    const resumedRes = await runMultiStageAcademicSummaryPipeline({
      jobId: 'job-resume-checkpoint-test',
      bundle: bigBundle,
      settings: DEFAULT_SETTINGS,
      existingCheckpoints: [preCompletedChunk0],
    });

    // Chunk 0 was reused from checkpoint -> NEVER invoked again!
    expect(invokedChunkIndices).not.toContain(0);
    expect(invokedChunkIndices).toContain(1);
    expect(resumedRes.checkpoints[0].sections[0].content).toContain('Kayıtlı checkpoint bölüm içeriği');
  }, 30000);

  it('7. UI Components: 10-stage progress screen (strict <100% guard + reload resume) & 5-action result workspace', async () => {
    // --- A) SummaryAnalysisProgressView ---
    const onResume = vi.fn();
    const onRestart = vi.fn();
    const onCancel = vi.fn();
    const onMinimize = vi.fn();

    const reloadedJob: SummaryJobState = {
      id: 'job-ui-1',
      userId: 'user-ui-1',
      sourceFingerprint: 'fp-para-1',
      title: 'Para Teorisi Ders Notu',
      course: 'Para Teorisi ve Politikası',
      disciplineFamily: 'economics',
      status: 'processing',
      currentStage: 6,
      stageCode: 'writing_sections',
      stageLabel: 'Ayrıntılı bölüm özetleri hazırlanıyor',
      detailMessage: 'Bölüm 3 / 5 analiz ediliyor (Sayfa 11–18)...',
      progressPct: 100, // Even if stale 100 slips in while processing, UI MUST clamp to 99%!
      totalPages: 24,
      processedPages: 15,
      totalChunks: 5,
      completedChunks: 2,
      documentProfile: {
        sourceNames: ['Para_Teorisi_24_Sayfa.pdf'],
        fileKinds: ['PDF'],
        totalPagesOrSlides: 24,
        totalWords: 6400,
        totalChars: 42000,
        density: 'high',
        disciplineFamily: 'economics',
        courseName: 'Para Teorisi ve Politikası',
        headingsCount: 5,
        subheadingsCount: 9,
        formulasCount: 6,
        tablesCount: 2,
        figuresOrChartsCount: 3,
        unreadablePages: [24],
        warnings: ['Sayfa 24 taranmış görsel içeriyor.'],
      },
      retryCount: 0,
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const { unmount } = render(
      <SummaryAnalysisProgressView
        job={reloadedJob}
        isLiveInMemory={false}
        onMinimizeToWorkspace={onMinimize}
        onResumeJob={onResume}
        onRestartJob={onRestart}
        onCancelJob={onCancel}
      />,
    );

    // Strictly clamped at 99% while processing!
    expect(screen.getByText('%99')).toBeTruthy();
    expect(screen.getByText(/Sayfalar inceleniyor:\s*15\s*\/\s*24/)).toBeTruthy();
    // All 10 official Turkish pipeline stage labels are shown
    for (const st of SUMMARY_PIPELINE_STAGES) {
      expect(screen.getAllByText(new RegExp(st.label)).length).toBeGreaterThanOrEqual(1);
    }
    // Reload recovery resume button works
    const resumeBtn = screen.getByRole('button', { name: /Kaldığı Yerden Devam Et/i });
    fireEvent.click(resumeBtn);
    expect(onResume).toHaveBeenCalledWith('job-ui-1');
    unmount();

    // --- B) NeuralSummaryWorkspace (all 5 required buttons + metadata + 10-point quality report) ---
    const onSaveToAccount = vi.fn(async () => undefined);
    const onRegenerateDeep = vi.fn(async () => undefined);

    const mockSummaryContent: SummaryContent = {
      overview: 'Para Teorisi ve Politikası dersinin tüm bölümlerini kapsayan kapsamlı akademik not.',
      disciplineTag: 'Para Teorisi ve Politikası',
      disciplineFamily: 'economics',
      keyPoints: ['Fisher: MV = PY', 'Keynesyen Likidite Tuzağı'],
      sections: [
        {
          heading: '1. Klasik Miktar Teorisi',
          content: 'Fisher mübadele denklemi M * V = P * Y ile ifade edilir.',
          sourcePages: 's. 1–9',
          examTip: 'Paranın yansızlığı uzun dönem varsayımıdır.',
          takeaway: 'Para arzı artışı klasik sistemde fiyat düzeyine yansır.',
        },
      ],
      documentProfile: reloadedJob.documentProfile,
      qualityAudit: {
        overallScore: 94,
        passed: true,
        headingCoveragePct: 100,
        coveredHeadings: ['1. Klasik Miktar Teorisi'],
        missingHeadings: [],
        weakSectionIndices: [],
        groundingScorePct: 92,
        totalSummaryWords: 1850,
        duplicateRemovedCount: 1,
        repairedSectionsCount: 0,
        checks: [
          { id: 'heading_coverage', label: 'Konu ve Başlık Kapsamı', status: 'pass', detail: 'Tüm başlıklar kapsandı.' },
        ],
        auditedAt: new Date().toISOString(),
      },
      savedToAccount: false,
    };

    const mockMaterial: StudyMaterial = {
      id: 'mat-ui-summary-1',
      user_id: 'user-ui-1',
      source_type: 'own',
      source_note_id: null,
      material_type: 'summary',
      title: 'Para Teorisi ve Politikası Özeti',
      course: 'Para Teorisi ve Politikası',
      content: mockSummaryContent,
      model: 'EconNotes 10-Stage AI',
      created_at: '2026-11-24T12:00:00Z',
    };

    render(
      <NeuralSummaryWorkspace
        material={mockMaterial}
        onConvertTo={vi.fn()}
        convertingTo={null}
        onExpandSection={vi.fn(async () => undefined)}
        expandingSectionIdx={null}
        onRegenerateDeep={onRegenerateDeep}
        isRegenerating={false}
        onSaveToAccount={onSaveToAccount}
        isSavingToAccount={false}
        onAskCoach={vi.fn()}
      />,
    );

    // Verify all 5 explicitly required action buttons exist
    expect(screen.getByRole('button', { name: /PDF Olarak İndir/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Cihaza Kaydet/i })).toBeTruthy();
    const saveBtn = screen.getByRole('button', { name: /EconNotes'a Kaydet/i });
    expect(saveBtn).toBeTruthy();
    expect(screen.getByRole('button', { name: /Özeti Görüntüle/i })).toBeTruthy();
    const regenBtn = screen.getByRole('button', { name: /Yeniden Oluştur/i });
    expect(regenBtn).toBeTruthy();

    // Verify metadata header & quality score
    expect(screen.getAllByText(/Para Teorisi ve Politikası/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Para_Teorisi_24_Sayfa\.pdf/i)).toBeTruthy();
    expect(screen.getByText(/Kalite Skoru:\s*%94/i)).toBeTruthy();

    // Verify Save to Account & Regenerate callbacks
    fireEvent.click(saveBtn);
    await waitFor(() => expect(onSaveToAccount).toHaveBeenCalledWith(mockMaterial));
    fireEvent.click(regenBtn);
    await waitFor(() => expect(onRegenerateDeep).toHaveBeenCalled());

    // Expand 10-point quality audit panel
    const qaToggle = screen.getByRole('button', { name: /10 Maddelik Kalite Denetimi/i });
    fireEvent.click(qaToggle);
    expect(screen.getByText(/Konu ve Başlık Kapsamı/i)).toBeTruthy();
  });

  it('8. LaTeX-to-Unicode PDF formatter preserves Turkish letters and converts mathematical symbols cleanly', () => {
    const formatted = formatAcademicTextForPdf(
      'Ölçüm formülü: $\\frac{\\Delta P}{P} = \\alpha + \\beta \\cdot \\sigma \\pm \\sqrt{n}$ ve Türkçe: ÇçĞğİıÖöŞşÜü',
    );
    expect(formatted).toContain('ÇçĞğİıÖöŞşÜü');
    expect(formatted).toContain('Δ');
    expect(formatted).toContain('α');
    expect(formatted).toContain('β');
    expect(formatted).toContain('σ');
    expect(formatted).toContain('±');
    expect(formatted).toContain('√(n)');
    expect(formatted).not.toContain('\\frac');
  });
});
