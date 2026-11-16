-- FlyerMap AI, phase A (16.11.2026). NOT applied to production – only after explicit approval.
-- Nothing here sends anything to workers and nothing calls Claude; today's behaviour of help reports stays the same:
--   1. help_requests gets three optional columns: amount (number from the new optional form field), detail (flyers:
--      short / leftover), auto_answer (today's automatic answer, kept separately).
--   2. help_request: unchanged except that it also writes auto_answer.
--   3. help_resolve: closing with an empty answer no longer wipes the earlier (automatic) answer (bug from the audit);
--      an admin answer still replaces "answer", the automatic text stays in auto_answer. Backfill below.
--   4. help_request2 = help_request + amount/detail (the app uses it only when it exists; old apps keep help_request).
--   5. help_rule_sets: rule sets as data, versioned (an active or archived version cannot be edited – a new version is made),
--      one active set per company; company_id null = default for all companies. Seeded: FITYES v1 = the JSON file
--      supabase/help-rules/fityes.v1.json, as default.
--   6. help_events: notifications for the admin (new / seen / acknowledged / resolved), one row per
--      company + dedupe key (worker, kind, order, Berlin day); written only by the server (service_role), read by the admins
--      of the company.
-- Rights are set explicitly (the default privileges in "public" would otherwise give anon everything on new objects).
-- Rollback: supabase/rollback/2026-11-16_ai_phase_a.down.sql
begin;

-- 1. columns ---------------------------------------------------------------------------------------------------------------
alter table public.help_requests add column if not exists amount integer;
alter table public.help_requests add column if not exists detail text;
alter table public.help_requests add column if not exists auto_answer text;
alter table public.help_requests drop constraint if exists help_requests_amount_range;
alter table public.help_requests add constraint help_requests_amount_range check (amount is null or amount between 0 and 100000);
alter table public.help_requests drop constraint if exists help_requests_detail_values;
alter table public.help_requests add constraint help_requests_detail_values check (detail is null or detail in ('short', 'leftover'));

-- keep today's automatic answers separately
update public.help_requests set auto_answer = answer where auto and answer is not null and auto_answer is null;
-- an automatic answer already wiped by help_resolve is still in the worker's notifications (same worker, within 2 minutes)
update public.help_requests h set auto_answer = n.body
  from public.notifications n
 where h.auto and h.answer is null and h.auto_answer is null and n.worker_id = h.worker_id and n.kind = 'help'
   and n.title = 'Automatische Antwort · Автоответ' and n.created_at between h.created_at and h.created_at + interval '2 minutes';

-- 2. help_request: same as before + auto_answer ----------------------------------------------------------------------------
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
    -- auto_answer: the automatic text stays even if the admin answers later (phase A, 16.11.2026)
    update help_requests set auto = true, answer = v_ans, auto_answer = v_ans, answered_at = now(), status = case when v_close then 'done' else status end where id = v_id;
    begin
      insert into notifications(worker_id, kind, title, body, task_id, plan_id) values (w.id, 'help', 'Automatische Antwort · Автоответ', v_ans, p.task_id, p.id);
    exception when others then null;
    end;
  end if;
  -- still open: Claude writes a draft for the admin (only when the firm turned the bot on; never sent by itself)
  perform public._help_bot_ping(v_id);
  return v_id;
end $function$;

-- 3. help_resolve: an empty answer does not wipe the earlier one ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.help_resolve(p_id uuid, p_answer text, p_title text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare h help_requests; co uuid := public.my_company(); v_ans text := nullif(trim(coalesce(p_answer, '')), '');
begin
  if co is null then raise exception 'not_admin'; end if;
  select * into h from help_requests where id = p_id and company_id = co;
  if not found then raise exception 'not_found'; end if;
  -- closing without text keeps the earlier answer (e.g. the automatic one); a new text replaces it, the automatic text
  -- stays in auto_answer (all expressions below see the row as it was before this update)
  update help_requests set status = 'done', answer = coalesce(v_ans, answer),
         auto_answer = case when auto and auto_answer is null then answer else auto_answer end,
         answered_at = now(), answered_by = auth.uid() where id = p_id;
  if v_ans is not null then
    begin
      insert into notifications(worker_id, kind, title, body, task_id, plan_id) values (h.worker_id, 'help', coalesce(p_title, 'Antwort auf deine Meldung'), trim(p_answer), h.task_id, h.plan_id);
    exception when others then null;
    end;
  end if;
end $function$;

-- 4. help_request2: the same report + optional number / flyer detail ------------------------------------------------------
create or replace function public.help_request2(p_token uuid, p_plan_id uuid, p_reason text, p_text text, p_lat double precision default null,
  p_lng double precision default null, p_amount integer default null, p_detail text default null)
 returns uuid language plpgsql security definer set search_path to 'public'
as $function$
declare v_id uuid;
begin
  if p_amount is not null and (p_amount < 0 or p_amount > 100000) then raise exception 'amount_invalid'; end if;
  if p_detail is not null and p_detail not in ('short', 'leftover') then raise exception 'detail_invalid'; end if;
  v_id := public.help_request(p_token, p_plan_id, p_reason, p_text, p_lat, p_lng);   -- checks the token, answers as today
  update help_requests set amount = p_amount, detail = case when reason = 'flyers' then p_detail end where id = v_id;
  return v_id;
end $function$;
revoke all on function public.help_request2(uuid, uuid, text, text, double precision, double precision, integer, text) from public;
grant execute on function public.help_request2(uuid, uuid, text, text, double precision, double precision, integer, text) to anon, authenticated, service_role;

-- 5. rule sets ------------------------------------------------------------------------------------------------------------
create table if not exists public.help_rule_sets(
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,        -- null = default for every company
  key text not null,
  version integer not null check (version > 0),
  status text not null default 'draft' check (status in ('draft', 'active', 'archived')),
  rules jsonb not null,
  note text,
  created_at timestamptz not null default now(),
  created_by uuid,
  activated_at timestamptz,
  constraint help_rule_sets_version unique nulls not distinct (company_id, key, version)
);
create unique index if not exists help_rule_sets_one_active on public.help_rule_sets (coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid)) where status = 'active';
alter table public.help_rule_sets enable row level security;

-- an active or archived version is frozen: changes need a new version (only the status may move on)
create or replace function public._help_rule_sets_frozen() returns trigger language plpgsql set search_path to 'public' as $function$
begin
  if old.status <> 'draft' and (new.rules is distinct from old.rules or new.key is distinct from old.key or new.version is distinct from old.version or new.company_id is distinct from old.company_id) then
    raise exception 'rule_set_frozen';
  end if;
  if old.status = 'archived' and new.status <> 'archived' then raise exception 'rule_set_archived'; end if;
  return new;
end $function$;
revoke execute on function public._help_rule_sets_frozen() from public, anon, authenticated;
drop trigger if exists help_rule_sets_frozen on public.help_rule_sets;
create trigger help_rule_sets_frozen before update on public.help_rule_sets for each row execute function public._help_rule_sets_frozen();

drop policy if exists help_rule_sets_read on public.help_rule_sets;
create policy help_rule_sets_read on public.help_rule_sets for select to authenticated using (company_id is null or company_id = (select public.my_company()));
revoke all on table public.help_rule_sets from anon, authenticated;
grant select on table public.help_rule_sets to authenticated;
grant all on table public.help_rule_sets to service_role;

insert into public.help_rule_sets(company_id, key, version, status, rules, note, activated_at)
select null, 'fityes', 1, 'active', $rules${"key":"fityes","version":1,"name":"FITYES – Grundregeln für Hilfe-Meldungen","source":"claude/flyermap-ai-assistant-spec.md, Abschnitt 2 (16.11.2026)","modes":["AUTO","NOTIFY","ESCALATE"],"thresholds":{"unreachable_boxes_auto_max":50,"leftover_flyers_auto_max":200,"amount_max":100000,"claude_min_confidence":0.7},"texts":{"deadline_call":{"de":"Die Frist ist heute oder schon vorbei – ruf bitte sofort den Admin an.","ru":"Срок сегодня или уже прошёл — пожалуйста, сразу позвони админу.","en":"The deadline is today or already over – please call the admin right away."},"ask_amount":{"de":"Wenn es viele sind: schreib bitte ungefähr, wie viele.","ru":"Если их много, напиши, пожалуйста, примерно сколько.","en":"If there are many, please write roughly how many."}},"rules":[{"id":"boxes_few","row":1,"mode":"AUTO","match":{"reasons":["nobox"],"amount":{"lte":"unreachable_boxes_auto_max"}},"actions":["replace_reserve"],"reply":{"de":"Verstanden. Lass diese Briefkästen aus und geh weiter. Während der Schicht nimmt die App passende Ersatzstraßen in der Nähe dazu.","ru":"Понял. Пропусти эти ящики и иди дальше. Во время смены приложение само добавит подходящие улицы рядом.","en":"Got it. Skip these mailboxes and go on. During the shift the app adds suitable replacement streets nearby."}},{"id":"boxes_many","row":2,"mode":"NOTIFY","notify":"boxes_unreachable","match":{"reasons":["nobox"],"amount":{"gt":"unreachable_boxes_auto_max"}},"actions":["replace_reserve"],"reply":{"de":"Danke, der Admin ist informiert. Geh weiter auf der Route; die App nimmt passende Ersatzstraßen in der Nähe dazu. Schreib kurz, warum die Briefkästen nicht erreichbar sind, falls noch nicht geschehen.","ru":"Спасибо, админ в курсе. Продолжай маршрут; приложение добавит подходящие улицы рядом. Если ещё не написал, коротко напиши, почему ящики недоступны.","en":"Thanks, the admin is informed. Go on with the route; the app adds suitable replacement streets nearby. If you have not yet, write briefly why the mailboxes cannot be reached."},"admin":{"de":"Viele Briefkästen nicht erreichbar – Umfang und Grund prüfen, ggf. Ersatzgebiet freigeben."}},{"id":"boxes_count_missing","row":null,"mode":"AUTO","match":{"reasons":["nobox"]},"actions":["replace_reserve"],"reply":{"de":"Verstanden. Lass diese Briefkästen aus und geh weiter. Während der Schicht nimmt die App passende Ersatzstraßen in der Nähe dazu.","ru":"Понял. Пропусти эти ящики и иди дальше. Во время смены приложение само добавит подходящие улицы рядом.","en":"Got it. Skip these mailboxes and go on. During the shift the app adds suitable replacement streets nearby."},"note":"Kein Wert im Feld „ungefähr wie viele“: wie heute automatische Antwort; der Text bittet um die Zahl. Geschäftsentscheidung D1 offen."},{"id":"street_closed","row":null,"mode":"AUTO","match":{"reasons":["closed"]},"actions":["replace_reserve"],"reply":{"de":"Verstanden. Lass dieses Stück aus und geh auf der Route weiter. Der Admin prüft die Stelle später.","ru":"Понял. Пропусти этот участок и иди дальше по маршруту. Админ проверит место позже.","en":"Got it. Skip this piece and go on with the route. The admin checks the place later."}},{"id":"entrance_blocked","row":4,"mode":"AUTO","match":{"reasons":["private"],"detect":"\\bhund|\\bdog\\b|собак|haustür|hauseingang|eingang (ist )?(zu|verschlossen)|tür (ist )?(zu|verschlossen)|подъезд.{0,20}(закрыт|заперт)|дверь.{0,20}(закрыт|заперт)|door.{0,15}(locked|closed)"},"actions":["replace_reserve"],"reply":{"de":"Lass diese Adresse aus – kein Risiko eingehen. Geh einfach weiter auf der Route.","ru":"Пропусти этот адрес — не рискуй. Просто иди дальше по маршруту.","en":"Skip this address – take no risk. Just go on with the route."}},{"id":"leftover_gym_far","row":6,"mode":"ESCALATE","notify":"leftover_return","match":{"reasons":["flyers"],"detail":"leftover","text":"zu weit|weit weg|umständlich|nicht (mehr )?(hin|zurück)|далеко|неудобно|не могу (вернуть|отнести|занести)|too far|inconvenient|can.?t (bring|return)"},"reply":{"de":"Okay, der Admin meldet sich und sagt dir, wohin die Flyer sollen.","ru":"Хорошо, админ свяжется с тобой и скажет, куда деть флаеры.","en":"Okay, the admin will get back to you about where the flyers should go."},"admin":{"de":"Rückgabe ins Studio ist für den Mitarbeiter ungünstig – Rückgabeort klären."}},{"id":"leftover_small","row":5,"mode":"AUTO","match":{"reasons":["flyers"],"detail":"leftover","amount":{"lte":"leftover_flyers_auto_max"}},"reply":{"de":"Danke! Bring die übrigen Flyer bitte ins Start-Studio zurück.","ru":"Спасибо! Верни, пожалуйста, оставшиеся флаеры в стартовый спортзал.","en":"Thanks! Please bring the remaining flyers back to the start gym."}},{"id":"leftover_large","row":7,"mode":"ESCALATE","notify":"leftover_flyers","match":{"reasons":["flyers"],"detail":"leftover","amount":{"gt":"leftover_flyers_auto_max"}},"reply":{"de":"Danke, das sind viele. Der Admin meldet sich bei dir, was mit den Flyern passiert.","ru":"Спасибо, это много. Админ свяжется с тобой и скажет, что делать с флаерами.","en":"Thanks, that is a lot. The admin will get back to you about the flyers."},"admin":{"de":"Mehr als 200 Flyer übrig – klären, ob weitere Straßen oder Rückgabe."}},{"id":"flyers_out","row":8,"mode":"ESCALATE","notify":"flyers_out","match":{"reasons":["flyers"],"detail":"short"},"reply":{"de":"Danke. Der Admin meldet sich bei dir, wie es weitergeht. Bis dahin: offene Straßen bleiben für später markiert.","ru":"Спасибо. Админ свяжется с тобой и скажет, как быть дальше. Пока что открытые улицы останутся отмеченными на потом.","en":"Thanks. The admin will get back to you on how to continue. Until then the open streets stay marked for later."},"admin":{"de":"Flyer vor Ende der Route ausgegangen – Nachschub oder Routenende klären."}},{"id":"flyers_unclear","row":null,"mode":"ESCALATE","notify":"flyers_out","match":{"reasons":["flyers"]},"reply":{"de":"Danke. Der Admin meldet sich bei dir wegen der Flyer.","ru":"Спасибо. Админ свяжется с тобой насчёт флаеров.","en":"Thanks. The admin will get back to you about the flyers."},"admin":{"de":"Flyer-Meldung ohne Angabe, ob zu wenig oder übrig – nachfragen."}},{"id":"tired","row":9,"mode":"AUTO","postponable":true,"match":{"detect":"\\bmüde|erschöpft|kaputt|keine kraft|устал|нет сил|вымотал|\\btired\\b|exhausted"},"actions":["feierabend"],"reply":{"de":"Kein Problem – du kannst heute früher aufhören. Tippe auf „Feierabend“; die offenen Straßen bleiben für den nächsten Arbeitstag. Achte nur auf die Frist des Auftrags.","ru":"Ничего страшного — можешь сегодня закончить раньше. Нажми «Закончить»; открытые улицы останутся на следующий рабочий день. Только следи за сроком заказа.","en":"No problem – you can stop earlier today. Tap “Finish”; the open streets stay for the next working day. Just keep the order's deadline in mind."}},{"id":"sick","row":10,"mode":"NOTIFY","notify":"sick","postponable":true,"lock":{"min_mode":"NOTIFY"},"match":{"detect":"\\bkrank|fieber|erkält|grippe|болею|заболе|болен|больна|температур|простуд|\\bsick\\b|\\bill\\b|\\bfever"},"actions":["tage_aendern"],"reply":{"de":"Gute Besserung! Geh bitte nicht krank raus. Der Admin ist informiert; verschiebe deine Tage über „Tage ändern“ – innerhalb der Frist.","ru":"Выздоравливай! Пожалуйста, не выходи больным. Админ в курсе; перенеси дни через «Изменить дни» — в пределах срока.","en":"Get well soon! Please do not go out sick. The admin is informed; move your days with “Change days” – within the deadline."},"admin":{"de":"Mitarbeiter krank – Ersatz oder Verschiebung innerhalb der Frist prüfen."}},{"id":"weather","row":11,"mode":"NOTIFY","notify":"weather","postponable":true,"match":{"detect":"regen|regnet|regnen|gewitter|unwetter|sturm|hagel|glatteis|schnee|дожд|ливень|гроза|ураган|гололёд|гололед|снег|\\brain|storm|thunder|\\bsnow|\\bice\\b"},"actions":["tage_aendern"],"reply":{"de":"Danke, der Admin ist informiert. Wenn du verschieben willst, nutze „Tage ändern“ – innerhalb der Frist.","ru":"Спасибо, админ в курсе. Если хочешь перенести, используй «Изменить дни» — в пределах срока.","en":"Thanks, the admin is informed. If you want to move the work, use “Change days” – within the deadline."},"admin":{"de":"Wetter: Mitarbeiter möchte ggf. verschieben – Termine im Blick behalten."}},{"id":"helping_colleague","row":12,"mode":"AUTO","match":{"detect":"kolleg|helfen|zusammen lauf|коллег|помочь|помогу|вместе|colleague|help .{0,20}(friend|coworker)|together"},"reply":{"de":"Du darfst helfen. Aber: Wenn ihr länger als 5 Minuten nebeneinander lauft, zählt die Zeit nur bei der Person, deren Route gelaufen wird. Am besten läuft jeder seine eigene Route.","ru":"Помогать можно. Но если вы идёте рядом дольше 5 минут, время засчитывается только тому, чей это маршрут. Лучше, чтобы каждый шёл свой маршрут.","en":"You may help. But if you walk side by side for more than 5 minutes, the time counts only for the person whose route it is. Best: everyone walks their own route."}},{"id":"gps_hours","row":13,"mode":"ESCALATE","notify":"gps_hours","match":{"reasons":["gps"],"text":"(arbeits)?zeit.{0,25}(nicht gezählt|nicht gezählt|falsch|fehlt|weg)|stunden.{0,25}(nicht|falsch|fehlen)|nicht gezählt|часы.{0,25}(не|неправ)|время.{0,25}(не засчит|не посчит|неправ|пропал)|не засчит|не посчит|hours?.{0,20}(not|wrong|missing)|not counted","detect":"(arbeits)?zeit.{0,25}(nicht gezählt|nicht gezählt|falsch|fehlt|weg)|stunden.{0,25}(nicht|falsch|fehlen)|nicht gezählt|часы.{0,25}(не|неправ)|время.{0,25}(не засчит|не посчит|неправ|пропал)|не засчит|не посчит|hours?.{0,20}(not|wrong|missing)|not counted"},"reply":{"de":"Arbeite einfach weiter. Der Admin prüft deine Zeiten und meldet sich.","ru":"Просто продолжай работать. Админ проверит твоё время и свяжется с тобой.","en":"Just keep working. The admin checks your hours and gets back to you."},"admin":{"de":"Arbeitszeit/GPS nicht richtig gezählt – Sitzung prüfen, ggf. Zeit nachtragen."}},{"id":"gps_settings","row":null,"mode":"ESCALATE","notify":"gps","match":{"reasons":["gps"]},"reply":{"de":"Bitte prüfen: Standort «Immer erlauben» und «Genauer Standort» an, Energiesparmodus aus, App offen lassen. Wird es nicht besser, meldet sich der Admin.","ru":"Проверь: геолокация «Разрешать всегда» и «Точное местоположение» включены, режим экономии батареи выключен, приложение не закрывай. Если не поможет, админ напишет тебе.","en":"Please check: location “Always allow” and “Precise location” on, battery saver off, keep the app open. If it does not get better, the admin will contact you."}},{"id":"forgot_start","row":14,"mode":"ESCALATE","notify":"forgot_start","match":{"detect":"(vergessen|nicht).{0,25}(start|starten|gestartet|gedrückt)|start.{0,20}vergessen|забыл.{0,25}(нажать|начать|старт|включить)|не нажал.{0,15}(старт|начать)|forgot.{0,20}start"},"reply":{"de":"Starte die Route jetzt mit „Route starten“. Der Admin prüft die Zeit davor und meldet sich.","ru":"Начни маршрут сейчас кнопкой «Начать маршрут». Админ проверит время до этого и свяжется с тобой.","en":"Start the route now with “Start route”. The admin checks the time before and gets back to you."},"admin":{"de":"Start vergessen – Arbeitszeit vor dem Start prüfen und ggf. nachtragen."}},{"id":"deadline_risk","row":15,"mode":"ESCALATE","urgent":true,"notify":"deadline_risk","lock":{"min_mode":"ESCALATE","urgent":true},"match":{"detect":"frist|deadline|bis .{0,20}(nicht )?(schaffe|fertig)|schaffe .{0,25}nicht|не успева|не успею|не успеем|дедлайн|срок"},"actions":["call_admin"],"reply":{"de":"Ruf bitte sofort den Admin an, damit ihr gemeinsam eine Lösung für die Frist findet.","ru":"Пожалуйста, сразу позвони админу, чтобы вместе решить, как успеть к сроку.","en":"Please call the admin right away so you can find a solution for the deadline together."},"admin":{"de":"DRINGEND: Frist in Gefahr – Mitarbeiter anrufen, Hilfe oder Verlängerung klären."}},{"id":"gym_closed","row":16,"mode":"ESCALATE","notify":"gym_closed","match":{"detect":"(studio|gym|fitness|спортзал|зал|клуб).{0,30}(zu|geschlossen|закрыт|closed)|(zu|geschlossen|закрыт|closed).{0,30}(studio|gym|fitness|спортзал|зал)"},"reply":{"de":"Danke. Der Admin meldet sich bei dir, wie du an die Flyer kommst bzw. wohin damit.","ru":"Спасибо. Админ свяжется с тобой и скажет, как получить или куда деть флаеры.","en":"Thanks. The admin will get back to you about how to get the flyers or where to take them."},"admin":{"de":"Studio geschlossen – Abholung/Rückgabe der Flyer klären."}},{"id":"double_flyer","row":17,"mode":"AUTO","match":{"detect":"(zwei|2) flyer|doppelt|два флаера|2 флаера|дважды|два раза|two flyers|2 flyers|twice"},"reply":{"de":"Kein Problem, das passiert. Geh weiter – nur bitte nicht absichtlich zwei Flyer einwerfen.","ru":"Ничего страшного, бывает. Иди дальше — только не клади по два флаера специально.","en":"No problem, it happens. Go on – just do not put two flyers in on purpose."}},{"id":"keine_werbung","row":18,"mode":"AUTO","legal":true,"lock":{"min_mode":"AUTO","fixed_reply":true},"match":{"detect":"keine werbung|bitte keine|werbung verboten|no advertising|no junk mail|без рекламы|нет рекламы|реклам.{0,15}(не|запрещ)|не (класть|бросать) рекламу"},"reply":{"de":"Bei „Keine Werbung“ bitte keinen Flyer einwerfen – Briefkasten einfach auslassen.","ru":"Если на ящике «Keine Werbung», флаер не клади — просто пропусти этот ящик.","en":"With “Keine Werbung” (no advertising) do not put a flyer in – just skip that mailbox."}},{"id":"tomorrow_today","row":19,"mode":"AUTO","match":{"detect":"(straßen|strassen|teil|stück|route).{0,25}(von|für) morgen|morgigen? (straßen|strassen|teil|route)|завтрашн|(улиц|часть|маршрут).{0,20}на завтра|tomorrow'?s (streets|route|part)|streets? (of|for) tomorrow"},"reply":{"de":"Ja, gern – lauf ruhig schon Straßen von morgen, solange sie zu deiner Route gehören.","ru":"Да, конечно — можешь пройти завтрашние улицы сегодня, если они из твоего маршрута.","en":"Yes, sure – walk tomorrow's streets today as long as they belong to your route."}},{"id":"part_left","row":20,"mode":"AUTO","postponable":true,"match":{"reasons":["toolong"],"detect":"nicht fertig|rest .{0,10}morgen|nicht geschafft|не успел.{0,20}(закончить|сегодня)|осталась часть|остаток|остальное завтра|not finished|rest tomorrow"},"actions":["tage_aendern"],"reply":{"de":"Kein Problem – mach den Rest am nächsten Arbeitstag, wenn die Frist es erlaubt. Die offenen Straßen bleiben markiert.","ru":"Ничего страшного — закончи остаток в следующий рабочий день, если позволяет срок. Открытые улицы останутся отмеченными.","en":"No problem – do the rest on the next working day if the deadline allows. The open streets stay marked."}},{"id":"app_problem","row":null,"mode":"ESCALATE","notify":"admin_needed","match":{"reasons":["app"]},"reply":null}],"detect_order":["deadline_risk","forgot_start","gps_hours","gym_closed","sick","weather","keine_werbung","leftover_gym_far","entrance_blocked","double_flyer","helping_colleague","tomorrow_today","part_left","tired"],"unknown":{"id":"unknown","mode":"ESCALATE","notify":"admin_needed","reply":null},"match_help":{"reasons":"the report's reason (form) must be one of these","text":"with reasons: the text must ALSO match (a more exact case of that reason)","detect":"free text alone is enough, whatever reason was chosen (case-insensitive)","amount":"number from the optional form field; lte/gt refer to a threshold name","detail":"flyers: short = ran out, leftover = left over"}}$rules$::jsonb, 'FITYES Grundregeln, Spezifikation 16.11.2026 (supabase/help-rules/fityes.v1.json)', now()
 where not exists (select 1 from public.help_rule_sets where company_id is null and key = 'fityes' and version = 1);

-- 6. notifications for the admin -------------------------------------------------------------------------------------------
create table if not exists public.help_events(
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  help_request_id uuid references public.help_requests(id) on delete set null,
  worker_id uuid references public.workers(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete set null,
  kind text not null,
  mode text not null check (mode in ('NOTIFY', 'ESCALATE')),
  urgent boolean not null default false,
  rule_key text, rule_version integer, rule_id text,
  summary text check (summary is null or length(summary) <= 500),
  status text not null default 'new' check (status in ('new', 'seen', 'acknowledged', 'resolved')),
  dedupe_key text not null,
  repeat_count integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  seen_at timestamptz, acknowledged_at timestamptz, resolved_at timestamptz,
  handled_by uuid,
  constraint help_events_dedupe unique (company_id, dedupe_key)
);
create index if not exists help_events_open on public.help_events (company_id, status, created_at desc);
alter table public.help_events enable row level security;
drop policy if exists help_events_read on public.help_events;
create policy help_events_read on public.help_events for select to authenticated using (company_id = (select public.my_company()));
drop policy if exists help_events_master_read on public.help_events;
create policy help_events_master_read on public.help_events for select to authenticated using ((select public.is_master()));
revoke all on table public.help_events from anon, authenticated;
grant select on table public.help_events to authenticated;
grant all on table public.help_events to service_role;

-- written by the server (edge function with service_role, phase C): one row per company + dedupe key, a repeat counts up,
-- keeps the stricter mode, and opens a resolved one again
create or replace function public.help_event_record(p_company uuid, p_worker uuid, p_task uuid, p_help_request uuid, p_kind text, p_mode text,
  p_urgent boolean, p_rule_key text, p_rule_version integer, p_rule_id text, p_summary text, p_dedupe_key text)
 returns uuid language plpgsql security definer set search_path to 'public'
as $function$
declare v_id uuid;
begin
  if p_mode not in ('NOTIFY', 'ESCALATE') then raise exception 'mode_invalid'; end if;
  if coalesce(p_dedupe_key, '') = '' or coalesce(p_kind, '') = '' then raise exception 'key_required'; end if;
  if p_worker is not null and not exists(select 1 from workers where id = p_worker and company_id = p_company) then raise exception 'worker_not_in_company'; end if;
  if p_task is not null and not exists(select 1 from tasks where id = p_task and company_id = p_company) then raise exception 'task_not_in_company'; end if;
  if p_help_request is not null and not exists(select 1 from help_requests where id = p_help_request and company_id = p_company) then raise exception 'request_not_in_company'; end if;
  insert into help_events(company_id, worker_id, task_id, help_request_id, kind, mode, urgent, rule_key, rule_version, rule_id, summary, dedupe_key)
  values (p_company, p_worker, p_task, p_help_request, p_kind, p_mode, coalesce(p_urgent, false), p_rule_key, p_rule_version, p_rule_id, left(p_summary, 500), p_dedupe_key)
  on conflict (company_id, dedupe_key) do update set
    repeat_count = help_events.repeat_count + 1, updated_at = now(),
    mode = case when excluded.mode = 'ESCALATE' then 'ESCALATE' else help_events.mode end,
    urgent = help_events.urgent or excluded.urgent,
    status = case when help_events.status = 'resolved' then 'new' else help_events.status end,
    help_request_id = coalesce(excluded.help_request_id, help_events.help_request_id)
  returning id into v_id;
  return v_id;
end $function$;
revoke all on function public.help_event_record(uuid, uuid, uuid, uuid, text, text, boolean, text, integer, text, text, text) from public, anon, authenticated;
grant execute on function public.help_event_record(uuid, uuid, uuid, uuid, text, text, boolean, text, integer, text, text, text) to service_role;

-- the admin marks a notification seen / acknowledged / resolved (own company only)
create or replace function public.help_event_set_status(p_id uuid, p_status text)
 returns void language plpgsql security definer set search_path to 'public'
as $function$
declare co uuid := public.my_company();
begin
  if co is null then raise exception 'not_admin'; end if;
  if p_status not in ('new', 'seen', 'acknowledged', 'resolved') then raise exception 'status_invalid'; end if;
  update help_events set status = p_status, updated_at = now(), handled_by = auth.uid(),
         seen_at = case when p_status in ('seen', 'acknowledged', 'resolved') then coalesce(seen_at, now()) else seen_at end,
         acknowledged_at = case when p_status in ('acknowledged', 'resolved') then coalesce(acknowledged_at, now()) else acknowledged_at end,
         resolved_at = case when p_status = 'resolved' then now() else null end
   where id = p_id and company_id = co;
  if not found then raise exception 'not_found'; end if;
end $function$;
revoke all on function public.help_event_set_status(uuid, text) from public, anon;
grant execute on function public.help_event_set_status(uuid, text) to authenticated, service_role;

commit;
