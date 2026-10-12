-- Fix default quota for first-time users: they start with 2 downloads before any approved uploads.
-- Once at least one approved note is uploaded, the quota is recalculated from that contribution.

CREATE OR REPLACE FUNCTION public.get_download_quota(_user_id uuid)
RETURNS TABLE(
  approved_uploads integer,
  total_downloads integer,
  allowed_downloads integer,
  remaining integer,
  can_download boolean,
  is_admin boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uploads integer;
  v_downloads integer;
  v_allowed integer;
  v_is_admin boolean;
BEGIN
  v_is_admin := public.is_admin(_user_id);

  SELECT COUNT(*)::int INTO v_uploads
  FROM public.notes
  WHERE user_id = _user_id AND status = 'approved';

  SELECT COUNT(*)::int INTO v_downloads
  FROM public.note_downloads
  WHERE user_id = _user_id;

  v_allowed := GREATEST(2, v_uploads * 2);

  RETURN QUERY SELECT
    v_uploads,
    v_downloads,
    v_allowed,
    GREATEST(v_allowed - v_downloads, 0),
    (v_is_admin OR v_downloads < v_allowed),
    v_is_admin;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_download_quota(uuid) TO authenticated;
