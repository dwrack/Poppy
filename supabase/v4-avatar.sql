-- Poppyseed Clothes v3, avatar step 1: one row of avatar presets per player.
-- Adds to v2-friends.sql and v3-game.sql. Safe to run more than once.
-- Nothing existing is changed.
--
-- =====================================================================
-- HOW TO TURN IT ON (David, about 1 minute, in the Supabase dashboard
-- for project yrcddfehjjbtzwuotmym, signed in with Poppy's Gmail)
-- =====================================================================
-- 1. SQL Editor (left sidebar) > New query. Paste this WHOLE file. Run.
--    You should see "Success. No rows returned". Idempotent; run it
--    twice if you like.
-- 2. That is it. The app writes a row the first time Poppy taps a preset
--    in You > My avatar, and keeps a local copy on the phone, so the
--    avatar works offline and before this is pasted (it just will not
--    follow her to a second device, and friends will see the default
--    look, until the table exists).
-- =====================================================================

create table if not exists avatar_presets (
  user_id uuid primary key references auth.users(id) on delete cascade default auth.uid(),
  face text not null default 'sweet'
    check (face in ('sweet','sunny','chill','wow')),
  skin text not null default 'fair'
    check (skin in ('porcelain','fair','light','medium','olive','tan','brown','deep')),
  hair text not null default 'long'
    check (hair in ('long','bob','ponytail','pigtails','buns','bun','braid','halfup','pixie','curls')),
  hair_colour text not null default 'brown'
    check (hair_colour in ('black','dark brown','brown','light brown','auburn','red','blonde','platinum','pink','blue')),
  eyes text not null default 'brown'
    check (eyes in ('brown','hazel','green','blue','grey','violet')),
  updated_at timestamptz not null default now()
);

alter table avatar_presets enable row level security;

-- Own row: read and write. Same pattern as profile.
drop policy if exists "own avatar" on avatar_presets;
create policy "own avatar" on avatar_presets
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Squad mates: read only, so the runway reveal can draw five different
-- girls. is_group_mate() comes from v2-friends.sql.
drop policy if exists "group mates see avatar" on avatar_presets;
create policy "group mates see avatar" on avatar_presets
  for select using (is_group_mate(user_id));
