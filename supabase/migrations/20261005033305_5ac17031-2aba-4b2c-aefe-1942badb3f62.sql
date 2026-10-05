GRANT SELECT ON public.public_system_status TO anon;
DROP POLICY IF EXISTS "Members can read system status" ON public.public_system_status;
CREATE POLICY "Anyone can read system status" ON public.public_system_status FOR SELECT TO anon, authenticated USING (true);
INSERT INTO public.public_system_status(id, is_system_open, closed_until, note_upload_restricted, academic_week, academic_week_label, academic_semester, note_view_restricted, closure_title, closure_message, closure_image_url, closure_mode)
SELECT id, is_system_open, closed_until, note_upload_restricted, academic_week, academic_week_label, academic_semester, note_view_restricted, closure_title, closure_message, closure_image_url, closure_mode FROM public.system_settings
ON CONFLICT (id) DO UPDATE SET is_system_open=EXCLUDED.is_system_open, closure_mode=EXCLUDED.closure_mode, closed_until=EXCLUDED.closed_until;