-- Owner cockpit, step 1 (docs/ADMIN_PLAN.md): admins + MFA guard, audit log, member notes/tags,
-- internal accounts, First Class grants, codes, moderation, first-touch attribution, function errors.
-- Every admin_* function is security definer and starts with admin_guard(): the caller must be in
-- public.admins and the session must have passed MFA (aal2). Tables here have RLS on and no client policies
-- unless stated, so the browser can only reach them through those functions.

-- ────────────────────────────────────────────────────────────
-- A. Admins, guard, audit
-- ────────────────────────────────────────────────────────────
create table if not exists public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'support', 'analyst')),
  added_at timestamptz not null default now(),
  added_by uuid references auth.users (id) on delete set null
);
alter table public.admins enable row level security;

create table if not exists public.admin_audit (
  id bigint generated always as identity primary key,
  admin_id uuid references auth.users (id) on delete set null,
  action text not null check (char_length(action) <= 64),
  target_user uuid,
  detail jsonb not null default '{}'::jsonb,
  ts timestamptz not null default now()
);
create index if not exists admin_audit_ts on public.admin_audit (ts desc);
create index if not exists admin_audit_target on public.admin_audit (target_user, ts desc);
alter table public.admin_audit enable row level security;

-- Role rank: analyst 1 < support 2 < owner 3
create or replace function public.admin_role_rank(p_role text)
returns integer language sql immutable set search_path = '' as $$
  select case p_role when 'owner' then 3 when 'support' then 2 when 'analyst' then 1 else 0 end
$$;

-- Raises unless the caller is an admin with at least p_min role and an MFA (aal2) session. Returns the role.
create or replace function public.admin_guard(p_min text default 'analyst')
returns text language plpgsql stable security definer set search_path = '' as $$
declare v_role text;
begin
  select role into v_role from public.admins where user_id = auth.uid();
  if v_role is null then raise exception 'not_admin' using errcode = '42501'; end if;
  if coalesce(auth.jwt() ->> 'aal', 'aal1') <> 'aal2' then raise exception 'mfa_required' using errcode = '42501'; end if;
  if public.admin_role_rank(v_role) < public.admin_role_rank(p_min) then
    raise exception 'role_too_low' using errcode = '42501';
  end if;
  return v_role;
end;
$$;

create or replace function public.admin_log(p_action text, p_target uuid, p_detail jsonb default '{}'::jsonb)
returns void language sql security definer set search_path = '' as $$
  insert into public.admin_audit (admin_id, action, target_user, detail) values (auth.uid(), p_action, p_target, coalesce(p_detail, '{}'::jsonb))
$$;

-- Tells the cockpit whether to show sign-in, MFA set-up or the dashboard. Never raises.
create or replace function public.admin_whoami()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'is_admin', a.user_id is not null,
    'role', a.role,
    'aal', coalesce(auth.jwt() ->> 'aal', 'aal1'),
    'has_factor', exists (select 1 from auth.mfa_factors f where f.user_id = auth.uid() and f.status = 'verified')
  )
  from (select auth.uid() as uid) me left join public.admins a on a.user_id = me.uid
$$;

-- ────────────────────────────────────────────────────────────
-- B. Members: internal accounts, notes, tags, attribution
-- ────────────────────────────────────────────────────────────
create table if not exists public.internal_members (
  user_id uuid primary key references auth.users (id) on delete cascade,
  reason text,
  added_at timestamptz not null default now()
);
alter table public.internal_members enable row level security;

