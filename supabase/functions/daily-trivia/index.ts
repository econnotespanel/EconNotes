import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  enforceRateLimit,
  getAuthenticatedUser,
  isTrustedOrigin,
  jsonResponse,
  preflightResponse,
  readJsonBody,
  RequestError,
} from '../_shared/request-security.ts';
import { createChatCompletion } from '../_shared/openai-gateway.ts';
import {
  CURATED_TRIVIA_BANK,
  TRIVIA_CATEGORIES,
  type TriviaCategory,
  type TriviaDifficulty,
  type TriviaQuestionRecord,
} from './question-bank.ts';
import { EXTRA_TRIVIA_BANK } from './question-bank-extra.ts';

const ALL_CURATED_TRIVIA_BANK: TriviaQuestionRecord[] = [
  ...CURATED_TRIVIA_BANK,
  ...EXTRA_TRIVIA_BANK,
];

const TOTAL_QUESTIONS = 15;
const XP_PER_CORRECT = 25;
const MAX_AWAY_MS = 5000; // Strict 5-second server-authoritative return window
const SILENT_INACTIVITY_MS = 15_000; // Catch force-killed / background-frozen PWAs without pagehide
const GRAND_PRIZE_DURATION_MS = 2 * 60 * 60 * 1000; // 2 hours real-time
const TIME_LIMIT_MS = 15 * 60 * 1000; // 15 minutes total for all 15 questions
const TIME_GRACE_MS = 4000; // network latency tolerance for final answer / auto-finish
const DISJOINT_BUCKET_COUNT = 22;

interface StoredTriviaQuestion extends TriviaQuestionRecord {
  hash: string;
  conceptKey?: string;
}

const TRIVIA_STOPWORDS = new Set([
  've', 'veya', 'ile', 'icin', 'olan', 'olarak', 'bir', 'bu', 'su', 'o', 'da', 'de',
  'hangi', 'hangisi', 'hangisidir', 'kimdir', 'nedir', 'kac', 'nerede', 'asagidakilerden',
  'asagidaki', 'yilda', 'yilinda', 'tarihte', 'dunyanin', 'turkiyenin', 'ad', 'verilir',
  'tarafindan', 'bilinen', 'en', 'ilk', 'yer', 'alir', 'bulunur',
]);

function foldTrServer(text: string): string {
  return String(text || '')
    .toLocaleLowerCase('tr-TR')
    .replace(/ç/g, 'c')
    .replace(/ğ/g, 'g')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ş/g, 's')
    .replace(/ü/g, 'u')
    .replace(/â/g, 'a')
    .replace(/î/g, 'i')
    .replace(/û/g, 'u')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function triviaTokensServer(text: string): Set<string> {
  const out = new Set<string>();
  for (const w of foldTrServer(text).split(' ')) {
    if (w.length < 3 || TRIVIA_STOPWORDS.has(w)) continue;
    out.add(w);
    if (w.length >= 6) out.add(w.slice(0, 6));
  }
  return out;
}

function buildTriviaConceptKey(q: Pick<TriviaQuestionRecord, 'category' | 'options' | 'correctIndex' | 'question'>): string {
  const cat = foldTrServer(q.category).slice(0, 8);
  const ans = foldTrServer(q.options[q.correctIndex] || '').slice(0, 32);
  const stemKey = Array.from(triviaTokensServer(q.question)).slice(0, 3).sort().join('_');
  return `${cat}:${ans || stemKey}`;
}

function areQuestionsSemanticallyDuplicate(
  a: Pick<TriviaQuestionRecord, 'category' | 'question' | 'options' | 'correctIndex'>,
  b: Pick<TriviaQuestionRecord, 'category' | 'question' | 'options' | 'correctIndex'>,
): boolean {
  const normA = foldTrServer(a.question);
  const normB = foldTrServer(b.question);
  if (!normA || !normB) return false;
  if (normA === normB) return true;
  const setA = triviaTokensServer(a.question);
  const setB = triviaTokensServer(b.question);
  let inter = 0;
  for (const t of setA) {
    if (setB.has(t)) inter++;
  }
  const union = setA.size + setB.size - inter;
  const jaccard = union > 0 ? inter / union : 0;
  const ansA = foldTrServer(a.options[a.correctIndex] || '');
  const ansB = foldTrServer(b.options[b.correctIndex] || '');
  const ansOverlap =
    ansA.length >= 4 &&
    ansB.length >= 4 &&
    (ansA === ansB || ansA.includes(ansB) || ansB.includes(ansA));
  if (a.category === b.category && ansOverlap && jaccard >= 0.25) return true;
  if (ansOverlap && jaccard >= 0.35) return true;
  return jaccard >= 0.72;
}

interface SanitizedTriviaQuestion {
  index: number;
  category: TriviaCategory;
  difficulty: TriviaDifficulty;
  question: string;
  options: [string, string, string, string];
}

function getIstanbulDateParts(now = new Date()): { dateStr: string; resetsAtIso: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);

  const y = Number(parts.find((p) => p.type === 'year')?.value ?? now.getUTCFullYear());
  const m = Number(parts.find((p) => p.type === 'month')?.value ?? now.getUTCMonth() + 1);
  const d = Number(parts.find((p) => p.type === 'day')?.value ?? now.getUTCDate());

  const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  // Next midnight in Europe/Istanbul (permanent UTC+03:00)
  const tomorrowUtc = new Date(Date.UTC(y, m - 1, d + 1, 0, 0, 0) - 3 * 60 * 60 * 1000);
  return { dateStr, resetsAtIso: tomorrowUtc.toISOString() };
}

async function hashQuestionText(text: string): Promise<string> {
  const normalized = text
    .toLocaleLowerCase('tr-TR')
    .replace(/[^\p{L}\p{N}]+/gu, '')
    .trim();
  const data = new TextEncoder().encode(normalized);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32);
}

