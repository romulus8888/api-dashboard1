-- ============================================================================
-- Demo API rate limiting (Phase 2)
--
-- Atomic PostgreSQL-backed buckets for POST /api/demo/generate-lead.
-- Stores only hashed client identifiers; no raw IP addresses.
-- Short retention via expires_at. Closed RLS; service_role only.
-- ============================================================================

create table public.demo_rate_limit_buckets (
  bucket_key text primary key
    constraint demo_rate_limit_buckets_key_not_blank
      check (length(btrim(bucket_key)) > 0),

  window_start timestamptz not null,
  request_count integer not null
    constraint demo_rate_limit_buckets_count_positive
      check (request_count >= 1),

  expires_at timestamptz not null
);

comment on table public.demo_rate_limit_buckets is
  'Hashed client buckets for demo lead generation rate limits. Rows expire automatically.';

create index demo_rate_limit_buckets_expires_at_idx
  on public.demo_rate_limit_buckets (expires_at);

create or replace function public.check_demo_rate_limit(
  p_bucket_key text,
  p_max_requests integer,
  p_window_seconds integer
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, pg_temp
as $$
declare
  v_now timestamptz := pg_catalog.now();
  v_row public.demo_rate_limit_buckets;
  v_window_end timestamptz;
  v_retry_after integer;
  v_remaining integer;
begin
  if p_bucket_key is null or length(btrim(p_bucket_key)) = 0 then
    raise exception 'check_demo_rate_limit: p_bucket_key is required';
  end if;

  if p_max_requests < 1 then
    raise exception 'check_demo_rate_limit: p_max_requests must be >= 1';
  end if;

  if p_window_seconds < 1 then
    raise exception 'check_demo_rate_limit: p_window_seconds must be >= 1';
  end if;

  delete from public.demo_rate_limit_buckets
  where expires_at < v_now;

  insert into public.demo_rate_limit_buckets as existing (
    bucket_key,
    window_start,
    request_count,
    expires_at
  )
  values (
    p_bucket_key,
    v_now,
    1,
    v_now + make_interval(secs => p_window_seconds * 2)
  )
  on conflict (bucket_key) do update
  set
    window_start = case
      when existing.window_start + make_interval(secs => p_window_seconds) <= excluded.window_start
        then excluded.window_start
      else existing.window_start
    end,
    request_count = case
      when existing.window_start + make_interval(secs => p_window_seconds) <= excluded.window_start
        then 1
      else existing.request_count + 1
    end,
    expires_at = case
      when existing.window_start + make_interval(secs => p_window_seconds) <= excluded.window_start
        then excluded.expires_at
      else existing.expires_at
    end
  returning * into v_row;

  v_window_end := v_row.window_start + make_interval(secs => p_window_seconds);

  if v_row.request_count > p_max_requests then
    v_retry_after := greatest(
      1,
      ceil(extract(epoch from (v_window_end - v_now)))::integer
    );

    return jsonb_build_object(
      'allowed', false,
      'remaining', 0,
      'retry_after_seconds', v_retry_after
    );
  end if;

  v_remaining := p_max_requests - v_row.request_count;

  return jsonb_build_object(
    'allowed', true,
    'remaining', v_remaining,
    'retry_after_seconds', 0
  );
end;
$$;

comment on function public.check_demo_rate_limit(text, integer, integer) is
  'Atomically enforces a fixed-window request count via INSERT ... ON CONFLICT DO UPDATE.';

alter table public.demo_rate_limit_buckets enable row level security;

revoke all on table public.demo_rate_limit_buckets from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.demo_rate_limit_buckets to service_role;

revoke all on function public.check_demo_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.check_demo_rate_limit(text, integer, integer) to service_role;
