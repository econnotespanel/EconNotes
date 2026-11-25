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

const ALLOWED_XP_AMOUNTS = new Set([100, 200, 300, 400, 500]);

interface WheelSegmentDef {
  id: string;
  type: 'extra_quota' | 'unlimited_day' | 'xp';
  amount: number;
  weight: number;
}

// EXACT original reward pool & probabilities (sum = 100) — never alter odds or amounts.
const WHEEL_SEGMENTS: WheelSegmentDef[] = [
  { id: 'quota_2', type: 'extra_quota', amount: 2, weight: 18 },
  { id: 'xp_100', type: 'xp', amount: 100, weight: 22 },
  { id: 'xp_200', type: 'xp', amount: 200, weight: 20 },
  { id: 'unlimited_1d', type: 'unlimited_day', amount: 24, weight: 10 },
  { id: 'xp_300', type: 'xp', amount: 300, weight: 14 },
  { id: 'xp_400', type: 'xp', amount: 400, weight: 10 },
  { id: 'xp_500', type: 'xp', amount: 500, weight: 6 },
];

function pickServerWeightedSegment(): WheelSegmentDef {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  const roll = (buf[0] / 0x100000000) * 100;
  let acc = 0;
  for (const seg of WHEEL_SEGMENTS) {
    acc += seg.weight;
    if (roll < acc) return seg;
  }
  return WHEEL_SEGMENTS[WHEEL_SEGMENTS.length - 1];
}

function getIstanbulWheelInfo(now = new Date()): {
  dateStr: string;
  isMonday: boolean;
  nextDayResetIso: string;
  nextMondayResetIso: string;
} {
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

  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Istanbul',
    weekday: 'short',
  }).format(now);
  const dowMap: Record<string, number> = {
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
    Sun: 7,
  };
  const isoDow = dowMap[weekday] ?? 1;
  const isMonday = isoDow === 1;
  const daysToMonday = isMonday ? 7 : 8 - isoDow;

  const nextDayUtc = new Date(Date.UTC(y, m - 1, d + 1, 0, 0, 0) - 3 * 60 * 60 * 1000);
  const nextMondayUtc = new Date(Date.UTC(y, m - 1, d + daysToMonday, 0, 0, 0) - 3 * 60 * 60 * 1000);

  return {
    dateStr,
    isMonday,
    nextDayResetIso: nextDayUtc.toISOString(),
    nextMondayResetIso: nextMondayUtc.toISOString(),
  };
}

