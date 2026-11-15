-- Studios of a client chain (for now: FITYES for the first firm). In "Neuer Auftrag" the admin can pick a studio
-- instead of typing the start address; typing a free address stays possible. Only the firm's own admins see its list.
-- The list is filled once from the chain's website and refreshed by hand (button in the studio picker → edge function studios-sync).
create table if not exists public.studios (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  source text not null default 'fityes',          -- which chain / website
  slug text not null,                              -- id on the chain's website
  name text not null,
  address text not null,
  zip text, city text,
  lat double precision not null, lng double precision not null,
  status text not null default 'opened',           -- opened | coming_soon | gone (no longer on the website)
  opening_date date,
  updated_at timestamptz not null default now(),
  unique (company_id, source, slug)
);
alter table public.studios enable row level security;
drop policy if exists studios_admin_read on public.studios;
create policy studios_admin_read on public.studios for select using (company_id = public.my_company());

-- when the list was last refreshed (shown in the picker)
create or replace function public.studios_synced_at() returns timestamptz language sql stable security definer set search_path = public as $$
  select max(updated_at) from public.studios where company_id = public.my_company()
$$;
grant execute on function public.studios_synced_at() to authenticated;
