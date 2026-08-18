-- apply_capture_proposal: normalise the task vocabulary before writing.
--
-- The extraction pass proposes tasks with status 'todo' and priority 'Normal'.
-- This database allows status open|doing|done|dropped|waiting and priority
-- High|Med|Low, so every task proposal would have failed its check constraint
-- on Accept — the one proposal type EVERY document produces.
--
-- Normalising here rather than only in the extractor is deliberate: this
-- function is the seam between a model's opinion and a real table, and it is
-- the only place guaranteed to run for every proposal whatever produced it.
-- Anything outside the known vocabulary still falls through to the constraint
-- and fails loudly rather than being silently coerced to a default.

create or replace function public.apply_capture_proposal(p_proposal_id uuid)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public', 'pg_catalog'
as $function$
declare
  v_uid        uuid := auth.uid();
  v_prop       public.capture_proposals%rowtype;
  v_allowed    text[] := array['vehicles','debts','tasks','notes','people','assets','inbox','metric_readings','finishes','people_contacts'];
  v_payload    jsonb;
  v_key        text;
  v_type       text;
  v_cols       text := '';
  v_vals       text := '';
  v_sets       text := '';
  v_sql        text;
  v_new_id     uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select * into v_prop from public.capture_proposals
    where id = p_proposal_id and user_id = v_uid
    for update;

  if not found then
    raise exception 'proposal not found';
  end if;

  if v_prop.status = 'applied' then
    return v_prop.target_id;
  end if;

  if not (v_prop.target_table = any(v_allowed)) then
    raise exception 'table % is not writable by the capture engine', v_prop.target_table;
  end if;

  v_payload := v_prop.payload;

  -- Vocabulary translation, tasks only. Known synonyms only; an unrecognised
  -- value is left alone so the check constraint still catches it.
  if v_prop.target_table = 'tasks' then
    if lower(coalesce(v_payload ->> 'status','')) in ('todo','to do','new','pending') then
      v_payload := jsonb_set(v_payload, '{status}', '"open"');
    end if;
    if lower(coalesce(v_payload ->> 'priority','')) in ('normal','medium','mid') then
      v_payload := jsonb_set(v_payload, '{priority}', '"Med"');
    end if;
  end if;

  for v_key in select jsonb_object_keys(v_payload) loop
    if v_key in ('id','user_id','created_at') then
      continue;
    end if;

    select data_type into v_type
      from information_schema.columns
      where table_schema = 'public'
        and table_name = v_prop.target_table
        and column_name = v_key;

    if v_type is null then
      raise exception 'column %.% does not exist', v_prop.target_table, v_key;
    end if;

    if v_prop.action = 'insert' then
      v_cols := v_cols || ', ' || quote_ident(v_key);
      v_vals := v_vals || ', ' ||
        case when jsonb_typeof(v_payload -> v_key) = 'null'
             then 'null'
             else format('%L::%s', v_payload ->> v_key, v_type) end;
    else
      v_sets := v_sets || ', ' || quote_ident(v_key) || ' = ' ||
        case when jsonb_typeof(v_payload -> v_key) = 'null'
             then 'null'
             else format('%L::%s', v_payload ->> v_key, v_type) end;
    end if;
  end loop;

  if v_prop.action = 'insert' then
    v_sql := format(
      'insert into public.%I (user_id%s) values (%L::uuid%s) returning id',
      v_prop.target_table, v_cols, v_uid, v_vals
    );
    execute v_sql into v_new_id;
  else
    if v_prop.target_id is null then
      raise exception 'update proposal has no target_id';
    end if;
    if v_sets = '' then
      raise exception 'update proposal has no fields to set';
    end if;
    v_sql := format(
      'update public.%I set %s where id = %L::uuid and user_id = %L::uuid returning id',
      v_prop.target_table, substr(v_sets, 3), v_prop.target_id, v_uid
    );
    execute v_sql into v_new_id;
    if v_new_id is null then
      raise exception 'target row not found or not yours';
    end if;
  end if;

  update public.capture_proposals
     set status = 'applied', applied_at = now(), target_id = v_new_id, error = null
   where id = p_proposal_id;

  return v_new_id;
exception when others then
  update public.capture_proposals
     set status = 'failed', error = sqlerrm
   where id = p_proposal_id;
  raise;
end;
$function$;

revoke execute on function public.apply_capture_proposal(uuid) from public, anon;
grant execute on function public.apply_capture_proposal(uuid) to authenticated;
