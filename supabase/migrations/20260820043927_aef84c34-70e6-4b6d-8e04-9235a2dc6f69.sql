ALTER TABLE public.automation_settings
  ADD COLUMN IF NOT EXISTS notify_onboarding boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_schedule_updates boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_delivery_failures boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS undo_window_minutes integer NOT NULL DEFAULT 10;

ALTER TABLE public.shift_assignments
  ADD COLUMN IF NOT EXISTS prev_note text;