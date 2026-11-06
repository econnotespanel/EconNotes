DROP POLICY IF EXISTS "Notes files authenticated scoped read" ON storage.objects;
CREATE POLICY "Notes files authenticated scoped read" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'notes' AND (
    public.is_admin(auth.uid())
    OR (storage.foldername(name))[1] = (auth.uid())::text
    OR ((storage.foldername(name))[1] = ANY (ARRAY['messages','study-reports']) AND (storage.foldername(name))[2] = (auth.uid())::text)
    OR ((storage.foldername(name))[1] = 'messages' AND EXISTS (
      SELECT 1 FROM public.messages m
      WHERE m.receiver_id = auth.uid()
        AND m.sender_id::text = (storage.foldername(objects.name))[2]
        AND position(objects.name in m.content) > 0))
    OR (storage.foldername(name))[1] = 'announcements'
    OR EXISTS (
      SELECT 1 FROM public.notes n
      WHERE n.status = 'approved'
        AND (n.visibility_status = 'visible'
             OR (n.visibility_status = 'temporary' AND n.hidden_until IS NOT NULL AND n.hidden_until <= now()))
        AND (n.file_url = objects.name OR n.file_url LIKE '%/' || objects.name))
  )
);