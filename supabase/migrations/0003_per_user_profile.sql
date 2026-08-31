-- Per-user constraint profile becomes the source of truth (was inferred from
-- the active split). The profiles table already exists (0001); this makes it
-- syncable and fixes the defaults.

-- Sync bookkeeping: LWW ordering for profile_id, and a one-time starter-seed
-- flag (used by the next migration's client work).
alter table public.profiles add column if not exists updated_at     timestamptz not null default now();
alter table public.profiles add column if not exists starters_seeded boolean    not null default false;

-- Backfill EVERY existing user fail-closed to the restrictive profile. The table
-- has been empty (the client never wrote it), so without this an existing
-- restricted user (L5-S1) would hit the new-user path and load the full library
-- — the one unsafe direction. Anyone who actually has no restriction flips it
-- in-app. New users (signing up after this) get 'unrestricted' from the client.
insert into public.profiles (user_id, profile_id)
  select id, 'l5s1' from auth.users
  on conflict (user_id) do nothing;

-- Future rows created without an explicit value default to unrestricted (the
-- client still passes profile_id explicitly on create; this is belt-and-braces).
alter table public.profiles alter column profile_id set default 'unrestricted';
