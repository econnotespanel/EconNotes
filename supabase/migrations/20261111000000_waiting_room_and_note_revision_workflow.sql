-- Migration: Waiting room and 72-hour note revision workflow

-- 1. Ensure profiles table has approval_status defaulting to 'pending'
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by uuid;

ALTER TABLE public.profiles
  ALTER COLUMN approval_status SET DEFAULT 'pending';

-- Make sure existing active profiles remain approved
UPDATE public.profiles
SET approval_status = 'approved',
    approved_at = COALESCE(approved_at, created_at)
WHERE approval_status IS NULL OR approval_status = '';

-- 2. Add revision workflow columns to notes
ALTER TABLE public.notes
  ADD COLUMN IF NOT EXISTS revision_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS revision_deadline timestamptz,
  ADD COLUMN IF NOT EXISTS revision_notes text;

-- 3. Stored procedure to archive notes whose 72h revision deadline has passed
CREATE OR REPLACE FUNCTION public.archive_expired_revision_notes()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.notes
  SET status = 'archived',
      visibility_status = 'permanent',
      updated_at = now()
  WHERE status = 'revision_requested'
    AND revision_deadline IS NOT NULL
    AND revision_deadline <= now();

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- Grant execution to authenticated users and service role
GRANT EXECUTE ON FUNCTION public.archive_expired_revision_notes() TO authenticated, service_role;

-- 4. Update handle_new_user trigger to enforce pending status for new registrations
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
  _full_name := COALESCE(
    NULLIF(BTRIM(NEW.raw_user_meta_data->>'full_name'), ''),
    NULLIF(BTRIM(NEW.raw_user_meta_data->>'name'), ''),
    ''
  );
  _university := COALESCE(
    NULLIF(BTRIM(NEW.raw_user_meta_data->>'university'), ''),
    NULLIF(BTRIM(NEW.raw_user_meta_data->>'school'), ''),
    ''
  );
  _department := COALESCE(
    NULLIF(BTRIM(NEW.raw_user_meta_data->>'department'), ''),
    NULLIF(BTRIM(NEW.raw_user_meta_data->>'major'), ''),
    NULLIF(BTRIM(NEW.raw_user_meta_data->>'department_name'), ''),
    ''
  );
  _grade := COALESCE((NEW.raw_user_meta_data->>'grade')::INTEGER, 1);
  IF _grade < 1 OR _grade > 5 THEN
    _grade := 1;
  END IF;

  _is_admin := LOWER(COALESCE(NEW.email, '')) IN (
    'kaancolakogullari1@gmail.com',
    'kaancolakogullari9@gmail.com',
    'econnotespanel@gmail.com'
  );

  INSERT INTO public.profiles (
    user_id, full_name, university, department, grade,
    approval_status, approved_at
  ) VALUES (
    NEW.id, _full_name, _university, _department, _grade,
    CASE WHEN _is_admin THEN 'approved' ELSE 'pending' END,
    CASE WHEN _is_admin THEN now() ELSE NULL END
  )
  ON CONFLICT (user_id) DO UPDATE SET
    full_name = CASE WHEN EXCLUDED.full_name <> '' THEN EXCLUDED.full_name ELSE profiles.full_name END,
    university = CASE WHEN EXCLUDED.university <> '' THEN EXCLUDED.university ELSE profiles.university END,
    department = CASE WHEN EXCLUDED.department <> '' THEN EXCLUDED.department ELSE profiles.department END,
    grade = COALESCE(EXCLUDED.grade, profiles.grade);

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, CASE WHEN _is_admin THEN 'admin'::public.app_role ELSE 'student'::public.app_role END)
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$function$;

-- 5. Notes SELECT policy:
-- Archived notes are hidden from regular users (even the owner).
-- Pending and revision notes are visible to the uploader and administrators.
-- Approved notes are visible to authenticated users.
DROP POLICY IF EXISTS "Notes viewable by authenticated" ON public.notes;
DROP POLICY IF EXISTS "Visible notes, owners and admins can view" ON public.notes;

CREATE POLICY "Notes viewable policy"
ON public.notes
FOR SELECT
TO authenticated
USING (
  public.is_admin(auth.uid())
  OR (
    status = 'approved'
    AND (
      visibility_status = 'visible'
      OR (visibility_status = 'temporary' AND hidden_until IS NOT NULL AND hidden_until <= now())
    )
  )
  OR (
    auth.uid() = user_id
    AND status IN ('pending', 'revision_requested')
  )
);
