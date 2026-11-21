import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  getAuthenticatedUser,
  isTrustedOrigin,
  jsonResponse,
  preflightResponse,
} from '../_shared/request-security.ts';
import { createChatCompletion } from '../_shared/openai-gateway.ts';
import {
  CURATED_TRIVIA_BANK,
  TRIVIA_CATEGORIES,
  type TriviaCategory,
  type TriviaDifficulty,
  type TriviaQuestionRecord,
} from './question-bank.ts';

const TOTAL_QUESTIONS = 15;
const XP_PER_CORRECT = 25;
const MAX_AWAY_MS = 5500; // 5s strict client window + 0.5s network grace
const GRAND_PRIZE_DURATION_MS = 2 * 60 * 60 * 1000; // 2 hours real-time

interface StoredTriviaQuestion extends TriviaQuestionRecord {
  hash: string;
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
  usedHashes: Set<string>,
): Promise<StoredTriviaQuestion[]> {
  const hasAnyKey = Boolean(
    Deno.env.get('OPENAI_API_KEY') ||
      Deno.env.get('LOVABLE_API_KEY') ||
      Deno.env.get('GEMINI_API_KEY') ||
      Deno.env.get('GOOGLE_API_KEY'),
  );
  if (!hasAnyKey) return [];

  try {
    const res = await createChatCompletion({
      model: 'gpt-4o-mini',
      temperature: 0.7,
      max_tokens: 3400,
      timeoutMs: 18_000,
      responseFormat: 'json_object',
      allowPublicFallback: false,
      messages: [
        {
          role: 'system',
          content: `Sen üniversite öğrencilerine yönelik güvenilir Türkçe Günlük Genel Kültür Bilgi Yarışması soru editörüsün.
Tarih tohumu: ${dateStr}.
Tam olarak 15 adet, birbirinden tamamen farklı, %100 doğrulanmış ve tartışmasız tek doğru cevabı olan 4 seçenekli Türkçe genel kültür sorusu üret.
Kategori dağılımı: Tarih (2), Coğrafya (2), Bilim (2), Sanat (2), Spor (2), Teknoloji (2), Edebiyat (2), Güncel Genel Kültür (1).
Zorluk dağılımı: 5 "easy", 6 "medium", 4 "hard".
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
          content: `${dateStr} tarihli Günlük Genel Kültür Bilgi Yarışması için 15 özgün ve dengeli soru üret.`,
        },
      ],
    });

    const parsed = JSON.parse(res.content || '{}') as { questions?: unknown[] };
    if (!Array.isArray(parsed.questions)) return [];

    const valid: StoredTriviaQuestion[] = [];
    const localHashes = new Set<string>(usedHashes);

    for (let i = 0; i < parsed.questions.length && valid.length < TOTAL_QUESTIONS; i++) {
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
      if (localHashes.has(hash)) continue;
      localHashes.add(hash);

      valid.push({
        id: `ai-${dateStr}-${i + 1}`,
        category: normalizeCategory(q.category),
        difficulty: normalizeDifficulty(q.difficulty),
        question: questionText,
        options: opts as [string, string, string, string],
        correctIndex: correctIndex as 0 | 1 | 2 | 3,
        explanation:
          typeof q.explanation === 'string' && q.explanation.trim().length > 5
            ? q.explanation.trim()
            : `Doğru cevap: ${opts[correctIndex]}.`,
        hash,
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
  usedHashes: Set<string>,
  neededCount: number,
  alreadySelected: StoredTriviaQuestion[],
): Promise<StoredTriviaQuestion[]> {
  if (neededCount <= 0) return [];
  const seed = dateSeed(dateStr);
  const picked: StoredTriviaQuestion[] = [];
  const takenHashes = new Set<string>([...usedHashes, ...alreadySelected.map((q) => q.hash)]);

  // Count categories already covered
  const catCounts = new Map<TriviaCategory, number>();
  for (const cat of TRIVIA_CATEGORIES) catCounts.set(cat, 0);
  for (const q of alreadySelected) {
    catCounts.set(q.category, (catCounts.get(q.category) || 0) + 1);
  }

  // Precompute hashes for the curated bank
  const bankWithHash: StoredTriviaQuestion[] = await Promise.all(
    CURATED_TRIVIA_BANK.map(async (q) => ({
      ...q,
      hash: await hashQuestionText(q.question),
    })),
  );

  // Round-robin across categories ordered by lowest current count so all 8 domains are represented
  const rotatedCategories = seededShuffle(TRIVIA_CATEGORIES, seed);
  const shuffledBank = seededShuffle(bankWithHash, seed ^ 0x9e3779b9);

  // Pass 1: Strictly unused questions across underrepresented categories
  let safety = 0;
  while (picked.length < neededCount && safety < 60) {
    safety++;
    const sortedCats = [...rotatedCategories].sort(
      (a, b) => (catCounts.get(a) || 0) - (catCounts.get(b) || 0),
    );
    let addedInPass = false;
    for (const cat of sortedCats) {
      if (picked.length >= neededCount) break;
      const candidate = shuffledBank.find(
        (q) => q.category === cat && !takenHashes.has(q.hash),
      );
      if (candidate) {
        takenHashes.add(candidate.hash);
        picked.push(candidate);
        catCounts.set(cat, (catCounts.get(cat) || 0) + 1);
        addedInPass = true;
      }
    }
    if (!addedInPass) break;
  }

  // Pass 2: Any remaining unused curated question
  if (picked.length < neededCount) {
    for (const q of shuffledBank) {
      if (picked.length >= neededCount) break;
      if (!takenHashes.has(q.hash)) {
        takenHashes.add(q.hash);
        picked.push(q);
      }
    }
  }

  // Pass 3: Only if ALL 160 curated questions were exhausted and AI unavailable, pick oldest-unused cycle
  if (picked.length < neededCount) {
    const pickedNow = new Set<string>([
      ...alreadySelected.map((q) => q.hash),
      ...picked.map((q) => q.hash),
    ]);
    for (const q of shuffledBank) {
      if (picked.length >= neededCount) break;
      if (!pickedNow.has(q.hash)) {
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

async function ensureTodayQuizSet(
  admin: ReturnType<typeof createClient>,
  quizDate: string,
): Promise<{ questions: StoredTriviaQuestion[]; sourceMode: string }> {
  const { data: existing, error: readErr } = await admin
    .from('daily_trivia_sets')
    .select('questions, source_mode')
    .eq('quiz_date', quizDate)
    .maybeSingle();

  if (readErr) {
    throw new Error(`daily_trivia_sets okunamadı: ${readErr.message}`);
  }

  if (existing && Array.isArray((existing as { questions?: unknown[] }).questions)) {
    const qs = (existing as { questions: StoredTriviaQuestion[]; source_mode?: string }).questions;
    if (qs.length === TOTAL_QUESTIONS) {
      return { questions: qs, sourceMode: existing.source_mode || 'hybrid' };
    }
  }

  // Load ALL previously asked question hashes so past questions are never repeated
  const { data: usedRows } = await admin
    .from('daily_trivia_used_questions')
    .select('question_hash')
    .limit(10000);

  const usedHashes = new Set<string>(
    (usedRows || [])
      .map((r) => (r as { question_hash?: string }).question_hash)
      .filter((h): h is string => typeof h === 'string' && h.length > 0),
  );

  // Try AI generation first, then top up with verified curated bank excluding usedHashes
  const aiQuestions = await generateDailyAiQuestions(quizDate, usedHashes);
  const needed = TOTAL_QUESTIONS - aiQuestions.length;
  const curatedFill = await selectBalancedCuratedQuestions(quizDate, usedHashes, needed, aiQuestions);
  const finalQuestions = orderProgressively([...aiQuestions, ...curatedFill]).slice(
    0,
    TOTAL_QUESTIONS,
  );

  const sourceMode =
    aiQuestions.length === TOTAL_QUESTIONS
      ? 'ai'
      : aiQuestions.length > 0
      ? 'hybrid'
      : 'curated';

  const { error: insErr } = await admin.from('daily_trivia_sets').insert({
    quiz_date: quizDate,
    questions: finalQuestions,
    source_mode: sourceMode,
  });

  if (insErr) {
    // Handle concurrent midnight creation gracefully by reading the winner row
    const { data: raceRow } = await admin
      .from('daily_trivia_sets')
      .select('questions, source_mode')
      .eq('quiz_date', quizDate)
      .maybeSingle();
    if (raceRow && Array.isArray((raceRow as { questions?: unknown[] }).questions)) {
      return {
        questions: (raceRow as { questions: StoredTriviaQuestion[] }).questions,
        sourceMode: (raceRow as { source_mode?: string }).source_mode || sourceMode,
      };
    }
  }

  // Record used question hashes so future days never reuse today's questions
  const usedPayload = finalQuestions.map((q) => ({
    question_hash: q.hash,
    quiz_date: quizDate,
    category: q.category,
  }));
  await admin
    .from('daily_trivia_used_questions')
    .upsert(usedPayload, { onConflict: 'question_hash', ignoreDuplicates: true });

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

async function addUserPoints(
  admin: ReturnType<typeof createClient>,
  userId: string,
  amount: number,
  reason: string,
): Promise<number> {
  const { data: existing } = await admin
    .from('user_points')
    .select('points')
    .eq('user_id', userId)
    .maybeSingle();

  const current = Number((existing as { points?: number } | null)?.points ?? 0);
  const nextPoints = current + amount;
  const nowIso = new Date().toISOString();

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

  await admin.from('point_events').insert({
    user_id: userId,
    amount,
    reason,
  });

  return nextPoints;
}

async function cancelAttemptAndRevokeRewards(
  admin: ReturnType<typeof createClient>,
  attempt: Record<string, any>,
  reason: string,
): Promise<{ attempt: Record<string, any>; xpRevoked: number; newUserPointsTotal: number | null }> {
  const nowIso = new Date().toISOString();
  const userId = String(attempt.user_id);
  const quizDate = String(attempt.quiz_date);

  // Reverse any XP granted during this cancelled attempt so cancelled runs grant zero rewards
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
    .select('*')
    .single();

  return {
    attempt: updated || {
      ...attempt,
      status: 'cancelled',
      cancelled_at: nowIso,
      cancel_reason: reason,
      xp_earned: 0,
      grand_prize_awarded: false,
      unlimited_expires_at: null,
    },
    xpRevoked,
    newUserPointsTotal,
  };
}

function getCancelMessage(reason: string | null | undefined): string {
  switch (reason) {
    case 'page_reloaded':
      return 'Yarışma devam ederken sayfa yenilendiği için güvenlik kuralları gereği yarışma otomatik olarak iptal edildi ve bu yarışmaya ait ödüller tanımlanmadı.';
    case 'away_over_5s':
    case 'left_screen_over_5s':
      return 'Yarışma ekranından ayrıldıktan sonra 5 saniye içinde geri dönülmediği için yarışma otomatik olarak iptal edildi ve bu yarışmaya ait ödüller tanımlanmadı.';
    case 'navigated_away':
      return 'Yarışma ekranından çıkış yapıldığı için yarışma iptal edildi ve bu yarışmaya ait ödüller tanımlanmadı.';
    default:
      return 'Güvenlik kuralları ihlal edildiği için yarışma iptal edildi ve bu yarışmaya ait ödüller verilmedi.';
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflightResponse(req);
  if (!isTrustedOrigin(req)) return jsonResponse(req, { error: 'Geçersiz kaynak.' }, 403);

  const json = (body: unknown, status = 200) => jsonResponse(req, body, status);

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.match(/^Bearer\s+(\S+)$/i)?.[1];
    if (!token) return json({ error: 'Yetkisiz. Lütfen giriş yapın.' }, 401);

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    let authUserId: string | null = (await getAuthenticatedUser(req))?.id ?? null;
    if (!authUserId) {
      const { data: userData, error: userErr } = await admin.auth.getUser(token);
      if (!userErr && userData?.user?.id) {
        authUserId = userData.user.id;
      }
    }
    if (!authUserId) return json({ error: 'Oturum geçersiz.' }, 401);

    let body: Record<string, unknown> = {};
    try {
      const parsed = await req.json();
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        body = parsed as Record<string, unknown>;
      }
    } catch {
      body = {};
    }

    const action = String(body.action || 'status');
    const { dateStr: quizDate, resetsAtIso } = getIstanbulDateParts(new Date());

    // Fetch current user's active 2-hour unlimited pass (if any) + perfect win count
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
        {
          error: 'Günlük Bilgi Yarışması veritabanı tablosu henüz hazır değil. Lütfen kısa süre sonra tekrar deneyin.',
          migrationPending: true,
        },
        503,
      );
    }

    let attempt = attemptRes.data as Record<string, any> | null;
    let rawUnlimitedUntil = (profileRes.data as { trivia_unlimited_until?: string | null } | null)
      ?.trivia_unlimited_until;
    if (!rawUnlimitedUntil) {
      try {
        const { data: authUserLookup } = await admin.auth.admin.getUserById(authUserId);
        const metaUntil = (authUserLookup?.user?.user_metadata as Record<string, unknown> | undefined)
          ?.trivia_unlimited_until;
        if (typeof metaUntil === 'string' && metaUntil.trim()) {
          rawUnlimitedUntil = metaUntil;
        }
      } catch {
        // ignore metadata lookup errors
      }
    }
    const activeUnlimitedUntil =
      rawUnlimitedUntil && Date.parse(rawUnlimitedUntil) > Date.now()
        ? rawUnlimitedUntil
        : null;
    const perfectWinsCount = perfectCountRes.count ?? 0;
    const currentUserPoints = Number((userPtsRes.data as { points?: number } | null)?.points ?? 0);

    // Helper: enforce 5-second away check server-side on any in_progress attempt
    const enforceServerAwayDeadline = async (): Promise<{
      cancelledNow: boolean;
      xpRevoked: number;
      newPoints: number | null;
    }> => {
      if (!attempt || attempt.status !== 'in_progress') {
        return { cancelledNow: false, xpRevoked: 0, newPoints: null };
      }
      if (attempt.leave_started_at) {
        const awayMs = Date.now() - Date.parse(String(attempt.leave_started_at));
        if (Number.isFinite(awayMs) && awayMs > MAX_AWAY_MS) {
          const cancelled = await cancelAttemptAndRevokeRewards(admin, attempt, 'away_over_5s');
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

    // ==================== ACTION: STATUS ====================
    if (action === 'status') {
      const clientReloaded = Boolean(body.clientReloaded);
      if (attempt && attempt.status === 'in_progress') {
        if (clientReloaded) {
          const cancelled = await cancelAttemptAndRevokeRewards(admin, attempt, 'page_reloaded');
          attempt = cancelled.attempt;
        } else {
          await enforceServerAwayDeadline();
        }
      }

      let questions: SanitizedTriviaQuestion[] | undefined;
      let answers: Array<{
        questionIndex: number;
        selectedOption: number;
        isCorrect: boolean;
        xpAwarded: number;
        correctIndex?: number;
        explanation?: string;
      }> = [];

      if (attempt) {
        const { data: ansRows } = await admin
          .from('daily_trivia_answers')
          .select('question_index, selected_option, is_correct, xp_awarded')
          .eq('attempt_id', attempt.id)
          .order('question_index', { ascending: true });

        let fullSet: StoredTriviaQuestion[] = [];
        if (attempt.status === 'in_progress' || attempt.status === 'completed') {
          const setObj = await ensureTodayQuizSet(admin, quizDate);
          fullSet = setObj.questions;
          if (attempt.status === 'in_progress') {
            questions = sanitizeQuestions(fullSet);
          }
        }

        answers = (ansRows || []).map((r) => {
          const idx = Number((r as { question_index: number }).question_index);
          const qObj = fullSet[idx];
          return {
            questionIndex: idx,
            selectedOption: Number((r as { selected_option: number }).selected_option),
            isCorrect: Boolean((r as { is_correct: boolean }).is_correct),
            xpAwarded: Number((r as { xp_awarded: number }).xp_awarded),
            correctIndex: qObj?.correctIndex,
            explanation: qObj?.explanation,
          };
        });
      }

      return json({
        quizDate,
        resetsAtIso,
        totalQuestions: TOTAL_QUESTIONS,
        xpPerCorrect: XP_PER_CORRECT,
        maxXp: TOTAL_QUESTIONS * XP_PER_CORRECT,
        serverNowIso: new Date().toISOString(),
        userPoints: currentUserPoints,
        perfectWinsCount,
        unlimitedExpiresAt: activeUnlimitedUntil,
        attempt: attempt
          ? {
              id: attempt.id,
              status: attempt.status,
              currentIndex: attempt.current_index,
              answeredCount: attempt.answered_count,
              correctCount: attempt.correct_count,
              xpEarned: attempt.xp_earned,
              grandPrizeAwarded: Boolean(attempt.grand_prize_awarded),
              unlimitedExpiresAt: attempt.unlimited_expires_at,
              cancelReason: attempt.cancel_reason,
              cancelMessage:
                attempt.status === 'cancelled' ? getCancelMessage(attempt.cancel_reason) : null,
              startedAt: attempt.started_at,
              completedAt: attempt.completed_at,
              cancelledAt: attempt.cancelled_at,
            }
          : null,
        questions,
        answers,
      });
    }

    // ==================== ACTION: START ====================
    if (action === 'start') {
      if (attempt) {
        return json(
          {
            error:
              attempt.status === 'cancelled'
                ? 'Bugünkü yarışma hakkınız güvenlik iptali nedeniyle kapandı. Yarın yeni 15 soru ile tekrar katılabilirsiniz.'
                : attempt.status === 'completed'
                ? 'Bugünkü Günlük Genel Kültür Bilgi Yarışması’nı zaten tamamladınız. Her kullanıcı günde 1 kez katılabilir.'
                : 'Devam eden bir yarışmanız zaten bulunuyor.',
            alreadyParticipated: true,
          },
          409,
        );
      }

      const { questions } = await ensureTodayQuizSet(admin, quizDate);

      const { data: created, error: createErr } = await admin
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
        .single();

      if (createErr || !created) {
        return json(
          { error: 'Bugünkü yarışma zaten başlatılmış. Her gün yalnızca 1 kez katılabilirsiniz.' },
          409,
        );
      }

      return json({
        quizDate,
        resetsAtIso,
        serverNowIso: new Date().toISOString(),
        attempt: {
          id: created.id,
          status: created.status,
          currentIndex: 0,
          answeredCount: 0,
          correctCount: 0,
          xpEarned: 0,
          grandPrizeAwarded: false,
          unlimitedExpiresAt: null,
          cancelReason: null,
          cancelMessage: null,
          startedAt: created.started_at,
          completedAt: null,
          cancelledAt: null,
        },
        questions: sanitizeQuestions(questions),
      });
    }

    // ==================== ACTION: REPORT_LEAVE ====================
    if (action === 'report_leave') {
      if (!attempt || attempt.status !== 'in_progress') {
        return json({ ok: true, status: attempt?.status ?? 'none' });
      }
      if (!attempt.leave_started_at) {
        await admin
          .from('daily_trivia_attempts')
          .update({
            leave_started_at: new Date().toISOString(),
            leave_count: Number(attempt.leave_count || 0) + 1,
          })
          .eq('id', attempt.id)
          .eq('status', 'in_progress');
      }
      return json({ ok: true, serverNowIso: new Date().toISOString() });
    }

    // ==================== ACTION: REPORT_RETURN ====================
    if (action === 'report_return') {
      if (!attempt) return json({ cancelled: false, status: 'none' });
      if (attempt.status === 'cancelled') {
        return json({
          cancelled: true,
          cancelReason: attempt.cancel_reason,
          cancelMessage: getCancelMessage(attempt.cancel_reason),
        });
      }
      if (attempt.status !== 'in_progress') {
        return json({ cancelled: false, status: attempt.status });
      }

      const awayMs = attempt.leave_started_at
        ? Math.max(0, Date.now() - Date.parse(String(attempt.leave_started_at)))
        : 0;

      if (attempt.leave_started_at && awayMs > MAX_AWAY_MS) {
        const cancelled = await cancelAttemptAndRevokeRewards(admin, attempt, 'away_over_5s');
        return json({
          cancelled: true,
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
        .eq('id', attempt.id);

      return json({ cancelled: false, awayMs });
    }

    // ==================== ACTION: CANCEL ====================
    if (action === 'cancel') {
      if (!attempt || attempt.status !== 'in_progress') {
        return json({
          cancelled: attempt?.status === 'cancelled',
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
        cancelReason: reason,
        cancelMessage: getCancelMessage(reason),
        xpRevoked: cancelled.xpRevoked,
        newUserPointsTotal: cancelled.newUserPointsTotal,
      });
    }

    // ==================== ACTION: ANSWER ====================
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
      if (attempt.status === 'completed') {
        return json({ error: 'Bu yarışma zaten tamamlandı.' }, 409);
      }

      // Enforce 5-second away check before accepting any answer
      const awayCheck = await enforceServerAwayDeadline();
      if (awayCheck.cancelledNow) {
        return json(
          {
            error: getCancelMessage('away_over_5s'),
            cancelled: true,
            cancelReason: 'away_over_5s',
            xpRevoked: awayCheck.xpRevoked,
            newUserPointsTotal: awayCheck.newPoints,
          },
          409,
        );
      }

      const questionIndex = Number(body.questionIndex);
      const selectedOption = Number(body.selectedOption);

      if (!Number.isInteger(questionIndex) || questionIndex < 0 || questionIndex >= TOTAL_QUESTIONS) {
        return json({ error: 'Geçersiz soru numarası.' }, 400);
      }
      if (!Number.isInteger(selectedOption) || selectedOption < 0 || selectedOption > 3) {
        return json({ error: 'Geçersiz seçenek.' }, 400);
      }
      if (questionIndex !== Number(attempt.current_index)) {
        return json({ error: 'Sorular sırayla ve yalnızca bir kez yanıtlanabilir.' }, 409);
      }

      const { questions } = await ensureTodayQuizSet(admin, quizDate);
      const targetQuestion = questions[questionIndex];
      if (!targetQuestion) {
        return json({ error: 'Soru bulunamadı.' }, 404);
      }

      const isCorrect = selectedOption === targetQuestion.correctIndex;
      const xpAwarded = isCorrect ? XP_PER_CORRECT : 0;

      // Insert validated answer first — UNIQUE(attempt_id, question_index) guarantees no duplicate XP!
      const { error: ansInsErr } = await admin.from('daily_trivia_answers').insert({
        attempt_id: attempt.id,
        user_id: authUserId,
        quiz_date: quizDate,
        question_index: questionIndex,
        selected_option: selectedOption,
        is_correct: isCorrect,
        xp_awarded: xpAwarded,
      });

      if (ansInsErr) {
        return json({ error: 'Bu soru zaten yanıtlanmış.' }, 409);
      }

      let newUserPointsTotal = currentUserPoints;
      if (isCorrect) {
        newUserPointsTotal = await addUserPoints(
          admin,
          authUserId,
          XP_PER_CORRECT,
          `daily_trivia:${quizDate}:q${questionIndex + 1}`,
        );
      }

      const nextAnswered = Number(attempt.answered_count) + 1;
      const nextCorrect = Number(attempt.correct_count) + (isCorrect ? 1 : 0);
      const nextXpEarned = Number(attempt.xp_earned) + xpAwarded;
      const completed = nextAnswered >= TOTAL_QUESTIONS;
      const isPerfect = completed && nextCorrect === TOTAL_QUESTIONS;
      const nowIso = new Date().toISOString();

      let unlimitedExpiresAt: string | null = activeUnlimitedUntil;
      if (isPerfect) {
        const expiresMs = Date.now() + GRAND_PRIZE_DURATION_MS;
        unlimitedExpiresAt = new Date(expiresMs).toISOString();

        // Persist real-time 2-hour unlimited note access on profiles + auth user metadata
        await admin
          .from('profiles')
          .update({ trivia_unlimited_until: unlimitedExpiresAt })
          .eq('user_id', authUserId);

        try {
          const { data: authUserRes } = await admin.auth.admin.getUserById(authUserId);
          const existingMeta = (authUserRes?.user?.user_metadata || {}) as Record<string, unknown>;
          const prevPerfect = Number(existingMeta.trivia_perfect_wins || 0);
          await admin.auth.admin.updateUserById(authUserId, {
            user_metadata: {
              ...existingMeta,
              trivia_unlimited_until: unlimitedExpiresAt,
              trivia_perfect_wins: prevPerfect + 1,
            },
          });
        } catch (metaErr) {
          console.warn('daily-trivia user_metadata update warning:', metaErr);
        }
      }

      await admin
        .from('daily_trivia_attempts')
        .update({
          current_index: nextAnswered,
          answered_count: nextAnswered,
          correct_count: nextCorrect,
          xp_earned: nextXpEarned,
          status: completed ? 'completed' : 'in_progress',
          completed_at: completed ? nowIso : null,
          grand_prize_awarded: isPerfect,
          unlimited_expires_at: isPerfect ? unlimitedExpiresAt : null,
          leave_started_at: null,
        })
        .eq('id', attempt.id);

      return json({
        questionIndex,
        selectedOption,
        isCorrect,
        correctIndex: targetQuestion.correctIndex,
        explanation: targetQuestion.explanation,
        xpAwarded,
        totalXpEarned: nextXpEarned,
        correctCount: nextCorrect,
        answeredCount: nextAnswered,
        remainingCount: Math.max(0, TOTAL_QUESTIONS - nextAnswered),
        completed,
        grandPrizeAwarded: isPerfect,
        unlimitedExpiresAt: isPerfect ? unlimitedExpiresAt : activeUnlimitedUntil,
        newUserPointsTotal,
      });
    }

    return json({ error: 'Bilinmeyen işlem.' }, 400);
  } catch (e) {
    console.error('daily-trivia error:', e);
    return json({ error: e instanceof Error ? e.message : 'Beklenmeyen bir hata oluştu.' }, 500);
  }
});
