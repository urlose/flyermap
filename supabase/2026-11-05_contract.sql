-- Rahmenvertrag (framework contract for freelance distributors), binding commitment per order, cancellation log with penalty.
-- Only workers registered from now on must accept it (contract_required defaults to true for new rows, false for existing ones).

alter table companies add column if not exists contract_text text;               -- null = standard text from the app (legal.js)
alter table companies add column if not exists contract_version text;            -- null = standard version
alter table companies add column if not exists cancel_hours integer not null default 48;
alter table companies add column if not exists penalty_eur numeric(8,2) not null default 50;

alter table workers add column if not exists contract_required boolean not null default false;
alter table workers alter column contract_required set default true;
alter table workers add column if not exists contract_version text;
alter table workers add column if not exists contract_ack_at timestamptz;

alter table task_plans add column if not exists committed_terms text;            -- contract version the commitment was made under

create table if not exists plan_cancellations(
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete cascade,
  plan_id uuid references task_plans(id) on delete set null,
  task_id uuid references tasks(id) on delete set null,
  worker_id uuid references workers(id) on delete set null,
  at timestamptz not null default now(),
  first_date date,
  hours_before numeric,
  late boolean not null default false,
  reason text,
  penalty_eur numeric(8,2) not null default 0,
  waived boolean not null default false
);
alter table plan_cancellations enable row level security;   -- only through the functions below

-- standard version is kept in sync with CONTRACT_STD_VERSION in worker/src/legal.js
create or replace function contract_std_version() returns text language sql immutable as $$ select 'RV-2026-11-05'::text $$;

-- what a worker has to accept (and has accepted)
create or replace function worker_contract(p_token uuid) returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare w workers; c companies;
begin
  w := _worker(p_token);
  select * into c from companies where id = w.company_id;
  return jsonb_build_object('required', w.contract_required, 'acked', w.contract_version, 'acked_at', w.contract_ack_at,
    'version', coalesce(c.contract_version, contract_std_version()), 'text', c.contract_text,
    'cancel_hours', coalesce(c.cancel_hours, 48), 'penalty_eur', coalesce(c.penalty_eur, 50));
end $$;

create or replace function ack_contract(p_token uuid, p_version text) returns void language plpgsql security definer set search_path to 'public' as $$
declare w workers; c companies;
begin
  w := _worker(p_token);
  select * into c from companies where id = w.company_id;
  if p_version is distinct from coalesce(c.contract_version, contract_std_version()) then raise exception 'contract_changed'; end if;
  update workers set contract_version = p_version, contract_ack_at = now() where id = w.id;
end $$;

create or replace function _contract_ok(w workers) returns void language plpgsql stable security definer set search_path to 'public' as $$
declare c companies;
begin
  if not w.contract_required then return; end if;
  select * into c from companies where id = w.company_id;
  if w.contract_version is distinct from coalesce(c.contract_version, contract_std_version()) then raise exception 'contract_required'; end if;
end $$;

-- accept / decline (old APKs keep calling this). Accept = binding commitment; declining an accepted route = cancellation (logged).
create or replace function public.respond_plan(p_token uuid, p_plan_id uuid, p_accept boolean, p_dates jsonb default '[]'::jsonb)
 returns void language plpgsql security definer set search_path to 'public' as $function$
declare w workers; p task_plans;
begin
  w := _worker(p_token);
  select * into p from task_plans where id = p_plan_id and worker_id = w.id;
  if not found then raise exception 'plan_not_found'; end if;
  if p_accept and (jsonb_typeof(p_dates) <> 'array' or jsonb_array_length(p_dates) = 0) then raise exception 'date_required'; end if;
  if p_accept and p.status <> 'accepted' then perform _contract_ok(w); end if;
  if not p_accept and p.status = 'accepted' then perform _log_cancel(w, p, null); end if;
  update task_plans set status = case when p_accept then 'accepted' else 'declined' end, work_dates = case when p_accept then p_dates else '[]'::jsonb end,
    accepted_at = case when p_accept then coalesce(case when p.status = 'accepted' then p.accepted_at end, now()) else null end,
    committed_terms = case when p_accept then coalesce(case when p.status = 'accepted' then p.committed_terms end, w.contract_version) else committed_terms end
  where id = p_plan_id;
  if p_accept then update tasks set work_date = (select min((d)::date) from jsonb_array_elements_text(p_dates) d) where id = p.task_id and (work_date is null or work_date > (select min((d)::date) from jsonb_array_elements_text(p_dates) d)); end if;
end $function$;

