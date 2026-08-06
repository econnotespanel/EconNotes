CREATE TABLE public.kpss_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  metric text NOT NULL DEFAULT 'questions',
  target integer NOT NULL DEFAULT 100,
  week_start date NOT NULL,
  label text,
  completed_at timestamptz,
  notified boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kpss_goals TO authenticated;
GRANT ALL ON public.kpss_goals TO service_role;
ALTER TABLE public.kpss_goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own kpss goals" ON public.kpss_goals FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER update_kpss_goals_updated_at BEFORE UPDATE ON public.kpss_goals FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.kpss_presets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  exam_group text NOT NULL,
  subject text NOT NULL,
  topic text,
  difficulty text NOT NULL DEFAULT 'medium',
  question_count integer NOT NULL DEFAULT 10,
  focus text,
  material_type text NOT NULL DEFAULT 'quiz',
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kpss_presets TO authenticated;
GRANT ALL ON public.kpss_presets TO service_role;
ALTER TABLE public.kpss_presets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own kpss presets" ON public.kpss_presets FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER update_kpss_presets_updated_at BEFORE UPDATE ON public.kpss_presets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.kpss_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  subject text,
  topic text NOT NULL,
  stage integer NOT NULL DEFAULT 0,
  due_at timestamptz NOT NULL DEFAULT now(),
  last_result integer,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, topic)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kpss_reviews TO authenticated;
GRANT ALL ON public.kpss_reviews TO service_role;
ALTER TABLE public.kpss_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own kpss reviews" ON public.kpss_reviews FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER update_kpss_reviews_updated_at BEFORE UPDATE ON public.kpss_reviews FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();