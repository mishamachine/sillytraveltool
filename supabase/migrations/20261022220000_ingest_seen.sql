-- Webhook deliveries already handled (Svix message id, the same on every retry): receive-booking-email answers
-- at once and files in the background, and a retried delivery is skipped. Service role only (RLS, no policies).
create table if not exists public.ingest_seen (
  delivery_id text primary key,
  created_at timestamptz not null default now()
);
alter table public.ingest_seen enable row level security;
create index if not exists ingest_seen_created_idx on public.ingest_seen (created_at);
