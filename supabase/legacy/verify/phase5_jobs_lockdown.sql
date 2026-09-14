-- Static privilege verification for Phase 5 jobs lockdown.
-- Run after applying 20260910180000_lockdown_legacy_jobs.sql in a disposable database.

begin;

do $$
declare
  v_rls_enabled boolean;
  v_anon_select boolean;
  v_auth_select boolean;
begin
  select c.relrowsecurity
    into v_rls_enabled
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'jobs';

  if v_rls_enabled is distinct from true then
    raise exception 'Expected RLS to be enabled on public.jobs';
  end if;

  select has_table_privilege('anon', 'public.jobs', 'SELECT')
    into v_anon_select;

  select has_table_privilege('authenticated', 'public.jobs', 'SELECT')
    into v_auth_select;

  if v_anon_select then
    raise exception 'anon must not have SELECT on public.jobs';
  end if;

  if v_auth_select then
    raise exception 'authenticated must not have SELECT on public.jobs';
  end if;
end $$;

rollback;
