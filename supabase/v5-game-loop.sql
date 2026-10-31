-- Poppyseed Runway, game loop part 1: theme prop, wore-it-for-real,
-- squad ladder, seasons counter, Realtime for the who's-in list.
-- Adds to v3-game.sql. Safe to run more than once. Nothing in version 1,
-- the friends tables or step 1's tables is dropped; rounds gains three
-- nullable columns and stars_ledger's list of reasons grows.
--
-- =====================================================================
-- HOW TO TURN IT ON (David, about 2 minutes, in the Supabase dashboard
-- for project yrcddfehjjbtzwuotmym, signed in with Poppy's Gmail)
-- =====================================================================
-- 1. v3-game.sql must already be in (rounds, entries, votes exist).
-- 2. SQL Editor (left sidebar) > New query. Paste this WHOLE file. Run.
--    Expect "Success. No rows returned". Run it twice if you like.
-- 3. Database > Replication (or Realtime) > confirm "rounds" AND now
--    "entries" are in the supabase_realtime publication. This file adds
--    entries; this is only a look to confirm.
-- 4. Nothing else. No new extension, no new bucket, no new key. The
--    wore-it photos go in the existing "closet" bucket under each
--    player's own folder, same rules as her clothes.
-- =====================================================================
--
-- What this adds, in one breath:
--   Theme prop   last round's winner(s) can set theme_pick_id (play this
--                next) or theme_veto_id (not this one) on the squad's
--                upcoming round. Column grants + RLS mean nobody else can
--                touch rounds at all, and the winner can touch nothing
--                but those two columns. advance_rounds() honours the pick
--                at the drop and sets rounds.picked_by.
--   Wore it      round_actions (kind 'wore_it', optional photo). Only the
--                player herself, only on a round she entered, only from
--                the day after the reveal for a week. A trigger pays 1
--                star ('wore_it') into the ledger. Photo is lookbook-only.
--   Ladder       squad_ladder(g): everyone's stars, rounds played, wore-it
--                count and streak side by side. squad_season view: 12
--                rounds per season per squad.
--   Realtime     entries join the publication; a trigger also broadcasts
--                "someone's look is in" (user id only, never the look) on
--                a private channel round:<id> that only members can join.

-- Ledger reasons ----------------------------------------------------------
-- Step 1 shipped ('votes','voted','finished','lent','wore'). Keep those,
-- add 'wore_it' (paid below) and 'lent_it' (placeholder for part 2).
alter table stars_ledger drop constraint if exists stars_ledger_reason_check;
alter table stars_ledger add constraint stars_ledger_reason_check
  check (reason in ('votes','voted','finished','lent','wore','wore_it','lent_it'));

-- Theme prop --------------------------------------------------------------
alter table rounds add column if not exists theme_pick_id uuid references themes(id) on delete set null;
alter table rounds add column if not exists theme_veto_id uuid references themes(id) on delete set null;
alter table rounds add column if not exists theme_pick_by uuid references auth.users(id) on delete set null;

-- Everyone who tied for first in a finished round. Zero votes all round
-- means every entrant tied, which matches the app's podium.
create or replace function round_winners(r uuid) returns setof uuid
language sql stable security definer set search_path = public as $$
  with totals as (
    select e.user_id, coalesce(sum(v.stars), 0) as total
    from entries e left join votes v on v.entry_id = e.id
    where e.round_id = r group by e.user_id)
  select user_id from totals where total = (select max(total) from totals)
    and exists (select 1 from rounds where id = r and status = 'done')
$$;

