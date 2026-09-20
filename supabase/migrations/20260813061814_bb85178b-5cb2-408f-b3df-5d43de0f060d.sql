ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS float_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_floated_on date;

ALTER TABLE public.shift_assignments
  ADD COLUMN IF NOT EXISTS is_float boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS home_unit_id uuid REFERENCES public.units(id);

CREATE TABLE IF NOT EXISTS public.employee_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  author_id uuid REFERENCES public.employees(id),
  author_name text NOT NULL DEFAULT 'Management',
  category text NOT NULL DEFAULT 'general',
  body text NOT NULL,
  pinned boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_notes TO authenticated;
GRANT ALL ON public.employee_notes TO service_role;

ALTER TABLE public.employee_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers manage employee notes"
  ON public.employee_notes FOR ALL TO authenticated
  USING (public.is_manager(auth.uid()))
  WITH CHECK (public.is_manager(auth.uid()));

CREATE POLICY "Employees read notes about themselves"
  ON public.employee_notes FOR SELECT TO authenticated
  USING (employee_id = public.current_employee_id());

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS update_employee_notes_updated_at ON public.employee_notes;
CREATE TRIGGER update_employee_notes_updated_at
  BEFORE UPDATE ON public.employee_notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();