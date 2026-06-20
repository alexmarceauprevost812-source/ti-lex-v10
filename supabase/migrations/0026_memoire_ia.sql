-- Migration 0026: Create memoire_ia + memoire_conversations tables

-- Fix colonnes profiles (GitHub) si manquantes
alter table if exists public.profiles
  add column if not exists github_username text,
  add column if not exists github_connected_at timestamptz;

-- Table mémoire IA principale
create table if not exists public.memoire_ia (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  categorie text not null check (categorie in (
    'identite','preference','projet','habitude','contexte','fait','erreur_recente','succes'
  )),
  cle text not null,
  valeur text not null,
  contexte text,
  confiance float default 1.0,
  source text default 'conversation',
  cree_le timestamptz default now(),
  mis_a_jour_le timestamptz default now(),
  derniere_utilisation timestamptz default now(),
  nb_utilisations int default 1,
  unique(user_id, categorie, cle)
);

create index if not exists memoire_user_idx on public.memoire_ia(user_id);
create index if not exists memoire_categorie_idx on public.memoire_ia(user_id, categorie);

alter table public.memoire_ia enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'memoire_ia' and policyname = 'memoire_own_all') then
    create policy "memoire_own_all" on public.memoire_ia for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;

-- Table résumés de conversations mémorisés
create table if not exists public.memoire_conversations (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  conversation_id uuid,
  agent text default 'agent-al',
  resume text not null,
  faits_extraits jsonb default '[]',
  mots_cles text[],
  cree_le timestamptz default now()
);

alter table public.memoire_conversations enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'memoire_conversations' and policyname = 'memconv_own_all') then
    create policy "memconv_own_all" on public.memoire_conversations for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;
