ALTER TABLE public.automation_settings
  ADD COLUMN IF NOT EXISTS session_timeout_minutes integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS audit_retention_days integer NOT NULL DEFAULT 2555,
  ADD COLUMN IF NOT EXISTS message_retention_days integer NOT NULL DEFAULT 730,
  ADD COLUMN IF NOT EXISTS access_review_days integer NOT NULL DEFAULT 90;

CREATE TABLE IF NOT EXISTS public.access_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reviewed_by text NOT NULL,
  reviewed_at timestamptz NOT NULL DEFAULT now(),
  accounts_reviewed integer NOT NULL DEFAULT 0,
  changes_made integer NOT NULL DEFAULT 0,
  notes text
);

GRANT SELECT ON public.access_reviews TO authenticated;
GRANT ALL ON public.access_reviews TO service_role;

ALTER TABLE public.access_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "access_reviews_select_admins" ON public.access_reviews
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));