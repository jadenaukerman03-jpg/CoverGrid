-- Employee contact / payroll / punch fields
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS sms_optin boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS payroll_id text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS clock_in_number text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS punch_pin text NOT NULL DEFAULT '';

-- Outbound message queue (SMS / voice / email)
CREATE TABLE IF NOT EXISTS public.message_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  channel text NOT NULL DEFAULT 'sms',
  to_address text NOT NULL,
  body text NOT NULL,
  kind text NOT NULL DEFAULT 'general',
  status text NOT NULL DEFAULT 'queued',
  attempts integer NOT NULL DEFAULT 0,
  provider_id text NOT NULL DEFAULT '',
  error text NOT NULL DEFAULT '',
  scheduled_for timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.message_outbox TO authenticated;
GRANT ALL ON public.message_outbox TO service_role;
ALTER TABLE public.message_outbox ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Managers read outbox" ON public.message_outbox FOR SELECT TO authenticated
  USING (public.is_manager(auth.uid()));
CREATE TRIGGER update_message_outbox_updated_at BEFORE UPDATE ON public.message_outbox
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX IF NOT EXISTS message_outbox_status_idx ON public.message_outbox (status, scheduled_for);

-- Registered time clocks / kiosks
CREATE TABLE IF NOT EXISTS public.punch_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  unit_id uuid REFERENCES public.units(id) ON DELETE SET NULL,
  device_key text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  last_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.punch_devices TO authenticated;
GRANT ALL ON public.punch_devices TO service_role;
ALTER TABLE public.punch_devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Managers read clocks" ON public.punch_devices FOR SELECT TO authenticated
  USING (public.is_manager(auth.uid()));
CREATE TRIGGER update_punch_devices_updated_at BEFORE UPDATE ON public.punch_devices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.time_punches ADD COLUMN IF NOT EXISTS device_id uuid REFERENCES public.punch_devices(id) ON DELETE SET NULL;

-- Compliance paperwork checklist
CREATE TABLE IF NOT EXISTS public.compliance_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL DEFAULT 'privacy',
  title text NOT NULL,
  detail text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'not_started',
  owner text NOT NULL DEFAULT '',
  evidence_url text NOT NULL DEFAULT '',
  reviewed_on date,
  next_review_on date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.compliance_items TO authenticated;
GRANT ALL ON public.compliance_items TO service_role;
ALTER TABLE public.compliance_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Managers read compliance items" ON public.compliance_items FOR SELECT TO authenticated
  USING (public.is_manager(auth.uid()));
CREATE POLICY "Managers manage compliance items" ON public.compliance_items FOR ALL TO authenticated
  USING (public.is_manager(auth.uid())) WITH CHECK (public.is_manager(auth.uid()));
CREATE TRIGGER update_compliance_items_updated_at BEFORE UPDATE ON public.compliance_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Messaging + retention settings
ALTER TABLE public.automation_settings
  ADD COLUMN IF NOT EXISTS sms_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS quiet_hours_start integer NOT NULL DEFAULT 21,
  ADD COLUMN IF NOT EXISTS quiet_hours_end integer NOT NULL DEFAULT 6,
  ADD COLUMN IF NOT EXISTS data_retention_days integer NOT NULL DEFAULT 2555;

-- Seed the compliance checklist
INSERT INTO public.compliance_items (category, title, detail, status)
SELECT * FROM (VALUES
  ('privacy', 'HIPAA Business Associate Agreement', 'Signed BAA in place with the facility covering scheduling, punch and demographic data.', 'not_started'),
  ('privacy', 'Notice of Privacy Practices alignment', 'Confirm the facility NPP covers workforce scheduling data handled by this system.', 'not_started'),
  ('privacy', 'Minimum necessary review', 'Manager, employee and agency roles reviewed so each sees only what the job requires.', 'in_progress'),
  ('security', 'Access control review', 'Quarterly review of who holds manager and administrator access.', 'in_progress'),
  ('security', 'Encryption in transit and at rest', 'All traffic over TLS; database encrypted at rest by the hosting provider.', 'complete'),
  ('security', 'Audit logging', 'Every automated and manual schedule change is written to the activity log with an undo trail.', 'complete'),
  ('security', 'Incident response plan', 'Written plan naming who is called, in what order, within 24 hours of a suspected breach.', 'not_started'),
  ('security', 'SOC 2 Type II readiness', 'Evidence collection and auditor engagement for a Type II report.', 'not_started'),
  ('data', 'Data retention schedule', 'Scheduling, punch and attendance records retained per state and CMS requirements.', 'in_progress'),
  ('data', 'Offboarding and data return', 'Documented export and deletion process when a facility leaves.', 'not_started'),
  ('workforce', 'CMS PBJ submission readiness', 'Quarterly PBJ file produced from punches and reviewed before submission.', 'complete'),
  ('workforce', 'State staffing minimum evidence', 'Daily HPPD evidence retained and printable for survey.', 'complete')
) AS v(category, title, detail, status)
WHERE NOT EXISTS (SELECT 1 FROM public.compliance_items);