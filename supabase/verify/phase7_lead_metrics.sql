-- ============================================================================
-- Phase 7 verification: get_lead_metrics RPC
--
-- Rollback-safe: entire script runs inside BEGIN … ROLLBACK.
--
-- Prerequisite (disposable local/CI database only):
--   supabase/migrations/20260910120000_create_lead_schema_and_status_history.sql
--   supabase/migrations/20260911140000_atomic_lost_reason_in_transition.sql
--   supabase/migrations/20260911180000_create_lead_metrics_rpc.sql
-- ============================================================================

begin;

do $$
declare
  v_exists boolean;
  v_service_execute boolean;
  v_anon_execute boolean;

  v_from timestamptz := '2026-09-01T00:00:00Z';
  v_to timestamptz := '2026-09-08T00:00:00Z';
  v_as_of timestamptz := '2026-09-10T12:00:00Z';

  v_empty_from timestamptz := '2027-01-01T00:00:00Z';
  v_empty_to timestamptz := '2027-01-08T00:00:00Z';
  v_empty_as_of timestamptz := '2027-01-10T12:00:00Z';

  v_lead_a_id uuid;
  v_lead_b_id uuid;
  v_lead_c_id uuid;
  v_lead_d_id uuid;
  v_lead_parent_id uuid;
  v_overdue_new_id uuid;
  v_overdue_won_id uuid;
  v_overdue_active_id uuid;
  v_overdue_duplicate_id uuid;

  v_metrics jsonb;
  v_received bigint;
  v_started bigint;
  v_contacted bigint;
  v_qualified bigint;
  v_won bigint;
  v_source_received bigint;
  v_source_won bigint;
