-- 1. notification_rules: role-scoped rows only visible to managers or members of that role
DROP POLICY IF EXISTS "People read their own notification rules" ON public.notification_rules;
CREATE POLICY "People read their own notification rules"
ON public.notification_rules
FOR SELECT
TO authenticated
USING (
  employee_id = public.current_employee_id()
  OR (
    scope = 'role'
    AND role IS NOT NULL
    AND (public.is_manager(auth.uid()) OR public.has_role(auth.uid(), role))
  )
);

-- 2. wage_advances: employees may only file pending requests; managers decide
DROP POLICY IF EXISTS "advances insert own" ON public.wage_advances;
CREATE POLICY "advances insert own pending"
ON public.wage_advances
FOR INSERT
TO authenticated
WITH CHECK (
  employee_id = public.current_employee_id()
  AND status = 'pending'
  AND amount > 0
);

CREATE POLICY "advances managers decide"
ON public.wage_advances
FOR UPDATE
TO authenticated
USING (public.is_manager(auth.uid()))
WITH CHECK (public.is_manager(auth.uid()));