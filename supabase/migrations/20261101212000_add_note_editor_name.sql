ALTER TABLE public.notes
ADD COLUMN IF NOT EXISTS edited_by_name TEXT;

UPDATE public.notes AS notes
SET edited_by_name = profiles.full_name
FROM public.profiles AS profiles
WHERE notes.edited_at IS NOT NULL
  AND notes.edited_by_name IS NULL
  AND notes.user_id = profiles.user_id;

UPDATE public.notes
SET uploader_name = 'Aylin Kesgin',
    edited_by_name = 'Kaan Çolakoğulları'
WHERE LOWER(file_name) LIKE '%araştırma yöntemleri%'
  AND LOWER(file_name) LIKE '%29.10.2026%';

UPDATE public.notes AS notes
SET edited_by_name = logs.user_name
FROM (
  SELECT DISTINCT ON (entity_id) entity_id, user_name
  FROM public.activity_logs
  WHERE entity_type = 'note'
    AND action = 'note_updated'
  ORDER BY entity_id, created_at DESC
) AS logs
WHERE notes.id = logs.entity_id::uuid
  AND notes.edited_at IS NOT NULL;
