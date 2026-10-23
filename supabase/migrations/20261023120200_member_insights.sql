-- Deeper traveller profiles for the cockpit (docs/ADMIN_PLAN.md 4a): one derived row per member, recomputed on read.
-- Built only from data members gave us (trips, bookings, loyalty tiers, in-app events, Stripe payments). Never shown
-- to the member, never used to change prices or limits.

-- Approximate USD rates for the affluence signal only (rounded; not for money shown to anyone)
create or replace function public.usd_rate(p_currency text)
returns numeric language sql immutable set search_path = '' as $$
  select case upper(coalesce(p_currency, 'USD'))
    when 'USD' then 1 when 'EUR' then 1.08 when 'GBP' then 1.27 when 'CAD' then 0.73 when 'AUD' then 0.66 when 'NZD' then 0.6
    when 'CHF' then 1.12 when 'JPY' then 0.0067 when 'CNY' then 0.14 when 'HKD' then 0.128 when 'SGD' then 0.74 when 'KRW' then 0.00073
    when 'INR' then 0.012 when 'PKR' then 0.0036 when 'THB' then 0.028 when 'AED' then 0.27 when 'SAR' then 0.27 when 'TRY' then 0.03
    when 'MXN' then 0.055 when 'BRL' then 0.18 when 'ZAR' then 0.055 when 'SEK' then 0.095 when 'NOK' then 0.094 when 'DKK' then 0.145
    when 'PLN' then 0.25 when 'CZK' then 0.044 when 'HUF' then 0.0028 when 'ILS' then 0.27 when 'EGP' then 0.02 when 'MAD' then 0.1
    else null end
$$;

-- Booking channel from the booking link
create or replace function public.booking_channel(p_url text, p_source text)
returns text language sql immutable set search_path = '' as $$
  select case
    when p_url ~* 'booking\.com' then 'Booking.com'
    when p_url ~* 'expedia|hotels\.com|vrbo|orbitz|travelocity|hotwire' then 'Expedia group'
    when p_url ~* 'airbnb' then 'Airbnb'
    when p_url ~* 'agoda|trip\.com|ctrip' then 'Agoda / Trip.com'
    when p_url ~* 'kayak|skyscanner|google\.com/travel|momondo' then 'Search sites'
    when p_url ~* 'opentable|resy|thefork|tock' then 'Restaurant apps'
    when p_url ~* 'getyourguide|viator|klook|tiqets' then 'Tour sites'
    when p_url is not null and p_url <> '' then 'Direct'
    when p_source = 'email_import' then 'Forwarded email'
    when p_source in ('paste_import', 'import', 'file_import') then 'Imported'
    else null end
$$;

create or replace function public.region_of(p_tz text)
returns text language sql immutable set search_path = '' as $$
  select case
    when p_tz is null then null
    when p_tz ~ '^Europe/' then 'Europe'
    when p_tz ~ '^America/' then 'Americas'
    when p_tz ~ '^(Asia/(Dubai|Riyadh|Qatar|Bahrain|Kuwait|Muscat|Tehran|Baghdad|Jerusalem|Tel_Aviv|Amman|Beirut|Damascus))' then 'Middle East'
    when p_tz ~ '^Asia/' then 'Asia'
    when p_tz ~ '^Africa/' then 'Africa'
    when p_tz ~ '^(Australia|Pacific)/' then 'Oceania'
    when p_tz ~ '^Atlantic/' then 'Atlantic islands'
    when p_tz ~ '^Indian/' then 'Indian Ocean'
    else null end
$$;

