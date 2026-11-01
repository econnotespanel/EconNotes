ALTER TABLE public.notes
ADD COLUMN IF NOT EXISTS edited_by_name TEXT;

UPDATE public.notes AS notes
SET edited_by_name = profiles.full_name
FROM public.profiles AS profiles
WHERE notes.edited_at IS NOT NULL
  AND notes.edited_by_name IS NULL
  AND notes.user_id = profiles.user_id;
