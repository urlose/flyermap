#!/usr/bin/env bash
# Test of supabase/2026-11-16_ai_phase_b.sql on a throw-away local Postgres with SYNTHETIC data (no production).
# help_request / help_resolve start as the exact production versions (test/sql/fixtures/help_prod_2026-11-16.sql).
# ORDER (env): main = phase B alone (today's production functions)
#              a_then_b / b_then_a = together with the phase A migration of PR #10 (file in AI_A_SQL), in both orders
# Run as root: bash test/sql/ai_phase_b.sh   (ORDER=b_then_a AI_A_SQL=/path/2026-11-16_ai_phase_a.sql bash …)
set -euo pipefail
BIN=${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin | sort -V | tail -1)}
ROOT=$(cd "$(dirname "$0")/../.." && pwd); ORDER=${ORDER:-main}
DIR=$(mktemp -d); chown postgres "$DIR"; PORT=${PORT:-55435}
run(){ su postgres -s /bin/bash -c "$*"; }
cleanup(){ run "$BIN/pg_ctl -D $DIR/data -m immediate stop" >/dev/null 2>&1 || true; rm -rf "$DIR"; }
trap cleanup EXIT
run "$BIN/initdb -D $DIR/data -U postgres -A trust" >/dev/null
run "$BIN/pg_ctl -D $DIR/data -o '-p $PORT -k $DIR' -l $DIR/log start" >/dev/null; sleep 1
Q(){ local user=$1; shift; PGOPTIONS="-c client_min_messages=warning" "$BIN/psql" -h "$DIR" -p $PORT -U "$user" -d postgres -v ON_ERROR_STOP=1 -qAtX "$@"; }
FAIL=0; N=0; ok(){ N=$((N+1)); if [ "$2" = "1" ]; then echo "ok   $1"; else echo "FAIL $1"; FAIL=$((FAIL+1)); fi; }
B="$ROOT/supabase/2026-11-16_ai_phase_b.sql"; A=${AI_A_SQL:-}
[ "$ORDER" = main ] || [ -f "$A" ] || { echo "ORDER=$ORDER needs AI_A_SQL"; exit 2; }

COA=c0000000-0000-4000-8000-00000000000a; COB=c0000000-0000-4000-8000-00000000000b
ADA=a0000000-0000-4000-8000-00000000000a; ADB=a0000000-0000-4000-8000-00000000000b
WA=e0000000-0000-4000-8000-00000000000a; WB=e0000000-0000-4000-8000-00000000000b
TOKA=f0000000-0000-4000-8000-00000000000a; TA=10000000-0000-4000-8000-00000000000a; PA=20000000-0000-4000-8000-00000000000a

