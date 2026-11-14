-- Applied 14.11.2026. Standard help reports are answered by the app right away (nobody waits in the street):
--   closed / nobox / private -> answer "leave the piece out and go on", report closed, marked auto
--   gps                      -> first-aid tips, report stays open for the admin, marked auto
-- Every report stays visible to the admin. The answer is German + Russian in one text, because the server does not know the
-- worker's language and it has to work in every app version already installed.
alter table public.help_requests add column if not exists auto boolean not null default false;
-- function public.help_request(...): see the live definition (select prosrc from pg_proc where proname = 'help_request')
