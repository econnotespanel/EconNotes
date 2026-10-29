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

function lowerFirstIfNotProper(text: string): string {
  const t = cleanText(text);
  if (!t) return '';
  // İkinci harf büyükse kısaltmadır (GSYH vb.) veya Romen rakamıdır; koru
  if (t.length > 1 && t.charAt(1) === t.charAt(1).toLocaleUpperCase('tr-TR') && /[A-ZÇĞİÖŞÜ.]/.test(t.charAt(1))) {
    return t;
  }
  return t.charAt(0).toLocaleLowerCase('tr-TR') + t.slice(1);
}

function ensureSentenceEnd(text: string): string {
  const t = cleanText(text);
  if (!t) return '';
  return /[.!?…]$/.test(t) ? t : `${t}.`;
}

function stripTrailingPeriod(text: string): string {
  return cleanText(text).replace(/[.…]+$/, '').trim();
}

/**
 * Bir metinden anlamlı, yarım kalmamış kısa başlık üretir (bağlaç/edat ile biten başlıkları engeller).
 */
export function shortLabel(text: string, maxWords = 4, maxChars = 32): string {
  const clean = cleanLabel(text).split(/[:;—–]|\s-\s/)[0].trim();
  if (!clean) return '';
  const rawWords = clean.split(' ').filter(Boolean);
  const words = rawWords.slice(0, maxWords);

  while (words.length > 1) {
    const lastLower = words[words.length - 1].replace(/[.,;!?'"()]/g, '').toLocaleLowerCase('tr-TR');
    if (STOPWORDS_TR.has(lastLower)) {
      words.pop();
    } else {
      break;
    }
  }

  let joined = words.join(' ').replace(/[,.;:]+$/, '').trim();
  if (joined.length > maxChars) {
    joined = joined.slice(0, maxChars - 1).trimEnd() + '…';
  }
  return capitalizeTr(joined);
}

/**
 * Tam bir cümleden tekrarsız { label, subtext } çifti çıkarır.
 */
export function extractNodeFromSentence(sentence: string, fallbackIndex: number): DiagramNode {
  const cleaned = cleanLabel(sentence);
  if (!cleaned) return { label: `Kavram ${fallbackIndex + 1}`, subtext: '' };

  const colonMatch = cleaned.match(/^([^:–—]{3,38})\s*[:–—]\s*(.{8,})$/);
  if (colonMatch) {
    return {
      label: shortLabel(colonMatch[1], 4, 32),
      subtext: capitalizeTr(colonMatch[2].trim()),
    };
  }

  const commaParts = cleaned.split(/,\s+/);
  if (commaParts.length >= 2 && commaParts[0].split(' ').length <= 4 && commaParts[0].length >= 5) {
    const rest = commaParts.slice(1).join(', ').trim();
    const lbl = shortLabel(commaParts[0], 4, 30);
    if (lbl && rest.length >= 12) {
      return { label: lbl, subtext: capitalizeTr(rest) };
    }
  }

  const domainPhrase = cleaned.match(
    /([A-ZÇĞİÖŞÜa-zçğıöşü0-9']+\s+(?:[A-ZÇĞİÖŞÜa-zçğıöşü0-9']+\s+)?(?:sistemi|rejimi|maliyesi|politikası|düzeni|yapısı|kurumu|vakıfları|ticareti|fetihleri|istilası|savaşı|dönemi|reformu|modeli|yasası|teorisi|dengesi|kanunu|analizi|mekanizması|doktrini|yaklaşımı))/i,
  );
  if (domainPhrase?.[1]) {
    return {
      label: shortLabel(domainPhrase[1], 4, 32),
      subtext: cleaned,
    };
  }

  const contentWords = cleaned
    .replace(/[.,;!?()"]/g, '')
    .split(' ')
    .filter(w => w.length > 2 && !STOPWORDS_TR.has(w.toLocaleLowerCase('tr-TR')));
  const derivedLabel = shortLabel(contentWords.slice(0, 3).join(' '), 3, 28) || `Temel Nokta ${fallbackIndex + 1}`;
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

function normalizeSpeaker(raw: unknown, idx: number): Speaker {
  const s = cleanText(raw).toLocaleLowerCase('tr-TR');
  if (s.includes('bar')) return 'Barış';
  if (s.includes('den')) return 'Deniz';
  return idx % 2 === 0 ? 'Deniz' : 'Barış';
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
  if (/senaryo|örnek olay|vaka|uygulama|düşünelim|somut örnek/.test(t)) return 'scenario';
  if (/tablo|sınıflandır|türleri|unsurları|kategor|matris/.test(t) && sceneIdx % 3 === 1) return 'table';
  if (/oran|yüzde|artış|düşüş|eğilim|grafik|denge|büyüme|etki düzeyi|dağılım/.test(t)) return 'chart';
  if (/karşılaştır|kıyas|fark|karşılık|oysa|aksine/.test(t)) return 'comparison';
  if (/\b(1[0-9]{3}|20[0-9]{2})\b/.test(t) || /kronoloji|yüzyıl|dönem|aşama|süreç/.test(t)) return 'timeline';

  const richCycle: DiagramType[] = ['visual', 'shapes', 'table', 'chart', 'scenario', 'timeline', 'comparison'];
  return richCycle[sceneIdx % richCycle.length];
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
      const lastSpk = speakers[speakers.length - 1] || 'Deniz';
      const askSpk: Speaker = lastSpk === 'Deniz' ? 'Barış' : 'Deniz';
      if (askSpk === 'Barış') {
        sentences.push(`Bu analizde ${extraTerm.term} kavramının özgül yerini de netleştirebilir miyiz Deniz?`);
        speakers.push('Barış');
        sentences.push(`Elbette Barış; ${ensureSentenceEnd(lowerFirstIfNotProper(extraTerm.definition))}`);
        speakers.push('Deniz');
      } else {
        sentences.push(`Barış, tam bu bağlamda ${extraTerm.term} kavramının işlevini de parantez açmadan vurgulayalım.`);
        speakers.push('Deniz');
        sentences.push(`Doğru noktaya değindin Deniz; ${ensureSentenceEnd(lowerFirstIfNotProper(extraTerm.definition))}`);
        speakers.push('Barış');
      }
    }

    return {
      sentences,
      speakers,
      fullNarration: sentences.join(' '),
    };
  }

  // Tek paragraflık materyali entelektüel karşılıklı üniversite semineri diyaloğuna yükselt
  const baseSentences = splitSentences(narration);
  const sentences: string[] = [];
  const speakers: Speaker[] = [];
  const coHost: Speaker = leadSpeaker === 'Deniz' ? 'Barış' : 'Deniz';

  // Uzun monologları ortadan bölüp yardımcı sunucunun analitik köprü kurmasını sağla
  if (baseSentences.length >= 4) {
    const mid = Math.ceil(baseSentences.length / 2);
    baseSentences.slice(0, mid).forEach(s => {
      sentences.push(s);
      speakers.push(leadSpeaker);
    });
    const bridgePrompts = [
      `Burada kurulan yapısal denge gerçekten dikkat çekici; peki mekanizmanın devamında bu durum sahaya nasıl yansıyor?`,
      `Çok kritik bir tespit; peki bu çerçevenin toplumsal ve kurumsal sonuçları nasıl şekilleniyor?`,
      `İşte konunun düğüm noktası tam burası; sürecin ikinci boyutunda hangi dinamik devreye giriyor?`,
    ];
    sentences.push(bridgePrompts[sceneIdx % bridgePrompts.length]);
    speakers.push(coHost);
    baseSentences.slice(mid).forEach(s => {
      sentences.push(s);
      speakers.push(leadSpeaker);
    });
  } else {
    baseSentences.forEach(s => {
      sentences.push(s);
      speakers.push(leadSpeaker);
    });
  }

  const coveredSigs = new Set(sentences.map(textSignature));
  const lowerAll = sentences.join(' ').toLocaleLowerCase('tr-TR');

  // Henüz açılmamış terimleri (en fazla 2 adet) sahneye özgü akademik soru-cevap kalıplarıyla işle
  const unusedTerms = terms.filter(
    kt =>
      kt.term &&
      kt.definition &&
      !coveredSigs.has(textSignature(kt.definition)) &&
      !lowerAll.includes(kt.definition.slice(0, 20).toLocaleLowerCase('tr-TR')),
  );

  const termQuestionTemplates = [
    (term: string) => `Peki Deniz, literatürde ve sınavlarda sıkça karşılaştığımız ${term} kavramını bu yapı içinde nasıl tanımlamalıyız?`,
    (term: string) => `Deniz, tam burada kavramsal netlik açısından soruyorum: ${term} tam olarak hangi mekanizmayı ifade ediyor?`,
    (term: string) => `Bu noktada ${term} teriminin altını çizmekte fayda var; bu kavramın ayırt edici niteliği nedir?`,
  ];
  const termAnswerOpeners = [
    'Çok yerinde bir kavramsal soru Barış;',
    'Akademik çerçevede bunu şöyle somutlaştıralım Barış:',
    'Hemen netleştirelim;',
  ];

  unusedTerms.slice(0, 2).forEach((kt, tIdx) => {
    const lastSpk = speakers[speakers.length - 1] || leadSpeaker;
    const questioner: Speaker = lastSpk === 'Deniz' ? 'Barış' : 'Deniz';
    const responder: Speaker = questioner === 'Deniz' ? 'Barış' : 'Deniz';

    if (questioner === 'Barış') {
      sentences.push(termQuestionTemplates[(sceneIdx + tIdx) % termQuestionTemplates.length](kt.term));
      speakers.push('Barış');
      sentences.push(
        `${termAnswerOpeners[(sceneIdx + tIdx) % termAnswerOpeners.length]} ${ensureSentenceEnd(lowerFirstIfNotProper(kt.definition))}`,
      );
      speakers.push('Deniz');
    } else {
      sentences.push(`Barış, ${sceneTitle} başlığında ${kt.term} boyutunu da analize dahil edelim.`);
      speakers.push('Deniz');
      sentences.push(`Memnuniyetle Deniz; ${ensureSentenceEnd(lowerFirstIfNotProper(kt.definition))}`);
      speakers.push(responder);
    }
    coveredSigs.add(textSignature(kt.definition));
  });

  // Henüz konuşulmamış önemli çıkarımları analitik derinlikle ekle
  const unusedTakeaways = takeaways.filter(
    tk =>
      tk &&
      !coveredSigs.has(textSignature(tk)) &&
      !lowerAll.includes(tk.slice(0, 22).toLocaleLowerCase('tr-TR')),
  );

  if (unusedTakeaways.length > 0) {
    const tk = unusedTakeaways[0];
    const lastSpk = speakers[speakers.length - 1] || leadSpeaker;
    if (lastSpk === 'Deniz') {
      sentences.push(`O hâlde buradaki analitik çıkarımı şöyle özetleyebiliriz: ${ensureSentenceEnd(lowerFirstIfNotProper(tk))}`);
      speakers.push('Barış');
      if (unusedTakeaways[1]) {
        sentences.push(`Kesinlikle Barış; üstelik buna paralel olarak ${ensureSentenceEnd(lowerFirstIfNotProper(unusedTakeaways[1]))}`);
        speakers.push('Deniz');
      } else {
        sentences.push(`Tam isabet Barış; ${sceneTitle} tartışmasının kuramsal omurgasını bu neden-sonuç bağı oluşturuyor.`);
        speakers.push('Deniz');
      }
    } else {
      sentences.push(`Bu tartışmadan çıkardığımız kuramsal ilkeyi de vurgulayalım: ${ensureSentenceEnd(lowerFirstIfNotProper(tk))}`);
      speakers.push('Deniz');
    }
  }

  // Sınav perspektifi ve kavramsal ayrım uyarısı
  if (
    examTip &&
    !coveredSigs.has(textSignature(examTip)) &&
    !lowerAll.includes(examTip.slice(0, 20).toLocaleLowerCase('tr-TR'))
  ) {
    const lastSpk = speakers[speakers.length - 1] || leadSpeaker;
    if (lastSpk === 'Deniz') {
      sentences.push(`Sınavda bu başlık karşımıza analitik bir soru olarak geldiğinde hangi ayrım belirleyici olur?`);
      speakers.push('Barış');
      sentences.push(`Özellikle şu kritik noktayı gözden kaçırmayalım: ${ensureSentenceEnd(lowerFirstIfNotProper(examTip))}`);
      speakers.push('Deniz');
    } else {
      sentences.push(`Akademik sınavlarda belirleyici olan şu ince ayrımı da not düşelim: ${ensureSentenceEnd(lowerFirstIfNotProper(examTip))}`);
      speakers.push('Deniz');
    }
  }

  if (sentences.length === 0) {
    sentences.push(ensureSentenceEnd(sceneTitle));
    speakers.push(leadSpeaker);
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
  const lead = speakers[0] || (index % 2 === 0 ? 'Deniz' : 'Barış');

  return {
    id,
    index,
    speaker: lead,
    speakerRole: lead === 'Deniz' ? 'Akademik Anlatıcı' : 'Araştırmacı & Soru Soran',
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
  const richPalette: DiagramType[] = ['visual', 'shapes', 'table', 'chart', 'scenario', 'timeline', 'comparison'];
  coreScenes.forEach((sc, idx) => {
    if (sc.diagram.type === 'network' || sc.diagram.type === 'structure') {
      sc.diagram.type = richPalette[idx % richPalette.length];
    }
  });

  // Materyalin tüm bilgi evrenini tekrarsız şekilde derle
  const allTerms: KeyTerm[] = [];
  const seenTerms = new Set<string>();
  coreScenes.forEach(sc => {
    sc.keyTerms.forEach(kt => {
      const k = kt.term.toLocaleLowerCase('tr-TR');
      if (kt.term && kt.definition && !seenTerms.has(k)) {
        seenTerms.add(k);
        allTerms.push(kt);
      }
    });
  });

  const allTakeaways = Array.from(new Set(coreScenes.flatMap(sc => sc.keyTakeaways).filter(Boolean)));
  const allExamTips = Array.from(new Set(coreScenes.map(sc => sc.examTip).filter(Boolean)));
  const allFacts = Array.from(new Set([...keyFacts, ...allExamTips, ...allTakeaways])).filter(Boolean);
  const allNodes = coreScenes.flatMap(sc => sc.diagram.nodes).filter(n => n.label && n.subtext);
  const chapterTitles = coreScenes.map(s => shortLabel(s.title, 5, 38)).filter(Boolean);

  // Farklı sahnelerin farklı düğüm alt kümelerini kullanması için ayrık havuz seçici
  const pickDistinctNodes = (seedOffset: number, count = 4, badges?: string[]): DiagramNode[] => {
    const candidates: DiagramNode[] = [];
    const seen = new Set<string>();

    const pushCandidate = (n: DiagramNode) => {
      const k = n.label.toLocaleLowerCase('tr-TR');
      if (!n.label || !n.subtext || seen.has(k)) return;
      seen.add(k);
      candidates.push(n);
    };

    allTerms.forEach((t, i) =>
      pushCandidate({
        label: shortLabel(t.term, 4, 30),
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

    if (candidates.length === 0) {
      const base = extractNodeFromSentence(outline || title, 0);
      return [
        { ...base, badge: badges?.[0] || 'Ana Eksen', value: 89 },
        {
          label: shortLabel(title, 4, 30) || 'Kuramsal Çerçeve',
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

  const extraScenes: { slot: 'opening' | 'mid1' | 'mid2' | 'late1' | 'late2' | 'closing'; scene: StudioScene }[] = [];
  const totalSecWithExtras = () =>
    coreScenes.reduce((a, s) => a + s.durationSec, 0) +
    extraScenes.reduce((a, e) => a + e.scene.durationSec, 0);
  const hasTypeAnywhere = (t: DiagramType) =>
    coreScenes.some(s => s.diagram.type === t) || extraScenes.some(e => e.scene.diagram.type === t);

  // 1) AÇILIŞ: Bütünsel Kavramsal Mimari ve Görsel Çerçeve ('visual')
  if (!hasTypeAnywhere('visual') || totalSecWithExtras() < MIN_LESSON_DURATION_SEC) {
    const vNodes = pickDistinctNodes(0, 4, ['Kurucu Tez', 'Yapısal Bağlam', 'İç İşleyiş', 'Makro Sonuç']);
    const roadmapStr =
      chapterTitles.length >= 2
        ? `${chapterTitles.slice(0, 3).join(', ')} eksenlerini`
        : `${vNodes.map(n => n.label).slice(0, 3).join(' ve ')} boyutlarını`;
    const framingText = outline
      ? ensureSentenceEnd(outline)
      : `${title} konusu, tekil tanımların ötesinde çok katmanlı bir ${domainNoun} bütünlük taşır.`;

    const { sentences, speakers } = turnsToDialogueArrays([
      {
        speaker: 'Deniz',
        text: `EconNotes akademik stüdyosuna hoş geldiniz. Bugün ${courseLabel ? `${courseLabel} kapsamında ` : ''}${title} konusunu yalnızca yüzeysel kavramlarla değil, arka planındaki ${domainNoun} dinamikler, karşılaştırmalı tablolar, analitik grafikler ve somut vaka senaryolarıyla derinlemesine inceleyeceğiz. ${framingText}`,
      },
      {
        speaker: 'Barış',
        text: `Özellikle bu konuyu çalışırken bilgileri kopuk maddeler hâlinde ezberlemek yerine, ${roadmapStr} birbirine bağlayan ana omurgayı görmek büyük fark yaratıyor. Akıllı tahtadaki görsel mimaride ilk dikkatimizi çekmesi gereken kurucu ilke nedir Deniz?`,
      },
      {
        speaker: 'Deniz',
        text: `Merkezde ${vNodes[0]?.label || title} yer alıyor Barış. Zira ${lowerFirstIfNotProper(stripTrailingPeriod(vNodes[0]?.subtext || framingText))}; bu temel kurulduğunda ${vNodes[1]?.label || 'diğer kurumsal halkalar'} da kendi işlevini kazanıyor. Şimdi bu büyük resmi bölüm bölüm analitik olarak açalım.`,
      },
    ]);

    extraScenes.push({
      slot: 'opening',
      scene: finalizeSceneObject({
        id: 'scene-visual-architecture',
        index: 0,
        title: `${shortLabel(title, 5, 40)}: Kavramsal Mimari ve Analitik Çerçeve`,
        sentences,
        speakers,
        keyTakeaways: vNodes.slice(0, 3).map(n => `${n.label}: ${n.subtext}`),
        keyTerms: allTerms.slice(0, 3),
        examTip:
          allFacts[0] ||
          `${title} başlığında unsurların tekil tanımlarından çok birbirleriyle kurduğu ${domainNoun} bütünlük sorgulanır.`,
        visualCue: 'Konunun bütünsel mimarisini sunan illüstratif görsel analiz sahnesi',
        diagram: {
          type: 'visual',
          visualTheme,
          title: `${shortLabel(title, 5, 38)} — Bütünsel Model`,
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

    const { sentences, speakers } = turnsToDialogueArrays([
      {
        speaker: 'Barış',
        text: `Deniz, konunun temel yapıtaşlarını inceledik; ancak sınavlarda ve akademik analizlerde en çok yapılan hata yakın kavramları birbirinin yerine kullanmak oluyor. Akıllı tahtadaki sistematik karşılaştırma tablosunda ${n0.label} ile ${n1.label} arasındaki sınır çizgisini nasıl okuyoruz?`,
      },
      {
        speaker: 'Deniz',
        text: `Çok kritik bir noktaya parmak bastın Barış. Tablomuzun ilk satırındaki ${n0.label}, sistemin tanımlayıcı temelini kurar ve ${ensureSentenceEnd(lowerFirstIfNotProper(n0.subtext))} Buna karşılık ikinci satırdaki ${n1.label}, bu yapının sahadaki kurumsal işleyişini üstlenir; yani ${ensureSentenceEnd(lowerFirstIfNotProper(n1.subtext))}`,
      },
      {
        speaker: 'Barış',
        text: `Tablonun alt satırlarına indiğimizde ise tamamlayıcı boyutları görüyoruz: ${n2.label} ekseninde ${lowerFirstIfNotProper(stripTrailingPeriod(n2.subtext))}${n3 && n3.label !== n2.label ? `, ${n3.label} boyutunda ise ${lowerFirstIfNotProper(stripTrailingPeriod(n3.subtext))}` : ''}. Kavramları bu dört sütunlu matriste yan yana görmek tüm muğlaklığı ortadan kaldırıyor.`,
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
        keyTakeaways: tNodes.map(n => `${n.label}: ${n.subtext}`),
        keyTerms: tNodes.slice(0, 4).map(n => ({ term: n.label, definition: n.subtext })),
        examTip: `Tablodaki ${n0.label} ve ${n1.label} kavramlarının işlev farkı, çoktan seçmeli ve klasik sınavlarda temel ayırt edici ölçüttür.`,
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

    const { sentences, speakers } = turnsToDialogueArrays([
      {
        speaker: 'Deniz',
        text: `Şimdi bu kavramların durağan tanımlarından çıkıp dinamik nedensellik mekanizmasına bakalım. Tahtadaki geometrik döngü şeması bize çok net bir ilke söylüyor: hiçbir ${domainNoun} sonuç tek başına ortaya çıkmaz. İlk halkada ${s0.label} tetikleyici işlev görür; ${ensureSentenceEnd(lowerFirstIfNotProper(s0.subtext))}`,
      },
      {
        speaker: 'Barış',
        text: `Peki bu ilk ivme sistemin diğer halkalarına nasıl aktarılıyor? Özellikle ${s1.label} aşamasında nasıl bir dönüşüm yaşanıyor?`,
      },
      {
        speaker: 'Deniz',
        text: `Tam burada aktarım mekanizması devreye giriyor Barış: ${s0.label} sağlam işlediğinde doğrudan ${s1.label} kapasitesini besliyor ve ${ensureSentenceEnd(lowerFirstIfNotProper(s1.subtext))} Ardından üçüncü halkada ${s2.label} ile sistem dengeye oturuyor; tersine halkalardan biri aşındığında ise zincirleme bir çözülme başlıyor.`,
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
        keyTakeaways: sNodes.slice(0, 3).map(n => `${n.label}: ${n.subtext}`),
        keyTerms: sNodes.slice(0, 3).map(n => ({ term: n.label, definition: n.subtext })),
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
  if (!hasTypeAnywhere('chart') || totalSecWithExtras() < MIN_LESSON_DURATION_SEC) {
    const cNodes = pickDistinctNodes(3, 4, ['Birincil Belirleyici', 'Yapısal Kaldıraç', 'İstikrar Unsuru', 'Tamamlayıcı Etki']).map(
      (n, idx) => ({
        ...n,
        value: [93, 84, 79, 69][idx % 4],
      }),
    );
    const c0 = cNodes[0];
    const c1 = cNodes[1] || cNodes[0];
    const c2 = cNodes[2] || cNodes[0];

    const { sentences, speakers } = turnsToDialogueArrays([
      {
        speaker: 'Barış',
        text: `Deniz, bir konuyu derinlemesine kavramanın bir diğer yolu da tüm faktörleri eşit ağırlıkta sanmamak ve hangisinin ana belirleyici olduğunu görmek. Tahtadaki analitik ağırlık ve eğilim grafiğimizi nasıl yorumlamalıyız?`,
      },
      {
        speaker: 'Deniz',
        text: `Grafikteki en yüksek sütun ve eğri tepe noktası açık biçimde ${c0.label} unsuruna işaret ediyor Barış. Çünkü ${lowerFirstIfNotProper(stripTrailingPeriod(c0.subtext))}; dolayısıyla sistemin yönünü tayin eden birincil kaldıraç burasıdır.`,
      },
      {
        speaker: 'Barış',
        text: `Hemen arkasından gelen ${c1.label} ve ${c2.label} sütunları da bu ana ekseni tahkim ediyor; özellikle ${lowerFirstIfNotProper(stripTrailingPeriod(c1.subtext))}. Böylece birincil neden ile destekleyici koşullar arasındaki hiyerarşi net biçimde ortaya çıkıyor.`,
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
        keyTakeaways: cNodes.slice(0, 3).map(n => `${n.label}: ${n.subtext}`),
        keyTerms: cNodes.slice(0, 3).map(n => ({ term: n.label, definition: n.subtext })),
        examTip:
          allFacts[2] ||
          `Öncüllü sorularda "temel/birincil etken" sorulduğunda ${c0.label} eksenindeki ana belirleyiciye odaklanılmalıdır.`,
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

    const { sentences, speakers } = turnsToDialogueArrays([
      {
        speaker: 'Barış',
        text: `Şimdi tüm bu kuramsal çerçeveyi somut bir vaka senaryosu üzerinde test edelim Deniz. Diyelim ki karşımızda ${title} dinamiklerinin birebir yaşandığı gerçek bir tarihsel veya uygulamalı kesit var; bu dört aşamalı senaryo sahada nasıl işliyor?`,
      },
      {
        speaker: 'Deniz',
        text: `Adım adım ilerleyelim Barış. Birinci aşamada başlangıç koşulumuz şekilleniyor: ${st0.label} çerçevesinde ${ensureSentenceEnd(lowerFirstIfNotProper(st0.subtext))} Bu zeminin üzerine ikinci aşamada kurumsal düzenleme devreye giriyor ve ${ensureSentenceEnd(lowerFirstIfNotProper(st1.subtext))}`,
      },
      {
        speaker: 'Barış',
        text: `Üçüncü aşamaya geldiğimizde ise mekanizmanın sahadaki somut karşılığını izliyoruz: ${ensureSentenceEnd(lowerFirstIfNotProper(st2.subtext))} Dördüncü ve son aşamada ise bütün bu sürecin doğal çıktısı olarak ${ensureSentenceEnd(lowerFirstIfNotProper(st3.subtext))}`,
      },
      {
        speaker: 'Deniz',
        text: `İşte konuyu bu dört adımlı vaka kurgusuyla zihnimizde canlandırdığımızda, soyut görünen her ilke somut ve unutulmaz bir nedensellik öyküsüne dönüşüyor.`,
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
        keyTakeaways: scNodes.map(n => `${n.label}: ${n.subtext}`),
        keyTerms: scNodes.slice(0, 3).map(n => ({ term: n.label, definition: n.subtext })),
        examTip:
          'Vaka ve paragraf temelli sorularda önce başlangıç koşulunu, ardından kurumsal aracı ve nihai sonucu eşleştirin.',
        visualCue: 'Dört aşamalı uygulamalı vaka analizi ve süreç simülasyonu',
        diagram: {
          type: 'scenario',
          visualTheme,
          title: `${shortLabel(title, 4, 34)} — Vaka Simülasyonu`,
          rootBadge,
          nodes: scNodes,
          metric: st3.subtext || allFacts[0] || title,
        },
      }),
    });
  }

  // 6) KAPANIŞ: Akademik Sentez, Çeldirici Analizi ve Sınav Stratejisi ('comparison')
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
        text: `Benim sentez listemin en başında şu ilke yer alıyor Deniz: ${ensureSentenceEnd(lowerFirstIfNotProper(fact0))} Bununla birlikte ikinci temel dayanak olarak da ${ensureSentenceEnd(lowerFirstIfNotProper(fact1))}`,
      },
      {
        speaker: 'Deniz',
        text: `Çok isabetli bir özet Barış. Sınav hazırlığında özellikle neden ile sonucu ters yüz eden öncüllere dikkat etmeliyiz; nitekim ${ensureSentenceEnd(lowerFirstIfNotProper(fact2))}`,
      },
      {
        speaker: 'Barış',
        text: `Görsel mimariden karşılaştırma tablosuna, döngüsel mekanizmadan analitik grafiğe ve vaka simülasyonuna kadar çok zengin bir ders oldu. Sağ paneldeki kavram sözlüğünü ve ders notlarını indirerek tekrar yapabilirsiniz; hepinize başarılar diliyoruz!`,
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
        keyTakeaways: allFacts.length >= 3 ? allFacts.slice(0, 4) : fNodes.map(n => `${n.label}: ${n.subtext}`),
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
    .filter(e => e.slot === 'late1' || e.slot === 'late2' || e.slot === 'closing')
    .forEach(e => ordered.push(e.scene));

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

  let prevType: DiagramType | null = null;

  const baseScenes: StudioScene[] = source.map((s, idx) => {
    const leadSpeaker = normalizeSpeaker(s?.speaker, idx);
    const sceneTitle = cleanText(s?.title) || `Bölüm ${idx + 1}`;
    const rawNarration = cleanText(s?.narration) || sceneTitle;

    const takeaways: string[] = (Array.isArray(s?.keyTakeaways) ? s.keyTakeaways : [])
      .map(cleanLabel)
      .filter(Boolean)
      .slice(0, 5);
    const terms: KeyTerm[] = (Array.isArray(s?.keyTerms) ? s.keyTerms : [])
      .map((t: any) => ({ term: cleanLabel(t?.term), definition: cleanText(t?.definition) }))
      .filter((t: KeyTerm) => t.term)
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

    const diagram = buildDiagram(s, idx, courseLabel, sceneTitle, conv.fullNarration, takeaways, terms);

    if (prevType && diagram.type === prevType) {
      const cycle: DiagramType[] = ['visual', 'shapes', 'table', 'chart', 'scenario', 'timeline', 'comparison'];
      const alt = cycle.find(t => t !== prevType);
      if (alt && !s?.diagramData?.diagramType) {
        diagram.type = alt;
      }
    }
    prevType = diagram.type;

    const finalTakeaways =
      takeaways.length > 0
        ? takeaways
        : diagram.nodes
            .filter(n => n.subtext)
            .slice(0, 4)
            .map(n => (n.subtext.includes(n.label) ? n.subtext : `${n.label}: ${n.subtext}`));

    const finalTerms =
      terms.length > 0
        ? terms
        : diagram.nodes
            .filter(n => n.subtext && n.subtext !== n.label)
            .slice(0, 4)
            .map(n => ({ term: n.label, definition: n.subtext }));

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

  return {
    title,
    outline,
    scenes: finalScenes,
    keyFacts: mergedFacts,
    searches,
    totalDurationSec: finalScenes.reduce((a, s) => a + s.durationSec, 0),
  };
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
