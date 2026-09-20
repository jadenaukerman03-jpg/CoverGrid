DROP POLICY IF EXISTS "agencies readable" ON public.agencies;
CREATE POLICY "agencies readable by managers" ON public.agencies
FOR SELECT TO authenticated USING (public.is_manager(auth.uid()));

DROP POLICY IF EXISTS "Signed in users can view float history" ON public.float_events;
CREATE POLICY "float history self or manager" ON public.float_events
FOR SELECT TO authenticated
USING (employee_id = public.current_employee_id() OR public.is_manager(auth.uid()));

DROP POLICY IF EXISTS "census readable by signed in" ON public.census_days;
CREATE POLICY "census readable by managers" ON public.census_days
FOR SELECT TO authenticated USING (public.is_manager(auth.uid()));

DROP POLICY IF EXISTS "signed in can read app config" ON public.app_config;
CREATE POLICY "app config readable by managers" ON public.app_config
FOR SELECT TO authenticated USING (public.is_manager(auth.uid()));

DROP POLICY IF EXISTS "insert audit" ON public.audit_log;
CREATE POLICY "managers insert audit" ON public.audit_log
FOR INSERT TO authenticated WITH CHECK (public.is_manager(auth.uid()));