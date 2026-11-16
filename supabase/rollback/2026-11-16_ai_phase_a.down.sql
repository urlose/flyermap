-- Rollback of 2026-11-16_ai_phase_a.sql: help_request and help_resolve exactly as read from production on 16.11.2026
-- (md5 of pg_get_functiondef: help_request e644a18d9b4d2c3bccdaa60cc8344f9c, help_resolve fc2e4c979f88471ee918029c6377964c),
-- new functions and tables removed, the three new columns dropped.
-- WARNING: drops data that only exists in the new objects (amount/detail/auto_answer, rule sets, admin notifications).
-- It also brings back the bug "closing with an empty answer wipes the automatic answer".
begin;

drop function if exists public.help_request2(uuid, uuid, text, text, double precision, double precision, integer, text);
drop function if exists public.help_event_record(uuid, uuid, uuid, uuid, text, text, boolean, text, integer, text, text, text);
drop function if exists public.help_event_set_status(uuid, text);
drop table if exists public.help_events;
drop table if exists public.help_rule_sets;
drop function if exists public._help_rule_sets_frozen();

CREATE OR REPLACE FUNCTION public.help_request(p_token uuid, p_plan_id uuid, p_reason text, p_text text, p_lat double precision DEFAULT NULL::double precision, p_lng double precision DEFAULT NULL::double precision)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare w workers; p task_plans; v_id uuid; v_reason text; v_ans text; v_close boolean := false;
begin
  w := _worker(p_token);
  if coalesce(trim(p_reason), '') = '' then raise exception 'reason_required'; end if;
  if (select count(*) from help_requests where worker_id = w.id and status = 'open') >= 10 then raise exception 'too_many_requests'; end if;
  if p_plan_id is not null then select * into p from task_plans where id = p_plan_id and worker_id = w.id; end if;
  v_reason := left(trim(p_reason), 40);
  insert into help_requests(company_id, worker_id, task_id, plan_id, reason, body, lat, lng)
    values (w.company_id, w.id, p.task_id, p.id, v_reason, nullif(left(trim(coalesce(p_text, '')), 1000), ''), p_lat, p_lng) returning id into v_id;
  -- standard reasons are answered right away, so nobody waits in the street; the admin still sees every report
  if v_reason in ('closed', 'nobox', 'private') then
    v_close := true;
    v_ans := 'Verstanden. Lass dieses Stück aus und geh auf der Route weiter. Der Admin prüft die Stelle später.' || E'\n' || 'Понял. Пропусти этот участок и иди дальше по маршруту. Админ проверит место позже.';
  elsif v_reason = 'gps' then
    v_ans := 'Bitte prüfen: Standort «Immer erlauben» und «Genauer Standort» an, Energiesparmodus aus, App offen lassen. Wird es nicht besser, meldet sich der Admin.' || E'\n' || 'Проверь: геолокация «Разрешать всегда» и «Точное местоположение» включены, режим экономии батареи выключен, приложение не закрывай. Если не поможет, админ напишет тебе.';
  end if;
  if v_ans is not null then
    update help_requests set auto = true, answer = v_ans, answered_at = now(), status = case when v_close then 'done' else status end where id = v_id;
    begin
      insert into notifications(worker_id, kind, title, body, task_id, plan_id) values (w.id, 'help', 'Automatische Antwort · Автоответ', v_ans, p.task_id, p.id);
    exception when others then null;
    end;
  end if;
  -- still open: Claude writes a draft for the admin (only when the firm turned the bot on; never sent by itself)
  perform public._help_bot_ping(v_id);
  return v_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.help_resolve(p_id uuid, p_answer text, p_title text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare h help_requests; co uuid := public.my_company();
begin
  if co is null then raise exception 'not_admin'; end if;
  select * into h from help_requests where id = p_id and company_id = co;
  if not found then raise exception 'not_found'; end if;
  update help_requests set status = 'done', answer = nullif(trim(coalesce(p_answer, '')), ''), answered_at = now(), answered_by = auth.uid() where id = p_id;
  if nullif(trim(coalesce(p_answer, '')), '') is not null then
    begin
      insert into notifications(worker_id, kind, title, body, task_id, plan_id) values (h.worker_id, 'help', coalesce(p_title, 'Antwort auf deine Meldung'), trim(p_answer), h.task_id, h.plan_id);
    exception when others then null;
    end;
  end if;
end $function$
;

alter table public.help_requests drop constraint if exists help_requests_amount_range;
alter table public.help_requests drop constraint if exists help_requests_detail_values;
alter table public.help_requests drop column if exists amount;
alter table public.help_requests drop column if exists detail;
alter table public.help_requests drop column if exists auto_answer;

commit;
