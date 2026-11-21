-- Migration: Public total view & download counts for all uploaded notes
-- Visible to all authenticated users and administrators without exposing individual user history.

-- 1. Dedicated aggregated stats table (keeps notes.updated_at and column-level SELECT grants untouched)
CREATE TABLE IF NOT EXISTS public.note_stats (
  note_id uuid PRIMARY KEY REFERENCES public.notes(id) ON DELETE CASCADE,
  view_count integer NOT NULL DEFAULT 0 CHECK (view_count >= 0),
  download_count integer NOT NULL DEFAULT 0 CHECK (download_count >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.note_stats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Note stats viewable by authenticated" ON public.note_stats;
CREATE POLICY "Note stats viewable by authenticated"
ON public.note_stats
FOR SELECT
TO authenticated
USING (true);

REVOKE ALL ON public.note_stats FROM PUBLIC, anon;
GRANT SELECT ON public.note_stats TO authenticated;
GRANT ALL ON public.note_stats TO service_role;

-- 2. Backfill historical counts from note_views and note_downloads for all existing notes
INSERT INTO public.note_stats (note_id, view_count, download_count, updated_at)
SELECT
  n.id,
  COALESCE(v.cnt, 0)::integer,
  COALESCE(d.cnt, 0)::integer,
  now()
FROM public.notes n
LEFT JOIN (
  SELECT note_id, COUNT(*)::integer AS cnt
  FROM public.note_views
  GROUP BY note_id
) v ON v.note_id = n.id
LEFT JOIN (
  SELECT note_id, COUNT(*)::integer AS cnt
  FROM public.note_downloads
  GROUP BY note_id
) d ON d.note_id = n.id
ON CONFLICT (note_id) DO UPDATE
SET
  view_count = GREATEST(public.note_stats.view_count, EXCLUDED.view_count),
  download_count = GREATEST(public.note_stats.download_count, EXCLUDED.download_count),
  updated_at = now();

-- 3. Auto-initialize note_stats when a new note is uploaded
CREATE OR REPLACE FUNCTION public.init_note_stats_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.note_stats (note_id, view_count, download_count, updated_at)
  VALUES (NEW.id, 0, 0, now())
  ON CONFLICT (note_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_init_note_stats ON public.notes;
CREATE TRIGGER trg_init_note_stats
AFTER INSERT ON public.notes
FOR EACH ROW
EXECUTE FUNCTION public.init_note_stats_row();

-- 4. Keep note_stats synchronized when unique view/download rows are inserted
CREATE OR REPLACE FUNCTION public.sync_note_view_stats()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_raw_views integer;
  v_raw_downloads integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.notes WHERE id = NEW.note_id) THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*)::integer INTO v_raw_views
  FROM public.note_views
  WHERE note_id = NEW.note_id;

  SELECT COUNT(*)::integer INTO v_raw_downloads
  FROM public.note_downloads
  WHERE note_id = NEW.note_id;

  INSERT INTO public.note_stats (note_id, view_count, download_count, updated_at)
  VALUES (NEW.note_id, GREATEST(1, v_raw_views), v_raw_downloads, now())
  ON CONFLICT (note_id) DO UPDATE
  SET
    view_count = GREATEST(public.note_stats.view_count + 1, v_raw_views),
    download_count = GREATEST(public.note_stats.download_count, v_raw_downloads),
    updated_at = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_note_view_stats ON public.note_views;
CREATE TRIGGER trg_sync_note_view_stats
AFTER INSERT ON public.note_views
FOR EACH ROW
EXECUTE FUNCTION public.sync_note_view_stats();

CREATE OR REPLACE FUNCTION public.sync_note_download_stats()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_raw_views integer;
  v_raw_downloads integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.notes WHERE id = NEW.note_id) THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*)::integer INTO v_raw_views
  FROM public.note_views
  WHERE note_id = NEW.note_id;

  SELECT COUNT(*)::integer INTO v_raw_downloads
  FROM public.note_downloads
  WHERE note_id = NEW.note_id;

  INSERT INTO public.note_stats (note_id, view_count, download_count, updated_at)
  VALUES (NEW.note_id, v_raw_views, GREATEST(1, v_raw_downloads), now())
  ON CONFLICT (note_id) DO UPDATE
  SET
    view_count = GREATEST(public.note_stats.view_count, v_raw_views),
    download_count = GREATEST(public.note_stats.download_count + 1, v_raw_downloads),
    updated_at = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_note_download_stats ON public.note_downloads;
CREATE TRIGGER trg_sync_note_download_stats
AFTER INSERT ON public.note_downloads
FOR EACH ROW
EXECUTE FUNCTION public.sync_note_download_stats();

