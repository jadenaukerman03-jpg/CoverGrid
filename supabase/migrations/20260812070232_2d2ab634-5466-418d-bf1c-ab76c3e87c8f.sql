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
