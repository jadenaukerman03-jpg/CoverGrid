DROP POLICY IF EXISTS "read employees" ON public.employees;
CREATE POLICY "employees read self or manager" ON public.employees
FOR SELECT TO authenticated
USING (user_id = auth.uid() OR id = public.current_employee_id() OR public.is_manager(auth.uid()));

DROP POLICY IF EXISTS "read schedule" ON public.shift_assignments;
CREATE POLICY "schedule read own or manager" ON public.shift_assignments
FOR SELECT TO authenticated
USING (employee_id = public.current_employee_id() OR employee_id IS NULL OR public.is_manager(auth.uid()));

DROP POLICY IF EXISTS "read requirements" ON public.staffing_requirements;
CREATE POLICY "requirements read manager" ON public.staffing_requirements
FOR SELECT TO authenticated
USING (public.is_manager(auth.uid()));