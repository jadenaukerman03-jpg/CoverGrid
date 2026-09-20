CREATE TABLE public.notification_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL DEFAULT 'role',
  role public.app_role,
  employee_id uuid REFERENCES public.employees(id) ON DELETE CASCADE,
  category text NOT NULL,
  in_app boolean NOT NULL DEFAULT true,
  sms boolean NOT NULL DEFAULT true,
  updated_by text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX notification_rules_role_key ON public.notification_rules (role, category) WHERE scope = 'role';
CREATE UNIQUE INDEX notification_rules_employee_key ON public.notification_rules (employee_id, category) WHERE scope = 'employee';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_rules TO authenticated;
GRANT ALL ON public.notification_rules TO service_role;
ALTER TABLE public.notification_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers manage all notification rules" ON public.notification_rules
  FOR ALL TO authenticated
  USING (public.is_manager(auth.uid()))
  WITH CHECK (public.is_manager(auth.uid()));

CREATE POLICY "People read their own notification rules" ON public.notification_rules
  FOR SELECT TO authenticated
  USING (scope = 'role' OR employee_id = public.current_employee_id());

CREATE POLICY "People change their own notification rules" ON public.notification_rules
  FOR UPDATE TO authenticated
  USING (scope = 'employee' AND employee_id = public.current_employee_id())
  WITH CHECK (scope = 'employee' AND employee_id = public.current_employee_id());

CREATE POLICY "People create their own notification rules" ON public.notification_rules
  FOR INSERT TO authenticated
  WITH CHECK (scope = 'employee' AND employee_id = public.current_employee_id());

CREATE TRIGGER trg_notification_rules_updated
  BEFORE UPDATE ON public.notification_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.notification_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid REFERENCES public.message_outbox(id) ON DELETE CASCADE,
  employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  attempt_no integer NOT NULL DEFAULT 1,
  channel text NOT NULL DEFAULT 'sms',
  status text NOT NULL DEFAULT 'queued',
  error text NOT NULL DEFAULT '',
  to_address text NOT NULL DEFAULT '',
  actor text NOT NULL DEFAULT 'system',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX notification_attempts_message_idx ON public.notification_attempts (message_id, created_at DESC);

GRANT SELECT, INSERT ON public.notification_attempts TO authenticated;
GRANT ALL ON public.notification_attempts TO service_role;
ALTER TABLE public.notification_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers read all delivery attempts" ON public.notification_attempts
  FOR SELECT TO authenticated
  USING (public.is_manager(auth.uid()) OR employee_id = public.current_employee_id());

CREATE POLICY "Managers log delivery attempts" ON public.notification_attempts
  FOR INSERT TO authenticated
  WITH CHECK (public.is_manager(auth.uid()));

INSERT INTO public.notification_rules (scope, role, category, in_app, sms, updated_by)
VALUES
  ('role', 'employee', 'onboarding', true, true, 'system default'),
  ('role', 'employee', 'schedule', true, true, 'system default'),
  ('role', 'employee', 'reminders', true, true, 'system default'),
  ('role', 'employee', 'delivery_failures', false, false, 'system default'),
  ('role', 'manager', 'onboarding', true, true, 'system default'),
  ('role', 'manager', 'schedule', true, false, 'system default'),
  ('role', 'manager', 'reminders', true, true, 'system default'),
  ('role', 'manager', 'delivery_failures', true, false, 'system default'),
  ('role', 'admin', 'onboarding', true, false, 'system default'),
  ('role', 'admin', 'schedule', true, false, 'system default'),
  ('role', 'admin', 'reminders', true, false, 'system default'),
  ('role', 'admin', 'delivery_failures', true, false, 'system default');