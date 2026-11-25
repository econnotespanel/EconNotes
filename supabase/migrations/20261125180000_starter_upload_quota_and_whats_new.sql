-- ============================================================================
-- Migration: 20261125180000_starter_upload_quota_and_whats_new.sql
--
-- 1. Starter 2 Note Upload Rights for Brand-New Users:
--    - Adds server-authoritative `note_upload_quota` & `starter_upload_quota_granted_at`
--      columns to `public.profiles` (without modifying existing users' rows or quotas).
--    - Updates `public.handle_new_user()` idempotently so every newly registered
--      non-admin user starts with exactly 2 note upload rights saved in DB at signup,
--      preserved through Waiting Room pending approval, never granted twice.
--    - Hardens `public.protect_profiles_privileged_columns()` so clients cannot tamper
--      with `note_upload_quota`, `starter_upload_quota_granted_at`, or `seen_whats_new_versions`.
--    - Updates `public.protect_notes_moderation_and_path()` so non-admin `INSERT` on
--      `public.notes` atomically locks `profiles` (`FOR UPDATE`), verifies remaining
--      upload rights, and decrements by 1 inside the same transaction (automatic
--      rollback on any insert failure; zero loss on failed storage uploads or edits).
--    - Provides `get_note_upload_quota` and `admin_set_upload_quota` RPCs without
--      touching `get_download_quota`, `manual_download_quota`, or XP.
--
-- 2. One-Time Versioned "What's New" Tracking (`whats_new_2026_11_25`):
--    - Adds `public.user_whats_new_views` table (RLS strictly scoped to auth.uid())
--      and `public.profiles.seen_whats_new_versions TEXT[]`.
--    - Provides `check_whats_new_eligibility` and `mark_whats_new_seen` RPCs so
--      returning users with last_login <= 2026-11-25 (or legacy users with NULL
--      last_login) see the walkthrough strictly once across all devices & sessions.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Schema additions on public.profiles (strictly non-destructive to existing users)
-- ----------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS note_upload_quota INTEGER,
  ADD COLUMN IF NOT EXISTS starter_upload_quota_granted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS seen_whats_new_versions TEXT[] NOT NULL DEFAULT '{}'::TEXT[];

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_note_upload_quota_nonnegative'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_note_upload_quota_nonnegative
      CHECK (note_upload_quota IS NULL OR note_upload_quota >= 0);
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 2. Dedicated versioned audit table for "What's New" per user
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_whats_new_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  version TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'viewed' CHECK (status IN ('viewed', 'skipped', 'completed')),
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT user_whats_new_views_user_version_unique UNIQUE (user_id, version)
);

ALTER TABLE public.user_whats_new_views ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.user_whats_new_views FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.user_whats_new_views TO authenticated;
GRANT ALL ON TABLE public.user_whats_new_views TO service_role;

DROP POLICY IF EXISTS "Users can view own whats_new_views" ON public.user_whats_new_views;
CREATE POLICY "Users can view own whats_new_views"
  ON public.user_whats_new_views
  FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can insert own whats_new_views" ON public.user_whats_new_views;
CREATE POLICY "Users can insert own whats_new_views"
  ON public.user_whats_new_views
  FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update own whats_new_views" ON public.user_whats_new_views;
CREATE POLICY "Users can update own whats_new_views"
  ON public.user_whats_new_views
  FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- ----------------------------------------------------------------------------
