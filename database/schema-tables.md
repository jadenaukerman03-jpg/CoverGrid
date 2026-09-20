# Every table and column, as it exists today

Read straight from the running database. `NOT NULL` and `DEFAULT` shown where they apply.

## access_reviews

```sql
id uuid NOT NULL DEFAULT gen_random_uuid()
reviewed_by text NOT NULL
reviewed_at timestamp with time zone NOT NULL DEFAULT now()
accounts_reviewed integer NOT NULL DEFAULT 0
changes_made integer NOT NULL DEFAULT 0
notes text
```

## agencies

```sql
id uuid NOT NULL DEFAULT gen_random_uuid()
name text NOT NULL
contact_name text NOT NULL DEFAULT ''::text
contact_email text
contact_phone text
weekly_budget numeric NOT NULL DEFAULT 0
max_shifts_per_week integer NOT NULL DEFAULT 0
rate_nurse numeric NOT NULL DEFAULT 0
rate_qma numeric NOT NULL DEFAULT 0
rate_cna numeric NOT NULL DEFAULT 0
notes text NOT NULL DEFAULT ''::text
is_active boolean NOT NULL DEFAULT true
created_at timestamp with time zone NOT NULL DEFAULT now()
updated_at timestamp with time zone NOT NULL DEFAULT now()
```

## agency_staff

```sql
id uuid NOT NULL DEFAULT gen_random_uuid()
agency_id uuid NOT NULL
user_id uuid
full_name text NOT NULL
position USER-DEFINED NOT NULL
phone text
email text
charting_username text NOT NULL DEFAULT ''::text
charting_password text NOT NULL DEFAULT ''::text
clock_in_number text NOT NULL DEFAULT ''::text
notes text NOT NULL DEFAULT ''::text
is_active boolean NOT NULL DEFAULT true
created_at timestamp with time zone NOT NULL DEFAULT now()
updated_at timestamp with time zone NOT NULL DEFAULT now()
```

## app_config

```sql
key text NOT NULL
value jsonb NOT NULL DEFAULT '{}'::jsonb
label text NOT NULL DEFAULT ''::text
updated_by text NOT NULL DEFAULT ''::text
updated_at timestamp with time zone NOT NULL DEFAULT now()
created_at timestamp with time zone NOT NULL DEFAULT now()
```

## attendance_events

```sql
id uuid NOT NULL DEFAULT gen_random_uuid()
employee_id uuid NOT NULL
assignment_id uuid
kind USER-DEFINED NOT NULL
points numeric NOT NULL
minutes_late integer
occurred_at timestamp with time zone NOT NULL DEFAULT now()
note text
```

## audit_log

```sql
id uuid NOT NULL DEFAULT gen_random_uuid()
actor text NOT NULL DEFAULT 'ai'::text
action text NOT NULL
entity text
entity_id uuid
details jsonb NOT NULL DEFAULT '{}'::jsonb
created_at timestamp with time zone NOT NULL DEFAULT now()
undone_at timestamp with time zone
undone_by text
```

## automation_runs

```sql
id uuid NOT NULL DEFAULT gen_random_uuid()
kind text NOT NULL
status text NOT NULL DEFAULT 'ok'::text
summary text NOT NULL DEFAULT ''::text
details jsonb NOT NULL DEFAULT '{}'::jsonb
created_at timestamp with time zone NOT NULL DEFAULT now()
```

## automation_settings

