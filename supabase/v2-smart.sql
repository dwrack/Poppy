-- Poppyseed Clothes 2.0: smart tagging fields and photos of you. Safe to rerun.
alter table items add column if not exists fabric text;
alter table items add column if not exists fit text;
alter table items add column if not exists feel text;
alter table items add column if not exists links jsonb not null default '[]';

-- Photos of yourself for the avatar: front, left, right, full-length.
create table if not exists me_photos (
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  slot text not null check (slot in ('front','left','right','full')),
  path text not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, slot)
);
alter table me_photos enable row level security;
drop policy if exists "own me photos" on me_photos;
create policy "own me photos" on me_photos for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
