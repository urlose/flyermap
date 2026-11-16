-- Rollback of 2026-11-16_ai_phase_b.sql: removes draft history, outcomes, solutions and their functions / triggers.
-- No existing function is touched by phase B, so nothing has to be restored. WARNING: the saved history and solutions
-- are deleted with the tables.
begin;
drop trigger if exists help_draft_keep on public.help_requests;
drop trigger if exists help_outcome on public.help_requests;
drop function if exists public.help_solutions_for(uuid, text, text, integer);
drop function if exists public.help_solution_archive(uuid);
drop function if exists public.help_solution_revise(uuid);
drop function if exists public.help_solution_approve(uuid);
drop function if exists public.help_solution_update(uuid, text, text, text, text, text);
drop function if exists public.help_solution_propose(uuid, text, text, text, text, text);
drop function if exists public.help_outcome_set(uuid, text);
drop table if exists public.help_solutions;
drop table if exists public.help_request_outcomes;
drop table if exists public.help_drafts;
drop function if exists public._help_solution_frozen();
drop function if exists public._help_outcome();
drop function if exists public._help_draft_keep();
drop function if exists public.help_redact(text, uuid);
commit;
