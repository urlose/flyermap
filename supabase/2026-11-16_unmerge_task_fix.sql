-- P0 fix (16.11.2026): public.unmerge_task(uuid) could be run without login.
-- Old check:  if not exists(platform admin) and auth.uid() is not null then raise
--   -> for a caller without JWT (role anon, auth.uid() = null) the condition is false, nothing is raised.
-- New check: allowed only for a platform admin (signed in) or for a direct database session as "postgres"
--   (SQL editor / maintenance; API calls always arrive as session_user "authenticator").
-- In addition EXECUTE is taken from PUBLIC and anon. authenticated and service_role keep it.
-- The body after the check is unchanged. Rollback: supabase/rollback/2026-11-16_unmerge_task_fix.down.sql
begin;

create or replace function public.unmerge_task(p_source uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare m task_merges;
begin
  if not (session_user = 'postgres' or (auth.uid() is not null and exists(select 1 from platform_admins where user_id = auth.uid()))) then raise exception 'not_allowed'; end if;
  select * into m from task_merges where source = p_source order by id desc limit 1;
  if m.id is null then raise exception 'not_merged'; end if;
  update task_plans set task_id = p_source, idx = idx - (select coalesce(min(idx), 0) from task_plans where id = any(m.plan_ids)) where id = any(m.plan_ids);
  update routes set task_id = p_source where id = any(m.route_ids);
  insert into task_workers(task_id, worker_id) select p_source, unnest(m.worker_ids) on conflict do nothing;
  delete from task_workers tw where tw.task_id = m.target and not exists(select 1 from task_plans p where p.task_id = m.target and p.worker_id = tw.worker_id);
  update tasks set merged_into = null where id = p_source;
  update tasks set flyers = greatest(0, flyers - coalesce((m.source_row->>'flyers')::int, 0)) where id = m.target;
  delete from task_merges where id = m.id;
end $function$;

revoke execute on function public.unmerge_task(uuid) from public, anon;
grant execute on function public.unmerge_task(uuid) to authenticated, service_role;

commit;
