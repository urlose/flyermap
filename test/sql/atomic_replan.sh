#!/usr/bin/env bash
# Test of supabase/2026-11-17_atomic_replan.sql on an isolated Postgres with SYNTHETIC data (no production).
# Tables, constraints, triggers and RLS policies mirror production as read from its catalogs on 16.11.2026.
# Needs an empty database: PGHOST/PGPORT/PGUSER/PGPASSWORD (defaults: 127.0.0.1:5432 postgres/postgres).
set -uo pipefail
export PGHOST="${PGHOST:-127.0.0.1}" PGPORT="${PGPORT:-5432}" PGUSER="${PGUSER:-postgres}" PGPASSWORD="${PGPASSWORD:-postgres}"
export PGOPTIONS="-c client_min_messages=warning"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
MIG="$ROOT/supabase/2026-11-17_atomic_replan.sql"; DOWN="$ROOT/supabase/rollback/2026-11-17_atomic_replan.down.sql"
Q(){ psql -v ON_ERROR_STOP=1 -qAtX "$@"; }
N=0; FAIL=0
ok(){ N=$((N+1)); if [ "$2" = "1" ] || [ "$2" = "t" ]; then echo "ok   $1"; else echo "FAIL $1  (got: $2)"; FAIL=$((FAIL+1)); fi; }
has(){ case "$2" in *"$1"*) echo 1;; *) echo "not refused: $(echo "$2" | tail -1)";; esac; }
yes(){ if [ "$1" = t ]; then echo 1; else echo "error: $(echo "$1" | tail -1)"; fi; }   # the call returned true, not an error text

UA=a0000000-0000-4000-8000-00000000000a; UB=a0000000-0000-4000-8000-00000000000b
CA=c0000000-0000-4000-8000-00000000000a; CB=c0000000-0000-4000-8000-00000000000b
W1=e0000000-0000-4000-8000-000000000001; W2=e0000000-0000-4000-8000-000000000002; W3=e0000000-0000-4000-8000-000000000003; WX=e0000000-0000-4000-8000-00000000000f
T1=10000000-0000-4000-8000-000000000001; T2=10000000-0000-4000-8000-000000000002; T3=10000000-0000-4000-8000-000000000003
T4=10000000-0000-4000-8000-000000000004; T5=10000000-0000-4000-8000-000000000005
P0=20000000-0000-4000-8000-000000000000; P1=20000000-0000-4000-8000-000000000001; P2=20000000-0000-4000-8000-000000000002

Q -f "$ROOT/test/sql/fixtures/replan_schema.sql" || { echo "fixture failed"; exit 2; }

Q -f "$MIG" || { echo "migration failed"; exit 2; }
Q -f "$MIG" || { echo "second apply failed"; exit 2; }   # idempotent

