-- ============================================================================
-- tilexcode_schema.sql
-- Tables Supabase pour stocker les projets et fichiers générés dans tilexcode
-- Produit du Québec
--
-- À coller dans le SQL Editor de Supabase (projet rnuripmfozlxenryxhdc),
-- ou via une migration : supabase migration new tilexcode_schema
--
-- Convention ti-lex : RLS activé, policy auth.uid() = user_id
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Table des projets
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tilex_projects (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE CASCADE,
  nom         text NOT NULL,
  description text DEFAULT '',
  langage     text DEFAULT 'inconnu',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 2. Table des fichiers (liés à un projet)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tilex_files (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE CASCADE,
  project_id  uuid NOT NULL REFERENCES public.tilex_projects (id) ON DELETE CASCADE,
  chemin      text NOT NULL,
  contenu     text DEFAULT '',
  langage     text DEFAULT '',
  version     int  NOT NULL DEFAULT 1,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 3. Index pour les requêtes fréquentes
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_tilex_projects_user    ON public.tilex_projects (user_id);
CREATE INDEX IF NOT EXISTS idx_tilex_files_project     ON public.tilex_files (project_id);
CREATE INDEX IF NOT EXISTS idx_tilex_files_user        ON public.tilex_files (user_id);

-- ----------------------------------------------------------------------------
-- 4. Activation de la RLS
-- ----------------------------------------------------------------------------
ALTER TABLE public.tilex_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tilex_files    ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 5. Policies : chaque utilisateur ne voit/modifie que SES données
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS user_own_tilex_projects ON public.tilex_projects;
CREATE POLICY user_own_tilex_projects
  ON public.tilex_projects
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS user_own_tilex_files ON public.tilex_files;
CREATE POLICY user_own_tilex_files
  ON public.tilex_files
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- 6. Trigger pour tenir updated_at à jour sur les projets
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tilex_touch_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_tilex_projects_touch ON public.tilex_projects;
CREATE TRIGGER trg_tilex_projects_touch
  BEFORE UPDATE ON public.tilex_projects
  FOR EACH ROW EXECUTE FUNCTION public.tilex_touch_updated_at();

-- ----------------------------------------------------------------------------
-- 7. Journal d'audit + rate limiting (un row par passage d'agent)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tilex_agent_runs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE CASCADE,
  agent_id    text NOT NULL,
  input_chars int  NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tilex_runs_user_time
  ON public.tilex_agent_runs (user_id, created_at DESC);

ALTER TABLE public.tilex_agent_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_own_tilex_runs ON public.tilex_agent_runs;
CREATE POLICY user_own_tilex_runs
  ON public.tilex_agent_runs
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- 8. Couche LEURRE : journal des intrusions + jeu de données factices
-- ----------------------------------------------------------------------------

-- Journal des intrusions (écrit par le gardien via service_role).
CREATE TABLE IF NOT EXISTS public.tilex_intrusions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  raison     text,
  hote       text,
  chemin     text,
  canary     text,
  ua         text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tilex_intrusions_time
  ON public.tilex_intrusions (created_at DESC);
ALTER TABLE public.tilex_intrusions ENABLE ROW LEVEL SECURITY;
-- Aucune policy publique : seules les Edge Functions (service_role) écrivent,
-- et toi tu lis via le SQL Editor du dashboard. Default deny = max protection.

-- Données LEURRE servies aux intrus (faux mais plausibles).
CREATE TABLE IF NOT EXISTS public.tilex_leurre_data (
  id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titre   text NOT NULL,
  contenu text NOT NULL
);
ALTER TABLE public.tilex_leurre_data ENABLE ROW LEVEL SECURITY;
-- Lue seulement par le gardien (service_role). Pas de policy publique.

-- Quelques fausses lignes de départ (ajoutes-en autant que tu veux).
INSERT INTO public.tilex_leurre_data (titre, contenu) VALUES
  ('Projet Démo', 'Contenu de démonstration sans valeur. Données factices.'),
  ('Configuration', 'cle=valeur_bidon; mode=demo; actif=false'),
  ('Notes', 'Rien d''important ici. Ceci est un leurre.'),
  ('Archive', 'Fichier d''exemple généré automatiquement.')
ON CONFLICT DO NOTHING;
