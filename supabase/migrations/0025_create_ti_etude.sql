-- Migration 0025: Create ti_etude table (user learning profile)

create table if not exists public.ti_etude (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  style_ecriture text,
  langue_preferee text,
  interets jsonb default '[]'::jsonb,
  couleurs_preferees jsonb default '[]'::jsonb,
  theme_prefere text,
  notes_agent jsonb default '[]'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id)
);

alter table public.ti_etude enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'ti_etude' and policyname = 'user lit son etude') then
    create policy "user lit son etude" on public.ti_etude for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'ti_etude' and policyname = 'user modifie son etude') then
    create policy "user modifie son etude" on public.ti_etude for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;
