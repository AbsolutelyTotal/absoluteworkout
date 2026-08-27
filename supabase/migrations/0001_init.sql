-- absoluteworkout — Phase 1: auth + session sync.
-- Run in the Supabase SQL editor. Assumes the project was created with
-- "automatically expose new tables" OFF and "automatic RLS" ON — grants and
-- policies below are therefore both explicit and load-bearing.

-- One row per user: display name + which constraint profile they train under.
create table public.profiles (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  name       text,
  profile_id text not null default 'l5s1',
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "own profile"
  on public.profiles for all
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

grant select, insert, update on public.profiles to authenticated;

-- Completed sessions, payload exactly as the app stores it locally (jsonb).
-- Only COMPLETED sessions are pushed and completed sessions are immutable in
-- the app, so sync is a union by id with no conflict resolution.
create table public.sessions (
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id         text not null,
  payload    jsonb not null check (jsonb_typeof(payload) = 'object'),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

alter table public.sessions enable row level security;

create policy "own sessions"
  on public.sessions for all
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

grant select, insert, update, delete on public.sessions to authenticated;

-- Nothing is granted to anon: a signed-out client can reach the API but can
-- read and write no rows at all.
