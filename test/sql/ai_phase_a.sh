#!/usr/bin/env bash
# Test of supabase/2026-11-16_ai_phase_a.sql on a throw-away local Postgres with SYNTHETIC data (no production).
# Rebuilds what the help functions need (roles, auth.uid, companies / workers / tasks / task_plans / help_requests /
# notifications with the production columns, my_company / is_master / _worker). _help_bot_ping is a stand-in that only
# logs the call (no network). help_request and help_resolve start as the exact production versions (from the rollback
# file, md5 checked). Run as root: bash test/sql/ai_phase_a.sh
set -euo pipefail
BIN=${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin | sort -V | tail -1)}
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
DIR=$(mktemp -d); chown postgres "$DIR"; PORT=55434
run(){ su postgres -s /bin/bash -c "$*"; }
cleanup(){ run "$BIN/pg_ctl -D $DIR/data -m immediate stop" >/dev/null 2>&1 || true; rm -rf "$DIR"; }
trap cleanup EXIT
run "$BIN/initdb -D $DIR/data -U postgres -A trust" >/dev/null
run "$BIN/pg_ctl -D $DIR/data -o '-p $PORT -k $DIR' -l $DIR/log start" >/dev/null; sleep 1
Q(){ local user=$1; shift; PGOPTIONS="-c client_min_messages=warning" "$BIN/psql" -h "$DIR" -p $PORT -U "$user" -d postgres -v ON_ERROR_STOP=1 -qAtX "$@"; }
FAIL=0; N=0; ok(){ N=$((N+1)); if [ "$2" = "1" ]; then echo "ok   $1"; else echo "FAIL $1"; FAIL=$((FAIL+1)); fi; }

COA=c0000000-0000-4000-8000-00000000000a; COB=c0000000-0000-4000-8000-00000000000b
ADA=a0000000-0000-4000-8000-00000000000a; ADB=a0000000-0000-4000-8000-00000000000b
WA=e0000000-0000-4000-8000-00000000000a; WB=e0000000-0000-4000-8000-00000000000b
TOKA=f0000000-0000-4000-8000-00000000000a; TOKB=f0000000-0000-4000-8000-00000000000b
TA=10000000-0000-4000-8000-00000000000a; PA=20000000-0000-4000-8000-00000000000a

Q postgres <<SQL
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create role authenticator login noinherit; grant anon, authenticated, service_role to authenticator;
create schema auth; grant usage on schema auth to anon, authenticated, service_role;
create function auth.uid() returns uuid language sql stable as \$f\$
  select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid \$f\$;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
-- like Supabase: new objects in public are granted to anon / authenticated / service_role by default
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;

create table companies(id uuid primary key, name text not null, bot_enabled boolean not null default false);
create table admins(user_id uuid primary key, company_id uuid);
create table platform_admins(user_id uuid primary key);
create table workers(id uuid primary key, name text, token uuid, company_id uuid);
create table tasks(id uuid primary key, company_id uuid, title text);
create table task_plans(id uuid primary key, task_id uuid references tasks(id), worker_id uuid);
create table help_requests(id uuid primary key default gen_random_uuid(), company_id uuid not null references companies(id) on delete cascade, worker_id uuid not null references workers(id) on delete cascade,
  task_id uuid references tasks(id) on delete set null, plan_id uuid references task_plans(id) on delete set null, reason text not null, body text, lat double precision, lng double precision,
  created_at timestamptz not null default now(), status text not null default 'open', answer text, answered_at timestamptz, answered_by uuid, auto boolean not null default false,
  bot_draft text, bot_action text, bot_note text, bot_at timestamptz, bot_tokens integer);
create table notifications(id uuid primary key default gen_random_uuid(), worker_id uuid not null references workers(id) on delete cascade, kind text not null, title text not null, body text,
  task_id uuid, plan_id uuid, created_at timestamptz not null default now(), read_at timestamptz);
create table bot_pings(id uuid, at timestamptz default now());
alter table help_requests enable row level security; alter table notifications enable row level security;

