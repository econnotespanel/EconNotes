-- Banners table for admin-managed banners
CREATE TABLE public.banners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  content text NOT NULL,
  bg_color text DEFAULT 'primary',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid NOT NULL
);

ALTER TABLE public.banners ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Banners viewable by authenticated" ON public.banners FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can create banners" ON public.banners FOR INSERT TO authenticated WITH CHECK (is_admin(auth.uid()));
CREATE POLICY "Admins can update banners" ON public.banners FOR UPDATE TO authenticated USING (is_admin(auth.uid()));
CREATE POLICY "Admins can delete banners" ON public.banners FOR DELETE TO authenticated USING (is_admin(auth.uid()));

-- Add attachment fields to announcements
ALTER TABLE public.announcements ADD COLUMN IF NOT EXISTS attachment_url text;
ALTER TABLE public.announcements ADD COLUMN IF NOT EXISTS attachment_name text;
ALTER TABLE public.announcements ADD COLUMN IF NOT EXISTS attachment_type text;

-- Add university field to notes
ALTER TABLE public.notes ADD COLUMN IF NOT EXISTS university text DEFAULT '';

-- Add academic_semester to system_settings
ALTER TABLE public.system_settings ADD COLUMN IF NOT EXISTS academic_semester text DEFAULT 'Güz';