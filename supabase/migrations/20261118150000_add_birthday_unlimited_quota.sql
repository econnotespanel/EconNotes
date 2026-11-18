-- Kullanıcılara doğum tarihi (birth_date) alanı ekler ve doğum günlerinde
-- 1 gün boyunca sınırsız not görüntüleme ve indirme hakkı tanımlar.

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS birth_date DATE;

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
  v_birth_date date;
  v_is_birthday boolean := false;
  v_is_admin boolean;
BEGIN
  SELECT COUNT(*)::integer INTO v_uploads
  FROM public.notes
  WHERE user_id = _user_id AND status = 'approved';

  SELECT COUNT(*)::integer INTO v_downloads
  FROM public.note_downloads
  WHERE user_id = _user_id;

  SELECT manual_download_quota, birth_date
  INTO v_manual_quota, v_birth_date
  FROM public.profiles
  WHERE user_id = _user_id;

  IF v_birth_date IS NOT NULL THEN
    v_is_birthday := (
      EXTRACT(MONTH FROM v_birth_date) = EXTRACT(MONTH FROM (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Istanbul'))
      AND EXTRACT(DAY FROM v_birth_date) = EXTRACT(DAY FROM (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Istanbul'))
    );
  END IF;

  v_base_allowed := CASE WHEN v_uploads = 0 THEN 2 ELSE v_uploads * 2 END;
  v_is_admin := public.is_admin(_user_id);

  RETURN QUERY SELECT
    v_uploads,
    v_downloads,
    CASE WHEN v_is_birthday THEN GREATEST(COALESCE(v_manual_quota, v_base_allowed), v_downloads + 999) ELSE COALESCE(v_manual_quota, v_base_allowed) END,
    CASE WHEN v_is_birthday THEN 999 ELSE GREATEST(COALESCE(v_manual_quota, v_base_allowed) - v_downloads, 0) END,
    v_is_admin OR v_is_birthday OR v_downloads < COALESCE(v_manual_quota, v_base_allowed),
    v_is_admin;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_download_quota(uuid) TO authenticated;
NOTIFY pgrst, 'reload schema';