seed(){ Q <<SQL
truncate tasks_history, task_plans_trash, plan_cancellations, help_requests, notifications, routes, task_workers, task_plans, tasks, workers, admins, platform_admins, companies cascade;
insert into companies values ('$CA','A'),('$CB','B');
insert into admins values ('$UA','$CA'),('$UB','$CB');
insert into workers values ('$W1','w1','$CA'),('$W2','w2','$CA'),('$W3','w3','$CA'),('$WX','wx','$CB');
insert into tasks(id,title,start_lat,start_lng,flyers,work_days,company_id,created_by,deadline) values
  ('$T1','Walked order',48.4,10.2,1000,2,'$CA','$UA','2026-12-31'),
  ('$T2','Fresh order',48.4,10.2,1000,2,'$CA','$UA',null),
  ('$T3','Parallel order',48.4,10.2,1000,2,'$CA','$UA',null),
  ('$T4','Order with a done route',48.4,10.2,1000,2,'$CA','$UA',null),
  ('$T5','Closed order',48.4,10.2,1000,2,'$CA','$UA',null);
update tasks set status='done' where id='$T5';
delete from tasks_history;
insert into task_plans(id,task_id,idx,worker_id,color,path,length_m,street_m,mailboxes,status,work_dates,accepted_at,committed_terms,skipped,days_left,detours) values
  ('$P0','$T1',0,'$W1','#111','[[48.4,10.2],[48.41,10.21]]',1000,900,100,'accepted','["2026-11-20","2026-11-21"]','2026-11-10 10:00+00','v1','["s1"]',1,'[{"x":1}]'),
  ('$P1','$T1',1,'$W2','#222','[[48.4,10.2],[48.42,10.22]]',1000,900,100,'declined','[]',null,null,'["s2"]',null,'[]'),
  ('$P2','$T1',2,null,'#333','[[48.4,10.2],[48.43,10.23]]',1000,900,100,'offered','[]',null,null,'[]',null,'[]');
insert into task_plans(task_id,idx,worker_id,path,length_m,street_m,mailboxes,status,work_dates,accepted_at) values
  ('$T2',0,'$W1','[[1,1],[2,2]]',10,10,5,'accepted','["2026-11-20"]',now()),
  ('$T3',0,'$W1','[[1,1],[2,2]]',10,10,5,'offered','[]',null),
  ('$T4',0,'$W1','[[1,1],[2,2]]',10,10,5,'done','["2026-11-12"]',now()),
  ('$T5',0,'$W1','[[1,1],[2,2]]',10,10,5,'offered','[]',null);
insert into task_workers values ('$T1','$W1'),('$T1','$W2'),('$T2','$W1'),('$T3','$W1'),('$T4','$W1');
insert into routes(worker_id,task_id,plan_id,company_id,ended_at) values ('$W1','$T1','$P0','$CA',now()), ('$W2','$T1','$P1','$CA',now());
insert into notifications(worker_id,kind,task_id,plan_id) values ('$W1','assigned','$T1','$P0'), ('$W2','assigned','$T1','$P1');
insert into help_requests(company_id,worker_id,task_id,plan_id) values ('$CA','$W1','$T1','$P0');
insert into plan_cancellations(company_id,worker_id,task_id,plan_id) values ('$CA','$W2','$T1','$P1');
SQL
}
snap(){ Q -c "select md5(coalesce((select string_agg(to_jsonb(t)::text,'' order by id) from tasks t),'') || coalesce((select string_agg(to_jsonb(p)::text,'' order by id) from task_plans p),'') || coalesce((select string_agg(to_jsonb(w)::text,'' order by task_id,worker_id) from task_workers w),'') || coalesce((select string_agg(to_jsonb(r)::text,'' order by id) from routes r),'') || (select count(*) from task_plans_trash) || (select count(*) from tasks_history) || (select count(*) from notifications))"; }
# replan <user-or-empty> <task> <task-json> <plans-json>  -> output or error text
# dry <user> <task> <task-json> <plans-json> -> report json or error text
dry(){ local u=$1; psql -v ON_ERROR_STOP=1 -qAtX 2>&1 <<SQL
set role authenticated; set request.jwt.claim.sub = '$u';
select public.replan_task_with_plans('$2', '$3'::jsonb, '$4'::jsonb, true);
SQL
}
replan(){ local u=$1; psql -v ON_ERROR_STOP=1 -qAtX 2>&1 <<SQL
set role authenticated; set request.jwt.claim.sub = '$u';
select public.replan_task_with_plans('$2', '$3'::jsonb, '$4'::jsonb) is not null;
SQL
}
TASKJ='{"title":"Walked order v2","start_lat":48.5,"start_lng":10.3,"walk_minutes":15,"flyers":1500,"quota_m30":2500,"no_quota":false,"work_days":3,"work_hours":7,"bike":false,"travel":"bus","cores":false,"together":false,"est_mailboxes":300,"route_m":3000,"deadline":"2026-12-31"}'
plan(){ # idx worker-or-null days mailboxes
  local w="null"; [ "$2" != null ] && w="\"$2\""; local d="[]"; local i; for i in $(seq 1 "$3"); do d=$(echo "$d" | sed "s/]$/$([ "$i" = 1 ] || echo ,){\"i0\":0}]/"); done
  echo "{\"idx\":$1,\"worker_id\":$w,\"color\":\"#abc\",\"path\":[[48.5,10.3],[48.5$1,10.3$1]],\"length_m\":2000,\"street_m\":1800,\"mailboxes\":$4,\"days\":$d}"; }
GOOD="[$(plan 0 $W1 2 100),$(plan 1 $W3 1 100),$(plan 2 null 1 100)]"

seed || { echo "seed failed"; exit 2; }

