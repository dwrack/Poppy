-- Functional smoke test for the v3..v7 game loop on a local postgres with
-- supabase/test/stubs.sql applied. Run by supabase/test/local-chain.sh.
-- Acts as users through request.jwt.claim.sub + `set role authenticated`
-- so RLS is enforced. Every check is an assert; psql stops on the first failure.
-- Ids travel between statements as session settings (smoke.*) because psql
-- variables are not expanded inside DO blocks.
\set ON_ERROR_STOP on
\set QUIET on
\pset tuples_only on

-- Users: a (owner), b (member), c (outsider). a and c come in through the
-- admin bootstrap flag; b signs up with a real invite code so the v2 signup
-- triggers run.
set poppy.bootstrap = 'on';
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@test'),
  ('00000000-0000-0000-0000-00000000000c', 'c@test')
on conflict do nothing;
reset poppy.bootstrap;

create or replace function pg_temp.act_as(u text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000' || u, false) $$;

select pg_temp.act_as('a');
set role authenticated;
select set_config('smoke.g', create_group('Smoke Squad', 'Poppy')::text, false);
select set_config('smoke.code', make_invite(current_setting('smoke.g')::uuid), false);
reset role;
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000b', 'b@test',
   jsonb_build_object('invite_code', current_setting('smoke.code'), 'display_name', 'Bea'));
do $$ declare g uuid := current_setting('smoke.g')::uuid; begin
  assert (select count(*) from group_members where group_id = g) = 2, 'invite signup joined b to the squad';
  begin
    insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000000d', 'd@test');
    raise exception 'signup without invite was accepted';
  exception when raise_exception then
    if sqlerrm not like 'Poppyseed is invite only%' then raise; end if;
  end;
end $$;

-- One closet piece each (photo paths are only text here), plus a second
-- piece of a's that she puts on later (v8: a changed look). Colours and a
-- pattern on a's piece, and avatar presets for a, so the v4b avatar cards
-- have something to carry.
insert into items (id, user_id, name, category, photo_path, cutout_path, colours, pattern) values
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 'a top', 'top', 'a/p.jpg', 'a/c.png', '{red,black}', 'stripe'),
  ('10000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000b', 'b top', 'top', 'b/p.jpg', 'b/c.png', '{blue}', 'solid'),
  ('10000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-00000000000a', 'a skirt', 'bottom', 'a/p2.jpg', 'a/c2.png', '{denim}', 'solid')
on conflict do nothing;
insert into avatar_presets (user_id, face, skin, hair, hair_colour, eyes) values
  ('00000000-0000-0000-0000-00000000000a', 'sunny', 'tan', 'bob', 'pink', 'green')
on conflict do nothing;

-- Owner starts a round now and enters.
select pg_temp.act_as('a');
set role authenticated;
select set_config('smoke.r', start_round_now(current_setting('smoke.g')::uuid)::text, false);
do $$ declare r uuid := current_setting('smoke.r')::uuid; begin
  assert (select status from rounds where id = r) = 'open', 'round should be open';
  assert (select theme from rounds where id = r) is not null, 'theme assigned at open';
  assert (select season_no from rounds where id = r) = 1, 'season_no stamped 1';
  assert (select round_no from rounds where id = r) = 1, 'round_no stamped 1';
  insert into entries (round_id, outfit) values (r, '{"items":["10000000-0000-0000-0000-00000000000a"],"borrowed":[]}');
end $$;
reset role;

-- b enters, and before the reveal sees only her own entry.
select pg_temp.act_as('b');
set role authenticated;
do $$ declare r uuid := current_setting('smoke.r')::uuid; begin
  insert into entries (round_id, outfit) values (r, '{"items":["10000000-0000-0000-0000-00000000000b"],"borrowed":[]}');
  assert (select count(*) from entries where round_id = r) = 1, 'hidden until reveal: b sees only her own entry';
  assert (select count(*) from round_entry_cards(r)) = 1, 'hidden until reveal: round_entry_cards shows only own';
  assert (select count(*) from round_entry_cards_v2(r)) = 1
     and (select user_id from round_entry_cards_v2(r)) = auth.uid(), 'hidden until reveal: v2 avatar cards show only own';
  assert (select count(*) from round_submitted(r)) = 2, 'who is in shows both names';
  -- b cannot wear a's piece without a borrow approval.
  begin
    update entries set outfit = '{"items":["10000000-0000-0000-0000-00000000000a"],"borrowed":[]}'
      where round_id = r and user_id = auth.uid();
    raise exception 'outfit check failed: b wore a piece that is not hers';
  exception when insufficient_privilege then null; -- expected RLS rejection
  end;
