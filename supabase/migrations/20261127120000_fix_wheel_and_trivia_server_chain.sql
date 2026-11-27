-- ============================================================================
-- Migration: 20261127120000_fix_wheel_and_trivia_server_chain.sql
--
-- Idempotent repair & synchronization for Lucky Wheel (Şans Çarkı) and
-- Daily General Knowledge Trivia (Günlük Bilgi Yarışması) atomic server chain:
-- 1. Ensures `prevent_answer_on_inactive_trivia()` allows internal `xp_awarded`
--    stamping during `trivia_finalize_attempt()` while strictly blocking late/inactive
--    answer mutations.
-- 2. Re-syncs `spin_lucky_wheel()` and `trivia_finalize_attempt()` with
--    `app.trusted_profile_mutation` guard (for `protect_profiles_privileged_columns`),
--    period-scoped `client_request_id` idempotent replay, approved/unbanned guard,
--    exact original reward pool & weights [18, 22, 20, 10, 14, 10, 6], and atomic
--    XP crediting via `credit_xp_atomic`.
-- 3. Reloads PostgREST schema cache (`NOTIFY pgrst, 'reload schema'`).
--
-- SAFETY: 100% non-destructive & idempotent; never alters existing user accounts,
-- balances, or reward history.
-- ============================================================================

-- 0. Ensure approved/unbanned helper exists (self-sufficient even if run before 20261124180000)
CREATE OR REPLACE FUNCTION public.is_approved_unbanned_user(_uid UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status TEXT;
  v_banned BOOLEAN := false;
BEGIN
  IF _uid IS NULL THEN
    RETURN false;
  END IF;

  IF public.is_admin(_uid) THEN
    RETURN true;
  END IF;

  SELECT approval_status
  INTO v_status
  FROM public.profiles
  WHERE user_id = _uid;

  IF v_status IS NULL OR v_status <> 'approved' THEN
    RETURN false;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.penalties p
    WHERE p.user_id = _uid
      AND (
        p.is_permanent = true
        OR (p.penalty_until IS NOT NULL AND p.penalty_until > now())
      )
  ) INTO v_banned;

  RETURN NOT v_banned;
END;
$$;