create function public.my_company() returns uuid language sql stable security definer set search_path to 'public' as \$f\$ select company_id from public.admins where user_id = auth.uid() \$f\$;
create function public.is_master() returns boolean language sql stable security definer set search_path to 'public' as \$f\$ select exists(select 1 from platform_admins where user_id = auth.uid()) \$f\$;
create policy help_requests_admin_read on help_requests for select using (company_id = my_company());
create function public._worker(p_token uuid) returns workers language plpgsql security definer set search_path to 'public' as \$f\$
declare w workers; begin select * into w from workers where token = p_token; if not found then raise exception 'invalid_token'; end if; return w; end \$f\$;
revoke execute on function public._worker(uuid) from public, anon, authenticated;
-- stand-in: production calls the help-bot edge function through pg_net here
create function public._help_bot_ping(p_id uuid) returns void language plpgsql security definer set search_path to 'public' as \$f\$
begin insert into bot_pings(id) values (p_id); end \$f\$;
revoke execute on function public._help_bot_ping(uuid) from public, anon, authenticated;

insert into companies values ('$COA', 'Firma A', true), ('$COB', 'Firma B', false);
insert into admins values ('$ADA', '$COA'), ('$ADB', '$COB');
insert into workers values ('$WA', 'Anna', '$TOKA', '$COA'), ('$WB', 'Boris', '$TOKB', '$COB');
insert into tasks values ('$TA', '$COA', 'Auftrag A');
insert into task_plans values ('$PA', '$TA', '$WA');
SQL
# production versions of help_request / help_resolve (+ grants as in production)
Q postgres -f "$ROOT/supabase/rollback/2026-11-16_ai_phase_a.down.sql"
Q postgres -c "revoke all on function public.help_resolve(uuid,text,text) from public, anon; grant execute on function public.help_request(uuid,uuid,text,text,double precision,double precision) to anon, authenticated, service_role;"

api(){ local role=$1 sub=$2 sql=$3; local claims='{}'; [ -n "$sub" ] && claims="{\"sub\":\"$sub\",\"role\":\"$role\"}"
  Q authenticator -c "set role $role; select set_config('request.jwt.claims', '$claims', false);" -c "$sql" >$DIR/out 2>$DIR/err && { echo OK; return; }
  sed -n 's/.*ERROR: *//p' $DIR/err | head -1; }
val(){ tail -1 $DIR/out; }
md5of(){ Q postgres -c "select md5(pg_get_functiondef('$1'::regprocedure))"; }

echo "== production state"
ok "help_request = production (md5)" "$( [ "$(md5of 'public.help_request(uuid,uuid,text,text,double precision,double precision)')" = e644a18d9b4d2c3bccdaa60cc8344f9c ] && echo 1 )"
ok "help_resolve = production (md5)" "$( [ "$(md5of 'public.help_resolve(uuid,text,text)')" = fc2e4c979f88471ee918029c6377964c ] && echo 1 )"
api anon "" "select public.help_request('$TOKA', '$PA', 'gps', 'GPS spinnt', null, null)" >/dev/null; H_OLD=$(val)
api authenticated "$ADA" "select public.help_resolve('$H_OLD', '', null)" >/dev/null
ok "BUG reproduced: closing an automatically answered report with an empty field wipes the automatic answer" "$( [ "$(Q postgres -c "select answer is null and auto from help_requests where id='$H_OLD'")" = t ] && echo 1 )"
api anon "" "select public.help_request('$TOKA', '$PA', 'nobox', '', null, null)" >/dev/null; H_KEEP=$(val)

echo "== apply migration"
Q postgres -f "$ROOT/supabase/2026-11-16_ai_phase_a.sql"
ok "backfill: the wiped automatic answer is found again in the worker's notifications (auto_answer)" "$( [ "$(Q postgres -c "select auto_answer like 'Bitte prüfen%' and answer is null from help_requests where id='$H_OLD'")" = t ] && echo 1 )"
ok "backfill: an intact automatic answer is copied to auto_answer" "$( [ "$(Q postgres -c "select auto_answer = answer from help_requests where id='$H_KEEP'")" = t ] && echo 1 )"

