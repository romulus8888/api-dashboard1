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
  v_window_start timestamptz;
  v_count integer;
  v_retry_after integer;
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

  select b.window_start, b.request_count
    into v_window_start, v_count
  from public.demo_rate_limit_buckets b
  where b.bucket_key = p_bucket_key
  for update;

  if not found then
    insert into public.demo_rate_limit_buckets (
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
    );

    return jsonb_build_object(
      'allowed', true,
      'retry_after_seconds', 0
    );
  end if;

  if v_window_start + make_interval(secs => p_window_seconds) <= v_now then
    update public.demo_rate_limit_buckets
    set
      window_start = v_now,
      request_count = 1,
      expires_at = v_now + make_interval(secs => p_window_seconds * 2)
    where bucket_key = p_bucket_key;

    return jsonb_build_object(
      'allowed', true,
      'retry_after_seconds', 0
    );
  end if;

  if v_count >= p_max_requests then
    v_retry_after := greatest(
      1,
      ceil(
        extract(
          epoch from (
            v_window_start + make_interval(secs => p_window_seconds) - v_now
          )
        )
      )::integer
    );

    return jsonb_build_object(
      'allowed', false,
      'retry_after_seconds', v_retry_after
    );
  end if;

  update public.demo_rate_limit_buckets
  set request_count = request_count + 1
  where bucket_key = p_bucket_key;

  return jsonb_build_object(
    'allowed', true,
    'retry_after_seconds', 0
  );
end;
$$;

comment on function public.check_demo_rate_limit(text, integer, integer) is
  'Atomically enforces a fixed-window request count for a hashed client bucket.';

alter table public.demo_rate_limit_buckets enable row level security;

revoke all on table public.demo_rate_limit_buckets from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.demo_rate_limit_buckets to service_role;

revoke all on function public.check_demo_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.check_demo_rate_limit(text, integer, integer) to service_role;
