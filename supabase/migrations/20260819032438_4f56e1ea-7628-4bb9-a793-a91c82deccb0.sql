-- ============ 5. PER-DIEM MARKETPLACE ============
CREATE TABLE public.marketplace_workers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  position public.position_type NOT NULL,
  phone text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  city text NOT NULL DEFAULT '',
  hourly_rate numeric NOT NULL DEFAULT 0,
  reliability numeric NOT NULL DEFAULT 100,
  shifts_worked integer NOT NULL DEFAULT 0,
  no_shows integer NOT NULL DEFAULT 0,
  license_number text NOT NULL DEFAULT '',
  license_expires_on date,
  status text NOT NULL DEFAULT 'pending',
  is_active boolean NOT NULL DEFAULT true,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketplace_workers TO authenticated;
GRANT ALL ON public.marketplace_workers TO service_role;
ALTER TABLE public.marketplace_workers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Managers manage marketplace workers" ON public.marketplace_workers
  FOR ALL TO authenticated USING (public.is_manager(auth.uid())) WITH CHECK (public.is_manager(auth.uid()));

CREATE TABLE public.marketplace_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid REFERENCES public.shift_assignments(id) ON DELETE CASCADE,
  worker_id uuid REFERENCES public.marketplace_workers(id) ON DELETE CASCADE,
  shift_date date NOT NULL,
  shift public.shift_type NOT NULL,
  unit_id uuid REFERENCES public.units(id),
  position public.position_type NOT NULL,
  offered_rate numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'offered',
  expires_at timestamptz,
  responded_at timestamptz,
  reason text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketplace_offers TO authenticated;
GRANT ALL ON public.marketplace_offers TO service_role;
ALTER TABLE public.marketplace_offers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Managers manage marketplace offers" ON public.marketplace_offers
  FOR ALL TO authenticated USING (public.is_manager(auth.uid())) WITH CHECK (public.is_manager(auth.uid()));

-- ============ 6. HR DEPTH: DOCUMENTS, SCREENINGS, IN-SERVICE ============
CREATE TABLE public.hire_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  new_hire_id uuid REFERENCES public.new_hires(id) ON DELETE CASCADE,
  employee_id uuid REFERENCES public.employees(id) ON DELETE CASCADE,
  doc_type text NOT NULL,
  title text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'not_sent',
  sent_at timestamptz,
  signed_at timestamptz,
  signed_name text NOT NULL DEFAULT '',
  signature_ip text NOT NULL DEFAULT '',
  file_url text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hire_documents TO authenticated;
GRANT ALL ON public.hire_documents TO service_role;
ALTER TABLE public.hire_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Managers manage hire documents" ON public.hire_documents
  FOR ALL TO authenticated USING (public.is_manager(auth.uid())) WITH CHECK (public.is_manager(auth.uid()));
CREATE POLICY "Employees read own documents" ON public.hire_documents
  FOR SELECT TO authenticated USING (employee_id = public.current_employee_id());

CREATE TABLE public.screening_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  new_hire_id uuid REFERENCES public.new_hires(id) ON DELETE CASCADE,
  employee_id uuid REFERENCES public.employees(id) ON DELETE CASCADE,
  kind text NOT NULL,
  vendor text NOT NULL DEFAULT '',
  reference text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'not_started',
  ordered_on date,
  completed_on date,
  result text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.screening_checks TO authenticated;
GRANT ALL ON public.screening_checks TO service_role;
ALTER TABLE public.screening_checks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Managers manage screening checks" ON public.screening_checks
  FOR ALL TO authenticated USING (public.is_manager(auth.uid())) WITH CHECK (public.is_manager(auth.uid()));

CREATE TABLE public.inservice_courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT 'annual',
  required_minutes integer NOT NULL DEFAULT 30,
  recurrence_months integer NOT NULL DEFAULT 12,
  applies_to_positions public.position_type[] NOT NULL DEFAULT ARRAY[]::public.position_type[],
  required_for_new_hires boolean NOT NULL DEFAULT true,
  content_url text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inservice_courses TO authenticated;
GRANT ALL ON public.inservice_courses TO service_role;
ALTER TABLE public.inservice_courses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Managers manage courses" ON public.inservice_courses
  FOR ALL TO authenticated USING (public.is_manager(auth.uid())) WITH CHECK (public.is_manager(auth.uid()));
CREATE POLICY "Staff read active courses" ON public.inservice_courses
  FOR SELECT TO authenticated USING (is_active);

CREATE TABLE public.course_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.inservice_courses(id) ON DELETE CASCADE,
  employee_id uuid REFERENCES public.employees(id) ON DELETE CASCADE,
  new_hire_id uuid REFERENCES public.new_hires(id) ON DELETE CASCADE,
  completed_on date NOT NULL DEFAULT CURRENT_DATE,
  minutes integer NOT NULL DEFAULT 0,
  score numeric,
  due_on date,
  recorded_by text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.course_completions TO authenticated;
