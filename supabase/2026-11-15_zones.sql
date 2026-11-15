-- 15.11.2026: orders with several places as zones (travel = 'zones'): every place is planned on its own and shared out among
-- all workers, one route per place and person; nothing is drawn or counted between the places.
alter table public.tasks drop constraint if exists tasks_travel_chk;
alter table public.tasks add constraint tasks_travel_chk check (travel = any (array['bus', 'bike', 'car', 'zones']));

-- name of a route's place: also for routes of several days, when all days are in the same place (zones)
create or replace function public._plan_place(p task_plans) returns text language sql stable security definer set search_path to 'public' as $$
  select nullif(trim(regexp_replace(regexp_replace(coalesce(
    case when jsonb_typeof(p.days) = 'array' and jsonb_array_length(p.days) >= 1 and coalesce(p.days->0->>'place', '') <> ''
          and not exists (select 1 from jsonb_array_elements(p.days) x where x->>'place' is distinct from p.days->0->>'place') then p.days->0->>'place' end,
    (select m.source_row->>'title' from task_merges m where m.target = p.task_id and p.id = any(m.plan_ids) order by m.id desc limit 1),
    (select t.title from tasks t where t.id = p.task_id)), '^.*·\s*', ''), '\s*\(Tag \d+\)\s*$', '')), '')
$$;
