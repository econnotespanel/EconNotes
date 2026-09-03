DROP POLICY IF EXISTS "Notes files publicly accessible" ON storage.objects;

CREATE POLICY "Notes files authenticated scoped read"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'notes' AND (
    public.is_admin(auth.uid())
    OR (storage.foldername(name))[1] = (auth.uid())::text
    OR (storage.foldername(name))[1] = ANY (ARRAY['messages','study-reports','announcements'])
    OR EXISTS (
      SELECT 1 FROM public.notes n
      WHERE n.status = 'approved' AND n.file_url LIKE '%' || storage.objects.name
    )
  )
);

DROP POLICY IF EXISTS "Notes delete scoped to owner or admin" ON storage.objects;

CREATE POLICY "Notes delete scoped to owner or admin"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'notes' AND (
    public.is_admin(auth.uid())
    OR (
      (
        (storage.foldername(name))[1] = (auth.uid())::text
        OR (
          (storage.foldername(name))[1] = ANY (ARRAY['messages','study-reports'])
          AND (storage.foldername(name))[2] = (auth.uid())::text
        )
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.notes n
        WHERE n.file_url LIKE '%' || storage.objects.name
          AND n.user_id <> auth.uid()
      )
    )
  )
);

DROP POLICY IF EXISTS "Notes upload scoped to owner" ON storage.objects;

CREATE POLICY "Notes upload scoped to owner"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'notes' AND (
    (storage.foldername(name))[1] = (auth.uid())::text
    OR (
      (storage.foldername(name))[1] = ANY (ARRAY['messages','study-reports'])
      AND (storage.foldername(name))[2] = (auth.uid())::text
    )
    OR ((storage.foldername(name))[1] = 'announcements' AND public.is_admin(auth.uid()))
  )
);