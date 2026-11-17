#!/usr/bin/env bash
# Test of supabase/2026-11-17_coordinator_role.sql on a structure-only copy of production (all tables, functions,
# rules, triggers of 17.11.2026) with SYNTHETIC data. Usage: coordinator_role_test.sh <db> <migration> <rollback>
set -uo pipefail
# Needs a database with the production structure (no data): see tools/sql/README-structure-copy.md
DB=$1; MIG=$2; DOWN=$3
export PGHOST="${PGHOST:-127.0.0.1}" PGPORT="${PGPORT:-55440}" PGUSER="${PGUSER:-postgres}" PGOPTIONS="-c client_min_messages=warning"
Q(){ psql -d "$DB" -v ON_ERROR_STOP=1 -qAtX "$@"; }
N=0; FAIL=0
ok(){ N=$((N+1)); if [ "$2" = "1" ] || [ "$2" = "t" ]; then echo "ok   $1"; else echo "FAIL $1  (got: $2)"; FAIL=$((FAIL+1)); fi; }
# as <user-uuid|anon> <sql>  -> output or error text
as(){ local u=$1; shift; local role=authenticated; [ "$u" = anon ] && role=anon && u=''; psql -d "$DB" -v ON_ERROR_STOP=1 -qAtX 2>&1 <<SQL
set role $role; set request.jwt.claim.sub = '$u';
$*
SQL
}
refused(){ [ "$1" = "0" ] && { echo 1; return; }; case "$1" in *ERROR*|*"row-level security"*|*not_admin*|*not_allowed*|*"permission denied"*) echo 1;; *) echo "not refused: $(echo "$1" | tail -1)";; esac; }
passed(){ case "$1" in *ERROR*) echo "error: $(echo "$1" | grep ERROR | head -1)";; *) echo 1;; esac; }

CA=c0000000-0000-4000-8000-0000000000aa; CB=c0000000-0000-4000-8000-0000000000bb
A1=a0000000-0000-4000-8000-0000000000a1; C1=a0000000-0000-4000-8000-0000000000c1; B1=a0000000-0000-4000-8000-0000000000b1
NEWA=a0000000-0000-4000-8000-0000000000a9; NEWW=a0000000-0000-4000-8000-0000000000d1
W1=e0000000-0000-4000-8000-000000000001; W2=e0000000-0000-4000-8000-000000000002; WB=e0000000-0000-4000-8000-00000000000b
T1=10000000-0000-4000-8000-000000000001; T2=10000000-0000-4000-8000-000000000002; TB=10000000-0000-4000-8000-00000000000b
P0=20000000-0000-4000-8000-000000000000; P1=20000000-0000-4000-8000-000000000001; P2=20000000-0000-4000-8000-000000000002; PB=20000000-0000-4000-8000-00000000000b; PC=20000000-0000-4000-8000-00000000000c
H1=30000000-0000-4000-8000-000000000001; R1=40000000-0000-4000-8000-000000000001

Q <<SQL || { echo "seed failed"; exit 2; }
insert into auth.users(id, phone) values ('$A1','+4915100000001'),('$C1','+4915100000002'),('$B1','+4915100000003'),('$NEWA','+4915100000009'),('$NEWW','+4915100000077');
insert into companies(id, name, join_code) values ('$CA','Firma A','FIRMAAAA'),('$CB','Firma B','FIRMABBB');
insert into admins(user_id, company_id, phone) values ('$A1','$CA','+4915100000001'),('$C1','$CA','+4915100000002'),('$B1','$CB','+4915100000003');
insert into workers(id, name, phone, company_id) values ('$W1','Anna','+4915200000001','$CA'),('$W2','Boris','+4915200000002','$CA'),('$WB','Bea','+4915200000003','$CB');
insert into tasks(id, title, start_lat, start_lng, company_id, status) values ('$T1','Auftrag A',48.4,10.2,'$CA','open'),('$T2','Auftrag A zu',48.4,10.2,'$CA','done'),('$TB','Auftrag B',50,8,'$CB','open');
insert into task_plans(id, task_id, idx, worker_id, path, length_m, street_m, status, mailboxes) values
 ('$P0','$T1',0,null,'[[48.4,10.2],[48.41,10.21]]',100,90,'offered',10),
 ('$P1','$T1',1,'$W1','[[48.4,10.2],[48.42,10.22]]',100,90,'accepted',10),
 ('$P2','$T1',2,'$W2','[[48.4,10.2],[48.43,10.23]]',100,90,'declined',10),
 ('$PC','$T2',0,null,'[[48.4,10.2],[48.44,10.24]]',100,90,'offered',10),
 ('$PB','$TB',0,null,'[[50,8],[50.01,8.01]]',100,90,'offered',10);
