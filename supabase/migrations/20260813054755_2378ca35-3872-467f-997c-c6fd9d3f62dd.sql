
-- units: HPPD target
ALTER TABLE public.units ADD COLUMN IF NOT EXISTS target_hppd numeric NOT NULL DEFAULT 3.6;

-- employees: payroll + employment type + retention
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS hourly_rate numeric NOT NULL DEFAULT 22;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS employment_type text NOT NULL DEFAULT 'staff';
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS termination_date date;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS reward_points integer NOT NULL DEFAULT 0;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS phone text;

-- 1. Census
CREATE TABLE IF NOT EXISTS public.census_days (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL,
  unit_id uuid NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  census integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (date, unit_id)
);
GRANT SELECT ON public.census_days TO authenticated;
GRANT ALL ON public.census_days TO service_role;
ALTER TABLE public.census_days ENABLE ROW LEVEL SECURITY;
CREATE POLICY "census readable by signed in" ON public.census_days FOR SELECT TO authenticated USING (true);
CREATE POLICY "census managed by managers" ON public.census_days FOR ALL TO authenticated
  USING (public.is_manager(auth.uid())) WITH CHECK (public.is_manager(auth.uid()));

-- 2. Time punches
CREATE TABLE IF NOT EXISTS public.time_punches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  assignment_id uuid REFERENCES public.shift_assignments(id) ON DELETE SET NULL,
  date date NOT NULL,
  clock_in timestamptz,
  clock_out timestamptz,
  minutes_worked integer NOT NULL DEFAULT 0,
  exception text,
  source text NOT NULL DEFAULT 'mobile',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.time_punches TO authenticated;
GRANT ALL ON public.time_punches TO service_role;
ALTER TABLE public.time_punches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "punches own or manager" ON public.time_punches FOR SELECT TO authenticated
  USING (employee_id = public.current_employee_id() OR public.is_manager(auth.uid()));
CREATE POLICY "punches insert own or manager" ON public.time_punches FOR INSERT TO authenticated
  WITH CHECK (employee_id = public.current_employee_id() OR public.is_manager(auth.uid()));
CREATE POLICY "punches update own or manager" ON public.time_punches FOR UPDATE TO authenticated
  USING (employee_id = public.current_employee_id() OR public.is_manager(auth.uid()))
  WITH CHECK (employee_id = public.current_employee_id() OR public.is_manager(auth.uid()));

-- 3. Schedule templates
CREATE TABLE IF NOT EXISTS public.schedule_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  unit_id uuid REFERENCES public.units(id) ON DELETE CASCADE,
  position public.position_type,
  shift public.shift_type,
  pattern jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.schedule_templates TO authenticated;
GRANT ALL ON public.schedule_templates TO service_role;
ALTER TABLE public.schedule_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "templates manager only" ON public.schedule_templates FOR ALL TO authenticated
  USING (public.is_manager(auth.uid())) WITH CHECK (public.is_manager(auth.uid()));

-- 4. Hiring
CREATE TABLE IF NOT EXISTS public.job_postings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  position public.position_type NOT NULL,
  shift public.shift_type,
  unit_id uuid REFERENCES public.units(id) ON DELETE SET NULL,
  employment_type text NOT NULL DEFAULT 'staff',
  pay_range text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'open',
  openings integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_postings TO authenticated;
GRANT ALL ON public.job_postings TO service_role;
ALTER TABLE public.job_postings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "postings readable" ON public.job_postings FOR SELECT TO authenticated USING (true);
CREATE POLICY "postings managed by managers" ON public.job_postings FOR ALL TO authenticated
  USING (public.is_manager(auth.uid())) WITH CHECK (public.is_manager(auth.uid()));

