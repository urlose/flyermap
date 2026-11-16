#!/usr/bin/env bash
# Test of supabase/2026-11-16_security2_grants.sql on a throw-away local Postgres with SYNTHETIC data (no production).
# Rebuilds what the grants depend on: Supabase roles (anon / authenticated / service_role / authenticator), auth.uid(),
# RLS on tasks / task_plans, the 4 real trigger functions + triggers, real set_verified / waive_cancellation /
# studios_synced_at / merge_tasks / my_company / _log_cancel, the 10 service tables with their real columns.
# company_contract / company_stats / company_tracks / update_contract / worker_stats are stand-ins with the same
# signature and the same first check (my_company() is null -> not_admin); their bodies are not part of this change.
# Worker token functions are stand-ins following the real pattern (SECURITY DEFINER, _worker(token)).
# Grants are set up exactly as read from production (functions: PUBLIC + anon + authenticated + service_role;
# tables: ALL for anon / authenticated / service_role; sequences: ALL).   Run as root: bash test/sql/security2_grants.sh
set -euo pipefail
BIN=${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin | sort -V | tail -1)}
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
DIR=$(mktemp -d); chown postgres "$DIR"; PORT=55433
run(){ su postgres -s /bin/bash -c "$*"; }
cleanup(){ run "$BIN/pg_ctl -D $DIR/data -m immediate stop" >/dev/null 2>&1 || true; rm -rf "$DIR"; }
trap cleanup EXIT
run "$BIN/initdb -D $DIR/data -U postgres -A trust" >/dev/null
run "$BIN/pg_ctl -D $DIR/data -o '-p $PORT -k $DIR' -l $DIR/log start" >/dev/null; sleep 1
Q(){ local user=$1; shift; "$BIN/psql" -h "$DIR" -p $PORT -U "$user" -d postgres -v ON_ERROR_STOP=1 -qAtX "$@"; }
FAIL=0; N=0; ok(){ N=$((N+1)); if [ "$2" = "1" ]; then echo "ok   $1"; else echo "FAIL $1"; FAIL=$((FAIL+1)); fi; }

CO=c0000000-0000-4000-8000-000000000001; CO2=c0000000-0000-4000-8000-000000000002
ADMIN=a0000000-0000-4000-8000-000000000001; MASTER=a0000000-0000-4000-8000-000000000002; STRANGER=a0000000-0000-4000-8000-000000000003
W=e0000000-0000-4000-8000-000000000001; TOK=f0000000-0000-4000-8000-000000000001
T1=10000000-0000-4000-8000-000000000001; T2=10000000-0000-4000-8000-000000000002; P1=20000000-0000-4000-8000-000000000001; P2=20000000-0000-4000-8000-000000000002

Q postgres <<SQL
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create role authenticator login noinherit; grant anon, authenticated, service_role to authenticator;
create schema auth; grant usage on schema auth to anon, authenticated, service_role;
create function auth.uid() returns uuid language sql stable as \$f\$
  select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid \$f\$;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;

create table companies(id uuid primary key, cancel_hours int, penalty_eur numeric);
create table admins(user_id uuid primary key, company_id uuid);
create table platform_admins(user_id uuid primary key);
create table workers(id uuid primary key, token uuid, company_id uuid, verified boolean);
create table tasks(id uuid primary key, company_id uuid, flyers int, deadline date, zone_polygon jsonb, side_towns jsonb, must_areas jsonb, work_days jsonb, merged_into uuid, status text, work_date date);
create table task_plans(id uuid primary key, task_id uuid, idx int, worker_id uuid, work_dates jsonb, late_dates boolean default false, late_ok boolean default false);
create table routes(id uuid primary key, task_id uuid, ended_at timestamptz);
create table task_workers(task_id uuid, worker_id uuid, primary key(task_id, worker_id));
create table notifications(id uuid primary key default gen_random_uuid(), task_id uuid);
create table studios(id uuid primary key default gen_random_uuid(), company_id uuid not null, updated_at timestamptz not null default now());
-- the 10 service tables (real columns)
create table _plan_runs(id bigserial primary key, created_at timestamptz default now(), status text, result jsonb);
create table admin_manual_log(id bigserial primary key, at timestamptz default now(), what text);
create table plan_cancellations(id uuid primary key default gen_random_uuid(), company_id uuid, plan_id uuid, task_id uuid, worker_id uuid, at timestamptz not null default now(), first_date date, hours_before numeric, late boolean not null default false, reason text, penalty_eur numeric(8,2) not null default 0, waived boolean not null default false);
create table plan_path_backup(id uuid, at_ timestamptz, path jsonb, steps jsonb, days jsonb, length_m int, minutes int);
create table skipped_backup(plan_id uuid, skipped jsonb, saved_at timestamptz default now(), note text);
create table task_merges(id bigserial primary key, target uuid, source uuid, at timestamptz default now(), by_user uuid, plan_ids uuid[], route_ids uuid[], worker_ids uuid[], source_row jsonb, target_flyers_before int);
create table task_plans_trash(id bigserial primary key, task_id uuid, plan_id uuid, row jsonb, deleted_at timestamptz default now());
create table tasks_history(id bigserial primary key, task_id uuid, row jsonb, saved_at timestamptz default now());
create table wa_settings(id int primary key default 1, number text);
create table wa_verify(nonce uuid primary key default gen_random_uuid(), code text not null, worker_id uuid, phone text, verified_at timestamptz, used_at timestamptz, created_at timestamptz not null default now());

