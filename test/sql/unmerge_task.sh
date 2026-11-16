#!/usr/bin/env bash
# Test of supabase/2026-11-16_unmerge_task_fix.sql on a throw-away local Postgres with SYNTHETIC data
# (no production connection, no real ids). Rebuilds the Supabase pieces the function needs: roles anon /
# authenticated / service_role / authenticator, auth.uid() (same definition as Supabase), minimal tables.
# Run as root:  bash test/sql/unmerge_task.sh     (needs postgresql binaries, e.g. /usr/lib/postgresql/16/bin)
set -euo pipefail
BIN=${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin | sort -V | tail -1)}
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
DIR=$(mktemp -d); chown postgres "$DIR"; PORT=55432
run(){ su postgres -s /bin/bash -c "$*"; }
cleanup(){ run "$BIN/pg_ctl -D $DIR/data -m immediate stop" >/dev/null 2>&1 || true; rm -rf "$DIR"; }
trap cleanup EXIT
run "$BIN/initdb -D $DIR/data -U postgres -A trust" >/dev/null
run "$BIN/pg_ctl -D $DIR/data -o '-p $PORT -k $DIR' -l $DIR/log start" >/dev/null
sleep 1
Q(){ local user=$1; shift; "$BIN/psql" -h "$DIR" -p $PORT -U "$user" -d postgres -v ON_ERROR_STOP=1 -qAtX "$@"; }
FAIL=0; ok(){ if [ "$2" = "1" ]; then echo "ok   $1"; else echo "FAIL $1"; FAIL=$((FAIL+1)); fi; }

MASTER=11111111-1111-4111-8111-111111111111; ADMIN=22222222-2222-4222-8222-222222222222
T=aaaaaaaa-0000-4000-8000-000000000001; S=aaaaaaaa-0000-4000-8000-000000000002
Q postgres <<SQL
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create role authenticator login noinherit; grant anon, authenticated, service_role to authenticator;
create schema auth; grant usage on schema auth to anon, authenticated, service_role;
create function auth.uid() returns uuid language sql stable as \$f\$
  select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid \$f\$;
grant usage on schema public to anon, authenticated, service_role;
create table platform_admins(user_id uuid primary key);
create table tasks(id uuid primary key, flyers int, merged_into uuid);
create table task_plans(id uuid primary key, task_id uuid, idx int, worker_id uuid);
create table routes(id uuid primary key, task_id uuid);
create table task_workers(task_id uuid, worker_id uuid, primary key(task_id, worker_id));
create table task_merges(id bigserial primary key, target uuid, source uuid, plan_ids uuid[], route_ids uuid[], worker_ids uuid[], source_row jsonb);
insert into platform_admins values ('$MASTER');
-- reset: one synthetic merge (source S into target T)
create function seed() returns void language sql as \$f\$
  truncate tasks, task_plans, routes, task_workers, task_merges;
  insert into tasks values ('$T', 1500, null), ('$S', 500, '$T');
  insert into task_plans values (gen_random_uuid(), '$T', 0, null), ('bbbbbbbb-0000-4000-8000-000000000001', '$T', 1, 'cccccccc-0000-4000-8000-000000000001');
  insert into routes values ('dddddddd-0000-4000-8000-000000000001', '$T');
  insert into task_workers values ('$T', 'cccccccc-0000-4000-8000-000000000001');
  insert into task_merges(target, source, plan_ids, route_ids, worker_ids, source_row) values ('$T', '$S', array['bbbbbbbb-0000-4000-8000-000000000001'::uuid], array['dddddddd-0000-4000-8000-000000000001'::uuid], array['cccccccc-0000-4000-8000-000000000001'::uuid], '{"flyers":500}');
