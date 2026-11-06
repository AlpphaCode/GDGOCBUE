-- Paste this into Supabase → SQL Editor → Run
create table if not exists public.submissions (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 100),
  topic text not null check (char_length(topic) between 2 and 300),
  created_at timestamptz not null default now()
);

-- Lock the table: no public access at all.
-- Only the server (using the secret key) can read/write it.
alter table public.submissions enable row level security;
