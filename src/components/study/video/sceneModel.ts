// EconNotes Video Dersi Sahne ve Akademik Müfredat Motoru v3:
// Hem yeni çok-modlu şemayı hem de kayıtlı materyalleri %100 ders notuna sadık, en az 5.5 - 8 dakikalık,
// tekrarsız, derinlikli üniversite semineri kalitesinde Dr. Deniz & Barış diyaloğuna ve
// zengin görsel türlere (Görseller, Şekiller, Tablolar, Grafikler, Senaryolar, Zaman Akışı, Kıyaslama) dönüştürür.

export type DiagramType =
  | 'visual'
  | 'shapes'
  | 'table'
  | 'chart'
  | 'scenario'
  | 'timeline'
  | 'comparison'
  | 'structure'
  | 'network'
  | 'curve';

export type VisualTheme = 'history' | 'economics' | 'law' | 'science' | 'society';
export type Speaker = 'Deniz' | 'Barış';

export interface DiagramNode {
  label: string;
  subtext: string;
  badge?: string;
  /** Grafik sahneleri için 15..98 arası göreli etki / ağırlık skoru */
  value?: number;
}

export interface KeyTerm {
  term: string;
  definition: string;
}

export interface DialogueTurn {
  speaker: Speaker;
  text: string;
}

export interface StudioDiagram {
  type: DiagramType;
  visualTheme: VisualTheme;
  title: string;
  rootBadge: string;
  nodes: DiagramNode[];
  metric: string;
}

export interface StudioScene {
  id: string;
  index: number;
  /** Sahnenin ana açılış konuşmacısı */
  speaker: Speaker;
  speakerRole: string;
  title: string;
  narration: string;
  sentences: string[];
  /** Her cümlenin kendi konuşmacısı — sahne içinde gerçek karşılıklı akademik tartışma sağlar */
  sentenceSpeakers: Speaker[];
  /** Her cümlenin anlatım metni içindeki başlangıç karakteri */
  sentenceOffsets: number[];
  totalChars: number;
  keyTakeaways: string[];
  keyTerms: KeyTerm[];
  examTip: string;
  visualCue: string;
  diagram: StudioDiagram;
  /** 1x hızda tahmini süre (saniye) */
  durationSec: number;
}

export interface StudioContent {
  title: string;
  outline: string;
  scenes: StudioScene[];
  keyFacts: string[];
  searches: string[];
  totalDurationSec: number;
  /** Ders sonu: Hocanın sorabileceği çoktan seçmeli sorular */
  examQuestions: ExamQuestion[];
  /** Ders sonu: Kavram ↔ Tanım eşleştirme kartları */
  matchingPairs: MatchPair[];
}

export interface ExamQuestion {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  /** Konunun anlatıldığı bölüm (tekrar izle bağlantısı için) */
  sceneIndex: number;
}

export interface MatchPair {
  term: string;
  definition: string;
  sceneIndex: number;
}

/** Doğal Türkçe stüdyo konuşma hızı (1x, nefes ve söz değişim esleri hariç) */
export const CHARS_PER_SEC = 13.4;
const SENTENCE_PAUSE_SEC = 0.6;
const SPEAKER_SWITCH_PAUSE_SEC = 0.44;
export const MIN_LESSON_DURATION_SEC = 336; // En az 5 dakika 36 saniye zengin akademik akış garantisi

