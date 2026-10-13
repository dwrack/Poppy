# Poppyseed Clothes — Product Brief

A personal "what do I wear today?" app. One user (you), a photographed closet of
roughly 50 to 150 items, an AI stylist you talk to in plain language, and a
preview of each outfit composited onto a real photo of you. Everything runs on
free tiers.

## What we settled on

| Decision | Answer |
|---|---|
| Name | Poppyseed Clothes |
| Audience | Just you. One login, no sharing. |
| Core moment | 7am. Open the app, get a great outfit in seconds. |
| Item input | Photograph each item once, laid flat. Background removed automatically. |
| Intelligence | AI vision tags items on upload. An AI stylist picks and explains outfits. |
| Platform | Phone web app, installed to the home screen. Works on your iPhone Pro, no App Store. |
| Context | Weather forecast in Fahrenheit, plus a mood or occasion you type. No calendar. |
| Primary interaction (v1) | Plain-language chat: "something warmer", "less corporate". |
| Later interactions | Swap one piece. Swipe through 3 to 5 options. |
| Outfit preview | Your real full-length photo as the base. Item cutouts composited onto it. Switchable hairstyles. |
| Body | Your measurements and body shape, entered once, tracked over time, fed to the stylist. |
| Data | Cloud backend you own (free tier). Synced and backed up. |
| Budget | Free. No paid AI. |
| Aesthetic | Warm and playful. |
| Your role | I build, you test and react. |

## The body preview, honestly

What it is: your actual photo, your actual body and hair, with cutouts of your
real clothes placed on top. What it is not: realistic draping. Clothes will
look laid onto the photo, not worn. Realistic try-on requires paid AI image
generation, which you've ruled out. Within that limit, here is everything
I'll do to make it as good as possible.

**Base photos (you shoot these once)**
- Full length, standing, facing the camera, plain wall, even light, fitted
  neutral clothes (a fitted tee and leggings or similar).
- One base photo per hairstyle you want to switch between. Same spot, same
  distance, same pose. The app lets you flip between them.
- Optional: a second pose (three-quarter turn) later.

**Zones (one-minute calibration per base photo)**
You drag and resize a box for each: head (hats), neck (scarves), torso,
full-body (dresses, jumpsuits), legs, feet, hand (bags). Every item snaps to
its category's zone.

**Upgrades over a basic paste-on**
- **Per-item fit memory.** After auto-placement you can nudge, scale, or
  rotate any item once. It remembers, so the next outfit with that item is
  already right.
- **Tuck rules.** Tops flagged "tucked" are cropped at the waistband and drawn
  under bottoms. Untucked draw over.
- **Layer order.** Base, shoes, bottoms or full-body, tops, outerwear,
  scarves, bags, hats.
- **Lighting match.** A cheap brightness and warmth adjustment so cutouts
  sit closer to the base photo's light.
- **Soft edges.** A one-pixel feather on cutouts so they stop looking
  stickered.
- **Clean cutouts.** Background removal runs in your browser for free. Flat
  photos on a plain, contrasting surface, smoothed out and squared to the
  camera, produce the best cutouts.

**Later, still free, if you want it**
A simple mesh warp that bends a flat garment around the torso silhouette.
Better than flat, still not real cloth. Worth trying once the basics work.

**What LiDAR would and wouldn't add**
Your iPhone Pro and Mac make a native LiDAR scan possible, giving a 3D model
of you. But flat clothing photos still can't be wrapped onto a 3D mesh without
paid AI or 3D garment assets, so a 3D body doesn't improve the clothes. It
also moves the app off the web and into months of native work. Parked unless
your goals change.

## Measurements and body shape

Entered by tape measure once, no scan needed. The stylist reads them every
time.

- **Fields:** height, weight (optional), bust/chest, waist, hips, inseam,
  shoulder width, arm length, neck, shoe size. Plus a body-shape pick from a
  simple guide.
- **Style notes:** free text about fit preferences, e.g. "I run cold, no
  cropped tops, I like a defined waist." The single biggest lever on styling
  quality.
- **History:** every save is a dated entry. A small trend view shows changes
  over time.
- **Fit when shopping (later):** paste a brand's size chart or a product URL
  and get a size recommendation against your numbers.

## How a morning works

1. Open the app. It already has today's forecast in °F for your location.
2. One outfit appears on your photo with a one-line reason:
   "Rainy and 54°, so the waxed jacket, and the mustard knit to fight the grey."