insert into task_workers(task_id, worker_id) values ('$T1','$W1'),('$T1','$W2');
insert into routes(id, worker_id, company_id, task_id, plan_id, ended_at) values ('$R1','$W1','$CA','$T1','$P1', now());
insert into help_requests(id, company_id, worker_id, task_id, plan_id, reason, body) values ('$H1','$CA','$W1','$T1','$P1','other','Haus abgesperrt');
SQL

# ---------- before: the hole this closes ----------
ok "before: a second admin can change orders (what the role must prevent)" "$(passed "$(as $C1 "update tasks set title = title where id = '$T1';")")"

Q -f "$MIG" >/dev/null || { echo "migration failed"; exit 2; }
Q -f "$MIG" >/dev/null || { echo "second apply failed"; exit 2; }
ok "migration applies twice" 1
Q -c "update admins set role = 'coordinator', display_name = 'Kemal' where user_id = '$C1'" >/dev/null
snap(){ Q -c "select md5(coalesce((select string_agg(to_jsonb(t)::text,'' order by id) from tasks t),'') || coalesce((select string_agg(to_jsonb(p)::text,'' order by id) from task_plans p),'') || coalesce((select string_agg(to_jsonb(w)::text,'' order by id) from workers w),'') || coalesce((select string_agg(to_jsonb(r)::text,'' order by id) from routes r),'') || coalesce((select string_agg(to_jsonb(c)::text,'' order by id) from companies c),'') || (select count(*) from notifications) || (select count(*) from admin_phone_invites) || (select count(*) from admins) || (select count(*) from task_workers))"; }

# ---------- coordinator: reads everything of the firm ----------
ok "coordinator reads orders, routes, distributors, sessions, help reports of the firm" "$(as $C1 "select (select count(*) from tasks) = 2 and (select count(*) from task_plans) = 4 and (select count(*) from workers) = 2 and (select count(*) from routes) = 1 and (select count(*) from help_requests) = 1 and (select count(*) from task_workers) = 2;")"
ok "coordinator sees hours and statistics functions" "$(passed "$(as $C1 "select public.company_stats() is not null and public.worker_stats() is not null;")")"
ok "coordinator does not see the other firm" "$(as $C1 "select not exists(select 1 from tasks where company_id = '$CB') and not exists(select 1 from workers where company_id = '$CB');")"
ok "panel learns role and name" "$(as $C1 "select (public.my_company_info()->>'role') = 'coordinator' and (public.my_company_info()->>'display_name') = 'Kemal';")"
ok "full admin is 'admin'" "$(as $A1 "select (public.my_company_info()->>'role') = 'admin';")"