Q postgres <<SQL
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create role authenticator login noinherit; grant anon, authenticated, service_role to authenticator;
create schema auth; grant usage on schema auth to anon, authenticated, service_role;
create function auth.uid() returns uuid language sql stable as \$f\$
  select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid \$f\$;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;      -- like Supabase
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
alter table help_requests enable row level security; alter table notifications enable row level security;
create function public.my_company() returns uuid language sql stable security definer set search_path to 'public' as \$f\$ select company_id from public.admins where user_id = auth.uid() \$f\$;
create function public.is_master() returns boolean language sql stable security definer set search_path to 'public' as \$f\$ select exists(select 1 from platform_admins where user_id = auth.uid()) \$f\$;
create policy help_requests_admin_read on help_requests for select using (company_id = my_company());
create function public._worker(p_token uuid) returns workers language plpgsql security definer set search_path to 'public' as \$f\$
declare w workers; begin select * into w from workers where token = p_token; if not found then raise exception 'invalid_token'; end if; return w; end \$f\$;
create function public._help_bot_ping(p_id uuid) returns void language plpgsql security definer set search_path to 'public' as \$f\$ begin null; end \$f\$;
revoke execute on function public._worker(uuid), public._help_bot_ping(uuid) from public, anon, authenticated;
insert into companies values ('$COA', 'Firma A', true), ('$COB', 'Firma B', true);
insert into admins values ('$ADA', '$COA'), ('$ADB', '$COB');
insert into workers values ('$WA', 'Anna Schmidt', '$TOKA', '$COA'), ('$WB', 'Boris Petrov', gen_random_uuid(), '$COB');
insert into tasks values ('$TA', '$COA', 'Auftrag A'); insert into task_plans values ('$PA', '$TA', '$WA');
SQL
Q postgres -f "$ROOT/test/sql/fixtures/help_prod_2026-11-16.sql"
Q postgres -c "revoke all on function public.help_resolve(uuid,text,text) from public, anon"
md5s(){ Q postgres -c "select md5(pg_get_functiondef('public.help_request(uuid,uuid,text,text,double precision,double precision)'::regprocedure)) || md5(pg_get_functiondef('public.help_resolve(uuid,text,text)'::regprocedure))"; }
api(){ local role=$1 sub=$2 sql=$3; local claims='{}'; [ -n "$sub" ] && claims="{\"sub\":\"$sub\",\"role\":\"$role\"}"
  Q authenticator -c "set role $role; select set_config('request.jwt.claims', '$claims', false);" -c "$sql" >$DIR/out 2>$DIR/err && { echo OK; return; }
  sed -n 's/.*ERROR: *//p' $DIR/err | head -1; }
val(){ tail -1 $DIR/out; }
denied(){ case "$1" in "permission denied"*) echo 1;; esac; }
newreq(){ api anon "" "select public.help_request('$TOKA', '$PA', '$1', '$2', null, null)" >/dev/null; val; }
bot(){ Q authenticator -c "set role service_role; update public.help_requests set bot_draft = $2, bot_action = '${3:-answer}', bot_note = 'n', bot_at = clock_timestamp(), bot_tokens = 100 where id = '$1'" >/dev/null; }
sq(){ Q postgres -c "$1"; }
# approve as the admin screen will: send back exactly the cleaned texts the admin saw
approve(){ local id=$1 who=${2:-$ADA} sc an; sc=$(sq "select scenario from help_solutions where id='$id'"); an=$(sq "select approved_answer from help_solutions where id='$id'")
  api authenticated "$who" "select public.help_solution_approve('$id', \$s\$$sc\$s\$, \$s\$$an\$s\$)"; }

# a report with a draft BEFORE the migration (backfill)
R0=$(newreq other 'Alte Meldung'); bot "$R0" "'Alter Entwurf'"
echo "== order: $ORDER"
case "$ORDER" in a_then_b) Q postgres -f "$A"; Q postgres -f "$B";; b_then_a) Q postgres -f "$B"; Q postgres -f "$A";; *) Q postgres -f "$B";; esac
MD5_BEFORE=$(md5s)

echo "-- 1. draft history"
ok "existing draft became version 1" "$( [ "$(sq "select count(*)::text || max(version) || max(draft) from help_drafts where help_request_id='$R0'")" = "11Alter Entwurf" ] && echo 1 )"
R1=$(newreq other 'Wie läuft das mit dem Studio?')
bot "$R1" "'Entwurf eins'"; bot "$R1" "'Entwurf  ZWEI '"; bot "$R1" "null" error
ok "three bot runs → versions 1, 2, 3 kept (also the failed run), nothing overwritten" "$( [ "$(sq "select string_agg(version || ':' || coalesce(draft, '-') || ':' || action, '|' order by version) from help_drafts where help_request_id='$R1'")" = "1:Entwurf eins:answer|2:Entwurf  ZWEI :answer|3:-:error" ] && echo 1 )"
r=$(api anon "" "select count(*) from public.help_drafts"); ok "anon cannot read drafts" "$(denied "$r")"
r=$(api authenticated "$ADA" "select count(*) from public.help_drafts"); ok "admin A reads the drafts of company A" "$( [ "$r" = OK ] && [ "$(val)" -ge 4 ] && echo 1 )"
r=$(api authenticated "$ADB" "select count(*) from public.help_drafts"); ok "admin B sees none of company A's drafts" "$( [ "$r" = OK ] && [ "$(val)" = 0 ] && echo 1 )"
r=$(api authenticated "$ADA" "insert into public.help_drafts(help_request_id, company_id, version) values ('$R1', '$COA', 9)"); ok "admins cannot write drafts directly" "$(denied "$r")"

