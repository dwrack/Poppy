# Poppyseed Clothes 3.0 — Product Brief

Drafted 2026-10-31. v1 is the closet (frozen, live at /). v2 added the
squad, the smart closet, and the first playable Runway round (live at /v2/).
v3 is the version that feels like a game you open every day: a 3D Poppy who
walks the runway in her real clothes, the full game loop, and seasons.

Audience stays Poppy and her squad of 2 to 5 friends. Invite-only, no app
store, no strangers, no money inside the app. Decided 2026-10-31.

## Decisions made 2026-10-31

| Decision | Answer |
|---|---|
| Avatar | Built in the browser with three.js, VRoid-style (anime-ish, which is what DTI kids like). Face, skin tone, hair are presets she picks. Height and body from her measurements. Her selfie never leaves the phone: at most we sample skin and hair colour on-device. |
| Why not a service | Ready Player Me shut down Jan 31 2026 (Netflix). Avaturn and Avatar SDK are about $800/month for API access. None publish under-13 terms, and uploading a child's face to a vendor is a COPPA problem. |
| Her clothes on the avatar | Step 1: five outfit slot meshes (top, bottom, dress, outer, shoes) tinted and patterned from the garment's stored colours and pattern, with the real cutout photo shown as a card beside her. Step 2: project the real cutout onto the slot mesh. |
| Scope | Avatar, full game loop (ladder, theme prop, borrow for the round, style a friend, wore-it-for-real), seasonal theme packs. The Today tab (daily outfit) waits for v4. |
| Photo-real clips | Still out. Parent button at best, never in the game loop. |

## What 3.0 adds

### 1. A 3D Poppy

- Setup once in the You tab: pick a face, skin tone, hair style and colour,
  eye colour. Height and the measurements she already entered scale the body.
- Moves: idle, walk, sit, twirl, runway walk. Runway walk is the one that
  matters; make it good.
- Lives on the Runway tab (reveal, podium) and a new "Dress me" view on the
  Closet tab where she can put any piece on herself and spin.
- Friends' avatars render the same way from their own presets, so the reveal
  is five different girls walking, not five cutout stacks.
- Hard limits for iPhone Safari: one skinned body, textures 1024 or under,
  no antialias, pixel ratio capped at 2. If the frame rate drops, drop cloth
  detail before anything else.

### 2. The rest of the game (BRIEF-game.md steps 2 to 5)

- **Theme prop.** The weekly winner picks next week's theme from the pool,
  or vetoes one. Typing a new theme stays off until the squad has played a
  season.
- **Squad ladder.** Everyone's stars side by side, titles, and a season
  counter (a season is 12 rounds, about a school term). Thresholds tuned
  after three real rounds.
- **Wore it for real.** Tap on your entry the next day, optional photo,
  plus one star and a streak. The photo goes in her lookbook, not the
  runway, until the squad decides otherwise.
- **Borrow for the round.** Browse a friend's closet during the dressing
  window, request a piece, and if she says yes it shows on your avatar now
  and swaps hands at school. Built on `borrow_requests`. Lender earns a
  "Lent it" star.
- **Style a friend.** Build a look for a friend from her closet and send
  it. If she wears it as her entry, you both get the podium credit.
- **Realtime.** The who-has-submitted list and the reveal flip push over
  Supabase Realtime instead of polling, so all five phones flip together.

### 3. Seasons

- Theme packs: Halloween, Winter Formal, Spring Break, Summer. Each pack is
  10 themes plus a lobby colour and a podium confetti colour. This is the
  "update drop" rhythm DTI kids expect, done with text and CSS, not assets.
- Season badges on the You tab. End-of-season podium for the whole 12
  rounds.

## How it's built

- Avatar: `three`, `@react-three/fiber`, `@react-three/drei`,
  `@pixiv/three-vrm`. Base body is a VRoid Studio export we make ourselves
  (check the VRM licence flags allow our use) with 4 face presets, 8 skin
  tones, 10 hair styles. Animations retargeted from Mixamo (idle, walk,
  sit, twirl, catwalk). All static files in `app/public/avatar/`, served by
  GitHub Pages, loaded lazily so the closet still opens fast.
- Outfit slots: five garment meshes on the same rig with their own UVs.
  Step 1 tints them from `items.colours` and `items.pattern`. Step 2 bakes
  the cutout PNG into the slot texture on-device with a per-slot template.
- Data adds: `avatar_presets` (user_id, face, skin, hair, hair_colour, eyes,
  updated_at) synced like `profile`; `seasons` and `theme_packs`;
  `round_actions` for wore-it-for-real and style-a-friend; `borrow_requests`
  gains `round_id`.
- Nothing new is paid. No new keys. Her photos stay on-device and in her
  own Supabase storage bucket as today.

## Build order

1. **Avatar foundation (2 weeks).** VRM body in react-three-fiber on a
   "Dress me" view, presets setup on the You tab, height scaling, five
   tinted outfit slots driven by closet items, idle and runway walk, iPhone
   Safari performance pass. Ship to /v2/ behind the existing tabs.
2. **Avatar on the Runway (1 week).** Reveal shows each friend's avatar
   walking in her entry, podium poses, twirl on tap. Cutout card stays
   beside it.
3. **Game loop, part 1 (1 week).** Theme prop, squad ladder, wore-it-for-
   real, Realtime for the who's-in list and reveal.
4. **Game loop, part 2 (1 week).** Borrow for the round and style a friend.
5. **Seasons (3 days).** Theme packs, season counter, season badges,
   end-of-season podium.
6. **Real garment textures (open-ended).** Cutout projected onto the slot
   meshes. Only if step 1's tinted meshes feel too generic to the squad.

Each step ships to /v2/ as it lands. /v2/ becomes / (replacing v1) when the
squad has played a full season on it.

## What's needed from the family

- Poppy picks her presets herself, and tells us which hair styles are
  missing. Expect a list.
- Her measurements are already in the You tab; a quick re-check of height.
- Friends' parents were told before v2. Nothing new to tell them for v3
  since no new data is collected.

## Risks, honestly

- The outfit meshes drive the schedule. If making five good-looking garment
  meshes takes longer than a week, step 1 ships with top and bottom only.
- Mixamo to VRM retargeting is known-doable but fiddly; budget two days.
- iPhone Safari memory. Test on Poppy's actual phone in week one, not at
  the end.
- Tinted meshes may look generic next to the real cutout. That's what step
  6 is for, and why the cutout card stays on screen.
