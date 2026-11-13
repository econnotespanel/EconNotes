/**
 * Deterministic High-Quality Local Study Material Synthesizer
 * Acts both as instant offline fallback and structured domain-faithful parser
 * without injecting foreign-domain boilerplate into user notes.
 */

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
  'var', 'yok', 'the', 'and', 'for', 'with', 'that', 'this', 'from', 'into', 'are',
  'sayfa', 'slayt', 'bölüm', 'ders', 'konu', 'not', 'notlar',
]);

function normalizeSourceText(raw: string): string {
  return String(raw || '')
    .split('\0')
    .join('')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

function splitIntoSentences(text: string): string[] {
  const cleaned = text
    .replace(/---\s*(Sayfa|Slayt)\s*\d+\s*---/gi, '\n')
    .replace(/===\s*KAYNAK\s*\d+:[^=]+===/gi, '\n')
    .trim();

  const rawSegments = cleaned
    .split(/(?<=[.!?])\s+|\n{1,}/)
    .map((s) => s.replace(/^[-•*]\s*/, '').trim())
    .filter((s) => s.length >= 24 && s.length <= 520);

  const unique: string[] = [];
  const seen = new Set<string>();
  for (const seg of rawSegments) {
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

  // 1. Explicit colon / definition patterns (e.g. "Marjinal Fayda: ...")
  for (const s of sentences) {
    if (terms.length >= 10) break;
    const match = s.match(/^([A-ZÇĞİÖŞÜ][^\n:–-]{2,42})\s*[:–-]\s*(.{18,220})$/);
    if (match) {
      const term = match[1].trim();
      const def = match[2].trim();
      const key = term.toLowerCase();
      if (!seen.has(key) && !STOPWORDS.has(key)) {
        seen.add(key);
        terms.push({ term, definition: def });
      }
    }
  }

  // 2. Frequency-scored multi-word or domain capitalized phrases from actual source text
  if (terms.length < 6) {
    const freq = new Map<string, number>();
    const words = text
      .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 4 && !STOPWORDS.has(w.toLowerCase()));

    for (const w of words) {
      const lower = w.toLowerCase();
      if (/^\d+$/.test(lower)) continue;
      freq.set(w, (freq.get(w) || 0) + 1);
    }

    const sortedWords = Array.from(freq.entries())
      .filter(([w]) => !seen.has(w.toLowerCase()))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12);

    for (const [word] of sortedWords) {
      if (terms.length >= 8) break;
      const lower = word.toLowerCase();
      if (seen.has(lower)) continue;
      const hostSentence = sentences.find((s) => s.toLowerCase().includes(lower));
      if (hostSentence) {
        seen.add(lower);
        terms.push({
          term: word.charAt(0).toUpperCase() + word.slice(1),
          definition: hostSentence.slice(0, 210),
        });
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
    if (isHeadingCandidate(line) && currentLines.length >= 2) {
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
    const groupCount = Math.min(
      targetSections,
      Math.max(2, Math.ceil(allSentences.length / 4)),
    );
    const perGroup = Math.max(1, Math.ceil(allSentences.length / groupCount));
    normalizedBlocks = Array.from({ length: groupCount }, (_, i) => {
      const slice = allSentences.slice(i * perGroup, (i + 1) * perGroup);
      const firstWords = (slice[0] || '')
        .split(/\s+/)
        .slice(0, 6)
        .join(' ')
        .replace(/[,.;:!?]$/, '');
      return {
        heading: firstWords ? `${fallbackTitle}: ${firstWords}` : `${fallbackTitle} — Kısım ${i + 1}`,
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

export function generateClientStudyMaterial(req: GeneratePayload): Record<string, unknown> {
  const cleanText = normalizeSourceText(req.noteContext || '');
  const title = req.noteTitle?.trim() || 'Çalışma Materyali';
  const course = req.course?.trim() || 'Akademik Ders';
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
    const units = splitDocumentIntoUnits(cleanText, title, 5);
    const visualTypes = [
      'concept_diagram',
      'process_flow',
      'comparison_matrix',
      'timeline_arc',
      'case_callout',
    ] as const;

    const scenes = units.slice(0, 6).map((u, idx) => {
      const narration = u.paragraphs.join(' ').slice(0, 650) || `${u.heading} bölümü inceleniyor.`;
      const bullets = (u.bullets.length > 0 ? u.bullets : u.sentences).slice(0, 4).map((b) => b.slice(0, 110));
      const hostTerm = keyTerms[idx % Math.max(1, keyTerms.length)]?.term || u.heading;
      const correctOption = u.sentences[0]?.slice(0, 120) || `${u.heading} ile doğrudan ilişkilidir.`;
      const wrongOpts = buildSectionQuizDistractors(correctOption, sentences, idx).map((d) => d.slice(0, 110));
      const correctIndex = idx % 4;
      const opts = [...wrongOpts];
      opts.splice(correctIndex, 0, correctOption);

      return {
        id: `scene-${idx + 1}`,
        order: idx + 1,
        title: u.heading,
        conceptTag: hostTerm,
        visualType: visualTypes[idx % visualTypes.length],
        visualData: {
          bullets,
          formula: u.formulas[0] || undefined,
        },
        narration,
        subtitleChunks: [
          {
            text: narration.slice(0, 160),
            startOffsetSec: 0,
            endOffsetSec: 18,
          },
        ],
        estimatedDurationSec: 45,
        keyTerms: keyTerms.slice(idx, idx + 2).map((k) => ({ term: k.term, definition: k.definition })),
        examTip: u.sentences[1]?.slice(0, 140),
        checkpointQuestion: {
          question: `"${u.heading}" bölümü kapsamında hangisi doğrudur?`,
          options: opts.slice(0, 4),
          correctIndex,
          explanation: correctOption,
        },
      };
    });

    return {
      overview: sentences.slice(0, 2).join(' ') || `${course} — ${title} etkileşimli video dersi.`,
      videoScript: scenes.map((s) => s.narration).join('\n\n'),
      totalEstimatedDurationSec: scenes.length * 45,
      scenes,
      keyTerms: keyTerms.slice(0, 8),
    };
  }

  // ---------------- SUMMARY ----------------
  const targetSections =
    effectiveDepth === 'short' ? 4 : effectiveDepth === 'standard' ? 6 : effectiveDepth === 'textbook' ? 9 : 7;
  const units = splitDocumentIntoUnits(cleanText, title, targetSections);

  const sections = units.map((u, idx) => {
    const bodyBlocks: string[] = [];
    if (u.paragraphs.length > 0) {
      bodyBlocks.push(u.paragraphs.join('\n\n'));
    }
    if (u.bullets.length > 0) {
      bodyBlocks.push(`#### Öne Çıkan Noktalar\n${u.bullets.map((b) => `- ${b}`).join('\n')}`);
    }
    if (u.formulas.length > 0) {
      bodyBlocks.push(`#### Kaynak İfade / İlişki\n${u.formulas.map((f) => `> ${f}`).join('\n')}`);
    }

    const takeaways = (u.bullets.length >= 2 ? u.bullets : u.sentences)
      .slice(0, 3)
      .map((t) => t.slice(0, 150));

    const qSentence = u.sentences[0] || u.paragraphs[0] || '';
    const checkpointOpts = buildSectionQuizDistractors(qSentence, sentences, idx);
    const correctIndex = idx % 4;
    checkpointOpts.splice(correctIndex, 0, qSentence.slice(0, 130) || `${u.heading} temel bulgusu`);

    return {
      index: idx,
      heading: u.heading,
      pageRange: u.pageRange,
      content: bodyBlocks.join('\n\n') || cleanText.slice(0, 800),
      takeaways,
      checkpointQuestion:
        qSentence.length > 20
          ? {
              question: `${u.heading} bölümüne göre aşağıdaki çıkarımlardan hangisi geçerlidir?`,
              options: checkpointOpts.slice(0, 4),
              correctIndex,
              explanation: `Doğrudan kaynak metinden: "${qSentence.slice(0, 180)}"`,
            }
          : undefined,
    };
  });

  const comparativeMatrix =
    keyTerms.length >= 2
      ? {
          title: `${title} — Kavram Özeti Matrisi`,
          columns: ['Kavram / Başlık', 'Kaynak Notlardaki Tanım & İşlev'],
          rows: keyTerms.slice(0, 5).map((kt) => [kt.term, kt.definition.slice(0, 140)]),
        }
      : undefined;

  return {
    overview:
      sentences.slice(0, 3).join(' ') ||
      cleanText.slice(0, 480) ||
      `${course} — ${title} çalışma özeti.`,
    keyPoints: (sentences.length > 0 ? sentences : [title]).slice(0, 8).map((s) => s.slice(0, 180)),
    sections,
    teacherEmphasis: keyTerms.slice(0, 4).map((kt) => ({
      point: kt.term,
      whyImportant: kt.definition.slice(0, 150),
      examProbability: 'Orta',
    })),
    comparativeMatrix,
    keyTerms: keyTerms.slice(0, 10),
    studyChecklist: sections.map((s) => `"${s.heading}" bölümünün ana fikirlerini kendi cümlelerimle anlatabilirim.`),
    metadata: {
      sourceMode: 'local',
      deepResearch: Boolean(req.deepResearch),
      summaryDepth: effectiveDepth,
    },
  };
}