begin
  raise notice '=== Phase 7 lead metrics verification (transaction will roll back) ===';

  -- --------------------------------------------------------------------------
  -- 1. Privileges
  -- --------------------------------------------------------------------------
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

  raise notice 'OK: privileges';

  -- --------------------------------------------------------------------------
  -- 2. Deterministic fixtures
  -- --------------------------------------------------------------------------
  insert into public.leads (
    source, contact_name, contact_email, title, description,
    is_synthetic, status, created_at
  )
  values (
    'demo_seed', 'Lead A', 'lead-a@example.demo', 'Cohort A', 'Synthetic cohort lead A',
    true, 'new', '2026-09-02T10:00:00Z'
  )
  returning id into v_lead_a_id;

  insert into public.leads (
    source, contact_name, contact_email, title, description,
    is_synthetic, status, created_at
  )
  values (
    'manual', 'Lead B', 'lead-b@example.demo', 'Cohort B', 'Synthetic cohort lead B',
    true, 'new', '2026-09-03T08:00:00Z'
  )
  returning id into v_lead_b_id;

  insert into public.leads (
    source, contact_name, contact_email, title, description,
    is_synthetic, status, created_at
  )
  values (
    'website', 'Lead C', 'lead-c@example.demo', 'Non-synthetic', 'Excluded non-synthetic',
    false, 'new', '2026-09-04T08:00:00Z'
  )
  returning id into v_lead_c_id;

  -- Parent for duplicate child must live outside the cohort window.
  insert into public.leads (
    source, contact_name, contact_email, title, description,
    is_synthetic, status, created_at
  )
  values (
    'demo_seed', 'Lead Parent', 'parent@example.demo', 'Duplicate parent', 'Parent for duplicate',
    true, 'new', '2026-08-25T09:00:00Z'
  )
  returning id into v_lead_parent_id;

  insert into public.leads (
    source, contact_name, contact_email, title, description,
    is_synthetic, status, created_at, duplicate_of_lead_id
  )
  values (
    'demo_seed', 'Lead D', 'lead-d@example.demo', 'Duplicate', 'Excluded duplicate status',
    true, 'duplicate', '2026-09-05T08:00:00Z', v_lead_parent_id
  )
  returning id into v_lead_d_id;

  -- Overdue snapshot leads outside cohort window
  insert into public.leads (
    source, contact_name, contact_email, title, description,
    is_synthetic, status, created_at, first_response_due_at
  )
  values (
    'demo_seed', 'Overdue New', 'overdue-new@example.demo', 'Overdue new', 'Outside cohort overdue new',
    true, 'new', '2026-08-01T08:00:00Z', '2026-09-09T08:00:00Z'
  )
  returning id into v_overdue_new_id;

  insert into public.leads (
    source, contact_name, contact_email, title, description,
    is_synthetic, status, created_at, won_at, first_response_due_at
  )
  values (
    'demo_seed', 'Overdue Won', 'overdue-won@example.demo', 'Overdue won', 'Terminal excluded from overdue',
    true, 'won', '2026-08-01T08:00:00Z', '2026-08-15T08:00:00Z', '2026-09-09T08:00:00Z'
  )
  returning id into v_overdue_won_id;

  insert into public.leads (
    source, contact_name, contact_email, title, description,
    is_synthetic, status, created_at, next_action_at
  )
  values (
    'manual', 'Overdue Active', 'overdue-active@example.demo', 'Overdue active', 'Outside cohort overdue active',
    true, 'in_progress', '2026-08-01T08:00:00Z', '2026-09-09T08:00:00Z'
  )
  returning id into v_overdue_active_id;

  insert into public.leads (
    source, contact_name, contact_email, title, description,
    is_synthetic, status, created_at, duplicate_of_lead_id, next_action_at
  )
  values (
    'email', 'Overdue Duplicate', 'overdue-dup@example.demo', 'Overdue duplicate', 'Duplicate excluded from overdue',
    true, 'duplicate', '2026-08-01T08:00:00Z', v_lead_parent_id, '2026-09-09T08:00:00Z'
  )
  returning id into v_overdue_duplicate_id;

  -- Lead A history: reopen after win; earliest first action and first terminal matter
  insert into public.lead_status_history (
    lead_id, from_status, to_status, change_source, created_at
  ) values
    (v_lead_a_id, 'new', 'in_progress', 'verify', '2026-09-02T11:00:00Z'),
    (v_lead_a_id, 'in_progress', 'contacted', 'verify', '2026-09-03T10:00:00Z'),
    (v_lead_a_id, 'contacted', 'qualified', 'verify', '2026-09-04T10:00:00Z'),
    (v_lead_a_id, 'qualified', 'won', 'verify', '2026-09-05T10:00:00Z'),
    (v_lead_a_id, 'won', 'in_progress', 'verify', '2026-09-06T10:00:00Z'),
    (v_lead_a_id, 'in_progress', 'won', 'verify', '2026-09-07T10:00:00Z');

  update public.leads
  set status = 'won', won_at = '2026-09-07T10:00:00Z'
  where id = v_lead_a_id;

  -- Lead B history: repeated transitions without double counting
  insert into public.lead_status_history (
    lead_id, from_status, to_status, change_source, created_at
  ) values
    (v_lead_b_id, 'new', 'in_progress', 'verify', '2026-09-03T09:00:00Z'),
    (v_lead_b_id, 'in_progress', 'contacted', 'verify', '2026-09-03T10:00:00Z'),
    (v_lead_b_id, 'contacted', 'in_progress', 'verify', '2026-09-03T11:00:00Z'),
    (v_lead_b_id, 'in_progress', 'contacted', 'verify', '2026-09-03T12:00:00Z');

  update public.leads
  set status = 'contacted'
  where id = v_lead_b_id;

  raise notice 'OK: fixtures inserted';

  -- --------------------------------------------------------------------------
  -- 3. Populated cohort assertions
  -- --------------------------------------------------------------------------
  v_metrics := public.get_lead_metrics(v_from, v_to, v_as_of);

  v_received := (v_metrics #>> '{funnel,received}')::bigint;
  v_started := (v_metrics #>> '{funnel,started}')::bigint;
  v_contacted := (v_metrics #>> '{funnel,contacted}')::bigint;
  v_qualified := (v_metrics #>> '{funnel,qualified}')::bigint;
  v_won := (v_metrics #>> '{funnel,won}')::bigint;

  if v_received <> 2 then
    raise exception 'expected received=2 (synthetic non-duplicate in cohort), got %', v_received;
  end if;

  if v_started <> 2 or v_contacted <> 2 or v_qualified <> 1 or v_won <> 1 then
    raise exception 'unexpected funnel counts: started=% contacted=% qualified=% won=%',
      v_started, v_contacted, v_qualified, v_won;
  end if;

  if v_started > v_received
     or v_contacted > v_started
     or v_qualified > v_contacted
     or v_won > v_qualified then
    raise exception 'funnel milestones must be monotonic';
  end if;

  if (v_metrics #>> '{conversion,overall}')::numeric is distinct from 0.5 then
    raise exception 'expected overall conversion 0.5, got %', v_metrics #>> '{conversion,overall}';
  end if;

  if (v_metrics #>> '{conversion,received_to_started}')::numeric is distinct from 1 then
    raise exception 'expected received_to_started conversion 1, got %',
      v_metrics #>> '{conversion,received_to_started}';
  end if;

  if (v_metrics #>> '{conversion,started_to_contacted}')::numeric is distinct from 1 then
    raise exception 'expected started_to_contacted conversion 1, got %',
      v_metrics #>> '{conversion,started_to_contacted}';
  end if;

  if (v_metrics #>> '{conversion,contacted_to_qualified}')::numeric is distinct from 0.5 then
    raise exception 'expected contacted_to_qualified conversion 0.5, got %',
      v_metrics #>> '{conversion,contacted_to_qualified}';
  end if;

  if (v_metrics #>> '{conversion,qualified_to_won}')::numeric is distinct from 1 then
    raise exception 'expected qualified_to_won conversion 1, got %',
      v_metrics #>> '{conversion,qualified_to_won}';
  end if;

  if (v_metrics #>> '{timing,first_action,average_seconds}')::bigint is distinct from 3600 then
    raise exception 'expected first_action average_seconds=3600, got %',
      v_metrics #>> '{timing,first_action,average_seconds}';
  end if;

  if (v_metrics #>> '{timing,first_action,median_seconds}')::bigint is distinct from 3600 then
    raise exception 'expected first_action median_seconds=3600, got %',
      v_metrics #>> '{timing,first_action,median_seconds}';
  end if;

  if (v_metrics #>> '{timing,first_terminal,average_seconds}')::bigint is distinct from 259200 then
    raise exception 'expected first_terminal average_seconds=259200, got %',
      v_metrics #>> '{timing,first_terminal,average_seconds}';
  end if;

  if (v_metrics #>> '{timing,first_terminal,sample_size}')::bigint is distinct from 1 then
    raise exception 'expected first_terminal sample_size=1, got %',
      v_metrics #>> '{timing,first_terminal,sample_size}';
  end if;

  if (v_metrics #>> '{overdue,first_response}')::bigint is distinct from 1 then
    raise exception 'expected overdue first_response=1, got %', v_metrics #>> '{overdue,first_response}';
  end if;

  if (v_metrics #>> '{overdue,next_action}')::bigint is distinct from 1 then
    raise exception 'expected overdue next_action=1, got %', v_metrics #>> '{overdue,next_action}';
  end if;

  if (v_metrics #>> '{overdue,total}')::bigint is distinct from 2 then
    raise exception 'expected distinct overdue total=2, got %', v_metrics #>> '{overdue,total}';
  end if;

  select coalesce(sum((entry->>'received')::bigint), 0),
         coalesce(sum((entry->>'won')::bigint), 0)
    into v_source_received, v_source_won
  from jsonb_array_elements(v_metrics #> '{sources}') as entry;

  if v_source_received <> v_received or v_source_won <> v_won then
    raise exception 'source totals must reconcile with cohort totals: sources %/% vs cohort %/%',
      v_source_won, v_source_received, v_won, v_received;
  end if;

  if not exists (
    select 1
    from jsonb_array_elements(v_metrics #> '{sources}') as entry
    where entry->>'source' = 'demo_seed'
      and (entry->>'received')::bigint = 1
      and (entry->>'won')::bigint = 1
      and (entry->>'conversion')::numeric = 1
  ) then
    raise exception 'expected demo_seed source received=1 won=1 conversion=1';
  end if;

  if not exists (
    select 1
    from jsonb_array_elements(v_metrics #> '{sources}') as entry
    where entry->>'source' = 'manual'
      and (entry->>'received')::bigint = 1
      and (entry->>'won')::bigint = 0
      and entry->>'conversion' is null
  ) then
    raise exception 'expected manual source received=1 won=0 conversion=null';
  end if;

  if (v_metrics #>> '{timing,first_action,sample_size}')::bigint is distinct from 2 then
    raise exception 'expected first_action sample_size=2, got %',
      v_metrics #>> '{timing,first_action,sample_size}';
  end if;

  raise notice 'OK: populated cohort metrics';

  -- --------------------------------------------------------------------------
  -- 4. Empty cohort assertions
  -- --------------------------------------------------------------------------
  v_metrics := public.get_lead_metrics(v_empty_from, v_empty_to, v_empty_as_of);

  if (v_metrics #>> '{funnel,received}')::bigint is distinct from 0 then
    raise exception 'empty cohort expected received=0';
  end if;

  if v_metrics #>> '{conversion,overall}' is not null
     or v_metrics #>> '{conversion,received_to_started}' is not null
     or v_metrics #>> '{timing,first_action,average_seconds}' is not null
     or v_metrics #>> '{timing,first_action,median_seconds}' is not null
     or v_metrics #>> '{timing,first_terminal,average_seconds}' is not null then
    raise exception 'empty cohort must return null conversion/timing values';
  end if;

  if (v_metrics #>> '{timing,first_action,sample_size}')::bigint is distinct from 0 then
    raise exception 'empty cohort expected timing sample_size=0';
  end if;

  if (v_metrics #>> '{overdue,total}')::bigint is distinct from 2 then
    raise exception 'empty cohort must still return current overdue snapshot, expected total=2';
  end if;

  raise notice 'OK: empty cohort metrics';
end $$;

rollback;
