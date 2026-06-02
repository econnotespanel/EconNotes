
-- Study materials table
CREATE TABLE public.study_materials (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('own', 'platform')),
  source_note_id UUID,
  material_type TEXT NOT NULL CHECK (material_type IN ('flashcards', 'quiz', 'summary', 'video')),
  title TEXT NOT NULL,
  content JSONB NOT NULL DEFAULT '{}'::jsonb,
  course TEXT,
  model TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.study_materials TO authenticated;
GRANT ALL ON public.study_materials TO service_role;

ALTER TABLE public.study_materials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own study materials or admin"
ON public.study_materials FOR SELECT TO authenticated
USING (auth.uid() = user_id OR is_admin(auth.uid()));

CREATE POLICY "Users can create own study materials"
ON public.study_materials FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own study materials"
ON public.study_materials FOR UPDATE TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own study materials or admin"
ON public.study_materials FOR DELETE TO authenticated
USING (auth.uid() = user_id OR is_admin(auth.uid()));

CREATE TRIGGER update_study_materials_updated_at
BEFORE UPDATE ON public.study_materials
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_study_materials_user ON public.study_materials(user_id, created_at DESC);
CREATE INDEX idx_study_materials_note ON public.study_materials(source_note_id);

-- Study progress table
CREATE TABLE public.study_progress (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  material_id UUID NOT NULL REFERENCES public.study_materials(id) ON DELETE CASCADE,
  score INTEGER,
  total_questions INTEGER,
  attempts INTEGER NOT NULL DEFAULT 1,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.study_progress TO authenticated;
GRANT ALL ON public.study_progress TO service_role;

ALTER TABLE public.study_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own progress"
ON public.study_progress FOR SELECT TO authenticated
USING (auth.uid() = user_id OR is_admin(auth.uid()));

CREATE POLICY "Users can create own progress"
ON public.study_progress FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own progress"
ON public.study_progress FOR UPDATE TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own progress"
ON public.study_progress FOR DELETE TO authenticated
USING (auth.uid() = user_id);

CREATE INDEX idx_study_progress_user ON public.study_progress(user_id, created_at DESC);
CREATE INDEX idx_study_progress_material ON public.study_progress(material_id);
