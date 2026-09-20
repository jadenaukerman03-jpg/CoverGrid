CREATE TABLE public.integration_connections (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  kind text NOT NULL,
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  vendor text NOT NULL DEFAULT '',
  direction text NOT NULL DEFAULT 'inbound',
  transport text NOT NULL DEFAULT 'webhook',
  auth_mode text NOT NULL DEFAULT 'api_key',
  endpoint_path text NOT NULL DEFAULT '',
  is_enabled boolean NOT NULL DEFAULT false,
  is_required boolean NOT NULL DEFAULT true,
  expected_every_minutes integer NOT NULL DEFAULT 1440,
  stale_after_minutes integer NOT NULL DEFAULT 2880,
  failure_threshold integer NOT NULL DEFAULT 3,
  fallback_mode text NOT NULL DEFAULT 'last_known_good',
  status text NOT NULL DEFAULT 'never_synced',
  last_message text NOT NULL DEFAULT '',
  last_sync_at timestamp with time zone,
  last_success_at timestamp with time zone,
  last_failure_at timestamp with time zone,
  consecutive_failures integer NOT NULL DEFAULT 0,
  total_syncs integer NOT NULL DEFAULT 0,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text NOT NULL DEFAULT '',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.integration_connections TO authenticated;
GRANT ALL ON public.integration_connections TO service_role;
ALTER TABLE public.integration_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Managers view integrations" ON public.integration_connections FOR SELECT TO authenticated USING (public.is_manager(auth.uid()));
CREATE POLICY "Managers manage integrations" ON public.integration_connections FOR ALL TO authenticated USING (public.is_manager(auth.uid())) WITH CHECK (public.is_manager(auth.uid()));

CREATE TABLE public.integration_syncs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  connection_id uuid NOT NULL REFERENCES public.integration_connections(id) ON DELETE CASCADE,
  direction text NOT NULL DEFAULT 'inbound',
  trigger text NOT NULL DEFAULT 'manual',
  status text NOT NULL DEFAULT 'ok',
  rows_received integer NOT NULL DEFAULT 0,
  rows_applied integer NOT NULL DEFAULT 0,
  rows_skipped integer NOT NULL DEFAULT 0,
  duration_ms integer NOT NULL DEFAULT 0,
  message text NOT NULL DEFAULT '',
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by text NOT NULL DEFAULT 'system',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.integration_syncs TO authenticated;
GRANT ALL ON public.integration_syncs TO service_role;
ALTER TABLE public.integration_syncs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Managers view syncs" ON public.integration_syncs FOR SELECT TO authenticated USING (public.is_manager(auth.uid()));

CREATE INDEX idx_integration_syncs_conn ON public.integration_syncs (connection_id, created_at DESC);

CREATE TABLE public.integration_snapshots (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  connection_id uuid NOT NULL REFERENCES public.integration_connections(id) ON DELETE CASCADE,
  kind text NOT NULL,
  rows integer NOT NULL DEFAULT 0,
  captured_at timestamp with time zone NOT NULL DEFAULT now(),
  payload jsonb NOT NULL DEFAULT '[]'::jsonb,
  summary text NOT NULL DEFAULT '',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.integration_snapshots TO authenticated;
GRANT ALL ON public.integration_snapshots TO service_role;
ALTER TABLE public.integration_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Managers view snapshots" ON public.integration_snapshots FOR SELECT TO authenticated USING (public.is_manager(auth.uid()));

CREATE INDEX idx_integration_snapshots_conn ON public.integration_snapshots (connection_id, captured_at DESC);

CREATE TABLE public.integration_incidents (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  connection_id uuid NOT NULL REFERENCES public.integration_connections(id) ON DELETE CASCADE,
  severity text NOT NULL DEFAULT 'warning',
  status text NOT NULL DEFAULT 'open',
  summary text NOT NULL DEFAULT '',
  impact text NOT NULL DEFAULT '',
  fallback_used text NOT NULL DEFAULT '',
  opened_at timestamp with time zone NOT NULL DEFAULT now(),
  resolved_at timestamp with time zone,
  acknowledged_by text NOT NULL DEFAULT '',
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.integration_incidents TO authenticated;
GRANT ALL ON public.integration_incidents TO service_role;
ALTER TABLE public.integration_incidents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Managers view incidents" ON public.integration_incidents FOR SELECT TO authenticated USING (public.is_manager(auth.uid()));
CREATE POLICY "Managers manage incidents" ON public.integration_incidents FOR ALL TO authenticated USING (public.is_manager(auth.uid())) WITH CHECK (public.is_manager(auth.uid()));

CREATE INDEX idx_integration_incidents_open ON public.integration_incidents (status, opened_at DESC);

CREATE TRIGGER update_integration_connections_updated_at BEFORE UPDATE ON public.integration_connections FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_integration_incidents_updated_at BEFORE UPDATE ON public.integration_incidents FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.integration_connections (kind, slug, name, vendor, direction, transport, endpoint_path, is_required, expected_every_minutes, stale_after_minutes, fallback_mode, notes) VALUES
  ('emr', 'emr-census', 'EMR census feed', 'PointClickCare', 'inbound', 'webhook', '/api/public/hooks/integration/emr-census', true, 1440, 2160, 'last_known_good', 'Nightly resident census by unit. Drives PPD and staffing targets.'),
  ('timeclock', 'timeclock-punches', 'Time clock punches', 'Kiosk / wall clock', 'inbound', 'webhook', '/api/public/hooks/integration/timeclock-punches', true, 60, 240, 'last_known_good', 'Clock in and out events. Falls back to scheduled hours when down.'),
  ('payroll', 'payroll-export', 'Payroll export', 'ADP / Paycom / UKG / Paylocity', 'outbound', 'file', '/api/public/hooks/integration/payroll-export', true, 10080, 20160, 'manual', 'Approved hours pushed each pay period.'),
  ('hris', 'hris-roster', 'HR roster sync', 'HRIS', 'inbound', 'webhook', '/api/public/hooks/integration/hris-roster', true, 1440, 4320, 'last_known_good', 'Hires, terminations, rates and unit assignments.'),
  ('credentialing', 'credentialing-licenses', 'Credentialing / license verification', 'State board / primary source', 'inbound', 'webhook', '/api/public/hooks/integration/credentialing-licenses', true, 1440, 4320, 'last_known_good', 'License numbers, status and expiration dates.'),
  ('agency', 'agency-portal', 'Agency nurse portal', 'Agency vendor portal', 'bidirectional', 'webhook', '/api/public/hooks/integration/agency-portal', false, 720, 2880, 'manual', 'Open shift offers out, confirmed agency workers back in.');