create table if not exists public.member_notes (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  author uuid references auth.users (id) on delete set null,
  body text not null check (char_length(body) between 1 and 4000),
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists member_notes_user on public.member_notes (user_id, created_at desc);
alter table public.member_notes enable row level security;

create table if not exists public.member_tags (
  user_id uuid not null references auth.users (id) on delete cascade,
  tag text not null check (tag ~ '^[a-z0-9][a-z0-9 _-]{0,31}$'),
  added_at timestamptz not null default now(),
  primary key (user_id, tag)
);
alter table public.member_tags enable row level security;

-- First touch (UTM / referrer) saved once by the app after sign-up. Insert own row only.
create table if not exists public.member_attribution (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  utm_source text check (utm_source is null or char_length(utm_source) <= 64),
  utm_medium text check (utm_medium is null or char_length(utm_medium) <= 64),
  utm_campaign text check (utm_campaign is null or char_length(utm_campaign) <= 64),
  referrer_domain text check (referrer_domain is null or char_length(referrer_domain) <= 128),
  landing_path text check (landing_path is null or char_length(landing_path) <= 128),
  first_seen timestamptz,
  created_at timestamptz not null default now()
);
alter table public.member_attribution enable row level security;
drop policy if exists attribution_insert_own on public.member_attribution;
create policy attribution_insert_own on public.member_attribution
  for insert to authenticated with check (user_id = (select auth.uid()));
revoke all on public.member_attribution from anon;
revoke select, update, delete on public.member_attribution from authenticated;

-- Edge Function errors (service role writes; read in the cockpit)
create table if not exists public.function_errors (
  id bigint generated always as identity primary key,
  fn text not null check (char_length(fn) <= 64),
  kind text check (kind is null or char_length(kind) <= 64),
  status integer,
  message text check (message is null or char_length(message) <= 300),
  user_id uuid,
  ts timestamptz not null default now()
);
create index if not exists function_errors_ts on public.function_errors (ts desc);
alter table public.function_errors enable row level security;

-- ────────────────────────────────────────────────────────────
-- C. First Class grants and codes
-- ────────────────────────────────────────────────────────────
create table if not exists public.promo_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9-]{4,32}$'),
  kind text not null check (kind in ('first_class', 'discount')),
  days integer check (days is null or days between 1 and 3650),
  lifetime boolean not null default false,
  discount_percent integer check (discount_percent is null or discount_percent between 1 and 100),
  discount_amount numeric(10, 2) check (discount_amount is null or discount_amount > 0),
  discount_currency text check (discount_currency is null or discount_currency ~ '^[A-Z]{3}$'),
  discount_duration text check (discount_duration is null or discount_duration in ('once', 'forever')),
  plans text[] not null default array['yearly', 'lifetime'],
  audience text not null default 'anyone' check (audience in ('anyone', 'new_members', 'member')),
  audience_member uuid references auth.users (id) on delete set null,
  max_uses integer check (max_uses is null or max_uses > 0),
  per_member integer not null default 1 check (per_member between 1 and 10),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  status text not null default 'active' check (status in ('active', 'paused', 'ended', 'archived')),
  batch text check (batch is null or char_length(batch) <= 64),
  campaign text check (campaign is null or campaign ~ '^[a-z0-9_-]{1,64}$'),
  note text check (note is null or char_length(note) <= 1000),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (kind <> 'first_class' or lifetime or days is not null),
  check (kind <> 'discount' or discount_percent is not null or discount_amount is not null)
);
create index if not exists promo_codes_batch on public.promo_codes (batch) where batch is not null;
alter table public.promo_codes enable row level security;

-- Free First Class time. Never edited after the fact except to end it (ended_at).
create table if not exists public.entitlement_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  source text not null check (source in ('admin', 'code')),
  code_id uuid references public.promo_codes (id) on delete set null,
  reason text not null check (char_length(reason) <= 64),
  note text check (note is null or char_length(note) <= 1000),
  starts_at timestamptz not null default now(),
  ends_at timestamptz, -- null = lifetime
  ended_at timestamptz,
  ended_by uuid references auth.users (id) on delete set null,
  end_reason text check (end_reason is null or char_length(end_reason) <= 300),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists entitlement_grants_user on public.entitlement_grants (user_id);
