-- ============================================================
-- CoverGrid - complete database history, in order.
-- Everything the back end needs: tables, access rules, triggers,
-- and the hourly job. Replay on a fresh database to rebuild state.
-- ============================================================

-- ------------------------------------------------------------
-- 20260812070232_2d2ab634-5466-418d-bf1c-ab76c3e87c8f.sql
-- ------------------------------------------------------------
-- ============ ENUMS ============
create type public.app_role as enum ('employee','manager','admin');
create type public.position_type as enum ('nurse','cna');
create type public.shift_type as enum ('first','second','third');
create type public.assignment_status as enum ('scheduled','completed','called_off','open','swapped','cancelled');
create type public.request_status as enum ('pending','approved','rejected','cancelled');
create type public.attendance_kind as enum ('late','call_off');

-- ============ PROFILES ============
create table public.profiles (
  id uuid primary key,
  email text,
  full_name text,
  created_at timestamptz not null default now()
);
grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;

-- ============ ROLES ============
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  role public.app_role not null,
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create or replace function public.is_manager(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role in ('manager','admin'))
$$;

-- ============ UNITS / REQUIREMENTS ============
create table public.units (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order int not null default 0
);
grant select on public.units to authenticated;
grant all on public.units to service_role;
alter table public.units enable row level security;

create table public.staffing_requirements (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.units(id) on delete cascade,
  position public.position_type not null,
  shift public.shift_type not null,
  required_count int not null check (required_count >= 0),
  unique (unit_id, position, shift)
);
grant select on public.staffing_requirements to authenticated;
grant all on public.staffing_requirements to service_role;
alter table public.staffing_requirements enable row level security;

-- ============ EMPLOYEES ============
create table public.employees (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique,
  full_name text not null,
  email text unique,
  position public.position_type not null,
  primary_unit_id uuid references public.units(id),
  qualified_unit_ids uuid[] not null default '{}',
  scheduled_shift public.shift_type not null,
  scheduled_days int[] not null default '{}',
  weekend_group text check (weekend_group in ('A','B')),
  max_hours_per_week numeric not null default 40,
  hire_date date not null default current_date,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now()
);
grant select, update on public.employees to authenticated;
grant all on public.employees to service_role;
alter table public.employees enable row level security;

create or replace function public.current_employee_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.employees where user_id = auth.uid() limit 1
$$;

-- ============ SHIFT ASSIGNMENTS ============
create table public.shift_assignments (
  id uuid primary key default gen_random_uuid(),
  shift_date date not null,
  shift public.shift_type not null,
  unit_id uuid not null references public.units(id) on delete cascade,
  position public.position_type not null,
  employee_id uuid references public.employees(id) on delete set null,
  status public.assignment_status not null default 'scheduled',
  hours numeric not null default 8,
  is_overtime boolean not null default false,
  created_by_ai boolean not null default false,
  note text,
  created_at timestamptz not null default now()
);
create index on public.shift_assignments (shift_date, shift, unit_id);
create index on public.shift_assignments (employee_id, shift_date);
grant select, insert, update, delete on public.shift_assignments to authenticated;
grant all on public.shift_assignments to service_role;
alter table public.shift_assignments enable row level security;

-- ============ ATTENDANCE ============
create table public.attendance_events (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  assignment_id uuid references public.shift_assignments(id) on delete set null,
  kind public.attendance_kind not null,
  points numeric not null,
  minutes_late int,
  occurred_at timestamptz not null default now(),
  note text
);
grant select, insert on public.attendance_events to authenticated;
grant all on public.attendance_events to service_role;
alter table public.attendance_events enable row level security;

-- ============ PTO ============
create table public.pto_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  reason text,
  status public.request_status not null default 'pending',
  auto_rejected boolean not null default false,
  decision_note text,
  submitted_at timestamptz not null default now()
);
grant select, insert, update on public.pto_requests to authenticated;
grant all on public.pto_requests to service_role;
alter table public.pto_requests enable row level security;

-- ============ SHIFT SWITCHES ============
create table public.shift_switches (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.shift_assignments(id) on delete cascade,
  requester_id uuid not null references public.employees(id) on delete cascade,
  covering_id uuid not null references public.employees(id) on delete cascade,
  reason text,
  requester_confirmed boolean not null default true,
  covering_confirmed boolean not null default false,
  status public.request_status not null default 'pending',
  validation_notes text,
  created_at timestamptz not null default now()
);
grant select, insert, update on public.shift_switches to authenticated;
grant all on public.shift_switches to service_role;
alter table public.shift_switches enable row level security;

-- ============ ALERTS / AUDIT / NOTIFICATIONS ============
create table public.staffing_alerts (
  id uuid primary key default gen_random_uuid(),
  severity text not null default 'warning',
  shift_date date,
  shift public.shift_type,
  unit_id uuid references public.units(id) on delete cascade,
  position public.position_type,
  message text not null,
  status text not null default 'open',
  created_at timestamptz not null default now()
);
grant select, insert, update on public.staffing_alerts to authenticated;
grant all on public.staffing_alerts to service_role;
alter table public.staffing_alerts enable row level security;

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor text not null default 'ai',
  action text not null,
  entity text,
  entity_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
grant select, insert on public.audit_log to authenticated;
grant all on public.audit_log to service_role;
alter table public.audit_log enable row level security;

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid references public.employees(id) on delete cascade,
  audience text not null default 'employee',
  title text not null,
  body text not null,
  read boolean not null default false,
  created_at timestamptz not null default now()
);
grant select, insert, update on public.notifications to authenticated;
grant all on public.notifications to service_role;
alter table public.notifications enable row level security;

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  role text not null,
  content text not null,
  created_at timestamptz not null default now()
);
grant select, insert, delete on public.chat_messages to authenticated;
grant all on public.chat_messages to service_role;
alter table public.chat_messages enable row level security;

-- ============ POLICIES ============
create policy "own profile" on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_manager(auth.uid()));
create policy "update own profile" on public.profiles for update to authenticated
  using (id = auth.uid());

create policy "read own roles" on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.is_manager(auth.uid()));

create policy "read units" on public.units for select to authenticated using (true);
create policy "read requirements" on public.staffing_requirements for select to authenticated using (true);

create policy "read employees" on public.employees for select to authenticated using (true);
create policy "managers update employees" on public.employees for update to authenticated
  using (public.is_manager(auth.uid()));

create policy "read schedule" on public.shift_assignments for select to authenticated using (true);
create policy "managers write schedule" on public.shift_assignments for insert to authenticated
  with check (public.is_manager(auth.uid()));
create policy "managers modify schedule" on public.shift_assignments for update to authenticated
  using (public.is_manager(auth.uid()));
create policy "managers delete schedule" on public.shift_assignments for delete to authenticated
  using (public.is_manager(auth.uid()));

create policy "own attendance" on public.attendance_events for select to authenticated
  using (employee_id = public.current_employee_id() or public.is_manager(auth.uid()));
create policy "managers add attendance" on public.attendance_events for insert to authenticated
  with check (public.is_manager(auth.uid()));

create policy "own pto" on public.pto_requests for select to authenticated
  using (employee_id = public.current_employee_id() or public.is_manager(auth.uid()));
create policy "submit own pto" on public.pto_requests for insert to authenticated
  with check (employee_id = public.current_employee_id());
create policy "managers decide pto" on public.pto_requests for update to authenticated
  using (public.is_manager(auth.uid()));

create policy "involved switches" on public.shift_switches for select to authenticated
  using (requester_id = public.current_employee_id() or covering_id = public.current_employee_id() or public.is_manager(auth.uid()));
create policy "create own switch" on public.shift_switches for insert to authenticated
  with check (requester_id = public.current_employee_id() or public.is_manager(auth.uid()));
create policy "update involved switch" on public.shift_switches for update to authenticated
  using (covering_id = public.current_employee_id() or public.is_manager(auth.uid()));

create policy "managers read alerts" on public.staffing_alerts for select to authenticated
  using (public.is_manager(auth.uid()));
create policy "managers write alerts" on public.staffing_alerts for insert to authenticated
  with check (public.is_manager(auth.uid()));
create policy "managers update alerts" on public.staffing_alerts for update to authenticated
  using (public.is_manager(auth.uid()));

create policy "managers read audit" on public.audit_log for select to authenticated
  using (public.is_manager(auth.uid()));
create policy "insert audit" on public.audit_log for insert to authenticated with check (true);

create policy "own notifications" on public.notifications for select to authenticated
  using (employee_id = public.current_employee_id() or (audience = 'manager' and public.is_manager(auth.uid())));
create policy "update own notifications" on public.notifications for update to authenticated
  using (employee_id = public.current_employee_id() or public.is_manager(auth.uid()));

create policy "own chat" on public.chat_messages for select to authenticated using (user_id = auth.uid());
create policy "insert own chat" on public.chat_messages for insert to authenticated with check (user_id = auth.uid());
create policy "delete own chat" on public.chat_messages for delete to authenticated using (user_id = auth.uid());

-- ============ NEW USER HANDLING ============
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  is_first boolean;
  matched_employee uuid;
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)))
  on conflict (id) do nothing;

  select count(*) = 0 into is_first from public.user_roles;
  insert into public.user_roles (user_id, role)
  values (new.id, case when is_first then 'admin'::public.app_role else 'employee'::public.app_role end)
  on conflict do nothing;

  select id into matched_employee from public.employees where lower(email) = lower(new.email) and user_id is null limit 1;
  if matched_employee is not null then
    update public.employees set user_id = new.id where id = matched_employee;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- ============ SEED: UNITS + REQUIREMENTS ============
insert into public.units (name, sort_order) values ('Birch',1),('Cedar',2),('Dogwood',3);

insert into public.staffing_requirements (unit_id, position, shift, required_count)
select u.id, r.position::public.position_type, r.shift::public.shift_type, r.cnt
from public.units u
join (values
  ('Birch','cna','first',4),('Cedar','cna','first',4),('Dogwood','cna','first',2),
  ('Birch','cna','second',3),('Cedar','cna','second',3),('Dogwood','cna','second',3),
  ('Birch','cna','third',2),('Cedar','cna','third',2),('Dogwood','cna','third',2),
  ('Birch','nurse','first',2),('Cedar','nurse','first',3),('Dogwood','nurse','first',2),
  ('Birch','nurse','second',2),('Cedar','nurse','second',3),('Dogwood','nurse','second',2),
  ('Birch','nurse','third',1),('Cedar','nurse','third',2),('Dogwood','nurse','third',1)
) as r(unit, position, shift, cnt) on r.unit = u.name;

