# Poppyseed Clothes v3, avatar step 1: what shipped, what is real, what to paste

Built 2026-10-31 on `master`. `v1` is untouched. Nothing is pushed or
deployed. `cd app && npm run build` and `npx oxlint` pass, and
`node scripts/dress-me-shot.mjs` (headless Chromium, 390x844) opens the
Dress me view, confirms a WebGL canvas, dresses her, and saves
`app/screenshots/dress-me.png` with zero console errors.

## What shipped

**Base body** (`app/public/avatar/poppy-base.vrm`, 5.5 MB, `LICENSE.txt` beside it)
- A real VRM 1.0 girl: `VRM1_Constraint_Twist_Sample` by pixiv Inc., from
  the VRM consortium's sample set. VRM Public License 1.0 with the flags
  that matter set in the file itself: avatar permission everyone,
  redistribution allowed, modification plus redistribution allowed, credit
  not required. Read straight out of the downloaded file's meta block on
  2026-10-31; details and URLs in `LICENSE.txt`.
- Repacked so every texture is 1024 or under (normal and specular maps
  512, thumbnail 256). Geometry, rig, 22 spring bones, 18 expressions and
  the licence meta are untouched. The repack is a 40-line Python script
  (parse GLB, resize PNGs with Pillow, rebuild the buffer); it is not in
  the repo because it only runs once per base model.
- Loaded lazily with `@pixiv/three-vrm`. Swapping the file later means
  editing one table (`MATERIAL_ROLE` in `app/src/avatar/body.ts`) and
  the average texture colours next to it.

**Presets** (You tab, "My avatar" card, `avatar_presets` row)
- 4 faces (Sweet, Sunny, Chill, Wow) = the VRM's own expression presets
  (relaxed, happy, relaxed full, surprised) held as a resting face, plus
  a random blink.
- 8 skin tones: the body and face textures are tinted relative to their
  measured base colour, so freckles, shading and the painted mouth stay.
- 10 hair styles: Long and Half up keep the model's own hair. The other
  eight hide the painted strands and build a toon cap over the skull plus
  the style's pieces (ponytail, pigtails, space buns, top bun, braid,
  pixie, bob, curls) on the head bone.
- 10 hair colours: dark colours tint the painted strands; blonde,
  platinum, pink and blue go flat (the brown base texture cannot be
  multiplied into them).
- 6 eye colours, tinting the iris texture.
- Stored in Dexie (`avatar`, one row `me`) and synced to `avatar_presets`
  exactly like `profile`: local first, push, pull when the cloud is newer.
  `loadLooks(userIds)` already fetches squad mates' rows for step 2.
- Height: `profile.heightIn` scales the whole rig from the base body's
  5'3" (clamped 0.8 to 1.2). The dated `measurements` table has no height
  column, so the profile height is the one that counts.

**Outfit slots** (`app/src/avatar/garments.ts`)
- top: the VRM's tee recoloured (solid keeps the painted folds) or given a
  procedural print.
- bottom: the VRM's shorts likewise. If the item's name or notes say
  "skirt", a knee-length skirt cone hangs off the hips as well.
- dress: tee and shorts take the dress colours plus a longer skirt cone.
- outer: an open-front toon shell on the chest bone, sleeves on the upper
  and lower arm bones, cuffs and collar in the trim colour.
- shoes: the VRM's shoes recoloured.
- Colours come from `items.colours` (first = fill, second = trim, "multi"
  becomes a two-colour pair) and `items.pattern` (solid, stripe, check,
  floral, print as polka dots, texture as knit) drawn on 512 px canvases.
- The real cutout PNG sits beside her as a card per slot; tap it to take
  the piece off.

**Dress me view** (Closet tab, "Dress me" button, `app/src/avatar/DressMe.tsx`)
- Avatar on top, drag to spin (yaw only), five moves below, slot chips,
  then a strip of her active closet pieces for the chosen slot. A dress
  replaces top and bottom and the other way round.
- Moves are procedural bone animation on the VRM normalized rig
  (`app/src/avatar/anim.ts`): idle (breath, sway, head drift), walk
  (1.1 s cycle, knees bend on the back swing, arms counter-swing), sit
  (hips drop 40 cm, hands on thighs), twirl (two turns in 1.6 s with arms
  out, lands in a pose, repeats), runway (walk toward the camera 3.2 s,
  hand-on-hip pose 1.5 s, turn, walk away, turn back, 9.5 s loop).
  Switching moves slerps, so nothing pops.

