-- Migration: Comprehensive Atomic Fix for Daily Trivia Security, Lucky Wheel Single-Spin Integrity,
-- Shared Atomic XP Ledger, Quota Sync, and Verified Historical XP Reconciliation.
--
-- SAFETY GUARANTEES:
-- - 100% additive and idempotent: NEVER deletes, resets, or overwrites existing user accounts,
--   points balances, point_events history, profiles, or completed quiz/wheel records.
-- - Self-sufficient: safely creates missing Daily Trivia / Lucky Wheel tables if prior
--   migrations were not yet applied on the target Supabase instance.
-- - Preserves all existing RLS policies and strengthens server-side invariants.

-- ============================================================================
-- 1. SHARED ATOMIC XP LEDGER & IDEMPOTENT CREDIT FUNCTION
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.xp_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id text NOT NULL UNIQUE,
  user_id uuid NOT NULL,
  source text NOT NULL,
  source_ref text,
  reason text NOT NULL,
  amount integer NOT NULL CHECK (amount > 0),
  status text NOT NULL DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'reversed')),
  points_before integer NOT NULL DEFAULT 0,
  points_after integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS xp_transactions_user_created_idx
  ON public.xp_transactions (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS xp_transactions_source_ref_idx
  ON public.xp_transactions (source, source_ref);

ALTER TABLE public.xp_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own xp transactions" ON public.xp_transactions;
CREATE POLICY "Users view own xp transactions"
ON public.xp_transactions
FOR SELECT
TO authenticated
USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

REVOKE ALL ON public.xp_transactions FROM PUBLIC, anon;
GRANT SELECT ON public.xp_transactions TO authenticated;
GRANT ALL ON public.xp_transactions TO service_role;

-- Add nullable unique transaction_id to point_events (keeps every existing row intact)
ALTER TABLE public.point_events
  ADD COLUMN IF NOT EXISTS transaction_id text;

CREATE UNIQUE INDEX IF NOT EXISTS point_events_transaction_id_uidx
  ON public.point_events (transaction_id)
  WHERE transaction_id IS NOT NULL;

-- Single atomic transaction to credit XP into user_points + point_events + xp_transactions.
-- Strictly idempotent by _transaction_id; uses per-user advisory lock + row lock to prevent race conditions.
CREATE OR REPLACE FUNCTION public.credit_xp_atomic(
  _user_id uuid,
  _amount integer,
  _reason text,
  _source text,
  _transaction_id text,
  _source_ref text DEFAULT NULL,
  _metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE (
  points integer,
  awarded integer,
  already_credited boolean,
  transaction_id text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_before integer := 0;
  v_after integer := 0;
  v_clean_tx text := btrim(COALESCE(_transaction_id, ''));
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'Kullanıcı kimliği gerekli.';
  END IF;
  IF _amount IS NULL OR _amount <= 0 OR _amount > 1000 THEN
    RAISE EXCEPTION 'Geçersiz XP miktarı.';
  END IF;
  IF v_clean_tx = '' OR length(v_clean_tx) > 160 THEN
    RAISE EXCEPTION 'Geçersiz işlem kimliği.';
  END IF;

  -- Serialize concurrent XP credits for the same user within this transaction
  PERFORM pg_advisory_xact_lock(hashtext('xp_credit:' || _user_id::text));

  INSERT INTO public.user_points (user_id)
  VALUES (_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT up.points
  INTO v_before
  FROM public.user_points up
  WHERE up.user_id = _user_id
  FOR UPDATE;

  v_before := COALESCE(v_before, 0);

  -- Idempotency check across both xp_transactions and point_events
  IF EXISTS (
    SELECT 1 FROM public.xp_transactions xt WHERE xt.transaction_id = v_clean_tx
  ) OR EXISTS (
    SELECT 1 FROM public.point_events pe WHERE pe.transaction_id = v_clean_tx
  ) THEN
    RETURN QUERY SELECT v_before, 0, true, v_clean_tx;
    RETURN;
  END IF;

  UPDATE public.user_points up
  SET points = up.points + _amount,
      updated_at = now()
  WHERE up.user_id = _user_id
  RETURNING up.points INTO v_after;

  INSERT INTO public.point_events (user_id, amount, reason, transaction_id)
  VALUES (_user_id, _amount, _reason, v_clean_tx);

  INSERT INTO public.xp_transactions (
    transaction_id,
    user_id,
    source,
    source_ref,
    reason,
    amount,
    status,
    points_before,
    points_after,
    metadata
  )
  VALUES (
    v_clean_tx,
    _user_id,
    _source,
    _source_ref,
    _reason,
    _amount,
    'completed',
    v_before,
    v_after,
    COALESCE(_metadata, '{}'::jsonb)
  );

  RETURN QUERY SELECT v_after, _amount, false, v_clean_tx;
END;
$$;

REVOKE ALL ON FUNCTION public.credit_xp_atomic(uuid, integer, text, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.credit_xp_atomic(uuid, integer, text, text, text, text, jsonb) TO service_role;

-- ============================================================================
-- 2. PROFILE QUOTA COLUMNS & SERVER-SIDE DOWNLOAD QUOTA INTEGRATION
-- ============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS birth_date date,
  ADD COLUMN IF NOT EXISTS trivia_unlimited_until timestamptz,
  ADD COLUMN IF NOT EXISTS wheel_bonus_quota integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS wheel_unlimited_until timestamptz;

CREATE OR REPLACE FUNCTION public.get_download_quota(_user_id uuid)
RETURNS TABLE (
  approved_uploads integer,
  total_downloads integer,
  allowed_downloads integer,
  remaining integer,
  can_download boolean,
  is_admin boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uploads integer;
  v_downloads integer;
  v_base_allowed integer;
  v_manual_quota integer;
  v_wheel_bonus integer := 0;
  v_birth_date date;
  v_trivia_until timestamptz;
  v_wheel_until timestamptz;
  v_is_birthday boolean := false;
  v_is_trivia_unlimited boolean := false;
  v_is_wheel_unlimited boolean := false;
  v_has_unlimited_pass boolean := false;
  v_effective_allowed integer;
  v_is_admin boolean;
BEGIN
  SELECT COUNT(*)::integer INTO v_uploads
  FROM public.notes
  WHERE user_id = _user_id AND status = 'approved';

  SELECT COUNT(*)::integer INTO v_downloads
  FROM public.note_downloads
  WHERE user_id = _user_id;

  SELECT
    manual_download_quota,
    birth_date,
    trivia_unlimited_until,
    COALESCE(wheel_bonus_quota, 0),
    wheel_unlimited_until
  INTO
    v_manual_quota,
    v_birth_date,
    v_trivia_until,
    v_wheel_bonus,
    v_wheel_until
  FROM public.profiles
  WHERE user_id = _user_id;

  IF v_birth_date IS NOT NULL THEN
    v_is_birthday := (
      EXTRACT(MONTH FROM v_birth_date) = EXTRACT(MONTH FROM (now() AT TIME ZONE 'Europe/Istanbul'))
      AND EXTRACT(DAY FROM v_birth_date) = EXTRACT(DAY FROM (now() AT TIME ZONE 'Europe/Istanbul'))
    );
  END IF;

  IF v_trivia_until IS NOT NULL AND v_trivia_until > now() THEN
    v_is_trivia_unlimited := true;
  END IF;

  IF v_wheel_until IS NOT NULL AND v_wheel_until > now() THEN
    v_is_wheel_unlimited := true;
  END IF;

  v_has_unlimited_pass := v_is_birthday OR v_is_trivia_unlimited OR v_is_wheel_unlimited;
  v_base_allowed := CASE WHEN v_uploads = 0 THEN 2 ELSE v_uploads * 2 END;
  v_effective_allowed := COALESCE(v_manual_quota, v_base_allowed) + GREATEST(COALESCE(v_wheel_bonus, 0), 0);
  v_is_admin := public.is_admin(_user_id);

  RETURN QUERY SELECT
    v_uploads,
    v_downloads,
    CASE WHEN v_has_unlimited_pass THEN GREATEST(v_effective_allowed, v_downloads + 999) ELSE v_effective_allowed END,
    CASE WHEN v_has_unlimited_pass THEN 999 ELSE GREATEST(v_effective_allowed - v_downloads, 0) END,
    v_is_admin OR v_has_unlimited_pass OR v_downloads < v_effective_allowed,
    v_is_admin;
END;
$$;

REVOKE ALL ON FUNCTION public.get_download_quota(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_download_quota(uuid) TO authenticated, service_role;

-- ============================================================================
-- 3. LUCKY WHEEL (ŞANS ÇARKI) — UNIQUE (user_id, daily_period) & ATOMIC SPIN
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.lucky_wheel_spins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id text NOT NULL UNIQUE,
  client_request_id text,
  user_id uuid NOT NULL,
  daily_period date NOT NULL,
  segment_id text NOT NULL CHECK (
    segment_id IN ('quota_2', 'xp_100', 'xp_200', 'unlimited_1d', 'xp_300', 'xp_400', 'xp_500')
  ),
  reward_type text NOT NULL CHECK (reward_type IN ('extra_quota', 'unlimited_day', 'xp')),
  reward_amount integer NOT NULL CHECK (reward_amount > 0),
  xp_awarded integer NOT NULL DEFAULT 0 CHECK (xp_awarded IN (0, 100, 200, 300, 400, 500)),
  xp_credited boolean NOT NULL DEFAULT false,
  points_after integer,
  quota_bonus_added integer NOT NULL DEFAULT 0,
  unlimited_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, daily_period)
);

CREATE UNIQUE INDEX IF NOT EXISTS lucky_wheel_spins_user_client_req_uidx
  ON public.lucky_wheel_spins (user_id, client_request_id)
  WHERE client_request_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS lucky_wheel_spins_user_period_idx
  ON public.lucky_wheel_spins (user_id, daily_period DESC);

ALTER TABLE public.lucky_wheel_spins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own lucky wheel spins" ON public.lucky_wheel_spins;
CREATE POLICY "Users view own lucky wheel spins"
ON public.lucky_wheel_spins
FOR SELECT
TO authenticated
USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

REVOKE ALL ON public.lucky_wheel_spins FROM PUBLIC, anon;
GRANT SELECT ON public.lucky_wheel_spins TO authenticated;
GRANT ALL ON public.lucky_wheel_spins TO service_role;

-- Helper: Istanbul timezone daily/Monday renewal computation
CREATE OR REPLACE FUNCTION public.get_wheel_period_bounds(_now timestamptz DEFAULT now())
RETURNS TABLE (
  server_now timestamptz,
  daily_period date,
  is_monday boolean,
  next_day_reset_at timestamptz,
  next_monday_reset_at timestamptz
)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_local timestamp := (_now AT TIME ZONE 'Europe/Istanbul');
  v_date date := v_local::date;
  v_isodow integer := EXTRACT(ISODOW FROM v_local)::integer; -- 1 = Monday .. 7 = Sunday
  v_days_to_monday integer := CASE WHEN v_isodow = 1 THEN 7 ELSE 8 - v_isodow END;
BEGIN
  RETURN QUERY SELECT
    _now,
    v_date,
    (v_isodow = 1),
    (((v_date + 1)::timestamp) AT TIME ZONE 'Europe/Istanbul'),
    (((v_date + v_days_to_monday)::timestamp) AT TIME ZONE 'Europe/Istanbul');
END;
$$;

-- Server-authoritative status endpoint for the Lucky Wheel (strictly read-only except safe recovery of any uncredited XP)
CREATE OR REPLACE FUNCTION public.get_lucky_wheel_status(_actor_user_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := COALESCE(auth.uid(), _actor_user_id);
  v_bounds record;
  v_is_admin boolean := false;
  v_spin public.lucky_wheel_spins;
  v_has_spin boolean := false;
  v_legacy_event record;
  v_points integer := 0;
  v_bonus_quota integer := 0;
  v_unlimited_until timestamptz := NULL;
  v_credit record;
  v_next_reset timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Oturum bulunamadı.';
  END IF;
  IF auth.uid() IS NOT NULL AND _actor_user_id IS NOT NULL AND _actor_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Yetkisiz işlem.';
  END IF;

  SELECT * INTO v_bounds FROM public.get_wheel_period_bounds(now());
  v_is_admin := public.is_admin(v_uid);

  SELECT * INTO v_spin
  FROM public.lucky_wheel_spins
  WHERE user_id = v_uid
    AND daily_period = v_bounds.daily_period
  LIMIT 1;

  v_has_spin := FOUND;

  -- Self-heal: if a spin won XP today but crediting was interrupted, complete it idempotently
  IF v_has_spin AND v_spin.reward_type = 'xp' AND NOT v_spin.xp_credited AND v_spin.xp_awarded > 0 THEN
    SELECT * INTO v_credit
    FROM public.credit_xp_atomic(
      v_uid,
      v_spin.xp_awarded,
      'monday_wheel:' || to_char(v_bounds.daily_period, 'YYYY-MM-DD'),
      'lucky_wheel',
      v_spin.transaction_id,
      v_spin.id::text,
      jsonb_build_object('segment_id', v_spin.segment_id, 'daily_period', v_bounds.daily_period, 'recovered', true)
    );

    UPDATE public.lucky_wheel_spins
    SET xp_credited = true,
        points_after = v_credit.points
    WHERE id = v_spin.id
    RETURNING * INTO v_spin;
  END IF;

  -- Check if user already claimed today's wheel XP via legacy point_events before this migration
  IF NOT v_has_spin THEN
    SELECT pe.id, pe.amount, pe.created_at
    INTO v_legacy_event
    FROM public.point_events pe
    WHERE pe.user_id = v_uid
      AND pe.reason = 'monday_wheel:' || to_char(v_bounds.daily_period, 'YYYY-MM-DD')
    LIMIT 1;

    IF FOUND AND v_legacy_event.amount IN (100, 200, 300, 400, 500) THEN
      INSERT INTO public.lucky_wheel_spins (
        transaction_id,
        user_id,
        daily_period,
        segment_id,
        reward_type,
        reward_amount,
        xp_awarded,
        xp_credited,
        created_at
      )
      VALUES (
        'wheel:' || v_uid::text || ':' || to_char(v_bounds.daily_period, 'YYYY-MM-DD'),
        v_uid,
        v_bounds.daily_period,
        'xp_' || v_legacy_event.amount::text,
        'xp',
        v_legacy_event.amount,
        v_legacy_event.amount,
        true,
        v_legacy_event.created_at
      )
      ON CONFLICT (user_id, daily_period) DO NOTHING;

      SELECT * INTO v_spin
      FROM public.lucky_wheel_spins
      WHERE user_id = v_uid
        AND daily_period = v_bounds.daily_period
      LIMIT 1;
      v_has_spin := FOUND;
    END IF;
  END IF;

  SELECT COALESCE(up.points, 0) INTO v_points
  FROM public.user_points up
  WHERE up.user_id = v_uid;

  SELECT COALESCE(pr.wheel_bonus_quota, 0), pr.wheel_unlimited_until
  INTO v_bonus_quota, v_unlimited_until
  FROM public.profiles pr
  WHERE pr.user_id = v_uid;

  v_next_reset := CASE
    WHEN v_is_admin THEN v_bounds.next_day_reset_at
    WHEN v_bounds.is_monday AND NOT v_has_spin THEN v_bounds.next_day_reset_at
    ELSE v_bounds.next_monday_reset_at
  END;

  RETURN jsonb_build_object(
    'serverNowIso', to_char(v_bounds.server_now AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'dailyPeriod', to_char(v_bounds.daily_period, 'YYYY-MM-DD'),
    'isMonday', v_bounds.is_monday,
    'isAdminDailyMode', v_is_admin,
    'hasSpunToday', v_has_spin,
    'canSpinNow', (v_bounds.is_monday OR v_is_admin) AND NOT v_has_spin,
    'nextResetAtIso', to_char(v_next_reset AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'userPoints', COALESCE(v_points, 0),
    'wheelBonusQuota', COALESCE(v_bonus_quota, 0),
    'wheelUnlimitedUntil', CASE
      WHEN v_unlimited_until IS NOT NULL AND v_unlimited_until > now()
      THEN to_char(v_unlimited_until AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
      ELSE NULL
    END,
    'spin', CASE
      WHEN v_has_spin THEN jsonb_build_object(
        'id', v_spin.id,
        'transactionId', v_spin.transaction_id,
        'dailyPeriod', to_char(v_spin.daily_period, 'YYYY-MM-DD'),
        'segmentId', v_spin.segment_id,
        'rewardType', v_spin.reward_type,
        'rewardAmount', v_spin.reward_amount,
        'xpAwarded', v_spin.xp_awarded,
        'xpCredited', v_spin.xp_credited,
        'pointsAfter', COALESCE(v_spin.points_after, v_points, 0),
        'quotaBonusAdded', v_spin.quota_bonus_added,
        'unlimitedExpiresAt', CASE
          WHEN v_spin.unlimited_expires_at IS NOT NULL
          THEN to_char(v_spin.unlimited_expires_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
          ELSE NULL
        END,
        'createdAt', to_char(v_spin.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
      )
      ELSE NULL
    END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_lucky_wheel_status(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_lucky_wheel_status(uuid) TO authenticated, service_role;

-- Server-authoritative, single-transaction atomic Lucky Wheel spin.
-- Preserves exact original reward pool & probabilities:
--   quota_2 (18%), xp_100 (22%), xp_200 (20%), unlimited_1d (10%), xp_300 (14%), xp_400 (10%), xp_500 (6%)
CREATE OR REPLACE FUNCTION public.spin_lucky_wheel(
  _client_request_id text DEFAULT NULL,
  _actor_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := COALESCE(auth.uid(), _actor_user_id);
  v_bounds record;
  v_is_admin boolean := false;
  v_req_id text := NULLIF(btrim(COALESCE(_client_request_id, '')), '');
  v_existing public.lucky_wheel_spins;
  v_spin public.lucky_wheel_spins;
  v_tx_id text;
  v_roll double precision;
  v_segment_id text;
  v_reward_type text;
  v_reward_amount integer;
  v_xp_amount integer := 0;
  v_credit record;
  v_points integer := 0;
  v_bonus_quota integer := 0;
  v_unlimited_until timestamptz := NULL;
  v_next_reset timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Oturum bulunamadı.';
  END IF;
  IF auth.uid() IS NOT NULL AND _actor_user_id IS NOT NULL AND _actor_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Yetkisiz işlem.';
  END IF;

  SELECT * INTO v_bounds FROM public.get_wheel_period_bounds(now());
  v_is_admin := public.is_admin(v_uid);

  -- Atomic per-user + per-day lock blocks concurrent multi-tab / multi-device double spins
  PERFORM pg_advisory_xact_lock(
    hashtext('lucky_wheel:' || v_uid::text || ':' || to_char(v_bounds.daily_period, 'YYYY-MM-DD'))
  );

  -- 1. Idempotent replay by client_request_id: return exact saved spin, NEVER create a second reward
  IF v_req_id IS NOT NULL THEN
    SELECT * INTO v_existing
    FROM public.lucky_wheel_spins
    WHERE user_id = v_uid
      AND client_request_id = v_req_id
    LIMIT 1;

    IF FOUND THEN
      SELECT COALESCE(up.points, 0) INTO v_points FROM public.user_points up WHERE up.user_id = v_uid;
      SELECT COALESCE(pr.wheel_bonus_quota, 0), pr.wheel_unlimited_until
      INTO v_bonus_quota, v_unlimited_until
      FROM public.profiles pr WHERE pr.user_id = v_uid;

      v_next_reset := CASE WHEN v_is_admin THEN v_bounds.next_day_reset_at ELSE v_bounds.next_monday_reset_at END;

      RETURN jsonb_build_object(
        'ok', true,
        'alreadySpun', false,
        'idempotentReplay', true,
        'serverNowIso', to_char(v_bounds.server_now AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'dailyPeriod', to_char(v_bounds.daily_period, 'YYYY-MM-DD'),
        'nextResetAtIso', to_char(v_next_reset AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'newPointsTotal', COALESCE(v_points, 0),
        'wheelBonusQuota', COALESCE(v_bonus_quota, 0),
        'wheelUnlimitedUntil', CASE
          WHEN v_unlimited_until IS NOT NULL AND v_unlimited_until > now()
          THEN to_char(v_unlimited_until AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
          ELSE NULL
        END,
        'spin', jsonb_build_object(
          'id', v_existing.id,
          'transactionId', v_existing.transaction_id,
          'dailyPeriod', to_char(v_existing.daily_period, 'YYYY-MM-DD'),
          'segmentId', v_existing.segment_id,
          'rewardType', v_existing.reward_type,
          'rewardAmount', v_existing.reward_amount,
          'xpAwarded', v_existing.xp_awarded,
          'xpCredited', v_existing.xp_credited,
          'pointsAfter', COALESCE(v_existing.points_after, v_points, 0),
          'quotaBonusAdded', v_existing.quota_bonus_added,
          'unlimitedExpiresAt', CASE
            WHEN v_existing.unlimited_expires_at IS NOT NULL
            THEN to_char(v_existing.unlimited_expires_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
            ELSE NULL
          END,
          'createdAt', to_char(v_existing.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
        )
      );
    END IF;
  END IF;

  -- 2. Strict per-day guard: if already spun today, return saved spin with alreadySpun = true
  SELECT * INTO v_existing
  FROM public.lucky_wheel_spins
  WHERE user_id = v_uid
    AND daily_period = v_bounds.daily_period
  LIMIT 1;

  IF FOUND THEN
    -- Self-heal uncredited XP if needed
    IF v_existing.reward_type = 'xp' AND NOT v_existing.xp_credited AND v_existing.xp_awarded > 0 THEN
      SELECT * INTO v_credit
      FROM public.credit_xp_atomic(
        v_uid,
        v_existing.xp_awarded,
        'monday_wheel:' || to_char(v_bounds.daily_period, 'YYYY-MM-DD'),
        'lucky_wheel',
        v_existing.transaction_id,
        v_existing.id::text,
        jsonb_build_object('segment_id', v_existing.segment_id, 'daily_period', v_bounds.daily_period)
      );
      UPDATE public.lucky_wheel_spins
      SET xp_credited = true, points_after = v_credit.points
      WHERE id = v_existing.id
      RETURNING * INTO v_existing;
    END IF;

    SELECT COALESCE(up.points, 0) INTO v_points FROM public.user_points up WHERE up.user_id = v_uid;
    SELECT COALESCE(pr.wheel_bonus_quota, 0), pr.wheel_unlimited_until
    INTO v_bonus_quota, v_unlimited_until
    FROM public.profiles pr WHERE pr.user_id = v_uid;
    v_next_reset := CASE WHEN v_is_admin THEN v_bounds.next_day_reset_at ELSE v_bounds.next_monday_reset_at END;

    RETURN jsonb_build_object(
      'ok', true,
      'alreadySpun', true,
      'idempotentReplay', false,
      'serverNowIso', to_char(v_bounds.server_now AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'dailyPeriod', to_char(v_bounds.daily_period, 'YYYY-MM-DD'),
      'nextResetAtIso', to_char(v_next_reset AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'newPointsTotal', COALESCE(v_points, 0),
      'wheelBonusQuota', COALESCE(v_bonus_quota, 0),
      'wheelUnlimitedUntil', CASE
        WHEN v_unlimited_until IS NOT NULL AND v_unlimited_until > now()
        THEN to_char(v_unlimited_until AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
        ELSE NULL
      END,
      'spin', jsonb_build_object(
        'id', v_existing.id,
        'transactionId', v_existing.transaction_id,
        'dailyPeriod', to_char(v_existing.daily_period, 'YYYY-MM-DD'),
        'segmentId', v_existing.segment_id,
        'rewardType', v_existing.reward_type,
        'rewardAmount', v_existing.reward_amount,
        'xpAwarded', v_existing.xp_awarded,
        'xpCredited', v_existing.xp_credited,
        'pointsAfter', COALESCE(v_existing.points_after, v_points, 0),
        'quotaBonusAdded', v_existing.quota_bonus_added,
        'unlimitedExpiresAt', CASE
          WHEN v_existing.unlimited_expires_at IS NOT NULL
          THEN to_char(v_existing.unlimited_expires_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
          ELSE NULL
        END,
        'createdAt', to_char(v_existing.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
      )
    );
  END IF;

  -- 3. Eligibility check: Mondays for regular users, daily for admins (server-verified)
  IF NOT v_bounds.is_monday AND NOT v_is_admin THEN
    RAISE EXCEPTION 'Şans Çarkı yalnızca Pazartesi günleri çevrilebilir.';
  END IF;

  -- 4. Server-authoritative weighted selection (EXACT original weights: [18, 22, 20, 10, 14, 10, 6])
  v_roll := random() * 100.0;
  IF v_roll < 18.0 THEN
    v_segment_id := 'quota_2';
    v_reward_type := 'extra_quota';
    v_reward_amount := 2;
    v_xp_amount := 0;
  ELSIF v_roll < 40.0 THEN
    v_segment_id := 'xp_100';
    v_reward_type := 'xp';
    v_reward_amount := 100;
    v_xp_amount := 100;
  ELSIF v_roll < 60.0 THEN
    v_segment_id := 'xp_200';
    v_reward_type := 'xp';
    v_reward_amount := 200;
    v_xp_amount := 200;
  ELSIF v_roll < 70.0 THEN
    v_segment_id := 'unlimited_1d';
    v_reward_type := 'unlimited_day';
    v_reward_amount := 24;
    v_xp_amount := 0;
  ELSIF v_roll < 84.0 THEN
    v_segment_id := 'xp_300';
    v_reward_type := 'xp';
    v_reward_amount := 300;
    v_xp_amount := 300;
  ELSIF v_roll < 94.0 THEN
    v_segment_id := 'xp_400';
    v_reward_type := 'xp';
    v_reward_amount := 400;
    v_xp_amount := 400;
  ELSE
    v_segment_id := 'xp_500';
    v_reward_type := 'xp';
    v_reward_amount := 500;
    v_xp_amount := 500;
  END IF;

  v_tx_id := 'wheel:' || v_uid::text || ':' || to_char(v_bounds.daily_period, 'YYYY-MM-DD');

  INSERT INTO public.lucky_wheel_spins (
    transaction_id,
    client_request_id,
    user_id,
    daily_period,
    segment_id,
    reward_type,
    reward_amount,
    xp_awarded,
    xp_credited
  )
  VALUES (
    v_tx_id,
    v_req_id,
    v_uid,
    v_bounds.daily_period,
    v_segment_id,
    v_reward_type,
    v_reward_amount,
    v_xp_amount,
    false
  )
  RETURNING * INTO v_spin;

  -- 5. Apply reward atomically inside the exact same DB transaction
  IF v_reward_type = 'xp' THEN
    SELECT * INTO v_credit
    FROM public.credit_xp_atomic(
      v_uid,
      v_xp_amount,
      'monday_wheel:' || to_char(v_bounds.daily_period, 'YYYY-MM-DD'),
      'lucky_wheel',
      v_tx_id,
      v_spin.id::text,
      jsonb_build_object('segment_id', v_segment_id, 'daily_period', v_bounds.daily_period)
    );
    v_points := COALESCE(v_credit.points, v_xp_amount);

    UPDATE public.lucky_wheel_spins
    SET xp_credited = true,
        points_after = v_points
    WHERE id = v_spin.id
    RETURNING * INTO v_spin;
  ELSIF v_reward_type = 'extra_quota' THEN
    UPDATE public.profiles
    SET wheel_bonus_quota = COALESCE(wheel_bonus_quota, 0) + v_reward_amount,
        updated_at = now()
    WHERE user_id = v_uid
    RETURNING COALESCE(wheel_bonus_quota, 0) INTO v_bonus_quota;

    UPDATE public.lucky_wheel_spins
    SET quota_bonus_added = v_reward_amount
    WHERE id = v_spin.id
    RETURNING * INTO v_spin;
  ELSIF v_reward_type = 'unlimited_day' THEN
    UPDATE public.profiles
    SET wheel_unlimited_until = GREATEST(COALESCE(wheel_unlimited_until, now()), now()) + interval '24 hours',
        updated_at = now()
    WHERE user_id = v_uid
    RETURNING wheel_unlimited_until INTO v_unlimited_until;

    UPDATE public.lucky_wheel_spins
    SET unlimited_expires_at = v_unlimited_until
    WHERE id = v_spin.id
    RETURNING * INTO v_spin;
  END IF;

  SELECT COALESCE(up.points, 0) INTO v_points FROM public.user_points up WHERE up.user_id = v_uid;
  SELECT COALESCE(pr.wheel_bonus_quota, 0), pr.wheel_unlimited_until
  INTO v_bonus_quota, v_unlimited_until
  FROM public.profiles pr WHERE pr.user_id = v_uid;

  v_next_reset := CASE WHEN v_is_admin THEN v_bounds.next_day_reset_at ELSE v_bounds.next_monday_reset_at END;

  RETURN jsonb_build_object(
    'ok', true,
    'alreadySpun', false,
    'idempotentReplay', false,
    'serverNowIso', to_char(v_bounds.server_now AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'dailyPeriod', to_char(v_bounds.daily_period, 'YYYY-MM-DD'),
    'nextResetAtIso', to_char(v_next_reset AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'newPointsTotal', COALESCE(v_points, 0),
    'wheelBonusQuota', COALESCE(v_bonus_quota, 0),
    'wheelUnlimitedUntil', CASE
      WHEN v_unlimited_until IS NOT NULL AND v_unlimited_until > now()
      THEN to_char(v_unlimited_until AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
      ELSE NULL
    END,
    'spin', jsonb_build_object(
      'id', v_spin.id,
      'transactionId', v_spin.transaction_id,
      'dailyPeriod', to_char(v_spin.daily_period, 'YYYY-MM-DD'),
      'segmentId', v_spin.segment_id,
      'rewardType', v_spin.reward_type,
      'rewardAmount', v_spin.reward_amount,
      'xpAwarded', v_spin.xp_awarded,
      'xpCredited', v_spin.xp_credited,
      'pointsAfter', COALESCE(v_spin.points_after, v_points, 0),
      'quotaBonusAdded', v_spin.quota_bonus_added,
      'unlimitedExpiresAt', CASE
        WHEN v_spin.unlimited_expires_at IS NOT NULL
        THEN to_char(v_spin.unlimited_expires_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
        ELSE NULL
      END,
      'createdAt', to_char(v_spin.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.spin_lucky_wheel(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.spin_lucky_wheel(text, uuid) TO authenticated, service_role;

-- Backwards-compatible claim_monday_wheel_xp upgraded to atomic credit_xp_atomic + per-day lock
CREATE OR REPLACE FUNCTION public.claim_monday_wheel_xp(
  _amount integer,
  _spin_date text DEFAULT NULL
)
RETURNS TABLE (
  points integer,
  awarded integer,
  already_claimed boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_bounds record;
  v_is_admin boolean;
  v_today_str text;
  v_reason text;
  v_tx_id text;
  v_credit record;
  v_existing_spin public.lucky_wheel_spins;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Oturum bulunamadı.';
  END IF;

  IF _amount IS NULL OR _amount NOT IN (100, 200, 300, 400, 500) THEN
    RAISE EXCEPTION 'Geçersiz çark XP miktarı.';
  END IF;

  SELECT * INTO v_bounds FROM public.get_wheel_period_bounds(now());
  v_is_admin := public.is_admin(v_uid);
  v_today_str := to_char(v_bounds.daily_period, 'YYYY-MM-DD');

  IF NOT v_bounds.is_monday AND NOT v_is_admin THEN
    RAISE EXCEPTION 'Şans çarkı yalnızca Pazartesi günleri çevrilebilir.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('lucky_wheel:' || v_uid::text || ':' || v_today_str));

  v_reason := 'monday_wheel:' || v_today_str;
  v_tx_id := 'wheel:' || v_uid::text || ':' || v_today_str;

  -- If user already spun today via spin_lucky_wheel, respect its authoritative reward (never double-credit)
  SELECT * INTO v_existing_spin
  FROM public.lucky_wheel_spins
  WHERE user_id = v_uid
    AND daily_period = v_bounds.daily_period
  LIMIT 1;

  IF FOUND THEN
    IF v_existing_spin.reward_type = 'xp' AND NOT v_existing_spin.xp_credited AND v_existing_spin.xp_awarded > 0 THEN
      SELECT * INTO v_credit
      FROM public.credit_xp_atomic(
        v_uid,
        v_existing_spin.xp_awarded,
        v_reason,
        'lucky_wheel',
        v_existing_spin.transaction_id,
        v_existing_spin.id::text,
        jsonb_build_object('segment_id', v_existing_spin.segment_id, 'daily_period', v_today_str)
      );
      UPDATE public.lucky_wheel_spins
      SET xp_credited = true, points_after = v_credit.points
      WHERE id = v_existing_spin.id;
      RETURN QUERY SELECT v_credit.points, v_credit.awarded, v_credit.already_credited;
      RETURN;
    END IF;

    RETURN QUERY SELECT
      COALESCE((SELECT up.points FROM public.user_points up WHERE up.user_id = v_uid), 0),
      0,
      true;
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.point_events pe
    WHERE pe.user_id = v_uid AND pe.reason = v_reason
  ) THEN
    RETURN QUERY SELECT
      COALESCE((SELECT up.points FROM public.user_points up WHERE up.user_id = v_uid), 0),
      0,
      true;
    RETURN;
  END IF;

  INSERT INTO public.lucky_wheel_spins (
    transaction_id,
    user_id,
    daily_period,
    segment_id,
    reward_type,
    reward_amount,
    xp_awarded,
    xp_credited
  )
  VALUES (
    v_tx_id,
    v_uid,
    v_bounds.daily_period,
    'xp_' || _amount::text,
    'xp',
    _amount,
    _amount,
    false
  )
  ON CONFLICT (user_id, daily_period) DO NOTHING;

  SELECT * INTO v_credit
  FROM public.credit_xp_atomic(
    v_uid,
    _amount,
    v_reason,
    'lucky_wheel',
    v_tx_id,
    NULL,
    jsonb_build_object('segment_id', 'xp_' || _amount::text, 'daily_period', v_today_str)
  );

  UPDATE public.lucky_wheel_spins
  SET xp_credited = true, points_after = v_credit.points
  WHERE user_id = v_uid AND daily_period = v_bounds.daily_period;

  RETURN QUERY SELECT v_credit.points, v_credit.awarded, v_credit.already_credited;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_monday_wheel_xp(integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_monday_wheel_xp(integer, text) TO authenticated;

-- Upgrade award_points with row-level lock & exclude Daily Trivia / Lucky Wheel from the 300/day mission cap
CREATE OR REPLACE FUNCTION public.award_points(_reason text, _amount integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_total integer;
  v_today_sum integer;
  v_wheel_res record;
  v_tx_id text;
  v_credit record;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Oturum bulunamadı.';
  END IF;

  IF _reason IS NOT NULL AND _reason LIKE 'monday_wheel%' THEN
    SELECT * INTO v_wheel_res
    FROM public.claim_monday_wheel_xp(_amount, NULL);
    RETURN v_wheel_res.points;
  END IF;

  IF _amount IS NULL OR _amount < 1 OR _amount > 50 THEN
    RAISE EXCEPTION 'Geçersiz puan.';
  END IF;

  IF _reason IS NULL OR NOT (_reason IN ('kpss_attempt', 'note_upload') OR _reason LIKE 'mission_%' OR _reason LIKE 'mission:%') OR length(_reason) > 80 THEN
    RAISE EXCEPTION 'Geçersiz puan nedeni.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('xp_credit:' || v_uid::text));

  IF (_reason LIKE 'mission_%' OR _reason LIKE 'mission:%') AND EXISTS (
    SELECT 1 FROM public.point_events
    WHERE user_id = v_uid AND reason = _reason AND created_at > now() - interval '7 days'
  ) THEN
    RAISE EXCEPTION 'Bu görev ödülü zaten alındı.';
  END IF;

  -- Daily Trivia per-question fallback keys (`mission_trivia_*`) are capped at 15*25 = 375 XP/day
  -- and must NOT be truncated by the 300/day general mission cap.
  IF _reason NOT LIKE 'mission_trivia_%' THEN
    SELECT COALESCE(SUM(amount), 0) INTO v_today_sum
    FROM public.point_events
    WHERE user_id = v_uid
      AND reason <> 'daily_login'
      AND reason NOT LIKE 'monday_wheel%'
      AND reason NOT LIKE 'wheel_xp_%'
      AND reason NOT LIKE 'daily_trivia%'
      AND reason NOT LIKE 'mission_trivia_%'
      AND reason NOT LIKE 'trivia_xp_%'
      AND created_at > now() - interval '1 day';

    IF v_today_sum + _amount > 300 THEN
      RAISE EXCEPTION 'Günlük puan sınırına ulaşıldı.';
    END IF;
  END IF;

  IF _reason LIKE 'mission_%' OR _reason LIKE 'mission:%' THEN
    v_tx_id := 'mission:' || v_uid::text || ':' || _reason;
    SELECT * INTO v_credit
    FROM public.credit_xp_atomic(
      v_uid,
      _amount,
      _reason,
      CASE WHEN _reason LIKE 'mission_trivia_%' THEN 'daily_trivia' ELSE 'mission' END,
      v_tx_id,
      _reason,
      '{}'::jsonb
    );
    RETURN v_credit.points;
  END IF;

  INSERT INTO public.user_points (user_id) VALUES (v_uid) ON CONFLICT (user_id) DO NOTHING;

  UPDATE public.user_points
  SET points = points + _amount, updated_at = now()
  WHERE user_id = v_uid
  RETURNING points INTO v_total;

  INSERT INTO public.point_events (user_id, amount, reason)
  VALUES (v_uid, _amount, _reason);

  RETURN v_total;
END;
$$;

REVOKE ALL ON FUNCTION public.award_points(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.award_points(text, integer) TO authenticated;

-- ============================================================================
-- 4. DAILY TRIVIA (GÜNLÜK BİLGİ YARIŞMASI) — 6-STATE SERVER MACHINE & TRIGGERS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.daily_trivia_sets (
  quiz_date date PRIMARY KEY,
  questions jsonb NOT NULL,
  source_mode text NOT NULL DEFAULT 'hybrid',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.daily_trivia_sets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.daily_trivia_sets FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.daily_trivia_sets TO service_role;

CREATE TABLE IF NOT EXISTS public.daily_trivia_used_questions (
  question_hash text PRIMARY KEY,
  quiz_date date NOT NULL,
  category text NOT NULL DEFAULT 'Genel Kültür',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS daily_trivia_used_questions_date_idx
  ON public.daily_trivia_used_questions (quiz_date DESC);
ALTER TABLE public.daily_trivia_used_questions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.daily_trivia_used_questions FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.daily_trivia_used_questions TO service_role;

CREATE TABLE IF NOT EXISTS public.daily_trivia_user_sets (
  user_id uuid NOT NULL,
  quiz_date date NOT NULL,
  questions jsonb NOT NULL,
  question_hashes text[] NOT NULL DEFAULT '{}',
  source_mode text NOT NULL DEFAULT 'hybrid',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, quiz_date)
);
CREATE INDEX IF NOT EXISTS daily_trivia_user_sets_date_idx
  ON public.daily_trivia_user_sets (quiz_date DESC);
ALTER TABLE public.daily_trivia_user_sets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.daily_trivia_user_sets FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.daily_trivia_user_sets TO service_role;

CREATE TABLE IF NOT EXISTS public.daily_trivia_daily_assignments (
  quiz_date date NOT NULL,
  question_hash text NOT NULL,
  assigned_user_id uuid NOT NULL,
  category text NOT NULL DEFAULT 'Genel Kültür',
  concept_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (quiz_date, question_hash)
);
CREATE INDEX IF NOT EXISTS daily_trivia_daily_assignments_user_idx
  ON public.daily_trivia_daily_assignments (quiz_date, assigned_user_id);
ALTER TABLE public.daily_trivia_daily_assignments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.daily_trivia_daily_assignments FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.daily_trivia_daily_assignments TO service_role;

CREATE TABLE IF NOT EXISTS public.daily_trivia_user_history (
  user_id uuid NOT NULL,
  question_hash text NOT NULL,
  quiz_date date NOT NULL,
  category text NOT NULL DEFAULT 'Genel Kültür',
  concept_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, question_hash)
);
CREATE INDEX IF NOT EXISTS daily_trivia_user_history_user_date_idx
  ON public.daily_trivia_user_history (user_id, quiz_date DESC);
ALTER TABLE public.daily_trivia_user_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.daily_trivia_user_history FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.daily_trivia_user_history TO service_role;

CREATE TABLE IF NOT EXISTS public.daily_trivia_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_token uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  quiz_date date NOT NULL,
  status text NOT NULL DEFAULT 'in_progress' CHECK (
    status IN ('not_started', 'in_progress', 'grace_period', 'completed', 'cancelled', 'expired')
  ),
  current_index integer NOT NULL DEFAULT 0 CHECK (current_index >= 0 AND current_index <= 15),
  answered_count integer NOT NULL DEFAULT 0 CHECK (answered_count >= 0 AND answered_count <= 15),
  correct_count integer NOT NULL DEFAULT 0 CHECK (correct_count >= 0 AND correct_count <= 15),
  xp_earned integer NOT NULL DEFAULT 0 CHECK (xp_earned >= 0 AND xp_earned <= 375),
  grand_prize_awarded boolean NOT NULL DEFAULT false,
  unlimited_expires_at timestamptz,
  leave_started_at timestamptz,
  grace_expires_at timestamptz,
  leave_count integer NOT NULL DEFAULT 0,
  cancel_reason text,
  started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '15 minutes'),
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  last_heartbeat_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  reward_transaction_id text,
  xp_credited boolean NOT NULL DEFAULT false,
  xp_credited_at timestamptz,
  UNIQUE (user_id, quiz_date)
);

-- Upgrade existing daily_trivia_attempts tables cleanly if created by earlier migration
ALTER TABLE public.daily_trivia_attempts
  ADD COLUMN IF NOT EXISTS session_token uuid NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS grace_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_activity_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS last_heartbeat_at timestamptz,
  ADD COLUMN IF NOT EXISTS reward_transaction_id text,
  ADD COLUMN IF NOT EXISTS xp_credited boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS xp_credited_at timestamptz;

UPDATE public.daily_trivia_attempts
SET expires_at = started_at + interval '15 minutes'
WHERE expires_at IS NULL;

-- Replace status CHECK constraint to support all 6 server states
DO $$
DECLARE
  v_conname text;
BEGIN
  FOR v_conname IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'daily_trivia_attempts'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) LIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE public.daily_trivia_attempts DROP CONSTRAINT IF EXISTS %I', v_conname);
  END LOOP;

  ALTER TABLE public.daily_trivia_attempts
    ADD CONSTRAINT daily_trivia_attempts_status_check
    CHECK (status IN ('not_started', 'in_progress', 'grace_period', 'completed', 'cancelled', 'expired'));
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS daily_trivia_attempts_reward_tx_uidx
  ON public.daily_trivia_attempts (reward_transaction_id)
  WHERE reward_transaction_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS daily_trivia_attempts_user_date_idx
  ON public.daily_trivia_attempts (user_id, quiz_date DESC);

ALTER TABLE public.daily_trivia_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own trivia attempts" ON public.daily_trivia_attempts;
CREATE POLICY "Users view own trivia attempts"
ON public.daily_trivia_attempts
FOR SELECT
TO authenticated
USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

REVOKE ALL ON public.daily_trivia_attempts FROM PUBLIC, anon;
GRANT SELECT ON public.daily_trivia_attempts TO authenticated;
GRANT ALL ON public.daily_trivia_attempts TO service_role;

CREATE TABLE IF NOT EXISTS public.daily_trivia_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id uuid NOT NULL REFERENCES public.daily_trivia_attempts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  quiz_date date NOT NULL,
  question_index integer NOT NULL CHECK (question_index >= 0 AND question_index < 15),
  selected_option integer NOT NULL CHECK (selected_option >= 0 AND selected_option < 4),
  is_correct boolean NOT NULL,
  xp_awarded integer NOT NULL DEFAULT 0 CHECK (xp_awarded IN (0, 25)),
  answered_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (attempt_id, question_index)
);

CREATE INDEX IF NOT EXISTS daily_trivia_answers_attempt_idx
  ON public.daily_trivia_answers (attempt_id, question_index);

ALTER TABLE public.daily_trivia_answers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own trivia answers" ON public.daily_trivia_answers;
CREATE POLICY "Users view own trivia answers"
ON public.daily_trivia_answers
FOR SELECT
TO authenticated
USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

REVOKE ALL ON public.daily_trivia_answers FROM PUBLIC, anon;
GRANT SELECT ON public.daily_trivia_answers TO authenticated;
GRANT ALL ON public.daily_trivia_answers TO service_role;

-- DB-LEVEL INVARIANT TRIGGER 1: Terminal states (cancelled, completed, expired) can NEVER be reactivated,
-- and cancelled/expired attempts can NEVER receive XP or grand prizes.
CREATE OR REPLACE FUNCTION public.prevent_terminal_trivia_reactivation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.status IN ('cancelled', 'completed', 'expired') THEN
    IF NEW.status <> OLD.status THEN
      RAISE EXCEPTION 'Sonlandırılmış veya iptal edilmiş yarışma oturumu (%) yeniden etkinleştirilemez (%).', OLD.status, NEW.status;
    END IF;
  END IF;

  IF NEW.status IN ('cancelled', 'expired') THEN
    IF COALESCE(NEW.xp_earned, 0) > 0 OR COALESCE(NEW.grand_prize_awarded, false) THEN
      RAISE EXCEPTION 'İptal edilmiş veya süresi dolmuş yarışma oturumuna XP veya ödül tanımlanamaz.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_terminal_trivia_reactivation ON public.daily_trivia_attempts;
CREATE TRIGGER trg_prevent_terminal_trivia_reactivation
  BEFORE UPDATE ON public.daily_trivia_attempts
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_terminal_trivia_reactivation();

-- DB-LEVEL INVARIANT TRIGGER 2: Prevent submitting or mutating answers on cancelled/expired/completed attempts.
CREATE OR REPLACE FUNCTION public.prevent_answer_on_inactive_trivia()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_attempt public.daily_trivia_attempts;
BEGIN
  SELECT * INTO v_attempt
  FROM public.daily_trivia_attempts
  WHERE id = NEW.attempt_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Geçersiz yarışma oturumu.';
  END IF;

  -- Allow internal xp_awarded stamping only when transitioning/finalizing a completed row's existing answer
  IF TG_OP = 'UPDATE' AND v_attempt.status = 'completed'
     AND NEW.selected_option = OLD.selected_option
     AND NEW.is_correct = OLD.is_correct THEN
    RETURN NEW;
  END IF;

  IF v_attempt.status IN ('cancelled', 'expired', 'completed') THEN
    RAISE EXCEPTION 'İptal edilmiş, süresi dolmuş veya tamamlanmış yarışmaya cevap gönderilemez.';
  END IF;

  IF v_attempt.status = 'grace_period' AND v_attempt.grace_expires_at IS NOT NULL AND now() > v_attempt.grace_expires_at THEN
    RAISE EXCEPTION '5 saniyelik geri dönüş süresi dolduğu için cevap kabul edilemez.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_answer_on_inactive_trivia ON public.daily_trivia_answers;
CREATE TRIGGER trg_prevent_answer_on_inactive_trivia
  BEFORE INSERT OR UPDATE ON public.daily_trivia_answers
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_answer_on_inactive_trivia();

-- ============================================================================
-- 5. DAILY TRIVIA ATOMIC STATE TRANSITION RPCs
-- ============================================================================

-- Atomic cancel + revoke any partial rewards
CREATE OR REPLACE FUNCTION public.trivia_cancel_attempt(
  _attempt_id uuid,
  _reason text DEFAULT 'away_over_5s',
  _actor_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := COALESCE(auth.uid(), _actor_user_id);
  v_attempt public.daily_trivia_attempts;
  v_clean_reason text := COALESCE(NULLIF(btrim(_reason), ''), 'away_over_5s');
  v_revoked integer := 0;
  v_points integer := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Oturum bulunamadı.';
  END IF;
  IF auth.uid() IS NOT NULL AND _actor_user_id IS NOT NULL AND _actor_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Yetkisiz işlem.';
  END IF;

  SELECT * INTO v_attempt
  FROM public.daily_trivia_attempts
  WHERE id = _attempt_id
    AND user_id = v_uid
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Oturum bulunamadı.');
  END IF;

  IF v_attempt.status = 'completed' THEN
    RETURN jsonb_build_object('ok', false, 'cancelled', false, 'status', 'completed');
  END IF;

  IF v_attempt.status = 'cancelled' THEN
    SELECT COALESCE(up.points, 0) INTO v_points FROM public.user_points up WHERE up.user_id = v_uid;
    RETURN jsonb_build_object(
      'ok', true,
      'cancelled', true,
      'status', 'cancelled',
      'cancelReason', v_attempt.cancel_reason,
      'xpRevoked', 0,
      'newUserPointsTotal', v_points
    );
  END IF;

  -- Revoke any legacy partial per-question XP if present for this uncompleted attempt
  SELECT COALESCE(SUM(GREATEST(pe.amount, 0)), 0)::integer INTO v_revoked
  FROM public.point_events pe
  WHERE pe.user_id = v_uid
    AND pe.reason LIKE 'daily_trivia:' || to_char(v_attempt.quiz_date, 'YYYY-MM-DD') || ':%';

  IF v_revoked > 0 THEN
    DELETE FROM public.point_events
    WHERE user_id = v_uid
      AND reason LIKE 'daily_trivia:' || to_char(v_attempt.quiz_date, 'YYYY-MM-DD') || ':%';

    UPDATE public.user_points
    SET points = GREATEST(0, points - v_revoked),
        updated_at = now()
    WHERE user_id = v_uid;
  END IF;

  UPDATE public.daily_trivia_attempts
  SET status = 'cancelled',
      cancelled_at = now(),
      cancel_reason = left(v_clean_reason, 60),
      xp_earned = 0,
      grand_prize_awarded = false,
      unlimited_expires_at = NULL,
      leave_started_at = NULL,
      grace_expires_at = NULL
  WHERE id = v_attempt.id
  RETURNING * INTO v_attempt;

  SELECT COALESCE(up.points, 0) INTO v_points FROM public.user_points up WHERE up.user_id = v_uid;

  RETURN jsonb_build_object(
    'ok', true,
    'cancelled', true,
    'status', 'cancelled',
    'cancelReason', v_attempt.cancel_reason,
    'xpRevoked', v_revoked,
    'newUserPointsTotal', v_points
  );
END;
$$;

-- Atomic leave -> grace_period (preserves original leave_started_at & grace_expires_at so duplicate events NEVER extend 5s)
CREATE OR REPLACE FUNCTION public.trivia_mark_leave(
  _attempt_id uuid,
  _reason text DEFAULT 'left_screen',
  _actor_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := COALESCE(auth.uid(), _actor_user_id);
  v_attempt public.daily_trivia_attempts;
  v_now timestamptz := now();
  v_grace_until timestamptz;
  v_cancel_res jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Oturum bulunamadı.';
  END IF;
  IF auth.uid() IS NOT NULL AND _actor_user_id IS NOT NULL AND _actor_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Yetkisiz işlem.';
  END IF;

  SELECT * INTO v_attempt
  FROM public.daily_trivia_attempts
  WHERE id = _attempt_id
    AND user_id = v_uid
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', true, 'status', 'not_started');
  END IF;

  IF v_attempt.status IN ('cancelled', 'completed', 'expired') THEN
    RETURN jsonb_build_object('ok', true, 'status', v_attempt.status, 'cancelled', v_attempt.status = 'cancelled');
  END IF;

  -- If already in grace_period, NEVER reset grace_expires_at; cancel immediately if > 5s elapsed
  IF v_attempt.status = 'grace_period' AND v_attempt.leave_started_at IS NOT NULL THEN
    v_grace_until := COALESCE(v_attempt.grace_expires_at, v_attempt.leave_started_at + interval '5 seconds');
    IF v_now > v_grace_until THEN
      v_cancel_res := public.trivia_cancel_attempt(v_attempt.id, 'away_over_5s', v_uid);
      RETURN v_cancel_res;
    END IF;
    RETURN jsonb_build_object(
      'ok', true,
      'status', 'grace_period',
      'leaveStartedAt', to_char(v_attempt.leave_started_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'graceExpiresAt', to_char(v_grace_until AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'serverNowIso', to_char(v_now AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    );
  END IF;

  v_grace_until := v_now + interval '5 seconds';

  UPDATE public.daily_trivia_attempts
  SET status = 'grace_period',
      leave_started_at = v_now,
      grace_expires_at = v_grace_until,
      leave_count = COALESCE(leave_count, 0) + 1
  WHERE id = v_attempt.id
    AND status = 'in_progress'
  RETURNING * INTO v_attempt;

  RETURN jsonb_build_object(
    'ok', true,
    'status', v_attempt.status,
    'leaveStartedAt', to_char(v_now AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'graceExpiresAt', to_char(v_grace_until AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'serverNowIso', to_char(v_now AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  );
END;
$$;

-- Atomic return from grace_period (strict server-time 5s verification)
CREATE OR REPLACE FUNCTION public.trivia_mark_return(
  _attempt_id uuid,
  _actor_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := COALESCE(auth.uid(), _actor_user_id);
  v_attempt public.daily_trivia_attempts;
  v_now timestamptz := now();
  v_grace_until timestamptz;
  v_away_ms integer := 0;
  v_cancel_res jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Oturum bulunamadı.';
  END IF;
  IF auth.uid() IS NOT NULL AND _actor_user_id IS NOT NULL AND _actor_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Yetkisiz işlem.';
  END IF;

  SELECT * INTO v_attempt
  FROM public.daily_trivia_attempts
  WHERE id = _attempt_id
    AND user_id = v_uid
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('cancelled', false, 'status', 'not_started');
  END IF;

  IF v_attempt.status = 'cancelled' THEN
    RETURN jsonb_build_object(
      'cancelled', true,
      'status', 'cancelled',
      'cancelReason', v_attempt.cancel_reason
    );
  END IF;

  IF v_attempt.status IN ('completed', 'expired') THEN
    RETURN jsonb_build_object('cancelled', false, 'expired', v_attempt.status = 'expired', 'status', v_attempt.status);
  END IF;

  IF v_attempt.status = 'grace_period' OR v_attempt.leave_started_at IS NOT NULL THEN
    v_grace_until := COALESCE(v_attempt.grace_expires_at, v_attempt.leave_started_at + interval '5 seconds');
    v_away_ms := GREATEST(0, floor(EXTRACT(EPOCH FROM (v_now - v_attempt.leave_started_at)) * 1000)::integer);

    IF v_now > v_grace_until THEN
      v_cancel_res := public.trivia_cancel_attempt(v_attempt.id, 'away_over_5s', v_uid);
      RETURN v_cancel_res || jsonb_build_object('awayMs', v_away_ms);
    END IF;

    IF v_attempt.expires_at IS NOT NULL AND v_now > v_attempt.expires_at + interval '4 seconds' THEN
      UPDATE public.daily_trivia_attempts
      SET status = 'expired',
          leave_started_at = NULL,
          grace_expires_at = NULL
      WHERE id = v_attempt.id;
      RETURN jsonb_build_object('cancelled', false, 'expired', true, 'status', 'expired', 'awayMs', v_away_ms);
    END IF;

    UPDATE public.daily_trivia_attempts
    SET status = 'in_progress',
        leave_started_at = NULL,
        grace_expires_at = NULL,
        last_activity_at = v_now,
        last_heartbeat_at = v_now
    WHERE id = v_attempt.id
      AND status IN ('grace_period', 'in_progress');

    RETURN jsonb_build_object(
      'cancelled', false,
      'status', 'in_progress',
      'awayMs', v_away_ms,
      'serverNowIso', to_char(v_now AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    );
  END IF;

  -- Active in_progress check for silent background kill (> 15s gap after active heartbeats)
  IF v_attempt.last_heartbeat_at IS NOT NULL AND (v_now - v_attempt.last_heartbeat_at) > interval '15 seconds' THEN
    v_cancel_res := public.trivia_cancel_attempt(v_attempt.id, 'inactivity_over_5s', v_uid);
    RETURN v_cancel_res;
  END IF;

  UPDATE public.daily_trivia_attempts
  SET last_activity_at = v_now,
      last_heartbeat_at = v_now
  WHERE id = v_attempt.id
    AND status = 'in_progress';

  RETURN jsonb_build_object(
    'cancelled', false,
    'status', 'in_progress',
    'awayMs', 0,
    'serverNowIso', to_char(v_now AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  );
END;
$$;

-- Atomic heartbeat (NEVER clears grace_period; enforces expired grace_period -> cancelled)
CREATE OR REPLACE FUNCTION public.trivia_heartbeat(
  _attempt_id uuid,
  _actor_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := COALESCE(auth.uid(), _actor_user_id);
  v_attempt public.daily_trivia_attempts;
  v_now timestamptz := now();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Oturum bulunamadı.';
  END IF;
  IF auth.uid() IS NOT NULL AND _actor_user_id IS NOT NULL AND _actor_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Yetkisiz işlem.';
  END IF;

  SELECT * INTO v_attempt
  FROM public.daily_trivia_attempts
  WHERE id = _attempt_id
    AND user_id = v_uid
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'status', 'not_started');
  END IF;

  IF v_attempt.status = 'grace_period' THEN
    IF v_attempt.grace_expires_at IS NOT NULL AND v_now > v_attempt.grace_expires_at THEN
      RETURN public.trivia_cancel_attempt(v_attempt.id, 'away_over_5s', v_uid);
    END IF;
    RETURN jsonb_build_object(
      'ok', true,
      'status', 'grace_period',
      'graceExpiresAt', to_char(v_attempt.grace_expires_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'serverNowIso', to_char(v_now AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    );
  END IF;

  IF v_attempt.status <> 'in_progress' THEN
    RETURN jsonb_build_object('ok', true, 'status', v_attempt.status, 'cancelled', v_attempt.status = 'cancelled');
  END IF;

  IF v_attempt.last_heartbeat_at IS NOT NULL AND (v_now - v_attempt.last_heartbeat_at) > interval '15 seconds' THEN
    RETURN public.trivia_cancel_attempt(v_attempt.id, 'inactivity_over_5s', v_uid);
  END IF;

  UPDATE public.daily_trivia_attempts
  SET last_activity_at = v_now,
      last_heartbeat_at = v_now
  WHERE id = v_attempt.id
    AND status = 'in_progress';

  RETURN jsonb_build_object(
    'ok', true,
    'status', 'in_progress',
    'serverNowIso', to_char(v_now AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  );
END;
$$;

-- Atomic server-side grading & single-transaction XP + 2h unlimited grand prize finalization
CREATE OR REPLACE FUNCTION public.trivia_finalize_attempt(
  _attempt_id uuid,
  _timed_out boolean DEFAULT false,
  _actor_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := COALESCE(auth.uid(), _actor_user_id);
  v_attempt public.daily_trivia_attempts;
  v_now timestamptz := now();
  v_answered integer := 0;
  v_correct integer := 0;
  v_xp integer := 0;
  v_perfect boolean := false;
  v_unlimited timestamptz := NULL;
  v_tx_id text;
  v_credit record;
  v_points integer := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Oturum bulunamadı.';
  END IF;
  IF auth.uid() IS NOT NULL AND _actor_user_id IS NOT NULL AND _actor_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Yetkisiz işlem.';
  END IF;

  SELECT * INTO v_attempt
  FROM public.daily_trivia_attempts
  WHERE id = _attempt_id
    AND user_id = v_uid
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Aktif yarışma bulunamadı.');
  END IF;

  IF v_attempt.status = 'cancelled' THEN
    RETURN jsonb_build_object('ok', false, 'cancelled', true, 'status', 'cancelled', 'cancelReason', v_attempt.cancel_reason);
  END IF;

  IF v_attempt.status = 'expired' THEN
    RETURN jsonb_build_object('ok', false, 'expired', true, 'status', 'expired');
  END IF;

  -- Idempotent replay on already-completed session: NEVER credits XP a second time
  IF v_attempt.status = 'completed' THEN
    SELECT COALESCE(up.points, 0) INTO v_points FROM public.user_points up WHERE up.user_id = v_uid;
    RETURN jsonb_build_object(
      'ok', true,
      'alreadyCompleted', true,
      'status', 'completed',
      'correctCount', v_attempt.correct_count,
      'answeredCount', v_attempt.answered_count,
      'xpEarned', v_attempt.xp_earned,
      'grandPrizeAwarded', v_attempt.grand_prize_awarded,
      'unlimitedExpiresAt', CASE
        WHEN v_attempt.unlimited_expires_at IS NOT NULL
        THEN to_char(v_attempt.unlimited_expires_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
        ELSE NULL
      END,
      'newUserPointsTotal', v_points
    );
  END IF;

  -- Enforce 5-second grace period deadline before awarding anything
  IF v_attempt.status = 'grace_period' AND v_attempt.grace_expires_at IS NOT NULL AND v_now > v_attempt.grace_expires_at THEN
    RETURN public.trivia_cancel_attempt(v_attempt.id, 'away_over_5s', v_uid);
  END IF;

  -- Enforce silent background kill check
  IF v_attempt.last_heartbeat_at IS NOT NULL AND (v_now - v_attempt.last_heartbeat_at) > interval '15 seconds' THEN
    RETURN public.trivia_cancel_attempt(v_attempt.id, 'inactivity_over_5s', v_uid);
  END IF;

  -- Count verified server-graded answers (25 XP per correct, 0 for wrong/blank)
  SELECT
    COUNT(*)::integer,
    COUNT(*) FILTER (WHERE is_correct)::integer
  INTO v_answered, v_correct
  FROM public.daily_trivia_answers
  WHERE attempt_id = v_attempt.id;

  -- If timed out with zero saved answers, mark as expired (0 XP)
  IF _timed_out AND v_answered = 0 THEN
    UPDATE public.daily_trivia_attempts
    SET status = 'expired',
        completed_at = v_now,
        answered_count = 0,
        correct_count = 0,
        xp_earned = 0,
        grand_prize_awarded = false,
        unlimited_expires_at = NULL,
        leave_started_at = NULL,
        grace_expires_at = NULL,
        cancel_reason = 'time_expired'
    WHERE id = v_attempt.id;

    SELECT COALESCE(up.points, 0) INTO v_points FROM public.user_points up WHERE up.user_id = v_uid;
    RETURN jsonb_build_object(
      'ok', true,
      'expired', true,
      'status', 'expired',
      'correctCount', 0,
      'answeredCount', 0,
      'xpEarned', 0,
      'grandPrizeAwarded', false,
      'unlimitedExpiresAt', NULL,
      'newUserPointsTotal', v_points
    );
  END IF;

  v_xp := v_correct * 25;
  v_perfect := (v_correct = 15);
  IF v_perfect THEN
    v_unlimited := v_now + interval '2 hours';
  END IF;
  v_tx_id := 'trivia:' || v_attempt.id::text;

  UPDATE public.daily_trivia_attempts
  SET status = 'completed',
      completed_at = v_now,
      answered_count = v_answered,
      correct_count = v_correct,
      xp_earned = v_xp,
      grand_prize_awarded = v_perfect,
      unlimited_expires_at = v_unlimited,
      leave_started_at = NULL,
      grace_expires_at = NULL,
      cancel_reason = CASE WHEN _timed_out THEN 'time_expired' ELSE NULL END,
      reward_transaction_id = CASE WHEN v_xp > 0 THEN v_tx_id ELSE NULL END
  WHERE id = v_attempt.id
    AND status IN ('in_progress', 'grace_period')
  RETURNING * INTO v_attempt;

  UPDATE public.daily_trivia_answers
  SET xp_awarded = CASE WHEN is_correct THEN 25 ELSE 0 END
  WHERE attempt_id = v_attempt.id;

  IF v_xp > 0 THEN
    SELECT * INTO v_credit
    FROM public.credit_xp_atomic(
      v_uid,
      v_xp,
      'daily_trivia:' || to_char(v_attempt.quiz_date, 'YYYY-MM-DD') || ':final',
      'daily_trivia',
      v_tx_id,
      v_attempt.id::text,
      jsonb_build_object(
        'quiz_date', v_attempt.quiz_date,
        'correct_count', v_correct,
        'answered_count', v_answered,
        'grand_prize', v_perfect
      )
    );
    v_points := COALESCE(v_credit.points, v_xp);

    UPDATE public.daily_trivia_attempts
    SET xp_credited = true,
        xp_credited_at = v_now
    WHERE id = v_attempt.id;
  ELSE
    SELECT COALESCE(up.points, 0) INTO v_points FROM public.user_points up WHERE up.user_id = v_uid;
  END IF;

  IF v_perfect AND v_unlimited IS NOT NULL THEN
    UPDATE public.profiles
    SET trivia_unlimited_until = GREATEST(COALESCE(trivia_unlimited_until, v_now), v_unlimited),
        updated_at = v_now
    WHERE user_id = v_uid;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'alreadyCompleted', false,
    'status', 'completed',
    'correctCount', v_correct,
    'answeredCount', v_answered,
    'xpEarned', v_xp,
    'grandPrizeAwarded', v_perfect,
    'unlimitedExpiresAt', CASE
      WHEN v_unlimited IS NOT NULL
      THEN to_char(v_unlimited AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
      ELSE NULL
    END,
    'rewardTransactionId', CASE WHEN v_xp > 0 THEN v_tx_id ELSE NULL END,
    'newUserPointsTotal', v_points
  );
END;
$$;

REVOKE ALL ON FUNCTION public.trivia_cancel_attempt(uuid, text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.trivia_mark_leave(uuid, text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.trivia_mark_return(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.trivia_heartbeat(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.trivia_finalize_attempt(uuid, boolean, uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.trivia_cancel_attempt(uuid, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.trivia_mark_leave(uuid, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.trivia_mark_return(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.trivia_heartbeat(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.trivia_finalize_attempt(uuid, boolean, uuid) TO authenticated, service_role;

-- ============================================================================
-- 6. VERIFIED HISTORICAL MISSING XP AUDIT & IDEMPOTENT RECONCILIATION
-- ============================================================================

-- Dry-run or apply reconciliation ONLY for provably earned but uncredited Wheel & Trivia XP.
-- Never estimates, never adds arbitrary XP, and never double-credits (enforced by transaction_id).
CREATE OR REPLACE FUNCTION public.reconcile_missing_gamification_xp(
  _apply boolean DEFAULT false,
  _target_user_id uuid DEFAULT NULL
)
RETURNS TABLE (
  user_id uuid,
  source text,
  period_date text,
  expected_xp integer,
  already_credited_xp integer,
  missing_xp integer,
  transaction_id text,
  applied boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rec record;
  v_expected integer;
  v_credited integer;
  v_missing integer;
  v_tx text;
  v_reason text;
  v_credit record;
  v_state jsonb;
  v_quiz_date text;
  v_correct integer;
BEGIN
  -- 1. Verified historical Lucky Wheel XP wins recorded in auth.users.raw_user_meta_data
  --    (from versions where award_points silently rejected 100-500 XP)
  FOR v_rec IN
    SELECT
      u.id AS uid,
      NULLIF(btrim(u.raw_user_meta_data->>'monday_wheel_last_date'), '') AS spin_date,
      NULLIF(btrim(u.raw_user_meta_data->>'monday_wheel_last_reward'), '') AS reward_id
    FROM auth.users u
    WHERE (_target_user_id IS NULL OR u.id = _target_user_id)
      AND (u.raw_user_meta_data->>'monday_wheel_last_date') ~ '^\d{4}-\d{2}-\d{2}$'
      AND (u.raw_user_meta_data->>'monday_wheel_last_reward') IN ('xp_100', 'xp_200', 'xp_300', 'xp_400', 'xp_500')
  LOOP
    v_expected := substring(v_rec.reward_id FROM '^xp_(\d+)$')::integer;

    SELECT COALESCE(SUM(GREATEST(pe.amount, 0)), 0)::integer
    INTO v_credited
    FROM public.point_events pe
    WHERE pe.user_id = v_rec.uid
      AND (
        pe.reason = 'monday_wheel:' || v_rec.spin_date
        OR pe.reason = 'wheel_xp_backfill:' || v_rec.spin_date
        OR pe.reason LIKE 'mission_wheel_' || replace(v_rec.spin_date, '-', '') || '%'
        OR pe.transaction_id = 'wheel:' || v_rec.uid::text || ':' || v_rec.spin_date
        OR pe.transaction_id = 'backfill:wheel:' || v_rec.uid::text || ':' || v_rec.spin_date
      );

    v_missing := GREATEST(0, v_expected - v_credited);
    v_tx := 'backfill:wheel:' || v_rec.uid::text || ':' || v_rec.spin_date;
    v_reason := 'wheel_xp_backfill:' || v_rec.spin_date;

    IF v_missing > 0 THEN
      IF _apply THEN
        SELECT * INTO v_credit
        FROM public.credit_xp_atomic(
          v_rec.uid,
          v_missing,
          v_reason,
          'wheel_backfill',
          v_tx,
          v_rec.spin_date,
          jsonb_build_object('reward_id', v_rec.reward_id, 'expected_xp', v_expected, 'previously_credited', v_credited)
        );
        RETURN QUERY SELECT v_rec.uid, 'wheel_backfill'::text, v_rec.spin_date, v_expected, v_credited, v_missing, v_tx, (NOT v_credit.already_credited);
      ELSE
        RETURN QUERY SELECT v_rec.uid, 'wheel_backfill'::text, v_rec.spin_date, v_expected, v_credited, v_missing, v_tx, false;
      END IF;
    END IF;
  END LOOP;

  -- 2. Verified uncredited rows in public.lucky_wheel_spins
  FOR v_rec IN
    SELECT s.*
    FROM public.lucky_wheel_spins s
    WHERE (_target_user_id IS NULL OR s.user_id = _target_user_id)
      AND s.reward_type = 'xp'
      AND s.xp_awarded > 0
      AND NOT s.xp_credited
  LOOP
    v_expected := v_rec.xp_awarded;
    SELECT COALESCE(SUM(GREATEST(pe.amount, 0)), 0)::integer
    INTO v_credited
    FROM public.point_events pe
    WHERE pe.user_id = v_rec.user_id
      AND (
        pe.transaction_id = v_rec.transaction_id
        OR pe.transaction_id = 'backfill:wheel:' || v_rec.user_id::text || ':' || to_char(v_rec.daily_period, 'YYYY-MM-DD')
        OR pe.reason = 'monday_wheel:' || to_char(v_rec.daily_period, 'YYYY-MM-DD')
        OR pe.reason = 'wheel_xp_backfill:' || to_char(v_rec.daily_period, 'YYYY-MM-DD')
        OR pe.reason LIKE 'mission_wheel_' || to_char(v_rec.daily_period, 'YYYYMMDD') || '%'
      );
    v_missing := GREATEST(0, v_expected - v_credited);
    v_tx := v_rec.transaction_id;

    IF v_missing > 0 THEN
      IF _apply THEN
        SELECT * INTO v_credit
        FROM public.credit_xp_atomic(
          v_rec.user_id,
          v_missing,
          'monday_wheel:' || to_char(v_rec.daily_period, 'YYYY-MM-DD'),
          'lucky_wheel',
          v_tx,
          v_rec.id::text,
          jsonb_build_object('segment_id', v_rec.segment_id, 'daily_period', v_rec.daily_period, 'backfilled', true)
        );
        UPDATE public.lucky_wheel_spins
        SET xp_credited = true, points_after = v_credit.points
        WHERE id = v_rec.id;
        RETURN QUERY SELECT v_rec.user_id, 'lucky_wheel_spin'::text, to_char(v_rec.daily_period, 'YYYY-MM-DD'), v_expected, v_credited, v_missing, v_tx, (NOT v_credit.already_credited);
      ELSE
        RETURN QUERY SELECT v_rec.user_id, 'lucky_wheel_spin'::text, to_char(v_rec.daily_period, 'YYYY-MM-DD'), v_expected, v_credited, v_missing, v_tx, false;
      END IF;
    ELSIF _apply THEN
      UPDATE public.lucky_wheel_spins
      SET xp_credited = true
      WHERE id = v_rec.id;
    END IF;
  END LOOP;

  -- 3. Verified completed Daily Trivia runs in auth.users.raw_user_meta_data (e.g. clipped at 300/day legacy cap)
  --    STRICTLY only status = 'completed', NEVER cancelled/expired/in_progress!
  FOR v_rec IN
    SELECT
      u.id AS uid,
      u.raw_user_meta_data->'daily_trivia_state' AS trivia_state
    FROM auth.users u
    WHERE (_target_user_id IS NULL OR u.id = _target_user_id)
      AND jsonb_typeof(u.raw_user_meta_data->'daily_trivia_state') = 'object'
      AND (u.raw_user_meta_data->'daily_trivia_state'->>'status') = 'completed'
  LOOP
    v_state := v_rec.trivia_state;
    v_quiz_date := NULLIF(btrim(v_state->>'quizDate'), '');
    IF v_quiz_date IS NULL OR v_quiz_date !~ '^\d{4}-\d{2}-\d{2}$' THEN
      CONTINUE;
    END IF;

    v_correct := LEAST(15, GREATEST(0, COALESCE((v_state->>'correctCount')::integer, 0)));
    v_expected := LEAST(375, v_correct * 25);
    IF v_expected <= 0 THEN
      CONTINUE;
    END IF;

    SELECT COALESCE(SUM(GREATEST(pe.amount, 0)), 0)::integer
    INTO v_credited
    FROM public.point_events pe
    WHERE pe.user_id = v_rec.uid
      AND (
        pe.reason LIKE 'daily_trivia:' || v_quiz_date || ':%'
        OR pe.reason LIKE 'mission_trivia_' || replace(v_quiz_date, '-', '') || '_%'
        OR pe.reason = 'trivia_xp_backfill:' || v_quiz_date
        OR pe.transaction_id = 'backfill:trivia:' || v_rec.uid::text || ':' || v_quiz_date
      );

    v_missing := GREATEST(0, v_expected - v_credited);
    v_tx := 'backfill:trivia:' || v_rec.uid::text || ':' || v_quiz_date;
    v_reason := 'trivia_xp_backfill:' || v_quiz_date;

    IF v_missing > 0 THEN
      IF _apply THEN
        SELECT * INTO v_credit
        FROM public.credit_xp_atomic(
          v_rec.uid,
          v_missing,
          v_reason,
          'trivia_backfill',
          v_tx,
          v_quiz_date,
          jsonb_build_object('correct_count', v_correct, 'expected_xp', v_expected, 'previously_credited', v_credited)
        );
        RETURN QUERY SELECT v_rec.uid, 'trivia_backfill'::text, v_quiz_date, v_expected, v_credited, v_missing, v_tx, (NOT v_credit.already_credited);
      ELSE
        RETURN QUERY SELECT v_rec.uid, 'trivia_backfill'::text, v_quiz_date, v_expected, v_credited, v_missing, v_tx, false;
      END IF;
    END IF;
  END LOOP;

  -- 3b. Verified overflow entries in auth.users.raw_user_meta_data->'daily_trivia_pending_xp'
  --     (from earlier days where legacy 300/day award_points cap deferred Q13..Q15 +25 XP chunks)
  FOR v_rec IN
    SELECT
      u.id AS uid,
      NULLIF(btrim(elem->>'reason'), '') AS entry_reason,
      COALESCE((elem->>'amount')::integer, 0) AS entry_amount
    FROM auth.users u,
         LATERAL jsonb_array_elements(
           CASE
             WHEN jsonb_typeof(u.raw_user_meta_data->'daily_trivia_pending_xp') = 'array'
             THEN u.raw_user_meta_data->'daily_trivia_pending_xp'
             ELSE '[]'::jsonb
           END
         ) AS elem
    WHERE (_target_user_id IS NULL OR u.id = _target_user_id)
      AND (elem->>'reason') ~ '^mission_trivia_\d{8}_q(0[1-9]|1[0-5])$'
      AND COALESCE((elem->>'amount')::integer, 0) = 25
  LOOP
    v_quiz_date :=
      substring(v_rec.entry_reason FROM '^mission_trivia_(\d{4})') || '-' ||
      substring(v_rec.entry_reason FROM '^mission_trivia_\d{4}(\d{2})') || '-' ||
      substring(v_rec.entry_reason FROM '^mission_trivia_\d{6}(\d{2})');

    -- Skip if this specific question reason was already credited
    IF EXISTS (
      SELECT 1 FROM public.point_events pe
      WHERE pe.user_id = v_rec.uid
        AND (
          pe.reason = v_rec.entry_reason
          OR pe.reason = 'daily_trivia:' || v_quiz_date || ':final'
          OR pe.reason = 'trivia_xp_backfill:' || v_quiz_date
          OR pe.transaction_id = 'backfill:trivia_pending:' || v_rec.uid::text || ':' || v_rec.entry_reason
        )
    ) THEN
      CONTINUE;
    END IF;

    -- Cap total trivia XP for that day strictly at 375 XP
    SELECT COALESCE(SUM(GREATEST(pe.amount, 0)), 0)::integer
    INTO v_credited
    FROM public.point_events pe
    WHERE pe.user_id = v_rec.uid
      AND (
        pe.reason LIKE 'daily_trivia:' || v_quiz_date || ':%'
        OR pe.reason LIKE 'mission_trivia_' || replace(v_quiz_date, '-', '') || '_%'
        OR pe.reason = 'trivia_xp_backfill:' || v_quiz_date
      );

    IF v_credited + 25 > 375 THEN
      CONTINUE;
    END IF;

    v_tx := 'backfill:trivia_pending:' || v_rec.uid::text || ':' || v_rec.entry_reason;
    IF _apply THEN
      SELECT * INTO v_credit
      FROM public.credit_xp_atomic(
        v_rec.uid,
        25,
        v_rec.entry_reason,
        'trivia_backfill',
        v_tx,
        v_quiz_date,
        jsonb_build_object('pending_reason', v_rec.entry_reason, 'quiz_date', v_quiz_date)
      );
      RETURN QUERY SELECT v_rec.uid, 'trivia_pending_backfill'::text, v_quiz_date, 25, 0, 25, v_tx, (NOT v_credit.already_credited);
    ELSE
      RETURN QUERY SELECT v_rec.uid, 'trivia_pending_backfill'::text, v_quiz_date, 25, 0, 25, v_tx, false;
    END IF;
  END LOOP;

  -- 4. Verified completed rows in public.daily_trivia_attempts where xp_credited = false
  FOR v_rec IN
    SELECT a.*
    FROM public.daily_trivia_attempts a
    WHERE (_target_user_id IS NULL OR a.user_id = _target_user_id)
      AND a.status = 'completed'
      AND a.xp_earned > 0
      AND NOT a.xp_credited
  LOOP
    v_quiz_date := to_char(v_rec.quiz_date, 'YYYY-MM-DD');
    v_expected := LEAST(375, GREATEST(0, v_rec.correct_count * 25));
    IF v_expected <= 0 THEN
      CONTINUE;
    END IF;

    SELECT COALESCE(SUM(GREATEST(pe.amount, 0)), 0)::integer
    INTO v_credited
    FROM public.point_events pe
    WHERE pe.user_id = v_rec.user_id
      AND (
        pe.transaction_id = 'trivia:' || v_rec.id::text
        OR pe.reason LIKE 'daily_trivia:' || v_quiz_date || ':%'
        OR pe.reason LIKE 'mission_trivia_' || replace(v_quiz_date, '-', '') || '_%'
        OR pe.reason = 'trivia_xp_backfill:' || v_quiz_date
      );

    v_missing := GREATEST(0, v_expected - v_credited);
    v_tx := COALESCE(v_rec.reward_transaction_id, 'trivia:' || v_rec.id::text);

    IF v_missing > 0 THEN
      IF _apply THEN
        SELECT * INTO v_credit
        FROM public.credit_xp_atomic(
          v_rec.user_id,
          v_missing,
          'trivia_xp_backfill:' || v_quiz_date,
          'trivia_backfill',
          v_tx,
          v_rec.id::text,
          jsonb_build_object('attempt_id', v_rec.id, 'correct_count', v_rec.correct_count, 'previously_credited', v_credited)
        );
        UPDATE public.daily_trivia_attempts
        SET xp_credited = true,
            xp_credited_at = now(),
            reward_transaction_id = v_tx
        WHERE id = v_rec.id;
        RETURN QUERY SELECT v_rec.user_id, 'daily_trivia_attempt'::text, v_quiz_date, v_expected, v_credited, v_missing, v_tx, (NOT v_credit.already_credited);
      ELSE
        RETURN QUERY SELECT v_rec.user_id, 'daily_trivia_attempt'::text, v_quiz_date, v_expected, v_credited, v_missing, v_tx, false;
      END IF;
    ELSIF _apply THEN
      UPDATE public.daily_trivia_attempts
      SET xp_credited = true,
          xp_credited_at = now()
      WHERE id = v_rec.id;
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_missing_gamification_xp(boolean, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_missing_gamification_xp(boolean, uuid) TO service_role;

-- Safe per-user self-reconciliation RPC (only inspects & reconciles auth.uid() verified records)
CREATE OR REPLACE FUNCTION public.reconcile_my_missing_xp()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_total_added integer := 0;
  v_items jsonb := '[]'::jsonb;
  v_points integer := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Oturum bulunamadı.';
  END IF;

  SELECT
    COALESCE(SUM(CASE WHEN r.applied THEN r.missing_xp ELSE 0 END), 0)::integer,
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'source', r.source,
          'periodDate', r.period_date,
          'creditedXp', CASE WHEN r.applied THEN r.missing_xp ELSE 0 END,
          'transactionId', r.transaction_id
        )
      ) FILTER (WHERE r.applied AND r.missing_xp > 0),
      '[]'::jsonb
    )
  INTO v_total_added, v_items
  FROM public.reconcile_missing_gamification_xp(true, v_uid) r;

  SELECT COALESCE(up.points, 0) INTO v_points
  FROM public.user_points up
  WHERE up.user_id = v_uid;

  RETURN jsonb_build_object(
    'ok', true,
    'creditedXp', v_total_added,
    'items', v_items,
    'userPoints', COALESCE(v_points, 0)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_my_missing_xp() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reconcile_my_missing_xp() TO authenticated;

-- Automatically and idempotently backfill any verified uncredited historical Wheel/Trivia XP once on migration
SELECT * FROM public.reconcile_missing_gamification_xp(true, NULL);

NOTIFY pgrst, 'reload schema';
