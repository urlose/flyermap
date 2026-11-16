-- Rollback of 2026-11-16_unmerge_task_fix.sql: the exact definition and grants as read from production on 16.11.2026
-- (pg_get_functiondef md5 28306ff049cbe8b907fea30ebe08a4be, ACL {=X,postgres=X,anon=X,authenticated=X,service_role=X}).
-- WARNING: this brings the hole back (callable without login). Use only if the fix breaks something.
begin;

CREATE OR REPLACE FUNCTION public.unmerge_task(p_source uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare m task_merges;
begin
  if not exists(select 1 from platform_admins where user_id = auth.uid()) and auth.uid() is not null then raise exception 'not_allowed'; end if;
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

grant execute on function public.unmerge_task(uuid) to public, anon, authenticated, service_role;

commit;
