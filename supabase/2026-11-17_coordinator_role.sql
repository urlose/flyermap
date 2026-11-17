-- Role "Koordinator" (17.11.2026): sees everything of the firm, answers help reports, assigns distributors to free
-- routes, invites distributors with a personal link (the firm records who invited whom). Changes nothing else.
-- Enforced in the database, not only in the admin panel: write rules and write functions accept full admins only.
-- Generated from the production definitions of 17.11.2026 (only `my_company()` -> `my_company_rw()` where writing).
-- Rollback: supabase/rollback/2026-11-17_coordinator_role.down.sql
begin;

-- 1. data
alter table public.admins add column if not exists role text not null default 'admin';
alter table public.admins add column if not exists display_name text;
alter table public.admins add column if not exists ref_code text;
do $$ begin alter table public.admins add constraint admins_role_chk check (role in ('admin', 'coordinator')); exception when duplicate_object then null; end $$;
create unique index if not exists admins_ref_code_key on public.admins (ref_code) where ref_code is not null;
alter table public.admin_phone_invites add column if not exists role text not null default 'admin';
alter table public.admin_phone_invites add column if not exists display_name text;
do $$ begin alter table public.admin_phone_invites add constraint admin_phone_invites_role_chk check (role in ('admin', 'coordinator')); exception when duplicate_object then null; end $$;
alter table public.workers add column if not exists referred_by uuid references auth.users(id) on delete set null;
alter table public.workers add column if not exists referred_at timestamptz;

-- 2. who may write: full admins of the firm (coordinators get null)
create or replace function public.my_company_rw()
returns uuid language sql stable security definer set search_path to 'public' as $f$
  select company_id from public.admins where user_id = auth.uid() and role = 'admin'
$f$;
create or replace function public.my_role()
returns text language sql stable security definer set search_path to 'public' as $f$
  select role from public.admins where user_id = auth.uid()
$f$;

CREATE OR REPLACE FUNCTION public.gen_join_code()
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare a constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; b bytea; c text;
begin
  loop
    b := extensions.gen_random_bytes(8); c := '';
    for i in 0..7 loop c := c || substr(a, 1 + (get_byte(b, i) % 32), 1); end loop;
    exit when not exists(select 1 from companies where join_code = c) and not exists(select 1 from admins where ref_code = c);
  end loop;
  return c;
end $function$
;

-- a join code is the firm's code or the personal code of one of its admins/coordinators (-> referrer)
create or replace function public._join_target(p_code text, out company_id uuid, out referrer uuid)
language plpgsql stable security definer set search_path to 'public' as $f$
declare v text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
begin
  select c.id into company_id from companies c where c.join_code = v;
  if company_id is null and v <> '' then
    select a.company_id, a.user_id into company_id, referrer from admins a where a.ref_code = v;
  end if;
end $f$;

-- personal invitation code of the signed-in admin or coordinator (created on first use)
create or replace function public.my_ref_code()
returns text language plpgsql security definer set search_path to 'public' as $f$
declare v text;
begin
  if public.my_company() is null then raise exception 'not_admin'; end if;
  select ref_code into v from admins where user_id = auth.uid();
  if v is null then
    v := public.gen_join_code();
    update admins set ref_code = v where user_id = auth.uid();
  end if;
  return v;
end $f$;

-- full admins change the role or the shown name of an admin of their firm; the last full admin stays
create or replace function public.set_admin_role(p_user uuid, p_role text, p_name text default null)
returns void language plpgsql security definer set search_path to 'public' as $f$
declare co uuid := public.my_company_rw();
begin
  if co is null then raise exception 'not_admin'; end if;
  if p_role not in ('admin', 'coordinator') then raise exception 'bad_role'; end if;
  if not exists(select 1 from admins where user_id = p_user and company_id = co) then raise exception 'not_found'; end if;
  if p_role = 'coordinator' and not exists(select 1 from admins where company_id = co and role = 'admin' and user_id <> p_user) then raise exception 'last_admin'; end if;
  update admins set role = p_role, display_name = coalesce(nullif(left(btrim(coalesce(p_name, '')), 60), ''), display_name) where user_id = p_user and company_id = co;
end $f$;

