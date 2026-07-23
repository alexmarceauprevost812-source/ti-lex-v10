/* ============================================
   TI-LEX-AL v10
   Fichier   : sql/scan_mandats.sql
   Auteur    : Alex Marceau-Prévost
   Rôle      : Table des mandats/autorisations de scan.
               Preuve de propriété d'un domaine + mandat signé.
               Empêche tout scan non autorisé (art. 342.1 C.cr. Canada).
   ============================================ */

create table if not exists public.scan_mandats (
  id uuid primary key default gen_random_uuid(),
  user_email text not null,                                    -- qui demande
  domaine text not null,                                       -- ex: exemple.com
  methode_preuve text check (methode_preuve in ('dns_txt','fichier')),  -- 'dns_txt' ou 'fichier'
  code_verif text not null,                                    -- code unique généré
  verifie boolean not null default false,                      -- propriété confirmée?
  mandat_signe boolean not null default false,                 -- autorisation cochée?
  signe_le timestamptz,                                        -- date de signature
  ip_signature text,                                           -- IP au moment de signer
  created_at timestamptz not null default now()
);

-- Un seul mandat par (utilisateur, domaine)
create unique index if not exists scan_mandats_email_domaine_uidx
  on public.scan_mandats (user_email, domaine);

-- RLS : chaque utilisateur ne voit/modifie QUE ses lignes (courriel du JWT).
alter table public.scan_mandats enable row level security;

drop policy if exists "scan_mandats_own" on public.scan_mandats;
create policy "scan_mandats_own" on public.scan_mandats
  for all
  using ((auth.jwt() ->> 'email') = user_email)
  with check ((auth.jwt() ->> 'email') = user_email);

/* ============================================
   📋 POUR CLAUDE CODE :
   - Table déjà appliquée sur le projet Supabase Ti-lex_al.
   - RLS active : l'accès est filtré par le courriel du JWT.
   ============================================ */
