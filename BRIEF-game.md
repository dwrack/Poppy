# Poppyseed Runway — the game, mashed up with Dress to Impress

Drafted 2026-10-31. Replaces the four-bullet "The game" section in BRIEF-v2.md.
Dress to Impress (DTI) is the Roblox game Poppy and her friends already play.
The point here is to borrow its loop and its feelings, not its content. Our
twist is the one thing DTI can't do: the clothes are real, they hang in a real
closet, and the friends are real too.

## What DTI actually does (researched 2026-10-31)

- Round: theme drops, about 325 seconds to dress, runway walk one at a time,
  everyone rates everyone 1 to 5 stars, top 3 on a podium, stars add to a
  lifetime rank ladder (New Model up to Fashion Goddess at 25,000 stars).
- What keeps kids coming back: the ladder, in-round cash you grab and spend,
  the VIP pass (about $3, private dressing room so nobody copies you, 96 extra
  items, hair and makeup), and big seasonal drops (KATSEYE collab Apr 2026,
  Halloween "Night of Scream Queens" Oct 17 2026).
- What they hate: copycats, pile-on voting, off-theme looks winning on vibes,
  pay-to-win, strangers being mean. Player count is down from a 1.74M peak
  (Dec 2024) to about 100K now. The format still works, the room is the
  problem.

Unverified from the research: exact voting-phase length, private server rules.
Don't design around either.

## The mash-up in one line

DTI's round, played by 2 to 5 real friends, from their real closets, with
nobody to copy you and nobody to be mean.

## The round

1. **Theme drop.** A theme lands for the squad at a set time (default Friday
   5pm, squad can change it). Examples: "Y2K", "Dress like your favourite
   song", "Rainy school day but make it cute", "Wear something you've never
   worn". One theme per round, a small pool we curate, and a once-a-week
   "pick the theme" prop that one friend earns (see Stars).
2. **Dressing room, 24 hours, not 5 minutes.** You build the look from your
   own closet in the app, pieces on your avatar. Real clothes can't be
   changed in 325 seconds, and a day gives time to actually wear it.
   Optional: snap a real photo of yourself in it for the runway.
3. **Everything stays hidden until the reveal.** No one sees anyone's look
   until the deadline. This is DTI's VIP private-dressing-room perk, free for
   everyone, and it kills copying outright.
4. **Runway.** At the deadline, looks flip one at a time in random order (not
   join order). Each walk is the avatar in the outfit, or the real photo if
   she took one, with a 6-second runway animation and a name card.
5. **Voting, 1 to 5 stars, with a reason.** You can't vote for yourself. Each
   star rating comes with one tap-to-pick compliment ("colour", "on theme",
   "brave", "fit", "shoes") so every vote says something nice. Votes are
   sealed until everyone has voted or 12 hours pass.
6. **Podium.** Top 3, confetti, winner badge, every look saved to the squad
   lookbook. Ties share the podium.

Round length: theme to podium in about 36 hours. One round a week by default,
squad can bump to two. No lobby, no waiting, no strangers.

## Stars, ladder, and the economy (no money)

- **Stars** are the only currency. You earn them from votes on your looks,
  plus 1 star for voting on time, plus 2 for finishing a round at all.
- **Ladder** titles, squad-wide, lifetime: Newbie, Trendsetter, Stylist,
  Icon, Closet Goddess. Thresholds tuned so Goddess takes about a school
  year of weekly rounds.
- **Theme prop.** The week's winner picks (or vetoes) next week's theme.
  That's DTI's Theme Prop, earned instead of bought.
- **Nothing is for sale.** The paid photo-real clip (BRIEF-v2) stays a parent
  button, outside the game loop, so the game is never pay-to-win.

## Things DTI can't do, which we lean on hard

- **Borrow for the round.** Browse a friend's closet during the dressing
  window and request a piece. If she says yes, it shows on your avatar now and
  you swap it at school tomorrow. Borrowed pieces earn the lender a "Lent it"
  star too.
- **Style a friend.** Build a look for a friend from her closet and send it
  as a suggestion. She can wear it as her entry and you both get credit.
- **Wore it for real.** Tapping "I wore this today" on your entry (with an
  optional photo) adds a star and a streak. The closet app's existing Today
  tab becomes the place this lives.
- **Closet gaps.** After each round, the smart closet (describe-item) notes
  what the theme needed that nobody had, and feeds the wishlist. This ties the
  game back to the shopping and price-alert features.

## Guard rails (because the room is the problem)

- Squads are 2 to 5, invite-only, parents told. Already built in v2 step 1.
- No free-text comments in the game. Compliment chips only. A real
  conversation happens in person or in their own chat.
- No vote visible per person, only the total and the chips. Nobody can see
  who gave the 2.
- A round with fewer than 3 entries still runs (everyone gets a podium spot),
  so a slow week never feels like rejection.
- Themes are curated by us, not typed by players, until we're sure of the
  group.

## Data (adds to v2-friends.sql)

- `rounds` (id, group_id, theme, opens_at, closes_at, reveal_at, voting_ends_at,
  status, picked_by)
- `entries` (id, round_id, user_id, outfit json: item ids + borrowed item ids,
  photo_path nullable, worn_for_real bool, submitted_at)
- `votes` (id, entry_id, voter_id, stars 1 to 5, chip text, unique per
  voter+entry, no self votes enforced by RLS)
- `stars_ledger` (user_id, round_id, reason, amount) so the ladder is a sum,
  not a stored total
- `themes` (id, text, season, used_at) curated pool
- Realtime on `rounds.status` so everyone's phone flips to the runway at once.

## Build order (slots into BRIEF-v2 step 4)

1. Rounds + entries + hidden-until-reveal + podium, avatar stills only, no
   animation. Playable in a week. This is the whole game; test it with the
   real squad before anything else.
2. Voting chips, sealed votes, stars ledger, ladder titles, theme prop.
3. Borrow-for-the-round and style-a-friend, reusing v2 borrow_requests.
4. Runway animation on the 3D avatar (needs BRIEF-v2 step 3 first), real
   photo walk, confetti, lookbook polish.
5. Seasonal theme packs (Halloween, winter formal, spring break) as the
   "update" rhythm DTI kids expect.

## Open decisions for David and Poppy

Decided 2026-10-31 while building step 1 (change any of these later, none
is baked into the data):

1. **Weekly, not daily.** One round a week, theme drops Friday 5pm in the
   squad owner's time zone (the app records it the first time Poppy opens
   the Runway tab), 24 hours to dress, runway for an hour, then voting
   until everyone has voted or 12 hours pass. The owner also has a
   "Start a round now" button so the squad can try it before Friday.
2. **Avatar / cutout only on the runway for now.** The look is a stack of
   her real clothing cutouts, no selfie of her in it. The `photo_path`
   column exists for later, but step 1 never fills it. Revisit after the
   squad has played three rounds.
3. **Parent digest deferred.** Not built in step 1. Still recommend yes,
   one line a week, opt-out, once rounds are actually happening.

Still open:

4. Ladder thresholds are a first guess (Trendsetter 40, Stylist 120, Icon
   300, Closet Goddess 600 stars). Tune once a few rounds show what a
   normal week earns for a 3 to 5 person squad.
5. The theme pool is 20 we wrote. Who adds to it, and does the weekly
   winner's "theme prop" (step 2) pick from the pool or type a new one?
