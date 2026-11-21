-- Migration: Per-User Unique Daily Trivia Sets, Concurrent Daily Assignment Lock & Per-User Question History
-- Guarantees that each user receives their OWN unique 15-question daily general knowledge test,
-- prevents cross-user overlap on the same calendar day via atomic PostgreSQL primary key locks,
-- and tracks per-user historical questions/concepts so previously seen questions are not repeated.

-- 1. Per-user daily 15-question set (strictly 1 immutable set per user per day; preserved on reload)
CREATE TABLE IF NOT EXISTS public.daily_trivia_user_sets (
  user_id uuid NOT NULL,
  quiz_date date NOT NULL,
  questions jsonb NOT NULL,
  question_hashes text[] NOT NULL DEFAULT '{}',
  source_mode text NOT NULL DEFAULT 'hybrid',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, quiz_date)
);

CREATE INDEX IF NOT EXISTS daily_trivia_user_sets_date_idx
  ON public.daily_trivia_user_sets (quiz_date DESC);

ALTER TABLE public.daily_trivia_user_sets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.daily_trivia_user_sets FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.daily_trivia_user_sets TO service_role;

-- 2. Atomic per-day question assignment lock across users (prevents same question going to 2 users concurrently)
CREATE TABLE IF NOT EXISTS public.daily_trivia_daily_assignments (
  quiz_date date NOT NULL,
  question_hash text NOT NULL,
  assigned_user_id uuid NOT NULL,
  category text NOT NULL DEFAULT 'Genel Kültür',
  concept_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (quiz_date, question_hash)
);

CREATE INDEX IF NOT EXISTS daily_trivia_daily_assignments_user_idx
  ON public.daily_trivia_daily_assignments (quiz_date, assigned_user_id);

ALTER TABLE public.daily_trivia_daily_assignments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.daily_trivia_daily_assignments FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.daily_trivia_daily_assignments TO service_role;

-- 3. Per-user historical question & concept registry (prevents repeating past days' questions for the same user)
CREATE TABLE IF NOT EXISTS public.daily_trivia_user_history (
  user_id uuid NOT NULL,
  question_hash text NOT NULL,
  quiz_date date NOT NULL,
  category text NOT NULL DEFAULT 'Genel Kültür',
  concept_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, question_hash)
);

CREATE INDEX IF NOT EXISTS daily_trivia_user_history_user_date_idx
  ON public.daily_trivia_user_history (user_id, quiz_date DESC);

ALTER TABLE public.daily_trivia_user_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.daily_trivia_user_history FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.daily_trivia_user_history TO service_role;

NOTIFY pgrst, 'reload schema';
