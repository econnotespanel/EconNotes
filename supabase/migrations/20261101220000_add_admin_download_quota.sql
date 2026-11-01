ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS manual_download_quota INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_manual_download_quota_check'
  ) THEN
    ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_manual_download_quota_check
    CHECK (manual_download_quota IS NULL OR manual_download_quota BETWEEN 1 AND 9);
  END IF;
END $$;

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
  v_is_admin boolean;
BEGIN
  SELECT COUNT(*)::integer INTO v_uploads
  FROM public.notes
  WHERE user_id = _user_id AND status = 'approved';

  SELECT COUNT(*)::integer INTO v_downloads
  FROM public.note_downloads
  WHERE user_id = _user_id;

  SELECT manual_download_quota INTO v_manual_quota
  FROM public.profiles
  WHERE user_id = _user_id;

  v_base_allowed := CASE WHEN v_uploads = 0 THEN 2 ELSE v_uploads * 2 END;
  v_is_admin := public.is_admin(_user_id);

  RETURN QUERY SELECT
    v_uploads,
    v_downloads,
    COALESCE(v_manual_quota, v_base_allowed),
    GREATEST(COALESCE(v_manual_quota, v_base_allowed) - v_downloads, 0),
    v_is_admin OR v_downloads < COALESCE(v_manual_quota, v_base_allowed),
    v_is_admin;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_download_quota(_user_id uuid, _quota integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only administrators can change download quotas';
  END IF;

  IF _quota IS NOT NULL AND (_quota < 1 OR _quota > 9) THEN
    RAISE EXCEPTION 'Download quota must be between 1 and 9';
  END IF;

  UPDATE public.profiles
  SET manual_download_quota = _quota
  WHERE user_id = _user_id;

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_download_quota(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_download_quota(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_download_quota(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