GRANT ALL ON public.course_completions TO service_role;
ALTER TABLE public.course_completions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Managers manage completions" ON public.course_completions
  FOR ALL TO authenticated USING (public.is_manager(auth.uid())) WITH CHECK (public.is_manager(auth.uid()));
CREATE POLICY "Employees read own completions" ON public.course_completions
  FOR SELECT TO authenticated USING (employee_id = public.current_employee_id());

-- ============ 8. IMPLEMENTATION TOOLING ============
CREATE TABLE public.import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  file_name text NOT NULL DEFAULT '',
  rows_received integer NOT NULL DEFAULT 0,
  rows_applied integer NOT NULL DEFAULT 0,
  rows_skipped integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  message text NOT NULL DEFAULT '',
  errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.import_batches TO authenticated;
GRANT ALL ON public.import_batches TO service_role;
ALTER TABLE public.import_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Managers manage import batches" ON public.import_batches
  FOR ALL TO authenticated USING (public.is_manager(auth.uid())) WITH CHECK (public.is_manager(auth.uid()));

CREATE TABLE public.setup_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  title text NOT NULL,
  detail text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'todo',
  completed_at timestamptz,
  completed_by text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.setup_steps TO authenticated;
GRANT ALL ON public.setup_steps TO service_role;
ALTER TABLE public.setup_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Managers manage setup steps" ON public.setup_steps
  FOR ALL TO authenticated USING (public.is_manager(auth.uid())) WITH CHECK (public.is_manager(auth.uid()));

-- updated_at triggers
CREATE TRIGGER trg_marketplace_workers_updated BEFORE UPDATE ON public.marketplace_workers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_marketplace_offers_updated BEFORE UPDATE ON public.marketplace_offers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_hire_documents_updated BEFORE UPDATE ON public.hire_documents FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_screening_checks_updated BEFORE UPDATE ON public.screening_checks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_inservice_courses_updated BEFORE UPDATE ON public.inservice_courses FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_course_completions_updated BEFORE UPDATE ON public.course_completions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_import_batches_updated BEFORE UPDATE ON public.import_batches FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_setup_steps_updated BEFORE UPDATE ON public.setup_steps FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed the guided go-live checklist and standard in-service courses
INSERT INTO public.setup_steps (key, title, detail, sort_order) VALUES
  ('facility', 'Confirm buildings and units', 'Check every unit name, bed count and target hours per resident day.', 1),
  ('requirements', 'Set required staff per unit and shift', 'Nurse, QMA and CNA counts for first, second and third shift.', 2),
  ('roster', 'Import the staff roster', 'Upload your current employee list with positions, hire dates and rates.', 3),
  ('schedule', 'Import the current schedule', 'Bring in the schedule already posted so nothing is lost at go-live.', 4),
  ('attendance', 'Import attendance history', 'Existing points and occurrences so the record follows each person.', 5),
  ('policies', 'Review policy settings', 'Points, vacation notice, overtime limits, buy-back and quiet hours.', 6),
  ('integrations', 'Connect outside systems', 'Census, payroll, time clocks, credentialing and agency portals.', 7),
  ('watch', 'Run watch-only for one week', 'Let the system show what it would do before it does it.', 8),
  ('training', 'Train schedulers and floor staff', 'Short walkthroughs for each role, then hand out logins.', 9),
  ('golive', 'Go live', 'Switch the system from watch-only to running itself.', 10)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.inservice_courses (title, description, category, required_minutes, recurrence_months, required_for_new_hires) VALUES
  ('Abuse and neglect prevention', 'Recognizing, preventing and reporting resident abuse and neglect.', 'annual', 60, 12, true),
  ('Infection control and hand hygiene', 'Standard precautions, isolation and hand hygiene.', 'annual', 45, 12, true),
  ('HIPAA and resident privacy', 'Protected health information and resident rights.', 'annual', 30, 12, true),
  ('Fire safety and emergency preparedness', 'Evacuation, RACE/PASS and disaster response.', 'annual', 30, 12, true),
  ('Safe resident handling', 'Transfers, lifts and back safety.', 'annual', 45, 12, true),
  ('Dementia care', 'Behavior approaches and person-centered dementia care.', 'annual', 60, 12, true),
  ('Bloodborne pathogens', 'OSHA bloodborne pathogen standard.', 'annual', 30, 12, true),
  ('Medication administration refresher', 'For QMAs and nurses — the five rights and documentation.', 'role', 60, 12, false)
ON CONFLICT DO NOTHING;