# ---------- who may call ----------
ok "anon has no execute right"        "$(Q -c "select not has_function_privilege('anon','public.replan_task_with_plans(uuid,jsonb,jsonb,boolean)','execute')")"
ok "authenticated may execute"        "$(Q -c "select has_function_privilege('authenticated','public.replan_task_with_plans(uuid,jsonb,jsonb,boolean)','execute')")"
ok "archive trigger function is not callable" "$(Q -c "select not has_function_privilege('authenticated','public._keep_plan_replan()','execute') and not has_function_privilege('anon','public._keep_plan_replan()','execute')")"
ok "function is SECURITY INVOKER"     "$(Q -c "select not prosecdef from pg_proc where proname='replan_task_with_plans'")"
B=$(snap)
ok "no signed-in user is refused"     "$(has authentication_required "$(replan '' $T1 "$TASKJ" "$GOOD")")"
ok "admin of another company: order not found" "$(has task_not_found "$(replan $UB $T1 "$TASKJ" "$GOOD")")"
ok "unknown order: not found"         "$(has task_not_found "$(replan $UA 10000000-0000-4000-8000-0000000000ff "$TASKJ" "$GOOD")")"

# ---------- bad input ----------
ok "no routes is refused"             "$(has invalid_order_payload "$(replan $UA $T1 "$TASKJ" "[]")")"
MANY="[$(for i in $(seq 0 30); do [ $i = 0 ] || printf ,; plan $i null 1 1; done)]"
ok "31 routes are refused"            "$(has invalid_order_payload "$(replan $UA $T1 "$TASKJ" "$MANY")")"
ok "fractional mailboxes are refused" "$(has mailboxes_must_be_nonnegative_integers "$(replan $UA $T1 "$TASKJ" "[$(plan 0 $W1 1 12.5)]")")"
ok "1381.5 mailboxes (reported case) are refused" "$(has mailboxes_must_be_nonnegative_integers "$(replan $UA $T1 "$TASKJ" "[$(plan 0 $W1 1 1381.5)]")")"
ok "duplicate route number is refused" "$(has invalid_route_index "$(replan $UA $T1 "$TASKJ" "[$(plan 0 $W1 1 10),$(plan 0 $W3 1 10)]")")"

# ---------- a failure in the middle keeps the old state ----------
ok "distributor of another company in route 2: refused" "$(has 'row-level security' "$(replan $UA $T1 "$TASKJ" "[$(plan 0 $W1 1 10),$(plan 1 $WX 1 10)]")")"
ok "missing required task field: refused" "$(has 'null value' "$(replan $UA $T1 '{"title":"x"}' "$GOOD")")"
ok "missing route geometry: refused"  "$(has 'null value' "$(replan $UA $T1 "$TASKJ" '[{"idx":0,"mailboxes":5,"length_m":1,"street_m":1}]')")"
ok "after all refusals: order, routes, assignments, sessions, archive unchanged" "$([ "$(snap)" = "$B" ] && echo 1 || echo changed)"

# ---------- somebody is walking / done / closed ----------
Q -c "insert into routes(id,worker_id,task_id,plan_id,company_id) values ('30000000-0000-4000-8000-000000000001','$W1','$T1','$P0','$CA')"
B2=$(snap)
ok "open shift on the order: refused" "$(has replan_live "$(replan $UA $T1 "$TASKJ" "$GOOD")")"
ok "open shift: nothing changed"      "$([ "$(snap)" = "$B2" ] && echo 1 || echo changed)"
Q -c "update routes set ended_at = now() where id = '30000000-0000-4000-8000-000000000001'"
ok "order with a done route: refused" "$(has replan_done_route "$(replan $UA $T4 "$TASKJ" "[$(plan 0 $W1 1 10)]")")"
ok "done route kept its status"       "$(Q -c "select status='done' from task_plans where task_id='$T4'")"
ok "closed order: refused"            "$(has task_not_open "$(replan $UA $T5 "$TASKJ" "[$(plan 0 $W1 1 10)]")")"