-- 3. Update protect_profiles_privileged_columns() to guard new quota & whats_new columns
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protect_profiles_privileged_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_role TEXT := COALESCE(current_setting('request.jwt.claim.role', true), '');
BEGIN
  -- Allow server-side / service_role / trusted SECURITY DEFINER RPCs / migrations and verified admins
  IF v_uid IS NULL
     OR v_role = 'service_role'
     OR COALESCE(current_setting('app.trusted_profile_mutation', true), '') = 'true'
     OR public.is_admin(v_uid) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.approval_status := 'pending';
    NEW.approved_at := NULL;
    NEW.approved_by := NULL;
    NEW.manual_download_quota := NULL;
    NEW.trivia_unlimited_until := NULL;
    NEW.wheel_bonus_quota := 0;
    NEW.wheel_unlimited_until := NULL;
    -- Brand-new client fallback insert always starts with exact server-defined starter 2 upload rights
    NEW.note_upload_quota := 2;
    NEW.starter_upload_quota_granted_at := now();
    NEW.seen_whats_new_versions := '{}'::TEXT[];
    RETURN NEW;
  END IF;

  -- UPDATE: Reject any attempt by a non-admin user to tamper with privileged columns
  IF NEW.approval_status IS DISTINCT FROM OLD.approval_status
     OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
     OR NEW.approved_by IS DISTINCT FROM OLD.approved_by
     OR NEW.manual_download_quota IS DISTINCT FROM OLD.manual_download_quota
     OR NEW.trivia_unlimited_until IS DISTINCT FROM OLD.trivia_unlimited_until
     OR NEW.wheel_bonus_quota IS DISTINCT FROM OLD.wheel_bonus_quota
     OR NEW.wheel_unlimited_until IS DISTINCT FROM OLD.wheel_unlimited_until
     OR NEW.note_upload_quota IS DISTINCT FROM OLD.note_upload_quota
     OR NEW.starter_upload_quota_granted_at IS DISTINCT FROM OLD.starter_upload_quota_granted_at
     OR NEW.seen_whats_new_versions IS DISTINCT FROM OLD.seen_whats_new_versions THEN
    RAISE EXCEPTION 'Yetkisiz profil alanı güncellemesi engellendi.';
  END IF;

  -- Make birth_date immutable once set (prevents birthday unlimited-download abuse)
  IF OLD.birth_date IS NOT NULL AND NEW.birth_date IS DISTINCT FROM OLD.birth_date THEN
    RAISE EXCEPTION 'Doğum tarihi kaydedildikten sonra yalnızca yönetici tarafından değiştirilebilir.';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.protect_profiles_privileged_columns() FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 4. Idempotent handle_new_user() Auth Trigger granting 2 starter upload rights ONCE
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  _full_name TEXT;
  _university TEXT;
  _department TEXT;
  _grade INTEGER;
  _birth_date_raw TEXT;
  _birth_date DATE := NULL;
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

  _birth_date_raw := NULLIF(BTRIM(COALESCE(NEW.raw_user_meta_data->>'birth_date', '')), '');
  IF _birth_date_raw IS NOT NULL AND _birth_date_raw ~ '^\d{4}-\d{2}-\d{2}$' THEN
    BEGIN
      _birth_date := _birth_date_raw::DATE;
    EXCEPTION WHEN OTHERS THEN
      _birth_date := NULL;
    END;
  END IF;

  _is_admin := LOWER(COALESCE(NEW.email, '')) IN (
    'kaancolakogullari1@gmail.com',
    'kaancolakogullari9@gmail.com',
    'econnotespanel@gmail.com'
  );

  PERFORM set_config('app.trusted_profile_mutation', 'true', true);

  INSERT INTO public.profiles (
    user_id,
    full_name,
    university,
    department,
    grade,
    birth_date,
    approval_status,
    approved_at,
    note_upload_quota,
    starter_upload_quota_granted_at
  ) VALUES (
    NEW.id,
    _full_name,
    _university,
    _department,
    _grade,
    _birth_date,
    CASE WHEN _is_admin THEN 'approved' ELSE 'pending' END,
    CASE WHEN _is_admin THEN now() ELSE NULL END,
    CASE WHEN _is_admin THEN NULL ELSE 2 END,
    CASE WHEN _is_admin THEN NULL ELSE now() END
  )
  ON CONFLICT (user_id) DO UPDATE SET
    full_name = CASE WHEN EXCLUDED.full_name <> '' THEN EXCLUDED.full_name ELSE profiles.full_name END,
    university = CASE WHEN EXCLUDED.university <> '' THEN EXCLUDED.university ELSE profiles.university END,
    department = CASE WHEN EXCLUDED.department <> '' THEN EXCLUDED.department ELSE profiles.department END,
    grade = COALESCE(EXCLUDED.grade, profiles.grade),
    birth_date = COALESCE(profiles.birth_date, EXCLUDED.birth_date),
    -- Strict idempotency: NEVER grant starter upload quota twice or alter existing users
    note_upload_quota = CASE
      WHEN profiles.starter_upload_quota_granted_at IS NULL
           AND profiles.note_upload_quota IS NULL
           AND NOT _is_admin
           AND profiles.created_at >= (now() - INTERVAL '10 minutes')
        THEN 2
      ELSE profiles.note_upload_quota
    END,
    starter_upload_quota_granted_at = COALESCE(
      profiles.starter_upload_quota_granted_at,
      CASE
        WHEN NOT _is_admin AND profiles.note_upload_quota IS NULL AND profiles.created_at >= (now() - INTERVAL '10 minutes')
          THEN now()
        ELSE NULL
      END
    );

  PERFORM set_config('app.trusted_profile_mutation', 'false', true);

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, CASE WHEN _is_admin THEN 'admin'::public.app_role ELSE 'student'::public.app_role END)
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$function$;

