-- Keep each Stripe object's full metadata (plan, trigger, platform, code, campaign, experiment …) for later analysis
alter table public.stripe_checkouts add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.stripe_subscriptions add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.stripe_charges add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.stripe_customers add column if not exists metadata jsonb not null default '{}'::jsonb;
