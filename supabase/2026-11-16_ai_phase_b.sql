-- FlyerMap AI, phase B (16.11.2026): draft history, outcome of every draft, verified solutions of the admin.
-- NOT applied to production – only after explicit approval. Server side only (no app screen yet).
-- Independent of the phase A migration (PR #10): works with today's help_request / help_resolve and with the PR #10
-- versions, in any order (it does not redefine any existing function, it only adds triggers, tables and functions).
--
--   1. help_drafts           – every run of the help bot is kept as a new version (help-bot only overwrites bot_draft).
--   2. help_request_outcomes – when a report is closed: was Claude's latest draft taken, edited, rejected (or there was
--                              no draft / an automatic answer). The admin can correct the mark.
--   3. help_solutions        – solutions the admin saved from a report; personal data is removed on the server
--                              (help_redact) before saving and checked again before approval. The cleaning is no
--                              guarantee: approval needs the admin's check of the exact cleaned text. Only APPROVED and
--                              REVIEWED solutions of the SAME company and the SAME topic are returned (help_solutions_for,
--                              server only) – and only once use_solutions is switched on (help_settings, default OFF).
--                              An approved solution is frozen; a change is a new version that replaces it on approval.
-- Reports closed before this migration get no outcome (their answers were partly wiped by the old help_resolve, a mark
-- would be a guess).
-- Rights: no anon access at all; admins read their own company and change things only through the functions; the server
-- (service_role) may read approved solutions. Retention of these tables is an open decision (they go with the report).
-- Rollback: supabase/rollback/2026-11-16_ai_phase_b.down.sql
begin;

-- 0. remove personal data from a text ------------------------------------------------------------------------------------
-- e-mail, link, ids, IBAN, coordinates, phone numbers, street + house number (DE / RU), names of the company's workers.
-- Returns { text, found:[kinds] }. Deliberately strict: a solution should describe the situation, not the person.
create or replace function public.help_redact(p_text text, p_company uuid)
 returns jsonb language plpgsql stable security definer set search_path to 'public'
as $function$
declare
  t text := coalesce(p_text, ''); found text[] := '{}';
  L constant text := 'A-Za-zÄÖÜäöüßÀ-ÿА-Яа-яЁё';
  part text; pat text;
  rules constant text[][] := array[
    array['link',    'https?://[^[:space:]]+|www\.[^[:space:]]+',                                    '{Link}'],
    array['email',   '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}',                               '{E-Mail}'],
    array['id',      '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}',  '{ID}'],
    array['iban',    '[A-Z]{2}[0-9]{2}( ?[0-9A-Z]{4}){3,7}( ?[0-9A-Z]{1,4})?',                        '{IBAN}'],
    array['coords',  '-?[0-9]{1,3}[.,][0-9]{4,}',                                                     '{Ort}'],
    array['phone',   '(\+|00)[0-9][0-9 ()/-]{6,}[0-9]|0[0-9]{2,5}[ /-]?[0-9][0-9 -]{4,}[0-9]|[0-9]{7,}', '{Telefon}']];
  r text[];