alter table public.entitlement_grants enable row level security;
drop policy if exists grants_select_own on public.entitlement_grants;
create policy grants_select_own on public.entitlement_grants for select to authenticated using (user_id = (select auth.uid()));
revoke insert, update, delete on public.entitlement_grants from anon, authenticated;

create table if not exists public.code_redemptions (
  id uuid primary key default gen_random_uuid(),
  code_id uuid not null references public.promo_codes (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  grant_id uuid references public.entitlement_grants (id) on delete set null,
  redeemed_at timestamptz not null default now(),
  ended_at timestamptz,
  end_reason text check (end_reason is null or char_length(end_reason) <= 300)
);
create index if not exists code_redemptions_code on public.code_redemptions (code_id, redeemed_at desc);
create index if not exists code_redemptions_user on public.code_redemptions (user_id);
alter table public.code_redemptions enable row level security;

create table if not exists public.code_attempts (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users (id) on delete cascade,
  code_entered text check (char_length(code_entered) <= 40),
  code_id uuid references public.promo_codes (id) on delete set null,
  result text not null check (result in ('ok', 'invalid', 'not_started', 'expired', 'paused', 'used_up', 'not_eligible',
                                         'already_used', 'already_member', 'rate_limited', 'discount_at_checkout')),
  ts timestamptz not null default now()
);
create index if not exists code_attempts_user_ts on public.code_attempts (user_id, ts desc);
create index if not exists code_attempts_code on public.code_attempts (code_id, ts desc);
alter table public.code_attempts enable row level security;

-- 'first_class' when a grant is live. The paywall adds store subscriptions here (PAYWALL_PLAN section 4).
create or replace function public.entitlement(p_user uuid)
returns text language sql stable security definer set search_path = '' as $$
  select case when exists (
    select 1 from public.entitlement_grants g
    where g.user_id = p_user and g.ended_at is null and g.starts_at <= now() and (g.ends_at is null or g.ends_at > now())
  ) then 'first_class' else 'free' end
$$;
revoke all on function public.entitlement(uuid) from public, anon, authenticated;
grant execute on function public.entitlement(uuid) to service_role;

create or replace function public.my_entitlement()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'plan', public.entitlement(auth.uid()),
    'until', (select case when bool_or(g.ends_at is null) then null else max(g.ends_at) end
              from public.entitlement_grants g
              where g.user_id = auth.uid() and g.ended_at is null and g.starts_at <= now() and (g.ends_at is null or g.ends_at > now()))
  )
$$;

-- When a new grant should start: after the member's latest live grant (codes stack), else now.
create or replace function public.grant_start(p_user uuid)
returns timestamptz language sql stable security definer set search_path = '' as $$
  select greatest(now(), coalesce(max(g.ends_at), now()))
  from public.entitlement_grants g
  where g.user_id = p_user and g.ended_at is null and g.ends_at is not null and g.ends_at > now()
$$;