echo "-- help_request (old call, used by all installed apps): same behaviour"
P0=$(Q postgres -c "select count(*) from bot_pings")
r=$(api anon "" "select public.help_request('$TOKA', '$PA', 'closed', 'Baustelle', 52.1, 7.1)"); H1=$(val)
ok "reason closed: automatic answer, closed, notification for the worker, bot asked once" "$( [ "$r" = OK ] && [ "$(Q postgres -c "select status = 'done' and auto and answer like 'Verstanden.%' and auto_answer = answer and amount is null from help_requests where id='$H1'")" = t ] && [ "$(Q postgres -c "select count(*) from notifications where worker_id='$WA' and title='Automatische Antwort · Автоответ' and created_at > now() - interval '1 minute'")" -ge 1 ] && [ "$(Q postgres -c "select count(*) from bot_pings")" = $((P0+1)) ] && echo 1 )"
r=$(api anon "" "select public.help_request('$TOKA', '$PA', 'gps', '', null, null)"); H2=$(val)
ok "reason gps: advice, stays open for the admin" "$( [ "$(Q postgres -c "select status = 'open' and answer like 'Bitte prüfen%' from help_requests where id='$H2'")" = t ] && echo 1 )"
r=$(api anon "" "select public.help_request('$TOKA', null, 'other', 'Eine Frage zum Vertrag', null, null)"); H3=$(val)
ok "reason other: no automatic answer, open" "$( [ "$(Q postgres -c "select status = 'open' and answer is null and not auto and auto_answer is null from help_requests where id='$H3'")" = t ] && echo 1 )"
r=$(api anon "" "select public.help_request(gen_random_uuid(), null, 'other', 'x', null, null)")
ok "wrong token → invalid_token" "$( [ "$r" = invalid_token ] && echo 1 )"

echo "-- help_request2 (new app: optional number)"
r=$(api anon "" "select public.help_request2('$TOKA', '$PA', 'nobox', 'Briefkästen hinter Zaun', null, null, 120, null)"); H4=$(val)
ok "nobox + 120: stored, answered and closed exactly like help_request" "$( [ "$r" = OK ] && [ "$(Q postgres -c "select amount = 120 and detail is null and status = 'done' and answer like 'Verstanden.%' from help_requests where id='$H4'")" = t ] && echo 1 )"
r=$(api anon "" "select public.help_request2('$TOKA', '$PA', 'flyers', '', null, null, 150, 'leftover')"); H5=$(val)
ok "flyers + leftover 150: stored, stays open for the admin (as today)" "$( [ "$(Q postgres -c "select amount = 150 and detail = 'leftover' and status = 'open' and answer is null from help_requests where id='$H5'")" = t ] && echo 1 )"
r=$(api anon "" "select public.help_request2('$TOKA', null, 'other', 'Text', null, null, 5, 'short')"); H6=$(val)
ok "detail is only kept for the reason flyers" "$( [ "$(Q postgres -c "select detail is null and amount = 5 from help_requests where id='$H6'")" = t ] && echo 1 )"
C0=$(Q postgres -c "select count(*) from help_requests")
r=$(api anon "" "select public.help_request2('$TOKA', null, 'nobox', '', null, null, -1, null)")
ok "amount -1 → amount_invalid, nothing stored" "$( [ "$r" = amount_invalid ] && [ "$(Q postgres -c "select count(*) from help_requests")" = "$C0" ] && echo 1 )"
r=$(api anon "" "select public.help_request2('$TOKA', null, 'nobox', '', null, null, 100001, null)")
ok "amount above 100 000 → amount_invalid" "$( [ "$r" = amount_invalid ] && echo 1 )"
r=$(api anon "" "select public.help_request2('$TOKA', null, 'flyers', '', null, null, 10, 'many')")
ok "unknown detail → detail_invalid" "$( [ "$r" = detail_invalid ] && echo 1 )"
r=$(api anon "" "select public.help_request2(gen_random_uuid(), null, 'nobox', '', null, null, 3, null)")
ok "help_request2 with a wrong token → invalid_token" "$( [ "$r" = invalid_token ] && echo 1 )"