# ---------- dry run: full report, nothing changed ----------
B3=$(snap)
D=$(dry $UA $T1 "$TASKJ" "$GOOD")
ok "dry run returns a report"        "$(echo "$D" | Q -c "select (\$\$$D\$\$::jsonb->>'dry_run')::boolean" 2>&1)"
ok "dry run changed nothing"         "$([ "$(snap)" = "$B3" ] && echo 1 || echo changed)"
ok "dry run: w2 route removed; cancellations not readable for admins -> null" "$(Q -c "select (r->>'routes_removed')::int=1 and r ? 'cancellations_unlinked' and r->'cancellations_unlinked' = 'null'::jsonb and (r->>'help_reports_unlinked')::int=0 and (r->>'notifications_removed')::int=1 from (select \$\$$D\$\$::jsonb->'report' r) x")"
ok "dry run: no acceptance reset, declined w2 not offered (w2 dropped)" "$(Q -c "select jsonb_array_length(r->'acceptances_reset')=0 and (r->>'declined_offered_again')::int=0 and (r->>'sessions_without_route')::int=1 from (select \$\$$D\$\$::jsonb->'report' r) x")"
D2=$(dry $UA $T1 "$TASKJ" "[$(plan 0 $W1 3 100)]")
ok "dry run: acceptance reset is reported with name and reason" "$(Q -c "select r->'acceptances_reset' @> '[{\"worker_id\":\"$W1\",\"name\":\"w1\",\"reason\":\"more_days\"}]' from (select \$\$$D2\$\$::jsonb->'report' r) x")"
D3=$(dry $UA $T1 "$TASKJ" "[$(plan 0 $W3 1 100)]")
ok "dry run: removed accepted route reported" "$(Q -c "select r->'acceptances_reset' @> '[{\"worker_id\":\"$W1\",\"reason\":\"route_removed\"}]' from (select \$\$$D3\$\$::jsonb->'report' r) x")"
ok "dry run is refused like a real run while a shift is open" "$(Q -c "insert into routes(id,worker_id,task_id,company_id) values ('30000000-0000-4000-8000-000000000009','$W3','$T1','$CA')"; has replan_live "$(dry $UA $T1 "$TASKJ" "$GOOD")")"
Q -c "delete from routes where id='30000000-0000-4000-8000-000000000009'"
ok "dry run leaves no archive flag set" "$(Q -c "select coalesce(current_setting('flyermap.replan', true),'') = ''")"

# ---------- successful re-plan of an order somebody walked on ----------
ok "re-plan succeeds"                 "$(yes "$(replan $UA $T1 "$TASKJ" "$GOOD")")"
R=$(psql -qAtX <<SQL
set role authenticated; set request.jwt.claim.sub = '$UA';
select (public.replan_task_with_plans('$T1', '$TASKJ'::jsonb, '$GOOD'::jsonb))->'report';
SQL
)
ok "real run returns the same report shape (second run: nothing removed)" "$(Q -c "select (\$\$$R\$\$::jsonb->>'routes_removed')::int=0 and \$\$$R\$\$::jsonb ? 'acceptances_reset'")"
ok "three routes, numbers 0,1,2"      "$(Q -c "select array_agg(idx order by idx)::text = '{0,1,2}' from task_plans where task_id='$T1'")"
ok "order fields updated"             "$(Q -c "select title='Walked order v2' and flyers=1500 and work_days=3 and start_lat=48.5 from tasks where id='$T1'")"
ok "order keeps company, creator, status" "$(Q -c "select company_id='$CA' and created_by='$UA' and status='open' from tasks where id='$T1'")"
ok "old order row is in tasks_history" "$(Q -c "select count(*)=1 and bool_and((row->>'flyers')='1000') from tasks_history where task_id='$T1'")"
ok "w1 keeps his route id"            "$(Q -c "select id='$P0' from task_plans where task_id='$T1' and worker_id='$W1'")"
ok "w1 has the new geometry"          "$(Q -c "select length_m=2000 and path->1->>0 = '48.50' from task_plans where id='$P0'")"
ok "w1 stays accepted with dates, time, terms" "$(Q -c "select status='accepted' and work_dates='[\"2026-11-20\",\"2026-11-21\"]' and accepted_at='2026-11-10 10:00+00' and committed_terms='v1' from task_plans where id='$P0'")"
ok "w1: leftover days and detours reset" "$(Q -c "select days_left is null and detours='[]' from task_plans where id='$P0'")"
ok "skips of all old routes carried to every route" "$(Q -c "select bool_and(skipped @> '[\"s1\",\"s2\"]' and jsonb_array_length(skipped)=2) from task_plans where task_id='$T1'")"
ok "w1's sessions still linked"       "$(Q -c "select bool_and(plan_id='$P0') from routes where task_id='$T1' and worker_id='$W1'")"
ok "w1's help report still linked"    "$(Q -c "select plan_id='$P0' from help_requests where worker_id='$W1'")"
ok "w1's notification kept"           "$(Q -c "select count(*)=1 from notifications where plan_id='$P0'")"
ok "old version of w1's route archived" "$(Q -c "select count(*)=1 and bool_and((row->>'length_m')='1000') from task_plans_trash where plan_id='$P0'")"
ok "w2's route removed and archived"  "$(Q -c "select not exists(select 1 from task_plans where id='$P1') and (select count(*)=1 from task_plans_trash where plan_id='$P1')")"
ok "w2's sessions kept, without a route" "$(Q -c "select count(*)=1 and bool_and(plan_id is null and task_id='$T1') from routes where worker_id='$W2'")"
ok "w3 gets a new offered route"      "$(Q -c "select status='offered' and work_dates='[]' and accepted_at is null from task_plans where task_id='$T1' and worker_id='$W3'")"
ok "unassigned route keeps its row"   "$(Q -c "select id='$P2' and idx=2 from task_plans where task_id='$T1' and worker_id is null")"
ok "assignments are exactly w1 and w3" "$(Q -c "select array_agg(worker_id order by worker_id)::text = '{$W1,$W3}' from task_workers where task_id='$T1'")"
ok "other orders untouched"           "$(Q -c "select count(*)=4 from task_plans where task_id<>'$T1'")"

