CREATE TABLE public.app_config (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  label text NOT NULL DEFAULT '',
  updated_by text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.app_config TO authenticated;
GRANT ALL ON public.app_config TO service_role;
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "signed in can read app config" ON public.app_config FOR SELECT TO authenticated USING (true);
CREATE TRIGGER trg_app_config_updated BEFORE UPDATE ON public.app_config FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.app_config (key, value, label) VALUES
  ('brand', '{"appName":"CoverGrid","tagline":"Staffing that runs itself"}'::jsonb, 'Product name and tagline shown across the app')
ON CONFLICT (key) DO NOTHING;