```sql
id uuid NOT NULL DEFAULT gen_random_uuid()
singleton boolean NOT NULL DEFAULT true
autopilot_enabled boolean NOT NULL DEFAULT true
coverage_buffer integer NOT NULL DEFAULT 1
auto_fill_days integer NOT NULL DEFAULT 7
horizon_weeks integer NOT NULL DEFAULT 6
seniority_weight numeric NOT NULL DEFAULT 1
recency_weight numeric NOT NULL DEFAULT 1
paused_reason text
last_run_at timestamp with time zone
updated_by text
created_at timestamp with time zone NOT NULL DEFAULT now()
updated_at timestamp with time zone NOT NULL DEFAULT now()
watch_only boolean NOT NULL DEFAULT false
sms_enabled boolean NOT NULL DEFAULT true
quiet_hours_start integer NOT NULL DEFAULT 21
quiet_hours_end integer NOT NULL DEFAULT 6
data_retention_days integer NOT NULL DEFAULT 2555
ppd_goal numeric NOT NULL DEFAULT 3.6
buyback_enabled boolean NOT NULL DEFAULT false
buyback_shifts_required integer NOT NULL DEFAULT 3
buyback_points_removed numeric NOT NULL DEFAULT 1
buyback_max_points_per_year numeric NOT NULL DEFAULT 3
notify_onboarding boolean NOT NULL DEFAULT true
notify_schedule_updates boolean NOT NULL DEFAULT true
notify_delivery_failures boolean NOT NULL DEFAULT true
undo_window_minutes integer NOT NULL DEFAULT 10
session_timeout_minutes integer NOT NULL DEFAULT 30
audit_retention_days integer NOT NULL DEFAULT 2555
message_retention_days integer NOT NULL DEFAULT 730
access_review_days integer NOT NULL DEFAULT 90
```

## call_off_intakes

```sql
id uuid NOT NULL DEFAULT gen_random_uuid()
employee_id uuid
caller_name text NOT NULL DEFAULT ''::text
caller_phone text NOT NULL DEFAULT ''::text
channel text NOT NULL DEFAULT 'phone'::text
transcript text NOT NULL DEFAULT ''::text
parsed_kind text
parsed_date date
parsed_shift USER-DEFINED
minutes_late integer
confidence numeric NOT NULL DEFAULT 0
status text NOT NULL DEFAULT 'pending'::text
outcome text NOT NULL DEFAULT ''::text
created_at timestamp with time zone NOT NULL DEFAULT now()
updated_at timestamp with time zone NOT NULL DEFAULT now()
```

## census_days

```sql
id uuid NOT NULL DEFAULT gen_random_uuid()
date date NOT NULL
unit_id uuid NOT NULL
census integer NOT NULL DEFAULT 0
created_at timestamp with time zone NOT NULL DEFAULT now()
source text NOT NULL DEFAULT 'auto'::text
imported_at timestamp with time zone
```

## census_imports

```sql
id uuid NOT NULL DEFAULT gen_random_uuid()
source text NOT NULL DEFAULT 'pointclickcare'::text
connector text NOT NULL DEFAULT ''::text
file_name text NOT NULL DEFAULT ''::text
period_start date
period_end date
rows_received integer NOT NULL DEFAULT 0
rows_applied integer NOT NULL DEFAULT 0
rows_skipped integer NOT NULL DEFAULT 0
status text NOT NULL DEFAULT 'applied'::text
message text NOT NULL DEFAULT ''::text
details jsonb NOT NULL DEFAULT '{}'::jsonb
created_by text NOT NULL DEFAULT 'system'::text
created_at timestamp with time zone NOT NULL DEFAULT now()
```

## chat_messages

```sql
id uuid NOT NULL DEFAULT gen_random_uuid()
user_id uuid NOT NULL
role text NOT NULL
content text NOT NULL
created_at timestamp with time zone NOT NULL DEFAULT now()
```

## compliance_items

```sql
id uuid NOT NULL DEFAULT gen_random_uuid()
category text NOT NULL DEFAULT 'privacy'::text
title text NOT NULL
detail text NOT NULL DEFAULT ''::text
status text NOT NULL DEFAULT 'not_started'::text
owner text NOT NULL DEFAULT ''::text
evidence_url text NOT NULL DEFAULT ''::text
reviewed_on date
next_review_on date
created_at timestamp with time zone NOT NULL DEFAULT now()
updated_at timestamp with time zone NOT NULL DEFAULT now()
```

## course_completions

```sql
id uuid NOT NULL DEFAULT gen_random_uuid()
course_id uuid NOT NULL
employee_id uuid
new_hire_id uuid
completed_on date NOT NULL DEFAULT CURRENT_DATE
minutes integer NOT NULL DEFAULT 0
score numeric
due_on date
recorded_by text NOT NULL DEFAULT ''::text
notes text NOT NULL DEFAULT ''::text
created_at timestamp with time zone NOT NULL DEFAULT now()
updated_at timestamp with time zone NOT NULL DEFAULT now()
```

## employee_credentials