echo "-- help_resolve (fixed)"
r=$(api authenticated "$ADA" "select public.help_resolve('$H2', '   ', null)")
ok "admin closes an automatically answered report with an empty field → answer kept" "$( [ "$r" = OK ] && [ "$(Q postgres -c "select status = 'done' and answer like 'Bitte prüfen%' and auto_answer = answer from help_requests where id='$H2'")" = t ] && echo 1 )"
N0=$(Q postgres -c "select count(*) from notifications")
r=$(api authenticated "$ADA" "select public.help_resolve('$H1', 'Danke, ich habe es gesehen.', null)")
ok "admin answers with text → answer replaced, automatic text kept in auto_answer, one notification" "$( [ "$(Q postgres -c "select answer = 'Danke, ich habe es gesehen.' and auto_answer like 'Verstanden.%' from help_requests where id='$H1'")" = t ] && [ "$(Q postgres -c "select count(*) from notifications")" = $((N0+1)) ] && echo 1 )"
N0=$(Q postgres -c "select count(*) from notifications")
r=$(api authenticated "$ADA" "select public.help_resolve('$H3', '', null)")
ok "empty close of a report without answer → no notification, answer stays empty" "$( [ "$(Q postgres -c "select answer is null and status='done' from help_requests where id='$H3'")" = t ] && [ "$(Q postgres -c "select count(*) from notifications")" = "$N0" ] && echo 1 )"
r=$(api authenticated "$ADB" "select public.help_resolve('$H5', 'x', null)")
ok "admin of company B cannot close a report of company A → not_found" "$( [ "$r" = not_found ] && echo 1 )"
r=$(api anon "" "select public.help_resolve('$H5', 'x', null)")
ok "anon cannot call help_resolve" "$(case "$r" in "permission denied"*) echo 1;; esac)"

echo "-- rule sets"
Q postgres -c "select rules::text from help_rule_sets where company_id is null and key = 'fityes' and version = 1 and status = 'active'" > $DIR/rules.json
ok "FITYES v1 seeded as the active default and identical to supabase/help-rules/fityes.v1.json" "$(node -e "const a=JSON.parse(require('fs').readFileSync('$DIR/rules.json','utf8')),b=JSON.parse(require('fs').readFileSync('$ROOT/supabase/help-rules/fityes.v1.json','utf8'));const s=o=>JSON.stringify(o,Object.keys(o).sort());const deep=x=>x&&typeof x==='object'?(Array.isArray(x)?x.map(deep):Object.keys(x).sort().reduce((o,k)=>(o[k]=deep(x[k]),o),{})):x;process.stdout.write(JSON.stringify(deep(a))===JSON.stringify(deep(b))?'1':'')")"
r=$(api authenticated "$ADA" "select count(*) from public.help_rule_sets"); ok "admin A reads the default set" "$( [ "$r" = OK ] && [ "$(val)" = 1 ] && echo 1 )"
Q postgres -c "insert into help_rule_sets(company_id, key, version, status, rules) values ('$COB', 'b', 1, 'active', '{\"key\":\"b\",\"version\":1,\"rules\":[]}')"
r=$(api authenticated "$ADA" "select count(*) from public.help_rule_sets where company_id = '$COB'"); ok "admin A does not see company B's own set" "$( [ "$r" = OK ] && [ "$(val)" = 0 ] && echo 1 )"
r=$(api authenticated "$ADB" "select count(*) from public.help_rule_sets"); ok "admin B sees the default + its own set" "$( [ "$r" = OK ] && [ "$(val)" = 2 ] && echo 1 )"
r=$(api anon "" "select count(*) from public.help_rule_sets"); ok "anon: no access to rule sets" "$(case "$r" in "permission denied"*) echo 1;; esac)"
r=$(api authenticated "$ADA" "update public.help_rule_sets set note = 'x'"); ok "admins cannot change rule sets directly" "$(case "$r" in "permission denied"*) echo 1;; esac)"
r=$( (Q postgres -c "update help_rule_sets set rules = '{}' where key = 'fityes'" 2>&1 || true) | sed -n 's/.*ERROR: *//p'); ok "active version is frozen (rules cannot be edited) → rule_set_frozen" "$( [ "$r" = rule_set_frozen ] && echo 1 )"
r=$( (Q postgres -c "insert into help_rule_sets(company_id, key, version, status, rules) values (null, 'fityes', 2, 'active', '{}')" 2>&1 || true) | sed -n 's/.*ERROR: *//p'); ok "only one active set per company (second active default refused)" "$(echo "$r" | grep -q 'duplicate key' && echo 1)"
Q postgres -c "insert into help_rule_sets(company_id, key, version, status, rules) values (null, 'fityes', 2, 'draft', '{\"a\":1}'); update help_rule_sets set rules = '{\"a\":2}' where key = 'fityes' and version = 2;
  update help_rule_sets set status = 'archived' where key = 'fityes' and version = 1; update help_rule_sets set status = 'active', activated_at = now() where key = 'fityes' and version = 2;"