# ---------- coordinator: changes nothing ----------
B=$(snap)
for s in \
 "insert into tasks(title, start_lat, start_lng, company_id) values ('x', 1, 1, '$CA');" \
 "update tasks set title = 'x' where id = '$T1';" \
 "delete from tasks where id = '$T1';" \
 "update task_plans set worker_id = '$W2' where id = '$P1';" \
 "delete from task_plans where id = '$P0';" \
 "insert into task_workers(task_id, worker_id) values ('$T1', '$W2');" \
 "delete from task_workers where task_id = '$T1';" \
 "update workers set name = 'x' where id = '$W1';" \
 "insert into workers(name, phone, company_id) values ('x', '+4915299999999', '$CA');" \
 "delete from workers where id = '$W2';" \
 "update routes set adj_s = 3600 where id = '$R1';" \
 "delete from routes where id = '$R1';" \
 "insert into notifications(worker_id, kind, title) values ('$W1', 'x', 'x');" \
 "insert into admin_phone_invites(phone, company_id) values ('+4915111111111', '$CA');" \
 "delete from admins where user_id = '$A1';" \
 "select public.create_task_with_plans('{\"title\":\"x\",\"start_lat\":1,\"start_lng\":1}'::jsonb, '[{\"idx\":0,\"path\":[[1,1],[2,2]],\"length_m\":1,\"street_m\":1,\"mailboxes\":1}]'::jsonb);" \
 "select public.replan_task_with_plans('$T1', (select to_jsonb(t) from tasks t where id = '$T1'), '[{\"idx\":0,\"path\":[[1,1],[2,2]],\"length_m\":1,\"street_m\":1,\"mailboxes\":1}]'::jsonb);" \
 "select public.set_verified('$W1', true);" \
 "select public.waive_cancellation('$H1', true);" \
 "select public.new_join_code();" \
 "select public.update_company('{\"name\":\"x\"}'::jsonb);" \
 "select public.update_contract('{\"text\":\"x\"}'::jsonb);" \
 "select public.set_bot(true, 'x');" \
 "select public.accept_avv(public.avv_current());" \
 "select public.merge_plans('$P0', '$P1');" \
 "select public.together_undo('$R1', true);" \
 "select public.set_admin_role('$A1', 'coordinator');" \
 "select public.merge_tasks('$T1', array['$T2']::uuid[]);" \
 "select public.unmerge_task('$T2');" ; do
  case "$s" in update*|delete*) s2="with x as (${s%;} returning 1) select count(*) from x;";; *) s2=$s;; esac   # rules hide rows: 0 rows changed
  ok "coordinator refused: ${s:0:70}" "$(refused "$(as $C1 "$s2")")"
done
ok "after all refused attempts: nothing changed" "$([ "$(snap)" = "$B" ] && echo 1 || echo changed)"

# ---------- coordinator: answers help reports ----------
ok "coordinator answers a help report" "$(passed "$(as $C1 "select public.help_resolve('$H1', 'Nimm die Nebenstraße', null);")")"
ok "answer saved with who answered, distributor notified" "$(Q -c "select (select status = 'done' and answer = 'Nimm die Nebenstraße' and answered_by = '$C1' from help_requests where id = '$H1') and (select count(*) = 1 from notifications where worker_id = '$W1' and kind = 'help')")"

# ---------- coordinator: assigns people to free routes ----------
ok "assign Boris to the free route" "$(passed "$(as $C1 "select public.coord_assign_plan('$P0', '$W2', null, 'Neuer Auftrag: Auftrag A', 'Bitte Tage wählen');")")"
ok "free route: Boris, offered, in the order, notified once" "$(Q -c "select (select worker_id = '$W2' and status = 'offered' and work_dates = '[]' from task_plans where id = '$P0') and exists(select 1 from task_workers where task_id = '$T1' and worker_id = '$W2') and (select count(*) = 1 from notifications where worker_id = '$W2' and kind = 'assigned' and plan_id = '$P0' and title = 'Neuer Auftrag: Auftrag A')")"
ok "route accepted by somebody else: refused" "$(refused "$(as $C1 "select public.coord_assign_plan('$P1', '$W2');")")"
ok "accepted route unchanged" "$(Q -c "select worker_id = '$W1' and status = 'accepted' from task_plans where id = '$P1'")"
ok "declined route can be given to Anna" "$(passed "$(as $C1 "select public.coord_assign_plan('$P2', '$W1');")")"
ok "declined route: Anna, offered; Boris stays in the order (he has another route)" "$(Q -c "select (select worker_id = '$W1' and status = 'offered' from task_plans where id = '$P2') and exists(select 1 from task_workers where task_id = '$T1' and worker_id = '$W2')")"
ok "distributor of another firm: refused" "$(refused "$(as $C1 "select public.coord_assign_plan('$PB', '$W1');")$(as $C1 "select public.coord_assign_plan('$P0', '$WB');" | grep -q ERROR && echo ERROR)")"
ok "closed order: refused" "$(refused "$(as $C1 "select public.coord_assign_plan('$PC', '$W1');")")"
ok "full admin may use it too" "$(passed "$(as $A1 "select public.coord_assign_plan('$PC', '$W1');" | grep -v task_not_open; echo)")"

