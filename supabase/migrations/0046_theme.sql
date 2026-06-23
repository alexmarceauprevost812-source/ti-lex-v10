-- ============================================================
-- ti-lex v10 — Thème : palette produit (admin) + thème user
-- ============================================================

-- 1. Palette PRODUIT (une seule ligne, gérée par l'admin)
create table if not exists public.app_theme (
  id          int primary key default 1,
  colors      jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  constraint single_row check (id = 1)
);

-- 2. Thème PERSO par user
create table if not exists public.user_settings (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  theme       jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

-- Valeurs produit par défaut
insert into public.app_theme (id, colors) values (1, jsonb_build_object(
  'agent-violet', '#C700E6',
  'agent-gold',   '#E6A400',
  'agent-red',    '#E60000',
  'agent-orange', '#FF7F27',
  'agent-green',  '#37E0A0',
  'agent-blue',   '#4A9EFF',
  'btn-bg',       '#FF7F27',
  'btn-fg',       '#0A0A0A'
)) on conflict (id) do nothing;

-- ---------- RLS ----------
alter table public.app_theme     enable row level security;
alter table public.user_settings enable row level security;

-- Palette produit : lecture pour tous authentifiés, écriture réservée admin (SQL Editor)
create policy "theme_read" on public.app_theme
  for select to authenticated using (true);

-- Thème user : chaque user lit/écrit le sien seulement
create policy "settings_own_read" on public.user_settings
  for select to authenticated using (auth.uid() = user_id);
create policy "settings_own_upsert" on public.user_settings
  for insert to authenticated with check (auth.uid() = user_id);
create policy "settings_own_update" on public.user_settings
  for update to authenticated using (auth.uid() = user_id);
