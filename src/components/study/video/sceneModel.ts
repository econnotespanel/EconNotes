// Video dersi için sahne modeli: yapay zekâ çıktısını (eski ve yeni şema)
// tamamen nota dayalı, oynatıcıya hazır sahnelere dönüştürür.
// Hiçbir yerde konudan bağımsız sabit/generic kavram kullanılmaz.

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

/** Konuşma hızının karakter/saniye tahmini (1x) */
export const CHARS_PER_SEC = 14.5;
const SENTENCE_PAUSE_SEC = 0.45;

const LEADING_JUNK = /^[\s\-–—•*·>#\d.)(]+|^[^\p{L}\p{N}]+/u;

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

export function shortLabel(text: string, maxWords = 4, maxChars = 30): string {
  const clean = cleanLabel(text).split(/[:;—–]|\s-\s/)[0].trim();
  const words = clean.split(' ').filter(Boolean).slice(0, maxWords).join(' ');
  if (words.length <= maxChars) return words;
  return words.slice(0, maxChars - 1).trimEnd() + '…';
}

export function splitSentences(text: string): string[] {
  const normalized = cleanText(text);
  if (!normalized) return [];
  const raw = normalized.match(/[^.!?…]+[.!?…]+["'”’)\]]*|[^.!?…]+$/g) || [normalized];
  const merged: string[] = [];
  for (const part of raw.map(p => p.trim()).filter(Boolean)) {
    const last = merged[merged.length - 1];
    if (last && (last.length < 28 || part.length < 14)) {
      merged[merged.length - 1] = `${last} ${part}`;
    } else {
      merged.push(part);
    }
  }
  // Çok uzun cümleleri virgüllerden böl (TTS ve altyazı için)
  const result: string[] = [];
  for (const s of merged) {
    if (s.length <= 230) {
      result.push(s);
      continue;
    }
    const chunks = s.split(/,\s+/).map((c, i, arr) => (i < arr.length - 1 ? `${c},` : c));
    let buf = '';
    for (const c of chunks) {
      if ((buf + ' ' + c).trim().length > 200 && buf) {
        result.push(buf.trim());
        buf = c;
      } else {
        buf = `${buf} ${c}`;
      }
    }
    if (buf.trim()) result.push(buf.trim());
  }
  return result;
}

function normalizeSpeaker(raw: unknown, idx: number): Speaker {
  const s = cleanText(raw).toLocaleLowerCase('tr-TR');
  if (s.includes('bar')) return 'Barış';
  if (s.includes('den')) return 'Deniz';
  return idx % 2 === 0 ? 'Deniz' : 'Barış';
}

function inferDiagramType(text: string): DiagramType {
  const t = text.toLocaleLowerCase('tr-TR');
  const years = t.match(/\b(1[0-9]{3}|20[0-9]{2})\b/g) || [];
  if (t.includes('arz') && t.includes('talep')) return 'curve';
  if (years.length >= 2 || /kronoloji|dönem|yüzyıl|evre|aşama/.test(t)) return 'timeline';
  if (/karşılaştır|kıyas|fark|avantaj|dezavantaj|benzerlik/.test(t)) return 'comparison';
  if (/kurum|teşkilat|yapı|sistem|örgüt|hiyerarşi|idari/.test(t)) return 'structure';
  return 'network';
}

const DIAGRAM_TYPES: DiagramType[] = ['network', 'timeline', 'structure', 'comparison', 'curve'];

function buildDiagram(s: any, title: string, narration: string, takeaways: string[], terms: KeyTerm[]): StudioDiagram {
  const dd = s?.diagramData;
  const metric = cleanText(dd?.highlightMetric) || cleanText(s?.examTip) || takeaways[0] || '';

  if (dd && Array.isArray(dd.nodes) && dd.nodes.length >= 2) {
    const nodes = dd.nodes
      .map((n: any) => ({ label: shortLabel(cleanLabel(n?.label), 5, 34), subtext: cleanText(n?.subtext) }))
      .filter((n: DiagramNode) => n.label);
    if (nodes.length >= 2) {
      const type = DIAGRAM_TYPES.includes(dd.diagramType) ? dd.diagramType : inferDiagramType(`${title} ${narration}`);
      return { type, title: cleanText(dd.mainTitle) || title, nodes, metric };
    }
  }

  // Yedek: terimler → çıkarımlar → anlatım cümleleri (hepsi nottan gelir)
  let nodes: DiagramNode[] = terms.map(t => ({ label: shortLabel(t.term, 4, 30), subtext: t.definition }));
  if (nodes.length < 3) {
    takeaways.forEach(tk => {
      const parts = tk.split(/[:—–]/);
      nodes.push({
        label: shortLabel(parts[0], 4, 30),
        subtext: parts.length > 1 ? cleanText(parts.slice(1).join(':')) : tk,
      });
    });
  }
  if (nodes.length < 3) {
    splitSentences(narration).forEach(sentence => {
      nodes.push({ label: shortLabel(sentence, 4, 30), subtext: sentence });
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
    type: inferDiagramType(`${title} ${narration}`),
    title,
    nodes: nodes.slice(0, 6),
    metric,
  };
}

function computeDuration(totalChars: number, sentenceCount: number): number {
  return Math.max(6, totalChars / CHARS_PER_SEC + sentenceCount * SENTENCE_PAUSE_SEC);
}

export function buildStudioContent(content: any, fallbackTitle: string): StudioContent {
  const c = content || {};
  const title = cleanText(c.podcastTitle) || cleanText(c.videoTitle) || fallbackTitle;
  const outline = cleanText(c.outline);
  const rawScenes: any[] = Array.isArray(c.scenes) ? c.scenes : [];

  const source = rawScenes.length > 0
    ? rawScenes
    : [{ speaker: 'Deniz', title: title, narration: outline || title, keyTakeaways: [] }];

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
      .slice(0, 5);

    const diagram = buildDiagram(s, sceneTitle, narration, takeaways, terms);

    // Önemli not yoksa diyagram düğümlerinden üret (yine nota dayalı)
    const finalTakeaways = takeaways.length > 0
      ? takeaways
      : diagram.nodes
          .filter(n => n.subtext)
          .slice(0, 3)
          .map(n => `${n.label}: ${n.subtext}`);

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
      speakerRole: speaker === 'Deniz' ? 'Akademik Anlatıcı' : 'Meraklı Soru Soran',
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

  const searches: string[] = (Array.isArray(c.suggestedSearches) ? c.suggestedSearches : [])
    .map(cleanText)
    .filter(Boolean)
    .slice(0, 6);

  return {
    title,
    outline,
    scenes,
    keyFacts: keyFacts.length > 0
      ? keyFacts.slice(0, 10)
      : scenes.map(s => s.diagram.metric).filter(Boolean).slice(0, 8),
    searches,
    totalDurationSec: scenes.reduce((a, s) => a + s.durationSec, 0),
  };
}

/** Zaman (saniye) bilgisini sahne içi cümle ve karakter konumuna çevirir (sessiz mod / dışa aktarma). */
export function positionFromElapsed(scene: StudioScene, elapsed: number) {
  const ratio = Math.max(0, Math.min(1, elapsed / scene.durationSec));
  const pos = ratio * scene.totalChars;
  let sentenceIndex = 0;
  for (let i = 0; i < scene.sentenceOffsets.length; i++) {
    if (pos >= scene.sentenceOffsets[i]) sentenceIndex = i;
  }
  const charInSentence = Math.min(
    scene.sentences[sentenceIndex]?.length ?? 0,
    pos - scene.sentenceOffsets[sentenceIndex],
  );
  return { sentenceIndex, charInSentence, progress: ratio };
}

export function formatTime(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;
}
