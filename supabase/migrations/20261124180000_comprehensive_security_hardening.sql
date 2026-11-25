-- ============================================================================
-- Migration: Comprehensive Security Hardening (OWASP / RLS / Storage / XP / 2FA)
-- Preserves 100% of existing user accounts, notes, passwords, XP balances, and history.
-- Fixes: DB C-1..C-5, H-1..H-5, M-1..M-8, L-1..L-7
-- ============================================================================

-- ============================================================================
-- 1. SERVER-SIDE ATOMIC RATE LIMITING (Used by Edge Functions & verify_note_password)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.api_rate_limits (
  bucket_key TEXT PRIMARY KEY,
  window_started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  request_count INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.api_rate_limits ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.api_rate_limits FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.api_rate_limits TO service_role;

CREATE OR REPLACE FUNCTION public.check_rate_limit(
  _bucket_key TEXT,
  _max_requests INTEGER,
  _window_seconds INTEGER
)
RETURNS TABLE (
  allowed BOOLEAN,
  remaining INTEGER,
  retry_after_seconds INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now TIMESTAMPTZ := now();
  v_window INTERVAL := make_interval(secs => GREATEST(1, COALESCE(_window_seconds, 60)));
  v_limit INTEGER := GREATEST(1, COALESCE(_max_requests, 30));
  v_rec public.api_rate_limits%ROWTYPE;
  v_retry INTEGER := 0;
BEGIN
  IF _bucket_key IS NULL OR btrim(_bucket_key) = '' THEN
    RETURN QUERY SELECT true, v_limit, 0;
    RETURN;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('rate_limit:' || _bucket_key));

  SELECT * INTO v_rec
  FROM public.api_rate_limits
  WHERE bucket_key = _bucket_key
  FOR UPDATE;

  IF NOT FOUND OR (v_rec.window_started_at + v_window) <= v_now THEN
    INSERT INTO public.api_rate_limits (bucket_key, window_started_at, request_count, updated_at)
    VALUES (_bucket_key, v_now, 1, v_now)
    ON CONFLICT (bucket_key)
    DO UPDATE SET
      window_started_at = v_now,
      request_count = 1,
      updated_at = v_now;

    RETURN QUERY SELECT true, GREATEST(0, v_limit - 1), 0;
    RETURN;
  END IF;

  IF v_rec.request_count >= v_limit THEN
    v_retry := GREATEST(1, CEIL(EXTRACT(EPOCH FROM ((v_rec.window_started_at + v_window) - v_now)))::INTEGER);
    RETURN QUERY SELECT false, 0, v_retry;
    RETURN;
  END IF;

  UPDATE public.api_rate_limits
  SET request_count = v_rec.request_count + 1,
      updated_at = v_now
  WHERE bucket_key = _bucket_key;

  RETURN QUERY SELECT true, GREATEST(0, v_limit - (v_rec.request_count + 1)), 0;
END;
$$;

REVOKE ALL ON FUNCTION public.check_rate_limit(TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(TEXT, INTEGER, INTEGER) TO service_role;

-- ============================================================================
-- 2. APPROVED & UNBANNED USER HELPER (DB H-3)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.is_approved_unbanned_user(_uid UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status TEXT;
  v_banned BOOLEAN := false;
BEGIN
  IF _uid IS NULL THEN
    RETURN false;
  END IF;

  IF public.is_admin(_uid) THEN
    RETURN true;
  END IF;

  SELECT approval_status
  INTO v_status
  FROM public.profiles
  WHERE user_id = _uid;

  IF v_status IS NULL OR v_status <> 'approved' THEN
    RETURN false;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.penalties p
    WHERE p.user_id = _uid
      AND (
        p.is_permanent = true
        OR (p.penalty_until IS NOT NULL AND p.penalty_until > now())
      )
  ) INTO v_banned;

  RETURN NOT v_banned;
END;
$$;

REVOKE ALL ON FUNCTION public.is_approved_unbanned_user(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_approved_unbanned_user(UUID) TO authenticated, service_role;

-- ============================================================================
-- 3. LOCK PRIVILEGED COLUMNS ON public.profiles (DB C-1 & FE H-9)
-- ============================================================================
UPDATE public.profiles
SET wheel_bonus_quota = 0
WHERE wheel_bonus_quota < 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_wheel_bonus_quota_nonnegative'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_wheel_bonus_quota_nonnegative
      CHECK (wheel_bonus_quota >= 0);
  END IF;
END $$;

-- Drop owner DELETE policy on profiles (account deletion MUST go through OTP-verified delete-my-account)
DROP POLICY IF EXISTS "Users can delete own profile" ON public.profiles;

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
  -- Allow server-side / service_role / migrations (when auth.uid() is NULL) and verified admins
  IF v_uid IS NULL OR v_role = 'service_role' OR public.is_admin(v_uid) THEN
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
    RETURN NEW;
  END IF;

  -- UPDATE: Reject any attempt by a non-admin user to tamper with privileged columns
  IF NEW.approval_status IS DISTINCT FROM OLD.approval_status
     OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
     OR NEW.approved_by IS DISTINCT FROM OLD.approved_by
     OR NEW.manual_download_quota IS DISTINCT FROM OLD.manual_download_quota
     OR NEW.trivia_unlimited_until IS DISTINCT FROM OLD.trivia_unlimited_until
     OR NEW.wheel_bonus_quota IS DISTINCT FROM OLD.wheel_bonus_quota
     OR NEW.wheel_unlimited_until IS DISTINCT FROM OLD.wheel_unlimited_until THEN
    RAISE EXCEPTION 'Yetkisiz profil alanı güncellemesi engellendi.';
  END IF;

  -- Make birth_date immutable once set (prevents birthday unlimited-download abuse)
  IF OLD.birth_date IS NOT NULL AND NEW.birth_date IS DISTINCT FROM OLD.birth_date THEN
    RAISE EXCEPTION 'Doğum tarihi kaydedildikten sonra yalnızca yönetici tarafından değiştirilebilir.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_profiles_privileged_columns ON public.profiles;
CREATE TRIGGER trg_protect_profiles_privileged_columns
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_profiles_privileged_columns();

REVOKE ALL ON FUNCTION public.protect_profiles_privileged_columns() FROM PUBLIC, anon, authenticated;

-- Safe server-side RPC for legacy pre-Waiting-Room auto-approval (replaces browser direct profiles.update)
CREATE OR REPLACE FUNCTION public.approve_legacy_user_if_eligible()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_created TIMESTAMPTZ;
  v_status TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RETURN false;
  END IF;

  SELECT created_at, approval_status
  INTO v_created, v_status
  FROM public.profiles
  WHERE user_id = v_uid
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF v_status = 'approved' THEN
    RETURN true;
  END IF;

  IF v_status = 'pending' AND v_created < '2026-11-11T00:00:00Z'::timestamptz THEN
    UPDATE public.profiles
    SET approval_status = 'approved',
        approved_at = now()
    WHERE user_id = v_uid;
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.approve_legacy_user_if_eligible() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_legacy_user_if_eligible() TO authenticated;

-- ============================================================================
-- 4. FIX INFINITE XP MINTING & WHEEL RNG BYPASS (DB C-2 & C-3)
-- ============================================================================
-- A. Revoke legacy client-chosen-amount wheel RPC from authenticated users
REVOKE ALL ON FUNCTION public.claim_monday_wheel_xp(INTEGER, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_monday_wheel_xp(INTEGER, TEXT) TO service_role;

-- B. Harden reconcile_missing_gamification_xp: REMOVE all raw_user_meta_data trust!
--    Reconcile strictly from server-authoritative lucky_wheel_spins & daily_trivia_attempts.
CREATE OR REPLACE FUNCTION public.reconcile_missing_gamification_xp(
  _apply BOOLEAN DEFAULT true,
  _only_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_row RECORD;
  v_tx TEXT;
  v_credit JSONB;
  v_credited_wheel INTEGER := 0;
  v_credited_trivia INTEGER := 0;
  v_total_xp INTEGER := 0;
BEGIN
  -- Only service_role (or internal call via reconcile_my_missing_xp scoped to auth.uid()) may run
  IF _only_user_id IS NULL AND COALESCE(current_setting('request.jwt.claim.role', true), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Yetkisiz işlem.';
  END IF;

  -- 1. Authoritative lucky_wheel_spins rows with XP reward not yet credited
  FOR v_row IN
    SELECT s.id, s.user_id, s.spin_date, s.reward_xp, s.transaction_id
    FROM public.lucky_wheel_spins s
    WHERE s.reward_xp > 0
      AND s.status = 'completed'
      AND s.xp_credited = false
      AND (_only_user_id IS NULL OR s.user_id = _only_user_id)
  LOOP
    v_tx := COALESCE(NULLIF(btrim(v_row.transaction_id), ''), 'wheel:' || v_row.user_id::TEXT || ':' || v_row.spin_date::TEXT);
    IF _apply THEN
      v_credit := public.credit_xp_atomic(
        v_row.user_id,
        v_row.reward_xp,
        'monday_wheel',
        'lucky_wheel',
        v_row.id::TEXT,
        v_tx,
        jsonb_build_object('reconciled', true, 'spin_date', v_row.spin_date)
      );
      IF COALESCE((v_credit->>'ok')::BOOLEAN, false) THEN
        UPDATE public.lucky_wheel_spins
        SET xp_credited = true,
            xp_credited_at = now(),
            updated_at = now()
        WHERE id = v_row.id;
        IF NOT COALESCE((v_credit->>'duplicate')::BOOLEAN, false) THEN
          v_credited_wheel := v_credited_wheel + 1;
          v_total_xp := v_total_xp + v_row.reward_xp;
        END IF;
      END IF;
    END IF;
  END LOOP;

  -- 2. Authoritative completed daily_trivia_attempts rows with pending XP
  FOR v_row IN
    SELECT a.id, a.user_id, a.attempt_date, a.correct_count, a.xp_earned
    FROM public.daily_trivia_attempts a
    WHERE a.status = 'completed'
      AND a.xp_credited = false
      AND COALESCE(a.xp_earned, a.correct_count * 25) > 0
      AND (_only_user_id IS NULL OR a.user_id = _only_user_id)
  LOOP
    v_tx := 'trivia:' || v_row.id::TEXT;
    IF _apply THEN
      v_credit := public.credit_xp_atomic(
        v_row.user_id,
        LEAST(375, GREATEST(0, COALESCE(v_row.xp_earned, v_row.correct_count * 25))),
        'daily_trivia',
        'daily_trivia',
        v_row.id::TEXT,
        v_tx,
        jsonb_build_object('reconciled', true, 'attempt_date', v_row.attempt_date)
      );
      IF COALESCE((v_credit->>'ok')::BOOLEAN, false) THEN
        UPDATE public.daily_trivia_attempts
        SET xp_credited = true,
            xp_credited_at = now(),
            updated_at = now()
        WHERE id = v_row.id;
        IF NOT COALESCE((v_credit->>'duplicate')::BOOLEAN, false) THEN
          v_credited_trivia := v_credited_trivia + 1;
          v_total_xp := v_total_xp + LEAST(375, GREATEST(0, COALESCE(v_row.xp_earned, v_row.correct_count * 25)));
        END IF;
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'credited_wheel', v_credited_wheel,
    'credited_trivia', v_credited_trivia,
    'total_xp_reconciled', v_total_xp
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_missing_gamification_xp(BOOLEAN, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_missing_gamification_xp(BOOLEAN, UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.reconcile_my_missing_xp()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Oturum bulunamadı.';
  END IF;
  RETURN public.reconcile_missing_gamification_xp(true, v_uid);
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_my_missing_xp() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reconcile_my_missing_xp() TO authenticated;

-- C. Harden public.award_points: remove mission_trivia_% cap bypass & monday_wheel delegation,
--    enforce strict allowlist of legitimate client actions & tight daily caps.
CREATE OR REPLACE FUNCTION public.award_points(_reason TEXT, _amount INTEGER)
RETURNS TABLE(total_points INTEGER, current_streak INTEGER, level_name TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_today DATE := (now() AT TIME ZONE 'Europe/Istanbul')::DATE;
  v_clean_reason TEXT := lower(btrim(COALESCE(_reason, '')));
  v_allowed_amount INTEGER := 0;
  v_reason_today_count INTEGER := 0;
  v_daily_awarded INTEGER := 0;
  v_new_total INTEGER := 0;
  v_streak INTEGER := 0;
  v_level TEXT := 'Yeni Başlayan';
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Oturum bulunamadı.';
  END IF;

  IF NOT public.is_approved_unbanned_user(v_uid) THEN
    RAISE EXCEPTION 'Hesabınız bu işlem için onaylı değil.';
  END IF;

  -- Strictly disallow forging server-authoritative gamification rewards through award_points
  IF v_clean_reason IN ('monday_wheel', 'daily_trivia', 'trivia_win', 'wheel_bonus')
     OR v_clean_reason LIKE 'mission_trivia%'
     OR v_clean_reason LIKE 'wheel%' THEN
    RAISE EXCEPTION 'Bu ödül yalnızca sunucu tarafından doğrulanarak verilebilir.';
  END IF;

  -- Strict allowlist with server-determined maximum amounts & daily counts
  IF v_clean_reason = 'daily_login' THEN
    v_allowed_amount := 10;
  ELSIF v_clean_reason = 'note_upload' THEN
    v_allowed_amount := 20;
  ELSIF v_clean_reason IN ('study_complete', 'kpss_attempt', 'quiz_complete', 'flashcard_session') THEN
    v_allowed_amount := 15;
  ELSE
    RAISE EXCEPTION 'Desteklenmeyen puan sebebi.';
  END IF;

  v_allowed_amount := LEAST(v_allowed_amount, GREATEST(1, COALESCE(_amount, 0)));

  PERFORM pg_advisory_xact_lock(hashtext('award_points:' || v_uid::TEXT || ':' || v_today::TEXT));

  SELECT COUNT(*)
  INTO v_reason_today_count
  FROM public.point_events
  WHERE user_id = v_uid
    AND reason = v_clean_reason
    AND (created_at AT TIME ZONE 'Europe/Istanbul')::DATE = v_today;

  IF (v_clean_reason = 'daily_login' AND v_reason_today_count >= 1)
     OR (v_clean_reason <> 'daily_login' AND v_reason_today_count >= 3) THEN
    SELECT COALESCE(up.points, 0), COALESCE(up.current_streak, 0)
    INTO v_new_total, v_streak
    FROM public.user_points up
    WHERE up.user_id = v_uid;

    RETURN QUERY SELECT COALESCE(v_new_total, 0), COALESCE(v_streak, 0),
      CASE
        WHEN COALESCE(v_new_total, 0) >= 2000 THEN 'Efsane'
        WHEN COALESCE(v_new_total, 0) >= 1000 THEN 'Üstat'
        WHEN COALESCE(v_new_total, 0) >= 500 THEN 'Uzman'
        WHEN COALESCE(v_new_total, 0) >= 200 THEN 'Araştırmacı'
        ELSE 'Yeni Başlayan'
      END;
    RETURN;
  END IF;

  SELECT COALESCE(SUM(amount), 0)
  INTO v_daily_awarded
  FROM public.point_events
  WHERE user_id = v_uid
    AND reason IN ('daily_login', 'note_upload', 'study_complete', 'kpss_attempt', 'quiz_complete', 'flashcard_session')
    AND (created_at AT TIME ZONE 'Europe/Istanbul')::DATE = v_today;

  IF v_daily_awarded + v_allowed_amount > 100 THEN
    v_allowed_amount := GREATEST(0, 100 - v_daily_awarded);
  END IF;

  IF v_allowed_amount > 0 THEN
    PERFORM public.credit_xp_atomic(
      v_uid,
      v_allowed_amount,
      v_clean_reason,
      'activity',
      v_clean_reason || ':' || v_today::TEXT || ':' || (v_reason_today_count + 1)::TEXT,
      'act:' || v_uid::TEXT || ':' || v_clean_reason || ':' || v_today::TEXT || ':' || (v_reason_today_count + 1)::TEXT,
      jsonb_build_object('day', v_today)
    );
  END IF;

  SELECT COALESCE(up.points, 0), COALESCE(up.current_streak, 0)
  INTO v_new_total, v_streak
  FROM public.user_points up
  WHERE up.user_id = v_uid;

  v_level := CASE
    WHEN COALESCE(v_new_total, 0) >= 2000 THEN 'Efsane'
    WHEN COALESCE(v_new_total, 0) >= 1000 THEN 'Üstat'
    WHEN COALESCE(v_new_total, 0) >= 500 THEN 'Uzman'
    WHEN COALESCE(v_new_total, 0) >= 200 THEN 'Araştırmacı'
    ELSE 'Yeni Başlayan'
  END;

  RETURN QUERY SELECT COALESCE(v_new_total, 0), COALESCE(v_streak, 0), v_level;
END;
$$;

REVOKE ALL ON FUNCTION public.award_points(TEXT, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.award_points(TEXT, INTEGER) TO authenticated;

-- ============================================================================
-- 5. ISOLATE NOTE PASSWORDS FROM REALTIME + RATE-LIMIT verify_note_password (DB H-4)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.note_secrets (
  note_id UUID PRIMARY KEY REFERENCES public.notes(id) ON DELETE CASCADE,
  password_secret TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.note_secrets ENABLE ROW LEVEL SECURITY;
-- Zero policies for anon/authenticated -> strictly inaccessible from clients & never in supabase_realtime
REVOKE ALL ON TABLE public.note_secrets FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.note_secrets TO service_role;

-- Migrate all existing note passwords cleanly without losing a single locked note
INSERT INTO public.note_secrets (note_id, password_secret)
SELECT id, btrim(note_password)
FROM public.notes
WHERE note_password IS NOT NULL AND btrim(note_password) <> ''
ON CONFLICT (note_id)
DO UPDATE SET password_secret = EXCLUDED.password_secret, updated_at = now();

UPDATE public.notes
SET has_password = true,
    note_password = NULL
WHERE note_password IS NOT NULL AND btrim(note_password) <> '';

-- AFTER trigger moves any newly supplied notes.note_password into note_secrets and clears notes.note_password
CREATE OR REPLACE FUNCTION public.move_note_password_to_secrets()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  IF NEW.note_password IS NOT NULL AND btrim(NEW.note_password) <> '' THEN
    INSERT INTO public.note_secrets (note_id, password_secret, updated_at)
    VALUES (NEW.id, btrim(NEW.note_password), now())
    ON CONFLICT (note_id)
    DO UPDATE SET password_secret = EXCLUDED.password_secret, updated_at = now();

    UPDATE public.notes
    SET has_password = true,
        note_password = NULL
    WHERE id = NEW.id;
  ELSIF TG_OP = 'UPDATE' AND OLD.has_password = true AND NEW.has_password = false THEN
    DELETE FROM public.note_secrets WHERE note_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_move_note_password_to_secrets ON public.notes;
CREATE TRIGGER trg_move_note_password_to_secrets
  AFTER INSERT OR UPDATE OF note_password, has_password ON public.notes
  FOR EACH ROW
  EXECUTE FUNCTION public.move_note_password_to_secrets();

REVOKE ALL ON FUNCTION public.move_note_password_to_secrets() FROM PUBLIC, anon, authenticated;

-- Upgrade verify_note_password with rate limiting (8 attempts / 15 min) + note_secrets lookup
CREATE OR REPLACE FUNCTION public.verify_note_password(_note_id UUID, _password TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_pw TEXT;
  v_visible BOOLEAN;
  v_rl RECORD;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Oturum bulunamadı.';
  END IF;

  IF NOT public.is_approved_unbanned_user(v_uid) THEN
    RETURN false;
  END IF;

  SELECT * INTO v_rl
  FROM public.check_rate_limit('note_pw:' || v_uid::TEXT || ':' || _note_id::TEXT, 8, 900);

  IF v_rl.allowed IS NOT TRUE THEN
    RAISE EXCEPTION 'Çok fazla hatalı şifre denemesi. Lütfen % saniye sonra tekrar deneyin.', COALESCE(v_rl.retry_after_seconds, 60);
  END IF;

  SELECT
    COALESCE(ns.password_secret, note.note_password),
    (
      public.is_admin(v_uid)
      OR note.user_id = v_uid
      OR (
        note.status = 'approved'
        AND (
          note.visibility_status = 'visible'
          OR (
            note.visibility_status = 'temporary'
            AND note.hidden_until IS NOT NULL
            AND note.hidden_until <= now()
          )
        )
      )
    )
  INTO v_pw, v_visible
  FROM public.notes AS note
  LEFT JOIN public.note_secrets AS ns ON ns.note_id = note.id
  WHERE note.id = _note_id;

  IF v_visible IS NOT TRUE THEN
    RETURN false;
  END IF;

  IF v_pw IS NULL OR btrim(v_pw) = '' THEN
    RETURN true;
  END IF;

  IF btrim(v_pw) <> btrim(COALESCE(_password, '')) THEN
    RETURN false;
  END IF;

  INSERT INTO public.note_password_unlocks (user_id, note_id, expires_at)
  VALUES (v_uid, _note_id, now() + INTERVAL '30 minutes')
  ON CONFLICT (user_id, note_id)
  DO UPDATE SET expires_at = EXCLUDED.expires_at;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.verify_note_password(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verify_note_password(UUID, TEXT) TO authenticated;

-- ============================================================================
-- 6. LOCK public.notes MODERATION, FILE_URL PREFIX & STATUS INTEGRITY (DB C-4, C-5, L-7)
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'notes_valid_status_check'
      AND conrelid = 'public.notes'::regclass
  ) THEN
    ALTER TABLE public.notes
      ADD CONSTRAINT notes_valid_status_check
      CHECK (status IN ('pending', 'approved', 'rejected', 'revision_requested', 'archived'))
      NOT VALID;
  END IF;
END $$;

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
    -- Non-admin uploads must reference their own user_id/ prefix
    IF NOT (
      v_norm_url LIKE (v_uid::TEXT || '/%')
      OR v_norm_url ~* ('^https://[^/]+/storage/v1/object/(?:public|sign|authenticated)/notes/' || v_uid::TEXT || '/')
    ) THEN
      RAISE EXCEPTION 'Dosya yolu yalnızca kendi kullanıcı dizininize ait olabilir.';
    END IF;
  END IF;

  IF TG_OP = 'INSERT' THEN
    SELECT COALESCE(note_upload_restricted, false)
    INTO v_upload_restricted
    FROM public.system_settings
    LIMIT 1;

    IF v_upload_restricted THEN
      RAISE EXCEPTION 'Not yükleme şu anda yönetici tarafından geçici olarak kısıtlanmıştır.';
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

  -- UPDATE: Block non-admin self-approval or moderation tampering
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'Not sahibi değiştirilemez.';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    -- Allow owner ONLY to resubmit a revision_requested note back to pending
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

DROP TRIGGER IF EXISTS trg_protect_notes_moderation_and_path ON public.notes;
CREATE TRIGGER trg_protect_notes_moderation_and_path
  BEFORE INSERT OR UPDATE ON public.notes
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_notes_moderation_and_path();

REVOKE ALL ON FUNCTION public.protect_notes_moderation_and_path() FROM PUBLIC, anon, authenticated;

-- Restore column-level SELECT grants for newer non-secret notes columns (DB L-7)
GRANT SELECT (edited_by_name, revision_requested_at, revision_deadline, revision_notes) ON public.notes TO authenticated;

-- ============================================================================
-- 7. HARDEN STORAGE BUCKETS & storage.objects RLS (DB C-4, H-1, M-4)
-- ============================================================================
UPDATE storage.buckets
SET public = false,
    file_size_limit = 52428800, -- 50 MB
    allowed_mime_types = ARRAY[
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/webp',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/msword',
      'application/vnd.ms-powerpoint',
      'text/plain'
    ]
WHERE id = 'notes';

UPDATE storage.buckets
SET file_size_limit = 5242880, -- 5 MB
    allowed_mime_types = ARRAY[
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif'
    ]
WHERE id = 'avatars';

-- Remove broad anonymous directory listing on avatars (public CDN URLs continue working without SELECT policy)
DROP POLICY IF EXISTS "Avatars publicly accessible" ON storage.objects;

-- Rebuild private `notes` bucket SELECT policy:
-- - Eliminates `note.user_id = auth.uid()` spoofing vector
-- - Eliminates wildcard LIKE matching
-- - Restricts `study-reports/*` to admin or uploader
-- - Restricts `messages/*` to admin, uploader, or actual message participant
DROP POLICY IF EXISTS "Notes files publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Notes files authenticated scoped read" ON storage.objects;
DROP POLICY IF EXISTS "Notes files require note access" ON storage.objects;

CREATE POLICY "Notes files require note access"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'notes'
  AND (
    public.is_admin(auth.uid())
    OR (
      public.is_approved_unbanned_user(auth.uid())
      AND (
        -- Owner's own upload folder
        (storage.foldername(name))[1] = auth.uid()::TEXT
        -- Public announcements attachments
        OR (storage.foldername(name))[1] = 'announcements'
        -- Study report screenshots: uploader folder only (admins covered above)
        OR (
          (storage.foldername(name))[1] = 'study-reports'
          AND (storage.foldername(name))[2] = auth.uid()::TEXT
        )
        -- DM attachments: uploader folder OR actual sender/receiver of a message containing this exact path
        OR (
          (storage.foldername(name))[1] = 'messages'
          AND (
            (storage.foldername(name))[2] = auth.uid()::TEXT
            OR EXISTS (
              SELECT 1
              FROM public.messages AS m
              WHERE (m.sender_id = auth.uid() OR m.receiver_id = auth.uid())
                AND position(storage.objects.name IN m.content) > 0
            )
          )
        )
        -- Approved, visible, non-locked (or unlocked) notes with exact normalized path matching
        OR EXISTS (
          SELECT 1
          FROM public.notes AS note
          WHERE (
              note.file_url = storage.objects.name
              OR regexp_replace(
                regexp_replace(btrim(COALESCE(note.file_url, '')), '\?.*$', ''),
                '^https?://[^/]+/storage/v1/(?:object|render/image)/(?:(?:public|sign|authenticated)/)?notes/',
                '',
                'i'
              ) = storage.objects.name
            )
            AND note.status = 'approved'
            AND (
              note.visibility_status = 'visible'
              OR (
                note.visibility_status = 'temporary'
                AND note.hidden_until IS NOT NULL
                AND note.hidden_until <= now()
              )
            )
            AND (
              NOT COALESCE(note.has_password, false)
              OR EXISTS (
                SELECT 1
                FROM public.note_password_unlocks AS unlock
                WHERE unlock.note_id = note.id
                  AND unlock.user_id = auth.uid()
                  AND unlock.expires_at > now()
              )
            )
        )
      )
    )
  )
);

-- ============================================================================
-- 8. LOCK public.messages IMMUTABLE COLUMNS & ENFORCE user_blocks (DB H-2)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.protect_messages_immutable_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_role TEXT := COALESCE(current_setting('request.jwt.claim.role', true), '');
BEGIN
  IF v_uid IS NULL OR v_role = 'service_role' OR public.is_admin(v_uid) THEN
    RETURN NEW;
  END IF;

  IF NEW.sender_id IS DISTINCT FROM OLD.sender_id
     OR NEW.receiver_id IS DISTINCT FROM OLD.receiver_id
     OR NEW.content IS DISTINCT FROM OLD.content
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Mesaj içeriği ve gönderici bilgisi değiştirilemez; yalnızca okundu durumu güncellenebilir.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_messages_immutable_columns ON public.messages;
CREATE TRIGGER trg_protect_messages_immutable_columns
  BEFORE UPDATE ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_messages_immutable_columns();

REVOKE ALL ON FUNCTION public.protect_messages_immutable_columns() FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS "Users can send messages" ON public.messages;
CREATE POLICY "Users can send messages"
ON public.messages
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = sender_id
  AND sender_id <> receiver_id
  AND (
    public.is_admin(auth.uid())
    OR (
      public.is_approved_unbanned_user(auth.uid())
      AND NOT EXISTS (
        SELECT 1
        FROM public.user_blocks ub
        WHERE (ub.blocker_id = receiver_id AND ub.blocked_id = auth.uid())
           OR (ub.blocker_id = auth.uid() AND ub.blocked_id = receiver_id)
      )
    )
  )
);

-- ============================================================================
-- 9. VERSION-CONTROL & LOCK public.sms_2fa AND public.sms_2fa_sessions (DB H-5)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.sms_2fa (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sms_2fa_sessions (
  session_id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  verified_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.sms_2fa ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_2fa_sessions ENABLE ROW LEVEL SECURITY;

-- Drop any legacy permissive policies
DO $$
DECLARE
  v_pol RECORD;
BEGIN
  FOR v_pol IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('sms_2fa', 'sms_2fa_sessions')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', v_pol.policyname, v_pol.schemaname, v_pol.tablename);
  END LOOP;
END $$;

REVOKE ALL ON TABLE public.sms_2fa FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.sms_2fa_sessions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.sms_2fa TO authenticated;
GRANT SELECT ON TABLE public.sms_2fa_sessions TO authenticated;
GRANT ALL ON TABLE public.sms_2fa TO service_role;
GRANT ALL ON TABLE public.sms_2fa_sessions TO service_role;

CREATE POLICY "Users can view own sms_2fa"
ON public.sms_2fa FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can view own sms_2fa_sessions"
ON public.sms_2fa_sessions FOR SELECT TO authenticated
USING (auth.uid() = user_id);

-- ============================================================================
-- 10. FIX IDOR, MISSING REVOKES, FRIEND_REQUESTS, TRIVIA, COMMENTS & HYGIENE
--     (DB M-1, M-2, M-3, M-5, M-6, M-7, L-1, L-2, L-3, L-5)
-- ============================================================================

-- M-1: Enforce caller identity in get_download_quota(_user_id)
CREATE OR REPLACE FUNCTION public.get_download_quota(_user_id UUID)
RETURNS TABLE(
  base_quota INTEGER,
  bonus_quota INTEGER,
  total_quota INTEGER,
  total_downloads INTEGER,
  remaining INTEGER,
  approved_uploads INTEGER,
  is_admin BOOLEAN,
  manual_quota INTEGER
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
  v_approved INTEGER;
  v_downloads INTEGER;
  v_manual INTEGER;
  v_birth_date DATE;
  v_trivia_unlimited_until TIMESTAMPTZ;
  v_wheel_bonus INTEGER := 0;
  v_wheel_unlimited_until TIMESTAMPTZ;
  v_tr_today DATE;
  v_is_birthday BOOLEAN := false;
  v_is_unlimited BOOLEAN := false;
  v_base INTEGER := 3;
  v_bonus INTEGER;
  v_total INTEGER;
BEGIN
  IF v_role <> 'service_role' THEN
    IF v_caller IS NULL THEN
      RAISE EXCEPTION 'Oturum bulunamadı.';
    END IF;
    IF _user_id IS DISTINCT FROM v_caller AND NOT public.is_admin(v_caller) THEN
      RAISE EXCEPTION 'Başka bir kullanıcının indirme kotasına erişemezsiniz.';
    END IF;
  END IF;

  v_is_admin := public.is_admin(_user_id);

  SELECT
    p.manual_download_quota,
    p.birth_date,
    p.trivia_unlimited_until,
    COALESCE(p.wheel_bonus_quota, 0),
    p.wheel_unlimited_until
  INTO
    v_manual,
    v_birth_date,
    v_trivia_unlimited_until,
    v_wheel_bonus,
    v_wheel_unlimited_until
  FROM public.profiles p
  WHERE p.user_id = _user_id;

  SELECT COUNT(*)::INTEGER INTO v_approved
  FROM public.notes n
  WHERE n.user_id = _user_id AND n.status = 'approved';

  SELECT COUNT(*)::INTEGER INTO v_downloads
  FROM public.note_downloads d
  WHERE d.user_id = _user_id;

  v_tr_today := (now() AT TIME ZONE 'Europe/Istanbul')::DATE;
  IF v_birth_date IS NOT NULL THEN
    IF EXTRACT(MONTH FROM v_birth_date) = EXTRACT(MONTH FROM v_tr_today)
       AND EXTRACT(DAY FROM v_birth_date) = EXTRACT(DAY FROM v_tr_today) THEN
      v_is_birthday := true;
    END IF;
  END IF;

  IF (v_trivia_unlimited_until IS NOT NULL AND v_trivia_unlimited_until > now())
     OR (v_wheel_unlimited_until IS NOT NULL AND v_wheel_unlimited_until > now()) THEN
    v_is_unlimited := true;
  END IF;

  v_bonus := (v_approved * 2) + GREATEST(0, COALESCE(v_wheel_bonus, 0));

  IF v_is_admin OR v_is_birthday OR v_is_unlimited THEN
    RETURN QUERY SELECT v_base, v_bonus, 999, v_downloads, 999, v_approved, v_is_admin, v_manual;
    RETURN;
  END IF;

  IF v_manual IS NOT NULL THEN
    v_total := v_manual + GREATEST(0, COALESCE(v_wheel_bonus, 0));
  ELSE
    v_total := v_base + v_bonus;
  END IF;

  RETURN QUERY SELECT v_base, v_bonus, v_total, v_downloads, GREATEST(0, v_total - v_downloads), v_approved, v_is_admin, v_manual;
END;
$$;

REVOKE ALL ON FUNCTION public.get_download_quota(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_download_quota(UUID) TO authenticated, service_role;

-- M-2: Revoke archive_expired_revision_notes from PUBLIC/anon/authenticated & revoke admin_set_download_quota from anon
REVOKE ALL ON FUNCTION public.archive_expired_revision_notes() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.archive_expired_revision_notes() TO service_role;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'admin_set_download_quota'
  ) THEN
    REVOKE ALL ON FUNCTION public.admin_set_download_quota(UUID, INTEGER) FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.admin_set_download_quota(UUID, INTEGER) TO authenticated;
  END IF;
END $$;

-- M-3: Harden friend_requests INSERT (must be pending, non-self, not blocked) & lock UPDATE sender/receiver
DROP POLICY IF EXISTS "Users can send friend requests" ON public.friend_requests;
CREATE POLICY "Users can send friend requests"
ON public.friend_requests
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = sender_id
  AND receiver_id <> auth.uid()
  AND status = 'pending'
  AND public.is_approved_unbanned_user(auth.uid())
  AND NOT EXISTS (
    SELECT 1 FROM public.user_blocks ub
    WHERE (ub.blocker_id = receiver_id AND ub.blocked_id = auth.uid())
       OR (ub.blocker_id = auth.uid() AND ub.blocked_id = receiver_id)
  )
);

CREATE OR REPLACE FUNCTION public.protect_friend_requests_immutable()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.sender_id IS DISTINCT FROM OLD.sender_id OR NEW.receiver_id IS DISTINCT FROM OLD.receiver_id THEN
    RAISE EXCEPTION 'Arkadaşlık isteği tarafları değiştirilemez.';
  END IF;
  IF NEW.status NOT IN ('pending', 'accepted', 'rejected') THEN
    RAISE EXCEPTION 'Geçersiz arkadaşlık isteği durumu.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_friend_requests_immutable ON public.friend_requests;
CREATE TRIGGER trg_protect_friend_requests_immutable
  BEFORE UPDATE ON public.friend_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_friend_requests_immutable();

REVOKE ALL ON FUNCTION public.protect_friend_requests_immutable() FROM PUBLIC, anon, authenticated;

-- M-5: Enforce expires_at in Daily Trivia answer trigger
CREATE OR REPLACE FUNCTION public.prevent_answer_on_inactive_trivia()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_attempt public.daily_trivia_attempts%ROWTYPE;
BEGIN
  SELECT * INTO v_attempt
  FROM public.daily_trivia_attempts
  WHERE id = NEW.attempt_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Yarışma oturumu bulunamadı.';
  END IF;

  IF v_attempt.status NOT IN ('in_progress', 'grace_period') THEN
    RAISE EXCEPTION 'İptal edilmiş, süresi dolmuş veya tamamlanmış yarışmaya cevap kaydedilemez.';
  END IF;

  IF v_attempt.expires_at IS NOT NULL AND now() > v_attempt.expires_at THEN
    RAISE EXCEPTION 'Yarışma süresi dolduğu için cevap kaydedilemez.';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_answer_on_inactive_trivia() FROM PUBLIC, anon, authenticated;

-- M-7: Restrict comments SELECT to visible notes/announcements & enforce server-side user_name
DROP POLICY IF EXISTS "Comments viewable by everyone" ON public.comments;
DROP POLICY IF EXISTS "Anyone can view comments" ON public.comments;
DROP POLICY IF EXISTS "Authenticated users can view comments" ON public.comments;

CREATE POLICY "Authenticated users can view visible comments"
ON public.comments
FOR SELECT
TO authenticated
USING (
  public.is_admin(auth.uid())
  OR user_id = auth.uid()
  OR (
    note_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.notes n
      WHERE n.id = comments.note_id
        AND (
          n.user_id = auth.uid()
          OR (
            n.status = 'approved'
            AND (
              n.visibility_status = 'visible'
              OR (n.visibility_status = 'temporary' AND n.hidden_until IS NOT NULL AND n.hidden_until <= now())
            )
          )
        )
    )
  )
  OR announcement_id IS NOT NULL
);

CREATE OR REPLACE FUNCTION public.enforce_comment_author_name()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name TEXT;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin(auth.uid()) THEN
    NEW.user_id := auth.uid();
    SELECT NULLIF(btrim(full_name), '') INTO v_name
    FROM public.profiles
    WHERE user_id = auth.uid();
    IF v_name IS NOT NULL THEN
      NEW.user_name := v_name;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_comment_author_name ON public.comments;
CREATE TRIGGER trg_enforce_comment_author_name
  BEFORE INSERT ON public.comments
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_comment_author_name();

REVOKE ALL ON FUNCTION public.enforce_comment_author_name() FROM PUBLIC, anon, authenticated;

-- L-1: Fix mutable search_path on university normalization functions
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'normalize_university_name') THEN
    ALTER FUNCTION public.normalize_university_name(TEXT) SET search_path = public;
    REVOKE ALL ON FUNCTION public.normalize_university_name(TEXT) FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.normalize_university_name(TEXT) TO authenticated, service_role;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'trg_canonicalize_note_university') THEN
    ALTER FUNCTION public.trg_canonicalize_note_university() SET search_path = public;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'trg_canonicalize_profile_university') THEN
    ALTER FUNCTION public.trg_canonicalize_profile_university() SET search_path = public;
  END IF;
END $$;

-- L-2: Restrict has_role(_user_id, _role) so non-admins cannot enumerate other users' roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_jwt_role TEXT := COALESCE(current_setting('request.jwt.claim.role', true), '');
BEGIN
  IF v_jwt_role <> 'service_role' AND v_caller IS NOT NULL AND _user_id IS DISTINCT FROM v_caller AND NOT public.is_admin(v_caller) THEN
    RETURN false;
  END IF;
  RETURN EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  );
END;
$$;

-- L-3: Cap get_leaderboard(_limit) to <= 100 and exclude non-approved accounts
CREATE OR REPLACE FUNCTION public.get_leaderboard(_limit INTEGER DEFAULT 50)
RETURNS TABLE(
  user_id UUID,
  full_name TEXT,
  avatar_url TEXT,
  department TEXT,
  university TEXT,
  points INTEGER,
  current_streak INTEGER,
  total_logins INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    up.user_id,
    pr.full_name,
    pr.avatar_url,
    pr.department,
    pr.university,
    up.points,
    up.current_streak,
    up.total_logins
  FROM public.user_points up
  JOIN public.profiles pr ON pr.user_id = up.user_id
  WHERE pr.approval_status = 'approved'
  ORDER BY up.points DESC, up.current_streak DESC
  LIMIT LEAST(GREATEST(COALESCE(_limit, 50), 1), 100);
$$;

-- L-5: Enforce cross-table ownership in study_summary_job_chunks UPDATE & study_progress INSERT
DROP POLICY IF EXISTS "Users can update own summary job chunks" ON public.study_summary_job_chunks;
CREATE POLICY "Users can update own summary job chunks"
ON public.study_summary_job_chunks
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1 FROM public.study_summary_jobs j
    WHERE j.id = job_id AND j.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Users can insert own study progress" ON public.study_progress;
CREATE POLICY "Users can insert own study progress"
ON public.study_progress
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1 FROM public.study_materials m
    WHERE m.id = material_id AND m.user_id = auth.uid()
  )
);
