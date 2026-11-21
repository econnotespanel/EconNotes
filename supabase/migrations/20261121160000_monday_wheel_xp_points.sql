-- Migration: Enable Monday Chance Wheel XP rewards (100 - 500 XP) in user_points & point_events
-- Fixes silent rejection by award_points' 50-point limit and reason allowlist.

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
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_is_admin boolean;
  v_istanbul_now timestamp := (now() AT TIME ZONE 'Europe/Istanbul');
  v_today_str text := to_char(v_istanbul_now::date, 'YYYY-MM-DD');
  v_is_monday boolean := (EXTRACT(ISODOW FROM v_istanbul_now) = 1);
  v_reason text;
  v_total integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Oturum bulunamadı.';
  END IF;

  IF _amount IS NULL OR _amount NOT IN (100, 200, 300, 400, 500) THEN
    RAISE EXCEPTION 'Geçersiz çark XP miktarı.';
  END IF;

  v_is_admin := public.is_admin(v_uid);
  IF NOT v_is_monday AND NOT v_is_admin THEN
    RAISE EXCEPTION 'Şans çarkı yalnızca Pazartesi günleri çevrilebilir.';
  END IF;

  v_reason := 'monday_wheel:' || v_today_str;

  INSERT INTO public.user_points (user_id)
  VALUES (v_uid)
  ON CONFLICT (user_id) DO NOTHING;

  -- Idempotent per-day guard: prevent double crediting on the same day
  IF EXISTS (
    SELECT 1
    FROM public.point_events pe
    WHERE pe.user_id = v_uid
      AND pe.reason = v_reason
  ) THEN
    SELECT up.points INTO v_total
    FROM public.user_points up
    WHERE up.user_id = v_uid;

    RETURN QUERY SELECT COALESCE(v_total, 0), 0, true;
    RETURN;
  END IF;

  UPDATE public.user_points up
  SET points = up.points + _amount,
      updated_at = now()
  WHERE up.user_id = v_uid
  RETURNING up.points INTO v_total;

  INSERT INTO public.point_events (user_id, amount, reason)
  VALUES (v_uid, _amount, v_reason);

  RETURN QUERY SELECT COALESCE(v_total, _amount), _amount, false;
END;
$function$;

CREATE OR REPLACE FUNCTION public.award_points(_reason text, _amount integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_total integer;
  v_today_sum integer;
  v_wheel_res record;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Oturum bulunamadı.';
  END IF;

  -- Delegate Monday Chance Wheel XP rewards (100 - 500 XP) to the validated wheel RPC
  IF _reason IS NOT NULL AND _reason LIKE 'monday_wheel%' THEN
    SELECT * INTO v_wheel_res
    FROM public.claim_monday_wheel_xp(_amount, NULL);
    RETURN v_wheel_res.points;
  END IF;

  IF _amount IS NULL OR _amount < 1 OR _amount > 50 THEN
    RAISE EXCEPTION 'Geçersiz puan.';
  END IF;

  IF _reason IS NULL OR NOT (_reason IN ('kpss_attempt', 'note_upload') OR _reason LIKE 'mission_%') OR length(_reason) > 60 THEN
    RAISE EXCEPTION 'Geçersiz puan nedeni.';
  END IF;

  IF _reason LIKE 'mission_%' AND EXISTS (
    SELECT 1 FROM public.point_events
    WHERE user_id = v_uid AND reason = _reason AND created_at > now() - interval '7 days'
  ) THEN
    RAISE EXCEPTION 'Bu görev ödülü zaten alındı.';
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_today_sum
  FROM public.point_events
  WHERE user_id = v_uid
    AND reason <> 'daily_login'
    AND reason NOT LIKE 'monday_wheel%'
    AND created_at > now() - interval '1 day';

  IF v_today_sum + _amount > 300 THEN
    RAISE EXCEPTION 'Günlük puan sınırına ulaşıldı.';
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
$function$;

REVOKE ALL ON FUNCTION public.claim_monday_wheel_xp(integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_monday_wheel_xp(integer, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.award_points(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.award_points(text, integer) TO authenticated;

NOTIFY pgrst, 'reload schema';