do \$\$ declare t text; begin foreach t in array array['companies','admins','platform_admins','workers','tasks','task_plans','routes','task_workers','notifications','studios','_plan_runs','admin_manual_log','plan_cancellations','plan_path_backup','skipped_backup','task_merges','task_plans_trash','tasks_history','wa_settings','wa_verify'] loop
  execute format('alter table public.%I enable row level security', t); end loop; end \$\$;
grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;

-- real functions
create function public.my_company() returns uuid language sql stable security definer set search_path to 'public' as \$f\$ select company_id from public.admins where user_id = auth.uid() \$f\$;
create policy co_all on tasks for all to authenticated using (company_id = (select my_company())) with check (company_id = (select my_company()));
create policy co_all on task_plans for all to authenticated using (exists(select 1 from tasks t where t.id = task_plans.task_id and t.company_id = (select my_company()))) with check (exists(select 1 from tasks t where t.id = task_plans.task_id and t.company_id = (select my_company())));
create function public._keep_plan() returns trigger language plpgsql security definer set search_path to 'public' as \$f\$
begin insert into task_plans_trash(task_id, plan_id, row) values (old.task_id, old.id, to_jsonb(old)); return old; end \$f\$;
create function public._keep_task() returns trigger language plpgsql security definer set search_path to 'public' as \$f\$
begin
  if old.zone_polygon is distinct from new.zone_polygon or old.flyers is distinct from new.flyers or old.side_towns is distinct from new.side_towns or old.must_areas is distinct from new.must_areas or old.work_days is distinct from new.work_days then
    insert into tasks_history(task_id, row) values (old.id, to_jsonb(old));
  end if; return new; end \$f\$;
create function public._plan_late() returns trigger language plpgsql security definer set search_path to 'public' as \$f\$
declare dl date;
begin
  if tg_op = 'UPDATE' and new.work_dates is not distinct from old.work_dates and new.task_id = old.task_id then return new; end if;
  select deadline into dl from tasks where id = new.task_id;
  new.late_dates := dl is not null and exists (select 1 from jsonb_array_elements_text(coalesce(new.work_dates, '[]'::jsonb)) d where d::date > dl);
  if not new.late_dates or tg_op = 'INSERT' then new.late_ok := false; elsif new.work_dates is distinct from old.work_dates then new.late_ok := false; end if;
  return new;
end \$f\$;
create function public._task_deadline_late() returns trigger language plpgsql security definer set search_path to 'public' as \$f\$
begin
  update task_plans p set late_dates = new.deadline is not null and exists (select 1 from jsonb_array_elements_text(coalesce(p.work_dates, '[]'::jsonb)) d where d::date > new.deadline)
   where p.task_id = new.id;
  return new;
end \$f\$;
create trigger keep_plan before delete on public.task_plans for each row execute function _keep_plan();
create trigger keep_task before update on public.tasks for each row execute function _keep_task();
create trigger plan_late before insert or update on public.task_plans for each row execute function _plan_late();
create trigger task_deadline_late after update of deadline on public.tasks for each row when (new.deadline is distinct from old.deadline) execute function _task_deadline_late();
create function public.set_verified(p_worker uuid, p_v boolean) returns void language plpgsql security definer set search_path to 'public' as \$f\$
begin if public.my_company() is null then raise exception 'not_admin'; end if;
  update workers set verified = p_v where id = p_worker and company_id = public.my_company(); end \$f\$;