-- coordinators (and admins) put a distributor on a FREE route of an open order: nobody assigned or declined
create or replace function public.coord_assign_plan(p_plan uuid, p_worker uuid, p_days_left integer default null, p_title text default null, p_body text default null)
returns uuid language plpgsql security definer set search_path to 'public' as $f$
declare co uuid := public.my_company(); p task_plans; tk tasks; prev uuid;
begin
  if co is null then raise exception 'not_admin'; end if;
  select * into p from task_plans where id = p_plan for update;
  select * into tk from tasks where id = p.task_id;
  if p.id is null or tk.company_id is distinct from co then raise exception 'not_found'; end if;
  if tk.status <> 'open' or tk.merged_into is not null then raise exception 'task_not_open'; end if;
  if p.worker_id is not null and p.status <> 'declined' then raise exception 'plan_not_free'; end if;
  if not exists(select 1 from workers where id = p_worker and company_id = co) then raise exception 'worker_not_found'; end if;
  prev := p.worker_id;
  update task_plans set worker_id = p_worker, status = 'offered', work_dates = '[]', accepted_at = null, committed_terms = null,
    days_left = case when p_days_left between 1 and 60 then p_days_left end
  where id = p_plan;
  if prev is not null and prev <> p_worker and not exists(select 1 from task_plans where task_id = p.task_id and worker_id = prev) then
    delete from task_workers where task_id = p.task_id and worker_id = prev;
  end if;
  insert into task_workers(task_id, worker_id) values (p.task_id, p_worker) on conflict do nothing;
  insert into notifications(worker_id, kind, title, body, task_id, plan_id)
    values (p_worker, 'assigned', coalesce(nullif(left(btrim(coalesce(p_title, '')), 200), ''), 'Neuer Auftrag: ' || tk.title), nullif(left(btrim(coalesce(p_body, '')), 1000), ''), p.task_id, p_plan);
  return p_plan;
end $f$;

revoke all on function public.my_company_rw() from public, anon;
revoke all on function public.my_role() from public, anon;
revoke all on function public._join_target(text) from public, anon, authenticated;
revoke all on function public.my_ref_code() from public, anon;
revoke all on function public.set_admin_role(uuid, text, text) from public, anon;
revoke all on function public.coord_assign_plan(uuid, uuid, integer, text, text) from public, anon;
grant execute on function public.my_company_rw(), public.my_role(), public.my_ref_code(), public.set_admin_role(uuid, text, text), public.coord_assign_plan(uuid, uuid, integer, text, text) to authenticated;

-- 3. table rules: reading as before (whole firm), writing only for full admins

drop policy if exists co_all on public.tasks;
drop policy if exists co_read on public.tasks;
drop policy if exists co_write on public.tasks;
create policy co_read on public.tasks as permissive for select to authenticated using ((company_id = ( SELECT my_company() AS my_company)));
create policy co_write on public.tasks as permissive for all to authenticated using ((company_id = ( SELECT my_company_rw() AS my_company))) with check ((company_id = ( SELECT my_company_rw() AS my_company)));
drop policy if exists co_all on public.task_plans;
drop policy if exists co_read on public.task_plans;
drop policy if exists co_write on public.task_plans;
create policy co_read on public.task_plans as permissive for select to authenticated using ((EXISTS ( SELECT 1
   FROM tasks t
  WHERE ((t.id = task_plans.task_id) AND (t.company_id = ( SELECT my_company() AS my_company))))));
create policy co_write on public.task_plans as permissive for all to authenticated using ((EXISTS ( SELECT 1
   FROM tasks t
  WHERE ((t.id = task_plans.task_id) AND (t.company_id = ( SELECT my_company_rw() AS my_company)))))) with check (((EXISTS ( SELECT 1
   FROM tasks t
  WHERE ((t.id = task_plans.task_id) AND (t.company_id = ( SELECT my_company_rw() AS my_company))))) AND ((worker_id IS NULL) OR (EXISTS ( SELECT 1
   FROM workers w
  WHERE ((w.id = task_plans.worker_id) AND (w.company_id = ( SELECT my_company_rw() AS my_company))))))));
drop policy if exists co_all on public.task_workers;
drop policy if exists co_read on public.task_workers;
drop policy if exists co_write on public.task_workers;
create policy co_read on public.task_workers as permissive for select to authenticated using ((EXISTS ( SELECT 1
   FROM tasks t
  WHERE ((t.id = task_workers.task_id) AND (t.company_id = ( SELECT my_company() AS my_company))))));
