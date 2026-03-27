
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
  _full_name TEXT;
  _university TEXT;
  _department TEXT;
  _grade INTEGER;
BEGIN
  _full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', '');
  _university := COALESCE(NEW.raw_user_meta_data->>'university', '');
  _department := COALESCE(NEW.raw_user_meta_data->>'department', '');
  _grade := COALESCE((NEW.raw_user_meta_data->>'grade')::INTEGER, 1);

  INSERT INTO public.profiles (user_id, full_name, university, department, grade)
  VALUES (NEW.id, _full_name, _university, _department, _grade);

  IF NEW.email IN ('kaancolakogullari1@gmail.com', 'kaancolakogullari9@gmail.com', 'econnotespanel@gmail.com') THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'student');
  END IF;

  RETURN NEW;
END;
$$;

-- Create friend_requests table
CREATE TABLE IF NOT EXISTS public.friend_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL,
  receiver_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(sender_id, receiver_id)
);

ALTER TABLE public.friend_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own friend requests" ON public.friend_requests
  FOR SELECT TO authenticated
  USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

CREATE POLICY "Users can send friend requests" ON public.friend_requests
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = sender_id);

CREATE POLICY "Users can update received requests" ON public.friend_requests
  FOR UPDATE TO authenticated
  USING (auth.uid() = receiver_id);

CREATE POLICY "Users can delete own requests" ON public.friend_requests
  FOR DELETE TO authenticated
  USING (auth.uid() = sender_id OR auth.uid() = receiver_id);
