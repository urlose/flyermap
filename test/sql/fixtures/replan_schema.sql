-- Production-like schema for re-plan tests (tables, constraints, triggers, RLS, grants), read from the
-- production catalogs on 16.11.2026 — structure only, no data. Used by test/sql/atomic_replan.sh and test/ui/e2e-replan.cjs.
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth; grant usage on schema auth to anon, authenticated, service_role;
create function auth.uid() returns uuid language sql stable as $f$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $f$;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;   -- like Supabase

create table companies(id uuid primary key, name text);
create table admins(user_id uuid primary key, company_id uuid references companies(id));
create table platform_admins(user_id uuid primary key);
create table workers(id uuid primary key, name text, company_id uuid references companies(id));
create function my_company() returns uuid language sql stable security definer set search_path to 'public' as $f$ select company_id from public.admins where user_id = auth.uid() $f$;
create function is_master() returns boolean language sql stable security definer set search_path to 'public' as $f$ select auth.uid() is not null and exists(select 1 from public.platform_admins where user_id = auth.uid()) $f$;

create table tasks(
  id uuid primary key default gen_random_uuid(), title text not null, city_name text,
  start_lat float8 not null, start_lng float8 not null, walk_minutes int4 not null default 15, zone_polygon jsonb,
  work_date date, status text not null default 'open', notes text, created_by uuid, created_at timestamptz not null default now(),
  street_m int4, district text, flyers int4, quota_m30 int4 not null default 2000, work_days int4 not null default 2,
  work_hours numeric not null default 7, est_mailboxes int4, route_m int4, company_id uuid not null default my_company() references companies(id) on delete cascade,
  must_areas jsonb, work_area jsonb, side_towns jsonb, bike bool not null default false, travel text not null default 'bus',
  split text, no_quota bool not null default false, merged_into uuid references tasks(id) on delete set null,
  flyers_done int4, flyers_done_at timestamptz, cores bool not null default false, together bool not null default false,
  first_place text, deadline date,
  constraint tasks_status_check check (status = any (array['open','done','archived','cancelled'])),
  constraint tasks_travel_chk check (travel = any (array['bus','bike','car','zones'])));
create table task_plans(
  id uuid primary key default gen_random_uuid(), task_id uuid not null references tasks(id) on delete cascade, idx int4 not null,
  worker_id uuid references workers(id) on delete set null, color text, path jsonb not null, length_m int4 not null, street_m int4 not null,
  mailboxes int4, boxes jsonb, minutes int4, days jsonb not null default '[]', steps jsonb not null default '[]',
  reserve jsonb not null default '[]', skipped jsonb not null default '[]', detours jsonb not null default '[]',
  status text not null default 'offered', work_dates jsonb not null default '[]', accepted_at timestamptz, committed_terms text,
  days_left int4, late_dates bool not null default false, late_ok bool not null default false, created_at timestamptz not null default now(),
  constraint task_plans_status_chk check (status = any (array['offered','accepted','declined','done'])),
  constraint task_plans_task_id_idx_key unique (task_id, idx));
create table task_workers(task_id uuid not null references tasks(id) on delete cascade, worker_id uuid not null references workers(id) on delete cascade, primary key(task_id, worker_id));
create table routes(id uuid primary key default gen_random_uuid(), worker_id uuid not null, task_id uuid references tasks(id) on delete set null,
  started_at timestamptz not null default now(), ended_at timestamptz, plan_id uuid references task_plans(id) on delete set null, company_id uuid not null);
create table notifications(id uuid primary key default gen_random_uuid(), worker_id uuid, kind text, title text,
  task_id uuid references tasks(id) on delete cascade, plan_id uuid references task_plans(id) on delete cascade);
create table help_requests(id uuid primary key default gen_random_uuid(), company_id uuid, worker_id uuid,
  task_id uuid references tasks(id) on delete set null, plan_id uuid references task_plans(id) on delete set null);