end $$;
reset role;

-- Outsider c sees nothing.
select pg_temp.act_as('c');
set role authenticated;
do $$ declare r uuid := current_setting('smoke.r')::uuid; begin
  assert (select count(*) from rounds) = 0, 'non-member sees no rounds';
  assert (select count(*) from entries) = 0, 'non-member sees no entries';
  assert (select count(*) from round_entry_cards(r)) = 0, 'non-member gets no cards';
  assert (select count(*) from round_entry_cards_v2(r)) = 0, 'non-member gets no v2 cards';
  assert (select count(*) from group_members) = 0, 'non-member sees no members';
  assert (select count(*) from stars_ledger) = 0, 'non-member sees no stars';
end $$;
reset role;

-- v8 photo-real jobs, while the round is still open.
select set_config('smoke.eb0', (select id::text from entries where round_id = current_setting('smoke.r')::uuid and user_id = '00000000-0000-0000-0000-00000000000b'), false);
select pg_temp.act_as('a');
set role authenticated;
do $$ declare j1 uuid; j2 uuid; je uuid; ea uuid; r uuid := current_setting('smoke.r')::uuid; begin
  -- a phone that sends worker fields gets them overwritten
  insert into photo_jobs (kind, item_ids, status, result_path, attempts, worker, error, user_id)
    values ('dressme', '{10000000-0000-0000-0000-00000000000a}', 'done', 'x/forged.jpg', 9, 'phone', 'none', '00000000-0000-0000-0000-00000000000b')
    returning id into j1;
  assert (select status from photo_jobs where id = j1) = 'queued', 'v8: status forced to queued';
  assert (select attempts = 0 and result_path is null and worker is null and error is null from photo_jobs where id = j1), 'v8: worker fields forced clean';
  assert (select user_id from photo_jobs where id = j1) = auth.uid(), 'v8: user_id forced to the caller';
  -- a second Dress me photo supersedes the first
  insert into photo_jobs (kind, item_ids) values ('dressme', '{10000000-0000-0000-0000-00000000000a}') returning id into j2;
  assert (select status from photo_jobs where id = j1) = 'rejected' and (select error from photo_jobs where id = j1) = 'superseded', 'v8: second dressme supersedes the first';
  assert (select status from photo_jobs where id = j2) = 'queued', 'v8: newest dressme stays queued';
  perform set_config('smoke.j2', j2::text, false);
  begin
    insert into photo_jobs (kind, item_ids) values ('dressme', '{10000000-0000-0000-0000-00000000000b}');
    raise exception 'v8: dressme with a friend''s piece was accepted';
  exception when raise_exception then
    if sqlerrm not like 'Some pieces%' then raise; end if;
  end;
  -- phones never move a job along or remove one
  begin
    update photo_jobs set status = 'done' where id = j2;
    raise exception 'v8: client update of a photo job was accepted';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from photo_jobs where id = j2;
    raise exception 'v8: client delete of a photo job was accepted';
  exception when insufficient_privilege then null;
  end;
  assert (select status from photo_jobs where id = j2) = 'queued', 'v8: status untouched by the client';
  -- her runway look: the round comes from the entry, whatever the phone said
  select id into ea from entries where round_id = r and user_id = auth.uid();
  insert into photo_jobs (kind, entry_id, round_id, item_ids) values ('entry', ea, gen_random_uuid(), '{10000000-0000-0000-0000-00000000000a}') returning id into je;
  assert (select round_id from photo_jobs where id = je) = r, 'v8: entry job round copied from the entry';
  perform set_config('smoke.je', je::text, false);
  begin
    insert into photo_jobs (kind, entry_id, item_ids) values ('entry', current_setting('smoke.eb0')::uuid, '{10000000-0000-0000-0000-00000000000b}');
    raise exception 'v8: entry job on someone else''s look was accepted';
  exception when raise_exception then
    if sqlerrm not like 'That runway look is not yours%' then raise; end if;
  end;
  begin
    insert into photo_jobs (kind, entry_id, item_ids) values ('entry', ea, '{10000000-0000-0000-0000-00000000000b}');
    raise exception 'v8: entry job with a piece outside the look was accepted';
  exception when raise_exception then
    if sqlerrm not like 'Those pieces are not in that look%' then raise; end if;
  end;
  -- the studio heartbeat is read-only, and phones cannot write renders
  assert (select count(*) from studio_status) = 0, 'v8: studio_status readable (empty until the worker checks in)';
  begin
    insert into studio_status (id, last_seen_at) values (1, now());
    raise exception 'v8: client wrote the studio heartbeat';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into storage.objects (bucket_id, name) values ('photoreal', auth.uid()::text || '/fake.jpg');
    raise exception 'v8: client uploaded to photoreal';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- The worker (service role) renders both photos and uploads them; they wait for parent review.
