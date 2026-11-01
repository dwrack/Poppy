-- Poppyseed v4: family squads. Someone in several squads (Penny in her
-- friends' squad AND the family squad with Poppy and Dad) already works in
-- the database: group_members is keyed by (group_id, user_id) and every
-- game table hangs off a squad. This file fixes the few places that looked
-- at "any squad we share" instead of THE squad in question. Safe to run
-- more than once. Nothing is dropped except one policy it replaces; one
-- helper is added, two functions and three policies are re-created.
--
-- There is no squad size limit anywhere, so nothing to lift for a family
-- squad of three (or six).
--
-- =====================================================================
-- HOW TO TURN IT ON (David, about 1 minute, in the Supabase dashboard
-- for project yrcddfehjjbtzwuotmym, signed in with Poppy's Gmail)
-- =====================================================================
-- 1. v2 through v8 must already be in (V3-PASTE-ORDER.md). Paste this
--    file LAST, after v8. If you ever paste v2-friends.sql, v3-game.sql,
--    v5-game-loop.sql or v6-borrow-style.sql again, paste this one again
--    straight after (they carry the older versions of what it fixes).
-- 2. SQL Editor (left sidebar) > New query. Paste this WHOLE file. Run.
--    You should see "Success. No rows returned". Run it twice if you like.
-- 3. Nothing else: no new table, bucket, extension, cron or key.
-- 4. Optional check, signed in as anyone in two squads (or as the
--    dashboard, for everyone):
--      select g.name, l.display_name, l.stars from groups g, squad_ladder(g.id) l;
--    Each squad's stars are that squad's only.
-- =====================================================================
--
-- What changes:
--   squad_ladder(g)    stars come from this squad's rounds only. Before,
--                      Penny's stars from her friends' squad also showed
--                      on the family ladder.
--   stars_ledger       you still read all your own rows (lifetime stars on
--                      the You tab); a squad mate reads your rows only for
--                      rounds of a squad you share, not the rest.
--   borrow_requests    asking for a piece for a round: its owner has to be
--                      in that round's squad (before: in any squad you
--                      share). Plain Squad-tab requests are unchanged.
--   styled_looks       styling someone for a round: they have to be in
--                      that round's squad.
--   join_group()       a code for a squad you are already in says so and
--                      stays unused (before: it was quietly used up).
--   wore-it photos     the "I wore it" photo of a round is seen by that
--                      round's squad only (before: by anyone sharing any
--                      squad with you, who could list your wore/ folder).
--   leave_group(g)     leaving a squad you started hands it to the member
--                      who joined first, so the rest can still start a
--                      round. Owners leave only through this function.

-- Is this person in this squad? (security definer so policies never recurse)
create or replace function in_squad(g uuid, u uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from group_members where group_id = g and user_id = u)
$$;

-- Squad ladder: same columns as v5, stars from this squad's rounds only.
create or replace function squad_ladder(g uuid)
returns table (user_id uuid, display_name text, emoji text, stars int, rounds_played int, wore_count int, streak int)
language plpgsql stable security definer set search_path = public as $$
declare m record; r record; s int;
begin
  if not is_member(g) then return; end if;
  for m in select gm.user_id as uid, gm.display_name as nm, gm.emoji as em
           from group_members gm where gm.group_id = g order by gm.joined_at loop
    user_id := m.uid; display_name := m.nm; emoji := m.em;
    select coalesce(sum(l.amount), 0)::int into stars
      from stars_ledger l join rounds ro on ro.id = l.round_id
      where l.user_id = m.uid and ro.group_id = g;
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

-- Stars: your own rows, or rows for a round of a squad you are in.
drop policy if exists "group mates see stars" on stars_ledger;
drop policy if exists "own stars, or this squad's" on stars_ledger;
create policy "own stars, or this squad's" on stars_ledger for select
  using (user_id = auth.uid() or (round_id is not null and is_member(round_group(round_id))));

