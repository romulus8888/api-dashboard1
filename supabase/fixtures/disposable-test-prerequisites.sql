-- ============================================================================
-- LOCAL / CI ONLY — disposable test database prerequisites
--
-- Never apply to hosted Supabase or production.
--
-- Provides minimal stubs so migrations and Phase 1 verification can run on an
-- isolated PostgreSQL instance without the full Supabase Auth stack or an
-- exported production jobs baseline.
--
-- Apply order (fresh disposable database):
--   1. this file
--   2. supabase/migrations/20260814000000_create_job_processing_audit.sql
--   3. supabase/migrations/20260910120000_create_lead_schema_and_status_history.sql
--   4. supabase/verify/phase1_lead_schema.sql
--
-- The production migration chain is NOT fully reproducible until a real
-- public.jobs baseline is exported from production.
-- ============================================================================

create extension if not exists pgcrypto;

-- Supabase-compatible roles (no-op if already present)
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;

  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;

  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end;
$$;

grant usage on schema public to anon, authenticated, service_role;

-- Minimal Auth stubs (not a Supabase Auth deployment)
create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key,
  email text
);

create or replace function auth.uid()
returns uuid
language sql
stable
set search_path = pg_catalog, pg_temp
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

create or replace function auth.role()
returns text
language sql
stable
set search_path = pg_catalog, pg_temp
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    current_setting('role', true)
  );
$$;

revoke all on function auth.uid() from public;
revoke all on function auth.role() from public;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant execute on function auth.role() to anon, authenticated, service_role;

-- Minimal legacy jobs table (local/CI stub only; not production semantics)
create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);

comment on table public.jobs is
  'LOCAL/CI STUB ONLY. Disposable-test prerequisite; not the production jobs schema.';
