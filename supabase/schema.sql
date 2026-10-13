-- Poppyseed Clothes: run once in the Supabase SQL editor.

create table if not exists items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name text not null default '',
  category text not null,
  colours text[] not null default '{}',
  pattern text not null default 'solid',
  warmth int not null default 3 check (warmth between 1 and 5),
  formality int not null default 3 check (formality between 1 and 5),
  seasons text[] not null default '{spring,summer,fall,winter}',
  brand text,
  notes text,
  status text not null default 'active' check (status in ('active','laundry','archived')),
  favourite boolean not null default false,
  tucked boolean not null default false,
  photo_path text not null,
  cutout_path text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table items enable row level security;

create policy "own items" on items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

insert into storage.buckets (id, name, public)
values ('closet', 'closet', false)
on conflict (id) do nothing;

create policy "own closet files" on storage.objects
  for all using (bucket_id = 'closet' and auth.uid()::text = (storage.foldername(name))[1])
  with check (bucket_id = 'closet' and auth.uid()::text = (storage.foldername(name))[1]);