begin
  foreach r slice 1 in array rules loop
    if t ~ r[2] then found := array_append(found, r[1]); t := regexp_replace(t, r[2], r[3], 'g'); end if;
  end loop;
  -- street + house number: "Max-Eyth-Straße 6", "Hauptstr. 12a", "Am Ring 3"; RU: "ул. Ленина, д. 5"
  pat := '[' || L || '.-]*(straße|strasse|str\.|weg|gasse|allee|platz|ring|damm|ufer|chaussee|steig|pfad|markt)[ ]*[0-9]+[a-zA-Z]?';
  if t ~* pat then found := array_append(found, 'address'); t := regexp_replace(t, pat, '{Adresse}', 'gi'); end if;
  pat := '(ул\.|улица|пр\.|проспект|пер\.|переулок)[ ]*[' || L || ' .-]+,?[ ]*(д\.|дом)?[ ]*[0-9]+[а-яa-z]?';
  if t ~* pat then found := array_append(found, 'address'); t := regexp_replace(t, pat, '{Adresse}', 'gi'); end if;
  -- names of the company's workers (every part of the name with 3+ letters), whole words only
  if p_company is not null then
    for part in select distinct x from workers w, regexp_split_to_table(coalesce(w.name, ''), '[[:space:]]+') x where w.company_id = p_company and length(x) >= 3 loop
      pat := '(^|[^' || L || '])(' || regexp_replace(part, '([.*+?^${}()|\[\]\\])', '\\\1', 'g') || ')($|[^' || L || '])';
      if t ~* pat then
        if not ('name' = any(found)) then found := array_append(found, 'name'); end if;
        t := regexp_replace(t, pat, '\1{Name}\3', 'gi');
        t := regexp_replace(t, pat, '\1{Name}\3', 'gi');   -- twice: neighbouring names share a separator
      end if;
    end loop;
  end if;
  return jsonb_build_object('text', t, 'found', to_jsonb(array(select distinct unnest(found) order by 1)));
end $function$;
revoke all on function public.help_redact(text, uuid) from public, anon, authenticated;
grant execute on function public.help_redact(text, uuid) to service_role;

