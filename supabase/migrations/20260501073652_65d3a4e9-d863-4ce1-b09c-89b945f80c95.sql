
ALTER TABLE public.notes
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by uuid,
  ADD COLUMN IF NOT EXISTS rejection_reason text;

UPDATE public.notes SET status = 'approved', approved_at = COALESCE(approved_at, now()) WHERE status = 'pending';

DROP POLICY IF EXISTS "Notes viewable by authenticated" ON public.notes;
CREATE POLICY "Notes viewable by authenticated"
ON public.notes
FOR SELECT
TO authenticated
USING (
  status = 'approved'
  OR auth.uid() = user_id
  OR is_admin(auth.uid())
);