REVOKE ALL ON FUNCTION public.is_approved_unbanned_user(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_approved_unbanned_user(UUID) TO authenticated, service_role;

-- 1. Fix Daily Trivia answer trigger so completing an attempt can stamp xp_awarded
CREATE OR REPLACE FUNCTION public.prevent_answer_on_inactive_trivia()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_attempt public.daily_trivia_attempts%ROWTYPE;
BEGIN
  SELECT * INTO v_attempt
  FROM public.daily_trivia_attempts
  WHERE id = NEW.attempt_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Yarışma oturumu bulunamadı.';
  END IF;

  -- Allow internal xp_awarded stamping only when finalizing an already-recorded answer on a completed attempt
  IF TG_OP = 'UPDATE' AND v_attempt.status = 'completed'
     AND NEW.selected_option = OLD.selected_option
     AND NEW.is_correct = OLD.is_correct THEN
    RETURN NEW;
  END IF;

  IF v_attempt.status NOT IN ('in_progress', 'grace_period') THEN
    RAISE EXCEPTION 'İptal edilmiş, süresi dolmuş veya tamamlanmış yarışmaya cevap kaydedilemez.';
  END IF;

  IF v_attempt.status = 'grace_period' AND v_attempt.grace_expires_at IS NOT NULL AND now() > v_attempt.grace_expires_at THEN
    RAISE EXCEPTION '5 saniyelik geri dönüş süresi dolduğu için cevap kabul edilemez.';
  END IF;

  IF v_attempt.expires_at IS NOT NULL AND now() > v_attempt.expires_at THEN
    RAISE EXCEPTION 'Yarışma süresi dolduğu için cevap kaydedilemez.';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_answer_on_inactive_trivia() FROM PUBLIC, anon, authenticated;

-- 2. Re-sync atomic Lucky Wheel spin RPC (period-scoped idempotent replay + trusted profile mutation + approval check)
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

  IF NOT v_is_admin AND NOT public.is_approved_unbanned_user(v_uid) THEN
    RAISE EXCEPTION 'Hesabınız bu işlem için onaylı değil.';
  END IF;

  -- Atomic per-user + per-day lock blocks concurrent multi-tab / multi-device double spins
  PERFORM pg_advisory_xact_lock(
    hashtext('lucky_wheel:' || v_uid::text || ':' || to_char(v_bounds.daily_period, 'YYYY-MM-DD'))
  );

  -- 1. Idempotent replay by client_request_id within the same daily period:
  --    returns exact saved spin, NEVER creates a second reward or credits XP twice
  IF v_req_id IS NOT NULL THEN
    SELECT * INTO v_existing
    FROM public.lucky_wheel_spins
    WHERE user_id = v_uid
      AND daily_period = v_bounds.daily_period
      AND client_request_id = v_req_id
    LIMIT 1;

    IF FOUND THEN
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
    PERFORM set_config('app.trusted_profile_mutation', 'true', true);
    UPDATE public.profiles
    SET wheel_bonus_quota = COALESCE(wheel_bonus_quota, 0) + v_reward_amount,
        updated_at = now()
    WHERE user_id = v_uid
    RETURNING COALESCE(wheel_bonus_quota, 0) INTO v_bonus_quota;
    PERFORM set_config('app.trusted_profile_mutation', 'false', true);

    UPDATE public.lucky_wheel_spins
    SET quota_bonus_added = v_reward_amount
    WHERE id = v_spin.id
    RETURNING * INTO v_spin;
  ELSIF v_reward_type = 'unlimited_day' THEN
    PERFORM set_config('app.trusted_profile_mutation', 'true', true);
    UPDATE public.profiles
    SET wheel_unlimited_until = GREATEST(COALESCE(wheel_unlimited_until, now()), now()) + interval '24 hours',
        updated_at = now()
    WHERE user_id = v_uid
    RETURNING wheel_unlimited_until INTO v_unlimited_until;
    PERFORM set_config('app.trusted_profile_mutation', 'false', true);

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

-- 3. Re-sync atomic Daily Trivia finalization RPC with trusted profile mutation for 15/15 2-hour unlimited prize
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
      'newUserPointsTotal', COALESCE(v_points, 0)
    );
  END IF;

  IF v_attempt.status = 'grace_period' AND v_attempt.grace_expires_at IS NOT NULL AND v_now > v_attempt.grace_expires_at THEN
    RETURN public.trivia_cancel_attempt(v_attempt.id, 'away_over_5s', v_uid);
  END IF;

  IF v_attempt.last_heartbeat_at IS NOT NULL AND (v_now - v_attempt.last_heartbeat_at) > interval '15 seconds' THEN
    RETURN public.trivia_cancel_attempt(v_attempt.id, 'inactivity_over_5s', v_uid);
  END IF;

  SELECT
    COUNT(*)::integer,
    COUNT(*) FILTER (WHERE is_correct)::integer
  INTO v_answered, v_correct
  FROM public.daily_trivia_answers
  WHERE attempt_id = v_attempt.id;

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
      'newUserPointsTotal', COALESCE(v_points, 0)
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
    PERFORM set_config('app.trusted_profile_mutation', 'true', true);
    UPDATE public.profiles
    SET trivia_unlimited_until = GREATEST(COALESCE(trivia_unlimited_until, v_now), v_unlimited),
        updated_at = v_now
    WHERE user_id = v_uid;
    PERFORM set_config('app.trusted_profile_mutation', 'false', true);
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
    'newUserPointsTotal', COALESCE(v_points, 0)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.trivia_finalize_attempt(uuid, boolean, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.trivia_finalize_attempt(uuid, boolean, uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
