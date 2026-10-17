-- Poppyseed Clothes 2.0: friend groups, invites, borrowing.
-- Safe to run more than once. Only adds things; version 1 tables and
-- policies are left exactly as they were.

-- Groups ---------------------------------------------------------------
create table if not exists groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists group_members (
  group_id uuid not null references groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  emoji text not null default '🌸',
  role text not null default 'member' check (role in ('owner','member')),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create table if not exists invites (
  code text primary key,
  group_id uuid not null references groups(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade default auth.uid(),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days',
  used_by uuid references auth.users(id) on delete set null,
  used_at timestamptz
);

-- Borrowing real clothes between friends.
create table if not exists borrow_requests (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references items(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  borrower_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  status text not null default 'requested'
    check (status in ('requested','approved','declined','out','returned','cancelled')),
  needed_on date,
  due_on date,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table groups enable row level security;
alter table group_members enable row level security;
alter table invites enable row level security;
alter table borrow_requests enable row level security;

-- Helpers (security definer so policies don't recurse) ------------------
create or replace function is_member(g uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from group_members where group_id = g and user_id = auth.uid())
$$;

create or replace function is_group_mate(other uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select other = auth.uid() or exists (
    select 1 from group_members a join group_members b on a.group_id = b.group_id
    where a.user_id = auth.uid() and b.user_id = other)
$$;

create or replace function item_owned_by(item uuid, owner uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from items where id = item and user_id = owner)
$$;

-- Policies ---------------------------------------------------------------
drop policy if exists "members see group" on groups;
create policy "members see group" on groups for select using (is_member(id));
drop policy if exists "owner renames group" on groups;
create policy "owner renames group" on groups for update using (owner_id = auth.uid());

drop policy if exists "members see members" on group_members;
create policy "members see members" on group_members for select using (is_member(group_id));
drop policy if exists "edit own member card" on group_members;
create policy "edit own member card" on group_members for update using (user_id = auth.uid());
drop policy if exists "leave group" on group_members;
create policy "leave group" on group_members for delete using (user_id = auth.uid());

drop policy if exists "members see invites" on invites;
create policy "members see invites" on invites for select using (is_member(group_id));

drop policy if exists "borrow parties see request" on borrow_requests;
create policy "borrow parties see request" on borrow_requests for select
  using (auth.uid() in (owner_id, borrower_id));
drop policy if exists "ask to borrow" on borrow_requests;
create policy "ask to borrow" on borrow_requests for insert
  with check (borrower_id = auth.uid() and owner_id <> auth.uid() and is_group_mate(owner_id)
    and item_owned_by(item_id, owner_id));
drop policy if exists "borrow parties update" on borrow_requests;
create policy "borrow parties update" on borrow_requests for update
  using (auth.uid() in (owner_id, borrower_id));

-- Friends can see each other's closet photos. Version 1 only downloads
-- by exact path, so this read-only addition doesn't change it.
drop policy if exists "group mates see closet files" on storage.objects;
create policy "group mates see closet files" on storage.objects for select
  using (bucket_id = 'closet' and is_group_mate(((storage.foldername(name))[1])::uuid));

-- Functions the app calls ----------------------------------------------
-- Friends' closets come through this function instead of a policy on
-- `items`, so version 1's "fetch all my items" never sees friends' pieces.
create or replace function friend_items(member uuid)
returns setof items language sql stable security definer set search_path = public as $$
  select * from items
  where user_id = member and status <> 'archived' and is_group_mate(member)
  order by created_at desc
$$;

create or replace function create_group(group_name text, my_name text, my_emoji text default '🌸')
returns uuid language plpgsql security definer set search_path = public as $$
declare g uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  insert into groups (name, owner_id) values (group_name, auth.uid()) returning id into g;
  insert into group_members (group_id, user_id, display_name, emoji, role)
    values (g, auth.uid(), my_name, my_emoji, 'owner');
  return g;
end $$;

create or replace function make_invite(g uuid) returns text
language plpgsql security definer set search_path = public as $$
declare c text;
begin
  if not is_member(g) then raise exception 'Not in this group'; end if;
  c := upper(substr(translate(encode(extensions.gen_random_bytes(8), 'base64'), '+/=0O1Il', ''), 1, 6));
  insert into invites (code, group_id, created_by) values (c, g, auth.uid());
  return c;
end $$;

create or replace function join_group(invite_code text, my_name text, my_emoji text default '🌸')
returns uuid language plpgsql security definer set search_path = public as $$
declare inv invites;
begin
  select * into inv from invites where code = upper(trim(invite_code))
    and used_by is null and expires_at > now() for update;
  if inv is null then raise exception 'That invite code is not valid or was already used'; end if;
  insert into group_members (group_id, user_id, display_name, emoji)
    values (inv.group_id, auth.uid(), my_name, my_emoji) on conflict do nothing;
  update invites set used_by = auth.uid(), used_at = now() where code = inv.code;
  return inv.group_id;
end $$;

-- Invite-only sign-up ---------------------------------------------------
-- New accounts must carry a valid, unused invite code in their sign-up
-- data. Accounts that already exist are unaffected.
create or replace function require_invite() returns trigger
language plpgsql security definer set search_path = public as $$
declare c text := upper(trim(coalesce(new.raw_user_meta_data->>'invite_code', '')));
begin
  -- Admin-only escape hatch: only a direct database session can set this,
  -- never the app or the sign-up form.
  if current_setting('poppy.bootstrap', true) = 'on' then return new; end if;
  if not exists (select 1 from invites where code = c and used_by is null and expires_at > now()) then
    raise exception 'Poppyseed is invite only. Ask a friend for an invite code.';
  end if;
  return new;
end $$;

create or replace function use_invite_on_signup() returns trigger
language plpgsql security definer set search_path = public as $$
declare c text := upper(trim(coalesce(new.raw_user_meta_data->>'invite_code', '')));
        inv invites;
        nm text := coalesce(nullif(new.raw_user_meta_data->>'display_name', ''), split_part(new.email, '@', 1));
begin
  select * into inv from invites where code = c for update;
  if found then
    insert into group_members (group_id, user_id, display_name) values (inv.group_id, new.id, nm)
      on conflict do nothing;
    update invites set used_by = new.id, used_at = now() where code = c;
  end if;
  return new;
end $$;

drop trigger if exists require_invite on auth.users;
create trigger require_invite before insert on auth.users
  for each row execute function require_invite();
drop trigger if exists use_invite_on_signup on auth.users;
create trigger use_invite_on_signup after insert on auth.users
  for each row execute function use_invite_on_signup();

-- Live updates for the app.
do $$ begin
  begin alter publication supabase_realtime add table borrow_requests; exception when others then null; end;
  begin alter publication supabase_realtime add table group_members; exception when others then null; end;
end $$;