function dateSeed(dateStr: string): number {
  let h = 2166136261;
  for (let i = 0; i < dateStr.length; i++) {
    h ^= dateStr.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seededShuffle<T>(items: T[], seed: number): T[] {
  const arr = [...items];
  let s = seed || 1;
  for (let i = arr.length - 1; i > 0; i--) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const j = s % (i + 1);
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

const VALID_CATEGORY_SET = new Set<string>(TRIVIA_CATEGORIES);

function normalizeCategory(raw: unknown): TriviaCategory {
  const s = String(raw || '').trim();
  if (VALID_CATEGORY_SET.has(s)) return s as TriviaCategory;
  const lower = s.toLocaleLowerCase('tr-TR');
  if (lower.includes('tarih')) return 'Tarih';
  if (lower.includes('coğraf') || lower.includes('cograf')) return 'Coğrafya';
  if (lower.includes('bilim') || lower.includes('fizik') || lower.includes('kimya') || lower.includes('biyoloji')) return 'Bilim';
  if (lower.includes('sanat') || lower.includes('müzik') || lower.includes('sinema') || lower.includes('resim')) return 'Sanat';
  if (lower.includes('spor') || lower.includes('olimpiyat') || lower.includes('futbol')) return 'Spor';
  if (lower.includes('teknoloji') || lower.includes('bilgisayar') || lower.includes('yazılım')) return 'Teknoloji';
  if (lower.includes('edebiyat') || lower.includes('roman') || lower.includes('şiir')) return 'Edebiyat';
  return 'Güncel Genel Kültür';
}

function normalizeDifficulty(raw: unknown): TriviaDifficulty {
  const lower = String(raw || '').toLocaleLowerCase('tr-TR');
  if (lower === 'easy' || lower === 'kolay') return 'easy';
  if (lower === 'hard' || lower === 'zor') return 'hard';
  return 'medium';
}

async function generateDailyAiQuestions(
  dateStr: string,
  userId: string,
  usedHashes: Set<string>,
  usedConcepts: Set<string>,
  neededCount = TOTAL_QUESTIONS,
): Promise<StoredTriviaQuestion[]> {
  const hasAnyKey = Boolean(
    Deno.env.get('OPENAI_API_KEY') ||
      Deno.env.get('LOVABLE_API_KEY') ||
      Deno.env.get('GEMINI_API_KEY') ||
      Deno.env.get('GOOGLE_API_KEY'),
  );
  if (!hasAnyKey || neededCount <= 0) return [];
  const userTag = dateSeed(`${dateStr}::${userId}`).toString(36);

  try {
    const res = await createChatCompletion({
      model: 'gpt-4o-mini',
      temperature: 0.78,
      max_tokens: 3400,
      timeoutMs: 18_000,
      responseFormat: 'json_object',
      allowPublicFallback: false,
      messages: [
        {
          role: 'system',
          content: `Sen üniversite öğrencilerine yönelik güvenilir Türkçe Günlük Genel Kültür Bilgi Yarışması soru editörüsün.
Tarih tohumu: ${dateStr} | Kişisel oturum tohumu: ${userTag}.
Tam olarak ${neededCount} adet, birbirinden ve önceki oturumlardan tamamen farklı, %100 doğrulanmış ve tartışmasız tek doğru cevabı olan 4 seçenekli Türkçe genel kültür sorusu üret.
Kategori dağılımı 8 alana dengeli yayılsın (Tarih, Coğrafya, Bilim, Sanat, Spor, Teknoloji, Edebiyat, Güncel Genel Kültür).
Zorluk dağılımı dengeli olsun ("easy", "medium", "hard").
Yalnızca şu JSON formatında yanıt ver:
{
  "questions": [
    {
      "category": "Tarih",
      "difficulty": "easy",
      "question": "Soru metni?",
      "options": ["A metni", "B metni", "C metni", "D metni"],
      "correctIndex": 0,
      "explanation": "1 cümlelik net ve doğru açıklama."
    }
  ]
}
KESİN KURAL: Doğru cevap kesin olgulara dayanmalıdır; muğlak, tartışmalı veya uydurma bilgi içeren soru ASLA üretme. Seçeneklerin başına "A)" gibi harf koyma.`,
        },
        {
          role: 'user',
          content: `${dateStr} tarihli oturum (${userTag}) için ${neededCount} özgün, daha önce sorulmamış ve birbirinden farklı genel kültür sorusu üret.`,
        },
      ],
    });

    const parsed = JSON.parse(res.content || '{}') as { questions?: unknown[] };
    if (!Array.isArray(parsed.questions)) return [];

    const valid: StoredTriviaQuestion[] = [];
    const localHashes = new Set<string>(usedHashes);
    const localConcepts = new Set<string>(usedConcepts);

    for (let i = 0; i < parsed.questions.length && valid.length < neededCount; i++) {
      const q = parsed.questions[i] as Record<string, unknown>;
      if (!q || typeof q.question !== 'string') continue;
      const questionText = q.question.trim();
      if (questionText.length < 15 || questionText.length > 340) continue;

      if (!Array.isArray(q.options) || q.options.length !== 4) continue;
      const opts = q.options.map((o) => String(o ?? '').replace(/^[A-D]\)\s*/i, '').trim());
      if (opts.some((o) => o.length === 0 || o.length > 140)) continue;
      if (new Set(opts.map((o) => o.toLocaleLowerCase('tr-TR'))).size < 4) continue;

      const correctIndex = Number(q.correctIndex);
      if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex > 3) continue;

      const hash = await hashQuestionText(questionText);
      const category = normalizeCategory(q.category);
      const candBase = {
        category,
        question: questionText,
        options: opts as [string, string, string, string],
        correctIndex: correctIndex as 0 | 1 | 2 | 3,
      };
      const conceptKey = buildTriviaConceptKey(candBase);
      if (
        localHashes.has(hash) ||
        localConcepts.has(conceptKey) ||
        valid.some((v) => areQuestionsSemanticallyDuplicate(v, candBase))
      ) {
        continue;
      }

      localHashes.add(hash);
      localConcepts.add(conceptKey);
      valid.push({
        id: `ai-${dateStr}-${userTag}-${valid.length + 1}`,
        category,
        difficulty: normalizeDifficulty(q.difficulty),
        question: questionText,
        options: opts as [string, string, string, string],
        correctIndex: correctIndex as 0 | 1 | 2 | 3,
        explanation:
          typeof q.explanation === 'string' && q.explanation.trim().length > 5
            ? q.explanation.trim().slice(0, 320)
            : `Doğru cevap: ${opts[correctIndex]}.`,
        hash,
        conceptKey,
      });
    }

    return valid;
  } catch (err) {
    console.warn('daily-trivia AI generation fell back to curated bank:', err);
    return [];
  }
}

async function selectBalancedCuratedQuestions(
  dateStr: string,
  userId: string,
  excludedHashes: Set<string>,
  excludedConcepts: Set<string>,
  neededCount: number,
  alreadySelected: StoredTriviaQuestion[],
  allowPoolReuseFallback = false,
): Promise<StoredTriviaQuestion[]> {
  if (neededCount <= 0) return [];
  const daySeed = dateSeed(dateStr);
  const userSeed = dateSeed(`${dateStr}::user::${userId}`);
  const picked: StoredTriviaQuestion[] = [];
  const takenHashes = new Set<string>([...excludedHashes, ...alreadySelected.map((q) => q.hash)]);
  const takenConcepts = new Set<string>([
    ...excludedConcepts,
    ...alreadySelected.map((q) => q.conceptKey || buildTriviaConceptKey(q)),
  ]);

  const catCounts = new Map<TriviaCategory, number>();
  for (const cat of TRIVIA_CATEGORIES) catCounts.set(cat, 0);
  for (const q of alreadySelected) {
    catCounts.set(q.category, (catCounts.get(q.category) || 0) + 1);
  }

  const bankWithHash: StoredTriviaQuestion[] = await Promise.all(
    ALL_CURATED_TRIVIA_BANK.map(async (q) => ({
      ...q,
      hash: await hashQuestionText(q.question),
      conceptKey: buildTriviaConceptKey(q),
    })),
  );

  // Partition each category's 45 questions into 22 disjoint daily buckets + user-specific offset
  const categoryPools = new Map<TriviaCategory, StoredTriviaQuestion[]>();
  for (const cat of TRIVIA_CATEGORIES) {
    const items = bankWithHash.filter((q) => q.category === cat);
    categoryPools.set(cat, seededShuffle(items, daySeed ^ dateSeed(cat)));
  }

  const bucket = userSeed % DISJOINT_BUCKET_COUNT;
  const rotatedCategories = seededShuffle(TRIVIA_CATEGORIES, userSeed ^ 0x517cc1b7);
  const canTake = (q: StoredTriviaQuestion, checkConcepts: boolean): boolean => {
    if (takenHashes.has(q.hash)) return false;
    if (checkConcepts && q.conceptKey && takenConcepts.has(q.conceptKey)) return false;
    if ([...alreadySelected, ...picked].some((p) => areQuestionsSemanticallyDuplicate(p, q))) return false;
    return true;
  };

  // Pass 1: Draw from this user's disjoint daily bucket first across all 8 domains
  for (let round = 0; round < 2 && picked.length < neededCount; round++) {
    const sortedCats = [...rotatedCategories].sort(
      (a, b) => (catCounts.get(a) || 0) - (catCounts.get(b) || 0),
    );
    for (const cat of sortedCats) {
      if (picked.length >= neededCount) break;
      const pool = categoryPools.get(cat) || [];
      const primaryIdx = (bucket * 2 + round) % Math.max(1, pool.length);
      let candidate = pool[primaryIdx];
      if (!candidate || !canTake(candidate, true)) {
        const startOffset = (bucket * 2 + 2) % Math.max(1, pool.length);
        candidate = undefined as unknown as StoredTriviaQuestion;
        for (let off = 0; off < pool.length; off++) {
          const item = pool[(startOffset + off) % pool.length];
          if (item && canTake(item, true)) {
            candidate = item;
            break;
          }
        }
      }
      if (candidate) {
        takenHashes.add(candidate.hash);
        if (candidate.conceptKey) takenConcepts.add(candidate.conceptKey);
        picked.push(candidate);
        catCounts.set(cat, (catCounts.get(cat) || 0) + 1);
      }
    }
  }

  // Pass 2: Any remaining unused & unclaimed question from full 360-question bank (user-seeded order)
  const userShuffledBank = seededShuffle(bankWithHash, userSeed ^ 0x9e3779b9);
  if (picked.length < neededCount) {
    for (const q of userShuffledBank) {
      if (picked.length >= neededCount) break;
      if (canTake(q, false)) {
        takenHashes.add(q.hash);
        if (q.conceptKey) takenConcepts.add(q.conceptKey);
        picked.push(q);
      }
    }
  }

  // Pass 3 (optional overflow ONLY if AI was unavailable and 360 bank exhausted today)
  if (allowPoolReuseFallback && picked.length < neededCount) {
    const pickedNow = new Set<string>([
      ...alreadySelected.map((q) => q.hash),
      ...picked.map((q) => q.hash),
    ]);
    for (const q of userShuffledBank) {
      if (picked.length >= neededCount) break;
      if (
        !pickedNow.has(q.hash) &&
        ![...alreadySelected, ...picked].some((p) => areQuestionsSemanticallyDuplicate(p, q))
      ) {
        pickedNow.add(q.hash);
        picked.push(q);
      }
    }
  }

  return picked;
}

function orderProgressively(questions: StoredTriviaQuestion[]): StoredTriviaQuestion[] {
  const rank: Record<TriviaDifficulty, number> = { easy: 0, medium: 1, hard: 2 };
  return [...questions].sort((a, b) => rank[a.difficulty] - rank[b.difficulty]);
}

/**
 * Per-user server-authoritative daily 15-question allocator:
 * - Persists a dedicated immutable set per (user_id, quiz_date) in `daily_trivia_user_sets`
 * - Uses atomic `daily_trivia_daily_assignments` primary-key claims so concurrent users never receive the same questions
 * - Checks `daily_trivia_user_history` + semantic concept similarity so past questions aren't repeated
 * - Generates verified AI questions automatically when daily curated capacity is exhausted
 */
async function ensureUserDailyQuizSet(
  admin: ReturnType<typeof createClient>,
  userId: string,
  quizDate: string,
): Promise<{ questions: StoredTriviaQuestion[]; sourceMode: string }> {
  // 1. Check if this user already has a locked daily 15-question set for today (preserved on reload/re-entry)
  const { data: existingUserSet, error: readUserSetErr } = await admin
    .from('daily_trivia_user_sets')
    .select('questions, source_mode')
    .eq('user_id', userId)
    .eq('quiz_date', quizDate)
    .maybeSingle();

  const perUserTablesAvailable =
    !readUserSetErr || !String(readUserSetErr.message || '').includes('daily_trivia_user_sets');

  if (
    perUserTablesAvailable &&
    existingUserSet &&
    Array.isArray((existingUserSet as { questions?: unknown[] }).questions)
  ) {
    const qs = (existingUserSet as { questions: StoredTriviaQuestion[]; source_mode?: string }).questions;
    if (qs.length === TOTAL_QUESTIONS) {
      return { questions: qs, sourceMode: existingUserSet.source_mode || 'curated_per_user' };
    }
  }

  // Fallback path if new per-user migration has not yet been applied on DB:
  // Still generate deterministic per-user disjoint 15-question set from the 360-question bank!
  if (!perUserTablesAvailable) {
    const picked = await selectBalancedCuratedQuestions(
      quizDate,
      userId,
      new Set<string>(),
      new Set<string>(),
      TOTAL_QUESTIONS,
      [],
      true,
    );
    return { questions: orderProgressively(picked).slice(0, TOTAL_QUESTIONS), sourceMode: 'curated_partitioned' };
  }

  // 2. Load per-user historical questions/concepts + all questions already assigned to OTHER users today
  const [userHistRes, todayAssignRes] = await Promise.all([
    admin
      .from('daily_trivia_user_history')
      .select('question_hash, concept_key')
      .eq('user_id', userId)
      .limit(5000),
    admin
      .from('daily_trivia_daily_assignments')
      .select('question_hash, concept_key')
      .eq('quiz_date', quizDate)
      .limit(10000),
  ]);

  const excludedHashes = new Set<string>();
  const excludedConcepts = new Set<string>();

  for (const row of userHistRes.data || []) {
    const h = (row as { question_hash?: string }).question_hash;
    const c = (row as { concept_key?: string }).concept_key;
    if (typeof h === 'string' && h) excludedHashes.add(h);
    if (typeof c === 'string' && c) excludedConcepts.add(c);
  }
  for (const row of todayAssignRes.data || []) {
    const h = (row as { question_hash?: string }).question_hash;
    const c = (row as { concept_key?: string }).concept_key;
    if (typeof h === 'string' && h) excludedHashes.add(h);
    if (typeof c === 'string' && c) excludedConcepts.add(c);
  }

  // 3. Draw unclaimed, unseen curated questions first, then claim atomically in daily_trivia_daily_assignments
  const claimedQuestions: StoredTriviaQuestion[] = [];
  let usedAiCount = 0;

  const tryClaimCandidates = async (candidates: StoredTriviaQuestion[]) => {
    for (const cand of candidates) {
      if (claimedQuestions.length >= TOTAL_QUESTIONS) break;
      const { error: claimErr } = await admin.from('daily_trivia_daily_assignments').insert({
        quiz_date: quizDate,
        question_hash: cand.hash,
        assigned_user_id: userId,
        category: cand.category,
        concept_key: cand.conceptKey || buildTriviaConceptKey(cand),
      });
      if (!claimErr) {
        claimedQuestions.push(cand);
        excludedHashes.add(cand.hash);
        if (cand.conceptKey) excludedConcepts.add(cand.conceptKey);
      } else {
        excludedHashes.add(cand.hash);
      }
    }
  };

  for (let round = 0; round < 2 && claimedQuestions.length < TOTAL_QUESTIONS; round++) {
    const curatedBatch = await selectBalancedCuratedQuestions(
      quizDate,
      userId,
      excludedHashes,
      excludedConcepts,
      TOTAL_QUESTIONS - claimedQuestions.length,
      claimedQuestions,
      false,
    );
    if (curatedBatch.length === 0) break;
    await tryClaimCandidates(curatedBatch);
  }

  // 4. If daily curated capacity is exhausted, generate fresh verified AI questions for this user
  if (claimedQuestions.length < TOTAL_QUESTIONS) {
    const aiNeeded = TOTAL_QUESTIONS - claimedQuestions.length;
    const aiBatch = await generateDailyAiQuestions(
      quizDate,
      userId,
      excludedHashes,
      excludedConcepts,
      aiNeeded + 3,
    );
    const beforeAi = claimedQuestions.length;
    await tryClaimCandidates(aiBatch);
    usedAiCount = claimedQuestions.length - beforeAi;
  }

  // 5. Last-resort offline overflow ONLY if both 360 bank exhausted AND AI unavailable
  if (claimedQuestions.length < TOTAL_QUESTIONS) {
    const userOnlyHistory = new Set<string>(
      (userHistRes.data || [])
        .map((r) => (r as { question_hash?: string }).question_hash)
        .filter((h): h is string => typeof h === 'string' && h.length > 0),
    );
    const overflow = await selectBalancedCuratedQuestions(
      quizDate,
      `${userId}-overflow`,
      userOnlyHistory,
      new Set<string>(),
      TOTAL_QUESTIONS - claimedQuestions.length,
      claimedQuestions,
      true,
    );
    claimedQuestions.push(...overflow);
  }

  const finalQuestions = orderProgressively(claimedQuestions).slice(0, TOTAL_QUESTIONS);
  const sourceMode =
    usedAiCount === TOTAL_QUESTIONS
      ? 'ai_per_user'
      : usedAiCount > 0
      ? 'hybrid_per_user'
      : 'curated_per_user';

  // 6. Lock immutable set for (user_id, quiz_date)
  const { error: insErr } = await admin.from('daily_trivia_user_sets').insert({
    user_id: userId,
    quiz_date: quizDate,
    questions: finalQuestions,
    question_hashes: finalQuestions.map((q) => q.hash),
    source_mode: sourceMode,
  });

  if (insErr) {
    const { data: raceRow } = await admin
      .from('daily_trivia_user_sets')
      .select('questions, source_mode')
      .eq('user_id', userId)
      .eq('quiz_date', quizDate)
      .maybeSingle();
    if (raceRow && Array.isArray((raceRow as { questions?: unknown[] }).questions)) {
      return {
        questions: (raceRow as { questions: StoredTriviaQuestion[] }).questions,
        sourceMode: (raceRow as { source_mode?: string }).source_mode || sourceMode,
      };
    }
  }

  // 7. Persist per-user history so future days never repeat these questions for this user
  const histPayload = finalQuestions.map((q) => ({
    user_id: userId,
    question_hash: q.hash,
    quiz_date: quizDate,
    category: q.category,
    concept_key: q.conceptKey || buildTriviaConceptKey(q),
  }));
  await admin
    .from('daily_trivia_user_history')
    .upsert(histPayload, { onConflict: 'user_id,question_hash', ignoreDuplicates: true });

  return { questions: finalQuestions, sourceMode };
}

function sanitizeQuestions(questions: StoredTriviaQuestion[]): SanitizedTriviaQuestion[] {
  return questions.map((q, index) => ({
    index,
    category: q.category,
    difficulty: q.difficulty,
    question: q.question,
    options: q.options,
  }));
}

async function addUserPointsAtomic(
  admin: ReturnType<typeof createClient>,
  userId: string,
  amount: number,
  reason: string,
  transactionId: string,
  attemptId: string,
  metadata: Record<string, unknown>,
): Promise<{ points: number; alreadyCredited: boolean }> {
  // Primary path: atomic single-transaction credit_xp_atomic RPC
  const { data: rpcData, error: rpcErr } = await admin.rpc('credit_xp_atomic', {
    _user_id: userId,
    _amount: amount,
    _reason: reason,
    _source: 'daily_trivia',
    _transaction_id: transactionId,
    _source_ref: attemptId,
    _metadata: metadata,
  });

  if (!rpcErr && rpcData) {
    const row = Array.isArray(rpcData) ? rpcData[0] : rpcData;
    if (row && typeof row.points === 'number') {
      return {
        points: Number(row.points),
        alreadyCredited: Boolean(row.already_credited),
      };
    }
  }

  // Fallback if credit_xp_atomic migration isn't applied yet (idempotent by reason)
  const { data: existingEv } = await admin
    .from('point_events')
    .select('id')
    .eq('user_id', userId)
    .eq('reason', reason)
    .limit(1)
    .maybeSingle();

  const { data: existing } = await admin
    .from('user_points')
    .select('points')
    .eq('user_id', userId)
    .maybeSingle();

  const current = Number((existing as { points?: number } | null)?.points ?? 0);
  if (existingEv) {
    return { points: current, alreadyCredited: true };
  }

  const nextPoints = current + amount;
  const nowIso = new Date().toISOString();

  await admin.from('point_events').insert({
    user_id: userId,
    amount,
    reason,
  });

  if (existing) {
    await admin
      .from('user_points')
      .update({ points: nextPoints, updated_at: nowIso })
      .eq('user_id', userId);
  } else {
    await admin
      .from('user_points')
      .insert({ user_id: userId, points: nextPoints, updated_at: nowIso });
  }

  return { points: nextPoints, alreadyCredited: false };
}

async function cancelAttemptAndRevokeRewards(
  admin: ReturnType<typeof createClient>,
  attempt: Record<string, any>,
  reason: string,
): Promise<{ attempt: Record<string, any>; xpRevoked: number; newUserPointsTotal: number | null }> {
  // Primary path: atomic PostgreSQL RPC
  const { data: rpcRes, error: rpcErr } = await admin.rpc('trivia_cancel_attempt', {
    _attempt_id: attempt.id,
    _reason: reason,
    _actor_user_id: attempt.user_id,
  });

  if (!rpcErr && rpcRes && (rpcRes as { ok?: boolean }).ok) {
    const { data: fresh } = await admin
      .from('daily_trivia_attempts')
      .select('*')
      .eq('id', attempt.id)
      .maybeSingle();
    const resObj = rpcRes as { xpRevoked?: number; newUserPointsTotal?: number | null };
    return {
      attempt: (fresh as Record<string, any>) || {
        ...attempt,
        status: 'cancelled',
        cancel_reason: reason,
        xp_earned: 0,
        grand_prize_awarded: false,
        unlimited_expires_at: null,
        leave_started_at: null,
        grace_expires_at: null,
      },
      xpRevoked: Number(resObj.xpRevoked ?? 0),
      newUserPointsTotal:
        typeof resObj.newUserPointsTotal === 'number' ? resObj.newUserPointsTotal : null,
    };
  }

  const nowIso = new Date().toISOString();
  const userId = String(attempt.user_id);
  const quizDate = String(attempt.quiz_date);

  const { data: triviaEvents } = await admin
    .from('point_events')
    .select('id, amount')
    .eq('user_id', userId)
    .like('reason', `daily_trivia:${quizDate}:%`);

  let xpRevoked = 0;
  let newUserPointsTotal: number | null = null;

  if (Array.isArray(triviaEvents) && triviaEvents.length > 0) {
    xpRevoked = triviaEvents.reduce(
      (sum, row) => sum + Math.max(0, Number((row as { amount?: number }).amount) || 0),
      0,
    );
    const eventIds = triviaEvents.map((row) => (row as { id: string }).id);
    await admin.from('point_events').delete().in('id', eventIds);

    if (xpRevoked > 0) {
      const { data: ptsRow } = await admin
        .from('user_points')
        .select('points')
        .eq('user_id', userId)
        .maybeSingle();
      const currentPts = Number((ptsRow as { points?: number } | null)?.points ?? 0);
      newUserPointsTotal = Math.max(0, currentPts - xpRevoked);
      if (ptsRow) {
        await admin
          .from('user_points')
          .update({ points: newUserPointsTotal, updated_at: nowIso })
          .eq('user_id', userId);
      }
    }
  }

  const { data: updated } = await admin
    .from('daily_trivia_attempts')
    .update({
      status: 'cancelled',
      cancelled_at: nowIso,
      cancel_reason: reason,
      xp_earned: 0,
      grand_prize_awarded: false,
      unlimited_expires_at: null,
      leave_started_at: null,
    })
    .eq('id', attempt.id)
    .in('status', ['in_progress', 'grace_period'])
    .select('*')
    .maybeSingle();

  return {
    attempt: updated || {
      ...attempt,
      status: 'cancelled',
      cancelled_at: nowIso,
      cancel_reason: reason,
      xp_earned: 0,
      grand_prize_awarded: false,
      unlimited_expires_at: null,
      leave_started_at: null,
      grace_expires_at: null,
    },
    xpRevoked,
    newUserPointsTotal,
  };
}

function getCancelMessage(reason: string | null | undefined): string {
  switch (reason) {
    case 'page_reloaded':
      return 'Yarışma devam ederken bağlantı/oturum kuralı ihlal edildiği için katılımınız iptal edildi.';
    case 'inactivity_over_5s':
      return 'Yarışma oturumu uzun süre arka planda/pasif kaldığı için güvenlik kuralı gereği iptal edildi.';
    case 'away_over_5s':
    case 'left_screen_over_5s':
      return 'Yarışma sırasında 5 saniye içerisinde geri dönülmediği için katılımınız iptal edildi.';
    case 'navigated_away':
      return 'Yarışma ekranından çıkıldığı ve 5 saniye içerisinde geri dönülmediği için katılımınız iptal edildi.';
    default:
      return 'Yarışma sırasında 5 saniye içerisinde geri dönülmediği için katılımınız iptal edildi.';
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflightResponse(req);
  if (!isTrustedOrigin(req)) return jsonResponse(req, { error: 'Geçersiz kaynak.' }, 403);
  if (req.method !== 'POST') return jsonResponse(req, { error: 'Yalnızca POST desteklenir.' }, 405);

  const json = (body: unknown, status = 200) => jsonResponse(req, body, status);

  try {
    const authUser = await getAuthenticatedUser(req);
    if (!authUser?.id) return json({ error: 'Oturum geçersiz. Lütfen tekrar giriş yapın.' }, 401);
    const authUserId = authUser.id;

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    await enforceRateLimit(admin, `daily_trivia:${authUserId}`, 120, 300);

    const body = await readJsonBody<Record<string, unknown>>(req, 16_384);
    const action = String(body.action || 'status');
    const { dateStr: quizDate, resetsAtIso } = getIstanbulDateParts(new Date());

    // Fetch current user's active 2-hour unlimited pass (strictly from DB profiles — NEVER user_metadata!)
    const [profileRes, attemptRes, perfectCountRes, userPtsRes] = await Promise.all([
      admin.from('profiles').select('trivia_unlimited_until').eq('user_id', authUserId).maybeSingle(),
      admin
        .from('daily_trivia_attempts')
        .select('*')
        .eq('user_id', authUserId)
        .eq('quiz_date', quizDate)
        .maybeSingle(),
      admin
        .from('daily_trivia_attempts')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', authUserId)
        .eq('grand_prize_awarded', true),
      admin.from('user_points').select('points').eq('user_id', authUserId).maybeSingle(),
    ]);

    if (attemptRes.error && attemptRes.error.message.includes('daily_trivia_attempts')) {
      return json(
        { error: 'Günlük Bilgi Yarışması hizmeti şu anda bakımda. Lütfen kısa süre sonra tekrar deneyin.' },
        503,
      );
    }

    let attempt = attemptRes.data as Record<string, any> | null;
    const rawUnlimitedUntil = (profileRes.data as { trivia_unlimited_until?: string | null } | null)
      ?.trivia_unlimited_until;
    const activeUnlimitedUntil =
      rawUnlimitedUntil && Date.parse(rawUnlimitedUntil) > Date.now()
        ? rawUnlimitedUntil
        : null;
    const perfectWinsCount = perfectCountRes.count ?? 0;
    const currentUserPoints = Number((userPtsRes.data as { points?: number } | null)?.points ?? 0);

    // Helper: enforce 5-second away deadline + silent background kill on any active attempt
    const enforceServerAwayDeadline = async (): Promise<{
      cancelledNow: boolean;
      xpRevoked: number;
      newPoints: number | null;
    }> => {
      if (!attempt || (attempt.status !== 'in_progress' && attempt.status !== 'grace_period')) {
        return { cancelledNow: false, xpRevoked: 0, newPoints: null };
      }
      const nowMs = Date.now();
      if (attempt.leave_started_at || attempt.status === 'grace_period') {
        const leaveMs = attempt.leave_started_at ? Date.parse(String(attempt.leave_started_at)) : NaN;
        const graceMs = attempt.grace_expires_at
          ? Date.parse(String(attempt.grace_expires_at))
          : Number.isFinite(leaveMs)
            ? leaveMs + MAX_AWAY_MS
            : NaN;
        if (Number.isFinite(graceMs) && nowMs > graceMs) {
          const cancelled = await cancelAttemptAndRevokeRewards(admin, attempt, 'away_over_5s');
          attempt = cancelled.attempt;
          return {
            cancelledNow: true,
            xpRevoked: cancelled.xpRevoked,
            newPoints: cancelled.newUserPointsTotal,
          };
        }
      }
      if (attempt.status === 'in_progress' && attempt.last_heartbeat_at) {
        const hbMs = Date.parse(String(attempt.last_heartbeat_at));
        if (Number.isFinite(hbMs) && nowMs - hbMs > SILENT_INACTIVITY_MS) {
          const cancelled = await cancelAttemptAndRevokeRewards(admin, attempt, 'inactivity_over_5s');
          attempt = cancelled.attempt;
          return {
            cancelledNow: true,
            xpRevoked: cancelled.xpRevoked,
            newPoints: cancelled.newUserPointsTotal,
          };
        }
      }
      return { cancelledNow: false, xpRevoked: 0, newPoints: null };
    };

    // ---- 15 dakikalık toplam süre + sonuçlandırma yardımcıları ----
    let livePoints = currentUserPoints;

    const attemptDeadlineMs = (a: Record<string, any>): number => {
      const explicit = a.expires_at ? Date.parse(String(a.expires_at)) : NaN;
      if (Number.isFinite(explicit)) return explicit;
      const started = Date.parse(String(a.started_at));
      return (Number.isFinite(started) ? started : Date.now()) + TIME_LIMIT_MS;
    };
    const isAttemptExpired = (a: Record<string, any>): boolean =>
      Date.now() > attemptDeadlineMs(a) + TIME_GRACE_MS;

    const summarizeAttempt = (a: Record<string, any>) => {
      const done = a.status === 'completed';
      const answered = Number(a.answered_count ?? 0);
      const correct = done ? Number(a.correct_count ?? 0) : 0;
      const leaveIso = a.leave_started_at ? String(a.leave_started_at) : null;
      const graceIso = a.grace_expires_at
        ? String(a.grace_expires_at)
        : leaveIso && Number.isFinite(Date.parse(leaveIso))
          ? new Date(Date.parse(leaveIso) + MAX_AWAY_MS).toISOString()
          : null;
      return {
        id: a.id,
        sessionToken: a.session_token ?? a.id,
        status: a.status,
        currentIndex: Number(a.current_index ?? 0),
        answeredCount: answered,
        correctCount: correct,
        wrongCount: done ? answered - correct : 0,
        blankCount: done ? TOTAL_QUESTIONS - answered : 0,
        xpEarned: done ? Number(a.xp_earned ?? 0) : 0,
        xpCredited: Boolean(a.xp_credited ?? (done && Number(a.xp_earned ?? 0) > 0)),
        rewardTransactionId: a.reward_transaction_id ?? null,
        grandPrizeAwarded: Boolean(a.grand_prize_awarded),
        unlimitedExpiresAt: a.unlimited_expires_at ?? null,
        leaveStartedAt: leaveIso,
        graceExpiresAt: graceIso,
        lastActivityAt: a.last_activity_at ?? a.started_at,
        cancelReason: a.cancel_reason ?? null,
        cancelMessage:
          a.status === 'cancelled'
            ? getCancelMessage(a.cancel_reason)
            : a.status === 'expired'
              ? '15 dakikalık yarışma süresi dolduğu için oturum sonlandı.'
              : null,
        startedAt: a.started_at,
        deadlineAt: new Date(attemptDeadlineMs(a)).toISOString(),
        timeLimitSec: TIME_LIMIT_MS / 1000,
        timedOut: (done || a.status === 'expired') && a.cancel_reason === 'time_expired',
        completedAt: a.completed_at ?? null,
        cancelledAt: a.cancelled_at ?? null,
      };
    };

    const revealAnswerRow = (
      row: Record<string, unknown>,
      fullSet: StoredTriviaQuestion[],
      reveal: boolean,
    ): Record<string, unknown> => {
      const idx = Number(row.question_index);
      const base = { questionIndex: idx, selectedOption: Number(row.selected_option) };
      if (!reveal) return base;
      const qObj = fullSet[idx];
      return {
        ...base,
        isCorrect: Boolean(row.is_correct),
        xpAwarded: Number(row.xp_awarded ?? 0),
        correctIndex: qObj?.correctIndex,
        explanation: qObj?.explanation,
      };
    };

    const buildFinishPayload = async (a: Record<string, any>, pointsTotal: number) => {
      const { questions: fullSet } = await ensureUserDailyQuizSet(admin, String(a.user_id), String(a.quiz_date));
      const { data: rows } = await admin
        .from('daily_trivia_answers')
        .select('question_index, selected_option, is_correct, xp_awarded')
        .eq('attempt_id', a.id)
        .order('question_index', { ascending: true });
      const summary = summarizeAttempt(a);
      return {
        attempt: summary,
        answers: (rows || []).map((r) =>
          revealAnswerRow(r as Record<string, unknown>, fullSet, a.status === 'completed'),
        ),
        correctCount: summary.correctCount,
        wrongCount: summary.wrongCount,
        blankCount: summary.blankCount,
        xpEarned: summary.xpEarned,
        grandPrizeAwarded: summary.grandPrizeAwarded,
        unlimitedExpiresAt: summary.grandPrizeAwarded ? summary.unlimitedExpiresAt : activeUnlimitedUntil,
        newUserPointsTotal: pointsTotal,
        timedOut: summary.timedOut,
        serverNowIso: new Date().toISOString(),
      };
    };

    /**
     * Cevapları sunucuda değerlendirir; her doğru için 25 XP verir, 15/15 ise 2 saatlik sınırsız erişimi tanımlar.
     * Tek PostgreSQL atomik işlemi (`trivia_finalize_attempt` + `credit_xp_atomic`) kullanır; eşzamanlı ikinci çağrı ödülü tekrar veremez.
     */
    const finalizeAttempt = async (timedOut: boolean) => {
      const att = attempt as Record<string, any>;

      // Primary path: single atomic PostgreSQL RPC
      const { data: rpcFinal, error: rpcFinalErr } = await admin.rpc('trivia_finalize_attempt', {
        _attempt_id: att.id,
        _timed_out: timedOut,
        _actor_user_id: String(att.user_id),
      });

      if (rpcFinalErr) {
        console.error('daily-trivia trivia_finalize_attempt RPC error:', {
          code: rpcFinalErr.code ?? null,
          message: rpcFinalErr.message ?? 'unknown',
        });
      }

      if (!rpcFinalErr && rpcFinal) {
        const resObj = rpcFinal as Record<string, any>;
        const { data: fresh } = await admin
          .from('daily_trivia_attempts')
          .select('*')
          .eq('id', att.id)
          .single();
        attempt = (fresh as Record<string, any>) || att;
        if (typeof resObj.newUserPointsTotal === 'number') {
          livePoints = resObj.newUserPointsTotal;
        }
        if (attempt.status === 'completed' && attempt.grand_prize_awarded && attempt.unlimited_expires_at && !resObj.alreadyCompleted) {
          try {
            const { data: authUserRes } = await admin.auth.admin.getUserById(String(att.user_id));
            const existingMeta = (authUserRes?.user?.user_metadata || {}) as Record<string, unknown>;
            const prevPerfect = Number(existingMeta.trivia_perfect_wins || 0);
            await admin.auth.admin.updateUserById(String(att.user_id), {
              user_metadata: {
                ...existingMeta,
                trivia_unlimited_until: attempt.unlimited_expires_at,
                trivia_perfect_wins: prevPerfect + 1,
              },
            });
          } catch (metaErr) {
            console.warn('daily-trivia user_metadata update warning:', metaErr);
          }
        }
        return buildFinishPayload(attempt as Record<string, any>, livePoints);
      }

      // Fallback path if new RPC hasn't been deployed yet
      const { questions: fullSet } = await ensureUserDailyQuizSet(admin, String(att.user_id), String(att.quiz_date));
      const { data: rows } = await admin
        .from('daily_trivia_answers')
        .select('question_index, selected_option')
        .eq('attempt_id', att.id)
        .order('question_index', { ascending: true });

      const graded = (rows || []).map((r) => {
        const idx = Number((r as { question_index: number }).question_index);
        const sel = Number((r as { selected_option: number }).selected_option);
        return { idx, ok: Boolean(fullSet[idx]) && sel === fullSet[idx].correctIndex };
      });
      const correctRows = graded.filter((g) => g.ok);
      const correct = correctRows.length;
      const xp = correct * XP_PER_CORRECT;
      const perfect = correct === TOTAL_QUESTIONS;
      const nowIso = new Date().toISOString();
      const unlimited = perfect ? new Date(Date.now() + GRAND_PRIZE_DURATION_MS).toISOString() : null;
      const txId = `trivia:${att.id}`;

      const { data: claimed } = await admin
        .from('daily_trivia_attempts')
        .update({
          status: timedOut && graded.length === 0 ? 'expired' : 'completed',
          completed_at: nowIso,
          answered_count: graded.length,
          correct_count: correct,
          xp_earned: timedOut && graded.length === 0 ? 0 : xp,
          grand_prize_awarded: perfect,
          unlimited_expires_at: unlimited,
          leave_started_at: null,
          cancel_reason: timedOut ? 'time_expired' : null,
        })
        .eq('id', att.id)
        .in('status', ['in_progress', 'grace_period'])
        .select('*')
        .maybeSingle();

      if (!claimed) {
        const { data: fresh } = await admin
          .from('daily_trivia_attempts')
          .select('*')
          .eq('id', att.id)
          .single();
        attempt = (fresh as Record<string, any>) || att;
        return buildFinishPayload(attempt as Record<string, any>, livePoints);
      }

      attempt = claimed as Record<string, any>;

      if (correctRows.length > 0 && attempt.status === 'completed') {
        await admin
          .from('daily_trivia_answers')
          .update({ xp_awarded: XP_PER_CORRECT })
          .eq('attempt_id', att.id)
          .in(
            'question_index',
            correctRows.map((g) => g.idx),
          );
      }
      if (xp > 0 && attempt.status === 'completed') {
        const creditRes = await addUserPointsAtomic(
          admin,
          String(att.user_id),
          xp,
          `daily_trivia:${att.quiz_date}:final`,
          txId,
          String(att.id),
          { quiz_date: att.quiz_date, correct_count: correct, grand_prize: perfect },
        );
        livePoints = creditRes.points;
      }

      if (perfect && unlimited) {
        await admin.from('profiles').update({ trivia_unlimited_until: unlimited }).eq('user_id', att.user_id);
        try {
          const { data: authUserRes } = await admin.auth.admin.getUserById(String(att.user_id));
          const existingMeta = (authUserRes?.user?.user_metadata || {}) as Record<string, unknown>;
          const prevPerfect = Number(existingMeta.trivia_perfect_wins || 0);
          await admin.auth.admin.updateUserById(String(att.user_id), {
            user_metadata: {
              ...existingMeta,
              trivia_unlimited_until: unlimited,
              trivia_perfect_wins: prevPerfect + 1,
            },
          });
        } catch (metaErr) {
          console.warn('daily-trivia user_metadata update warning:', metaErr);
        }
      }

      return buildFinishPayload(attempt as Record<string, any>, livePoints);
    };

    // ==================== ACTION: STATUS (Strictly Read-Only w.r.t. grace_period!) ====================
    if (action === 'status') {
      if (attempt && (attempt.status === 'in_progress' || attempt.status === 'grace_period')) {
        const away = await enforceServerAwayDeadline();
        if (!away.cancelledNow && attempt && isAttemptExpired(attempt)) {
          await finalizeAttempt(true);
        }
        // CRITICAL: status NEVER clears leave_started_at or grace_period!
        // Only an explicit report_return from the visible DailyTrivia screen can resume from grace_period.
      }

      let questions: SanitizedTriviaQuestion[] | undefined;
      let answers: Array<Record<string, unknown>> = [];

      if (attempt) {
        const { data: ansRows } = await admin
          .from('daily_trivia_answers')
          .select('question_index, selected_option, is_correct, xp_awarded')
          .eq('attempt_id', attempt.id)
          .order('question_index', { ascending: true });

        let fullSet: StoredTriviaQuestion[] = [];
        if (
          attempt.status === 'in_progress' ||
          attempt.status === 'grace_period' ||
          attempt.status === 'completed'
        ) {
          const setObj = await ensureUserDailyQuizSet(admin, authUserId, quizDate);
          fullSet = setObj.questions;
          if (attempt.status === 'in_progress') {
            questions = sanitizeQuestions(fullSet);
          }
        }

        answers = (ansRows || []).map((r) =>
          revealAnswerRow(r as Record<string, unknown>, fullSet, attempt?.status === 'completed'),
        );
      }

      return json({
        quizDate,
        resetsAtIso,
        sessionStatus: attempt ? attempt.status : 'not_started',
        totalQuestions: TOTAL_QUESTIONS,
        xpPerCorrect: XP_PER_CORRECT,
        maxXp: TOTAL_QUESTIONS * XP_PER_CORRECT,
        serverNowIso: new Date().toISOString(),
        userPoints: livePoints,
        perfectWinsCount,
        unlimitedExpiresAt:
          attempt?.status === 'completed' && attempt.grand_prize_awarded
            ? attempt.unlimited_expires_at
            : activeUnlimitedUntil,
        attempt: attempt ? summarizeAttempt(attempt) : null,
        questions,
        answers,
      });
    }

    // ==================== ACTION: START ====================
    if (action === 'start') {
      if (attempt) {
        // Re-check expiration/cancellation before responding so stale status is updated
        if (attempt.status === 'in_progress' || attempt.status === 'grace_period') {
          await enforceServerAwayDeadline();
        }
        return json(
          {
            error:
              attempt.status === 'cancelled'
                ? 'Bugünkü yarışma hakkınız güvenlik iptali nedeniyle kapandı. Yarın yeni 15 soru ile tekrar katılabilirsiniz.'
                : attempt.status === 'expired'
                  ? 'Bugünkü yarışma süreniz dolduğu için oturum kapandı. Yarın yeni 15 soru ile tekrar katılabilirsiniz.'
                  : attempt.status === 'completed'
                    ? 'Bugünkü Günlük Genel Kültür Bilgi Yarışması’nı zaten tamamladınız. Her kullanıcı günde 1 kez katılabilir.'
                    : 'Devam eden bir yarışmanız zaten bulunuyor.',
            alreadyParticipated: true,
            status: attempt.status,
          },
          409,
        );
      }

      const { questions } = await ensureUserDailyQuizSet(admin, authUserId, quizDate);
      const nowIso = new Date().toISOString();
      const expiresAtIso = new Date(Date.now() + TIME_LIMIT_MS).toISOString();

      const insertPayload: Record<string, unknown> = {
        user_id: authUserId,
        quiz_date: quizDate,
        status: 'in_progress',
        current_index: 0,
        answered_count: 0,
        correct_count: 0,
        xp_earned: 0,
        started_at: nowIso,
        expires_at: expiresAtIso,
        last_activity_at: nowIso,
      };

      let { data: created, error: createErr } = await admin
        .from('daily_trivia_attempts')
        .insert(insertPayload)
        .select('*')
        .single();

      // Backwards compatibility if new columns aren't migrated yet
      if (createErr && String(createErr.message || '').includes('column')) {
        ({ data: created, error: createErr } = await admin
          .from('daily_trivia_attempts')
          .insert({
            user_id: authUserId,
            quiz_date: quizDate,
            status: 'in_progress',
            current_index: 0,
            answered_count: 0,
            correct_count: 0,
            xp_earned: 0,
          })
          .select('*')
          .single());
      }

      if (createErr || !created) {
        return json(
          { error: 'Bugünkü yarışma zaten başlatılmış. Her gün yalnızca 1 kez katılabilirsiniz.' },
          409,
        );
      }

      return json({
        quizDate,
        resetsAtIso,
        serverNowIso: nowIso,
        attempt: summarizeAttempt(created),
        questions: sanitizeQuestions(questions),
      });
    }

    // ==================== ACTION: HEARTBEAT ====================
    if (action === 'heartbeat') {
      if (!attempt) {
        return json({ ok: false, status: 'not_started', serverNowIso: new Date().toISOString() });
      }
      if (attempt.status === 'cancelled' || attempt.status === 'expired' || attempt.status === 'completed') {
        return json({
          ok: true,
          status: attempt.status,
          cancelled: attempt.status === 'cancelled',
          expired: attempt.status === 'expired',
          cancelReason: attempt.cancel_reason ?? null,
          cancelMessage: attempt.status === 'cancelled' ? getCancelMessage(attempt.cancel_reason) : null,
          serverNowIso: new Date().toISOString(),
        });
      }

      const { data: hbData, error: hbErr } = await admin.rpc('trivia_heartbeat', {
        _attempt_id: attempt.id,
        _actor_user_id: authUserId,
      });
      if (!hbErr && hbData) {
        const resObj = hbData as Record<string, unknown>;
        return json({
          ...resObj,
          cancelMessage: resObj.cancelled ? getCancelMessage(String(resObj.cancelReason || 'away_over_5s')) : null,
        });
      }

      const awayCheck = await enforceServerAwayDeadline();
      if (awayCheck.cancelledNow) {
        return json({
          ok: true,
          status: 'cancelled',
          cancelled: true,
          cancelReason: attempt.cancel_reason || 'away_over_5s',
          cancelMessage: getCancelMessage(attempt.cancel_reason || 'away_over_5s'),
          serverNowIso: new Date().toISOString(),
        });
      }
      if (attempt.status === 'grace_period') {
        return json({
          ok: true,
          status: 'grace_period',
          graceExpiresAt: summarizeAttempt(attempt).graceExpiresAt,
          serverNowIso: new Date().toISOString(),
        });
      }
      return json({ ok: true, status: attempt.status, serverNowIso: new Date().toISOString() });
    }

    // ==================== ACTION: REPORT_LEAVE ====================
    if (action === 'report_leave') {
      if (!attempt) {
        return json({ ok: true, status: 'not_started' });
      }
      if (attempt.status !== 'in_progress' && attempt.status !== 'grace_period') {
        return json({
          ok: true,
          status: attempt.status,
          cancelled: attempt.status === 'cancelled',
        });
      }

      const leaveReason =
        typeof body.reason === 'string' && body.reason.trim()
          ? body.reason.trim().slice(0, 60)
          : 'left_screen';

      const { data: leaveRpc, error: leaveRpcErr } = await admin.rpc('trivia_mark_leave', {
        _attempt_id: attempt.id,
        _reason: leaveReason,
        _actor_user_id: authUserId,
      });

      if (!leaveRpcErr && leaveRpc) {
        return json(leaveRpc);
      }

      // Fallback when new RPC isn't deployed yet: preserve original leave_started_at!
      if (!attempt.leave_started_at) {
        const nowIso = new Date().toISOString();
        const graceIso = new Date(Date.now() + MAX_AWAY_MS).toISOString();
        await admin
          .from('daily_trivia_attempts')
          .update({
            leave_started_at: nowIso,
            leave_count: Number(attempt.leave_count || 0) + 1,
          })
          .eq('id', attempt.id)
          .eq('status', 'in_progress');
        return json({ ok: true, status: 'grace_period', leaveStartedAt: nowIso, graceExpiresAt: graceIso, serverNowIso: nowIso });
      }

      const leaveMs = Date.parse(String(attempt.leave_started_at));
      const graceIso = new Date((Number.isFinite(leaveMs) ? leaveMs : Date.now()) + MAX_AWAY_MS).toISOString();
      return json({
        ok: true,
        status: 'grace_period',
        leaveStartedAt: attempt.leave_started_at,
        graceExpiresAt: graceIso,
        serverNowIso: new Date().toISOString(),
      });
    }

    // ==================== ACTION: REPORT_RETURN ====================
    if (action === 'report_return') {
      if (!attempt) return json({ cancelled: false, status: 'not_started' });
      if (attempt.status === 'cancelled') {
        return json({
          cancelled: true,
          status: 'cancelled',
          cancelReason: attempt.cancel_reason,
          cancelMessage: getCancelMessage(attempt.cancel_reason),
        });
      }
      if (attempt.status === 'expired' || attempt.status === 'completed') {
        return json({
          cancelled: false,
          expired: attempt.status === 'expired',
          status: attempt.status,
        });
      }

      const { data: retRpc, error: retRpcErr } = await admin.rpc('trivia_mark_return', {
        _attempt_id: attempt.id,
        _actor_user_id: authUserId,
      });

      if (!retRpcErr && retRpc) {
        const resObj = retRpc as Record<string, any>;
        if (resObj.cancelled) {
          return json({
            cancelled: true,
            status: 'cancelled',
            awayMs: resObj.awayMs,
            cancelReason: resObj.cancelReason || 'away_over_5s',
            cancelMessage: getCancelMessage(resObj.cancelReason || 'away_over_5s'),
            xpRevoked: resObj.xpRevoked ?? 0,
            newUserPointsTotal: resObj.newUserPointsTotal ?? null,
          });
        }
        if (resObj.status === 'in_progress') {
          const setObj = await ensureUserDailyQuizSet(admin, authUserId, quizDate);
          return json({
            cancelled: false,
            status: 'in_progress',
            awayMs: resObj.awayMs ?? 0,
            serverNowIso: resObj.serverNowIso ?? new Date().toISOString(),
            questions: sanitizeQuestions(setObj.questions),
          });
        }
        return json(resObj);
      }

      const awayMs = attempt.leave_started_at
        ? Math.max(0, Date.now() - Date.parse(String(attempt.leave_started_at)))
        : 0;

      if (attempt.leave_started_at && awayMs > MAX_AWAY_MS) {
        const cancelled = await cancelAttemptAndRevokeRewards(admin, attempt, 'away_over_5s');
        return json({
          cancelled: true,
          status: 'cancelled',
          awayMs,
          cancelReason: 'away_over_5s',
          cancelMessage: getCancelMessage('away_over_5s'),
          xpRevoked: cancelled.xpRevoked,
          newUserPointsTotal: cancelled.newUserPointsTotal,
        });
      }

      await admin
        .from('daily_trivia_attempts')
        .update({ leave_started_at: null })
        .eq('id', attempt.id)
        .in('status', ['in_progress', 'grace_period']);

      const setObj = await ensureUserDailyQuizSet(admin, authUserId, quizDate);
      return json({
        cancelled: false,
        status: 'in_progress',
        awayMs,
        serverNowIso: new Date().toISOString(),
        questions: sanitizeQuestions(setObj.questions),
      });
    }

    // ==================== ACTION: CANCEL ====================
    if (action === 'cancel') {
      if (!attempt || (attempt.status !== 'in_progress' && attempt.status !== 'grace_period')) {
        return json({
          cancelled: attempt?.status === 'cancelled',
          status: attempt?.status ?? 'not_started',
          cancelReason: attempt?.cancel_reason ?? null,
          cancelMessage:
            attempt?.status === 'cancelled' ? getCancelMessage(attempt.cancel_reason) : null,
        });
      }
      const reason = typeof body.reason === 'string' && body.reason.trim()
        ? body.reason.trim().slice(0, 60)
        : 'left_screen_over_5s';
      const cancelled = await cancelAttemptAndRevokeRewards(admin, attempt, reason);
      return json({
        cancelled: true,
        status: 'cancelled',
        cancelReason: reason,
        cancelMessage: getCancelMessage(reason),
        xpRevoked: cancelled.xpRevoked,
        newUserPointsTotal: cancelled.newUserPointsTotal,
      });
    }

    // ==================== ACTION: ANSWER (kaydet / değiştir) ====================
    if (action === 'answer') {
      if (!attempt) {
        return json({ error: 'Aktif yarışma bulunamadı.' }, 404);
      }
      if (attempt.status === 'cancelled') {
        return json(
          {
            error: getCancelMessage(attempt.cancel_reason),
            cancelled: true,
            cancelReason: attempt.cancel_reason,
          },
          409,
        );
      }
      if (attempt.status === 'expired') {
        return json({ error: 'Yarışma süresi dolduğu için cevap kabul edilemez.', expired: true }, 409);
      }
      if (attempt.status === 'completed') {
        return json({ error: 'Bu yarışma zaten tamamlandı.', completed: true }, 409);
      }

      // Enforce 5-second away check & silent kill check before accepting any answer
      const awayCheck = await enforceServerAwayDeadline();
      if (awayCheck.cancelledNow) {
        return json(
          {
            error: getCancelMessage(attempt.cancel_reason || 'away_over_5s'),
            cancelled: true,
            cancelReason: attempt.cancel_reason || 'away_over_5s',
            xpRevoked: awayCheck.xpRevoked,
            newUserPointsTotal: awayCheck.newPoints,
          },
          409,
        );
      }

      if (attempt.status === 'grace_period') {
        return json(
          {
            error: 'Önce yarışma ekranına geri dönmelisiniz.',
            inGracePeriod: true,
            graceExpiresAt: summarizeAttempt(attempt).graceExpiresAt,
          },
          409,
        );
      }

      // Sunucu tarafı süre kontrolü: 15 dk dolduysa bu cevap sayılmaz, kayıtlı cevaplarla sonuçlanır
      if (isAttemptExpired(attempt)) {
        const final = await finalizeAttempt(true);
        return json({
          questionIndex: Number(body.questionIndex) || 0,
          selectedOption: Number(body.selectedOption) || 0,
          saved: false,
          answeredCount: Number(final.attempt.answeredCount),
          remainingCount: Math.max(0, TOTAL_QUESTIONS - Number(final.attempt.answeredCount)),
          deadlineAt: final.attempt.deadlineAt,
          serverNowIso: new Date().toISOString(),
          timedOut: true,
          final,
        });
      }

      const questionIndex = Number(body.questionIndex);
      const selectedOption = Number(body.selectedOption);

      if (!Number.isInteger(questionIndex) || questionIndex < 0 || questionIndex >= TOTAL_QUESTIONS) {
        return json({ error: 'Geçersiz soru numarası.' }, 400);
      }
      if (!Number.isInteger(selectedOption) || selectedOption < 0 || selectedOption > 3) {
        return json({ error: 'Geçersiz seçenek.' }, 400);
      }

      const { questions } = await ensureUserDailyQuizSet(admin, authUserId, quizDate);
      const targetQuestion = questions[questionIndex];
      if (!targetQuestion) {
        return json({ error: 'Soru bulunamadı.' }, 404);
      }

      const nowIso = new Date().toISOString();
      const { error: ansUpsertErr } = await admin.from('daily_trivia_answers').upsert(
        {
          attempt_id: attempt.id,
          user_id: authUserId,
          quiz_date: quizDate,
          question_index: questionIndex,
          selected_option: selectedOption,
          is_correct: selectedOption === targetQuestion.correctIndex,
          xp_awarded: 0,
          answered_at: nowIso,
        },
        { onConflict: 'attempt_id,question_index' },
      );
      if (ansUpsertErr) {
        return json({ error: 'Cevap kaydedilemedi. Lütfen tekrar deneyin.' }, 500);
      }

      const { count: answeredNow } = await admin
        .from('daily_trivia_answers')
        .select('id', { count: 'exact', head: true })
        .eq('attempt_id', attempt.id);
      const answeredCount = Math.min(TOTAL_QUESTIONS, Number(answeredNow ?? 0));

      const { error: updAttemptErr } = await admin
        .from('daily_trivia_attempts')
        .update({
          current_index: questionIndex,
          answered_count: answeredCount,
          last_activity_at: nowIso,
          last_heartbeat_at: nowIso,
        })
        .eq('id', attempt.id)
        .eq('status', 'in_progress');
      if (updAttemptErr && String(updAttemptErr.message || '').includes('column')) {
        await admin
          .from('daily_trivia_attempts')
          .update({
            current_index: questionIndex,
            answered_count: answeredCount,
          })
          .eq('id', attempt.id)
          .eq('status', 'in_progress');
      }

      return json({
        questionIndex,
        selectedOption,
        saved: true,
        answeredCount,
        remainingCount: Math.max(0, TOTAL_QUESTIONS - answeredCount),
        deadlineAt: new Date(attemptDeadlineMs(attempt)).toISOString(),
        serverNowIso: nowIso,
      });
    }

    // ==================== ACTION: FINISH (Yarışmayı Bitir / süre doldu) ====================
    if (action === 'finish') {
      if (!attempt) {
        return json({ error: 'Aktif yarışma bulunamadı.' }, 404);
      }
      if (attempt.status === 'cancelled') {
        return json(
          {
            error: getCancelMessage(attempt.cancel_reason),
            cancelled: true,
            cancelReason: attempt.cancel_reason,
          },
          409,
        );
      }
      if (attempt.status === 'expired') {
        return json({ error: 'Yarışma süresi dolduğu için ödül tanımlanamaz.', expired: true }, 409);
      }
      if (attempt.status === 'completed') {
        return json(await buildFinishPayload(attempt, livePoints));
      }
      const awayCheck = await enforceServerAwayDeadline();
      if (awayCheck.cancelledNow) {
        return json(
          {
            error: getCancelMessage(attempt.cancel_reason || 'away_over_5s'),
            cancelled: true,
            cancelReason: attempt.cancel_reason || 'away_over_5s',
            xpRevoked: awayCheck.xpRevoked,
            newUserPointsTotal: awayCheck.newPoints,
          },
          409,
        );
      }
      if (attempt.status === 'grace_period') {
        return json({ error: 'Yarışma ekranına geri dönüş doğrulanmadan yarışma tamamlanamaz.' }, 409);
      }
      // Server-authoritative timeout determination (never trust client body.timedOut to bypass expiry!)
      const expired = isAttemptExpired(attempt) || Date.now() >= attemptDeadlineMs(attempt) - 1500;
      return json(await finalizeAttempt(expired));
    }

    return json({ error: 'Bilinmeyen işlem.' }, 400);
  } catch (e) {
    if (e instanceof RequestError) return json({ error: e.message }, e.status);
    console.error('daily-trivia unexpected error:', {
      name: e instanceof Error ? e.name : typeof e,
      message: e instanceof Error ? e.message : 'unknown',
    });
    return json({ error: 'Beklenmeyen bir hata oluştu.' }, 500);
  }
});
