ALTER TABLE public.shift_assignments ADD COLUMN IF NOT EXISTS float_reason text;

CREATE TABLE public.float_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid REFERENCES public.shift_assignments(id) ON DELETE SET NULL,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  from_unit_id uuid REFERENCES public.units(id),
  to_unit_id uuid REFERENCES public.units(id),
  shift_date date NOT NULL,
  shift shift_type,
  position position_type,
  reason text NOT NULL DEFAULT 'coverage',
  rationale text NOT NULL DEFAULT '',
  decided_by text NOT NULL DEFAULT 'system',
  automatic boolean NOT NULL DEFAULT false,
  float_count_before integer NOT NULL DEFAULT 0,
  seniority_rank integer,
  returned_home boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.float_events TO authenticated;
GRANT ALL ON public.float_events TO service_role;
ALTER TABLE public.float_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Signed in users can view float history"
ON public.float_events FOR SELECT TO authenticated USING (true);

CREATE POLICY "Managers can record floats"
ON public.float_events FOR INSERT TO authenticated
WITH CHECK (public.is_manager(auth.uid()));

CREATE INDEX idx_float_events_employee ON public.float_events(employee_id, created_at DESC);
CREATE INDEX idx_float_events_date ON public.float_events(shift_date);

CREATE TABLE public.automation_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton boolean NOT NULL DEFAULT true UNIQUE,
  autopilot_enabled boolean NOT NULL DEFAULT true,
  coverage_buffer integer NOT NULL DEFAULT 1,
  auto_fill_days integer NOT NULL DEFAULT 7,
  horizon_weeks integer NOT NULL DEFAULT 6,
  seniority_weight numeric NOT NULL DEFAULT 1,
  recency_weight numeric NOT NULL DEFAULT 1,
  paused_reason text,
  last_run_at timestamptz,
  updated_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.automation_settings TO authenticated;
GRANT ALL ON public.automation_settings TO service_role;
ALTER TABLE public.automation_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Signed in users can view autopilot settings"
ON public.automation_settings FOR SELECT TO authenticated USING (true);

CREATE TRIGGER update_automation_settings_updated_at
BEFORE UPDATE ON public.automation_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.automation_settings (singleton) VALUES (true);