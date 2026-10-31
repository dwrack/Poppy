-- Poppyseed Runway, step 3: borrow for the round, style a friend.
-- Adds to v2-friends.sql and v3-game.sql. Safe to run more than once.
-- Nothing in version 1 is touched. Existing borrow requests from the
-- Squad tab keep working exactly as before; a round borrow is the same
-- row with round_id filled in.
--
-- =====================================================================
-- HOW TO TURN IT ON (David, about 1 minute, in the Supabase dashboard
-- for project yrcddfehjjbtzwuotmym, signed in with Poppy's Gmail)
-- =====================================================================
-- 1. Run v3-game.sql first if you have not already (this file needs
--    rounds, entries, stars_ledger and the helpers it creates).
-- 2. SQL Editor (left sidebar) > New query. Paste this WHOLE file. Run.
--    You should see "Success. No rows returned". Run it twice if you
--    like; it is idempotent.
-- 3. Optional check: Database > Replication, "styled_looks" is in the
--    supabase_realtime publication (this file adds it).
-- 4. Deploy the app when ready. Phones on the old build keep working:
--    they just never see the Borrow tab or styled looks.
-- =====================================================================
--
-- What this adds:
--   borrow_requests.round_id   a request made from the dressing room, for
--                              this round only. Status flow is the one the
--                              Squad tab already uses:
--                                asked -> 'requested', yes -> 'approved',
--                                no -> 'declined', back -> 'returned'
--                              (plus 'out' and 'cancelled' from v2).
--   styled_looks               a look one friend built for another from
--                              HER closet, with one compliment chip.
--                              sent -> declined is stored; "worn" is never
--                              stored, it is derived from an entry whose
--                              styled_look_id points at the look, so it
--                              cannot drift from the runway.
--   entries.styled_look_id     set when an entry IS a styled look.
--   entries outfit check       every piece in an entry is yours, or
--                              borrowed for this round with a yes.
--   stars 'lent_it'            +1 per piece of yours in someone's
--                              submitted look (one ledger row per round).
--   stars 'styled_win'         stylist gets half the winner's stars,
--                              rounded up, when a look she styled wins.
--
-- Hidden until the reveal, same as entries: a stylist cannot tell whether
-- her look was worn until the runway plays (she reads her sent looks
-- through styled_looks_for_round(), which masks the status until then).

-- Borrow for the round ------------------------------------------------
alter table borrow_requests add column if not exists round_id uuid references rounds(id) on delete set null;
create index if not exists borrow_requests_round on borrow_requests (round_id) where round_id is not null;

-- A round borrow must be for a round of a squad you are in, while it is open.
drop policy if exists "ask to borrow" on borrow_requests;
create policy "ask to borrow" on borrow_requests for insert
  with check (borrower_id = auth.uid() and owner_id <> auth.uid() and is_group_mate(owner_id)
    and item_owned_by(item_id, owner_id)
    and (round_id is null or (is_member(round_group(round_id)) and round_status(round_id) = 'open')));

-- Who may answer. In v2 the status was only a label on the Squad tab; from
-- here on it gates outfit_allowed() and lent_it stars, so the borrower must
-- not be able to say yes to herself. Owner: requested -> approved | declined,
-- approved -> out, out -> returned. Borrower: requested | approved -> cancelled.
-- The policies say who, the trigger below says which moves, and locks every
-- other column (round, item, parties) so a request cannot be moved onto a
-- round after the fact.
drop policy if exists "borrow parties update" on borrow_requests;
drop policy if exists "owner answers borrow" on borrow_requests;
create policy "owner answers borrow" on borrow_requests for update
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid() and status in ('approved','declined','out','returned'));
drop policy if exists "borrower cancels borrow" on borrow_requests;
create policy "borrower cancels borrow" on borrow_requests for update
  using (borrower_id = auth.uid())
  with check (borrower_id = auth.uid() and status = 'cancelled');

create or replace function borrow_requests_lock() returns trigger
language plpgsql as $$
begin
  if new.item_id <> old.item_id or new.owner_id <> old.owner_id or new.borrower_id <> old.borrower_id
     or new.round_id is distinct from old.round_id or new.needed_on is distinct from old.needed_on
     or new.note is distinct from old.note or new.created_at <> old.created_at then
    raise exception 'Only the status of a borrow request can change';
  end if;
  -- No signed-in player means the dashboard or a service key, not a phone.
  if auth.uid() is null or new.status = old.status then return new; end if;
  if auth.uid() = old.owner_id
     and (old.status, new.status) in (('requested','approved'), ('requested','declined'), ('approved','out'), ('out','returned')) then
    return new;
  end if;
  if auth.uid() = old.borrower_id and old.status in ('requested','approved') and new.status = 'cancelled' then
    return new;
  end if;
  raise exception 'A borrow request cannot go from % to % for you', old.status, new.status;
end $$;
drop trigger if exists borrow_requests_lock on borrow_requests;
create trigger borrow_requests_lock before update on borrow_requests
  for each row execute function borrow_requests_lock();

