-- EconNotes Çalışma Stüdyosu 2.0 — Additive Source Attribution & RLS Optimization Migration
-- Strictly additive & idempotent: preserves all existing user rows, notes, XP, and materials.

-- 1. Track explicit selected source IDs on summary jobs and generated study materials
ALTER TABLE public.study_summary_jobs
  ADD COLUMN IF NOT EXISTS source_ids TEXT[] NOT NULL DEFAULT '{}'::text[];

ALTER TABLE public.study_materials
  ADD COLUMN IF NOT EXISTS source_ids TEXT[] NOT NULL DEFAULT '{}'::text[];

-- 2. Add targeted indexes for per-user lookup & source provenance filtering
CREATE INDEX IF NOT EXISTS idx_study_materials_source_ids
  ON public.study_materials USING GIN (source_ids);

CREATE INDEX IF NOT EXISTS idx_study_summary_jobs_user_updated
  ON public.study_summary_jobs (user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_study_summary_job_chunks_user_job
  ON public.study_summary_job_chunks (user_id, job_id, chunk_index);

-- 3. Upgrade RLS policies on summary jobs & chunks to wrap auth.uid() in a scalar subselect
--    so Postgres computes the caller's UID once per statement (initPlan optimization).
DROP POLICY IF EXISTS "Users can view own summary jobs" ON public.study_summary_jobs;
CREATE POLICY "Users can view own summary jobs"
  ON public.study_summary_jobs
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can create own summary jobs" ON public.study_summary_jobs;
CREATE POLICY "Users can create own summary jobs"
  ON public.study_summary_jobs
  FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update own summary jobs" ON public.study_summary_jobs;
CREATE POLICY "Users can update own summary jobs"
  ON public.study_summary_jobs
  FOR UPDATE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete own summary jobs" ON public.study_summary_jobs;
CREATE POLICY "Users can delete own summary jobs"
  ON public.study_summary_jobs
  FOR DELETE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can view own summary job chunks" ON public.study_summary_job_chunks;
CREATE POLICY "Users can view own summary job chunks"
  ON public.study_summary_job_chunks
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can create own summary job chunks" ON public.study_summary_job_chunks;
CREATE POLICY "Users can create own summary job chunks"
  ON public.study_summary_job_chunks
  FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update own summary job chunks" ON public.study_summary_job_chunks;
CREATE POLICY "Users can update own summary job chunks"
  ON public.study_summary_job_chunks
  FOR UPDATE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete own summary job chunks" ON public.study_summary_job_chunks;
CREATE POLICY "Users can delete own summary job chunks"
  ON public.study_summary_job_chunks
  FOR DELETE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);
