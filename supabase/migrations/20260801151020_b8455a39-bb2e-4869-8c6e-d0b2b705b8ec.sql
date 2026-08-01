CREATE TABLE public.kpss_materials (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  subject text NOT NULL,
  topic text,
  material_type text NOT NULL CHECK (material_type IN ('topics','summary','quiz','flashcards')),
  difficulty text NOT NULL DEFAULT 'medium',
  title text NOT NULL,
  content jsonb NOT NULL,
  model text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.kpss_materials TO authenticated;
GRANT ALL ON public.kpss_materials TO service_role;
ALTER TABLE public.kpss_materials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own kpss materials" ON public.kpss_materials
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins view all kpss materials" ON public.kpss_materials
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

CREATE TRIGGER update_kpss_materials_updated_at
  BEFORE UPDATE ON public.kpss_materials
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.kpss_attempts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  material_id uuid REFERENCES public.kpss_materials(id) ON DELETE CASCADE,
  subject text,
  score integer NOT NULL DEFAULT 0,
  total_questions integer NOT NULL DEFAULT 0,
  duration_seconds integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.kpss_attempts TO authenticated;
GRANT ALL ON public.kpss_attempts TO service_role;
ALTER TABLE public.kpss_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own kpss attempts" ON public.kpss_attempts
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins view all kpss attempts" ON public.kpss_attempts
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

CREATE INDEX idx_kpss_materials_user ON public.kpss_materials(user_id, created_at DESC);
CREATE INDEX idx_kpss_attempts_user ON public.kpss_attempts(user_id, created_at DESC);