echo "-- 2. outcome of the draft"
api authenticated "$ADA" "select public.help_resolve('$R1', '  entwurf zwei ', null)" >/dev/null
ok "admin sends the latest draft (spaces / case differ) → taken" "$( [ "$(sq "select outcome || (draft_id = (select id from help_drafts where help_request_id='$R1' and version=2))::text from help_request_outcomes where help_request_id='$R1'")" = takentrue ] && echo 1 )"
R2=$(newreq flyers 'Flyer übrig'); bot "$R2" "'Bring sie ins Studio.'"
api authenticated "$ADA" "select public.help_resolve('$R2', 'Bitte gib sie morgen im Studio ab.', null)" >/dev/null
ok "admin writes own text → edited, own text stored" "$( [ "$(sq "select outcome || '|' || final_answer from help_request_outcomes where help_request_id='$R2'")" = "edited|Bitte gib sie morgen im Studio ab." ] && echo 1 )"
R3=$(newreq other 'Frage'); bot "$R3" "'Ein Entwurf'"
api authenticated "$ADA" "select public.help_resolve('$R3', '', null)" >/dev/null
ok "admin closes without text → rejected" "$( [ "$(sq "select outcome from help_request_outcomes where help_request_id='$R3'")" = rejected ] && echo 1 )"
R4=$(newreq other 'Ohne Entwurf'); api authenticated "$ADA" "select public.help_resolve('$R4', 'Antwort ohne Entwurf', null)" >/dev/null
ok "no draft existed → no_draft" "$( [ "$(sq "select outcome from help_request_outcomes where help_request_id='$R4'")" = no_draft ] && echo 1 )"
R5=$(newreq closed 'Baustelle')
ok "closed by the automatic answer → auto" "$( [ "$(sq "select outcome || coalesce(decided_by::text, '-') from help_request_outcomes where help_request_id='$R5'")" = "auto-" ] && echo 1 )"
R6=$(newreq gps 'GPS spinnt'); bot "$R6" "'GPS-Entwurf'"
api authenticated "$ADA" "select public.help_resolve('$R6', '', null)" >/dev/null
ok "automatic GPS advice + draft, admin closes empty → rejected (the automatic text is not the admin's)" "$( [ "$(sq "select outcome || coalesce(final_answer, '-') from help_request_outcomes where help_request_id='$R6'")" = "rejected-" ] && echo 1 )"
R7=$(newreq gps 'GPS 2'); bot "$R7" "'Neu starten und Standort prüfen.'"
api authenticated "$ADA" "select public.help_resolve('$R7', 'Neu starten und Standort prüfen.', null)" >/dev/null
ok "automatic GPS advice + admin sends the draft → taken" "$( [ "$(sq "select outcome from help_request_outcomes where help_request_id='$R7'")" = taken ] && echo 1 )"
ok "open reports have no outcome" "$( [ "$(sq "select count(*) from help_request_outcomes where help_request_id='$R0'")" = 0 ] && echo 1 )"
r=$(api authenticated "$ADA" "select public.help_outcome_set('$R3', 'edited')"); ok "admin A corrects the mark → edited, corrected" "$( [ "$r" = OK ] && [ "$(sq "select outcome || corrected::text from help_request_outcomes where help_request_id='$R3'")" = editedtrue ] && echo 1 )"
r=$(api authenticated "$ADB" "select public.help_outcome_set('$R3', 'taken')"); ok "admin B cannot change A's mark → not_found" "$( [ "$r" = not_found ] && echo 1 )"
r=$(api authenticated "$ADA" "select public.help_outcome_set('$R3', 'auto')"); ok "only taken / edited / rejected can be set → outcome_invalid" "$( [ "$r" = outcome_invalid ] && echo 1 )"
r=$(api anon "" "select public.help_outcome_set('$R3', 'taken')"); ok "anon cannot set marks" "$(denied "$r")"
r=$(api authenticated "$ADB" "select count(*) from public.help_request_outcomes"); ok "admin B sees none of A's outcomes" "$( [ "$r" = OK ] && [ "$(val)" = 0 ] && echo 1 )"

