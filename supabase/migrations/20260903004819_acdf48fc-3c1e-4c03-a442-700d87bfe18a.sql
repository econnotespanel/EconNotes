-- notes tablosu Data API izinlerini geri ver (note_password hariç)
GRANT SELECT (id, user_id, title, description, grade, department, course, semester,
  file_url, file_name, file_type, uploader_name, created_at, updated_at, edited_at,
  university, status, approved_at, approved_by, rejection_reason, has_password)
  ON public.notes TO authenticated;

GRANT INSERT, UPDATE, DELETE ON public.notes TO authenticated;
GRANT ALL ON public.notes TO service_role;