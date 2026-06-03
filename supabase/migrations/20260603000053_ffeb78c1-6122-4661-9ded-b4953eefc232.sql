-- Study session reports (kullanıcı çalışma stüdyosundan hata bildirir)
CREATE TABLE public.study_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  user_email text NOT NULL DEFAULT '',
  user_name text NOT NULL DEFAULT '',
  material_id uuid,
  section text NOT NULL,
  description text NOT NULL,
  screenshot_url text,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.study_reports TO authenticated;
GRANT ALL ON public.study_reports TO service_role;

ALTER TABLE public.study_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can create reports" ON public.study_reports
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own reports, admins all" ON public.study_reports
  FOR SELECT TO authenticated USING (auth.uid() = user_id OR is_admin(auth.uid()));

CREATE POLICY "Admins can update reports" ON public.study_reports
  FOR UPDATE TO authenticated USING (is_admin(auth.uid()));

CREATE POLICY "Admins can delete reports" ON public.study_reports
  FOR DELETE TO authenticated USING (is_admin(auth.uid()));

-- Çalışma kaynak tablosuna sınav profili eklemek için study_materials'a kolon ekle
ALTER TABLE public.study_materials
  ADD COLUMN IF NOT EXISTS exam_profile jsonb DEFAULT '{}'::jsonb;
