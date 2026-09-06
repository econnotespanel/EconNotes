ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by uuid;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_approval_status_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_approval_status_check
  CHECK (approval_status IN ('pending', 'approved', 'rejected'));

UPDATE public.profiles
SET approval_status = 'approved',
    approved_at = COALESCE(approved_at, created_at)
WHERE approval_status IS DISTINCT FROM 'approved';

ALTER TABLE public.notes
  ADD COLUMN IF NOT EXISTS visibility_status text NOT NULL DEFAULT 'visible',
  ADD COLUMN IF NOT EXISTS hidden_until timestamptz,
  ADD COLUMN IF NOT EXISTS hidden_by uuid;

ALTER TABLE public.notes
  DROP CONSTRAINT IF EXISTS notes_visibility_status_check;
ALTER TABLE public.notes
  ADD CONSTRAINT notes_visibility_status_check
  CHECK (visibility_status IN ('visible', 'temporary', 'permanent'));

CREATE INDEX IF NOT EXISTS notes_visibility_idx
  ON public.notes (visibility_status, hidden_until);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _full_name TEXT;
  _university TEXT;
  _department TEXT;
  _grade INTEGER;
  _is_admin BOOLEAN;
BEGIN
  _full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', '');
  _university := COALESCE(NEW.raw_user_meta_data->>'university', '');
  _department := COALESCE(NEW.raw_user_meta_data->>'department', '');
  _grade := COALESCE((NEW.raw_user_meta_data->>'grade')::INTEGER, 1);
  _is_admin := NEW.email IN ('kaancolakogullari1@gmail.com', 'kaancolakogullari9@gmail.com', 'econnotespanel@gmail.com');

  INSERT INTO public.profiles (
    user_id, full_name, university, department, grade,
    approval_status, approved_at
  ) VALUES (
    NEW.id, _full_name, _university, _department, _grade,
    CASE WHEN _is_admin THEN 'approved' ELSE 'pending' END,
    CASE WHEN _is_admin THEN now() ELSE NULL END
  );

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, CASE WHEN _is_admin THEN 'admin'::public.app_role ELSE 'student'::public.app_role END);

  RETURN NEW;
END;
$function$;

DROP POLICY IF EXISTS "Notes viewable by authenticated" ON public.notes;
CREATE POLICY "Visible notes, owners and admins can view"
ON public.notes
FOR SELECT
TO authenticated
USING (
  public.is_admin(auth.uid())
  OR auth.uid() = user_id
  OR (
    status = 'approved'
    AND (
      visibility_status = 'visible'
      OR (visibility_status = 'temporary' AND hidden_until IS NOT NULL AND hidden_until <= now())
    )
  )
);

CREATE OR REPLACE FUNCTION public.verify_note_password(_note_id uuid, _password text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_pw text;
  v_visible boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Oturum bulunamadı.'; END IF;

  SELECT note_password,
    (
      public.is_admin(v_uid)
      OR user_id = v_uid
      OR (
        status = 'approved'
        AND (
          visibility_status = 'visible'
          OR (visibility_status = 'temporary' AND hidden_until IS NOT NULL AND hidden_until <= now())
        )
      )
    )
  INTO v_pw, v_visible
  FROM public.notes
  WHERE id = _note_id;

  IF v_visible IS NOT TRUE THEN RETURN false; END IF;
  IF v_pw IS NULL OR btrim(v_pw) = '' THEN RETURN true; END IF;
  RETURN btrim(v_pw) = btrim(COALESCE(_password, ''));
END;
$function$;

REVOKE SELECT ON public.notes FROM authenticated;
GRANT SELECT (
  id, user_id, title, description, grade, department, course, semester,
  file_url, file_name, file_type, uploader_name, created_at, updated_at,
  edited_at, university, status, approved_at, approved_by, rejection_reason,
  has_password, visibility_status, hidden_until, hidden_by
) ON public.notes TO authenticated;
GRANT ALL ON public.notes TO service_role;

DROP POLICY IF EXISTS "Admins can insert roles" ON public.user_roles;
CREATE POLICY "Only admins can insert roles"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_admin(auth.uid())
  AND NOT (user_id = auth.uid() AND role = 'admin'::public.app_role)
);

DROP POLICY IF EXISTS "Admins can update roles" ON public.user_roles;
CREATE POLICY "Only admins can update roles"
ON public.user_roles
FOR UPDATE
TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (
  public.is_admin(auth.uid())
  AND NOT (user_id = auth.uid() AND role = 'admin'::public.app_role)
);

DROP POLICY IF EXISTS "Notes upload scoped to owner" ON storage.objects;
CREATE POLICY "Notes bucket uploads owned by user"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'notes'
  AND (
    ((storage.foldername(name))[1] = auth.uid()::text)
    OR (((storage.foldername(name))[1] = 'announcements') AND public.is_admin(auth.uid()))
  )
);

DROP POLICY IF EXISTS "Notes delete scoped to owner or admin" ON storage.objects;
CREATE POLICY "Notes bucket deletes owned by user"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'notes'
  AND (
    public.is_admin(auth.uid())
    OR (
      (storage.foldername(name))[1] = auth.uid()::text
      AND NOT EXISTS (
        SELECT 1 FROM public.notes n
        WHERE n.file_url LIKE '%' || storage.objects.name
          AND n.user_id <> auth.uid()
      )
    )
  )
);