#!/usr/bin/env bash
# Synthetic, isolated Postgres test of the atomic task+plans RPC.
set -euo pipefail
export PGHOST="${PGHOST:-127.0.0.1}" PGPORT="${PGPORT:-5432}" PGUSER="${PGUSER:-postgres}" PGPASSWORD="${PGPASSWORD:-postgres}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
psql -v ON_ERROR_STOP=1 -q <<'SQL'
create role authenticated;
create role anon;
create role service_role;
create schema auth;
grant usage on schema auth to authenticated;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;
grant execute on function auth.uid() to authenticated;
grant usage on schema public to authenticated;
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null, city_name text, district text, start_lat double precision, start_lng double precision,
  walk_minutes integer, zone_polygon jsonb, must_areas jsonb, side_towns jsonb,
  bike boolean, travel text, split text, cores boolean, together boolean, first_place text,
  work_area jsonb, work_date date, deadline date, notes text, street_m numeric,
  flyers integer, quota_m30 integer, no_quota boolean, work_days integer, work_hours numeric,
  est_mailboxes integer, route_m numeric, created_by uuid not null
);
create table public.task_plans (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id), idx integer not null, worker_id uuid,
  color text, path jsonb, length_m numeric, street_m numeric, mailboxes integer,
  boxes jsonb, minutes numeric, days jsonb, steps jsonb, reserve jsonb
);
create table public.task_workers (
  task_id uuid references public.tasks(id),
  worker_id uuid not null,
  primary key(task_id,worker_id)
);
grant select,insert on public.tasks,public.task_plans,public.task_workers to authenticated;
alter table public.tasks enable row level security;
alter table public.task_plans enable row level security;
alter table public.task_workers enable row level security;
create policy tasks_auth on public.tasks for all to authenticated
  using (created_by=auth.uid()) with check(created_by=auth.uid());
create policy plans_auth on public.task_plans for all to authenticated
  using (exists(select 1 from public.tasks t where t.id=task_id and t.created_by=auth.uid()))
  with check (exists(select 1 from public.tasks t where t.id=task_id and t.created_by=auth.uid()));
create policy workers_auth on public.task_workers for all to authenticated
  using (exists(select 1 from public.tasks t where t.id=task_id and t.created_by=auth.uid()))
  with check (exists(select 1 from public.tasks t where t.id=task_id and t.created_by=auth.uid()));
SQL
psql -v ON_ERROR_STOP=1 -q -f "$ROOT/supabase/2026-11-16_atomic_task_plans.sql"
psql -v ON_ERROR_STOP=1 -q <<'SQL'
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

-- Successful creation: two routes, two distinct employees, one order.
select public.create_task_with_plans(
  '{"title":"Synthetic demo","start_lat":48.4,"start_lng":10.2,"flyers":200,"quota_m30":2500,"work_days":3,"work_hours":7,"est_mailboxes":200,"route_m":1000}'::jsonb,
  '[{"idx":0,"worker_id":"22222222-2222-4222-8222-222222222222","color":"#abc","mailboxes":100,"path":[[48.4,10.2],[48.41,10.21]],"days":[{"i0":0,"i1":1}]},{"idx":1,"worker_id":"33333333-3333-4333-8333-333333333333","color":"#def","mailboxes":100,"path":[[48.4,10.2],[48.42,10.22]],"days":[{"i0":0,"i1":1}]}]'::jsonb
);
do $$
begin
  if (select count(*) from public.tasks)<>1
    or (select count(*) from public.task_plans)<>2
    or (select count(*) from public.task_workers)<>2 then
    raise exception 'atomic_success_failed';
  end if;
end $$;

-- The invalid fractional mailbox value must roll back the new order.
do $$
begin
  begin
    perform public.create_task_with_plans(
      '{"title":"Invalid","flyers":100}'::jsonb,
      '[{"idx":0,"mailboxes":1381.5,"path":[[48.4,10.2],[48.41,10.21]]}]'::jsonb
    );
    raise exception 'invalid mailbox unexpectedly accepted';
  exception
    when others then
      if sqlerrm='invalid mailbox unexpectedly accepted' then raise; end if;
  end;
  if (select count(*) from public.tasks)<>1 then
    raise exception 'invalid input left an empty order';
  end if;
end $$;
SQL
echo 'Atomic task+route insert, worker assignment and rollback passed.'
