CREATE TABLE public.onboarding_phase_status (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  new_hire_id uuid NOT NULL REFERENCES public.new_hires(id) ON DELETE CASCADE,
  phase text NOT NULL,
  status text,
  started_at timestamp with time zone,
  completed_at timestamp with time zone,
  due_on date,
  note text NOT NULL DEFAULT '',
  updated_by text NOT NULL DEFAULT '',
  last_reminded_on date,
  reminder_count integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (new_hire_id, phase)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.onboarding_phase_status TO authenticated;
GRANT ALL ON public.onboarding_phase_status TO service_role;

ALTER TABLE public.onboarding_phase_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers read onboarding phase corrections"
  ON public.onboarding_phase_status FOR SELECT TO authenticated
  USING (public.is_manager(auth.uid()));

CREATE POLICY "Managers write onboarding phase corrections"
  ON public.onboarding_phase_status FOR ALL TO authenticated
  USING (public.is_manager(auth.uid()))
  WITH CHECK (public.is_manager(auth.uid()));

CREATE TRIGGER trg_onboarding_phase_status_updated
  BEFORE UPDATE ON public.onboarding_phase_status
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();