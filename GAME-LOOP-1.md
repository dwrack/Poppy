# Poppyseed Runway, game loop part 1: what shipped, what to paste, what to test

Built 2026-10-31 on branch `v3/game-loop-1` (worktree
`/Users/wavey/Projects/Poppy-wt/game-loop-1`). Not merged, not pushed, not
deployed. `cd app && npm run build` passes; `npx oxlint` reports 0 errors.

## What was built

**Database** (`supabase/v5-game-loop.sql`, adds to v3-game.sql)
- Theme prop: `rounds.theme_pick_id`, `rounds.theme_veto_id`,
  `rounds.theme_pick_by`. Last round's winner(s) (ties share it) can set
  pick or veto on the squad's upcoming round. Column-level grants plus an
  RLS update policy mean nobody else can update rounds at all, and the
  winner can touch nothing but those two columns. `advance_rounds()` uses
  the pick at the drop (or the pool minus the veto) and sets
  `rounds.picked_by`. `theme_options(g)` returns 6 themes the squad has
  not played.
- Wore it for real: `round_actions` (kind `wore_it` now, `styled_by`
  reserved for part 2, `photo_path` nullable). Insert only as yourself,
  only on a round you entered, only from the day after the reveal (squad
  time zone) for a week. Squad reads it. A trigger pays 1 star
  (`stars_ledger.reason = 'wore_it'`); `'lent_it'` is in the check
  constraint as the part 2 placeholder.
- `squad_ladder(g)`: everyone's stars, rounds played, wore-it count and
  streak. `squad_season` view: 12 rounds per season per squad,
  `security_invoker` so rounds RLS applies.
- Realtime: `entries` joins the publication; a trigger also broadcasts
  "a look is in" (user id only, never the look) on private channel
  `round:<id>`, which only members of that round's squad can join
  (`realtime.messages` policy).

**App**
- `Runway.tsx`: who's-in list now runs on Realtime (private broadcast +
  entries changes) with a poll fallback (every 2 min while live, every 20
  s when the socket is down) and a small live/offline dot. The reveal flip
  already came over Realtime on `rounds` in step 1.
- `ThemePick.tsx`: under "This week" while the round is upcoming. The
  winner gets "You pick next theme": a 6-theme list with Play it / Veto
  buttons, no typing. Everyone else sees one line if a pick was made.
- `WoreIt.tsx`: under the last round's podium, only if you entered.
  "I wore it" or "Wore it, with a pic" (photo downscaled, saved to
  `closet/<you>/wore/<round>.jpg`, shown only in the lookbook). Shows the
  day it opens, and who else wore theirs.
- Lookbook: 👗 badge on looks that were worn for real, plus the wore-it
  photos row.
- `SquadLadder.tsx` on the You tab: season number and 12-dot progress,
  everyone ranked by stars with title, rounds, wore-it count and 🔥
  streak. Thresholds unchanged from BRIEF-game.md (40 / 120 / 300 / 600).

## What David pastes (Supabase dashboard, project yrcddfehjjbtzwuotmym)

1. v3-game.sql must already be in.
2. SQL Editor > New query > paste all of `supabase/v5-game-loop.sql` >
   Run. Expect "Success. No rows returned". Safe to run twice.
3. Database > Replication: confirm `rounds` and `entries` are in
   `supabase_realtime`.
4. Deploy when ready (merge to `master`, push; the existing workflow
   publishes /v2/).

## What to test with the real squad

1. Open a round (owner's "Start a round now"). On two phones, submit a
   look on one and watch the other's "Who's in" flip to "Look in ✓"
   within a second or two, no refresh. The dot next to "Who's in" should
   say "live". Turn wifi off on one phone: dot goes grey, list still
   updates when you come back.
2. Finish the round (the SQL shortcut from GAME-STEP1.md step 4, then
   `select advance_rounds();`). Once the next week's round exists as
   `upcoming` (open the Runway tab again or wait 5 min for the cron),
   the winner sees "You pick next theme". Pick one. A non-winner should
   see only the one-liner and get an error if they try to write
   `rounds` from the SQL editor as themselves. When the next round
   drops, its theme is the pick and the card says the winner picked it.
3. Wore it: the day after the runway, the entrant sees "Did you wear it
   for real?" under the podium. Tap it, confirm +1 star on the You tab
   and a 👗 badge in the lookbook. Add a photo, confirm it shows in the
   lookbook only, never on the runway. To test the same day:
   `update rounds set reveal_at = reveal_at - interval '1 day', closes_at = closes_at - interval '1 day' where status = 'done';`
4. You tab: the squad ladder lists everyone, ordered by stars, and the
   season bar shows "round 1 of 12" after the first finished round.
5. A friend who left the squad (or a stranger) can read none of this:
   `select * from round_actions;` as them returns nothing.

## Known limits / not done here

- The pick itself is readable by squad members through the `rounds` row
  (the UI hides it from non-winners). Themes are not looks; if you want
  it fully secret, move it to its own table in part 2.
- `styled_by` has no insert policy yet; part 2 (borrow for the round,
  style a friend) adds it along with `lent_it` stars.
- Streak only counts rounds she entered; a round whose wore-it window is
  still open neither counts nor breaks it.
- The private Realtime channel needs the client's session JWT on the
  socket; supabase-js 2.117 does this itself. If "live" never lights,
  the poll fallback still keeps the list fresh.