-- ============ SEED: EMPLOYEES ============
do $$
declare
  firsts text[] := array['Avery','Jordan','Riley','Casey','Morgan','Taylor','Skyler','Quinn','Jamie','Rowan','Harper','Emerson','Dakota','Reese','Finley','Sawyer','Blake','Peyton','Kendall','Marley','Devon','Elliot','Hayden','Sage','Tatum','Nico','Aubrey','Ellis','Kai','Remy'];
  lasts text[] := array['Nguyen','Patel','Garcia','Johnson','Okafor','Rivera','Kim','Brooks','Delgado','Hughes','Ibrahim','Novak','Silva','Turner','Walsh','Yamada','Zamora','Bennett','Castro','Dunn','Foster','Grant','Hale','Iverson','Jensen','Keller','Lozano','Mercer','Nash','Ortiz'];
  req record;
  slot int;
  variant int;
  idx int := 0;
  nm text;
  days int[];
  wg text;
begin
  for req in select sr.*, u.name as unit_name from public.staffing_requirements sr join public.units u on u.id = sr.unit_id order by u.sort_order, sr.position, sr.shift loop
    for slot in 1..req.required_count loop
      for variant in 1..3 loop
        idx := idx + 1;
        nm := firsts[1 + (idx % array_length(firsts,1))] || ' ' || lasts[1 + ((idx * 7) % array_length(lasts,1))];
        if variant = 1 then days := array[1,2,3,4]; wg := null;
        elsif variant = 2 then days := array[5]; wg := 'A';
        else days := array[]::int[]; wg := 'B';
        end if;
        insert into public.employees (full_name, email, position, primary_unit_id, qualified_unit_ids, scheduled_shift, scheduled_days, weekend_group, max_hours_per_week, hire_date)
        values (
          nm,
          'staff' || idx || '@birchwoodcare.test',
          req.position,
          req.unit_id,
          (select array_agg(id) from public.units where id = req.unit_id or (idx % 3 = 0)),
          req.shift,
          days,
          wg,
          case when variant = 1 then 40 else 24 end,
          current_date - ((idx * 37) % 1400)
        );
      end loop;
    end loop;
  end loop;
end $$;

-- ============ SEED: SCHEDULE ============
insert into public.shift_assignments (shift_date, shift, unit_id, position, employee_id, hours, status)
select d::date,
       e.scheduled_shift,
       e.primary_unit_id,
       e.position,
       e.id,
       case when e.position = 'nurse' then 8.5 else 8 end,
       case when d::date < current_date then 'completed'::public.assignment_status else 'scheduled'::public.assignment_status end
from public.employees e
cross join generate_series(date_trunc('week', current_date)::date - 14, date_trunc('week', current_date)::date + 20, interval '1 day') d
where
  (extract(dow from d)::int = any(e.scheduled_days))
  or (
    extract(dow from d)::int in (0,6)
    and e.weekend_group is not null
    and (
      (floor((((case when extract(dow from d)::int = 0 then d::date - 1 else d::date end) - (date_trunc('week', current_date)::date)))::numeric / 7))::int % 2 = 0
    ) = (e.weekend_group = 'A')
  );

update public.shift_assignments
set status = 'called_off'
where id in (
  select id from public.shift_assignments
  where shift_date between current_date and current_date + 3 and status = 'scheduled'
  order by md5(id::text) limit 6
);

insert into public.attendance_events (employee_id, assignment_id, kind, points, minutes_late, occurred_at, note)
select sa.employee_id, sa.id, 'call_off', 1, null, sa.shift_date::timestamptz, 'Called off'
from public.shift_assignments sa where sa.status = 'called_off' and sa.employee_id is not null;

insert into public.attendance_events (employee_id, assignment_id, kind, points, minutes_late, occurred_at, note)
select sa.employee_id, sa.id, 'late', 0.5, 12 + (abs(hashtext(sa.id::text)) % 40), sa.shift_date::timestamptz, 'Clocked in late'
from public.shift_assignments sa
where sa.shift_date between current_date - 14 and current_date - 1
  and sa.employee_id is not null
  and abs(hashtext(sa.id::text)) % 37 = 0;

insert into public.pto_requests (employee_id, start_date, end_date, reason, status)
select id, current_date + 45, current_date + 49, 'Family vacation', 'pending' from public.employees order by full_name limit 3;

insert into public.staffing_alerts (severity, shift_date, shift, unit_id, position, message)
select 'critical', sa.shift_date, sa.shift, sa.unit_id, sa.position,
       'Call-off leaves ' || u.name || ' ' || sa.shift || ' shift short one ' || sa.position || '. Replacement search recommended.'
from public.shift_assignments sa join public.units u on u.id = sa.unit_id
where sa.status = 'called_off';
;

-- ------------------------------------------------------------
-- 20260812070246_8a78d9bf-15dd-4758-81f7-b1e88d74f9f1.sql
-- ------------------------------------------------------------
revoke all on function public.has_role(uuid, public.app_role) from public, anon;
revoke all on function public.is_manager(uuid) from public, anon;
revoke all on function public.current_employee_id() from public, anon;
revoke all on function public.handle_new_user() from public, anon, authenticated;
grant execute on function public.has_role(uuid, public.app_role) to authenticated;
grant execute on function public.is_manager(uuid) to authenticated;
grant execute on function public.current_employee_id() to authenticated;
;

-- ------------------------------------------------------------
-- 20260813053208_e1bdfd5c-adc6-4b5d-9530-a5bed03f2c36.sql
-- ------------------------------------------------------------
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS rotation_week_a_days integer[] NOT NULL DEFAULT '{}'::integer[],
  ADD COLUMN IF NOT EXISTS rotation_week_b_days integer[] NOT NULL DEFAULT '{}'::integer[],
  ADD COLUMN IF NOT EXISTS days_per_week integer NOT NULL DEFAULT 4;

UPDATE public.employees e
SET rotation_week_a_days = sub.a,
    rotation_week_b_days = sub.b
FROM (
  SELECT id,
    CASE WHEN coalesce(weekend_group,'A') = 'A' THEN wk || we ELSE wk END AS a,
    CASE WHEN coalesce(weekend_group,'A') = 'A' THEN wk ELSE wk || we END AS b
  FROM (
    SELECT id, weekend_group,
      coalesce(array(SELECT unnest(scheduled_days) EXCEPT SELECT unnest(ARRAY[0,6]) ORDER BY 1), '{}'::integer[]) AS wk,
      coalesce(array(SELECT unnest(scheduled_days) INTERSECT SELECT unnest(ARRAY[0,6]) ORDER BY 1), '{}'::integer[]) AS we
    FROM public.employees
  ) t
) sub
WHERE e.id = sub.id AND cardinality(e.rotation_week_a_days) = 0;

CREATE TABLE IF NOT EXISTS public.automation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  status text NOT NULL DEFAULT 'ok',
  summary text NOT NULL DEFAULT '',
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.automation_runs TO authenticated;
GRANT ALL ON public.automation_runs TO service_role;

ALTER TABLE public.automation_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "managers read automation runs"
  ON public.automation_runs FOR SELECT TO authenticated
  USING (public.is_manager(auth.uid()));;

-- ------------------------------------------------------------
-- 20260813054755_2378ca35-3872-467f-997c-c6fd9d3f62dd.sql
-- ------------------------------------------------------------

-- units: HPPD target
ALTER TABLE public.units ADD COLUMN IF NOT EXISTS target_hppd numeric NOT NULL DEFAULT 3.6;

-- employees: payroll + employment type + retention
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS hourly_rate numeric NOT NULL DEFAULT 22;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS employment_type text NOT NULL DEFAULT 'staff';
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS termination_date date;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS reward_points integer NOT NULL DEFAULT 0;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS phone text;

-- 1. Census
CREATE TABLE IF NOT EXISTS public.census_days (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL,
  unit_id uuid NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  census integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (date, unit_id)
);
GRANT SELECT ON public.census_days TO authenticated;
GRANT ALL ON public.census_days TO service_role;
ALTER TABLE public.census_days ENABLE ROW LEVEL SECURITY;
CREATE POLICY "census readable by signed in" ON public.census_days FOR SELECT TO authenticated USING (true);
CREATE POLICY "census managed by managers" ON public.census_days FOR ALL TO authenticated
  USING (public.is_manager(auth.uid())) WITH CHECK (public.is_manager(auth.uid()));

-- 2. Time punches
CREATE TABLE IF NOT EXISTS public.time_punches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  assignment_id uuid REFERENCES public.shift_assignments(id) ON DELETE SET NULL,
  date date NOT NULL,
  clock_in timestamptz,
  clock_out timestamptz,
  minutes_worked integer NOT NULL DEFAULT 0,
  exception text,
  source text NOT NULL DEFAULT 'mobile',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.time_punches TO authenticated;
GRANT ALL ON public.time_punches TO service_role;
ALTER TABLE public.time_punches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "punches own or manager" ON public.time_punches FOR SELECT TO authenticated
  USING (employee_id = public.current_employee_id() OR public.is_manager(auth.uid()));
CREATE POLICY "punches insert own or manager" ON public.time_punches FOR INSERT TO authenticated
  WITH CHECK (employee_id = public.current_employee_id() OR public.is_manager(auth.uid()));
CREATE POLICY "punches update own or manager" ON public.time_punches FOR UPDATE TO authenticated
  USING (employee_id = public.current_employee_id() OR public.is_manager(auth.uid()))
  WITH CHECK (employee_id = public.current_employee_id() OR public.is_manager(auth.uid()));

-- 3. Schedule templates
CREATE TABLE IF NOT EXISTS public.schedule_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  unit_id uuid REFERENCES public.units(id) ON DELETE CASCADE,
  position public.position_type,
  shift public.shift_type,
  pattern jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.schedule_templates TO authenticated;
GRANT ALL ON public.schedule_templates TO service_role;
ALTER TABLE public.schedule_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "templates manager only" ON public.schedule_templates FOR ALL TO authenticated
  USING (public.is_manager(auth.uid())) WITH CHECK (public.is_manager(auth.uid()));

