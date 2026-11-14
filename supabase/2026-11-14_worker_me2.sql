-- worker_me2: the same answer as worker_me, but the heavy parts of a route (path, boxes, steps) are left out when the
-- phone already has them. The phone sends { plan id: hash } of what it keeps; a route with the same hash comes back
-- with "_same": true and without the heavy parts. Every route carries its hash in "_h".
-- worker_me stays as it is (old app versions use it). Nothing is stored; no table changes.

create or replace function _plan_slim(p jsonb, known jsonb) returns jsonb language sql immutable set search_path to 'public' as $$
  select case when p is null or jsonb_typeof(p) <> 'object' then p else
    (select case when known ->> (p ->> 'id') = h.h then (p - 'path' - 'boxes' - 'steps') || jsonb_build_object('_h', h.h, '_same', true)
                 else p || jsonb_build_object('_h', h.h) end
       from (select md5(coalesce(p -> 'path', 'null')::text || coalesce(p -> 'boxes', 'null')::text || coalesce(p -> 'steps', 'null')::text) h) h) end
$$;
revoke execute on function _plan_slim(jsonb, jsonb) from public, anon, authenticated;

create or replace function worker_me2(p_token uuid, p_known jsonb default '{}'::jsonb) returns jsonb
language plpgsql stable security definer set search_path to 'public' as $$
declare me jsonb := worker_me(p_token); k jsonb := coalesce(p_known, '{}'::jsonb);
begin
  if jsonb_typeof(k) <> 'object' then k := '{}'::jsonb; end if;
  return me || jsonb_build_object(
    'tasks', coalesce((
      select jsonb_agg(t || jsonb_build_object(
          'plan', _plan_slim(t -> 'plan', k),
          'plans', case when jsonb_typeof(t -> 'plans') = 'array' then (select jsonb_agg(_plan_slim(x, k) order by o) from jsonb_array_elements(t -> 'plans') with ordinality a(x, o)) else t -> 'plans' end,
          'others', case when jsonb_typeof(t -> 'others') = 'array' then coalesce((select jsonb_agg(_plan_slim(x, k) order by o) from jsonb_array_elements(t -> 'others') with ordinality a(x, o)), '[]'::jsonb) else t -> 'others' end
        ) order by o)
      from jsonb_array_elements(me -> 'tasks') with ordinality e(t, o)), '[]'::jsonb),
    'open', coalesce((
      select jsonb_agg(t || jsonb_build_object('plan', _plan_slim(t -> 'plan', k)) order by o)
      from jsonb_array_elements(me -> 'open') with ordinality e(t, o)), '[]'::jsonb));
end $$;
revoke execute on function worker_me2(uuid, jsonb) from public;
grant execute on function worker_me2(uuid, jsonb) to anon, authenticated;
