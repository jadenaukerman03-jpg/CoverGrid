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
$$;