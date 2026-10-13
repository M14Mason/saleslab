-- SalesLab schema. Run in Supabase SQL editor (or `supabase db push`).

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  difficulty text not null check (difficulty in ('easy','medium','hard')),
  status text not null default 'active' check (status in ('active','ended','coaching','coached')),
  outcome text check (outcome in ('deal','no_deal','incomplete')),
  score int check (score between 0 and 100),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  duration_sec int
);
create index if not exists sessions_user_idx on public.sessions(user_id, started_at desc);

create table if not exists public.messages (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  idx int not null,
  role text not null check (role in ('seller','buyer')),
  text text not null,
  created_at timestamptz not null default now(),
  unique (session_id, idx)
);
create index if not exists messages_user_day_idx on public.messages(user_id, created_at);

create table if not exists public.reports (
  session_id uuid primary key references public.sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  report jsonb not null,
  model text not null,
  created_at timestamptz not null default now()
);

alter table public.sessions enable row level security;
alter table public.messages enable row level security;
alter table public.reports enable row level security;

-- Sessions: users can create, read, end, and delete their own.
create policy "own sessions select" on public.sessions for select using (auth.uid() = user_id);
create policy "own sessions insert" on public.sessions for insert with check (auth.uid() = user_id and status = 'active');
create policy "own sessions update" on public.sessions for update using (auth.uid() = user_id and status in ('active','ended'))
  with check (auth.uid() = user_id and status in ('active','ended'));
create policy "own sessions delete" on public.sessions for delete using (auth.uid() = user_id);

-- Messages and reports: read-only for users. Only the backend (service role) writes them.
create policy "own messages select" on public.messages for select using (auth.uid() = user_id);
create policy "own reports select" on public.reports for select using (auth.uid() = user_id);

-- Users can't write score/outcome themselves (only status/ended_at/duration through the update policy).
revoke update on public.sessions from authenticated;
grant update (status, ended_at, duration_sec) on public.sessions to authenticated;

-- Account deletion: deletes the auth user, which cascades to all their data.
create or replace function public.delete_my_account() returns void
language sql security definer set search_path = public as $$
  delete from auth.users where id = auth.uid();
$$;
revoke all on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to authenticated;
