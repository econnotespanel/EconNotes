-- Points / gamification
CREATE TABLE IF NOT EXISTS public.user_points (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  points integer NOT NULL DEFAULT 0,
  current_streak integer NOT NULL DEFAULT 0,
  longest_streak integer NOT NULL DEFAULT 0,
  total_logins integer NOT NULL DEFAULT 0,
  last_login_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.user_points TO authenticated;
GRANT ALL ON public.user_points TO service_role;
ALTER TABLE public.user_points ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Everyone signed in can view points" ON public.user_points
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage points" ON public.user_points
  FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE TRIGGER update_user_points_updated_at BEFORE UPDATE ON public.user_points
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.point_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  amount integer NOT NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.point_events TO authenticated;
GRANT ALL ON public.point_events TO service_role;
ALTER TABLE public.point_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own point events" ON public.point_events
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin(auth.uid()));

CREATE INDEX IF NOT EXISTS point_events_user_idx ON public.point_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS user_points_points_idx ON public.user_points(points DESC);

-- Daily login award
CREATE OR REPLACE FUNCTION public.award_daily_login()
RETURNS TABLE(awarded integer, points integer, current_streak integer, longest_streak integer, already_claimed boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.user_points;
  v_today date := (now() AT TIME ZONE 'Europe/Istanbul')::date;
  v_award integer := 0;
  v_streak integer := 1;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Oturum bulunamadı.';
  END IF;

  INSERT INTO public.user_points (user_id) VALUES (v_uid)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT * INTO v_row FROM public.user_points WHERE user_id = v_uid FOR UPDATE;

  IF v_row.last_login_date = v_today THEN
    RETURN QUERY SELECT 0, v_row.points, v_row.current_streak, v_row.longest_streak, true;
    RETURN;
  END IF;

  IF v_row.last_login_date = v_today - 1 THEN
    v_streak := v_row.current_streak + 1;
  ELSE
    v_streak := 1;
  END IF;

  v_award := 10 + LEAST(v_streak * 2, 40);

  UPDATE public.user_points
  SET points = points + v_award,
      current_streak = v_streak,
      longest_streak = GREATEST(longest_streak, v_streak),
      total_logins = total_logins + 1,
      last_login_date = v_today,
      updated_at = now()
  WHERE user_id = v_uid
  RETURNING * INTO v_row;

  INSERT INTO public.point_events (user_id, amount, reason)
  VALUES (v_uid, v_award, 'daily_login');

  RETURN QUERY SELECT v_award, v_row.points, v_row.current_streak, v_row.longest_streak, false;
END;
$$;

-- Manual point award (used by app actions)
CREATE OR REPLACE FUNCTION public.award_points(_reason text, _amount integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_total integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Oturum bulunamadı.'; END IF;
  IF _amount IS NULL OR _amount < 1 OR _amount > 100 THEN RAISE EXCEPTION 'Geçersiz puan.'; END IF;

  INSERT INTO public.user_points (user_id) VALUES (v_uid) ON CONFLICT (user_id) DO NOTHING;

  UPDATE public.user_points SET points = points + _amount, updated_at = now()
  WHERE user_id = v_uid RETURNING points INTO v_total;

  INSERT INTO public.point_events (user_id, amount, reason) VALUES (v_uid, _amount, _reason);
  RETURN v_total;
END;
$$;

-- Leaderboard
CREATE OR REPLACE FUNCTION public.get_leaderboard(_limit integer DEFAULT 10)
RETURNS TABLE(user_id uuid, full_name text, avatar_url text, university text, points integer, current_streak integer, total_logins integer, rank integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.user_id,
         COALESCE(pr.full_name, 'Kullanıcı') AS full_name,
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

GRANT EXECUTE ON FUNCTION public.award_daily_login() TO authenticated;
GRANT EXECUTE ON FUNCTION public.award_points(text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_leaderboard(integer) TO authenticated;