-- Phase 6: persist loss_reason atomically inside transition_lead_status.
-- Rollback: restore prior function body from 20260910120000_create_lead_schema_and_status_history.sql.

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
  v_prev_source text;
  v_prev_changed_by text;
  v_prev_reason text;
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

  v_prev_source := pg_catalog.current_setting('lead.status_change_source', true);
  v_prev_changed_by := pg_catalog.current_setting('lead.status_changed_by', true);
  v_prev_reason := pg_catalog.current_setting('lead.status_change_reason', true);

  begin
    perform pg_catalog.set_config('lead.status_change_source', btrim(p_change_source), true);
    perform pg_catalog.set_config('lead.status_changed_by', coalesce(p_changed_by::text, ''), true);
    perform pg_catalog.set_config('lead.status_change_reason', coalesce(p_reason, ''), true);

    update public.leads
    set
      status = p_to_status,
      loss_reason = case
        when p_to_status = 'lost'::public.lead_status
          then nullif(btrim(coalesce(p_reason, '')), '')
        else loss_reason
      end
    where id = p_lead_id
    returning * into v_lead;

    if not found then
      raise exception 'transition_lead_status: lead % disappeared during update', p_lead_id;
    end if;

    perform pg_catalog.set_config('lead.status_change_source', coalesce(v_prev_source, ''), true);
    perform pg_catalog.set_config('lead.status_changed_by', coalesce(v_prev_changed_by, ''), true);
    perform pg_catalog.set_config('lead.status_change_reason', coalesce(v_prev_reason, ''), true);

    return v_lead;
  exception
    when others then
      perform pg_catalog.set_config('lead.status_change_source', coalesce(v_prev_source, ''), true);
      perform pg_catalog.set_config('lead.status_changed_by', coalesce(v_prev_changed_by, ''), true);
      perform pg_catalog.set_config('lead.status_change_reason', coalesce(v_prev_reason, ''), true);
      raise;
  end;
end;
$$;

comment on function public.transition_lead_status(uuid, public.lead_status, text, uuid, text) is
  'Preferred status transition API (service_role only). Persists loss_reason atomically when transitioning to lost.';
