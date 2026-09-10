-- ============================================================================
-- Lead schema + database-enforced status history (Phase 1)
--
-- Purpose
--   Industry-neutral lead model for the future bilingual demo. Coexists with
--   legacy `public.jobs` and `public.job_processing_audit` — neither is
--   modified, renamed, or migrated here.
--
-- Status history
--   Every real status change (including INSERT) appends to
--   `lead_status_history` via trigger. No-op status updates produce no row.
--   `transition_lead_status()` is the intended application/n8n interface; it
--   sets transaction-local context consumed by the trigger (cleared after use).
--
-- Outcome timestamps
--   `trg_apply_lead_status_outcomes` keeps won_at/lost_at/loss_reason/
--   duplicate_of_lead_id consistent for RPC and direct SQL status writes.
--
-- Actor attribution trust boundary
--   Non-null changed_by must reference an active operator_profiles row.
--   Authenticated callers (auth.uid() present) cannot attribute to another
--   operator. service_role is trusted and may supply a validated operator id
--   when acting through the server API; it is not prevented from impersonation.
--   System/SQL paths may record NULL changed_by.
--
-- Security
--   RLS enabled on all new tables with zero policies. Explicit REVOKE for
--   anon/authenticated. Least-privilege grants for service_role. Does not
--   change `jobs` grants or RLS.
--
-- Local / CI apply
--   See supabase/fixtures/disposable-test-prerequisites.sql — never apply that
--   fixture to hosted Supabase.
--
-- Not in scope
--   Retry automation RPCs, jobs→leads data migration, compatibility views.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Enumerations (language-neutral identifiers)
-- ----------------------------------------------------------------------------
create type public.lead_status as enum (
  'new',
  'in_progress',
  'contacted',
  'qualified',
  'won',
  'lost',
  'needs_review',
  'archived',
  'duplicate'
);

create type public.lead_priority as enum (
  'low',
  'medium',
  'high'
);

create type public.lead_source as enum (
  'website',
  'demo_seed',
  'manual',
  'telegram',
  'email',
  'max'
);

comment on type public.lead_status is
  'Closed PostgreSQL enum of pipeline statuses. User-facing labels are localized in the app; extend with ALTER TYPE ... ADD VALUE.';

comment on type public.lead_source is
  'Closed PostgreSQL enum of inbound channels. Each messenger is a distinct value so (source, external_event_id) cannot collide across channels. Extend with ALTER TYPE ... ADD VALUE.';

