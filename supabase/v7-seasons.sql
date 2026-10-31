-- Poppyseed Runway, seasons: theme packs, a 12-round season counter,
-- season badges and an end-of-season summary. Adds to v3-game.sql. Safe
-- to run more than once. Nothing in version 1, the friends tables or the
-- step 1 game tables is dropped; rounds gains two nullable columns
-- (season_no, round_no) and themes gains one (pack_id).
--
-- =====================================================================
-- HOW TO TURN IT ON (David, about 2 minutes, in the Supabase dashboard
-- for project yrcddfehjjbtzwuotmym, signed in with Poppy's Gmail)
-- =====================================================================
-- 1. v3-game.sql must already be in (the rounds table exists). If you are
--    not sure, run v3-game.sql first; it is idempotent too.
-- 2. SQL Editor (left sidebar) > New query. Paste this WHOLE file. Run.
--    You should see "Success. No rows returned".
-- 3. That is it. No new extension, no new cron: the existing
--    poppy-advance-rounds cron keeps calling advance_rounds(), which now
--    picks themes from the pack in season and numbers each round inside
--    its season.
-- 4. To check: `select name, starts_on, ends_on from theme_packs;` shows
--    5 packs, and `select * from active_pack();` shows the one in season
--    today (Everyday when none is).
-- =====================================================================
--
-- How a season works:
--   A season is 12 rounds per squad, counted from the squad's first round
--   that actually opened. rounds.season_no / rounds.round_no are stamped
--   the moment a round opens. When round 12 of a season finishes,
--   finish_round() awards season badges, and the app shows the
--   end-of-season podium (season_summary) until the next round opens.
--
-- How a pack works:
--   theme_packs has a date window per pack (month and day; the year in
--   the column is ignored so the window repeats every year). When a round
--   opens, advance_rounds() picks the least-recently-used theme from the
--   pack in season (on the squad's local date); outside every window it
--   picks from Everyday. The app paints the lobby card and the podium with
--   the colours of the pack the current round's theme came from, and only
--   asks active_pack() for today's pack while no round is in play.

-- Theme packs --------------------------------------------------------------
create table if not exists theme_packs (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  starts_on date,
  ends_on date,
  lobby_colour text not null default '#2a2a2a',
  confetti_colour text not null default '#e76f51',
  created_at timestamptz not null default now()
);

alter table themes add column if not exists pack_id uuid references theme_packs(id) on delete set null;
create index if not exists themes_pack on themes (pack_id);

insert into theme_packs (name, starts_on, ends_on, lobby_colour, confetti_colour) values
  ('Everyday',      null,         null,         '#2a2a2a', '#e76f51'),
  ('Halloween',     '2026-10-01', '2026-10-31', '#3b1f4a', '#ff8c42'),
  ('Winter Formal', '2026-12-01', '2027-01-15', '#1b2a49', '#cfe8ff'),
  ('Spring Break',  '2026-03-01', '2026-04-15', '#1f6f5f', '#f9c6d0'),
  ('Summer',        '2026-06-01', '2026-08-31', '#1d5c8f', '#ffe066')
on conflict (name) do update
  set starts_on = excluded.starts_on, ends_on = excluded.ends_on,
      lobby_colour = excluded.lobby_colour, confetti_colour = excluded.confetti_colour;

-- Ten themes per seasonal pack. A theme that already exists keeps its text
-- and moves into the pack.
insert into themes (text, pack_id)
select t.text, p.id from theme_packs p
join (values
  ('Halloween', 'Spooky but make it cute'),
  ('Halloween', 'Witchy vibes'),
  ('Halloween', 'All black everything'),
  ('Halloween', 'Pumpkin patch day'),
  ('Halloween', 'Dress like a movie villain'),
  ('Halloween', 'Orange and black'),
  ('Halloween', 'Cosy haunted house'),
  ('Halloween', 'Trick or treat chic'),
  ('Halloween', 'Black cat energy'),
  ('Halloween', 'Candy corn colours'),
  ('Winter Formal', 'Winter formal'),
  ('Winter Formal', 'Snow day sparkle'),
  ('Winter Formal', 'Velvet and shine'),
  ('Winter Formal', 'Ice queen'),
  ('Winter Formal', 'Holiday party'),
  ('Winter Formal', 'Cosy cabin weekend'),
  ('Winter Formal', 'Silver and white'),
  ('Winter Formal', 'New Year countdown'),
  ('Winter Formal', 'Red carpet in the snow'),
  ('Winter Formal', 'Scarf season'),
  ('Spring Break', 'Spring break road trip'),
  ('Spring Break', 'Pastel everything'),
  ('Spring Break', 'Flower power'),
  ('Spring Break', 'Picnic in the sun'),
  ('Spring Break', 'Rainy day rainbow'),
  ('Spring Break', 'Garden party'),
  ('Spring Break', 'Sneakers and a sundress'),
  ('Spring Break', 'Beach bag ready'),
  ('Spring Break', 'Fresh and floral'),
  ('Spring Break', 'Sunglasses on'),
  ('Summer', 'Pool party'),
  ('Summer', 'Summer camp'),
  ('Summer', 'Ice cream run'),
  ('Summer', 'Sunset at the beach'),
  ('Summer', 'Festival fit'),
  ('Summer', 'Boardwalk day'),
  ('Summer', 'Bright and loud'),
  ('Summer', 'Lemonade stand'),
  ('Summer', 'Fourth of July'),
  ('Summer', 'Road trip playlist')
) as t(pack, text) on t.pack = p.name
on conflict (text) do update set pack_id = excluded.pack_id;

-- The 20 step 1 themes (and anything else without a pack) are Everyday.
update themes set pack_id = (select id from theme_packs where name = 'Everyday') where pack_id is null;

alter table theme_packs enable row level security;
drop policy if exists "anyone signed in reads packs" on theme_packs;
create policy "anyone signed in reads packs" on theme_packs for select using (auth.uid() is not null);
-- No write policies: packs are curated in SQL, never from the app.

-- Is this pack in season on day d? Compares month+day so it repeats yearly
-- and handles windows that cross New Year (Winter Formal).
create or replace function pack_active_on(starts_on date, ends_on date, d date) returns boolean
language sql stable as $$
  select case
    when starts_on is null or ends_on is null then false
    when to_char(starts_on, 'MMDD') <= to_char(ends_on, 'MMDD')
      then to_char(d, 'MMDD') between to_char(starts_on, 'MMDD') and to_char(ends_on, 'MMDD')
    else to_char(d, 'MMDD') >= to_char(starts_on, 'MMDD') or to_char(d, 'MMDD') <= to_char(ends_on, 'MMDD')
  end
$$;

-- The pack in season on day d (the caller's local date; the app passes the
-- phone's), else Everyday. One row. Only used when no round is open: an open
-- round carries its own pack via themes.pack_id.
drop function if exists active_pack();
create or replace function active_pack(d date default current_date)
returns table (id uuid, name text, lobby_colour text, confetti_colour text)
language sql stable security definer set search_path = public as $$
  select p.id, p.name, p.lobby_colour, p.confetti_colour from theme_packs p
  where auth.uid() is not null
  order by pack_active_on(p.starts_on, p.ends_on, d) desc, (p.name = 'Everyday') desc, p.starts_on
  limit 1
$$;

-- Least-recently-used theme from the pack in season on day d, else from Everyday.
drop function if exists pick_theme();
create or replace function pick_theme(d date default current_date) returns themes
language sql stable security definer set search_path = public as $$
  select t.* from themes t
  join theme_packs p on p.id = t.pack_id
  order by pack_active_on(p.starts_on, p.ends_on, d) desc, (p.name = 'Everyday') desc,
           t.used_at asc nulls first, random()
  limit 1
$$;

-- Season counter --------------------------------------------------------------
alter table rounds add column if not exists season_no int;
alter table rounds add column if not exists round_no int check (round_no between 1 and 12);

-- Rounds that opened before this file ran: number them in order.
with numbered as (
  select id, row_number() over (partition by group_id order by opens_at, created_at) - 1 as n
  from rounds where status <> 'upcoming'
)
update rounds r set season_no = n.n / 12 + 1, round_no = n.n % 12 + 1
from numbered n where n.id = r.id and r.season_no is null;

-- Season badges ------------------------------------------------------------------
create table if not exists season_badges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  group_id uuid not null references groups(id) on delete cascade,
  season_no int not null,
  badge text not null check (badge in ('Season Winner', 'Most Improved', 'Never Missed a Round', 'Best Lender')),
  created_at timestamptz not null default now(),
  unique (user_id, group_id, season_no, badge)
);
create index if not exists season_badges_group on season_badges (group_id, season_no);

alter table season_badges enable row level security;
drop policy if exists "own badges and squad mates' badges" on season_badges;
create policy "own badges and squad mates' badges" on season_badges for select
  using (user_id = auth.uid() or (is_member(group_id) and is_group_mate(user_id)));
-- No insert/update/delete policies: only award_season_badges() writes here.

-- Per-member totals for one season of one squad. Members only.
--   stars        every star in the ledger for rounds of that season
--   entered      rounds (done) the member put a look in
--   voted        rounds the member earned the 'voted' star
--   wins         rounds where the member's look had the top vote total
--   rounds_done  how many of the season's 12 rounds have finished (same on every row)
create or replace function season_summary(g uuid, s int)
returns table (user_id uuid, display_name text, emoji text, stars int, entered int, voted int, wins int, rounds_done int)
language sql stable security definer set search_path = public as $$
  select m.user_id, m.display_name, m.emoji,
    coalesce((select sum(l.amount) from stars_ledger l join rounds r on r.id = l.round_id
              where l.user_id = m.user_id and r.group_id = g and r.season_no = s), 0)::int,
    (select count(*) from entries e join rounds r on r.id = e.round_id
     where e.user_id = m.user_id and r.group_id = g and r.season_no = s and r.status = 'done')::int,
    (select count(*) from stars_ledger l join rounds r on r.id = l.round_id
     where l.user_id = m.user_id and l.reason = 'voted' and r.group_id = g and r.season_no = s)::int,
    (select count(*) from rounds r
     where r.group_id = g and r.season_no = s and r.status = 'done'
       and exists (select 1 from stars_ledger l where l.round_id = r.id and l.user_id = m.user_id and l.reason = 'votes'
                   and l.amount = (select max(amount) from stars_ledger where round_id = r.id and reason = 'votes')))::int,
    (select count(*) from rounds r where r.group_id = g and r.season_no = s and r.status = 'done')::int
  from group_members m
  where m.group_id = g and is_member(g)
  order by 4 desc, m.display_name
$$;

-- Hand out the badges for a finished season. Idempotent. Internal: called
-- by finish_round(); not callable from the app.
--   Season Winner          most season stars (ties all win)
--   Most Improved          biggest gain over the previous season (season 2+,
--                          only members who entered a round last season)
--   Never Missed a Round   a look in every one of the 12 rounds
--   Best Lender            most 'lent' stars; placeholder until borrowing
--                          pays into the ledger, so it never fires yet
create or replace function award_season_badges(g uuid, s int) returns void
language plpgsql security definer set search_path = public as $$
declare top int; best_gain int; most_lent int;
begin
  if (select count(*) from rounds where group_id = g and season_no = s and status = 'done') < 12 then return; end if;

  create temp table if not exists _season_tot (user_id uuid, stars int, entered int) on commit drop;
  delete from _season_tot;
  insert into _season_tot
    select m.user_id,
      coalesce((select sum(l.amount) from stars_ledger l join rounds r on r.id = l.round_id
                where l.user_id = m.user_id and r.group_id = g and r.season_no = s), 0),
      (select count(*) from entries e join rounds r on r.id = e.round_id
       where e.user_id = m.user_id and r.group_id = g and r.season_no = s and r.status = 'done')
    from group_members m where m.group_id = g;

  select max(stars) into top from _season_tot;
  if top > 0 then
    insert into season_badges (user_id, group_id, season_no, badge)
      select user_id, g, s, 'Season Winner' from _season_tot where stars = top
    on conflict do nothing;
  end if;

  insert into season_badges (user_id, group_id, season_no, badge)
    select user_id, g, s, 'Never Missed a Round' from _season_tot where entered = 12
  on conflict do nothing;

  -- Only members who entered at least one round last season can improve on
  -- it; a newcomer's gain from 0 is not improvement.
  if s > 1 then
    select max(t.stars - coalesce((select sum(l.amount) from stars_ledger l join rounds r on r.id = l.round_id
                                   where l.user_id = t.user_id and r.group_id = g and r.season_no = s - 1), 0))
      into best_gain from _season_tot t
      where exists (select 1 from entries e join rounds r on r.id = e.round_id
                    where e.user_id = t.user_id and r.group_id = g and r.season_no = s - 1);
    if best_gain > 0 then
      insert into season_badges (user_id, group_id, season_no, badge)
        select t.user_id, g, s, 'Most Improved' from _season_tot t
        where exists (select 1 from entries e join rounds r on r.id = e.round_id
                      where e.user_id = t.user_id and r.group_id = g and r.season_no = s - 1)
          and t.stars - coalesce((select sum(l.amount) from stars_ledger l join rounds r on r.id = l.round_id
                                  where l.user_id = t.user_id and r.group_id = g and r.season_no = s - 1), 0) = best_gain
      on conflict do nothing;
    end if;
  end if;

  select max(x.n) into most_lent from (
    select l.user_id, sum(l.amount) as n from stars_ledger l join rounds r on r.id = l.round_id
    where l.reason = 'lent' and r.group_id = g and r.season_no = s group by l.user_id) x;
  if most_lent > 0 then
    insert into season_badges (user_id, group_id, season_no, badge)
      select x.user_id, g, s, 'Best Lender' from (
        select l.user_id, sum(l.amount) as n from stars_ledger l join rounds r on r.id = l.round_id
        where l.reason = 'lent' and r.group_id = g and r.season_no = s group by l.user_id) x
      where x.n = most_lent
    on conflict do nothing;
  end if;
end $$;
revoke execute on function award_season_badges(uuid, int) from public, anon, authenticated;

-- finish_round: same payout as step 1, plus season badges after round 12.
create or replace function finish_round(r uuid) returns void
language plpgsql security definer set search_path = public as $$
declare ro rounds;
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

  select * into ro from rounds where id = r;
  if ro.round_no = 12 then perform award_season_badges(ro.group_id, ro.season_no); end if;
end $$;
-- Internal: only advance_rounds() ends a round. Neither this nor create_round
-- was revoked in step 1, so a signed-in member could call them directly.
revoke execute on function finish_round(uuid) from public, anon, authenticated;
revoke execute on function create_round(uuid, timestamptz) from public, anon, authenticated;

-- advance_rounds: same clock as step 1; the theme now comes from the pack
-- in season (on the squad's local date), and every round is stamped with its season and round number
-- as it opens.
create or replace function advance_rounds() returns void
language plpgsql security definer set search_path = public as $$
declare g record; r record; t themes; n int;
begin
  for g in select gr.id, coalesce(gr.tz, 'America/Chicago') as tz,
                  exists (select 1 from rounds x where x.group_id = gr.id) as played
           from groups gr
           where not exists (select 1 from rounds x where x.group_id = gr.id and x.status <> 'done') loop
    perform create_round(g.id, case when g.played then next_drop(g.tz) else now() end);
  end loop;

  -- The pack is judged on the squad's local date, not UTC, so Halloween
  -- doesn't end at 7pm Chicago on Oct 31.
  for r in select x.id, x.group_id, coalesce(gr.tz, 'America/Chicago') as tz
           from rounds x join groups gr on gr.id = x.group_id
           where x.status = 'upcoming' and x.opens_at <= now() order by x.opens_at loop
    t := pick_theme((now() at time zone r.tz)::date);
    select count(*) into n from rounds x where x.group_id = r.group_id and x.status <> 'upcoming' and x.id <> r.id;
    update rounds set status = 'open', theme_id = coalesce(theme_id, t.id), theme = coalesce(theme, t.text),
                      season_no = coalesce(season_no, n / 12 + 1), round_no = coalesce(round_no, n % 12 + 1)
      where id = r.id;
    update themes set used_at = now() where id = t.id;
  end loop;

  update rounds set status = 'reveal' where status = 'open' and closes_at <= now();
  update rounds set status = 'voting' where status = 'reveal' and reveal_at + interval '1 hour' <= now();

  for r in select id from rounds where status in ('reveal','voting')
           and (voting_ends_at <= now() or votes_complete(id)) loop
    perform finish_round(r.id);
  end loop;
end $$;

-- Seasons that already finished before this file ran get their badges now.
do $$ declare x record; begin
  for x in select group_id, season_no from rounds where status = 'done' and round_no = 12 group by group_id, season_no loop
    perform award_season_badges(x.group_id, x.season_no);
  end loop;
end $$;
