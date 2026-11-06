-- Store links on the web: two new optional keys in app_settings.beta.
--   android_group_url  the Google Group for the Android beta (https); the web falls back to a built-in link when unset
--   show_ios_store     true shows the App Store link on the landing page, Settings and the install sheet (default off)
-- beta_page_config() hands both to the public pages; admin_beta_settings_set accepts them. Everything else is unchanged.
create or replace function public.beta_page_config()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'redirect_url', case when coalesce((s ->> 'redirect_on')::boolean, false) then nullif(s ->> 'redirect_url', '') end,
    'ios_url', case when coalesce((s ->> 'show_ios')::boolean, false) then nullif(s ->> 'ios_url', '') end,
    'android_url', case when coalesce((s ->> 'show_android')::boolean, false) then nullif(s ->> 'android_url', '') end,
    'android_group_url', nullif(s ->> 'android_group_url', ''),
    'show_ios_store', coalesce((s ->> 'show_ios_store')::boolean, false),
    'web_url', case when coalesce((s ->> 'show_web')::boolean, true) then coalesce(nullif(s ->> 'web_url', ''), 'https://sillytraveltool.com/') end)
  from (select public.setting('beta') s) x
$$;
revoke all on function public.beta_page_config() from public;
grant execute on function public.beta_page_config() to anon, authenticated;

create or replace function public.admin_beta_settings_set(p_value jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_old jsonb; v_new jsonb; k text; v jsonb;
begin
  perform public.admin_guard('owner');
  if jsonb_typeof(p_value) <> 'object' then raise exception 'bad_value' using errcode = '22023'; end if;
  for k, v in select * from jsonb_each(p_value) loop
    if k in ('redirect_on', 'show_ios', 'show_android', 'show_web', 'show_ios_store') then
      if jsonb_typeof(v) <> 'boolean' then raise exception 'bad_value' using errcode = '22023'; end if;
    elsif k in ('ios_url', 'android_url', 'android_group_url', 'web_url', 'redirect_url') then
      if jsonb_typeof(v) <> 'string' or not ((v #>> '{}') = '' or (v #>> '{}') ~ '^https://[^\s"<>]+$') or length(v #>> '{}') > 500 then
        raise exception 'bad_url' using errcode = '22023';
      end if;
    else raise exception 'unknown_field' using errcode = '22023';
    end if;
  end loop;
  select value into v_old from public.app_settings where key = 'beta';
  v_new := coalesce(v_old, '{}'::jsonb) || p_value;
  if coalesce((v_new ->> 'redirect_on')::boolean, false) and coalesce(v_new ->> 'redirect_url', '') = '' then
    raise exception 'redirect_url_missing' using errcode = '22023';
  end if;
  insert into public.app_settings (key, value, updated_at, updated_by) values ('beta', v_new, now(), auth.uid())
  on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = auth.uid();
  perform public.admin_log('setting_beta', null, jsonb_build_object('from', v_old, 'to', v_new));
  return v_new;
end;
$$;
revoke all on function public.admin_beta_settings_set(jsonb) from public, anon;
grant execute on function public.admin_beta_settings_set(jsonb) to authenticated;
