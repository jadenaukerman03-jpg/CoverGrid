# CoverGrid

CoverGrid is an AI-native shift scheduling system for nursing homes and long-term care
facilities. It aims to replace incumbent tools like OnShift by running the call-off-to-coverage
loop end to end — detect a gap, rank eligible staff, text them, confirm the fill, and escalate to
a manager only when it's genuinely stuck — instead of leaving that loop to a human scheduler.

Scope is deliberately staff-scheduling only: no resident/patient or care data. See
[docs/project-plan.md](docs/project-plan.md) for the full product plan, data model, and roadmap.

## Development

Use npm and the committed lockfile:

```sh
npm ci
npm run dev
```

Copy `.env.example` to an ignored local `.env` file and configure the required values there. Never
commit `.env` files or credentials.

## Validation

Run the local quality gate with:

```sh
npm run check
```

## Database

Schema lives in `supabase/migrations`. Every table is scoped to a facility through
`facility_members` and enforced with row-level security — see
`supabase/migrations/0001_init.sql`.
