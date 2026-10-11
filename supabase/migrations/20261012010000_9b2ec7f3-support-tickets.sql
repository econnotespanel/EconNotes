CREATE TABLE public.support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('technical', 'suggestion', 'complaint', 'account', 'other')),
  subject TEXT NOT NULL CHECK (char_length(btrim(subject)) BETWEEN 3 AND 120),
  initial_message TEXT NOT NULL CHECK (char_length(btrim(initial_message)) BETWEEN 10 AND 5000),
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'reviewing', 'answered', 'closed')),
  response_due_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '48 hours'),
  reviewing_at TIMESTAMPTZ,
  first_response_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ
);

CREATE TABLE public.support_ticket_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  author_role TEXT NOT NULL CHECK (author_role IN ('user', 'admin')),
  message TEXT NOT NULL CHECK (char_length(btrim(message)) BETWEEN 1 AND 5000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX support_tickets_user_created_idx ON public.support_tickets(user_id, created_at DESC);
CREATE INDEX support_tickets_admin_queue_idx ON public.support_tickets(status, created_at DESC);
CREATE INDEX support_tickets_unanswered_timeout_idx
  ON public.support_tickets(created_at)
  WHERE status IN ('submitted', 'reviewing') AND first_response_at IS NULL;
CREATE INDEX support_ticket_messages_ticket_created_idx ON public.support_ticket_messages(ticket_id, created_at);

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_ticket_messages ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON public.support_tickets TO authenticated;
GRANT SELECT, INSERT ON public.support_ticket_messages TO authenticated;

CREATE POLICY "Users and admins view support tickets"
ON public.support_tickets FOR SELECT TO authenticated
USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

CREATE POLICY "Users create own support tickets"
ON public.support_tickets FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id AND status = 'submitted');

CREATE POLICY "Admins update support tickets"
ON public.support_tickets FOR UPDATE TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Ticket owners and admins view support messages"
ON public.support_ticket_messages FOR SELECT TO authenticated
USING (
  public.is_admin(auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.support_tickets ticket
    WHERE ticket.id = ticket_id AND ticket.user_id = auth.uid()
  )
);

CREATE POLICY "Ticket participants add support messages"
ON public.support_ticket_messages FOR INSERT TO authenticated
WITH CHECK (
  author_id = auth.uid()
  AND (
    (
      author_role = 'admin'
      AND public.is_admin(auth.uid())
      AND EXISTS (
        SELECT 1 FROM public.support_tickets ticket
        WHERE ticket.id = ticket_id AND ticket.status <> 'closed'
      )
    )
    OR (
      author_role = 'user'
      AND NOT public.is_admin(auth.uid())
      AND EXISTS (
        SELECT 1 FROM public.support_tickets ticket
        WHERE ticket.id = ticket_id AND ticket.user_id = auth.uid() AND ticket.status <> 'closed'
      )
    )
  )
);

CREATE OR REPLACE FUNCTION public.prepare_support_ticket()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.user_id := auth.uid();
  NEW.status := 'submitted';
  NEW.created_at := now();
  NEW.updated_at := now();
  NEW.response_due_at := now() + INTERVAL '48 hours';
  NEW.reviewing_at := NULL;
  NEW.first_response_at := NULL;
  NEW.closed_at := NULL;
  RETURN NEW;
END;
$$;

CREATE TRIGGER support_tickets_prepare_insert
BEFORE INSERT ON public.support_tickets
FOR EACH ROW EXECUTE FUNCTION public.prepare_support_ticket();

CREATE OR REPLACE FUNCTION public.prepare_support_ticket_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.author_id := auth.uid();
  NEW.created_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER support_ticket_messages_prepare_insert
BEFORE INSERT ON public.support_ticket_messages
FOR EACH ROW EXECUTE FUNCTION public.prepare_support_ticket_message();

CREATE OR REPLACE FUNCTION public.set_support_ticket_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  IF NEW.status = 'reviewing' AND OLD.status <> 'reviewing' THEN
    NEW.reviewing_at := COALESCE(NEW.reviewing_at, now());
  ELSIF NEW.status = 'answered' AND OLD.status = 'submitted' THEN
    NEW.reviewing_at := COALESCE(NEW.reviewing_at, now());
  END IF;
  IF NEW.status = 'closed' AND OLD.status <> 'closed' THEN
    NEW.closed_at := now();
  ELSIF NEW.status <> 'closed' THEN
    NEW.closed_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER support_tickets_updated_at
BEFORE UPDATE ON public.support_tickets
FOR EACH ROW EXECUTE FUNCTION public.set_support_ticket_updated_at();

CREATE OR REPLACE FUNCTION public.update_support_ticket_on_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.author_role = 'admin' THEN
    UPDATE public.support_tickets
    SET status = 'answered',
        first_response_at = COALESCE(first_response_at, NEW.created_at)
    WHERE id = NEW.ticket_id AND status <> 'closed';
  ELSE
    UPDATE public.support_tickets
    SET status = CASE WHEN status = 'answered' THEN 'reviewing' ELSE status END
    WHERE id = NEW.ticket_id AND status <> 'closed';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER support_ticket_message_updates_ticket
AFTER INSERT ON public.support_ticket_messages
FOR EACH ROW EXECUTE FUNCTION public.update_support_ticket_on_message();

CREATE OR REPLACE FUNCTION public.close_unanswered_support_tickets()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  closed_count INTEGER;
BEGIN
  UPDATE public.support_tickets
  SET status = 'closed'
  WHERE status IN ('submitted', 'reviewing')
    AND first_response_at IS NULL
    AND created_at <= now() - INTERVAL '7 days';

  GET DIAGNOSTICS closed_count = ROW_COUNT;
  RETURN closed_count;
END;
$$;

REVOKE ALL ON FUNCTION public.close_unanswered_support_tickets() FROM PUBLIC, anon, authenticated;

CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  PERFORM cron.unschedule(jobid)
  FROM cron.job
  WHERE jobname = 'close-unanswered-support-tickets';

  PERFORM cron.schedule(
    'close-unanswered-support-tickets',
    '0 * * * *',
    'SELECT public.close_unanswered_support_tickets();'
  );
END;
$$;