echo "-- 3. personal data removed"
PII="Anna Schmidt hat angerufen: 0171 2345678, +49 821 123456, anna.s@example.de, Max-Eyth-Straße 6, Hauptstr. 12a, Standort 48.45012, 10.22013, https://maps.example.com/x, id 3f224ebd-5beb-4c1d-bf94-9064805a2e1c, IBAN DE89 3704 0044 0532 0130 00. Boris ist nicht von uns."
r=$(api authenticated "$ADA" "select public.help_solution_propose('$R2', '$PII', 'Sag Anna: Flyer ins Studio, ул. Ленина, д. 5 ist egal', null, 'AUTO', 'leftover_small')"); SOL=$(val)
[ "$r" = OK ] || echo "propose failed: $r"; S1=$(echo "$SOL" | node -e "const j=JSON.parse(require('fs').readFileSync(0,'utf8'));process.stdout.write(String(j.id))" 2>/dev/null || true)
SC=$(sq "select scenario from help_solutions where id='$S1'"); AN=$(sq "select approved_answer from help_solutions where id='$S1'")
ok "proposal saved as draft for company A" "$( [ "$r" = OK ] && [ "$(sq "select status || company_id from help_solutions where id='$S1'")" = "draft$COA" ] && echo 1 )"
for x in 'Anna' 'Schmidt' '0171' '2345678' '821 123456' 'anna.s@' 'Eyth' 'Hauptstr' '48.45012' '10.22013' 'maps.example' '3f224ebd' 'DE89'; do
  ok "removed from the scenario: $x" "$(echo "$SC" | grep -qF "$x" || echo 1)"; done
ok "placeholders present ({Name} {Telefon} {E-Mail} {Adresse} {Ort} {Link} {ID} {IBAN})" "$(for p in '{Name}' '{Telefon}' '{E-Mail}' '{Adresse}' '{Ort}' '{Link}' '{ID}' '{IBAN}'; do echo "$SC" | grep -qF "$p" || exit; done; echo 1)"
ok "names of another company are not known here (Boris stays) – only own workers are matched" "$(echo "$SC" | grep -qF 'Boris' && echo 1)"
ok "answer: own worker name and Russian address removed" "$(echo "$AN" | grep -qF 'Anna' || echo "$AN" | grep -qF 'Ленина' || echo 1)"
ok "what was removed is recorded" "$( [ "$(sq "select redactions ?& array['name','phone','email','address','coords','link','id','iban'] from help_solutions where id='$S1'")" = t ] && echo 1 )"
ok "normal words are kept (\"Flyer\", \"Studio\", numbers like 10 000)" "$(api authenticated "$ADA" "select public.help_solution_propose(null, 'Es sind 10000 Flyer und 1.200 Briefkästen', 'Flyer ins Studio bringen', 'flyers', null, null)" >/dev/null; [ "$(sq "select scenario from help_solutions where category='flyers' and source_request_id is null")" = 'Es sind 10000 Flyer und 1.200 Briefkästen' ] && echo 1)"
r=$(api authenticated "$ADB" "select public.help_solution_propose('$R2', 'x', 'y', null, null, null)"); ok "admin B cannot save a solution from A's report → not_found" "$( [ "$r" = not_found ] && echo 1 )"
r=$(api authenticated "$ADA" "select public.help_solution_propose(null, '', '', null, null, null)"); ok "empty texts → text_required" "$( [ "$r" = text_required ] && echo 1 )"
r=$(api authenticated "$ADA" "select public.help_solution_propose(null, 'a', 'b', null, 'LATER', null)"); ok "unknown mode → mode_invalid" "$( [ "$r" = mode_invalid ] && echo 1 )"
r=$(api anon "" "select public.help_solution_propose(null, 'a', 'b', null, null, null)"); ok "anon cannot save solutions" "$(denied "$r")"
r=$(api authenticated "$ADA" "select public.help_solution_update('$S1', 'Viele Flyer übrig, Anna fragt', 'Ins Start-Studio bringen.', 'flyers', 'AUTO', 'leftover_small')")
ok "editing a draft cleans again" "$( [ "$r" = OK ] && [ "$(sq "select scenario from help_solutions where id='$S1'")" = 'Viele Flyer übrig, {Name} fragt' ] && echo 1 )"

