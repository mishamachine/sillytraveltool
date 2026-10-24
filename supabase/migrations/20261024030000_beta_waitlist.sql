-- Beta waitlist at sillytraveltool.com/beta (the one link in every social bio and post).
-- Public sign-ups only through the beta-signup Edge Function (service role → beta_signup); nobody outside reads.
-- Owner invites (beta-invite Edge Function) claim rows here so nobody is invited twice.
-- Settings live in app_settings.beta: ios_url, android_url, web_url (beta links), show_ios / show_android / show_web (also
-- show that link on the /beta page's "Get it now" section), redirect_on, redirect_url.

create table if not exists public.beta_waitlist (
  id bigint generated always as identity primary key,
  email text not null check (email = lower(email) and length(email) between 5 and 254),
  platform text not null check (platform in ('ios', 'android', 'web')),
  travel_frequency text check (travel_frequency in ('rarely', 'few_year', 'monthly', 'weekly')),
  utm_source text check (length(utm_source) <= 100),
  utm_medium text check (length(utm_medium) <= 100),
  utm_campaign text check (length(utm_campaign) <= 100),
  referrer text check (length(referrer) <= 300),
  email_token uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  confirmation_sent_at timestamptz,
  -- waiting → sending (claimed by one invite run) → sent | failed (failed may be retried; sent never again)
  invite_status text not null default 'waiting' check (invite_status in ('waiting', 'sending', 'sent', 'failed')),
  invite_claimed_at timestamptz,
  invited_at timestamptz,
  invite_link text,
  invite_error text,
  unsubscribed_at timestamptz
);
create unique index if not exists beta_waitlist_email on public.beta_waitlist (email);
create unique index if not exists beta_waitlist_token on public.beta_waitlist (email_token);
create index if not exists beta_waitlist_created on public.beta_waitlist (created_at);
alter table public.beta_waitlist enable row level security;
revoke all on public.beta_waitlist from anon, authenticated;

-- Sign-up attempts per hashed IP (rate limit); kept a day
create table if not exists public.beta_signup_hits (
  ip_hash text not null,
  at timestamptz not null default now()
);
create index if not exists beta_signup_hits_ip on public.beta_signup_hits (ip_hash, at);
alter table public.beta_signup_hits enable row level security;
revoke all on public.beta_signup_hits from anon, authenticated;

-- Called by beta-signup only. → { status: 'new' | 'exists' | 'rate_limited', id, token }
-- 5 tries per IP per hour, 300 sign-ups an hour overall (a flood stops at the database, not at Resend).
create or replace function public.beta_signup(p_email text, p_platform text, p_frequency text, p_utm_source text,
  p_utm_medium text, p_utm_campaign text, p_referrer text, p_ip_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_email text := lower(trim(p_email)); v_row public.beta_waitlist;
begin
  delete from public.beta_signup_hits where at < now() - interval '1 day';
  if (select count(*) from public.beta_signup_hits where ip_hash = p_ip_hash and at > now() - interval '1 hour') >= 5
     or (select count(*) from public.beta_waitlist where created_at > now() - interval '1 hour') >= 300 then
    return jsonb_build_object('status', 'rate_limited');
  end if;
  insert into public.beta_signup_hits (ip_hash) values (coalesce(p_ip_hash, 'unknown'));
  insert into public.beta_waitlist (email, platform, travel_frequency, utm_source, utm_medium, utm_campaign, referrer)
  values (v_email, p_platform, nullif(p_frequency, ''), left(nullif(p_utm_source, ''), 100), left(nullif(p_utm_medium, ''), 100),
    left(nullif(p_utm_campaign, ''), 100), left(nullif(p_referrer, ''), 300))
  on conflict (email) do nothing
  returning * into v_row;
  if v_row.id is null then
    -- Already on the list: same success screen, no second email. Someone who unsubscribed and signs up again is back on.
    update public.beta_waitlist set unsubscribed_at = null where email = v_email and unsubscribed_at is not null;
    return jsonb_build_object('status', 'exists');
  end if;
  return jsonb_build_object('status', 'new', 'id', v_row.id, 'token', v_row.email_token);
end;
$$;
revoke all on function public.beta_signup(text, text, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.beta_signup(text, text, text, text, text, text, text, text) to service_role;

-- The /beta page asks only this: where to send visitors once the beta is over (null = show the waitlist), and the
-- download links the owner chose to show publicly (null = "coming soon"). The web app is live: shown unless switched off.
create or replace function public.beta_page_config()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'redirect_url', case when coalesce((s ->> 'redirect_on')::boolean, false) then nullif(s ->> 'redirect_url', '') end,
    'ios_url', case when coalesce((s ->> 'show_ios')::boolean, false) then nullif(s ->> 'ios_url', '') end,
    'android_url', case when coalesce((s ->> 'show_android')::boolean, false) then nullif(s ->> 'android_url', '') end,
    'web_url', case when coalesce((s ->> 'show_web')::boolean, true) then coalesce(nullif(s ->> 'web_url', ''), 'https://sillytraveltool.com/') end)
  from (select public.setting('beta') s) x
$$;
revoke all on function public.beta_page_config() from public;
grant execute on function public.beta_page_config() to anon, authenticated;

-- Owner: beta links and the launch redirect. Links must be https (or empty to clear).
create or replace function public.admin_beta_settings_set(p_value jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_old jsonb; v_new jsonb; k text; v jsonb;
begin
  perform public.admin_guard('owner');
  if jsonb_typeof(p_value) <> 'object' then raise exception 'bad_value' using errcode = '22023'; end if;
  for k, v in select * from jsonb_each(p_value) loop
    if k in ('redirect_on', 'show_ios', 'show_android', 'show_web') then
      if jsonb_typeof(v) <> 'boolean' then raise exception 'bad_value' using errcode = '22023'; end if;
    elsif k in ('ios_url', 'android_url', 'web_url', 'redirect_url') then
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

-- Cockpit panel: totals, per day in the window, platform / source / frequency mix, invite progress, settings
create or replace function public.admin_beta(p_from timestamptz, p_to timestamptz)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.admin_guard('analyst');
  return jsonb_build_object(
    'total', (select count(*) from public.beta_waitlist),
    'in_window', (select count(*) from public.beta_waitlist where created_at >= p_from and created_at < p_to),
    'unsubscribed', (select count(*) from public.beta_waitlist where unsubscribed_at is not null),
    'series', coalesce((select jsonb_agg(jsonb_build_object('day', d::date, 'value', (select count(*) from public.beta_waitlist w
        where w.created_at >= d and w.created_at < d + interval '1 day')) order by d)
      from generate_series(date_trunc('day', p_from), date_trunc('day', p_to - interval '1 second'), interval '1 day') d), '[]'::jsonb),
    'platforms', coalesce((select jsonb_agg(jsonb_build_object('platform', platform, 'total', n, 'waiting', waiting, 'sent', sent,
        'failed', failed, 'sending', sending) order by n desc) from (
      select platform, count(*) n,
        count(*) filter (where invite_status = 'waiting' and unsubscribed_at is null) waiting,
        count(*) filter (where invite_status = 'sent') sent,
        count(*) filter (where invite_status = 'failed' and unsubscribed_at is null) failed,
        count(*) filter (where invite_status = 'sending') sending
      from public.beta_waitlist group by platform) x), '[]'::jsonb),
    'sources', coalesce((select jsonb_agg(jsonb_build_object('label', s, 'value', n) order by n desc) from (
      select coalesce(utm_source, 'Direct or unknown') s, count(*) n from public.beta_waitlist group by 1) x), '[]'::jsonb),
    'frequency', coalesce((select jsonb_agg(jsonb_build_object('label', f, 'value', n) order by n desc) from (
      select coalesce(travel_frequency, 'not_given') f, count(*) n from public.beta_waitlist group by 1) x), '[]'::jsonb),
    'settings', public.setting('beta')
  );
end;
$$;
revoke all on function public.admin_beta(timestamptz, timestamptz) from public, anon;
grant execute on function public.admin_beta(timestamptz, timestamptz) to authenticated;

-- CSV export (support and up: it has email addresses)
create or replace function public.admin_beta_rows()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.admin_guard('support');
  return coalesce((select jsonb_agg(to_jsonb(w) - 'email_token' - 'invite_link' order by w.created_at) from public.beta_waitlist w), '[]'::jsonb);
end;
$$;
revoke all on function public.admin_beta_rows() from public, anon;
grant execute on function public.admin_beta_rows() to authenticated;

-- Owner (through beta-invite): take up to p_limit people who haven't been invited, so no other run can send to them.
-- p_platform null = everyone. Failed sends are retried; sent, sending and unsubscribed never.
create or replace function public.admin_beta_claim(p_platform text, p_limit integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v jsonb;
begin
  perform public.admin_guard('owner');
  with picked as (
    select id from public.beta_waitlist
    where invite_status in ('waiting', 'failed') and unsubscribed_at is null and (p_platform is null or platform = p_platform)
    order by created_at limit greatest(1, least(coalesce(p_limit, 100), 100))
    for update skip locked
  ), upd as (
    update public.beta_waitlist w set invite_status = 'sending', invite_claimed_at = now(), invite_error = null from picked where w.id = picked.id
    returning w.id, w.email, w.platform, w.email_token
  )
  select coalesce(jsonb_agg(to_jsonb(upd)), '[]'::jsonb) into v from upd;
  if jsonb_array_length(v) > 0 then
    perform public.admin_log('beta_invite_claim', null, jsonb_build_object('platform', p_platform, 'count', jsonb_array_length(v)));
  end if;
  return v;
end;
$$;
revoke all on function public.admin_beta_claim(text, integer) from public, anon;
grant execute on function public.admin_beta_claim(text, integer) to authenticated;

-- Owner (through beta-invite): record each claimed person's result. p_rows = [{ id, ok, link, error }]
create or replace function public.admin_beta_mark(p_rows jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  perform public.admin_guard('owner');
  update public.beta_waitlist w set
    invite_status = case when (r ->> 'ok')::boolean then 'sent' else 'failed' end,
    invited_at = case when (r ->> 'ok')::boolean then now() else w.invited_at end,
    invite_link = case when (r ->> 'ok')::boolean then left(r ->> 'link', 500) else w.invite_link end,
    invite_error = case when (r ->> 'ok')::boolean then null else left(r ->> 'error', 300) end
  from jsonb_array_elements(p_rows) r
  where w.id = (r ->> 'id')::bigint and w.invite_status = 'sending';
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.admin_beta_mark(jsonb) from public, anon;
grant execute on function public.admin_beta_mark(jsonb) to authenticated;

-- Owner: rows stuck in 'sending' (a run that died mid-way) go back to failed so they can be retried.
-- Only rows older than 15 minutes, so a run in progress isn't touched.
create or replace function public.admin_beta_release_stuck()
returns integer language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  perform public.admin_guard('owner');
  update public.beta_waitlist set invite_status = 'failed', invite_error = 'Send interrupted; check Resend before retrying'
  where invite_status = 'sending' and invite_claimed_at < now() - interval '15 minutes';
  get diagnostics n = row_count;
  perform public.admin_log('beta_invite_release', null, jsonb_build_object('count', n));
  return n;
end;
$$;
revoke all on function public.admin_beta_release_stuck() from public, anon;
grant execute on function public.admin_beta_release_stuck() to authenticated;

-- The existing unsubscribe link also covers waitlist emails (same /unsubscribe page and one-click POST)
create or replace function public.email_unsubscribe(p_token uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare n integer := 0; m integer := 0; b integer := 0;
begin
  update public.user_profiles set marketing_emails = false, marketing_emails_at = now() where email_token = p_token;
  get diagnostics n = row_count;
  update public.former_members set marketing_consent = 'no', unsubscribed_at = now() where email_token = p_token;
  get diagnostics m = row_count;
  update public.beta_waitlist set unsubscribed_at = coalesce(unsubscribed_at, now()) where email_token = p_token;
  get diagnostics b = row_count;
  return jsonb_build_object('ok', n + m + b > 0, 'beta', b > 0);
end;
$$;
revoke all on function public.email_unsubscribe(uuid) from public;
grant execute on function public.email_unsubscribe(uuid) to anon, authenticated;

-- The web app is live: it is the web beta link from day one (the owner can change it in the cockpit)
insert into public.app_settings (key, value, updated_at)
values ('beta', '{"web_url": "https://sillytraveltool.com/", "show_web": true, "show_ios": false, "show_android": false, "redirect_on": false}', now())
on conflict (key) do nothing;
