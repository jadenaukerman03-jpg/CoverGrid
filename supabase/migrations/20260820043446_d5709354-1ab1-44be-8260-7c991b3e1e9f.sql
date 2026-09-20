-- Recognition feed: limit to the people involved plus managers/admins
DROP POLICY IF EXISTS "Recognitions readable" ON public.recognitions;
DROP POLICY IF EXISTS "recognitions_select" ON public.recognitions;
DROP POLICY IF EXISTS "Anyone can view recognitions" ON public.recognitions;
DROP POLICY IF EXISTS "recognitions_select_involved" ON public.recognitions;

CREATE POLICY "recognitions_select_involved"
ON public.recognitions
FOR SELECT
TO authenticated
USING (
  public.is_manager(auth.uid())
  OR employee_id = public.current_employee_id()
  OR from_employee_id = public.current_employee_id()
);

-- Automation settings: managers/admins only
DROP POLICY IF EXISTS "Automation settings readable" ON public.automation_settings;
DROP POLICY IF EXISTS "automation_settings_select" ON public.automation_settings;
DROP POLICY IF EXISTS "Anyone can view automation settings" ON public.automation_settings;
DROP POLICY IF EXISTS "automation_settings_select_managers" ON public.automation_settings;

CREATE POLICY "automation_settings_select_managers"
ON public.automation_settings
FOR SELECT
TO authenticated
USING (public.is_manager(auth.uid()));