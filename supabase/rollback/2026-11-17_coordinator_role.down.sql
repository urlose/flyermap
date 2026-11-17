-- Rollback of 2026-11-17_coordinator_role.sql: original rules and functions (production text of 17.11.2026).
-- After the rollback the role column means nothing any more, so coordinator accounts would become full admins:
-- they are removed (re-invite them if needed). Referral data (workers.referred_by) and the new columns are kept.
begin;
delete from public.admins where role = 'coordinator';
delete from public.admin_phone_invites where role = 'coordinator';
drop policy if exists co_read on public.tasks;
drop policy if exists co_write on public.tasks;
create policy co_all on public.tasks as PERMISSIVE for ALL to authenticated using ((company_id = ( SELECT my_company() AS my_company))) with check ((company_id = ( SELECT my_company() AS my_company)));
drop policy if exists co_read on public.task_plans;
drop policy if exists co_write on public.task_plans;
create policy co_all on public.task_plans as PERMISSIVE for ALL to authenticated using ((EXISTS ( SELECT 1
   FROM tasks t
  WHERE ((t.id = task_plans.task_id) AND (t.company_id = ( SELECT my_company() AS my_company)))))) with check (((EXISTS ( SELECT 1
   FROM tasks t
  WHERE ((t.id = task_plans.task_id) AND (t.company_id = ( SELECT my_company() AS my_company))))) AND ((worker_id IS NULL) OR (EXISTS ( SELECT 1
   FROM workers w
  WHERE ((w.id = task_plans.worker_id) AND (w.company_id = ( SELECT my_company() AS my_company))))))));
drop policy if exists co_read on public.task_workers;
drop policy if exists co_write on public.task_workers;
create policy co_all on public.task_workers as PERMISSIVE for ALL to authenticated using ((EXISTS ( SELECT 1
   FROM tasks t
  WHERE ((t.id = task_workers.task_id) AND (t.company_id = ( SELECT my_company() AS my_company)))))) with check (((EXISTS ( SELECT 1
   FROM tasks t
  WHERE ((t.id = task_workers.task_id) AND (t.company_id = ( SELECT my_company() AS my_company))))) AND (EXISTS ( SELECT 1
   FROM workers w
  WHERE ((w.id = task_workers.worker_id) AND (w.company_id = ( SELECT my_company() AS my_company)))))));
drop policy if exists co_read on public.workers;
drop policy if exists co_write on public.workers;
create policy co_all on public.workers as PERMISSIVE for ALL to authenticated using ((company_id = ( SELECT my_company() AS my_company))) with check ((company_id = ( SELECT my_company() AS my_company)));
drop policy if exists co_read on public.routes;
drop policy if exists co_write on public.routes;
create policy co_all on public.routes as PERMISSIVE for ALL to authenticated using ((company_id = ( SELECT my_company() AS my_company))) with check ((company_id = ( SELECT my_company() AS my_company)));
drop policy if exists co_read on public.route_points;
drop policy if exists co_write on public.route_points;
create policy co_all on public.route_points as PERMISSIVE for ALL to authenticated using ((EXISTS ( SELECT 1
   FROM routes r
  WHERE ((r.id = route_points.route_id) AND (r.company_id = ( SELECT my_company() AS my_company)))))) with check ((EXISTS ( SELECT 1
   FROM routes r
  WHERE ((r.id = route_points.route_id) AND (r.company_id = ( SELECT my_company() AS my_company))))));
drop policy if exists co_read on public.notifications;
drop policy if exists co_write on public.notifications;
create policy co_all on public.notifications as PERMISSIVE for ALL to authenticated using ((EXISTS ( SELECT 1
   FROM workers w
  WHERE ((w.id = notifications.worker_id) AND (w.company_id = ( SELECT my_company() AS my_company)))))) with check ((EXISTS ( SELECT 1
   FROM workers w
  WHERE ((w.id = notifications.worker_id) AND (w.company_id = ( SELECT my_company() AS my_company))))));
drop policy if exists co_read on public.admin_phone_invites;
drop policy if exists co_write on public.admin_phone_invites;
create policy co_all on public.admin_phone_invites as PERMISSIVE for ALL to authenticated using ((company_id = ( SELECT my_company() AS my_company))) with check ((company_id = ( SELECT my_company() AS my_company)));
drop policy if exists co_admins_delete on public.admins;
create policy co_admins_delete on public.admins as PERMISSIVE for DELETE to authenticated using (((company_id = ( SELECT my_company() AS my_company)) AND (user_id <> auth.uid())));
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
    exit when not exists(select 1 from companies where join_code = c);
  end loop;
  return c;