ok "new version: draft can be edited, then old version archived and new one activated" "$( [ "$(Q postgres -c "select string_agg(version || status, ',' order by version) from help_rule_sets where key = 'fityes'")" = "1archived,2active" ] && echo 1 )"
r=$( (Q postgres -c "insert into help_rule_sets(company_id, key, version, status, rules) values (null, 'fityes', 2, 'draft', '{}')" 2>&1 || true) | sed -n 's/.*ERROR: *//p'); ok "same company + key + version twice refused (also for the default, null company)" "$(echo "$r" | grep -q 'duplicate key' && echo 1)"
r=$( (Q postgres -c "update help_rule_sets set status = 'active' where key = 'fityes' and version = 1" 2>&1 || true) | sed -n 's/.*ERROR: *//p'); ok "an archived version cannot be activated again → rule_set_archived" "$( [ "$r" = rule_set_archived ] && echo 1 )"

echo "-- admin notifications (help_events)"
rec(){ api service_role "" "select public.help_event_record('$1', $2, $3, $4, '$5', '$6', $7, 'fityes', 1, '$8', 'x', '$9')"; }
r=$(rec $COA "'$WA'" "'$TA'" "'$H5'" leftover_flyers ESCALATE false leftover_large "$COA:$WA:leftover_flyers:$TA:2026-11-16"); E1=$(val)
ok "server records a notification (service_role)" "$( [ "$r" = OK ] && [ -n "$E1" ] && echo 1 )"
r=$(rec $COA "'$WA'" "'$TA'" null leftover_flyers NOTIFY true leftover_large "$COA:$WA:leftover_flyers:$TA:2026-11-16")
ok "same key again → no second row, counted 2×, stays ESCALATE, becomes urgent" "$( [ "$(Q postgres -c "select count(*)::text || repeat_count::text || mode || urgent::text from help_events where company_id='$COA' group by repeat_count, mode, urgent")" = "12ESCALATEtrue" ] && echo 1 )"
r=$(rec $COA "'$WB'" null null sick NOTIFY false sick "k1"); ok "worker of another company → worker_not_in_company" "$( [ "$r" = worker_not_in_company ] && echo 1 )"
r=$(rec $COB null "'$TA'" null sick NOTIFY false sick "k2"); ok "order of another company → task_not_in_company" "$( [ "$r" = task_not_in_company ] && echo 1 )"
r=$(rec $COB null null "'$H5'" sick NOTIFY false sick "k3"); ok "report of another company → request_not_in_company" "$( [ "$r" = request_not_in_company ] && echo 1 )"
r=$(rec $COA null null null sick AUTO false sick "k4"); ok "mode AUTO is no notification → mode_invalid" "$( [ "$r" = mode_invalid ] && echo 1 )"
r=$(api anon "" "select public.help_event_record('$COA', null, null, null, 'x', 'NOTIFY', false, null, null, null, null, 'k5')"); ok "anon cannot write notifications" "$(case "$r" in "permission denied"*) echo 1;; esac)"
r=$(api authenticated "$ADA" "select public.help_event_record('$COA', null, null, null, 'x', 'NOTIFY', false, null, null, null, null, 'k6')"); ok "admins cannot write notifications directly (server only)" "$(case "$r" in "permission denied"*) echo 1;; esac)"
rec $COB "'$WB'" null null sick NOTIFY false sick "$COB:$WB:sick:-:2026-11-16" >/dev/null
r=$(api authenticated "$ADA" "select count(*) from public.help_events"); ok "admin A sees only company A's notifications (1, not B's)" "$( [ "$r" = OK ] && [ "$(val)" = 1 ] && echo 1 )"
r=$(api anon "" "select count(*) from public.help_events"); ok "anon: no access to notifications" "$(case "$r" in "permission denied"*) echo 1;; esac)"
r=$(api authenticated "$ADB" "select public.help_event_set_status('$E1', 'seen')"); ok "admin B cannot change A's notification → not_found" "$( [ "$r" = not_found ] && echo 1 )"
api authenticated "$ADA" "select public.help_event_set_status('$E1', 'seen')" >/dev/null; api authenticated "$ADA" "select public.help_event_set_status('$E1', 'acknowledged')" >/dev/null
ok "admin A: seen → acknowledged, times set, handled_by = admin" "$( [ "$(Q postgres -c "select status = 'acknowledged' and seen_at is not null and acknowledged_at is not null and resolved_at is null and handled_by = '$ADA' from help_events where id='$E1'")" = t ] && echo 1 )"
api authenticated "$ADA" "select public.help_event_set_status('$E1', 'resolved')" >/dev/null
rec $COA "'$WA'" "'$TA'" null leftover_flyers ESCALATE false leftover_large "$COA:$WA:leftover_flyers:$TA:2026-11-16" >/dev/null
ok "repeat of a resolved notification → opened again (new), still one row" "$( [ "$(Q postgres -c "select status || repeat_count from help_events where id='$E1'")" = new3 ] && echo 1 )"
r=$(api authenticated "$ADA" "select public.help_event_set_status('$E1', 'deleted')"); ok "unknown status → status_invalid" "$( [ "$r" = status_invalid ] && echo 1 )"
r=$(api authenticated "$ADA" "update public.help_events set status = 'resolved'"); ok "admins cannot update notifications directly (only through the function)" "$(case "$r" in "permission denied"*) echo 1;; esac)"