```sql
id uuid NOT NULL DEFAULT gen_random_uuid()
employee_id uuid NOT NULL
kind text NOT NULL
identifier text NOT NULL DEFAULT ''::text
issued_on date
expires_on date NOT NULL
status text NOT NULL DEFAULT 'active'::text
last_warned_on date
removed_from_schedule boolean NOT NULL DEFAULT false
notes text NOT NULL DEFAULT ''::text
created_at timestamp with time zone NOT NULL DEFAULT now()
updated_at timestamp with time zone NOT NULL DEFAULT now()
```

## employee_notes

```sql
id uuid NOT NULL DEFAULT gen_random_uuid()
employee_id uuid NOT NULL
author_id uuid
author_name text NOT NULL DEFAULT 'Management'::text
category text NOT NULL DEFAULT 'general'::text
body text NOT NULL
pinned boolean NOT NULL DEFAULT false
created_at timestamp with time zone NOT NULL DEFAULT now()
updated_at timestamp with time zone NOT NULL DEFAULT now()
```

## employees

```sql
id uuid NOT NULL DEFAULT gen_random_uuid()
user_id uuid
full_name text NOT NULL
email text
position USER-DEFINED NOT NULL
primary_unit_id uuid
qualified_unit_ids ARRAY NOT NULL DEFAULT '{}'::uuid[]
scheduled_shift USER-DEFINED NOT NULL
scheduled_days ARRAY NOT NULL DEFAULT '{}'::integer[]
weekend_group text
max_hours_per_week numeric NOT NULL DEFAULT 40
hire_date date NOT NULL DEFAULT CURRENT_DATE
is_active boolean NOT NULL DEFAULT true
notes text
created_at timestamp with time zone NOT NULL DEFAULT now()
rotation_week_a_days ARRAY NOT NULL DEFAULT '{}'::integer[]
rotation_week_b_days ARRAY NOT NULL DEFAULT '{}'::integer[]
days_per_week integer NOT NULL DEFAULT 4
hourly_rate numeric NOT NULL DEFAULT 22
employment_type text NOT NULL DEFAULT 'staff'::text
termination_date date
reward_points integer NOT NULL DEFAULT 0
phone text
float_count integer NOT NULL DEFAULT 0
last_floated_on date
home_facility_id uuid
in_training boolean NOT NULL DEFAULT false
training_ends_on date
float_pool_optin boolean NOT NULL DEFAULT false
no_show_risk numeric NOT NULL DEFAULT 0
risk_label text NOT NULL DEFAULT 'unknown'::text
risk_updated_at timestamp with time zone
risk_reason text NOT NULL DEFAULT ''::text
sms_optin boolean NOT NULL DEFAULT true
payroll_id text NOT NULL DEFAULT ''::text
clock_in_number text NOT NULL DEFAULT ''::text
punch_pin text NOT NULL DEFAULT ''::text
```

## facilities

```sql
id uuid NOT NULL DEFAULT gen_random_uuid()
name text NOT NULL
address text NOT NULL DEFAULT ''::text
sort_order integer NOT NULL DEFAULT 0
weekly_labor_budget numeric NOT NULL DEFAULT 0
is_active boolean NOT NULL DEFAULT true
created_at timestamp with time zone NOT NULL DEFAULT now()
updated_at timestamp with time zone NOT NULL DEFAULT now()
```

## float_events

```sql
id uuid NOT NULL DEFAULT gen_random_uuid()
assignment_id uuid
employee_id uuid NOT NULL
from_unit_id uuid
to_unit_id uuid
shift_date date NOT NULL
shift USER-DEFINED
position USER-DEFINED
reason text NOT NULL DEFAULT 'coverage'::text
rationale text NOT NULL DEFAULT ''::text
decided_by text NOT NULL DEFAULT 'system'::text
automatic boolean NOT NULL DEFAULT false
float_count_before integer NOT NULL DEFAULT 0
seniority_rank integer
returned_home boolean NOT NULL DEFAULT false
created_at timestamp with time zone NOT NULL DEFAULT now()
```

## hire_documents

```sql
id uuid NOT NULL DEFAULT gen_random_uuid()
new_hire_id uuid
employee_id uuid
doc_type text NOT NULL
title text NOT NULL DEFAULT ''::text
status text NOT NULL DEFAULT 'not_sent'::text
sent_at timestamp with time zone
signed_at timestamp with time zone
signed_name text NOT NULL DEFAULT ''::text
signature_ip text NOT NULL DEFAULT ''::text
file_url text NOT NULL DEFAULT ''::text
notes text NOT NULL DEFAULT ''::text
created_at timestamp with time zone NOT NULL DEFAULT now()
updated_at timestamp with time zone NOT NULL DEFAULT now()
```

