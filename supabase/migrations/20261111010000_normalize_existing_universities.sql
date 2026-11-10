-- Migration: 20261111010000_normalize_existing_universities.sql
-- Description: Unifies duplicate university folders (e.g. 'düzce', 'düzce üniversitesi', 'Düzce üniversitesi' -> 'Düzce Üniversitesi')
-- and auto-canonicalizes university names on insert/update in notes and profiles.

-- 1. Canonicalizer function
CREATE OR REPLACE FUNCTION public.normalize_university_name(raw_name text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  trimmed text;
  lower_name text;
BEGIN
  IF raw_name IS NULL OR TRIM(raw_name) = '' THEN
    RETURN 'Üniversite bilgisi yok';
  END IF;

  trimmed := regexp_replace(TRIM(raw_name), '\s+', ' ', 'g');
  lower_name := lower(trimmed);

  -- Heuristics for common Turkish universities to merge duplicates
  IF lower_name LIKE '%düzce%' OR lower_name LIKE '%duzce%' THEN
    RETURN 'Düzce Üniversitesi';
  ELSIF lower_name LIKE '%boğaziçi%' OR lower_name LIKE '%bogazici%' THEN
    RETURN 'Boğaziçi Üniversitesi';
  ELSIF lower_name = 'odtü' OR lower_name = 'odtu' OR lower_name LIKE '%orta doğu teknik%' OR lower_name LIKE '%orta dogu teknik%' THEN
    RETURN 'Orta Doğu Teknik Üniversitesi';
  ELSIF lower_name = 'itü' OR lower_name = 'itu' OR lower_name LIKE '%istanbul teknik%' THEN
    RETURN 'İstanbul Teknik Üniversitesi';
  ELSIF lower_name = 'ytü' OR lower_name = 'ytu' OR lower_name LIKE '%yıldız teknik%' OR lower_name LIKE '%yildiz teknik%' THEN
    RETURN 'Yıldız Teknik Üniversitesi';
  ELSIF lower_name LIKE '%marmara%' THEN
    RETURN 'Marmara Üniversitesi';
  ELSIF lower_name LIKE '%hacettepe%' THEN
    RETURN 'Hacettepe Üniversitesi';
  ELSIF lower_name LIKE '%gazi%' THEN
    RETURN 'Gazi Üniversitesi';
  ELSIF lower_name LIKE '%dokuz eylül%' OR lower_name LIKE '%dokuz eylul%' OR lower_name = 'deü' OR lower_name = 'deu' THEN
    RETURN 'Dokuz Eylül Üniversitesi';
  ELSIF lower_name LIKE '%ege%' THEN
    RETURN 'Ege Üniversitesi';
  ELSIF lower_name LIKE '%anadolu%' THEN
    RETURN 'Anadolu Üniversitesi';
  ELSIF lower_name LIKE '%sakarya%' THEN
    RETURN 'Sakarya Üniversitesi';
  ELSIF lower_name LIKE '%kocaeli%' THEN
    RETURN 'Kocaeli Üniversitesi';
  ELSIF lower_name LIKE '%abant%' OR lower_name LIKE '%izzet baysal%' THEN
    RETURN 'Bolu Abant İzzet Baysal Üniversitesi';
  ELSIF lower_name LIKE '%karadeniz teknik%' OR lower_name = 'ktü' OR lower_name = 'ktu' THEN
    RETURN 'Karadeniz Teknik Üniversitesi';
  ELSIF lower_name = 'ankara' OR lower_name LIKE '%ankara üni%' OR lower_name LIKE '%ankara üniversitesi%' THEN
    RETURN 'Ankara Üniversitesi';
  ELSIF lower_name = 'istanbul' OR lower_name LIKE '%istanbul üni%' OR lower_name LIKE '%istanbul üniversitesi%' THEN
    RETURN 'İstanbul Üniversitesi';
  END IF;

  RETURN trimmed;
END;
$$;

-- 2. Update existing notes table data
UPDATE public.notes
SET university = public.normalize_university_name(university)
WHERE university IS NOT NULL AND TRIM(university) <> '';

-- 3. Update existing profiles table data
UPDATE public.profiles
SET university = public.normalize_university_name(university)
WHERE university IS NOT NULL AND TRIM(university) <> '';

-- 4. Triggers to enforce canonical university names going forward
CREATE OR REPLACE FUNCTION public.trg_canonicalize_note_university()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.university IS NOT NULL AND TRIM(NEW.university) <> '' THEN
    NEW.university := public.normalize_university_name(NEW.university);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_canonicalize_note_university_trigger ON public.notes;
CREATE TRIGGER trg_canonicalize_note_university_trigger
BEFORE INSERT OR UPDATE OF university ON public.notes
FOR EACH ROW
EXECUTE FUNCTION public.trg_canonicalize_note_university();

CREATE OR REPLACE FUNCTION public.trg_canonicalize_profile_university()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.university IS NOT NULL AND TRIM(NEW.university) <> '' THEN
    NEW.university := public.normalize_university_name(NEW.university);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_canonicalize_profile_university_trigger ON public.profiles;
CREATE TRIGGER trg_canonicalize_profile_university_trigger
BEFORE INSERT OR UPDATE OF university ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.trg_canonicalize_profile_university();