-- ----------------------------------------------------------------------------
-- 2. Operator profiles (dashboard operators linked to Supabase Auth)
-- ----------------------------------------------------------------------------
create table public.operator_profiles (
  id uuid primary key
    references auth.users (id) on delete cascade,

  display_name text not null
    constraint operator_profiles_display_name_not_blank
      check (length(btrim(display_name)) > 0),

  is_active boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.operator_profiles is
  'Extended profile for authenticated dashboard operators. FK to auth.users; not used by legacy jobs UI.';

-- ----------------------------------------------------------------------------
-- 3. Leads
-- ----------------------------------------------------------------------------
create table public.leads (
  id uuid primary key default gen_random_uuid(),

  status public.lead_status not null default 'new',
  priority public.lead_priority not null default 'medium',
  source public.lead_source not null,

  -- Submission locale (`en` / `ru`) for display formatting; not a DB label.
  locale text
    constraint leads_locale_allowed
      check (locale is null or locale in ('en', 'ru')),

  contact_name text not null
    constraint leads_contact_name_not_blank
      check (length(btrim(contact_name)) > 0),

  contact_email text not null
    constraint leads_contact_email_not_blank
      check (length(btrim(contact_email)) > 0),

  contact_phone text,

  title text not null
    constraint leads_title_not_blank
      check (length(btrim(title)) > 0),

  description text not null default ''
    constraint leads_description_not_null
      check (description is not null),

  budget_amount numeric(14, 2)
    constraint leads_budget_amount_non_negative
      check (budget_amount is null or budget_amount >= 0),

  budget_currency char(3) not null default 'USD'
    constraint leads_budget_currency_iso
      check (budget_currency ~ '^[A-Z]{3}$'),

  owner_id uuid
    references public.operator_profiles (id) on delete set null,

  next_action_at timestamptz,
  first_response_due_at timestamptz,

  won_at timestamptz,
  lost_at timestamptz,

  loss_reason text,

  duplicate_of_lead_id uuid
    references public.leads (id) on delete set null,

  fingerprint text,

  -- Idempotency for inbound channel events (scoped per lead_source value).
  external_event_id text
    constraint leads_external_event_id_not_blank
      check (external_event_id is null or length(btrim(external_event_id)) > 0),

  is_synthetic boolean not null default true,

  -- Groups rows created in one demo seed / reset batch for bulk cleanup.
  demo_reset_group_id uuid,

  automation_attempt integer not null default 1
    constraint leads_automation_attempt_positive
      check (automation_attempt >= 1),

  automation_state text not null default 'idle'
    constraint leads_automation_state_allowed
      check (automation_state in ('idle', 'processing', 'failed', 'succeeded')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint leads_won_lost_timestamps_exclusive
    check (
      not (won_at is not null and lost_at is not null)
      and (won_at is null or status = 'won')
      and (lost_at is null or status = 'lost')
    ),

  constraint leads_loss_reason_only_when_lost
    check (loss_reason is null or status = 'lost'),

  constraint leads_duplicate_ref_only_when_duplicate
    check (duplicate_of_lead_id is null or status = 'duplicate')
);

comment on table public.leads is
  'Future system-of-record for leads. Legacy public.jobs remains untouched in Phase 1.';

comment on column public.leads.owner_id is
  'Assigned operator. FK to operator_profiles so only registered operators may own leads.';

comment on column public.leads.fingerprint is
  'Normalized deduplication hash (e.g. email). Industry-neutral; semantics defined by application.';

comment on column public.leads.demo_reset_group_id is
  'Shared UUID for synthetic demo batches; enables DELETE WHERE demo_reset_group_id = ?.';

comment on column public.leads.automation_attempt is
  'Monotonic attempt counter for automation; pairs with versioned idempotency keys in audit (future phase).';

-- ----------------------------------------------------------------------------
-- 4. Indexes
-- ----------------------------------------------------------------------------
create index leads_status_created_at_idx
  on public.leads (status, created_at desc);

create index leads_owner_next_action_idx
  on public.leads (owner_id, next_action_at)
  where owner_id is not null and next_action_at is not null;

create index leads_synthetic_created_at_idx
  on public.leads (is_synthetic, created_at desc);

create index leads_demo_reset_group_idx
  on public.leads (demo_reset_group_id)
  where demo_reset_group_id is not null;

create index leads_fingerprint_open_idx
  on public.leads (fingerprint)
  where fingerprint is not null
    and status not in ('won', 'lost', 'archived', 'duplicate');

create unique index leads_source_external_event_uidx
  on public.leads (source, external_event_id)
  where external_event_id is not null;

-- ----------------------------------------------------------------------------
-- 5. Status history (append-only; populated by trigger)
-- ----------------------------------------------------------------------------
create table public.lead_status_history (
  id uuid primary key default gen_random_uuid(),

  lead_id uuid not null
    references public.leads (id) on delete cascade,

  from_status public.lead_status,
  to_status public.lead_status not null,

  -- Nullable: automation and SQL paths may have no operator actor.
  changed_by uuid
    references public.operator_profiles (id) on delete set null,

  change_source text not null
    constraint lead_status_history_change_source_not_blank
      check (length(btrim(change_source)) > 0),

  reason text,

  created_at timestamptz not null default now(),

  constraint lead_status_history_real_transition
    check (from_status is null or from_status is distinct from to_status)
);

comment on table public.lead_status_history is
  'Append-only status transitions. Ordinary roles cannot UPDATE or DELETE rows; parent lead DELETE may CASCADE.';

create index lead_status_history_lead_id_created_at_idx
  on public.lead_status_history (lead_id, created_at desc);

-- ----------------------------------------------------------------------------
-- 6. Comments
-- ----------------------------------------------------------------------------
create table public.lead_comments (
  id uuid primary key default gen_random_uuid(),

  lead_id uuid not null
    references public.leads (id) on delete cascade,

  author_id uuid not null
    references public.operator_profiles (id) on delete cascade,

  body text not null
    constraint lead_comments_body_not_blank
      check (length(btrim(body)) > 0),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.lead_comments.author_id is
  'Comment author must be a registered operator (operator_profiles).';

create index lead_comments_lead_id_created_at_idx
  on public.lead_comments (lead_id, created_at desc);

-- ----------------------------------------------------------------------------
-- 7. Processing audit (parallel to job_processing_audit for leads)
-- ----------------------------------------------------------------------------
create table public.lead_processing_audit (
  id uuid primary key default gen_random_uuid(),

  lead_id uuid not null
    references public.leads (id) on delete cascade,

  event_type text not null
    constraint lead_processing_audit_event_type_not_blank
      check (length(btrim(event_type)) > 0),

  step text not null
    constraint lead_processing_audit_step_not_blank
      check (length(btrim(step)) > 0),

  outcome text not null
    constraint lead_processing_audit_outcome_allowed
      check (outcome in ('processing', 'succeeded', 'failed', 'skipped')),

  idempotency_key text not null
    constraint lead_processing_audit_idempotency_key_not_blank
      check (length(btrim(idempotency_key)) > 0),

  workflow_execution_id text,

  details jsonb not null default '{}'::jsonb
    constraint lead_processing_audit_details_is_object
      check (jsonb_typeof(details) = 'object'),

  error_message text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint lead_processing_audit_step_idempotent
    unique (idempotency_key, step)
);

comment on table public.lead_processing_audit is
  'Technical automation audit for leads. Mirrors job_processing_audit pattern; claim RPC deferred to a later phase.';

create index lead_processing_audit_lead_id_created_at_idx
  on public.lead_processing_audit (lead_id, created_at desc);

create index lead_processing_audit_created_at_idx
  on public.lead_processing_audit (created_at desc);

create index lead_processing_audit_attention_idx
  on public.lead_processing_audit (outcome, created_at desc)
  where outcome in ('processing', 'failed');

-- ----------------------------------------------------------------------------
-- 8. updated_at maintenance
-- ----------------------------------------------------------------------------
create or replace function public.set_row_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

create trigger leads_set_updated_at
  before update on public.leads
  for each row
  execute function public.set_row_updated_at();

create trigger operator_profiles_set_updated_at
  before update on public.operator_profiles
  for each row
  execute function public.set_row_updated_at();

create trigger lead_comments_set_updated_at
  before update on public.lead_comments
  for each row
  execute function public.set_row_updated_at();

create trigger lead_processing_audit_set_updated_at
  before update on public.lead_processing_audit
  for each row
  execute function public.set_row_updated_at();

-- ----------------------------------------------------------------------------
-- 9. Outcome timestamps (RPC and direct SQL)
-- ----------------------------------------------------------------------------
create or replace function public.trg_apply_lead_status_outcomes()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  if tg_op = 'INSERT' or (tg_op = 'UPDATE' and old.status is distinct from new.status) then
    if new.status = 'won' then
      new.won_at := pg_catalog.coalesce(new.won_at, pg_catalog.now());
      new.lost_at := null;
      new.loss_reason := null;
      new.duplicate_of_lead_id := null;
    elsif new.status = 'lost' then
      new.lost_at := pg_catalog.coalesce(new.lost_at, pg_catalog.now());
      new.won_at := null;
      new.duplicate_of_lead_id := null;
    elsif new.status = 'duplicate' then
      new.won_at := null;
      new.lost_at := null;
      new.loss_reason := null;
    else
      new.won_at := null;
      new.lost_at := null;
      new.loss_reason := null;
      new.duplicate_of_lead_id := null;
    end if;
  end if;

  return new;
end;
$$;

create trigger leads_apply_status_outcomes
  before insert or update of status on public.leads
  for each row
  execute function public.trg_apply_lead_status_outcomes();

comment on function public.trg_apply_lead_status_outcomes() is
  'Keeps won_at/lost_at and outcome-specific columns consistent on every real status change.';

-- ----------------------------------------------------------------------------
-- 10. Actor validation (shared by RPC and history trigger)
-- ----------------------------------------------------------------------------
create or replace function public.validate_lead_status_actor(p_actor_id uuid)
returns void
language plpgsql
security invoker
set search_path = pg_catalog, pg_temp
as $$
declare
  v_role text;
begin
  if p_actor_id is null then
    return;
  end if;

  if not exists (
    select 1
    from public.operator_profiles op
    where op.id = p_actor_id
      and op.is_active
  ) then
    raise exception
      'validate_lead_status_actor: % is not an active operator',
      p_actor_id;
  end if;

  v_role := pg_catalog.coalesce(
    pg_catalog.nullif(pg_catalog.current_setting('request.jwt.claim.role', true), ''),
    auth.role()
  );

  if v_role = 'authenticated' then
    if auth.uid() is distinct from p_actor_id then
      raise exception
        'validate_lead_status_actor: authenticated caller cannot attribute change to another operator';
    end if;
  end if;
end;
$$;

comment on function public.validate_lead_status_actor(uuid) is
  'Ensures changed_by references an active operator. Authenticated callers must match auth.uid(). service_role is trusted.';

-- ----------------------------------------------------------------------------
-- 11. Status history trigger (final enforcement boundary)
-- ----------------------------------------------------------------------------
create or replace function public.trg_record_lead_status_history()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_changed_by uuid;
  v_change_source text;
  v_reason text;
  v_changed_by_raw text;
begin
  v_change_source := pg_catalog.coalesce(
    pg_catalog.nullif(pg_catalog.current_setting('lead.status_change_source', true), ''),
    'sql'
  );

  v_reason := pg_catalog.nullif(pg_catalog.current_setting('lead.status_change_reason', true), '');

  v_changed_by_raw := pg_catalog.nullif(pg_catalog.current_setting('lead.status_changed_by', true), '');
  if v_changed_by_raw is not null then
    v_changed_by := v_changed_by_raw::uuid;
    perform public.validate_lead_status_actor(v_changed_by);
  else
    v_changed_by := null;
  end if;

  if tg_op = 'INSERT' then
    insert into public.lead_status_history (
      lead_id,
      from_status,
      to_status,
      changed_by,
      change_source,
      reason
    )
    values (
      new.id,
      null,
      new.status,
      v_changed_by,
      v_change_source,
      v_reason
    );
  elsif tg_op = 'UPDATE' then
    if old.status is not distinct from new.status then
      return new;
    end if;

    insert into public.lead_status_history (
      lead_id,
      from_status,
      to_status,
      changed_by,
      change_source,
      reason
    )
    values (
      new.id,
      old.status,
      new.status,
      v_changed_by,
      v_change_source,
      v_reason
    );
  end if;

  -- Clear transaction-local attribution so later statements do not inherit it.
  perform pg_catalog.set_config('lead.status_change_source', '', true);
  perform pg_catalog.set_config('lead.status_changed_by', '', true);
  perform pg_catalog.set_config('lead.status_change_reason', '', true);

  return new;
end;
$$;

create trigger leads_record_status_history
  after insert or update of status on public.leads
  for each row
  execute function public.trg_record_lead_status_history();

comment on function public.trg_record_lead_status_history() is
  'Appends lead_status_history on INSERT and real status changes. Clears lead.status_* GUCs after each write.';

-- ----------------------------------------------------------------------------
-- 12. History append-only (UPDATE rejected; DELETE via CASCADE only)
-- ----------------------------------------------------------------------------
create or replace function public.trg_reject_lead_status_history_update()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  raise exception 'lead_status_history is append-only; UPDATE is not allowed';
end;
$$;

create trigger lead_status_history_reject_update
  before update on public.lead_status_history
  for each row
  execute function public.trg_reject_lead_status_history_update();

-- ----------------------------------------------------------------------------
-- 13. transition_lead_status() — intended application / n8n interface
-- ----------------------------------------------------------------------------
create or replace function public.transition_lead_status(
  p_lead_id uuid,
  p_to_status public.lead_status,
  p_change_source text,
  p_changed_by uuid default null,
  p_reason text default null
)
returns public.leads
language plpgsql
security invoker
set search_path = pg_catalog, pg_temp
as $$
declare
  v_lead public.leads;
begin
  if p_lead_id is null then
    raise exception 'transition_lead_status: p_lead_id is required';
  end if;

  if p_change_source is null or length(btrim(p_change_source)) = 0 then
    raise exception 'transition_lead_status: p_change_source must be a non-empty string';
  end if;

  perform public.validate_lead_status_actor(p_changed_by);

  select *
    into v_lead
  from public.leads
  where id = p_lead_id;

  if not found then
    raise exception 'transition_lead_status: lead % not found', p_lead_id;
  end if;

  if v_lead.status is not distinct from p_to_status then
    return v_lead;
  end if;

  perform pg_catalog.set_config('lead.status_change_source', btrim(p_change_source), true);
  perform pg_catalog.set_config('lead.status_changed_by', coalesce(p_changed_by::text, ''), true);
  perform pg_catalog.set_config('lead.status_change_reason', coalesce(p_reason, ''), true);

  update public.leads
  set status = p_to_status
  where id = p_lead_id
  returning * into v_lead;

  return v_lead;
end;
$$;

comment on function public.transition_lead_status(uuid, public.lead_status, text, uuid, text) is
  'Preferred status transition API. No-op when status unchanged. Outcome timestamps and history are enforced by triggers.';

-- ----------------------------------------------------------------------------
-- 14. Row level security (closed by default) + least-privilege grants
-- ----------------------------------------------------------------------------
alter table public.operator_profiles enable row level security;
alter table public.leads enable row level security;
alter table public.lead_status_history enable row level security;
alter table public.lead_comments enable row level security;
alter table public.lead_processing_audit enable row level security;

revoke all on table public.operator_profiles from public, anon, authenticated, service_role;
revoke all on table public.leads from public, anon, authenticated, service_role;
revoke all on table public.lead_status_history from public, anon, authenticated, service_role;
revoke all on table public.lead_comments from public, anon, authenticated, service_role;
revoke all on table public.lead_processing_audit from public, anon, authenticated, service_role;

grant select, insert, update on table public.operator_profiles to service_role;
grant select, insert, update on table public.leads to service_role;
grant select, insert on table public.lead_status_history to service_role;
grant select, insert, update on table public.lead_comments to service_role;
grant select, insert, update on table public.lead_processing_audit to service_role;

revoke all on function public.transition_lead_status(uuid, public.lead_status, text, uuid, text) from public, anon, authenticated;
grant execute on function public.transition_lead_status(uuid, public.lead_status, text, uuid, text) to service_role;

revoke all on function public.validate_lead_status_actor(uuid) from public;
grant execute on function public.validate_lead_status_actor(uuid) to service_role;

revoke all on function public.trg_record_lead_status_history() from public, anon, authenticated;
revoke all on function public.trg_apply_lead_status_outcomes() from public;
revoke all on function public.trg_reject_lead_status_history_update() from public;
revoke all on function public.set_row_updated_at() from public;

-- No CREATE POLICY statements: frontend and anon must not access these tables yet.