-- 4. Hiring
CREATE TABLE IF NOT EXISTS public.job_postings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  position public.position_type NOT NULL,
  shift public.shift_type,
  unit_id uuid REFERENCES public.units(id) ON DELETE SET NULL,
  employment_type text NOT NULL DEFAULT 'staff',
  pay_range text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'open',
  openings integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_postings TO authenticated;
GRANT ALL ON public.job_postings TO service_role;
ALTER TABLE public.job_postings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "postings readable" ON public.job_postings FOR SELECT TO authenticated USING (true);
CREATE POLICY "postings managed by managers" ON public.job_postings FOR ALL TO authenticated
  USING (public.is_manager(auth.uid())) WITH CHECK (public.is_manager(auth.uid()));

CREATE TABLE IF NOT EXISTS public.job_applicants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  posting_id uuid REFERENCES public.job_postings(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  email text,
  phone text,
  source text NOT NULL DEFAULT 'career_site',
  stage text NOT NULL DEFAULT 'applied',
  ai_score numeric,
  ai_summary text,
  notes text NOT NULL DEFAULT '',
  applied_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_applicants TO authenticated;
GRANT INSERT ON public.job_applicants TO anon;
GRANT ALL ON public.job_applicants TO service_role;
ALTER TABLE public.job_applicants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "applicants manager only" ON public.job_applicants FOR ALL TO authenticated
  USING (public.is_manager(auth.uid())) WITH CHECK (public.is_manager(auth.uid()));

-- 5. Recognition + reward point ledger
CREATE TABLE IF NOT EXISTS public.recognitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  from_employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  badge text NOT NULL DEFAULT 'kudos',
  message text NOT NULL DEFAULT '',
  points integer NOT NULL DEFAULT 10,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.recognitions TO authenticated;
GRANT ALL ON public.recognitions TO service_role;
ALTER TABLE public.recognitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "recognitions readable" ON public.recognitions FOR SELECT TO authenticated USING (true);
CREATE POLICY "recognitions insert" ON public.recognitions FOR INSERT TO authenticated
  WITH CHECK (from_employee_id = public.current_employee_id() OR public.is_manager(auth.uid()));

CREATE TABLE IF NOT EXISTS public.reward_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  points integer NOT NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.reward_ledger TO authenticated;
GRANT ALL ON public.reward_ledger TO service_role;
ALTER TABLE public.reward_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reward own or manager" ON public.reward_ledger FOR SELECT TO authenticated
  USING (employee_id = public.current_employee_id() OR public.is_manager(auth.uid()));

-- 6. Earned wage access
CREATE TABLE IF NOT EXISTS public.wage_advances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  amount numeric NOT NULL,
  status text NOT NULL DEFAULT 'approved',
  requested_at timestamptz NOT NULL DEFAULT now(),
  note text NOT NULL DEFAULT ''
);
GRANT SELECT, INSERT ON public.wage_advances TO authenticated;
GRANT ALL ON public.wage_advances TO service_role;
ALTER TABLE public.wage_advances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "advances own or manager" ON public.wage_advances FOR SELECT TO authenticated
  USING (employee_id = public.current_employee_id() OR public.is_manager(auth.uid()));
CREATE POLICY "advances insert own" ON public.wage_advances FOR INSERT TO authenticated
  WITH CHECK (employee_id = public.current_employee_id());

-- 7. Messages / announcements
CREATE TABLE IF NOT EXISTS public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  sender_name text NOT NULL DEFAULT 'Management',
  recipient_id uuid REFERENCES public.employees(id) ON DELETE CASCADE,
  audience text NOT NULL DEFAULT 'all',
  subject text NOT NULL DEFAULT '',
  body text NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "messages readable" ON public.messages FOR SELECT TO authenticated
  USING (recipient_id IS NULL OR recipient_id = public.current_employee_id()
         OR sender_id = public.current_employee_id() OR public.is_manager(auth.uid()));
CREATE POLICY "messages insert" ON public.messages FOR INSERT TO authenticated
  WITH CHECK (sender_id = public.current_employee_id() OR public.is_manager(auth.uid()));
CREATE POLICY "messages update own" ON public.messages FOR UPDATE TO authenticated
  USING (recipient_id = public.current_employee_id() OR public.is_manager(auth.uid()))
  WITH CHECK (recipient_id = public.current_employee_id() OR public.is_manager(auth.uid()));