end $function$
;
CREATE OR REPLACE FUNCTION public.accept_avv(p_version text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_co uuid := public.my_company(); c companies;
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
  if not exists(select 1 from tasks t where t.id = a.task_id and t.company_id = my_company()) and not is_master() then raise exception 'not_allowed'; end if;
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
declare v_co uuid := public.my_company(); v text;
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
declare co uuid := public.my_company();
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
  if public.my_company() is null then raise exception 'not_admin'; end if;
  update workers set verified = p_v where id = p_worker and company_id = public.my_company();
end $function$
;
CREATE OR REPLACE FUNCTION public.together_undo(p_route uuid, p_undo boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not exists(select 1 from routes r join workers w on w.id = r.worker_id where r.id = p_route and w.company_id = public.my_company()) then raise exception 'not_admin'; end if;
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
declare v_co uuid := public.my_company(); c companies;
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
declare v_co uuid := public.my_company(); v_txt text := nullif(trim(coalesce(p->>'text', '')), ''); c companies;
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
  if public.my_company() is null then raise exception 'not_admin'; end if;
  update plan_cancellations set waived = p_waived where id = p_id and company_id = public.my_company();
end $function$
;
CREATE OR REPLACE FUNCTION public.join_by_link(p_code text, p_name text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- invitation link of a company (…/app/?neu=CODE): creates the worker account right away, without SMS; the worker sets the phone in the profile
declare co uuid; nm text := left(btrim(coalesce(p_name, '')), 80); tok uuid;
begin
  select id into co from companies where join_code = upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  if co is null then raise exception 'bad_code'; end if;
  if length(nm) < 2 then raise exception 'name_required'; end if;
  if (select count(*) from workers where company_id = co and created_at > now() - interval '1 day' and phone like '+490000003%') >= 30 then raise exception 'too_many'; end if;   -- a link that went round the internet cannot fill the firm
  insert into workers(name, phone, company_id, cities, zone_minutes)
    values (nm, '+490000003' || lpad((floor(random() * 1e9))::bigint::text, 9, '0'), co, '[]', 60) returning token into tok;
  return tok;
end $function$
;
CREATE OR REPLACE FUNCTION public.join_by_link2(p_code text, p_name text, p_phone text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare co uuid; nm text := left(btrim(coalesce(p_name, '')), 80); v text := public.norm_phone(p_phone); tok uuid;
begin
  select id into co from companies where join_code = upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  if co is null then raise exception 'bad_code'; end if;
  if length(nm) < 2 then raise exception 'name_required'; end if;
  if v is null or v !~ '^\+491[5-7][0-9]{8,9}$' then raise exception 'phone_invalid'; end if;
  if exists(select 1 from workers where phone = v) then raise exception 'phone_taken'; end if;
  if (select count(*) from workers where company_id = co and created_at > now() - interval '1 day') >= 30 then raise exception 'too_many'; end if;
  insert into workers(name, phone, company_id, cities, zone_minutes) values (nm, v, co, '[]', 60) returning token into tok;
  return tok;
end $function$
;
CREATE OR REPLACE FUNCTION public.register_worker_v3(p_name text, p_cities jsonb, p_code text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_phone text; v_tok uuid; v_co uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select public.norm_phone(phone) into v_phone from auth.users where id = auth.uid();
  if v_phone is null or length(v_phone) < 8 then raise exception 'phone_required'; end if;
  if length(trim(coalesce(p_name,''))) < 2 then raise exception 'name_required'; end if;
  if jsonb_typeof(p_cities) <> 'array' or jsonb_array_length(p_cities) = 0 then raise exception 'city_required'; end if;
  select id into v_co from companies where join_code = upper(regexp_replace(coalesce(p_code,''), '[^A-Za-z0-9]', '', 'g'));
  if v_co is null then v_co := public.my_company(); end if;          -- an admin's own distributor profile joins his company
  if v_co is null then raise exception 'code_invalid'; end if;
  if exists(select 1 from workers where phone = v_phone and company_id <> v_co) then raise exception 'phone_other_company'; end if;
  insert into workers(name, phone, cities, company_id) values (trim(p_name), v_phone, p_cities, v_co)
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
declare v wa_verify; v_co uuid; tok uuid;
begin
  select * into v from wa_verify where nonce = p_nonce and created_at > now() - interval '30 minutes' and verified_at is not null and used_at is null and worker_id is null;
  if not found then raise exception 'wa_expired'; end if;
  if length(trim(coalesce(p_name, ''))) < 2 then raise exception 'name_required'; end if;
  if jsonb_typeof(p_cities) <> 'array' or jsonb_array_length(p_cities) = 0 then raise exception 'city_required'; end if;
  select id into v_co from companies where join_code = upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  if v_co is null then raise exception 'code_invalid'; end if;
  if exists(select 1 from workers where phone = v.phone) then raise exception 'phone_taken'; end if;
  insert into workers(name, phone, cities, company_id, offers_ok, offers_consent_at)
    values (trim(p_name), v.phone, p_cities, v_co, coalesce(p_offers, false), case when coalesce(p_offers, false) then now() end) returning token into tok;
  update wa_verify set used_at = now() where nonce = p_nonce;
  return tok;
end $function$
;
CREATE OR REPLACE FUNCTION public.become_admin()
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_phone text; v_co uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if exists(select 1 from admins where user_id = auth.uid()) then return true; end if;
  select public.norm_phone(phone) into v_phone from auth.users where id = auth.uid();
  if v_phone is not null and length(v_phone) >= 8 then
    select company_id into v_co from admin_phone_invites where phone = v_phone;
    if v_co is not null then
      insert into admins(user_id, phone, company_id) values (auth.uid(), v_phone, v_co) on conflict do nothing;
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
  return public.company_json(c, true) || jsonb_build_object('master', v_master);
end $function$
;
drop function if exists public.coord_assign_plan(uuid, uuid, integer, text, text);
drop function if exists public.set_admin_role(uuid, text, text);
drop function if exists public.my_ref_code();
drop function if exists public._join_target(text);
drop function if exists public.my_role();
drop function if exists public.my_company_rw();
commit;
