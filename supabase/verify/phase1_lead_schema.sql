-- ============================================================================
-- Phase 1 verification: lead schema + status history (corrected)
--
-- Rollback-safe: entire script runs inside BEGIN … ROLLBACK.
--
-- Prerequisite (disposable local/CI database only):
--   supabase/fixtures/disposable-test-prerequisites.sql
--   supabase/migrations/20260814000000_create_job_processing_audit.sql
--   supabase/migrations/20260910120000_create_lead_schema_and_status_history.sql
--
-- Usage:
--   psql "$DISPOSABLE_DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -f supabase/fixtures/disposable-test-prerequisites.sql \
--     -f supabase/migrations/20260814000000_create_job_processing_audit.sql \
--     -f supabase/migrations/20260910120000_create_lead_schema_and_status_history.sql \
--     -f supabase/verify/phase1_lead_schema.sql
-- ============================================================================

begin;

do $$
declare
  v_lead_id uuid;
  v_lead_b uuid;
  v_parent_id uuid;
  v_operator_id uuid := gen_random_uuid();
  v_other_operator_id uuid := gen_random_uuid();
  v_history_id uuid;
  v_history_count integer;
  v_comment_count integer;
  v_audit_count integer;
  v_lead public.leads;
  v_change_source text;
  v_caught boolean;
  v_policy_count integer;
