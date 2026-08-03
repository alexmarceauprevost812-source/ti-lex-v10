-- ============================================================================
-- 0064_coword_renfort.sql
-- Coword — renfort multi-agents (jusqu'à 5 équipiers en parallèle)
-- Chaque tâche peut porter une CONSIGNE propre : le chantier précis confié à
-- cet équipier. Sans elle, tous les équipiers refaisaient le même travail.
-- Idempotent.
-- ============================================================================

alter table public.tilex_tasks
  add column if not exists consigne text,
  add column if not exists lot integer default 0;

comment on column public.tilex_tasks.consigne is
  'Chantier précis confié à cette tâche (renfort multi-agents). Vide = tâche standard du pipeline.';
comment on column public.tilex_tasks.lot is
  'Tâches d''un même lot = exécutables en parallèle. 0 = séquentiel.';

alter table public.tilex_jobs
  add column if not exists nb_agents integer default 1;

comment on column public.tilex_jobs.nb_agents is
  'Nombre d''équipiers demandés pour ce job (1 à 5).';
