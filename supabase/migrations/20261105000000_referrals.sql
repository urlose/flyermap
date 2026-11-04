-- «Freund einladen»: a distributor invites a friend with a personal link (…/app/?ref=CODE).
-- The friend creates an account in the same company (no SMS, like ?neu=). As soon as the friend has really worked
-- (>= 60 min on an order) and the admin marks that order as done, the referral becomes "qualified" and the inviter
-- gets a notification. The admin pays the bonus himself and marks it as paid in the panel.
-- The programme is OFF per company until the admin sets an amount (companies.referral_bonus_eur > 0).

alter table public.companies add column if not exists referral_bonus_eur integer not null default 0;
alter table public.companies drop constraint if exists companies_referral_bonus_chk;
alter table public.companies add constraint companies_referral_bonus_chk check (referral_bonus_eur between 0 and 1000);

alter table public.workers add column if not exists ref_code text;
create unique index if not exists workers_ref_code_key on public.workers(ref_code) where ref_code is not null;

create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  inviter_id uuid not null references public.workers(id) on delete cascade,
  invitee_id uuid unique references public.workers(id) on delete set null,   -- friend deleted the account → stays in the list as "deleted"
  invitee_name text not null,
  bonus_eur integer not null,                                                  -- amount promised when the friend joined
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  qualified_at timestamptz,
  qualified_task_id uuid references public.tasks(id) on delete set null,
  paid_at timestamptz,
  paid_by uuid references auth.users(id) on delete set null,
  constraint referrals_status_chk check (status in ('pending', 'qualified', 'paid', 'rejected')),
  constraint referrals_not_self_chk check (invitee_id is distinct from inviter_id)
);
create index if not exists referrals_company_idx on public.referrals(company_id, created_at desc);
create index if not exists referrals_inviter_idx on public.referrals(inviter_id);

alter table public.referrals enable row level security;
drop policy if exists co_read on public.referrals;
create policy co_read on public.referrals for select to authenticated using (company_id = (select public.my_company()));
drop policy if exists master_read on public.referrals;
create policy master_read on public.referrals for select to authenticated using ((select public.is_master()));
revoke all on public.referrals from anon;
revoke insert, update, delete on public.referrals from authenticated;   -- changes only through the functions below
grant select on public.referrals to authenticated;

-- personal invitation code of a worker (6 characters, no 0/O/1/I), created on first use
create or replace function public._ref_code(p_worker uuid)
returns text language plpgsql security definer set search_path = public as $$
declare a constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; b bytea; c text;
begin
  select ref_code into c from workers where id = p_worker;
  if c is not null then return c; end if;
  loop
    b := extensions.gen_random_bytes(6); c := '';
    for i in 0..5 loop c := c || substr(a, 1 + (get_byte(b, i) % 32), 1); end loop;
    exit when not exists(select 1 from workers where ref_code = c);
  end loop;
  update workers set ref_code = c where id = p_worker;
  return c;
end $$;
revoke all on function public._ref_code(uuid) from public, anon, authenticated;

-- worker app: own code, amount and the list of invited friends
create or replace function public.my_referrals(p_token uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare w workers; v_bonus int;
begin
  w := _worker(p_token);
  select referral_bonus_eur into v_bonus from companies where id = w.company_id;
  return jsonb_build_object(
    'bonus', coalesce(v_bonus, 0),
    'code', case when coalesce(v_bonus, 0) > 0 then public._ref_code(w.id) else w.ref_code end,
    'list', coalesce((select jsonb_agg(jsonb_build_object('name', r.invitee_name, 'status', r.status, 'bonus', r.bonus_eur,
                        'created_at', r.created_at, 'qualified_at', r.qualified_at, 'paid_at', r.paid_at, 'deleted', r.invitee_id is null)
                        order by r.created_at desc)
                      from referrals r where r.inviter_id = w.id), '[]'::jsonb));
end $$;

-- invitation page: who invites and to which company (only first name of the inviter)
create or replace function public.firm_by_ref(p_code text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('firm', c.name, 'by', split_part(btrim(w.name), ' ', 1), 'bonus', c.referral_bonus_eur)
    from workers w join companies c on c.id = w.company_id
   where w.ref_code = upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'))
$$;

-- the friend creates the account (same as join_by_link) and the referral is recorded
create or replace function public.join_by_ref(p_code text, p_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare inv workers; c companies; tok uuid; new_id uuid;
begin
  select * into inv from workers where ref_code = upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  if not found then raise exception 'bad_code'; end if;
  select * into c from companies where id = inv.company_id;
  if c.join_code is null then raise exception 'bad_code'; end if;
  -- an inviter cannot fill the firm with fake friends: at most 10 open invitations per person and day
  if (select count(*) from referrals where inviter_id = inv.id and created_at > now() - interval '1 day') >= 10 then raise exception 'too_many'; end if;
  tok := public.join_by_link(c.join_code, p_name);   -- name check, company rate limit, placeholder phone
  select id into new_id from workers where token = tok;
  if c.referral_bonus_eur > 0 then
    insert into referrals(company_id, inviter_id, invitee_id, invitee_name, bonus_eur)
      values (c.id, inv.id, new_id, left(btrim(p_name), 80), c.referral_bonus_eur)
      on conflict (invitee_id) do nothing;
  end if;
  return tok;
end $$;

-- admin panel
create or replace function public.set_referral_bonus(p_eur integer)
returns integer language plpgsql security definer set search_path = public as $$
declare v_co uuid := public.my_company();
begin
  if v_co is null then raise exception 'not_admin'; end if;
  if p_eur is null or p_eur < 0 or p_eur > 1000 then raise exception 'bad_amount'; end if;
  update companies set referral_bonus_eur = p_eur where id = v_co;
  return p_eur;
end $$;

create or replace function public.admin_referrals()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_co uuid := public.my_company();
begin
  if v_co is null then raise exception 'not_admin'; end if;
  return jsonb_build_object(
    'bonus', (select referral_bonus_eur from companies where id = v_co),
    'list', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'status', r.status, 'bonus', r.bonus_eur, 'created_at', r.created_at,
                        'qualified_at', r.qualified_at, 'paid_at', r.paid_at,
                        'inviter_id', r.inviter_id, 'inviter', i.name, 'inviter_phone', i.phone,
                        'invitee_id', r.invitee_id, 'invitee', coalesce(f.name, r.invitee_name), 'deleted', r.invitee_id is null,
                        'task', t.title)
                        order by (r.status = 'qualified') desc, r.created_at desc)
                      from referrals r join workers i on i.id = r.inviter_id
                      left join workers f on f.id = r.invitee_id left join tasks t on t.id = r.qualified_task_id
                      where r.company_id = v_co), '[]'::jsonb));