\$f\$;
SQL
merged(){ Q postgres -c "select count(*) from task_merges"; }   # 1 = still merged, 0 = unmerged
# call as an API role: session_user authenticator, role + JWT like PostgREST does
api(){ local role=$1 sub=$2; Q authenticator -c "set role $role; select set_config('request.jwt.claims', '$( [ -n "$sub" ] && echo "{\"sub\":\"$sub\",\"role\":\"$role\"}" || echo '{}')', false); select public.unmerge_task('$S');" >/dev/null 2>$DIR/err && echo OK || sed -n 's/.*ERROR: *//p' $DIR/err | head -1; }

echo "== state as in production (rollback file = exact production definition + grants)"
Q postgres -f "$ROOT/supabase/rollback/2026-11-16_unmerge_task_fix.down.sql"
ok "production md5 of definition reproduced" "$( [ "$(Q postgres -c "select md5(pg_get_functiondef('public.unmerge_task(uuid)'::regprocedure))")" = 28306ff049cbe8b907fea30ebe08a4be ] && echo 1 )"
Q postgres -c "select seed()" >/dev/null; r=$(api anon "")
ok "BEFORE fix: anon without JWT can unmerge (hole reproduced on synthetic data) -> $r, merges left $(merged)" "$( [ "$r" = OK ] && [ "$(merged)" = 0 ] && echo 1 )"

echo "== apply fix"
Q postgres -f "$ROOT/supabase/2026-11-16_unmerge_task_fix.sql"
Q postgres -c "select seed()" >/dev/null; r=$(api anon "")
ok "anon without JWT: refused -> $r; data unchanged" "$( echo "$r" | grep -q 'permission denied' && [ "$(merged)" = 1 ] && echo 1 )"
r=$(api authenticated "$ADMIN")
ok "signed-in admin, not master: refused -> $r; data unchanged" "$( [ "$r" = not_allowed ] && [ "$(merged)" = 1 ] && echo 1 )"
r=$(api authenticated "")
ok "authenticated role without sub: refused -> $r" "$( [ "$r" = not_allowed ] && [ "$(merged)" = 1 ] && echo 1 )"
r=$(api service_role "")
ok "service_role through the API (session authenticator): refused -> $r" "$( [ "$r" = not_allowed ] && [ "$(merged)" = 1 ] && echo 1 )"
Q postgres -c "grant execute on function public.unmerge_task(uuid) to anon" ; r=$(api anon ""); Q postgres -c "revoke execute on function public.unmerge_task(uuid) from anon"
ok "even if EXECUTE is granted to anon again, the body refuses -> $r" "$( [ "$r" = not_allowed ] && [ "$(merged)" = 1 ] && echo 1 )"
r=$(api authenticated "$MASTER")
ok "master (platform admin) signed in: works -> $r; unmerged" "$( [ "$r" = OK ] && [ "$(merged)" = 0 ] && [ "$(Q postgres -c "select merged_into is null from tasks where id='$S'")" = t ] && [ "$(Q postgres -c "select flyers from tasks where id='$T'")" = 1000 ] && echo 1 )"
Q postgres -c "select seed()" >/dev/null
Q postgres -c "select public.unmerge_task('$S')" >/dev/null && r=OK || r=ERR
ok "direct session as postgres (SQL editor): works -> $r" "$( [ "$r" = OK ] && [ "$(merged)" = 0 ] && echo 1 )"
ok "grants after fix: PUBLIC and anon without EXECUTE" "$( [ "$(Q postgres -c "select has_function_privilege('anon','public.unmerge_task(uuid)','execute')::text || has_function_privilege('public','public.unmerge_task(uuid)','execute')::text || has_function_privilege('authenticated','public.unmerge_task(uuid)','execute')::text")" = falsefalsetrue ] && echo 1 )"
ok "fix is idempotent (second run)" "$(Q postgres -f "$ROOT/supabase/2026-11-16_unmerge_task_fix.sql" >/dev/null && echo 1)"

echo "== rollback"
Q postgres -f "$ROOT/supabase/rollback/2026-11-16_unmerge_task_fix.down.sql"
ok "rollback restores the exact production definition (md5)" "$( [ "$(Q postgres -c "select md5(pg_get_functiondef('public.unmerge_task(uuid)'::regprocedure))")" = 28306ff049cbe8b907fea30ebe08a4be ] && echo 1 )"
ok "rollback restores the grants (anon + PUBLIC execute)" "$( [ "$(Q postgres -c "select has_function_privilege('anon','public.unmerge_task(uuid)','execute')::text || has_function_privilege('public','public.unmerge_task(uuid)','execute')::text")" = truetrue ] && echo 1 )"
echo; [ $FAIL = 0 ] && echo "all ok ($("$BIN/postgres" --version))" || { echo "$FAIL FAILED"; exit 1; }
