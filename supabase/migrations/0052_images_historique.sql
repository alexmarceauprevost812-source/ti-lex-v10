-- ============================================================
--  ti-lex-AL v10 — sql/images_historique.sql
--  OPTIONNEL. À exécuter seulement si tu veux garder un
--  historique des images par utilisateur (dépend de l'Auth).
--  RLS : chaque usager voit uniquement ses propres images.
-- ============================================================

create table if not exists public.images_historique (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  idee         text not null,           -- l'idée d'origine (joual)
  prompt       text,                    -- le prompt raffiné par Claude
  url_image    text,                    -- si stockage Supabase Storage
  taille       text default '1024x1024',
  qualite      text default 'medium',
  date_creation timestamptz not null default now()
);

-- Index pour les requêtes fréquentes
create index if not exists idx_images_user
  on public.images_historique (user_id);
create index if not exists idx_images_date
  on public.images_historique (date_creation desc);

-- Activer la sécurité au niveau des lignes
alter table public.images_historique enable row level security;

-- Politiques : un usager gère seulement ses propres lignes
drop policy if exists "images_select_propre" on public.images_historique;
create policy "images_select_propre"
  on public.images_historique for select
  using (auth.uid() = user_id);

drop policy if exists "images_insert_propre" on public.images_historique;
create policy "images_insert_propre"
  on public.images_historique for insert
  with check (auth.uid() = user_id);

drop policy if exists "images_delete_propre" on public.images_historique;
create policy "images_delete_propre"
  on public.images_historique for delete
  using (auth.uid() = user_id);