create function public.waive_cancellation(p_id uuid, p_waived boolean) returns void language plpgsql security definer set search_path to 'public' as \$f\$
begin if public.my_company() is null then raise exception 'not_admin'; end if;
  update plan_cancellations set waived = p_waived where id = p_id and company_id = public.my_company(); end \$f\$;
create function public.studios_synced_at() returns timestamptz language sql stable security definer set search_path to 'public' as \$f\$
  select max(updated_at) from public.studios where company_id = public.my_company() \$f\$;
create function public.merge_tasks(p_target uuid, p_sources uuid[]) returns jsonb language plpgsql security definer set search_path to 'public' as \$f\$
declare tg tasks; s tasks; base int; n int := 0; fl int := 0;
begin
  if not exists(select 1 from platform_admins where user_id = auth.uid()) then raise exception 'not_allowed'; end if;
  select * into tg from tasks where id = p_target for update;
  if tg.id is null or tg.merged_into is not null then raise exception 'target_not_found'; end if;
  if exists(select 1 from routes where task_id = any(p_sources) and ended_at is null) then raise exception 'someone_walking'; end if;
  for s in select * from tasks where id = any(p_sources) and id <> p_target and merged_into is null for update loop
    if s.company_id is distinct from tg.company_id then raise exception 'other_company'; end if;
    select coalesce(max(idx), -1) + 1 into base from task_plans where task_id = p_target;
    insert into task_merges(target, source, by_user, plan_ids, route_ids, worker_ids, source_row, target_flyers_before)
      values (p_target, s.id, auth.uid(), array(select id from task_plans where task_id = s.id), array(select id from routes where task_id = s.id),
              array(select worker_id from task_workers where task_id = s.id), to_jsonb(s), (select flyers from tasks where id = p_target));
    update task_plans set task_id = p_target, idx = base + idx where task_id = s.id;
    update routes set task_id = p_target where task_id = s.id;
    insert into task_workers(task_id, worker_id) select p_target, worker_id from task_workers where task_id = s.id on conflict do nothing;
    delete from task_workers where task_id = s.id;
    update notifications set task_id = p_target where task_id = s.id;
    update plan_cancellations set task_id = p_target where task_id = s.id;
    update tasks set merged_into = p_target where id = s.id;
    fl := fl + coalesce(s.flyers, 0); n := n + 1;
    if s.status = 'open' then update tasks set status = 'open' where id = p_target; end if;
    if s.work_date is not null then update tasks set work_date = least(coalesce(work_date, s.work_date), s.work_date) where id = p_target; end if;
  end loop;
  update tasks set flyers = coalesce(flyers, 0) + fl where id = p_target;
  return jsonb_build_object('merged', n, 'flyers_added', fl);
end \$f\$;
-- stand-ins (same signature, same first check)
create function public.company_contract() returns jsonb language plpgsql security definer set search_path to 'public' as \$f\$
begin if public.my_company() is null then raise exception 'not_admin'; end if; return jsonb_build_object('cancellations', (select count(*) from plan_cancellations where company_id = public.my_company())); end \$f\$;
create function public.update_contract(p jsonb) returns jsonb language plpgsql security definer set search_path to 'public' as \$f\$
begin if public.my_company() is null then raise exception 'not_admin'; end if; update companies set cancel_hours = coalesce((p->>'cancel_hours')::int, cancel_hours) where id = public.my_company(); return public.company_contract(); end \$f\$;
create function public.company_stats() returns jsonb language plpgsql security definer set search_path to 'public' as \$f\$
begin if public.my_company() is null then raise exception 'not_admin'; end if; return jsonb_build_object('tasks', (select count(*) from tasks where company_id = public.my_company())); end \$f\$;
create function public.company_tracks(p_tasks uuid[]) returns jsonb language plpgsql security definer set search_path to 'public' as \$f\$
begin if public.my_company() is null then raise exception 'not_admin'; end if; return '{}'::jsonb; end \$f\$;
create function public.worker_stats() returns jsonb language plpgsql security definer set search_path to 'public' as \$f\$
begin if public.my_company() is null then raise exception 'not_admin'; end if; return jsonb_build_object('cancels', (select count(*) from plan_cancellations where company_id = public.my_company())); end \$f\$;
-- real _log_cancel (no anon grant in production either)
create function public._log_cancel(w workers, p task_plans, p_reason text) returns jsonb language plpgsql security definer set search_path to 'public' as \$f\$
declare c companies; d0 date; h numeric; late boolean; pen numeric := 0;
begin
  select * into c from companies where id = w.company_id;
  select min((d)::date) into d0 from jsonb_array_elements_text(coalesce(p.work_dates, '[]'::jsonb)) d;
  h := case when d0 is null then null else round(extract(epoch from ((d0 + time '08:00') at time zone 'Europe/Berlin') - now()) / 3600.0, 1) end;
  late := h is not null and h < coalesce(c.cancel_hours, 48);
  if late then pen := coalesce(c.penalty_eur, 0); end if;
  insert into plan_cancellations(company_id, plan_id, task_id, worker_id, first_date, hours_before, late, reason, penalty_eur)
  values (w.company_id, p.id, p.task_id, w.id, d0, h, late, nullif(left(trim(coalesce(p_reason, '')), 500), ''), pen);
  return jsonb_build_object('late', late, 'hours_before', h, 'penalty_eur', pen);