# ---------- personal link: who invited whom ----------
CODE=$(as $C1 "select public.my_ref_code();")
ok "coordinator gets a personal code (8 characters)" "$(echo "$CODE" | grep -qE '^[A-Z2-9]{8}$' && echo 1 || echo "$CODE")"
ok "the same code on the next call" "$([ "$(as $C1 "select public.my_ref_code();")" = "$CODE" ] && echo 1 || echo differs)"
TOK=$(as anon "select public.join_by_link('$CODE', 'Neu Eins');")
ok "link with the personal code: joins firm A, invited by the coordinator" "$(Q -c "select company_id = '$CA' and referred_by = '$C1' and referred_at is not null from workers where token = '$TOK'")"
ok "lower case and spaces in the code are accepted" "$(Q -c "select company_id = '$CA' and referred_by = '$C1' from workers where token = '$(as anon "select public.join_by_link(lower('${CODE:0:4} ${CODE:4:4}'), 'Neu Zwei');")'")"
TOK2=$(as anon "select public.join_by_link('FIRMAAAA', 'Neu Drei');")
ok "firm code: joins firm A, no referrer" "$(Q -c "select company_id = '$CA' and referred_by is null from workers where token = '$TOK2'")"
ok "unknown code: refused" "$(refused "$(as anon "select public.join_by_link('ZZZZZZZZ', 'Neu');")")"
TOK3=$(as anon "select public.join_by_link2('$CODE', 'Neu Vier', '+4915777777777');")
ok "link with phone (join_by_link2): referrer recorded" "$(Q -c "select referred_by = '$C1' and phone = '+4915777777777' from workers where token = '$TOK3'")"
TOK4=$(as $NEWW "select public.register_worker_v4('Neu Fünf', '[\"Leipheim\"]'::jsonb, '$CODE', false);")
ok "SMS/phone registration (register_worker_v4): referrer recorded" "$(Q -c "select referred_by = '$C1' and company_id = '$CA' from workers where token = '$TOK4'")"
as $NEWW "select public.register_worker_v4('Neu Fünf', '[\"Leipheim\"]'::jsonb, 'FIRMAAAA', false);" >/dev/null
ok "registering again with another code keeps the first referrer" "$(Q -c "select referred_by = '$C1' from workers where phone = '+4915100000077'")"
Q -c "insert into wa_verify(nonce, phone, code, verified_at) values ('50000000-0000-4000-8000-000000000001', '+4915666666666', '123456', now())" >/dev/null 2>&1 || Q -c "insert into wa_verify(nonce, phone, code, verified_at, created_at) values ('50000000-0000-4000-8000-000000000001', '+4915666666666', '123456', now(), now())" >/dev/null
TOK5=$(as anon "select public.wa_register('50000000-0000-4000-8000-000000000001', 'Neu Sechs', '[\"Ulm\"]'::jsonb, '$CODE', false);")
ok "WhatsApp registration: referrer recorded" "$(Q -c "select referred_by = '$C1' from workers where token = '$TOK5'")"
ok "admins of the firm see who invited whom (name)" "$(as $A1 "select count(*) = 5 from workers w join admins a on a.user_id = w.referred_by where a.display_name = 'Kemal';")"
ok "the other firm's code space: personal code of firm A never joins firm B" "$(Q -c "select not exists(select 1 from workers where company_id = '$CB' and referred_by is not null)")"

