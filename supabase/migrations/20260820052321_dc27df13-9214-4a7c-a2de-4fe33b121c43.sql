CREATE TABLE public.shift_claim_offers (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  assignment_id uuid NOT NULL REFERENCES public.shift_assignments(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  batch_id uuid NOT NULL,
  reply_code text NOT NULL DEFAULT '1',
  phone text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'sent',
  reason text NOT NULL DEFAULT '',
  sent_at timestamp with time zone NOT NULL DEFAULT now(),
  expires_at timestamp with time zone NOT NULL DEFAULT (now() + interval '6 hours'),
  responded_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_claim_offers_assignment ON public.shift_claim_offers(assignment_id);
CREATE INDEX idx_claim_offers_phone_status ON public.shift_claim_offers(phone, status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.shift_claim_offers TO authenticated;
GRANT ALL ON public.shift_claim_offers TO service_role;

ALTER TABLE public.shift_claim_offers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers manage claim offers"
  ON public.shift_claim_offers FOR ALL
  TO authenticated
  USING (public.is_manager(auth.uid()))
  WITH CHECK (public.is_manager(auth.uid()));

CREATE POLICY "Employees see their own claim offers"
  ON public.shift_claim_offers FOR SELECT
  TO authenticated
  USING (employee_id = public.current_employee_id());

CREATE TRIGGER trg_shift_claim_offers_updated
  BEFORE UPDATE ON public.shift_claim_offers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();