-- Is this piece borrowed by the signed-in player for this round, with a yes?
create or replace function borrowed_for_round(item uuid, r uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from borrow_requests b
    where b.item_id = item and b.round_id = r and b.borrower_id = auth.uid()
      and b.status in ('approved','out'))
$$;

-- Every piece in an outfit is the player's own, or borrowed for the round.
create or replace function outfit_allowed(r uuid, o jsonb) returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (
    select 1 from jsonb_array_elements_text(coalesce(o->'items', '[]'::jsonb)) x(id)
    left join items i on i.id::text = x.id
    where i.id is null
       or (i.user_id <> auth.uid() and not borrowed_for_round(i.id, r)))
$$;

-- Styled looks ---------------------------------------------------------
create table if not exists styled_looks (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references rounds(id) on delete cascade,
  from_user uuid not null references auth.users(id) on delete cascade default auth.uid(),
  to_user uuid not null references auth.users(id) on delete cascade,
  item_ids uuid[] not null,
  message_chip text not null check (message_chip in ('colour','on theme','brave','fit','shoes')),
  status text not null default 'sent' check (status in ('sent','worn','declined')),
  created_at timestamptz not null default now(),
  check (from_user <> to_user),
  check (cardinality(item_ids) between 1 and 8)
);
create index if not exists styled_looks_round_to on styled_looks (round_id, to_user);

alter table styled_looks enable row level security;

alter table entries add column if not exists styled_look_id uuid references styled_looks(id) on delete set null;

