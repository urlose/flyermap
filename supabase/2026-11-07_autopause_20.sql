-- auto pause after 20 min without moving > 50 m (was 45); pause counts from the moment the worker stopped; cron every 2 min
-- same body as 2026-11-04_one_phone_autopause.sql with interval '20 minutes'
select cron.unschedule('auto-pause-still');
select cron.schedule('auto-pause-still', '*/2 * * * *', 'select public.auto_pause_still()');
