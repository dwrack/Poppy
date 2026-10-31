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

-- One closet piece each (photo paths are only text here).
insert into items (id, user_id, name, category, photo_path, cutout_path) values
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 'a top', 'top', 'a/p.jpg', 'a/c.png'),
  ('10000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000b', 'b top', 'top', 'b/p.jpg', 'b/c.png')
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
  assert (select count(*) from group_members) = 0, 'non-member sees no members';
  assert (select count(*) from stars_ledger) = 0, 'non-member sees no stars';
end $$;
reset role;

-- Fast-forward: looks lock, runway plays (reveal).
update rounds set closes_at = now(), reveal_at = now(), voting_ends_at = now() + interval '12 hours'
  where id = current_setting('smoke.r')::uuid;
select advance_rounds();
do $$ begin assert (select status from rounds where id = current_setting('smoke.r')::uuid) = 'reveal', 'round should be in reveal'; end $$;
select set_config('smoke.ea', (select id::text from entries where round_id = current_setting('smoke.r')::uuid and user_id = '00000000-0000-0000-0000-00000000000a'), false);
select set_config('smoke.eb', (select id::text from entries where round_id = current_setting('smoke.r')::uuid and user_id = '00000000-0000-0000-0000-00000000000b'), false);

-- Votes. a: self-vote must be rejected by RLS, vote on b's look allowed.
select pg_temp.act_as('a');
set role authenticated;
do $$ declare r uuid := current_setting('smoke.r')::uuid;
           ea uuid := current_setting('smoke.ea')::uuid; eb uuid := current_setting('smoke.eb')::uuid; begin
  assert (select count(*) from entries where round_id = r) = 2, 'after reveal both entries visible';
  assert (select count(*) from round_entry_cards(r)) = 2, 'after reveal both cards visible';
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
