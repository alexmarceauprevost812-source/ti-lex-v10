-- ============================================================
-- sql/tilex_jobs.sql — Moteur multi-agents : file de jobs + sous-taches
-- ti-lex-AL v10 — PRIVE par utilisateur (RLS) + temps reel.
-- (Deja applique en prod : migration 0060_moteur_multi_agents_jobs)
-- ============================================================

create table if not exists public.tilex_jobs (
  id          bigint generated always as identity primary key,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  titre       text not null,
  statut      text not null default 'pending',   -- pending | en_cours | fini | erreur
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.tilex_tasks (
  id          bigint generated always as identity primary key,
  job_id      bigint not null references public.tilex_jobs(id) on delete cascade,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  agent       text not null,                      -- codeur | reviseur | testeur | gardien
  titre       text not null,
  ordre       int  not null default 0,
  statut      text not null default 'pending',    -- pending | en_cours | fini | erreur
  resultat    text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists tilex_jobs_user_idx on public.tilex_jobs (user_id, created_at desc);
create index if not exists tilex_tasks_job_idx  on public.tilex_tasks (job_id, ordre);

alter table public.tilex_jobs  enable row level security;
alter table public.tilex_tasks enable row level security;

drop policy if exists jobs_own on public.tilex_jobs;
create policy jobs_own on public.tilex_jobs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists tasks_own on public.tilex_tasks;
create policy tasks_own on public.tilex_tasks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Temps reel
alter publication supabase_realtime add table public.tilex_jobs;
alter publication supabase_realtime add table public.tilex_tasks;
