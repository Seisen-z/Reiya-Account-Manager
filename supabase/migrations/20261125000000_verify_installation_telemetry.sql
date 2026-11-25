-- Keep legacy rows for reference. Only installations with an Auth user are counted.
alter table public.app_ratings add column auth_user_id uuid unique;
alter table public.app_presence add column auth_user_id uuid unique;

create index app_presence_verified_recent_idx on public.app_presence (last_seen)
  where auth_user_id is not null;

create function public.app_verified_rating_stats()
returns table (average double precision, count bigint)
language sql stable set search_path = ''
as $$
  select coalesce(avg(rating), 0)::double precision, count(*)
  from public.app_ratings
  where auth_user_id is not null;
$$;

revoke execute on function public.app_verified_rating_stats() from public, anon, authenticated;
grant execute on function public.app_verified_rating_stats() to service_role;
