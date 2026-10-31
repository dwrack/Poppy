# Poppyseed Runway, seasons: what shipped, what to paste, what to test

Built 2026-10-31 on branch `v3/seasons` (worktree `/Users/wavey/Projects/Poppy-wt/seasons`),
cut from `master` after step 1 of the game. `v1` is untouched. Nothing is merged,
pushed or deployed. `cd app && npm run build` passes; `npx oxlint` reports 0 errors
(the two pre-existing `set-state-in-effect` warnings in Runway.tsx are unchanged).

## What shipped

**Database** (`supabase/v7-seasons.sql`, idempotent, "How to turn it on" header)
- `theme_packs` (id, name, starts_on, ends_on, lobby_colour, confetti_colour) with
  5 packs: Everyday (the 20 step 1 themes), Halloween (Oct 1 to 31), Winter Formal
  (Dec 1 to Jan 15), Spring Break (Mar 1 to Apr 15), Summer (Jun 1 to Aug 31). Each
  seasonal pack has 10 tween themes. Windows repeat every year (month and day only).
- `themes.pack_id`. `advance_rounds()` now picks the least-used theme from the pack in
  season, else Everyday (`pick_theme()`), and stamps `rounds.season_no` and
  `rounds.round_no` (1 to 12) the moment a round opens. Existing rounds are backfilled.
- `active_pack(d)` RPC: the pack in season on day d (the phone's local date) and its two
  colours. Only used while no round is in play: the app joins each round's own pack
  through `themes.pack_id`, so a round that straddles a pack boundary keeps its colours.
  `pick_theme(d)` is judged on the squad's local date (`groups.tz`), not UTC.
- `season_summary(g, s)`: per member, stars, looks entered, rounds voted, wins and
  rounds done for one 12-round season. Members of the squad only.
- `season_badges` (user_id, group_id, season_no, badge) with RLS: you read your own
  and your squad mates'. Nobody can write from the app; `finish_round()` calls
  `award_season_badges()` when round 12 closes. Badges: Season Winner (most season
  stars, ties share), Most Improved (biggest gain over the previous season, from
  season 2), Never Missed a Round (a look in all 12), Best Lender (placeholder: wired
  to `stars_ledger.reason = 'lent'`, which nothing writes yet, so it never fires).
- Seasons that finished before the paste get their badges during the paste.

**App**
- `Runway.tsx`: the lobby card, the winner's podium block and the confetti take the
  active pack's colours through two CSS variables (`--pack-lobby`, `--pack-confetti`)
  set on the Runway root; defaults in `index.css` keep it ink and poppy offline.
  Header shows "· Halloween pack" when a seasonal pack is on.
- `SeasonStrip.tsx`: "Season 2 · round 7 of 12" with 12 dots, under the header.
- `SeasonPodium.tsx`: end-of-season podium (season stars, shared places, wins, looks
  entered, badges per person) shown when the last finished round was round 12 and the
  next round has not opened yet.
- `SeasonBadges.tsx`: You tab row of earned badges (hidden until there is one).
- States handled: no squad (unchanged screen), round not open (strip reads from the
  last finished round), loading ("Adding up the season…"), offline (RPC returns
  nothing, pack falls back to Everyday, badges row hides). No free-text inputs, no new
  deps, no new assets.

## What David pastes (Supabase dashboard, project yrcddfehjjbtzwuotmym)

1. Make sure `supabase/v3-game.sql` has been run (the `rounds` table exists).
2. SQL Editor > New query > paste all of `supabase/v7-seasons.sql` > Run.
   Expect "Success. No rows returned". Safe to run twice.
3. Check: `select * from active_pack();` returns Halloween until Oct 31, then Everyday.
   `select name, count(*) from themes t join theme_packs p on p.id = t.pack_id group by name;`
   shows Everyday 20 and 10 for each of the other four.
4. No new cron or extension. Deploy the app when ready (merge `v3/seasons` into
   `master`, push; the existing workflow publishes /v2/).

## What to test with the squad

1. Open Runway on Oct 31 or earlier: the lobby card is deep purple, the header says
   "Halloween pack", and the next theme that drops is one of the ten Halloween ones.
   On Nov 1 it goes back to ink and Everyday themes.
2. The strip under the header reads "Season 1 · round N of 12" and the dot for the
   current round is in the pack colour.
3. To see the end-of-season podium without waiting 12 weeks, in the SQL Editor:
   `update rounds set round_no = 12 where status = 'done' and group_id = '<squad id>' and round_no = (select max(round_no) from rounds where status = 'done' and group_id = '<squad id>');`
   then `select award_season_badges('<squad id>', 1);` (as the dashboard owner; the app
   cannot call it). Reopen Runway while the next round is still upcoming: the season
   podium appears above "Last round", with Season Winner and (if everyone entered 12
   rounds) Never Missed a Round. Undo with the reverse update if you want real numbers.
4. You tab: the player who got a badge sees it under the ladder card; a squad mate
   can see it on the season podium but a non-member cannot query `season_badges`
   (RLS). Try `select * from season_badges` as a user outside the squad: 0 rows.
5. Leave the squad playing: round 12 closes on its own through the existing cron,
   badges land, and round 13 opens as "Season 2 · round 1 of 12".

## Known limits

- Best Lender never fires until borrow-for-the-round writes `lent` into the ledger.
- Season podium shows the most recent finished season only; older seasons live in
  the badges row on You and in the Lookbook.
- Pack windows are fixed dates in SQL; to add a pack or theme, edit the SQL and
  re-run it (it upserts by name and by theme text).
- Not tested against a live Postgres in this session (no Supabase token, no local
  Postgres); the SQL was reviewed by hand against v3-game.sql.