-- ----------------------------------------------------------------------------
-- 5. Atomic Note Upload Quota Consumption inside protect_notes_moderation_and_path()
--    - Runs ONLY on INSERT (never on UPDATE / revision resubmit).
--    - Locks caller profile row FOR UPDATE to prevent concurrent race overspending.
--    - Automatically rolls back if the INSERT fails for any reason.
--    - Never consumes rights for failed Storage uploads (which fail before INSERT).
--    - Leaves existing users (note_upload_quota IS NULL), admins, and Monday Wheel
--      unlimited pass holders unaffected.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protect_notes_moderation_and_path()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_role TEXT := COALESCE(current_setting('request.jwt.claim.role', true), '');
  v_upload_restricted BOOLEAN := false;
  v_norm_url TEXT;
  v_upload_quota INTEGER;
  v_wheel_unlimited_until TIMESTAMPTZ;
  v_wheel_unlimited BOOLEAN := false;
  v_tr_hour INTEGER;
BEGIN
  IF v_uid IS NULL OR v_role = 'service_role' OR public.is_admin(v_uid) THEN
    RETURN NEW;
  END IF;

  IF NOT public.is_approved_unbanned_user(v_uid) THEN
    RAISE EXCEPTION 'Hesabınız not yükleme veya düzenleme için onaylı değil.';
  END IF;

  -- Validate file_url strictly stays under caller's own folder and never uses traversal or active web extensions
  IF NEW.file_url IS NOT NULL AND btrim(NEW.file_url) <> '' THEN
    v_norm_url := btrim(NEW.file_url);
    IF v_norm_url ~ '\.\.' OR v_norm_url ~* '\.(html?|svg|xhtml|xml|js|mjs|cjs|php|exe|bat|cmd|ps1|sh)(\?.*)?$' THEN
      RAISE EXCEPTION 'Geçersiz veya güvensiz dosya yolu.';
    END IF;
    IF NOT (
      v_norm_url LIKE (v_uid::TEXT || '/%')
      OR v_norm_url ~* ('^https://[^/]+/storage/v1/object/(?:public|sign|authenticated)/notes/' || v_uid::TEXT || '/')
    ) THEN
      RAISE EXCEPTION 'Dosya yolu yalnızca kendi kullanıcı dizininize ait olabilir.';
    END IF;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- Lock caller profile row atomically to check Monday Wheel pass & upload quota
    SELECT p.note_upload_quota, p.wheel_unlimited_until
    INTO v_upload_quota, v_wheel_unlimited_until
    FROM public.profiles p
    WHERE p.user_id = v_uid
    FOR UPDATE;

    v_wheel_unlimited := (v_wheel_unlimited_until IS NOT NULL AND v_wheel_unlimited_until > now());

    SELECT COALESCE(note_upload_restricted, false)
    INTO v_upload_restricted
    FROM public.system_settings
    LIMIT 1;

    -- Respect 09:00-00:00 Europe/Istanbul upload hours when upload restriction toggle is enabled
    IF v_upload_restricted AND NOT v_wheel_unlimited THEN
      v_tr_hour := EXTRACT(HOUR FROM (now() AT TIME ZONE 'Europe/Istanbul'))::INTEGER;
      IF v_tr_hour < 9 THEN
        RAISE EXCEPTION 'Not yükleme işlemleri güvenlik kuralları gereği 09:00 - 00:00 saatleri arasında yapılabilmektedir.';
      END IF;
    END IF;

    -- Enforce & atomically decrement tracked upload quota (NULL = legacy unlimited user)
    IF v_upload_quota IS NOT NULL AND NOT v_wheel_unlimited THEN
      IF v_upload_quota <= 0 THEN
        RAISE EXCEPTION 'Not yükleme hakkınız doldu. Yeni not yüklemek için ek yükleme hakkına ihtiyacınız var.'
          USING ERRCODE = 'P0001';
      END IF;

      PERFORM set_config('app.trusted_profile_mutation', 'true', true);
      UPDATE public.profiles
      SET note_upload_quota = note_upload_quota - 1,
          updated_at = now()
      WHERE user_id = v_uid;
      PERFORM set_config('app.trusted_profile_mutation', 'false', true);
    END IF;

    -- Force moderation defaults so users can NEVER self-approve notes or inflate quota
    NEW.user_id := v_uid;
    NEW.status := 'pending';
    NEW.visibility_status := 'visible';
    NEW.approved_at := NULL;
    NEW.approved_by := NULL;
    NEW.rejection_reason := NULL;
    NEW.hidden_until := NULL;
    NEW.hidden_by := NULL;
    NEW.revision_requested_at := NULL;
    NEW.revision_deadline := NULL;
    NEW.revision_notes := NULL;
    RETURN NEW;
  END IF;

  -- UPDATE: Block non-admin self-approval or moderation tampering (never consumes upload quota)
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'Not sahibi değiştirilemez.';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (OLD.status = 'revision_requested' AND NEW.status = 'pending') THEN
      RAISE EXCEPTION 'Not onay durumu yalnızca yönetici tarafından değiştirilebilir.';
    END IF;
  END IF;

  IF NEW.approved_at IS DISTINCT FROM OLD.approved_at
     OR NEW.approved_by IS DISTINCT FROM OLD.approved_by
     OR NEW.rejection_reason IS DISTINCT FROM OLD.rejection_reason
     OR NEW.visibility_status IS DISTINCT FROM OLD.visibility_status
     OR NEW.hidden_until IS DISTINCT FROM OLD.hidden_until
     OR NEW.hidden_by IS DISTINCT FROM OLD.hidden_by
     OR NEW.revision_requested_at IS DISTINCT FROM OLD.revision_requested_at
     OR NEW.revision_deadline IS DISTINCT FROM OLD.revision_deadline
     OR NEW.revision_notes IS DISTINCT FROM OLD.revision_notes THEN
    RAISE EXCEPTION 'Moderasyon alanları yalnızca yönetici tarafından değiştirilebilir.';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.protect_notes_moderation_and_path() FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 6. Server-side Note Upload Quota RPCs
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_note_upload_quota(_user_id UUID)
RETURNS TABLE(
  remaining_uploads INTEGER,
  total_uploads INTEGER,
  starter_granted BOOLEAN,
  is_limited BOOLEAN,
  can_upload BOOLEAN,
  is_admin BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_role TEXT := COALESCE(current_setting('request.jwt.claim.role', true), '');
  v_is_admin BOOLEAN;
  v_quota INTEGER;
  v_starter_granted_at TIMESTAMPTZ;
  v_wheel_unlimited_until TIMESTAMPTZ;
  v_wheel_unlimited BOOLEAN := false;
  v_total_uploads INTEGER := 0;
BEGIN
  IF v_role <> 'service_role' THEN
    IF v_caller IS NULL THEN
      RAISE EXCEPTION 'Oturum bulunamadı.';
    END IF;
    IF _user_id IS DISTINCT FROM v_caller AND NOT public.is_admin(v_caller) THEN
      RAISE EXCEPTION 'Başka bir kullanıcının not yükleme hakkına erişemezsiniz.';
    END IF;
  END IF;

  v_is_admin := public.is_admin(_user_id);

  SELECT p.note_upload_quota, p.starter_upload_quota_granted_at, p.wheel_unlimited_until
  INTO v_quota, v_starter_granted_at, v_wheel_unlimited_until
  FROM public.profiles p
  WHERE p.user_id = _user_id;

  SELECT COUNT(*)::INTEGER
  INTO v_total_uploads
  FROM public.notes n
  WHERE n.user_id = _user_id;

  v_wheel_unlimited := (v_wheel_unlimited_until IS NOT NULL AND v_wheel_unlimited_until > now());

  RETURN QUERY SELECT
    CASE WHEN v_is_admin OR v_wheel_unlimited THEN NULL ELSE v_quota END,
    v_total_uploads,
    (v_starter_granted_at IS NOT NULL),
    (NOT v_is_admin AND NOT v_wheel_unlimited AND v_quota IS NOT NULL),
    (v_is_admin OR v_wheel_unlimited OR v_quota IS NULL OR v_quota > 0),
    v_is_admin;
END;
$$;

REVOKE ALL ON FUNCTION public.get_note_upload_quota(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_note_upload_quota(UUID) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_set_upload_quota(_user_id UUID, _quota INTEGER)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Yalnızca yöneticiler not yükleme hakkını değiştirebilir.';
  END IF;

  IF _quota IS NOT NULL AND (_quota < 0 OR _quota > 500) THEN
    RAISE EXCEPTION 'Not yükleme hakkı 0 ile 500 arasında olmalıdır.';
  END IF;

  PERFORM set_config('app.trusted_profile_mutation', 'true', true);
  UPDATE public.profiles
  SET note_upload_quota = _quota,
      updated_at = now()
  WHERE user_id = _user_id;
  PERFORM set_config('app.trusted_profile_mutation', 'false', true);

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_upload_quota(UUID, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_upload_quota(UUID, INTEGER) TO authenticated;

-- ----------------------------------------------------------------------------
-- 7. Server-side "What's New" Eligibility & Idempotent Mark-Seen RPCs
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_whats_new_eligibility(
  _version TEXT DEFAULT 'whats_new_2026_11_25',
  _cutoff TIMESTAMPTZ DEFAULT '2026-11-25T23:59:59.999+03:00'::TIMESTAMPTZ
)
RETURNS TABLE(
  eligible BOOLEAN,
  already_seen BOOLEAN,
  previous_last_login TIMESTAMPTZ,
  account_created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_profile_created TIMESTAMPTZ;
  v_auth_created TIMESTAMPTZ;
  v_effective_created TIMESTAMPTZ;
  v_last_login TIMESTAMPTZ;
  v_approval_status TEXT;
  v_starter_granted_at TIMESTAMPTZ;
  v_seen_versions TEXT[];
  v_already_seen BOOLEAN := false;
  v_eligible BOOLEAN := false;
BEGIN
  IF v_uid IS NULL THEN
    RETURN QUERY SELECT false, false, NULL::TIMESTAMPTZ, NULL::TIMESTAMPTZ;
    RETURN;
  END IF;

  SELECT
    p.created_at,
    p.last_login,
    p.approval_status,
    p.starter_upload_quota_granted_at,
    COALESCE(p.seen_whats_new_versions, '{}'::TEXT[])
  INTO
    v_profile_created,
    v_last_login,
    v_approval_status,
    v_starter_granted_at,
    v_seen_versions
  FROM public.profiles p
  WHERE p.user_id = v_uid;

  SELECT u.created_at
  INTO v_auth_created
  FROM auth.users u
  WHERE u.id = v_uid;

  v_effective_created := COALESCE(LEAST(v_profile_created, v_auth_created), v_profile_created, v_auth_created);

  SELECT (
    (_version = ANY(COALESCE(v_seen_versions, '{}'::TEXT[])))
    OR EXISTS (
      SELECT 1
      FROM public.user_whats_new_views w
      WHERE w.user_id = v_uid AND w.version = _version
    )
  ) INTO v_already_seen;

  -- Eligible ONLY for pre-existing users (not brand-new post-rollout accounts)
  -- whose last_login is <= cutoff OR NULL (registered before onboarding rollout and never logged in),
  -- who have NOT seen this version yet.
  IF NOT v_already_seen
     AND v_starter_granted_at IS NULL
     AND v_effective_created IS NOT NULL
     AND v_effective_created <= _cutoff
     AND (v_last_login IS NULL OR v_last_login <= _cutoff)
     AND NOT (v_last_login IS NULL AND v_effective_created >= '2026-11-25T00:00:00+03:00'::TIMESTAMPTZ) THEN
    v_eligible := true;
  END IF;

  RETURN QUERY SELECT v_eligible, v_already_seen, v_last_login, v_effective_created;
END;
$$;

REVOKE ALL ON FUNCTION public.check_whats_new_eligibility(TEXT, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_whats_new_eligibility(TEXT, TIMESTAMPTZ) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.mark_whats_new_seen(
  _version TEXT DEFAULT 'whats_new_2026_11_25',
  _status TEXT DEFAULT 'viewed'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_clean_version TEXT := BTRIM(COALESCE(_version, ''));
  v_clean_status TEXT := CASE
    WHEN _status IN ('viewed', 'skipped', 'completed') THEN _status
    ELSE 'viewed'
  END;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF v_clean_version !~ '^[a-zA-Z0-9_.-]{3,64}$' THEN
    RAISE EXCEPTION 'Invalid whats_new version identifier' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.user_whats_new_views (user_id, version, status, opened_at, completed_at, updated_at)
  VALUES (
    v_uid,
    v_clean_version,
    v_clean_status,
    now(),
    CASE WHEN v_clean_status IN ('skipped', 'completed') THEN now() ELSE NULL END,
    now()
  )
  ON CONFLICT (user_id, version) DO UPDATE SET
    status = CASE
      WHEN user_whats_new_views.status = 'completed' THEN 'completed'
      WHEN EXCLUDED.status IN ('skipped', 'completed') THEN EXCLUDED.status
      ELSE user_whats_new_views.status
    END,
    completed_at = COALESCE(
      user_whats_new_views.completed_at,
      EXCLUDED.completed_at
    ),
    updated_at = now();

  PERFORM set_config('app.trusted_profile_mutation', 'true', true);
  UPDATE public.profiles
  SET seen_whats_new_versions = CASE
        WHEN v_clean_version = ANY(COALESCE(seen_whats_new_versions, '{}'::TEXT[]))
          THEN seen_whats_new_versions
        ELSE array_append(COALESCE(seen_whats_new_versions, '{}'::TEXT[]), v_clean_version)
      END,
      updated_at = now()
  WHERE user_id = v_uid;
  PERFORM set_config('app.trusted_profile_mutation', 'false', true);

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_whats_new_seen(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_whats_new_seen(TEXT, TEXT) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