update photo_jobs set status = 'review', result_path = user_id::text || '/' || id::text || '.jpg', finished_at = now(), worker = 'smoke'
  where id in (current_setting('smoke.je')::uuid, current_setting('smoke.j2')::uuid);
insert into storage.objects (bucket_id, name) select 'photoreal', result_path from photo_jobs where id in (current_setting('smoke.je')::uuid, current_setting('smoke.j2')::uuid);
select set_config('smoke.jpath', (select result_path from photo_jobs where id = current_setting('smoke.je')::uuid), false);
select set_config('smoke.dpath', (select result_path from photo_jobs where id = current_setting('smoke.j2')::uuid), false);
do $$ begin assert (select public from storage.buckets where id = 'photoreal') = false, 'v8: photoreal bucket is private'; end $$;

-- In review her own job row already carries the path; the bucket still says no until the parent says yes.
select pg_temp.act_as('a');
set role authenticated;
do $$ begin
  assert (select result_path from photo_jobs where id = current_setting('smoke.je')::uuid) = current_setting('smoke.jpath'), 'v8: in review, her job row carries the path';
  assert not own_photo_ready(current_setting('smoke.jpath')), 'v8: in review, own_photo_ready says no';
  assert (select count(*) from storage.objects where bucket_id = 'photoreal') = 0, 'v8: in review, not even she can open her renders';
end $$;
reset role;

-- The parent approves both.
update photo_jobs set status = 'done' where id in (current_setting('smoke.je')::uuid, current_setting('smoke.j2')::uuid);
update entries set photo_job_id = current_setting('smoke.je')::uuid where id = (select entry_id from photo_jobs where id = current_setting('smoke.je')::uuid);

-- Before the reveal a squad mate sees none of it; the owner sees her own.
select pg_temp.act_as('b');
set role authenticated;
do $$ begin
  assert (select count(*) from photo_jobs) = 0, 'v8: before the reveal b sees none of a''s photo jobs';
  assert not can_see_photo(current_setting('smoke.jpath')), 'v8: before the reveal b cannot open a''s runway photo';
  assert (select count(*) from storage.objects where bucket_id = 'photoreal') = 0, 'v8: before the reveal b reads no photoreal files';
end $$;
reset role;
select pg_temp.act_as('a');
set role authenticated;
do $$ declare r uuid := current_setting('smoke.r')::uuid; begin
  assert (select count(*) from photo_jobs) = 3, 'v8: a sees all three of her jobs';
  assert (select count(*) from storage.objects where bucket_id = 'photoreal') = 2, 'v8: a reads her own photoreal files';
  assert (select photo_path from round_entry_cards_v2(r) where user_id = auth.uid()) = current_setting('smoke.jpath'), 'v8: own card carries her photo before the reveal';
end $$;
reset role;