-- ────────────────────────────────────────────────────────────
-- D. Moderation
-- ────────────────────────────────────────────────────────────
create table if not exists public.member_moderation (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  level text not null check (level in ('warning', 'restricted', 'suspended', 'banned')),
  reason text not null check (reason in ('spam', 'ai_abuse', 'fraud', 'harassment', 'scraping', 'terms', 'member_request', 'other')),
  note text check (note is null or char_length(note) <= 2000),
  member_message text check (member_message is null or char_length(member_message) <= 2000),
  starts_at timestamptz not null default now(),
  ends_at timestamptz, -- null = until lifted (banned is always null)
  lifted_at timestamptz,
  lifted_by uuid references auth.users (id) on delete set null,
  lift_reason text check (lift_reason is null or char_length(lift_reason) <= 300),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists member_moderation_user on public.member_moderation (user_id, created_at desc);
alter table public.member_moderation enable row level security;

-- Normalised emails that can't sign up again (lower case; Gmail dots and +tags ignored)
create table if not exists public.blocked_identities (
  email_norm text primary key,
  user_id uuid,
  moderation_id uuid references public.member_moderation (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.blocked_identities enable row level security;

create or replace function public.normalize_email(p_email text)
returns text language sql immutable set search_path = '' as $$
  select case
    when split_part(lower(p_email), '@', 2) in ('gmail.com', 'googlemail.com')
      then replace(split_part(split_part(lower(p_email), '@', 1), '+', 1), '.', '') || '@gmail.com'
    else split_part(split_part(lower(p_email), '@', 1), '+', 1) || '@' || split_part(lower(p_email), '@', 2)
  end
$$;

-- Strongest live step for a member: banned > suspended > restricted > warning > none
create or replace function public.member_status(p_user uuid)
returns text language sql stable security definer set search_path = '' as $$
  select coalesce((
    select m.level from public.member_moderation m
    where m.user_id = p_user and m.lifted_at is null and m.starts_at <= now() and (m.ends_at is null or m.ends_at > now())
    order by case m.level when 'banned' then 4 when 'suspended' then 3 when 'restricted' then 2 else 1 end desc
    limit 1), 'active')
$$;
revoke all on function public.member_status(uuid) from public, anon, authenticated;
grant execute on function public.member_status(uuid) to service_role;

-- Block sign-up with a banned identity
create or replace function public.block_banned_signup()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.email is not null and exists (select 1 from public.blocked_identities b where b.email_norm = public.normalize_email(new.email)) then
    raise exception 'This account can''t be created.' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists block_banned_signup on auth.users;
create trigger block_banned_signup before insert on auth.users for each row execute function public.block_banned_signup();

-- Restricted / suspended / banned members get no AI (every AI Edge Function already calls consume_ai_quota)
create or replace function public.consume_ai_quota(p_user_id uuid, p_limit integer default 100, p_kind text default 'ai')
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_calls integer;
begin
  if public.member_status(p_user_id) in ('restricted', 'suspended', 'banned') then return false; end if;
  insert into public.ai_usage (user_id, day, kind, calls) values (p_user_id, current_date, p_kind, 1)
  on conflict (user_id, day, kind) do update set calls = public.ai_usage.calls + 1
  returning calls into v_calls;
  return v_calls <= p_limit;
end;
$$;
revoke all on function public.consume_ai_quota(uuid, integer, text) from public, anon, authenticated;
grant execute on function public.consume_ai_quota(uuid, integer, text) to service_role;

-- Restricted+ members can't invite people to trips
create or replace function public.block_restricted_invites()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.invited_by is not null and public.member_status(new.invited_by) in ('restricted', 'suspended', 'banned') then
    raise exception 'Invites are turned off for this account.' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists block_restricted_invites on public.trip_collaborators;
create trigger block_restricted_invites before insert on public.trip_collaborators for each row execute function public.block_restricted_invites();

-- ────────────────────────────────────────────────────────────
-- E. Owner tasks (Needs you): rule items are virtual, keyed; this stores done / snooze and owner-added items
-- ────────────────────────────────────────────────────────────
create table if not exists public.admin_tasks (
  key text primary key,
  title text check (title is null or char_length(title) <= 200),
  detail text check (detail is null or char_length(detail) <= 1000),
  status text not null default 'open' check (status in ('open', 'done', 'snoozed')),
  snooze_until timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.admin_tasks enable row level security;

-- ────────────────────────────────────────────────────────────
-- F. Seed: the owner, and internal / test accounts (editable in the cockpit)
-- ────────────────────────────────────────────────────────────
insert into public.admins (user_id, role)
select id, 'owner' from auth.users where email = 'babar54@gmail.com'
on conflict (user_id) do nothing;

insert into public.internal_members (user_id, reason)
select id, 'owner or test account' from auth.users
where email in ('babar54@gmail.com', 'babar54x1@gmail.com', 'babar54x12@gmail.com', 'babar@qanda.la',
                'babar@venicemusic.co', 'test@test.com', 'machinemisha@gmail.com')
on conflict (user_id) do nothing;
