# Database at a glance

Everything here was read from the running back end, not copied from a design note.

## The facility this was built for

- One building, three units: **Birch**, **Cedar**, **Dogwood**. Each carries a
  target of **3.6 hours per patient day**.
- Positions: **nurse**, **qma**, **cna** (the `position_type` enum).
- Shifts: **first** 6:00 AM-2:00 PM (nurses 2:30 PM), **second** 2:00 PM-10:00 PM
  (nurses 10:30 PM), **third** 10:00 PM-6:00 AM (nurses 6:30 AM).
  CNAs and QMAs work 8 hours; nurses work 8.5.
- Scheduling weeks run **Sunday through Saturday**.
- Each unit and shift has a minimum headcount per position stored in
  `staffing_requirements` (columns: `unit_id`, `position`, `shift`, `required_count`).

## What is in the database

58 tables in the `public` schema. Row counts at the time of the copy:

```text
access_reviews (0)                 payroll_periods (7)
agencies (2)                       point_buybacks (0)
agency_staff (0)                   profiles (1)
app_config (2)                     pto_requests (3)
attendance_events (30)             punch_devices (0)
audit_log (1685)                   recognitions (0)
automation_runs (628)              reward_ledger (1621)
automation_settings (1)            schedule_templates (0)
call_off_intakes (0)               screening_checks (0)
census_days (246)                  security_incidents (0)
census_imports (2)                 setup_steps (10)
chat_messages (30)                 shift_assignments (5492)
compliance_items (12)              shift_claim_offers (0)
course_completions (0)             shift_switches (0)
employee_credentials (1)           staffing_alerts (419)
employee_notes (0)                 staffing_requirements (18)
employees (129)                    time_punches (2114)
facilities (1)                     units (3)
float_events (0)                   user_roles (1)
hire_documents (0)                 wage_advances (0)
import_batches (0)
inservice_courses (8)
integration_connections (6)
integration_incidents (4)
integration_snapshots (3)
integration_syncs (11)
job_applicants (0)
job_postings (36)
login_attempts (0)
marketplace_offers (0)
marketplace_workers (0)
message_outbox (0)
messages (0)
new_hires (0)
notification_attempts (0)
notification_rules (12)
notifications (4630)
onboarding_phase_status (0)
```

Full column definitions: `database/schema-tables.md`.
Complete history that built it, replayable on a fresh database: `database/schema-full.sql`.

## Values the rules are made of

Enums (from `public`):

```text
app_role            employee | manager | admin
position_type       nurse | cna | qma
shift_type          first | second | third
assignment_status   scheduled | completed | called_off | open | swapped | cancelled
attendance_kind     late | call_off
request_status      pending | approved | rejected | cancelled
```

Extensions in use: `pgcrypto`, `uuid-ossp`, `pg_net`, `pg_cron`, `pg_stat_statements`,
`supabase_vault`.

## Security-defining functions

Elevated checks live in a **`private`** schema that the data API cannot reach, so
nobody can call them from a browser:

```text
private.has_role(_user_id, _role)      SECURITY DEFINER
private.is_manager(_user_id)           SECURITY DEFINER
private.current_employee_id()          SECURITY DEFINER
```

The `public` versions of the same three names are plain `SECURITY INVOKER`
wrappers - they only work where a policy would already let you see the answer.
Others:

```text
public.handle_new_user()          SECURITY DEFINER  creates a profile when someone signs up
public.audit_log_immutable()      trigger that stops audit rows being changed or removed
public.update_updated_at_column() keeps updated_at current
```

## The job that runs the place

One scheduled job in `cron.job`:

```text
jobname   CoverGrid-automation-hourly
schedule  15 * * * *            (quarter past every hour)
command   net.http_post to /api/public/hooks/automation on this project's URL
```

That endpoint runs `runAutomationCycle()`, which does, in order: extend the
schedule horizon, auto-fill gaps, monitor coverage, sweep attendance (including
point buy-back), ensure census rows exist, sweep punches, open payroll periods,
raise hiring requisitions, apply data retention, check credentials/licenses,
recalculate call-off risk, sweep training and paperwork, check integration
health, refresh the per-diem marketplace, sweep in-service compliance, nudge
onboarding phases, evaluate corporate alert rules, then flush the message outbox.
Every run is written to `automation_runs` and the audit log.

