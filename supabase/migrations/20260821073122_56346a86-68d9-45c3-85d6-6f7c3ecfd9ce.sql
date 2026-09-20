
-- 1. Lock down SECURITY DEFINER helpers: no anonymous or public execute.
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;

REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.is_manager(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_manager(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.current_employee_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_employee_id() TO authenticated, service_role;

-- 2. Tamper-evident change record.
CREATE OR REPLACE FUNCTION public.audit_log_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.created_at > now() - interval '90 days' THEN
      RAISE EXCEPTION 'Change records stay for at least 90 days and cannot be removed early.';
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.action IS DISTINCT FROM OLD.action
     OR NEW.actor IS DISTINCT FROM OLD.actor
     OR NEW.entity IS DISTINCT FROM OLD.entity
     OR NEW.entity_id IS DISTINCT FROM OLD.entity_id
     OR NEW.details IS DISTINCT FROM OLD.details
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Change records cannot be edited. Only the undo markers may be set.';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.audit_log_immutable() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_audit_log_immutable ON public.audit_log;
CREATE TRIGGER trg_audit_log_immutable
  BEFORE UPDATE OR DELETE ON public.audit_log
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_immutable();

-- 3. Failed sign-in record: administrators may review it; nobody else.
GRANT SELECT ON public.login_attempts TO authenticated;
DROP POLICY IF EXISTS login_attempts_select_admins ON public.login_attempts;
CREATE POLICY login_attempts_select_admins ON public.login_attempts
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

COMMENT ON TABLE public.login_attempts IS
  'Sign-in attempt record used for lockouts. Written only by the server; readable by administrators.';