create or replace function public.admin_insight_rows()
returns table (
  user_id uuid, traveller_type text, trips_per_year numeric, avg_trip_days numeric, lead_days numeric, planning_style text,
  trip_style text, regions text[], channel text, affluence text, affluence_score numeric, affluence_signals integer,
  affluence_why text[], persona text, active_days_30 integer, active_min_30 numeric, sessions_30 integer, lifetime_value integer,
  health integer, next_action text
)
language sql stable security definer set search_path = '' as $$
  with base as (select * from public.admin_member_rows()),
  t as (
    select uid, count(*) filter (where start_date is not null) as dated,
      min(start_date) as first_start,
      avg(end_date - start_date + 1) filter (where start_date is not null) as avg_days,
      avg(start_date - created_at::date) filter (where start_date >= created_at::date) as lead,
      count(*) filter (where end_date - start_date + 1 <= 4) as short_n,
      count(*) filter (where end_date - start_date + 1 >= 14) as long_n,
      count(*) filter (where stops >= 3) as multi_n,
      array_agg(distinct public.region_of(destination_tz)) filter (where destination_tz is not null) as regions,
      max(travellers) as max_travellers
    from (
      select x.uid, x.start_date, x.end_date, x.created_at, x.destination_tz,
        (select count(*) from public.trip_stops s where s.trip_id = x.id) as stops,
        1 + (select count(*) from public.trip_collaborators c where c.trip_id = x.id and c.status = 'accepted') as travellers
      from (
        select tr.owner_id as uid, tr.* from public.trips tr where tr.status is distinct from 'cancelled'
        union
        select c.user_id, tr.* from public.trip_collaborators c join public.trips tr on tr.id = c.trip_id
        where c.status = 'accepted' and c.user_id is not null and tr.status is distinct from 'cancelled'
      ) x
    ) y group by uid
  ),
  -- Affluence signals, each on a 1 (value) .. 5 (luxury) scale
  sig as (
    select b.created_by as uid, s.score, s.why from public.bookings b
    cross join lateral (values
      (case public.fare_tier(b.flight_class) when 'basic' then 1 when 'economy' then 2 when 'premium' then 3.5 when 'business' then 4.5 when 'first' then 5 end,
       'Flies ' || coalesce(public.fare_tier(b.flight_class), '')),
      (case when b.type::text = 'hotel' and b.price > 0 and public.usd_rate(b.currency) is not null then
         case when b.price * public.usd_rate(b.currency) / greatest(1, coalesce(b.check_out_date - b.check_in_date, 1)) < 100 then 1.5
              when b.price * public.usd_rate(b.currency) / greatest(1, coalesce(b.check_out_date - b.check_in_date, 1)) < 200 then 2.5
              when b.price * public.usd_rate(b.currency) / greatest(1, coalesce(b.check_out_date - b.check_in_date, 1)) < 400 then 3.5
              else 4.5 end end,
       'Hotel ~$' || round(b.price * coalesce(public.usd_rate(b.currency), 0) / greatest(1, coalesce(b.check_out_date - b.check_in_date, 1))) || '/night'),
      (case when b.room_type ~* 'suite|club|villa|executive|penthouse|residence|premier' then 4
            when b.room_type ~* 'dorm|hostel|shared|bunk|capsule' then 1 end, 'Room: ' || coalesce(b.room_type, '')),
      (case when b.airline ~* 'spirit|frontier|allegiant|sun country|ryanair|easyjet|wizz|vueling|jet2|volaris|viva|flair|scoot|airasia|indigo|cebu|jetstar|pegasus|transavia|norse|play\b|eurowings' then 1.5 end,
       'Low-cost airline (' || coalesce(b.airline, '') || ')')
    ) as s(score, why)
    where s.score is not null
    union all
    select l.user_id, case when l.tier ~* 'diamond|platinum|executive|1k|concierge|ambassador|titanium|black|chairman|lifetime' then 4
                           when l.tier ~* 'gold' then 3 when l.tier ~* 'silver' then 2.5 end,
           'Status: ' || l.program_name || ' ' || l.tier
    from public.loyalty_cards l where l.tier is not null
      and l.tier ~* 'diamond|platinum|executive|1k|concierge|ambassador|titanium|black|chairman|lifetime|gold|silver'
  ),
  aff as (
    select uid, avg(score) as score, count(*)::int as n, (array_agg(distinct why))[1:6] as why from sig group by uid
  ),
  ch as (
    select uid, channel from (
      select b.created_by as uid, public.booking_channel(b.booking_url, b.source) as channel, count(*) as n,
        row_number() over (partition by b.created_by order by count(*) desc) as rn
      from public.bookings b where public.booking_channel(b.booking_url, b.source) is not null group by 1, 2
    ) z where rn = 1
  ),
  ev as (
    select e.user_id as uid,
      count(*) filter (where e.event in ('guide_viewed', 'guide_load_more', 'honk_used', 'get_there', 'idea_added')) as explore_n,
      count(*) filter (where e.event in ('booking_added', 'booking_edited', 'import_saved', 'trip_created', 'checklist_generated')) as organise_n,
      count(*) filter (where e.event in ('translate_used', 'text_translated', 'phrases_loaded')) as language_n,
      count(*) filter (where e.event in ('invite_accepted', 'collaborator_role_changed')) as group_n,
      count(distinct e.ts::date) filter (where e.ts > now() - interval '30 days') as days30,
      coalesce(sum((e.props ->> 'seconds')::numeric) filter (where e.event = 'active_time' and e.ts > now() - interval '30 days'), 0) / 60 as min30,
      count(distinct e.session_id) filter (where e.ts > now() - interval '30 days') as sessions30
    from public.analytics_events e group by e.user_id
  ),
  inv as (select c.user_id as uid, count(*) as invites from public.trip_collaborators c join public.trips tr on tr.id = c.trip_id
          where c.invited_by = tr.owner_id group by c.user_id),
  ltv as (select c.user_id as uid, sum(c.amount - coalesce(c.amount_refunded, 0)) filter (where c.paid)::int as paid
          from public.stripe_charges c where c.user_id is not null and c.livemode is not distinct from (select livemode from public.stripe_sync where id = 1) group by c.user_id)
  select m.user_id,
    case when coalesce(greatest(m.party_max, t.max_travellers), 1) <= 1 then 'Solo'
         when greatest(m.party_max, t.max_travellers) = 2 then 'Couple or pair'
         else 'Family or group' end,
    round(case when t.dated > 0 then t.dated / greatest(1.0, (current_date - t.first_start) / 365.0 + case when t.first_start > current_date then 1 else 0 end) end, 1),
    round(t.avg_days, 1), round(t.lead, 0),
    case when t.lead is null then null when t.lead >= 60 then 'Early planner' when t.lead >= 14 then 'Planner' else 'Last-minute' end,
    case when coalesce(t.dated, 0) = 0 then null
         when t.multi_n * 2 >= t.dated then 'Multi-city'
         when t.long_n * 2 >= t.dated then 'Long trips'
         when t.short_n * 2 >= t.dated then 'Short breaks'
         else 'Mixed' end,
    coalesce(array_remove(t.regions, null), '{}'),
    ch.channel,
    case when a.score is null then null when a.score < 2 then 'Value' when a.score < 2.75 then 'Comfort' when a.score < 3.5 then 'Premium' else 'Luxury' end,
    round(a.score, 2), coalesce(a.n, 0), coalesce(a.why, '{}'),
    case greatest(coalesce(ev.explore_n, 0), coalesce(ev.organise_n, 0), coalesce(ev.language_n, 0) * 2, coalesce(ev.group_n, 0) * 3 + coalesce(inv.invites, 0) * 3)
      when 0 then null
      when coalesce(ev.organise_n, 0) then 'Organiser'
      when coalesce(ev.explore_n, 0) then 'Explorer'
      when coalesce(ev.language_n, 0) * 2 then 'Linguist'
      else 'Group planner' end,
    coalesce(ev.days30, 0)::int, round(coalesce(ev.min30, 0), 0), coalesce(ev.sessions30, 0)::int, ltv.paid,
    -- Health 0-100: recent use, a trip coming up, trips so far, paying
    least(100, (least(coalesce(ev.days30, 0), 10) * 4)
      + case when m.stage in ('getting_ready', 'on_the_road', 'planning') then 25 when m.stage in ('dreaming', 'just_back') then 15
             when m.stage = 'between_trips' then 10 else 0 end
      + least(m.trips, 5) * 3 + case when m.plan = 'first_class' then 10 else 0 end)::int,
    case
      when m.status <> 'active' then 'Account under moderation'
      when m.stage = 'new' and m.joined > now() - interval '14 days' then 'Welcome note: help them add their first trip'
      when m.stage = 'new' then 'Nudge: no trip yet'
      when m.stage = 'getting_ready' then 'Check their bookings imported cleanly before they leave'
      when m.stage = 'on_the_road' then 'Leave them be; make sure nothing is broken'
      when m.stage = 'just_back' and m.plan = 'free' then 'Send a trip recap and the First Class offer'
      when m.stage = 'just_back' then 'Ask for a review or a share'
      when m.stage = 'lapsed' then 'Win-back: inspiration for their next trip'
      when m.plan = 'free' and coalesce(ev.days30, 0) >= 8 then 'Heavy free user: First Class offer'
      when m.stage = 'dreaming' then 'Inspiration: guide for their dream destination'
      else null end
  from base m
  left join t on t.uid = m.user_id
  left join aff a on a.uid = m.user_id
  left join ch on ch.uid = m.user_id
  left join ev on ev.uid = m.user_id
  left join inv on inv.uid = m.user_id
  left join ltv on ltv.uid = m.user_id
