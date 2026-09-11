-- Phase 7: server-side lead funnel and operational metrics RPC.
-- Rollback: drop function public.get_lead_metrics(timestamptz, timestamptz, timestamptz);
--           revoke execute from service_role.

create or replace function public.get_lead_metrics(
  p_from timestamptz,
  p_to timestamptz,
  p_as_of timestamptz default pg_catalog.now()
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, pg_temp
as $$
declare
  v_received bigint;
  v_started bigint;
  v_contacted bigint;
  v_qualified bigint;
  v_won bigint;
  v_first_action_avg numeric;
  v_first_action_median numeric;
  v_first_action_count bigint;
  v_first_terminal_avg numeric;
  v_first_terminal_median numeric;
  v_first_terminal_count bigint;
  v_overdue_first_response bigint;
  v_overdue_next_action bigint;
  v_overdue_total bigint;
  v_sources jsonb;
begin
  if p_from is null or p_to is null or p_as_of is null then
    raise exception 'get_lead_metrics: p_from, p_to, and p_as_of are required';
  end if;

  if p_from >= p_to then
    raise exception 'get_lead_metrics: p_from must be before p_to';
  end if;

  with cohort as (
    select
      l.id,
      l.source,
      l.created_at,
      l.status
    from public.leads l
    where l.is_synthetic = true
      and l.status <> 'duplicate'::public.lead_status
      and l.created_at >= p_from
      and l.created_at < p_to
  ),
  milestone_flags as (
    select
      c.id,
      c.source,
      c.created_at,
      (
        c.status in (
          'in_progress'::public.lead_status,
          'contacted'::public.lead_status,
          'qualified'::public.lead_status,
          'won'::public.lead_status,
          'lost'::public.lead_status
        )
        or exists (
          select 1
          from public.lead_status_history h
          where h.lead_id = c.id
            and h.to_status in (
              'in_progress'::public.lead_status,
              'contacted'::public.lead_status,
              'qualified'::public.lead_status,
              'won'::public.lead_status,
              'lost'::public.lead_status
            )
        )
      ) as reached_started,
      (
        c.status in (
          'contacted'::public.lead_status,
          'qualified'::public.lead_status,
          'won'::public.lead_status
        )
        or exists (
          select 1
          from public.lead_status_history h
          where h.lead_id = c.id
            and h.to_status in (
              'contacted'::public.lead_status,
              'qualified'::public.lead_status,
              'won'::public.lead_status
            )
        )
      ) as reached_contacted,
      (
        c.status in (
          'qualified'::public.lead_status,
          'won'::public.lead_status
        )
        or exists (
          select 1
          from public.lead_status_history h
          where h.lead_id = c.id
            and h.to_status in (
              'qualified'::public.lead_status,
              'won'::public.lead_status
            )
        )
      ) as reached_qualified,
      (
        c.status = 'won'::public.lead_status
        or exists (
          select 1
          from public.lead_status_history h
          where h.lead_id = c.id
            and h.to_status = 'won'::public.lead_status
        )
      ) as reached_won
    from cohort c
  ),
  funnel as (
    select
      count(*)::bigint as received,
      count(*) filter (where reached_started)::bigint as started,
      count(*) filter (where reached_contacted)::bigint as contacted,
      count(*) filter (where reached_qualified)::bigint as qualified,
      count(*) filter (where reached_won)::bigint as won
    from milestone_flags
  ),
  source_rows as (
    select
      mf.source::text as source,
      count(*)::bigint as received,
      count(*) filter (where mf.reached_won)::bigint as won
    from milestone_flags mf
    group by mf.source
    order by mf.source
  )
  select
    f.received,
    f.started,
    f.contacted,
    f.qualified,
    f.won,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'source', sr.source,
            'received', sr.received,
            'won', sr.won,
            'conversion',
              case
                when sr.received > 0 then round(sr.won::numeric / sr.received::numeric, 4)
                else null
              end
          )
          order by sr.source
        )
        from source_rows sr
      ),
      '[]'::jsonb
    )
  into
    v_received,
    v_started,
    v_contacted,
    v_qualified,
    v_won,
    v_sources
  from funnel f;

  with cohort as (
    select l.id, l.created_at
    from public.leads l
    where l.is_synthetic = true
      and l.status <> 'duplicate'::public.lead_status
      and l.created_at >= p_from
      and l.created_at < p_to
  ),
  first_action_events as (
    select
      c.id,
      min(h.created_at) as action_at
    from cohort c
    join public.lead_status_history h on h.lead_id = c.id
    where h.to_status not in (
      'new'::public.lead_status,
      'duplicate'::public.lead_status,
      'archived'::public.lead_status
    )
    group by c.id
  ),
  first_action_durations as (
    select
      extract(epoch from (fa.action_at - c.created_at))::numeric as seconds
    from first_action_events fa
    join cohort c on c.id = fa.id
    where fa.action_at is not null
      and fa.action_at >= c.created_at
  )
  select
    avg(seconds),
    percentile_cont(0.5) within group (order by seconds),
    count(*)::bigint
  into
    v_first_action_avg,
    v_first_action_median,
    v_first_action_count
  from first_action_durations;

  with cohort as (
    select l.id, l.created_at
    from public.leads l
    where l.is_synthetic = true
      and l.status <> 'duplicate'::public.lead_status
      and l.created_at >= p_from
      and l.created_at < p_to
  ),
  first_terminal_events as (
    select
      c.id,
      min(h.created_at) as terminal_at
    from cohort c
    join public.lead_status_history h on h.lead_id = c.id
    where h.to_status in (
      'won'::public.lead_status,
      'lost'::public.lead_status
    )
    group by c.id
  ),
  first_terminal_durations as (
    select
      extract(epoch from (ft.terminal_at - c.created_at))::numeric as seconds
    from first_terminal_events ft
    join cohort c on c.id = ft.id
    where ft.terminal_at is not null
      and ft.terminal_at >= c.created_at
  )
  select
    avg(seconds),
    percentile_cont(0.5) within group (order by seconds),
    count(*)::bigint
  into
    v_first_terminal_avg,
    v_first_terminal_median,
    v_first_terminal_count
  from first_terminal_durations;

  with overdue_flags as (
    select
      l.id,
      (
        l.status = 'new'::public.lead_status
        and l.first_response_due_at is not null
        and l.first_response_due_at < p_as_of
      ) as first_response_overdue,
      (
        l.status not in (
          'won'::public.lead_status,
          'lost'::public.lead_status,
          'archived'::public.lead_status,
          'duplicate'::public.lead_status
        )
        and l.next_action_at is not null
        and l.next_action_at < p_as_of
      ) as next_action_overdue
    from public.leads l
    where l.is_synthetic = true
      and l.status <> 'duplicate'::public.lead_status
  )
  select
    count(*) filter (where first_response_overdue)::bigint,
    count(*) filter (where next_action_overdue)::bigint,
    count(*) filter (where first_response_overdue or next_action_overdue)::bigint
  into
    v_overdue_first_response,
    v_overdue_next_action,
    v_overdue_total
  from overdue_flags;

  return jsonb_build_object(
    'range',
      jsonb_build_object(
        'from', p_from,
        'to', p_to,
        'as_of', p_as_of
      ),
    'funnel',
      jsonb_build_object(
        'received', v_received,
        'started', v_started,
        'contacted', v_contacted,
        'qualified', v_qualified,
        'won', v_won
      ),
    'conversion',
      jsonb_build_object(
        'overall',
          case when v_received > 0 then round(v_won::numeric / v_received::numeric, 4) else null end,
        'received_to_started',
          case when v_received > 0 then round(v_started::numeric / v_received::numeric, 4) else null end,
        'started_to_contacted',
          case when v_started > 0 then round(v_contacted::numeric / v_started::numeric, 4) else null end,
        'contacted_to_qualified',
          case when v_contacted > 0 then round(v_qualified::numeric / v_contacted::numeric, 4) else null end,
        'qualified_to_won',
          case when v_qualified > 0 then round(v_won::numeric / v_qualified::numeric, 4) else null end
      ),
    'sources', v_sources,
    'timing',
      jsonb_build_object(
        'first_action',
          jsonb_build_object(
            'average_seconds', case when v_first_action_count > 0 then round(v_first_action_avg)::bigint else null end,
            'median_seconds', case when v_first_action_count > 0 then round(v_first_action_median)::bigint else null end,
            'sample_size', coalesce(v_first_action_count, 0)
          ),
        'first_terminal',
          jsonb_build_object(
            'average_seconds', case when v_first_terminal_count > 0 then round(v_first_terminal_avg)::bigint else null end,
            'median_seconds', case when v_first_terminal_count > 0 then round(v_first_terminal_median)::bigint else null end,
            'sample_size', coalesce(v_first_terminal_count, 0)
          )
      ),
    'overdue',
      jsonb_build_object(
        'first_response', v_overdue_first_response,
        'next_action', v_overdue_next_action,
        'total', v_overdue_total
      )
  );
end;
$$;

comment on function public.get_lead_metrics(timestamptz, timestamptz, timestamptz) is
  'Aggregates synthetic non-duplicate lead funnel, timing, source, and overdue metrics for a cohort window. No PII.';

revoke all on function public.get_lead_metrics(timestamptz, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.get_lead_metrics(timestamptz, timestamptz, timestamptz) to service_role;