-- Fast-forward: looks lock, runway plays (reveal).
update rounds set closes_at = now(), reveal_at = now(), voting_ends_at = now() + interval '12 hours'
  where id = current_setting('smoke.r')::uuid;
select advance_rounds();
do $$ begin assert (select status from rounds where id = current_setting('smoke.r')::uuid) = 'reveal', 'round should be in reveal'; end $$;
select set_config('smoke.ea', (select id::text from entries where round_id = current_setting('smoke.r')::uuid and user_id = '00000000-0000-0000-0000-00000000000a'), false);
select set_config('smoke.eb', (select id::text from entries where round_id = current_setting('smoke.r')::uuid and user_id = '00000000-0000-0000-0000-00000000000b'), false);

-- v8: from the reveal on, a squad mate sees the runway photo (never the Dress me one); an outsider never does.
select pg_temp.act_as('b');
set role authenticated;
do $$ declare r uuid := current_setting('smoke.r')::uuid; begin
  assert (select count(*) from photo_jobs) = 1 and (select id from photo_jobs) = current_setting('smoke.je')::uuid, 'v8: after the reveal b sees only a''s done runway job';
  assert can_see_photo(current_setting('smoke.jpath')), 'v8: after the reveal b can open a''s runway photo';
  assert not can_see_photo(current_setting('smoke.dpath')), 'v8: b never opens a''s Dress me photo';
  assert (select count(*) from storage.objects where bucket_id = 'photoreal') = 1, 'v8: b reads exactly the runway photo file';
  assert (select photo_path from round_entry_cards_v2(r) where user_id = '00000000-0000-0000-0000-00000000000a') = current_setting('smoke.jpath'), 'v8: v2 card carries a''s photo_path';
  assert (select photo_path from round_entry_cards_v2(r) where user_id = auth.uid()) is null, 'v8: no photo, no photo_path';
end $$;
reset role;
select pg_temp.act_as('c');
set role authenticated;
do $$ begin
  assert (select count(*) from photo_jobs) = 0, 'v8: outsider sees no photo jobs';
  assert not can_see_photo(current_setting('smoke.jpath')), 'v8: outsider cannot open the runway photo';
  assert (select count(*) from storage.objects where bucket_id = 'photoreal') = 0, 'v8: outsider reads no photoreal files';
end $$;
reset role;
-- Asking again for the same look leaves its finished photo up meanwhile; then the newest done photo wins,
-- and it is the only one of that look the squad can open.
select pg_temp.act_as('a');
set role authenticated;
do $$ declare r uuid := current_setting('smoke.r')::uuid; ea uuid := current_setting('smoke.ea')::uuid; begin
  insert into photo_jobs (kind, entry_id, item_ids) values ('entry', ea, '{10000000-0000-0000-0000-00000000000a,10000000-0000-0000-0000-00000000000a}');
  assert (select item_ids from photo_jobs where entry_id = ea and status = 'queued') = '{10000000-0000-0000-0000-00000000000a}', 'v8: a piece asked twice is kept once';
  assert (select photo_path from round_entry_cards_v2(r) where user_id = auth.uid()) = current_setting('smoke.jpath'), 'v8: same look asked again: its finished photo stays up meanwhile';
end $$;
reset role;
update photo_jobs set status = 'done', result_path = user_id::text || '/' || id::text || '.jpg', finished_at = now()
  where entry_id = current_setting('smoke.ea')::uuid and status = 'queued';
select set_config('smoke.jpath2', (select result_path from photo_jobs where entry_id = current_setting('smoke.ea')::uuid order by created_at desc limit 1), false);
select pg_temp.act_as('b');
set role authenticated;
do $$ declare r uuid := current_setting('smoke.r')::uuid; begin
  assert (select photo_path from round_entry_cards_v2(r) where user_id = '00000000-0000-0000-0000-00000000000a') = current_setting('smoke.jpath2'), 'v8: the newest done photo wins';
  assert can_see_photo(current_setting('smoke.jpath2')) and not can_see_photo(current_setting('smoke.jpath')), 'v8: b opens only the photo the card shows';
  assert (select count(*) from photo_jobs) = 1, 'v8: b sees one runway job for the look';
end $$;
reset role;

