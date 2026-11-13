/**
 * Deterministic High-Quality Local Study Material Synthesizer
 * Acts both as instant offline fallback and structured domain-faithful parser
 * without injecting foreign-domain boilerplate into user notes.
 */

import { classifyStudyDomain, type AcademicDomainMode } from './studySourceProcessor';
import type { SummarySection } from '@/types/study';

export interface GeneratePayload {
  materialType: 'flashcards' | 'quiz' | 'summary' | 'video';
  noteTitle?: string;
  course?: string;
  noteContext?: string;
  customPrompt?: string;
  detailLevel?: 'concise' | 'standard' | 'deep' | 'textbook';
  summaryDepth?: 'short' | 'standard' | 'comprehensive' | 'textbook';
  deepResearch?: boolean;
  pedagogicalStyle?: string;
  questionCount?: number;
  cardCount?: number;
  difficulty?: 'easy' | 'medium' | 'hard' | 'mixed';
  quizFormat?: 'multiple_choice' | 'open_ended' | 'mixed';
  examFocus?: string;
}

interface ParsedUnit {
  heading: string;
  pageRange?: string;
  paragraphs: string[];
  sentences: string[];
  bullets: string[];
  formulas: string[];
}

const STOPWORDS = new Set([
  've', 'veya', 'ile', 'için', 'gibi', 'olan', 'olarak', 'bir', 'bu', 'şu', 'o',
  'da', 'de', 'ki', 'mi', 'mı', 'mu', 'mü', 'ancak', 'fakat', 'lakin', 'çünkü',
  'dolayı', 'üzerine', 'göre', 'kadar', 'daha', 'en', 'çok', 'az', 'her', 'bazı',
  'tüm', 'bütün', 'kendi', 'hem', 'ya', 'ne', 'nasıl', 'neden', 'hangi', 'tarafından',
  'arasında', 'hakkında', 'içinde', 'sonra', 'önce', 'üzere', 'böylece', 'ise',
  'var', 'yok', 'ayrıca', 'dolayısıyla', 'şekilde', 'durumda', 'yönelik', 'ilgili',
  'kapsamında', 'açısından', 'ortaya', 'vardır', 'olduğu', 'edilir', 'yapılır',
  'sağlar', 'bulunur', 'olur', 'olabilir', 'olanlar', 'bununla', 'birlikte',
  'bugün', 'dün', 'yarın', 'şimdi', 'burada', 'dersimizde', 'genellikle', 'örneğin',
  'özellikle', 'the', 'and', 'for', 'with', 'that', 'this',
  'from', 'into', 'are', 'sayfa', 'slayt', 'bölüm', 'ders', 'konu', 'not', 'notlar',
]);

const GREETING_RE =
  /^\s*(?:merhaba|hoş\s+geldiniz|selam|günaydın|iyi\s+günler|bugünkü\s+dersimizde|sevgili\s+arkadaşlar|dinlediğiniz\s+için\s+teşekkürler)\b/i;

