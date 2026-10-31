# Poppyseed Clothes v3, avatar step 2: her avatar on the Runway

Built 2026-10-31 on branch `v3/avatar-runway` from `master`, merged to
`master` the same day on top of game loop 1, borrow/style and seasons
(`round_entry_cards_v2` now also carries v6's owner and styled_by
credit, and the SQL chain test covers it). `v1` is untouched. Nothing
is pushed or deployed. `cd app && npm run build` and
`npx oxlint` pass (0 errors), and `node scripts/runway-shot.mjs` (headless
Chromium, 390x844, Supabase stubbed with a fake squad of three) opens the
Runway tab, watches look 1 walk in, flips to looks 2 and 3 on the same
canvas, reloads into a finished round for the podium, taps third place,
and saves `app/screenshots/runway-reveal.png` and
`app/screenshots/podium.png` with zero console errors.

## What shipped

**Reveal** (`app/src/components/Runway.tsx`, `Show`)
- Each look is now that friend's 3D girl, drawn from her own
  `avatar_presets` row (the default look if she never set one), wearing
  the entry's pieces on the five outfit slots from step 1. She walks in
  from the back (3.2 s), settles into the hand-on-hip pose, turns once on
  the spot, and holds. The real cutouts sit beside her as small cards.
- Tap her to twirl (one cycle, then she holds again).
- ONE WebGL canvas for the whole reveal. `AvatarStage` stays mounted
  across "Next look"; only `look`, `outfit` and a `restartKey` change, so
  the VRM is parsed once and GPU textures are reused. The name card and
  the vote box are what flip.
- The cutout stack is the picture until she is ready (the avatar chunk and
  the 5.5 MB body load only when the reveal starts, never for the Closet),
  and stays for good if WebGL is missing or the body fails. Nothing in
  the game depends on 3D.

**Podium** (`Podium`, used by "Last round" and the lookbook's parent)
- One girl at a time on a podium block (1st is the tall one, centre). The
  winner shows first; tap any of the three podium cards to bring that
  friend up. She twirls on arrival, then holds the pose. Confetti is still
  the CSS it was.
- Why not three girls at once: BRIEF-v3 and AVATAR-STEP1 both make one
  skinned body the iPhone rule, and three bodies means three parses and
  three sets of textures. One body, swapped by tap, keeps the rule. If
  the squad wants all three standing there, that is the one place to
  break it, and `AvatarScene` would need a multi-body mode.

**Moves** (`app/src/avatar/anim.ts`)
- `strike`: the hand-on-hip pose held, breathing. Used on the podium.
- `reveal`: a one-shot. Walk in, pose, one slow 360, hold from 5.6 s
  (`REVEAL_HOLD_AT`). `Animator.holding` tells the scene when it has
  settled; the scene then drops to `frameloop="demand"` with the 20 fps
  heartbeat, same as idle.
- `Animator.restart()` replays the current move from its first frame and
  places her instantly (two "hard" frames with no slerp), so the next
  girl starts at the back of the runway instead of sliding there.
- The five Dress me buttons are unchanged (`MOVES` / `UiMove`).

**AvatarScene** (`app/src/avatar/AvatarScene.tsx`)
- New props: `restartKey` (replay the move), `podium` (block under her
  feet, 1 to 3), `onHold` through the existing `onReady`/`onError` path.
- Bug fixed from step 1: the body-load effect depended on `onError`, and
  every parent passed an inline arrow, so each parent render re-parsed
  the body and swapped it under the scene. In Dress me this was a second
  parse right after the first paint; in the reveal it was a parse per
  state change and she never appeared. Callbacks now live in a ref and
  the body loads once per mount.
- Bug fixed from step 1: `index.html` was modulepreloading the 1.1 MB
  `avatar-vendor` chunk on first paint, because rolldown folded `react`
  into that chunk and the main bundle imported it statically. React now
  has its own chunk via `codeSplitting.groups` in `app/vite.config.ts`,
  and the three stack only downloads with the avatar.

**Data** (`app/src/lib/game.ts`, `supabase/v4b-avatar-runway.sql`)
- `round_entry_cards_v2(r)`: same rows and the same visibility as
  `round_entry_cards()` (squad only; another player's entry only from the
  reveal on), plus each piece's `colours` and `pattern` and the entrant's
  avatar presets as `avatar` (null when she has none). A sibling, not an
  edit, because Postgres cannot change a function's output columns with
  `create or replace`, and phones that have not refreshed keep working.
- `loadRunway()` calls v2 and falls back to v1 until the file is pasted
  (then the girls walk in grey and presets are fetched with `loadLooks`).
  `EntryCard` gains `look`; `Piece` gains optional `colours`/`pattern`.
  `outfitOf(card)` builds the avatar `Outfit` (first piece per slot).

## What David pastes (Supabase dashboard, project yrcddfehjjbtzwuotmym)

1. Follow `V3-PASTE-ORDER.md`: v4b is step 5, after v6-borrow-style.sql
   (it reads styled_looks for the "styled by" credit).
2. SQL Editor > New query > paste all of `supabase/v4b-avatar-runway.sql`
   > Run. Expect "Success. No rows returned". Safe to run twice.
3. Nothing else. Before the paste the reveal still works: avatars in grey
   clothes, cutouts beside them.

## What to test with the squad

1. Owner taps "Start a round now", everyone sends a look, wait for the
   reveal (or let the owner's phone roll the clock). Watch look 1 walk
   in. Does the walk read as a runway walk on a phone? Too slow, too
   fast, is the turn worth keeping?
2. "Next look" three or four times. The switch should be instant (no
   "Getting dressed"); if the phone shows the cutout stack for a second
   between looks, note which phone.
3. Tap her mid-walk and after she stops. Twirl should land back in the
   pose, no hop.
4. Friend with no presets: she should be the default brown-haired girl,
   not an error. Friend whose entry is hats and bags only: she walks in
   the base tee and shorts.
5. Podium: the winner is up first. Tap second and third. Check names
   under the blocks match the girl on the stage.
6. Phone warmth and stutter during a five-look reveal, and whether the
   Closet tab opens as fast as before (it should be faster: the avatar
   chunk is no longer preloaded).

## Known rough edges

- Friends' heights: the entrant's `profile.heightIn` is not shared (the
  profile table is private), so every friend walks at the base 5'3".
  Sharing height needs a column on `avatar_presets` or in the v2 card.
- Only the five slots render on the avatar. Hats, scarves, bags and
  accessories show on the cutout cards only (step 1 limit).
- The podium block is a plain toon cylinder; the winner's lift is 16 cm.
- `reveal` ends with her standing at the centre, so the twirl from the
  hold does not move her; `runway` in Dress me still loops as before.
- The headless check ignores the Realtime websocket error (no network in
  the sandbox); everything else is a hard failure.
- Chromium for the check: playwright-core 1.64 looks for build 1248,
  which is not in the cache here. Run with
  `CHROMIUM="$HOME/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"`
  (same trick as step 1).