end \$f\$;
-- worker token functions (stand-ins following the real pattern, NOT touched by the migration)
create function public._worker(p_token uuid) returns workers language plpgsql security definer set search_path to 'public' as \$f\$
declare w workers; begin select * into w from workers where token = p_token; if not found then raise exception 'invalid_token'; end if; return w; end \$f\$;
create function public.respond_plan(p_token uuid, p_plan_id uuid, p_dates jsonb) returns void language plpgsql security definer set search_path to 'public' as \$f\$
declare w workers; begin w := _worker(p_token); update task_plans set work_dates = p_dates where id = p_plan_id and worker_id = w.id; end \$f\$;
create function public.cancel_plan(p_token uuid, p_plan_id uuid, p_reason text) returns jsonb language plpgsql security definer set search_path to 'public' as \$f\$
declare w workers; p task_plans; r jsonb; begin w := _worker(p_token); select * into p from task_plans where id = p_plan_id and worker_id = w.id; if p.id is null then raise exception 'plan_not_found'; end if;
  r := _log_cancel(w, p, p_reason); update task_plans set worker_id = null where id = p.id; return r; end \$f\$;
-- grants as in production
do \$\$ declare f regprocedure; begin for f in select p.oid::regprocedure from pg_proc p where p.pronamespace = 'public'::regnamespace loop
  execute format('grant execute on function %s to anon, authenticated, service_role', f); end loop; end \$\$;
revoke execute on function public._worker(uuid), public._log_cancel(workers, task_plans, text) from public, anon, authenticated;

-- synthetic data
insert into companies values ('$CO', 48, 25), ('$CO2', 48, 25);
insert into admins values ('$ADMIN', '$CO'), ('$MASTER', '$CO');
insert into platform_admins values ('$MASTER');
insert into workers values ('$W', '$TOK', '$CO', null);
insert into tasks values ('$T1', '$CO', 1000, '2030-01-10', null, null, null, null, null, 'open', null), ('$T2', '$CO', 500, null, null, null, null, null, null, 'open', null);
insert into task_plans(id, task_id, idx, worker_id, work_dates) values ('$P1', '$T1', 0, '$W', '["2030-01-05"]'), ('$P2', '$T2', 0, '$W', '["2030-01-06"]');
insert into plan_cancellations(company_id, plan_id, task_id, worker_id) values ('$CO', '$P1', '$T1', '$W');
insert into studios(company_id) values ('$CO');
SQL

# call as an API role: session authenticator, role + JWT like PostgREST
api(){ local role=$1 sub=$2 sql=$3; local claims='{}'; [ -n "$sub" ] && claims="{\"sub\":\"$sub\",\"role\":\"$role\"}"
  Q authenticator -c "set role $role; select set_config('request.jwt.claims', '$claims', false);" -c "$sql" >$DIR/out 2>$DIR/err && { echo OK; return; }
  sed -n 's/.*ERROR: *//p' $DIR/err | head -1; }
denied(){ case "$1" in "permission denied"*) echo 1;; esac; }
ADMINFN=("company_contract()" "company_stats()" "company_tracks(array[]::uuid[])" "merge_tasks('$T1', array[]::uuid[])" "set_verified('$W', true)" "studios_synced_at()" "update_contract('{}')" "waive_cancellation(gen_random_uuid(), true)" "worker_stats()")
TABLES=(_plan_runs admin_manual_log plan_cancellations plan_path_backup skipped_backup task_merges task_plans_trash tasks_history wa_settings wa_verify)
SEQS=(_plan_runs_id_seq admin_manual_log_id_seq task_merges_id_seq task_plans_trash_id_seq tasks_history_id_seq)
SNAP="select string_agg(o || '=' || coalesce((select string_agg(a::text, ',' order by a::text) from unnest(acl) a), '-'), ' ' order by o) from (
  select p.oid::regprocedure::text o, p.proacl acl from pg_proc p where p.pronamespace = 'public'::regnamespace
  union all select c.relname, c.relacl from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','S')) x"