echo "-- 4. only approved solutions of the same company are used"
r=$(api service_role "" "select count(*) from public.help_solutions_for('$COA', 'flyers', 'Flyer übrig', 3)"); ok "drafts are never returned (0 before approval)" "$( [ "$r" = OK ] && [ "$(val)" = 0 ] && echo 1 )"
r=$(api authenticated "$ADA" "select public.help_solution_approve('$S1', null, null)"); ok "approve without the admin's check of the cleaned text → review_required" "$( [ "$r" = review_required ] && echo 1 )"
r=$(api authenticated "$ADA" "select public.help_solution_approve('$S1', 'Viele Flyer übrig, Anna fragt', 'Ins Start-Studio bringen.')"); ok "admin saw another text than the stored cleaned one → review_outdated" "$( [ "$r" = review_outdated ] && echo 1 )"
ok "still a draft after the refused approvals" "$( [ "$(sq "select status from help_solutions where id='$S1'")" = draft ] && echo 1 )"
approve "$S1" >/dev/null
ok "admin approves with the cleaned texts → approved, reviewed by the admin" "$( [ "$(sq "select status || (approved_by = '$ADA')::text from help_solutions where id='$S1'")" = approvedtrue ] && [ "$(sq "select (reviewed_by = '$ADA' and reviewed_at is not null)::text from help_solutions where id='$S1'")" = true ] && echo 1 )"
r=$( (Q postgres -c "insert into help_solutions(company_id, category, scenario, approved_answer, status, approved_at) values ('$COA', 'flyers', 'ohne Prüfung', 'x', 'approved', now())" 2>&1 || true) | grep -c help_solutions_reviewed); ok "approved without review is impossible even by direct database insert" "$( [ "$r" -ge 1 ] && echo 1 )"
r=$(api authenticated "$ADA" "select public.help_solution_update('$S1', 'neu', 'neu', null, null, null)"); ok "approved solution cannot be edited → solution_frozen" "$( [ "$r" = solution_frozen ] && echo 1 )"
r=$( (Q postgres -c "update help_solutions set approved_answer = 'x' where id = '$S1'" 2>&1 || true) | sed -n 's/.*ERROR: *//p'); ok "frozen even for a direct database update" "$( [ "$r" = solution_frozen ] && echo 1 )"
SX=$(sq "insert into help_solutions(company_id, category, scenario, approved_answer) values ('$COA', 'other', 'Ruf 0171 9999999 an', 'ok') returning id")
r=$(approve "$SX"); ok "a draft that still contains personal data cannot be approved → personal_data_found" "$( [ "$r" = personal_data_found ] && echo 1 )"
ins(){ sq "insert into help_solutions(company_id, category, scenario, approved_answer, status, approved_at, reviewed_at) values ('$1', '$2', '$3', '$4', 'approved', now() - interval '$5 minutes', now()) returning id"; }
ins "$COA" other 'Hund bellt am Gartentor' 'Gartentor auslassen und Hund im Bericht melden' 1 >/dev/null
ins "$COA" other 'Kunde fragt nach Rechnung' 'An das Büro verweisen' 2 >/dev/null
ins "$COA" other 'Regen, Flyer nass' 'Pause machen, Flyer trocken halten' 3 >/dev/null
ins "$COB" flyers 'Flyer übrig bei B' 'B-Antwort' 0 >/dev/null
r=$(api service_role "" "select count(*) from public.help_solutions_for('$COA', 'flyers', 'viele Flyer übrig', 3)"); ok "use of solutions is OFF by default → nothing returned even for approved ones" "$( [ "$r" = OK ] && [ "$(val)" = 0 ] && echo 1 )"
r=$(api authenticated "$ADA" "insert into public.help_settings(company_id, use_solutions) values ('$COA', true)"); ok "admins cannot switch the use of solutions on themselves" "$(denied "$r")"
r=$(api authenticated "$ADA" "select count(*) from public.help_settings"); ok "admins can read the setting of their own company" "$( [ "$r" = OK ] && echo 1 )"
sq "insert into help_settings(company_id, use_solutions, note) values ('$COA', true, 'test'), ('$COB', true, 'test')" >/dev/null
r=$(api service_role "" "select string_agg(category, ',') from public.help_solutions_for('$COA', 'flyers', 'viele Flyer übrig', 10)")
ok "server lookup: only the same topic (flyers), other categories are NOT added to fill the limit" "$( [ "$r" = OK ] && [ "$(val)" = "flyers" ] && echo 1 )"
r=$(api service_role "" "select count(*) from public.help_solutions_for('$COA', 'gps', 'GPS zeigt falschen Ort', 3)"); ok "no solution for the topic (gps) → empty, although 4 other approved exist" "$( [ "$(val)" = 0 ] && echo 1 )"
r=$(api service_role "" "select count(*) from public.help_solutions_for('$COA', null, 'Hund bellt am Gartentor', 3)"); ok "no topic given → empty" "$( [ "$(val)" = 0 ] && echo 1 )"
r=$(api service_role "" "select string_agg(scenario, ',') from public.help_solutions_for('$COA', 'other', 'Ein großer Hund steht am Gartentor', 3)"); ok "category other: only the one sharing 2+ words (Hund, Gartentor)" "$( [ "$(val)" = "Hund bellt am Gartentor" ] && echo 1 )"
r=$(api service_role "" "select count(*) from public.help_solutions_for('$COA', 'other', 'Frage zum Lohn', 3)"); ok "category other, nothing in common → empty (not the 3 newest)" "$( [ "$(val)" = 0 ] && echo 1 )"
r=$(api service_role "" "select count(*) from public.help_solutions_for('$COA', 'other', 'bitte nicht heute, Flyer', 3)"); ok "category other: common words (bitte, nicht, heute) do not count as a match" "$( [ "$(val)" = 0 ] && echo 1 )"
sq "update help_settings set use_solutions = false where company_id = '$COA'" >/dev/null
r=$(api service_role "" "select count(*) from public.help_solutions_for('$COA', 'flyers', 'Flyer übrig', 3)"); ok "switched off again → nothing returned" "$( [ "$(val)" = 0 ] && echo 1 )"
sq "update help_settings set use_solutions = true where company_id = '$COA'" >/dev/null
r=$(api service_role "" "select count(*) from public.help_solutions_for('$COA', 'flyers', 'x', 3) where approved_answer = 'B-Antwort'"); ok "company B's solution never returned for A" "$( [ "$(val)" = 0 ] && echo 1 )"
r=$(api service_role "" "select string_agg(approved_answer, ',') from public.help_solutions_for('$COB', 'flyers', 'Flyer', 3)"); ok "company B gets only its own" "$( [ "$(val)" = "B-Antwort" ] && echo 1 )"
r=$(api authenticated "$ADA" "select * from public.help_solutions_for('$COA', 'flyers', 'x', 3)"); ok "admins cannot call the server lookup (not even for their own company)" "$(denied "$r")"
r=$(api anon "" "select * from public.help_solutions_for('$COA', 'flyers', 'x', 3)"); ok "anon cannot call the server lookup" "$(denied "$r")"
r=$(api authenticated "$ADB" "select count(*) from public.help_solutions where company_id = '$COA'"); ok "admin B cannot read A's solutions" "$( [ "$r" = OK ] && [ "$(val)" = 0 ] && echo 1 )"
r=$(api anon "" "select count(*) from public.help_solutions"); ok "anon: no access to solutions" "$(denied "$r")"
r=$(api authenticated "$ADA" "update public.help_solutions set status = 'approved'"); ok "admins cannot change solutions directly" "$(denied "$r")"

