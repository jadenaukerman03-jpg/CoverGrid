CREATE TABLE public.new_hires (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  email text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  position position_type NOT NULL DEFAULT 'cna',
  facility_id uuid REFERENCES public.facilities(id) ON DELETE SET NULL,
  unit_id uuid REFERENCES public.units(id) ON DELETE SET NULL,
  shift shift_type,
  days_per_week integer NOT NULL DEFAULT 4,
  hourly_rate numeric NOT NULL DEFAULT 0,
  employment_type text NOT NULL DEFAULT 'full_time',
  source text NOT NULL DEFAULT '',
  recruiter text NOT NULL DEFAULT '',
  applicant_id uuid REFERENCES public.job_applicants(id) ON DELETE SET NULL,
  offer_date date,
  start_date date,
  orientation_start date,
  orientation_end date,
  preceptor_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  clock_in_number text NOT NULL DEFAULT '',
  charting_username text NOT NULL DEFAULT '',
  payroll_id text NOT NULL DEFAULT '',
  emergency_contact_name text NOT NULL DEFAULT '',
  emergency_contact_phone text NOT NULL DEFAULT '',
  license_number text NOT NULL DEFAULT '',
  license_expires_on date,
  offer_accepted boolean NOT NULL DEFAULT false,
  background_check_done boolean NOT NULL DEFAULT false,
  drug_screen_done boolean NOT NULL DEFAULT false,
  physical_tb_done boolean NOT NULL DEFAULT false,
  license_verified boolean NOT NULL DEFAULT false,
  paperwork_done boolean NOT NULL DEFAULT false,
  badge_issued boolean NOT NULL DEFAULT false,
  charting_login_created boolean NOT NULL DEFAULT false,
  orientation_scheduled boolean NOT NULL DEFAULT false,
  added_to_schedule boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'onboarding',
  employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.new_hires TO authenticated;
GRANT ALL ON public.new_hires TO service_role;

ALTER TABLE public.new_hires ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers manage new hires"
ON public.new_hires FOR ALL TO authenticated
USING (public.is_manager(auth.uid()))
WITH CHECK (public.is_manager(auth.uid()));

CREATE TRIGGER update_new_hires_updated_at
BEFORE UPDATE ON public.new_hires
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();