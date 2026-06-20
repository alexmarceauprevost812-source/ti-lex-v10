-- Migration 0027: al_messages + al_memory_summary (persistent memory for Agent AL)

-- Historique des messages AL
create table if not exists public.al_messages (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  session_id  uuid not null,
  role        text not null check (role in ('user', 'assistant')),
  content     text not null,
  created_at  timestamptz not null default now()
);

create index if not exists al_messages_user_created_idx
  on public.al_messages (user_id, created_at desc);

create index if not exists al_messages_session_idx
  on public.al_messages (session_id, created_at);

-- Résumés hebdomadaires
create table if not exists public.al_memory_summary (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  summary       text not null,
  period_start  timestamptz not null,
  period_end    timestamptz not null,
  created_at    timestamptz not null default now()
);

create index if not exists al_memory_summary_user_idx
  on public.al_memory_summary (user_id, created_at desc);

-- RLS
alter table public.al_messages enable row level security;
alter table public.al_memory_summary enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'al_messages' and policyname = 'al_messages_select_own') then
    create policy "al_messages_select_own" on public.al_messages for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'al_messages' and policyname = 'al_messages_insert_own') then
    create policy "al_messages_insert_own" on public.al_messages for insert with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'al_messages' and policyname = 'al_messages_delete_own') then
    create policy "al_messages_delete_own" on public.al_messages for delete using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'al_memory_summary' and policyname = 'al_summary_select_own') then
    create policy "al_summary_select_own" on public.al_memory_summary for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'al_memory_summary' and policyname = 'al_summary_insert_own') then
    create policy "al_summary_insert_own" on public.al_memory_summary for insert with check (auth.uid() = user_id);
  end if;
end $$;
