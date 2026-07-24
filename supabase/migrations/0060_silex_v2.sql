-- ============================================================================
-- 0060_silex_v2.sql — SILEX v2 « LEVEL MAX » (ti-lex-v10)
-- Tables de persistance des rapports de scan défensif + liste de surveillance.
-- 100% défensif/passif : aucune donnée offensive n'est stockée ici.
-- ============================================================================

-- ─── Table des rapports SILEX v2 ────────────────────────────────────────────
create table if not exists public.silex_reports (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  scan_id       uuid null,                 -- lien vers security_scans (compat UI)
  target        text not null,             -- cible scannée (domaine ou IPv4 publique)
  mode          text not null check (mode in ('scan_complet', 'scan_rapide')),
  score         int check (score between 0 and 100),
  grade         text,                      -- A / B / C / D / E / F
  risk_level    text,                      -- CRITIQUE 🔴 / ÉLEVÉ 🟠 / MODÉRÉ 🟡 / FAIBLE 🔵 / MINIMAL ⚪
  findings      jsonb not null default '[]'::jsonb,
  modules       jsonb not null default '{}'::jsonb,  -- statut par module (ok/erreur + nb findings)
  diff          jsonb not null default '{}'::jsonb,  -- nouveaux / resolus / persistants / verdict
  summary       text,                      -- résumé exécutif (IA ou gabarit déterministe)
  duration_ms   int,
  created_at    timestamptz not null default now()
);

-- RLS : chaque utilisateur ne voit/crée que ses propres rapports.
alter table public.silex_reports enable row level security;

drop policy if exists silex_reports_select_own on public.silex_reports;
create policy silex_reports_select_own on public.silex_reports
  for select using (auth.uid() = user_id);

drop policy if exists silex_reports_insert_own on public.silex_reports;
create policy silex_reports_insert_own on public.silex_reports
  for insert with check (auth.uid() = user_id);

-- Index de recherche : rapports d'un utilisateur pour une cible, plus récents d'abord.
create index if not exists silex_reports_user_target_created_idx
  on public.silex_reports (user_id, target, created_at desc);

-- ─── Liste de surveillance (scans planifiés futurs) ─────────────────────────
create table if not exists public.silex_watchlist (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users (id) on delete cascade,
  target              text not null,
  frequence           text not null default 'quotidien' check (frequence in ('quotidien', 'hebdo')),
  actif               boolean not null default true,
  dernier_scan_id     uuid null,
  derniere_alerte_at  timestamptz null,
  created_at          timestamptz not null default now(),
  unique (user_id, target)
);

-- RLS : chaque utilisateur gère uniquement sa propre liste de surveillance.
alter table public.silex_watchlist enable row level security;

drop policy if exists silex_watchlist_select_own on public.silex_watchlist;
create policy silex_watchlist_select_own on public.silex_watchlist
  for select using (auth.uid() = user_id);

drop policy if exists silex_watchlist_insert_own on public.silex_watchlist;
create policy silex_watchlist_insert_own on public.silex_watchlist
  for insert with check (auth.uid() = user_id);

drop policy if exists silex_watchlist_update_own on public.silex_watchlist;
create policy silex_watchlist_update_own on public.silex_watchlist
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists silex_watchlist_delete_own on public.silex_watchlist;
create policy silex_watchlist_delete_own on public.silex_watchlist
  for delete using (auth.uid() = user_id);

-- Index : liste des cibles surveillées d'un utilisateur.
create index if not exists silex_watchlist_user_idx
  on public.silex_watchlist (user_id, created_at desc);
