ALTER TABLE public.census_days
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'auto',
  ADD COLUMN IF NOT EXISTS imported_at timestamptz;

CREATE TABLE IF NOT EXISTS public.census_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL DEFAULT 'pointclickcare',
  connector text NOT NULL DEFAULT '',
  file_name text NOT NULL DEFAULT '',
  period_start date,
  period_end date,
  rows_received integer NOT NULL DEFAULT 0,
  rows_applied integer NOT NULL DEFAULT 0,
  rows_skipped integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'applied',
  message text NOT NULL DEFAULT '',
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by text NOT NULL DEFAULT 'system',
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.census_imports TO authenticated;
GRANT ALL ON public.census_imports TO service_role;

ALTER TABLE public.census_imports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers can view census imports"
ON public.census_imports FOR SELECT
TO authenticated
USING (public.is_manager(auth.uid()));

CREATE INDEX IF NOT EXISTS census_imports_created_at_idx ON public.census_imports (created_at DESC);