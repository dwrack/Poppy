-- Poppyseed Clothes 4.0, step 1: photo-real looks. The app asks for a
-- photo (Dress me, or automatically when a runway look is sent), the
-- studio Mac renders it and uploads it to a private bucket. Adds to
-- v3-game.sql and v4b-avatar-runway.sql: paste it AFTER v7 (it re-creates
-- round_entry_cards_v2() with the photo, and v4b would overwrite that).
-- Safe to run more than once. Nothing existing is dropped except
-- round_entry_cards_v2(), which it re-creates with the same columns.
--
-- =====================================================================
-- HOW TO TURN IT ON (David, about 3 minutes, in the Supabase dashboard
-- for project yrcddfehjjbtzwuotmym, signed in with Poppy's Gmail)
-- =====================================================================
-- 1. v3 through v7 must already be in (V3-PASTE-ORDER.md). Paste this
--    file LAST. If you ever paste v4b-avatar-runway.sql again, paste
--    this one again straight after it.
-- 2. SQL Editor (left sidebar) > New query. Paste this WHOLE file. Run.
--    You should see "Success. No rows returned". Idempotent.
-- 3. Check the bucket: Storage (left sidebar) should list "photoreal"
--    with a lock (private). If it is missing (the insert below is not
--    allowed on some projects), make it by hand: Storage > New bucket >
--    name photoreal, Public bucket OFF > Create. Then run this file again
--    so the access rules attach to it.
-- 4. The studio Mac's key, once: Project Settings > API > Project API
--    keys > service_role > Reveal > copy. On the MacBook, in Terminal:
--        mkdir -p ~/.config/poppy && pbpaste > ~/.config/poppy/service_key && chmod 600 ~/.config/poppy/service_key
--    That key can read and write everything, so it lives ONLY in that
--    file: never in the app, never in this repo, never in a vault, never
--    in a chat. The app keeps using the publishable key it already has.
-- 5. Check: `select * from studio_status;` shows one row a minute after
--    the worker starts. Until then the app says "Studio is offline, your
--    photo will arrive later." and jobs wait in the queue.
-- =====================================================================
--
-- The contract with the studio worker (~/Projects/poppy-photoreal):
--   photo_jobs     one row per requested photo. The app inserts kind,
--                  entry_id, item_ids (round_id is copied from the entry);
--                  a trigger forces everything else. The worker (service
--                  role) moves status queued > rendering > review > done
--                  (or failed / rejected), uploads to
--                  photoreal/<user_id>/<job_id>.jpg and sets result_path.
--                  Clients can never update or delete a job.
--   studio_status  one row (id 1), the worker's heartbeat. Older than 10
--                  minutes, or missing, means the studio is offline.
--   entries.photo_job_id  set by the worker when an entry job is done.
--                  The runway does not go by it: it shows
--                  entry_photo_job(entry), the newest done job whose
--                  pieces are the look as it stands.
--   photoreal      private bucket. You read your own photos once they
--                  are done (a render waiting for parent review is not
--                  readable, not even by you); a squad mate reads a
--                  runway photo once that round's reveal has started.
--                  Nobody but the worker writes.

-- Jobs -------------------------------------------------------------------
create table if not exists photo_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (kind in ('dressme','entry')),
  entry_id uuid references entries(id) on delete cascade,
  round_id uuid,
  item_ids uuid[] not null check (cardinality(item_ids) between 1 and 6),
  status text not null default 'queued'
    check (status in ('queued','rendering','review','done','failed','rejected')),
  result_path text,
  error text,
  attempts int not null default 0,
  worker text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  constraint photo_jobs_kind_entry check ((kind = 'entry') = (entry_id is not null))
);
create index if not exists photo_jobs_queue on photo_jobs (status, created_at);
create index if not exists photo_jobs_user on photo_jobs (user_id, created_at desc);
create index if not exists photo_jobs_entry on photo_jobs (entry_id, created_at desc);
create index if not exists photo_jobs_result on photo_jobs (result_path);
alter table photo_jobs enable row level security;