$$;
revoke all on function public.admin_insight_rows() from public, anon, authenticated;

-- One member's insights (for the profile)
create or replace function public.admin_member_insights(p_user uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.admin_guard('analyst');
  return (select to_jsonb(i) - 'user_id' from public.admin_insight_rows() i where i.user_id = p_user);
end;
$$;

-- Members list with insights joined (same filters as admin_members, plus segment fields)
create or replace function public.admin_members_plus(p_search text default null, p_exclude_internal boolean default true)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_list jsonb;
begin
  perform public.admin_guard('analyst');
  v_list := public.admin_members(p_search, null, null, null, p_exclude_internal);
  return coalesce((
    select jsonb_agg(m || coalesce(to_jsonb(i) - 'user_id' - 'affluence_why', '{}'::jsonb))
    from jsonb_array_elements(v_list) m left join public.admin_insight_rows() i on i.user_id = (m ->> 'id')::uuid
  ), '[]'::jsonb);
end;
$$;

-- Audience: the member base as distributions, for marketing and partner pitches
create or replace function public.admin_audience(p_exclude_internal boolean default true)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.admin_guard('analyst');
  return (
    with m as (
      select b.*, i.traveller_type, i.trips_per_year, i.avg_trip_days, i.lead_days, i.planning_style, i.trip_style, i.regions, i.channel,
        i.affluence, i.persona, i.lifetime_value, i.health
      from public.admin_member_rows() b join public.admin_insight_rows() i on i.user_id = b.user_id
      where not p_exclude_internal or not b.internal
    ),
    dist as (
      select 'traveller_type' as k, traveller_type as v from m union all
      select 'affluence', affluence from m union all
      select 'planning_style', planning_style from m union all
      select 'trip_style', trip_style from m union all
      select 'channel', channel from m union all
      select 'persona', persona from m union all
      select 'platform', platform from m union all
      select 'plan', plan from m union all
      select 'stage', stage from m union all
      select 'source', source from m union all
      select 'region', unnest(case when cardinality(regions) = 0 then array[null::text] else regions end) from m
    )
    select jsonb_build_object(
      'members', (select count(*) from m),
      'with_trips', (select count(*) from m where trips > 0),
      'avg_trips_per_year', (select round(avg(trips_per_year), 1) from m),
      'avg_trip_days', (select round(avg(avg_trip_days), 1) from m),
      'avg_lead_days', (select round(avg(lead_days)) from m),
      'avg_health', (select round(avg(health)) from m),
      'premium_or_better_pct', (select round(100.0 * count(*) filter (where affluence in ('Premium', 'Luxury')) / nullif(count(*) filter (where affluence is not null), 0)) from m),
      'affluence_known', (select count(*) from m where affluence is not null),
      'paying', (select count(*) from m where plan = 'first_class'),
      'lifetime_value', (select coalesce(sum(lifetime_value), 0) from m),
      'dist', (select jsonb_object_agg(k, vals) from (
        select k, jsonb_agg(jsonb_build_object('value', coalesce(v, 'Not known yet'), 'n', n) order by n desc) as vals
        from (select k, v, count(*) as n from dist group by k, v) x group by k) y)
    )
  );
end;
$$;

do $$
declare f text;
begin
  foreach f in array array['public.admin_member_insights(uuid)', 'public.admin_members_plus(text, boolean)', 'public.admin_audience(boolean)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
