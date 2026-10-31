-- Poppyseed Runway, step 1: themes, rounds, entries, votes, stars.
-- Adds to v2-friends.sql. Safe to run more than once. Nothing in version 1
-- or in the friends tables is changed, except one new nullable column
-- (groups.tz) so each squad gets its Friday 5pm in its own time zone.
-- If you re-run it after v6/v7 are in, paste v6 and v7 again afterwards
-- (this file carries the older round_entry_cards and clock).
--
-- =====================================================================
-- HOW TO TURN IT ON (David, about 3 minutes, in the Supabase dashboard
-- for project yrcddfehjjbtzwuotmym, signed in with Poppy's Gmail)
-- =====================================================================
-- 1. SQL Editor (left sidebar) > New query. Paste this WHOLE file. Run.
--    You should see "Success. No rows returned". Run it twice if you
--    like; it is idempotent.
-- 2. Database > Extensions > search "pg_cron" > turn it on (schema
--    "pg_catalog" or the default is fine). Then come back to the SQL
--    Editor and run this one line:
--
--      select cron.schedule('poppy-advance-rounds', '*/5 * * * *', 'select public.advance_rounds()');
--
--    That moves rounds along every 5 minutes even when nobody has the
--    app open (upcoming -> open -> reveal -> voting -> done, and makes
--    next week's round for every squad). The app also calls
--    advance_rounds() whenever someone opens the Runway tab, so the game
--    works before the cron exists; the cron is what makes the Friday
--    5pm drop happen on time while phones are in pockets.
-- 3. Database > Replication (or Realtime) > check that "rounds" is in
--    the supabase_realtime publication. Step 1 adds it; this is only a
--    look to confirm.
-- 4. First round: open the app's Runway tab in Poppy's squad. The squad
--    owner (Poppy) sees "Start a round now" the first time, so you do
--    not have to wait for Friday to test. After that, rounds open every
--    Friday 5pm in the owner's time zone.
-- =====================================================================
--
-- Timeline of one round (all computed from opens_at):
--   opens_at         theme drops, dressing room opens          status 'open'
--   closes_at        = opens_at + 24h, looks lock, runway plays status 'reveal'
--   reveal_at        = closes_at (kept as its own column for later)
--   reveal_at + 1h   runway over, straight to voting             status 'voting'
--   voting_ends_at   = reveal_at + 12h, or earlier if every vote is in: 'done'
-- Votes are allowed during 'reveal' and 'voting'. Nobody can read another
-- player's entry before 'reveal', or another player's vote ever: results
-- come back as totals and chip counts through round_results().

alter table groups add column if not exists tz text;

-- Themes ----------------------------------------------------------------
create table if not exists themes (
  id uuid primary key default gen_random_uuid(),
  text text not null unique,
  season text check (season in ('spring','summer','fall','winter')),
  used_at timestamptz,
  created_at timestamptz not null default now()
);

insert into themes (text, season) values
  ('Y2K', null),
  ('Rainy school day, but make it cute', null),
  ('Wear something you have never worn', null),
  ('Dress like your favourite song', null),
  ('Head to toe, one colour', null),
  ('Cosy Sunday', null),
  ('Beach day in the city', 'summer'),
  ('Sporty but fancy', null),
  ('Birthday party', null),
  ('Pattern clash', null),
  ('Movie night', null),
  ('First day of school', 'fall'),
  ('Denim on denim', null),
  ('Straight out of a fairy tale', null),
  ('Picnic in the park', 'spring'),
  ('Concert night', null),
  ('Retro 90s', null),
  ('Pyjama day, done right', null),
  ('Winter wonderland', 'winter'),
  ('Dress like your best friend', null)
on conflict (text) do nothing;

-- Rounds -----------------------------------------------------------------
create table if not exists rounds (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  theme_id uuid references themes(id) on delete set null,
  theme text,
  opens_at timestamptz not null,
  closes_at timestamptz not null,
  reveal_at timestamptz not null,
  voting_ends_at timestamptz not null,
  status text not null default 'upcoming'
    check (status in ('upcoming','open','reveal','voting','done')),
  picked_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists rounds_group_opens on rounds (group_id, opens_at desc);

-- Entries: one look per player per round.
create table if not exists entries (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references rounds(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  outfit jsonb not null default '{"items":[],"borrowed":[]}',
  photo_path text,
  worn_for_real boolean not null default false,
  submitted_at timestamptz not null default now(),
  unique (round_id, user_id)
);

-- Votes: 1 to 5 stars plus one compliment chip, one per voter per entry.
create table if not exists votes (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references entries(id) on delete cascade,
  voter_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  stars int not null check (stars between 1 and 5),
  chip text not null check (chip in ('colour','on theme','brave','fit','shoes')),
  created_at timestamptz not null default now(),
  unique (entry_id, voter_id)
);

-- Stars ledger: the ladder is a sum of these, never a stored total.
create table if not exists stars_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  round_id uuid references rounds(id) on delete cascade,
  reason text not null check (reason in ('votes','voted','finished','lent','wore')),
  amount int not null,
  created_at timestamptz not null default now(),
  unique (user_id, round_id, reason)
);

alter table themes enable row level security;
alter table rounds enable row level security;
alter table entries enable row level security;
alter table votes enable row level security;
alter table stars_ledger enable row level security;

-- Helpers (security definer so policies never recurse) ------------------
create or replace function round_group(r uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select group_id from rounds where id = r
$$;

create or replace function round_status(r uuid) returns text
language sql stable security definer set search_path = public as $$
  select status from rounds where id = r
$$;

-- Can the signed-in player see other people's entries in this round yet?
create or replace function round_revealed(r uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from rounds where id = r and is_member(group_id)
    and status in ('reveal','voting','done'))
$$;

-- Can the signed-in player vote on this entry right now?
create or replace function can_vote(e uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from entries en join rounds r on r.id = en.round_id
    where en.id = e and en.user_id <> auth.uid() and is_member(r.group_id)
      and r.status in ('reveal','voting'))
$$;

-- True when every member has voted on every entry that is not their own.
create or replace function votes_complete(r uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (
    select 1 from entries e
    join group_members m on m.group_id = round_group(r) and m.user_id <> e.user_id
    left join votes v on v.entry_id = e.id and v.voter_id = m.user_id
    where e.round_id = r and v.id is null)
$$;

-- Policies ----------------------------------------------------------------
drop policy if exists "anyone signed in reads themes" on themes;
create policy "anyone signed in reads themes" on themes for select using (auth.uid() is not null);

drop policy if exists "members see rounds" on rounds;
create policy "members see rounds" on rounds for select using (is_member(group_id));
-- No insert/update policies: rounds only move through advance_rounds().

drop policy if exists "own entry or revealed" on entries;
create policy "own entry or revealed" on entries for select
  using (user_id = auth.uid() or round_revealed(round_id));
drop policy if exists "enter while open" on entries;
create policy "enter while open" on entries for insert
  with check (user_id = auth.uid() and is_member(round_group(round_id)) and round_status(round_id) = 'open');
drop policy if exists "edit own entry while open" on entries;
create policy "edit own entry while open" on entries for update
  using (user_id = auth.uid() and round_status(round_id) = 'open')
  with check (user_id = auth.uid() and round_status(round_id) = 'open');
drop policy if exists "pull own entry while open" on entries;
create policy "pull own entry while open" on entries for delete
  using (user_id = auth.uid() and round_status(round_id) = 'open');

-- Players only ever read their own votes. Totals come from round_results().
drop policy if exists "own votes" on votes;
create policy "own votes" on votes for select using (voter_id = auth.uid());
drop policy if exists "vote once, not on yourself" on votes;
create policy "vote once, not on yourself" on votes for insert
  with check (voter_id = auth.uid() and can_vote(entry_id));
drop policy if exists "change your mind while voting is open" on votes;
create policy "change your mind while voting is open" on votes for update
  using (voter_id = auth.uid() and can_vote(entry_id))
  with check (voter_id = auth.uid() and can_vote(entry_id));

-- Squad mates can see each other's stars (for a squad ladder later).
drop policy if exists "group mates see stars" on stars_ledger;
create policy "group mates see stars" on stars_ledger for select using (is_group_mate(user_id));
-- No insert policy: only finish_round() writes here.

-- Scheduling -------------------------------------------------------------
-- Next Friday 17:00 in the squad's time zone, as an absolute time.
create or replace function next_drop(tz text) returns timestamptz
language plpgsql stable as $$
declare local_now timestamp := now() at time zone tz;
        d date := local_now::date;
        candidate timestamp;
begin
  candidate := (d + ((5 - extract(dow from d)::int + 7) % 7)) + time '17:00';
  if candidate <= local_now then candidate := candidate + interval '7 days'; end if;
  return candidate at time zone tz;
end $$;

create or replace function create_round(g uuid, opens timestamptz) returns uuid
language plpgsql security definer set search_path = public as $$
declare r uuid;
begin
  insert into rounds (group_id, opens_at, closes_at, reveal_at, voting_ends_at, status)
    values (g, opens, opens + interval '24 hours', opens + interval '24 hours', opens + interval '36 hours', 'upcoming')
    returning id into r;
  return r;
end $$;

-- Close a round: status done, and pay out stars.
--   votes:    every star a look received
--   finished: 2 for entering a look at all
--   voted:    1 for voting on every other look before the round closed
create or replace function finish_round(r uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update rounds set status = 'done' where id = r and status <> 'done';

  insert into stars_ledger (user_id, round_id, reason, amount)
    select e.user_id, r, 'votes', sum(v.stars)::int
    from entries e join votes v on v.entry_id = e.id
    where e.round_id = r group by e.user_id having sum(v.stars) > 0
  on conflict do nothing;

  insert into stars_ledger (user_id, round_id, reason, amount)
    select user_id, r, 'finished', 2 from entries where round_id = r
  on conflict do nothing;

  insert into stars_ledger (user_id, round_id, reason, amount)
    select m.user_id, r, 'voted', 1
    from group_members m
    where m.group_id = round_group(r)
      and exists (select 1 from entries e where e.round_id = r and e.user_id <> m.user_id)
      and not exists (
        select 1 from entries e
        left join votes v on v.entry_id = e.id and v.voter_id = m.user_id
        where e.round_id = r and e.user_id <> m.user_id and v.id is null)
  on conflict do nothing;
end $$;

-- The clock. Idempotent; safe to call from a cron every few minutes AND
-- from the app whenever the Runway tab opens.
create or replace function advance_rounds() returns void
language plpgsql security definer set search_path = public as $$
declare g record; r record; t record;
begin
  -- Every squad always has a round queued. A squad's very first round
  -- opens right away so the game can be tried without waiting for Friday.
  for g in select gr.id, coalesce(gr.tz, 'America/Chicago') as tz,
                  exists (select 1 from rounds x where x.group_id = gr.id) as played
           from groups gr
           where not exists (select 1 from rounds x where x.group_id = gr.id and x.status <> 'done') loop
    perform create_round(g.id, case when g.played then next_drop(g.tz) else now() end);
  end loop;

  -- upcoming -> open: the theme is assigned at the drop, never before.
  for r in select id from rounds where status = 'upcoming' and opens_at <= now() loop
    select id, text into t from themes order by used_at asc nulls first, random() limit 1;
    update rounds set status = 'open', theme_id = coalesce(theme_id, t.id), theme = coalesce(theme, t.text) where id = r.id;
    update themes set used_at = now() where id = t.id;
  end loop;

  -- open -> reveal -> voting, by the clock.
  update rounds set status = 'reveal' where status = 'open' and closes_at <= now();
  update rounds set status = 'voting' where status = 'reveal' and reveal_at + interval '1 hour' <= now();

  -- reveal/voting -> done when time is up or every vote is in.
  for r in select id from rounds where status in ('reveal','voting')
           and (voting_ends_at <= now() or votes_complete(id)) loop
    perform finish_round(r.id);
  end loop;
end $$;

-- Squad owner: open a round right now (first test, or an extra round).
-- Refuses while a round is already in play.
create or replace function start_round_now(g uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare r uuid;
begin
  if not exists (select 1 from groups where id = g and owner_id = auth.uid()) then
    raise exception 'Only the squad owner can start a round';
  end if;
  if exists (select 1 from rounds where group_id = g and status in ('open','reveal','voting')) then
    raise exception 'A round is already running';
  end if;
  select id into r from rounds where group_id = g and status = 'upcoming' order by opens_at limit 1;
  if r is null then r := create_round(g, now());
  else update rounds set opens_at = now(), closes_at = now() + interval '24 hours',
         reveal_at = now() + interval '24 hours', voting_ends_at = now() + interval '36 hours' where id = r;
  end if;
  perform advance_rounds();
  return r;
end $$;

-- What the app reads -----------------------------------------------------
-- Who has submitted so far: names only, never looks.
create or replace function round_submitted(r uuid) returns setof uuid
language sql stable security definer set search_path = public as $$
  select e.user_id from entries e where e.round_id = r and is_member(round_group(r))
$$;

-- Entries with their pieces, for the runway. Before the reveal you only
-- get your own. Pieces must belong to someone in the squad.
-- Dropped first because v6 widens this function's row type (adds
-- styled_by), and create or replace cannot change a return type.
drop function if exists round_entry_cards(uuid);
create or replace function round_entry_cards(r uuid)
returns table (entry_id uuid, user_id uuid, display_name text, emoji text, outfit jsonb,
               photo_path text, submitted_at timestamptz, pieces jsonb)
language sql stable security definer set search_path = public as $$
  select e.id, e.user_id, m.display_name, m.emoji, e.outfit, e.photo_path, e.submitted_at,
    coalesce((
      select jsonb_agg(jsonb_build_object('id', i.id, 'name', i.name, 'category', i.category,
                                          'cutout_path', i.cutout_path) order by x.ord)
      from jsonb_array_elements_text(coalesce(e.outfit->'items', '[]'::jsonb)) with ordinality as x(id, ord)
      join items i on i.id::text = x.id
      join group_members gm on gm.group_id = ro.group_id and gm.user_id = i.user_id
    ), '[]'::jsonb)
  from entries e
  join rounds ro on ro.id = e.round_id
  join group_members m on m.group_id = ro.group_id and m.user_id = e.user_id
  where e.round_id = r and is_member(ro.group_id)
    and (e.user_id = auth.uid() or ro.status in ('reveal','voting','done'))
  order by e.submitted_at
$$;

-- Totals and compliment counts per look, only once the round is done.
-- Never who gave what.
create or replace function round_results(r uuid)
returns table (entry_id uuid, total int, votes int, chips jsonb)
language sql stable security definer set search_path = public as $$
  select e.id, coalesce(sum(v.stars), 0)::int, count(v.id)::int,
    coalesce((select jsonb_object_agg(c.chip, c.n)
              from (select chip, count(*) as n from votes where entry_id = e.id group by chip) c), '{}'::jsonb)
  from entries e
  join rounds ro on ro.id = e.round_id
  left join votes v on v.entry_id = e.id
  where e.round_id = r and is_member(ro.group_id) and ro.status = 'done'
  group by e.id
$$;

-- Live updates: everyone's phone flips to the runway at once.
do $$ begin
  begin alter publication supabase_realtime add table rounds; exception when others then null; end;
end $$;

-- Cron: harmless if pg_cron is not enabled yet (see the header).
do $$ begin
  begin
    perform cron.schedule('poppy-advance-rounds', '*/5 * * * *', 'select public.advance_rounds()');
  exception when others then
    raise notice 'pg_cron is not enabled yet. Enable it under Database > Extensions, then run the cron.schedule line from the header.';
  end;
end $$;
