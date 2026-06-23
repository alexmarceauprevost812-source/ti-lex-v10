-- tilex_memory — mémoire persistante par utilisateur
create table if not exists public.tilex_memory (
  id uuid default gen_random_uuid() primary key,
  user_email text not null,
  cle text not null,
  valeur text not null,
  contexte text,
  created_at timestamptz default now()
);

create index if not exists idx_memory_user on public.tilex_memory(user_email);

alter table public.tilex_memory enable row level security;

drop policy if exists "memory_own_read" on public.tilex_memory;
create policy "memory_own_read" on public.tilex_memory
  for select to authenticated
  using (user_email = (select email from auth.users where id = auth.uid()));

drop policy if exists "memory_own_insert" on public.tilex_memory;
create policy "memory_own_insert" on public.tilex_memory
  for insert to authenticated
  with check (user_email = (select email from auth.users where id = auth.uid()));

drop policy if exists "memory_own_update" on public.tilex_memory;
create policy "memory_own_update" on public.tilex_memory
  for update to authenticated
  using (user_email = (select email from auth.users where id = auth.uid()));

drop policy if exists "memory_own_delete" on public.tilex_memory;
create policy "memory_own_delete" on public.tilex_memory
  for delete to authenticated
  using (user_email = (select email from auth.users where id = auth.uid()));