**iPhone Safari rules** (`app/src/avatar/AvatarScene.tsx`)
- `gl={{ antialias: false, powerPreference: 'low-power' }}`, `dpr={[1, 2]}`,
  `flat` (no tone mapping, which MToon wants anyway).
- `frameloop="demand"` while idle and not dragging, with a 20 fps
  invalidate heartbeat for the breathing; `always` during a move.
- Every texture 1024 or under; procedural prints are 512.
- Unmount disposes the VRM scene, hair and garment meshes and the
  pattern texture cache. The 5.5 MB download is kept in memory for the
  page's lifetime so reopening Dress me is instant.
- The three stack is one chunk, `avatar-vendor` (1.13 MB, 297 KB gzip),
  loaded only by the two `React.lazy` entry points in
  `app/src/components/avatarLazy.tsx`. The main bundle only carries the
  chunk's file name in its dynamic-import map.

## What is procedural vs real

| Part | Real | Procedural |
|---|---|---|
| Body, face, hands, rig, blink, expressions | VRM file | |
| Skin, eye, hair colour | | tints on the VRM textures |
| Long / half-up hair | VRM file | bun on top for half-up |
| Other 8 hair styles | | toon cap plus pieces |
| Tee, shorts, shoes | VRM meshes | recoloured / repatterned |
| Skirt, dress skirt, jacket | | toon cylinders on bones |
| Fabric prints | | canvas textures |
| Idle, walk, sit, twirl, runway | | sines and eases in code |

No Mixamo clips were retargeted. The free Mixamo downloads need an Adobe
sign-in and a browser session, which cannot be done non-interactively, so
step 1 went procedural as the brief allowed. The `Animator` class takes a
sampled pose per move; a retargeted clip can replace any one of them
without touching the scene.

## What David pastes (Supabase dashboard, project yrcddfehjjbtzwuotmym)

1. SQL Editor > New query > paste all of `supabase/v4-avatar.sql` > Run.
   Expect "Success. No rows returned". Safe to run twice.
2. Nothing else. Until it is pasted the avatar still works on the phone
   (Dexie), it just does not follow her to another device, and friends
   see the default look.

## What to test with Poppy

1. You tab > My avatar > "Show me". Tap through faces, skins, hairs,
   colours; she updates live. Set her height in Basics and watch her grow.
2. Closet > Dress me. Put on a top, a bottom, shoes, a jacket, then a
   dress. The cards on the right match the pieces. Drag to spin.
3. Try all five moves. Runway is the one that matters; tell us what feels
   off (speed, the pose, the turn).
4. Name a bottom with "skirt" in it and confirm it gets a skirt.
5. Watch the phone: if it gets warm or stutters, note which move and how
   many pieces were on.

## Known limits in step 1

- Tinted meshes are generic next to the real cutout. Expected; that is
  what step 6 (projecting the cutout) is for.
- The jacket shell and skirt cones do not deform with the body; they ride
  the bones rigidly. Fine standing and walking, a little stiff sitting.
- Pattern prints tile over the VRM's own UV islands, so a stripe can
  change direction at a seam.
- Blonde, platinum, pink and blue hair are flat colour (no strand
  detail). Browns, black, auburn and red keep the painted strands.
- The sit and runway arm poses are hand-tuned guesses on this one rig.
- `avatar-vendor` (1.13 MB) is precached by the PWA service worker after
  first load like every other JS chunk. The `.vrm` is not precached; it
  comes from GitHub Pages with normal HTTP caching.

## Step 2 (avatar on the Runway reveal) needs

- `loadLooks(memberIds)` from `app/src/lib/avatarSync.ts` to draw each
  friend's girl from her presets (already written, unused).
- A `Garment` per entry piece: `round_entry_cards()` returns `id, name,
  category, cutout_path` today; add `colours` and `pattern` to that SQL
  function so the reveal can tint without a second query.
- `AvatarScene` with `move="runway"` for the walk, `"twirl"` on tap,
  `"idle"` plus the hand-on-hip pose for the podium (expose `strike` as
  its own move, one line in `anim.ts`).
- Several canvases on one screen is the iPhone risk: reveal one look at a
  time (already the design) and unmount the previous one. Each mount
  re-parses the VRM (about 150 ms on a laptop; measure on her phone).
- Friends' pieces come from Supabase storage, not Dexie, so `DressMe`'s
  Dexie assumptions stay out of the reveal; feed `Outfit` objects in
  directly.
