# CoverGrid — project plan

## Positioning

Not a scheduling tool — a scheduling operator. The differentiator isn't a nicer UI: the system
runs the call-off-fill loop end to end (detect the gap, rank eligible candidates, text them,
confirm the fill, update the board, escalate to a human only when it's actually stuck) instead of
handing a scheduler a dashboard and making them run that loop by hand all day.

Built as a standalone replacement for OnShift, not an OnShift-integrated module — a module that
proves the idea inside their ecosystem is trivial for a much larger incumbent to clone once
proven. The moat only exists if the product stands on its own.

## Competitive landscape (as researched September 2026)

- **Smartlinx**, **Viventium** — closest direct competitors in the long-term care /
  senior-living niche.
- **PointClickCare**, **MatrixCare** (absorbed SigmaCare) — EHR platforms that bundle scheduling
  as a module.
- **American HealthTech**, **Eldermark**, **StaffScheduleCare** — smaller, LTC-focused.
- **IntelyCare**, **connectRN** — per-diem staffing marketplaces; a facility that gets good at
  gig-filling call-offs is itself competition for a scheduling product.
- **In-House Health** — AI-driven predictive nurse scheduling, hospital-focused today. Proof the
  "AI runs the schedule" thesis is being built right now, not hypothetical.
- **myshyft**, **Workforce.com** — broader workforce-management players pushing AI scheduling
  into healthcare.

OnShift's known gaps: legacy UX, clock/schedule reconciliation issues, and — notably — no built-in
attendance point tracking, despite point systems being standard in LTC HR policy for progressive
discipline.

## v1 (MVP) scope

Not full autonomy on day one — trust has to be earned. v1 needs to beat OnShift for a working
scheduler's daily grind:

- Schedule grid by unit × shift × role, built from natural-language input ("Unit 3 needs 2 CNAs
  and 1 QMA on nights") instead of a rigid setup wizard.
- Employee profiles: home unit, certifications, float eligibility/rotation order, preferences,
  conflict pairs.
- Call-off handling: detect the gap, rank eligible staff (home unit first, then float-eligible,
  respecting ratios/certs/overtime rules), text them, log responses, update the board live.
- Attendance points tied to the time clock (late clock-ins, no-call-no-shows).
- **CMS Payroll-Based Journal (PBJ) export.** Nursing homes are federally required to submit
  staffing data to CMS quarterly, feeding directly into the public Five-Star staffing rating. This
  is core v1 scope, not a later add-on — without it, no facility can fully replace their current
  system with this one.

## Core data model

See `supabase/migrations/0001_init.sql` for the implemented version.

```
Facility -> Unit -> Role (CNA / LPN / RN / QMA) -> StaffingRatio (role count required per unit per shift)
Employee -> HomeUnit, Certifications, FloatEligibility, Preferences, ConflictPairs
ShiftTemplate -> ShiftInstance (date / unit / role / status)
CallOff -> CandidateRanking -> OutreachLog (who was texted, when, response)
TimeClockPunch -> AttendancePoint (policy-driven: late = X, no-call-no-show = Y, rolling window)
BonusOffer (AI-drafted, manager-approved, broadcast)
```

## Architecture — keep the solver and the AI separate

The actual shift-assignment logic should be a deterministic constraint solver, not an LLM.
Staffing ratios and labor law are legally consequential — output needs to be auditable and
reproducible when a state surveyor or labor board asks "why was this unit staffed this way on
this date." Nurse/shift rostering is a well-studied constraint-satisfaction problem; use Google
OR-Tools CP-SAT for the assignment engine (hard constraints: ratios, certifications, max hours, no
double-booking, rest rules), as a separate service the app calls internally.

Use an LLM (Claude) for the layer around the solver, where fuzziness is fine and desirable:

- Turning free-text input into structured schedule/staffing data.
- Drafting and conducting the two-way texting conversation with staff (offer, confirm, decline,
  counter).
- Drafting bonus-offer messages and manager summaries.
- Explaining _why_ the solver made a given assignment, in plain language.

## Escalation ladder

1. Solver detects a gap, ranks eligible candidates.
2. AI texts the ranked list, tracks responses, fills automatically on acceptance.
3. If unfilled after N minutes, notify the manager, optionally draft a pickup-bonus offer for
   approval.
4. Manager approves/edits, broadcasts, fills or takes manual action.
5. Every step is logged — this log is the defensibility record and doubles as the
   points/attendance audit trail.

## Compliance scope

- **In scope, real:** federal PBJ reporting, state predictive-scheduling / fair-workweek laws
  where applicable, wage-and-hour rules (overtime, meal/rest breaks) as hard solver constraints.
- **Explicitly out of scope for v1:** resident/patient census or care data. Keeping the product
  strictly on the staffing side keeps it out of HIPAA territory by design. Don't let scope creep
  pull resident data in later without redoing this analysis.
- Get a healthcare/labor attorney review before a pilot goes live with real payroll/attendance
  consequences — not before writing code.

## Stack

- **App**: TanStack Start + TypeScript + Supabase (Postgres, RLS fits multi-facility tenancy
  naturally).
- **Scheduling engine**: separate Python service running OR-Tools CP-SAT (Phase 2+), called
  internally by the app.
- **Messaging**: Twilio, two-way SMS.
- **AI**: Anthropic Claude API for NL intake, texting conversations, and summaries.
- Multi-tenant from day one (`facility_id` on everything) even with a single pilot facility.

## Phased roadmap

- **Phase 0** — Validate the data model against real policy docs with people from the pilot
  facility before building further.
- **Phase 1 (MVP)** — Manual schedule builder + NL data intake + call-off detection with ranked
  suggestions; a human still sends the text.
- **Phase 2** — AI-driven two-way texting and auto-fill confirmation (introduces the CP-SAT
  solver service).
- **Phase 3** — Time clock integration, points engine, PBJ export.
- **Phase 4** — Call-off risk prediction, autonomous bonus offers, manager escalation AI.
- **Phase 5** — Multi-facility rollout, chain-level analytics. This is the point it's a genuine
  OnShift replacement, not before.

## Go-to-market

Pilot with one facility through existing personal relationships, positioned as a design partner
(discounted/free in exchange for being the case study). Prove Phases 1-2 there before building
Phase 3+.
