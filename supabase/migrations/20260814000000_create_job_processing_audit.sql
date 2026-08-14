-- ============================================================================
-- Job processing audit trail + atomic intake claim for the n8n workflow.
--
-- Purpose
--   `public.job_processing_audit` is a technical, back-office-only log of how an
--   incoming job request moves through automated processing. It is written by
--   n8n via the `service_role` key and is never exposed to the frontend.
--
--   `public.claim_job_for_processing()` is the intake gate: n8n calls it before
--   doing any work. The first caller for a given idempotency key wins (returns
--   true); every later caller is told to stand down (returns false) instead of
--   receiving an error. This makes retries, duplicate webhooks and parallel
--   workers safe without any application-level locking.
--
-- Schema assumptions (see docs/supabase-processing-audit.md)
--   The repository contains no SQL migrations for `public.jobs`, so its real
--   column types cannot be confirmed from source. This migration assumes
--   `public.jobs.id` is `uuid`. The guard block below fails loudly with an
--   explanatory message rather than silently creating a mismatched foreign key.
--
-- This migration does not modify `public.jobs` in any way.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. Preconditions
--    Deliberately NOT idempotent-by-silence: an incompatible `jobs` schema must
--    surface as a clear error, not be papered over.
-- ----------------------------------------------------------------------------
do $$
declare
  v_jobs_id_type text;
begin
  if to_regclass('public.jobs') is null then
    raise exception
      'public.jobs does not exist. Create the jobs table before applying this migration.';
  end if;

  select format_type(a.atttypid, a.atttypmod)
    into v_jobs_id_type
  from pg_attribute a
  where a.attrelid = 'public.jobs'::regclass
    and a.attname = 'id'
    and a.attnum > 0
    and not a.attisdropped;

  if v_jobs_id_type is distinct from 'uuid' then
    raise exception
      'public.jobs.id has type %, but this migration assumes uuid. Align job_processing_audit.job_id with the real type before applying.',
      coalesce(v_jobs_id_type, 'missing');
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- 1. Audit table
-- ----------------------------------------------------------------------------
create table if not exists public.job_processing_audit (
  id uuid primary key default gen_random_uuid(),

  -- Cascade: the audit trail is meaningless once the job row is gone, and
  -- keeping orphans would block deletes on `jobs`.
  job_id uuid not null
    references public.jobs (id) on delete cascade,

  -- Open vocabulary (`job.created`, later `job.updated`, ...): new event types
  -- must not require a migration, so only blankness is rejected.
  event_type text not null
    constraint job_processing_audit_event_type_not_blank
      check (length(btrim(event_type)) > 0),

  -- Also an open vocabulary: `received`, `validated`, `triaged`,
  -- `notification_sent`, and whatever later workflow steps are added.
  step text not null
    constraint job_processing_audit_step_not_blank
      check (length(btrim(step)) > 0),

  -- Closed vocabulary: these four states are the complete lifecycle of a step,
  -- so a CHECK here genuinely prevents bad data.
  outcome text not null
    constraint job_processing_audit_outcome_allowed
      check (outcome in ('processing', 'succeeded', 'failed', 'skipped')),

  idempotency_key text not null
    constraint job_processing_audit_idempotency_key_not_blank
      check (length(btrim(idempotency_key)) > 0),

  -- Nullable: a manual replay or a direct SQL fix has no n8n execution behind it.
  workflow_execution_id text,

  -- Defaults to an empty object so consumers can always use `->>` without a
  -- null check. The CHECK keeps it an object, never an array or bare scalar.
  details jsonb not null default '{}'::jsonb
    constraint job_processing_audit_details_is_object
      check (jsonb_typeof(details) = 'object'),

  error_message text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- The idempotency guarantee.
  --
  -- Scoped to (idempotency_key, step) rather than idempotency_key alone: one
  -- logical event legitimately produces several audit rows as it advances
  -- through the pipeline, so a global unique key would destroy the audit trail
  -- it is meant to protect. Per step, a duplicate is always a replay.
  --
  -- For initial intake this resolves to ('job.created:<job_id>', 'received'),
  -- which is exactly the pair `claim_job_for_processing()` conflicts on.
  constraint job_processing_audit_step_idempotent
    unique (idempotency_key, step)
);

-- ----------------------------------------------------------------------------
-- 2. Indexes
--    A lookup by `idempotency_key` alone needs no extra index: it is the
--    leading column of the unique constraint above.
-- ----------------------------------------------------------------------------

-- Primary read pattern: full trail of one job, newest first.
create index if not exists job_processing_audit_job_id_created_at_idx
  on public.job_processing_audit (job_id, created_at desc);

-- Operational read pattern: recent activity across all jobs.
create index if not exists job_processing_audit_created_at_idx
  on public.job_processing_audit (created_at desc);

-- Monitoring: stuck claims and failures. Partial, because succeeded/skipped
-- rows dominate the table and are not interesting here.
create index if not exists job_processing_audit_attention_idx
  on public.job_processing_audit (outcome, created_at desc)
  where outcome in ('processing', 'failed');

-- ----------------------------------------------------------------------------
-- 3. updated_at maintenance
-- ----------------------------------------------------------------------------
create or replace function public.set_job_processing_audit_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function public.set_job_processing_audit_updated_at() is
  'Keeps job_processing_audit.updated_at truthful when n8n advances a step from processing to its final outcome.';

drop trigger if exists job_processing_audit_set_updated_at
  on public.job_processing_audit;

create trigger job_processing_audit_set_updated_at
  before update on public.job_processing_audit
  for each row
  execute function public.set_job_processing_audit_updated_at();

