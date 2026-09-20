ALTER TABLE public.shift_assignments ADD COLUMN IF NOT EXISTS fill_reason text;
ALTER TABLE public.audit_log ADD COLUMN IF NOT EXISTS undone_at timestamptz;
ALTER TABLE public.audit_log ADD COLUMN IF NOT EXISTS undone_by text;
ALTER TABLE public.automation_settings ADD COLUMN IF NOT EXISTS watch_only boolean NOT NULL DEFAULT false;