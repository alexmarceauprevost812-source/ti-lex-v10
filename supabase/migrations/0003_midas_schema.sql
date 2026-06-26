-- ============================================================
-- MIDAS — Schéma SQL · ti-lex-AL v10 ⚜️
-- ------------------------------------------------------------
-- Idempotent (réexécutable sans danger). RLS activée partout,
-- même politique que indar_analyses (auth.uid() = user_id).
-- L'agent réutilise indar_analyses pour les analyses Claude ;
-- ces tables-ci gèrent watchlist, alertes et historique de signaux.
-- ============================================================

-- ---------- 1) Watchlist : actifs surveillés par l'utilisateur ----------
create table if not exists public.midas_watchlist (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  type_actif      text not null check (type_actif in ('crypto','action')),
  symbole         text not null,
  libelle         text,
  seuil_chute_pct numeric default -5,
  actif           boolean default true,
  created_at      timestamptz default now(),
  unique (user_id, type_actif, symbole)
);

alter table public.midas_watchlist enable row level security;

drop policy if exists midas_watchlist_owner on public.midas_watchlist;
create policy midas_watchlist_owner on public.midas_watchlist
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------- 2) Alertes : chutes rapides détectées ----------
create table if not exists public.midas_alertes (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  type_actif    text not null check (type_actif in ('crypto','action')),
  symbole       text not null,
  type_alerte   text not null,        -- chute_1h, chute_24h, anomalie_zscore, chute_inter_scan...
  gravite       text default 'moyenne',
  prix          numeric,
  variation_pct numeric,
  message       text,
  vue           boolean default false,
  created_at    timestamptz default now()
);

alter table public.midas_alertes enable row level security;

drop policy if exists midas_alertes_owner on public.midas_alertes;
create policy midas_alertes_owner on public.midas_alertes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists midas_alertes_user_date
  on public.midas_alertes (user_id, created_at desc);

-- ---------- 3) Signaux : historique des verdicts de scoring ----------
create table if not exists public.midas_signaux (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  type_actif  text not null check (type_actif in ('crypto','action')),
  symbole     text not null,
  prix        numeric,
  score       integer,               -- -100..+100
  verdict     text,                  -- ACCUMULATION/HAUSSIER/NEUTRE/BAISSIER/DISTRIBUTION
  confluence  integer,               -- 0..100
  rsi         numeric,
  macd_hist   numeric,
  created_at  timestamptz default now()
);

alter table public.midas_signaux enable row level security;

drop policy if exists midas_signaux_owner on public.midas_signaux;
create policy midas_signaux_owner on public.midas_signaux
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists midas_signaux_user_symbole
  on public.midas_signaux (user_id, symbole, created_at desc);

-- ============================================================
-- VÉRIFICATION (optionnel — à lancer après) :
--   select tablename, rowsecurity from pg_tables
--   where schemaname='public' and tablename like 'midas_%';
-- ============================================================
