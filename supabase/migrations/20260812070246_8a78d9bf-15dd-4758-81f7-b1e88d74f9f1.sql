revoke all on function public.has_role(uuid, public.app_role) from public, anon;
revoke all on function public.is_manager(uuid) from public, anon;
revoke all on function public.current_employee_id() from public, anon;
revoke all on function public.handle_new_user() from public, anon, authenticated;
grant execute on function public.has_role(uuid, public.app_role) to authenticated;
grant execute on function public.is_manager(uuid) to authenticated;
grant execute on function public.current_employee_id() to authenticated;
