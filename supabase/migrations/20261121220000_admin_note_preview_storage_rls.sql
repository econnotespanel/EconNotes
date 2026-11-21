-- Migration: Admin Note Preview Storage Authorization & Authoritative Note Lookup RPC
-- Guarantees authorized administrators (public.is_admin(auth.uid())) can securely inspect
-- pending, revision_requested (including past 72h deadline), rejected, approved, and archived note files
-- WITHOUT making the private `notes` bucket public and WITHOUT relaxing non-admin RLS protections.

-- 1. Keep `notes` bucket strictly private
UPDATE storage.buckets
SET public = false
WHERE id = 'notes';

-- 2. Reinforce Storage SELECT policy on `notes` bucket so administrators always have read access
--    to any note object regardless of approval status or 72-hour revision expiration.
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
    OR (storage.foldername(name))[1] = auth.uid()::text
    OR (storage.foldername(name))[1] = ANY (ARRAY['messages', 'study-reports', 'announcements'])
    OR EXISTS (
      SELECT 1
      FROM public.notes AS note
      WHERE (
          note.file_url = storage.objects.name
          OR note.file_url LIKE '%' || storage.objects.name
        )
        AND (
          note.user_id = auth.uid()
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
            AND (
              NOT note.has_password
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

-- 3. Admin-only SECURITY DEFINER RPC to resolve authoritative note metadata + exact storage object name.
--    Never grants access to non-admin users; never blocks on 72-hour revision deadline expiration.
CREATE OR REPLACE FUNCTION public.admin_get_note_for_preview(_note_id UUID)
RETURNS TABLE (
  note_id UUID,
  user_id UUID,
  title TEXT,
  status TEXT,
  file_url TEXT,
  file_name TEXT,
  file_type TEXT,
  resolved_storage_path TEXT,
  storage_file_size BIGINT,
  storage_mime_type TEXT,
  revision_deadline TIMESTAMPTZ,
  rejection_reason TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'storage'
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_note RECORD;
  v_clean_path TEXT;
  v_obj RECORD;
BEGIN
  IF v_uid IS NULL OR NOT public.is_admin(v_uid) THEN
    RAISE EXCEPTION 'Bu işlem için yönetici yetkisi gerekir.';
  END IF;

  SELECT
    n.id,
    n.user_id,
    n.title,
    n.status,
    n.file_url,
    n.file_name,
    n.file_type,
    n.revision_deadline,
    n.rejection_reason
  INTO v_note
  FROM public.notes AS n
  WHERE n.id = _note_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not kaydı bulunamadı.';
  END IF;

  v_clean_path := NULL;
  IF v_note.file_url IS NOT NULL AND btrim(v_note.file_url) <> '' THEN
    v_clean_path := regexp_replace(btrim(v_note.file_url), '\?.*$', '');
    IF v_clean_path ~* '^https?://' THEN
      v_clean_path := regexp_replace(
        v_clean_path,
        '^https?://[^/]+/storage/v1/(?:object|render/image)/(?:(?:public|sign|authenticated)/)?notes/',
        '',
        'i'
      );
    END IF;
    v_clean_path := regexp_replace(v_clean_path, '^/+', '');
    v_clean_path := regexp_replace(v_clean_path, '^notes/+', '', 'i');
  END IF;

  -- Locate exact matching storage object in `notes` bucket (exact path or uploader-folder fallback)
  SELECT
    o.name,
    COALESCE((o.metadata->>'size')::BIGINT, NULL) AS file_size,
    NULLIF(btrim(COALESCE(o.metadata->>'mimetype', '')), '') AS mime_type
  INTO v_obj
  FROM storage.objects AS o
  WHERE o.bucket_id = 'notes'
    AND (
      (v_clean_path IS NOT NULL AND o.name = v_clean_path)
      OR (v_note.file_url IS NOT NULL AND o.name = ltrim(v_note.file_url, '/'))
      OR (
        v_clean_path IS NOT NULL
        AND position('/' IN v_clean_path) > 0
        AND lower(o.name) = lower(v_clean_path)
      )
    )
  LIMIT 1;

  RETURN QUERY
  SELECT
    v_note.id,
    v_note.user_id,
    v_note.title,
    v_note.status,
    v_note.file_url,
    v_note.file_name,
    v_note.file_type,
    COALESCE(v_obj.name, v_clean_path),
    v_obj.file_size,
    v_obj.mime_type,
    v_note.revision_deadline,
    v_note.rejection_reason;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_note_for_preview(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_note_for_preview(UUID) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
