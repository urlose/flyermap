-- One account = one phone, and auto-pause of a session that does not move (04.11.2026).
-- Compatible with old apps: the 4-argument start_route and push_points keep working as before.

alter table routes add column if not exists device text;
alter table routes add column if not exists auto_paused boolean not null default false;

-- is a session of this account running on another phone right now (a point or the start in the last 10 minutes)?
create or replace function public.route_elsewhere(p_token uuid, p_device text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare w workers; r routes; v_last timestamptz;
begin
  w := _worker(p_token);
  select * into r from routes where id = w.active_route_id and ended_at is null;
  if not found or (r.device is not null and r.device = p_device) then return jsonb_build_object('busy', false); end if;
  select max(t) into v_last from route_points where route_id = r.id;
  v_last := greatest(coalesce(v_last, r.started_at), r.started_at);
  return jsonb_build_object('busy', v_last > now() - interval '10 minutes', 'since', r.started_at, 'last', v_last);
end $$;

-- start with the phone's id: a session of another phone is taken over ('taken': that phone stops, nothing is counted twice)
create or replace function public.start_route(p_token uuid, p_task_id uuid, p_started_at timestamptz, p_plan_id uuid, p_device text)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare w workers; v_id uuid; v_at timestamptz := least(coalesce(p_started_at, now()), now()); o routes;
begin
  w := _worker(p_token);
  if p_task_id is not null and not exists(select 1 from task_workers where task_id = p_task_id and worker_id = w.id) then p_task_id := null; p_plan_id := null; end if;
  if p_plan_id is not null and not exists(select 1 from task_plans where id = p_plan_id and worker_id = w.id) then p_plan_id := null; end if;
  if w.active_route_id is not null then
    select * into o from routes where id = w.active_route_id and ended_at is null;
    if found then
      update routes set ended_at = now(),
        ended_reason = case when device is not null and device = p_device then 'replaced' else 'taken' end,
        break_s = break_s + case when paused_at is not null and (device is null or device <> p_device) then greatest(0, extract(epoch from (now() - paused_at))::int) else 0 end,
        paused_at = case when device is null or device <> p_device then null else paused_at end
        where id = o.id;
    end if;
  end if;
  insert into routes(worker_id, task_id, plan_id, started_at, company_id, device) values (w.id, p_task_id, p_plan_id, v_at, w.company_id, nullif(p_device, '')) returning id into v_id;
  update workers set active_route_id = v_id where id = w.id;
  return v_id;
end $$;
grant execute on function public.route_elsewhere(uuid, text) to anon, authenticated;
grant execute on function public.start_route(uuid, uuid, timestamptz, uuid, text) to anon, authenticated;

-- old push: points of a session taken over by another phone are not counted any more
create or replace function public.push_points(p_token uuid, p_route_id uuid, p_points jsonb)
returns integer language plpgsql security definer set search_path to 'public' as $function$
declare w workers; r routes; p record; prev record; v_dist double precision := 0; v_n int := 0; v_seg double precision; v_sec double precision; v_other uuid;
begin
  w := _worker(p_token);
  select * into r from routes where id = p_route_id and worker_id = w.id;
  if not found then raise exception 'route_not_found'; end if;
  if r.paused_at is not null or r.ended_reason = 'taken' then return 0; end if;
  select lat, lng, t into prev from route_points where route_id = r.id order by t desc limit 1;
  for p in select (e->>'t')::timestamptz t, (e->>'lat')::float8 lat, (e->>'lng')::float8 lng, (e->>'acc')::real acc from jsonb_array_elements(p_points) e order by 1
  loop
    if p.acc is not null and p.acc > 60 then continue; end if;
    if prev.t is not null and p.t <= prev.t then continue; end if;
    if prev.lat is not null then
      v_seg := haversine_m(prev.lat, prev.lng, p.lat, p.lng); v_sec := extract(epoch from (p.t - prev.t));
      if v_sec > 0 and v_seg / v_sec <= 15 then v_dist := v_dist + v_seg; end if;   -- GPS jumps do not count
    end if;
    insert into route_points(route_id, t, lat, lng, acc) values (r.id, p.t, p.lat, p.lng, p.acc);
    prev := p; v_n := v_n + 1;
  end loop;
  if v_n > 0 then
    update routes set distance_m = distance_m + v_dist, point_count = point_count + v_n,
      last30_m = coalesce((select sum(x.seg) from (select haversine_m(lag(rp.lat) over (order by rp.t), lag(rp.lng) over (order by rp.t), rp.lat, rp.lng) seg, extract(epoch from (rp.t - lag(rp.t) over (order by rp.t))) sec from route_points rp where rp.route_id = r.id and rp.t > now() - interval '30 minutes') x where x.seg is not null and x.sec > 0 and x.seg / x.sec <= 15), 0)
      where id = r.id;
    -- this phone is still recording a route that another start had ended: it is the real one again
    if r.ended_at is not null and r.ended_reason = 'replaced' and prev.t > r.ended_at then
      v_other := w.active_route_id;
      if v_other is not null and v_other <> r.id then
        update routes set ended_at = now(), ended_reason = 'replaced',
          break_s = break_s + case when paused_at is not null then greatest(0, extract(epoch from (now() - paused_at))::int) else 0 end, paused_at = null
          where id = v_other and ended_at is null and not exists(select 1 from route_points q where q.route_id = v_other and q.t > now() - interval '2 minutes');
      end if;
      if v_other is null or v_other = r.id or exists(select 1 from routes where id = v_other and ended_at is not null) then
        update routes set ended_at = null, ended_reason = null where id = r.id;
        update workers set active_route_id = r.id where id = w.id;
        r.ended_at := null;
      end if;
    end if;
    if w.last_seen is null or prev.t > w.last_seen then update workers set last_lat = prev.lat, last_lng = prev.lng, last_seen = prev.t where id = w.id; end if;
  end if;
  return v_n;
end $function$;

-- new push: tells the phone whether its session was taken over or auto-paused
create or replace function public.push_points2(p_token uuid, p_route_id uuid, p_points jsonb)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare w workers; r routes; v_n int;
begin
  w := _worker(p_token);
  select * into r from routes where id = p_route_id and worker_id = w.id;
  if not found then raise exception 'route_not_found'; end if;
  if r.ended_reason = 'taken' then return jsonb_build_object('state', 'taken'); end if;
  if r.paused_at is not null and r.auto_paused then return jsonb_build_object('state', 'paused', 'paused_at', r.paused_at); end if;
  v_n := push_points(p_token, p_route_id, p_points);
  return jsonb_build_object('state', 'ok', 'n', v_n);
end $$;
grant execute on function public.push_points2(uuid, uuid, jsonb) to anon, authenticated;

create or replace function public.resume_route(p_token uuid, p_route_id uuid, p_at timestamptz default null)
returns void language plpgsql security definer set search_path to 'public' as $$
declare w workers; v_at timestamptz := least(coalesce(p_at, now()), now());
begin w := _worker(p_token);
  update routes set break_s = break_s + greatest(0, extract(epoch from (v_at - paused_at))::int), paused_at = null, auto_paused = false where id = p_route_id and worker_id = w.id and paused_at is not null; end $$;

create or replace function public.end_route(p_token uuid, p_route_id uuid, p_ended_at timestamptz default null)
returns void language plpgsql security definer set search_path to 'public' as $$
declare w workers; v_end timestamptz := least(coalesce(p_ended_at, now()), now());
begin
  w := _worker(p_token);
  update routes set ended_at = case when ended_at is null or ended_reason = 'replaced' then v_end else ended_at end,
    ended_reason = case when ended_reason = 'taken' then 'taken' else 'user' end,
    break_s = break_s + case when paused_at is not null then greatest(0, extract(epoch from (v_end - paused_at))::int) else 0 end, paused_at = null, auto_paused = false
    where id = p_route_id and worker_id = w.id;
  update workers set active_route_id = null where id = w.id and active_route_id = p_route_id;
end $$;

-- every 5 minutes: a running session (new apps only) that has not moved 50 m for more than an hour is paused
-- from the moment it stood still; the worker continues with "Weiter"
create or replace function public.auto_pause_still()
returns int language plpgsql security definer set search_path to 'public' as $$
declare r record; v_n int := 0; v_last record; v_moved timestamptz;
begin
  for r in select * from routes where ended_at is null and paused_at is null and device is not null and started_at < now() - interval '60 minutes' loop
    select lat, lng, t into v_last from route_points where route_id = r.id order by t desc limit 1;
    if v_last.t is null then v_moved := r.started_at;
    else
      select max(t) into v_moved from route_points where route_id = r.id and haversine_m(lat, lng, v_last.lat, v_last.lng) > 50;
      v_moved := greatest(coalesce(v_moved, r.started_at), r.started_at);
      -- no point for a long time counts like standing still: v_moved is at most the last point
    end if;
    if v_moved < now() - interval '60 minutes' then
      update routes set paused_at = v_moved, auto_paused = true where id = r.id and paused_at is null and ended_at is null;
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end $$;
revoke execute on function public.auto_pause_still() from public, anon, authenticated;
select cron.schedule('auto-pause-still', '*/5 * * * *', 'select public.auto_pause_still()');
