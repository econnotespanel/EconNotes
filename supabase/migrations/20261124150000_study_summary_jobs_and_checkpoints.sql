-- Migration: EconNotes Next-Generation Multi-Stage Academic Summary Engine
-- Adds persistent background summary job tracking (`study_summary_jobs`),
-- intermediate section/chunk checkpoints (`study_summary_job_chunks`),
-- duplicate active job prevention, strict user-scoped RLS policies,
-- and saved-summary account metadata on `study_materials`.
--
-- SAFETY: 100% additive. Never resets, deletes, or weakens existing accounts,
-- notes, study_materials, XP balances, or RLS policies.

-- ============================================================================
-- 1. BACKGROUND SUMMARY ANALYSIS JOBS (queued / processing / completed / failed)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.study_summary_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  notebook_id text,
  source_fingerprint text NOT NULL,
  title text NOT NULL,
  course text,
  discipline_family text,
  status text NOT NULL DEFAULT 'queued' CHECK (
    status IN ('queued', 'processing', 'completed', 'failed')
  ),
  current_stage integer NOT NULL DEFAULT 1 CHECK (current_stage >= 1 AND current_stage <= 10),
  stage_code text NOT NULL DEFAULT 'preparing_file',
  stage_label text NOT NULL DEFAULT 'Dosya hazırlanıyor',
  progress_pct integer NOT NULL DEFAULT 0 CHECK (progress_pct >= 0 AND progress_pct <= 100),
  total_pages integer NOT NULL DEFAULT 1 CHECK (total_pages >= 1),
  processed_pages integer NOT NULL DEFAULT 0 CHECK (processed_pages >= 0),
  total_chunks integer NOT NULL DEFAULT 1 CHECK (total_chunks >= 1),
  completed_chunks integer NOT NULL DEFAULT 0 CHECK (completed_chunks >= 0),
  document_profile jsonb NOT NULL DEFAULT '{}'::jsonb,
  outline_plan jsonb NOT NULL DEFAULT '[]'::jsonb,
  quality_report jsonb,
  result_material_id uuid REFERENCES public.study_materials(id) ON DELETE SET NULL,
  error_message text,
  retry_count integer NOT NULL DEFAULT 0,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  -- Never report 100% before completion
  CONSTRAINT study_summary_jobs_pct_status_chk CHECK (
    (status = 'completed' AND progress_pct = 100) OR (status <> 'completed' AND progress_pct < 100)
  )
);

-- Prevent accidental duplicate concurrent jobs for the same user + same active source bundle
CREATE UNIQUE INDEX IF NOT EXISTS study_summary_jobs_active_dedup_uidx
  ON public.study_summary_jobs (user_id, source_fingerprint)
  WHERE status IN ('queued', 'processing');

CREATE INDEX IF NOT EXISTS study_summary_jobs_user_updated_idx
  ON public.study_summary_jobs (user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS study_summary_jobs_user_status_idx
  ON public.study_summary_jobs (user_id, status, updated_at DESC);

ALTER TABLE public.study_summary_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users select own summary jobs" ON public.study_summary_jobs;
CREATE POLICY "Users select own summary jobs"
ON public.study_summary_jobs
FOR SELECT
TO authenticated
USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Users insert own summary jobs" ON public.study_summary_jobs;
CREATE POLICY "Users insert own summary jobs"
ON public.study_summary_jobs
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users update own summary jobs" ON public.study_summary_jobs;
CREATE POLICY "Users update own summary jobs"
ON public.study_summary_jobs
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users delete own summary jobs" ON public.study_summary_jobs;
CREATE POLICY "Users delete own summary jobs"
ON public.study_summary_jobs
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

REVOKE ALL ON public.study_summary_jobs FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.study_summary_jobs TO authenticated;
GRANT ALL ON public.study_summary_jobs TO service_role;

-- ============================================================================
-- 2. INTERMEDIATE CHUNK CHECKPOINTS (Never re-process completed sections on retry)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.study_summary_job_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.study_summary_jobs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  chunk_index integer NOT NULL CHECK (chunk_index >= 0),
  page_start integer,
  page_end integer,
  page_range_label text,
  heading_hints jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'processing', 'completed', 'failed', 'repaired')
  ),
  section_output jsonb,
  quality_issues jsonb NOT NULL DEFAULT '[]'::jsonb,
  attempt_count integer NOT NULL DEFAULT 0,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS study_summary_job_chunks_job_idx
  ON public.study_summary_job_chunks (job_id, chunk_index);

