-- User-created/edited workout plans, and session-delete tombstones.
--
-- These were first applied to the live project by hand; this migration records
-- them so the schema (and its RLS) is reproducible from the repo. Both mirror
-- the sessions table in 0001: RLS on, own-rows-only, nothing granted to anon.

-- Plans are MUTABLE (unlike immutable sessions), so the app syncs them
-- last-write-wins by updated_at, and a delete is a `deleted` flag that
-- propagates. Payload is the plan exactly as stored locally (jsonb object).
create table if not exists public.custom_plans (
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id         text not null,
  payload    jsonb not null check (jsonb_typeof(payload) = 'object'),
  updated_at timestamptz not null default now(),
  deleted    boolean not null default false,
  primary key (user_id, id)
);
alter table public.custom_plans enable row level security;

create policy "own plans"
  on public.custom_plans for all
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
-- No delete grant: removals are soft (update deleted = true), so the tombstone
-- can sync instead of a hard delete resurrecting on the next pull.
grant select, insert, update on public.custom_plans to authenticated;

-- Tombstones for deleted completed sessions. Session sync is union-by-id and
-- never removes, so a delete only sticks if the id is remembered and pushed.
create table if not exists public.deleted_sessions (
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  session_id text not null,
  deleted_at timestamptz not null default now(),
  primary key (user_id, session_id)
);
alter table public.deleted_sessions enable row level security;

create policy "own tombstones"
  on public.deleted_sessions for all
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
grant select, insert on public.deleted_sessions to authenticated;