create policy co_write on public.task_workers as permissive for all to authenticated using ((EXISTS ( SELECT 1
   FROM tasks t
  WHERE ((t.id = task_workers.task_id) AND (t.company_id = ( SELECT my_company_rw() AS my_company)))))) with check (((EXISTS ( SELECT 1
   FROM tasks t
  WHERE ((t.id = task_workers.task_id) AND (t.company_id = ( SELECT my_company_rw() AS my_company))))) AND (EXISTS ( SELECT 1
   FROM workers w
  WHERE ((w.id = task_workers.worker_id) AND (w.company_id = ( SELECT my_company_rw() AS my_company)))))));
drop policy if exists co_all on public.workers;
drop policy if exists co_read on public.workers;
drop policy if exists co_write on public.workers;
create policy co_read on public.workers as permissive for select to authenticated using ((company_id = ( SELECT my_company() AS my_company)));
create policy co_write on public.workers as permissive for all to authenticated using ((company_id = ( SELECT my_company_rw() AS my_company))) with check ((company_id = ( SELECT my_company_rw() AS my_company)));
drop policy if exists co_all on public.routes;
drop policy if exists co_read on public.routes;
drop policy if exists co_write on public.routes;
create policy co_read on public.routes as permissive for select to authenticated using ((company_id = ( SELECT my_company() AS my_company)));
create policy co_write on public.routes as permissive for all to authenticated using ((company_id = ( SELECT my_company_rw() AS my_company))) with check ((company_id = ( SELECT my_company_rw() AS my_company)));
drop policy if exists co_all on public.route_points;
drop policy if exists co_read on public.route_points;
drop policy if exists co_write on public.route_points;
create policy co_read on public.route_points as permissive for select to authenticated using ((EXISTS ( SELECT 1
   FROM routes r
  WHERE ((r.id = route_points.route_id) AND (r.company_id = ( SELECT my_company() AS my_company))))));
create policy co_write on public.route_points as permissive for all to authenticated using ((EXISTS ( SELECT 1
   FROM routes r
  WHERE ((r.id = route_points.route_id) AND (r.company_id = ( SELECT my_company_rw() AS my_company)))))) with check ((EXISTS ( SELECT 1
   FROM routes r
  WHERE ((r.id = route_points.route_id) AND (r.company_id = ( SELECT my_company_rw() AS my_company))))));
drop policy if exists co_all on public.notifications;
drop policy if exists co_read on public.notifications;
drop policy if exists co_write on public.notifications;
create policy co_read on public.notifications as permissive for select to authenticated using ((EXISTS ( SELECT 1
   FROM workers w
  WHERE ((w.id = notifications.worker_id) AND (w.company_id = ( SELECT my_company() AS my_company))))));
create policy co_write on public.notifications as permissive for all to authenticated using ((EXISTS ( SELECT 1
   FROM workers w
  WHERE ((w.id = notifications.worker_id) AND (w.company_id = ( SELECT my_company_rw() AS my_company)))))) with check ((EXISTS ( SELECT 1
   FROM workers w
  WHERE ((w.id = notifications.worker_id) AND (w.company_id = ( SELECT my_company_rw() AS my_company))))));
drop policy if exists co_all on public.admin_phone_invites;
drop policy if exists co_read on public.admin_phone_invites;
drop policy if exists co_write on public.admin_phone_invites;
create policy co_read on public.admin_phone_invites as permissive for select to authenticated using ((company_id = ( SELECT my_company() AS my_company)));
create policy co_write on public.admin_phone_invites as permissive for all to authenticated using ((company_id = ( SELECT my_company_rw() AS my_company))) with check ((company_id = ( SELECT my_company_rw() AS my_company)));
drop policy if exists co_admins_delete on public.admins;
create policy co_admins_delete on public.admins as permissive for delete to authenticated using (((company_id = ( SELECT my_company_rw() AS my_company)) AND (user_id <> auth.uid())));