## import_batches

```sql
id uuid NOT NULL DEFAULT gen_random_uuid()
kind text NOT NULL
file_name text NOT NULL DEFAULT ''::text
rows_received integer NOT NULL DEFAULT 0
rows_applied integer NOT NULL DEFAULT 0
rows_skipped integer NOT NULL DEFAULT 0
status text NOT NULL DEFAULT 'pending'::text
message text NOT NULL DEFAULT ''::text
errors jsonb NOT NULL DEFAULT '[]'::jsonb
created_by text NOT NULL DEFAULT ''::text
created_at timestamp with time zone NOT NULL DEFAULT now()
updated_at timestamp with time zone NOT NULL DEFAULT now()
```

## inservice_courses

```sql
id uuid NOT NULL DEFAULT gen_random_uuid()
title text NOT NULL
description text NOT NULL DEFAULT ''::text
category text NOT NULL DEFAULT 'annual'::text
required_minutes integer NOT NULL DEFAULT 30
recurrence_months integer NOT NULL DEFAULT 12
applies_to_positions ARRAY NOT NULL DEFAULT ARRAY[]::position_type[]
required_for_new_hires boolean NOT NULL DEFAULT true
content_url text NOT NULL DEFAULT ''::text
is_active boolean NOT NULL DEFAULT true
created_at timestamp with time zone NOT NULL DEFAULT now()
updated_at timestamp with time zone NOT NULL DEFAULT now()
```

## integration_connections

```sql
id uuid NOT NULL DEFAULT gen_random_uuid()
kind text NOT NULL
slug text NOT NULL
name text NOT NULL
vendor text NOT NULL DEFAULT ''::text
direction text NOT NULL DEFAULT 'inbound'::text
transport text NOT NULL DEFAULT 'webhook'::text
auth_mode text NOT NULL DEFAULT 'api_key'::text
endpoint_path text NOT NULL DEFAULT ''::text
is_enabled boolean NOT NULL DEFAULT false
is_required boolean NOT NULL DEFAULT true
expected_every_minutes integer NOT NULL DEFAULT 1440
stale_after_minutes integer NOT NULL DEFAULT 2880
failure_threshold integer NOT NULL DEFAULT 3
fallback_mode text NOT NULL DEFAULT 'last_known_good'::text
status text NOT NULL DEFAULT 'never_synced'::text
last_message text NOT NULL DEFAULT ''::text
last_sync_at timestamp with time zone
last_success_at timestamp with time zone
last_failure_at timestamp with time zone
consecutive_failures integer NOT NULL DEFAULT 0
total_syncs integer NOT NULL DEFAULT 0
config jsonb NOT NULL DEFAULT '{}'::jsonb
notes text NOT NULL DEFAULT ''::text
created_at timestamp with time zone NOT NULL DEFAULT now()
updated_at timestamp with time zone NOT NULL DEFAULT now()
```

## integration_incidents

```sql
id uuid NOT NULL DEFAULT gen_random_uuid()
connection_id uuid NOT NULL
severity text NOT NULL DEFAULT 'warning'::text
status text NOT NULL DEFAULT 'open'::text
summary text NOT NULL DEFAULT ''::text
impact text NOT NULL DEFAULT ''::text
fallback_used text NOT NULL DEFAULT ''::text
opened_at timestamp with time zone NOT NULL DEFAULT now()
resolved_at timestamp with time zone
acknowledged_by text NOT NULL DEFAULT ''::text
details jsonb NOT NULL DEFAULT '{}'::jsonb
created_at timestamp with time zone NOT NULL DEFAULT now()
updated_at timestamp with time zone NOT NULL DEFAULT now()
```

## integration_snapshots

```sql
id uuid NOT NULL DEFAULT gen_random_uuid()
connection_id uuid NOT NULL
kind text NOT NULL
rows integer NOT NULL DEFAULT 0
captured_at timestamp with time zone NOT NULL DEFAULT now()
payload jsonb NOT NULL DEFAULT '[]'::jsonb
summary text NOT NULL DEFAULT ''::text
created_at timestamp with time zone NOT NULL DEFAULT now()
```