echo "-- 5. versions"
r=$(api authenticated "$ADA" "select public.help_solution_revise('$S1')"); S2=$(val)
ok "revise → new draft version 2 of the approved one" "$( [ "$(sq "select version || status || (parent_id = '$S1')::text from help_solutions where id='$S2'")" = 2drafttrue ] && echo 1 )"
r=$(api authenticated "$ADA" "select public.help_solution_revise('$S1')"); ok "only one open new version at a time → draft_exists" "$( [ "$r" = draft_exists ] && echo 1 )"
r=$(api service_role "" "select string_agg(version::text, ',') from public.help_solutions_for('$COA', 'flyers', 'Flyer', 1)"); ok "until the new version is approved, version 1 is used" "$( [ "$(val)" = 1 ] && echo 1 )"
api authenticated "$ADA" "select public.help_solution_update('$S2', 'Viele Flyer übrig', 'Ins Studio – oder Admin fragen, wenn zu weit.', 'flyers', 'AUTO', 'leftover_small')" >/dev/null
approve "$S2" >/dev/null
ok "approving version 2 archives version 1" "$( [ "$(sq "select string_agg(version || status, ',' order by version) from help_solutions where id in ('$S1', '$S2')")" = "1archived,2approved" ] && echo 1 )"
r=$(api service_role "" "select string_agg(version::text, ',') from public.help_solutions_for('$COA', 'flyers', 'Flyer', 1)"); ok "now version 2 is used" "$( [ "$(val)" = 2 ] && echo 1 )"
api authenticated "$ADA" "select public.help_solution_archive('$S2')" >/dev/null
r=$(api service_role "" "select count(*) from public.help_solutions_for('$COA', 'flyers', 'Flyer', 3) where category = 'flyers'"); ok "archived → no longer used" "$( [ "$(val)" = 0 ] && echo 1 )"
r=$(approve "$S2"); ok "archived cannot be approved again" "$( [ "$r" = not_draft ] && echo 1 )"

