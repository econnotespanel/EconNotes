-- ============================================================================
-- User Onboarding & Guided Platform Tour Persistence (Per-Account)
-- Stores each user's guided tour completion, resume step, and dismissed
-- contextual tips strictly scoped to their own profile row.
-- ============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_state JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE OR REPLACE FUNCTION public.save_my_onboarding_state(_state JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_sanitized JSONB;
  v_status TEXT;
  v_step INTEGER;
  v_welcome_seen BOOLEAN;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF _state IS NULL OR jsonb_typeof(_state) <> 'object' THEN
    RAISE EXCEPTION 'Invalid onboarding state payload' USING ERRCODE = '22023';
  END IF;

  IF length(_state::text) > 8192 THEN
    RAISE EXCEPTION 'Onboarding state payload too large' USING ERRCODE = '22023';
  END IF;

  v_status := COALESCE(_state->>'status', 'not_started');
  IF v_status NOT IN ('not_started', 'in_progress', 'skipped', 'completed') THEN
    v_status := 'not_started';
  END IF;

  v_step := GREATEST(0, LEAST(20, COALESCE(NULLIF(_state->>'currentStep', '')::INTEGER, 0)));
  v_welcome_seen := COALESCE((_state->>'welcomeSeen')::BOOLEAN, false);

  v_sanitized := jsonb_build_object(
    'version', COALESCE(NULLIF(_state->>'version', ''), 'v2'),
    'status', v_status,
    'currentStep', v_step,
    'welcomeSeen', v_welcome_seen,
    'completedSteps', CASE
      WHEN jsonb_typeof(_state->'completedSteps') = 'array' THEN _state->'completedSteps'
      ELSE '[]'::jsonb
    END,
    'dismissedTips', CASE
      WHEN jsonb_typeof(_state->'dismissedTips') = 'array' THEN _state->'dismissedTips'
      ELSE '[]'::jsonb
    END,
    'startedAt', _state->'startedAt',
    'completedAt', _state->'completedAt',
    'updatedAt', to_jsonb(now())
  );

  PERFORM set_config('app.trusted_profile_mutation', 'true', true);

  UPDATE public.profiles
  SET onboarding_state = v_sanitized,
      updated_at = now()
  WHERE user_id = v_uid;

  PERFORM set_config('app.trusted_profile_mutation', 'false', true);

  RETURN v_sanitized;
END;
$$;

REVOKE ALL ON FUNCTION public.save_my_onboarding_state(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_my_onboarding_state(JSONB) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