const LEADING_JUNK = /^[\s\-–—•*·>#\d.)(]+|^[^a-zA-Z0-9ğüşıöçĞÜŞİÖÇ]+/;

const STOPWORDS_TR = new Set([
  've', 'ile', 'veya', 'ama', 'fakat', 'ancak', 'çünkü', 'için', 'gibi', 'kadar',
  'olarak', 'olan', 'olup', 'olur', 'olmuş', 'olmuştur', 'bir', 'bu', 'şu', 'o',
  'da', 'de', 'ki', 'mi', 'mı', 'mu', 'mü', 'hem', 'ya', 'ise', 'daha', 'en',
  'çok', 'az', 'her', 'tüm', 'bütün', 'bazı', 'diğer', 'aynı', 'öyle', 'böyle',
  'üzerinde', 'üzerine', 'altında', 'arasında', 'sonra', 'önce', 'karşı', 'karşılık',
  'rağmen', 'dolayı', 'göre', 'üzere', 'tarafından', 'birlikte', 'sadece', 'yalnızca',
]);

export function cleanText(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/\s+/g, ' ')
    .replace(/\*\*|__|`/g, '')
    .trim();
}

function cleanLabel(value: unknown): string {
  return cleanText(value).replace(LEADING_JUNK, '').trim();
}

function capitalizeTr(text: string): string {
  if (!text) return '';
  const first = text.charAt(0).toLocaleUpperCase('tr-TR');
  return first + text.slice(1);
}

const PROPER_PREFIXES_TR = new Set([
  'selçuklu', 'selçuklular', 'osmanlı', 'osmanlılar', 'abbasi', 'abbasiler', 'bizans',
  'anadolu', 'moğol', 'moğollar', 'avrupa', 'türkiye', 'türk', 'islam', 'roma',
  'ermeni', 'süryani', 'batı', 'doğu', 'cumhuriyet', 'atatürk', 'keynes', 'smith',
  'ricardo', 'marx', 'friedman', 'pareto', 'nash', 'solow', 'hicks', 'marshall',
  'walras', 'schumpeter', 'malthus', 'pigou', 'coase',
]);

function lowerFirstIfNotProper(text: string): string {
  const t = cleanText(text);
  if (!t) return '';
  // İkinci harf büyükse kısaltmadır (GSYH vb.) veya Romen rakamıdır; koru
  if (t.length > 1 && t.charAt(1) === t.charAt(1).toLocaleUpperCase('tr-TR') && /[A-ZÇĞİÖŞÜ.]/.test(t.charAt(1))) {
    return t;
  }
  const firstWord = t.split(/[\s,.;:!?()]+/)[0] || '';
  if (firstWord.includes("'") || firstWord.includes('’')) return t;
  const stemLower = firstWord.toLocaleLowerCase('tr-TR');
  for (const proper of PROPER_PREFIXES_TR) {
    if (stemLower === proper || stemLower.startsWith(proper)) {
      return t;
    }
  }
  return t.charAt(0).toLocaleLowerCase('tr-TR') + t.slice(1);
}

function ensureSentenceEnd(text: string): string {
  const t = cleanText(text);
  if (!t) return '';
  return /[.!?]$/.test(t) ? t : `${t.replace(/…|\.{2,}$/g, '')}.`;
}

function stripTrailingPeriod(text: string): string {
  return cleanText(text).replace(/[.…]+$/, '').trim();
}

const GENERIC_NODE_LABEL_RE = /^(?:Temel\s+(?:Nokta|İlke)|Kavram\s+\d|Olası\s+Soru|\d{2}\s*·)/i;

const DANGLING_TAIL_WORDS_TR = new Set([
  'büyük', 'küçük', 'yeni', 'eski', 'modern', 'temel', 'önemli', 'genel', 'özel',
  'birinci', 'ikinci', 'üçüncü', 'dördüncü', 'beşinci', 'iki', 'üç', 'dört', 'beş',
  'hür', 'ilk', 'son', 'üstlendiği', 'olduğu', 'ettiği', 'yaptığı', 'kurduğu',
  'sağladığı', 'verdiği', 'aldığı', 'gelen', 'giden', 'kalan', 'çıkan', 'açık', 'kapalı',
]);

const NON_MODIFIER_WORDS_TR = new Set([
  ...STOPWORDS_TR,
  'ise', 'gibi', 'olan', 'olarak', 'özellikle', 'örneğin', 'nitekim', 'ancak', 'fakat',
  'kısmı', 'bölümü', 'temelinde', 'üzerine', 'karşılık', 'aracılığıyla', 'kapsamında',
  'sonucunda', 'sayesinde', 'nedeniyle', 'birlikte', 'başta', 'genelde', 'çoğunlukla',
  'ezen', 'kurulan', 'yapılan', 'edilen', 'verilen', 'alınan', 'bulunan', 'sağlayan',
  'üstlenen', 'üstlendiği', 'olduğu', 'ettiği', 'yaptığı', 'istikrar',
]);

const FINITE_VERB_RE =
  /(?:^|(?<=[\s(,;:"'«„-]))[A-ZÇĞİÖŞÜa-zçğıöşü]+(?:m[ıiuü]şt[ıiuü]r|m[ıiuü]şt[ıiuü]|maktad[ıiuü]r|mekted[ıiuü]r|[ıiuü]yor(?:du)?|acakt[ıiuü]r|ecekt[ıiuü]r|d[ıiuü]r|t[ıiuü]r|olur|yatar|gerekir|sağlar|oluşturur|karşılanmıştır|hedeflenmiştir|güçlendirmiştir)(?=\s|[.,;:!?)'"”]|$)/i;

const ACADEMIC_HEAD_NOUN_RE =
  /(?:^|(?<=[\s(,;:"'«„-]))((?:[A-ZÇĞİÖŞÜa-zçğıöşü0-9']+\s+){1,3})(sistemi|rejimi|maliyesi|politikası|politikaları|düzeni|yapısı|kurumu|kurumları|vakıfları|vakıflar|ticareti|birliği|birlik|gümrükleri|vergisi|vergileri|sigortası|fetihleri|istilası|reformu|modeli|yasası|teorisi|dengesi|kanunu|analizi|mekanizması|doktrini|yaklaşımı|esnekliği|faydası|maliyeti|arzı|talebi|enflasyonu|büyümesi|kalkınması|otoritesi|mülkiyeti|ekonomisi|piyasası|bütçesi|hukuku|ilkesi|hipotezi|eğrisi|katsayısı|endeksi|çarpanı|fonksiyonu)(?:'?(?:nin|nın|nun|nün|ni|nı|nu|nü|ne|na|nden|ndan|nde|nda|yle|yla))?(?=\s|[.,;:!?)'"”]|$)/gi;

/**
 * Bir metinden kelimeyi asla yarıdan kesmeyen (`eğ…` üretmeyen),
 * bağlaç veya yarım sıfatla bitmeyen tam ve anlamlı başlık üretir.
 */
export function shortLabel(text: string, maxWords = 4, maxChars = 36): string {
  const clean = cleanLabel(text)
    .replace(/…|\.{2,}/g, '')
    .split(/[:;—–]|\s-\s/)[0]
    .trim();
  if (!clean) return '';
  const rawWords = clean.split(' ').filter(Boolean);
  const words = rawWords.slice(0, maxWords);

  const trimDanglingTail = (checkAdjectives: boolean) => {
    while (words.length > 1) {
      const lastLower = words[words.length - 1].replace(/[.,;!?'"()]/g, '').toLocaleLowerCase('tr-TR');
      if (STOPWORDS_TR.has(lastLower) || (checkAdjectives && DANGLING_TAIL_WORDS_TR.has(lastLower))) {
        words.pop();
      } else {
        break;
      }
    }
  };

  trimDanglingTail(rawWords.length > maxWords);

  while (words.length > 1 && words.join(' ').replace(/[,.;:]+$/, '').length > maxChars) {
    words.pop();
    trimDanglingTail(true);
  }

  let joined = words.join(' ').replace(/[,.;:…]+$/, '').trim();
  if (joined.length > maxChars && words.length === 1) {
    joined = words[0].replace(/[,.;:…]+$/, '');
  }
  return capitalizeTr(joined);
}

function isValidModifierWord(word: string): boolean {
  const raw = word.replace(/^[('"]+|[.,;!?)'"]+$/g, '');
  if (!raw || raw.length < 2) return false;
  const lw = raw.toLocaleLowerCase('tr-TR');
  if (NON_MODIFIER_WORDS_TR.has(lw)) return false;
  if (raw.includes("'") || raw.includes('’')) return false;
  // Zarf-fiil, ulaç veya dolaylı tümleç ekleriyle biten kelimeler kavram tamlayanı olamaz
  if (/(?:masıyla|mesiyle|ılmasıyla|ilmesiyle|arak|erek|ğında|ğinde|dikten|duktan|madan|meden|larda|lerde|ndan|nden|dan|den|yla|yle)$/i.test(lw)) {
    return false;
  }
  if (FINITE_VERB_RE.test(lw)) return false;
  return true;
}

/** Bir ifadenin sınav şıkkı veya eşleştirme kartı olabilecek gerçek, tam bir kavram olup olmadığını denetler. */
export function isValidConceptTerm(term: string): boolean {
  const t = cleanLabel(term);
  if (!t || t.length < 3 || t.length > 52) return false;
  if (t.includes('…') || t.includes('...')) return false;
  if (GENERIC_NODE_LABEL_RE.test(t)) return false;
  if (/\b(?:deniz|barış|hocam|stüdyo|öğrenci|arkadaşlar)\b/i.test(t)) return false;
  const words = t.split(' ').filter(Boolean);
  if (words.length === 0 || words.length > 6) return false;
  if (FINITE_VERB_RE.test(t)) return false;
  const lastLower = words[words.length - 1].replace(/[.,;!?'"()]/g, '').toLocaleLowerCase('tr-TR');
  if (STOPWORDS_TR.has(lastLower) || DANGLING_TAIL_WORDS_TR.has(lastLower)) return false;
  // "Büyük Selçuklularda Abbasi" gibi bulunma hâli eki + tek sıfatla yarım kalmış tamlamaları ele
  if (
    words.length >= 2 &&
    /(?:larda|lerde|nda|nde|da|de)$/i.test(words[words.length - 2])
  ) {
    return false;
  }
  return true;
}

/** Cümle içerisinden gerçek akademik kavram(lar)ı yalın hâlde çıkarır. */
export function extractAllGenuineConcepts(sentence: string): KeyTerm[] {
  const cleaned = cleanLabel(sentence).replace(/…|\.{2,}/g, '').trim();
  if (!cleaned) return [];
  const results: KeyTerm[] = [];
  const seen = new Set<string>();

  const colonMatch = cleaned.match(/^([^:–—]{3,42})\s*[:–—]\s*(.{12,})$/);
  if (colonMatch && !FINITE_VERB_RE.test(colonMatch[1])) {
    const lbl = shortLabel(colonMatch[1], 5, 42);
    const def = capitalizeTr(colonMatch[2].trim());
    if (isValidConceptTerm(lbl) && def.length >= 12) {
      seen.add(lbl.toLocaleLowerCase('tr-TR'));
      results.push({ term: lbl, definition: def });
    }
  }

  ACADEMIC_HEAD_NOUN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ACADEMIC_HEAD_NOUN_RE.exec(cleaned)) !== null) {
    const rawMods = (m[1] || '').trim().split(/\s+/).filter(Boolean);
    const head = (m[2] || '').trim();
    const validMods: string[] = [];
    for (let i = rawMods.length - 1; i >= 0 && validMods.length < 2; i--) {
      if (isValidModifierWord(rawMods[i])) {
        validMods.unshift(rawMods[i].replace(/^[('"]+|[.,;!?)'"]+$/g, ''));
      } else {
        break;
      }
    }
    if (validMods.length === 0) continue;
    // "feodal rejimi" gibi tek sıfat + iyelik ekli kelimelerde yalın tamlama kontrolü ("arazi rejimi" geçerli, "feodal rejimi" tamlanan iyeliği)
    if (
      validMods.length === 1 &&
      /(?:feodal|modern|büyük|küçük|yeni|eski)$/i.test(validMods[0]) &&
      /(?:rejimi|maliyesi|yapısı|düzeni)$/i.test(head)
    ) {
      continue;
    }
    const candidate = capitalizeTr(`${validMods.join(' ')} ${head}`.trim());
    const key = candidate.toLocaleLowerCase('tr-TR');
    if (isValidConceptTerm(candidate) && !seen.has(key)) {
      seen.add(key);
      results.push({ term: candidate, definition: cleaned });
    }
  }

  // Çok kelimeli tam tamlamaları (örn. "Miri arazi rejimi" > "İkta sistemi") öne al
  results.sort((a, b) => b.term.split(' ').length - a.term.split(' ').length);
  return results;
}

/** Cümle içerisinden en güçlü gerçek akademik kavramı döner; yoksa null döner. */
export function extractGenuineConcept(sentence: string): KeyTerm | null {
  return extractAllGenuineConcepts(sentence)[0] ?? null;
}

function formatNodeTakeaway(n: DiagramNode): string {
  const lbl = cleanLabel(n.label).replace(/…|\.{2,}/g, '').trim();
  const sub = cleanText(n.subtext).replace(/…|\.{2,}/g, '').trim();
  if (!sub) return lbl;
  if (!lbl || GENERIC_NODE_LABEL_RE.test(lbl)) return sub;
  if (sub.toLocaleLowerCase('tr-TR').includes(lbl.toLocaleLowerCase('tr-TR'))) return sub;
  return `${lbl}: ${sub}`;
}

/**
 * Tam bir cümleden tekrarsız ve kesintisiz { label, subtext } şema düğümü çıkarır.
 * Virgülle ayrılmış örnek listelerini ("eğitim, sağlık, bayındırlık") asla kavram sanıp bölmez.
 */
export function extractNodeFromSentence(sentence: string, fallbackIndex: number): DiagramNode {
  const cleaned = cleanLabel(sentence).replace(/…|\.{2,}/g, '').trim();
  if (!cleaned) return { label: `Temel İlke ${fallbackIndex + 1}`, subtext: '' };

  const genuine = extractGenuineConcept(cleaned);
  if (genuine) {
    return {
      label: genuine.term,
      subtext: genuine.definition,
    };
  }

  const contentWords = cleaned
    .replace(/[.,;!?()"]/g, '')
    .split(' ')
    .filter(w => {
      const lw = w.toLocaleLowerCase('tr-TR');
      return w.length > 2 && !NON_MODIFIER_WORDS_TR.has(lw) && !FINITE_VERB_RE.test(w) && isValidModifierWord(w);
    });

  let picked = contentWords.slice(0, 3);
  while (
    picked.length > 1 &&
    DANGLING_TAIL_WORDS_TR.has(picked[picked.length - 1].toLocaleLowerCase('tr-TR'))
  ) {
    picked.pop();
  }
  const candidate = shortLabel(picked.join(' '), 3, 34);
  const derivedLabel = isValidConceptTerm(candidate) ? candidate : `Temel Nokta ${fallbackIndex + 1}`;
  return {
    label: derivedLabel,
    subtext: cleaned,
  };
}

export function splitSentences(text: string): string[] {
  const normalized = cleanText(text);
  if (!normalized) return [];

  const protectedText = normalized
    .replace(/\b(\d+)\.\s+(?=yüzyıl|yy|asır|bölüm|hafta|madde|sınıf|dönem|adım|aşama|halka)/gi, '$1__DOT__ ')
    .replace(/(?<![A-Za-zÇĞİÖŞÜçğıöşü])(vb|vs|örn|bkz|yak|yy|dr|prof|doç|av|hz|st)\.\s+/gi, '$1__DOT__ ');

  const raw = protectedText.match(/[^.!?…]+[.!?…]+["'”’)\]]*|[^.!?…]+$/g) || [protectedText];
  const restored = raw.map(p => p.replace(/__DOT__/g, '.').trim()).filter(Boolean);

  const merged: string[] = [];
  for (const part of restored) {
    const last = merged[merged.length - 1];
    if (last && (last.length < 22 || part.length < 14)) {
      merged[merged.length - 1] = `${last} ${part}`;
    } else {
      merged.push(part);
    }
  }

  const result: string[] = [];
  for (const s of merged) {
    if (s.length <= 215) {
      result.push(s);
      continue;
    }
    const chunks = s.split(/;\s+|,\s+(?=ancak|fakat|çünkü|böylece|dolayısıyla|özellikle|buna karşılık|nitekim)/i);
    if (chunks.length > 1) {
      chunks.forEach(c => {
        if (c.trim()) result.push(ensureSentenceEnd(c.trim()));
      });
    } else {
      result.push(s);
    }
  }
  return result;
}

function normalizeSpeaker(raw: unknown, _idx?: number): Speaker {
  const s = cleanText(raw).toLocaleLowerCase('tr-TR');
  if (s.includes('bar')) return 'Barış';
  return 'Deniz';
}

export function inferVisualTheme(text: string): VisualTheme {
  const t = text.toLocaleLowerCase('tr-TR');
  if (
    /selçuklu|osmanlı|bizans|moğol|imparatorluk|sultan|fetih|ikta|tımar|miri|vakıf|kervansaray|yüzyıl|tarih|savaş|antlaşma|devlet-i|hanedan/.test(
      t,
    )
  ) {
    return 'history';
  }
  if (
    /iktisat|ekonomi|piyasa|enflasyon|faiz|fiyat|arz|talep|maliye|vergi|bütçe|sermaye|yatırım|ticaret|üretim|gelir|gsyh|para|banka/.test(
      t,
    )
  ) {
    return 'economics';
  }
  if (/hukuk|anayasa|kanun|meclis|mahkeme|yargı|idare|kamu|mevzuat|tüzük|haklar|sözleşme/.test(t)) {
    return 'law';
  }
  if (/bilim|fizik|kimya|biyoloji|matematik|algoritma|veri|istatistik|deney|formül|enerji/.test(t)) {
    return 'science';
  }
  return 'society';
}

const VALID_DIAGRAM_TYPES: DiagramType[] = [
  'visual',
  'shapes',
  'table',
  'chart',
  'scenario',
  'timeline',
  'comparison',
  'structure',
  'network',
  'curve',
];

function inferDiagramType(text: string, sceneIdx: number): DiagramType {
  const t = text.toLocaleLowerCase('tr-TR');
  if (supportsQuantitativeDiagram(t) && /arz|talep|denge fiyatı|denge miktarı|esneklik|maliyet|fayda|faiz|enflasyon|büyüme|gsyh/.test(t)) {
    return /denge|arz|talep|esneklik/.test(t) ? 'curve' : 'chart';
  }
  if (/sultan|hanedan|fetih|tanzimat|antlaşma|yüzyıl|dönem|kronoloji|tarih/.test(t)) return 'timeline';
  if (/kurum|devlet|bakanlık|merkez bankası|hiyerarşi|yapı/.test(t)) return 'structure';
  if (/aktör|ilişki|etkileşim|ağ|bağlantı|mekanizma/.test(t)) return 'network';
  if (/senaryo|örnek olay|vaka|uygulama|düşünelim|somut örnek/.test(t)) return 'scenario';
  if (/tablo|sınıflandır|türleri|unsurları|kategor|matris/.test(t) && sceneIdx % 3 === 1) return 'table';
  if (supportsQuantitativeDiagram(t) && /oran|yüzde|artış|düşüş|eğilim|grafik|denge|büyüme|etki düzeyi|dağılım/.test(t)) return 'chart';
  if (/karşılaştır|kıyas|fark|karşılık|oysa|aksine/.test(t)) return 'comparison';
  if (/\b(1[0-9]{3}|20[0-9]{2})\b/.test(t) || /kronoloji|yüzyıl|dönem|aşama|süreç/.test(t)) return 'timeline';

  const richCycle: DiagramType[] = supportsQuantitativeDiagram(t)
    ? ['visual', 'shapes', 'table', 'chart', 'scenario', 'timeline', 'comparison']
    : ['visual', 'shapes', 'table', 'scenario', 'timeline', 'comparison'];
  return richCycle[sceneIdx % richCycle.length];
}

/** Grafik yalnızca konu gerçekten sayısal ilişki, eğilim veya ekonomik model içeriyorsa kullanılır. */
function supportsQuantitativeDiagram(text: string): boolean {
  return /iktisat|ekonomi|piyasa|arz|talep|denge fiyatı|denge miktarı|esneklik|maliyet|fayda|faiz|enflasyon|büyüme|gsyh|üretim|gelir|fiyat|oran|yüzde|istatistik|veri|formül|fonksiyon|koordinat|ölçüm|deney|enerji|hız|mesafe|zaman serisi|dağılım|regresyon/.test(
    text.toLocaleLowerCase('tr-TR'),
  );
}

function chooseDistinctDiagramType(
  preferred: DiagramType,
  text: string,
  sceneIdx: number,
  used: Set<DiagramType>,
): DiagramType {
  const semantic = inferDiagramType(text, sceneIdx);
  const cycle: DiagramType[] = supportsQuantitativeDiagram(text)
    ? ['curve', 'chart', 'timeline', 'structure', 'network', 'scenario', 'comparison', 'table', 'shapes', 'visual']
    : ['timeline', 'structure', 'network', 'scenario', 'comparison', 'table', 'shapes', 'visual'];
  const candidates = [preferred, semantic, ...cycle.slice(sceneIdx % cycle.length), ...cycle];
  return candidates.find(type => !used.has(type)) || semantic;
}

const DEFAULT_BADGES = ['Kurucu Eksen', 'İşleyiş Mekanizması', 'Yapısal Etki', 'Akademik Odak', 'Uzun Vadeli Sonuç'];

function deterministicValue(seedText: string, idx: number): number {
  let hash = 0;
  for (let i = 0; i < seedText.length; i++) {
    hash = (hash * 31 + seedText.charCodeAt(i)) | 0;
  }
  const base = [90, 78, 86, 70, 82][idx % 5];
  const jitter = Math.abs(hash % 9) - 4;
  return Math.max(42, Math.min(96, base + jitter));
}

function sanitizeNode(n: any, idx: number): DiagramNode {
  const rawLabel = cleanLabel(n?.label);
  const sub = cleanText(n?.subtext);
  const badge = cleanLabel(n?.badge) || DEFAULT_BADGES[idx % DEFAULT_BADGES.length];
  const rawVal = typeof n?.value === 'number' && Number.isFinite(n.value) ? n.value : undefined;

  if (
    sub &&
    rawLabel &&
    sub.toLocaleLowerCase('tr-TR').startsWith(rawLabel.replace(/…$/, '').toLocaleLowerCase('tr-TR'))
  ) {
    const extracted = extractNodeFromSentence(sub, idx);
    return {
      ...extracted,
      badge,
      value: rawVal !== undefined ? Math.max(18, Math.min(98, Math.round(rawVal))) : deterministicValue(extracted.label, idx),
    };
  }

  const finalLabel = shortLabel(rawLabel, 4, 32) || `Kavram ${idx + 1}`;
  return {
    label: finalLabel,
    subtext: sub,
    badge,
    value: rawVal !== undefined ? Math.max(18, Math.min(98, Math.round(rawVal))) : deterministicValue(finalLabel, idx),
  };
}

function buildDiagram(
  s: any,
  sceneIdx: number,
  courseLabel: string,
  title: string,
  narration: string,
  takeaways: string[],
  terms: KeyTerm[],
): StudioDiagram {
  const dd = s?.diagramData;
  const metric = cleanText(dd?.highlightMetric) || cleanText(s?.examTip) || takeaways[0] || '';
  const rootBadge = cleanText(courseLabel) || 'AKADEMİK STÜDYO';
  const themeText = `${courseLabel} ${title} ${narration}`;
  const visualTheme: VisualTheme =
    dd?.visualTheme && ['history', 'economics', 'law', 'science', 'society'].includes(dd.visualTheme)
      ? dd.visualTheme
      : inferVisualTheme(themeText);

  if (dd && Array.isArray(dd.nodes) && dd.nodes.length >= 2) {
    const nodes = dd.nodes.map((n: any, i: number) => sanitizeNode(n, i)).filter((n: DiagramNode) => n.label);
    if (nodes.length >= 2) {
      let type: DiagramType = VALID_DIAGRAM_TYPES.includes(dd.diagramType)
        ? dd.diagramType
        : inferDiagramType(`${title} ${narration}`, sceneIdx);
      if (!supportsQuantitativeDiagram(`${courseLabel} ${title} ${narration}`) && (type === 'chart' || type === 'curve')) {
        type = inferDiagramType(`${title} ${narration}`, sceneIdx);
      }
      if (type === 'curve') type = 'chart';
      return {
        type,
        visualTheme,
        title: cleanText(dd.mainTitle) || title,
        rootBadge,
        nodes: nodes.slice(0, 5),
        metric,
      };
    }
  }

  let nodes: DiagramNode[] = terms.map((t, i) =>
    sanitizeNode({ label: t.term, subtext: t.definition, badge: DEFAULT_BADGES[i % DEFAULT_BADGES.length] }, i),
  );

  if (nodes.length < 4) {
    takeaways.forEach((tk, i) => {
      const ex = extractNodeFromSentence(tk, i);
      nodes.push({
        ...ex,
        badge: DEFAULT_BADGES[nodes.length % DEFAULT_BADGES.length],
        value: deterministicValue(ex.label, nodes.length),
      });
    });
  }

  if (nodes.length < 4) {
    splitSentences(narration).forEach((sentence, i) => {
      const ex = extractNodeFromSentence(sentence, i);
      nodes.push({
        ...ex,
        badge: DEFAULT_BADGES[nodes.length % DEFAULT_BADGES.length],
        value: deterministicValue(ex.label, nodes.length),
      });
    });
  }

  const seen = new Set<string>();
  nodes = nodes.filter(n => {
    const key = n.label.toLocaleLowerCase('tr-TR');
    if (!n.label || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return {
    type: inferDiagramType(`${title} ${narration}`, sceneIdx),
    visualTheme,
    title,
    rootBadge,
    nodes: nodes.slice(0, 5),
    metric,
  };
}

function computeDuration(sentences: string[], speakers: Speaker[]): number {
  const totalChars = sentences.reduce((acc, s) => acc + s.length + 1, 0);
  let switches = 0;
  for (let i = 1; i < speakers.length; i++) {
    if (speakers[i] !== speakers[i - 1]) switches++;
  }
  return Math.max(
    8,
    totalChars / CHARS_PER_SEC + sentences.length * SENTENCE_PAUSE_SEC + switches * SPEAKER_SWITCH_PAUSE_SEC,
  );
}

function textSignature(text: string): string {
  return cleanText(text)
    .toLocaleLowerCase('tr-TR')
    .replace(/[^a-z0-9ğüşıöç\s]/g, '')
    .split(' ')
    .filter(w => w.length > 3)
    .slice(0, 6)
    .join(' ');
}

/**
 * Ham sahneyi zengin, entelektüel ve tekrarsız çoklu konuşmacı (Dr. Deniz <-> Barış) diyaloğuna dönüştürür.
 * Sahnedeki tüm kavramları, çıkarımları ve sınav uyarılarını derinlikli akademik Türkçe ile işler.
 */
function buildConversationalSentences(
  rawScene: any,
  leadSpeaker: Speaker,
  sceneIdx: number,
  sceneTitle: string,
  narration: string,
  takeaways: string[],
  terms: KeyTerm[],
  examTip: string,
): { sentences: string[]; speakers: Speaker[]; fullNarration: string } {
  const explicitTurns: DialogueTurn[] = Array.isArray(rawScene?.turns)
    ? rawScene.turns
        .map((t: any, i: number) => ({
          speaker: normalizeSpeaker(t?.speaker, i),
          text: cleanText(t?.text),
        }))
        .filter((t: DialogueTurn) => t.text.length > 4)
    : [];

  if (explicitTurns.length >= 2) {
    const sentences: string[] = [];
    const speakers: Speaker[] = [];
    explicitTurns.forEach(turn => {
      splitSentences(turn.text).forEach(p => {
        sentences.push(p);
        speakers.push(turn.speaker);
      });
    });

    // Eğer açık turlarda değinilmemiş kritik terim veya sınav uyarısı varsa organik biçimde ekle
    const joinedLower = sentences.join(' ').toLocaleLowerCase('tr-TR');
    const extraTerm = terms.find(
      kt =>
        kt.term &&
        kt.definition &&
        !joinedLower.includes(kt.term.toLocaleLowerCase('tr-TR')) &&
        !joinedLower.includes(kt.definition.slice(0, 20).toLocaleLowerCase('tr-TR')),
    );
    if (extraTerm) {
      sentences.push(`Deniz hocam, tam bu noktada ${extraTerm.term} kavramının mantığını ve işlevini de netleştirelim mi?`);
      speakers.push('Barış');
      sentences.push(`Çok iyi bir noktaya değindin Barış; ${ensureSentenceEnd(lowerFirstIfNotProper(extraTerm.definition))}`);
      speakers.push('Deniz');
    }

    return {
      sentences,
      speakers,
      fullNarration: sentences.join(' '),
    };
  }

  // Tek paragraflık materyali NotebookLM tarzında karşılıklı derin analiz diyaloğuna yükselt:
  // - Dr. Deniz (Kıdemli Akademik Hoca): Konunun kurucu ilkelerini, mekanizmalarını ve sınav tüyolarını anlatır.
  // - Barış (Meraklı Öğrenci / Araştırmacı): "Deniz hocam" hitabıyla sorular sorar, kilit halkaları birbirine bağlar.
  const baseSentences = splitSentences(narration);
  const sentences: string[] = [];
  const speakers: Speaker[] = [];

  const focusTerm = terms[0]?.term || takeaways[0] || sceneTitle;
  const probingQuestionBank = [
    `Deniz hocam, ${focusTerm} başlığında öğrencilerin önce hangi ilişkiyi kurması gerekiyor?`,
    `Bu noktayı ${focusTerm} üzerinden somutlaştırabilir miyiz hocam; neden-sonuç zinciri nasıl ilerliyor?`,
    `Akıllı tahtadaki ${focusTerm} bağlantısı dikkat çekici. Bu mekanizmanın sınavdaki ayırt edici ipucu nedir?`,
    `Bu sahnede ${focusTerm} kavramını diğerlerinden ayıran temel özellik sizce hangisi, Deniz hocam?`,
  ];

  const instructorAckBank = [
    `Sorunun merkezine geldin Barış;`,
    `Bu ayrımı kurmak için önce şu çerçeveyi kuralım Barış:`,
    `Burada belirleyici olan bağlantı şu Barış:`,
    `Bu soruyu yanıtlarken iki katmanı birlikte düşünelim Barış:`,
  ];

  const firstSpeaker = leadSpeaker;
  const secondSpeaker: Speaker = firstSpeaker === 'Deniz' ? 'Barış' : 'Deniz';

  if (baseSentences.length === 1) {
    sentences.push(baseSentences[0]);
    speakers.push(firstSpeaker);
    sentences.push(probingQuestionBank[sceneIdx % probingQuestionBank.length]);
    speakers.push(secondSpeaker);
    if (takeaways.length > 0) {
      sentences.push(`${instructorAckBank[sceneIdx % instructorAckBank.length]} İşin kalbi şurada: ${ensureSentenceEnd(lowerFirstIfNotProper(takeaways[0]))}`);
      speakers.push(firstSpeaker);
    }
  } else if (baseSentences.length === 2) {
    sentences.push(baseSentences[0]);
    speakers.push(firstSpeaker);
    sentences.push(probingQuestionBank[sceneIdx % probingQuestionBank.length]);
    speakers.push(secondSpeaker);
    sentences.push(`${instructorAckBank[sceneIdx % instructorAckBank.length]} ${ensureSentenceEnd(lowerFirstIfNotProper(baseSentences[1]))}`);
    speakers.push(firstSpeaker);
  } else if (baseSentences.length >= 3) {
    sentences.push(baseSentences[0]);
    speakers.push(firstSpeaker);
    sentences.push(probingQuestionBank[sceneIdx % probingQuestionBank.length]);
    speakers.push(secondSpeaker);
    sentences.push(`${instructorAckBank[sceneIdx % instructorAckBank.length]} ${ensureSentenceEnd(lowerFirstIfNotProper(baseSentences[1]))}`);
    speakers.push(firstSpeaker);
    sentences.push(`${focusTerm} açısından bir sonraki halka neyi değiştiriyor; bunu ${sceneTitle} bağlamında nasıl okumalıyız?`);
    speakers.push(secondSpeaker);
    baseSentences.slice(2).forEach(s => {
      sentences.push(s);
      speakers.push(firstSpeaker);
    });
  } else {
    baseSentences.forEach(s => {
      sentences.push(s);
      speakers.push('Deniz');
    });
  }

  const coveredSigs = new Set(sentences.map(textSignature));
  const lowerAll = sentences.join(' ').toLocaleLowerCase('tr-TR');

  // Henüz açılmamış terimleri (en fazla 2 adet) NotebookLM soru-cevap derinliğiyle işle:
  // Barış merakla "Deniz hocam..." diye sorar, Dr. Deniz kavramsal ayrımı ve formülü açıklar.
  const unusedTerms = terms.filter(
    kt =>
      kt.term &&
      kt.definition &&
      !coveredSigs.has(textSignature(kt.definition)) &&
      !lowerAll.includes(kt.definition.slice(0, 20).toLocaleLowerCase('tr-TR')),
  );

  const termQuestionTemplates = [
    (term: string) => `Deniz hocam, araya girip özellikle şunu sormak istiyorum: Notlardaki ${term} kavramını aklımızda nasıl kodlamalıyız?`,
    (term: string) => `Bekle bir saniye hocam, tam bu noktada öğrencilerin en çok karıştırdığı bir terim var: ${term}. Bunun ayırıcı püf noktası nedir?`,
    (term: string) => `Hocam, hocaların sınavda soru hazırlarken en sevdiği kavram ${term} olabilir mi? Öğrenci nereye odaklanmalı?`,
  ];
  const termAnswerOpeners = [
    'Bu kavramı yerli yerine oturtmak için önce tanımını, ardından sonucunu ayıralım:',
    'Burada iki aşamalı düşünmek gerekir: önce mekanizma, sonra ortaya çıkan etki:',
    'Sınavda bu kavramı doğru kullanmak için belirleyici ölçüt şudur:',
  ];

  unusedTerms.slice(0, 2).forEach((kt, tIdx) => {
    sentences.push(termQuestionTemplates[(sceneIdx + tIdx) % termQuestionTemplates.length](kt.term));
    speakers.push('Barış');
    sentences.push(
      `${termAnswerOpeners[(sceneIdx + tIdx) % termAnswerOpeners.length]} ${ensureSentenceEnd(lowerFirstIfNotProper(kt.definition))}`,
    );
    speakers.push('Deniz');
    coveredSigs.add(textSignature(kt.definition));
  });

  // Henüz konuşulmamış önemli çıkarımları analitik derinlikle ekle:
  // Barış büyük resmi toparlar, Dr. Deniz teyit edip sınav boyutunu ekler.
  const unusedTakeaways = takeaways.filter(
    tk =>
      tk &&
      !coveredSigs.has(textSignature(tk)) &&
      !lowerAll.includes(tk.slice(0, 22).toLocaleLowerCase('tr-TR')),
  );

  if (unusedTakeaways.length > 0) {
    const tk = unusedTakeaways[0];
    sentences.push(`O hâlde Deniz hocam, buradaki büyük resmi tek bir cümleyle özetlersek: ${ensureSentenceEnd(lowerFirstIfNotProper(tk))}`);
    speakers.push('Barış');
    if (unusedTakeaways[1]) {
      sentences.push(`Bu çerçeveyi tamamlayan ikinci sonuç ise şudur: ${ensureSentenceEnd(lowerFirstIfNotProper(unusedTakeaways[1]))}`);
      speakers.push('Deniz');
    } else {
      sentences.push(`Bu nedenle konunun omurgasını neden ile sonuç arasındaki bu bağ oluşturuyor.`);
      speakers.push('Deniz');
    }
  }

  // Sınav perspektifi ve kavramsal ayrım uyarısı:
  // Barış öğrenci tüyo sorusu sorar, Dr. Deniz hoca gözüyle kritik anahtarı verir.
  if (
    examTip &&
    !coveredSigs.has(textSignature(examTip)) &&
    !lowerAll.includes(examTip.slice(0, 20).toLocaleLowerCase('tr-TR'))
  ) {
    sentences.push(`Peki Deniz hocam, öğrencilerin sınav kağıdında tam puanı kapması için en kritik tüyo nedir?`);
    speakers.push('Barış');
    sentences.push(`İşte vize ve final sınavlarının en can alıcı püf noktası burası Barış! Hocaların en çok baktığı anahtar kriter şudur: ${ensureSentenceEnd(lowerFirstIfNotProper(examTip))}`);
    speakers.push('Deniz');
  }

  if (sentences.length === 0) {
    sentences.push(ensureSentenceEnd(sceneTitle));
    speakers.push('Deniz');
  }

  return {
    sentences,
    speakers,
    fullNarration: sentences.join(' '),
  };
}

function finalizeSceneObject(params: {
  id: string;
  index: number;
  title: string;
  sentences: string[];
  speakers: Speaker[];
  keyTakeaways: string[];
  keyTerms: KeyTerm[];
  examTip: string;
  visualCue: string;
  diagram: StudioDiagram;
}): StudioScene {
  const { id, index, title, sentences, speakers, keyTakeaways, keyTerms, examTip, visualCue, diagram } = params;
  const offsets: number[] = [];
  let acc = 0;
  sentences.forEach(s => {
    offsets.push(acc);
    acc += s.length + 1;
  });
  const totalChars = Math.max(1, acc);
  const lead = speakers[0] || 'Deniz';

  return {
    id,
    index,
    speaker: lead,
    speakerRole: lead === 'Deniz' ? 'Akademik Anlatıcı' : 'Öğrenci',
    title,
    narration: sentences.join(' '),
    sentences,
    sentenceSpeakers: speakers,
    sentenceOffsets: offsets,
    totalChars,
    keyTakeaways,
    keyTerms,
    examTip,
    visualCue,
    diagram,
    durationSec: computeDuration(sentences, speakers),
  };
}

function turnsToDialogueArrays(turns: DialogueTurn[]): { sentences: string[]; speakers: Speaker[] } {
  const sentences: string[] = [];
  const speakers: Speaker[] = [];
  turns.forEach(t => {
    splitSentences(t.text).forEach(st => {
      sentences.push(st);
      speakers.push(t.speaker);
    });
  });
  return { sentences, speakers };
}

/**
 * Dersin EN AZ 5.5 - 8 dakika sürecek akademik derinliğe ve görsel çeşitliliğe
 * ('visual', 'shapes', 'table', 'chart', 'scenario', 'comparison') ulaşmasını sağlar.
 * Asla aynı cümleyi kopyalayıp tekrar etmez; bölümler arası karşılaştırma, nedensellik analizi,
 * yapısal ağırlık yorumu ve 4 aşamalı somut vaka kurgusu üretir.
 */
function ensureRichFiveMinuteCurriculum(
  initialScenes: StudioScene[],
  title: string,
  outline: string,
  courseLabel: string,
  keyFacts: string[],
): StudioScene[] {
  const coreScenes = [...initialScenes];
  const rootBadge = cleanText(courseLabel) || 'AKADEMİK STÜDYO';
  const corpusText = `${courseLabel} ${title} ${outline} ${coreScenes.map(s => s.narration).join(' ')}`;
  const visualTheme = inferVisualTheme(corpusText);

  const domainNoun =
    visualTheme === 'history'
      ? 'tarihsel ve kurumsal'
      : visualTheme === 'economics'
      ? 'iktisadi ve mali'
      : visualTheme === 'law'
      ? 'hukuki ve anayasal'
      : visualTheme === 'science'
      ? 'bilimsel ve metodolojik'
      : 'kuramsal ve toplumsal';

  // Eski tekdüze şema tiplerini zengin çok-modlu tiplere yükselt
  const richPalette: DiagramType[] = supportsQuantitativeDiagram(corpusText)
    ? ['visual', 'shapes', 'table', 'chart', 'scenario', 'timeline', 'comparison']
    : ['visual', 'shapes', 'table', 'scenario', 'timeline', 'comparison'];
  coreScenes.forEach((sc, idx) => {
    if (sc.diagram.type === 'network' || sc.diagram.type === 'structure') {
      sc.diagram.type = richPalette[idx % richPalette.length];
    }
  });

  // Materyalin tüm bilgi evrenini tekrarsız şekilde derle (yalnızca geçerli tam kavramlar)
  const allTerms: KeyTerm[] = [];
  const seenTerms = new Set<string>();
  const pushValidTerm = (term: string, definition: string) => {
    const cleanT = cleanLabel(term).replace(/…|\.{2,}/g, '').trim();
    const cleanD = cleanText(definition).replace(/…|\.{2,}/g, '').trim();
    const k = cleanT.toLocaleLowerCase('tr-TR');
    if (!cleanT || !cleanD || cleanD.length < 12 || !isValidConceptTerm(cleanT) || seenTerms.has(k)) return;
    seenTerms.add(k);
    allTerms.push({ term: cleanT, definition: cleanD });
  };

  coreScenes.forEach(sc => {
    sc.keyTerms.forEach(kt => pushValidTerm(kt.term, kt.definition));
  });
  splitSentences(outline).forEach(sent => {
    extractAllGenuineConcepts(sent).forEach(kt => pushValidTerm(kt.term, kt.definition));
  });
  coreScenes.forEach(sc => {
    sc.sentences.forEach(sent => {
      extractAllGenuineConcepts(sent).forEach(kt => pushValidTerm(kt.term, kt.definition));
    });
  });

  const allTakeaways = Array.from(new Set(coreScenes.flatMap(sc => sc.keyTakeaways).filter(Boolean)));
  const allExamTips = Array.from(new Set(coreScenes.map(sc => sc.examTip).filter(Boolean)));
  const allFacts = Array.from(new Set([...keyFacts, ...allExamTips, ...allTakeaways])).filter(Boolean);
  const allNodes = coreScenes.flatMap(sc => sc.diagram.nodes).filter(n => n.label && n.subtext);
  const chapterTitles = coreScenes
    .map(s => cleanLabel(s.title).replace(/…|\.{2,}/g, '').trim())
    .filter(Boolean);
  const displayTitle = title.length <= 54 ? title : shortLabel(title, 7, 54);

  // Farklı sahnelerin farklı düğüm alt kümelerini kullanması için ayrık havuz seçici
  const pickDistinctNodes = (seedOffset: number, count = 4, badges?: string[]): DiagramNode[] => {
    const genuineCandidates: DiagramNode[] = [];
    const fallbackCandidates: DiagramNode[] = [];
    const seen = new Set<string>();

    const pushCandidate = (n: DiagramNode) => {
      const lbl = cleanLabel(n.label).replace(/…|\.{2,}/g, '').trim();
      const sub = cleanText(n.subtext).replace(/…|\.{2,}/g, '').trim();
      const k = lbl.toLocaleLowerCase('tr-TR');
      if (!lbl || !sub || seen.has(k)) return;
      seen.add(k);
      const normalized = { ...n, label: lbl, subtext: sub };
      if (isValidConceptTerm(lbl)) {
        genuineCandidates.push(normalized);
      } else {
        fallbackCandidates.push(normalized);
      }
    };

    allTerms.forEach((t, i) =>
      pushCandidate({
        label: shortLabel(t.term, 5, 40),
        subtext: t.definition,
        badge: DEFAULT_BADGES[i % DEFAULT_BADGES.length],
        value: deterministicValue(t.term, i),
      }),
    );
    allNodes.forEach(n => pushCandidate(n));
    allFacts.forEach((f, i) => {
      const ex = extractNodeFromSentence(f, i);
      pushCandidate({
        ...ex,
        badge: DEFAULT_BADGES[i % DEFAULT_BADGES.length],
        value: deterministicValue(ex.label, i + 3),
      });
    });

    const candidates =
      genuineCandidates.length >= count
        ? genuineCandidates
        : [...genuineCandidates, ...fallbackCandidates];

    if (candidates.length === 0) {
      const base = extractNodeFromSentence(outline || title, 0);
      return [
        { ...base, badge: badges?.[0] || 'Ana Eksen', value: 89 },
        {
          label: shortLabel(title, 5, 40) || 'Kuramsal Çerçeve',
          subtext: outline || title,
          badge: badges?.[1] || 'Kapsam',
          value: 78,
        },
      ];
    }

    const picked: DiagramNode[] = [];
    for (let i = 0; i < candidates.length && picked.length < count; i++) {
      const item = candidates[(seedOffset * 3 + i) % candidates.length];
      if (!picked.some(p => p.label === item.label)) {
        picked.push({
          ...item,
          badge: badges?.[picked.length % badges.length] || item.badge,
        });
      }
    }
    return picked;
  };

  const toSceneTerms = (nodes: DiagramNode[], max = 4): KeyTerm[] =>
    nodes
      .filter(n => isValidConceptTerm(n.label) && n.subtext && n.subtext !== n.label)
      .slice(0, max)
      .map(n => ({ term: n.label, definition: n.subtext }));

  const spokenNodeName = (n: DiagramNode | undefined, fallback: string): string =>
    n && isValidConceptTerm(n.label) ? n.label : fallback;

  const extraScenes: { slot: 'opening' | 'mid1' | 'mid2' | 'late1' | 'late2' | 'exam' | 'closing'; scene: StudioScene }[] = [];
  const totalSecWithExtras = () =>
    coreScenes.reduce((a, s) => a + s.durationSec, 0) +
    extraScenes.reduce((a, e) => a + e.scene.durationSec, 0);
  const hasTypeAnywhere = (t: DiagramType) =>
    coreScenes.some(s => s.diagram.type === t) || extraScenes.some(e => e.scene.diagram.type === t);

  // 1) AÇILIŞ: Bütünsel Kavramsal Mimari ve Görsel Çerçeve ('visual')
  if (!hasTypeAnywhere('visual') || totalSecWithExtras() < MIN_LESSON_DURATION_SEC) {
    const vNodes = pickDistinctNodes(0, 4, ['Kurucu Tez', 'Yapısal Bağlam', 'İç İşleyiş', 'Makro Sonuç']);
    const courseOverlap = courseLabel && title.toLocaleLowerCase('tr-TR').includes(courseLabel.toLocaleLowerCase('tr-TR').slice(0, 10));
    const coursePrefix = courseLabel && !courseOverlap ? `${courseLabel} dersi kapsamında ` : '';

    const roadmapStr =
      chapterTitles.length >= 2
        ? `farklı bölümler arasındaki`
        : `tüm kavramlar arasındaki`;
    const framingText = outline
      ? ensureSentenceEnd(outline)
      : `${title} konusu, tekil tanımların ötesinde çok katmanlı bir ${domainNoun} bütünlük taşır.`;

    const { sentences, speakers } = turnsToDialogueArrays([
      {
        speaker: 'Deniz',
        text: `EconNotes akademik stüdyosuna hepiniz hoş geldiniz arkadaşlar! Bugün ${coursePrefix}${title} konusunu ezber kalıplardan çıkarıp, arkasındaki ${domainNoun} mantık, karşılaştırma tabloları, grafikler ve sınav odaklı püf noktalarıyla çok keyifli bir şekilde ele alacağız. ${framingText}`,
      },
      {
        speaker: 'Barış',
        text: `Deniz hocam, bu konuyu ezber parçalarına ayırmadan anlamak için ${roadmapStr} hangi kurucu bağı izlemeliyiz? Akıllı tahtadaki kavramsal şemada ilk odaklanmamız gereken zemin nedir?`,
      },
      {
        speaker: 'Deniz',
        text: `Tam kalbinde ${spokenNodeName(vNodes[0], title)} yer alıyor Barış. Çünkü işin sırrı şurada: ${lowerFirstIfNotProper(stripTrailingPeriod(vNodes[0]?.subtext || framingText))}. Bu temel taş yerine oturduğunda, ${spokenNodeName(vNodes[1], 'diğer kurumsal halkalar')} da kendiliğinden anlam kazanıyor. Şimdi bu büyük resmi adım adım, en can alıcı ayrıntılarıyla açalım!`,
      },
    ]);

    extraScenes.push({
      slot: 'opening',
      scene: finalizeSceneObject({
        id: 'scene-visual-architecture',
        index: 0,
        title: `${displayTitle}: Kavramsal Mimari ve Analitik Çerçeve`,
        sentences,
        speakers,
        keyTakeaways: vNodes.slice(0, 3).map(formatNodeTakeaway),
        keyTerms: allTerms.slice(0, 3),
        examTip:
          allFacts[0] ||
          `${title} başlığında unsurların tekil tanımlarından çok birbirleriyle kurduğu ${domainNoun} bütünlük sorgulanır.`,
        visualCue: 'Konunun bütünsel mimarisini sunan illüstratif görsel analiz sahnesi',
        diagram: {
          type: 'visual',
          visualTheme,
          title: `${displayTitle} — Bütünsel Model`,
          rootBadge,
          nodes: vNodes,
          metric: allFacts[0] || outline || title,
        },
      }),
    });
  }

  // 2) ORTA-1: Çok Boyutlu Akademik Karşılaştırma Tablosu ('table')
  if (!hasTypeAnywhere('table') || totalSecWithExtras() < MIN_LESSON_DURATION_SEC) {
    const tNodes = pickDistinctNodes(1, 4, ['Kavramsal Tanım', 'Kurumsal İşlev', 'Uygulama Zemini', 'Yapısal Çıktı']);
    const n0 = tNodes[0];
    const n1 = tNodes[1] || tNodes[0];
    const n2 = tNodes[2] || tNodes[0];
    const n3 = tNodes[3] || tNodes[1] || tNodes[0];
    const lbl0 = spokenNodeName(n0, 'birinci kurumsal eksen');
    const lbl1 = spokenNodeName(n1, 'ikinci tamamlayıcı eksen');
    const lbl2 = spokenNodeName(n2, 'uygulama boyutu');
    const lbl3 = spokenNodeName(n3, 'yapısal sonuç');

    const { sentences, speakers } = turnsToDialogueArrays([
      {
        speaker: 'Deniz',
        text: `Şimdi akıllı tahtamızda sistematik bir karşılaştırma tablosu açıyoruz arkadaşlar; çünkü sınavlarda en çok puan kaybettiren tuzak birbirine benzeyen kavramları karıştırmaktır.`,
      },
      {
        speaker: 'Barış',
        text: `Deniz hocam, tabloda ${lbl0} ile ${lbl1} yan yana duruyor. Bu iki kavramı bir sınav sorusunda ayırt etmek için hangi ölçütü kullanmalıyız?`,
      },
      {
        speaker: 'Deniz',
        text: `Bu ayrımın kritik noktası şu: ${lbl0}, ${ensureSentenceEnd(lowerFirstIfNotProper(n0.subtext))} Buna karşılık ${lbl1}, ${ensureSentenceEnd(lowerFirstIfNotProper(n1.subtext))} Peki bu fark uygulamada hangi sonucu doğurur?`,
      },
      {
        speaker: 'Barış',
        text: `Çok net bir ayrım oldu hocam! Tablonun devamında ${lbl2} boyutunda ${lowerFirstIfNotProper(stripTrailingPeriod(n2.subtext))}${n3 && n3.label !== n2.label ? `, ${lbl3} ekseninde ise ${lowerFirstIfNotProper(stripTrailingPeriod(n3.subtext))}` : ''}. Kavramları böyle yan yana, matris halinde görmek tüm kafa karışıklığını siliyor!`,
      },
    ]);

    extraScenes.push({
      slot: 'mid1',
      scene: finalizeSceneObject({
        id: 'scene-comparative-table',
        index: 0,
        title: 'Sistematik Sınıflandırma ve Karşılaştırma Tablosu',
        sentences,
        speakers,
        keyTakeaways: tNodes.map(formatNodeTakeaway),
        keyTerms: toSceneTerms(tNodes, 4),
        examTip: `Tablodaki ${lbl0} ve ${lbl1} kavramlarının işlev farkı, çoktan seçmeli ve klasik sınavlarda temel ayırt edici ölçüttür.`,
        visualCue: 'Çok sütunlu akademik sınıflandırma ve karşılaştırma tablosu',
        diagram: {
          type: 'table',
          visualTheme,
          title: 'Kavram, İşlev ve Yapısal Sonuç Matrisi',
          rootBadge,
          nodes: tNodes,
          metric: n0.subtext || outline,
        },
      }),
    });
  }

  // 3) ORTA-2: Nedensellik Zinciri ve Geri Besleme Döngüsü ('shapes')
  if (!hasTypeAnywhere('shapes') || totalSecWithExtras() < MIN_LESSON_DURATION_SEC) {
    const sNodes = pickDistinctNodes(2, 4, ['Başlatıcı Dinamik', 'Aktarım Kanalı', 'Kurumsal Denge', 'Geri Besleme']);
    const s0 = sNodes[0];
    const s1 = sNodes[1] || sNodes[0];
    const s2 = sNodes[2] || sNodes[0];
    const sl0 = spokenNodeName(s0, 'başlatıcı ilke');
    const sl1 = spokenNodeName(s1, 'aktarım mekanizması');
    const sl2 = spokenNodeName(s2, 'kurumsal denge');

    const { sentences, speakers } = turnsToDialogueArrays([
      {
        speaker: 'Deniz',
        text: `Şimdi durağan tanımların ötesine geçip işin mutfağına, yani neden-sonuç mekanizmasına bakalım arkadaşlar. Akıllı tahtadaki geometrik döngü bize çok önemli bir kuralı hatırlatıyor: hiçbir ${domainNoun} sonuç tesadüfen doğmaz! İlk kıvılcımı ${sl0} çakıyor; ${ensureSentenceEnd(lowerFirstIfNotProper(s0.subtext))}`,
      },
      {
        speaker: 'Barış',
        text: `Peki hocam, bu ilk ivme sistemi nasıl dalga dalga etkiliyor? Özellikle ${sl1} aşamasına geçtiğimizde sahada nasıl bir dönüşüm görüyoruz?`,
      },
      {
        speaker: 'Deniz',
        text: `İşte domino etkisi tam burada devreye giriyor Barış! ${sl0} sağlam adımlarla ilerlediğinde doğrudan ${sl1} kanalını besliyor ve ${ensureSentenceEnd(lowerFirstIfNotProper(s1.subtext))} Ardından ${sl2} ile sistem tam bir kurumsal dengeye kavuşuyor. Halkalardan biri zayıflarsa bütün çarklar yavaşlar!`,
      },
    ]);

    extraScenes.push({
      slot: 'mid2',
      scene: finalizeSceneObject({
        id: 'scene-causal-shapes',
        index: 0,
        title: 'Nedensellik Zinciri ve Döngüsel Etkileşim Mekanizması',
        sentences,
        speakers,
        keyTakeaways: sNodes.slice(0, 3).map(formatNodeTakeaway),
        keyTerms: toSceneTerms(sNodes, 3),
        examTip:
          allFacts[1] ||
          'Halkalar arasındaki karşılıklı geri besleme ilişkisi, analitik yorum sorularının ana eksenini oluşturur.',
        visualCue: 'Geometrik şekillerle modellenen döngüsel nedensellik ve aktarım şeması',
        diagram: {
          type: 'shapes',
          visualTheme,
          title: 'Döngüsel Nedensellik ve Aktarım Mekanizması',
          rootBadge,
          nodes: sNodes,
          metric: allFacts[1] || s2.subtext || s0.subtext,
        },
      }),
    });
  }

  // 4) GEÇ-1: Yapısal Ağırlık ve Etki Düzeyi Grafiği ('chart')
  if (supportsQuantitativeDiagram(corpusText) && (!hasTypeAnywhere('chart') || totalSecWithExtras() < MIN_LESSON_DURATION_SEC)) {
    const cNodes = pickDistinctNodes(3, 4, ['Birincil Belirleyici', 'Yapısal Kaldıraç', 'İstikrar Unsuru', 'Tamamlayıcı Etki']).map(
      (n, idx) => ({
        ...n,
        value: [93, 84, 79, 69][idx % 4],
      }),
    );
    const c0 = cNodes[0];
    const c1 = cNodes[1] || cNodes[0];
    const c2 = cNodes[2] || cNodes[0];
    const cl0 = spokenNodeName(c0, 'birincil belirleyici');
    const cl1 = spokenNodeName(c1, 'yapısal kaldıraç');
    const cl2 = spokenNodeName(c2, 'istikrar unsuru');

    const { sentences, speakers } = turnsToDialogueArrays([
      {
        speaker: 'Deniz',
        text: `Konuyu ezberden kurtarmanın en etkili yolu faktörlerin göreli ağırlığını ve etki hiyerarşisini görmektir arkadaşlar.`,
      },
      {
        speaker: 'Barış',
        text: `Çok haklısınız Deniz hocam; tahtadaki analitik grafikte sütunlar ve eğilim çizgisi bize hangi faktörün birincil olduğunu gösteriyor?`,
      },
      {
        speaker: 'Deniz',
        text: `Grafiğin zirvesindeki tepe noktası bize yolu açıkça gösteriyor Barış. En yüksek etki açık ara ${cl0} unsurunda toplanmış durumda! Çünkü ${lowerFirstIfNotProper(stripTrailingPeriod(c0.subtext))}. Sistemin ana lokomotifi işte tam burasıdır.`,
      },
      {
        speaker: 'Barış',
        text: `Hemen ardından gelen ${cl1} ve ${cl2} unsurları da bu ana ekseni güçlendiren destek kolonları gibi. Ana etken ile yan etkenleri böyle ayırt etmek sınavlarda doğrudan net kazandırır!`,
      },
    ]);

    extraScenes.push({
      slot: 'late1',
      scene: finalizeSceneObject({
        id: 'scene-structural-chart',
        index: 0,
        title: 'Analitik Etki Hiyerarşisi ve Eğilim Grafiği',
        sentences,
        speakers,
        keyTakeaways: cNodes.slice(0, 3).map(formatNodeTakeaway),
        keyTerms: toSceneTerms(cNodes, 3),
        examTip:
          allFacts[2] ||
          `Öncüllü sorularda "temel/birincil etken" sorulduğunda ${cl0} eksenindeki ana belirleyiciye odaklanılmalıdır.`,
        visualCue: 'Faktörlerin göreli ağırlığını ve eğilim eğrisini gösteren analitik grafik',
        diagram: {
          type: 'chart',
          visualTheme,
          title: 'Yapısal Belirleyicilik ve Etki Eğrisi',
          rootBadge,
          nodes: cNodes,
          metric: allFacts[2] || c0.subtext,
        },
      }),
    });
  }

  // 5) GEÇ-2: Dört Aşamalı Uygulamalı Vaka & Senaryo Simülasyonu ('scenario')
  if (!hasTypeAnywhere('scenario') || totalSecWithExtras() < MIN_LESSON_DURATION_SEC) {
    const scNodes = pickDistinctNodes(4, 4, [
      '01 · Başlangıç Koşulu',
      '02 · Kurumsal Müdahale',
      '03 · Saha İşleyişi',
      '04 · Denge ve Sonuç',
    ]);
    const st0 = scNodes[0];
    const st1 = scNodes[1] || scNodes[0];
    const st2 = scNodes[2] || scNodes[0];
    const st3 = scNodes[3] || scNodes[1] || scNodes[0];
    const stl0 = spokenNodeName(st0, 'kurucu zemin');

    const { sentences, speakers } = turnsToDialogueArrays([
      {
        speaker: 'Deniz',
        text: `Şimdi tüm bu teorik mekanizmayı zihnimizde somutlaştırmak için dört aşamalı bir süreç simülasyonu yapalım arkadaşlar.`,
      },
      {
        speaker: 'Barış',
        text: `Deniz hocam, ${title} sürecini gerçek bir vaka üzerinden düşünelim. Başlangıç koşulundan nihai sonuca kadar sahada hangi dört adım gerçekleşir?`,
      },
      {
        speaker: 'Deniz',
        text: `Birinci adımda başlangıç koşulumuz oluşuyor: ${stl0} çerçevesinde ${ensureSentenceEnd(lowerFirstIfNotProper(st0.subtext))} Bu zeminin üzerine ikinci aşamada kurumsal mekanizma devreye giriyor ve ${ensureSentenceEnd(lowerFirstIfNotProper(st1.subtext))}`,
      },
      {
        speaker: 'Barış',
        text: `Üçüncü aşamaya geldiğimizde ise sahadaki somut karşılığı canlı bir şekilde görüyoruz: ${ensureSentenceEnd(lowerFirstIfNotProper(st2.subtext))} Ve nihai dördüncü adımda tüm sürecin doğal çıktısı olarak ${ensureSentenceEnd(lowerFirstIfNotProper(st3.subtext))}`,
      },
      {
        speaker: 'Deniz',
        text: `İşte konuyu böyle yaşayan bir hikaye ve vaka kurgusuyla zihnimizde canlandırdığımızda, soyut ilkeler kalıcı birer bilgiye dönüşüyor!`,
      },
    ]);

    extraScenes.push({
      slot: 'late2',
      scene: finalizeSceneObject({
        id: 'scene-applied-scenario',
        index: 0,
        title: 'Uygulamalı Vaka Analizi ve Senaryo Simülasyonu',
        sentences,
        speakers,
        keyTakeaways: scNodes.map(formatNodeTakeaway),
        keyTerms: toSceneTerms(scNodes, 3),
        examTip:
          'Vaka ve paragraf temelli sorularda önce başlangıç koşulunu, ardından kurumsal aracı ve nihai sonucu eşleştirin.',
        visualCue: 'Dört aşamalı uygulamalı vaka analizi ve süreç simülasyonu',
        diagram: {
          type: 'scenario',
          visualTheme,
          title: `${displayTitle} — Vaka Simülasyonu`,
          rootBadge,
          nodes: scNodes,
          metric: st3.subtext || allFacts[0] || title,
        },
      }),
    });
  }

  // 6) HOCANIN SORABİLECEĞİ SORULAR: Öğrencinin sınavda karşılaşacağı soru kalıpları ('table')
  {
    const examPool: KeyTerm[] = [];
    const seenExam = new Set<string>();
    const pushExam = (t: KeyTerm) => {
      const cleanT = cleanLabel(t.term).replace(/…|\.{2,}/g, '').trim();
      const cleanD = cleanText(t.definition).replace(/…|\.{2,}/g, '').trim();
      const k = cleanT.toLocaleLowerCase('tr-TR');
      if (!cleanT || !cleanD || cleanD.length < 12 || !isValidConceptTerm(cleanT) || seenExam.has(k)) return;
      seenExam.add(k);
      examPool.push({ term: cleanT, definition: cleanD });
    };
    allTerms.forEach(pushExam);
    allNodes.forEach(n => pushExam({ term: n.label, definition: n.subtext }));

    if (examPool.length >= 2) {
      const q0 = examPool[0];
      const q1 = examPool[1];
      const q2 = examPool[2] || examPool[0];
      const criticalFact = allFacts.find(f => !f.toLocaleLowerCase('tr-TR').includes(q0.term.toLocaleLowerCase('tr-TR'))) || allFacts[0];

      const turns: DialogueTurn[] = [
        {
          speaker: 'Deniz',
          text: `Şimdi dersimizin en can alıcı bölümüne geldik arkadaşlar: Bu konudan sınavda hocalar nasıl soru sorar, öğrenci kağıda ne yazarsa tam puanı kapar?`,
        },
        {
          speaker: 'Barış',
          text: `Öğrencilerin en çok merak ettiği kısım tam olarak bu Deniz hocam! İlk olarak klasik sınavlarda karşımıza ne çıkar?`,
        },
        {
          speaker: 'Deniz',
          text: `İlk ve en garanti soru klasik kavram sorusudur: ${q0.term} nedir? Burada hocanın aradığı altın cümle şudur: ${ensureSentenceEnd(lowerFirstIfNotProper(q0.definition))} Tanımı kuru bir ezber olarak değil, arkasındaki mantığı ve işleviyle yazan öğrenci doğrudan tam puan alır.`,
        },
        {
          speaker: 'Barış',
          text: `İkinci favori soru tipi ise 'Ayırt Etme ve Kıyaslama' sorusu: ${q1.term} ile ${q2.term === q1.term ? q0.term : q2.term} arasındaki temel fark nedir? Test sınavlarında da çeldirici tam buradan kurulur değil mi hocam?`,
        },
        {
          speaker: 'Deniz',
          text: `Bu iki kavramın ayrımını netleştirelim: ${q1.term} dediğimizde ${ensureSentenceEnd(lowerFirstIfNotProper(q1.definition))} Buna karşılık ${q2.term === q1.term ? q0.term : q2.term} ise ${ensureSentenceEnd(lowerFirstIfNotProper((q2.term === q1.term ? q0 : q2).definition))} Peki bu fark, seçeneklerde nasıl bir çeldiriciye dönüşebilir?`,
        },
      ];
      if (criticalFact) {
        turns.push({
          speaker: 'Barış',
          text: `Son olarak sınav kağıdında hayat kurtaracak şu kritik bilgiyi de aklımıza kazıyalım: ${ensureSentenceEnd(lowerFirstIfNotProper(criticalFact))}`,
        });
        turns.push({
          speaker: 'Deniz',
          text: `Bu kritik ayrımı şimdi video sonundaki eşleştirme kartları ve mini testte uygulayarak pekiştirelim.`,
        });
      }

      const { sentences, speakers } = turnsToDialogueArrays(turns);
      const qNodes: DiagramNode[] = [q0, q1, q2, examPool[3]]
        .filter((t, i, arr): t is KeyTerm => Boolean(t) && arr.findIndex(x => x?.term === t?.term) === i)
        .slice(0, 4)
        .map((t, i) => ({
          label: shortLabel(t.term, 5, 42),
          subtext: t.definition,
          badge: `Olası Soru ${i + 1}`,
          value: deterministicValue(t.term, i),
        }));

      extraScenes.push({
        slot: 'exam',
        scene: finalizeSceneObject({
          id: 'scene-exam-questions',
          index: 0,
          title: 'Hocanın Sorabileceği Sorular',
          sentences,
          speakers,
          keyTakeaways: qNodes.map(formatNodeTakeaway),
          keyTerms: [q0, q1, q2].filter((t, i, arr) => arr.findIndex(x => x.term === t.term) === i),
          examTip: criticalFact || `${q0.term} tanımı ve ${q1.term} ile farkı sınavda en sık sorulan noktadır.`,
          visualCue: 'Sınavda çıkabilecek soru kalıpları ve doğru cevap anahtarları',
          diagram: {
            type: 'table',
            visualTheme,
            title: 'Hocanın Sorabileceği Sorular',
            rootBadge,
            nodes: qNodes,
            metric: criticalFact || q0.definition,
          },
        }),
      });
    }
  }

  // 7) KAPANIŞ: Akademik Sentez, Çeldirici Analizi ve Sınav Stratejisi ('comparison')
  if (totalSecWithExtras() < MIN_LESSON_DURATION_SEC || !hasTypeAnywhere('comparison')) {
    const fNodes = pickDistinctNodes(5, 4, ['Temel İlke', 'Kritik Ayrım', 'Çeldirici Tuzağı', 'Bütünsel Sentez']);
    const fact0 = allFacts[0] || fNodes[0]?.subtext || title;
    const fact1 = allFacts[1] || fNodes[1]?.subtext || outline || title;
    const fact2 = allFacts[2] || fNodes[2]?.subtext || fNodes[0]?.subtext || title;

    const { sentences, speakers } = turnsToDialogueArrays([
      {
        speaker: 'Deniz',
        text: `Dersimizin kapanış bölümünde, ${title} başlığında yüksek düzeyli sınavlarda çeldirici olarak kurulan ince ayrımları ve anahtar ilkeleri bir araya getirelim.`,
      },
      {
        speaker: 'Barış',
        text: `Benim sentez listemin en başında şu ilke yer alıyor Deniz hocam: ${ensureSentenceEnd(lowerFirstIfNotProper(fact0))} Bununla birlikte ikinci temel dayanak olarak da ${ensureSentenceEnd(lowerFirstIfNotProper(fact1))}`,
      },
      {
        speaker: 'Deniz',
        text: `Bu özeti sınav açısından şöyle test edebiliriz Barış: neden ile sonucu ters yüz eden bir öncül verilseydi, ${ensureSentenceEnd(lowerFirstIfNotProper(fact2))} ifadesinin hangi kısmı değişirdi?`,
      },
      {
        speaker: 'Barış',
        text: `Görsel mimariden karşılaştırma tablosuna, döngüsel mekanizmadan analitik grafiğe ve vaka simülasyonuna kadar çok zengin bir ders oldu. Şimdi ders sonundaki eşleştirme ve sınav sorularıyla öğrendiklerinizi hemen pekiştirin; hepinize başarılar diliyoruz!`,
      },
    ]);

    extraScenes.push({
      slot: 'closing',
      scene: finalizeSceneObject({
        id: 'scene-scholarly-synthesis',
        index: 0,
        title: 'Akademik Sentez, Çeldirici Analizi ve Sınav Stratejisi',
        sentences,
        speakers,
        keyTakeaways: allFacts.length >= 3 ? allFacts.slice(0, 4) : fNodes.map(formatNodeTakeaway),
        keyTerms: allTerms.slice(0, 4),
        examTip: fact0,
        visualCue: 'Kritik ayrımları ve sınav sentezini gösteren ikili karşılaştırma matrisi',
        diagram: {
          type: 'comparison',
          visualTheme,
          title: 'Kritik Ayrımlar ve Akademik Sentez',
          rootBadge,
          nodes: fNodes,
          metric: fact0,
        },
      }),
    });
  }

  // Pedagojik akış: Görsel Açılış -> Çekirdek Bölümler (aralara Tablo & Şekiller serpiştirilmiş) -> Grafik -> Senaryo -> Sentez
  const ordered: StudioScene[] = [];
  extraScenes.filter(e => e.slot === 'opening').forEach(e => ordered.push(e.scene));

  const midPoint1 = Math.max(1, Math.floor(coreScenes.length * 0.4));
  const midPoint2 = Math.max(midPoint1 + 1, Math.floor(coreScenes.length * 0.75));

  coreScenes.forEach((sc, idx) => {
    ordered.push(sc);
    if (idx + 1 === midPoint1) {
      extraScenes.filter(e => e.slot === 'mid1').forEach(e => ordered.push(e.scene));
    }
    if (idx + 1 === midPoint2) {
      extraScenes.filter(e => e.slot === 'mid2').forEach(e => ordered.push(e.scene));
    }
  });

  if (coreScenes.length < 2) {
    extraScenes.filter(e => e.slot === 'mid1' || e.slot === 'mid2').forEach(e => {
      if (!ordered.includes(e.scene)) ordered.push(e.scene);
    });
  } else if (midPoint2 > coreScenes.length) {
    extraScenes.filter(e => e.slot === 'mid2').forEach(e => {
      if (!ordered.includes(e.scene)) ordered.push(e.scene);
    });
  }

  extraScenes
    .filter(e => e.slot === 'late1' || e.slot === 'late2')
    .forEach(e => ordered.push(e.scene));
  extraScenes.filter(e => e.slot === 'exam').forEach(e => ordered.push(e.scene));
  extraScenes.filter(e => e.slot === 'closing').forEach(e => ordered.push(e.scene));

  return ordered.map((sc, i) => ({
    ...sc,
    id: `scene-${i}`,
    index: i,
  }));
}

export function buildStudioContent(
  content: any,
  fallbackTitle: string,
  courseLabel = '',
  options?: { disableCurriculumExpansion?: boolean },
): StudioContent {
  const c = content || {};
  const cleanFallback = fallbackTitle.replace(/^Video\s*(Özeti|Dersi)\s*:\s*/i, '').trim() || fallbackTitle;
  const title = cleanText(c.podcastTitle) || cleanText(c.videoTitle) || cleanFallback;
  const outline = cleanText(c.outline);
  const rawScenes: any[] = Array.isArray(c.scenes) ? c.scenes : [];

  const source =
    rawScenes.length > 0
      ? rawScenes
      : [{ speaker: 'Deniz', title, narration: outline || title, keyTakeaways: [] }];

  const usedDiagramTypes = new Set<DiagramType>();

  const baseScenes: StudioScene[] = source.map((s, idx) => {
    const leadSpeaker = normalizeSpeaker(s?.speaker, idx);
    const sceneTitle = cleanText(s?.title) || `Bölüm ${idx + 1}`;
    const rawNarration = cleanText(s?.narration) || sceneTitle;

    const takeaways: string[] = (Array.isArray(s?.keyTakeaways) ? s.keyTakeaways : [])
      .map(cleanLabel)
      .filter(Boolean)
      .slice(0, 5);
    const terms: KeyTerm[] = (Array.isArray(s?.keyTerms) ? s.keyTerms : [])
      .map((t: any) => ({
        term: cleanLabel(t?.term).replace(/…|\.{2,}/g, '').trim(),
        definition: cleanText(t?.definition).replace(/…|\.{2,}/g, '').trim(),
      }))
      .filter((t: KeyTerm) => t.term && isValidConceptTerm(t.term))
      .slice(0, 6);

    const examTip = cleanText(s?.examTip);

    const conv = buildConversationalSentences(
      s,
      leadSpeaker,
      idx,
      sceneTitle,
      rawNarration,
      takeaways,
      terms,
      examTip,
    );

    const diagram = buildDiagram(s, idx, courseLabel, sceneTitle, rawNarration, takeaways, terms);

    const diagramText = `${courseLabel} ${title} ${sceneTitle} ${rawNarration} ${terms.map(t => t.term).join(' ')}`;
    if (usedDiagramTypes.has(diagram.type) || !s?.diagramData?.diagramType) {
      diagram.type = chooseDistinctDiagramType(diagram.type, diagramText, idx, usedDiagramTypes);
    }
    usedDiagramTypes.add(diagram.type);

    const finalTakeaways =
      takeaways.length > 0
        ? takeaways
        : diagram.nodes
            .filter(n => n.subtext)
            .slice(0, 4)
            .map(formatNodeTakeaway);

    const extractedSceneTerms: KeyTerm[] = [];
    const seenLocal = new Set<string>();
    const addLocalTerm = (term: string, definition: string) => {
      const k = term.toLocaleLowerCase('tr-TR');
      if (!isValidConceptTerm(term) || !definition || definition === term || seenLocal.has(k)) return;
      seenLocal.add(k);
      extractedSceneTerms.push({ term, definition });
    };
    diagram.nodes.forEach(n => addLocalTerm(n.label, n.subtext));
    [...takeaways, ...splitSentences(rawNarration)].forEach(sent => {
      extractAllGenuineConcepts(sent).forEach(kt => addLocalTerm(kt.term, kt.definition));
    });

    const finalTerms = terms.length > 0 ? terms : extractedSceneTerms.slice(0, 5);

    return finalizeSceneObject({
      id: `scene-${idx}`,
      index: idx,
      title: sceneTitle,
      sentences: conv.sentences,
      speakers: conv.speakers,
      keyTakeaways: finalTakeaways,
      keyTerms: finalTerms,
      examTip: examTip || diagram.metric,
      visualCue: cleanText(s?.visualCue),
      diagram,
    });
  });

  const rawFacts: string[] = (Array.isArray(c.keyFacts) ? c.keyFacts : []).map(cleanLabel).filter(Boolean);
  const fallbackFacts = Array.from(
    new Set(
      baseScenes
        .flatMap(sc => [sc.examTip, ...sc.keyTakeaways.slice(0, 2)])
        .map(cleanLabel)
        .filter(Boolean),
    ),
  ).slice(0, 10);

  const mergedFacts = rawFacts.length > 0 ? rawFacts.slice(0, 10) : fallbackFacts;

  const finalScenes = options?.disableCurriculumExpansion
    ? baseScenes
    : ensureRichFiveMinuteCurriculum(baseScenes, title, outline, courseLabel, mergedFacts);

  const searches: string[] = (Array.isArray(c.suggestedSearches) ? c.suggestedSearches : [])
    .map(cleanText)
    .filter(Boolean)
    .slice(0, 6);

  const matchingPairs = buildMatchingPairs(finalScenes, c.matchingPairs);
  const examQuestions = buildExamQuestions(finalScenes, c.examQuestions);

  return {
    title,
    outline,
    scenes: finalScenes,
    keyFacts: mergedFacts,
    searches,
    totalDurationSec: finalScenes.reduce((a, s) => a + s.durationSec, 0),
    examQuestions,
    matchingPairs,
  };
}

/**
 * Tanım ve açıklama metinlerini ASLA üç noktayla (`…` / `...`) yarıda kesmeden,
 * tam ve dilbilgisel olarak bütünlüklü cümle hâlinde temizler.
 */
function completeCleanDefinition(text: string, stripLeadingTerm?: string, maxPreferredChars = 280): string {
  let t = cleanText(text).replace(/…|\.{3,}/g, '').trim();
  if (!t) return '';
  if (stripLeadingTerm) {
    const termClean = cleanLabel(stripLeadingTerm);
    const tl = t.toLocaleLowerCase('tr-TR');
    const kl = termClean.toLocaleLowerCase('tr-TR');
    if (kl && tl.startsWith(kl)) {
      const rest = t.slice(termClean.length).replace(/^\s*[:–—\-]\s*/, '');
      if (rest.length >= 14 && rest.length < t.length - termClean.length) {
        t = capitalizeTr(rest);
      }
    }
  }
  if (t.length <= maxPreferredChars) {
    return ensureSentenceEnd(t);
  }
  const sentences = splitSentences(t);
  if (sentences.length > 1) {
    let acc = sentences[0];
    if (acc.length < 30 && sentences[1]) {
      acc = `${acc} ${sentences[1]}`;
    }
    return ensureSentenceEnd(acc.replace(/…|\.{3,}/g, '').trim());
  }
  return ensureSentenceEnd(t);
}

/** Soru kökünde kavram geçiyorsa kopya vermemek için kavramı `_____` ile maskeler. */
function maskConceptInStatement(statement: string, term: string): { text: string; masked: boolean } {
  const cleanStmt = completeCleanDefinition(statement);
  const cleanT = cleanLabel(term);
  if (!cleanStmt || !cleanT) return { text: cleanStmt, masked: false };

  const lowerStmt = cleanStmt.toLocaleLowerCase('tr-TR');
  const lowerTerm = cleanT.toLocaleLowerCase('tr-TR');
  const idx = lowerStmt.indexOf(lowerTerm);
  if (idx < 0) return { text: cleanStmt, masked: false };

  let endIdx = idx + cleanT.length;
  while (endIdx < cleanStmt.length && /[A-ZÇĞİÖŞÜa-zçğıöşü']/u.test(cleanStmt[endIdx])) {
    endIdx++;
  }
  const maskedText = `${cleanStmt.slice(0, idx)}_____${cleanStmt.slice(endIdx)}`.replace(/\s+/g, ' ').trim();
  return { text: maskedText, masked: true };
}

function seededShuffle<T>(arr: T[], seed: string): T[] {
  const out = [...arr];
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  for (let i = out.length - 1; i > 0; i--) {
    h = (Math.imul(h, 1103515245) + 12345) >>> 0;
    const j = h % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function sceneIndexForText(scenes: StudioScene[], text: string): number {
  const needle = cleanText(text).toLocaleLowerCase('tr-TR');
  if (!needle) return 0;
  const byTerm = scenes.findIndex(s =>
    s.keyTerms.some(t => t.term.toLocaleLowerCase('tr-TR') === needle),
  );
  if (byTerm >= 0) return byTerm;
  const probe = needle.slice(0, 22);
  const byNarration = scenes.findIndex(s => s.narration.toLocaleLowerCase('tr-TR').includes(probe));
  return byNarration >= 0 ? byNarration : 0;
}

/** Tüm dersteki benzersiz, gerçek ve eksiksiz kavram-tanım çiftlerini toplar. */
function collectStudyTerms(scenes: StudioScene[]): Array<KeyTerm & { sceneIndex: number }> {
  const out: Array<KeyTerm & { sceneIndex: number }> = [];
  const seenTerm = new Set<string>();
  const seenDef = new Set<string>();
  const push = (term: string, definition: string, sceneIndex: number) => {
    const t = cleanLabel(term).replace(/…|\.{2,}/g, '').trim();
    const d = completeCleanDefinition(definition, t);
    if (!t || !d || d.length < 14) return;
    if (!isValidConceptTerm(t)) return;
    const tk = t.toLocaleLowerCase('tr-TR');
    const dk = textSignature(d);
    if (seenTerm.has(tk) || seenDef.has(dk)) return;
    if (d.toLocaleLowerCase('tr-TR') === tk) return;
    seenTerm.add(tk);
    seenDef.add(dk);
    out.push({ term: t, definition: d, sceneIndex });
  };
  scenes.forEach((s, i) => s.keyTerms.forEach(kt => push(kt.term, kt.definition, i)));
  scenes.forEach((s, i) => s.diagram.nodes.forEach(n => push(n.label, n.subtext, i)));
  scenes.forEach((s, i) => {
    [...s.keyTakeaways, ...s.sentences].forEach(sent => {
      extractAllGenuineConcepts(sent).forEach(kt => push(kt.term, kt.definition, i));
    });
  });
  return out;
}

export function buildMatchingPairs(scenes: StudioScene[], raw?: unknown): MatchPair[] {
  const hasTruncation = (s: string) => s.includes('…') || /\.\.\./.test(s);
  const isUsableDefinition = (definition: string) => {
    const d = definition.toLocaleLowerCase('tr-TR');
    return definition.length >= 24
      && definition.length <= 240
      && !/^(merhaba|harika|aynen|kesinlikle|tam 12|bugün|şimdi)/i.test(definition)
      && !/\b(hocam|arkadaşlar|videonun sonunda|akıllı tahtamız)\b/i.test(d);
  };
  const normalizePair = (term: string, definition: string, sceneIndex: number): MatchPair | null => {
    const cleanTerm = cleanLabel(term).replace(/…|\.{2,}/g, '').trim();
    const cleanDefinition = completeCleanDefinition(definition, cleanTerm, 220);
    if (!cleanTerm || !isValidConceptTerm(cleanTerm) || !isUsableDefinition(cleanDefinition)) return null;
    return { term: cleanTerm, definition: cleanDefinition, sceneIndex };
  };
  const dedupePairs = (items: Array<MatchPair | null>) => {
    const seenTerms = new Set<string>();
    const seenDefinitions = new Set<string>();
    return items.filter((item): item is MatchPair => {
      if (!item) return false;
      const termKey = item.term.toLocaleLowerCase('tr-TR');
      const definitionKey = textSignature(item.definition);
      if (seenTerms.has(termKey) || seenDefinitions.has(definitionKey)) return false;
      seenTerms.add(termKey);
      seenDefinitions.add(definitionKey);
      return true;
    });
  };
  const fromModel: MatchPair[] = (Array.isArray(raw) ? raw : [])
    .map((p: any) => {
      const term = cleanLabel(p?.term ?? p?.left);
      const rawDef = cleanText(p?.definition ?? p?.right ?? '');
      if (hasTruncation(term) || hasTruncation(rawDef)) {
        return { term: '', definition: '', sceneIndex: 0 };
      }
      return normalizePair(term, rawDef, 0);
    })
    .filter(Boolean) as MatchPair[];

  if (fromModel.length >= 3) {
    return dedupePairs(fromModel.slice(0, 8).map(p => ({ ...p, sceneIndex: sceneIndexForText(scenes, p.term) }))).slice(0, 6);
  }

  const curated = scenes.flatMap(scene => [
    ...scene.keyTerms.map(term => normalizePair(term.term, term.definition, scene.index)),
    ...scene.diagram.nodes.map(node => normalizePair(node.label, node.subtext, scene.index)),
  ]);
  return dedupePairs(curated).slice(0, 6);
}

export function buildExamQuestions(scenes: StudioScene[], raw?: unknown): ExamQuestion[] {
  const hasTruncation = (s: string) => s.includes('…') || /\.\.\./.test(s);
  const fromModel: ExamQuestion[] = (Array.isArray(raw) ? raw : [])
    .map((q: any) => {
      const rawQuestion = cleanText(q?.question);
      const options: string[] = (Array.isArray(q?.options) ? q.options : []).map(cleanText).filter(Boolean);
      const correctIndex = Number.isInteger(q?.correctIndex) ? q.correctIndex : -1;
      const explanation = cleanText(q?.explanation).replace(/…|\.{3,}/g, '').trim();
      if (hasTruncation(rawQuestion) || options.some(hasTruncation)) {
        return { question: '', options: [], correctIndex: -1, explanation: '', sceneIndex: 0 };
      }
      return {
        question: rawQuestion,
        options,
        correctIndex,
        explanation: explanation || `Doğru yanıt: ${options[correctIndex] || ''}`,
        sceneIndex: 0,
      };
    })
    .filter(
      q =>
        q.question &&
        q.options.length >= 3 &&
        new Set(q.options.map(o => o.toLocaleLowerCase('tr-TR'))).size === q.options.length &&
        q.correctIndex >= 0 &&
        q.correctIndex < q.options.length,
    );

  if (fromModel.length >= 3) {
    return fromModel.slice(0, 8).map(q => ({ ...q, sceneIndex: sceneIndexForText(scenes, q.question) }));
  }

  const pool = collectStudyTerms(scenes);
  if (pool.length < 2) return [];

  const templatesDef = [
    (t: string) => `Hoca sınavda "${t}" kavramını sorarsa en doğru ve eksiksiz açıklama aşağıdakilerden hangisidir?`,
    (t: string) => `"${t}" kavramının ders kapsamındaki işlevi ve tanımı aşağıdakilerden hangisinde doğru verilmiştir?`,
    (t: string) => `Aşağıdaki ifadelerden hangisi "${t}" kavramını doğru biçimde açıklar?`,
  ];

  const questions: ExamQuestion[] = [];
  const optionCount = Math.min(4, pool.length);

  pool.slice(0, 8).forEach((item, idx) => {
    const distractors = seededShuffle(
      pool.filter(p => p.term.toLocaleLowerCase('tr-TR') !== item.term.toLocaleLowerCase('tr-TR')),
      `${item.term}-${idx}`,
    ).slice(0, optionCount - 1);

    if (distractors.length < optionCount - 1) return;

    // Çift indekslerde tanım soran, tek indekslerde kavramı bulduran tam cümleli soru üret
    if (idx % 2 === 0 || optionCount < 3) {
      const targetDef = completeCleanDefinition(item.definition, item.term);
      const optionTexts = [
        targetDef,
        ...distractors.map(p => completeCleanDefinition(p.definition, p.term)),
      ];
      if (new Set(optionTexts.map(o => o.toLocaleLowerCase('tr-TR'))).size < optionTexts.length) return;
      const options = seededShuffle(optionTexts, `opt-${item.term}`);
      questions.push({
        question: templatesDef[idx % templatesDef.length](item.term),
        options,
        correctIndex: options.indexOf(targetDef),
        explanation: `${item.term}: ${completeCleanDefinition(item.definition, item.term, 360)}`,
        sceneIndex: item.sceneIndex,
      });
    } else {
      const { text: stmtText, masked } = maskConceptInStatement(item.definition, item.term);
      const options = seededShuffle([item.term, ...distractors.map(p => p.term)], `term-${item.term}`);
      const questionStem = masked
        ? `"${stmtText}" ifadesinde boş bırakılan yere aşağıdaki kavramlardan hangisi gelmelidir?`
        : `"${stmtText}" açıklaması aşağıdaki kavramlardan hangisini tanımlar?`;
      questions.push({
        question: questionStem,
        options,
        correctIndex: options.indexOf(item.term),
        explanation: `Doğru cevap "${item.term}" kavramıdır. ${completeCleanDefinition(item.definition, undefined, 360)}`,
        sceneIndex: item.sceneIndex,
      });
    }
  });

  return questions.filter(q => q.correctIndex >= 0).slice(0, 6);
}

/** Zaman (saniye) bilgisini sahne içi cümle, konuşmacı ve karakter konumuna çevirir. */
export function positionFromElapsed(scene: StudioScene, elapsed: number) {
  const ratio = Math.max(0, Math.min(1, elapsed / Math.max(0.1, scene.durationSec)));
  const pos = ratio * scene.totalChars;
  let sentenceIndex = 0;
  for (let i = 0; i < scene.sentenceOffsets.length; i++) {
    if (pos >= scene.sentenceOffsets[i]) sentenceIndex = i;
  }
  const charInSentence = Math.max(
    0,
    Math.min(
      scene.sentences[sentenceIndex]?.length ?? 0,
      pos - scene.sentenceOffsets[sentenceIndex],
    ),
  );
  const activeSpeaker: Speaker =
    scene.sentenceSpeakers?.[sentenceIndex] || scene.speaker;
  return { sentenceIndex, charInSentence, progress: ratio, activeSpeaker };
}

export function formatTime(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;
}
