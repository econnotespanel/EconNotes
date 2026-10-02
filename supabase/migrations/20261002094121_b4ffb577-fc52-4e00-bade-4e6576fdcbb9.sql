DROP POLICY IF EXISTS "Note downloads viewable by authenticated" ON public.note_downloads;
CREATE POLICY "Users and admins view downloads" ON public.note_downloads FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.is_admin(auth.uid()));
DROP POLICY IF EXISTS "Profiles viewable by authenticated users" ON public.profiles;
CREATE POLICY "Users and admins view profiles" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.is_admin(auth.uid()));
DROP POLICY IF EXISTS "System settings viewable by authenticated" ON public.system_settings;
CREATE POLICY "Admins view system settings" ON public.system_settings FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE OR REPLACE FUNCTION public.search_member_profiles()
RETURNS TABLE(user_id uuid, full_name text, university text, department text, grade integer, avatar_url text, hide_surname boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
 SELECT p.user_id, public.mask_display_name(p.full_name, p.hide_surname), p.university, p.department, p.grade, p.avatar_url, p.hide_surname
 FROM public.profiles p WHERE auth.uid() IS NOT NULL AND p.approval_status = 'approved'
$$;
REVOKE ALL ON FUNCTION public.search_member_profiles() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_member_profiles() TO authenticated;
CREATE OR REPLACE FUNCTION public.get_public_system_status()
RETURNS TABLE(is_system_open boolean, closed_until timestamptz, note_upload_restricted boolean, academic_week integer, academic_week_label text, academic_semester text, note_view_restricted boolean, closure_title text, closure_message text, closure_image_url text, closure_mode text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
 SELECT s.is_system_open, s.closed_until, s.note_upload_restricted, s.academic_week, s.academic_week_label, s.academic_semester, s.note_view_restricted, s.closure_title, s.closure_message, s.closure_image_url, s.closure_mode
 FROM public.system_settings s WHERE auth.uid() IS NOT NULL LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.get_public_system_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_public_system_status() TO authenticated;