-- 1. draft history -------------------------------------------------------------------------------------------------------
create table if not exists public.help_drafts(
  id uuid primary key default gen_random_uuid(),
  help_request_id uuid not null references public.help_requests(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  version integer not null,
  draft text, action text, note text, tokens integer,
  created_at timestamptz not null default now(),
  constraint help_drafts_version unique (help_request_id, version)
);
alter table public.help_drafts enable row level security;

-- every bot run (bot_at changes) becomes a new version; the bot itself only overwrites the columns of help_requests
-- Parallel writes: runs for the same report are serialised by a transaction lock per report (the row lock of the UPDATE
-- already does this for the bot, the extra lock also covers other writers); if a version number is still taken (a row
-- written directly by the server in another transaction), the next free number is used – never an error for the bot.
create or replace function public._help_draft_keep() returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare tries integer := 0;
begin
  if new.bot_at is not null and new.bot_at is distinct from old.bot_at then
    perform pg_advisory_xact_lock(hashtextextended('help_drafts:' || new.id::text, 0));
    loop
      begin
        insert into help_drafts(help_request_id, company_id, version, draft, action, note, tokens, created_at)
        values (new.id, new.company_id, coalesce((select max(version) from help_drafts where help_request_id = new.id), 0) + 1,
                new.bot_draft, new.bot_action, new.bot_note, new.bot_tokens, new.bot_at);
        exit;
      exception when unique_violation then
        tries := tries + 1;
        if tries >= 10 then raise; end if;
      end;
    end loop;
  end if;
  return null;
end $function$;
revoke all on function public._help_draft_keep() from public, anon, authenticated;
drop trigger if exists help_draft_keep on public.help_requests;
create trigger help_draft_keep after update of bot_at, bot_draft on public.help_requests for each row execute function public._help_draft_keep();

-- drafts that exist today become version 1
insert into public.help_drafts(help_request_id, company_id, version, draft, action, note, tokens, created_at)
select h.id, h.company_id, 1, h.bot_draft, h.bot_action, h.bot_note, h.bot_tokens, coalesce(h.bot_at, h.created_at)
  from public.help_requests h
 where h.bot_at is not null and not exists (select 1 from public.help_drafts d where d.help_request_id = h.id);

-- 2. outcome of the draft when a report is closed ------------------------------------------------------------------------
create table if not exists public.help_request_outcomes(
  help_request_id uuid primary key references public.help_requests(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  outcome text not null check (outcome in ('taken', 'edited', 'rejected', 'no_draft', 'auto')),
  draft_id uuid references public.help_drafts(id) on delete set null,
  final_answer text,
  decided_at timestamptz not null default now(),
  decided_by uuid,
  corrected boolean not null default false
);
alter table public.help_request_outcomes enable row level security;

-- taken: the admin sent the latest draft (same text, ignoring spaces and case); edited: sent a different own text;
-- rejected: there was a draft but the admin closed without own text; no_draft: closed, no draft existed;
-- auto: closed by the automatic answer, nobody decided. Works with both versions of help_resolve (PR #10 keeps the
-- automatic answer when closing empty: that text is not counted as the admin's text).
create or replace function public._help_outcome() returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare d help_drafts; auto_txt text; admin_txt text; v text;
begin
  if not (new.status = 'done' and old.status is distinct from 'done') then return null; end if;
  select * into d from help_drafts where help_request_id = new.id and draft is not null order by version desc limit 1;
  auto_txt := coalesce(to_jsonb(new) ->> 'auto_answer', case when old.auto then old.answer end, case when new.auto and new.answered_by is null then new.answer end);
  admin_txt := nullif(trim(coalesce(new.answer, '')), '');
  if admin_txt is not null and auto_txt is not null and admin_txt = trim(auto_txt) then admin_txt := null; end if;
  v := case
    when new.auto and new.answered_by is null then 'auto'
    when d.id is null then 'no_draft'
    when admin_txt is null then 'rejected'
    when lower(regexp_replace(admin_txt, '[[:space:]]+', ' ', 'g')) = lower(regexp_replace(trim(d.draft), '[[:space:]]+', ' ', 'g')) then 'taken'
    else 'edited' end;
  insert into help_request_outcomes(help_request_id, company_id, outcome, draft_id, final_answer, decided_at, decided_by)
  values (new.id, new.company_id, v, d.id, admin_txt, now(), new.answered_by)
  on conflict (help_request_id) do update set outcome = excluded.outcome, draft_id = excluded.draft_id, final_answer = excluded.final_answer,
    decided_at = excluded.decided_at, decided_by = excluded.decided_by, corrected = false;
  return null;
end $function$;
revoke all on function public._help_outcome() from public, anon, authenticated;
drop trigger if exists help_outcome on public.help_requests;
create trigger help_outcome after update of status on public.help_requests for each row execute function public._help_outcome();

-- the admin corrects the mark (e.g. took the idea of the draft but wrote it new)
create or replace function public.help_outcome_set(p_request uuid, p_outcome text)
 returns void language plpgsql security definer set search_path to 'public'
as $function$
declare co uuid := public.my_company();
begin
  if co is null then raise exception 'not_admin'; end if;
  if p_outcome not in ('taken', 'edited', 'rejected') then raise exception 'outcome_invalid'; end if;
  update help_request_outcomes set outcome = p_outcome, corrected = true, decided_by = auth.uid(), decided_at = now()
   where help_request_id = p_request and company_id = co;
  if not found then raise exception 'not_found'; end if;
end $function$;
revoke all on function public.help_outcome_set(uuid, text) from public, anon;
grant execute on function public.help_outcome_set(uuid, text) to authenticated, service_role;

-- 3. verified solutions --------------------------------------------------------------------------------------------------
create table if not exists public.help_solutions(
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  category text not null,                     -- the report reason (nobox, flyers, gps …) or a rule id
  rule_id text,                               -- rule of the rule set it belongs to, if any
  scenario text not null check (length(scenario) between 1 and 2000),
  approved_answer text not null check (length(approved_answer) between 1 and 2000),
  mode text check (mode is null or mode in ('AUTO', 'NOTIFY', 'ESCALATE')),
  status text not null default 'draft' check (status in ('draft', 'approved', 'archived')),
  version integer not null default 1,
  parent_id uuid references public.help_solutions(id) on delete set null,
  source_request_id uuid references public.help_requests(id) on delete set null,
  redactions jsonb not null default '[]'::jsonb,
  created_by uuid, approved_by uuid,
  reviewed_by uuid, reviewed_at timestamptz,  -- the admin confirmed the CLEANED texts (exact text seen) when approving
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), approved_at timestamptz, archived_at timestamptz,
  -- automatic cleaning is no guarantee: nothing is approved without the admin's check of the cleaned text
  constraint help_solutions_reviewed check (status = 'draft' or reviewed_at is not null)
);
create index if not exists help_solutions_lookup on public.help_solutions (company_id, status, category);
alter table public.help_solutions enable row level security;

-- Use of solutions in answers is OFF for every company until the admin screen with the review step exists and it is
-- explicitly allowed. There is no admin function to switch it on (only the operator, by SQL, after approval).
create table if not exists public.help_settings(
  company_id uuid primary key references public.companies(id) on delete cascade,
  use_solutions boolean not null default false,
  changed_at timestamptz not null default now(),
  note text
);
alter table public.help_settings enable row level security;

-- approved / archived solutions are frozen (only the status may move to archived)
create or replace function public._help_solution_frozen() returns trigger language plpgsql set search_path to 'public' as $function$
begin
  if old.status <> 'draft' and (new.scenario is distinct from old.scenario or new.approved_answer is distinct from old.approved_answer
     or new.category is distinct from old.category or new.mode is distinct from old.mode or new.rule_id is distinct from old.rule_id or new.company_id is distinct from old.company_id) then
    raise exception 'solution_frozen';
  end if;
  if old.status = 'archived' and new.status <> 'archived' then raise exception 'solution_archived'; end if;
  return new;
end $function$;
revoke all on function public._help_solution_frozen() from public, anon, authenticated;
drop trigger if exists help_solution_frozen on public.help_solutions;
create trigger help_solution_frozen before update on public.help_solutions for each row execute function public._help_solution_frozen();

-- admin: save a solution (from a report or free). Texts are cleaned on the server; the cleaned version is returned so the
-- admin can check it before approving. Empty scenario / answer are taken from the report.
create or replace function public.help_solution_propose(p_request uuid, p_scenario text default null, p_answer text default null,
  p_category text default null, p_mode text default null, p_rule_id text default null)
 returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare co uuid := public.my_company(); h help_requests; s jsonb; a jsonb; v_id uuid; v_cat text;
begin
  if co is null then raise exception 'not_admin'; end if;
  if p_request is not null then
    select * into h from help_requests where id = p_request and company_id = co;
    if not found then raise exception 'not_found'; end if;
  end if;
  if p_mode is not null and p_mode not in ('AUTO', 'NOTIFY', 'ESCALATE') then raise exception 'mode_invalid'; end if;
  s := public.help_redact(left(nullif(trim(coalesce(p_scenario, h.body, '')), ''), 2000), co);
  a := public.help_redact(left(nullif(trim(coalesce(p_answer, h.answer, '')), ''), 2000), co);
  if coalesce(s ->> 'text', '') = '' or coalesce(a ->> 'text', '') = '' then raise exception 'text_required'; end if;
  v_cat := coalesce(nullif(trim(p_category), ''), h.reason, 'other');
  insert into help_solutions(company_id, category, rule_id, scenario, approved_answer, mode, source_request_id, redactions, created_by)
  values (co, left(v_cat, 40), left(p_rule_id, 60), s ->> 'text', a ->> 'text', p_mode, p_request,
          (select coalesce(jsonb_agg(distinct x), '[]'::jsonb) from (select jsonb_array_elements_text(s -> 'found') x union select jsonb_array_elements_text(a -> 'found')) y),
          auth.uid())
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'scenario', s ->> 'text', 'answer', a ->> 'text', 'removed', (select redactions from help_solutions where id = v_id));
end $function$;
revoke all on function public.help_solution_propose(uuid, text, text, text, text, text) from public, anon;
grant execute on function public.help_solution_propose(uuid, text, text, text, text, text) to authenticated, service_role;

-- admin: change a draft (cleaned again)
create or replace function public.help_solution_update(p_id uuid, p_scenario text, p_answer text, p_category text default null, p_mode text default null, p_rule_id text default null)
 returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare co uuid := public.my_company(); x help_solutions; s jsonb; a jsonb;
begin
  if co is null then raise exception 'not_admin'; end if;
  select * into x from help_solutions where id = p_id and company_id = co;
  if not found then raise exception 'not_found'; end if;
  if x.status <> 'draft' then raise exception 'solution_frozen'; end if;
  if p_mode is not null and p_mode not in ('AUTO', 'NOTIFY', 'ESCALATE') then raise exception 'mode_invalid'; end if;
  s := public.help_redact(left(trim(coalesce(p_scenario, '')), 2000), co); a := public.help_redact(left(trim(coalesce(p_answer, '')), 2000), co);
  if s ->> 'text' = '' or a ->> 'text' = '' then raise exception 'text_required'; end if;
  update help_solutions set scenario = s ->> 'text', approved_answer = a ->> 'text', category = coalesce(left(nullif(trim(p_category), ''), 40), category),
         mode = p_mode, rule_id = left(p_rule_id, 60), updated_at = now(),
         redactions = (select coalesce(jsonb_agg(distinct v), '[]'::jsonb) from (select jsonb_array_elements_text(redactions) v from help_solutions where id = p_id
                       union select jsonb_array_elements_text(s -> 'found') union select jsonb_array_elements_text(a -> 'found')) y)
   where id = p_id;
  return jsonb_build_object('id', p_id, 'scenario', s ->> 'text', 'answer', a ->> 'text');
end $function$;
revoke all on function public.help_solution_update(uuid, text, text, text, text, text) from public, anon;
grant execute on function public.help_solution_update(uuid, text, text, text, text, text) to authenticated, service_role;

-- admin: approve a draft. The automatic cleaning is NOT a guarantee, so approval needs the admin's own check: the screen
-- shows the cleaned texts and sends back exactly what the admin saw (p_scenario_seen / p_answer_seen). Refused if they are
-- missing or differ from the stored texts (changed in between), and if the automatic check still finds personal data.
-- A new version replaces (archives) the version it was made from.
drop function if exists public.help_solution_approve(uuid);
create or replace function public.help_solution_approve(p_id uuid, p_scenario_seen text, p_answer_seen text)
 returns void language plpgsql security definer set search_path to 'public'
as $function$
declare co uuid := public.my_company(); x help_solutions;
begin
  if co is null then raise exception 'not_admin'; end if;
  select * into x from help_solutions where id = p_id and company_id = co for update;
  if not found then raise exception 'not_found'; end if;
  if x.status <> 'draft' then raise exception 'not_draft'; end if;
  if p_scenario_seen is null or p_answer_seen is null then raise exception 'review_required'; end if;
  if p_scenario_seen is distinct from x.scenario or p_answer_seen is distinct from x.approved_answer then raise exception 'review_outdated'; end if;
  if jsonb_array_length(public.help_redact(x.scenario, co) -> 'found') > 0 or jsonb_array_length(public.help_redact(x.approved_answer, co) -> 'found') > 0 then
    raise exception 'personal_data_found';
  end if;
  update help_solutions set status = 'approved', approved_by = auth.uid(), approved_at = now(),
         reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now() where id = p_id;
  if x.parent_id is not null then
    update help_solutions set status = 'archived', archived_at = now(), updated_at = now() where id = x.parent_id and company_id = co and status = 'approved';
  end if;
end $function$;
revoke all on function public.help_solution_approve(uuid, text, text) from public, anon;
grant execute on function public.help_solution_approve(uuid, text, text) to authenticated, service_role;

-- admin: start a new version of an approved solution (the approved one stays in use until the new one is approved)
create or replace function public.help_solution_revise(p_id uuid)
 returns uuid language plpgsql security definer set search_path to 'public'
as $function$
declare co uuid := public.my_company(); x help_solutions; v_id uuid;
begin
  if co is null then raise exception 'not_admin'; end if;
  select * into x from help_solutions where id = p_id and company_id = co;
  if not found then raise exception 'not_found'; end if;
  if x.status <> 'approved' then raise exception 'not_approved'; end if;
  if exists(select 1 from help_solutions where parent_id = p_id and status = 'draft') then raise exception 'draft_exists'; end if;
  insert into help_solutions(company_id, category, rule_id, scenario, approved_answer, mode, version, parent_id, source_request_id, redactions, created_by)
  values (co, x.category, x.rule_id, x.scenario, x.approved_answer, x.mode, x.version + 1, x.id, x.source_request_id, x.redactions, auth.uid())
  returning id into v_id;
  return v_id;
end $function$;
revoke all on function public.help_solution_revise(uuid) from public, anon;
grant execute on function public.help_solution_revise(uuid) to authenticated, service_role;

-- admin: take a solution out of use
create or replace function public.help_solution_archive(p_id uuid)
 returns void language plpgsql security definer set search_path to 'public'
as $function$
declare co uuid := public.my_company();
begin
  if co is null then raise exception 'not_admin'; end if;
  update help_solutions set status = 'archived', archived_at = now(), updated_at = now() where id = p_id and company_id = co and status <> 'archived';
  if not found then raise exception 'not_found'; end if;
end $function$;
revoke all on function public.help_solution_archive(uuid) from public, anon;
grant execute on function public.help_solution_archive(uuid) to authenticated, service_role;

-- server (help-bot, phase C): up to 3 APPROVED and REVIEWED solutions of THIS company that match the TOPIC of the report.
-- Only relevant ones – the limit is a maximum, never filled up: same category (report reason) or same rule; for the
-- catch-all category "other" additionally at least 2 shared words (4+ letters, common words ignored). No match → empty.
-- Returns nothing at all while use_solutions is off for the company (default; see help_settings).
-- Order: shared words, then newest approval.
create or replace function public.help_solutions_for(p_company uuid, p_category text, p_text text, p_limit integer default 3)
 returns table(id uuid, category text, rule_id text, scenario text, approved_answer text, mode text, version integer, score real)
 language sql stable security definer set search_path to 'public'
as $function$
  with q as (
    select nullif(trim(coalesce(p_category, '')), '') cat,
           array(select distinct w from regexp_split_to_table(lower(coalesce(p_text, '')), '[^[:alnum:]äöüßÄÖÜ]+') w
                  where length(w) >= 4 and w <> all (array['nicht','bitte','eine','einen','einer','habe','haben','hast','sind','noch','auch',
                    'oder','aber','wenn','dass','kann','wird','wurde','werden','mein','meine','hier','heute','jetzt','schon','sehr','mehr',
                    'alle','dann','wieder','keine','kein','diese','dieser','über','nach','beim','sein','sich','etwas','gibt','ist','soll','muss'])) words
  ), c as (
    select s.*, (select count(*) from unnest(q.words) w
                  where w = any (regexp_split_to_array(lower(s.scenario || ' ' || s.approved_answer), '[^[:alnum:]äöüßÄÖÜ]+')))::integer shared
      from help_solutions s, q
     where q.cat is not null
       and s.company_id = p_company and s.status = 'approved' and s.reviewed_at is not null
       and (s.category = q.cat or s.rule_id = q.cat)
       and exists (select 1 from help_settings g where g.company_id = p_company and g.use_solutions)
  )
  select c.id, c.category, c.rule_id, c.scenario, c.approved_answer, c.mode, c.version, c.shared::real score
    from c, q
   where q.cat <> 'other' or c.shared >= 2
   order by c.shared desc, c.approved_at desc
   limit greatest(0, least(coalesce(p_limit, 3), 3))
$function$;
revoke all on function public.help_solutions_for(uuid, text, text, integer) from public, anon, authenticated;
grant execute on function public.help_solutions_for(uuid, text, text, integer) to service_role;

-- rights on the tables: no anon, admins read their own company (and the platform master everything), writes only via functions
do $$ declare t text; begin
  foreach t in array array['help_drafts', 'help_request_outcomes', 'help_solutions', 'help_settings'] loop
    execute format('revoke all on table public.%I from anon, authenticated', t);
    execute format('grant select on table public.%I to authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('create policy %I on public.%I for select to authenticated using (company_id = (select public.my_company()))', t || '_read', t);
    execute format('drop policy if exists %I on public.%I', t || '_master_read', t);
    execute format('create policy %I on public.%I for select to authenticated using ((select public.is_master()))', t || '_master_read', t);
  end loop;
end $$;

commit;
