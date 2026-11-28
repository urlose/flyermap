-- 28.11.2026: a server auto-pause must not throw away GPS points that arrive late (bad mobile internet).
-- auto_pause_still pauses when no movement reached the server for 10 minutes. If points that were recorded in those
-- 10 minutes arrive later and show movement (> 50 m from the last known point), the person was working: the pause is
-- cancelled (no break added) and the points are stored. Movement only after the 10 minutes = a real stop, the pause stays.
-- The older rule (first point > 300 m away) stays as well.
CREATE OR REPLACE FUNCTION public.push_points2(p_token uuid, p_route_id uuid, p_points jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare w workers; r routes; v_n int; v_near text; v_last record; v_far double precision; v_move_t timestamptz;
begin
  w := _worker(p_token);
  select * into r from routes where id = p_route_id and worker_id = w.id;
  if not found then raise exception 'route_not_found'; end if;
  if r.ended_reason = 'taken' then return jsonb_build_object('state', 'taken'); end if;
  if r.paused_at is not null and r.auto_paused then
    select lat, lng, t into v_last from route_points where route_id = r.id order by t desc limit 1;
    if v_last.t is not null then
      -- GPS gap while moving: a good point after the last known one lies far away
      select max(haversine_m(v_last.lat, v_last.lng, (e->>'lat')::float8, (e->>'lng')::float8)) into v_far
      from jsonb_array_elements(p_points) e
      where (e->>'t')::timestamptz > v_last.t and coalesce((e->>'acc')::real, 0) <= 60;
      -- late points: the first movement > 50 m happened inside the 10 minutes the server took as standing
      select min((e->>'t')::timestamptz) into v_move_t
      from jsonb_array_elements(p_points) e
      where (e->>'t')::timestamptz > v_last.t and coalesce((e->>'acc')::real, 0) <= 60
        and haversine_m(v_last.lat, v_last.lng, (e->>'lat')::float8, (e->>'lng')::float8) > 50;
    end if;
    if coalesce(v_far, 0) > 300 or (v_move_t is not null and v_move_t < r.paused_at + interval '10 minutes') then
      insert into pause_log(route_id, worker_id, kind, source, paused_from, break_old, break_new, added_s, auto_paused, info)
      values (r.id, r.worker_id, 'auto_pause_cancelled', '/rpc/push_points2', r.paused_at, r.break_s, r.break_s, 0, false,
              jsonb_build_object('far_m', round(coalesce(v_far, 0)::numeric), 'last_t', v_last.t, 'move_t', v_move_t,
                                 'n', jsonb_array_length(p_points)));
      update routes set paused_at = null, auto_paused = false, resumed_at = greatest(coalesce(resumed_at, started_at), v_last.t)
        where id = r.id and paused_at is not null and auto_paused;
    else
      insert into pause_log(route_id, worker_id, kind, source, paused_from, auto_paused, info)
      select r.id, r.worker_id, 'points_rejected', '/rpc/push_points2', r.paused_at, true,
             jsonb_build_object('n', jsonb_array_length(p_points),
                                'first_t', min((e->>'t')::timestamptz), 'last_t', max((e->>'t')::timestamptz))
      from jsonb_array_elements(p_points) e
      having count(*) > 0;
      return jsonb_build_object('state', 'paused', 'paused_at', r.paused_at);
    end if;
  end if;
  v_n := push_points(p_token, p_route_id, p_points);
  select split_part(w2.name, ' ', 1) into v_near
  from routes r2 join workers w2 on w2.id = r2.worker_id
  where r2.ended_at is null and r2.paused_at is null and r2.worker_id <> w.id and w2.company_id = w.company_id
    and _near_count(r.id, r2.id, now()) >= 2
  limit 1;
  return jsonb_build_object('state', 'ok', 'n', v_n, 'near', v_near);
end $function$;
