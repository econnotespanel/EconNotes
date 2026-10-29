// Video dersi sahne modeli: Hem yeni çok-modlu şemayı hem de kayıtlı eski materyalleri
// %100 ders notuna sadık, en az 5+ dakikalık, karşılıklı diyaloglu (Dr. Deniz & Barış) ve
// zengin görsel türlere (Görseller, Şekiller, Tablolar, Grafikler, Senaryolar) sahip sahnelere dönüştürür.

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
  /** Her cümlenin kendi konuşmacısı — sahne içinde gerçek karşılıklı diyalog sağlar */
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
const SENTENCE_PAUSE_SEC = 0.62;
const SPEAKER_SWITCH_PAUSE_SEC = 0.45;
export const MIN_LESSON_DURATION_SEC = 312; // En az 5 dakika 12 saniye garanti

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

function ensureSentenceEnd(text: string): string {
  const t = cleanText(text);
  if (!t) return '';
  return /[.!?…]$/.test(t) ? t : `${t}.`;
}

/**
 * Bir metinden anlamlı, yarım kalmamış kısa başlık üretir (ör. "Ermeni ve Süryani gibi" gibi
 * bağlaç/edat ile biten kırık başlıkları engeller).
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
    /([A-ZÇĞİÖŞÜa-zçğıöşü0-9']+\s+(?:[A-ZÇĞİÖŞÜa-zçğıöşü0-9']+\s+)?(?:sistemi|rejimi|maliyesi|politikası|düzeni|yapısı|kurumu|vakıfları|ticareti|fetihleri|istilası|savaşı|dönemi|reformu|modeli|yasası|teorisi|dengesi|kanunu|analizi))/i,
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
    .replace(/\b(\d+)\.\s+(?=yüzyıl|yy|asır|bölüm|hafta|madde|sınıf|dönem|adım)/gi, '$1__DOT__ ')
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
    if (s.length <= 200) {
      result.push(s);
      continue;
    }
    const chunks = s.split(/;\s+|,\s+(?=ancak|fakat|çünkü|böylece|dolayısıyla|özellikle|buna karşılık)/i);
    if (chunks.length > 1) {
      chunks.forEach(c => {
        if (c.trim()) result.push(c.trim());
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

const DEFAULT_BADGES = ['Temel Unsur', 'Kritik İşleyiş', 'Yapısal Etki', 'Sınav Odağı', 'Sonuç'];

function deterministicValue(seedText: string, idx: number): number {
  let hash = 0;
  for (let i = 0; i < seedText.length; i++) {
    hash = (hash * 31 + seedText.charCodeAt(i)) | 0;
  }
  const base = [88, 74, 92, 66, 81][idx % 5];
  const jitter = Math.abs(hash % 11) - 5;
  return Math.max(38, Math.min(96, base + jitter));
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
  const rootBadge = cleanText(courseLabel) || 'STÜDYO ANALİZİ';
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

  if (nodes.length < 3) {
    takeaways.forEach((tk, i) => {
      const ex = extractNodeFromSentence(tk, i);
      nodes.push({
        ...ex,
        badge: DEFAULT_BADGES[nodes.length % DEFAULT_BADGES.length],
        value: deterministicValue(ex.label, nodes.length),
      });
    });
  }

  if (nodes.length < 3) {
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

/**
 * Ham sahneyi çoklu konuşmacı turlarına (Deniz <-> Barış) dönüştürür.
 * Tek konuşmacılı eski sahnelere, tamamen sahnenin kendi kavram/ipucu verisine dayanan doğal diyalog ekler.
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
      const parts = splitSentences(turn.text);
      parts.forEach(p => {
        sentences.push(p);
        speakers.push(turn.speaker);
      });
    });
    return {
      sentences,
      speakers,
      fullNarration: sentences.join(' '),
    };
  }

  // Tek paragraflık eski materyal anlatımını doğal karşılıklı stüdyo sohbetine dönüştür
  const baseSentences = splitSentences(narration);
  const sentences: string[] = [];
  const speakers: Speaker[] = [];
  const coHost: Speaker = leadSpeaker === 'Deniz' ? 'Barış' : 'Deniz';

  baseSentences.forEach(s => {
    sentences.push(s);
    speakers.push(leadSpeaker);
  });

  // Sahnenin kendi terim ve sınav ipuçlarından doğal karşılıklı paslaşma üret (%100 nota sadık)
  const lowerAll = narration.toLocaleLowerCase('tr-TR');
  const unusedTerm = terms.find(
    kt => kt.term && kt.definition && !lowerAll.includes(kt.definition.slice(0, 18).toLocaleLowerCase('tr-TR')),
  );
  const unusedTakeaway = takeaways.find(
    tk => tk && !lowerAll.includes(tk.slice(0, 22).toLocaleLowerCase('tr-TR')),
  );

  if (unusedTerm) {
    if (coHost === 'Barış') {
      sentences.push(`Peki Deniz, bu noktada ${unusedTerm.term} kavramını tam olarak nasıl çerçeveliyoruz?`);
      speakers.push('Barış');
      sentences.push(`Çok yerinde bir soru Barış; ${ensureSentenceEnd(unusedTerm.definition)}`);
      speakers.push('Deniz');
    } else {
      sentences.push(`Barış, burada özellikle ${unusedTerm.term} boyutunu da netleştirelim.`);
      speakers.push('Deniz');
      sentences.push(`Kesinlikle; ${ensureSentenceEnd(unusedTerm.definition)}`);
      speakers.push('Barış');
    }
  } else if (unusedTakeaway) {
    if (coHost === 'Barış') {
      sentences.push(`Buradan çıkardığımız temel sonuç şu diyebilir miyiz: ${ensureSentenceEnd(unusedTakeaway)}`);
      speakers.push('Barış');
      sentences.push(`Tam olarak öyle Barış, ${sceneTitle} başlığının kilit halkası bu noktada düğümleniyor.`);
      speakers.push('Deniz');
    } else {
      sentences.push(`Özetle şu noktayı mutlaka not edelim: ${ensureSentenceEnd(unusedTakeaway)}`);
      speakers.push('Deniz');
    }
  }

  if (examTip && !lowerAll.includes(examTip.slice(0, 20).toLocaleLowerCase('tr-TR')) && sceneIdx % 2 === 0) {
    const questioner: Speaker = speakers[speakers.length - 1] === 'Deniz' ? 'Barış' : 'Deniz';
    if (questioner === 'Barış') {
      sentences.push(`Sınav perspektifinden bakarsak öğrencilerin en çok dikkat etmesi gereken detay hangisi?`);
      speakers.push('Barış');
      sentences.push(`Özellikle şuna dikkat edelim: ${ensureSentenceEnd(examTip)}`);
      speakers.push('Deniz');
    } else {
      sentences.push(`Sınavda karşımıza çıkabilecek kritik noktayı da vurgulayalım: ${ensureSentenceEnd(examTip)}`);
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

/**
 * Ders süresinin EN AZ 5+ dakika (>= 312 sn) olmasını ve akıllı tahtada
 * Görseller ('visual'), Şekiller ('shapes'), Tablolar ('table'), Grafikler ('chart') ve
 * Senaryolar ('scenario') sahnelerinin eksiksiz yer almasını garanti eder.
 * Yalnızca materyalin kendi kavram, çıkarım ve hap bilgilerini kullanır; konu dışı veri üretmez.
 */
