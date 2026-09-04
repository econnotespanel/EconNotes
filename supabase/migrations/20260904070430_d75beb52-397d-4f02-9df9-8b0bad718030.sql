ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS hide_surname boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.mask_display_name(_full_name text, _hide boolean)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN COALESCE(_hide, true) IS FALSE THEN COALESCE(NULLIF(btrim(_full_name), ''), 'Kullanıcı')
    WHEN COALESCE(NULLIF(btrim(_full_name), ''), '') = '' THEN 'Kullanıcı'
    WHEN position(' ' in btrim(_full_name)) = 0 THEN btrim(_full_name)
    ELSE split_part(btrim(_full_name), ' ', 1) || ' ' ||
         upper(substr(regexp_replace(btrim(_full_name), '^\S+\s+', ''), 1, 1)) || '...'
  END;
$$;

CREATE OR REPLACE FUNCTION public.get_leaderboard(_limit integer DEFAULT 10)
RETURNS TABLE(user_id uuid, full_name text, avatar_url text, university text, points integer, current_streak integer, total_logins integer, rank integer)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.user_id,
         public.mask_display_name(pr.full_name, pr.hide_surname) AS full_name,
         pr.avatar_url,
         pr.university,
         p.points,
         p.current_streak,
         p.total_logins,
         (ROW_NUMBER() OVER (ORDER BY p.points DESC, p.current_streak DESC))::int AS rank
  FROM public.user_points p
  LEFT JOIN public.profiles pr ON pr.user_id = p.user_id
  WHERE p.points > 0
  ORDER BY p.points DESC, p.current_streak DESC
  LIMIT GREATEST(COALESCE(_limit, 10), 1);
$$;

REVOKE ALL ON FUNCTION public.admin_get_note_password(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.award_daily_login() FROM anon;
REVOKE ALL ON FUNCTION public.award_points(text, integer) FROM anon;
REVOKE ALL ON FUNCTION public.get_download_quota(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.get_leaderboard(integer) FROM anon;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM anon;
REVOKE ALL ON FUNCTION public.is_admin(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.promote_students_annual() FROM anon;
REVOKE ALL ON FUNCTION public.verify_note_password(uuid, text) FROM anon;

GRANT EXECUTE ON FUNCTION public.mask_display_name(text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_leaderboard(integer) TO authenticated;