echo "-- rights of the new objects"
ok "anon has no rights on help_rule_sets / help_events" "$( [ "$(Q postgres -c "select has_table_privilege('anon','public.help_rule_sets','select,insert,update,delete') or has_table_privilege('anon','public.help_events','select,insert,update,delete')")" = f ] && echo 1 )"
ok "trigger function of rule sets not callable by anon / authenticated" "$( [ "$(Q postgres -c "select has_function_privilege('anon','public._help_rule_sets_frozen()','execute') or has_function_privilege('authenticated','public._help_rule_sets_frozen()','execute')")" = f ] && echo 1 )"
ok "help_request2 callable by anon (worker app), help_event_record only by service_role" "$( [ "$(Q postgres -c "select has_function_privilege('anon','public.help_request2(uuid,uuid,text,text,double precision,double precision,integer,text)','execute') and not has_function_privilege('authenticated','public.help_event_record(uuid,uuid,uuid,uuid,text,text,boolean,text,integer,text,text,text)','execute') and has_function_privilege('service_role','public.help_event_record(uuid,uuid,uuid,uuid,text,text,boolean,text,integer,text,text,text)','execute')")" = t ] && echo 1 )"
ok "help_resolve rights unchanged (authenticated yes, anon no)" "$( [ "$(Q postgres -c "select has_function_privilege('authenticated','public.help_resolve(uuid,text,text)','execute') and not has_function_privilege('anon','public.help_resolve(uuid,text,text)','execute')")" = t ] && echo 1 )"
ok "migration is idempotent (second run, seed not duplicated)" "$(Q postgres -f "$ROOT/supabase/2026-11-16_ai_phase_a.sql" >/dev/null && [ "$(Q postgres -c "select count(*) from help_rule_sets where key='fityes' and version=1")" = 1 ] && echo 1)"

echo "== rollback"
Q postgres -f "$ROOT/supabase/rollback/2026-11-16_ai_phase_a.down.sql"
ok "help_request back to the production version (md5)" "$( [ "$(md5of 'public.help_request(uuid,uuid,text,text,double precision,double precision)')" = e644a18d9b4d2c3bccdaa60cc8344f9c ] && echo 1 )"
ok "help_resolve back to the production version (md5)" "$( [ "$(md5of 'public.help_resolve(uuid,text,text)')" = fc2e4c979f88471ee918029c6377964c ] && echo 1 )"
ok "new tables, functions and columns removed, reports kept" "$( [ "$(Q postgres -c "select to_regclass('public.help_events') is null and to_regclass('public.help_rule_sets') is null and to_regprocedure('public.help_request2(uuid,uuid,text,text,double precision,double precision,integer,text)') is null and not exists(select 1 from information_schema.columns where table_name='help_requests' and column_name in ('amount','detail','auto_answer')) and (select count(*) from help_requests) > 0")" = t ] && echo 1 )"
echo; [ $FAIL = 0 ] && echo "all $N ok ($("$BIN/postgres" --version))" || { echo "$FAIL of $N FAILED"; exit 1; }
