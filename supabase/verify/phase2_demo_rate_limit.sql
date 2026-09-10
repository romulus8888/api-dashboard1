-- ============================================================================
-- Phase 2 verification: atomic demo rate limit
--
-- Rollback-safe: entire script runs inside BEGIN … ROLLBACK.
-- Prerequisite: apply 20260910140000_create_demo_rate_limit.sql
-- ============================================================================

begin;

do $$
declare
  v_result jsonb;
  v_bucket_key text := 'verify-rate-limit-' || gen_random_uuid()::text;
begin
  raise notice '=== Phase 2 demo rate limit verification (transaction will roll back) ===';

  v_result := public.check_demo_rate_limit(v_bucket_key, 2, 60);

  if coalesce(v_result->>'allowed', 'false') <> 'true'
     or (v_result->>'remaining')::integer <> 1 then
    raise exception 'first request should be allowed with remaining=1, got %', v_result;
  end if;

  v_result := public.check_demo_rate_limit(v_bucket_key, 2, 60);

  if coalesce(v_result->>'allowed', 'false') <> 'true'
     or (v_result->>'remaining')::integer <> 0 then
    raise exception 'second request should be allowed with remaining=0, got %', v_result;
  end if;

  v_result := public.check_demo_rate_limit(v_bucket_key, 2, 60);

  if coalesce(v_result->>'allowed', 'false') <> 'false'
     or (v_result->>'remaining')::integer <> 0
     or coalesce((v_result->>'retry_after_seconds')::integer, 0) < 1 then
    raise exception 'third request should be denied with retry_after_seconds > 0, got %', v_result;
  end if;

  begin
    perform public.check_demo_rate_limit(v_bucket_key, 2, 60);
    perform public.check_demo_rate_limit(v_bucket_key, 2, 60);
  exception
    when unique_violation then
      raise exception 'concurrent-safe upsert must not raise unique_violation';
  end;

  raise notice 'OK: atomic rate limit returns allowed/remaining/retry deterministically';
  raise notice '=== Phase 2 demo rate limit checks passed (rolling back) ===';
end;
$$;

rollback;