end $$;

-- the admin approves by hand (qualified), marks as paid, rejects, or undoes "paid"
create or replace function public.set_referral_status(p_id uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
declare v_co uuid := public.my_company(); r referrals;
begin
  if v_co is null then raise exception 'not_admin'; end if;
  if p_status not in ('pending', 'qualified', 'paid', 'rejected') then raise exception 'bad_status'; end if;
  select * into r from referrals where id = p_id and company_id = v_co for update;
  if not found then raise exception 'not_found'; end if;
  update referrals set status = p_status,
    qualified_at = case when p_status in ('qualified', 'paid') then coalesce(qualified_at, now()) when p_status = 'pending' then null else qualified_at end,
    paid_at = case when p_status = 'paid' then now() else null end,
    paid_by = case when p_status = 'paid' then auth.uid() else null end
   where id = p_id;
  if p_status = 'qualified' and r.status = 'pending' then perform public._referral_notify(p_id); end if;
end $$;

-- message to the inviter (German like the rest of the server texts; the app shows it in the inbox)
create or replace function public._referral_notify(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r referrals;
begin
  select * into r from referrals where id = p_id;
  if not found then return; end if;
  insert into notifications(worker_id, kind, title, body)
  values (r.inviter_id, 'referral', 'Bonus für deine Einladung',
          r.invitee_name || ' hat den ersten Auftrag erledigt. Dein Bonus: ' || r.bonus_eur || ' €. Die Firma zahlt ihn dir aus.');
end $$;
revoke all on function public._referral_notify(uuid) from public, anon, authenticated;

-- an order is marked as done: every invited friend who worked >= 60 min on it qualifies
create or replace function public._referral_on_task_done()
returns trigger language plpgsql security definer set search_path = public as $$
declare x record;
begin
  for x in
    select r.id from referrals r
     where r.company_id = new.company_id and r.status = 'pending' and r.invitee_id is not null
       and exists(select 1 from routes ro where ro.task_id = new.id and ro.worker_id = r.invitee_id
                    and ro.ended_reason is distinct from 'replaced'
                  group by ro.worker_id
                  having sum(greatest(0, extract(epoch from (coalesce(ro.ended_at, now()) - ro.started_at)) - ro.break_s + coalesce(ro.adj_s, 0))) >= 3600)
  loop
    update referrals set status = 'qualified', qualified_at = now(), qualified_task_id = new.id where id = x.id;
    perform public._referral_notify(x.id);
  end loop;
  return null;
end $$;
revoke all on function public._referral_on_task_done() from public, anon, authenticated;
drop trigger if exists tasks_referral_done on public.tasks;
create trigger tasks_referral_done after update of status on public.tasks
  for each row when (new.status = 'done' and old.status is distinct from 'done') execute function public._referral_on_task_done();

-- who may call what
revoke all on function public.my_referrals(uuid) from public;
grant execute on function public.my_referrals(uuid) to anon, authenticated;
revoke all on function public.firm_by_ref(text) from public;
grant execute on function public.firm_by_ref(text) to anon, authenticated;
revoke all on function public.join_by_ref(text, text) from public;
grant execute on function public.join_by_ref(text, text) to anon, authenticated;
revoke all on function public.set_referral_bonus(integer) from public, anon;
grant execute on function public.set_referral_bonus(integer) to authenticated;
revoke all on function public.admin_referrals() from public, anon;
grant execute on function public.admin_referrals() to authenticated;
revoke all on function public.set_referral_status(uuid, text) from public, anon;
grant execute on function public.set_referral_status(uuid, text) to authenticated;
