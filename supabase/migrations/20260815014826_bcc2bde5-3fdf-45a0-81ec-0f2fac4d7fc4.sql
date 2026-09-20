ALTER TYPE position_type ADD VALUE IF NOT EXISTS 'qma';

-- ---------- Buildings ----------
CREATE TABLE public.facilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  address text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  weekly_labor_budget numeric NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.facilities TO authenticated;
GRANT ALL ON public.facilities TO service_role;
ALTER TABLE public.facilities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "facilities readable" ON public.facilities FOR SELECT TO authenticated USING (true);
CREATE POLICY "managers manage facilities" ON public.facilities FOR ALL TO authenticated
  USING (public.is_manager(auth.uid())) WITH CHECK (public.is_manager(auth.uid()));
GRANT INSERT, UPDATE, DELETE ON public.facilities TO authenticated;

INSERT INTO public.facilities (name, address, sort_order, weekly_labor_budget)
VALUES ('Main Campus', '', 0, 120000);

ALTER TABLE public.units ADD COLUMN facility_id uuid REFERENCES public.facilities(id);
UPDATE public.units SET facility_id = (SELECT id FROM public.facilities ORDER BY sort_order LIMIT 1);

-- ---------- Agencies ----------
CREATE TABLE public.agencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  contact_name text NOT NULL DEFAULT '',
  contact_email text,
  contact_phone text,
  weekly_budget numeric NOT NULL DEFAULT 0,
  max_shifts_per_week integer NOT NULL DEFAULT 0,
  rate_nurse numeric NOT NULL DEFAULT 0,
  rate_qma numeric NOT NULL DEFAULT 0,
  rate_cna numeric NOT NULL DEFAULT 0,
  notes text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agencies TO authenticated;
GRANT ALL ON public.agencies TO service_role;
ALTER TABLE public.agencies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agencies readable" ON public.agencies FOR SELECT TO authenticated USING (true);
CREATE POLICY "managers manage agencies" ON public.agencies FOR ALL TO authenticated
  USING (public.is_manager(auth.uid())) WITH CHECK (public.is_manager(auth.uid()));

CREATE TABLE public.agency_staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  user_id uuid,
  full_name text NOT NULL,
  position position_type NOT NULL,
  phone text,
  email text,
  charting_username text NOT NULL DEFAULT '',
  charting_password text NOT NULL DEFAULT '',
  clock_in_number text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agency_staff TO authenticated;
GRANT ALL ON public.agency_staff TO service_role;
ALTER TABLE public.agency_staff ENABLE ROW LEVEL SECURITY;
CREATE POLICY "managers manage agency staff" ON public.agency_staff FOR ALL TO authenticated
  USING (public.is_manager(auth.uid())) WITH CHECK (public.is_manager(auth.uid()));
CREATE POLICY "agency worker sees own record" ON public.agency_staff FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- ---------- Schedule additions ----------
ALTER TABLE public.shift_assignments
  ADD COLUMN agency_staff_id uuid REFERENCES public.agency_staff(id) ON DELETE SET NULL,
  ADD COLUMN agency_id uuid REFERENCES public.agencies(id) ON DELETE SET NULL,
  ADD COLUMN is_training boolean NOT NULL DEFAULT false,
  ADD COLUMN preceptor_id uuid REFERENCES public.employees(id) ON DELETE SET NULL;

-- ---------- Employee additions ----------
ALTER TABLE public.employees
  ADD COLUMN home_facility_id uuid REFERENCES public.facilities(id),
  ADD COLUMN in_training boolean NOT NULL DEFAULT false,
  ADD COLUMN training_ends_on date,
  ADD COLUMN float_pool_optin boolean NOT NULL DEFAULT false,
  ADD COLUMN no_show_risk numeric NOT NULL DEFAULT 0,
  ADD COLUMN risk_label text NOT NULL DEFAULT 'unknown',
  ADD COLUMN risk_updated_at timestamptz,
  ADD COLUMN risk_reason text NOT NULL DEFAULT '';
UPDATE public.employees SET home_facility_id = (SELECT id FROM public.facilities ORDER BY sort_order LIMIT 1);

-- ---------- Credentials ----------
CREATE TABLE public.employee_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  kind text NOT NULL,
  identifier text NOT NULL DEFAULT '',
  issued_on date,
  expires_on date NOT NULL,
  status text NOT NULL DEFAULT 'active',
  last_warned_on date,
  removed_from_schedule boolean NOT NULL DEFAULT false,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_credentials TO authenticated;
GRANT ALL ON public.employee_credentials TO service_role;
ALTER TABLE public.employee_credentials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "managers manage credentials" ON public.employee_credentials FOR ALL TO authenticated
  USING (public.is_manager(auth.uid())) WITH CHECK (public.is_manager(auth.uid()));
CREATE POLICY "employee sees own credentials" ON public.employee_credentials FOR SELECT TO authenticated
  USING (employee_id = public.current_employee_id());

-- ---------- Phone / voice call-off intake ----------
CREATE TABLE public.call_off_intakes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  caller_name text NOT NULL DEFAULT '',
  caller_phone text NOT NULL DEFAULT '',
  channel text NOT NULL DEFAULT 'phone',
  transcript text NOT NULL DEFAULT '',
  parsed_kind text,
  parsed_date date,
  parsed_shift shift_type,
  minutes_late integer,
  confidence numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  outcome text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.call_off_intakes TO authenticated;
GRANT ALL ON public.call_off_intakes TO service_role;
ALTER TABLE public.call_off_intakes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "managers manage intakes" ON public.call_off_intakes FOR ALL TO authenticated
  USING (public.is_manager(auth.uid())) WITH CHECK (public.is_manager(auth.uid()));
CREATE POLICY "employee sees own intakes" ON public.call_off_intakes FOR SELECT TO authenticated
  USING (employee_id = public.current_employee_id());
CREATE POLICY "employee creates own intake" ON public.call_off_intakes FOR INSERT TO authenticated
  WITH CHECK (employee_id = public.current_employee_id());

-- ---------- updated_at triggers ----------
CREATE TRIGGER trg_facilities_updated BEFORE UPDATE ON public.facilities
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_agencies_updated BEFORE UPDATE ON public.agencies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_agency_staff_updated BEFORE UPDATE ON public.agency_staff
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_credentials_updated BEFORE UPDATE ON public.employee_credentials
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_intakes_updated BEFORE UPDATE ON public.call_off_intakes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- Starter agencies ----------
INSERT INTO public.agencies (name, contact_name, contact_phone, weekly_budget, max_shifts_per_week, rate_nurse, rate_qma, rate_cna, notes)
VALUES
  ('Rosewood Staffing', 'Rosewood scheduling desk', '(555) 210-4400', 18000, 24, 68, 42, 32, 'Primary agency partner.'),
  ('NurseStat', 'NurseStat account manager', '(555) 771-9080', 12000, 16, 72, 45, 34, 'Overflow coverage only.');
