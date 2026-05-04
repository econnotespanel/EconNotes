UPDATE public.system_settings
SET is_system_open = true,
    closed_until = NULL,
    updated_at = now();