-- Telemetry uses the service role after validating an anonymous Auth token.
-- The same token must not inherit existing website and admin table policies.
do $$
declare
  target record;
begin
  for target in
    select distinct schemaname, tablename
    from pg_policies
    where schemaname in ('public', 'storage')
      and roles && array['public', 'authenticated']::name[]
  loop
    execute format(
      'create policy reiya_installations_denied on %I.%I as restrictive for all to authenticated using ((select auth.jwt() ->> ''is_anonymous'') is distinct from ''true'') with check ((select auth.jwt() ->> ''is_anonymous'') is distinct from ''true'')',
      target.schemaname, target.tablename
    );
  end loop;
end
$$;