begin
  raise notice '=== Phase 1 lead schema verification (transaction will roll back) ===';

  -- --------------------------------------------------------------------------
  -- 0. Legacy coexistence (when disposable fixture applied)
  -- --------------------------------------------------------------------------
  if to_regclass('public.jobs') is null then
    raise notice 'SKIP: public.jobs not present — apply disposable-test-prerequisites.sql for jobs assertions';
  elsif to_regclass('public.job_processing_audit') is null then
    raise exception 'public.jobs exists but public.job_processing_audit is missing';
  else
    raise notice 'OK: public.jobs and public.job_processing_audit coexist';
  end if;

  -- --------------------------------------------------------------------------
  -- 1. RLS enabled, zero policies; role privileges
  -- --------------------------------------------------------------------------
  select count(*)
    into v_policy_count
  from pg_catalog.pg_policies
  where schemaname = 'public'
    and tablename in (
      'operator_profiles',
      'leads',
      'lead_status_history',
      'lead_comments',
      'lead_processing_audit'
    );

  if v_policy_count <> 0 then
    raise exception 'expected zero RLS policies on Phase 1 tables, found %', v_policy_count;
  end if;

  if not (
    select relrowsecurity
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'leads'
  ) then
    raise exception 'RLS must be enabled on public.leads';
  end if;

  if has_table_privilege('anon', 'public.leads', 'SELECT')
     or has_table_privilege('authenticated', 'public.leads', 'SELECT') then
    raise exception 'anon/authenticated must not have table privileges on leads';
  end if;

  if has_table_privilege('service_role', 'public.lead_status_history', 'DELETE') then
    raise exception 'service_role must not have DELETE on lead_status_history';
  end if;

  if has_table_privilege('service_role', 'public.lead_status_history', 'UPDATE') then
    raise exception 'service_role must not have UPDATE on lead_status_history';
  end if;

  if not has_table_privilege('service_role', 'public.lead_status_history', 'INSERT') then
    raise exception 'service_role must have INSERT on lead_status_history';
  end if;

  raise notice 'OK: RLS closed and least-privilege grants';

  -- --------------------------------------------------------------------------
  -- 2. operator_profiles + owner_id FK
  -- --------------------------------------------------------------------------
  insert into auth.users (id, email)
  values
    (v_operator_id, 'operator@example.com'),
    (v_other_operator_id, 'other@example.com');

  insert into public.operator_profiles (id, display_name)
  values
    (v_operator_id, 'Primary Operator'),
    (v_other_operator_id, 'Other Operator');

  perform set_config('lead.status_change_source', 'seed', true);

  insert into public.leads (
    source,
    contact_name,
    contact_email,
    title,
    owner_id
  )
  values (
    'demo_seed',
    'Synthetic Person',
    'demo@example.com',
    'Verification lead',
    v_operator_id
  )
  returning id into v_lead_id;

  v_caught := false;
  begin
    insert into public.operator_profiles (id, display_name)
    values (gen_random_uuid(), 'Orphan operator');
  exception
    when foreign_key_violation then
      v_caught := true;
  end;

  if not v_caught then
    raise exception 'operator_profiles.id must reference auth.users';
  end if;

  v_caught := false;
  begin
    update public.leads
    set owner_id = gen_random_uuid()
    where id = v_lead_id;
  exception
    when foreign_key_violation then
      v_caught := true;
  end;

  if not v_caught then
    raise exception 'owner_id must reject non-operator uuid';
  end if;

  update public.leads
  set owner_id = v_other_operator_id
  where id = v_lead_id;

  delete from public.operator_profiles
  where id = v_other_operator_id;

  select owner_id
    into v_operator_id
  from public.leads
  where id = v_lead_id;

  if v_operator_id is not null then
    raise exception 'owner_id should SET NULL when operator profile is deleted';
  end if;

  v_operator_id := (select id from public.operator_profiles where display_name = 'Primary Operator');

  raise notice 'OK: operator_profiles and owner_id FK';

  -- --------------------------------------------------------------------------
  -- 3. Initial history on INSERT
  -- --------------------------------------------------------------------------
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
  -- 4. One history row per real change; no-op RPC and UPDATE
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

  v_lead := public.transition_lead_status(
    v_lead_id,
    'in_progress',
    'rpc',
    null,
    'should not append'
  );

  update public.leads
  set status = 'in_progress'
  where id = v_lead_id;

  select count(*)
    into v_history_count
  from public.lead_status_history
  where lead_id = v_lead_id;

  if v_history_count <> 2 then
    raise exception 'no-op RPC/UPDATE should leave 2 history rows, got %', v_history_count;
  end if;

  raise notice 'OK: one row per real change; no-op RPC/UPDATE skip history';

  -- --------------------------------------------------------------------------
  -- 5. Direct UPDATE writes history and keeps timestamps consistent
  -- --------------------------------------------------------------------------
  update public.leads
  set status = 'qualified'
  where id = v_lead_id
  returning * into v_lead;

  if v_lead.status <> 'qualified' or v_lead.won_at is not null or v_lead.lost_at is not null then
    raise exception 'direct UPDATE to qualified should clear terminal timestamps';
  end if;

  select count(*)
    into v_history_count
  from public.lead_status_history
  where lead_id = v_lead_id;

  if v_history_count <> 3 then
    raise exception 'direct status UPDATE should append history, got % rows', v_history_count;
  end if;

  if not exists (
    select 1
    from public.lead_status_history
    where lead_id = v_lead_id
      and to_status = 'qualified'
      and change_source = 'sql'
  ) then
    raise exception 'direct UPDATE history should default change_source to sql';
  end if;

  raise notice 'OK: direct UPDATE history and timestamp consistency';

  -- --------------------------------------------------------------------------
  -- 6. Won / reopen via RPC and direct UPDATE
  -- --------------------------------------------------------------------------
  v_lead := public.transition_lead_status(v_lead_id, 'won', 'rpc', null, 'closed');

  if v_lead.status <> 'won' or v_lead.won_at is null or v_lead.lost_at is not null then
    raise exception 'transition to won should set won_at and clear lost_at';
  end if;

  v_lead := public.transition_lead_status(v_lead_id, 'in_progress', 'rpc', null, 'reopen');

  if v_lead.status <> 'in_progress' or v_lead.won_at is not null or v_lead.lost_at is not null then
    raise exception 'reopen via RPC must clear won/lost timestamps';
  end if;

  insert into public.leads (
    source, contact_name, contact_email, title
  )
  values (
    'demo_seed', 'Direct', 'direct@example.com', 'Direct reopen lead'
  )
  returning id into v_lead_b;

  update public.leads
  set status = 'won'
  where id = v_lead_b
  returning * into v_lead;

  if v_lead.won_at is null then
    raise exception 'direct UPDATE to won should set won_at';
  end if;

  update public.leads
  set status = 'contacted'
  where id = v_lead_b
  returning * into v_lead;

  if v_lead.won_at is not null or v_lead.lost_at is not null then
    raise exception 'direct UPDATE reopen must clear terminal timestamps';
  end if;

  v_lead := public.transition_lead_status(v_lead_id, 'lost', 'rpc', null, 'lost after reopen');

  if v_lead.lost_at is null or v_lead.won_at is not null then
    raise exception 'won to lost via RPC should set lost_at and clear won_at';
  end if;

  raise notice 'OK: won/lost/reopen via RPC and direct UPDATE';

  -- --------------------------------------------------------------------------
  -- 7. GUC attribution must not leak across statements
  -- --------------------------------------------------------------------------
  perform public.transition_lead_status(v_lead_id, 'needs_review', 'rpc', null, 'attribution test');

  insert into public.leads (
    source, contact_name, contact_email, title
  )
  values (
    'demo_seed', 'Leak', 'leak@example.com', 'GUC leak test'
  )
  returning id into v_lead_b;

  select change_source
    into v_change_source
  from public.lead_status_history
  where lead_id = v_lead_b
    and from_status is null;

  if v_change_source <> 'sql' then
    raise exception 'GUC leak: second INSERT inherited change_source %', v_change_source;
  end if;

  raise notice 'OK: GUC attribution cleared after transition';

  -- --------------------------------------------------------------------------
  -- 8. Actor attribution validation
  -- --------------------------------------------------------------------------
  v_caught := false;
  begin
    perform public.transition_lead_status(
      v_lead_id,
      'archived',
      'rpc',
      gen_random_uuid(),
      'forged operator'
    );
  exception
    when others then
      if sqlerrm like '%not an active operator%' then
        v_caught := true;
      else
        raise;
      end if;
  end;

  if not v_caught then
    raise exception 'non-operator p_changed_by must be rejected';
  end if;

  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', v_operator_id::text, true);

  v_caught := false;
  begin
    perform public.transition_lead_status(
      v_lead_id,
      'archived',
      'rpc',
      v_other_operator_id,
      'forged peer'
    );
  exception
    when others then
      if sqlerrm like '%cannot attribute change to another operator%' then
        v_caught := true;
      else
        raise;
      end if;
  end;

  if not v_caught then
    raise exception 'authenticated caller must not forge another operator id';
  end if;

  perform set_config('request.jwt.claim.role', 'service_role', true);
  perform set_config('request.jwt.claim.sub', '', true);

  v_lead := public.transition_lead_status(
    v_lead_id,
    'archived',
    'rpc',
    v_operator_id,
    'trusted service attribution'
  );

  if not exists (
    select 1
    from public.lead_status_history
    where lead_id = v_lead_id
      and to_status = 'archived'
      and changed_by = v_operator_id
  ) then
    raise exception 'service_role should record validated operator changed_by';
  end if;

  perform set_config('request.jwt.claim.role', '', true);
  perform set_config('request.jwt.claim.sub', '', true);

  raise notice 'OK: actor attribution validation';

  -- --------------------------------------------------------------------------
  -- 9. Unique (source, external_event_id) scoped per channel
  -- --------------------------------------------------------------------------
  insert into public.leads (
    source, contact_name, contact_email, title, external_event_id
  )
  values (
    'telegram', 'Tg', 'tg@example.com', 'Telegram lead', 'evt-shared-001'
  );

  insert into public.leads (
    source, contact_name, contact_email, title, external_event_id
  )
  values (
    'max', 'Max', 'max@example.com', 'MAX lead', 'evt-shared-001'
  );

  v_caught := false;
  begin
    insert into public.leads (
      source, contact_name, contact_email, title, external_event_id
    )
    values (
      'telegram', 'Tg2', 'tg2@example.com', 'Dup telegram', 'evt-shared-001'
    );
  exception
    when unique_violation then
      v_caught := true;
  end;

  if not v_caught then
    raise exception 'expected unique violation on duplicate (telegram, external_event_id)';
  end if;

  raise notice 'OK: external event uniqueness is per lead_source';

  -- --------------------------------------------------------------------------
  -- 10. Invalid enum / check constraints
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

  raise notice 'OK: invalid enum/check constraints rejected';

  -- --------------------------------------------------------------------------
  -- 11. FK violations and CASCADE delete
  -- --------------------------------------------------------------------------
  v_caught := false;
  begin
    insert into public.lead_processing_audit (
      lead_id, event_type, step, outcome, idempotency_key
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
    source, contact_name, contact_email, title
  )
  values (
    'demo_seed', 'Parent', 'parent@example.com', 'Parent lead'
  )
  returning id into v_parent_id;

  insert into public.leads (
    source,
    contact_name,
    contact_email,
    title,
    status,
    duplicate_of_lead_id
  )
  values (
    'demo_seed',
    'Child',
    'child@example.com',
    'Child lead',
    'duplicate',
    v_parent_id
  )
  returning id into v_lead_id;

  insert into public.lead_comments (lead_id, author_id, body)
  values (v_lead_id, v_operator_id, 'Cascade test comment');

  insert into public.lead_processing_audit (
    lead_id, event_type, step, outcome, idempotency_key
  )
  values (
    v_lead_id,
    'lead.created',
    'received',
    'processing',
    'lead.created:' || v_lead_id::text
  );

  select count(*) into v_history_count
  from public.lead_status_history where lead_id = v_lead_id;

  select count(*) into v_comment_count
  from public.lead_comments where lead_id = v_lead_id;

  select count(*) into v_audit_count
  from public.lead_processing_audit where lead_id = v_lead_id;

  if v_history_count < 1 or v_comment_count <> 1 or v_audit_count <> 1 then
    raise exception 'expected child rows before cascade delete';
  end if;

  delete from public.leads
  where id = v_lead_id;

  if exists (select 1 from public.lead_status_history where lead_id = v_lead_id)
     or exists (select 1 from public.lead_comments where lead_id = v_lead_id)
     or exists (select 1 from public.lead_processing_audit where lead_id = v_lead_id) then
    raise exception 'cascade delete should remove history, comments, and audit rows';
  end if;

  raise notice 'OK: FK behavior and cascade delete';

  -- --------------------------------------------------------------------------
  -- 12. History append-only (UPDATE rejected; DELETE denied to service_role)
  -- --------------------------------------------------------------------------
  insert into public.leads (
    source, contact_name, contact_email, title
  )
  values (
    'demo_seed', 'Hist', 'hist@example.com', 'History immutability'
  )
  returning id into v_lead_id;

  select id
    into v_history_id
  from public.lead_status_history
  where lead_id = v_lead_id
  limit 1;

  v_caught := false;
  begin
    update public.lead_status_history
    set change_source = 'tampered'
    where id = v_history_id;
  exception
    when others then
      if sqlerrm like '%append-only%' then
        v_caught := true;
      else
        raise;
      end if;
  end;

  if not v_caught then
    raise exception 'direct UPDATE on lead_status_history must be rejected';
  end if;

  execute 'set local role service_role';

  v_caught := false;
  begin
    execute format(
      'delete from public.lead_status_history where id = %L',
      v_history_id
    );
  exception
    when insufficient_privilege then
      v_caught := true;
  end;

  execute 'reset role';

  if not v_caught then
    raise exception 'service_role DELETE on lead_status_history must be denied';
  end if;

  delete from public.leads
  where id = v_lead_id;

  if exists (select 1 from public.lead_status_history where id = v_history_id) then
    raise exception 'parent lead delete should cascade-remove history rows';
  end if;

  raise notice 'OK: history append-only and cascade delete';

  -- --------------------------------------------------------------------------
  -- 13. transition_lead_status on missing lead
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
