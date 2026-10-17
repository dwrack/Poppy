# Poppyseed Clothes 2.0 — Product Brief

Version 1 stays live and untouched at https://dwrack.github.io/Poppy/ (frozen on
the `v1` branch). Version 2 is built on `master` and previews at
https://dwrack.github.io/Poppy/v2/ until it's ready to replace version 1.

## What 2.0 adds

1. **Smarter closet.** Snap a piece and the app works out what it is, the
   fabric, fit, and feel, and finds it, or close matches, online.
2. **Friends.** Poppy and 2 to 5 friends in a private, invite-only group.
   Browse each other's closets, borrow pieces in real life, and style each
   other.
3. **A 3D Poppy.** A game avatar built from a few selfies and her
   measurements: her face, hair, skin tone, and body shape. It walks, sits,
   twirls, and does a runway walk in the outfit.
4. **Photo-real clips.** On request, a short realistic video of her in an
   outfit. Paid per clip, so it's a button, not the default.
5. **The game.** Dress to Impress style theme challenges with a timer, a
   runway, and voting.

## Decisions so far

| Decision | Answer |
|---|---|
| Version 1 | Stays live and unchanged for Poppy to use. |
| Group size | 2 to 5 friends, on phones. |
| Joining | Invite only. Sign-up only works with a valid invite code. No public profiles, no search, no strangers. Parents are told before friends join. |
| Avatar | Both: a free real-time 3D avatar for play, plus optional paid photo-real clips. |
| Extras | Theme challenges, borrow requests, wishlist with price alerts, lookbook and badges. |
| Closet data | Shared with version 1. Poppy's existing pieces carry over. |

## Features in detail

### Smart closet
- Photo in, then AI fills in category, colours, pattern, fabric guess, fit,
  warmth, dressiness, season, and a one-line "feel" ("soft, slouchy,
  weekend").
- **Find it online.** Search for the exact piece or close matches, with shop
  links and prices.
- Manual tagging stays as the fallback, as in version 1.

### Friends and closets
- Poppy creates the group and gets invite codes to give friends.
- Friends' closets are visible to the group only.
- **Try on a friend's piece.** Put any friend's item on your avatar.
- **Dress a friend.** Build an outfit for a friend from their closet, yours,
  or both, and send it to them.
- **Borrow requests.** "Can I borrow your denim jacket Saturday?" The owner
  approves, and the app tracks who has what and when it's due back.

### 3D avatar
- Setup: three selfies (front, left, right), a full-length photo, and the
  measurements already in the app.
- Avatar matches her face, skin tone, hair colour and style, height, and body
  proportions.
- **Hairstyle picker** with her hair colour applied.
- Moves: idle, walk, sit, twirl, and runway walk, with simple cloth movement on
  skirts and dresses.
- Clothes are built from her photos: the app picks a 3D garment shape for the
  category (tee, jeans, skirt, dress, jacket, sneakers…) and paints it with
  the colours and pattern from her photo. It reads as a polished game
  character, not a photo.

### Photo-real clips (paid, optional)
- "See it for real" sends her photo and the outfit to an AI video service and
  returns a 5-second clip of her walking or twirling.
- About $0.10 to $0.50 per clip. Needs an API key with a small budget cap.
- Some services refuse photos of minors. If the chosen one does, this feature
  stays off.

### The game
- **Theme challenges:** a daily or weekly theme like "Beach party", "Y2K", or
  "Dress like your favourite song". Each player styles a look within a time
  limit.
- **Runway:** each look walks the runway on that player's avatar.
- **Voting:** 1 to 5 stars per look. You can't vote for yourself. Votes are
  on the outfit, not the person.
- **Results:** podium, a winner badge, and the look saved to everyone's
  lookbook.

### Extras
- **Wishlist:** save pieces found online. See similar, cheaper options.
- **Price alerts:** a daily check on wishlist prices, with a ping when one
  drops. Best effort, because some shops block price checks.
- **Lookbook:** saved outfits, challenge looks, and outfits friends made for
  you.
- **Badges and streaks:** "Challenge winner", "Wore every piece this month",
  "Best stylist" for outfits made for friends, and a daily outfit streak.

## How it's built

| Part | Choice | Cost |
|---|---|---|
| App | Same React web app, installable on phones | Free |
| Hosting | GitHub Pages | Free |
| Accounts, data, photos, live updates | Supabase (same project as version 1) | Free tier |
| Invite-only sign-up | Database rule that rejects sign-ups without a valid invite code | Free |
| AI tagging and online search | Google Gemini free tier, called from a Supabase server function so the key stays secret | Free, daily limits |
| 3D | three.js, free rigged human base model, free (CC0) animation set | Free |
| Photo-real clips | AI video API, pay per clip | About $0.10 to $0.50 a clip |
| Price alerts | Daily scheduled server job | Free tier |

## Build order

1. **Friends foundation.** Invite-only groups, friends' closets, borrow
   requests. Version 2 preview goes live at /v2/.
2. **Smart closet.** AI tagging, find it online, wishlist, price alerts.
3. **3D avatar.** Selfie and measurement setup, hairstyles, outfits on the
   avatar, walk, sit, twirl, runway.
4. **The game.** Theme challenges, runway, voting, dress a friend, lookbook,
   badges.
5. **Photo-real clips.** Optional, once a paid key and budget are set.

## What's needed from the family

- **A free Google AI key** for smart tagging and online search, before
  step 2. Made at aistudio.google.com, takes a minute.
- **Selfies and a full-length photo of Poppy**, before step 3.
- **A paid AI video key and monthly cap**, only if you want step 5.
- Friends' parents told before friends join, as planned.