async function creditXpViaAtomicOrSafeFallback(
  admin: ReturnType<typeof createClient>,
  userId: string,
  amount: number,
  reason: string,
  transactionId: string,
  source: string,
  sourceRef: string | null,
  metadata: Record<string, unknown>,
): Promise<{ points: number; awarded: number; alreadyCredited: boolean; error?: string }> {
  // Primary path: single-transaction PostgreSQL credit_xp_atomic RPC
  const { data: rpcData, error: rpcErr } = await admin.rpc('credit_xp_atomic', {
    _user_id: userId,
    _amount: amount,
    _reason: reason,
    _source: source,
    _transaction_id: transactionId,
    _source_ref: sourceRef,
    _metadata: metadata,
  });

  if (!rpcErr && rpcData) {
    const row = Array.isArray(rpcData) ? rpcData[0] : rpcData;
    if (row && typeof row.points === 'number') {
      return {
        points: Number(row.points),
        awarded: Number(row.awarded ?? 0),
        alreadyCredited: Boolean(row.already_credited),
      };
    }
  }

  // Fallback ONLY if SQL migration hasn't been applied yet on the DB
  const { data: existingEvent } = await admin
    .from('point_events')
    .select('id, amount')
    .eq('user_id', userId)
    .eq('reason', reason)
    .limit(1)
    .maybeSingle();

  const { data: existingPointsRow } = await admin
    .from('user_points')
    .select('points')
    .eq('user_id', userId)
    .maybeSingle();

  const currentPoints = Number((existingPointsRow as { points?: number } | null)?.points ?? 0);

  if (existingEvent) {
    return { points: currentPoints, awarded: 0, alreadyCredited: true };
  }

  const nextPoints = currentPoints + amount;
  const nowIso = new Date().toISOString();

  // Insert event first so duplicate reason check sees it immediately
  const { error: evErr } = await admin
    .from('point_events')
    .insert({ user_id: userId, amount, reason });
  if (evErr) {
    return { points: currentPoints, awarded: 0, alreadyCredited: false, error: evErr.message };
  }

  if (existingPointsRow) {
    const { error: updErr } = await admin
      .from('user_points')
      .update({ points: nextPoints, updated_at: nowIso })
      .eq('user_id', userId);
    if (updErr) {
      return { points: currentPoints, awarded: 0, alreadyCredited: false, error: updErr.message };
    }
  } else {
    const { error: insErr } = await admin
      .from('user_points')
      .insert({ user_id: userId, points: nextPoints, updated_at: nowIso });
    if (insErr) {
      return { points: currentPoints, awarded: 0, alreadyCredited: false, error: insErr.message };
    }
  }

  return { points: nextPoints, awarded: amount, alreadyCredited: false };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflightResponse(req);
  if (!isTrustedOrigin(req)) return jsonResponse(req, { error: 'Geçersiz kaynak.' }, 403);
  if (req.method !== 'POST') return jsonResponse(req, { error: 'Yalnızca POST desteklenir.' }, 405);

  const json = (body: unknown, status = 200) => jsonResponse(req, body, status);

  try {
    const authUser = await getAuthenticatedUser(req);
    if (!authUser?.id) return json({ error: 'Oturum geçersiz.' }, 401);
    const authUserId = authUser.id;

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    await enforceRateLimit(admin, `lucky_wheel:${authUserId}`, 25, 300);

    const payload = await readJsonBody<Record<string, unknown>>(req, 4_096);
    const action = typeof payload.action === 'string' ? payload.action.trim() : '';

    // ==================== ACTION: STATUS ====================
    if (action === 'status') {
      const { data: statusData, error: statusErr } = await admin.rpc('get_lucky_wheel_status', {
        _actor_user_id: authUserId,
      });
      if (!statusErr && statusData) {
        return json({ ok: true, ...(statusData as Record<string, unknown>) });
      }

      // Graceful server-authoritative fallback (NEVER trusts client-writable user_metadata!)
      const info = getIstanbulWheelInfo(new Date());
      const { data: isAdminRaw } = await admin.rpc('is_admin', { _user_id: authUserId });
      const isAdmin = Boolean(isAdminRaw);
      const [ptsRes, evRes, profileRes] = await Promise.all([
        admin.from('user_points').select('points').eq('user_id', authUserId).maybeSingle(),
        admin
          .from('point_events')
          .select('id, amount, created_at')
          .eq('user_id', authUserId)
          .eq('reason', `monday_wheel:${info.dateStr}`)
          .limit(1)
          .maybeSingle(),
        admin
          .from('profiles')
          .select('wheel_bonus_quota, wheel_unlimited_until')
          .eq('user_id', authUserId)
          .maybeSingle(),
      ]);

      const hasSpunToday = Boolean(evRes.data);
      const segId = evRes.data?.amount ? `xp_${evRes.data.amount}` : null;
      const seg = WHEEL_SEGMENTS.find((s) => s.id === segId) || null;
      const userPoints = Number((ptsRes.data as { points?: number } | null)?.points ?? 0);
      const prof = (profileRes.data || {}) as {
        wheel_bonus_quota?: number | null;
        wheel_unlimited_until?: string | null;
      };
      const unlimitedIso =
        prof.wheel_unlimited_until && Date.parse(prof.wheel_unlimited_until) > Date.now()
          ? prof.wheel_unlimited_until
          : null;

      return json({
        ok: true,
        serverNowIso: new Date().toISOString(),
        dailyPeriod: info.dateStr,
        isMonday: info.isMonday,
        isAdminDailyMode: isAdmin,
        hasSpunToday,
        canSpinNow: (info.isMonday || isAdmin) && !hasSpunToday,
        nextResetAtIso: isAdmin ? info.nextDayResetIso : info.nextMondayResetIso,
        userPoints,
        wheelBonusQuota: Math.max(0, Number(prof.wheel_bonus_quota || 0)),
        wheelUnlimitedUntil: unlimitedIso,
        spin: seg
          ? {
              id: `legacy-${info.dateStr}`,
              transactionId: `wheel:${authUserId}:${info.dateStr}`,
              dailyPeriod: info.dateStr,
              segmentId: seg.id,
              rewardType: seg.type,
              rewardAmount: seg.amount,
              xpAwarded: seg.type === 'xp' ? seg.amount : 0,
              xpCredited: Boolean(evRes.data) || seg.type !== 'xp',
              pointsAfter: userPoints,
              quotaBonusAdded: seg.type === 'extra_quota' ? seg.amount : 0,
              unlimitedExpiresAt: seg.type === 'unlimited_day' ? unlimitedIso : null,
              createdAt: evRes.data?.created_at ?? new Date().toISOString(),
            }
          : null,
      });
    }

    // ==================== ACTION: SPIN (Server-Authoritative Atomic Spin) ====================
    if (action === 'spin') {
      const clientRequestId =
        typeof payload.clientRequestId === 'string' && payload.clientRequestId.trim()
          ? payload.clientRequestId.trim().slice(0, 120)
          : null;

      const { data: spinData, error: spinErr } = await admin.rpc('spin_lucky_wheel', {
        _client_request_id: clientRequestId,
        _actor_user_id: authUserId,
      });

      if (!spinErr && spinData) {
        return json(spinData as Record<string, unknown>);
      }

      if (spinErr && !String(spinErr.message || '').includes('spin_lucky_wheel')) {
        const isMondayRule = String(spinErr.message || '').includes('Pazartesi');
        return json(
          {
            ok: false,
            error: isMondayRule
              ? 'Şans Çarkı yalnızca Pazartesi günleri çevrilebilir.'
              : 'Çark çevirme işlemi tamamlanamadı.',
          },
          isMondayRule ? 403 : 400,
        );
      }

      // Server-authoritative fallback if spin_lucky_wheel migration is not yet deployed
      const info = getIstanbulWheelInfo(new Date());
      const { data: isAdminRaw } = await admin.rpc('is_admin', { _user_id: authUserId });
      const isAdmin = Boolean(isAdminRaw);
      if (!info.isMonday && !isAdmin) {
        return json({ ok: false, error: 'Şans Çarkı yalnızca Pazartesi günleri çevrilebilir.' }, 403);
      }

      const reason = `monday_wheel:${info.dateStr}`;
      const txId = `wheel:${authUserId}:${info.dateStr}`;

      const [existingEvRes, profileRes] = await Promise.all([
        admin.from('point_events').select('id, amount, created_at').eq('user_id', authUserId).eq('reason', reason).limit(1).maybeSingle(),
        admin.from('profiles').select('wheel_bonus_quota, wheel_unlimited_until').eq('user_id', authUserId).maybeSingle(),
      ]);
      const prof = (profileRes.data || {}) as {
        wheel_bonus_quota?: number | null;
        wheel_unlimited_until?: string | null;
      };

      if (existingEvRes.data) {
        const { data: ptsRow } = await admin.from('user_points').select('points').eq('user_id', authUserId).maybeSingle();
        const curPts = Number((ptsRow as { points?: number } | null)?.points ?? 0);
        const existingSeg =
          WHEEL_SEGMENTS.find((s) => s.id === `xp_${existingEvRes.data?.amount}`) ?? WHEEL_SEGMENTS[1];
        return json({
          ok: true,
          alreadySpun: true,
          idempotentReplay: false,
          serverNowIso: new Date().toISOString(),
          dailyPeriod: info.dateStr,
          nextResetAtIso: isAdmin ? info.nextDayResetIso : info.nextMondayResetIso,
          newPointsTotal: curPts,
          wheelBonusQuota: Math.max(0, Number(prof.wheel_bonus_quota || 0)),
          wheelUnlimitedUntil:
            prof.wheel_unlimited_until && Date.parse(prof.wheel_unlimited_until) > Date.now()
              ? prof.wheel_unlimited_until
              : null,
          spin: {
            id: `legacy-${info.dateStr}`,
            transactionId: txId,
            dailyPeriod: info.dateStr,
            segmentId: existingSeg.id,
            rewardType: existingSeg.type,
            rewardAmount: existingSeg.amount,
            xpAwarded: existingSeg.type === 'xp' ? existingSeg.amount : 0,
            xpCredited: true,
            pointsAfter: curPts,
            quotaBonusAdded: existingSeg.type === 'extra_quota' ? existingSeg.amount : 0,
            unlimitedExpiresAt: null,
            createdAt: existingEvRes.data.created_at ?? new Date().toISOString(),
          },
        });
      }

      const chosen = pickServerWeightedSegment();
      let newPointsTotal = 0;
      let bonusQuota = Math.max(0, Number(prof.wheel_bonus_quota || 0));
      let unlimitedUntilIso: string | null = null;

      if (chosen.type === 'xp') {
        const credit = await creditXpViaAtomicOrSafeFallback(
          admin,
          authUserId,
          chosen.amount,
          reason,
          txId,
          'lucky_wheel',
          null,
          { segment_id: chosen.id, daily_period: info.dateStr },
        );
        if (credit.error) {
          return json({ ok: false, error: 'Ödül puanı işlenemedi.' }, 500);
        }
        newPointsTotal = credit.points;
      } else {
        const { data: ptsRow } = await admin.from('user_points').select('points').eq('user_id', authUserId).maybeSingle();
        newPointsTotal = Number((ptsRow as { points?: number } | null)?.points ?? 0);
        if (chosen.type === 'extra_quota') {
          bonusQuota += chosen.amount;
          await admin.from('profiles').update({ wheel_bonus_quota: bonusQuota }).eq('user_id', authUserId);
        } else if (chosen.type === 'unlimited_day') {
          unlimitedUntilIso = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
          await admin.from('profiles').update({ wheel_unlimited_until: unlimitedUntilIso }).eq('user_id', authUserId);
        }
      }

      return json({
        ok: true,
        alreadySpun: false,
        idempotentReplay: false,
        serverNowIso: new Date().toISOString(),
        dailyPeriod: info.dateStr,
        nextResetAtIso: isAdmin ? info.nextDayResetIso : info.nextMondayResetIso,
        newPointsTotal,
        wheelBonusQuota: bonusQuota,
        wheelUnlimitedUntil: unlimitedUntilIso,
        spin: {
          id: crypto.randomUUID(),
          transactionId: txId,
          dailyPeriod: info.dateStr,
          segmentId: chosen.id,
          rewardType: chosen.type,
          rewardAmount: chosen.amount,
          xpAwarded: chosen.type === 'xp' ? chosen.amount : 0,
          xpCredited: chosen.type === 'xp',
          pointsAfter: newPointsTotal,
          quotaBonusAdded: chosen.type === 'extra_quota' ? chosen.amount : 0,
          unlimitedExpiresAt: unlimitedUntilIso,
          createdAt: new Date().toISOString(),
        },
      });
    }

    // ==================== ACTION: RECONCILE (Server-Authoritative Tables Only) ====================
    if (action === 'reconcile') {
      const { data: recRes, error: recErr } = await admin.rpc('reconcile_missing_gamification_xp', {
        _apply: true,
        _only_user_id: authUserId,
      });
      const { data: ptsRow } = await admin.from('user_points').select('points').eq('user_id', authUserId).maybeSingle();
      const totalReconciled = !recErr && recRes && typeof recRes === 'object'
        ? Number((recRes as { total_xp_reconciled?: number }).total_xp_reconciled || 0)
        : 0;
      return json({
        ok: true,
        creditedXp: totalReconciled,
        userPoints: Number((ptsRow as { points?: number } | null)?.points ?? 0),
      });
    }

    // SECURITY: Legacy client-supplied amount/transactionId claim path permanently removed!
    return json({ error: 'Geçersiz çark işlemi.' }, 400);
  } catch (e) {
    if (e instanceof RequestError) return json({ error: e.message }, e.status);
    console.error('claim-wheel-xp error');
    return json({ error: 'Çark işlemi sırasında bir hata oluştu.' }, 500);
  }
});
