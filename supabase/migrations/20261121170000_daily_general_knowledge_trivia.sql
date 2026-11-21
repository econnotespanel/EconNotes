-- Migration: EconNotes Daily General Knowledge Trivia (Günlük Genel Kültür Bilgi Yarışması)
-- Server-authoritative daily 15-question sets, anti-cheat attempt tracking, per-question +25 XP,
-- and real-time 2-hour unlimited note viewing & downloading grand prize for 15/15 perfect scores.

-- 1. Daily canonical 15-question sets (service_role only so answers are never leaked to clients)
CREATE TABLE IF NOT EXISTS public.daily_trivia_sets (
  quiz_date date PRIMARY KEY,
  questions jsonb NOT NULL,
  source_mode text NOT NULL DEFAULT 'hybrid',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.daily_trivia_sets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.daily_trivia_sets FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.daily_trivia_sets TO service_role;

-- 2. Historical question hash registry so previous days' questions are never repeated
CREATE TABLE IF NOT EXISTS public.daily_trivia_used_questions (
  question_hash text PRIMARY KEY,
  quiz_date date NOT NULL,
  category text NOT NULL DEFAULT 'Genel Kültür',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS daily_trivia_used_questions_date_idx
  ON public.daily_trivia_used_questions (quiz_date DESC);

ALTER TABLE public.daily_trivia_used_questions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.daily_trivia_used_questions FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.daily_trivia_used_questions TO service_role;

-- 3. Per-user daily attempts (strictly 1 participation per user per calendar day)
CREATE TABLE IF NOT EXISTS public.daily_trivia_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  quiz_date date NOT NULL,
  status text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'cancelled')),
  current_index integer NOT NULL DEFAULT 0 CHECK (current_index >= 0 AND current_index <= 15),
  answered_count integer NOT NULL DEFAULT 0 CHECK (answered_count >= 0 AND answered_count <= 15),
  correct_count integer NOT NULL DEFAULT 0 CHECK (correct_count >= 0 AND correct_count <= 15),
  xp_earned integer NOT NULL DEFAULT 0 CHECK (xp_earned >= 0 AND xp_earned <= 375),
  grand_prize_awarded boolean NOT NULL DEFAULT false,
  unlimited_expires_at timestamptz,
  leave_started_at timestamptz,
  leave_count integer NOT NULL DEFAULT 0,
  cancel_reason text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  cancelled_at timestamptz,
  UNIQUE (user_id, quiz_date)
);

CREATE INDEX IF NOT EXISTS daily_trivia_attempts_user_date_idx
  ON public.daily_trivia_attempts (user_id, quiz_date DESC);

ALTER TABLE public.daily_trivia_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own trivia attempts" ON public.daily_trivia_attempts;
CREATE POLICY "Users view own trivia attempts"
ON public.daily_trivia_attempts
FOR SELECT
TO authenticated
USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

REVOKE ALL ON public.daily_trivia_attempts FROM PUBLIC, anon;
GRANT SELECT ON public.daily_trivia_attempts TO authenticated;
GRANT ALL ON public.daily_trivia_attempts TO service_role;

-- 4. Per-question validated answers (UNIQUE prevents duplicate XP for the same question)
CREATE TABLE IF NOT EXISTS public.daily_trivia_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id uuid NOT NULL REFERENCES public.daily_trivia_attempts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  quiz_date date NOT NULL,
  question_index integer NOT NULL CHECK (question_index >= 0 AND question_index < 15),
  selected_option integer NOT NULL CHECK (selected_option >= 0 AND selected_option < 4),
  is_correct boolean NOT NULL,
  xp_awarded integer NOT NULL DEFAULT 0 CHECK (xp_awarded IN (0, 25)),
  answered_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (attempt_id, question_index)
);

CREATE INDEX IF NOT EXISTS daily_trivia_answers_attempt_idx
  ON public.daily_trivia_answers (attempt_id, question_index);

ALTER TABLE public.daily_trivia_answers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own trivia answers" ON public.daily_trivia_answers;
CREATE POLICY "Users view own trivia answers"
ON public.daily_trivia_answers
FOR SELECT
TO authenticated
USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

REVOKE ALL ON public.daily_trivia_answers FROM PUBLIC, anon;
GRANT SELECT ON public.daily_trivia_answers TO authenticated;
GRANT ALL ON public.daily_trivia_answers TO service_role;

-- 5. Real-time 2-hour unlimited note access column on profiles + server quota integration
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS trivia_unlimited_until timestamptz;

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
  v_trivia_until timestamptz;
  v_is_birthday boolean := false;
  v_is_trivia_unlimited boolean := false;
  v_has_unlimited_pass boolean := false;
  v_is_admin boolean;
BEGIN
  SELECT COUNT(*)::integer INTO v_uploads
  FROM public.notes
  WHERE user_id = _user_id AND status = 'approved';

  SELECT COUNT(*)::integer INTO v_downloads
  FROM public.note_downloads
  WHERE user_id = _user_id;

  SELECT manual_download_quota, birth_date, trivia_unlimited_until
  INTO v_manual_quota, v_birth_date, v_trivia_until
  FROM public.profiles
  WHERE user_id = _user_id;

  IF v_birth_date IS NOT NULL THEN
    v_is_birthday := (
      EXTRACT(MONTH FROM v_birth_date) = EXTRACT(MONTH FROM (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Istanbul'))
      AND EXTRACT(DAY FROM v_birth_date) = EXTRACT(DAY FROM (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Istanbul'))
    );
  END IF;

  IF v_trivia_until IS NOT NULL AND v_trivia_until > now() THEN
    v_is_trivia_unlimited := true;
  END IF;

  v_has_unlimited_pass := v_is_birthday OR v_is_trivia_unlimited;
  v_base_allowed := CASE WHEN v_uploads = 0 THEN 2 ELSE v_uploads * 2 END;
  v_is_admin := public.is_admin(_user_id);

  RETURN QUERY SELECT
    v_uploads,
    v_downloads,
    CASE WHEN v_has_unlimited_pass THEN GREATEST(COALESCE(v_manual_quota, v_base_allowed), v_downloads + 999) ELSE COALESCE(v_manual_quota, v_base_allowed) END,
    CASE WHEN v_has_unlimited_pass THEN 999 ELSE GREATEST(COALESCE(v_manual_quota, v_base_allowed) - v_downloads, 0) END,
    v_is_admin OR v_has_unlimited_pass OR v_downloads < COALESCE(v_manual_quota, v_base_allowed),
    v_is_admin;
END;
$$;

REVOKE ALL ON FUNCTION public.get_download_quota(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_download_quota(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
