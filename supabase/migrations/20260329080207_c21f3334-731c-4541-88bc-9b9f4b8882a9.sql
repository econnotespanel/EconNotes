-- Add note_password to notes (only admins can view)
ALTER TABLE public.notes ADD COLUMN IF NOT EXISTS note_password text DEFAULT null;

-- Add edited_at to notes and announcements
ALTER TABLE public.notes ADD COLUMN IF NOT EXISTS edited_at timestamptz DEFAULT null;
ALTER TABLE public.announcements ADD COLUMN IF NOT EXISTS edited_at timestamptz DEFAULT null;

-- Add academic_week and closed_message to system_settings
ALTER TABLE public.system_settings ADD COLUMN IF NOT EXISTS academic_week integer DEFAULT null;
ALTER TABLE public.system_settings ADD COLUMN IF NOT EXISTS academic_week_label text DEFAULT null;

-- Comments table
CREATE TABLE IF NOT EXISTS public.comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  user_name text NOT NULL DEFAULT '',
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Comments viewable by authenticated" ON public.comments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can create comments" ON public.comments FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own comments or admin" ON public.comments FOR DELETE TO authenticated USING (auth.uid() = user_id OR is_admin(auth.uid()));

-- Note views tracking (unique per user per note)
CREATE TABLE IF NOT EXISTS public.note_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id uuid NOT NULL,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(note_id, user_id)
);
ALTER TABLE public.note_views ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Note views viewable by authenticated" ON public.note_views FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can insert views" ON public.note_views FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- Note downloads tracking (unique per user per note)
CREATE TABLE IF NOT EXISTS public.note_downloads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id uuid NOT NULL,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(note_id, user_id)
);
ALTER TABLE public.note_downloads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Note downloads viewable by authenticated" ON public.note_downloads FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can insert downloads" ON public.note_downloads FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- Announcement views tracking (unique per user per announcement)
CREATE TABLE IF NOT EXISTS public.announcement_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id uuid NOT NULL,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(announcement_id, user_id)
);
ALTER TABLE public.announcement_views ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Announcement views viewable by authenticated" ON public.announcement_views FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can insert announcement views" ON public.announcement_views FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- Allow admins to update and delete penalties (for extend/remove)
CREATE POLICY "Admins can update penalties" ON public.penalties FOR UPDATE TO authenticated USING (is_admin(auth.uid()));

-- Enable realtime for comments
ALTER PUBLICATION supabase_realtime ADD TABLE public.comments;