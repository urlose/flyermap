-- 15.11.2026: replacement streets. Every route keeps a reserve (streets near it that no route takes). When the distributor
-- cannot walk a piece, the app marks it as "reported" (skipped with rep = true: orange, the admin decides) and adds the
-- nearest reserve streets with about as many mailboxes to the route. Old apps: unchanged (columns have defaults).
alter table public.task_plans add column if not exists reserve jsonb not null default '[]'::jsonb;
alter table public.task_plans add column if not exists detours jsonb not null default '[]'::jsonb;

-- p_pts: the reported piece; p_reason: closed / nobox / private / other …; p_take: indexes into reserve;
-- p_path / p_days: the route with the reserve streets put in (built by the app, checked here for plausibility)
create or replace function public.replace_piece(p_token uuid, p_plan_id uuid, p_pts jsonb, p_reason text, p_take int[], p_path jsonb, p_days jsonb, p_steps jsonb default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare w workers; pl task_plans; why text := left(coalesce(nullif(btrim(p_reason), ''), 'other'), 40);
  taken jsonb := '[]'::jsonb; mb int := 0; v_boxes jsonb := '[]'::jsonb; i int; r jsonb; mid jsonb; n int := 0;
begin
  w := _worker(p_token);
  select * into pl from task_plans where id = p_plan_id and worker_id = w.id for update;
  if not found then raise exception 'plan_not_found'; end if;
  if jsonb_typeof(p_pts) <> 'array' or jsonb_array_length(p_pts) < 2 or jsonb_array_length(p_pts) > 400 then raise exception 'bad_points'; end if;
  if jsonb_array_length(pl.skipped) >= 200 then raise exception 'too_many'; end if;
  -- the piece is reported (counts as handled for the walker, orange for the admin)
  update task_plans set skipped = skipped || jsonb_build_array(jsonb_build_object('pts', p_pts, 'at', now(), 'by', w.name, 'why', why, 'rep', true)) where id = pl.id;
  if p_take is null or cardinality(p_take) = 0 then return jsonb_build_object('ok', true, 'added', 0); end if;
  if cardinality(p_take) > 30 then raise exception 'bad_take'; end if;
  foreach i in array p_take loop
    if i < 0 or i >= jsonb_array_length(pl.reserve) then raise exception 'bad_take'; end if;
    r := pl.reserve -> i; taken := taken || jsonb_build_array(r); mb := mb + coalesce((r->>'mb')::int, 0);
    n := n + jsonb_array_length(r->'p');
    mid := (r->'p') -> (jsonb_array_length(r->'p') / 2);
    v_boxes := v_boxes || jsonb_build_array(jsonb_build_array(mid->0, mid->1, coalesce((r->>'mb')::int, 1)));
  end loop;
  -- the new route = the old one plus the taken streets (+ a jump point before each): nothing else may change in size
  if jsonb_typeof(p_path) <> 'array' or jsonb_array_length(p_path) < jsonb_array_length(pl.path) + n
     or jsonb_array_length(p_path) > jsonb_array_length(pl.path) + n + 2 * cardinality(p_take) + 2 then raise exception 'bad_path'; end if;
  if jsonb_typeof(p_days) <> 'array' or jsonb_array_length(p_days) <> greatest(1, jsonb_array_length(coalesce(pl.days, '[]'::jsonb))) then raise exception 'bad_days'; end if;
  if p_steps is not null and (jsonb_typeof(p_steps) <> 'array' or jsonb_array_length(p_steps) <> jsonb_array_length(coalesce(pl.steps, '[]'::jsonb))) then raise exception 'bad_steps'; end if;
  update task_plans set path = p_path, days = p_days, steps = coalesce(p_steps, steps), mailboxes = coalesce(mailboxes, 0) + mb, boxes = coalesce(task_plans.boxes, '[]'::jsonb) || v_boxes,
    reserve = (select coalesce(jsonb_agg(e order by k), '[]'::jsonb) from jsonb_array_elements(pl.reserve) with ordinality x(e, k) where not ((k - 1)::int = any(p_take))),
    detours = detours || jsonb_build_array(jsonb_build_object('at', now(), 'by', w.name, 'why', why, 'for', p_pts, 'add', taken, 'mb', mb))
   where id = pl.id;
  return jsonb_build_object('ok', true, 'added', cardinality(p_take), 'mb', mb);
end $$;
revoke all on function public.replace_piece(uuid, uuid, jsonb, text, int[], jsonb, jsonb, jsonb) from public;
grant execute on function public.replace_piece(uuid, uuid, jsonb, text, int[], jsonb, jsonb, jsonb) to anon, authenticated;

-- the reserve of one's own route (loaded only when a piece is reported, so the daily data stays small)
create or replace function public.plan_reserve(p_token uuid, p_plan_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare w workers; r jsonb;
begin
  w := _worker(p_token);
  select reserve into r from task_plans where id = p_plan_id and worker_id = w.id;
  if not found then raise exception 'plan_not_found'; end if;
  return coalesce(r, '[]'::jsonb);
end $$;
revoke all on function public.plan_reserve(uuid, uuid) from public;
grant execute on function public.plan_reserve(uuid, uuid) to anon, authenticated;