## Settings that change behaviour

`automation_settings` is a single row. Defaults as built:

```text
autopilot_enabled            true        watch_only              false
coverage_buffer              1 person    auto_fill_days          7
horizon_weeks                6           seniority_weight        1
recency_weight               1           sms_enabled             true
quiet_hours                  21:00-06:00 ppd_goal                3.6  (administrators only)
buyback_enabled              false       buyback_shifts_required 3
buyback_points_removed       1           buyback_max_points_per_year 3
notify_onboarding            true        notify_schedule_updates true
notify_delivery_failures     true        undo_window_minutes     10
session_timeout_minutes      30          access_review_days      90
data_retention_days          2555        audit_retention_days    2555
message_retention_days       730
```

`app_config` holds the brand (`appName: "CoverGrid"`, `tagline: "Staffing that
runs itself"`) and the corporate roll-up alert rules (PPD over goal, agency
spending above 15%, enabled).

## Attendance policy (from `src/lib/facility.ts`)

```text
Late grace                 7 minutes after start
Call-off threshold         more than 120 minutes late counts as a call-off
Points: late               0.5
Points: call-off           1
Points fall off after      a rolling 12 months
Progressive steps          3 verbal coaching, 5 written warning, 7 final warning,
                           8 determination point (employment reviewed)
PTO notice required        31 days
Minimum rest between shifts 8 hours
Overtime threshold         40 hours
Rotation                   two-week A/B, anchored 2026-01-04, 4 days a week by default
```

## How records connect

```text
attendance_events.employee_id -> employees            new_hires.preceptor_id -> employees
attendance_events.assignment_id -> shift_assignments  new_hires.unit_id -> units
call_off_intakes.employee_id -> employees             new_hires.facility_id -> facilities
census_days.unit_id -> units                          onboarding_phase_status.new_hire_id -> new_hires
course_completions.course_id -> inservice_courses     payroll_periods (manager-only)
course_completions.employee_id -> employees           point_buybacks.employee_id -> employees
course_completions.new_hire_id -> new_hires           pto_requests.employee_id -> employees
employee_credentials.employee_id -> employees         punch_devices.unit_id -> units
employee_notes.employee_id -> employees               recognitions.employee_id -> employees
employee_notes.author_id -> employees                 reward_ledger.employee_id -> employees
employees.home_facility_id -> facilities              schedule_templates.unit_id -> units
employees.primary_unit_id -> units                    screening_checks.employee_id -> employees
float_events.employee_id -> employees                 shift_assignments.employee_id -> employees
float_events.assignment_id -> shift_assignments       shift_assignments.unit_id -> units
float_events.from_unit_id -> units                    shift_assignments.home_unit_id -> units
float_events.to_unit_id -> units                      shift_assignments.agency_id -> agencies
hire_documents.new_hire_id -> new_hires               shift_assignments.agency_staff_id -> agency_staff
hire_documents.employee_id -> employees               shift_assignments.preceptor_id -> employees
integration_connections -> syncs/snapshots/incidents  shift_claim_offers.assignment_id -> shift_assignments
job_applicants.posting_id -> job_postings             shift_switches.requester_id -> employees
job_postings.unit_id -> units                         shift_switches.covering_id -> employees
marketplace_offers.worker_id -> marketplace_workers   staffing_alerts.unit_id -> units
marketplace_offers.unit_id -> units                   staffing_requirements.unit_id -> units
marketplace_offers.assignment_id -> shift_assignments time_punches.employee_id -> employees
message_outbox.employee_id -> employees               time_punches.assignment_id -> shift_assignments
messages.sender_id -> employees                       time_punches.device_id -> punch_devices
messages.recipient_id -> employees                    units.facility_id -> facilities
new_hires.applicant_id -> job_applicants              wage_advances.employee_id -> employees
new_hires.employee_id -> employees                    agency_staff.agency_id -> agencies
notification_attempts.employee_id -> employees        notification_rules.employee_id -> employees
notifications.employee_id -> employees
```
