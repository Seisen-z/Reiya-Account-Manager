-- One row per device (hwid), upserted on every heartbeat. "Currently online"
-- is derived at query time from last_seen, not from row existence, so no
-- separate cleanup job is needed — stale rows just age out of the count.
create table if not exists public.app_presence (
  hwid      text primary key,
  last_seen timestamptz not null default now()
);

alter table public.app_presence enable row level security;
