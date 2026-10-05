DROP POLICY IF EXISTS "Everyone signed in can view points" ON public.user_points;
CREATE POLICY "Users view own points" ON public.user_points FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.award_points(_reason text, _amount integer)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_total integer;
  v_today_sum integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Oturum bulunamadı.'; END IF;
  IF _amount IS NULL OR _amount < 1 OR _amount > 50 THEN RAISE EXCEPTION 'Geçersiz puan.'; END IF;
  IF _reason IS NULL OR NOT (_reason IN ('kpss_attempt','note_upload') OR _reason LIKE 'mission_%') OR length(_reason) > 60 THEN
    RAISE EXCEPTION 'Geçersiz puan nedeni.';
  END IF;
  IF _reason LIKE 'mission_%' AND EXISTS (SELECT 1 FROM public.point_events WHERE user_id = v_uid AND reason = _reason AND created_at > now() - interval '7 days') THEN
    RAISE EXCEPTION 'Bu görev ödülü zaten alındı.';
  END IF;
  SELECT COALESCE(SUM(amount),0) INTO v_today_sum FROM public.point_events
   WHERE user_id = v_uid AND reason <> 'daily_login' AND created_at > now() - interval '1 day';
  IF v_today_sum + _amount > 300 THEN RAISE EXCEPTION 'Günlük puan sınırına ulaşıldı.'; END IF;

  INSERT INTO public.user_points (user_id) VALUES (v_uid) ON CONFLICT (user_id) DO NOTHING;
  UPDATE public.user_points SET points = points + _amount, updated_at = now()
  WHERE user_id = v_uid RETURNING points INTO v_total;
  INSERT INTO public.point_events (user_id, amount, reason) VALUES (v_uid, _amount, _reason);
  RETURN v_total;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.award_points(text, integer) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.award_daily_login() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.admin_get_note_password(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.promote_students_annual() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.verify_note_password(uuid, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_download_quota(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_leaderboard(integer) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.award_points(text, integer), public.award_daily_login(), public.admin_get_note_password(uuid), public.promote_students_annual(), public.verify_note_password(uuid, text), public.get_download_quota(uuid), public.get_leaderboard(integer) TO authenticated;