-- Borrow for the round: v6's rule, plus the owner is in that round's squad.
drop policy if exists "ask to borrow" on borrow_requests;
create policy "ask to borrow" on borrow_requests for insert
  with check (borrower_id = auth.uid() and owner_id <> auth.uid() and is_group_mate(owner_id)
    and item_owned_by(item_id, owner_id)
    and (round_id is null or (is_member(round_group(round_id)) and in_squad(round_group(round_id), owner_id)
                              and round_status(round_id) = 'open')));

-- Style someone for the round: v6's rule, plus they are in that round's squad.
drop policy if exists "style a friend while open" on styled_looks;
create policy "style a friend while open" on styled_looks for insert
  with check (from_user = auth.uid() and to_user <> auth.uid() and is_group_mate(to_user)
    and is_member(round_group(round_id)) and in_squad(round_group(round_id), to_user)
    and round_status(round_id) = 'open'
    and items_owned_by(item_ids, to_user) and status = 'sent');

-- Join with a code: same as v2, but a code for a squad you are already in
-- is refused before it is used, so it can still go to the person it was for.
create or replace function join_group(invite_code text, my_name text, my_emoji text default '🌸')
returns uuid language plpgsql security definer set search_path = public as $$
declare inv invites;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select * into inv from invites where code = upper(trim(invite_code))
    and used_by is null and expires_at > now() for update;
  if inv is null then raise exception 'That invite code is not valid or was already used'; end if;
  if in_squad(inv.group_id, auth.uid()) then
    raise exception 'You are already in that squad. That code can still go to someone else.';
  end if;
  insert into group_members (group_id, user_id, display_name, emoji)
    values (inv.group_id, auth.uid(), my_name, my_emoji);
  update invites set used_by = auth.uid(), used_at = now() where code = inv.code;
  return inv.group_id;
end $$;


-- Wore-it photos: the round's squad only ---------------------------------
-- v2's closet rule lets anyone who shares ANY squad with you read your
-- closet files, which is right for your clothes. The wore/ folder holds
-- "I wore it" photos, which belong to one round of one squad: keep them to
-- that squad, through the round_actions row that points at the file.
drop policy if exists "group mates see closet files" on storage.objects;
create policy "group mates see closet files" on storage.objects for select
  using (bucket_id = 'closet' and is_group_mate(((storage.foldername(name))[1])::uuid)
         and coalesce((storage.foldername(name))[2], '') <> 'wore');
drop policy if exists "squad sees wore-it photos" on storage.objects;
create policy "squad sees wore-it photos" on storage.objects for select
  using (bucket_id = 'closet' and (storage.foldername(name))[2] = 'wore'
         and exists (select 1 from round_actions a
                     where a.photo_path = name and is_member(round_group(a.round_id))));

-- Leaving a squad ----------------------------------------------------------
-- The person who started a squad is its owner: only the owner can start an
-- extra round or set its time zone. If the owner leaves, the member who
-- joined first takes over. An empty squad is left as it is (nothing shows it).
create or replace function leave_group(g uuid) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); heir uuid;
begin
  perform 1 from groups where id = g for update;  -- one leave at a time per squad
  if me is null or not exists (select 1 from group_members where group_id = g and user_id = me) then
    raise exception 'You are not in that squad';
  end if;
  delete from group_members where group_id = g and user_id = me;
  if exists (select 1 from groups where id = g and owner_id = me) then
    select user_id into heir from group_members where group_id = g order by joined_at, user_id limit 1;
    if heir is not null then
      update groups set owner_id = heir where id = g;
      update group_members set role = 'owner' where group_id = g and user_id = heir;
    end if;
  end if;
end $$;
revoke all on function leave_group(uuid) from public, anon;
grant execute on function leave_group(uuid) to authenticated;

-- Members still leave with a plain delete; an owner must use leave_group()
-- so the squad is never left without someone who can run it.
drop policy if exists "leave group" on group_members;
create policy "leave group" on group_members for delete
  using (user_id = auth.uid()
         and not exists (select 1 from groups gr where gr.id = group_id and gr.owner_id = auth.uid()));
