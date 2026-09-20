CREATE TABLE public.login_attempts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL,
  ip TEXT NOT NULL DEFAULT 'unknown',
  succeeded BOOLEAN NOT NULL DEFAULT false,
  reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT ALL ON public.login_attempts TO service_role;

ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;

CREATE INDEX login_attempts_email_time_idx ON public.login_attempts (lower(email), created_at DESC);
CREATE INDEX login_attempts_ip_time_idx ON public.login_attempts (ip, created_at DESC);