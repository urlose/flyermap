-- "Need help": the walker reports a problem with a route (reason + text), the admin checks it and answers.
create table if not exists public.help_requests(
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  worker_id uuid not null references workers(id) on delete cascade,
  task_id uuid references tasks(id) on delete set null,
  plan_id uuid references task_plans(id) on delete set null,
  reason text not null,
  body text,
  lat double precision, lng double precision,
  created_at timestamptz not null default now(),
  status text not null default 'open',          -- open | done
  answer text, answered_at timestamptz, answered_by uuid);
create index if not exists help_requests_company_idx on public.help_requests(company_id, status, created_at desc);
alter table public.help_requests enable row level security;
drop policy if exists help_requests_admin_read on public.help_requests;
create policy help_requests_admin_read on public.help_requests for select using (company_id = public.my_company());

-- the walker sends a report (at most 10 open ones at a time)
create or replace function public.help_request(p_token uuid, p_plan_id uuid, p_reason text, p_text text, p_lat double precision default null, p_lng double precision default null)
 returns uuid language plpgsql security definer set search_path to 'public' as $$
declare w workers; p task_plans; v_id uuid;
begin
  w := _worker(p_token);
  if coalesce(trim(p_reason), '') = '' then raise exception 'reason_required'; end if;
  if (select count(*) from help_requests where worker_id = w.id and status = 'open') >= 10 then raise exception 'too_many_requests'; end if;
  if p_plan_id is not null then select * into p from task_plans where id = p_plan_id and worker_id = w.id; end if;
  insert into help_requests(company_id, worker_id, task_id, plan_id, reason, body, lat, lng)
    values (w.company_id, w.id, p.task_id, p.id, left(trim(p_reason), 40), nullif(left(trim(coalesce(p_text, '')), 1000), ''), p_lat, p_lng) returning id into v_id;
  return v_id;
end $$;

-- the walker's own reports with the admin's answer
create or replace function public.my_help(p_token uuid) returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare w workers;
begin
  w := _worker(p_token);
  return coalesce((select jsonb_agg(jsonb_build_object('id', h.id, 'reason', h.reason, 'body', h.body, 'created_at', h.created_at, 'status', h.status,
      'answer', h.answer, 'answered_at', h.answered_at, 'title', t.title) order by h.created_at desc)
    from (select * from help_requests where worker_id = w.id order by created_at desc limit 20) h left join tasks t on t.id = h.task_id), '[]'::jsonb);
end $$;

-- the admin closes a report, with an answer the walker gets as a message
create or replace function public.help_resolve(p_id uuid, p_answer text, p_title text default null) returns void language plpgsql security definer set search_path to 'public' as $$
declare h help_requests; co uuid := public.my_company();
begin
  if co is null then raise exception 'not_admin'; end if;
  select * into h from help_requests where id = p_id and company_id = co;
  if not found then raise exception 'not_found'; end if;
  update help_requests set status = 'done', answer = nullif(trim(coalesce(p_answer, '')), ''), answered_at = now(), answered_by = auth.uid() where id = p_id;
  if nullif(trim(coalesce(p_answer, '')), '') is not null then
    begin
      insert into notifications(worker_id, kind, title, body, task_id, plan_id) values (h.worker_id, 'help', coalesce(p_title, 'Antwort auf deine Meldung'), trim(p_answer), h.task_id, h.plan_id);
    exception when others then null;   -- the answer is stored on the report in any case
    end;
  end if;
end $$;

revoke all on function public.help_request(uuid, uuid, text, text, double precision, double precision) from public;
revoke all on function public.my_help(uuid) from public;
revoke all on function public.help_resolve(uuid, text, text) from public, anon;
grant execute on function public.help_request(uuid, uuid, text, text, double precision, double precision) to anon, authenticated;
grant execute on function public.my_help(uuid) to anon, authenticated;
grant execute on function public.help_resolve(uuid, text, text) to authenticated;
