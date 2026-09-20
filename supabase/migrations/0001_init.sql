-- CoverGrid core schema.
--
-- Scope is deliberately staff-scheduling only: no resident/patient or care
-- data lives here. That keeps the product out of HIPAA territory by design.
-- Multi-tenant from day one via facility_id + facility_members, even though
-- the first deployment is a single pilot facility.

create table facilities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

-- Maps an authenticated Supabase user to a facility and their role there.
-- RLS everywhere below is scoped through this table.
create table facility_members (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references facilities (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  member_role text not null check (member_role in ('owner', 'manager', 'scheduler')),
  created_at timestamptz not null default now(),
  unique (facility_id, user_id)
);

create table units (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references facilities (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

-- Facility-scoped rather than a fixed enum: naming varies (QMA vs. Med Tech,
-- for example) and facilities add roles over time.
create table roles (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references facilities (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

-- How many of a given role are required on a unit for a shift window.
create table staffing_ratios (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references units (id) on delete cascade,
  role_id uuid not null references roles (id) on delete cascade,
  shift_label text not null, -- e.g. "day", "evening", "night"
  required_count integer not null check (required_count >= 0),
  created_at timestamptz not null default now()
);

create table employees (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references facilities (id) on delete cascade,
  home_unit_id uuid references units (id) on delete set null,
  primary_role_id uuid references roles (id) on delete set null,
  full_name text not null,
  phone_number text,
  float_eligible boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table employee_certifications (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees (id) on delete cascade,
  certification text not null,
  expires_on date,
  created_at timestamptz not null default now()
);

-- Employees who cannot be scheduled together on the same shift.
create table conflict_pairs (
  id uuid primary key default gen_random_uuid(),
  employee_id_a uuid not null references employees (id) on delete cascade,
  employee_id_b uuid not null references employees (id) on delete cascade,
  reason text,
  created_at timestamptz not null default now(),
  check (employee_id_a <> employee_id_b)
);

create table shift_templates (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references units (id) on delete cascade,
  role_id uuid not null references roles (id) on delete cascade,
  shift_label text not null,
  start_time time not null,
  end_time time not null,
  days_of_week integer[] not null default '{}', -- 0=Sunday .. 6=Saturday
  created_at timestamptz not null default now()
);

create table shift_instances (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references facilities (id) on delete cascade,
  unit_id uuid not null references units (id) on delete cascade,
  role_id uuid not null references roles (id) on delete cascade,
  shift_template_id uuid references shift_templates (id) on delete set null,
  shift_date date not null,
  start_time time not null,
  end_time time not null,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'open', 'filled', 'call_off')),
  assigned_employee_id uuid references employees (id) on delete set null,
  created_at timestamptz not null default now()
);

create table call_offs (
  id uuid primary key default gen_random_uuid(),
  shift_instance_id uuid not null references shift_instances (id) on delete cascade,
  employee_id uuid not null references employees (id) on delete cascade,
  reason text,
  reported_at timestamptz not null default now()
);

-- Every outreach attempt to fill an open shift, for audit and for measuring
-- how well the fill loop is actually performing.
create table outreach_log (
  id uuid primary key default gen_random_uuid(),
  shift_instance_id uuid not null references shift_instances (id) on delete cascade,
  employee_id uuid not null references employees (id) on delete cascade,
  channel text not null default 'sms',
  message text not null,
  sent_at timestamptz not null default now(),
  response text,
  responded_at timestamptz
);

create table attendance_points (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees (id) on delete cascade,
  points numeric not null,
  reason text not null,
  occurred_at timestamptz not null default now()
);

create table time_clock_punches (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees (id) on delete cascade,
  shift_instance_id uuid references shift_instances (id) on delete set null,
  clock_in timestamptz,
  clock_out timestamptz,
  scheduled_start timestamptz,
  late_minutes integer,
  created_at timestamptz not null default now()
);

create index on units (facility_id);
create index on roles (facility_id);
create index on employees (facility_id);
create index on employees (home_unit_id);
create index on shift_instances (facility_id, shift_date);
create index on shift_instances (unit_id, shift_date);
create index on outreach_log (shift_instance_id);
create index on attendance_points (employee_id);
create index on time_clock_punches (employee_id);

-- Row-level security: every table is reachable only through a facility the
-- authenticated user belongs to.

alter table facilities enable row level security;
alter table facility_members enable row level security;
alter table units enable row level security;
alter table roles enable row level security;
alter table staffing_ratios enable row level security;
alter table employees enable row level security;
alter table employee_certifications enable row level security;
alter table conflict_pairs enable row level security;
alter table shift_templates enable row level security;
alter table shift_instances enable row level security;
alter table call_offs enable row level security;
alter table outreach_log enable row level security;
alter table attendance_points enable row level security;
alter table time_clock_punches enable row level security;

create function is_facility_member(target_facility_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from facility_members
    where facility_id = target_facility_id
      and user_id = auth.uid()
  );
$$;

create policy "members can read their facility" on facilities
  for select using (is_facility_member(id));

create policy "members can read their membership rows" on facility_members
  for select using (is_facility_member(facility_id));

create policy "members can manage units" on units
  for all using (is_facility_member(facility_id)) with check (is_facility_member(facility_id));

create policy "members can manage roles" on roles
  for all using (is_facility_member(facility_id)) with check (is_facility_member(facility_id));

create policy "members can manage staffing ratios" on staffing_ratios
  for all using (is_facility_member((select facility_id from units where units.id = unit_id)))
  with check (is_facility_member((select facility_id from units where units.id = unit_id)));

create policy "members can manage employees" on employees
  for all using (is_facility_member(facility_id)) with check (is_facility_member(facility_id));

create policy "members can manage employee certifications" on employee_certifications
  for all using (
    is_facility_member((select facility_id from employees where employees.id = employee_id))
  )
  with check (
    is_facility_member((select facility_id from employees where employees.id = employee_id))
  );

create policy "members can manage conflict pairs" on conflict_pairs
  for all using (
    is_facility_member((select facility_id from employees where employees.id = employee_id_a))
  )
  with check (
    is_facility_member((select facility_id from employees where employees.id = employee_id_a))
  );

create policy "members can manage shift templates" on shift_templates
  for all using (is_facility_member((select facility_id from units where units.id = unit_id)))
  with check (is_facility_member((select facility_id from units where units.id = unit_id)));

create policy "members can manage shift instances" on shift_instances
  for all using (is_facility_member(facility_id)) with check (is_facility_member(facility_id));

create policy "members can manage call offs" on call_offs
  for all using (
    is_facility_member(
      (select facility_id from shift_instances where shift_instances.id = shift_instance_id)
    )
  )
  with check (
    is_facility_member(
      (select facility_id from shift_instances where shift_instances.id = shift_instance_id)
    )
  );

create policy "members can manage outreach log" on outreach_log
  for all using (
    is_facility_member(
      (select facility_id from shift_instances where shift_instances.id = shift_instance_id)
    )
  )
  with check (
    is_facility_member(
      (select facility_id from shift_instances where shift_instances.id = shift_instance_id)
    )
  );

create policy "members can manage attendance points" on attendance_points
  for all using (
    is_facility_member((select facility_id from employees where employees.id = employee_id))
  )
  with check (
    is_facility_member((select facility_id from employees where employees.id = employee_id))
  );

create policy "members can manage time clock punches" on time_clock_punches
  for all using (
    is_facility_member((select facility_id from employees where employees.id = employee_id))
  )
  with check (
    is_facility_member((select facility_id from employees where employees.id = employee_id))
  );
