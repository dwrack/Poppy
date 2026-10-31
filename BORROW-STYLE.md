# Poppyseed Runway, step 3: borrow for the round and style a friend

Built 2026-10-31 on branch `v3/borrow-style` (worktree, off `master`). `v1`
untouched. Nothing pushed or deployed. `cd app && npm run build` and
`npx oxlint` both pass (0 errors; the 4 lint warnings are pre-existing
set-state-in-effect notes in game.ts and Runway.tsx).

## What shipped

**Database** (`supabase/v6-borrow-style.sql`, run after v3-game.sql)
- `borrow_requests.round_id`: a request made from the dressing room is tied
  to the round. Status flow is the one the Squad tab already had
  (asked = `requested`, yes = `approved`, no = `declined`, `returned`, plus
  `out`/`cancelled`). Round borrows can only be made by a squad member
  while the round is open.
- `styled_looks`: a look one friend built for another from HER closet,
  with one compliment chip. `sent -> declined` is stored; `worn` is derived
  from the recipient's entry pointing at the look. RLS: sender inserts
  as herself, only to a squad mate, only her pieces, only while open;
  recipient reads and can only flip the status (a trigger locks every
  other column); the squad reads only the worn look, after the reveal. The stylist reads her
  own sent looks through `styled_looks_for_round()`, which reports them
  as `sent` until the runway plays, so she cannot tell before the reveal
  whether her friend wore it.
- `entries.styled_look_id`, and the entry policies now check every piece
  in an outfit is yours or borrowed for this round with a yes, and that
  a styled_look_id was sent to you for this round.
- Stars: `lent_it` (+1 per piece of yours in someone's submitted look,
  one ledger row per round) and `styled_win` (stylist gets half the
  winning look's stars, rounded up). `finish_round()` replaced to pay
  them. `round_entry_cards()` now returns each piece's owner and
  `styled_by`.
- Realtime on `styled_looks`.

**App**
- `app/src/components/Stack.tsx`: the cutout stack moved out of
  Runway.tsx; `LocalStack` can now show borrowed pieces by signed URL.
- `app/src/lib/borrowStyle.ts`: hooks and calls for round borrows and
  styled looks.
- `app/src/components/BorrowTab.tsx`: dressing room gets a
  "My closet | Borrow" switch. Borrow lists squad friends; tap one to
  browse her closet; tap a piece to ask for it for this round. A yes
  turns the tile green, it appears under "Borrowed for this round", and
  it can be put on the stack; the stack list shows "name · from Ava".
  From the same view, "Style Ava" builds a look from her pieces (up to
  8), picks one compliment chip, and sends it.
- `app/src/components/StyledLooks.tsx`: looks styled for you appear in
  your dressing room as cards. "Wear it" makes it your entry in one tap
  (the entry pointing at it is what marks it worn); "Nah" declines.
- Runway + podium show "styled by Ava" and "borrowed from Mia" under a
  look. The Squad tab's Borrowing board labels round requests
  "for this week's runway"; the owner answers yes/no there as before.
- States handled: no friends in the squad, friend with an empty closet,
  closet failed to load (offline), loading, round not open (the Borrow
  tab only exists inside the open-round dressing room).
- No free-text input anywhere new. Chips only.

## What David pastes (Supabase dashboard, project yrcddfehjjbtzwuotmym)

1. Make sure `supabase/v3-game.sql` has been run.
2. SQL Editor > New query > paste all of `supabase/v6-borrow-style.sql`
   > Run. Expect "Success. No rows returned". Safe to run twice.
3. Optional: Database > Replication, confirm `styled_looks` is in
   `supabase_realtime`.
4. Merge `v3/borrow-style` into `master` and deploy when ready.

## What to test with the squad

1. Poppy starts a round. In the dressing room, tap "Borrow", tap a friend,
   tap one of her pieces. The friend's Squad tab shows the request with
   "for this week's runway" and Say yes / Not this time.
2. Friend says yes. Poppy's tile goes "Yes! ✓" within a few seconds and the
   piece appears under "Borrowed for this round". Tap it: it lands on the
   stack and the list under the stack says "from <name>".
3. Send the look. Confirm the friend still cannot see it (Who's in shows
   names only).
4. From a friend's closet, tap "Style <name>", pick a few of her pieces and
   one chip, send. On her phone a "Styled for you" card appears in the
   dressing room. Tap "Wear it": her look is in, marked "Styled by".
5. The stylist's phone should NOT show whether it was worn until the
   reveal (it shows "You sent her a look" only).
6. Try to cheat: a friend who was told no cannot put that piece on (it
   never becomes pickable; if forced, the entry insert is refused).
7. Fast-forward the clock as in GAME-STEP1.md step 4, vote, and check:
   the runway card and podium say "styled by" / "borrowed from"; the You
   tab stars include +1 per lent piece and the stylist's share if the
   styled look won.

## Known limits

- A declined styled look is hidden from the recipient; the stylist does
  not learn it was declined (by design, same as voting).
- Borrowed pieces render by signed URL (1 hour); a very long dressing
  session may need a tab refresh to repaint them.
- The styled_win payout is half the winner's stars rounded up; tune after
  a few real rounds alongside the ladder thresholds.