## integration_syncs

```sql
id uuid NOT NULL DEFAULT gen_random_uuid()
connection_id uuid NOT NULL
direction text NOT NULL DEFAULT 'inbound'::text
trigger text NOT NULL DEFAULT 'manual'::text
status text NOT NULL DEFAULT 'ok'::text
rows_received integer NOT NULL DEFAULT 0
rows_applied integer NOT NULL DEFAULT 0
rows_skipped integer NOT NULL DEFAULT 0
duration_ms integer NOT NULL DEFAULT 0
message text NOT NULL DEFAULT ''::text
details jsonb NOT NULL DEFAULT '{}'::jsonb
created_by text NOT NULL DEFAULT 'system'::text
created_at timestamp with time zone NOT NULL DEFAULT now()
```

## job_applicants

```sql
id uuid NOT NULL DEFAULT gen_random_uuid()
posting_id uuid
full_name text NOT NULL
email text
phone text
source text NOT NULL DEFAULT 'career_site'::text
stage text NOT NULL DEFAULT 'applied'::text
ai_score numeric
ai_summary text
notes text NOT NULL DEFAULT ''::text
applied_at timestamp with time zone NOT NULL DEFAULT now()
updated_at timestamp with time zone NOT NULL DEFAULT now()
```

## job_postings

```sql
id uuid NOT NULL DEFAULT gen_random_uuid()
title text NOT NULL
position USER-DEFINED NOT NULL
shift USER-DEFINED
unit_id uuid
employment_type text NOT NULL DEFAULT 'staff'::text
pay_range text NOT NULL DEFAULT ''::text
description text NOT NULL DEFAULT ''::text
status text NOT NULL DEFAULT 'open'::text
openings integer NOT NULL DEFAULT 1
created_at timestamp with time zone NOT NULL DEFAULT now()
```

## login_attempts

```sql
id uuid NOT NULL DEFAULT gen_random_uuid()
email text NOT NULL
ip text NOT NULL DEFAULT 'unknown'::text
succeeded boolean NOT NULL DEFAULT false
reason text
created_at timestamp with time zone NOT NULL DEFAULT now()
```

## marketplace_offers

```sql
id uuid NOT NULL DEFAULT gen_random_uuid()
assignment_id uuid
worker_id uuid
shift_date date NOT NULL
shift USER-DEFINED NOT NULL
unit_id uuid
position USER-DEFINED NOT NULL
offered_rate numeric NOT NULL DEFAULT 0
status text NOT NULL DEFAULT 'offered'::text
expires_at timestamp with time zone
responded_at timestamp with time zone
reason text NOT NULL DEFAULT ''::text
created_at timestamp with time zone NOT NULL DEFAULT now()
updated_at timestamp with time zone NOT NULL DEFAULT now()
```

## marketplace_workers

```sql
id uuid NOT NULL DEFAULT gen_random_uuid()
full_name text NOT NULL
position USER-DEFINED NOT NULL
phone text NOT NULL DEFAULT ''::text
email text NOT NULL DEFAULT ''::text
city text NOT NULL DEFAULT ''::text
hourly_rate numeric NOT NULL DEFAULT 0
reliability numeric NOT NULL DEFAULT 100
shifts_worked integer NOT NULL DEFAULT 0
no_shows integer NOT NULL DEFAULT 0
license_number text NOT NULL DEFAULT ''::text
license_expires_on date
status text NOT NULL DEFAULT 'pending'::text
is_active boolean NOT NULL DEFAULT true
notes text NOT NULL DEFAULT ''::text
created_at timestamp with time zone NOT NULL DEFAULT now()
updated_at timestamp with time zone NOT NULL DEFAULT now()
```

## message_outbox

```sql
id uuid NOT NULL DEFAULT gen_random_uuid()
employee_id uuid
channel text NOT NULL DEFAULT 'sms'::text
to_address text NOT NULL
body text NOT NULL
kind text NOT NULL DEFAULT 'general'::text
status text NOT NULL DEFAULT 'queued'::text
attempts integer NOT NULL DEFAULT 0
provider_id text NOT NULL DEFAULT ''::text
error text NOT NULL DEFAULT ''::text
scheduled_for timestamp with time zone NOT NULL DEFAULT now()
sent_at timestamp with time zone
created_at timestamp with time zone NOT NULL DEFAULT now()
updated_at timestamp with time zone NOT NULL DEFAULT now()
```