3. Type or tap a chip: "warmer", "less effort", "I have a dinner".
4. The stylist adjusts and explains. Repeat until happy.
5. Tap "Wearing this." It logs the outfit so it won't repeat it this week.

Target: under 10 seconds from opening the app to a first good outfit.

## How cataloging works

1. Tap the camera, photograph an item laid flat on a plain surface.
2. Background removed on-device, instantly.
3. AI vision suggests category, colours, pattern, warmth, formality, season.
   You confirm or fix with one tap each. If the free tier is rate-limited,
   you tag manually with the same taps.
4. Item appears in your closet grid. Optional: name, brand, notes,
   favourite, "in the wash", "archived for summer", tucked/untucked default.

Cataloging 100 items should take under an hour total.

## Free stack

| Need | Choice | Cost |
|---|---|---|
| Weather | Open-Meteo, no API key, Fahrenheit | Free |
| Background removal | In-browser (`@imgly/background-removal` or similar) | Free |
| Item tagging (vision) | Free tier of a hosted model (Google Gemini or Groq) | Free, daily limits |
| Stylist chat | Same free tier | Free, daily limits |
| Outfit preview | Canvas compositing | Free |
| Database, photo storage, login | Supabase free tier | Free |
| Hosting | Vercel free tier | Free |

Free-tier limits change without notice, so manual tagging always works
without AI, and the stylist degrades to rule-based picks (weather bands,
formality, colour harmony) if the model is unavailable. The AI provider sits
behind one interface so a paid key can be dropped in later without a rewrite.

- **Frontend:** React with Vite, installable PWA, mobile-first, Tailwind,
  Canvas for compositing.
- **Backend:** Supabase (Postgres, Storage, Auth).
- **AI calls:** one thin serverless function so keys never ship to the browser.

## Data model (first pass)

- `items`: id, photo_url, cutout_url, category, subcategory, colours[],
  pattern, warmth (1 to 5), formality (1 to 5), seasons[], brand, name, notes,
  status (active / laundry / archived), favourite, tuck_default,
  fit_adjust { x, y, scale, rotation } per base photo, created_at
- `base_photos`: id, url, label (hairstyle name), zones { head, neck, torso,
  full_body, legs, feet, hand } as x, y, w, h, is_default
- `measurements`: id, taken_on, height, weight, bust, waist, hips, inseam,
  shoulder, arm, neck, shoe, body_shape
- `outfits`: id, item_ids[], worn_on, occasion, mood, weather_snapshot,
  rating, reason
- `settings`: location, units (°F), style_notes

## What makes it amazing

- **It explains itself.** Every pick has a one-line why.
- **Style notes plus measurements.** The stylist knows your body and your
  rules. This beats any model upgrade.
- **Laundry toggle.** Never suggests what's in the wash.
- **Quick chips.** "Warmer", "Dressier", "Lazier", "Surprise me". Zero typing
  on autopilot mornings.
- **Hairstyle switch.** Tap to see the outfit with today's hair.
- **Fit memory.** Fix an item's placement once, it stays fixed.
- **Wear log.** Avoids repeats, and later: "you haven't worn the green shirt
  in two months."
- **Personality.** Warm, short, a little cheeky. Never a wall of text.
- **Speed.** First outfit before your first sip of coffee.

## Build plan

**Milestone 1, closet**
Login, photograph item, background removal, AI tag suggestion with manual
fallback, closet grid, laundry and archive toggles.

**Milestone 2, you**
Base photo upload, zone calibration, hairstyle variants, measurements entry
and history, style notes.

**Milestone 3, the preview**
Composite an outfit onto a base photo, layer order, tuck rules, per-item fit
adjustment, lighting match.

**Milestone 4, the morning**
Weather in °F, mood box with chips, first pick on load, chat refinement with
rule-based fallback, "Wearing this" log, no-repeat rule.

**Milestone 5, polish**
Visual identity, animations, install prompt, offline closet browsing.

**Later**
Swap-one-piece, swipe mode, mesh warp for garments, size-chart fit checker,
packing lists.

## What I need from you to start Milestone 1

Nothing. Login and the closet need no photos of you. For Milestone 2 I'll
need your base photos: full length, plain wall, even light, fitted neutral
clothes, one per hairstyle, all shot from the same spot.
