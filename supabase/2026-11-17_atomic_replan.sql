-- Draft: atomic re-planning of an EXISTING order (task + routes + assignments in one transaction).
-- NOT applied to production. Apply only after review and explicit approval.
--
-- Why: the admin panel re-plans with six separate REST calls (update task, delete routes, delete
-- assignments, insert routes, insert assignments, relink sessions). A failure after the delete
-- leaves the order without routes.
--
-- What this does differently:
--  * one transaction: any error keeps the old order, routes and assignments exactly as they were;
--  * the order row is locked, so two admins cannot re-plan the same order at the same time;
--  * the "somebody is walking right now" check runs on the server, not only in the browser;
--  * a route that keeps its distributor keeps its row id: sessions (routes), help reports,
--    cancellations and notifications stay linked without touching those tables;
--  * every replaced route is archived in task_plans_trash (old version), like a deleted one;
--  * SECURITY INVOKER: the existing RLS policies of tasks / task_plans / task_workers / routes apply.
--
-- Rules agreed with the owner (16.11.2026):
--  1. walked before, nobody on a shift now  -> allowed (as today)
--  2. distributor declined                  -> the new route is offered again (as today)
--  3. a route is already done               -> re-planning is refused (replan_done_route)
-- Unchanged from the admin panel: acceptance, dates, terms and skips are carried over only when
-- somebody has already walked on the order; otherwise every route is offered again.
begin;

-- Archive the old version of a route that is replaced in place. Fires only inside the re-plan
-- function (transaction-local setting), so other path updates do not fill the archive.
create or replace function public._keep_plan_replan()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
begin
  insert into task_plans_trash(task_id, plan_id, row) values (old.task_id, old.id, to_jsonb(old));
  return new;
end;
$$;
revoke execute on function public._keep_plan_replan() from public, anon, authenticated;

drop trigger if exists keep_plan_replan on public.task_plans;
create trigger keep_plan_replan
  before update of path on public.task_plans
  for each row
  when (old.path is distinct from new.path and current_setting('flyermap.replan', true) = '1')
  execute function public._keep_plan_replan();

