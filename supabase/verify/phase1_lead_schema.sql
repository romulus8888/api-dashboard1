-- ============================================================================
-- Phase 1 verification: lead schema + status history
--
-- Rollback-safe: entire script runs inside BEGIN … ROLLBACK.
-- Prerequisite: apply migration 20260910120000_create_lead_schema_and_status_history.sql
--
-- Usage:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/verify/phase1_lead_schema.sql
-- ============================================================================

begin;

do $$
declare
  v_lead_id uuid;
  v_parent_id uuid;
  v_history_count integer;
  v_lead public.leads;
  v_caught boolean;
begin
  raise notice '=== Phase 1 lead schema verification (transaction will roll back) ===';

  -- --------------------------------------------------------------------------
  -- 1. Initial history on INSERT
  -- --------------------------------------------------------------------------
  perform set_config('lead.status_change_source', 'seed', true);

  insert into public.leads (
    source,
    contact_name,
    contact_email,
    title
  )
  values (
    'demo_seed',
    'Synthetic Person',
    'demo@example.com',
    'Verification lead'
  )
  returning id into v_lead_id;

  select count(*)
    into v_history_count
  from public.lead_status_history
  where lead_id = v_lead_id;

  if v_history_count <> 1 then
    raise exception 'expected 1 history row on insert, got %', v_history_count;
  end if;

  if not exists (
    select 1
    from public.lead_status_history
    where lead_id = v_lead_id
      and from_status is null
      and to_status = 'new'
      and change_source = 'seed'
  ) then
    raise exception 'initial history row missing expected from/to/source';
  end if;

  raise notice 'OK: initial history on INSERT';

  -- --------------------------------------------------------------------------
  -- 2. One history row per real status change (via RPC)
  -- --------------------------------------------------------------------------
  v_lead := public.transition_lead_status(
    v_lead_id,
    'in_progress',
    'rpc',
    null,
    'verification step'
  );

  select count(*)
    into v_history_count
  from public.lead_status_history
  where lead_id = v_lead_id;

  if v_history_count <> 2 then
    raise exception 'expected 2 history rows after one transition, got %', v_history_count;
  end if;

  raise notice 'OK: one history row per transition_lead_status call';

  -- --------------------------------------------------------------------------
  -- 3. No history row for no-op transition or no-op status UPDATE
  -- --------------------------------------------------------------------------
  v_lead := public.transition_lead_status(
    v_lead_id,
    'in_progress',
    'rpc',
    null,
    'should not append'
  );

  select count(*)
    into v_history_count
  from public.lead_status_history
  where lead_id = v_lead_id;

  if v_history_count <> 2 then
    raise exception 'no-op RPC should not append history, got % rows', v_history_count;
  end if;

  update public.leads
  set status = 'in_progress'
  where id = v_lead_id;

  select count(*)
    into v_history_count
  from public.lead_status_history
  where lead_id = v_lead_id;

  if v_history_count <> 2 then
    raise exception 'no-op UPDATE should not append history, got % rows', v_history_count;
  end if;

  raise notice 'OK: no-op transition and no-op UPDATE produce no history';

  -- --------------------------------------------------------------------------
  -- 4. transition_lead_status sets won_at on won
  -- --------------------------------------------------------------------------
  v_lead := public.transition_lead_status(v_lead_id, 'won', 'rpc', null, 'closed');

  if v_lead.status <> 'won' or v_lead.won_at is null then
    raise exception 'transition to won should set won_at';
  end if;

  raise notice 'OK: transition_lead_status won sets won_at';

  -- --------------------------------------------------------------------------
  -- 5. Duplicate external event constraint
  -- --------------------------------------------------------------------------
  insert into public.leads (
    source,
    contact_name,
    contact_email,
    title,
    external_event_id
  )
  values (
    'website',
    'A',
    'a@example.com',
    'External A',
    'evt-dup-test-001'
  );

  v_caught := false;
  begin
    insert into public.leads (
      source,
      contact_name,
      contact_email,
      title,
      external_event_id
    )
    values (
      'website',
      'B',
      'b@example.com',
      'External B',
      'evt-dup-test-001'
    );
  exception
    when unique_violation then
      v_caught := true;
  end;

  if not v_caught then
    raise exception 'expected unique violation on duplicate (source, external_event_id)';
  end if;

  raise notice 'OK: duplicate external event rejected';

  -- --------------------------------------------------------------------------
  -- 6. Invalid enum / check constraint rejection
  -- --------------------------------------------------------------------------
  v_caught := false;
  begin
    execute $sql$
      insert into public.leads (
        source, contact_name, contact_email, title, automation_state
      ) values (
        'demo_seed', 'X', 'x@example.com', 'Bad automation', 'not-a-state'
      )
    $sql$;
  exception
    when check_violation then
      v_caught := true;
  end;

  if not v_caught then
    raise exception 'expected check_violation on invalid automation_state';
  end if;

  v_caught := false;
  begin
    execute $sql$
      insert into public.leads (
        source, contact_name, contact_email, title, budget_currency
      ) values (
        'demo_seed', 'X', 'x@example.com', 'Bad currency', 'usd'
      )
    $sql$;
  exception
    when check_violation then
      v_caught := true;
  end;

  if not v_caught then
    raise exception 'expected check_violation on lowercase budget_currency';
  end if;

  v_caught := false;
  begin
    execute $sql$
      select public.transition_lead_status(
        $1::uuid,
        'not_a_status'::public.lead_status,
        'rpc',
        null,
        null
      )
    $sql$
    using v_lead_id;
  exception
    when invalid_text_representation then
      v_caught := true;
  end;

  if not v_caught then
    raise exception 'expected invalid_text_representation on invalid lead_status';
  end if;

  raise notice 'OK: invalid enum and check constraints rejected';

  -- --------------------------------------------------------------------------
  -- 7. Foreign-key behavior
  -- --------------------------------------------------------------------------
  v_caught := false;
  begin
    insert into public.lead_processing_audit (
      lead_id,
      event_type,
      step,
      outcome,
      idempotency_key
    )
    values (
      gen_random_uuid(),
      'lead.created',
      'received',
      'processing',
      'lead.created:00000000-0000-0000-0000-000000000000'
    );
  exception
    when foreign_key_violation then
      v_caught := true;
  end;

  if not v_caught then
    raise exception 'expected FK violation on audit.lead_id';
  end if;

  insert into public.leads (
    source,
    contact_name,
    contact_email,
    title
  )
  values (
    'demo_seed',
    'Parent',
    'parent@example.com',
    'Parent lead'
  )
  returning id into v_parent_id;

  v_caught := false;
  begin
    insert into public.leads (
      source,
      contact_name,
      contact_email,
      title,
      duplicate_of_lead_id
    )
    values (
      'demo_seed',
      'Child',
      'child@example.com',
      'Child lead',
      gen_random_uuid()
    );
  exception
    when foreign_key_violation then
      v_caught := true;
  end;

  if not v_caught then
    raise exception 'expected FK violation on duplicate_of_lead_id';
  end if;

  insert into public.leads (
    source,
    contact_name,
    contact_email,
    title,
    duplicate_of_lead_id
  )
  values (
    'demo_seed',
    'Child',
    'child@example.com',
    'Child lead',
    v_parent_id
  )
  returning id into v_lead_id;

  if v_lead_id is null then
    raise exception 'valid duplicate_of_lead_id insert failed';
  end if;

  raise notice 'OK: foreign-key violations behave as expected';

  -- --------------------------------------------------------------------------
  -- 8. transition_lead_status on missing lead
  -- --------------------------------------------------------------------------
  v_caught := false;
  begin
    perform public.transition_lead_status(
      '00000000-0000-0000-0000-000000000000'::uuid,
      'archived',
      'rpc',
      null,
      null
    );
  exception
    when others then
      if sqlerrm like '%not found%' then
        v_caught := true;
      else
        raise;
      end if;
  end;

  if not v_caught then
    raise exception 'expected not found error for missing lead';
  end if;

  raise notice 'OK: transition_lead_status rejects missing lead';

  raise notice '=== All Phase 1 checks passed (rolling back) ===';
end;
$$;

rollback;
