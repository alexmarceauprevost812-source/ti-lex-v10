-- 0062_tilex_job_pieces.sql
-- Pièces jointes d'une job Coword : images, fichiers texte, contenu de zip.
-- Table séparée pour ne pas alourdir le temps réel des jobs/tâches.
-- RLS : chaque utilisateur ne voit que ses pièces.

create table if not exists public.tilex_job_pieces (
  id bigint generated always as identity primary key,
  job_id bigint not null references public.tilex_jobs(id) on delete cascade,
  user_id uuid not null default auth.uid(),
  nom text not null,
  type text not null default 'texte',   -- 'texte' | 'image'
  mime text,
  contenu text not null default '',      -- texte brut OU base64 (image)
  created_at timestamptz not null default now()
);

create index if not exists tilex_job_pieces_job_idx on public.tilex_job_pieces (job_id);

alter table public.tilex_job_pieces enable row level security;

drop policy if exists "pieces_own" on public.tilex_job_pieces;
create policy "pieces_own" on public.tilex_job_pieces
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
