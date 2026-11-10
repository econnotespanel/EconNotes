-- Migration: 20261111020000_approve_existing_users.sql
-- Description: Automatically approves all existing registered users up to now,
-- while brand new user registrations going forward will require administrator approval in the Waiting Room.

-- 1. Approve all existing profiles in the database up to this point
UPDATE public.profiles
SET approval_status = 'approved',
    approved_at = COALESCE(approved_at, created_at, now())
WHERE approval_status = 'pending'
   OR approval_status IS NULL
   OR approval_status = '';

-- 2. Ensure brand new user registrations via handle_new_user() will strictly enter 'pending' status (unless admin)
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
