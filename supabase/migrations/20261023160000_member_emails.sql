-- Member emails from the cockpit (docs/ADMIN_PLAN.md 4): Resend sends through the admin-email Edge Function.
-- Two kinds: 'service' (account notices: warnings, suspensions, replies) always allowed, and 'marketing'
-- (recaps, win-backs, offers, relaunch notes) only to people who opted in, never to the unsubscribed.

-- Opt-in and one-click unsubscribe, per member
alter table public.user_profiles
  add column if not exists marketing_emails boolean not null default false,
  add column if not exists marketing_emails_at timestamptz,
  add column if not exists email_token uuid not null default gen_random_uuid();
create unique index if not exists user_profiles_email_token on public.user_profiles (email_token);

-- Former members (no account) get a token too
alter table public.former_members
  add column if not exists email_token uuid not null default gen_random_uuid(),
  add column if not exists unsubscribed_at timestamptz;

create table if not exists public.email_templates (
  key text primary key check (key ~ '^[a-z0-9_]{2,40}$'),
  name text not null,
  kind text not null check (kind in ('service', 'marketing')),
  subject text not null check (char_length(subject) <= 200),
  body text not null check (char_length(body) <= 8000),
  cta_label text, cta_url text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);
alter table public.email_templates enable row level security;
revoke all on public.email_templates from anon, authenticated;

