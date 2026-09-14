-- Phase 11: clean-install guard — active migrations must not create legacy jobs objects.
-- Rollback-safe: entire script runs inside BEGIN … ROLLBACK.

begin;

do $$
begin
  if to_regclass('public.jobs') is not null then
    raise exception 'public.jobs must not exist after clean install migrations';
  end if;

  if to_regclass('public.job_processing_audit') is not null then
    raise exception 'public.job_processing_audit must not exist after clean install migrations';
  end if;

  raise notice 'OK: clean install has no legacy jobs objects';
end $$;

rollback;