-- 4. write functions: full admins only (same body, my_company() -> my_company_rw())
CREATE OR REPLACE FUNCTION public.accept_avv(p_version text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_co uuid := public.my_company_rw(); c companies;
begin
  if v_co is null then raise exception 'not_admin'; end if;
  if p_version is distinct from public.avv_current() then raise exception 'avv_outdated'; end if;
  update companies set avv_version = p_version, avv_accepted_at = now(), avv_accepted_by = auth.uid() where id = v_co returning * into c;
  return public.company_json(c, true);
end $function$
;

CREATE OR REPLACE FUNCTION public.merge_plans(p_keep uuid, p_other uuid, p_days_left integer DEFAULT NULL::integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- one worker on two routes of an order: the second route is appended to the first (a jump between them),
-- its days follow, its sessions and progress move along; the second route disappears
declare a task_plans; b task_plans; n int; v_path jsonb; v_days jsonb; v_steps jsonb;
begin
  select * into a from task_plans where id = p_keep; select * into b from task_plans where id = p_other;
  if a.id is null or b.id is null or a.id = b.id or a.task_id <> b.task_id then raise exception 'bad_plans'; end if;
  if not exists(select 1 from tasks t where t.id = a.task_id and t.company_id = public.my_company_rw()) and not is_master() then raise exception 'not_allowed'; end if;
  n := jsonb_array_length(a.path);
  v_path := a.path || jsonb_build_array(jsonb_build_array(b.path->0->0, b.path->0->1, 1)) || (select coalesce(jsonb_agg(e order by i), '[]') from jsonb_array_elements(b.path) with ordinality x(e, i) where i > 1);
  v_days := coalesce(nullif(a.days, 'null'), jsonb_build_array(jsonb_build_object('i0', 0, 'i1', n - 1, 'minutes', a.minutes, 'length_m', a.length_m, 'street_m', a.street_m, 'mailboxes', a.mailboxes)))
    || (select coalesce(jsonb_agg(d || jsonb_build_object('i0', (d->>'i0')::int + n, 'i1', (d->>'i1')::int + n) order by i), '[]')
        from jsonb_array_elements(coalesce(nullif(b.days, 'null'), jsonb_build_array(jsonb_build_object('i0', 0, 'i1', jsonb_array_length(b.path) - 1, 'minutes', b.minutes, 'length_m', b.length_m, 'street_m', b.street_m, 'mailboxes', b.mailboxes)))) with ordinality x(d, i));
  v_steps := coalesce(a.steps, '[]') || (select coalesce(jsonb_agg(jsonb_set(s, '{0}', to_jsonb((s->>0)::int + n)) order by i), '[]') from jsonb_array_elements(coalesce(b.steps, '[]')) with ordinality x(s, i));
  update task_plans set path = v_path, days = v_days, steps = v_steps,
    boxes = coalesce(a.boxes, '[]') || coalesce(b.boxes, '[]'), skipped = coalesce(a.skipped, '[]') || coalesce(b.skipped, '[]'),
    length_m = coalesce(a.length_m, 0) + coalesce(b.length_m, 0), street_m = coalesce(a.street_m, 0) + coalesce(b.street_m, 0),
    mailboxes = coalesce(a.mailboxes, 0) + coalesce(b.mailboxes, 0), minutes = coalesce(a.minutes, 0) + coalesce(b.minutes, 0),
    status = 'offered', work_dates = '[]', accepted_at = null, days_left = p_days_left
    where id = a.id;
  update routes set plan_id = a.id where plan_id = b.id;
  delete from task_plans where id = b.id;
  return a.id;
end $function$
;

CREATE OR REPLACE FUNCTION public.new_join_code()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_co uuid := public.my_company_rw(); v text;
begin
  if v_co is null then raise exception 'not_admin'; end if;
  v := public.gen_join_code();
  update companies set join_code = v where id = v_co;
  return v;
end $function$
;

CREATE OR REPLACE FUNCTION public.set_bot(p_enabled boolean, p_rules text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare co uuid := public.my_company_rw();
begin
  if co is null then raise exception 'not_admin'; end if;
  update companies set bot_enabled = coalesce(p_enabled, false), bot_rules = nullif(left(trim(coalesce(p_rules, '')), 4000), '') where id = co;
end $function$
;

CREATE OR REPLACE FUNCTION public.set_verified(p_worker uuid, p_v boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if public.my_company_rw() is null then raise exception 'not_admin'; end if;
  update workers set verified = p_v where id = p_worker and company_id = public.my_company_rw();
end $function$
;

CREATE OR REPLACE FUNCTION public.together_undo(p_route uuid, p_undo boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not exists(select 1 from routes r join workers w on w.id = r.worker_id where r.id = p_route and w.company_id = public.my_company_rw()) then raise exception 'not_admin'; end if;
  update route_together set undone = p_undo where route_id = p_route;
  update routes set together_s = coalesce((select sum(seconds) from route_together where route_id = p_route and not undone), 0) where id = p_route;
end $function$
;

CREATE OR REPLACE FUNCTION public.update_company(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_co uuid := public.my_company_rw(); c companies;
begin
  if v_co is null then raise exception 'not_admin'; end if;
  perform public.check_company_input(p);
  update companies set name = trim(p->>'name'), street = trim(p->>'street'), zip = trim(p->>'zip'), city = trim(p->>'city'),
    representative = trim(p->>'representative'), email = trim(p->>'email'), phone = nullif(trim(coalesce(p->>'phone','')),''),
    dpo = nullif(trim(coalesce(p->>'dpo','')),''), works_council = (p->>'works_council')::boolean
  where id = v_co returning * into c;
  if coalesce(p->>'avv_version','') = public.avv_current() and c.avv_version is distinct from public.avv_current() then
    update companies set avv_version = public.avv_current(), avv_accepted_at = now(), avv_accepted_by = auth.uid() where id = v_co returning * into c;
  end if;
  return public.company_json(c, true);
end $function$
;

CREATE OR REPLACE FUNCTION public.update_contract(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_co uuid := public.my_company_rw(); v_txt text := nullif(trim(coalesce(p->>'text', '')), ''); c companies;
begin
  if v_co is null then raise exception 'not_admin'; end if;
  if length(coalesce(v_txt, '')) > 40000 then raise exception 'text_too_long'; end if;
  select * into c from companies where id = v_co;
  update companies set cancel_hours = greatest(0, least(336, coalesce((p->>'cancel_hours')::int, cancel_hours))),
    penalty_eur = greatest(0, least(500, coalesce((p->>'penalty_eur')::numeric, penalty_eur))),
    contract_text = v_txt,
    contract_version = case when v_txt is distinct from c.contract_text or (p->>'cancel_hours')::int is distinct from c.cancel_hours or (p->>'penalty_eur')::numeric is distinct from c.penalty_eur
        then 'RV-' || to_char(now() at time zone 'Europe/Berlin', 'YYYY-MM-DD-HH24MI') else c.contract_version end
  where id = v_co;
  return company_contract();
end $function$
;

CREATE OR REPLACE FUNCTION public.waive_cancellation(p_id uuid, p_waived boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if public.my_company_rw() is null then raise exception 'not_admin'; end if;
  update plan_cancellations set waived = p_waived where id = p_id and company_id = public.my_company_rw();
end $function$
;

-- 5. registration through a firm code or a personal code: the referrer is recorded for new distributors
CREATE OR REPLACE FUNCTION public.join_by_link(p_code text, p_name text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- invitation link of a company (…/app/?neu=CODE): creates the worker account right away, without SMS; the worker sets the phone in the profile
declare co uuid; ref uuid; nm text := left(btrim(coalesce(p_name, '')), 80); tok uuid;
begin
  select j.company_id, j.referrer into co, ref from public._join_target(p_code) j;
  if co is null then raise exception 'bad_code'; end if;
  if length(nm) < 2 then raise exception 'name_required'; end if;
  if (select count(*) from workers where company_id = co and created_at > now() - interval '1 day' and phone like '+490000003%') >= 30 then raise exception 'too_many'; end if;   -- a link that went round the internet cannot fill the firm
  insert into workers(name, phone, company_id, cities, zone_minutes, referred_by, referred_at)
    values (nm, '+490000003' || lpad((floor(random() * 1e9))::bigint::text, 9, '0'), co, '[]', 60, ref, case when ref is not null then now() end) returning token into tok;
  return tok;
end $function$
;

CREATE OR REPLACE FUNCTION public.join_by_link2(p_code text, p_name text, p_phone text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare co uuid; ref uuid; nm text := left(btrim(coalesce(p_name, '')), 80); v text := public.norm_phone(p_phone); tok uuid;
begin
  select j.company_id, j.referrer into co, ref from public._join_target(p_code) j;
  if co is null then raise exception 'bad_code'; end if;
  if length(nm) < 2 then raise exception 'name_required'; end if;
  if v is null or v !~ '^\+491[5-7][0-9]{8,9}$' then raise exception 'phone_invalid'; end if;
  if exists(select 1 from workers where phone = v) then raise exception 'phone_taken'; end if;
  if (select count(*) from workers where company_id = co and created_at > now() - interval '1 day') >= 30 then raise exception 'too_many'; end if;
  insert into workers(name, phone, company_id, cities, zone_minutes, referred_by, referred_at) values (nm, v, co, '[]', 60, ref, case when ref is not null then now() end) returning token into tok;
  return tok;
end $function$
;

CREATE OR REPLACE FUNCTION public.register_worker_v3(p_name text, p_cities jsonb, p_code text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_phone text; v_tok uuid; v_co uuid; v_ref uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select public.norm_phone(phone) into v_phone from auth.users where id = auth.uid();
  if v_phone is null or length(v_phone) < 8 then raise exception 'phone_required'; end if;
  if length(trim(coalesce(p_name,''))) < 2 then raise exception 'name_required'; end if;
  if jsonb_typeof(p_cities) <> 'array' or jsonb_array_length(p_cities) = 0 then raise exception 'city_required'; end if;
  select j.company_id, j.referrer into v_co, v_ref from public._join_target(p_code) j;
  if v_co is null then v_co := public.my_company(); end if;          -- an admin's own distributor profile joins his company
  if v_co is null then raise exception 'code_invalid'; end if;
  if exists(select 1 from workers where phone = v_phone and company_id <> v_co) then raise exception 'phone_other_company'; end if;
  insert into workers(name, phone, cities, company_id, referred_by, referred_at) values (trim(p_name), v_phone, p_cities, v_co, v_ref, case when v_ref is not null then now() end)
  on conflict (phone) do update set name = excluded.name, cities = excluded.cities, token = gen_random_uuid()
  returning token into v_tok;
  return v_tok;
end $function$
;

CREATE OR REPLACE FUNCTION public.wa_register(p_nonce uuid, p_name text, p_cities jsonb, p_code text, p_offers boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v wa_verify; v_co uuid; v_ref uuid; tok uuid;
begin
  select * into v from wa_verify where nonce = p_nonce and created_at > now() - interval '30 minutes' and verified_at is not null and used_at is null and worker_id is null;
  if not found then raise exception 'wa_expired'; end if;
  if length(trim(coalesce(p_name, ''))) < 2 then raise exception 'name_required'; end if;
  if jsonb_typeof(p_cities) <> 'array' or jsonb_array_length(p_cities) = 0 then raise exception 'city_required'; end if;
  select j.company_id, j.referrer into v_co, v_ref from public._join_target(p_code) j;
  if v_co is null then raise exception 'code_invalid'; end if;
  if exists(select 1 from workers where phone = v.phone) then raise exception 'phone_taken'; end if;
  insert into workers(name, phone, cities, company_id, offers_ok, offers_consent_at, referred_by, referred_at)
    values (trim(p_name), v.phone, p_cities, v_co, coalesce(p_offers, false), case when coalesce(p_offers, false) then now() end, v_ref, case when v_ref is not null then now() end) returning token into tok;
  update wa_verify set used_at = now() where nonce = p_nonce;
  return tok;
end $function$
;

-- 6. invitation keeps role and name; the panel learns the role and the personal code
CREATE OR REPLACE FUNCTION public.become_admin()
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_phone text; v_co uuid; v_role text; v_name text;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if exists(select 1 from admins where user_id = auth.uid()) then return true; end if;
  select public.norm_phone(phone) into v_phone from auth.users where id = auth.uid();
  if v_phone is not null and length(v_phone) >= 8 then
    select company_id, role, display_name into v_co, v_role, v_name from admin_phone_invites where phone = v_phone;
    if v_co is not null then
      insert into admins(user_id, phone, company_id, role, display_name) values (auth.uid(), v_phone, v_co, coalesce(v_role, 'admin'), v_name) on conflict do nothing;
      delete from admin_phone_invites where phone = v_phone;
      return true;
    end if;
  end if;
  return public.is_master();
end $function$
;

CREATE OR REPLACE FUNCTION public.my_company_info()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare c companies; v_master boolean := exists(select 1 from platform_admins where user_id = auth.uid());
begin
  select * into c from companies where id = public.my_company();
  if c.id is null then
    if v_master then return jsonb_build_object('master', true); end if;
    raise exception 'not_admin';
  end if;
  return public.company_json(c, true) || jsonb_build_object('master', v_master, 'role', coalesce(public.my_role(), 'admin'),
    'ref_code', (select ref_code from admins where user_id = auth.uid()), 'display_name', (select display_name from admins where user_id = auth.uid()));
end $function$
;

commit;
