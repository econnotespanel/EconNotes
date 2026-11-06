CREATE TABLE public.sms_2fa (
  user_id uuid PRIMARY KEY,
  phone text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, DELETE ON public.sms_2fa TO authenticated;
GRANT ALL ON public.sms_2fa TO service_role;
ALTER TABLE public.sms_2fa ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own sms 2fa read" ON public.sms_2fa FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Own sms 2fa delete" ON public.sms_2fa FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE TABLE public.sms_2fa_sessions (
  session_id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  verified_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.sms_2fa_sessions TO authenticated;
GRANT ALL ON public.sms_2fa_sessions TO service_role;
ALTER TABLE public.sms_2fa_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own sms sessions read" ON public.sms_2fa_sessions FOR SELECT TO authenticated USING (user_id = auth.uid());