CREATE INDEX IF NOT EXISTS study_summary_job_chunks_user_idx
  ON public.study_summary_job_chunks (user_id, updated_at DESC);

ALTER TABLE public.study_summary_job_chunks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users select own summary job chunks" ON public.study_summary_job_chunks;
CREATE POLICY "Users select own summary job chunks"
ON public.study_summary_job_chunks
FOR SELECT
TO authenticated
USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Users insert own summary job chunks" ON public.study_summary_job_chunks;
CREATE POLICY "Users insert own summary job chunks"
ON public.study_summary_job_chunks
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1 FROM public.study_summary_jobs j
    WHERE j.id = job_id AND j.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Users update own summary job chunks" ON public.study_summary_job_chunks;
CREATE POLICY "Users update own summary job chunks"
ON public.study_summary_job_chunks
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users delete own summary job chunks" ON public.study_summary_job_chunks;
CREATE POLICY "Users delete own summary job chunks"
ON public.study_summary_job_chunks
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

REVOKE ALL ON public.study_summary_job_chunks FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.study_summary_job_chunks TO authenticated;
GRANT ALL ON public.study_summary_job_chunks TO service_role;

-- ============================================================================
-- 3. STUDY MATERIALS ACCOUNT SAVING & JOB LINKING METADATA
-- ============================================================================

ALTER TABLE public.study_materials
  ADD COLUMN IF NOT EXISTS summary_job_id uuid REFERENCES public.study_summary_jobs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS saved_to_account boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_study_materials_user_type_created
  ON public.study_materials (user_id, material_type, created_at DESC);

-- Helper RPC to atomically claim or reuse an active summary job for (user_id, source_fingerprint)
CREATE OR REPLACE FUNCTION public.create_or_resume_summary_job(
  _source_fingerprint text,
  _title text,
  _course text DEFAULT NULL,
  _discipline_family text DEFAULT NULL,
  _notebook_id text DEFAULT NULL,
  _total_pages integer DEFAULT 1,
  _total_chunks integer DEFAULT 1,
  _document_profile jsonb DEFAULT '{}'::jsonb,
  _settings jsonb DEFAULT '{}'::jsonb,
  _force_new boolean DEFAULT false
)
RETURNS public.study_summary_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_existing public.study_summary_jobs;
  v_created public.study_summary_jobs;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Oturum doğrulanamadı.';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtext('summary_job:' || v_uid::text || ':' || COALESCE(_source_fingerprint, ''))
  );

  SELECT * INTO v_existing
  FROM public.study_summary_jobs
  WHERE user_id = v_uid
    AND source_fingerprint = _source_fingerprint
    AND status IN ('queued', 'processing')
  ORDER BY updated_at DESC
  LIMIT 1;

  IF FOUND THEN
    IF _force_new THEN
      UPDATE public.study_summary_jobs
      SET status = 'failed',
          error_message = 'Kullanıcı yeni analiz başlattı.',
          updated_at = now()
      WHERE id = v_existing.id;
    ELSE
      RETURN v_existing;
    END IF;
  END IF;

  INSERT INTO public.study_summary_jobs (
    user_id,
    notebook_id,
    source_fingerprint,
    title,
    course,
    discipline_family,
    status,
    current_stage,
    stage_code,
    stage_label,
    progress_pct,
    total_pages,
    processed_pages,
    total_chunks,
    completed_chunks,
    document_profile,
    settings,
    started_at,
    updated_at
  )
  VALUES (
    v_uid,
    _notebook_id,
    _source_fingerprint,
    left(COALESCE(NULLIF(btrim(_title), ''), 'Ders Notu Özeti'), 240),
    NULLIF(btrim(COALESCE(_course, '')), ''),
    NULLIF(btrim(COALESCE(_discipline_family, '')), ''),
    'queued',
    1,
    'preparing_file',
    'Dosya hazırlanıyor',
    2,
    GREATEST(1, COALESCE(_total_pages, 1)),
    0,
    GREATEST(1, COALESCE(_total_chunks, 1)),
    0,
    COALESCE(_document_profile, '{}'::jsonb),
    COALESCE(_settings, '{}'::jsonb),
    now(),
    now()
  )
  RETURNING * INTO v_created;

  RETURN v_created;
END;
$$;

REVOKE ALL ON FUNCTION public.create_or_resume_summary_job(text, text, text, text, text, integer, integer, jsonb, jsonb, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_or_resume_summary_job(text, text, text, text, text, integer, integer, jsonb, jsonb, boolean) TO authenticated;

NOTIFY pgrst, 'reload schema';