-- A new job always starts clean, whatever the phone sent. Runs as the
-- table owner so it can read entries/items past RLS.
create or replace function photo_jobs_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.user_id := coalesce(auth.uid(), new.user_id); -- the worker (no auth.uid()) never inserts, but keep it sane
  new.status := 'queued';
  new.attempts := 0;
  new.result_path := null;
  new.error := null;
  new.worker := null;
  new.created_at := now();
  new.started_at := null;
  new.finished_at := null;
  -- each piece once, in the order asked (entry_photo_job counts them)
  new.item_ids := array(select x from unnest(new.item_ids) with ordinality u(x, n) group by x order by min(n));
  if new.kind = 'entry' then
    -- your own runway look only, and the round comes from the entry
    select e.round_id into new.round_id from entries e where e.id = new.entry_id and e.user_id = new.user_id;
    if not found then raise exception 'That runway look is not yours'; end if;
    -- only pieces that are in that look (borrowed ones included)
    if exists (select 1 from unnest(new.item_ids) x(id)
               where not exists (select 1 from entries e, jsonb_array_elements_text(coalesce(e.outfit->'items', '[]'::jsonb)) o(id)
                                 where e.id = new.entry_id and o.id = x.id::text)) then
      raise exception 'Those pieces are not in that look';
    end if;
  else
    new.entry_id := null;
    new.round_id := null;
    -- Dress me: your own closet only (the worker fetches with the service key, so it must not be asked for anyone else's)
    if exists (select 1 from unnest(new.item_ids) x(id)
               where not exists (select 1 from items i where i.id = x.id and i.user_id = new.user_id)) then
      raise exception 'Some pieces are still uploading. Try again in a minute';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists photo_jobs_before_insert on photo_jobs;
create trigger photo_jobs_before_insert before insert on photo_jobs
  for each row execute function photo_jobs_before_insert();

-- Superseding: a newer request makes older ones that have not started
-- pointless. Same runway look, or any Dress me photo by the same player.
create or replace function photo_jobs_supersede() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update photo_jobs set status = 'rejected', error = 'superseded', finished_at = now()
  where user_id = new.user_id and id <> new.id and status = 'queued'
    and ((new.kind = 'entry' and entry_id = new.entry_id)
      or (new.kind = 'dressme' and kind = 'dressme'));
  return null;
end $$;
drop trigger if exists photo_jobs_supersede on photo_jobs;
create trigger photo_jobs_supersede after insert on photo_jobs
  for each row execute function photo_jobs_supersede();

-- The photo of a runway look as it stands: the newest done job for that
-- entry whose pieces are all still in the look and that covers as much of
-- it as one photo holds (every piece, or 6 when the look has more). A
-- render of a look she has since changed never stands in for the current
-- one, whether the newer job is still waiting, failed, was rejected, or
-- was never queued at all (an offline phone, an old build). The runway
-- cards, the squad's read of photo_jobs and the squad's read of the
-- bucket all go through this one rule.
create or replace function entry_photo_job(e uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select j.id
  from entries en
  cross join lateral (
    select array_agg(distinct x.id) as ids
    from jsonb_array_elements_text(coalesce(en.outfit->'items', '[]'::jsonb)) x(id)) look
  join photo_jobs j on j.entry_id = en.id
  where en.id = e and j.kind = 'entry' and j.status = 'done'
    and j.item_ids::text[] <@ look.ids
    and cardinality(j.item_ids) = least(6, cardinality(look.ids))
  order by j.created_at desc, j.id desc
  limit 1
$$;

-- Policies: owner inserts and reads; squad mates read the photo of a
-- runway look as it stands (entry_photo_job) once the round's reveal has
-- started; nobody but the worker (service role, which skips RLS) updates
-- or deletes.
drop policy if exists "ask for your own photo" on photo_jobs;
create policy "ask for your own photo" on photo_jobs for insert
  with check (user_id = auth.uid());
drop policy if exists "see your own photo jobs" on photo_jobs;
create policy "see your own photo jobs" on photo_jobs for select
  using (user_id = auth.uid());
drop policy if exists "squad sees runway photos after the reveal" on photo_jobs;
create policy "squad sees runway photos after the reveal" on photo_jobs for select
  using (status = 'done' and kind = 'entry' and round_id is not null and round_revealed(round_id)
         and id = entry_photo_job(entry_id));
revoke update, delete on photo_jobs from anon, authenticated;
revoke insert on photo_jobs from anon;

-- Studio heartbeat ---------------------------------------------------------
create table if not exists studio_status (
  id int primary key check (id = 1),
  last_seen_at timestamptz,
  worker text,
  queue_depth int
);
alter table studio_status enable row level security;
drop policy if exists "signed in sees the studio" on studio_status;
create policy "signed in sees the studio" on studio_status for select
  using (auth.uid() is not null);
revoke insert, update, delete on studio_status from anon, authenticated;

-- The runway look's photo ----------------------------------------------------
alter table entries add column if not exists photo_job_id uuid references photo_jobs(id) on delete set null;

-- Private bucket for the renders ---------------------------------------------
insert into storage.buckets (id, name, public)
values ('photoreal', 'photoreal', false)
on conflict (id) do update set public = false;

-- Can the signed-in player open this rendered photo? Only the photo of a
-- runway look as it stands (entry_photo_job: never a look she replaced),
-- and only once the round's reveal has started (which also means she is
-- in that squad).
create or replace function can_see_photo(name text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from photo_jobs j
    where j.result_path = name and j.status = 'done' and j.kind = 'entry'
      and j.round_id is not null and round_revealed(j.round_id)
      and j.id = entry_photo_job(j.entry_id))
$$;

-- Can the signed-in player open her own rendered photo? Only once it is
-- done. Her job row (and its Realtime feed) carries result_path from the
-- moment the worker uploads the render for parent review, so the bucket
-- itself has to say no until the parent says yes. The localhost review
-- page signs with the service key, which skips this.
create or replace function own_photo_ready(name text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from photo_jobs j
    where j.result_path = name and j.user_id = auth.uid() and j.status = 'done')
$$;

drop policy if exists "own photoreal photos" on storage.objects;
create policy "own photoreal photos" on storage.objects for select
  using (bucket_id = 'photoreal' and (storage.foldername(name))[1] = auth.uid()::text
         and own_photo_ready(name));
drop policy if exists "squad sees revealed photoreal photos" on storage.objects;
create policy "squad sees revealed photoreal photos" on storage.objects for select
  using (bucket_id = 'photoreal' and can_see_photo(name));
-- No insert/update/delete policies for photoreal: phones can never write
-- there. The worker uploads with the service role key.

-- Realtime: the app watches its own jobs move along.
do $$ begin
  begin alter publication supabase_realtime add table photo_jobs; exception when others then null; end;
end $$;

-- round_entry_cards_v2, as v4b defines it, except photo_path is now the
-- rendered photo of the look as it stands (entry_photo_job), so never a
-- look she has since changed. Same columns, same visibility (squad only;
-- another player's entry only from the reveal on). Phones on the old
-- build sign photo_path from the closet bucket, get nothing back and keep
-- showing the avatar.
drop function if exists round_entry_cards_v2(uuid);
create function round_entry_cards_v2(r uuid)
returns table (entry_id uuid, user_id uuid, display_name text, emoji text, outfit jsonb,
               photo_path text, submitted_at timestamptz, pieces jsonb, styled_by text, avatar jsonb)
language sql stable security definer set search_path = public as $$
  select e.id, e.user_id, m.display_name, m.emoji, e.outfit,
    (select j.result_path from photo_jobs j where j.id = entry_photo_job(e.id)),
    e.submitted_at,
    coalesce((
      select jsonb_agg(jsonb_build_object('id', i.id, 'name', i.name, 'category', i.category,
                                          'cutout_path', i.cutout_path, 'owner_id', i.user_id,
                                          'owner', gm.display_name,
                                          'colours', to_jsonb(i.colours), 'pattern', i.pattern) order by x.ord)
      from jsonb_array_elements_text(coalesce(e.outfit->'items', '[]'::jsonb)) with ordinality as x(id, ord)
      join items i on i.id::text = x.id
      join group_members gm on gm.group_id = ro.group_id and gm.user_id = i.user_id
    ), '[]'::jsonb),
    (select st.display_name from styled_looks s
       join group_members st on st.group_id = ro.group_id and st.user_id = s.from_user
     where s.id = e.styled_look_id),
    (select jsonb_build_object('face', a.face, 'skin', a.skin, 'hair', a.hair,
                               'hair_colour', a.hair_colour, 'eyes', a.eyes)
     from avatar_presets a where a.user_id = e.user_id)
  from entries e
  join rounds ro on ro.id = e.round_id
  join group_members m on m.group_id = ro.group_id and m.user_id = e.user_id
  where e.round_id = r and is_member(ro.group_id)
    and (e.user_id = auth.uid() or ro.status in ('reveal','voting','done'))
  order by e.submitted_at
$$;