-- Her look changes (a second piece of hers goes on). The old look's photo comes down at once, from her
-- card, the squad's job read and the bucket, whether or not a new photo was ever asked for.
update entries set outfit = '{"items":["10000000-0000-0000-0000-00000000000a","10000000-0000-0000-0000-0000000000a2"],"borrowed":[]}'
  where id = current_setting('smoke.ea')::uuid;
select pg_temp.act_as('b');
set role authenticated;
do $$ declare r uuid := current_setting('smoke.r')::uuid; begin
  assert (select photo_path from round_entry_cards_v2(r) where user_id = '00000000-0000-0000-0000-00000000000a') is null, 'v8: look changed: no photo of the old look on her card';
  assert not can_see_photo(current_setting('smoke.jpath2')), 'v8: look changed: b cannot open the old look''s photo';
  assert (select count(*) from photo_jobs) = 0, 'v8: look changed: b sees no runway job';
end $$;
reset role;
-- The new look's photo fails a safety check: the avatar, not the old look.
select pg_temp.act_as('a');
insert into photo_jobs (kind, entry_id, item_ids) values ('entry', current_setting('smoke.ea')::uuid, '{10000000-0000-0000-0000-00000000000a,10000000-0000-0000-0000-0000000000a2}');
update photo_jobs set status = 'rejected', error = 'face changed', finished_at = now()
  where entry_id = current_setting('smoke.ea')::uuid and status = 'queued';
select pg_temp.act_as('b');
set role authenticated;
do $$ declare r uuid := current_setting('smoke.r')::uuid; begin
  assert (select photo_path from round_entry_cards_v2(r) where user_id = '00000000-0000-0000-0000-00000000000a') is null, 'v8: new look rejected: the avatar, never the old look';
  assert not can_see_photo(current_setting('smoke.jpath2')), 'v8: new look rejected: the old look stays closed';
end $$;
reset role;
-- Asked again, it comes out fine and shows; then the parent rejects it after all: the avatar again, not the old look.
select pg_temp.act_as('a');
insert into photo_jobs (kind, entry_id, item_ids) values ('entry', current_setting('smoke.ea')::uuid, '{10000000-0000-0000-0000-00000000000a,10000000-0000-0000-0000-0000000000a2}');
update photo_jobs set status = 'done', result_path = user_id::text || '/' || id::text || '.jpg', finished_at = now()
  where entry_id = current_setting('smoke.ea')::uuid and status = 'queued';
select set_config('smoke.jpath3', (select result_path from photo_jobs where entry_id = current_setting('smoke.ea')::uuid and status = 'done' order by created_at desc limit 1), false);
select pg_temp.act_as('b');
set role authenticated;
do $$ declare r uuid := current_setting('smoke.r')::uuid; begin
  assert (select photo_path from round_entry_cards_v2(r) where user_id = '00000000-0000-0000-0000-00000000000a') = current_setting('smoke.jpath3'), 'v8: the new look''s photo shows';
  assert can_see_photo(current_setting('smoke.jpath3')), 'v8: b opens the new look''s photo';
end $$;
reset role;
update photo_jobs set status = 'rejected', error = 'parent rejected' where result_path = current_setting('smoke.jpath3');
select pg_temp.act_as('b');
set role authenticated;
do $$ declare r uuid := current_setting('smoke.r')::uuid; begin
  assert (select photo_path from round_entry_cards_v2(r) where user_id = '00000000-0000-0000-0000-00000000000a') is null, 'v8: parent rejected the photo on show: the avatar, not the old look';
  assert not can_see_photo(current_setting('smoke.jpath3')) and not can_see_photo(current_setting('smoke.jpath2')), 'v8: after the rejection b opens neither photo';
  assert (select count(*) from photo_jobs) = 0, 'v8: after the rejection b sees no runway job';
end $$;
reset role;

-- Borrowed pieces never go onto her photo: a lent piece is an image another account controls. Say b lent
-- a her top (as superuser here, standing in for an approved borrow).
update entries set outfit = '{"items":["10000000-0000-0000-0000-00000000000a","10000000-0000-0000-0000-0000000000a2","10000000-0000-0000-0000-00000000000b"],"borrowed":["10000000-0000-0000-0000-00000000000b"]}'
  where id = current_setting('smoke.ea')::uuid;