function ensureRichFiveMinuteCurriculum(
  initialScenes: StudioScene[],
  title: string,
  outline: string,
  courseLabel: string,
  keyFacts: string[],
): StudioScene[] {
  const scenes = [...initialScenes];
  const rootBadge = cleanText(courseLabel) || 'STÜDYO DERSİ';
  const corpusText = `${courseLabel} ${title} ${outline} ${scenes.map(s => s.narration).join(' ')}`;
  const visualTheme = inferVisualTheme(corpusText);

  // Mevcut sahnelerde tekdüze eski şema tipleri varsa zengin görsel tiplerine yükselt
  const richPalette: DiagramType[] = ['visual', 'shapes', 'table', 'chart', 'scenario', 'timeline', 'comparison'];
  scenes.forEach((sc, idx) => {
    if (sc.diagram.type === 'network' || sc.diagram.type === 'structure') {
      sc.diagram.type = richPalette[idx % richPalette.length];
    }
  });

  // Havuz: tüm terimler, çıkarımlar, sınav ipuçları ve düğümler (tamamı bu ders notuna ait!)
  const allTerms: KeyTerm[] = [];
  const seenTerms = new Set<string>();
  scenes.forEach(sc => {
    sc.keyTerms.forEach(kt => {
      const k = kt.term.toLocaleLowerCase('tr-TR');
      if (kt.term && kt.definition && !seenTerms.has(k)) {
        seenTerms.add(k);
        allTerms.push(kt);
      }
    });
  });

  const allTakeaways = Array.from(
    new Set(scenes.flatMap(sc => sc.keyTakeaways).filter(Boolean)),
  );
  const allNodes = scenes.flatMap(sc => sc.diagram.nodes).filter(n => n.label && n.subtext);
  const allFacts = Array.from(
    new Set([...keyFacts, ...scenes.map(s => s.examTip).filter(Boolean), ...allTakeaways]),
  ).filter(Boolean);

  const buildPoolNodes = (offset: number, count = 4, customBadges?: string[]): DiagramNode[] => {
    const result: DiagramNode[] = [];
    const used = new Set<string>();

    const candidates: DiagramNode[] = [
      ...allTerms.map((t, i) => ({
        label: shortLabel(t.term, 4, 30),
        subtext: t.definition,
        badge: customBadges?.[i % (customBadges.length || 1)] || DEFAULT_BADGES[i % DEFAULT_BADGES.length],
        value: deterministicValue(t.term, i),
      })),
      ...allNodes,
      ...allFacts.map((f, i) => {
        const ex = extractNodeFromSentence(f, i);
        return {
          ...ex,
          badge: customBadges?.[i % (customBadges.length || 1)] || DEFAULT_BADGES[i % DEFAULT_BADGES.length],
          value: deterministicValue(ex.label, i + 2),
        };
      }),
    ];

    if (candidates.length === 0) {
      const base = extractNodeFromSentence(outline || title, 0);
      return [
        { ...base, badge: 'Temel Çerçeve', value: 88 },
        { label: shortLabel(title, 4, 30) || 'Ana Konu', subtext: outline || title, badge: 'Kapsam', value: 76 },
      ];
    }

    for (let i = 0; i < candidates.length && result.length < count; i++) {
      const pick = candidates[(offset + i) % candidates.length];
      const key = pick.label.toLocaleLowerCase('tr-TR');
      if (!used.has(key)) {
        used.add(key);
        result.push({
          ...pick,
          badge: customBadges?.[result.length % customBadges.length] || pick.badge,
        });
      }
    }
    return result;
  };

  const currentTotal = () => scenes.reduce((acc, s) => acc + s.durationSec, 0);
  const hasType = (t: DiagramType) => scenes.some(s => s.diagram.type === t);

  // 1) Görsel Çerçeve & İllüstrasyon Sahnesi ('visual') — yoksa başa/ikinci sıraya ekle
  if (!hasType('visual') || currentTotal() < MIN_LESSON_DURATION_SEC) {
    const vNodes = buildPoolNodes(0, 4, ['Ana Eksen', 'Tarihsel/Kurumsal Bağlam', 'Temel İşleyiş', 'Genel Etki']);
    const introOutline = outline || scenes[0]?.narration || title;
    const turns: DialogueTurn[] = [
      {
        speaker: 'Deniz',
        text: `EconNotes stüdyosuna hoş geldiniz! Bugün ${courseLabel ? `${courseLabel} dersimizin ` : ''}${title} konusunu tüm boyutlarıyla, görseller, tablolar, grafikler ve örnek senaryolar eşliğinde derinlemesine inceleyeceğiz. ${ensureSentenceEnd(introOutline)}`,
      },
      {
        speaker: 'Barış',
        text: `Harika bir çerçeve Deniz! Özellikle bu konuyu çalışırken sadece tanımları ezberlemek yerine, ${vNodes[0]?.label || 'temel yapı'} ile ${vNodes[1]?.label || 'kurumsal işleyiş'} arasındaki neden-sonuç bağını görmek işi çok kolaylaştırıyor, değil mi?`,
      },
      {
        speaker: 'Deniz',
        text: `Kesinlikle Barış. Akıllı tahtamızdaki görsel modelde de gördüğümüz gibi, ${ensureSentenceEnd(vNodes[0]?.subtext || introOutline)} Şimdi adım adım tüm mekanizmaları birlikte açalım.`,
      },
    ];
    const sents: string[] = [];
    const spks: Speaker[] = [];
    turns.forEach(t =>
      splitSentences(t.text).forEach(st => {
        sents.push(st);
        spks.push(t.speaker);
      }),
    );

    const introScene = finalizeSceneObject({
      id: 'scene-visual-intro',
      index: 0,
      title: `${shortLabel(title, 5, 42)}: Görsel Çerçeve ve Büyük Resim`,
      sentences: sents,
      speakers: spks,
      keyTakeaways: vNodes.slice(0, 3).map(n => `${n.label}: ${n.subtext}`),
      keyTerms: allTerms.slice(0, 3),
      examTip: allFacts[0] || `${title} konusunun bütünsel neden-sonuç ilişkisi sınavlarda temel yorum sorusu olarak gelir.`,
      visualCue: 'Konu bütünlüğünü gösteren illüstratif görsel analiz sahnesi',
      diagram: {
        type: 'visual',
        visualTheme,
        title: `${shortLabel(title, 5, 38)} — Görsel Model`,
        rootBadge,
        nodes: vNodes,
        metric: allFacts[0] || outline || title,
      },
    });

    if (!hasType('visual')) {
      scenes.unshift(introScene);
    } else if (currentTotal() < MIN_LESSON_DURATION_SEC) {
      scenes.unshift(introScene);
    }
  }

  // 2) Akademik Karşılaştırma & Kavram Tablosu ('table')
  if (!hasType('table') || currentTotal() < MIN_LESSON_DURATION_SEC) {
    const tNodes = buildPoolNodes(1, 4, ['Temel Kavram', 'Kurumsal Boyut', 'Uygulama Alanı', 'Kritik Sonuç']);
    const turns: DialogueTurn[] = [
      {
        speaker: 'Barış',
        text: `Deniz, şimdiye kadar konuştuğumuz başlıkları tek bir sistematik tabloda toplasak çok netleşecek. Özellikle ${tNodes.map(n => n.label).slice(0, 3).join(', ')} unsurlarını yan yana koyduğumuzda nasıl bir tablo ortaya çıkıyor?`,
      },
      {
        speaker: 'Deniz',
        text: `Hemen akıllı tahtadaki karşılaştırmalı tablomuza bakalım Barış. İlk satırda ${tNodes[0]?.label} yer alıyor; ${ensureSentenceEnd(tNodes[0]?.subtext || '')} Hemen altında ise ${tNodes[1]?.label} boyutu devreye giriyor; ${ensureSentenceEnd(tNodes[1]?.subtext || '')}`,
      },
      {
        speaker: 'Barış',
        text: `Tablonun alt satırları da resmi tamamlıyor: ${tNodes[2]?.label ? `${tNodes[2].label} tarafında ${ensureSentenceEnd(tNodes[2].subtext)}` : ''} Böylece tüm kavramların birbirinden farkı tek bakışta görülüyor.`,
      },
    ];
    const sents: string[] = [];
    const spks: Speaker[] = [];
    turns.forEach(t =>
      splitSentences(t.text).forEach(st => {
        sents.push(st);
        spks.push(t.speaker);
      }),
    );

    scenes.push(
      finalizeSceneObject({
        id: 'scene-table-matrix',
        index: scenes.length,
        title: 'Sistematik Kavram ve İşleyiş Tablosu',
        sentences: sents,
        speakers: spks,
        keyTakeaways: tNodes.map(n => `${n.label}: ${n.subtext}`),
        keyTerms: tNodes.slice(0, 4).map(n => ({ term: n.label, definition: n.subtext })),
        examTip: tNodes[0] ? `Tablodaki ${tNodes[0].label} ve ${tNodes[1]?.label || 'diğer unsurlar'} ayrımı eşleştirme sorularında sıkça yoklanır.` : '',
        visualCue: 'Çok sütunlu akademik karşılaştırma ve kavram tablosu',
        diagram: {
          type: 'table',
          visualTheme,
          title: 'Kavram, İşleyiş ve Akademik Önem Tablosu',
          rootBadge,
          nodes: tNodes,
          metric: tNodes[0]?.subtext || outline,
        },
      }),
    );
  }

  // 3) Geometrik Şekiller & Döngüsel Mekanizma ('shapes')
  if (!hasType('shapes') || currentTotal() < MIN_LESSON_DURATION_SEC) {
    const sNodes = buildPoolNodes(2, 4, ['1. Halka', '2. Halka', '3. Halka', 'Denge Noktası']);
    const turns: DialogueTurn[] = [
      {
        speaker: 'Deniz',
        text: `Şimdi konunun iç işleyişini geometrik döngü şemamız üzerinden inceleyelim. Dikkat ederseniz burada birbirinden kopuk maddeler değil, birbirini besleyen kesintisiz bir mekanizma var. Süreç ${sNodes[0]?.label} ile başlıyor; ${ensureSentenceEnd(sNodes[0]?.subtext || '')}`,
      },
      {
        speaker: 'Barış',
        text: `Ve bu halka doğrudan ${sNodes[1]?.label} unsurunu tetikliyor, değil mi? Yani ${ensureSentenceEnd(sNodes[1]?.subtext || '')}`,
      },
      {
        speaker: 'Deniz',
        text: `Tam isabet! Döngünün devamında ${sNodes[2]?.label ? `${sNodes[2].label} devreye girerek ` : ''}yapıyı tamamlıyor; ${ensureSentenceEnd(sNodes[2]?.subtext || sNodes[0]?.subtext || '')} Halkalardan biri zayıfladığında bütün sistem bundan etkileniyor.`,
      },
    ];
    const sents: string[] = [];
    const spks: Speaker[] = [];
    turns.forEach(t =>
      splitSentences(t.text).forEach(st => {
        sents.push(st);
        spks.push(t.speaker);
      }),
    );

    scenes.push(
      finalizeSceneObject({
        id: 'scene-shapes-cycle',
        index: scenes.length,
        title: 'Yapısal Döngü ve Mekanizma Şeması',
        sentences: sents,
        speakers: spks,
        keyTakeaways: sNodes.slice(0, 3).map(n => `${n.label}: ${n.subtext}`),
        keyTerms: sNodes.slice(0, 3).map(n => ({ term: n.label, definition: n.subtext })),
        examTip: allFacts[1] || 'Unsurlar arasındaki karşılıklı nedensellik bağı klasik ve yorum sorularının merkezindedir.',
        visualCue: 'Geometrik şekiller ve döngüsel neden-sonuç modeli',
        diagram: {
          type: 'shapes',
          visualTheme,
          title: 'Döngüsel Etkileşim ve Mekanizma Şekilleri',
          rootBadge,
          nodes: sNodes,
          metric: allFacts[1] || sNodes[0]?.subtext || '',
        },
      }),
    );
  }

  // 4) Analitik Grafik & Etki Eğrisi ('chart')
  if (!hasType('chart') || currentTotal() < MIN_LESSON_DURATION_SEC) {
    const cNodes = buildPoolNodes(3, 4, ['Yüksek Ağırlık', 'Yapısal Etki', 'Dönüştürücü Güç', 'Uzun Vadeli Sonuç']).map(
      (n, idx) => ({
        ...n,
        value: [92, 78, 85, 68][idx % 4],
      }),
    );
    const turns: DialogueTurn[] = [
      {
        speaker: 'Barış',
        text: `Peki Deniz, bu faktörlerin sistem üzerindeki göreli ağırlığını ve etki eğrisini bir grafik üzerinde okuduğumuzda hangi unsurlar öne çıkıyor?`,
      },
      {
        speaker: 'Deniz',
        text: `Tahtadaki analitik grafiğimize baktığımızda en belirleyici sütunun ${cNodes[0]?.label} olduğunu görüyoruz; çünkü ${ensureSentenceEnd(cNodes[0]?.subtext || '')} Onu hemen yakından ${cNodes[1]?.label} izliyor; ${ensureSentenceEnd(cNodes[1]?.subtext || '')}`,
      },
      {
        speaker: 'Barış',
        text: `Eğrinin devamında da ${cNodes[2]?.label || 'diğer faktör'} ve ${cNodes[3]?.label || 'uzun vadeli sonuç'} belirginleşiyor. Grafiksel olarak görmek hangi unsurun birincil belirleyici olduğunu hafızaya kazıyor.`,
      },
    ];
    const sents: string[] = [];
    const spks: Speaker[] = [];
    turns.forEach(t =>
      splitSentences(t.text).forEach(st => {
        sents.push(st);
        spks.push(t.speaker);
      }),
    );

    scenes.push(
      finalizeSceneObject({
        id: 'scene-analytics-chart',
        index: scenes.length,
        title: 'Analitik Etki ve Yapısal Ağırlık Grafiği',
        sentences: sents,
        speakers: spks,
        keyTakeaways: cNodes.slice(0, 3).map(n => `${n.label}: ${n.subtext}`),
        keyTerms: cNodes.slice(0, 3).map(n => ({ term: n.label, definition: n.subtext })),
        examTip: allFacts[2] || `${cNodes[0]?.label || 'Ana faktör'}, konunun en yüksek belirleyiciliğe sahip eksenidir.`,
        visualCue: 'Sütun ve eğri birleşimli analitik ağırlık grafiği',
        diagram: {
          type: 'chart',
          visualTheme,
          title: 'Faktör Etki Düzeyi ve Eğilim Grafiği',
          rootBadge,
          nodes: cNodes,
          metric: allFacts[2] || cNodes[0]?.subtext || '',
        },
      }),
    );
  }

  // 5) Vaka & Senaryo Simülasyonu ('scenario')
  if (!hasType('scenario') || currentTotal() < MIN_LESSON_DURATION_SEC) {
    const scNodes = buildPoolNodes(0, 4, [
      '01 · Bağlam ve Durum',
      '02 · Aktörler ve Yapı',
      '03 · İşleyen Mekanizma',
      '04 · Sonuç ve Çıkarım',
    ]);
    const turns: DialogueTurn[] = [
      {
        speaker: 'Barış',
        text: `Şimdi teoriden çıkıp somut bir vaka senaryosu kuralım Deniz! Diyelim ki bu dönemin ya da modelin tam içindeyiz; sahadaki gerçek işleyiş adım adım nasıl gerçekleşiyor?`,
      },
      {
        speaker: 'Deniz',
        text: `Harika fikir Barış, tahtadaki dört aşamalı senaryo kartlarımız üzerinden ilerleyelim. Birinci adımda başlangıç durumumuz var: ${scNodes[0]?.label} ekseninde ${ensureSentenceEnd(scNodes[0]?.subtext || '')} İkinci adımda kurumsal aktörler devreye giriyor ve ${ensureSentenceEnd(scNodes[1]?.subtext || '')}`,
      },
      {
        speaker: 'Barış',
        text: `Üçüncü adımda ise kritik mekanizma işliyor: ${ensureSentenceEnd(scNodes[2]?.subtext || '')} Ve dördüncü adımda ulaştığımız sonuç çok net: ${ensureSentenceEnd(scNodes[3]?.subtext || scNodes[0]?.subtext || '')}`,
      },
      {
        speaker: 'Deniz',
        text: `İşte konuyu bu şekilde bir vaka senaryosu olarak zihnimizde canlandırdığımızda, sınavda hangi öncüllü veya kurgusal soru gelirse gelsin kolayca çözüyoruz.`,
      },
    ];
    const sents: string[] = [];
    const spks: Speaker[] = [];
    turns.forEach(t =>
      splitSentences(t.text).forEach(st => {
        sents.push(st);
        spks.push(t.speaker);
      }),
    );

    scenes.push(
      finalizeSceneObject({
        id: 'scene-case-scenario',
        index: scenes.length,
        title: 'Uygulamalı Vaka ve Senaryo Simülasyonu',
        sentences: sents,
        speakers: spks,
        keyTakeaways: scNodes.map(n => `${n.label}: ${n.subtext}`),
        keyTerms: scNodes.slice(0, 3).map(n => ({ term: n.label, definition: n.subtext })),
        examTip: 'Öncüllü ve vaka temelli sınav sorularında bağlamdan sonuca giden bu dört adımı takip edin.',
        visualCue: 'Dört aşamalı interaktif vaka ve senaryo simülasyonu',
        diagram: {
          type: 'scenario',
          visualTheme,
          title: `${shortLabel(title, 4, 34)} — Vaka Senaryosu`,
          rootBadge,
          nodes: scNodes,
          metric: scNodes[3]?.subtext || allFacts[0] || '',
        },
      }),
    );
  }

  // 6) Eğer hâlâ 5 dakikanın (312 sn) altındaysa: Sınav Sentezi ve Kritik Karşılaştırma Final Bölümü ekle
  if (currentTotal() < MIN_LESSON_DURATION_SEC) {
    const fNodes = buildPoolNodes(2, 4, ['Kritik Ayrım', 'Temel İlke', 'Sınav Tuzağı', 'Genel Sentez']);
    const summaryFacts = allFacts.slice(0, 4);
    const turns: DialogueTurn[] = [
      {
        speaker: 'Deniz',
        text: `Dersimizin son bölümünde, ${title} başlığında sınav öncesi mutlaka cebimizde olması gereken kritik ayrımları ve hap bilgileri birlikte sentezleyelim.`,
      },
      {
        speaker: 'Barış',
        text: `Benim notlarımda ilk sırada şu var Deniz: ${ensureSentenceEnd(summaryFacts[0] || fNodes[0]?.subtext || title)} Ayrıca ikinci kritik nokta olarak da ${ensureSentenceEnd(summaryFacts[1] || fNodes[1]?.subtext || '')}`,
      },
      {
        speaker: 'Deniz',
        text: `Çok doğru Barış. Buna ek olarak öğrencilerin sıkça karıştırdığı şu detayı da netleştirelim: ${ensureSentenceEnd(summaryFacts[2] || fNodes[2]?.subtext || outline || title)} Son olarak da ${ensureSentenceEnd(summaryFacts[3] || fNodes[3]?.subtext || 'tüm bu unsurların birbiriyle bütünleşik çalıştığını unutmayalım.')}`,
      },
      {
        speaker: 'Barış',
        text: `Görseller, tablolar, grafikler ve vaka senaryomuzla konunun hiçbir karanlık noktası kalmadı. Sağ paneldeki ders notlarını indirmeyi ve kendi yer imlerinizi eklemeyi unutmayın, hepinize başarılar!`,
      },
    ];
    const sents: string[] = [];
    const spks: Speaker[] = [];
    turns.forEach(t =>
      splitSentences(t.text).forEach(st => {
        sents.push(st);
        spks.push(t.speaker);
      }),
    );

    scenes.push(
      finalizeSceneObject({
        id: 'scene-final-synthesis',
        index: scenes.length,
        title: 'Sınav Stratejisi, Kritik Ayrımlar ve Genel Sentez',
        sentences: sents,
        speakers: spks,
        keyTakeaways: summaryFacts.length >= 2 ? summaryFacts : fNodes.map(n => `${n.label}: ${n.subtext}`),
        keyTerms: allTerms.slice(0, 4),
        examTip: summaryFacts[0] || 'Kavramlar arası karşılaştırma ve neden-sonuç bütünlüğüne odaklanın.',
        visualCue: 'Karşılaştırmalı sınav sentezi ve kritik ayrımlar matrisi',
        diagram: {
          type: 'comparison',
          visualTheme,
          title: 'Sınav Öncesi Kritik Ayrımlar ve Sentez',
          rootBadge,
          nodes: fNodes,
          metric: summaryFacts[0] || outline || title,
        },
      }),
    );
  }

  // İndeksleri yeniden numaralandır
  return scenes.map((sc, i) => ({
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