-- 8. Payroll periods
CREATE TABLE IF NOT EXISTS public.payroll_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  start_date date NOT NULL,
  end_date date NOT NULL,
  status text NOT NULL DEFAULT 'open',
  exported_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (start_date, end_date)
);
GRANT SELECT, INSERT, UPDATE ON public.payroll_periods TO authenticated;
GRANT ALL ON public.payroll_periods TO service_role;
ALTER TABLE public.payroll_periods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payroll manager only" ON public.payroll_periods FOR ALL TO authenticated
  USING (public.is_manager(auth.uid())) WITH CHECK (public.is_manager(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_punches_emp_date ON public.time_punches(employee_id, date);
CREATE INDEX IF NOT EXISTS idx_census_date ON public.census_days(date);
CREATE INDEX IF NOT EXISTS idx_messages_recipient ON public.messages(recipient_id, created_at DESC);
;

-- ------------------------------------------------------------
-- 20260813061814_bb85178b-5cb2-408f-b3df-5d43de0f060d.sql
-- ------------------------------------------------------------
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS float_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_floated_on date;

ALTER TABLE public.shift_assignments
  ADD COLUMN IF NOT EXISTS is_float boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS home_unit_id uuid REFERENCES public.units(id);

CREATE TABLE IF NOT EXISTS public.employee_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  author_id uuid REFERENCES public.employees(id),
  author_name text NOT NULL DEFAULT 'Management',
  category text NOT NULL DEFAULT 'general',
  body text NOT NULL,
  pinned boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_notes TO authenticated;
GRANT ALL ON public.employee_notes TO service_role;

ALTER TABLE public.employee_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers manage employee notes"
  ON public.employee_notes FOR ALL TO authenticated
  USING (public.is_manager(auth.uid()))
  WITH CHECK (public.is_manager(auth.uid()));

CREATE POLICY "Employees read notes about themselves"
  ON public.employee_notes FOR SELECT TO authenticated
  USING (employee_id = public.current_employee_id());

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS update_employee_notes_updated_at ON public.employee_notes;
CREATE TRIGGER update_employee_notes_updated_at
  BEFORE UPDATE ON public.employee_notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();;

-- ------------------------------------------------------------
-- 20260813083534_21ed7047-ec4a-44b6-959c-029ac00edc59.sql
-- ------------------------------------------------------------
ALTER TABLE public.shift_assignments ADD COLUMN IF NOT EXISTS float_reason text;

CREATE TABLE public.float_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid REFERENCES public.shift_assignments(id) ON DELETE SET NULL,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  from_unit_id uuid REFERENCES public.units(id),
  to_unit_id uuid REFERENCES public.units(id),
  shift_date date NOT NULL,
  shift shift_type,
  position position_type,
  reason text NOT NULL DEFAULT 'coverage',
  rationale text NOT NULL DEFAULT '',
  decided_by text NOT NULL DEFAULT 'system',
  automatic boolean NOT NULL DEFAULT false,
  float_count_before integer NOT NULL DEFAULT 0,
  seniority_rank integer,
  returned_home boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.float_events TO authenticated;
GRANT ALL ON public.float_events TO service_role;
ALTER TABLE public.float_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Signed in users can view float history"
ON public.float_events FOR SELECT TO authenticated USING (true);

CREATE POLICY "Managers can record floats"
ON public.float_events FOR INSERT TO authenticated
WITH CHECK (public.is_manager(auth.uid()));

CREATE INDEX idx_float_events_employee ON public.float_events(employee_id, created_at DESC);
CREATE INDEX idx_float_events_date ON public.float_events(shift_date);

CREATE TABLE public.automation_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton boolean NOT NULL DEFAULT true UNIQUE,
  autopilot_enabled boolean NOT NULL DEFAULT true,
  coverage_buffer integer NOT NULL DEFAULT 1,
  auto_fill_days integer NOT NULL DEFAULT 7,
  horizon_weeks integer NOT NULL DEFAULT 6,
  seniority_weight numeric NOT NULL DEFAULT 1,
  recency_weight numeric NOT NULL DEFAULT 1,
  paused_reason text,
  last_run_at timestamptz,
  updated_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.automation_settings TO authenticated;
GRANT ALL ON public.automation_settings TO service_role;
ALTER TABLE public.automation_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Signed in users can view autopilot settings"
ON public.automation_settings FOR SELECT TO authenticated USING (true);

CREATE TRIGGER update_automation_settings_updated_at
BEFORE UPDATE ON public.automation_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.automation_settings (singleton) VALUES (true);;

-- ------------------------------------------------------------
-- 20260815011235_49e80d75-d96e-407f-9f22-0585c348791a.sql
-- ------------------------------------------------------------
ALTER TABLE public.shift_assignments ADD COLUMN IF NOT EXISTS fill_reason text;
ALTER TABLE public.audit_log ADD COLUMN IF NOT EXISTS undone_at timestamptz;
ALTER TABLE public.audit_log ADD COLUMN IF NOT EXISTS undone_by text;
ALTER TABLE public.automation_settings ADD COLUMN IF NOT EXISTS watch_only boolean NOT NULL DEFAULT false;;

-- ------------------------------------------------------------
-- 20260815014826_bcc2bde5-3fdf-45a0-81ec-0f2fac4d7fc4.sql
-- ------------------------------------------------------------
ALTER TYPE position_type ADD VALUE IF NOT EXISTS 'qma';

-- ---------- Buildings ----------
CREATE TABLE public.facilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  address text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  weekly_labor_budget numeric NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.facilities TO authenticated;
GRANT ALL ON public.facilities TO service_role;
ALTER TABLE public.facilities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "facilities readable" ON public.facilities FOR SELECT TO authenticated USING (true);
CREATE POLICY "managers manage facilities" ON public.facilities FOR ALL TO authenticated
  USING (public.is_manager(auth.uid())) WITH CHECK (public.is_manager(auth.uid()));
GRANT INSERT, UPDATE, DELETE ON public.facilities TO authenticated;

INSERT INTO public.facilities (name, address, sort_order, weekly_labor_budget)
VALUES ('Main Campus', '', 0, 120000);

ALTER TABLE public.units ADD COLUMN facility_id uuid REFERENCES public.facilities(id);
UPDATE public.units SET facility_id = (SELECT id FROM public.facilities ORDER BY sort_order LIMIT 1);

-- ---------- Agencies ----------
CREATE TABLE public.agencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  contact_name text NOT NULL DEFAULT '',
  contact_email text,
  contact_phone text,
  weekly_budget numeric NOT NULL DEFAULT 0,
  max_shifts_per_week integer NOT NULL DEFAULT 0,
  rate_nurse numeric NOT NULL DEFAULT 0,
  rate_qma numeric NOT NULL DEFAULT 0,
  rate_cna numeric NOT NULL DEFAULT 0,
  notes text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agencies TO authenticated;
GRANT ALL ON public.agencies TO service_role;
ALTER TABLE public.agencies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agencies readable" ON public.agencies FOR SELECT TO authenticated USING (true);
CREATE POLICY "managers manage agencies" ON public.agencies FOR ALL TO authenticated
  USING (public.is_manager(auth.uid())) WITH CHECK (public.is_manager(auth.uid()));

CREATE TABLE public.agency_staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  user_id uuid,
  full_name text NOT NULL,
  position position_type NOT NULL,
  phone text,
  email text,
  charting_username text NOT NULL DEFAULT '',
  charting_password text NOT NULL DEFAULT '',
  clock_in_number text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agency_staff TO authenticated;
GRANT ALL ON public.agency_staff TO service_role;
ALTER TABLE public.agency_staff ENABLE ROW LEVEL SECURITY;
CREATE POLICY "managers manage agency staff" ON public.agency_staff FOR ALL TO authenticated
  USING (public.is_manager(auth.uid())) WITH CHECK (public.is_manager(auth.uid()));
CREATE POLICY "agency worker sees own record" ON public.agency_staff FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- ---------- Schedule additions ----------
ALTER TABLE public.shift_assignments
  ADD COLUMN agency_staff_id uuid REFERENCES public.agency_staff(id) ON DELETE SET NULL,
  ADD COLUMN agency_id uuid REFERENCES public.agencies(id) ON DELETE SET NULL,
  ADD COLUMN is_training boolean NOT NULL DEFAULT false,
  ADD COLUMN preceptor_id uuid REFERENCES public.employees(id) ON DELETE SET NULL;

-- ---------- Employee additions ----------
ALTER TABLE public.employees
  ADD COLUMN home_facility_id uuid REFERENCES public.facilities(id),
  ADD COLUMN in_training boolean NOT NULL DEFAULT false,
  ADD COLUMN training_ends_on date,
  ADD COLUMN float_pool_optin boolean NOT NULL DEFAULT false,
  ADD COLUMN no_show_risk numeric NOT NULL DEFAULT 0,
  ADD COLUMN risk_label text NOT NULL DEFAULT 'unknown',
  ADD COLUMN risk_updated_at timestamptz,
  ADD COLUMN risk_reason text NOT NULL DEFAULT '';
UPDATE public.employees SET home_facility_id = (SELECT id FROM public.facilities ORDER BY sort_order LIMIT 1);

-- ---------- Credentials ----------
CREATE TABLE public.employee_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  kind text NOT NULL,
  identifier text NOT NULL DEFAULT '',
  issued_on date,
  expires_on date NOT NULL,
  status text NOT NULL DEFAULT 'active',
  last_warned_on date,
  removed_from_schedule boolean NOT NULL DEFAULT false,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_credentials TO authenticated;
GRANT ALL ON public.employee_credentials TO service_role;
ALTER TABLE public.employee_credentials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "managers manage credentials" ON public.employee_credentials FOR ALL TO authenticated
  USING (public.is_manager(auth.uid())) WITH CHECK (public.is_manager(auth.uid()));
CREATE POLICY "employee sees own credentials" ON public.employee_credentials FOR SELECT TO authenticated
  USING (employee_id = public.current_employee_id());

-- ---------- Phone / voice call-off intake ----------
CREATE TABLE public.call_off_intakes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  caller_name text NOT NULL DEFAULT '',
  caller_phone text NOT NULL DEFAULT '',
  channel text NOT NULL DEFAULT 'phone',
  transcript text NOT NULL DEFAULT '',
  parsed_kind text,
  parsed_date date,
  parsed_shift shift_type,
  minutes_late integer,
  confidence numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  outcome text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.call_off_intakes TO authenticated;
GRANT ALL ON public.call_off_intakes TO service_role;
ALTER TABLE public.call_off_intakes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "managers manage intakes" ON public.call_off_intakes FOR ALL TO authenticated
  USING (public.is_manager(auth.uid())) WITH CHECK (public.is_manager(auth.uid()));
CREATE POLICY "employee sees own intakes" ON public.call_off_intakes FOR SELECT TO authenticated
  USING (employee_id = public.current_employee_id());
CREATE POLICY "employee creates own intake" ON public.call_off_intakes FOR INSERT TO authenticated
  WITH CHECK (employee_id = public.current_employee_id());

-- ---------- updated_at triggers ----------
CREATE TRIGGER trg_facilities_updated BEFORE UPDATE ON public.facilities
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_agencies_updated BEFORE UPDATE ON public.agencies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_agency_staff_updated BEFORE UPDATE ON public.agency_staff
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_credentials_updated BEFORE UPDATE ON public.employee_credentials
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_intakes_updated BEFORE UPDATE ON public.call_off_intakes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- Starter agencies ----------
INSERT INTO public.agencies (name, contact_name, contact_phone, weekly_budget, max_shifts_per_week, rate_nurse, rate_qma, rate_cna, notes)
VALUES
  ('Rosewood Staffing', 'Rosewood scheduling desk', '(555) 210-4400', 18000, 24, 68, 42, 32, 'Primary agency partner.'),
  ('NurseStat', 'NurseStat account manager', '(555) 771-9080', 12000, 16, 72, 45, 34, 'Overflow coverage only.');
;

-- ------------------------------------------------------------
-- 20260815021032_76bf66db-5982-43fb-9105-9965e590a2ba.sql
-- ------------------------------------------------------------
-- Employee contact / payroll / punch fields
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS sms_optin boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS payroll_id text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS clock_in_number text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS punch_pin text NOT NULL DEFAULT '';

-- Outbound message queue (SMS / voice / email)
CREATE TABLE IF NOT EXISTS public.message_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  channel text NOT NULL DEFAULT 'sms',
  to_address text NOT NULL,
  body text NOT NULL,
  kind text NOT NULL DEFAULT 'general',
  status text NOT NULL DEFAULT 'queued',
  attempts integer NOT NULL DEFAULT 0,
  provider_id text NOT NULL DEFAULT '',
  error text NOT NULL DEFAULT '',
  scheduled_for timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.message_outbox TO authenticated;
GRANT ALL ON public.message_outbox TO service_role;
ALTER TABLE public.message_outbox ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Managers read outbox" ON public.message_outbox FOR SELECT TO authenticated
  USING (public.is_manager(auth.uid()));
CREATE TRIGGER update_message_outbox_updated_at BEFORE UPDATE ON public.message_outbox
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX IF NOT EXISTS message_outbox_status_idx ON public.message_outbox (status, scheduled_for);

-- Registered time clocks / kiosks
CREATE TABLE IF NOT EXISTS public.punch_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  unit_id uuid REFERENCES public.units(id) ON DELETE SET NULL,
  device_key text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  last_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.punch_devices TO authenticated;
GRANT ALL ON public.punch_devices TO service_role;
ALTER TABLE public.punch_devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Managers read clocks" ON public.punch_devices FOR SELECT TO authenticated
  USING (public.is_manager(auth.uid()));
CREATE TRIGGER update_punch_devices_updated_at BEFORE UPDATE ON public.punch_devices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.time_punches ADD COLUMN IF NOT EXISTS device_id uuid REFERENCES public.punch_devices(id) ON DELETE SET NULL;

-- Compliance paperwork checklist
CREATE TABLE IF NOT EXISTS public.compliance_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL DEFAULT 'privacy',
  title text NOT NULL,
  detail text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'not_started',
  owner text NOT NULL DEFAULT '',
  evidence_url text NOT NULL DEFAULT '',
  reviewed_on date,
  next_review_on date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.compliance_items TO authenticated;
GRANT ALL ON public.compliance_items TO service_role;
ALTER TABLE public.compliance_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Managers read compliance items" ON public.compliance_items FOR SELECT TO authenticated
  USING (public.is_manager(auth.uid()));
CREATE POLICY "Managers manage compliance items" ON public.compliance_items FOR ALL TO authenticated
  USING (public.is_manager(auth.uid())) WITH CHECK (public.is_manager(auth.uid()));
CREATE TRIGGER update_compliance_items_updated_at BEFORE UPDATE ON public.compliance_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Messaging + retention settings
ALTER TABLE public.automation_settings
  ADD COLUMN IF NOT EXISTS sms_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS quiet_hours_start integer NOT NULL DEFAULT 21,
  ADD COLUMN IF NOT EXISTS quiet_hours_end integer NOT NULL DEFAULT 6,
  ADD COLUMN IF NOT EXISTS data_retention_days integer NOT NULL DEFAULT 2555;

-- Seed the compliance checklist
INSERT INTO public.compliance_items (category, title, detail, status)
SELECT * FROM (VALUES
  ('privacy', 'HIPAA Business Associate Agreement', 'Signed BAA in place with the facility covering scheduling, punch and demographic data.', 'not_started'),
  ('privacy', 'Notice of Privacy Practices alignment', 'Confirm the facility NPP covers workforce scheduling data handled by this system.', 'not_started'),
  ('privacy', 'Minimum necessary review', 'Manager, employee and agency roles reviewed so each sees only what the job requires.', 'in_progress'),
  ('security', 'Access control review', 'Quarterly review of who holds manager and administrator access.', 'in_progress'),
  ('security', 'Encryption in transit and at rest', 'All traffic over TLS; database encrypted at rest by the hosting provider.', 'complete'),
  ('security', 'Audit logging', 'Every automated and manual schedule change is written to the activity log with an undo trail.', 'complete'),
  ('security', 'Incident response plan', 'Written plan naming who is called, in what order, within 24 hours of a suspected breach.', 'not_started'),
  ('security', 'SOC 2 Type II readiness', 'Evidence collection and auditor engagement for a Type II report.', 'not_started'),
  ('data', 'Data retention schedule', 'Scheduling, punch and attendance records retained per state and CMS requirements.', 'in_progress'),
  ('data', 'Offboarding and data return', 'Documented export and deletion process when a facility leaves.', 'not_started'),
  ('workforce', 'CMS PBJ submission readiness', 'Quarterly PBJ file produced from punches and reviewed before submission.', 'complete'),
  ('workforce', 'State staffing minimum evidence', 'Daily HPPD evidence retained and printable for survey.', 'complete')
) AS v(category, title, detail, status)
WHERE NOT EXISTS (SELECT 1 FROM public.compliance_items);;

-- ------------------------------------------------------------
-- 20260818050707_15971c8e-6a83-49d4-9e91-83dc2ad012e2.sql
-- ------------------------------------------------------------
CREATE TABLE public.new_hires (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  email text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  position position_type NOT NULL DEFAULT 'cna',
  facility_id uuid REFERENCES public.facilities(id) ON DELETE SET NULL,
  unit_id uuid REFERENCES public.units(id) ON DELETE SET NULL,
  shift shift_type,
  days_per_week integer NOT NULL DEFAULT 4,
  hourly_rate numeric NOT NULL DEFAULT 0,
  employment_type text NOT NULL DEFAULT 'full_time',
  source text NOT NULL DEFAULT '',
  recruiter text NOT NULL DEFAULT '',
  applicant_id uuid REFERENCES public.job_applicants(id) ON DELETE SET NULL,
  offer_date date,
  start_date date,
  orientation_start date,
  orientation_end date,
  preceptor_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  clock_in_number text NOT NULL DEFAULT '',
  charting_username text NOT NULL DEFAULT '',
  payroll_id text NOT NULL DEFAULT '',
  emergency_contact_name text NOT NULL DEFAULT '',
  emergency_contact_phone text NOT NULL DEFAULT '',
  license_number text NOT NULL DEFAULT '',
  license_expires_on date,
  offer_accepted boolean NOT NULL DEFAULT false,
  background_check_done boolean NOT NULL DEFAULT false,
  drug_screen_done boolean NOT NULL DEFAULT false,
  physical_tb_done boolean NOT NULL DEFAULT false,
  license_verified boolean NOT NULL DEFAULT false,
  paperwork_done boolean NOT NULL DEFAULT false,
  badge_issued boolean NOT NULL DEFAULT false,
  charting_login_created boolean NOT NULL DEFAULT false,
  orientation_scheduled boolean NOT NULL DEFAULT false,
  added_to_schedule boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'onboarding',
  employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.new_hires TO authenticated;
GRANT ALL ON public.new_hires TO service_role;

ALTER TABLE public.new_hires ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers manage new hires"
ON public.new_hires FOR ALL TO authenticated
USING (public.is_manager(auth.uid()))
WITH CHECK (public.is_manager(auth.uid()));

CREATE TRIGGER update_new_hires_updated_at
BEFORE UPDATE ON public.new_hires
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();;

-- ------------------------------------------------------------
-- 20260818052725_89f48543-3c08-4e54-8933-d2f7eecc2f45.sql
-- ------------------------------------------------------------
ALTER TABLE public.automation_settings ADD COLUMN IF NOT EXISTS ppd_goal numeric NOT NULL DEFAULT 3.6;;

-- ------------------------------------------------------------
-- 20260818054815_b24ddee0-8c3d-4072-bc81-88bfcf8b0b29.sql
-- ------------------------------------------------------------
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
ON CONFLICT (key) DO NOTHING;;

-- ------------------------------------------------------------
-- 20260818064140_a92ec590-7fa2-44d0-a2e2-2439bd6c27a0.sql
-- ------------------------------------------------------------
ALTER TABLE public.census_days
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'auto',
  ADD COLUMN IF NOT EXISTS imported_at timestamptz;

CREATE TABLE IF NOT EXISTS public.census_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL DEFAULT 'pointclickcare',
  connector text NOT NULL DEFAULT '',
  file_name text NOT NULL DEFAULT '',
  period_start date,
  period_end date,
  rows_received integer NOT NULL DEFAULT 0,
  rows_applied integer NOT NULL DEFAULT 0,
  rows_skipped integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'applied',
  message text NOT NULL DEFAULT '',
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by text NOT NULL DEFAULT 'system',
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.census_imports TO authenticated;
GRANT ALL ON public.census_imports TO service_role;

ALTER TABLE public.census_imports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers can view census imports"
ON public.census_imports FOR SELECT
TO authenticated
USING (public.is_manager(auth.uid()));

CREATE INDEX IF NOT EXISTS census_imports_created_at_idx ON public.census_imports (created_at DESC);;

-- ------------------------------------------------------------
-- 20260818071424_08fff316-a8c7-4c15-b4ec-fd3e026ffd11.sql
-- ------------------------------------------------------------
CREATE TABLE public.integration_connections (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  kind text NOT NULL,
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  vendor text NOT NULL DEFAULT '',
  direction text NOT NULL DEFAULT 'inbound',
  transport text NOT NULL DEFAULT 'webhook',
  auth_mode text NOT NULL DEFAULT 'api_key',
  endpoint_path text NOT NULL DEFAULT '',
  is_enabled boolean NOT NULL DEFAULT false,
  is_required boolean NOT NULL DEFAULT true,
  expected_every_minutes integer NOT NULL DEFAULT 1440,
  stale_after_minutes integer NOT NULL DEFAULT 2880,
  failure_threshold integer NOT NULL DEFAULT 3,
  fallback_mode text NOT NULL DEFAULT 'last_known_good',
  status text NOT NULL DEFAULT 'never_synced',
  last_message text NOT NULL DEFAULT '',
  last_sync_at timestamp with time zone,
  last_success_at timestamp with time zone,
  last_failure_at timestamp with time zone,
  consecutive_failures integer NOT NULL DEFAULT 0,
  total_syncs integer NOT NULL DEFAULT 0,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text NOT NULL DEFAULT '',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.integration_connections TO authenticated;
GRANT ALL ON public.integration_connections TO service_role;
ALTER TABLE public.integration_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Managers view integrations" ON public.integration_connections FOR SELECT TO authenticated USING (public.is_manager(auth.uid()));
CREATE POLICY "Managers manage integrations" ON public.integration_connections FOR ALL TO authenticated USING (public.is_manager(auth.uid())) WITH CHECK (public.is_manager(auth.uid()));

CREATE TABLE public.integration_syncs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  connection_id uuid NOT NULL REFERENCES public.integration_connections(id) ON DELETE CASCADE,
  direction text NOT NULL DEFAULT 'inbound',
  trigger text NOT NULL DEFAULT 'manual',
  status text NOT NULL DEFAULT 'ok',
  rows_received integer NOT NULL DEFAULT 0,
  rows_applied integer NOT NULL DEFAULT 0,
  rows_skipped integer NOT NULL DEFAULT 0,
  duration_ms integer NOT NULL DEFAULT 0,
  message text NOT NULL DEFAULT '',
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by text NOT NULL DEFAULT 'system',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.integration_syncs TO authenticated;
GRANT ALL ON public.integration_syncs TO service_role;
ALTER TABLE public.integration_syncs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Managers view syncs" ON public.integration_syncs FOR SELECT TO authenticated USING (public.is_manager(auth.uid()));

CREATE INDEX idx_integration_syncs_conn ON public.integration_syncs (connection_id, created_at DESC);

CREATE TABLE public.integration_snapshots (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  connection_id uuid NOT NULL REFERENCES public.integration_connections(id) ON DELETE CASCADE,
  kind text NOT NULL,
  rows integer NOT NULL DEFAULT 0,
  captured_at timestamp with time zone NOT NULL DEFAULT now(),
  payload jsonb NOT NULL DEFAULT '[]'::jsonb,
  summary text NOT NULL DEFAULT '',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.integration_snapshots TO authenticated;
GRANT ALL ON public.integration_snapshots TO service_role;
ALTER TABLE public.integration_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Managers view snapshots" ON public.integration_snapshots FOR SELECT TO authenticated USING (public.is_manager(auth.uid()));

CREATE INDEX idx_integration_snapshots_conn ON public.integration_snapshots (connection_id, captured_at DESC);

CREATE TABLE public.integration_incidents (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  connection_id uuid NOT NULL REFERENCES public.integration_connections(id) ON DELETE CASCADE,
  severity text NOT NULL DEFAULT 'warning',
  status text NOT NULL DEFAULT 'open',
  summary text NOT NULL DEFAULT '',
  impact text NOT NULL DEFAULT '',
  fallback_used text NOT NULL DEFAULT '',
  opened_at timestamp with time zone NOT NULL DEFAULT now(),
  resolved_at timestamp with time zone,
  acknowledged_by text NOT NULL DEFAULT '',
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.integration_incidents TO authenticated;
GRANT ALL ON public.integration_incidents TO service_role;
ALTER TABLE public.integration_incidents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Managers view incidents" ON public.integration_incidents FOR SELECT TO authenticated USING (public.is_manager(auth.uid()));
CREATE POLICY "Managers manage incidents" ON public.integration_incidents FOR ALL TO authenticated USING (public.is_manager(auth.uid())) WITH CHECK (public.is_manager(auth.uid()));

CREATE INDEX idx_integration_incidents_open ON public.integration_incidents (status, opened_at DESC);

CREATE TRIGGER update_integration_connections_updated_at BEFORE UPDATE ON public.integration_connections FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_integration_incidents_updated_at BEFORE UPDATE ON public.integration_incidents FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.integration_connections (kind, slug, name, vendor, direction, transport, endpoint_path, is_required, expected_every_minutes, stale_after_minutes, fallback_mode, notes) VALUES
  ('emr', 'emr-census', 'EMR census feed', 'PointClickCare', 'inbound', 'webhook', '/api/public/hooks/integration/emr-census', true, 1440, 2160, 'last_known_good', 'Nightly resident census by unit. Drives PPD and staffing targets.'),
  ('timeclock', 'timeclock-punches', 'Time clock punches', 'Kiosk / wall clock', 'inbound', 'webhook', '/api/public/hooks/integration/timeclock-punches', true, 60, 240, 'last_known_good', 'Clock in and out events. Falls back to scheduled hours when down.'),
  ('payroll', 'payroll-export', 'Payroll export', 'ADP / Paycom / UKG / Paylocity', 'outbound', 'file', '/api/public/hooks/integration/payroll-export', true, 10080, 20160, 'manual', 'Approved hours pushed each pay period.'),
  ('hris', 'hris-roster', 'HR roster sync', 'HRIS', 'inbound', 'webhook', '/api/public/hooks/integration/hris-roster', true, 1440, 4320, 'last_known_good', 'Hires, terminations, rates and unit assignments.'),
  ('credentialing', 'credentialing-licenses', 'Credentialing / license verification', 'State board / primary source', 'inbound', 'webhook', '/api/public/hooks/integration/credentialing-licenses', true, 1440, 4320, 'last_known_good', 'License numbers, status and expiration dates.'),
  ('agency', 'agency-portal', 'Agency nurse portal', 'Agency vendor portal', 'bidirectional', 'webhook', '/api/public/hooks/integration/agency-portal', false, 720, 2880, 'manual', 'Open shift offers out, confirmed agency workers back in.');;

-- ------------------------------------------------------------
-- 20260818073209_e1566207-5dbd-4e12-a142-1bb180f438cb.sql
-- ------------------------------------------------------------
ALTER TABLE public.automation_settings
  ADD COLUMN IF NOT EXISTS buyback_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS buyback_shifts_required integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS buyback_points_removed numeric NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS buyback_max_points_per_year numeric NOT NULL DEFAULT 3;

CREATE TABLE IF NOT EXISTS public.point_buybacks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  points_removed numeric NOT NULL,
  shifts_used integer NOT NULL,
  reason text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.point_buybacks TO authenticated;
GRANT ALL ON public.point_buybacks TO service_role;

ALTER TABLE public.point_buybacks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Employees see their own buybacks"
ON public.point_buybacks FOR SELECT TO authenticated
USING (employee_id = public.current_employee_id() OR public.is_manager(auth.uid()));

CREATE POLICY "Managers record buybacks"
ON public.point_buybacks FOR INSERT TO authenticated
WITH CHECK (public.is_manager(auth.uid()));

CREATE INDEX IF NOT EXISTS point_buybacks_employee_idx ON public.point_buybacks(employee_id, created_at DESC);;

-- ------------------------------------------------------------
-- 20260819032438_4f56e1ea-7628-4bb9-a793-a91c82deccb0.sql
-- ------------------------------------------------------------
-- ============ 5. PER-DIEM MARKETPLACE ============
CREATE TABLE public.marketplace_workers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  position public.position_type NOT NULL,
  phone text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  city text NOT NULL DEFAULT '',
  hourly_rate numeric NOT NULL DEFAULT 0,
  reliability numeric NOT NULL DEFAULT 100,
  shifts_worked integer NOT NULL DEFAULT 0,
  no_shows integer NOT NULL DEFAULT 0,
  license_number text NOT NULL DEFAULT '',
  license_expires_on date,
  status text NOT NULL DEFAULT 'pending',
  is_active boolean NOT NULL DEFAULT true,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketplace_workers TO authenticated;
GRANT ALL ON public.marketplace_workers TO service_role;
ALTER TABLE public.marketplace_workers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Managers manage marketplace workers" ON public.marketplace_workers
  FOR ALL TO authenticated USING (public.is_manager(auth.uid())) WITH CHECK (public.is_manager(auth.uid()));

CREATE TABLE public.marketplace_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid REFERENCES public.shift_assignments(id) ON DELETE CASCADE,
  worker_id uuid REFERENCES public.marketplace_workers(id) ON DELETE CASCADE,
  shift_date date NOT NULL,
  shift public.shift_type NOT NULL,
  unit_id uuid REFERENCES public.units(id),
  position public.position_type NOT NULL,
  offered_rate numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'offered',
  expires_at timestamptz,
  responded_at timestamptz,
  reason text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketplace_offers TO authenticated;
GRANT ALL ON public.marketplace_offers TO service_role;
ALTER TABLE public.marketplace_offers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Managers manage marketplace offers" ON public.marketplace_offers
  FOR ALL TO authenticated USING (public.is_manager(auth.uid())) WITH CHECK (public.is_manager(auth.uid()));

-- ============ 6. HR DEPTH: DOCUMENTS, SCREENINGS, IN-SERVICE ============
CREATE TABLE public.hire_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  new_hire_id uuid REFERENCES public.new_hires(id) ON DELETE CASCADE,
  employee_id uuid REFERENCES public.employees(id) ON DELETE CASCADE,
  doc_type text NOT NULL,
  title text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'not_sent',
  sent_at timestamptz,
  signed_at timestamptz,
  signed_name text NOT NULL DEFAULT '',
  signature_ip text NOT NULL DEFAULT '',
  file_url text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hire_documents TO authenticated;
GRANT ALL ON public.hire_documents TO service_role;
ALTER TABLE public.hire_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Managers manage hire documents" ON public.hire_documents
  FOR ALL TO authenticated USING (public.is_manager(auth.uid())) WITH CHECK (public.is_manager(auth.uid()));
CREATE POLICY "Employees read own documents" ON public.hire_documents
  FOR SELECT TO authenticated USING (employee_id = public.current_employee_id());

CREATE TABLE public.screening_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  new_hire_id uuid REFERENCES public.new_hires(id) ON DELETE CASCADE,
  employee_id uuid REFERENCES public.employees(id) ON DELETE CASCADE,
  kind text NOT NULL,
  vendor text NOT NULL DEFAULT '',
  reference text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'not_started',
  ordered_on date,
  completed_on date,
  result text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.screening_checks TO authenticated;
GRANT ALL ON public.screening_checks TO service_role;
ALTER TABLE public.screening_checks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Managers manage screening checks" ON public.screening_checks
  FOR ALL TO authenticated USING (public.is_manager(auth.uid())) WITH CHECK (public.is_manager(auth.uid()));

CREATE TABLE public.inservice_courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT 'annual',
  required_minutes integer NOT NULL DEFAULT 30,
  recurrence_months integer NOT NULL DEFAULT 12,
  applies_to_positions public.position_type[] NOT NULL DEFAULT ARRAY[]::public.position_type[],
  required_for_new_hires boolean NOT NULL DEFAULT true,
  content_url text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inservice_courses TO authenticated;
GRANT ALL ON public.inservice_courses TO service_role;
ALTER TABLE public.inservice_courses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Managers manage courses" ON public.inservice_courses
  FOR ALL TO authenticated USING (public.is_manager(auth.uid())) WITH CHECK (public.is_manager(auth.uid()));
CREATE POLICY "Staff read active courses" ON public.inservice_courses
  FOR SELECT TO authenticated USING (is_active);

CREATE TABLE public.course_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.inservice_courses(id) ON DELETE CASCADE,
  employee_id uuid REFERENCES public.employees(id) ON DELETE CASCADE,
  new_hire_id uuid REFERENCES public.new_hires(id) ON DELETE CASCADE,
  completed_on date NOT NULL DEFAULT CURRENT_DATE,
  minutes integer NOT NULL DEFAULT 0,
  score numeric,
  due_on date,
  recorded_by text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.course_completions TO authenticated;
GRANT ALL ON public.course_completions TO service_role;
ALTER TABLE public.course_completions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Managers manage completions" ON public.course_completions
  FOR ALL TO authenticated USING (public.is_manager(auth.uid())) WITH CHECK (public.is_manager(auth.uid()));
CREATE POLICY "Employees read own completions" ON public.course_completions
  FOR SELECT TO authenticated USING (employee_id = public.current_employee_id());

-- ============ 8. IMPLEMENTATION TOOLING ============
CREATE TABLE public.import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  file_name text NOT NULL DEFAULT '',
  rows_received integer NOT NULL DEFAULT 0,
  rows_applied integer NOT NULL DEFAULT 0,
  rows_skipped integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  message text NOT NULL DEFAULT '',
  errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.import_batches TO authenticated;
GRANT ALL ON public.import_batches TO service_role;
ALTER TABLE public.import_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Managers manage import batches" ON public.import_batches
  FOR ALL TO authenticated USING (public.is_manager(auth.uid())) WITH CHECK (public.is_manager(auth.uid()));

CREATE TABLE public.setup_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  title text NOT NULL,
  detail text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'todo',
  completed_at timestamptz,
  completed_by text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.setup_steps TO authenticated;
GRANT ALL ON public.setup_steps TO service_role;
ALTER TABLE public.setup_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Managers manage setup steps" ON public.setup_steps
  FOR ALL TO authenticated USING (public.is_manager(auth.uid())) WITH CHECK (public.is_manager(auth.uid()));

-- updated_at triggers
CREATE TRIGGER trg_marketplace_workers_updated BEFORE UPDATE ON public.marketplace_workers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_marketplace_offers_updated BEFORE UPDATE ON public.marketplace_offers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_hire_documents_updated BEFORE UPDATE ON public.hire_documents FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_screening_checks_updated BEFORE UPDATE ON public.screening_checks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_inservice_courses_updated BEFORE UPDATE ON public.inservice_courses FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_course_completions_updated BEFORE UPDATE ON public.course_completions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_import_batches_updated BEFORE UPDATE ON public.import_batches FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_setup_steps_updated BEFORE UPDATE ON public.setup_steps FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed the guided go-live checklist and standard in-service courses
INSERT INTO public.setup_steps (key, title, detail, sort_order) VALUES
  ('facility', 'Confirm buildings and units', 'Check every unit name, bed count and target hours per resident day.', 1),
  ('requirements', 'Set required staff per unit and shift', 'Nurse, QMA and CNA counts for first, second and third shift.', 2),
  ('roster', 'Import the staff roster', 'Upload your current employee list with positions, hire dates and rates.', 3),
  ('schedule', 'Import the current schedule', 'Bring in the schedule already posted so nothing is lost at go-live.', 4),
  ('attendance', 'Import attendance history', 'Existing points and occurrences so the record follows each person.', 5),
  ('policies', 'Review policy settings', 'Points, vacation notice, overtime limits, buy-back and quiet hours.', 6),
  ('integrations', 'Connect outside systems', 'Census, payroll, time clocks, credentialing and agency portals.', 7),
  ('watch', 'Run watch-only for one week', 'Let the system show what it would do before it does it.', 8),
  ('training', 'Train schedulers and floor staff', 'Short walkthroughs for each role, then hand out logins.', 9),
  ('golive', 'Go live', 'Switch the system from watch-only to running itself.', 10)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.inservice_courses (title, description, category, required_minutes, recurrence_months, required_for_new_hires) VALUES
  ('Abuse and neglect prevention', 'Recognizing, preventing and reporting resident abuse and neglect.', 'annual', 60, 12, true),
  ('Infection control and hand hygiene', 'Standard precautions, isolation and hand hygiene.', 'annual', 45, 12, true),
  ('HIPAA and resident privacy', 'Protected health information and resident rights.', 'annual', 30, 12, true),
  ('Fire safety and emergency preparedness', 'Evacuation, RACE/PASS and disaster response.', 'annual', 30, 12, true),
  ('Safe resident handling', 'Transfers, lifts and back safety.', 'annual', 45, 12, true),
  ('Dementia care', 'Behavior approaches and person-centered dementia care.', 'annual', 60, 12, true),
  ('Bloodborne pathogens', 'OSHA bloodborne pathogen standard.', 'annual', 30, 12, true),
  ('Medication administration refresher', 'For QMAs and nurses — the five rights and documentation.', 'role', 60, 12, false)
ON CONFLICT DO NOTHING;;

-- ------------------------------------------------------------
-- 20260819082957_b769e022-82fa-4497-af4d-fa134878fbed.sql
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "read employees" ON public.employees;
CREATE POLICY "employees read self or manager" ON public.employees
FOR SELECT TO authenticated
USING (user_id = auth.uid() OR id = public.current_employee_id() OR public.is_manager(auth.uid()));

DROP POLICY IF EXISTS "read schedule" ON public.shift_assignments;
CREATE POLICY "schedule read own or manager" ON public.shift_assignments
FOR SELECT TO authenticated
USING (employee_id = public.current_employee_id() OR employee_id IS NULL OR public.is_manager(auth.uid()));

DROP POLICY IF EXISTS "read requirements" ON public.staffing_requirements;
CREATE POLICY "requirements read manager" ON public.staffing_requirements
FOR SELECT TO authenticated
USING (public.is_manager(auth.uid()));;

-- ------------------------------------------------------------
-- 20260819083054_e846cd93-4fb9-4077-b891-3b622685c220.sql
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "agencies readable" ON public.agencies;
CREATE POLICY "agencies readable by managers" ON public.agencies
FOR SELECT TO authenticated USING (public.is_manager(auth.uid()));

DROP POLICY IF EXISTS "Signed in users can view float history" ON public.float_events;
CREATE POLICY "float history self or manager" ON public.float_events
FOR SELECT TO authenticated
USING (employee_id = public.current_employee_id() OR public.is_manager(auth.uid()));

DROP POLICY IF EXISTS "census readable by signed in" ON public.census_days;
CREATE POLICY "census readable by managers" ON public.census_days
FOR SELECT TO authenticated USING (public.is_manager(auth.uid()));

DROP POLICY IF EXISTS "signed in can read app config" ON public.app_config;
CREATE POLICY "app config readable by managers" ON public.app_config
FOR SELECT TO authenticated USING (public.is_manager(auth.uid()));

DROP POLICY IF EXISTS "insert audit" ON public.audit_log;
CREATE POLICY "managers insert audit" ON public.audit_log
FOR INSERT TO authenticated WITH CHECK (public.is_manager(auth.uid()));;

-- ------------------------------------------------------------
-- 20260820043446_d5709354-1ab1-44be-8260-7c991b3e1e9f.sql
-- ------------------------------------------------------------
-- Recognition feed: limit to the people involved plus managers/admins
DROP POLICY IF EXISTS "Recognitions readable" ON public.recognitions;
DROP POLICY IF EXISTS "recognitions_select" ON public.recognitions;
DROP POLICY IF EXISTS "Anyone can view recognitions" ON public.recognitions;
DROP POLICY IF EXISTS "recognitions_select_involved" ON public.recognitions;

CREATE POLICY "recognitions_select_involved"
ON public.recognitions
FOR SELECT
TO authenticated
USING (
  public.is_manager(auth.uid())
  OR employee_id = public.current_employee_id()
  OR from_employee_id = public.current_employee_id()
);

-- Automation settings: managers/admins only
DROP POLICY IF EXISTS "Automation settings readable" ON public.automation_settings;
DROP POLICY IF EXISTS "automation_settings_select" ON public.automation_settings;
DROP POLICY IF EXISTS "Anyone can view automation settings" ON public.automation_settings;
DROP POLICY IF EXISTS "automation_settings_select_managers" ON public.automation_settings;

CREATE POLICY "automation_settings_select_managers"
ON public.automation_settings
FOR SELECT
TO authenticated
USING (public.is_manager(auth.uid()));;

-- ------------------------------------------------------------
-- 20260820043927_aef84c34-70e6-4b6d-8e04-9235a2dc6f69.sql
-- ------------------------------------------------------------
ALTER TABLE public.automation_settings
  ADD COLUMN IF NOT EXISTS notify_onboarding boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_schedule_updates boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_delivery_failures boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS undo_window_minutes integer NOT NULL DEFAULT 10;

ALTER TABLE public.shift_assignments
  ADD COLUMN IF NOT EXISTS prev_note text;;

-- ------------------------------------------------------------
-- 20260820044532_7329dea5-cfaf-4993-ae27-68d8a8563b96.sql
-- ------------------------------------------------------------
CREATE TABLE public.onboarding_phase_status (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  new_hire_id uuid NOT NULL REFERENCES public.new_hires(id) ON DELETE CASCADE,
  phase text NOT NULL,
  status text,
  started_at timestamp with time zone,
  completed_at timestamp with time zone,
  due_on date,
  note text NOT NULL DEFAULT '',
  updated_by text NOT NULL DEFAULT '',
  last_reminded_on date,
  reminder_count integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (new_hire_id, phase)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.onboarding_phase_status TO authenticated;
GRANT ALL ON public.onboarding_phase_status TO service_role;

ALTER TABLE public.onboarding_phase_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers read onboarding phase corrections"
  ON public.onboarding_phase_status FOR SELECT TO authenticated
  USING (public.is_manager(auth.uid()));

CREATE POLICY "Managers write onboarding phase corrections"
  ON public.onboarding_phase_status FOR ALL TO authenticated
  USING (public.is_manager(auth.uid()))
  WITH CHECK (public.is_manager(auth.uid()));

CREATE TRIGGER trg_onboarding_phase_status_updated
  BEFORE UPDATE ON public.onboarding_phase_status
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();;

-- ------------------------------------------------------------
-- 20260820045043_31ea6a3f-8996-46cd-b6b2-3792ecc45e49.sql
-- ------------------------------------------------------------
CREATE TABLE public.notification_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL DEFAULT 'role',
  role public.app_role,
  employee_id uuid REFERENCES public.employees(id) ON DELETE CASCADE,
  category text NOT NULL,
  in_app boolean NOT NULL DEFAULT true,
  sms boolean NOT NULL DEFAULT true,
  updated_by text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX notification_rules_role_key ON public.notification_rules (role, category) WHERE scope = 'role';
CREATE UNIQUE INDEX notification_rules_employee_key ON public.notification_rules (employee_id, category) WHERE scope = 'employee';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_rules TO authenticated;
GRANT ALL ON public.notification_rules TO service_role;
ALTER TABLE public.notification_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers manage all notification rules" ON public.notification_rules
  FOR ALL TO authenticated
  USING (public.is_manager(auth.uid()))
  WITH CHECK (public.is_manager(auth.uid()));

CREATE POLICY "People read their own notification rules" ON public.notification_rules
  FOR SELECT TO authenticated
  USING (scope = 'role' OR employee_id = public.current_employee_id());

CREATE POLICY "People change their own notification rules" ON public.notification_rules
  FOR UPDATE TO authenticated
  USING (scope = 'employee' AND employee_id = public.current_employee_id())
  WITH CHECK (scope = 'employee' AND employee_id = public.current_employee_id());

CREATE POLICY "People create their own notification rules" ON public.notification_rules
  FOR INSERT TO authenticated
  WITH CHECK (scope = 'employee' AND employee_id = public.current_employee_id());

CREATE TRIGGER trg_notification_rules_updated
  BEFORE UPDATE ON public.notification_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.notification_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid REFERENCES public.message_outbox(id) ON DELETE CASCADE,
  employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  attempt_no integer NOT NULL DEFAULT 1,
  channel text NOT NULL DEFAULT 'sms',
  status text NOT NULL DEFAULT 'queued',
  error text NOT NULL DEFAULT '',
  to_address text NOT NULL DEFAULT '',
  actor text NOT NULL DEFAULT 'system',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX notification_attempts_message_idx ON public.notification_attempts (message_id, created_at DESC);

GRANT SELECT, INSERT ON public.notification_attempts TO authenticated;
GRANT ALL ON public.notification_attempts TO service_role;
ALTER TABLE public.notification_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers read all delivery attempts" ON public.notification_attempts
  FOR SELECT TO authenticated
  USING (public.is_manager(auth.uid()) OR employee_id = public.current_employee_id());

CREATE POLICY "Managers log delivery attempts" ON public.notification_attempts
  FOR INSERT TO authenticated
  WITH CHECK (public.is_manager(auth.uid()));

INSERT INTO public.notification_rules (scope, role, category, in_app, sms, updated_by)
VALUES
  ('role', 'employee', 'onboarding', true, true, 'system default'),
  ('role', 'employee', 'schedule', true, true, 'system default'),
  ('role', 'employee', 'reminders', true, true, 'system default'),
  ('role', 'employee', 'delivery_failures', false, false, 'system default'),
  ('role', 'manager', 'onboarding', true, true, 'system default'),
  ('role', 'manager', 'schedule', true, false, 'system default'),
  ('role', 'manager', 'reminders', true, true, 'system default'),
  ('role', 'manager', 'delivery_failures', true, false, 'system default'),
  ('role', 'admin', 'onboarding', true, false, 'system default'),
  ('role', 'admin', 'schedule', true, false, 'system default'),
  ('role', 'admin', 'reminders', true, false, 'system default'),
  ('role', 'admin', 'delivery_failures', true, false, 'system default');;

-- ------------------------------------------------------------
-- 20260820052321_dc27df13-9214-4a7c-a2de-4fe33b121c43.sql
-- ------------------------------------------------------------
CREATE TABLE public.shift_claim_offers (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  assignment_id uuid NOT NULL REFERENCES public.shift_assignments(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  batch_id uuid NOT NULL,
  reply_code text NOT NULL DEFAULT '1',
  phone text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'sent',
  reason text NOT NULL DEFAULT '',
  sent_at timestamp with time zone NOT NULL DEFAULT now(),
  expires_at timestamp with time zone NOT NULL DEFAULT (now() + interval '6 hours'),
  responded_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_claim_offers_assignment ON public.shift_claim_offers(assignment_id);
CREATE INDEX idx_claim_offers_phone_status ON public.shift_claim_offers(phone, status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.shift_claim_offers TO authenticated;
GRANT ALL ON public.shift_claim_offers TO service_role;

ALTER TABLE public.shift_claim_offers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers manage claim offers"
  ON public.shift_claim_offers FOR ALL
  TO authenticated
  USING (public.is_manager(auth.uid()))
  WITH CHECK (public.is_manager(auth.uid()));

CREATE POLICY "Employees see their own claim offers"
  ON public.shift_claim_offers FOR SELECT
  TO authenticated
  USING (employee_id = public.current_employee_id());

CREATE TRIGGER trg_shift_claim_offers_updated
  BEFORE UPDATE ON public.shift_claim_offers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();;

-- ------------------------------------------------------------
-- 20260821071214_45387937-18b4-4e49-94d6-d85e844f718d.sql
-- ------------------------------------------------------------
WITH ranked AS (
  SELECT id,
         split_part(full_name, ' ', 1) AS first_name,
         row_number() OVER (PARTITION BY full_name ORDER BY created_at, id) AS rn
  FROM public.employees
),
pool AS (
  SELECT surname, ord
  FROM unnest(ARRAY['Whitaker','Delgado','Kowalski','Ferrell','Okonkwo','Vasquez','Lindqvist','Abernathy','Castellanos','Mbeki']) WITH ORDINALITY AS t(surname, ord)
)
UPDATE public.employees e
SET full_name = r.first_name || ' ' || p.surname
FROM ranked r
JOIN pool p ON p.ord = r.rn - 1
WHERE e.id = r.id AND r.rn > 1;;

-- ------------------------------------------------------------
-- 20260821071506_bf895ac1-ca1a-42c8-ace6-2306a3ee5d6e.sql
-- ------------------------------------------------------------
WITH dup AS (
  SELECT id, row_number() OVER (ORDER BY created_at, id) AS rn
  FROM public.employees WHERE full_name = 'Finley Delgado'
)
UPDATE public.employees e SET full_name = 'Finley Marchetti'
FROM dup WHERE e.id = dup.id AND dup.rn = 2;;

-- ------------------------------------------------------------
-- 20260821071713_53740e12-7aad-4c7d-afbf-08145d9fa0d0.sql
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Signed in users can view autopilot settings" ON public.automation_settings;
DROP POLICY IF EXISTS "recognitions readable" ON public.recognitions;;

-- ------------------------------------------------------------
-- 20260821071939_51ed9376-90b4-4495-98fb-dd72fa727733.sql
-- ------------------------------------------------------------
ALTER TABLE public.automation_settings
  ADD COLUMN IF NOT EXISTS session_timeout_minutes integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS audit_retention_days integer NOT NULL DEFAULT 2555,
  ADD COLUMN IF NOT EXISTS message_retention_days integer NOT NULL DEFAULT 730,
  ADD COLUMN IF NOT EXISTS access_review_days integer NOT NULL DEFAULT 90;

CREATE TABLE IF NOT EXISTS public.access_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reviewed_by text NOT NULL,
  reviewed_at timestamptz NOT NULL DEFAULT now(),
  accounts_reviewed integer NOT NULL DEFAULT 0,
  changes_made integer NOT NULL DEFAULT 0,
  notes text
);

GRANT SELECT ON public.access_reviews TO authenticated;
GRANT ALL ON public.access_reviews TO service_role;

ALTER TABLE public.access_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "access_reviews_select_admins" ON public.access_reviews
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));;

-- ------------------------------------------------------------
-- 20260821072526_aab0ab83-d18b-476b-8444-923b7ae59b9c.sql
-- ------------------------------------------------------------
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
CREATE INDEX login_attempts_ip_time_idx ON public.login_attempts (ip, created_at DESC);;

-- ------------------------------------------------------------
-- 20260821072840_b913d8b8-b014-4f61-bfab-a39839cd4737.sql
-- ------------------------------------------------------------
DELETE FROM public.login_attempts WHERE email = 'nobody-test@example.com';;

-- ------------------------------------------------------------
-- 20260821073122_56346a86-68d9-45c3-85d6-6f7c3ecfd9ce.sql
-- ------------------------------------------------------------

-- 1. Lock down SECURITY DEFINER helpers: no anonymous or public execute.
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;

REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.is_manager(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_manager(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.current_employee_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_employee_id() TO authenticated, service_role;

-- 2. Tamper-evident change record.
CREATE OR REPLACE FUNCTION public.audit_log_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.created_at > now() - interval '90 days' THEN
      RAISE EXCEPTION 'Change records stay for at least 90 days and cannot be removed early.';
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.action IS DISTINCT FROM OLD.action
     OR NEW.actor IS DISTINCT FROM OLD.actor
     OR NEW.entity IS DISTINCT FROM OLD.entity
     OR NEW.entity_id IS DISTINCT FROM OLD.entity_id
     OR NEW.details IS DISTINCT FROM OLD.details
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Change records cannot be edited. Only the undo markers may be set.';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.audit_log_immutable() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_audit_log_immutable ON public.audit_log;
CREATE TRIGGER trg_audit_log_immutable
  BEFORE UPDATE OR DELETE ON public.audit_log
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_immutable();

-- 3. Failed sign-in record: administrators may review it; nobody else.
GRANT SELECT ON public.login_attempts TO authenticated;
DROP POLICY IF EXISTS login_attempts_select_admins ON public.login_attempts;
CREATE POLICY login_attempts_select_admins ON public.login_attempts
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

COMMENT ON TABLE public.login_attempts IS
  'Sign-in attempt record used for lockouts. Written only by the server; readable by administrators.';
;

-- ------------------------------------------------------------
-- 20260821073755_4f8513cc-9f99-47bc-9861-4c7be2b8b71c.sql
-- ------------------------------------------------------------
CREATE TABLE public.security_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  severity text NOT NULL DEFAULT 'low',
  status text NOT NULL DEFAULT 'open',
  detected_at timestamptz NOT NULL DEFAULT now(),
  detected_by text NOT NULL,
  summary text NOT NULL,
  impact text,
  remediation text,
  resolved_at timestamptz,
  follow_up text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.security_incidents TO authenticated;
GRANT ALL ON public.security_incidents TO service_role;

ALTER TABLE public.security_incidents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Administrators read security incidents"
  ON public.security_incidents FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Administrators write security incidents"
  ON public.security_incidents FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Administrators update security incidents"
  ON public.security_incidents FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_security_incidents_updated
  BEFORE UPDATE ON public.security_incidents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_security_incidents_detected ON public.security_incidents (detected_at DESC);;

-- ------------------------------------------------------------
-- 20260825082358_257ea682-6803-4035-b8ef-5dcade9146cd.sql
-- ------------------------------------------------------------
-- 1. notification_rules: role-scoped rows only visible to managers or members of that role
DROP POLICY IF EXISTS "People read their own notification rules" ON public.notification_rules;
CREATE POLICY "People read their own notification rules"
ON public.notification_rules
FOR SELECT
TO authenticated
USING (
  employee_id = public.current_employee_id()
  OR (
    scope = 'role'
    AND role IS NOT NULL
    AND (public.is_manager(auth.uid()) OR public.has_role(auth.uid(), role))
  )
);

-- 2. wage_advances: employees may only file pending requests; managers decide
DROP POLICY IF EXISTS "advances insert own" ON public.wage_advances;
CREATE POLICY "advances insert own pending"
ON public.wage_advances
FOR INSERT
TO authenticated
WITH CHECK (
  employee_id = public.current_employee_id()
  AND status = 'pending'
  AND amount > 0
);

CREATE POLICY "advances managers decide"
ON public.wage_advances
FOR UPDATE
TO authenticated
USING (public.is_manager(auth.uid()))
WITH CHECK (public.is_manager(auth.uid()));;

-- ------------------------------------------------------------
-- 20260825082523_9745bfd9-700b-4a93-91e8-283c6c16dc30.sql
-- ------------------------------------------------------------
create schema if not exists private;
revoke all on schema private from anon;
grant usage on schema private to authenticated, service_role;

create or replace function private.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create or replace function private.is_manager(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role in ('manager','admin'))
$$;

create or replace function private.current_employee_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.employees where user_id = auth.uid() limit 1
$$;

revoke all on function private.has_role(uuid, public.app_role) from public, anon;
revoke all on function private.is_manager(uuid) from public, anon;
revoke all on function private.current_employee_id() from public, anon;
grant execute on function private.has_role(uuid, public.app_role) to authenticated, service_role;
grant execute on function private.is_manager(uuid) to authenticated, service_role;
grant execute on function private.current_employee_id() to authenticated, service_role;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security invoker set search_path = public as $$
  select private.has_role(_user_id, _role)
$$;

create or replace function public.is_manager(_user_id uuid)
returns boolean language sql stable security invoker set search_path = public as $$
  select private.is_manager(_user_id)
$$;

create or replace function public.current_employee_id()
returns uuid language sql stable security invoker set search_path = public as $$
  select private.current_employee_id()
$$;;
