-- ============================================================================
-- LOCAL / CI ONLY — legacy jobs stub for disposable legacy-upgrade validation
--
-- Never apply to hosted Supabase or production.
--
-- Provides minimal public.jobs so legacy audit migrations can run in the
-- isolated legacy CI track. Real hosted projects already have their own jobs DDL.
-- ============================================================================

create extension if not exists pgcrypto;

create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);

comment on table public.jobs is
  'LOCAL/CI STUB ONLY. Disposable legacy-track prerequisite; not the production jobs schema.';

grant select, insert, update on table public.jobs to anon, authenticated, service_role;
