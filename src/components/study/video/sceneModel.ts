// Video dersi sahne modeli: yapay zekâ çıktısını (hem eski hem yeni şema)
// %100 ders notuna sadık, tekrarsız ve doğal konuşmaya uygun sahnelere dönüştürür.

export type DiagramType = 'network' | 'timeline' | 'structure' | 'comparison' | 'curve';
export type Speaker = 'Deniz' | 'Barış';

export interface DiagramNode {
  label: string;
  subtext: string;
}

export interface KeyTerm {
  term: string;
  definition: string;
}

export interface StudioDiagram {
  type: DiagramType;
  title: string;
  rootBadge: string;
  nodes: DiagramNode[];
  metric: string;
}

export interface StudioScene {
  id: string;
  index: number;
  speaker: Speaker;
  speakerRole: string;
  title: string;
  narration: string;
  sentences: string[];
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

/** Doğal Türkçe konuşma hızı tahmini (1x, nefes duraklamaları hariç) */
export const CHARS_PER_SEC = 13.8;
const SENTENCE_PAUSE_SEC = 0.55;

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

/**
 * Bir metinden anlamlı, yarım kalmamış kısa başlık üretir (ör. "Ermeni ve Süryani gibi" gibi
 * bağlaç/edat ile biten kırık başlıkları engeller).
 */
export function shortLabel(text: string, maxWords = 4, maxChars = 32): string {
  const clean = cleanLabel(text).split(/[:;—–]|\s-\s/)[0].trim();
  if (!clean) return '';
  const rawWords = clean.split(' ').filter(Boolean);
  let words = rawWords.slice(0, maxWords);

  // Son kelime edat/bağlaç ise ("gibi", "ile", "ve", "için", "karşılık") kırp veya bir kelime ekle
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
 * Başlık ile alt metnin aynı kelimelerle başlamasını engeller.
 */
function extractNodeFromSentence(sentence: string, fallbackIndex: number): DiagramNode {
  const cleaned = cleanLabel(sentence);
  if (!cleaned) return { label: `Kavram ${fallbackIndex + 1}`, subtext: '' };

  // 1) "Kavram: Açıklama" veya "Kavram — Açıklama" formatı varsa doğrudan ayır
  const colonMatch = cleaned.match(/^([^:–—]{3,38})\s*[:–—]\s*(.{8,})$/);
  if (colonMatch) {
    return {
      label: shortLabel(colonMatch[1], 4, 32),
      subtext: capitalizeTr(colonMatch[2].trim()),
    };
  }

  // 2) Cümle içindeki önemli akademik tamlama / kavram grubunu bul
  // Virgül öncesi özne öbeği makul uzunluktaysa başlık yap, kalanını açıklama yap
  const commaParts = cleaned.split(/,\s+/);
  if (commaParts.length >= 2 && commaParts[0].split(' ').length <= 4 && commaParts[0].length >= 5) {
    const rest = commaParts.slice(1).join(', ').trim();
    const lbl = shortLabel(commaParts[0], 4, 30);
    if (lbl && rest.length >= 12) {
      return { label: lbl, subtext: capitalizeTr(rest) };
    }
  }

  // 3) Anahtar terim kalıpları ("... sistemi", "... rejimi", "... politikası", "... maliyesi", "... dönemi", "... savaşı")
  const domainPhrase = cleaned.match(
    /([A-ZÇĞİÖŞÜa-zçğıöşü0-9']+\s+(?:[A-ZÇĞİÖŞÜa-zçğıöşü0-9']+\s+)?(?:sistemi|rejimi|maliyesi|politikası|düzeni|yapısı|kurumu|vakıfları|ticareti|fetihleri|istilası|savaşı|dönemi|reformu|modeli|yasası|teorisi|dengesi))/i
  );
  if (domainPhrase?.[1]) {
    return {
      label: shortLabel(domainPhrase[1], 4, 32),
      subtext: cleaned,
    };
  }

  // 4) Anlamlı içerik kelimelerinden özet başlık üret
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

  // Kısaltmalardaki noktaları koru (13. yüzyıl, vb., örn., Prof., Dr., yy.)
  const protectedText = normalized
    .replace(/\b(\d+)\.\s+(?=yüzyıl|yy|asır|bölüm|hafta|madde|sınıf|dönem)/gi, '$1__DOT__ ')
    .replace(/\b(vb|örn|bkz|yak|yy|dr|prof|doç|av|hz|st)\.\s+/gi, '$1__DOT__ ');

  const raw = protectedText.match(/[^.!?…]+[.!?…]+["'”’)\]]*|[^.!?…]+$/g) || [protectedText];
  const restored = raw.map(p => p.replace(/__DOT__/g, '.').trim()).filter(Boolean);

  const merged: string[] = [];
  for (const part of restored) {
    const last = merged[merged.length - 1];
    if (last && (last.length < 24 || part.length < 14)) {
      merged[merged.length - 1] = `${last} ${part}`;
    } else {
      merged.push(part);
    }
  }

  const result: string[] = [];
  for (const s of merged) {
    if (s.length <= 210) {
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

function inferDiagramType(text: string, sceneIdx: number): DiagramType {
  const t = text.toLocaleLowerCase('tr-TR');
  const years = t.match(/\b(1[0-9]{3}|20[0-9]{2})\b/g) || [];
  if ((t.includes('arz') && t.includes('talep')) || /esneklik|denge fiyat|marjinal maliyet/.test(t)) {
    return 'curve';
  }
  if (years.length >= 2 || /kronoloji|yüzyıl|dönem|süreç|aşama|geçiş|fetih/.test(t)) {
    return 'timeline';
  }
  if (/karşılaştır|kıyas|fark|karşılık|oysa|aksine|avantaj|dezavantaj/.test(t)) {
    return 'comparison';
  }
  if (/kurum|teşkilat|yapı|sistem|örgüt|hiyerarşi|idari|sacayak|unsur/.test(t)) {
    return 'structure';
  }
  // Ardışık sahnelerde görsel çeşitlilik sağla
  const cycle: DiagramType[] = ['network', 'structure', 'timeline', 'comparison'];
  return cycle[sceneIdx % cycle.length];
}

const DIAGRAM_TYPES: DiagramType[] = ['network', 'timeline', 'structure', 'comparison', 'curve'];

function sanitizeNode(n: DiagramNode, idx: number): DiagramNode {
  const rawLabel = cleanLabel(n.label);
  let sub = cleanText(n.subtext);

  // Eğer label aslında uzun bir cümlenin ilk kelimeleriyse ve subtext aynı cümleyle başlıyorsa düzelt
  if (
    sub &&
    rawLabel &&
    sub.toLocaleLowerCase('tr-TR').startsWith(rawLabel.replace(/…$/, '').toLocaleLowerCase('tr-TR'))
  ) {
    return extractNodeFromSentence(sub, idx);
  }

  return {
    label: shortLabel(rawLabel, 4, 32) || `Kavram ${idx + 1}`,
    subtext: sub,
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
  const rootBadge = cleanText(courseLabel) || 'TEMEL ÇERÇEVE';

  if (dd && Array.isArray(dd.nodes) && dd.nodes.length >= 2) {
    const nodes = dd.nodes
      .map((n: any, i: number) => sanitizeNode({ label: cleanLabel(n?.label), subtext: cleanText(n?.subtext) }, i))
      .filter((n: DiagramNode) => n.label);
    if (nodes.length >= 2) {
      const type = DIAGRAM_TYPES.includes(dd.diagramType)
        ? dd.diagramType
        : inferDiagramType(`${title} ${narration}`, sceneIdx);
      return {
        type,
        title: cleanText(dd.mainTitle) || title,
        rootBadge,
        nodes: nodes.slice(0, 5),
        metric,
      };
    }
  }

  // Yedek üretim: terimler → çıkarımlar → cümleler (tamamı ders notundan, sıfır kırık başlık)
  let nodes: DiagramNode[] = terms.map((t, i) =>
    sanitizeNode({ label: t.term, subtext: t.definition }, i),
  );

  if (nodes.length < 3) {
    takeaways.forEach((tk, i) => {
      nodes.push(extractNodeFromSentence(tk, i));
    });
  }

  if (nodes.length < 3) {
    splitSentences(narration).forEach((sentence, i) => {
      nodes.push(extractNodeFromSentence(sentence, i));
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
    title,
    rootBadge,
    nodes: nodes.slice(0, 5),
    metric,
  };
}

function computeDuration(totalChars: number, sentenceCount: number): number {
  return Math.max(6, totalChars / CHARS_PER_SEC + sentenceCount * SENTENCE_PAUSE_SEC);
}

export function buildStudioContent(content: any, fallbackTitle: string, courseLabel = ''): StudioContent {
  const c = content || {};
  const cleanFallback = fallbackTitle.replace(/^Video\s*(Özeti|Dersi)\s*:\s*/i, '').trim() || fallbackTitle;
  const title = cleanText(c.podcastTitle) || cleanText(c.videoTitle) || cleanFallback;
  const outline = cleanText(c.outline);
  const rawScenes: any[] = Array.isArray(c.scenes) ? c.scenes : [];

  const source = rawScenes.length > 0
    ? rawScenes
    : [{ speaker: 'Deniz', title, narration: outline || title, keyTakeaways: [] }];

  // İlk geçişte ham tipleri hesapla, ardışık aynı tipleri çeşitlendir
  let prevType: DiagramType | null = null;

  const scenes: StudioScene[] = source.map((s, idx) => {
    const speaker = normalizeSpeaker(s?.speaker, idx);
    const sceneTitle = cleanText(s?.title) || `Bölüm ${idx + 1}`;
    const narration = cleanText(s?.narration) || sceneTitle;
    const sentences = splitSentences(narration);
    const offsets: number[] = [];
    let acc = 0;
    sentences.forEach(sentence => {
      offsets.push(acc);
      acc += sentence.length + 1;
    });
    const totalChars = Math.max(1, acc);

    const takeaways: string[] = (Array.isArray(s?.keyTakeaways) ? s.keyTakeaways : [])
      .map(cleanLabel)
      .filter(Boolean)
      .slice(0, 5);
    const terms: KeyTerm[] = (Array.isArray(s?.keyTerms) ? s.keyTerms : [])
      .map((t: any) => ({ term: cleanLabel(t?.term), definition: cleanText(t?.definition) }))
      .filter((t: KeyTerm) => t.term)
      .slice(0, 6);

    const diagram = buildDiagram(s, idx, courseLabel, sceneTitle, narration, takeaways, terms);

    // Eğer yapay zekâ tüm sahnelere üst üste aynı şema tipini verdiyse (ör. hepsi 'network'),
    // veriye uygun alternatif şema ile görsel çeşitlilik oluştur
    if (prevType && diagram.type === prevType && diagram.type !== 'curve' && diagram.nodes.length >= 2) {
      const altOrder: DiagramType[] = ['structure', 'timeline', 'comparison', 'network'];
      const candidate = altOrder.find(t => t !== prevType && (t !== 'comparison' || diagram.nodes.length <= 4));
      if (candidate && !s?.diagramData?.diagramType) {
        diagram.type = candidate;
      }
    }
    prevType = diagram.type;

    const finalTakeaways = takeaways.length > 0
      ? takeaways
      : diagram.nodes
          .filter(n => n.subtext)
          .slice(0, 4)
          .map(n => (n.subtext.includes(n.label) ? n.subtext : `${n.label}: ${n.subtext}`));

    const finalTerms = terms.length > 0
      ? terms
      : diagram.nodes
          .filter(n => n.subtext && n.subtext !== n.label)
          .slice(0, 4)
          .map(n => ({ term: n.label, definition: n.subtext }));

    return {
      id: `scene-${idx}`,
      index: idx,
      speaker,
      speakerRole: speaker === 'Deniz' ? 'Akademik Anlatıcı' : 'Araştırmacı & Soru Soran',
      title: sceneTitle,
      narration,
      sentences: sentences.length ? sentences : [narration],
      sentenceOffsets: offsets.length ? offsets : [0],
      totalChars,
      keyTakeaways: finalTakeaways,
      keyTerms: finalTerms,
      examTip: cleanText(s?.examTip) || diagram.metric,
      visualCue: cleanText(s?.visualCue),
      diagram,
      durationSec: computeDuration(totalChars, sentences.length || 1),
    };
  });

  const keyFacts: string[] = (Array.isArray(c.keyFacts) ? c.keyFacts : [])
    .map(cleanLabel)
    .filter(Boolean);

  const fallbackFacts = Array.from(
    new Set(
      scenes
        .flatMap(sc => [sc.examTip, ...sc.keyTakeaways.slice(0, 2)])
        .map(cleanLabel)
        .filter(Boolean),
    ),
  ).slice(0, 8);

  const searches: string[] = (Array.isArray(c.suggestedSearches) ? c.suggestedSearches : [])
    .map(cleanText)
    .filter(Boolean)
    .slice(0, 6);

  return {
    title,
    outline,
    scenes,
    keyFacts: keyFacts.length > 0 ? keyFacts.slice(0, 10) : fallbackFacts,
    searches,
    totalDurationSec: scenes.reduce((a, s) => a + s.durationSec, 0),
  };
}

/** Zaman (saniye) bilgisini sahne içi cümle ve karakter konumuna çevirir. */
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
  return { sentenceIndex, charInSentence, progress: ratio };
}

export function formatTime(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;
}
