# Poppyseed 4.0, step 1, app side: photo-real looks

Built 2026-10-31 on `master` from BRIEF-v4.md build-order step 1. This is
the app and the database. The studio worker that renders the photos is a
separate build in `~/Projects/poppy-photoreal/` (not this repo). Nothing
is pushed or deployed.

Checks that passed: `supabase/test/local-chain.sh` (CHAIN PASS 1 OK,
CHAIN PASS 2 OK, SMOKE OK), `cd app && npm run build`, `npx oxlint`
(0 errors), `node scripts/runway-shot.mjs` and
`node scripts/dress-me-shot.mjs` (console errors: 0 each; Chromium path
trick in AVATAR-STEP2.md).

## What shipped

**Database** (`supabase/v8-photoreal.sql`, paste after v7, see V3-PASTE-ORDER.md)
- `photo_jobs`: one row per requested photo. A trigger resets whatever
  the phone sent (status queued, attempts 0, no result/error/worker,
  user_id = the caller, round copied from the entry). Dress me jobs may
  only use her own closet pieces; entry jobs only her own entry and only
  pieces in that look (the worker fetches with the service key, so it
  must never be asked for anyone else's clothes). A new job rejects her
  older queued ones ("superseded"). Phones cannot update or delete jobs.
- `studio_status`: the worker's heartbeat row. Read-only to phones.
- `entries.photo_job_id`: set by the worker when an entry photo is done.
- `photoreal` bucket, private. You read your own photos once they are
  done (`own_photo_ready`): a render waiting for parent review is not
  readable, not even by her, although her job row already names it. A
  squad mate reads a runway photo (`can_see_photo`) once that round's
  reveal has started. Dress me photos are never visible to anyone else.
  No phone can write to the bucket.
- `round_entry_cards_v2()`: same columns; `photo_path` is now the newest
  photo job for that entry if it is done (an older finished photo would
  show a look she has since changed). `entries.photo_path` (set by
  nothing since v3) is no longer surfaced here.

**App**
- `app/src/lib/photos.ts`: `queuePhoto`, `queueEntryPhoto` (fire and
  forget), `useMyPhotoJobs` (Realtime on her own rows plus a poll: 15 s
  while pending with the socket down, 60 s while pending and live, 2 min
  otherwise), `useStudio` (offline when no heartbeat or older than
  10 minutes), `signPhotos` / `usePhotoUrl` through `signPaths` with the
  bucket now a parameter, `photoChip`.
- Dress me: "📸 Photo" button on the stage queues what she is wearing (up
  to 6 pieces). Chip: Queued, Rendering, In review, Ready, Failed, or
  Studio offline with the line "Studio is offline, your photo will arrive
  later." When ready the photo covers the stage with a 3D / Photo toggle;
  the avatar stays loaded behind it. If she changed clothes since, the
  chip says "earlier look".
- Runway: sending a look (or wearing a styled one) queues its photo. The
  "Your look is in" card shows the chip. Reveal and podium show the photo
  when `photo_path` is there, with the avatar behind it: tap the photo or
  the "🧍 3D" pill to flip, "📸 Photo" to flip back. Podium cards, the
  "skip to the list" rows and the Lookbook show the photo thumbnail when
  there is one, else the cutout stack.

## The contract (shared with the worker build)

- Project `yrcddfehjjbtzwuotmym`, `https://yrcddfehjjbtzwuotmym.supabase.co`.
- `photo_jobs`: id, user_id, kind (`dressme` | `entry`), entry_id, round_id,
  item_ids (1 to 6), status (`queued` > `rendering` > `review` > `done`,
  or `failed` / `rejected`), result_path (`<user_id>/<job_id>.jpg` in
  bucket `photoreal`), error, attempts, worker, created_at, started_at,
  finished_at. Phones insert kind, entry_id, round_id, item_ids only.
- `studio_status` (id 1): last_seen_at, worker, queue_depth. Offline when
  missing or older than 10 minutes.
- `entries.photo_job_id`: worker sets it when an entry job is done.
- Garment cutouts: `items.cutout_path` / `items.photo_path` in the
  `closet` bucket.
- Worker auth: service role key in `~/.config/poppy/service_key` only.

## What to test

1. Paste v8 (V3-PASTE-ORDER.md step 7). Storage shows `photoreal` locked.
2. Worker off: Closet > Dress me, put on a top and a bottom, tap Photo.
   Chip reads "Studio offline" and "Studio is offline, your photo will
   arrive later." `select status from photo_jobs order by created_at desc limit 2;`
   shows queued. Tap Photo again: the older one goes `rejected`.
3. Worker on: within a minute the chip moves Queued > Rendering > In
   review (if parent review is on) > Ready, and the photo replaces her.
   Toggle 3D / Photo. Close and reopen Dress me: the last photo is still
   there.
4. Runway: start a round, send a look. "Your look is in" shows the chip.
   Change the look: a new job, the old queued one rejected.
5. Reveal: looks with a photo show it first; tap to see her in 3D and
   back. A friend's look with no photo walks in as the avatar. Podium:
   the winner's photo; tap a block to switch girls.
6. Privacy: before the reveal, a friend running
   `select * from photo_jobs;` gets 0 rows. After it, only finished
   runway photos, never Dress me ones. A non-member gets 0 rows.

## Rough edges and open points

- Entries can hold 8 pieces; the job takes the first 6 in the order she
  picked them, so a hat or bag picked first can push shoes out.
- A Dress me piece that has not finished syncing to Supabase is refused
  ("Some pieces are still uploading. Try again in a minute").
- Parent review page (BRIEF-v4 step 1) is not in this build: the app
  shows "In review" but approving is the worker side / a later page.
- Wore-it-for-real does not yet use the photo as its default image.
- The worker must set `round_id` only via the trigger's copy (it never
  inserts) and must leave `rejected` rows alone.
