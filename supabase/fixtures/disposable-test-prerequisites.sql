-- ============================================================================
-- LOCAL / CI ONLY — disposable test database prerequisites (clean install)
--
-- Never apply to hosted Supabase or production.
--
-- Provides Supabase-compatible roles and minimal Auth stubs so active lead/demo
-- migrations and verification can run on an isolated PostgreSQL instance.
--
-- Apply order (fresh disposable database — clean track):
--   1. this file
--   2. supabase/migrations/*.sql (active lead/demo migrations only)
--   3. supabase/verify/*.sql
--
-- Legacy jobs/audit objects live under supabase/legacy/ and are validated on a
-- separate disposable database track. They must not be applied to clean installs.
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
