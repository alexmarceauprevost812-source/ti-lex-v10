-- Table memoire_sessions — contexte cross-session par utilisateur
create table if not exists public.memoire_sessions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  session_key text not null,
  contexte jsonb not null default '{}',
  resume text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(user_id, session_key)
);

create index if not exists idx_memoire_sessions_user on public.memoire_sessions(user_id, updated_at desc);

alter table public.memoire_sessions enable row level security;

create policy "memoire_sessions_own" on public.memoire_sessions
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
