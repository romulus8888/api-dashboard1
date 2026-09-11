-- Static verification for Phase 7 lead metrics RPC.
-- Run after applying 20260911180000_create_lead_metrics_rpc.sql in a disposable database.

begin;

do $$
declare
  v_exists boolean;
  v_service_execute boolean;
  v_anon_execute boolean;
begin
  select exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'get_lead_metrics'
  ) into v_exists;

  if v_exists is distinct from true then
    raise exception 'Expected public.get_lead_metrics to exist';
  end if;

  select has_function_privilege(
    'service_role',
    'public.get_lead_metrics(timestamptz, timestamptz, timestamptz)',
    'EXECUTE'
  ) into v_service_execute;

  if v_service_execute is distinct from true then
    raise exception 'service_role must be able to execute public.get_lead_metrics';
  end if;

  select has_function_privilege(
    'anon',
    'public.get_lead_metrics(timestamptz, timestamptz, timestamptz)',
    'EXECUTE'
  ) into v_anon_execute;

  if v_anon_execute then
    raise exception 'anon must not execute public.get_lead_metrics';
  end if;
end $$;

rollback;
