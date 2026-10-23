-- Owner choice (2026-10-23): no authenticator. Admin access needs a Google (OAuth) sign-in instead,
-- read from the session's amr claim, so an emailed sign-in link can't open the cockpit.
create or replace function public.admin_guard(p_min text default 'analyst')
returns text language plpgsql stable security definer set search_path = '' as $$
declare v_role text;
begin
  select role into v_role from public.admins where user_id = auth.uid();
  if v_role is null then raise exception 'not_admin' using errcode = '42501'; end if;
  if not exists (select 1 from jsonb_array_elements(coalesce(auth.jwt() -> 'amr', '[]'::jsonb)) a where a ->> 'method' = 'oauth') then
    raise exception 'google_required' using errcode = '42501';
  end if;
  if public.admin_role_rank(v_role) < public.admin_role_rank(p_min) then
    raise exception 'role_too_low' using errcode = '42501';
  end if;
  return v_role;
end;
$$;

create or replace function public.admin_whoami()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'is_admin', a.user_id is not null,
    'role', a.role,
    'google', exists (select 1 from jsonb_array_elements(coalesce(auth.jwt() -> 'amr', '[]'::jsonb)) x where x ->> 'method' = 'oauth')
  )
  from (select auth.uid() as uid) me left join public.admins a on a.user_id = me.uid
$$;
