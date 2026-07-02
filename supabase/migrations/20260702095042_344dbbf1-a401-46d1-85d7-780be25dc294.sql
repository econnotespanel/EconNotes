-- Grade 5 = Mezun
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_grade_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_grade_check CHECK (grade >= 1 AND grade <= 5);

-- Yaz Dönemi kapanış ayarları
ALTER TABLE public.system_settings
  ADD COLUMN IF NOT EXISTS closure_title text,
  ADD COLUMN IF NOT EXISTS closure_message text,
  ADD COLUMN IF NOT EXISTS closure_image_url text,
  ADD COLUMN IF NOT EXISTS closure_mode text NOT NULL DEFAULT 'maintenance';

-- Sınıf atlatma fonksiyonu (1 Ağustos'ta admin tetikler)
CREATE OR REPLACE FUNCTION public.promote_students_annual()
RETURNS TABLE(promoted_total int, graduated_total int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_grad int := 0;
  v_prom int := 0;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Sadece yöneticiler bu işlemi yapabilir.';
  END IF;

  UPDATE public.profiles SET grade = 5, updated_at = now() WHERE grade = 4;
  GET DIAGNOSTICS v_grad = ROW_COUNT;

  UPDATE public.profiles SET grade = 4, updated_at = now() WHERE grade = 3;
  UPDATE public.profiles SET grade = 3, updated_at = now() WHERE grade = 2;
  UPDATE public.profiles SET grade = 2, updated_at = now() WHERE grade = 1;

  SELECT count(*)::int INTO v_prom FROM public.profiles WHERE grade BETWEEN 2 AND 4;

  RETURN QUERY SELECT v_prom, v_grad;
END;
$$;

GRANT EXECUTE ON FUNCTION public.promote_students_annual() TO authenticated;