# ---------- acceptance rules ----------
ok "re-plan with more days than chosen dates succeeds" "$(yes "$(replan $UA $T1 "$TASKJ" "[$(plan 0 $W1 3 100)]")")"
ok "more days than dates: offered again, dates cleared" "$(Q -c "select status='offered' and work_dates='[]' and accepted_at is null and committed_terms is null from task_plans where id='$P0'")"
ok "only one route left"              "$(Q -c "select count(*)=1 from task_plans where task_id='$T1'")"
ok "declined distributor is offered the new route again" "$(yes "$(replan $UA $T1 "$TASKJ" "[$(plan 0 $W2 1 100)]")")"
ok "declined distributor: route is offered" "$(Q -c "select status='offered' from task_plans where task_id='$T1' and worker_id='$W2'")"
ok "fresh order (nobody walked): succeeds" "$(yes "$(replan $UA $T2 "$TASKJ" "[$(plan 0 $W1 1 100)]")")"
ok "fresh order: acceptance is not carried over (as in the admin panel today)" "$(Q -c "select status='offered' and work_dates='[]' from task_plans where task_id='$T2'")"
ok "late flag follows the deadline"   "$(Q -c "select not late_dates and not late_ok from task_plans where task_id='$T2'")"

# ---------- archive trigger only inside the function ----------
C=$(Q -c "select count(*) from task_plans_trash")
psql -qAtX -v ON_ERROR_STOP=1 >/dev/null <<SQL
set role authenticated; set request.jwt.claim.sub = '$UA';
update task_plans set path = '[[9,9],[8,8]]' where task_id = '$T2';
SQL
ok "ordinary path update is not archived" "$([ "$(Q -c "select count(*) from task_plans_trash")" = "$C" ] && echo 1 || echo archived)"

# ---------- two admins at the same time ----------
for i in 1 2 3 4 5 6; do
  if [ $((i % 2)) = 0 ]; then replan $UA $T3 "$TASKJ" "[$(plan 0 $W1 1 10)]" >/dev/null &
  else replan $UA $T3 "$TASKJ" "[$(plan 0 $W1 1 10),$(plan 1 $W2 1 10)]" >/dev/null & fi
done; wait
ok "six parallel re-plans: consistent result" "$(Q -c "select count(*) in (1,2) and min(idx)=0 and max(idx)=count(*)-1 and count(distinct idx)=count(*) from task_plans where task_id='$T3'")"
ok "parallel: assignments match the routes" "$(Q -c "select (select count(*) from task_workers where task_id='$T3') = (select count(distinct worker_id) from task_plans where task_id='$T3')")"
ok "no half-finished rows anywhere"   "$(Q -c "select not exists(select 1 from task_plans where idx < 0)")"

# ---------- rollback ----------
Q -f "$DOWN" && ok "rollback removes function and trigger" "$(Q -c "select not exists(select 1 from pg_proc where proname in ('replan_task_with_plans','_keep_plan_replan')) and not exists(select 1 from pg_trigger where tgname='keep_plan_replan')")"
ok "rollback keeps the archive"       "$(Q -c "select count(*) > 0 from task_plans_trash")"
ok "existing delete archive still works" "$(Q -c "with d as (delete from task_plans where task_id='$T2' returning 1) select count(*)=1 from d")"
Q -f "$MIG" && ok "migration can be applied again" 1

echo "---"
if [ "$FAIL" = 0 ]; then echo "all $N ok"; else echo "$FAIL of $N FAILED"; exit 1; fi
