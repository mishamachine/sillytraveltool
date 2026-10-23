-- Money → Statement: Stripe gross → fees → net from Stripe's own ledger (balance transactions), exact AI cost per call
-- (provider, model, tokens) and DeepSeek's real balance. Known gaps (Google's actual bill, App Store / Google Play
-- revenue, fixed bills) are returned as placeholders so the statement says what is missing instead of hiding it.

-- ── Stripe ledger ───────────────────────────────────────────────────────────────
create table if not exists public.stripe_balance_txns (
  id text primary key,
  livemode boolean,
  type text,                 -- charge, payment, refund, adjustment, stripe_fee, payout, …
  reporting_category text,   -- charge, refund, dispute, fee, payout, other_adjustment, …
  amount bigint,             -- cents, signed
  fee bigint,
  net bigint,
  currency text,
  fee_details jsonb,         -- [{type: stripe_fee | tax | application_fee, amount, description}]
  description text,
  source text,
  status text,
  created timestamptz,
  available_on timestamptz,
  synced_at timestamptz default now()
);
create index if not exists stripe_balance_txns_created on public.stripe_balance_txns (created);
alter table public.stripe_balance_txns enable row level security;
revoke all on public.stripe_balance_txns from anon, authenticated;
alter table public.stripe_sync add column if not exists balance jsonb;   -- GET /v1/balance: available + pending

-- ── AI calls with provider, model and tokens ────────────────────────────────────
create table if not exists public.ai_calls (
  id bigserial primary key,
  ts timestamptz not null default now(),
  day date not null default current_date,
  user_id uuid,
  feature text,              -- the Edge Function, e.g. generate-guide
  provider text not null,    -- deepseek | gemini
  model text,
  input_tokens integer not null default 0,
  cached_tokens integer not null default 0,
  output_tokens integer not null default 0,
  ok boolean not null default true,
  usd numeric(12, 6) not null default 0   -- priced when logged, with the rates in force then
);
create index if not exists ai_calls_day on public.ai_calls (day, user_id);
alter table public.ai_calls enable row level security;
revoke all on public.ai_calls from anon, authenticated;

-- Prices per million tokens; the owner edits them in Money → Controls
update public.app_settings set value = value || jsonb_build_object('ai_prices', jsonb_build_object(
  'deepseek-chat', jsonb_build_object('input', 0.28, 'cached_input', 0.028, 'output', 0.42),
  'gemini-2.5-flash', jsonb_build_object('input', 0.30, 'cached_input', 0.075, 'output', 2.50),
  'gemini-flash-latest', jsonb_build_object('input', 0.30, 'cached_input', 0.075, 'output', 2.50)))
where key = 'cost_rates' and not value ? 'ai_prices';

create or replace function public.log_ai_call(p_user uuid, p_feature text, p_provider text, p_model text,
  p_input integer, p_cached integer, p_output integer, p_ok boolean default true)
returns void language plpgsql security definer set search_path = '' as $$
declare v_p jsonb := public.setting('cost_rates') -> 'ai_prices';
  v_m jsonb; v_usd numeric;
begin
  v_m := coalesce(v_p -> p_model, v_p -> case when p_provider = 'deepseek' then 'deepseek-chat' else 'gemini-2.5-flash' end, '{}'::jsonb);
  v_usd := (greatest(coalesce(p_input, 0) - coalesce(p_cached, 0), 0) * coalesce((v_m ->> 'input')::numeric, 0)
          + coalesce(p_cached, 0) * coalesce((v_m ->> 'cached_input')::numeric, (v_m ->> 'input')::numeric, 0)
          + coalesce(p_output, 0) * coalesce((v_m ->> 'output')::numeric, 0)) / 1e6;
  insert into public.ai_calls (user_id, feature, provider, model, input_tokens, cached_tokens, output_tokens, ok, usd)
  values (p_user, left(p_feature, 60), left(p_provider, 20), left(p_model, 60), coalesce(p_input, 0), coalesce(p_cached, 0), coalesce(p_output, 0), coalesce(p_ok, true), v_usd);
