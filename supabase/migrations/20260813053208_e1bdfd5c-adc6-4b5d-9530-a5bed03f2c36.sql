ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS rotation_week_a_days integer[] NOT NULL DEFAULT '{}'::integer[],
  ADD COLUMN IF NOT EXISTS rotation_week_b_days integer[] NOT NULL DEFAULT '{}'::integer[],
  ADD COLUMN IF NOT EXISTS days_per_week integer NOT NULL DEFAULT 4;

UPDATE public.employees e
SET rotation_week_a_days = sub.a,
    rotation_week_b_days = sub.b
FROM (
  SELECT id,
    CASE WHEN coalesce(weekend_group,'A') = 'A' THEN wk || we ELSE wk END AS a,
    CASE WHEN coalesce(weekend_group,'A') = 'A' THEN wk ELSE wk || we END AS b
  FROM (
    SELECT id, weekend_group,
      coalesce(array(SELECT unnest(scheduled_days) EXCEPT SELECT unnest(ARRAY[0,6]) ORDER BY 1), '{}'::integer[]) AS wk,
      coalesce(array(SELECT unnest(scheduled_days) INTERSECT SELECT unnest(ARRAY[0,6]) ORDER BY 1), '{}'::integer[]) AS we
    FROM public.employees
  ) t
) sub
WHERE e.id = sub.id AND cardinality(e.rotation_week_a_days) = 0;

CREATE TABLE IF NOT EXISTS public.automation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  status text NOT NULL DEFAULT 'ok',
  summary text NOT NULL DEFAULT '',
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.automation_runs TO authenticated;
GRANT ALL ON public.automation_runs TO service_role;

ALTER TABLE public.automation_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "managers read automation runs"
  ON public.automation_runs FOR SELECT TO authenticated
  USING (public.is_manager(auth.uid()));