-- The squad's most recent finished round.
create or replace function last_done_round(g uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select id from rounds where group_id = g and status = 'done' order by closes_at desc limit 1
$$;

-- May the signed-in player set next theme for this squad right now?
create or replace function can_pick_theme(g uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_member(g) and auth.uid() in (select round_winners(last_done_round(g)))
$$;

-- A short list to pick or veto from: themes this squad has not played,
-- least used across all squads first. Stable for the week.
create or replace function theme_options(g uuid)
returns table (id uuid, text text)
language sql stable security definer set search_path = public as $$
  select t.id, t.text from themes t
  where is_member(g)
    and not exists (select 1 from rounds r where r.group_id = g and r.theme_id = t.id)
  order by t.used_at asc nulls first, t.text
  limit 6
$$;

-- Only two columns are ever writable from the app, and only by last
-- round's winner, and only while the round is still upcoming.
revoke update on rounds from anon, authenticated;
grant update (theme_pick_id, theme_veto_id) on rounds to authenticated;

drop policy if exists "last winner picks next theme" on rounds;
create policy "last winner picks next theme" on rounds for update
  using (status = 'upcoming' and can_pick_theme(group_id))
  with check (status = 'upcoming' and can_pick_theme(group_id));

-- Stamp who picked, and keep pick and veto from being the same theme.
create or replace function rounds_theme_pick_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.theme_pick_id is distinct from old.theme_pick_id or new.theme_veto_id is distinct from old.theme_veto_id then
    if new.theme_pick_id is not null and new.theme_pick_id = new.theme_veto_id then
      raise exception 'Pick one theme or veto one, not the same for both';
    end if;
    if auth.uid() is not null then new.theme_pick_by := auth.uid(); end if;
  end if;
  return new;
end $$;
drop trigger if exists rounds_theme_pick_guard on rounds;
create trigger rounds_theme_pick_guard before update on rounds
  for each row execute function rounds_theme_pick_guard();

-- Wore it for real --------------------------------------------------------
create table if not exists round_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  round_id uuid not null references rounds(id) on delete cascade,
  kind text not null check (kind in ('wore_it','styled_by')),
  photo_path text,
  created_at timestamptz not null default now(),
  unique (user_id, round_id, kind)
);
alter table round_actions enable row level security;

-- The window: round is done, she entered it, it is the day after the
-- reveal in the squad's time zone, and no more than a week has passed.
create or replace function wore_it_open(r uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from rounds ro join groups g on g.id = ro.group_id
    where ro.id = r and ro.status = 'done' and is_member(ro.group_id)
      and exists (select 1 from entries e where e.round_id = r and e.user_id = auth.uid())
      and (now() at time zone coalesce(g.tz, 'America/Chicago'))::date
        > (ro.reveal_at at time zone coalesce(g.tz, 'America/Chicago'))::date
      and now() < ro.reveal_at + interval '8 days')
$$;

drop policy if exists "squad sees round actions" on round_actions;
create policy "squad sees round actions" on round_actions for select
  using (is_member(round_group(round_id)));
-- Only 'wore_it' is writable in part 1; 'styled_by' arrives with part 2.
drop policy if exists "wore it, the day after" on round_actions;
create policy "wore it, the day after" on round_actions for insert
  with check (user_id = auth.uid() and kind = 'wore_it' and wore_it_open(round_id));
drop policy if exists "add the photo later" on round_actions;
create policy "add the photo later" on round_actions for update
  using (user_id = auth.uid() and kind = 'wore_it' and wore_it_open(round_id))
  with check (user_id = auth.uid() and kind = 'wore_it' and wore_it_open(round_id));

-- One star for wearing it. Security definer because the ledger has no
-- insert policy on purpose.
create or replace function pay_wore_it() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.kind = 'wore_it' then
    insert into stars_ledger (user_id, round_id, reason, amount) values (new.user_id, new.round_id, 'wore_it', 1)
    on conflict do nothing;
  end if;
  return new;
end $$;
drop trigger if exists pay_wore_it on round_actions;
create trigger pay_wore_it after insert on round_actions
  for each row execute function pay_wore_it();

-- Wore-it photos for the lookbook, with names. Squad only.
create or replace function round_wore_it(r uuid)
returns table (user_id uuid, display_name text, emoji text, photo_path text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select a.user_id, m.display_name, m.emoji, a.photo_path, a.created_at
  from round_actions a
  join rounds ro on ro.id = a.round_id
  join group_members m on m.group_id = ro.group_id and m.user_id = a.user_id
  where a.round_id = r and a.kind = 'wore_it' and is_member(ro.group_id)
  order by a.created_at
$$;

-- Squad ladder --------------------------------------------------------------
-- Everyone in the squad side by side. Streak = most recent rounds she
-- entered, counted back while each has a wore-it; a round whose wore-it
-- window is still open neither counts nor breaks it.
create or replace function squad_ladder(g uuid)
returns table (user_id uuid, display_name text, emoji text, stars int, rounds_played int, wore_count int, streak int)
language plpgsql stable security definer set search_path = public as $$
declare m record; r record; s int;
begin
  if not is_member(g) then return; end if;
  for m in select gm.user_id as uid, gm.display_name as nm, gm.emoji as em
           from group_members gm where gm.group_id = g order by gm.joined_at loop
    user_id := m.uid; display_name := m.nm; emoji := m.em;
    select coalesce(sum(l.amount), 0)::int into stars from stars_ledger l where l.user_id = m.uid;
    select count(*)::int into rounds_played from entries e join rounds ro on ro.id = e.round_id
      where e.user_id = m.uid and ro.group_id = g and ro.status = 'done';
    select count(*)::int into wore_count from round_actions a join rounds ro on ro.id = a.round_id
      where a.user_id = m.uid and a.kind = 'wore_it' and ro.group_id = g;
    s := 0;
    for r in select ro.id as rid, ro.reveal_at as rev from rounds ro
             where ro.group_id = g and ro.status = 'done'
               and exists (select 1 from entries e where e.round_id = ro.id and e.user_id = m.uid)
             order by ro.closes_at desc loop
      if exists (select 1 from round_actions a where a.round_id = r.rid and a.user_id = m.uid and a.kind = 'wore_it') then
        s := s + 1;
      elsif now() < r.rev + interval '8 days' then
        continue;
      else
        exit;
      end if;
    end loop;
    streak := s;
    return next;
  end loop;
end $$;

-- Seasons: 12 rounds per season per squad. security_invoker so the
-- rounds RLS applies (a non-member sees no row).
drop view if exists squad_season;
create view squad_season with (security_invoker = true) as
  select group_id,
         count(*) filter (where status = 'done')::int as rounds_done,
         (count(*) filter (where status = 'done') / 12 + 1)::int as season_no,
         (count(*) filter (where status = 'done') % 12)::int as round_in_season,
         12 as rounds_per_season
  from rounds group by group_id;
grant select on squad_season to authenticated;

-- The clock, now honouring the theme prop ------------------------------------
create or replace function advance_rounds() returns void
language plpgsql security definer set search_path = public as $$
declare g record; r record; tid uuid; ttext text;
begin
  for g in select gr.id, coalesce(gr.tz, 'America/Chicago') as tz,
                  exists (select 1 from rounds x where x.group_id = gr.id) as played
           from groups gr
           where not exists (select 1 from rounds x where x.group_id = gr.id and x.status <> 'done') loop
    perform create_round(g.id, case when g.played then next_drop(g.tz) else now() end);
  end loop;

  -- upcoming -> open: the winner's pick if there is one, else the pool
  -- minus her veto. Assigned at the drop, never before.
  for r in select id, theme_pick_id, theme_veto_id, theme_pick_by from rounds where status = 'upcoming' and opens_at <= now() loop
    tid := null; ttext := null;
    if r.theme_pick_id is not null then
      select id, text into tid, ttext from themes where id = r.theme_pick_id;
    end if;
    if tid is null then
      select id, text into tid, ttext from themes where id is distinct from r.theme_veto_id
        order by used_at asc nulls first, random() limit 1;
    end if;
    update rounds set status = 'open', theme_id = coalesce(theme_id, tid), theme = coalesce(theme, ttext),
      picked_by = case when r.theme_pick_id is not null and r.theme_pick_id = tid then r.theme_pick_by else picked_by end
      where id = r.id;
    update themes set used_at = now() where id = tid;
  end loop;

  update rounds set status = 'reveal' where status = 'open' and closes_at <= now();
  update rounds set status = 'voting' where status = 'reveal' and reveal_at + interval '1 hour' <= now();

  for r in select id from rounds where status in ('reveal','voting')
           and (voting_ends_at <= now() or votes_complete(id)) loop
    perform finish_round(r.id);
  end loop;
end $$;

-- Realtime ------------------------------------------------------------------
-- entries join the publication: after the reveal every phone gets the
-- cards live. Before the reveal RLS still hides other people's rows from
-- the stream, so the who's-in list uses the broadcast below instead.
do $$ begin
  begin alter publication supabase_realtime add table entries; exception when others then null; end;
end $$;

-- "A look is in": user id and round id only, on private channel round:<id>.
create or replace function entries_broadcast() returns trigger
language plpgsql security definer set search_path = public as $$
declare rid uuid := coalesce(new.round_id, old.round_id);
        uid uuid := coalesce(new.user_id, old.user_id);
begin
  begin
    perform realtime.send(jsonb_build_object('round_id', rid, 'user_id', uid, 'op', tg_op), 'entry', 'round:' || rid::text, true);
  exception when others then null; -- never let a missing realtime schema block an entry
  end;
  return coalesce(new, old);
end $$;
drop trigger if exists entries_broadcast on entries;
create trigger entries_broadcast after insert or update or delete on entries
  for each row execute function entries_broadcast();

-- Only squad members can join their round's channel.
do $$ begin
  begin
    drop policy if exists "squad reads round broadcasts" on realtime.messages;
    create policy "squad reads round broadcasts" on realtime.messages for select to authenticated
      using (realtime.messages.extension = 'broadcast'
             and realtime.topic() like 'round:%'
             and public.is_member(public.round_group(substr(realtime.topic(), 7)::uuid)));
  exception when others then
    raise notice 'realtime.messages policy skipped: %', sqlerrm;
  end;
end $$;