echo "== state as in production"
BEFORE=$(Q postgres -c "$SNAP")
r=$(api anon "" "select public.company_stats()"); ok "before: anon reaches company_stats (stopped only inside: $r)" "$( [ "$r" = not_admin ] && echo 1 )"
# before: anon HAS the SQL privilege SELECT on task_merges, but RLS (enabled, no policies) returns no rows -> no data leak,
# only a missing second layer. A synthetic row is put in first so "0" means "hidden", not "empty".
Q postgres -c "insert into task_merges(target, source) values ('$T1', '$T2')" >/dev/null
ok "before: anon has SELECT privilege on task_merges (catalog)" "$( [ "$(Q postgres -c "select has_table_privilege('anon','public.task_merges','select')")" = t ] && echo 1 )"
r=$(api anon "" "select count(*) from public.task_merges"); n=$(tail -1 $DIR/out)
ok "before: anon query is allowed but RLS returns 0 of 1 rows (no data visible) -> $r, rows $n" "$( [ "$r" = OK ] && [ "$n" = 0 ] && echo 1 )"
r=$(api authenticated "$ADMIN" "select count(*) from public.task_merges"); n=$(tail -1 $DIR/out)
ok "before: signed-in admin also gets 0 rows (no policy) -> rows $n" "$( [ "$r" = OK ] && [ "$n" = 0 ] && echo 1 )"
Q postgres -c "delete from task_merges" >/dev/null

echo "== apply migration"
Q postgres -f "$ROOT/supabase/2026-11-16_security2_grants.sql"

echo "-- 1. admin functions"
for f in "${ADMINFN[@]}"; do r=$(api anon "" "select public.$f"); ok "anon: ${f%%(*} -> $r" "$(denied "$r")"; done
r=$(api authenticated "$STRANGER" "select public.company_stats()"); ok "signed in, not an admin: company_stats -> $r (as before)" "$( [ "$r" = not_admin ] && echo 1 )"
for f in "company_contract()" "company_stats()" "company_tracks(array[]::uuid[])" "set_verified('$W', true)" "studios_synced_at()" "update_contract('{\"cancel_hours\":24}')" "worker_stats()"; do
  r=$(api authenticated "$ADMIN" "select public.$f"); ok "admin: ${f%%(*} works" "$( [ "$r" = OK ] && echo 1 )"; done
PC=$(Q postgres -c "select id from plan_cancellations limit 1")
r=$(api authenticated "$ADMIN" "select public.waive_cancellation('$PC', true)"); ok "admin: waive_cancellation works (writes plan_cancellations through SECURITY DEFINER)" "$( [ "$r" = OK ] && [ "$(Q postgres -c "select waived from plan_cancellations where id='$PC'")" = t ] && echo 1 )"
r=$(api authenticated "$ADMIN" "select public.merge_tasks('$T1', array['$T2']::uuid[])"); ok "admin (not master): merge_tasks -> $r (as before)" "$( [ "$r" = not_allowed ] && echo 1 )"
r=$(api authenticated "$MASTER" "select public.merge_tasks('$T1', array['$T2']::uuid[])"); ok "master: merge_tasks works and writes task_merges" "$( [ "$r" = OK ] && [ "$(Q postgres -c "select count(*) from task_merges")" = 1 ] && echo 1 )"
r=$(api service_role "" "select public.company_stats()"); ok "service_role keeps EXECUTE on admin functions (reaches the check: $r)" "$( [ "$r" = not_admin ] && echo 1 )"

