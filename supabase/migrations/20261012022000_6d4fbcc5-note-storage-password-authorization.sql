UPDATE storage.buckets
SET public = false
WHERE id = 'notes';

CREATE TABLE IF NOT EXISTS public.note_password_unlocks (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  note_id UUID NOT NULL REFERENCES public.notes(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (user_id, note_id)
);

ALTER TABLE public.note_password_unlocks ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.note_password_unlocks FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.note_password_unlocks TO authenticated;

CREATE POLICY "Users can read own note unlocks"
ON public.note_password_unlocks
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Notes files publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Notes files authenticated scoped read" ON storage.objects;

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
      WHERE note.file_url LIKE '%' || storage.objects.name
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

CREATE OR REPLACE FUNCTION public.verify_note_password(_note_id UUID, _password TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_pw TEXT;
  v_visible BOOLEAN;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Oturum bulunamadı.';
  END IF;

  SELECT note.note_password,
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
