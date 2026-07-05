-- One row per device (hwid) so a single user can't submit multiple ratings.
-- Re-rating updates the existing row rather than inserting a new one.
create table if not exists public.app_ratings (
  hwid       text primary key,
  rating     smallint not null check (rating between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- RLS is enabled with no policies: only the service-role key (used by the
-- edge functions below) can read/write this table, never the anon client key.
alter table public.app_ratings enable row level security;