create or replace function _log_cancel(w workers, p task_plans, p_reason text) returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare c companies; d0 date; h numeric; late boolean; pen numeric := 0;
begin
  select * into c from companies where id = w.company_id;
  select min((d)::date) into d0 from jsonb_array_elements_text(coalesce(p.work_dates, '[]'::jsonb)) d;
  -- a working day starts at 08:00 Berlin time
  h := case when d0 is null then null else round(extract(epoch from ((d0 + time '08:00') at time zone 'Europe/Berlin') - now()) / 3600.0, 1) end;
  late := h is not null and h < coalesce(c.cancel_hours, 48);
  if late then pen := coalesce(c.penalty_eur, 0); end if;
  insert into plan_cancellations(company_id, plan_id, task_id, worker_id, first_date, hours_before, late, reason, penalty_eur)
  values (w.company_id, p.id, p.task_id, w.id, d0, h, late, nullif(left(trim(coalesce(p_reason, '')), 500), ''), pen);
  return jsonb_build_object('late', late, 'hours_before', h, 'penalty_eur', pen);
end $$;

-- new app: cancel an accepted route with a reason
create or replace function cancel_plan(p_token uuid, p_plan_id uuid, p_reason text) returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare w workers; p task_plans; r jsonb;
begin
  w := _worker(p_token);
  select * into p from task_plans where id = p_plan_id and worker_id = w.id for update;
  if not found or p.status <> 'accepted' then raise exception 'plan_not_found'; end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'reason_required'; end if;
  r := _log_cancel(w, p, p_reason);
  update task_plans set status = 'declined', work_dates = '[]'::jsonb, accepted_at = null where id = p.id;
  return r;
end $$;

-- free route taken by a worker = binding commitment as well
create or replace function public.claim_plan(p_token uuid, p_plan_id uuid, p_dates jsonb)
 returns void language plpgsql security definer set search_path to 'public' as $function$
declare w workers; p task_plans; t tasks; old uuid;
begin
  w := _worker(p_token);
  perform _contract_ok(w);
  if jsonb_typeof(p_dates) <> 'array' or jsonb_array_length(p_dates) = 0 then raise exception 'date_required'; end if;
  select * into p from task_plans where id = p_plan_id for update;
  if not found then raise exception 'plan_not_found'; end if;
  select * into t from tasks where id = p.task_id;
  if t.company_id is distinct from w.company_id or t.status <> 'open' then raise exception 'plan_not_found'; end if;
  if p.worker_id is not null and p.status <> 'declined' then raise exception 'plan_taken'; end if;
  if exists(select 1 from task_plans where task_id = p.task_id and worker_id = w.id and status <> 'declined' and id <> p.id) then raise exception 'already_in_task'; end if;
  old := p.worker_id;
  update task_plans set worker_id = null where task_id = p.task_id and worker_id = w.id and status = 'declined' and id <> p.id;
  update task_plans set worker_id = w.id, status = 'accepted', work_dates = p_dates, accepted_at = now(), committed_terms = w.contract_version where id = p.id;
  if old is not null and old <> w.id and not exists(select 1 from task_plans where task_id = p.task_id and worker_id = old) then
    delete from task_workers where task_id = p.task_id and worker_id = old;
  end if;
  insert into task_workers(task_id, worker_id) values (p.task_id, w.id) on conflict do nothing;
  update tasks set work_date = (select min((d)::date) from jsonb_array_elements_text(p_dates) d)
   where id = p.task_id and (work_date is null or work_date > (select min((d)::date) from jsonb_array_elements_text(p_dates) d));
end $function$;

-- admin: contract settings + cancellations of the own company
create or replace function company_contract() returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare c companies;
begin
  select * into c from companies where id = public.my_company();
  if c.id is null then raise exception 'not_admin'; end if;
  return jsonb_build_object('text', c.contract_text, 'version', coalesce(c.contract_version, contract_std_version()), 'custom', c.contract_text is not null,
    'cancel_hours', c.cancel_hours, 'penalty_eur', c.penalty_eur,
    'cancellations', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'at', x.at, 'first_date', x.first_date, 'hours_before', x.hours_before, 'late', x.late,
        'reason', x.reason, 'penalty_eur', x.penalty_eur, 'waived', x.waived, 'worker', wk.name, 'task', tk.name) order by x.at desc)
      from (select * from plan_cancellations where company_id = c.id order by at desc limit 100) x
      left join workers wk on wk.id = x.worker_id left join tasks tk on tk.id = x.task_id), '[]'::jsonb));
end $$;

-- admin: change contract (text null = standard). A new version makes new workers accept again; existing commitments keep their version.
create or replace function update_contract(p jsonb) returns jsonb language plpgsql security definer set search_path to 'public' as $$
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
end $$;

create or replace function waive_cancellation(p_id uuid, p_waived boolean) returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if public.my_company() is null then raise exception 'not_admin'; end if;
  update plan_cancellations set waived = p_waived where id = p_id and company_id = public.my_company();
end $$;

revoke execute on function _contract_ok(workers), _log_cancel(workers, task_plans, text) from public, anon, authenticated;
