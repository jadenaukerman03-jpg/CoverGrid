ALTER TABLE public.automation_settings
  ADD COLUMN IF NOT EXISTS buyback_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS buyback_shifts_required integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS buyback_points_removed numeric NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS buyback_max_points_per_year numeric NOT NULL DEFAULT 3;

CREATE TABLE IF NOT EXISTS public.point_buybacks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  points_removed numeric NOT NULL,
  shifts_used integer NOT NULL,
  reason text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.point_buybacks TO authenticated;
GRANT ALL ON public.point_buybacks TO service_role;

ALTER TABLE public.point_buybacks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Employees see their own buybacks"
ON public.point_buybacks FOR SELECT TO authenticated
USING (employee_id = public.current_employee_id() OR public.is_manager(auth.uid()));

CREATE POLICY "Managers record buybacks"
ON public.point_buybacks FOR INSERT TO authenticated
WITH CHECK (public.is_manager(auth.uid()));

CREATE INDEX IF NOT EXISTS point_buybacks_employee_idx ON public.point_buybacks(employee_id, created_at DESC);