select pg_temp.act_as('a');
set role authenticated;
do $$ declare ea uuid := current_setting('smoke.ea')::uuid; begin
  begin
    insert into photo_jobs (kind, entry_id, item_ids) values ('entry', ea, '{10000000-0000-0000-0000-00000000000a,10000000-0000-0000-0000-0000000000a2,10000000-0000-0000-0000-00000000000b}');
    raise exception 'v8: entry job with a borrowed piece was accepted';
  exception when raise_exception then
    if sqlerrm not like 'Borrowed pieces stay out of the photo%' then raise; end if;
  end;
  -- her own two pieces are the whole photo of that look
  insert into photo_jobs (kind, entry_id, item_ids) values ('entry', ea, '{10000000-0000-0000-0000-00000000000a,10000000-0000-0000-0000-0000000000a2}');
end $$;
reset role;
update photo_jobs set status = 'done', result_path = user_id::text || '/' || id::text || '.jpg', finished_at = now()
  where entry_id = current_setting('smoke.ea')::uuid and status = 'queued';
select set_config('smoke.jpath4', (select result_path from photo_jobs where entry_id = current_setting('smoke.ea')::uuid and status = 'done' order by created_at desc limit 1), false);
select pg_temp.act_as('b');
set role authenticated;
do $$ declare r uuid := current_setting('smoke.r')::uuid; begin
  assert (select photo_path from round_entry_cards_v2(r) where user_id = '00000000-0000-0000-0000-00000000000a') = current_setting('smoke.jpath4'), 'v8: a look with a borrowed piece shows the photo of her own pieces';
  assert can_see_photo(current_setting('smoke.jpath4')), 'v8: b opens that photo';
end $$;
reset role;
update entries set outfit = '{"items":["10000000-0000-0000-0000-00000000000a","10000000-0000-0000-0000-0000000000a2"],"borrowed":[]}'
  where id = current_setting('smoke.ea')::uuid;

-- Votes. a: self-vote must be rejected by RLS, vote on b's look allowed.
select pg_temp.act_as('a');
set role authenticated;
do $$ declare r uuid := current_setting('smoke.r')::uuid;
           ea uuid := current_setting('smoke.ea')::uuid; eb uuid := current_setting('smoke.eb')::uuid; begin
  assert (select count(*) from entries where round_id = r) = 2, 'after reveal both entries visible';
  assert (select count(*) from round_entry_cards(r)) = 2, 'after reveal both cards visible';
  -- v4b: the avatar cards carry each piece's colours and pattern, the owner, and the entrant's presets.
  assert (select count(*) from round_entry_cards_v2(r)) = 2, 'after reveal both v2 cards visible';
  assert (select pieces->0->'colours' from round_entry_cards_v2(r) where user_id = '00000000-0000-0000-0000-00000000000a') = '["red","black"]'::jsonb, 'v2 piece colours';
  assert (select pieces->0->>'pattern' from round_entry_cards_v2(r) where user_id = '00000000-0000-0000-0000-00000000000a') = 'stripe', 'v2 piece pattern';
  assert (select pieces->0->>'owner' from round_entry_cards_v2(r) where user_id = '00000000-0000-0000-0000-00000000000b') = 'Bea', 'v2 piece owner name';
  assert (select avatar from round_entry_cards_v2(r) where user_id = '00000000-0000-0000-0000-00000000000a')
       = '{"face":"sunny","skin":"tan","hair":"bob","hair_colour":"pink","eyes":"green"}'::jsonb, 'v2 carries the entrant presets';
  assert (select avatar from round_entry_cards_v2(r) where user_id = '00000000-0000-0000-0000-00000000000b') is null, 'v2 avatar null when she has no presets';
  assert (select styled_by from round_entry_cards_v2(r) where entry_id = eb) is null, 'v2 styled_by null for a self-styled look';
  begin
    insert into votes (entry_id, stars, chip) values (ea, 5, 'fit');
    raise exception 'self-vote was accepted';
  exception when insufficient_privilege then null; -- expected
  end;
  insert into votes (entry_id, stars, chip) values (eb, 4, 'colour');
