-- ============================================================
-- ti-lex-AL v10 — sql/zip_historique.sql
-- Table d'historique des fichiers créés par le générateur ZIP
-- À exécuter dans l'éditeur SQL Supabase (projet rnuripmfozlxenryxhdc)
-- ============================================================

-- ----------  Table  ----------
create table if not exists public.zip_historique (
  id            uuid        primary key default gen_random_uuid(),
  nom_fichier   text        not null,
  type_fichier  text        not null,
  contenu       text,
  date_creation timestamptz not null default now(),
  user_id       uuid        references auth.users (id) on delete cascade
);

-- ----------  Index sur la date de création (tri rapide du plus récent)  ----------
create index if not exists idx_zip_historique_date
  on public.zip_historique (date_creation desc);

-- Index secondaire sur user_id (filtrage RLS performant)
create index if not exists idx_zip_historique_user
  on public.zip_historique (user_id);

-- ----------  Row Level Security  ----------
alter table public.zip_historique enable row level security;

-- Lecture : chaque utilisateur voit uniquement ses propres entrées
drop policy if exists "zip_historique_select_own" on public.zip_historique;
create policy "zip_historique_select_own"
  on public.zip_historique
  for select
  using (auth.uid() = user_id);

-- Insertion : un utilisateur ne peut insérer que pour lui-même
drop policy if exists "zip_historique_insert_own" on public.zip_historique;
create policy "zip_historique_insert_own"
  on public.zip_historique
  for insert
  with check (auth.uid() = user_id);

-- Suppression : un utilisateur ne peut effacer que ses propres entrées
drop policy if exists "zip_historique_delete_own" on public.zip_historique;
create policy "zip_historique_delete_own"
  on public.zip_historique
  for delete
  using (auth.uid() = user_id);

-- ============================================================
-- Note : si tu veux autoriser les entrées anonymes (sans Auth),
-- remplace les policies ci-dessus par une policy ouverte, p. ex. :
--
--   create policy "zip_historique_public"
--     on public.zip_historique for all
--     using (true) with check (true);
--
-- ⚠️ À éviter en production — n'importe qui pourrait tout lire/effacer.
-- ============================================================