echo "-- 6. parallel draft writes (_help_draft_keep)"
RC=$(newreq other 'Parallel'); pids=()
for k in $(seq 1 20); do ( bot "$RC" "'P$k'" 2>$DIR/perr$k ) & pids+=($!); done; e=0; for p in "${pids[@]}"; do wait $p || e=$((e+1)); done
ok "20 parallel bot runs on ONE report: no error" "$( [ $e = 0 ] && [ -z "$(cat $DIR/perr* 2>/dev/null)" ] && echo 1 )"
ok "20 parallel runs → versions 1..20, no gap, no duplicate, every draft kept" "$( [ "$(sq "select count(*) || ':' || min(version) || ':' || max(version) || ':' || count(distinct version) || ':' || count(distinct draft) from help_drafts where help_request_id='$RC'")" = "20:1:20:20:20" ] && echo 1 )"
RS=(); for j in 1 2 3 4 5; do RS+=("$(newreq other "Mehrere $j")"); done; pids=(); rm -f $DIR/perr*
for j in 0 1 2 3 4; do for k in 1 2 3 4 5; do ( bot "${RS[$j]}" "'M$j-$k'" 2>$DIR/perr$j$k ) & pids+=($!); done; done; e=0; for p in "${pids[@]}"; do wait $p || e=$((e+1)); done
ok "5 reports × 5 parallel runs: no error, each report has exactly versions 1..5" "$( [ $e = 0 ] && [ "$(sq "select string_agg(distinct (count_v || ':' || max_v), ',') from (select count(*) count_v, max(version) max_v from help_drafts where help_request_id in ('${RS[0]}','${RS[1]}','${RS[2]}','${RS[3]}','${RS[4]}') group by help_request_id) x")" = "5:5" ] && echo 1 )"
# another writer holds version 21 in an open transaction while the bot writes → the bot waits and takes 22, no error
( Q postgres -c "begin; insert into help_drafts(help_request_id, company_id, version, draft) values ('$RC', '$COA', 21, 'direkt'); select pg_sleep(2); commit;" >/dev/null ) & HOLD=$!
sleep 0.5; ce=0; bot "$RC" "'nach Konflikt'" 2>$DIR/cerr || ce=$?; wait $HOLD
ok "version number taken by a parallel direct write → bot gets the next free one (22), no error" "$( [ $ce = 0 ] && [ ! -s $DIR/cerr ] && [ "$(sq "select string_agg(version || '=' || draft, ',' order by version) from help_drafts where help_request_id='$RC' and version > 20")" = "21=direkt,22=nach Konflikt" ] && echo 1 )"

