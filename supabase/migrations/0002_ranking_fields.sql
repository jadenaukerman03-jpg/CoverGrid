-- Fields the call-off ranking engine (src/services/scheduling/rank-candidates.ts)
-- needs but weren't captured in the initial schema.

alter table employees
  add column max_weekly_hours numeric not null default 40,
  add column preferred_unit_ids uuid[] not null default '{}';