create or replace function public.replan_task_with_plans(p_task_id uuid, p_task jsonb, p_plans jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = 'public'
as $$
declare
  v_task   public.tasks;
  r        public.tasks;
  n        public.task_plans;
  o        public.task_plans;
  v_found  boolean;
  v_used   uuid[] := '{}';
  v_walked boolean;
  v_skips  jsonb;
  v_need   integer;
  v_keep   boolean;
  v_dates  jsonb;
  v_plans  jsonb;
begin
  if auth.uid() is null then
    raise exception 'authentication_required';
  end if;
  if p_task_id is null
      or jsonb_typeof(p_task) is distinct from 'object'
      or jsonb_typeof(p_plans) is distinct from 'array'
      or jsonb_array_length(p_plans) = 0
      or jsonb_array_length(p_plans) > 30 then
    raise exception 'invalid_order_payload';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_plans) x
    where (x->>'mailboxes') is null
      or (x->>'mailboxes') !~ '^[0-9]+$'
      or (x->>'mailboxes')::numeric > 2147483647
  ) then
    raise exception 'mailboxes_must_be_nonnegative_integers';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_plans) x
    where (x->>'idx') is null or (x->>'idx') !~ '^[0-9]+$'
  ) or (select count(distinct x->>'idx') from jsonb_array_elements(p_plans) x) <> jsonb_array_length(p_plans) then
    raise exception 'invalid_route_index';
  end if;

  -- Lock the order. RLS: an order of another company is simply not found.
  select * into v_task from public.tasks where id = p_task_id for update;
  if not found then
    raise exception 'task_not_found';
  end if;
  if v_task.status <> 'open' then
    raise exception 'task_not_open';
  end if;
  if exists (select 1 from public.routes where task_id = p_task_id and ended_at is null) then
    raise exception 'replan_live';
  end if;
  perform 1 from public.task_plans where task_id = p_task_id for update;
  if exists (select 1 from public.task_plans where task_id = p_task_id and status = 'done') then
    raise exception 'replan_done_route';
  end if;

  v_walked := exists (select 1 from public.routes where task_id = p_task_id);
  select coalesce(jsonb_agg(e), '[]'::jsonb) into v_skips
    from public.task_plans p, jsonb_array_elements(coalesce(p.skipped, '[]'::jsonb)) e
    where p.task_id = p_task_id;

  -- Same fields as the admin panel's update. id, status, company, creator and merge data stay.
  r := jsonb_populate_record(null::public.tasks, p_task);
  update public.tasks set
    title = r.title, city_name = r.city_name, district = r.district,
    start_lat = r.start_lat, start_lng = r.start_lng, walk_minutes = r.walk_minutes,
    zone_polygon = r.zone_polygon, must_areas = r.must_areas, side_towns = r.side_towns,
    bike = r.bike, travel = r.travel, split = r.split, cores = r.cores, together = r.together,
    first_place = r.first_place, work_area = r.work_area, work_date = r.work_date,
    deadline = r.deadline, notes = r.notes, street_m = r.street_m, flyers = r.flyers,
    quota_m30 = r.quota_m30, no_quota = r.no_quota, work_days = r.work_days,
    work_hours = r.work_hours, est_mailboxes = r.est_mailboxes, route_m = r.route_m
  where id = p_task_id
  returning * into v_task;

  perform set_config('flyermap.replan', '1', true);
  -- free the (task_id, idx) numbers; old rows are recognisable by a negative idx from here on
  update public.task_plans set idx = -idx - 1 where task_id = p_task_id;

  for n in
    select * from jsonb_populate_recordset(null::public.task_plans, p_plans) order by idx
  loop
    -- a route keeps its row only for the same distributor (or unassigned -> unassigned)
    select * into o from public.task_plans
      where task_id = p_task_id and idx < 0 and not (id = any(v_used))
        and worker_id is not distinct from n.worker_id
      order by idx desc limit 1;
    v_found := found;

    v_need := greatest(1, jsonb_array_length(coalesce(n.days, '[]'::jsonb)));
    v_keep := v_walked and v_found and o.worker_id is not null and o.status = 'accepted'
              and jsonb_array_length(coalesce(o.work_dates, '[]'::jsonb)) >= v_need;
    if v_keep then
      select jsonb_agg(e order by ord) into v_dates
        from jsonb_array_elements(o.work_dates) with ordinality t(e, ord) where ord <= v_need;
    end if;

    if v_found then
      update public.task_plans set
        idx = n.idx, color = n.color, path = n.path, length_m = n.length_m, street_m = n.street_m,
        mailboxes = n.mailboxes, boxes = n.boxes, minutes = n.minutes,
        days = coalesce(n.days, '[]'::jsonb), steps = coalesce(n.steps, '[]'::jsonb),
        reserve = coalesce(n.reserve, '[]'::jsonb),
        skipped = case when v_walked then v_skips else '[]'::jsonb end,
        status = case when v_keep then 'accepted' else 'offered' end,
        work_dates = case when v_keep then v_dates else '[]'::jsonb end,
        accepted_at = case when v_keep then o.accepted_at end,
        committed_terms = case when v_keep then o.committed_terms end,
        days_left = null, detours = '[]'::jsonb
      where id = o.id;
      v_used := v_used || o.id;
    else
      insert into public.task_plans (
        task_id, idx, worker_id, color, path, length_m, street_m, mailboxes,
        boxes, minutes, days, steps, reserve, skipped
      ) values (
        p_task_id, n.idx, n.worker_id, n.color, n.path, n.length_m, n.street_m, n.mailboxes,
        n.boxes, n.minutes, coalesce(n.days, '[]'::jsonb), coalesce(n.steps, '[]'::jsonb),
        coalesce(n.reserve, '[]'::jsonb), case when v_walked then v_skips else '[]'::jsonb end
      );
    end if;
  end loop;

  -- routes nobody took over: removed (the existing keep_plan trigger archives them)
  delete from public.task_plans where task_id = p_task_id and idx < 0;

  delete from public.task_workers tw
    where tw.task_id = p_task_id
      and not exists (select 1 from public.task_plans p where p.task_id = p_task_id and p.worker_id = tw.worker_id);
  insert into public.task_workers (task_id, worker_id)
    select distinct p_task_id, p.worker_id from public.task_plans p
    where p.task_id = p_task_id and p.worker_id is not null
    on conflict do nothing;

  -- walked sessions follow their distributor to his route (day maps, "Gelaufen", flyers along the plan)
  update public.routes rt set plan_id = m.id
    from (select distinct on (worker_id) worker_id, id from public.task_plans
          where task_id = p_task_id and worker_id is not null order by worker_id, idx) m
    where rt.task_id = p_task_id and rt.worker_id = m.worker_id and rt.plan_id is distinct from m.id;

  -- a shift that started while this ran: undo everything
  if exists (select 1 from public.routes where task_id = p_task_id and ended_at is null) then
    raise exception 'replan_live';
  end if;

  select coalesce(jsonb_agg(to_jsonb(p) order by p.idx), '[]'::jsonb) into v_plans
    from public.task_plans p where p.task_id = p_task_id;
  if jsonb_array_length(v_plans) <> jsonb_array_length(p_plans) then
    raise exception 'not_all_plans_saved';
  end if;
  return jsonb_build_object('task', to_jsonb(v_task), 'plans', v_plans);
end;
$$;

revoke execute on function public.replan_task_with_plans(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.replan_task_with_plans(uuid, jsonb, jsonb) to authenticated, service_role;
commit;
