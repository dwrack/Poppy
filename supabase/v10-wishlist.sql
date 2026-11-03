-- Poppyseed v4: the wishlist closet. Every piece now says which closet it
-- lives in: 'mine' (clothes she owns, everything there today) or 'wish'
-- (pieces from the stores, a pasted shop link, or a screenshot). Wish pieces
-- are hers to dress up in and walk the runway with, but friends never see
-- them, they can't be borrowed or used to style her, and they never go onto
-- a photo-real render. Safe to run more than once. Nothing is dropped
-- except round_entry_cards_v2(), which it re-creates with the same columns.
--
-- =====================================================================
-- HOW TO TURN IT ON (David, about 1 minute, in the Supabase dashboard
-- for project yrcddfehjjbtzwuotmym, signed in with Poppy's Gmail)
-- =====================================================================
-- 1. v2 through v9 must already be in (V3-PASTE-ORDER.md). Paste this
--    file LAST, after v9. If you ever paste v2-friends.sql,
--    v6-borrow-style.sql, v4b-avatar-runway.sql, v8-photoreal.sql or
--    v9-family.sql again, paste this one again straight after (they carry
--    the older versions of the functions and policies it re-creates).
-- 2. SQL Editor (left sidebar) > New query. Paste this WHOLE file. Run.
--    You should see "Success. No rows returned". Run it twice if you like.
-- 3. Nothing else: no new table, bucket, extension, cron or key.
-- 4. Optional check:
--      select closet, count(*) from items group by 1;
--    Every piece that was there before says 'mine'.
--
-- Until it is pasted the app still works: normal pieces sync as before,
-- and a wishlist piece just waits on the phone and syncs once this is in.
-- =====================================================================
--
-- What changes:
--   items.closet           'mine' (default) or 'wish'. Anything else is
--                          refused.
--   items_closet_lock      a piece with a borrow request still open
--                          (requested, approved or out) can't be moved to
--                          the wishlist. Moving a wish piece into her
--                          closet ("I got it!") is always fine.
--   friend_items(m)        her closet only, never her wishlist.
--   item_owned_by()        (borrowing) her closet only, and not archived.
--   items_owned_by()       (styling a friend) her closet only.
--   photo_jobs             a photo never includes a wish piece, Dress me
--                          or runway.
--   entry_photo_job(e)     the photo of a runway look counts only her own
--                          closet pieces in it (wish and borrowed pieces
--                          stay cutout cards beside the photo).
--   round_entry_cards_v2   each piece carries 'closet', so the runway can
--                          badge "✨ wishlist".
--   storage (closet files) a wish piece's photo and cutout are hers only.
--                          Squad mates see her closet files as before
--                          (v9), minus wish pieces; once a round is
--                          revealed, the squad sees the cutout of a wish
--                          piece she walked in, like the runway card does.

-- The column ---------------------------------------------------------------
alter table items add column if not exists closet text not null default 'mine';
alter table items drop constraint if exists items_closet_check;
alter table items add constraint items_closet_check check (closet in ('mine','wish'));

-- A lent piece stays in her closet until it is home. Runs as the table
-- owner so it reads every borrow request for the piece, whoever asked.
create or replace function items_closet_lock() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.closet = 'wish' and old.closet is distinct from 'wish' and exists (
    select 1 from borrow_requests b
    where b.item_id = new.id and b.status in ('requested','approved','out')) then
    raise exception 'A friend asked to borrow this piece, so it stays in your closet for now';
  end if;
  return new;
end $$;
drop trigger if exists items_closet_lock on items;
create trigger items_closet_lock before update of closet on items
  for each row execute function items_closet_lock();

-- Friends' closets: v2's function, her closet only.
create or replace function friend_items(member uuid)
returns setof items language sql stable security definer set search_path = public as $$
  select * from items
  where user_id = member and status <> 'archived' and closet = 'mine' and is_group_mate(member)
  order by created_at desc
$$;

-- Borrowing: v2's check, her closet only and not archived.
create or replace function item_owned_by(item uuid, owner uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from items where id = item and user_id = owner
                 and closet = 'mine' and status <> 'archived')
$$;

-- Styling a friend: v6's check, her closet only.
create or replace function items_owned_by(ids uuid[], owner uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (
    select 1 from unnest(ids) x(id)
    left join items i on i.id = x.id and i.user_id = owner and i.status <> 'archived' and i.closet = 'mine'
    where i.id is null)
$$;

-- A new photo job: v8's trigger, plus wish pieces never go onto a photo.
create or replace function photo_jobs_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.user_id := coalesce(auth.uid(), new.user_id); -- the worker (no auth.uid()) never inserts, but keep it sane
  -- no parent's yes, no photo (the app hides the button; this is the lock)
  if not exists (select 1 from photoreal_children c where c.user_id = new.user_id) then
    raise exception 'Photos are not switched on for you yet';
  end if;
  new.status := 'queued';
  new.attempts := 0;
  new.result_path := null;
  new.error := null;
  new.worker := null;
  new.created_at := now();
  new.started_at := null;
  new.finished_at := null;
  -- each piece once, in the order asked (entry_photo_job counts them)
  new.item_ids := array(select x from unnest(new.item_ids) with ordinality u(x, n) group by x order by min(n));
  if new.kind = 'entry' then
    -- your own runway look only, and the round comes from the entry
    select e.round_id into new.round_id from entries e where e.id = new.entry_id and e.user_id = new.user_id;
    if not found then raise exception 'That runway look is not yours'; end if;
    -- only pieces that are in that look
    if exists (select 1 from unnest(new.item_ids) x(id)
               where not exists (select 1 from entries e, jsonb_array_elements_text(coalesce(e.outfit->'items', '[]'::jsonb)) o(id)
                                 where e.id = new.entry_id and o.id = x.id::text)) then
      raise exception 'Those pieces are not in that look';
    end if;
  else
    new.entry_id := null;
    new.round_id := null;
  end if;
  -- Wishlist pieces are pictures from a shop, not clothes she has: they
  -- stay out of the photo (in a runway look, a cutout card beside it).
  if exists (select 1 from unnest(new.item_ids) x(id)
             join items i on i.id = x.id and i.user_id = new.user_id and i.closet <> 'mine') then
    raise exception 'Photos use clothes you own';
  end if;
  -- Both kinds: your own closet only. The worker fetches garments with the
  -- service key, so it must not be asked for anyone else's. And a friend's
  -- piece is an image her account can swap after the borrow was approved
  -- (her closet files are hers to overwrite), so it never goes onto your
  -- photo: in a runway look it stays a cutout card beside it.
  if exists (select 1 from unnest(new.item_ids) x(id)
             where not exists (select 1 from items i where i.id = x.id and i.user_id = new.user_id and i.closet = 'mine')) then
    if new.kind = 'entry' then raise exception 'Borrowed pieces stay out of the photo'; end if;
    raise exception 'Some pieces are still uploading. Try again in a minute';
  end if;
  return new;
end $$;
drop trigger if exists photo_jobs_before_insert on photo_jobs;
create trigger photo_jobs_before_insert before insert on photo_jobs
  for each row execute function photo_jobs_before_insert();

-- The photo of a runway look as it stands: v8's rule, counting only her
-- own closet pieces in the look (wish pieces, like borrowed ones, are
-- never in the photo).
create or replace function entry_photo_job(e uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select j.id
  from entries en
  cross join lateral (
    select array_agg(distinct i.id) as ids
    from jsonb_array_elements_text(coalesce(en.outfit->'items', '[]'::jsonb)) x(id)
    join items i on i.id::text = x.id and i.user_id = en.user_id and i.closet = 'mine') look
  join photo_jobs j on j.entry_id = en.id
  where en.id = e and j.kind = 'entry' and j.status = 'done'
    and exists (select 1 from photoreal_children c where c.user_id = en.user_id)
    and j.item_ids <@ look.ids
    and cardinality(j.item_ids) = least(5, cardinality(look.ids))
  order by j.created_at desc, j.id desc
  limit 1
$$;

-- round_entry_cards_v2, as v8 defines it, plus each piece's closet.
drop function if exists round_entry_cards_v2(uuid);
create function round_entry_cards_v2(r uuid)
returns table (entry_id uuid, user_id uuid, display_name text, emoji text, outfit jsonb,
               photo_path text, submitted_at timestamptz, pieces jsonb, styled_by text, avatar jsonb)
language sql stable security definer set search_path = public as $$
  select e.id, e.user_id, m.display_name, m.emoji, e.outfit,
    (select j.result_path from photo_jobs j where j.id = entry_photo_job(e.id)),
    e.submitted_at,
    coalesce((
      select jsonb_agg(jsonb_build_object('id', i.id, 'name', i.name, 'category', i.category,
                                          'cutout_path', i.cutout_path, 'owner_id', i.user_id,
                                          'owner', gm.display_name,
                                          'colours', to_jsonb(i.colours), 'pattern', i.pattern,
                                          'closet', i.closet) order by x.ord)
      from jsonb_array_elements_text(coalesce(e.outfit->'items', '[]'::jsonb)) with ordinality as x(id, ord)
      join items i on i.id::text = x.id
      join group_members gm on gm.group_id = ro.group_id and gm.user_id = i.user_id
    ), '[]'::jsonb),
    (select st.display_name from styled_looks s
       join group_members st on st.group_id = ro.group_id and st.user_id = s.from_user
     where s.id = e.styled_look_id),
    (select jsonb_build_object('face', a.face, 'skin', a.skin, 'hair', a.hair,
                               'hair_colour', a.hair_colour, 'eyes', a.eyes)
     from avatar_presets a where a.user_id = e.user_id)
  from entries e
  join rounds ro on ro.id = e.round_id
  join group_members m on m.group_id = ro.group_id and m.user_id = e.user_id
  where e.round_id = r and is_member(ro.group_id)
    and (e.user_id = auth.uid() or ro.status in ('reveal','voting','done'))
  order by e.submitted_at
$$;

-- Closet files: v9's rule, minus wish pieces -------------------------------
-- The piece rows are hidden from friends (friend_items above), so the files
-- are too: closet/<her id>/<wish piece id>/photo.jpg and cutout.png. The
-- checks read items as the table owner (friends can't read her rows).
create or replace function closet_file_is_wish(owner_folder text, item_folder text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from items i
                 where i.id::text = item_folder and i.user_id::text = owner_folder and i.closet = 'wish')
$$;
-- A wish piece she walked the runway in: its cutout, for the squad that saw the reveal.
create or replace function runway_wish_cutout(path text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from items i
    join entries e on e.user_id = i.user_id and coalesce(e.outfit->'items', '[]'::jsonb) ? i.id::text
    join rounds ro on ro.id = e.round_id
    where i.cutout_path = path and i.closet = 'wish'
      and ro.status in ('reveal','voting','done') and is_member(ro.group_id))
$$;
drop policy if exists "group mates see closet files" on storage.objects;
create policy "group mates see closet files" on storage.objects for select
  using (bucket_id = 'closet' and is_group_mate(((storage.foldername(name))[1])::uuid)
         and coalesce((storage.foldername(name))[2], '') <> 'wore'
         and not closet_file_is_wish((storage.foldername(name))[1], (storage.foldername(name))[2]));
drop policy if exists "squad sees runway wish cutouts" on storage.objects;
create policy "squad sees runway wish cutouts" on storage.objects for select
  using (bucket_id = 'closet' and runway_wish_cutout(name));