function normalizeSourceText(raw: string): string {
  return String(raw || '')
    .split('\0')
    .join('')
    .replace(/\r\n/g, '\n')
    // PDF satır sonu tirelemelerini birleştir (örn. "merkez-\nlemiş" -> "merkezlemiş")
    .replace(/([A-Za-zÇĞİÖŞÜçğıöşü])-\n([a-zçğıöşü])/g, '$1$2')
    // Yalnızca tek başına duran slayt/sayfa numarası ve tekrarlı altbilgi satırlarını ayıkla
    .split('\n')
    .filter((line) => {
      const t = line.trim();
      if (!t) return true;
      if (/^\d{1,3}\s*(\/\s*\d{1,3})?$/.test(t)) return false;
      if (/^(sayfa|slayt|page|slide)\s*:?\s*\d{1,3}(\s*\/\s*\d{1,3})?$/i.test(t)) return false;
      return true;
    })
    .join('\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function splitIntoSentences(text: string): string[] {
  const cleaned = text
    .replace(/---\s*(Sayfa|Slayt)\s*\d+\s*---/gi, '\n')
    .replace(/===\s*KAYNAK\s*\d+:[^=]+===/gi, '\n')
    .trim();

  const rawSegments = cleaned
    .split(/(?<=[.!?])\s+|\n{1,}/)
    .map((s) => s.replace(/^[-•*#]+\s*/, '').trim())
    .filter((s) => s.length >= 24 && s.length <= 520);

  const nonGreeting = rawSegments.filter((s) => !GREETING_RE.test(s));
  const pool = nonGreeting.length >= 2 ? nonGreeting : rawSegments;

  const unique: string[] = [];
  const seen = new Set<string>();
  for (const seg of pool) {
    const key = seg.toLowerCase().slice(0, 90);
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(seg);
    }
  }
  return unique;
}

function extractKeyTerms(text: string, sentences: string[], course?: string): Array<{
  term: string;
  definition: string;
  formula?: string;
}> {
  const terms: Array<{ term: string; definition: string; formula?: string }> = [];
  const seen = new Set<string>();
  const usedDefKeys = new Set<string>();

  const findBestHostSentence = (needleLower: string): string | undefined => {
    const cleanMatches = sentences.filter(
      (st) => st.toLocaleLowerCase('tr-TR').includes(needleLower) && !GREETING_RE.test(st),
    );
    const fresh = cleanMatches.find((st) => !usedDefKeys.has(st.slice(0, 50)));
    return fresh || cleanMatches[0] || sentences.find((st) => st.toLocaleLowerCase('tr-TR').includes(needleLower));
  };

  const pushTerm = (rawTerm: string, rawDef: string) => {
    // Trim leading non-domain stop words (e.g. "Bugün Para Teorisi" -> "Para Teorisi")
    let cleanedWords = rawTerm.replace(/^[*"'«»]+|[*"'«».,:;]+$/g, '').trim().split(/\s+/);
    while (cleanedWords.length > 1 && STOPWORDS.has(cleanedWords[0].toLocaleLowerCase('tr-TR'))) {
      cleanedWords = cleanedWords.slice(1);
    }
    const term = cleanedWords.join(' ').trim();
    const def = rawDef.replace(/^#+\s*/, '').trim();
    const key = term.toLocaleLowerCase('tr-TR');
    if (
      term.length < 3 ||
      term.length > 48 ||
      def.length < 18 ||
      seen.has(key) ||
      STOPWORDS.has(key) ||
      /^\d+$/.test(term)
    ) {
      return;
    }
    seen.add(key);
    usedDefKeys.add(def.slice(0, 50));
    terms.push({ term, definition: def.slice(0, 220) });
  };

  // 1. Explicit colon / definition patterns (e.g. "Marjinal Fayda: ..." or "Anayasa Hukuku — ...")
  for (const s of sentences) {
    if (terms.length >= 10) break;
    const match = s.match(/^([A-ZÇĞİÖŞÜ][^\n:–—-]{2,44})\s*[:–—]\s*(.{18,240})$/);
    if (match) {
      pushTerm(match[1], match[2]);
    }
  }

  // 2. Turkish academic copula / verbal definition patterns ("X ... anlamına gelir / denir / ifade eder")
  for (const s of sentences) {
    if (terms.length >= 10) break;
    const copula = s.match(
      /^([A-ZÇĞİÖŞÜ][A-Za-zÇĞİÖŞÜçğıöşü\s-]{2,38}?)(?:\s+(?:kavramı|ilkesi|kuramı|teorisi|yaklaşımı))?(?:,\s*|\s+)(?:denir|denmektedir|anlamına\s+gelir|ifade\s+eder|olarak\s+tanımlanır|olarak\s+adlandırılır|demektir)(?![\p{L}\p{N}])/iu,
    );
    if (copula) {
      pushTerm(copula[1], s);
      continue;
    }
    const boldMention = s.match(/\*\*([^*\n]{3,42})\*\*/);
    if (boldMention) {
      pushTerm(boldMention[1], s.replace(/\*\*/g, ''));
    }
  }

  // 3. Multi-word capitalized concepts frequent in Turkish texts (Unicode-safe boundaries so -ı/-ü suffixes are preserved)
  if (terms.length < 8) {
    const phraseFreq = new Map<string, number>();
    const phraseMatches =
      text.match(
        /(?<![\p{L}\p{N}])[A-ZÇĞİÖŞÜ][a-zçğıöşü]{2,}(?:\s+[A-ZÇĞİÖŞÜ][a-zçğıöşü]{2,}){1,2}(?![\p{L}\p{N}])/gu,
      ) || [];
    for (const ph of phraseMatches) {
      const cleanPh = ph.trim();
      if (cleanPh.length >= 6 && cleanPh.length <= 42 && !GREETING_RE.test(cleanPh)) {
        phraseFreq.set(cleanPh, (phraseFreq.get(cleanPh) || 0) + 1);
      }
    }
    const rankedPhrases = Array.from(phraseFreq.entries()).sort((a, b) => b[1] - a[1]);
    for (const [phrase] of rankedPhrases) {
      if (terms.length >= 9) break;
      const lowerPh = phrase.toLocaleLowerCase('tr-TR');
      if (seen.has(lowerPh)) continue;
      const host = findBestHostSentence(lowerPh);
      if (host) pushTerm(phrase, host);
    }
  }

  // 4. Frequency-scored domain words not already part of an extracted multi-word concept
  if (terms.length < 7) {
    const freq = new Map<string, number>();
    const words = text
      .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 5 && !STOPWORDS.has(w.toLocaleLowerCase('tr-TR')));

    for (const w of words) {
      const lower = w.toLocaleLowerCase('tr-TR');
      if (/^\d+$/.test(lower)) continue;
      freq.set(lower, (freq.get(lower) || 0) + 1);
    }

    const existingTermsLower = Array.from(seen);
    const sortedWords = Array.from(freq.entries())
      .filter(([w]) => !seen.has(w) && !existingTermsLower.some((et) => et.includes(w)))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12);

    for (const [word] of sortedWords) {
      if (terms.length >= 8) break;
      if (seen.has(word)) continue;
      const hostSentence = findBestHostSentence(word);
      if (hostSentence) {
        pushTerm(word.charAt(0).toLocaleUpperCase('tr-TR') + word.slice(1), hostSentence);
      }
    }
  }

  if (terms.length === 0 && course) {
    terms.push({
      term: course,
      definition: sentences[0] || `${course} dersi kapsamında ele alınan temel kavram.`,
    });
  }

  return terms;
}

function splitDocumentIntoUnits(text: string, fallbackTitle: string, targetSections: number): ParsedUnit[] {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const rawBlocks: Array<{ heading: string; pageRange?: string; lines: string[] }> = [];

  let currentHeading = '';
  let currentPageRange: string | undefined;
  let currentLines: string[] = [];

  const isHeadingCandidate = (line: string): boolean => {
    if (line.length < 4 || line.length > 90) return false;
    if (/^#{1,4}\s+/.test(line)) return true;
    if (/^(\d+(\.\d+){0,2}|[IVX]+\.)\s+[A-ZÇĞİÖŞÜ]/.test(line)) return true;
    if (/^[A-ZÇĞİÖŞÜ][^.!?]{3,55}:$/.test(line)) return true;
    if (
      line.length >= 6 &&
      line.length <= 60 &&
      line === line.toUpperCase() &&
      /[A-ZÇĞİÖŞÜ]{3}/.test(line)
    ) {
      return true;
    }
    return false;
  };

  for (const line of lines) {
    const pageMatch = line.match(/^---\s*(Sayfa|Slayt)\s+(\d+)\s*---$/i);
    if (pageMatch) {
      if (!currentPageRange) currentPageRange = `${pageMatch[1]} ${pageMatch[2]}`;
      else {
        const start = currentPageRange.split('-')[0].trim();
        currentPageRange = `${start}-${pageMatch[2]}`;
      }
      continue;
    }
    if (/^===\s*KAYNAK/i.test(line)) {
      if (currentLines.length > 0) {
        rawBlocks.push({
          heading: currentHeading || `${fallbackTitle} — Bölüm ${rawBlocks.length + 1}`,
          pageRange: currentPageRange,
          lines: currentLines,
        });
        currentLines = [];
      }
      currentHeading = line.replace(/^===\s*|\s*===$/g, '').trim();
      currentPageRange = undefined;
      continue;
    }
    if (isHeadingCandidate(line) && currentLines.length >= 1) {
      rawBlocks.push({
        heading: currentHeading || `${fallbackTitle} — Bölüm ${rawBlocks.length + 1}`,
        pageRange: currentPageRange,
        lines: currentLines,
      });
      currentHeading = line.replace(/^#{1,4}\s+/, '').replace(/:$/, '').trim();
      currentPageRange = undefined;
      currentLines = [];
      continue;
    }
    if (!currentHeading && isHeadingCandidate(line)) {
      currentHeading = line.replace(/^#{1,4}\s+/, '').replace(/:$/, '').trim();
      continue;
    }
    currentLines.push(line);
  }

  if (currentLines.length > 0) {
    rawBlocks.push({
      heading: currentHeading || `${fallbackTitle} — Bölüm ${rawBlocks.length + 1}`,
      pageRange: currentPageRange,
      lines: currentLines,
    });
  }

  // Merge tiny blocks or split overly large block evenly across targetSections
  let normalizedBlocks = rawBlocks.filter((b) => b.lines.join(' ').trim().length > 35);

  if (normalizedBlocks.length <= 1) {
    const allSentences = splitIntoSentences(text);
    const globalTerms = extractKeyTerms(text, allSentences);
    const groupCount = Math.min(
      targetSections,
      Math.max(2, Math.ceil(allSentences.length / 4)),
    );
    const perGroup = Math.max(1, Math.ceil(allSentences.length / groupCount));
    normalizedBlocks = Array.from({ length: groupCount }, (_, i) => {
      const slice = allSentences.slice(i * perGroup, (i + 1) * perGroup);
      const sliceText = slice.join(' ').toLocaleLowerCase('tr-TR');
      const matchedTerm = globalTerms.find(
        (gt) => sliceText.includes(gt.term.toLocaleLowerCase('tr-TR')) && gt.term.length >= 4,
      );
      const colonHead = slice[0]?.match(/^([A-ZÇĞİÖŞÜ][^:–—.!?]{3,38})\s*[:–—]/)?.[1]?.trim();
      const firstWords = (slice[0] || '')
        .split(/\s+/)
        .filter((w) => !STOPWORDS.has(w.toLocaleLowerCase('tr-TR')))
        .slice(0, 4)
        .join(' ')
        .replace(/[,.;:!?]$/, '');
      const topicLabel = colonHead || matchedTerm?.term || firstWords;
      return {
        heading: topicLabel
          ? `Bölüm ${i + 1}: ${topicLabel}`
          : `${fallbackTitle} — Bölüm ${i + 1}`,
        lines: slice,
      };
    });
  } else if (normalizedBlocks.length > targetSections + 3) {
    // Coalesce excess tiny blocks cleanly without losing content
    const step = Math.ceil(normalizedBlocks.length / targetSections);
    const merged: typeof normalizedBlocks = [];
    for (let i = 0; i < normalizedBlocks.length; i += step) {
      const group = normalizedBlocks.slice(i, i + step);
      merged.push({
        heading: group[0].heading,
        pageRange: group[0].pageRange,
        lines: group.flatMap((g) => g.lines),
      });
    }
    normalizedBlocks = merged;
  }

  return normalizedBlocks.map((b) => {
    const joined = b.lines.join('\n');
    const sentences = splitIntoSentences(joined);
    const bullets = b.lines
      .filter((l) => /^[-•*]\s+/.test(l))
      .map((l) => l.replace(/^[-•*]\s+/, '').trim());
    const formulas = b.lines.filter((l) => /[=$\\]/.test(l) && l.length < 140).slice(0, 3);

    const paragraphs: string[] = [];
    for (let i = 0; i < sentences.length; i += 3) {
      paragraphs.push(sentences.slice(i, i + 3).join(' '));
    }
    return {
      heading: b.heading,
      pageRange: b.pageRange,
      paragraphs: paragraphs.length > 0 ? paragraphs : [joined.slice(0, 900)],
      sentences,
      bullets,
      formulas,
    };
  });
}

function buildSectionQuizDistractors(
  correctSentence: string,
  allSentences: string[],
  idx: number,
): string[] {
  const candidates = allSentences
    .filter((s, j) => j !== idx && s.toLowerCase() !== correctSentence.toLowerCase())
    .slice(0, 6);

  const distractors: string[] = [];
  for (const cand of candidates) {
    if (distractors.length >= 3) break;
    distractors.push(cand.slice(0, 145));
  }
  while (distractors.length < 3) {
    distractors.push(
      `Metindeki sıralama veya koşulun tersini savunan alternatif ifade (${distractors.length + 1})`,
    );
  }
  return distractors;
}

const CAUSAL_CONTRAST_RE =
  /\b(çünkü|dolayısıyla|nedeniyle|sonucunda|böylece|amaç|koşul|ilke|göre|karşın|ancak|aksine|istisna|zorunlu|farklı\s+olarak|temel\s+olarak|yol\s+açar|belirler|önemli|avantaj|dezavantaj)\b/i;

function highlightKeyTermsInProse(prose: string, terms: string[]): string {
  let out = prose;
  for (const term of terms.slice(0, 4)) {
    if (term.length < 4 || term.length > 38) continue;
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(?<![\\p{L}\\p{N}*])(${escaped})(?![\\p{L}\\p{N}*])`, 'iu');
    if (re.test(out)) {
      out = out.replace(re, '**$1**');
    }
  }
  return out;
}

function classifyClauseBadge(sentence: string): string {
  const lower = sentence.toLocaleLowerCase('tr-TR');
  if (/(çünkü|nedeniyle|kaynaklan)/.test(lower)) return 'Neden–Köken';
  if (/(sonucunda|dolayısıyla|yol\s+açar|böylece|sağlar)/.test(lower)) return 'Sonuç & Etki';
  if (/(ancak|karşın|aksine|farklı\s+olarak|istisna)/.test(lower)) return 'Ayırt Edici Fark';
  if (/(koşul|şart|zorunlu|göre|ilke)/.test(lower)) return 'Temel Koşul / İlke';
  return 'Anahtar Mekanizma';
}

function buildRichSummarySection(params: {
  index: number;
  heading: string;
  pageRange?: string;
  unit: ParsedUnit;
  allSentences: string[];
  keyTerms: Array<{ term: string; definition: string; formula?: string }>;
  domainMode: AcademicDomainMode;
  deepResearch?: boolean;
  course?: string;
  extraTakeaways?: string[];
}): SummarySection {
  const { index, heading, pageRange, unit, allSentences, keyTerms, domainMode, deepResearch, course, extraTakeaways } =
    params;
  const isVerbal = domainMode === 'verbal';
  const bodyBlocks: string[] = [];

  const unitJoinedLower = unit.paragraphs.join(' ').toLocaleLowerCase('tr-TR');
  const matchedTerms = keyTerms.filter(
    (kt) =>
      unitJoinedLower.includes(kt.term.toLocaleLowerCase('tr-TR')) ||
      kt.definition.toLocaleLowerCase('tr-TR').includes(heading.toLocaleLowerCase('tr-TR').slice(0, 10)),
  );
  const sectionTerms = (matchedTerms.length >= 2 ? matchedTerms : keyTerms.slice(index, index + 4)).slice(0, 4);
  const termNames = sectionTerms.map((t) => t.term);

  // 1. Kavramsal Öz / Analitik Çerçeve
  if (unit.paragraphs.length > 0) {
    const leadTitle = isVerbal ? '#### Kavramsal Öz ve Ana Tez' : '#### Analitik Çerçeve';
    const enrichedParagraphs = unit.paragraphs.map((p) => highlightKeyTermsInProse(p, termNames));
    bodyBlocks.push(`${leadTitle}\n\n${enrichedParagraphs.join('\n\n')}`);
  }

  // 2. Neden–Sonuç Zinciri / Ayırt Edici İlkeler (Sözelde özellikle güçlü)
  const causalCandidates = unit.sentences.filter((s) => CAUSAL_CONTRAST_RE.test(s));
  const combinedBullets = [
    ...unit.bullets.map((b) => `- **Ana Nokta:** ${highlightKeyTermsInProse(b, termNames)}`),
    ...causalCandidates
      .slice(0, 4)
      .map((s) => `- **${classifyClauseBadge(s)}:** ${highlightKeyTermsInProse(s, termNames)}`),
  ];
  const uniqueBullets = Array.from(new Set(combinedBullets)).slice(0, 5);
  if (uniqueBullets.length === 0 && unit.sentences.length > 0) {
    uniqueBullets.push(
      ...unit.sentences
        .slice(0, 3)
        .map((s) => `- **Temel İlke:** ${highlightKeyTermsInProse(s, termNames)}`),
    );
  }
  if (uniqueBullets.length > 0) {
    const bulletTitle = isVerbal
      ? '#### Neden–Sonuç Zinciri ve Ayırt Edici İlkeler'
      : '#### Öne Çıkan Mekanizmalar ve Adımlar';
    bodyBlocks.push(`${bulletTitle}\n${uniqueBullets.join('\n')}`);
  }

  // 3. Karşılaştırma ve Kavram Tablosu
  if (sectionTerms.length >= 2) {
    const tableHeader = isVerbal
      ? '| Kavram / Ekol / Unsur | Kapsam ve Ana Fikir | Sınavda Ayırt Edici Yön |'
      : '| Kavram / Unsur | Analitik İşlev ve Kapsam | Kritik Koşul / Ayrım |';
    const tableRows = sectionTerms
      .map((kt) => {
        const cleanTerm = kt.term.replace(/\|/g, '/');
        const cleanDef = kt.definition.replace(/\|/g, '/').slice(0, 125);
        const angle = classifyClauseBadge(kt.definition);
        return `| **${cleanTerm}** | ${cleanDef} | ${angle} |`;
      })
      .join('\n');
    const tableTitle = isVerbal ? '#### Kavram ve Ayrım Tablosu' : '#### Kavramsal Yapı Tablosu';
    bodyBlocks.push(`${tableTitle}\n${tableHeader}\n| --- | --- | --- |\n${tableRows}`);
  }

  // 4. Formüller yalnız gerçek sayısal/mantıksal ifade varsa gösterilir (sözelde uydurma formül yok)
  if (!isVerbal && unit.formulas.length > 0) {
    bodyBlocks.push(`#### Kaynak İfade ve İlişki\n${unit.formulas.map((f) => `> ${f}`).join('\n')}`);
  }

  // 5. Sınav Odağı & Klasik Yorum İpucu
  const contrastSent =
    unit.sentences.find((s) => /\b(ancak|karşın|aksine|istisna|farklı\s+olarak|en\s+önemli)\b/i.test(s)) ||
    (unit.sentences.length > 1 ? unit.sentences[unit.sentences.length - 1] : unit.sentences[0]);
  if (contrastSent) {
    const tipTitle = isVerbal ? 'Klasik Sınav & Yorum İpucu' : 'Sınav Odağı';
    bodyBlocks.push(`> **${tipTitle}:** ${contrastSent}`);
  }

  const takeaways = Array.from(
    new Set([
      ...(extraTakeaways || []),
      ...(unit.bullets.length >= 2 ? unit.bullets : unit.sentences),
    ]),
  )
    .filter((t) => t && t.trim().length > 12)
    .slice(0, 4)
    .map((t) => t.trim().slice(0, 165));

  const qSentence = unit.sentences[0] || unit.paragraphs[0] || '';
  const checkpointOpts = buildSectionQuizDistractors(qSentence, allSentences, index);
  const correctIndex = index % 4;
  checkpointOpts.splice(correctIndex, 0, qSentence.slice(0, 130) || `${heading} temel bulgusu`);

  const commonPitfalls: string[] = [];
  if (sectionTerms.length >= 2) {
    commonPitfalls.push(
      `**${sectionTerms[0].term}** ile **${sectionTerms[1].term}** kapsamını karıştırmayın: sınav sorularında neden–sonuç yönü ve sınır koşulları özellikle ayırt edicidir.`,
    );
  }
  const exceptionSent = unit.sentences.find((s) => /\b(istisna|hariç|olmazsa|aksi\s+halde|değildir)\b/i.test(s));
  if (exceptionSent) {
    commonPitfalls.push(`Dikkat edilecek istisna/sınır: "${exceptionSent.slice(0, 165)}"`);
  }

  const relatedTerms = sectionTerms.map((t) => t.term).slice(0, 3);
  const deepResearchNote =
    deepResearch && relatedTerms.length > 0
      ? isVerbal
        ? `**[Derin Akademik Araştırma]** "${heading}" başlığı, ${course || 'ilgili ders'} literatüründe ${relatedTerms.join(', ')} eksenindeki kuramsal ve kurumsal gelişimi açıklar; sınav yorumlarında bu kavramların tarihsel/hukuki neden–sonuç bağını birlikte kurmak tam puan getirir.`
        : `**[Derin Akademik Araştırma]** "${heading}" bölümü, ${relatedTerms.join(' ve ')} arasındaki analitik ve ampirik ilişkiyi inceleyerek kuramsal mekanizmayı somutlaştırır.`
      : undefined;

  return {
    index,
    heading,
    pageRange,
    content: bodyBlocks.join('\n\n') || unit.paragraphs.join('\n\n'),
    takeaways,
    deepResearchNote,
    commonPitfalls: commonPitfalls.slice(0, 2),
    checkpointQuestion:
      qSentence.length > 20
        ? {
            question: `${heading} bölümüne göre aşağıdaki çıkarımlardan hangisi geçerlidir?`,
            options: checkpointOpts.slice(0, 4),
            correctIndex,
            explanation: `Doğrudan kaynak metinden: "${qSentence.slice(0, 180)}"`,
          }
        : undefined,
  };
}

/**
 * Formats an AI-failed or thin source excerpt into a structured university study section
 * so raw pasted text dumps never leak into generated summaries.
 */
export function formatSectionContentForFallback(params: {
  index: number;
  heading: string;
  pageRange?: string;
  rawSlice: string;
  focusPoints?: string[];
  course?: string;
  title?: string;
  deepResearch?: boolean;
}): SummarySection {
  const cleanSlice = normalizeSourceText(params.rawSlice || '');
  const sentences = splitIntoSentences(cleanSlice);
  const domain = classifyStudyDomain(cleanSlice, params.course, params.title);
  const keyTerms = extractKeyTerms(cleanSlice, sentences, params.course);

  const paragraphs: string[] = [];
  for (let i = 0; i < sentences.length; i += 3) {
    paragraphs.push(sentences.slice(i, i + 3).join(' '));
  }

  const unit: ParsedUnit = {
    heading: params.heading,
    pageRange: params.pageRange,
    paragraphs: paragraphs.length > 0 ? paragraphs : [cleanSlice.slice(0, 900)],
    sentences,
    bullets: (params.focusPoints || []).filter(Boolean),
    formulas: cleanSlice
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => /[=$\\]/.test(l) && l.length > 4 && l.length < 130)
      .slice(0, 3),
  };

  return buildRichSummarySection({
    index: params.index,
    heading: params.heading,
    pageRange: params.pageRange,
    unit,
    allSentences: sentences,
    keyTerms,
    domainMode: domain.mode,
    deepResearch: params.deepResearch,
    course: params.course,
    extraTakeaways: params.focusPoints,
  });
}

export function generateClientStudyMaterial(req: GeneratePayload): Record<string, unknown> {
  const cleanText = normalizeSourceText(req.noteContext || '');
  const title = req.noteTitle?.trim() || 'Çalışma Materyali';
  const course = req.course?.trim() || 'Akademik Ders';
  const domain = classifyStudyDomain(cleanText, course, title);
  const sentences = splitIntoSentences(cleanText);
  const keyTerms = extractKeyTerms(cleanText, sentences, course);

  const effectiveDepth =
    req.summaryDepth ||
    (req.detailLevel === 'concise'
      ? 'short'
      : req.detailLevel === 'textbook'
      ? 'textbook'
      : req.detailLevel === 'deep'
      ? 'comprehensive'
      : 'standard');

  // ---------------- QUIZ ----------------
  if (req.materialType === 'quiz') {
    const requested = Math.min(Math.max(req.questionCount || 6, 3), 25);
    const pool = sentences.length > 0 ? sentences : [`${title} — ${course} temel kavramı.`];
    const fmt = req.quizFormat || 'multiple_choice';

    const questions = Array.from({ length: requested }, (_, idx) => {
      const targetSentence = pool[idx % pool.length];
      const hostTerm = keyTerms[idx % Math.max(1, keyTerms.length)]?.term || title;
      const isOpen = fmt === 'open_ended' || (fmt === 'mixed' && idx % 4 === 3);

      if (isOpen) {
        return {
          type: 'short_answer' as const,
          question: `"${hostTerm}" kavramının ${title} kapsamındaki rolünü, temel varsayımını veya sonucunu açıklayınız.`,
          options: [],
          sampleAnswer: targetSentence,
          rubric: [
            `${hostTerm} kavramının doğru tanımlanması`,
            'Kaynak metindeki neden-sonuç veya mekanizmanın açıklanması',
          ],
          explanation: `Kaynak metne göre: ${targetSentence}`,
          topic: hostTerm,
          difficulty: idx % 3 === 0 ? 'hard' : 'medium',
          bloomLevel: 'Analiz',
        };
      }

      const distractors = buildSectionQuizDistractors(targetSentence, pool, idx % pool.length);
      const correctIndex = idx % 4;
      const options = [...distractors];
      options.splice(correctIndex, 0, targetSentence.slice(0, 150));

      return {
        type: 'multiple_choice' as const,
        question: `${title} metnine göre "${hostTerm}" veya ilgili süreç hakkında aşağıdaki ifadelerden hangisi doğrudur? (Soru ${
          idx + 1
        })`,
        options: options.slice(0, 4),
        correctIndex,
        explanation: `Kaynak metinde doğrudan yer alan ifade: "${targetSentence}"`,
        topic: hostTerm,
        difficulty: idx % 3 === 0 ? 'hard' : idx % 2 === 0 ? 'medium' : 'easy',
        bloomLevel: idx % 2 === 0 ? 'Uygulama' : 'Anlama',
      };
    });

    return {
      questions,
      metadata: { sourceMode: 'local', deepResearch: Boolean(req.deepResearch) },
    };
  }

  // ---------------- FLASHCARDS ----------------
  if (req.materialType === 'flashcards') {
    const requested = Math.min(Math.max(req.cardCount || 6, 4), 32);
    const termCards = keyTerms.map((kt, idx) => ({
      front: `${kt.term} nedir ve ${title} içinde hangi mekanizmayı veya olguyu ifade eder?`,
      back: kt.formula ? `${kt.definition}\n\nFormül: $${kt.formula}$` : kt.definition,
      hint: `${kt.term} anahtar terimi`,
      topic: kt.term,
      difficulty: idx % 3 === 0 ? ('hard' as const) : ('medium' as const),
    }));

    const sentenceCards = sentences.map((s, idx) => {
      const cue = s.split(/\s+/).slice(0, 6).join(' ');
      return {
        front: `${title} (#${idx + 1}): "${cue}..." ile ifade edilen temel ilke nedir?`,
        back: s,
        hint: 'Kaynak nottaki doğrudan tespit',
        topic: course,
        difficulty: idx % 2 === 0 ? ('medium' as const) : ('easy' as const),
      };
    });

    const merged = [...termCards, ...sentenceCards].slice(0, requested);
    if (merged.length === 0) {
      merged.push({
        front: `${title} ana odak noktası nedir?`,
        back: cleanText.slice(0, 260) || `${course} çalışma notu.`,
        hint: title,
        topic: course,
        difficulty: 'medium',
      });
    }

    return {
      cards: merged,
      metadata: { sourceMode: 'local', deepResearch: Boolean(req.deepResearch) },
    };
  }

  // ---------------- VIDEO ----------------
  if (req.materialType === 'video') {
    let units = splitDocumentIntoUnits(cleanText, title, 6).filter(
      (u) =>
        u.sentences.some((st) => !/^\s*(?:merhaba|hoş\s+geldiniz|selam|günaydın)\b/i.test(st)) ||
        u.bullets.length > 0,
    );
    if (units.length < 4 && sentences.length >= 6) {
      const target = Math.min(6, Math.max(4, Math.floor(sentences.length / 2)));
      const per = Math.max(1, Math.ceil(sentences.length / target));
      units = Array.from({ length: target }, (_, i) => {
        const sents = sentences.slice(i * per, (i + 1) * per).filter(Boolean);
        const hWords = (sents[0] || '').split(/\s+/).slice(0, 5).join(' ').replace(/[,.;:!?]$/, '');
        return {
          heading: units[i]?.heading || (hWords ? `${title}: ${hWords}` : `${title} — Bölüm ${i + 1}`),
          pageRange: units[i]?.pageRange,
          paragraphs: [sents.join(' ')],
          bullets: units[i]?.bullets || [],
          formulas: units[i]?.formulas || [],
          sentences: sents.length > 0 ? sents : [sentences[i % sentences.length]],
        };
      });
    }
    const isEconDoc = /iktisat|ekonomi|para|merkez bankas|enflasyon|faiz|piyasa|arz|talep|maliye|bütçe|vergi|kredi|likidite/i.test(
      `${course} ${title} ${cleanText.slice(0, 1200)}`,
    );
    const diagramPalette = isEconDoc
      ? (['visual', 'curve', 'table', 'shapes', 'chart', 'scenario', 'comparison'] as const)
      : (['visual', 'table', 'shapes', 'scenario', 'timeline', 'comparison'] as const);
    const badges = ['Temel İlke', 'Mekanizma', 'Kurumsal Koşul', 'Politika Çıktısı'];

    const scenes = units.slice(0, 7).map((u, idx) => {
      const nonGreetingUnitSents = u.sentences.filter(
        (st) => !/^\s*(?:merhaba|hoş\s+geldiniz|selam|günaydın)\b/i.test(st),
      );
      const unitSents =
        nonGreetingUnitSents.length > 0
          ? nonGreetingUnitSents
          : u.sentences.length > 0
          ? u.sentences
          : [`${u.heading} bölümü incelenmektedir.`];
      const hostTerm = keyTerms[idx % Math.max(1, keyTerms.length)]?.term || u.heading;
      const facetSources = [...(u.bullets.length > 0 ? u.bullets : []), ...unitSents, ...sentences].filter(
        (st) => st && !/^\s*(?:merhaba|hoş\s+geldiniz|selam|günaydın)\b/i.test(st),
      );
      const nodes = Array.from({ length: Math.min(4, Math.max(3, facetSources.length)) }, (_, ni) => {
        const rawSent = facetSources[ni % facetSources.length] || u.heading;
        const colonParts = rawSent.split(/[:–-]/);
        const labelCandidate =
          colonParts.length >= 2 && colonParts[0].trim().length <= 42
            ? colonParts[0].trim()
            : rawSent.split(/\s+/).slice(0, 4).join(' ').replace(/[,.;:!?]$/, '');
        return {
          label: labelCandidate || `${u.heading.slice(0, 24)} ${ni + 1}`,
          subtext: rawSent.slice(0, 180),
          badge: badges[ni % badges.length],
          value: 86 - ni * 7,
        };
      });

      const leadTurn = unitSents[0] || `${u.heading} temel çerçevesini oluşturur.`;
      const deepTurn = unitSents.slice(1, 3).join(' ') || `${hostTerm} üzerinden neden-sonuç ilişkisi bu mekanizmada belirleyicidir.`;
      const turns = [
        { speaker: 'Deniz' as const, text: leadTurn },
        {
          speaker: 'Barış' as const,
          text: `Deniz hocam, ${u.heading} kapsamında "${nodes[0]?.label || hostTerm}" kavramı pratikte hangi mekanizmayı tetikliyor?`,
        },
        { speaker: 'Deniz' as const, text: deepTurn },
      ];
      const narration = turns.map((t) => t.text).join(' ');
      const correctOption = unitSents[0]?.slice(0, 130) || `${u.heading} ile doğrudan ilişkilidir.`;
      const wrongOpts = buildSectionQuizDistractors(correctOption, sentences, idx).map((d) => d.slice(0, 115));
      const correctIndex = idx % 4;
      const opts = [...wrongOpts];
      opts.splice(correctIndex, 0, correctOption);
      const examTip =
        (unitSents.length > 1 ? unitSents[1] : `${u.heading} konusunda ${nodes[0]?.label} ve sonucu arasındaki ayrımı netleştirin.`).slice(
          0,
          175,
        );

      return {
        id: `scene-${idx + 1}`,
        order: idx + 1,
        title: u.heading,
        turns,
        narration,
        diagramData: {
          diagramType: diagramPalette[idx % diagramPalette.length],
          mainTitle: u.heading,
          highlightMetric: examTip,
          nodes,
        },
        keyTakeaways: nodes.slice(0, 3).map((nd) => `${nd.label}: ${nd.subtext.slice(0, 110)}`),
        keyTerms: keyTerms.slice(idx, idx + 3).map((k) => ({ term: k.term, definition: k.definition })),
        examTip,
        checkpointQuestion: {
          question: `"${u.heading}" bölümü kapsamında hangisi doğrudur?`,
          options: opts.slice(0, 4),
          correctIndex,
          explanation: correctOption,
        },
      };
    });

    return {
      videoTitle: title,
      outline: sentences.slice(0, 3).join(' ') || `${course} — ${title} etkileşimli video dersi.`,
      overview: sentences.slice(0, 2).join(' ') || `${course} — ${title} etkileşimli video dersi.`,
      videoScript: scenes.map((s) => s.narration).join('\n\n'),
      totalEstimatedDurationSec: scenes.length * 60,
      scenes,
      keyFacts: sentences.slice(0, 5),
      keyTerms: keyTerms.slice(0, 8),
    };
  }

  // ---------------- SUMMARY ----------------
  const targetSections =
    effectiveDepth === 'short' ? 4 : effectiveDepth === 'standard' ? 6 : effectiveDepth === 'textbook' ? 9 : 7;
  const units = splitDocumentIntoUnits(cleanText, title, targetSections);

  const sections = units.map((u, idx) =>
    buildRichSummarySection({
      index: idx,
      heading: u.heading,
      pageRange: u.pageRange,
      unit: u,
      allSentences: sentences,
      keyTerms,
      domainMode: domain.mode,
      deepResearch: req.deepResearch,
      course,
    }),
  );

  const isVerbal = domain.mode === 'verbal';
  const comparativeMatrix =
    keyTerms.length >= 2
      ? {
          title: `${title} — ${isVerbal ? 'Kavram, Yaklaşım ve Ayrım Matrisi' : 'Kavram & Analiz Matrisi'}`,
          columns: isVerbal
            ? ['Kavram / İlke', 'Temel Tanım & Kapsam', 'Sınavda Ayırt Edici Nokta']
            : ['Kavram / Başlık', 'Kaynak Notlardaki Tanım & İşlev', 'Analitik Odak'],
          rows: keyTerms
            .slice(0, 6)
            .map((kt) => [kt.term, kt.definition.slice(0, 150), classifyClauseBadge(kt.definition)]),
        }
      : undefined;

  const focusModeLabel = isVerbal ? 'Sözel & Kuramsal Derin Sentez' : 'Analitik Akademik Sentez';
  const synthLead = `**${title}** (${domain.discipline} · ${focusModeLabel}) dokümanı **${sections.length} ana bölümde** sistemleştirilmiştir; temel tezi, neden–sonuç zincirini ve sınavlarda öne çıkan kavram ayrımlarını kapsar.`;
  const coreThesis =
    sentences.length > 0 ? sentences.slice(0, 3).join(' ') : cleanText.slice(0, 480);
  const overviewText = `${synthLead}\n\n${coreThesis}`.trim();

  const deepResearchTopics =
    req.deepResearch && keyTerms.length >= 2
      ? keyTerms.slice(0, 3).map((kt) => ({
          topic: `${kt.term} — Kuramsal ve Sınav Bağlamı`,
          literatureContext: `${kt.term}, "${title}" metninde ${kt.definition.slice(0, 140)} ekseninde konumlanır.`,
          realWorldApplication: isVerbal
            ? 'Klasik veya yorum sorularında bu kavramın ortaya çıkış gerekçesi, karşıt görüşlerle farkı ve kurumsal yansıması birlikte tartışılmalıdır.'
            : 'Kuramsal varsayımlar ile uygulamalı politika veya sayısal model çıktıları arasındaki ilişkiyi test eden sorularda belirleyicidir.',
        }))
      : [];

  return {
    overview: overviewText,
    disciplineTag: isVerbal ? `${domain.discipline} · Sözel Özet` : domain.discipline,
    keyPoints: (sentences.length > 0 ? sentences : [title])
      .slice(0, 8)
      .map((s) => highlightKeyTermsInProse(s.slice(0, 195), keyTerms.slice(0, 4).map((k) => k.term))),
    sections,
    teacherEmphasis: keyTerms.slice(0, 5).map((kt, idx) => ({
      point: kt.term,
      whyImportant: isVerbal
        ? `Kavramsal sınır ve karşıt yaklaşımlarla farkı üzerinden klasik/test sorusu potansiyeli taşır: "${kt.definition.slice(0, 140)}"`
        : kt.definition.slice(0, 160),
      examProbability: idx < 2 ? 'Yüksek' : 'Orta',
    })),
    comparativeMatrix,
    deepResearchTopics,
    keyTerms: keyTerms.slice(0, 10),
    studyChecklist: sections.map((s) =>
      isVerbal
        ? `"${s.heading}" bölümündeki temel kavramları, neden–sonuç zincirini ve karşıt görüş farklarını kendi cümlelerimle özetleyebilirim.`
        : `"${s.heading}" bölümünün ana fikirlerini, mekanizmasını ve ayırt edici koşullarını açıklayabilirim.`,
    ),
    metadata: {
      sourceMode: 'local',
      deepResearch: Boolean(req.deepResearch),
      summaryDepth: effectiveDepth,
    },
  };
}