create table if not exists public.email_sends (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users (id) on delete set null,
  former_member_id bigint references public.former_members (id) on delete set null,
  email text not null,
  template_key text,
  kind text not null,
  subject text,
  status text not null check (status in ('sent', 'failed', 'skipped')),
  reason text,
  resend_id text,
  campaign text,
  sent_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists email_sends_user on public.email_sends (user_id, created_at desc);
create index if not exists email_sends_created on public.email_sends (created_at desc);
alter table public.email_sends enable row level security;
revoke all on public.email_sends from anon, authenticated;

-- Seed templates. Variables: {{first_name}} {{last_trip_city}} {{last_trip_days}} {{last_trip_bookings}} {{next_trip_city}}
-- {{next_trip_date}} {{trips_count}} {{countries}} {{app_url}}. Body: plain text, blank line = new paragraph,
-- **bold**, [link text](https://…).
insert into public.email_templates (key, name, kind, subject, body, cta_label, cta_url) values
('recap', 'Trip recap (just back)', 'marketing', 'Welcome back from {{last_trip_city}}',
'Hi {{first_name}},

Welcome home from {{last_trip_city}}. {{last_trip_days}} days and {{last_trip_bookings}} bookings, all kept in one place.

Your trip recap is ready in the app: the places you went, the stats, and a card you can share.

Planning the next one already? Goose is ready when you are.', 'See your recap', '{{app_url}}'),
('win_back', 'Win-back (lapsed)', 'marketing', 'Where to next, {{first_name}}?',
'Hi {{first_name}},

It''s been a while since your last trip with Silly Travel Tool. When the next one starts taking shape, forward your booking emails to your Goose inbox and they''ll land in the right trip, in local time.

City guides, HONK for a good spot nearby, and phrasebooks are waiting.', 'Start a trip', '{{app_url}}'),
('welcome', 'Welcome note (new member)', 'service', 'Welcome to Silly Travel Tool',
'Hi {{first_name}},

I''m Babar, and I build Silly Travel Tool. Thanks for signing up.

The fastest start: forward one booking confirmation to your Goose inbox (it''s in the app under your profile) and watch your first trip build itself.

If anything is confusing or broken, just reply to this email. It comes straight to me.', 'Open the app', '{{app_url}}'),
('first_class', 'First Class offer', 'marketing', 'A little upgrade for your next trip',
'Hi {{first_name}},

You''ve planned {{trips_count}} trips with Silly Travel Tool. First Class keeps every past trip, unlimited trips and reservations, and unlimited email import.

Founders get lifetime access for a one-time price, for a limited time.', 'See First Class', '{{app_url}}upgrade/'),
('relaunch', 'Relaunch note (former members)', 'marketing', 'Silly Travel Tool is back, and much better',
'Hi {{first_name}},

You tried an early version of Silly Travel Tool. It''s been rebuilt: multi-city trips, any itinerary imported from email, PDFs or screenshots, local times that just work, and a guide for every stop.

Your old account was cleared for the relaunch. If you''d like to try the new version, signing up takes a minute.', 'Try the new version', '{{app_url}}'),
('notice_warning', 'Account warning', 'service', 'About your Silly Travel Tool account', '{{message}}', null, null),
('notice_restricted', 'Account restricted', 'service', 'Some features are paused on your account', '{{message}}', null, null),
('notice_suspended', 'Account suspended', 'service', 'Your Silly Travel Tool account is suspended', '{{message}}', null, null),
('notice_banned', 'Account closed', 'service', 'Your Silly Travel Tool account has been closed', '{{message}}', null, null)
on conflict (key) do nothing;

-- Templates and the send log for the cockpit
create or replace function public.admin_email_templates()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.admin_guard('support');
  return coalesce((select jsonb_agg(to_jsonb(t) - 'updated_by' order by t.kind desc, t.name) from public.email_templates t), '[]'::jsonb);
end;
$$;

create or replace function public.admin_email_template_save(p jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.admin_guard('owner');
  insert into public.email_templates (key, name, kind, subject, body, cta_label, cta_url, updated_by)
  values (p ->> 'key', p ->> 'name', p ->> 'kind', p ->> 'subject', p ->> 'body', nullif(p ->> 'cta_label', ''), nullif(p ->> 'cta_url', ''), auth.uid())
  on conflict (key) do update set name = excluded.name, kind = excluded.kind, subject = excluded.subject, body = excluded.body,
    cta_label = excluded.cta_label, cta_url = excluded.cta_url, updated_at = now(), updated_by = auth.uid();
  perform public.admin_log('email.template_save', null, jsonb_build_object('key', p ->> 'key'));
end;
$$;

create or replace function public.admin_email_log(p_user uuid default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_role text;
begin
  v_role := public.admin_guard('analyst');
  return jsonb_build_object(
    'sends', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'user_id', s.user_id,
        'email', case when v_role = 'analyst' then public.mask_email(s.email) else s.email end,
        'template', s.template_key, 'kind', s.kind, 'subject', s.subject, 'status', s.status, 'reason', s.reason,
        'campaign', s.campaign, 'created_at', s.created_at) order by s.created_at desc)
      from (select * from public.email_sends where p_user is null or user_id = p_user order by created_at desc limit 300) s), '[]'::jsonb),
    'opted_in', (select count(*) from public.user_profiles where marketing_emails),
    'members', (select count(*) from public.user_profiles),
    'sent_30d', (select count(*) from public.email_sends where status = 'sent' and created_at > now() - interval '30 days'),
    'by_template', coalesce((select jsonb_object_agg(template_key, n) from (
        select coalesce(template_key, 'custom') as template_key, count(*) as n from public.email_sends where status = 'sent' group by 1) x), '{}'::jsonb)
  );
end;
$$;

-- One-click unsubscribe (public, by token only; used by the /unsubscribe page and List-Unsubscribe-Post)
create or replace function public.email_unsubscribe(p_token uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare n integer := 0; m integer := 0;
begin
  update public.user_profiles set marketing_emails = false, marketing_emails_at = now() where email_token = p_token;
  get diagnostics n = row_count;
  update public.former_members set marketing_consent = 'no', unsubscribed_at = now() where email_token = p_token;
  get diagnostics m = row_count;
  return jsonb_build_object('ok', n + m > 0);
end;
$$;
revoke all on function public.email_unsubscribe(uuid) from public;
grant execute on function public.email_unsubscribe(uuid) to anon, authenticated;

do $$
declare f text;
begin
  foreach f in array array['public.admin_email_templates()', 'public.admin_email_template_save(jsonb)', 'public.admin_email_log(uuid)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
