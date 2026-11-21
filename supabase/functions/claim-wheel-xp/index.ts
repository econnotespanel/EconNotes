import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { getAuthenticatedUser } from '../_shared/request-security.ts';

const ALLOWED_XP_AMOUNTS = new Set([100, 200, 300, 400, 500]);

function getIstanbulDateInfo(now = new Date()): { dateStr: string; isMonday: boolean } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);

  const y = parts.find((p) => p.type === 'year')?.value ?? String(now.getUTCFullYear());
  const m = parts.find((p) => p.type === 'month')?.value ?? String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = parts.find((p) => p.type === 'day')?.value ?? String(now.getUTCDate()).padStart(2, '0');

  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Istanbul',
    weekday: 'short',
  }).format(now);

  return {
    dateStr: `${y}-${m}-${d}`,
    isMonday: weekday === 'Mon',
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
    });

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.match(/^Bearer\s+(\S+)$/i)?.[1];
    if (!token) return json({ error: 'Yetkisiz.' }, 401);

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

    let payload: { amount?: unknown } = {};
    try {
      const parsed = await req.json();
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        payload = parsed as { amount?: unknown };
      }
    } catch {
      return json({ error: 'Geçersiz istek.' }, 400);
    }

    const amount = Number(payload.amount);
    if (!Number.isInteger(amount) || !ALLOWED_XP_AMOUNTS.has(amount)) {
      return json({ error: 'Geçersiz çark XP miktarı.' }, 400);
    }

    const { dateStr, isMonday } = getIstanbulDateInfo(new Date());
    const { data: isAdminRaw } = await admin.rpc('is_admin', { _user_id: authUserId });
    const isAdmin = Boolean(isAdminRaw);

    if (!isMonday && !isAdmin) {
      return json({ error: 'Şans çarkı yalnızca Pazartesi günleri çevrilebilir.' }, 403);
    }

    const reason = `monday_wheel:${dateStr}`;

    // Ensure user_points row exists
    const { data: existingPointsRow } = await admin
      .from('user_points')
      .select('points')
      .eq('user_id', authUserId)
      .maybeSingle();

    const currentPoints = Number((existingPointsRow as { points?: number } | null)?.points ?? 0);

    // Idempotent daily check: never double-credit the same day's wheel spin
    const { data: existingEvent } = await admin
      .from('point_events')
      .select('id, amount')
      .eq('user_id', authUserId)
      .eq('reason', reason)
      .limit(1)
      .maybeSingle();

    if (existingEvent) {
      return json({
        ok: true,
        already_claimed: true,
        awarded: 0,
        points: currentPoints,
      });
    }

    const nextPoints = currentPoints + amount;
    const nowIso = new Date().toISOString();

    if (existingPointsRow) {
      const { error: updErr } = await admin
        .from('user_points')
        .update({ points: nextPoints, updated_at: nowIso })
        .eq('user_id', authUserId);
      if (updErr) return json({ error: updErr.message }, 500);
    } else {
      const { error: insErr } = await admin
        .from('user_points')
        .insert({ user_id: authUserId, points: nextPoints, updated_at: nowIso });
      if (insErr) return json({ error: insErr.message }, 500);
    }

    const { error: evErr } = await admin
      .from('point_events')
      .insert({ user_id: authUserId, amount, reason });
    if (evErr) {
      console.error('claim-wheel-xp point_events insert warning:', evErr);
    }

    return json({
      ok: true,
      already_claimed: false,
      awarded: amount,
      points: nextPoints,
    });
  } catch (e) {
    console.error('claim-wheel-xp error', e);
    return json({ error: e instanceof Error ? e.message : 'Bilinmeyen hata.' }, 500);
  }
});
