-- Applied 13.11.2026. A pause was counted several times when the app restarted a session during a pause:
-- the app re-sent the old pause time to every new session, and a pause could be taken off a session that had already ended.
-- Now a pause never starts before its own session, and a late resume only counts up to the end of the session.
create or replace function public.pause_route(p_token uuid, p_route_id uuid, p_at timestamptz default null) returns void language plpgsql security definer set search_path to 'public' as $$
declare w workers;
begin w := _worker(p_token);
  update routes set paused_at = coalesce(paused_at, greatest(least(coalesce(p_at, now()), now()), started_at)) where id = p_route_id and worker_id = w.id and ended_at is null; end $$;

create or replace function public.resume_route(p_token uuid, p_route_id uuid, p_at timestamptz default null) returns void language plpgsql security definer set search_path to 'public' as $$
declare w workers; v_at timestamptz := least(coalesce(p_at, now()), now());
begin w := _worker(p_token);
  update routes set break_s = break_s + greatest(0, extract(epoch from (least(v_at, coalesce(ended_at, v_at)) - greatest(paused_at, started_at)))::int), paused_at = null, auto_paused = false where id = p_route_id and worker_id = w.id and paused_at is not null; end $$;