-- 5. Privacy-preserving RPC to fetch total view & download counts for all visible notes
CREATE OR REPLACE FUNCTION public.get_note_engagement_counts(_note_ids uuid[] DEFAULT NULL)
RETURNS TABLE (
  note_id uuid,
  view_count integer,
  download_count integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH target_notes AS (
    SELECT n.id
    FROM public.notes n
    WHERE auth.uid() IS NOT NULL
      AND (_note_ids IS NULL OR cardinality(_note_ids) = 0 OR n.id = ANY(_note_ids))
      AND (
        public.is_admin(auth.uid())
        OR n.status = 'approved'
        OR n.user_id = auth.uid()
      )
  ),
  view_agg AS (
    SELECT nv.note_id, COUNT(*)::integer AS cnt
    FROM public.note_views nv
    JOIN target_notes tn ON tn.id = nv.note_id
    GROUP BY nv.note_id
  ),
  download_agg AS (
    SELECT nd.note_id, COUNT(*)::integer AS cnt
    FROM public.note_downloads nd
    JOIN target_notes tn ON tn.id = nd.note_id
    GROUP BY nd.note_id
  )
  SELECT
    tn.id AS note_id,
    GREATEST(COALESCE(ns.view_count, 0), COALESCE(va.cnt, 0))::integer AS view_count,
    GREATEST(COALESCE(ns.download_count, 0), COALESCE(da.cnt, 0))::integer AS download_count
  FROM target_notes tn
  LEFT JOIN public.note_stats ns ON ns.note_id = tn.id
  LEFT JOIN view_agg va ON va.note_id = tn.id
  LEFT JOIN download_agg da ON da.note_id = tn.id;
$$;

-- 6. RPCs to record every view and download while preserving per-user unique download quota
CREATE OR REPLACE FUNCTION public.record_note_view(_note_id uuid)
RETURNS TABLE (
  view_count integer,
  download_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_allowed boolean := false;
  v_raw_views integer := 0;
  v_raw_downloads integer := 0;
  v_views integer := 0;
  v_downloads integer := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Oturum bulunamadı.';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.notes n
    WHERE n.id = _note_id
      AND (public.is_admin(v_uid) OR n.status = 'approved' OR n.user_id = v_uid)
  ) INTO v_allowed;

  IF NOT v_allowed THEN
    RETURN QUERY SELECT 0, 0;
    RETURN;
  END IF;

  INSERT INTO public.note_views (note_id, user_id)
  VALUES (_note_id, v_uid)
  ON CONFLICT (note_id, user_id) DO NOTHING;

  -- If this user had already viewed the note before, trigger did not fire: increment total views by 1
  IF NOT FOUND THEN
    SELECT COUNT(*)::integer INTO v_raw_views FROM public.note_views WHERE note_id = _note_id;
    SELECT COUNT(*)::integer INTO v_raw_downloads FROM public.note_downloads WHERE note_id = _note_id;

    INSERT INTO public.note_stats (note_id, view_count, download_count, updated_at)
    VALUES (_note_id, GREATEST(1, v_raw_views), v_raw_downloads, now())
    ON CONFLICT (note_id) DO UPDATE
    SET
      view_count = GREATEST(public.note_stats.view_count + 1, v_raw_views),
      download_count = GREATEST(public.note_stats.download_count, v_raw_downloads),
      updated_at = now();
  END IF;

  SELECT COUNT(*)::integer INTO v_raw_views FROM public.note_views WHERE note_id = _note_id;
  SELECT COUNT(*)::integer INTO v_raw_downloads FROM public.note_downloads WHERE note_id = _note_id;

  SELECT
    GREATEST(COALESCE(ns.view_count, 0), v_raw_views),
    GREATEST(COALESCE(ns.download_count, 0), v_raw_downloads)
  INTO v_views, v_downloads
  FROM public.note_stats ns
  WHERE ns.note_id = _note_id;

  RETURN QUERY SELECT COALESCE(v_views, v_raw_views), COALESCE(v_downloads, v_raw_downloads);
END;
$$;

CREATE OR REPLACE FUNCTION public.record_note_download(_note_id uuid)
RETURNS TABLE (
  view_count integer,
  download_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_allowed boolean := false;
  v_raw_views integer := 0;
  v_raw_downloads integer := 0;
  v_views integer := 0;
  v_downloads integer := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Oturum bulunamadı.';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.notes n
    WHERE n.id = _note_id
      AND (public.is_admin(v_uid) OR n.status = 'approved' OR n.user_id = v_uid)
  ) INTO v_allowed;

  IF NOT v_allowed THEN
    RETURN QUERY SELECT 0, 0;
    RETURN;
  END IF;

  INSERT INTO public.note_downloads (note_id, user_id)
  VALUES (_note_id, v_uid)
  ON CONFLICT (note_id, user_id) DO NOTHING;

  -- If this user had already downloaded the note before, trigger did not fire: increment total downloads by 1
  -- (note_downloads stays unique per user so user download quota is unaffected)
  IF NOT FOUND THEN
    SELECT COUNT(*)::integer INTO v_raw_views FROM public.note_views WHERE note_id = _note_id;
    SELECT COUNT(*)::integer INTO v_raw_downloads FROM public.note_downloads WHERE note_id = _note_id;

    INSERT INTO public.note_stats (note_id, view_count, download_count, updated_at)
    VALUES (_note_id, v_raw_views, GREATEST(1, v_raw_downloads), now())
    ON CONFLICT (note_id) DO UPDATE
    SET
      view_count = GREATEST(public.note_stats.view_count, v_raw_views),
      download_count = GREATEST(public.note_stats.download_count + 1, v_raw_downloads),
      updated_at = now();
  END IF;

  SELECT COUNT(*)::integer INTO v_raw_views FROM public.note_views WHERE note_id = _note_id;
  SELECT COUNT(*)::integer INTO v_raw_downloads FROM public.note_downloads WHERE note_id = _note_id;

  SELECT
    GREATEST(COALESCE(ns.view_count, 0), v_raw_views),
    GREATEST(COALESCE(ns.download_count, 0), v_raw_downloads)
  INTO v_views, v_downloads
  FROM public.note_stats ns
  WHERE ns.note_id = _note_id;

  RETURN QUERY SELECT COALESCE(v_views, v_raw_views), COALESCE(v_downloads, v_raw_downloads);
END;
$$;

REVOKE ALL ON FUNCTION public.get_note_engagement_counts(uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.record_note_view(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.record_note_download(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_note_engagement_counts(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_note_view(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_note_download(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
