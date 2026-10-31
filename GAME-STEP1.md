# Poppyseed Runway, step 1: what shipped, what to paste, what to test

Built 2026-10-31 on `master` (version 2). `v1` is untouched. Nothing is
pushed or deployed yet; `cd app && npm run build` and `npx oxlint` both pass.

## What was built

**Database** (`supabase/v3-game.sql`)
- Tables `themes` (20 seeded), `rounds`, `entries`, `votes`, `stars_ledger`,
  plus one nullable column `groups.tz`.
- RLS: only squad members read a round. An entry is visible to its owner
  always and to the squad only once the round is in `reveal`, `voting` or
  `done`. You can only vote on someone else's entry, once per entry, while
  the round is in `reveal` or `voting`. Players can only ever read their
  own votes; results come back as totals and compliment counts through
  `round_results()`, so nobody can see who gave the 2.
- `advance_rounds()` is the clock: queues a round for every squad (first
  one opens immediately, later ones next Friday 5pm in the squad's time
  zone), assigns the theme at the drop, moves `open -> reveal -> voting ->
  done` by timestamps, closes voting early when every vote is in, and pays
  out stars (`votes` = stars received, `finished` = 2 for entering,
  `voted` = 1 for voting on every other look in time).
- `start_round_now(group)` lets the squad owner open a round on the spot.
- Realtime on `rounds` so phones flip together.

**App** (`app/src/components/Runway.tsx`, `app/src/lib/game.ts`)
- Runway tab replaces the Today placeholder (still 4 tabs).
- Round card with theme and live countdown for each phase.
- Dressing room: pieces from her own closet (Dexie `items`, active only)
  tapped onto a cutout stack, up to 8. "Add a piece" opens the normal
  AddItem flow, the new piece lands in the closet, then it is pickable.
- Submit, then a waiting state showing who has a look in (names only).
- Reveal: looks flip one at a time in a random order seeded by the round
  id, so every phone sees the same order. Vote with 1 to 5 stars plus one
  compliment chip (colour, on theme, brave, fit, shoes). Votes can be
  changed until voting closes.
- Podium (2nd, 1st, 3rd, ties share a block), CSS-only confetti, winner
  badge, full ranked list with chip counts. Lookbook of past rounds.
- You tab: stars total, ladder title (Newbie, Trendsetter, Stylist, Icon,
  Closet Goddess) and progress to the next.

## What David pastes (Supabase dashboard, project yrcddfehjjbtzwuotmym)

1. SQL Editor > New query > paste all of `supabase/v3-game.sql` > Run.
   Expect "Success. No rows returned". Safe to run twice.
2. Database > Extensions > enable `pg_cron`. Back in the SQL Editor run:
   `select cron.schedule('poppy-advance-rounds', '*/5 * * * *', 'select public.advance_rounds()');`
   Without the cron the game still works whenever someone opens the Runway
   tab; the cron is what makes Friday 5pm happen while phones are in pockets.
3. Optional check: Database > Replication, `rounds` is in `supabase_realtime`.
4. Deploy when ready (push `master`; the existing workflow publishes /v2/).

## What to test with the real squad

1. Poppy opens Runway. As squad owner she sees "Start a round now". Tap it.
   The theme appears for everyone within a few seconds (Realtime).
2. Each friend builds a look. One of them taps "Add a piece", photographs
   something new, saves it, and confirms it appears in the Closet tab AND
   is pickable in the dressing room.
3. Before the 24h deadline, confirm a friend cannot see Poppy's look: the
   waiting state shows names only.
4. To skip the 24h wait for a test: in the SQL Editor run
   `update rounds set closes_at = now(), reveal_at = now(), voting_ends_at = now() + interval '12 hours' where status = 'open';`
   then `select advance_rounds();`. Phones should flip to the runway.
5. Everyone votes. Confirm you cannot vote on yourself, the podium appears
   as soon as the last vote is in, and the You tab shows stars.
6. A round with only one or two entries still produces a podium.
7. Leave it alone until Friday 5pm and confirm the next round opens on its
   own (that is the pg_cron check).

## Known limits in step 1

- The runway is a stack of clothing cutouts positioned by category, not
  the 3D avatar (BRIEF-v2 step 3). Layering is approximate.
- No selfie-on-the-runway yet (`photo_path` exists, unused).
- Who-has-submitted refreshes every 30 seconds or on focus, not instantly.
- The theme pool is 20 and reuses least-recently-used once exhausted.

## Step 2 covers

- Theme prop: the week's winner picks or vetoes next week's theme.
- Squad ladder view (everyone's stars side by side) and tuning thresholds.
- "Wore it for real" star and streak on the entry.
- Pushing the who-is-in list over Realtime instead of polling.
- Then step 3: borrow-for-the-round and style-a-friend on top of
  `borrow_requests`.