-- ----------------------------------------------------------------------------
-- 4. Access control for the table
--
--    Two independent layers, both required:
--      a) RLS enabled with zero policies -> anon/authenticated can match no row.
--      b) Explicit REVOKE -> Supabase's default privileges normally grant new
--         public-schema tables to anon and authenticated, so relying on RLS
--         alone would leave a needless grant in place.
-- ----------------------------------------------------------------------------
alter table public.job_processing_audit enable row level security;

revoke all on table public.job_processing_audit from public;
revoke all on table public.job_processing_audit from anon, authenticated;

-- Intentionally no DELETE: the audit trail is append-and-advance only. Rows
-- disappear solely through the cascade from `jobs`.
grant select, insert, update on table public.job_processing_audit to service_role;

-- No CREATE POLICY statements anywhere in this migration: the frontend keys
-- (anon / authenticated) must never read or write technical audit data.

-- ----------------------------------------------------------------------------
-- 5. Intake claim RPC
--
--    SECURITY INVOKER (the default, stated explicitly) rather than SECURITY
--    DEFINER: `service_role` already bypasses RLS, so DEFINER buys nothing,
--    while INVOKER fails closed -- if EXECUTE were ever granted to anon by
--    mistake, RLS would still block the insert instead of allowing a write
--    through an escalated function.
--
--    `search_path` is pinned so the function cannot be redirected to a
--    look-alike table in another schema.
-- ----------------------------------------------------------------------------
create or replace function public.claim_job_for_processing(
  p_job_id uuid,
  p_idempotency_key text,
  p_workflow_execution_id text default null
)
returns boolean
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_claim_id uuid;
begin
  if p_job_id is null then
    raise exception 'claim_job_for_processing: p_job_id is required';
  end if;

  if p_idempotency_key is null or length(btrim(p_idempotency_key)) = 0 then
    raise exception 'claim_job_for_processing: p_idempotency_key must be a non-empty string';
  end if;

  -- A single atomic statement: the unique index arbitrates between concurrent
  -- workers, so exactly one transaction can insert the 'received' row. No
  -- advisory lock and no read-then-write race.
  --
  -- A duplicate is an expected replay, not an error, hence DO NOTHING: the
  -- caller learns about it from the false return value. An unknown p_job_id is
  -- a different matter and still raises (foreign key violation), because that
  -- is a real defect rather than a retry.
  insert into public.job_processing_audit (
    job_id,
    event_type,
    step,
    outcome,
    idempotency_key,
    workflow_execution_id
  )
  values (
    p_job_id,
    'job.created',
    'received',
    'processing',
    btrim(p_idempotency_key),
    p_workflow_execution_id
  )
  on conflict (idempotency_key, step) do nothing
  returning id into v_claim_id;

  -- NULL only when ON CONFLICT suppressed the insert.
  return v_claim_id is not null;
end;
$$;

revoke all on function public.claim_job_for_processing(uuid, text, text) from public;
revoke all on function public.claim_job_for_processing(uuid, text, text) from anon, authenticated;
grant execute on function public.claim_job_for_processing(uuid, text, text) to service_role;

-- ----------------------------------------------------------------------------
-- 6. Documentation
-- ----------------------------------------------------------------------------
comment on table public.job_processing_audit is
  'Technical audit trail of automated job-request processing (n8n). Back-office only: RLS is on with no policies and no grants for anon/authenticated. Never store full request payloads, client emails or secrets here -- only what is needed to diagnose a run.';

comment on column public.job_processing_audit.job_id is
  'FK to public.jobs(id). ON DELETE CASCADE: the trail dies with the job it describes.';

comment on column public.job_processing_audit.event_type is
  'Source event that triggered processing, e.g. job.created. Open vocabulary.';

comment on column public.job_processing_audit.step is
  'Pipeline stage, e.g. received, validated, triaged, notification_sent. Open vocabulary.';

comment on column public.job_processing_audit.outcome is
  'Stage state: processing (claimed, in flight), succeeded, failed or skipped.';

comment on column public.job_processing_audit.idempotency_key is
  'Deduplication key for one logical event. Intake convention: job.created:<job_id>. Unique per step, so replays collide while genuine later stages do not.';

comment on column public.job_processing_audit.workflow_execution_id is
  'n8n execution id, for correlating a row with a specific run. Null for manual replays.';

comment on column public.job_processing_audit.details is
  'Small JSON object with diagnostic metadata only (counts, durations, decisions, non-sensitive identifiers). No request payloads, no client emails, no credentials.';

comment on column public.job_processing_audit.error_message is
  'Human-readable failure reason; expected alongside outcome = failed.';

comment on function public.claim_job_for_processing(uuid, text, text) is
  'Atomic intake gate for n8n. Inserts the received/processing audit row for p_idempotency_key and returns true on the first claim; returns false (without raising) when the event was already claimed, meaning the caller must stop. Executable by service_role only.';

-- ----------------------------------------------------------------------------
-- 7. Rollback (manual, not executed by this migration)
--
--    Removes only the objects created above, in reverse order of creation.
--    `public.jobs` and its data are never touched.
--
--    Dropping the table also removes its indexes, constraints and the
--    updated_at trigger, so no separate DROP is needed for those. No CASCADE is
--    used anywhere: if something unexpected depends on these objects, the
--    rollback should fail loudly instead of silently widening its blast radius.
--
--    Note that the audit trail is deleted with the table. Export it first if the
--    processing history still matters.
--
--    begin;
--
--    drop function if exists public.claim_job_for_processing(uuid, text, text);
--
--    drop table if exists public.job_processing_audit;
--
--    drop function if exists public.set_job_processing_audit_updated_at();
--
--    commit;
-- ----------------------------------------------------------------------------
