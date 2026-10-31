# Poppyseed v3: SQL paste order and the merged squad test plan

Merged to `master` 2026-10-31: avatar step 1, game loop 1, borrow/style, seasons, avatar step 2 (runway).
Not pushed, not deployed. `cd app && npm run build` passes, `npx oxlint` 0 errors.
SQL chain tested on a local Postgres (`supabase/test/local-chain.sh`: two passes + smoke); v7 is the superset file, see its header.

## Paste, in this order (Supabase dashboard, project yrcddfehjjbtzwuotmym, SQL Editor > New query > paste the WHOLE file > Run)

Every file is idempotent: "Success. No rows returned", safe to re-run. If you are not sure whether an earlier one went in, paste it again.

1. `supabase/v3-game.sql`: themes, rounds, entries, votes, stars_ledger, the clock. Safe to re-run.
2. `supabase/v4-avatar.sql`: avatar_presets table + RLS so her avatar follows her between phones. Safe to re-run.
3. `supabase/v5-game-loop.sql`: theme prop columns, round_actions (wore it), squad_ladder, squad_season view, entries Realtime. Safe to re-run.
4. `supabase/v6-borrow-style.sql`: borrow_requests.round_id, styled_looks, entries.styled_look_id, outfit check, lent_it/styled_win stars. Safe to re-run.
5. `supabase/v4b-avatar-runway.sql`: `round_entry_cards_v2()`, the reveal/podium cards with each piece's colours and pattern, the entrant's avatar presets, and the same owner and "styled by" credit as v6's cards. AFTER v6 on purpose (it reads styled_looks). Safe to re-run. Until it is pasted the app degrades gracefully: the reveal still plays, the avatars walk in grey clothes with presets fetched separately, and the credits still show.
6. `supabase/v7-seasons.sql`: theme_packs, season/round numbering, season_badges. LAST on purpose: it redefines advance_rounds() and finish_round() as the union of v3 + v5 + v6 + v7, and pins the full stars_ledger reason list. Safe to re-run. Never paste v3, v5 or v6 after it (they would overwrite the clock with an older version); if you must, paste v7 again afterwards.

Then, once only: Database > Extensions > enable `pg_cron`, and in the SQL Editor run

    select cron.schedule('poppy-advance-rounds', '*/5 * * * *', 'select public.advance_rounds()');

Checks after pasting: Database > Replication has `rounds`, `entries`, `styled_looks` in `supabase_realtime`. `select * from active_pack();` returns Halloween through Oct 31, Everyday after. `select name, count(*) from themes t join theme_packs p on p.id = t.pack_id group by name;` shows Everyday 20 and 10 for each other pack.

## Squad test plan (merged, de-duplicated)

Shortcut to skip a wait, run in the SQL Editor: `update rounds set closes_at = now(), reveal_at = now(), voting_ends_at = now() + interval '12 hours' where status = 'open';` then `select advance_rounds();`.

1. You tab > My avatar > Show me. Tap faces, skins, hairs, colours; set height in Basics, she grows. Closet > Dress me: top, bottom, shoes, jacket, dress; try all five moves; a bottom named with "skirt" gets a skirt. Note any warm phone or stutter.
2. Poppy (owner) opens Runway, taps "Start a round now". Theme shows on every phone within seconds. Lobby card is Halloween purple through Oct 31 with "Halloween pack" in the header, and the strip reads "Season 1 · round 1 of 12".
3. Dressing room: one friend taps "Add a piece", photographs something, confirms it lands in Closet and is pickable.
4. Borrow: tap Borrow, a friend, one of her pieces. Her Squad tab shows the request "for this week's runway" with Say yes / Not this time. Yes: the tile goes "Yes! ✓", the piece lands on the stack "from <name>". A piece told no never becomes pickable.
5. Style a friend: from her closet tap "Style <name>", pick pieces and one chip, send. Her dressing room shows "Styled for you"; "Wear it" puts the look in, marked "Styled by". The stylist sees only "You sent her a look" until the reveal.
6. Who's in: submit on one phone, the other flips to "Look in ✓" within a second or two with the dot reading "live". Wifi off: dot goes grey, list catches up on reconnect. Nobody can see another look before the reveal.
7. Fast-forward with the shortcut. Everyone votes (no voting for yourself); the podium appears when the last vote is in. Runway cards and podium say "styled by" / "borrowed from". You tab stars include +1 per lent piece and the stylist's share if the styled look won. A round with one or two entries still gets a podium.
8. Theme prop: once next week's round exists as upcoming, the winner sees "You pick next theme" and picks or vetoes; others see one line only. At the next drop the theme is the pick and the card says the winner picked it.
9. Wore it: the day after the runway the entrant sees "Did you wear it for real?" under the podium. Tap it: +1 star on You, a 👗 badge in the lookbook; a photo shows in the lookbook only. Same-day test: `update rounds set reveal_at = reveal_at - interval '1 day', closes_at = closes_at - interval '1 day' where status = 'done';`
10. You tab: squad ladder lists everyone by stars; season bar reads "round 1 of 12" after the first finished round.
11. Season podium without waiting 12 weeks: `update rounds set round_no = 12 where status = 'done' and group_id = '<squad id>' and round_no = (select max(round_no) from rounds where status = 'done' and group_id = '<squad id>');` then `select award_season_badges('<squad id>', 1);`. Reopen Runway while the next round is upcoming: the season podium sits above "Last round"; the badge holder sees it on You. Undo with the reverse update.
12. Privacy: a non-member running `select * from round_actions;`, `select * from season_badges;` or `select * from styled_looks;` as themselves gets 0 rows.
13. Leave it alone past Friday 5pm squad time: the next round opens on its own (the pg_cron check); round 12 closing hands out badges and round 13 opens as "Season 2 · round 1 of 12".

## v4: photo-real looks (paste after everything above)

7. `supabase/v8-photoreal.sql`: `photo_jobs` (the render queue), `studio_status` (the studio Mac's heartbeat), `entries.photo_job_id`, the private `photoreal` bucket and its read rules, and `round_entry_cards_v2()` again with `photo_path` = the finished photo. AFTER v7 and after v4b on purpose: v4b defines the same cards function without the photo. Safe to re-run. If you ever paste v4b again, paste v8 straight after it.

Bucket fallback: after the paste, Storage should list `photoreal` with a lock. If it is not there (some projects refuse the bucket insert from the SQL Editor), Storage > New bucket > name `photoreal`, Public bucket OFF > Create, then paste v8 once more so the read rules attach.

Studio key, once, on the MacBook: Project Settings > API > service_role > Reveal > copy, then in Terminal `mkdir -p ~/.config/poppy && pbpaste > ~/.config/poppy/service_key && chmod 600 ~/.config/poppy/service_key`. That file is the only place it lives: not the app, not this repo, not a vault, not a chat. The app keeps its publishable key.

Before the worker has ever checked in, Dress me and the "Your look is in" card say "Studio is offline, your photo will arrive later." and jobs wait in the queue. Check with `select * from studio_status;` (one row once the worker runs) and `select status, count(*) from photo_jobs group by 1;`.
