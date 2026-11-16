-- Draft: atomic creation of an order and its routes.
-- Apply only after review. SECURITY INVOKER deliberately preserves tasks/task_plans RLS.
-- If any row is invalid (including mailboxes), the whole function call rolls back.
begin;

create or replace function public.create_task_with_plans(p_task jsonb, p_plans jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = 'public'
as $$
declare
  v_id uuid;
  v_task public.tasks;
  v_plans jsonb;
begin
  if auth.uid() is null then
    raise exception 'authentication_required';
  end if;
  if jsonb_typeof(p_task) is distinct from 'object'
      or jsonb_typeof(p_plans) is distinct from 'array'
      or jsonb_array_length(p_plans) = 0
      or jsonb_array_length(p_plans) > 30 then
    raise exception 'invalid_order_payload';
  end if;

  -- Fields are the same as the current authenticated admin insert. Remaining
  -- columns use the table defaults (including id/status/company metadata).
  insert into public.tasks (
    title, city_name, district, start_lat, start_lng, walk_minutes,
    zone_polygon, must_areas, side_towns, bike, travel, split, cores,
    together, first_place, work_area, work_date, deadline, notes, street_m,
    flyers, quota_m30, no_quota, work_days, work_hours,
    est_mailboxes, route_m, created_by
  )
  select
    r.title, r.city_name, r.district, r.start_lat, r.start_lng, r.walk_minutes,
    r.zone_polygon, r.must_areas, r.side_towns, r.bike, r.travel, r.split, r.cores,
    r.together, r.first_place, r.work_area, r.work_date, r.deadline, r.notes, r.street_m,
    r.flyers, r.quota_m30, r.no_quota, r.work_days, r.work_hours,
    r.est_mailboxes, r.route_m, auth.uid()
  from jsonb_populate_record(null::public.tasks, p_task) as r
  returning * into v_task;
  v_id := v_task.id;

  if exists (
    select 1 from jsonb_array_elements(p_plans) x
    where (x->>'mailboxes') is null
      or (x->>'mailboxes') !~ '^[0-9]+$'
      or (x->>'mailboxes')::numeric > 2147483647
  ) then
    raise exception 'mailboxes_must_be_nonnegative_integers';
  end if;

  insert into public.task_plans (
    task_id, idx, worker_id, color, path, length_m, street_m, mailboxes,
    boxes, minutes, days, steps, reserve
  )
  select
    v_id, r.idx, r.worker_id, r.color, r.path, r.length_m, r.street_m,
    r.mailboxes, r.boxes, r.minutes, r.days, r.steps, r.reserve
  from jsonb_populate_recordset(null::public.task_plans, p_plans) as r;

  -- Assignments are created in the same transaction, not in a later REST call.
  insert into public.task_workers (task_id, worker_id)
    select distinct v_id, (x->>'worker_id')::uuid
    from jsonb_array_elements(p_plans) x
    where nullif(x->>'worker_id','') is not null
    on conflict do nothing;

  select coalesce(jsonb_agg(to_jsonb(p) order by p.idx), '[]'::jsonb)
    into v_plans
    from public.task_plans p where p.task_id = v_id;

  if jsonb_array_length(v_plans) <> jsonb_array_length(p_plans) then
    raise exception 'not_all_plans_saved';
  end if;
  return jsonb_build_object('task', to_jsonb(v_task), 'plans', v_plans);
end;
$$;

revoke execute on function public.create_task_with_plans(jsonb,jsonb) from public, anon;
grant execute on function public.create_task_with_plans(jsonb,jsonb) to authenticated, service_role;
commit;
