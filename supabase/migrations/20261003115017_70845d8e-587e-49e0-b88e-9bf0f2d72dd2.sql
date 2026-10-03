DROP POLICY IF EXISTS "Announcement views viewable by authenticated" ON public.announcement_views;
CREATE POLICY "Users and admins view announcement history"
ON public.announcement_views
FOR SELECT
TO authenticated
USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Note views viewable by authenticated" ON public.note_views;
CREATE POLICY "Users and admins view note history"
ON public.note_views
FOR SELECT
TO authenticated
USING (auth.uid() = user_id OR public.is_admin(auth.uid()));