echo "-- 2. trigger functions (EXECUTE taken from PUBLIC/anon/authenticated)"
H0=$(Q postgres -c "select count(*) from tasks_history where task_id='$T1'")   # merge_tasks above already changed flyers once
r=$(api authenticated "$ADMIN" "update public.tasks set flyers = 1200, deadline = '2030-01-04' where id = '$T1'")
ok "admin updates a task directly (RLS): keep_task wrote history, task_deadline_late marked late days" "$( [ "$r" = OK ] && [ "$(Q postgres -c "select count(*) from tasks_history where task_id='$T1'")" = $((H0+1)) ] && [ "$(Q postgres -c "select late_dates from task_plans where id='$P1'")" = t ] && echo 1 )"
r=$(api authenticated "$ADMIN" "update public.task_plans set work_dates = '[\"2030-01-02\"]' where id = '$P1'")
ok "admin changes days of a route: plan_late recomputed" "$( [ "$r" = OK ] && [ "$(Q postgres -c "select late_dates from task_plans where id='$P1'")" = f ] && echo 1 )"
r=$(api anon "" "select public.respond_plan('$TOK', '$P1', '[\"2030-02-01\"]')")
ok "worker token function (anon) changes days: plan_late fires" "$( [ "$r" = OK ] && [ "$(Q postgres -c "select late_dates from task_plans where id='$P1'")" = t ] && echo 1 )"
r=$(api anon "" "select public.cancel_plan('$TOK', '$P1', 'krank')")
ok "worker token function (anon) cancels: _log_cancel writes plan_cancellations" "$( [ "$r" = OK ] && [ "$(Q postgres -c "select count(*) from plan_cancellations where reason='krank'")" = 1 ] && echo 1 )"
Q postgres -c "update task_plans set task_id = '$T1' where id = '$P2'" >/dev/null
r=$(api authenticated "$ADMIN" "delete from public.task_plans where id = '$P2'")
ok "admin deletes a route directly: keep_plan saved it to task_plans_trash" "$( [ "$r" = OK ] && [ "$(Q postgres -c "select count(*) from task_plans_trash where plan_id='$P2'")" = 1 ] && echo 1 )"
r=$(api authenticated "$ADMIN" "select public._keep_plan()"); ok "trigger function can no longer be called directly (authenticated) -> $r" "$(denied "$r")"
r=$(api anon "" "select public._plan_late()"); ok "trigger function can no longer be called directly (anon) -> $r" "$(denied "$r")"

echo "-- 3. service tables"
for t in "${TABLES[@]}"; do
  r1=$(api anon "" "select count(*) from public.$t"); r2=$(api authenticated "$ADMIN" "select count(*) from public.$t"); r3=$(api authenticated "$ADMIN" "delete from public.$t")
  ok "$t: anon select / admin select / admin delete now fail with 'permission denied' (privilege gone, RLS stays)" "$( [ -n "$(denied "$r1")" ] && [ -n "$(denied "$r2")" ] && [ -n "$(denied "$r3")" ] && [ "$(Q postgres -c "select relrowsecurity from pg_class where oid='public.$t'::regclass")" = t ] && echo 1 )"; done
for s in "${SEQS[@]}"; do r=$(api anon "" "select nextval('public.$s')"); ok "sequence $s: anon nextval denied" "$(denied "$r")"; done
r=$(api service_role "" "select count(*) from public.task_merges"); ok "service_role still reads service tables (edge functions)" "$( [ "$r" = OK ] && echo 1 )"

echo "-- untouched"
ok "worker token functions keep anon EXECUTE" "$( [ "$(Q postgres -c "select has_function_privilege('anon','public.respond_plan(uuid,uuid,jsonb)','execute') and has_function_privilege('anon','public.cancel_plan(uuid,uuid,text)','execute')")" = t ] && echo 1 )"
ok "tables with policies (tasks, task_plans) keep their grants" "$( [ "$(Q postgres -c "select has_table_privilege('authenticated','public.tasks','update') and has_table_privilege('authenticated','public.task_plans','delete')")" = t ] && echo 1 )"
r=$(api authenticated "$ADMIN" "select count(*) from public.tasks where company_id = '$CO2'"); ok "RLS still separates companies (other firm's tasks invisible)" "$( [ "$r" = OK ] && [ "$(cat $DIR/out | tail -1)" = 0 ] && echo 1 )"
ok "migration is idempotent (second run)" "$(Q postgres -f "$ROOT/supabase/2026-11-16_security2_grants.sql" >/dev/null && echo 1)"

echo "== rollback"
Q postgres -f "$ROOT/supabase/rollback/2026-11-16_security2_grants.down.sql"
ok "rollback restores every ACL exactly as before" "$( [ "$(Q postgres -c "$SNAP")" = "$BEFORE" ] && echo 1 )"
echo; [ $FAIL = 0 ] && echo "all $N ok ($("$BIN/postgres" --version))" || { echo "$FAIL of $N FAILED"; exit 1; }