echo "-- rights"
ok "trigger functions and help_redact not callable by anon / authenticated" "$( [ "$(sq "select bool_or(has_function_privilege(r, f, 'execute')) from unnest(array['anon','authenticated']) r, unnest(array['public._help_draft_keep()','public._help_outcome()','public._help_solution_frozen()','public.help_redact(text,uuid)']::regprocedure[]) f")" = f ] && echo 1 )"
ok "admin functions: authenticated yes, anon no" "$( [ "$(sq "select bool_and(has_function_privilege('authenticated', f, 'execute') and not has_function_privilege('anon', f, 'execute')) from unnest(array['public.help_outcome_set(uuid,text)','public.help_solution_propose(uuid,text,text,text,text,text)','public.help_solution_update(uuid,text,text,text,text,text)','public.help_solution_approve(uuid,text,text)','public.help_solution_revise(uuid)','public.help_solution_archive(uuid)']::regprocedure[]) f")" = t ] && echo 1 )"
ok "anon has no rights on the three new tables" "$( [ "$(sq "select bool_or(has_table_privilege('anon', t, 'select,insert,update,delete')) from unnest(array['public.help_drafts','public.help_request_outcomes','public.help_solutions','public.help_settings']) t")" = f ] && echo 1 )"
ok "help_request / help_resolve untouched by phase B" "$( [ "$(md5s)" = "$MD5_BEFORE" ] && echo 1 )"
ok "migration is idempotent (second run, no double backfill)" "$(Q postgres -f "$B" >/dev/null && [ "$(sq "select count(*) from help_drafts where help_request_id='$R0'")" = 1 ] && echo 1)"

echo "== rollback"
Q postgres -f "$ROOT/supabase/rollback/2026-11-16_ai_phase_b.down.sql"
ok "tables, functions and triggers removed; reports and existing functions unchanged" "$( [ "$(sq "select to_regclass('public.help_drafts') is null and to_regclass('public.help_solutions') is null and to_regclass('public.help_request_outcomes') is null and to_regclass('public.help_settings') is null and to_regprocedure('public.help_solution_approve(uuid,text,text)') is null and to_regprocedure('public.help_redact(text,uuid)') is null and not exists(select 1 from pg_trigger where tgrelid='public.help_requests'::regclass and not tgisinternal) and (select count(*) from help_requests) > 0")" = t ] && [ "$(md5s)" = "$MD5_BEFORE" ] && echo 1 )"
echo; [ $FAIL = 0 ] && echo "all $N ok (order $ORDER, $("$BIN/postgres" --version))" || { echo "$FAIL of $N FAILED (order $ORDER)"; exit 1; }