## messages

```sql
id uuid NOT NULL DEFAULT gen_random_uuid()
sender_id uuid
sender_name text NOT NULL DEFAULT 'Management'::text
recipient_id uuid
audience text NOT NULL DEFAULT 'all'::text
subject text NOT NULL DEFAULT ''::text
body text NOT NULL
read_at timestamp with time zone
created_at timestamp with time zone NOT NULL DEFAULT now()
```

## new_hires

```sql
id uuid NOT NULL DEFAULT gen_random_uuid()
full_name text NOT NULL
email text NOT NULL DEFAULT ''::text
phone text NOT NULL DEFAULT ''::text
position USER-DEFINED NOT NULL DEFAULT 'cna'::position_type
facility_id uuid
unit_id uuid
shift USER-DEFINED
days_per_week integer NOT NULL DEFAULT 4
hourly_rate numeric NOT NULL DEFAULT 0
employment_type text NOT NULL DEFAULT 'full_time'::text
source text NOT NULL DEFAULT ''::text
recruiter text NOT NULL DEFAULT ''::text
applicant_id uuid
offer_date date
start_date date
orientation_start date
orientation_end date
preceptor_id uuid
clock_in_number text NOT NULL DEFAULT ''::text
charting_username text NOT NULL DEFAULT ''::text
payroll_id text NOT NULL DEFAULT ''::text
emergency_contact_name text NOT NULL DEFAULT ''::text
emergency_contact_phone text NOT NULL DEFAULT ''::text
license_number text NOT NULL DEFAULT ''::text
license_expires_on date
offer_accepted boolean NOT NULL DEFAULT false
background_check_done boolean NOT NULL DEFAULT false
drug_screen_done boolean NOT NULL DEFAULT false
physical_tb_done boolean NOT NULL DEFAULT false
license_verified boolean NOT NULL DEFAULT false
paperwork_done boolean NOT NULL DEFAULT false
badge_issued boolean NOT NULL DEFAULT false
charting_login_created boolean NOT NULL DEFAULT false
orientation_scheduled boolean NOT NULL DEFAULT false
added_to_schedule boolean NOT NULL DEFAULT false
status text NOT NULL DEFAULT 'onboarding'::text
employee_id uuid
notes text NOT NULL DEFAULT ''::text
created_at timestamp with time zone NOT NULL DEFAULT now()
updated_at timestamp with time zone NOT NULL DEFAULT now()
```

## notification_attempts

```sql
id uuid NOT NULL DEFAULT gen_random_uuid()
message_id uuid
employee_id uuid
attempt_no integer NOT NULL DEFAULT 1
channel text NOT NULL DEFAULT 'sms'::text
status text NOT NULL DEFAULT 'queued'::text
error text NOT NULL DEFAULT ''::text
to_address text NOT NULL DEFAULT ''::text
actor text NOT NULL DEFAULT 'system'::text
created_at timestamp with time zone NOT NULL DEFAULT now()
```

## notification_rules

```sql
id uuid NOT NULL DEFAULT gen_random_uuid()
scope text NOT NULL DEFAULT 'role'::text
role USER-DEFINED
employee_id uuid
category text NOT NULL
in_app boolean NOT NULL DEFAULT true
sms boolean NOT NULL DEFAULT true
updated_by text NOT NULL DEFAULT ''::text
created_at timestamp with time zone NOT NULL DEFAULT now()
updated_at timestamp with time zone NOT NULL DEFAULT now()
```

## notifications

```sql
id uuid NOT NULL DEFAULT gen_random_uuid()
employee_id uuid
audience text NOT NULL DEFAULT 'employee'::text
title text NOT NULL
body text NOT NULL
read boolean NOT NULL DEFAULT false
created_at timestamp with time zone NOT NULL DEFAULT now()
```

## onboarding_phase_status

