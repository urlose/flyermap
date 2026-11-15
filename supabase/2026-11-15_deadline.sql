-- 15.11.2026: deadline of an order ("fertig bis"). The admin sets it when creating the order (the working days of the plan
-- follow from it); workers see it and pick their dates. Dates after the deadline need the admin's approval:
-- task_plans.late_dates (set by trigger from work_dates and tasks.deadline), task_plans.late_ok (admin approved).
alter table public.tasks add column if not exists deadline date;
alter table public.task_plans add column if not exists late_dates boolean not null default false, add column if not exists late_ok boolean not null default false;

create or replace function public._plan_late() returns trigger language plpgsql security definer set search_path = public as $$
declare dl date;
begin
  if tg_op = 'UPDATE' and new.work_dates is not distinct from old.work_dates and new.task_id = old.task_id then return new; end if;
  select deadline into dl from tasks where id = new.task_id;
  new.late_dates := dl is not null and exists (select 1 from jsonb_array_elements_text(coalesce(new.work_dates, '[]'::jsonb)) d where d::date > dl);
  if not new.late_dates or tg_op = 'INSERT' then new.late_ok := false; elsif new.work_dates is distinct from old.work_dates then new.late_ok := false; end if;
  return new;
end $$;
drop trigger if exists plan_late on public.task_plans;
create trigger plan_late before insert or update on public.task_plans for each row execute function public._plan_late();

create or replace function public._task_deadline_late() returns trigger language plpgsql security definer set search_path = public as $$
begin
  update task_plans p set late_dates = new.deadline is not null and exists (select 1 from jsonb_array_elements_text(coalesce(p.work_dates, '[]'::jsonb)) d where d::date > new.deadline)
   where p.task_id = new.id;
  return new;
end $$;
drop trigger if exists task_deadline_late on public.tasks;
create trigger task_deadline_late after update of deadline on public.tasks for each row when (new.deadline is distinct from old.deadline) execute function public._task_deadline_late();

-- worker_me (applied on the live database by text replacement of the current definition):
--   'work_date', t.work_date,      → 'work_date', t.work_date, 'deadline', t.deadline,
--   'work_dates', p.work_dates,    → 'work_dates', p.work_dates, 'late_dates', p.late_dates, 'late_ok', p.late_ok,
-- First firm renamed: companies.name = 'Fityes' (b8bf862e-…).
