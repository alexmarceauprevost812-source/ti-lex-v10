-- ─────────────────────────────────────────
-- Table : zip_historique
-- Historique des ZIPs téléchargés dans ti-lex
-- ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.zip_historique (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nom_projet   TEXT        NOT NULL DEFAULT 'sans-titre',
  nom_zip      TEXT        NOT NULL,
  nb_fichiers  INTEGER     NOT NULL DEFAULT 0,
  taille_bytes INTEGER     NOT NULL DEFAULT 0,
  structure    JSONB       NOT NULL DEFAULT '[]',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_zip_historique_user_date
  ON public.zip_historique (user_id, created_at DESC);

ALTER TABLE public.zip_historique ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Utilisateur voit son propre historique"
  ON public.zip_historique FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Utilisateur cree son propre historique"
  ON public.zip_historique FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Utilisateur supprime son propre historique"
  ON public.zip_historique FOR DELETE
  USING (auth.uid() = user_id);
