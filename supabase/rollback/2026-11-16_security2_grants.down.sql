-- Rollback of 2026-11-16_security2_grants.sql: gives back exactly the rights read from production on 16.11.2026
-- (functions {=X, anon=X, authenticated=X, ...}; tables anon/authenticated=arwdDxtm; sequences anon/authenticated=rwU).
begin;

grant execute on function
  public.company_contract(), public.company_stats(), public.company_tracks(uuid[]), public.merge_tasks(uuid, uuid[]),
  public.set_verified(uuid, boolean), public.studios_synced_at(), public.update_contract(jsonb),
  public.waive_cancellation(uuid, boolean), public.worker_stats()
  to public, anon;

grant execute on function public._keep_plan(), public._keep_task(), public._plan_late(), public._task_deadline_late()
  to public, anon, authenticated;

grant all on table
  public._plan_runs, public.admin_manual_log, public.plan_cancellations, public.plan_path_backup, public.skipped_backup,
  public.task_merges, public.task_plans_trash, public.tasks_history, public.wa_settings, public.wa_verify
  to anon, authenticated;
grant all on sequence
  public._plan_runs_id_seq, public.admin_manual_log_id_seq, public.task_merges_id_seq, public.task_plans_trash_id_seq,
  public.tasks_history_id_seq
  to anon, authenticated;

commit;