end $$;
reset role;

-- b votes on a's look; that is the last vote, so advance_rounds finishes it.
select pg_temp.act_as('b');
set role authenticated;
do $$ declare r uuid := current_setting('smoke.r')::uuid;
           ea uuid := current_setting('smoke.ea')::uuid; eb uuid := current_setting('smoke.eb')::uuid; begin
  insert into votes (entry_id, stars, chip) values (ea, 3, 'brave');
  assert (select count(*) from votes) = 1, 'a voter sees only her own vote';
  assert (select count(*) from round_results(r)) = 0, 'no results before done';
  perform advance_rounds();
  assert (select status from rounds where id = r) = 'done', 'round finished once every vote is in';
  assert (select count(*) from round_results(r)) = 2, 'results for both looks';
  assert (select total from round_results(r) where entry_id = eb) = 4, 'b total 4';
  assert (select count(*) from stars_ledger where round_id = r) >= 4, 'members see the squad ledger';
end $$;
reset role;

-- advance_rounds() queues a squad's next round in its first loop and finishes
-- rounds in its last, so the next upcoming round appears on the following
-- tick (the 5-minute cron, or the next Runway tab open). Tick once more.
select advance_rounds();

-- Ledger and season stamp (as superuser: all rows).
do $$ declare r uuid := current_setting('smoke.r')::uuid; g uuid := current_setting('smoke.g')::uuid; n int; begin
  select count(*) into n from stars_ledger where round_id = r;
  assert n >= 4, format('stars_ledger should have rows for the round, got %s', n);
  assert exists (select 1 from stars_ledger where round_id = r and reason = 'votes' and user_id = '00000000-0000-0000-0000-00000000000b' and amount = 4), 'b paid 4 for votes';
  assert exists (select 1 from stars_ledger where round_id = r and reason = 'voted' and user_id = '00000000-0000-0000-0000-00000000000a'), 'a paid for voting';
  assert exists (select 1 from stars_ledger where round_id = r and reason = 'finished' and user_id = '00000000-0000-0000-0000-00000000000a'), 'a paid for finishing';
  assert (select season_no from rounds where id = r) = 1 and (select round_no from rounds where id = r) = 1, 'season 1 round 1';
  assert (select count(*) from rounds where group_id = g and status = 'upcoming') = 1, 'next round queued as upcoming';
  assert (select round_winners(r)) = '00000000-0000-0000-0000-00000000000b', 'b won';
  assert (select rounds_done from squad_season where group_id = g) = 1, 'squad_season counts 1 done';
  raise notice 'ledger: %', (select string_agg(format('%s %s +%s', right(user_id::text, 1), reason, amount), ', ' order by user_id, reason) from stars_ledger where round_id = r);
end $$;

-- Winner picks next theme (v5 prop) and can see the ladder.
select pg_temp.act_as('b');
set role authenticated;
do $$ declare g uuid := current_setting('smoke.g')::uuid; up uuid; t uuid; begin
  assert can_pick_theme(g), 'winner can pick theme';
  select id into up from rounds where group_id = g and status = 'upcoming';
  select id into t from theme_options(g) limit 1;
  update rounds set theme_pick_id = t where id = up;
  assert (select theme_pick_id from rounds where id = up) = t, 'theme pick stored';
  assert (select count(*) from squad_ladder(g)) = 2, 'ladder lists both';
end $$;
reset role;
-- Loser cannot pick.
select pg_temp.act_as('a');
set role authenticated;
do $$ declare g uuid := current_setting('smoke.g')::uuid; up uuid; begin
  assert not can_pick_theme(g), 'loser cannot pick theme';
  select id into up from rounds where group_id = g and status = 'upcoming';
  update rounds set theme_veto_id = null where id = up; -- RLS: 0 rows touched, no error
  assert (select theme_pick_id from rounds where id = up) is not null, 'pick untouched by non-winner';
end $$;
reset role;
\pset tuples_only off
select 'SMOKE ASSERTS PASSED' as result;
