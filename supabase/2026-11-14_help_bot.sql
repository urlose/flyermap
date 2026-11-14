-- Applied 14.11.2026. Help bot: Claude writes a suggested answer to open worker reports; the admin sends it (never automatic).
-- Edge function: supabase/functions/help-bot (secret ANTHROPIC_API_KEY, model claude-haiku-5-5, effort low).
-- Limits in the function: 20 drafts per worker and 300 per firm a day.
create extension if not exists pg_net;
alter table public.companies add column if not exists bot_enabled boolean not null default false;
alter table public.companies add column if not exists bot_rules text;
alter table public.help_requests add column if not exists bot_draft text;
alter table public.help_requests add column if not exists bot_action text;   -- answer | admin | error
alter table public.help_requests add column if not exists bot_note text;
alter table public.help_requests add column if not exists bot_at timestamptz;
alter table public.help_requests add column if not exists bot_tokens int;
-- get_bot() / set_bot(enabled, rules): admin settings; _help_bot_ping(id): called at the end of help_request(),
-- posts the report id to the edge function when the report is still open and the firm turned the bot on.
-- Live definitions: select prosrc from pg_proc where proname in ('get_bot','set_bot','_help_bot_ping','help_request');
