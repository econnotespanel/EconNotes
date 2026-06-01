-- Function: returns user's download quota status
-- Rule: For every 2 downloads, user must have at least 1 APPROVED upload.
-- allowed_downloads = 2 * approved_uploads
-- Applies to everyone including first-time downloaders (0 uploads => 0 allowed).
-- Admins are exempt.

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

  v_allowed := v_uploads * 2;

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