# CoverGrid - staffing that runs itself

A staffing and scheduling system for skilled nursing facilities (built for
Majestic Care, designed to be rebranded for any company). It builds the
schedule, watches it all day, fixes what breaks, and tells the people who need
to know. Managers stop rebuilding spreadsheets; the building stops running
short-staffed.

## The two systems inside it

1. **The assistant** - a chat box a manager or scheduler talks to. It answers
   questions about the schedule and _does_ the work: "Mark Sarah Jenkins as a
   call-off on first shift tonight" records it, starts the search for coverage,
   and logs who asked. If two people are named Sarah it asks which one instead
   of guessing.
2. **The autopilot** - a background job that runs every hour, with no one
   watching. It extends the schedule, fills gaps, chases call-offs, checks
   attendance, keeps census and hours-per-patient-day honest, flags expiring
   licenses, and writes down everything it did. A "watch only" switch lets a
   facility see what it _would_ do before it lets it act.

Everything is described as _the system runs itself_ - never as AI-controlled.
The people using it are older, non-technical staff.

## What each person sees

- **Employee** - their own shifts, a pickup/marketplace board, shift swaps,
  call-off reporting, time clock and instant pay, points and what they mean,
  PTO, required training, messages, and a mobile layout with a bottom bar.
- **Manager / scheduler** - the schedule board (draggable columns per unit),
  dashboard with a Sunday-Saturday hours-per-patient-day chart against a goal
  line, coverage alerts, low-census recommendations, agency use and budget
  caps, hiring pipeline, new-hire onboarding with a readiness checklist and
  timeline, QMA orientation and shadowing, compliance and credentials,
  payroll export, notifications history, activity log with undo.
- **Administrator** - everything a manager sees plus the PPD goal, branding
  colours, the control room (change the app's own configuration in plain
  language), security and access review, two-step sign-in, and vendor/control
  inventory.

## The rules it enforces

- Week runs **Sunday through Saturday**. Two-week A/B rotation, 4 days a week by
  default, every other weekend.
- Units **Birch, Cedar, Dogwood**; positions **nurse, QMA, CNA**; shifts
  **first** (6a), **second** (2p), **third** (10p). CNAs/QMAs 8 hours, nurses 8.5.
- Minimum headcount per unit, shift and position; a safety buffer of one extra
  person per shift the system tries to keep on the floor.
- **Attendance:** 7-minute grace, more than 2 hours late is a call-off, late
  0.5 points, call-off 1 point, points fall off after 12 months, steps at
  3 / 5 / 7 / 8 points with a determination review at 8.
- **Buy-back** (off by default, fully toggleable): 3 shifts picked up removes 1
  point, up to 3 points a year.
- **Hours per patient day:** target 3.6 per unit, goal changeable by
  administrators only; a day above goal shows red on the dashboard.
- PTO needs 31 days' notice, 8 hours minimum rest between shifts, overtime
  counted above 40 hours, and no one is scheduled into a conflict.
- Call-off risk: everyone carries a likelihood score built from their own
  history, so the system can warn before a pattern costs a shift.
- Quiet hours 9pm-6am: nothing gets texted a person in that window.
- Licenses are watched a week ahead and the person is told.

## What happens by itself, hourly

Extend the schedule horizon (6 weeks) - auto-fill open shifts by seniority,
recent floats and fairness - monitor coverage for 14 days and raise alerts -
attendance sweep and buy-back - census rows - punch sweep - payroll periods -
hiring requisitions when a unit is short - data retention - credential sweep -
call-off risk recalculation - training and paperwork - integration health
(census feeds degrade instead of breaking) - per-diem marketplace - in-service
compliance - onboarding nudges - corporate roll-up alerts - send the message
outbox. Every action is written to an immutable audit log, and the last ten
minutes of any of it can be undone by a manager.

## Texting and clocks

Staff can text the facility number to claim an open shift; wall clocks and
tablets post punches with their own device key. Both are wired up in code and
need a Twilio account and device keys before they go live.

## Under the hood

React 19 + TanStack Start (full-stack, server functions and file routes),
Tailwind CSS 4, shadcn components, a Postgres back end with row-level security
(auth, roles in a separate table, no roles on the profile row), pg_cron for the
hourly job, and an MCP server so an outside assistant can act on a user's own
permissions. Two-step sign-in, login lockouts, leaked-password checks, idle
sign-out, immutable audit trail and data-retention settings for the SOC 2 story.

## Honest current state

Single facility seeded with 129 staff and about six weeks of schedule; texting
credentials never configured; one building (multi-facility roll-up exists in
code but has one row of real data); payroll is export files, not a live payroll
connection.