CREATE TABLE IF NOT EXISTS public.job_applicants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  posting_id uuid REFERENCES public.job_postings(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  email text,
  phone text,
  source text NOT NULL DEFAULT 'career_site',
  stage text NOT NULL DEFAULT 'applied',
  ai_score numeric,
  ai_summary text,
  notes text NOT NULL DEFAULT '',
  applied_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_applicants TO authenticated;
GRANT INSERT ON public.job_applicants TO anon;
GRANT ALL ON public.job_applicants TO service_role;
ALTER TABLE public.job_applicants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "applicants manager only" ON public.job_applicants FOR ALL TO authenticated
  USING (public.is_manager(auth.uid())) WITH CHECK (public.is_manager(auth.uid()));

-- 5. Recognition + reward point ledger
CREATE TABLE IF NOT EXISTS public.recognitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  from_employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  badge text NOT NULL DEFAULT 'kudos',
  message text NOT NULL DEFAULT '',
  points integer NOT NULL DEFAULT 10,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.recognitions TO authenticated;
GRANT ALL ON public.recognitions TO service_role;
ALTER TABLE public.recognitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "recognitions readable" ON public.recognitions FOR SELECT TO authenticated USING (true);
CREATE POLICY "recognitions insert" ON public.recognitions FOR INSERT TO authenticated
  WITH CHECK (from_employee_id = public.current_employee_id() OR public.is_manager(auth.uid()));

CREATE TABLE IF NOT EXISTS public.reward_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  points integer NOT NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.reward_ledger TO authenticated;
GRANT ALL ON public.reward_ledger TO service_role;
ALTER TABLE public.reward_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reward own or manager" ON public.reward_ledger FOR SELECT TO authenticated
  USING (employee_id = public.current_employee_id() OR public.is_manager(auth.uid()));

-- 6. Earned wage access
CREATE TABLE IF NOT EXISTS public.wage_advances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  amount numeric NOT NULL,
  status text NOT NULL DEFAULT 'approved',
  requested_at timestamptz NOT NULL DEFAULT now(),
  note text NOT NULL DEFAULT ''
);
GRANT SELECT, INSERT ON public.wage_advances TO authenticated;
GRANT ALL ON public.wage_advances TO service_role;
ALTER TABLE public.wage_advances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "advances own or manager" ON public.wage_advances FOR SELECT TO authenticated
  USING (employee_id = public.current_employee_id() OR public.is_manager(auth.uid()));
CREATE POLICY "advances insert own" ON public.wage_advances FOR INSERT TO authenticated
  WITH CHECK (employee_id = public.current_employee_id());

-- 7. Messages / announcements
CREATE TABLE IF NOT EXISTS public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  sender_name text NOT NULL DEFAULT 'Management',
  recipient_id uuid REFERENCES public.employees(id) ON DELETE CASCADE,
  audience text NOT NULL DEFAULT 'all',
  subject text NOT NULL DEFAULT '',
  body text NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "messages readable" ON public.messages FOR SELECT TO authenticated
  USING (recipient_id IS NULL OR recipient_id = public.current_employee_id()
         OR sender_id = public.current_employee_id() OR public.is_manager(auth.uid()));
CREATE POLICY "messages insert" ON public.messages FOR INSERT TO authenticated
  WITH CHECK (sender_id = public.current_employee_id() OR public.is_manager(auth.uid()));
CREATE POLICY "messages update own" ON public.messages FOR UPDATE TO authenticated
  USING (recipient_id = public.current_employee_id() OR public.is_manager(auth.uid()))
  WITH CHECK (recipient_id = public.current_employee_id() OR public.is_manager(auth.uid()));

-- 8. Payroll periods
CREATE TABLE IF NOT EXISTS public.payroll_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  start_date date NOT NULL,
  end_date date NOT NULL,
  status text NOT NULL DEFAULT 'open',
  exported_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (start_date, end_date)
);
GRANT SELECT, INSERT, UPDATE ON public.payroll_periods TO authenticated;
GRANT ALL ON public.payroll_periods TO service_role;
ALTER TABLE public.payroll_periods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payroll manager only" ON public.payroll_periods FOR ALL TO authenticated
  USING (public.is_manager(auth.uid())) WITH CHECK (public.is_manager(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_punches_emp_date ON public.time_punches(employee_id, date);
CREATE INDEX IF NOT EXISTS idx_census_date ON public.census_days(date);
CREATE INDEX IF NOT EXISTS idx_messages_recipient ON public.messages(recipient_id, created_at DESC);
