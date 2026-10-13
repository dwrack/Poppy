# Poppy — Product Brief

A personal "what do I wear today?" app. One user (you), a photographed closet of
roughly 50 to 150 items, an AI stylist you talk to in plain language, and a
playful paper-doll preview of each outfit on a photo of you.

## What we settled on

| Decision | Answer |
|---|---|
| Audience | Just you. No accounts beyond a single login, no sharing. |
| Core moment | 7am. Open the app, get a great outfit in seconds. |
| Item input | Photograph each item once. Background is removed automatically. |
| Intelligence | AI vision tags items on upload. An AI stylist picks and explains outfits. |
| Platform | Phone web app, installed to the home screen. Camera works, no app store. |
| Context | Weather forecast plus a mood or occasion you type ("office", "feeling bold"). No calendar. |
| Primary interaction (v1) | Plain-language chat: "something warmer", "less corporate". |
| Later interactions | Swap one piece. Swipe through 3 to 5 options. |
| Outfit preview | Paper doll: your item cutouts composited onto a fixed photo of you. No AI image generation. |
| Data | Cloud backend you own (free tier). Synced and backed up. |
| Budget | Essentially free. Three tiers below. |
| Aesthetic | Warm and playful. Poppy has a personality. |
| Your role | I build, you test and react. |

## The paper-doll preview, honestly

What you asked for: place the clothes onto a photo of you, no AI generation.
This works and costs nothing, but set expectations:

- **One base photo of you.** Standing, facing the camera, plain wall, fitted
  neutral clothes. Taken once. This is the doll.
- **One-time calibration.** You drag and resize a box for each zone: head,
  torso, legs, feet. Takes about a minute. Every item in a category snaps to
  its zone.
- **Items are cutouts.** Background removal runs in your browser for free.
  Flat-lay photos of items (laid on a bed or floor) work best.
- **It will look like a dress-up doll**, not a photograph. No draping, no
  perspective, sleeves won't wrap your arms. Items photographed on a hanger
  look better than crumpled ones.
- **Why it's still great:** instant, free, works offline, and with the playful
  aesthetic it reads as charming rather than fake. Real AI try-on is slow,
  costs per image, and is often uncanny. We can add it as an optional
  "See it for real" button later if you ever want to pay for it.

Layering order, bottom to top: base photo, shoes, bottoms, tops, outerwear,
accessories.

## How a morning works

1. Open Poppy. It already knows today's weather for your location.
2. Poppy greets you and shows one outfit on the doll with a one-line reason:
   "Rainy and 12°, so the waxed jacket, and the mustard knit to fight the grey."
3. You type or tap a quick chip: "warmer", "less effort", "I have a dinner."
4. Poppy adjusts and explains. Repeat until happy.
5. Tap "Wearing this." Poppy logs it so it won't repeat the outfit this week.

Target: under 10 seconds from opening the app to a first good outfit.

## How cataloging works

1. Tap the camera, photograph an item on a plain surface.
2. Background removed on-device, instantly.
3. AI vision suggests: category, colour(s), pattern, warmth, formality,
   season. You confirm or fix with one tap each.
4. Item appears in your closet grid. Optional: name, brand, notes, "favourite",
   "in the wash", "archived for summer".

Cataloging 100 items should take under an hour total.

## Three budget tiers

### Tier 1: Essentially free (the target)

| Need | Choice | Cost |
|---|---|---|
| Weather | Open-Meteo, no API key | Free |
| Background removal | Runs in the browser (`@imgly/background-removal` or similar) | Free |
| Item tagging (vision) | Free tier of a hosted model (Google Gemini or Groq free tier) | Free, daily rate limits |
| Stylist chat | Same free tier | Free, daily rate limits |
| Outfit preview | Paper-doll compositing on canvas | Free |
| Database + photo storage + login | Supabase free tier | Free |
| Hosting | Vercel or Netlify free tier | Free |

Trade-offs: free-tier limits change without notice. Tagging may occasionally
fail or be slow, so manual tagging must always be a one-tap fallback. Styling
chat quality is good but not best-in-class.

### Tier 2: A few dollars a month

Same as Tier 1, but tagging and chat use a paid small model (Claude Haiku or
Gemini Flash). At personal usage (100 item uploads once, a handful of chat
turns a day) this lands around $1 to $3 a month. You get reliability, no
daily caps, and noticeably better styling reasoning.

### Tier 3: Spend what makes it great

Tier 2 plus: a stronger model (Claude Sonnet) for the stylist, and an optional
on-demand AI try-on image. Image generation runs roughly $0.04 to $0.10 per
image depending on provider. Used a couple of times a day this is roughly
$10 to $25 a month.

I'll build Tier 1 with a single config switch so moving to Tier 2 is a key
change, not a rewrite.

## Recommended stack

- **Frontend:** React with Vite, installable PWA, mobile-first. Tailwind for
  styling. Canvas for the doll.
- **Backend:** Supabase (Postgres, Storage, Auth). One user row, you.
- **AI calls:** a thin serverless function so API keys never ship to the
  browser. Provider behind an interface so it can be swapped.
- **Weather:** Open-Meteo, with location saved once.
- **Hosting:** Vercel free tier.

## Data model (first pass)

- `items`: id, photo_url, cutout_url, category, subcategory, colours[],
  pattern, warmth (1 to 5), formality (1 to 5), seasons[], brand, name, notes,
  status (active / laundry / archived), favourite, created_at
- `outfits`: id, item_ids[], worn_on, occasion, mood, weather_snapshot,
  rating, poppy_reason
- `doll`: base_photo_url, zones { head, torso, legs, feet } as x, y, w, h
- `settings`: location, units, style_notes (free text you write about your
  taste; fed to the stylist every time)

## What makes it amazing (not just functional)

- **Poppy explains itself.** Every pick has a one-line "why". That's what
  builds trust and teaches you about your own closet.
- **Style notes.** A free-text box where you write "I hate tucking shirts,
  I run cold, I like high contrast." The stylist reads it every time. This
  does more for quality than any model upgrade.
- **Laundry toggle.** One tap marks an item as in the wash. Poppy never
  suggests what you can't wear.
- **Quick chips.** "Warmer", "Dressier", "Lazier", "Surprise me" under the
  chat box so mornings need zero typing.
- **Wear log.** Light history so Poppy avoids repeats and can later tell you
  "you haven't worn the green shirt in two months."
- **Personality.** Warm, short, a little cheeky. Never a wall of text.
- **Speed.** First outfit appears before you've finished your first sip of
  coffee. Weather fetch and first pick happen on load.

## Build plan

**Milestone 1, closet (first few days)**
Login, photograph item, background removal, AI tag suggestion, closet grid,
laundry and archive toggles.

**Milestone 2, the doll**
Base photo upload, zone calibration, composite an outfit, layering order.

**Milestone 3, the morning**
Weather, mood box with chips, first pick on load, chat refinement, "Wearing
this" log, no-repeat rule.

**Milestone 4, polish**
Poppy's personality and visual identity, animations, install prompt, offline
closet browsing.

**Later**
Swap-one-piece, swipe mode, packing lists, optional paid try-on image.

## Open questions for you

1. Do you have, or can you take, a full-length standing photo against a plain
   wall? That's the doll.
2. Are your clothes mostly photographable flat or on a hanger? Hanger shots
   compose better onto the doll.
3. Any items that break the four zones: dresses, jumpsuits, bags, hats, scarves?
   Dresses need a torso-plus-legs zone. Tell me what you own.
4. Metric or imperial for temperature?
5. Is the name Poppy final, and is Poppy a character (a face, a voice) or just
   the app name?
