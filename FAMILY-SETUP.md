# Family setup: Poppy, Penny and Dad

Goal: Penny gets her own account with her own friends squad, and everyone shares a "Rack Family" squad. App link: https://dwrack.github.io/Poppy/v2/

## 1. Put it live (once)
- Tell Claude "ship the family branch". Claude merges it and the app updates in about 2 minutes.
- Supabase dashboard (signed in with Poppy's Gmail) > SQL Editor > New query. If v3 to v8 are not in yet, paste those first (order in `V3-PASTE-ORDER.md`). Then paste all of `supabase/v9-family.sql`, press Run. It should say "Success". This keeps each squad's stars and borrowing separate.

## 2. Poppy makes the family squad
- Squad tab > scroll down > "Start another squad". Name it Rack Family, pick an icon, tap Create squad.
- Rack Family is now the squad showing at the top. Tap "+ Invite" twice to get two codes: one for Penny, one for Dad.
- Each code works once and lasts 14 days. "Share invite" sends a link that opens sign-up with the code already filled in.

## 3. Penny signs up
- On her own phone or iPad, open the app link. On a shared one, Poppy signs out first (You tab > Sign out, at the bottom).
- Tap "Got an invite code? Join here". Type her code, her first name, her email and a password. Tap Create account.
- Tap the link in the confirmation email, then sign in. She lands in Rack Family.
- Her friends squad: Squad tab > "Start another squad", name it, then "+ Invite" for each friend.

## 4. Dad signs up
- Same as Penny, with the second code. The first name is what the kids will see, so "Dad" works.

## 5. Switching squads
- Anyone in two or more squads sees chips at the top of the Squad and Runway tabs. Tap one to switch.
- Each squad has its own weekly round, ladder and borrowing. The You tab's squad ladder shows whichever squad you picked last.
- The phone remembers the pick for each person.
- Already have an account and got a code for another squad? Squad tab > "Join another squad".

## 6. One phone, two kids
- Each person's closet stays separate on the device. Sign out and the next person sees only their own things.
- Nothing one person adds ever uploads under the other's name. Pieces added offline wait for their owner to sign back in.

## 7. Photo-real looks
- Penny's and Dad's base photos are already on the studio Mac (`~/Projects/poppy-photoreal/private/refs/penny` and `.../david`). They never leave it.
- Until the steps below are done they walk the runway as their 3D avatar, which works fine.
- After both have signed up, in the Supabase SQL Editor: `select id, email from auth.users;` to find their ids, then switch photos on for each (Poppy too, if not done yet):

      insert into photoreal_children (user_id, approved_by) values
        ('<Poppy id>', 'David, her dad'),
        ('<Penny id>', 'David, her dad'),
        ('<Dad id>', 'David');
      -- add "on conflict do nothing" if any row is already there

- Then on the MacBook, in `~/Projects/poppy-photoreal`, link each base photo to its account (or tell Claude "link the family photo-real looks"):

      .venv/bin/python tools/link_ref.py poppy <Poppy id>
      .venv/bin/python tools/link_ref.py penny <Penny id>
      .venv/bin/python tools/link_ref.py david <Dad id>

- Check: `.venv/bin/python -m studio.cli status` lists all three ids with their person label.
- Switch someone off: `delete from photoreal_children where user_id = '<id>';`. No new photos, and their runway photos come down for the squad.
