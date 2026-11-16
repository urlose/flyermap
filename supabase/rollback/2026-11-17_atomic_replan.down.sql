-- Rollback of 2026-11-17_atomic_replan.sql. No data is removed: archived rows in task_plans_trash stay.
begin;
drop function if exists public.replan_task_with_plans(uuid, jsonb, jsonb);
drop trigger if exists keep_plan_replan on public.task_plans;
drop function if exists public._keep_plan_replan();
commit;