# ---------- full admins unchanged ----------
for s in \
 "update tasks set title = 'Auftrag A' where id = '$T1';" \
 "update workers set notes = 'ok' where id = '$W1';" \
 "update routes set adj_s = 60 where id = '$R1';" \
 "insert into notifications(worker_id, kind, title) values ('$W1', 'info', 'x');" \
 "select public.set_verified('$W1', true);" \
 "select public.new_join_code();" \
 "select public.set_bot(false, null);" \
 "select public.create_task_with_plans((select to_jsonb(t) - 'id' - 'company_id' || '{\"title\":\"Neu\"}'::jsonb from tasks t where id = '$T1'), '[{\"idx\":0,\"path\":[[1,1],[2,2]],\"length_m\":1,\"street_m\":1,\"mailboxes\":1,\"days\":[],\"steps\":[],\"reserve\":[],\"skipped\":[]}]'::jsonb);" ; do
  case "$s" in update*|delete*) r=$(as $A1 "with x as (${s%;} returning 1) select count(*) from x;"); [ "$r" = "1" ] && r=ok || r="ERROR rows=$r";; *) r=$(as $A1 "$s");; esac
  ok "full admin still may: ${s:0:60}" "$(passed "$r")"
done
ok "full admin re-plans an order" "$(passed "$(as $A1 "select public.replan_task_with_plans('$T1', (select to_jsonb(t) from tasks t where id = '$T1'), (select jsonb_agg(to_jsonb(p) order by idx) from task_plans p where task_id = '$T1'));")")"
ok "admin of firm B: still no access to firm A" "$(as $B1 "select not exists(select 1 from tasks where company_id = '$CA');")"
ok "admin of firm B cannot assign in firm A" "$(refused "$(as $B1 "select public.coord_assign_plan('$P0', '$WB');")")"

# ---------- roles ----------
ok "full admin makes the coordinator an admin and back" "$(passed "$(as $A1 "select public.set_admin_role('$C1', 'admin'); select public.set_admin_role('$C1', 'coordinator', 'Kemal B.');")")"
ok "name updated with the role" "$(Q -c "select role = 'coordinator' and display_name = 'Kemal B.' from admins where user_id = '$C1'")"
ok "the last full admin cannot be turned into a coordinator" "$(case "$(as $A1 "select public.set_admin_role('$A1', 'coordinator');")" in *last_admin*) echo 1;; *) echo no;; esac)"
ok "invitation as coordinator: role and name arrive with the account" "$(as $A1 "insert into admin_phone_invites(phone, company_id, role, display_name) values ('+4915100000009', '$CA', 'coordinator', 'Leyla');" >/dev/null; as $NEWA "select public.become_admin();" >/dev/null; Q -c "select role = 'coordinator' and display_name = 'Leyla' from admins where user_id = '$NEWA'")"
ok "invited coordinator cannot change orders" "$(refused "$(as $NEWA "with x as (update tasks set title = 'x' where id = '$T1' returning 1) select count(*) from x;")")"
ok "anon cannot call the new functions" "$(Q -c "select not has_function_privilege('anon', 'public.coord_assign_plan(uuid,uuid,integer,text,text)', 'execute') and not has_function_privilege('anon', 'public.my_ref_code()', 'execute') and not has_function_privilege('anon', 'public.set_admin_role(uuid,text,text)', 'execute') and not has_function_privilege('authenticated', 'public._join_target(text)', 'execute')")"
ok "join functions keep their grants (anon may join by link)" "$(Q -c "select has_function_privilege('anon', 'public.join_by_link(text,text)', 'execute') = (select bool_or(true) from pg_proc where proname = 'join_by_link')")"

# ---------- rollback ----------
Q -f "$DOWN" >/dev/null && ok "rollback applies" 1
ok "rollback: coordinators removed (they would be full admins otherwise), admins kept" "$(Q -c "select not exists(select 1 from admins where role = 'coordinator') and exists(select 1 from admins where user_id = '$A1')")"
ok "rollback: original rules back" "$(Q -c "select (select count(*) = 8 from pg_policies where schemaname = 'public' and policyname = 'co_all') and (select count(*) = 0 from pg_policies where policyname in ('co_read','co_write') and tablename <> 'companies')")"
ok "rollback: new functions gone" "$(Q -c "select not exists(select 1 from pg_proc where proname in ('my_company_rw','coord_assign_plan','my_ref_code','set_admin_role','_join_target','my_role'))")"
Q -f "$MIG" >/dev/null && ok "migration applies again after rollback" 1
echo "---"
if [ "$FAIL" = 0 ]; then echo "all $N ok"; else echo "$FAIL of $N FAILED"; exit 1; fi