-- Are all of these pieces owned by this player (and not archived)?
create or replace function items_owned_by(ids uuid[], owner uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (
    select 1 from unnest(ids) x(id)
    left join items i on i.id = x.id and i.user_id = owner and i.status <> 'archived'
    where i.id is null)
$$;

-- Does this styled look belong to the signed-in player, for this round?
create or replace function styled_look_is_mine(l uuid, r uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select l is null or exists (
    select 1 from styled_looks s where s.id = l and s.round_id = r and s.to_user = auth.uid())
$$;

-- Is this look what its recipient is wearing (her entry points at it)?
create or replace function styled_look_worn(l uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from entries e where e.styled_look_id = l)
$$;

-- Read: the recipient always; the squad once the round is revealed, and
-- then only the look that was actually worn (for the "styled by" credit).
-- A look she waved off or ignored stays between the two of them.
-- The stylist reads her own sent looks through styled_looks_for_round()
-- below, which hides whether they were worn until the reveal.
drop policy if exists "recipient or revealed" on styled_looks;
create policy "recipient or revealed" on styled_looks for select
  using (to_user = auth.uid() or (round_revealed(round_id) and styled_look_worn(id)));

-- Write: only as yourself, only to a squad mate, only from HER closet,
-- only while the round is open.
drop policy if exists "style a friend while open" on styled_looks;
create policy "style a friend while open" on styled_looks for insert
  with check (from_user = auth.uid() and to_user <> auth.uid() and is_group_mate(to_user)
    and is_member(round_group(round_id)) and round_status(round_id) = 'open'
    and items_owned_by(item_ids, to_user) and status = 'sent');

-- The recipient answers (declined, or back to sent) while the round is
-- open. Wearing it is done by pointing her entry at the look, never by
-- writing 'worn' here. Nothing else about the row can change.
drop policy if exists "recipient answers while open" on styled_looks;
create policy "recipient answers while open" on styled_looks for update
  using (to_user = auth.uid() and round_status(round_id) = 'open')
  with check (to_user = auth.uid() and round_status(round_id) = 'open' and status in ('sent','declined'));

-- Lock the columns a recipient could otherwise rewrite on update.
create or replace function styled_looks_lock() returns trigger
language plpgsql as $$
begin
  if new.round_id <> old.round_id or new.from_user <> old.from_user or new.to_user <> old.to_user
     or new.item_ids <> old.item_ids or new.message_chip <> old.message_chip or new.created_at <> old.created_at then
    raise exception 'Only the status of a styled look can change';
  end if;
  return new;
end $$;
drop trigger if exists styled_looks_lock on styled_looks;
create trigger styled_looks_lock before update on styled_looks
  for each row execute function styled_looks_lock();

-- Entries: the outfit must be allowed, and a styled_look_id must be a look
-- sent to you for this round. Replaces the v3 insert/update policies.
drop policy if exists "enter while open" on entries;
create policy "enter while open" on entries for insert
  with check (user_id = auth.uid() and is_member(round_group(round_id)) and round_status(round_id) = 'open'
    and outfit_allowed(round_id, outfit) and styled_look_is_mine(styled_look_id, round_id));
drop policy if exists "edit own entry while open" on entries;
create policy "edit own entry while open" on entries for update
  using (user_id = auth.uid() and round_status(round_id) = 'open')
  with check (user_id = auth.uid() and round_status(round_id) = 'open'
    and outfit_allowed(round_id, outfit) and styled_look_is_mine(styled_look_id, round_id));

-- Stars ------------------------------------------------------------------
alter table stars_ledger drop constraint if exists stars_ledger_reason_check;
alter table stars_ledger add constraint stars_ledger_reason_check
  check (reason in ('votes','voted','finished','lent','wore','lent_it','styled_win'));

-- Close a round: status done, and pay out stars. Same as v3 plus:
--   lent_it:    1 per piece of yours in someone else's submitted look
--   styled_win: half the winning look's stars (rounded up) to its stylist
create or replace function finish_round(r uuid) returns void
language plpgsql security definer set search_path = public as $$
declare top int;
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

  -- Lent it: pieces that are in a submitted look but belong to someone else.
  insert into stars_ledger (user_id, round_id, reason, amount)
    select i.user_id, r, 'lent_it', count(*)::int
    from entries e
    join jsonb_array_elements_text(coalesce(e.outfit->'items', '[]'::jsonb)) x(id) on true
    join items i on i.id::text = x.id
    where e.round_id = r and i.user_id <> e.user_id
    group by i.user_id
  on conflict do nothing;

  -- Styled win: the stylist of a first-place look shares the credit.
  select max(t.total) into top from (
    select coalesce(sum(v.stars), 0) as total from entries e
    left join votes v on v.entry_id = e.id where e.round_id = r group by e.id) t;
  if coalesce(top, 0) > 0 then
    insert into stars_ledger (user_id, round_id, reason, amount)
      select s.from_user, r, 'styled_win', ceil(t.total / 2.0)::int
      from entries e
      join styled_looks s on s.id = e.styled_look_id
      join (select e2.id, coalesce(sum(v.stars), 0) as total from entries e2
            left join votes v on v.entry_id = e2.id where e2.round_id = r group by e2.id) t on t.id = e.id
      where e.round_id = r and t.total = top
    on conflict do nothing;
  end if;
end $$;

-- What the app reads -----------------------------------------------------
-- Entries with their pieces, for the runway. Same as v3 plus the owner of
-- each piece (so a borrowed piece can say who lent it) and who styled the
-- look, if anyone. Before the reveal you only get your own.
drop function if exists round_entry_cards(uuid);
create function round_entry_cards(r uuid)
returns table (entry_id uuid, user_id uuid, display_name text, emoji text, outfit jsonb,
               photo_path text, submitted_at timestamptz, pieces jsonb, styled_by text)
language sql stable security definer set search_path = public as $$
  select e.id, e.user_id, m.display_name, m.emoji, e.outfit, e.photo_path, e.submitted_at,
    coalesce((
      select jsonb_agg(jsonb_build_object('id', i.id, 'name', i.name, 'category', i.category,
                                          'cutout_path', i.cutout_path, 'owner_id', i.user_id,
                                          'owner', gm.display_name) order by x.ord)
      from jsonb_array_elements_text(coalesce(e.outfit->'items', '[]'::jsonb)) with ordinality as x(id, ord)
      join items i on i.id::text = x.id
      join group_members gm on gm.group_id = ro.group_id and gm.user_id = i.user_id
    ), '[]'::jsonb),
    (select st.display_name from styled_looks s
       join group_members st on st.group_id = ro.group_id and st.user_id = s.from_user
     where s.id = e.styled_look_id)
  from entries e
  join rounds ro on ro.id = e.round_id
  join group_members m on m.group_id = ro.group_id and m.user_id = e.user_id
  where e.round_id = r and is_member(ro.group_id)
    and (e.user_id = auth.uid() or ro.status in ('reveal','voting','done'))
  order by e.submitted_at
$$;

-- Styled looks I can see for a round, with names. Status is derived:
-- 'worn' when the recipient's entry points at the look, else what is
-- stored ('sent' or 'declined'). Looks I sent come back as 'sent' until
-- the round is revealed, so I cannot tell whether my friend is wearing it
-- before the runway plays. Squad mates who are neither party only ever
-- get the looks that were worn, after the reveal.
drop function if exists styled_looks_for_round(uuid);
create function styled_looks_for_round(r uuid)
returns table (id uuid, round_id uuid, from_user uuid, to_user uuid, item_ids uuid[], message_chip text,
               status text, created_at timestamptz, from_name text, to_name text)
language sql stable security definer set search_path = public as $$
  select s.id, s.round_id, s.from_user, s.to_user, s.item_ids, s.message_chip,
    case when s.to_user <> auth.uid() and not round_revealed(r) then 'sent'
         when styled_look_worn(s.id) then 'worn'
         when s.status = 'declined' then 'declined'
         else 'sent' end,
    s.created_at, f.display_name, t.display_name
  from styled_looks s
  join rounds ro on ro.id = s.round_id
  join group_members f on f.group_id = ro.group_id and f.user_id = s.from_user
  join group_members t on t.group_id = ro.group_id and t.user_id = s.to_user
  where s.round_id = r and is_member(ro.group_id)
    and (s.to_user = auth.uid() or s.from_user = auth.uid()
         or (round_revealed(r) and styled_look_worn(s.id)))
  order by s.created_at desc
$$;

-- Live updates: a yes on a borrow or a new styled look lands without a refresh.
do $$ begin
  begin alter publication supabase_realtime add table styled_looks; exception when others then null; end;
end $$;
