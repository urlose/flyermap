-- Security phase 2 (16.11.2026): take away rights nobody uses. Checked before (production catalog, read-only):
--  * 9 admin SECURITY DEFINER functions: EXECUTE for PUBLIC + anon + authenticated + service_role. They are called only from
--    admin screens with a signed-in session (worker/src/admin.js, stats.js, livemap.js, contractview.js -> bindAdminContract).
--    -> EXECUTE is taken from PUBLIC and anon; authenticated and service_role keep it.
--  * 4 trigger functions (return trigger): EXECUTE for PUBLIC/anon/authenticated/service_role. Postgres checks EXECUTE on a
--    trigger function only when the trigger is created, not when it fires (test/sql/security2_grants.sh proves the
--    triggers still fire for admins and for worker functions). -> taken from PUBLIC, anon, authenticated; service_role keeps it.
--  * 10 service tables, RLS on, no policies: ALL for anon + authenticated. Only SECURITY DEFINER functions (owner postgres),
--    triggers, cron (postgres) and edge functions (service_role) use them; nothing in the app reads them directly.
--    -> ALL taken from anon and authenticated on the tables and on their 5 id sequences; postgres and service_role keep it.
-- Not touched: worker token functions, my_company/is_admin/is_master (used in RLS), tables with policies, default privileges.
-- Rollback: supabase/rollback/2026-11-16_security2_grants.down.sql
begin;

-- 1. admin functions (exact signatures)
revoke execute on function
  public.company_contract(), public.company_stats(), public.company_tracks(uuid[]), public.merge_tasks(uuid, uuid[]),
  public.set_verified(uuid, boolean), public.studios_synced_at(), public.update_contract(jsonb),
  public.waive_cancellation(uuid, boolean), public.worker_stats()
  from public, anon;

-- 2. trigger functions
revoke execute on function public._keep_plan(), public._keep_task(), public._plan_late(), public._task_deadline_late()
  from public, anon, authenticated;

-- 3. service tables and their sequences
revoke all on table
  public._plan_runs, public.admin_manual_log, public.plan_cancellations, public.plan_path_backup, public.skipped_backup,
  public.task_merges, public.task_plans_trash, public.tasks_history, public.wa_settings, public.wa_verify
  from anon, authenticated;
revoke all on sequence
  public._plan_runs_id_seq, public.admin_manual_log_id_seq, public.task_merges_id_seq, public.task_plans_trash_id_seq,
  public.tasks_history_id_seq
  from anon, authenticated;

commit;