end;
$$;
revoke all on function public.log_ai_call(uuid, text, text, text, integer, integer, integer, boolean) from public, anon, authenticated;
grant execute on function public.log_ai_call(uuid, text, text, text, integer, integer, integer, boolean) to service_role;

-- ── Provider balances (DeepSeek's real balance, snapshotted hourly by cost-alert) ──
create table if not exists public.provider_balances (
  ts timestamptz not null default now(),
  provider text not null,
  currency text not null,
  total numeric, granted numeric, topped_up numeric,
  primary key (provider, currency, ts)
);
alter table public.provider_balances enable row level security;
revoke all on public.provider_balances from anon, authenticated;

create or replace function public.save_provider_balance(p_provider text, p_currency text, p_total numeric, p_granted numeric, p_topped_up numeric)
returns void language sql security definer set search_path = '' as $$
  insert into public.provider_balances (provider, currency, total, granted, topped_up) values (p_provider, p_currency, p_total, p_granted, p_topped_up)
$$;
revoke all on function public.save_provider_balance(text, text, numeric, numeric, numeric) from public, anon, authenticated;
grant execute on function public.save_provider_balance(text, text, numeric, numeric, numeric) to service_role;

-- ── Settings: cost_rates now holds two nested objects (google, ai_prices) ─────────
create or replace function public.admin_setting_set(p_key text, p_value jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_old jsonb; v_new jsonb; k text; v jsonb;
begin
  perform public.admin_guard('owner');
  if p_key not in ('founders_offer', 'free_limits', 'ai_limits', 'google_limits', 'kill', 'cost_alert', 'cost_rates') then
    raise exception 'unknown_setting' using errcode = '22023';
  end if;
  if jsonb_typeof(p_value) <> 'object' then raise exception 'bad_value' using errcode = '22023'; end if;
  p_value := p_value - 'last_sent_day' - '_updated_at';
  for k, v in select * from jsonb_each(p_value) loop
    if p_key in ('founders_offer', 'kill') and jsonb_typeof(v) <> 'boolean' then raise exception 'bad_value' using errcode = '22023'; end if;
    if p_key not in ('founders_offer', 'kill') and not (
      (jsonb_typeof(v) = 'number' and (v #>> '{}')::numeric >= 0)
      or (p_key = 'cost_rates' and k = 'google' and jsonb_typeof(v) = 'object'
          and not exists (select 1 from jsonb_each(v) g where jsonb_typeof(g.value) <> 'number' or (g.value #>> '{}')::numeric < 0))
      or (p_key = 'cost_rates' and k = 'ai_prices' and jsonb_typeof(v) = 'object'
          and not exists (select 1 from jsonb_each(v) m where jsonb_typeof(m.value) <> 'object'
            or exists (select 1 from jsonb_each(m.value) f where jsonb_typeof(f.value) <> 'number' or (f.value #>> '{}')::numeric < 0)))
    ) then raise exception 'bad_value' using errcode = '22023'; end if;
  end loop;
  select value into v_old from public.app_settings where key = p_key;
  v_new := coalesce(v_old, '{}'::jsonb) || p_value;
  if p_key = 'cost_rates' then
    if p_value ? 'google' then v_new := jsonb_set(v_new, '{google}', coalesce(v_old -> 'google', '{}'::jsonb) || (p_value -> 'google')); end if;
    if p_value ? 'ai_prices' then
      v_new := jsonb_set(v_new, '{ai_prices}', coalesce((select jsonb_object_agg(m, coalesce(v_old -> 'ai_prices' -> m, '{}'::jsonb) || coalesce(p_value -> 'ai_prices' -> m, '{}'::jsonb))
        from (select jsonb_object_keys(coalesce(v_old -> 'ai_prices', '{}'::jsonb) || (p_value -> 'ai_prices')) m) x), '{}'::jsonb));
    end if;
  end if;
  insert into public.app_settings (key, value, updated_at, updated_by) values (p_key, v_new, now(), auth.uid())
  on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = auth.uid();
  perform public.admin_log('setting_' || p_key, null, jsonb_build_object('from', v_old, 'to', v_new));
  return v_new;
end;
$$;
revoke all on function public.admin_setting_set(text, jsonb) from public, anon;
grant execute on function public.admin_setting_set(text, jsonb) to authenticated;

-- ── cost_rows: AI cost from logged tokens on days that have them, else calls × flat rate ──
create or replace function public.cost_rows(p_from date, p_to date)
returns table (day date, user_id uuid, ai_calls integer, guide_calls integer, google_calls integer,
               ai_usd numeric, guide_usd numeric, google_usd numeric)
language sql stable security definer set search_path = '' as $$
  with r as (select public.setting('cost_rates') as v),
  logged_days as (select distinct c.day from public.ai_calls c where c.day between p_from and p_to),
  ai as (
    select a.day, a.user_id, sum(a.calls) filter (where a.kind <> 'guide')::int as ai, sum(a.calls) filter (where a.kind = 'guide')::int as guide
    from public.ai_usage a where a.day between p_from and p_to group by 1, 2),
  tok as (
    select c.day, coalesce(c.user_id, '00000000-0000-0000-0000-000000000000') as user_id,
      sum(c.usd) filter (where c.feature is distinct from 'generate-guide') as ai_usd,
      sum(c.usd) filter (where c.feature = 'generate-guide') as guide_usd
    from public.ai_calls c where c.day between p_from and p_to group by 1, 2),
  g as (
    select u.day, u.user_id, sum(u.calls)::int as calls,
      sum(u.calls * coalesce((r.v -> 'google' ->> u.endpoint)::numeric, (r.v -> 'google' ->> 'other')::numeric, 0.005)) as usd
    from public.api_usage u, r where u.service = 'google' and u.day between p_from and p_to group by 1, 2),
  keys as (select day, user_id from ai union select day, user_id from tok union select day, user_id from g)
  select k.day, k.user_id,
    coalesce(ai.ai, 0), coalesce(ai.guide, 0), coalesce(g.calls, 0),
    case when k.day in (select day from logged_days) then coalesce(tok.ai_usd, 0) else coalesce(ai.ai, 0) * coalesce((r.v ->> 'ai_call')::numeric, 0) end,
    case when k.day in (select day from logged_days) then coalesce(tok.guide_usd, 0) else coalesce(ai.guide, 0) * coalesce((r.v ->> 'guide_section')::numeric, 0) end,
    coalesce(g.usd, 0)
  from keys k cross join r
  left join ai on ai.day = k.day and ai.user_id = k.user_id
  left join tok on tok.day = k.day and tok.user_id = k.user_id
  left join g on g.day = k.day and g.user_id = k.user_id
$$;
revoke all on function public.cost_rows(date, date) from public, anon, authenticated;

-- ── The statement ───────────────────────────────────────────────────────────────
create or replace function public.admin_financials(p_from date, p_to date, p_exclude_internal boolean default true)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_live boolean; v_sync jsonb; v_rates jsonb := public.setting('cost_rates');
  v_days integer := greatest(1, p_to - p_from + 1);
  v_s jsonb; v_ai jsonb; v_costs jsonb; v_ds jsonb;
  v_net numeric; v_ai_usd numeric; v_guide_usd numeric; v_google_usd numeric; v_fixed jsonb; v_fixed_total numeric; v_has_ledger boolean;
begin
  perform public.admin_guard('analyst');
  select livemode, to_jsonb(s) - 'id' into v_live, v_sync from public.stripe_sync s where id = 1;
  select exists (select 1 from public.stripe_balance_txns where livemode is not distinct from v_live) into v_has_ledger;

  -- Stripe, from the ledger (cents → dollars)
  select jsonb_build_object(
    'connected', v_has_ledger,
    'livemode', v_live,
    'gross', coalesce(sum(amount) filter (where reporting_category = 'charge'), 0) / 100.0,
    'refunds', coalesce(sum(amount) filter (where reporting_category in ('refund', 'refund_failure')), 0) / 100.0,
    'disputes', coalesce(sum(amount) filter (where reporting_category in ('dispute', 'dispute_reversal')), 0) / 100.0,
    'processing_fees', -coalesce(sum(fee) filter (where reporting_category not in ('fee', 'payout', 'payout_reversal', 'topup', 'transfer')), 0) / 100.0,
    'stripe_fees', coalesce(sum(net) filter (where reporting_category = 'fee'), 0) / 100.0,
    'other', coalesce(sum(amount) filter (where reporting_category not in ('charge', 'refund', 'refund_failure', 'dispute', 'dispute_reversal', 'fee', 'payout', 'payout_reversal', 'topup', 'transfer')), 0) / 100.0,
    'net', coalesce(sum(net) filter (where reporting_category not in ('payout', 'payout_reversal', 'topup', 'transfer')), 0) / 100.0,
    'payouts', -coalesce(sum(amount) filter (where reporting_category in ('payout', 'payout_reversal')), 0) / 100.0,
    'fee_lines', coalesce((select jsonb_agg(jsonb_build_object('label', x.label, 'amount', x.amount / 100.0) order by x.amount) from (
        select coalesce(nullif(fd ->> 'description', ''), fd ->> 'type') as label, -sum((fd ->> 'amount')::bigint) as amount
        from public.stripe_balance_txns t2, jsonb_array_elements(coalesce(t2.fee_details, '[]'::jsonb)) fd
        where t2.livemode is not distinct from v_live and t2.created >= p_from and t2.created < p_to + 1 and t2.reporting_category not in ('fee', 'payout', 'payout_reversal', 'topup', 'transfer')
        group by 1
        union all
        select coalesce(nullif(t3.description, ''), 'Stripe fee'), sum(t3.net)
        from public.stripe_balance_txns t3
        where t3.livemode is not distinct from v_live and t3.created >= p_from and t3.created < p_to + 1 and t3.reporting_category = 'fee'
        group by 1) x where x.amount <> 0), '[]'::jsonb),
    'discounts', (select coalesce(sum(amount_discount), 0) / 100.0 from public.stripe_checkouts where livemode is not distinct from v_live and status = 'complete' and created >= p_from and created < p_to + 1),
    'transactions', count(*),
    'balance', v_sync -> 'balance',
    'last_sync', v_sync ->> 'last_sync',
    'currencies', coalesce(jsonb_agg(distinct currency) filter (where currency is not null), '[]'::jsonb)
  ) into v_s
  from public.stripe_balance_txns t
  where t.livemode is not distinct from v_live and t.created >= p_from and t.created < p_to + 1;
  v_net := (v_s ->> 'net')::numeric;

  -- Costs: every account, internal included (p_exclude_internal is ignored here: your own testing costs real money)
  select coalesce(sum(c.ai_usd), 0), coalesce(sum(c.guide_usd), 0), coalesce(sum(c.google_usd), 0) into v_ai_usd, v_guide_usd, v_google_usd
  from public.cost_rows(p_from, p_to) c;
  v_fixed := jsonb_build_array(
    jsonb_build_object('label', 'Supabase', 'amount', round(coalesce((v_rates ->> 'supabase_monthly')::numeric, 0) * v_days / 30.0, 2), 'source', 'monthly amount in Controls, prorated'),
    jsonb_build_object('label', 'Hosting (Hostinger)', 'amount', round(coalesce((v_rates ->> 'hosting_monthly')::numeric, 0) * v_days / 30.0, 2), 'source', 'monthly amount in Controls, prorated'));
  v_fixed_total := (select sum((x ->> 'amount')::numeric) from jsonb_array_elements(v_fixed) x);

  select jsonb_build_object(
    'by_provider', coalesce((select jsonb_agg(p order by p.usd desc) from (
        select provider, model, count(*) calls, count(*) filter (where not ok) failed, sum(input_tokens) input_tokens, sum(cached_tokens) cached_tokens,
          sum(output_tokens) output_tokens, round(sum(usd), 4) usd
        from public.ai_calls where day between p_from and p_to group by 1, 2) p), '[]'::jsonb),
    'by_feature', coalesce((select jsonb_agg(f order by f.usd desc) from (
        select coalesce(feature, 'unknown') feature, count(*) calls, round(sum(usd), 4) usd, round(avg(input_tokens + output_tokens)) avg_tokens
        from public.ai_calls where day between p_from and p_to group by 1) f), '[]'::jsonb),
    'logged_since', (select min(day) from public.ai_calls),
    'estimated_days', (select count(distinct a.day) from public.ai_usage a where a.day between p_from and p_to
                       and a.day not in (select distinct c.day from public.ai_calls c))
  ) into v_ai;

  -- DeepSeek's real balance: spend = drops between hourly snapshots (a rise is a top-up and isn't spend)
  select jsonb_build_object(
    'connected', exists (select 1 from public.provider_balances where provider = 'deepseek'),
    'latest', (select jsonb_build_object('ts', ts, 'currency', currency, 'total', total, 'granted', granted, 'topped_up', topped_up)
               from public.provider_balances where provider = 'deepseek' order by ts desc limit 1),
    'spent', (select round(coalesce(sum(greatest(prev - total, 0)), 0), 4) from (
                select total, lag(total) over (partition by currency order by ts) prev, ts from public.provider_balances where provider = 'deepseek') b
              where b.ts >= p_from and b.ts < p_to + 1 and prev is not null),
    'tracked_since', (select min(ts) from public.provider_balances where provider = 'deepseek'),
    'tokens_usd', (select round(coalesce(sum(usd), 0), 4) from public.ai_calls where provider = 'deepseek' and day between p_from and p_to)
  ) into v_ds;

  return jsonb_build_object(
    'days', v_days,
    'stripe', v_s,
    'stores', jsonb_build_object('connected', false, 'gross', null, 'fees', null, 'net', null,
      'note', 'App Store and Google Play sales arrive with the native apps (RevenueCat). Apple and Google keep 15% (small business programmes).'),
    'revenue_net', v_net,
    'costs', jsonb_build_object(
      'ai', round(v_ai_usd, 2), 'guides', round(v_guide_usd, 2), 'google', round(v_google_usd, 2),
      'fixed', v_fixed, 'fixed_total', v_fixed_total,
      'total', round(v_ai_usd + v_guide_usd + v_google_usd + v_fixed_total, 2),
      'missing', jsonb_build_array(
        jsonb_build_object('key', 'google_billing', 'label', 'Google Cloud actual bill (Maps + Gemini)', 'detail', 'Using calls × list price until the billing export is connected (Cloud Billing → BigQuery export, then the GCP_BILLING_SA and GCP_BILLING_TABLE secrets).'),
        jsonb_build_object('key', 'resend', 'label', 'Resend (email)', 'detail', 'Free plan today; add it to the fixed costs when you upgrade.'),
        jsonb_build_object('key', 'stores', 'label', 'App Store and Google Play', 'detail', 'Developer fees ($99 a year Apple, $25 once Google) and store commission are not counted yet.'))),
    'ai', v_ai,
    'deepseek', v_ds,
    'profit', round(v_net - (v_ai_usd + v_guide_usd + v_google_usd + v_fixed_total), 2),
    'daily', coalesce((select jsonb_agg(jsonb_build_object('day', d, 'net', coalesce(n.net, 0), 'costs', round(coalesce(c.usd, 0) + v_fixed_total / v_days, 4)) order by d)
      from generate_series(p_from, p_to, interval '1 day') d
      left join (select created::date dd, sum(net) filter (where reporting_category not in ('payout', 'payout_reversal', 'topup', 'transfer')) / 100.0 net
                 from public.stripe_balance_txns where livemode is not distinct from v_live and created >= p_from and created < p_to + 1 group by 1) n on n.dd = d::date
      left join (select day dd, sum(ai_usd + guide_usd + google_usd) usd from public.cost_rows(p_from, p_to) group by 1) c on c.dd = d::date), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.admin_financials(date, date, boolean) from public, anon;
grant execute on function public.admin_financials(date, date, boolean) to authenticated;

-- Retention: AI call log and balance snapshots follow the 25-month rule
create or replace function public.purge_old_costs()
returns void language sql security definer set search_path = '' as $$
  delete from public.api_usage where day < current_date - interval '25 months';
  delete from public.usage_flags where day < current_date - interval '25 months';
  delete from public.ai_calls where day < current_date - interval '25 months';
  delete from public.provider_balances where ts < now() - interval '25 months';
$$;
revoke all on function public.purge_old_costs() from public, anon, authenticated;
