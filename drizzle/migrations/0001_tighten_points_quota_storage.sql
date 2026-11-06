CREATE OR REPLACE FUNCTION public.get_download_quota(_user_id uuid)
 RETURNS TABLE(approved_uploads integer, total_downloads integer, allowed_downloads integer, remaining integer, can_download boolean, is_admin boolean)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_uploads integer; v_downloads integer; v_allowed integer; v_is_admin boolean; v_manual integer;
BEGIN
  IF auth.uid() IS NULL OR (_user_id <> auth.uid() AND NOT public.is_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Bu bilgiye erişim yetkiniz yok.';
  END IF;
  v_is_admin := public.is_admin(_user_id);
  SELECT COUNT(*)::int INTO v_uploads FROM public.notes WHERE user_id = _user_id AND status = 'approved';
  SELECT COUNT(*)::int INTO v_downloads FROM public.note_downloads WHERE user_id = _user_id;
  SELECT manual_download_quota INTO v_manual FROM public.profiles WHERE user_id = _user_id;
  v_allowed := v_uploads * 2 + COALESCE(v_manual, 0);
  RETURN QUERY SELECT v_uploads, v_downloads, v_allowed, GREATEST(v_allowed - v_downloads, 0),
    (v_is_admin OR v_downloads < v_allowed), v_is_admin;
END;
$function$;

CREATE OR REPLACE FUNCTION public.award_points(_reason text, _amount integer)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_total integer;
  v_today_sum integer;
  v_award integer;
  v_score integer; v_q integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Oturum bulunamadı.'; END IF;
  IF _reason IS NULL OR length(_reason) > 60 THEN RAISE EXCEPTION 'Geçersiz puan nedeni.'; END IF;

  IF _reason = 'note_upload' THEN
    -- each own note uploaded in the last hour may be rewarded once
    IF (SELECT COUNT(*) FROM public.notes WHERE user_id = v_uid AND created_at > now() - interval '1 hour')
       <= (SELECT COUNT(*) FROM public.point_events WHERE user_id = v_uid AND reason = 'note_upload' AND created_at > now() - interval '1 hour') THEN
      RAISE EXCEPTION 'Ödüllendirilecek yeni not bulunamadı.';
    END IF;
    v_award := 25;
  ELSIF _reason = 'kpss_attempt' THEN
    SELECT score, total_questions INTO v_score, v_q FROM public.kpss_attempts
     WHERE user_id = v_uid AND created_at > now() - interval '15 minutes'
       AND NOT EXISTS (SELECT 1 FROM public.point_events pe WHERE pe.user_id = v_uid AND pe.reason = 'kpss_attempt' AND pe.created_at >= kpss_attempts.created_at)
     ORDER BY created_at DESC LIMIT 1;
    IF v_q IS NULL OR v_q = 0 THEN RAISE EXCEPTION 'Ödüllendirilecek yeni deneme bulunamadı.'; END IF;
    v_award := LEAST(GREATEST(5, round(v_score::numeric * 20 / v_q)::int), 20);
  ELSIF _reason LIKE 'mission_%' THEN
    IF EXISTS (SELECT 1 FROM public.point_events WHERE user_id = v_uid AND reason = _reason AND created_at > now() - interval '7 days') THEN
      RAISE EXCEPTION 'Bu görev ödülü zaten alındı.';
    END IF;
    v_award := 15;
  ELSE
    RAISE EXCEPTION 'Geçersiz puan nedeni.';
  END IF;

  SELECT COALESCE(SUM(amount),0) INTO v_today_sum FROM public.point_events
   WHERE user_id = v_uid AND reason <> 'daily_login' AND created_at > now() - interval '1 day';
  IF v_today_sum + v_award > 300 THEN RAISE EXCEPTION 'Günlük puan sınırına ulaşıldı.'; END IF;

  INSERT INTO public.user_points (user_id) VALUES (v_uid) ON CONFLICT (user_id) DO NOTHING;
  UPDATE public.user_points SET points = points + v_award, updated_at = now()
  WHERE user_id = v_uid RETURNING points INTO v_total;
  INSERT INTO public.point_events (user_id, amount, reason) VALUES (v_uid, v_award, _reason);
  RETURN v_total;
END;
$function$;

DROP POLICY IF EXISTS "Notes files authenticated scoped read" ON storage.objects;
CREATE POLICY "Notes files authenticated scoped read" ON storage.objects
FOR SELECT TO authenticated USING (
  bucket_id = 'notes' AND (
    public.is_admin(auth.uid())
    OR (storage.foldername(name))[1] = (auth.uid())::text
    OR ((storage.foldername(name))[1] IN ('messages','study-reports') AND (storage.foldername(name))[2] = (auth.uid())::text)
    OR ((storage.foldername(name))[1] = 'messages' AND EXISTS (
         SELECT 1 FROM public.messages m WHERE m.receiver_id = auth.uid()
           AND m.sender_id::text = (storage.foldername(objects.name))[2]
           AND position(objects.name in m.content) > 0))
    OR (storage.foldername(name))[1] = 'announcements'
    OR EXISTS (SELECT 1 FROM public.notes n WHERE n.status = 'approved' AND n.file_url LIKE ('%' || objects.name))
  )
);