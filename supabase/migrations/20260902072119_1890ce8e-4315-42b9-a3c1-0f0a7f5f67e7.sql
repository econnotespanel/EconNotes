-- 1) note_password column protection -------------------------------------
ALTER TABLE public.notes
  ADD COLUMN IF NOT EXISTS has_password boolean
  GENERATED ALWAYS AS (note_password IS NOT NULL AND btrim(note_password) <> '') STORED;

REVOKE SELECT ON public.notes FROM authenticated;
REVOKE SELECT ON public.notes FROM anon;

GRANT SELECT (
  id, user_id, title, description, grade, department, course, semester,
  file_url, file_name, file_type, uploader_name, created_at, updated_at,
  edited_at, university, status, approved_at, approved_by, rejection_reason,
  has_password
) ON public.notes TO authenticated;

GRANT INSERT, UPDATE, DELETE ON public.notes TO authenticated;
GRANT ALL ON public.notes TO service_role;

CREATE OR REPLACE FUNCTION public.verify_note_password(_note_id uuid, _password text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_pw text;
  v_visible boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Oturum bulunamadı.'; END IF;

  SELECT note_password, (status = 'approved' OR user_id = v_uid OR public.is_admin(v_uid))
    INTO v_pw, v_visible
  FROM public.notes WHERE id = _note_id;

  IF v_visible IS NOT TRUE THEN RETURN false; END IF;
  IF v_pw IS NULL OR btrim(v_pw) = '' THEN RETURN true; END IF;

  RETURN btrim(v_pw) = btrim(COALESCE(_password, ''));
END;
$$;

REVOKE ALL ON FUNCTION public.verify_note_password(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_note_password(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_get_note_password(_note_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_pw text;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Bu bilgi yalnızca yöneticiler tarafından görüntülenebilir.';
  END IF;
  SELECT note_password INTO v_pw FROM public.notes WHERE id = _note_id;
  RETURN v_pw;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_note_password(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_get_note_password(uuid) TO authenticated;

-- 2) storage ownership for the notes bucket -------------------------------
DROP POLICY IF EXISTS "Authenticated users can upload notes" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own notes files or admin" ON storage.objects;

CREATE POLICY "Notes upload scoped to owner"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'notes' AND (
    (storage.foldername(name))[1] = (auth.uid())::text
    OR ((storage.foldername(name))[1] IN ('messages','study-reports')
        AND (storage.foldername(name))[2] = (auth.uid())::text)
    OR ((storage.foldername(name))[1] = 'announcements' AND public.is_admin(auth.uid()))
  )
);

CREATE POLICY "Notes delete scoped to owner or admin"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'notes' AND (
    public.is_admin(auth.uid())
    OR owner = auth.uid()
    OR (storage.foldername(name))[1] = (auth.uid())::text
    OR ((storage.foldername(name))[1] IN ('messages','study-reports')
        AND (storage.foldername(name))[2] = (auth.uid())::text)
  )
);

-- 3) user_roles privilege escalation --------------------------------------
DROP POLICY IF EXISTS "System can insert roles" ON public.user_roles;
DROP POLICY IF EXISTS "Roles viewable by authenticated" ON public.user_roles;

CREATE POLICY "Users can view own role, admins all"
ON public.user_roles FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.is_admin(auth.uid()));

-- 4) site configuration (branding / theme / page visibility) --------------
CREATE TABLE IF NOT EXISTS public.site_config (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_name text NOT NULL DEFAULT 'EconNotes',
  tagline text,
  logo_url text,
  theme jsonb NOT NULL DEFAULT '{}'::jsonb,
  pages jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.site_config TO anon;
GRANT SELECT ON public.site_config TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.site_config TO authenticated;
GRANT ALL ON public.site_config TO service_role;

ALTER TABLE public.site_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Site config readable by everyone"
ON public.site_config FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "Admins manage site config"
ON public.site_config FOR ALL TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

CREATE TRIGGER update_site_config_updated_at
BEFORE UPDATE ON public.site_config
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.site_config (brand_name, tagline)
SELECT 'EconNotes', 'Akademik hayatın tek merkezi'
WHERE NOT EXISTS (SELECT 1 FROM public.site_config);