```sql
id uuid NOT NULL DEFAULT gen_random_uuid()
new_hire_id uuid NOT NULL
phase text NOT NULL
status text
started_at timestamp with time zone
completed_at timestamp with time zone
due_on date
note text NOT NULL DEFAULT ''::text
updated_by text NOT NULL DEFAULT ''::text
last_reminded_on date
reminder_count integer NOT NULL DEFAULT 0
created_at timestamp with time zone NOT NULL DEFAULT now()
updated_at timestamp with time zone NOT NULL DEFAULT now()
```

## payroll_periods

```sql
id uuid NOT NULL DEFAULT gen_random_uuid()
start_date date NOT NULL
end_date date NOT NULL
status text NOT NULL DEFAULT 'open'::text
exported_at timestamp with time zone
created_at timestamp with time zone NOT NULL DEFAULT now()
```

## point_buybacks

```sql
id uuid NOT NULL DEFAULT gen_random_uuid()
employee_id uuid NOT NULL
points_removed numeric NOT NULL
shifts_used integer NOT NULL
reason text NOT NULL DEFAULT ''::text
created_at timestamp with time zone NOT NULL DEFAULT now()
```

## profiles

```sql
id uuid NOT NULL
email text
full_name text
created_at timestamp with time zone NOT NULL DEFAULT now()
```

## pto_requests

```sql
id uuid NOT NULL DEFAULT gen_random_uuid()
employee_id uuid NOT NULL
start_date date NOT NULL
end_date date NOT NULL
reason text
status USER-DEFINED NOT NULL DEFAULT 'pending'::request_status
auto_rejected boolean NOT NULL DEFAULT false
decision_note text
submitted_at timestamp with time zone NOT NULL DEFAULT now()
```

## punch_devices

```sql
id uuid NOT NULL DEFAULT gen_random_uuid()
name text NOT NULL
unit_id uuid
device_key text NOT NULL
is_active boolean NOT NULL DEFAULT true
last_seen_at timestamp with time zone
created_at timestamp with time zone NOT NULL DEFAULT now()
updated_at timestamp with time zone NOT NULL DEFAULT now()
```

## recognitions

```sql
id uuid NOT NULL DEFAULT gen_random_uuid()
employee_id uuid NOT NULL
from_employee_id uuid
badge text NOT NULL DEFAULT 'kudos'::text
message text NOT NULL DEFAULT ''::text
points integer NOT NULL DEFAULT 10
created_at timestamp with time zone NOT NULL DEFAULT now()
```

## reward_ledger

```sql
id uuid NOT NULL DEFAULT gen_random_uuid()
employee_id uuid NOT NULL
points integer NOT NULL
reason text NOT NULL
created_at timestamp with time zone NOT NULL DEFAULT now()
```

## schedule_templates

```sql
id uuid NOT NULL DEFAULT gen_random_uuid()
name text NOT NULL
description text NOT NULL DEFAULT ''::text
unit_id uuid
position USER-DEFINED
shift USER-DEFINED
pattern jsonb NOT NULL DEFAULT '{}'::jsonb
created_at timestamp with time zone NOT NULL DEFAULT now()
```

## screening_checks

```sql
id uuid NOT NULL DEFAULT gen_random_uuid()
new_hire_id uuid
employee_id uuid
kind text NOT NULL
vendor text NOT NULL DEFAULT ''::text
reference text NOT NULL DEFAULT ''::text
status text NOT NULL DEFAULT 'not_started'::text
ordered_on date
completed_on date
result text NOT NULL DEFAULT ''::text
notes text NOT NULL DEFAULT ''::text
created_at timestamp with time zone NOT NULL DEFAULT now()
updated_at timestamp with time zone NOT NULL DEFAULT now()
```

## security_incidents

```sql
id uuid NOT NULL DEFAULT gen_random_uuid()
title text NOT NULL
severity text NOT NULL DEFAULT 'low'::text
status text NOT NULL DEFAULT 'open'::text
detected_at timestamp with time zone NOT NULL DEFAULT now()
detected_by text NOT NULL
summary text NOT NULL
impact text
remediation text
resolved_at timestamp with time zone
follow_up text
created_at timestamp with time zone NOT NULL DEFAULT now()
updated_at timestamp with time zone NOT NULL DEFAULT now()
```

## setup_steps

