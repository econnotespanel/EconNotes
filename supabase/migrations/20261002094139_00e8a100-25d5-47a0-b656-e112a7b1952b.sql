DROP FUNCTION public.search_member_profiles();
DROP FUNCTION public.get_public_system_status();
CREATE TABLE public.member_directory (user_id uuid PRIMARY KEY, full_name text NOT NULL, university text NOT NULL, department text NOT NULL, grade integer, avatar_url text, hide_surname boolean NOT NULL);
GRANT SELECT ON public.member_directory TO authenticated;
GRANT ALL ON public.member_directory TO service_role;
ALTER TABLE public.member_directory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can browse directory" ON public.member_directory FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE TABLE public.public_system_status (id uuid PRIMARY KEY, is_system_open boolean NOT NULL, closed_until timestamptz, note_upload_restricted boolean NOT NULL, academic_week integer, academic_week_label text, academic_semester text, note_view_restricted boolean NOT NULL, closure_title text, closure_message text, closure_image_url text, closure_mode text NOT NULL);
GRANT SELECT ON public.public_system_status TO authenticated;
GRANT ALL ON public.public_system_status TO service_role;
ALTER TABLE public.public_system_status ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can read system status" ON public.public_system_status FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE FUNCTION public.sync_member_directory() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 IF TG_OP = 'DELETE' THEN DELETE FROM public.member_directory WHERE user_id = OLD.user_id; RETURN OLD; END IF;
 IF NEW.approval_status = 'approved' THEN
  INSERT INTO public.member_directory(user_id, full_name, university, department, grade, avatar_url, hide_surname)
  VALUES(NEW.user_id, public.mask_display_name(NEW.full_name, NEW.hide_surname), NEW.university, NEW.department, NEW.grade, NEW.avatar_url, NEW.hide_surname)
  ON CONFLICT(user_id) DO UPDATE SET full_name=EXCLUDED.full_name, university=EXCLUDED.university, department=EXCLUDED.department, grade=EXCLUDED.grade, avatar_url=EXCLUDED.avatar_url, hide_surname=EXCLUDED.hide_surname;
 ELSE DELETE FROM public.member_directory WHERE user_id = NEW.user_id; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.sync_member_directory() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER sync_member_directory_after_change AFTER INSERT OR UPDATE OR DELETE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.sync_member_directory();
CREATE FUNCTION public.sync_public_system_status() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 IF TG_OP = 'DELETE' THEN DELETE FROM public.public_system_status WHERE id=OLD.id; RETURN OLD; END IF;
 INSERT INTO public.public_system_status(id, is_system_open, closed_until, note_upload_restricted, academic_week, academic_week_label, academic_semester, note_view_restricted, closure_title, closure_message, closure_image_url, closure_mode)
 VALUES(NEW.id, NEW.is_system_open, NEW.closed_until, NEW.note_upload_restricted, NEW.academic_week, NEW.academic_week_label, NEW.academic_semester, NEW.note_view_restricted, NEW.closure_title, NEW.closure_message, NEW.closure_image_url, NEW.closure_mode)
 ON CONFLICT(id) DO UPDATE SET is_system_open=EXCLUDED.is_system_open, closed_until=EXCLUDED.closed_until, note_upload_restricted=EXCLUDED.note_upload_restricted, academic_week=EXCLUDED.academic_week, academic_week_label=EXCLUDED.academic_week_label, academic_semester=EXCLUDED.academic_semester, note_view_restricted=EXCLUDED.note_view_restricted, closure_title=EXCLUDED.closure_title, closure_message=EXCLUDED.closure_message, closure_image_url=EXCLUDED.closure_image_url, closure_mode=EXCLUDED.closure_mode;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.sync_public_system_status() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER sync_public_system_status_after_change AFTER INSERT OR UPDATE OR DELETE ON public.system_settings FOR EACH ROW EXECUTE FUNCTION public.sync_public_system_status();