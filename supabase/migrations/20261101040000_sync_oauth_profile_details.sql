-- Preserve profile details supplied by OAuth providers and repair profiles
-- created with alternate metadata field names.
UPDATE public.profiles AS p
SET
  university = COALESCE(
    NULLIF(BTRIM(p.university), ''),
    NULLIF(BTRIM(u.raw_user_meta_data->>'university'), ''),
    NULLIF(BTRIM(u.raw_user_meta_data->>'school'), ''),
    ''
  ),
  department = COALESCE(
    NULLIF(BTRIM(p.department), ''),
    NULLIF(BTRIM(u.raw_user_meta_data->>'department'), ''),
    NULLIF(BTRIM(u.raw_user_meta_data->>'major'), ''),
    NULLIF(BTRIM(u.raw_user_meta_data->>'department_name'), ''),
    ''
  )
FROM auth.users AS u
WHERE p.user_id = u.id
  AND (
    NULLIF(BTRIM(p.university), '') IS NULL
    OR NULLIF(BTRIM(p.department), '') IS NULL
  );

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
  _is_admin := NEW.email IN ('kaancolakogullari1@gmail.com', 'kaancolakogullari9@gmail.com', 'econnotespanel@gmail.com');

  INSERT INTO public.profiles (
    user_id, full_name, university, department, grade,
    approval_status, approved_at
  ) VALUES (
    NEW.id, _full_name, _university, _department, _grade,
    CASE WHEN _is_admin THEN 'approved' ELSE 'pending' END,
    CASE WHEN _is_admin THEN now() ELSE NULL END
  )
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, CASE WHEN _is_admin THEN 'admin'::public.app_role ELSE 'student'::public.app_role END)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$function$;