create table plan_cancellations(id uuid primary key default gen_random_uuid(), company_id uuid, worker_id uuid,
  task_id uuid references tasks(id) on delete set null, plan_id uuid references task_plans(id) on delete set null);
create table task_plans_trash(id bigserial primary key, task_id uuid, plan_id uuid, row jsonb, deleted_at timestamptz default now());
create table tasks_history(id bigserial primary key, task_id uuid, row jsonb, saved_at timestamptz default now());

-- production triggers, verbatim
create function _keep_plan() returns trigger language plpgsql security definer set search_path to 'public' as $f$
begin insert into task_plans_trash(task_id, plan_id, row) values (old.task_id, old.id, to_jsonb(old)); return old; end $f$;
create trigger keep_plan before delete on task_plans for each row execute function _keep_plan();
create function _keep_task() returns trigger language plpgsql security definer set search_path to 'public' as $f$
begin
  if old.zone_polygon is distinct from new.zone_polygon or old.flyers is distinct from new.flyers or old.side_towns is distinct from new.side_towns or old.must_areas is distinct from new.must_areas or old.work_days is distinct from new.work_days then
    insert into tasks_history(task_id, row) values (old.id, to_jsonb(old));
  end if; return new; end $f$;
create trigger keep_task before update on tasks for each row execute function _keep_task();
create function _plan_late() returns trigger language plpgsql security definer set search_path to 'public' as $f$
declare dl date;
begin
  if tg_op = 'UPDATE' and new.work_dates is not distinct from old.work_dates and new.task_id = old.task_id then return new; end if;
  select deadline into dl from tasks where id = new.task_id;
  new.late_dates := dl is not null and exists (select 1 from jsonb_array_elements_text(coalesce(new.work_dates, '[]'::jsonb)) d where d::date > dl);
  if not new.late_dates or tg_op = 'INSERT' then new.late_ok := false; elsif new.work_dates is distinct from old.work_dates then new.late_ok := false; end if;
  return new;
end $f$;
create trigger plan_late before insert or update on task_plans for each row execute function _plan_late();

-- production RLS and grants
alter table tasks enable row level security; alter table task_plans enable row level security; alter table task_workers enable row level security;
alter table routes enable row level security; alter table notifications enable row level security; alter table help_requests enable row level security;
alter table plan_cancellations enable row level security; alter table task_plans_trash enable row level security; alter table tasks_history enable row level security;
create policy co_all on tasks for all to authenticated using (company_id = (select my_company())) with check (company_id = (select my_company()));
create policy master_read on tasks for select to authenticated using ((select is_master()));
create policy co_all on task_plans for all to authenticated
  using (exists (select 1 from tasks t where t.id = task_plans.task_id and t.company_id = (select my_company())))
  with check (exists (select 1 from tasks t where t.id = task_plans.task_id and t.company_id = (select my_company()))
    and (worker_id is null or exists (select 1 from workers w where w.id = task_plans.worker_id and w.company_id = (select my_company()))));
create policy master_read on task_plans for select to authenticated using ((select is_master()));
create policy co_all on task_workers for all to authenticated
  using (exists (select 1 from tasks t where t.id = task_workers.task_id and t.company_id = (select my_company())))
  with check (exists (select 1 from tasks t where t.id = task_workers.task_id and t.company_id = (select my_company()))
    and exists (select 1 from workers w where w.id = task_workers.worker_id and w.company_id = (select my_company())));
create policy co_all on routes for all to authenticated using (company_id = (select my_company())) with check (company_id = (select my_company()));
create policy co_all on notifications for all to authenticated
  using (exists (select 1 from workers w where w.id = notifications.worker_id and w.company_id = (select my_company())))
  with check (exists (select 1 from workers w where w.id = notifications.worker_id and w.company_id = (select my_company())));
create policy help_requests_admin_read on help_requests for select using (company_id = my_company());
grant all on tasks, task_plans, task_workers, routes, notifications, help_requests to authenticated;
grant select on workers, admins, companies to authenticated;
