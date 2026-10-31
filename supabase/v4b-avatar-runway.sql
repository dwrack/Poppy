-- Poppyseed Clothes v3, avatar step 2: the runway reveal dresses each
-- friend's 3D avatar. Adds to v3-game.sql, v4-avatar.sql AND
-- v6-borrow-style.sql: paste it AFTER v6 (it reads styled_looks and
-- entries.styled_look_id for the "styled by" credit). Safe to run more
-- than once. Nothing existing is changed or dropped except its own
-- round_entry_cards_v2(), which it re-creates.
--
-- =====================================================================
-- HOW TO TURN IT ON (David, about 1 minute, in the Supabase dashboard
-- for project yrcddfehjjbtzwuotmym, signed in with Poppy's Gmail)
-- =====================================================================
-- 1. Paste v4-avatar.sql (avatar_presets) and v6-borrow-style.sql
--    (styled_looks) first if you have not yet. Paste order: after v6,
--    before or after v7, either is fine (v7 does not touch the cards).
-- 2. SQL Editor (left sidebar) > New query. Paste this WHOLE file. Run.
--    You should see "Success. No rows returned". Idempotent.
-- 3. That is it. Until it is pasted the app falls back to the old
--    round_entry_cards() and still shows the reveal: the avatars walk in
--    plain grey clothes (no colours to tint from) and friends' presets
--    are fetched separately, so nothing breaks, it just looks flat.
-- =====================================================================

-- A sibling of round_entry_cards() as v6 defines it (same rows, same
-- visibility rules, same per-piece owner_id/owner and the entrant's
-- styled_by credit) that also returns, per piece, what the avatar needs
-- to dress itself (colours, pattern) and the entrant's avatar presets.
-- A sibling rather than an edit because Postgres cannot change a
-- function's output columns with create or replace, and the old
-- function keeps phones that have not refreshed working. Dropped first
-- for the same reason, so this file can grow columns later.
--
-- Visibility is the same as before: squad members only, and another
-- player's entry (clothes AND avatar) is returned only once the round
-- has reached the reveal. Your own entry is always yours to see.
drop function if exists round_entry_cards_v2(uuid);
create function round_entry_cards_v2(r uuid)
returns table (entry_id uuid, user_id uuid, display_name text, emoji text, outfit jsonb,
               photo_path text, submitted_at timestamptz, pieces jsonb, styled_by text, avatar jsonb)
language sql stable security definer set search_path = public as $$
  select e.id, e.user_id, m.display_name, m.emoji, e.outfit, e.photo_path, e.submitted_at,
    coalesce((
      select jsonb_agg(jsonb_build_object('id', i.id, 'name', i.name, 'category', i.category,
                                          'cutout_path', i.cutout_path, 'owner_id', i.user_id,
                                          'owner', gm.display_name,
                                          'colours', to_jsonb(i.colours), 'pattern', i.pattern) order by x.ord)
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
