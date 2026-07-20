-- ============================================================================
-- tilex-schema.sql — Schéma de communication ti-lex v10
-- ----------------------------------------------------------------------------
-- Projet ti-lex-al : rnuripmfozlxenryxhdc
-- Produit du Québec · Saguenay–Lac-Saint-Jean
--
-- Tables pour la persistance des messages + suivi des appareils.
-- RLS activé partout dès le départ — pas de table ouverte au monde.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Table des messages
-- ----------------------------------------------------------------------------
create table if not exists public.tilex_messages (
  id            bigint generated always as identity primary key,
  msg_id        text not null unique,
  room          text not null,
  type          text not null default 'chat'
                  check (type in ('chat', 'sync', 'agent', 'signal', 'ping')),
  user_id       text,
  auth_uid      uuid default auth.uid(),       -- lie le message à l'usager authentifié
  nom           text,
  device        text,
  destinataire  text,                          -- null = broadcast au salon
  contenu       jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

-- Index pour charger l'historique rapidement
create index if not exists idx_tilex_messages_room_time
  on public.tilex_messages (room, created_at desc);

create index if not exists idx_tilex_messages_auth_uid
  on public.tilex_messages (auth_uid);

-- ----------------------------------------------------------------------------
-- 2. Table des appareils (suivi des sessions actives par usager)
-- ----------------------------------------------------------------------------
create table if not exists public.tilex_devices (
  id            bigint generated always as identity primary key,
  session_id    text not null unique,
  auth_uid      uuid default auth.uid(),
  user_id       text,
  nom           text,
  device_kind   text,                          -- mobile / tablette / ordinateur
  platform      text,
  last_seen     timestamptz not null default now(),
  created_at    timestamptz not null default now()
);

create index if not exists idx_tilex_devices_auth_uid
  on public.tilex_devices (auth_uid);

-- ----------------------------------------------------------------------------
-- 3. Table des abonnements push (pour les notifications web)
-- ----------------------------------------------------------------------------
create table if not exists public.tilex_push_subs (
  id            bigint generated always as identity primary key,
  auth_uid      uuid not null default auth.uid(),
  endpoint      text not null unique,
  p256dh        text not null,
  auth_key      text not null,
  device_kind   text,
  created_at    timestamptz not null default now()
);

create index if not exists idx_tilex_push_subs_auth_uid
  on public.tilex_push_subs (auth_uid);

-- ============================================================================
-- ACTIVATION DE RLS — obligatoire sur toutes les tables
-- ============================================================================
alter table public.tilex_messages  enable row level security;
alter table public.tilex_devices   enable row level security;
alter table public.tilex_push_subs enable row level security;

-- ----------------------------------------------------------------------------
-- POLITIQUES — tilex_messages
-- ----------------------------------------------------------------------------

-- Lecture : salon PRIVÉ par usager — chaque personne ne lit QUE ses propres
-- messages (synchro entre ses appareils mobile ↔ ordinateur). Ferme la fuite :
-- avec un salon global partagé (using(true)), n'importe quel usager connecté
-- pouvait lire les messages ET les auth_uid des autres via l'endpoint REST.
-- On DROP aussi l'ancien nom au cas où il traînerait (les policies s'additionnent
-- en OR : une seule policy using(true) rouvrirait tout).
drop policy if exists "lecture_messages_authentifies" on public.tilex_messages;
drop policy if exists "lecture_messages_proprietaire" on public.tilex_messages;
create policy "lecture_messages_proprietaire"
  on public.tilex_messages
  for select
  to authenticated
  using (auth.uid() = auth_uid);

-- Écriture : un usager ne peut insérer QUE des messages signés de son propre uid.
-- C'est ça qui ferme le trou : impossible d'écrire au nom d'un autre.
drop policy if exists "ecriture_messages_proprietaire" on public.tilex_messages;
create policy "ecriture_messages_proprietaire"
  on public.tilex_messages
  for insert
  to authenticated
  with check (auth.uid() = auth_uid);

-- Suppression : seulement ses propres messages.
drop policy if exists "suppression_messages_proprietaire" on public.tilex_messages;
create policy "suppression_messages_proprietaire"
  on public.tilex_messages
  for delete
  to authenticated
  using (auth.uid() = auth_uid);

-- ----------------------------------------------------------------------------
-- POLITIQUES — tilex_devices
-- ----------------------------------------------------------------------------

-- Un usager voit seulement ses propres appareils.
drop policy if exists "lecture_appareils_proprietaire" on public.tilex_devices;
create policy "lecture_appareils_proprietaire"
  on public.tilex_devices
  for select
  to authenticated
  using (auth.uid() = auth_uid);

drop policy if exists "upsert_appareils_proprietaire" on public.tilex_devices;
create policy "upsert_appareils_proprietaire"
  on public.tilex_devices
  for insert
  to authenticated
  with check (auth.uid() = auth_uid);

drop policy if exists "maj_appareils_proprietaire" on public.tilex_devices;
create policy "maj_appareils_proprietaire"
  on public.tilex_devices
  for update
  to authenticated
  using (auth.uid() = auth_uid)
  with check (auth.uid() = auth_uid);

drop policy if exists "suppression_appareils_proprietaire" on public.tilex_devices;
create policy "suppression_appareils_proprietaire"
  on public.tilex_devices
  for delete
  to authenticated
  using (auth.uid() = auth_uid);

-- ----------------------------------------------------------------------------
-- POLITIQUES — tilex_push_subs
-- ----------------------------------------------------------------------------
drop policy if exists "gestion_push_proprietaire" on public.tilex_push_subs;
create policy "gestion_push_proprietaire"
  on public.tilex_push_subs
  for all
  to authenticated
  using (auth.uid() = auth_uid)
  with check (auth.uid() = auth_uid);

-- ============================================================================
-- REALTIME — expose les tables au canal Realtime de Supabase
-- ============================================================================
-- Ajoute la table des messages à la publication Realtime pour recevoir
-- les INSERT en direct (en plus du broadcast géré côté client).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'tilex_messages'
  ) then
    alter publication supabase_realtime add table public.tilex_messages;
  end if;
end $$;

-- ============================================================================
-- NETTOYAGE AUTOMATIQUE (optionnel) — purge les pings/signaux vieux de 1 jour
-- ============================================================================
-- À brancher sur pg_cron si tu veux garder la table légère :
--   select cron.schedule('purge-tilex', '0 4 * * *',
--     $$ delete from public.tilex_messages
--        where type in ('ping','signal') and created_at < now() - interval '1 day' $$);

-- ============================================================================
-- FIN — toutes les tables ont RLS activé + politiques propriétaire.
-- 🍁 Produit du Québec
-- ============================================================================
