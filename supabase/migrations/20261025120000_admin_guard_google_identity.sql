-- admin_guard: require a Google sign-in (OAuth session + Google identity) without locking out admins who have
-- other identities linked. The 2026-10-25 hardening refused any account with a provider outside (google, email);
-- the owner had just linked Apple while testing Sign in with Apple and every cockpit call failed with google_required.
create or replace function public.admin_guard(p_min text default 'analyst')
returns text language plpgsql stable security definer set search_path to '' as $$
declare v_role text;
begin
  select role into v_role from public.admins where user_id = auth.uid();
  if v_role is null then raise exception 'not_admin' using errcode = '42501'; end if;
  if not exists (select 1 from jsonb_array_elements(coalesce(auth.jwt() -> 'amr', '[]'::jsonb)) a where a ->> 'method' = 'oauth')
     or not exists (select 1 from auth.identities i where i.user_id = auth.uid() and i.provider = 'google') then
    raise exception 'google_required' using errcode = '42501';
  end if;
  if public.admin_role_rank(v_role) < public.admin_role_rank(p_min) then
    raise exception 'role_too_low' using errcode = '42501';
  end if;
  return v_role;
end $$;
