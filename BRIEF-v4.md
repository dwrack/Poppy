# Poppyseed Clothes 4.0 — Photo-real looks

Drafted 2026-10-31. v3 (live at /v2/) gives Poppy a 3D avatar in tinted
versions of her clothes. v4 adds the real thing: a photo of Poppy, in her
actual outfit, for every look she builds and every runway entry.

## Decisions made 2026-10-31

| Decision | Answer |
|---|---|
| Engine | Qwen-Image 2.1 Turbo (Apache 2.0) run locally with mflux on David's M5 Pro MacBook. Reference editing: her photo plus up to 9 garment photos in one pass. Tested today: 26 s per image at 768x768, 9.4 GB peak, garment transferred with drawstrings and pocket intact, face and room untouched. |
| Why not a hosted service | No Higgsfield, no paid APIs, no cloud GPUs (parent decision). Local means zero cost and her photo never leaves a machine the family owns. |
| Why not CatVTON or the other try-on models | The research sweep's pick was CatVTON on PyTorch MPS: SD1.5 era, non-commercial licence, one garment per pass, ~90 s each, no Apple Silicon native path. Qwen 2.1 beats it on licence, speed, quality, and multi-garment. |
| Her selfie | Allowed by David. Stored only on the MacBook in a folder excluded from iCloud and git (`~/Projects/poppy-photoreal/private/`). Never in Supabase, never in a vault. |
| Spend | Zero. Electricity. |
| Friends | Their photo-real looks only when their own parent sends a reference photo the same way. Until then friends keep the v3 avatar on the reveal. |

## What 4.0 adds

### 1. "Photo" on Dress me and on the Runway

- Dress me gets a Photo button. Tap it, the look is queued, and a minute or
  two later the photo appears in place of the 3D avatar, with a toggle to
  flip between the two.
- A runway entry queues a photo automatically when she submits. The reveal
  shows the photo if it is ready, else the avatar. The podium shows the
  photo.
- Lookbook keeps every photo. Wore-it-for-real can use it as the default
  image.

### 2. The studio Mac (the worker)

- A small Python service on the MacBook polls Supabase for render jobs,
  pulls the garment cutouts for the look (they are already in her Supabase
  storage), pairs them with her reference photo from the private folder,
  runs the edit, runs the safety checks, uploads the result to a private
  bucket, and marks the job done. One render at a time; the Mac has 24 GB.
- Runs only while the MacBook is awake. The game is weekly and the dressing
  window is 24 hours, so a few hours of latency is fine. If the laptop is
  asleep when she submits, the photo shows up when it wakes. Dress me says
  "studio is offline, your photo will arrive later" when no worker has
  checked in for 10 minutes.
- No inbound ports, no Tailscale needed: the worker only makes outbound
  calls to Supabase with a service key that lives in `~/.config/poppy/`.

### 3. Safety, in this order, every render

1. **Prompt lock.** Templates only. Every prompt says: keep her face, hair,
   skin, body, pose and background exactly the same, change only the named
   garments. No free text reaches the model.
2. **Verify.** mflux's built-in check asks the vision model whether the edit
   applied and nothing else changed; failed renders are retried with the
   next seed, up to 3 times, then dropped.
3. **SFW classifier.** A local open-source NSFW detector (Falconsai
   nsfw_image_detection, Apache 2.0) on every output. A flag deletes the
   render and logs only the item ids.
4. **Face lock.** Face crop similarity between reference and output must be
   high (threshold tuned on the first 20 renders). Below it, the render is
   dropped: a changed face means the model drifted.
5. **Silhouette.** Person-mask area before and after within 5%. No body
   edits, ever. There are no body sliders anywhere in the app.
6. **Parent review (default on).** New renders sit in a review list on
   David's phone (a tiny page in the app behind his login) until approved.
   Flip to auto-approve per child once he trusts it.

### 4. Reference photos

- Three to five photos of Poppy: full body, standing, facing camera, arms
  slightly away from the body, plain wall, daylight, fitted plain clothes.
  The worker picks the one whose pose best matches the look (standing for
  runway, any for Dress me).
- Refresh every few months as she grows. Old ones are deleted, not kept.
- One command wipes references, renders and caches.

### 5. Later (not in the first build)

- **Poses and backdrops.** Qwen 2.1 ControlNet (pose) can put the same
  outfit in a runway pose or a school-hallway backdrop. Needs a 7.6 GB
  download and the disk is at 97%, so this waits on a cleanup.
- **Photo-real runway clips.** Image-to-video locally is the open question.
  No spend means no Seedance; a local video model on 24 GB is a research
  item, not a promise.
- **Real garment textures on the 3D avatar** (v3 step 6) is now lower
  priority: the photo is the realistic view, the avatar is the toy.

## How it's built

- `~/Projects/poppy-photoreal/` on the MacBook (outside iCloud): Python 3.12
  venv, `mflux`, worker, safety checks, `private/` for references and
  renders. This folder is not the app repo and is never pushed.
- App repo additions: `supabase/v8-photoreal.sql` (`photo_jobs` table,
  `photoreal` private bucket, RLS: entrant and squad read after reveal,
  parent review flag), Photo button and toggle in `DressMe.tsx`, photo path
  on `entries`, reveal and podium prefer the photo, a parent review page.
- Model: `Qwen/Qwen-Image-2.1-Turbo` already in the HF cache (30 GB).
  Flags proven today: `--quantize 4 --low-ram --steps 8`, portrait
  `--width 768 --height 1024`. First load 53 s, then 26 s per image.
- Disk: 21 to 27 GB free of 926. Enough to run, not enough for ControlNet
  or a video model. Cleanup candidates are David's call: 13 GB Downloads,
  19 GB Ollama models, 9 GB FLUX.1-schnell cache (unused once Qwen is the
  engine).

## Build order

1. **Worker + Photo button (this week).** `photo_jobs`, the worker loop,
   Dress me Photo button and toggle, reveal and podium prefer the photo.
   Prompt templates per garment category. Parent review page, default on.
2. **Safety stack.** Verify-retry, SFW classifier, face lock, silhouette,
   logs. Tune thresholds on the first 20 renders.
3. **Outfit fidelity.** Top plus bottom plus shoes plus outer in one pass,
   dresses, prints and text on garments, skirts vs pants swaps. A stress
   set of 10 looks graded by Poppy.
4. **Friends.** Reference-photo intake for a friend's parent (a folder drop
   on the Mac, nothing in the app), per-child allowlist.
5. **Poses and backdrops** once the disk is cleared.

## Open questions for David

1. Reference photos: take 3 to 5 this week per the spec above, or start with
   the Santa-dress shot and the headshot we already have? (Recommend new
   ones; a fitted plain outfit makes every swap cleaner.)
2. Parent review on by default, or auto-approve from day one for Poppy?
3. OK to free disk: delete the 9 GB FLUX.1-schnell cache and move Downloads
   to an external drive, or leave the disk alone for now?