```sql
id uuid NOT NULL DEFAULT gen_random_uuid()
key text NOT NULL
title text NOT NULL
detail text NOT NULL DEFAULT ''::text
sort_order integer NOT NULL DEFAULT 0
status text NOT NULL DEFAULT 'todo'::text
completed_at timestamp with time zone
completed_by text NOT NULL DEFAULT ''::text
notes text NOT NULL DEFAULT ''::text
created_at timestamp with time zone NOT NULL DEFAULT now()
updated_at timestamp with time zone NOT NULL DEFAULT now()
```

## shift_assignments

```sql
id uuid NOT NULL DEFAULT gen_random_uuid()
shift_date date NOT NULL
shift USER-DEFINED NOT NULL
unit_id uuid NOT NULL
position USER-DEFINED NOT NULL
employee_id uuid
status USER-DEFINED NOT NULL DEFAULT 'scheduled'::assignment_status
hours numeric NOT NULL DEFAULT 8
is_overtime boolean NOT NULL DEFAULT false
created_by_ai boolean NOT NULL DEFAULT false
note text
created_at timestamp with time zone NOT NULL DEFAULT now()
is_float boolean NOT NULL DEFAULT false
home_unit_id uuid
float_reason text
fill_reason text
agency_staff_id uuid
agency_id uuid
is_training boolean NOT NULL DEFAULT false
preceptor_id uuid
prev_note text
```

## shift_claim_offers

```sql
id uuid NOT NULL DEFAULT gen_random_uuid()
assignment_id uuid NOT NULL
employee_id uuid NOT NULL
batch_id uuid NOT NULL
reply_code text NOT NULL DEFAULT '1'::text
phone text NOT NULL DEFAULT ''::text
status text NOT NULL DEFAULT 'sent'::text
reason text NOT NULL DEFAULT ''::text
sent_at timestamp with time zone NOT NULL DEFAULT now()
expires_at timestamp with time zone NOT NULL DEFAULT (now() + '06:00:00'::interval)
responded_at timestamp with time zone
created_at timestamp with time zone NOT NULL DEFAULT now()
updated_at timestamp with time zone NOT NULL DEFAULT now()
```

## shift_switches

```sql
id uuid NOT NULL DEFAULT gen_random_uuid()
assignment_id uuid NOT NULL
requester_id uuid NOT NULL
covering_id uuid NOT NULL
reason text
requester_confirmed boolean NOT NULL DEFAULT true
covering_confirmed boolean NOT NULL DEFAULT false
status USER-DEFINED NOT NULL DEFAULT 'pending'::request_status
validation_notes text
created_at timestamp with time zone NOT NULL DEFAULT now()
```

## staffing_alerts

```sql
id uuid NOT NULL DEFAULT gen_random_uuid()
severity text NOT NULL DEFAULT 'warning'::text
shift_date date
shift USER-DEFINED
unit_id uuid
position USER-DEFINED
message text NOT NULL
status text NOT NULL DEFAULT 'open'::text
created_at timestamp with time zone NOT NULL DEFAULT now()
```

## staffing_requirements

```sql
id uuid NOT NULL DEFAULT gen_random_uuid()
unit_id uuid NOT NULL
position USER-DEFINED NOT NULL
shift USER-DEFINED NOT NULL
required_count integer NOT NULL
```

## time_punches

```sql
id uuid NOT NULL DEFAULT gen_random_uuid()
employee_id uuid NOT NULL
assignment_id uuid
date date NOT NULL
clock_in timestamp with time zone
clock_out timestamp with time zone
minutes_worked integer NOT NULL DEFAULT 0
exception text
source text NOT NULL DEFAULT 'mobile'::text
created_at timestamp with time zone NOT NULL DEFAULT now()
device_id uuid
```

## units

```sql
id uuid NOT NULL DEFAULT gen_random_uuid()
name text NOT NULL
sort_order integer NOT NULL DEFAULT 0
target_hppd numeric NOT NULL DEFAULT 3.6
facility_id uuid
```

## user_roles

```sql
id uuid NOT NULL DEFAULT gen_random_uuid()
user_id uuid NOT NULL
role USER-DEFINED NOT NULL
```

## wage_advances

```sql
id uuid NOT NULL DEFAULT gen_random_uuid()
employee_id uuid NOT NULL
amount numeric NOT NULL
status text NOT NULL DEFAULT 'approved'::text
requested_at timestamp with time zone NOT NULL DEFAULT now()
note text NOT NULL DEFAULT ''::text
```
