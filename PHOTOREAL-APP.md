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
- `photoreal_children`: a parent's yes, one row per child (user_id,
  approved_by, approved_at). Only the service role writes it (SQL
  Editor); a player reads her own row. Without one the insert trigger
  refuses her photo jobs ("Photos are not switched on for you yet"), the
  squad sees none of her photos, and the app shows no Photo button and
  no chips and queues nothing. BRIEF-v4: a friend gets a row only once
  her own parent has said yes and sent a reference photo. Deleting the
  row stops new photos and takes her runway photos down for the squad.
- `photo_jobs`: one row per requested photo. A trigger resets whatever
  the phone sent (status queued, attempts 0, no result/error/worker,
  user_id = the caller, round copied from the entry). Both kinds take
  only her own closet pieces (the worker fetches with the service key, so
  it must never be asked for anyone else's clothes); entry jobs also only
  her own entry and only pieces in that look. A borrowed piece never goes
  onto her photo: the lender can overwrite the image behind it after the
  borrow is approved, and the worker would dress her in whatever is
  there. It stays a cutout card beside the photo ("Borrowed pieces stay
  out of the photo"). A new job rejects her older queued ones
  ("superseded"). Phones cannot update or delete jobs.
- `studio_status`: the worker's heartbeat row. Read-only to phones.
- `entries.photo_job_id`: set by the worker when an entry photo is done.
- `photoreal` bucket, private. You read your own photos once they are
  done (`own_photo_ready`): a render waiting for parent review is not
  readable, not even by her, although her job row already names it. A
  squad mate reads a runway photo (`can_see_photo`) once that round's
  reveal has started. Dress me photos are never visible to anyone else.
  No phone can write to the bucket.
- `round_entry_cards_v2()`: same columns; `photo_path` is now the photo
  of the look as it stands, `entry_photo_job(entry)`: the newest done job
  whose pieces are all still in the look and that covers as much of it as
  a photo holds. A render of a look she replaced never stands in, whether
  the newer job is waiting, failed, was rejected or was never queued. The
  squad's read of `photo_jobs` and `can_see_photo` use the same rule, so a
  squad mate cannot open a replaced look's photo either.
  `entries.photo_path` (set by nothing since v3) is no longer surfaced
  here.

**App**
- `app/src/lib/photos.ts`: `photoAllowed` / `usePhotoAllowed` (her row
  in `photoreal_children`, checked again on focus), `queuePhoto`,
  `queueEntryPhoto` (fire and forget, and only with a parent's yes),
  `useMyPhotoJobs` (Realtime on her own rows plus a poll: 15 s
  while pending with the socket down, 60 s while pending and live, 2 min
  otherwise), `useStudio` (offline when no heartbeat or older than
  10 minutes), `signPhotos` / `usePhotoUrl` through `signPaths` with the
  bucket now a parameter, `photoChip`.
- Dress me: "📸 Photo" button on the stage queues what she is wearing (at
  most 4 pieces there: top and bottom or a dress, a jacket, shoes; a
  photo takes up to 5). Chip: Queued, Rendering, In review, Ready,
  Failed, Not approved (a safety check or the parent said no; she sees
  that, not an older photo), or Studio offline with the line "Studio is
  offline, your photo will arrive later." When ready the photo covers the
  stage with a 3D / Photo toggle; the avatar stays loaded behind it. If
  she changed clothes since, the chip says "earlier look".
- Runway: sending a look (or wearing a styled one) queues a photo of her
  own pieces in it; borrowed ones stay cutout cards beside it. The
  "Your look is in" card shows the chip ("earlier look" when the photo is
  of a look she has since changed). Reveal and podium show the photo
  when `photo_path` is there, with the avatar behind it: tap the photo or
  the "🧍 3D" pill to flip, "📸 Photo" to flip back. Podium cards, the
  "skip to the list" rows and the Lookbook show the photo thumbnail when
  there is one, else the cutout stack.

## The contract (shared with the worker build)

- Project `yrcddfehjjbtzwuotmym`, `https://yrcddfehjjbtzwuotmym.supabase.co`.
- `photo_jobs`: id, user_id, kind (`dressme` | `entry`), entry_id, round_id,
  item_ids (1 to 5 of her own pieces, in the studio's category order:
  top, bottom, dress, outerwear, shoes, hat, scarf, bag, accessory; the
  worker's own limit is 5 too: her photo plus 5 garments in one pass),
  status (`queued` > `rendering` > `review` > `done`,
  or `failed` / `rejected`), result_path (`<user_id>/<job_id>.jpg` in
  bucket `photoreal`), error, attempts, worker, created_at, started_at,
  finished_at. Phones insert kind, entry_id, round_id, item_ids only.
- `studio_status` (id 1): last_seen_at, worker, queue_depth. Offline when
  missing or older than 10 minutes.
- `entries.photo_job_id`: worker sets it when an entry job is done.
- `photoreal_children`: the worker checks the job owner's row before it
  renders, the same row the insert trigger checks.
- Garment cutouts: `items.cutout_path` / `items.photo_path` in the
  `closet` bucket.
- Worker auth: service role key in the MacBook's login Keychain only (service `poppy-studio`, set with `~/Projects/poppy-photoreal/set-service-key.command`). Never a file under `~/.config`: mac-sync copies those to the other Macs.

## What to test

1. Paste v8 (V3-PASTE-ORDER.md step 7). Storage shows `photoreal` locked.
   Before Poppy's row is in `photoreal_children`, Dress me and "Your
   look is in" show no Photo button and no chip. Add her row (v8 header,
   step 6) and refocus the app: the button appears.
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

- Entries can hold 8 pieces; a photo holds 5. The app sorts her own
  pieces into the studio's category order before it cuts, so a hat or
  bag picked first never pushes the shoes or the jacket out; anything
  past 5 (the accessories, by that order) stays a cutout card beside the
  photo. Two pieces of one category both go in the job; the studio draws
  the first.
- A Dress me piece that has not finished syncing to Supabase is refused
  ("Some pieces are still uploading. Try again in a minute").
- Borrowed pieces are not in the photo. To render them later, the job
  would record each garment's storage object version (updated_at or
  etag) at insert, the worker would refuse changed bytes, and any job
  with a piece she does not own would always go to parent review,
  whatever the auto-approve setting.
- Parent review page (BRIEF-v4 step 1) is not in this build: the app
  shows "In review" but approving is the worker side / a later page.
- Wore-it-for-real does not yet use the photo as its default image.
- The worker must set `round_id` only via the trigger's copy (it never
  inserts) and must leave `rejected` rows alone.
