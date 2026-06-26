-- =====================================================
-- TI-LEX CONFIG CENTRALE — Une source de vérité
-- =====================================================

CREATE TABLE IF NOT EXISTS public.tilex_config (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cle        TEXT NOT NULL,
  valeur     TEXT,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, cle)
);

ALTER TABLE public.tilex_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_own_config" ON public.tilex_config
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_tilex_config_user
  ON public.tilex_config(user_id, cle);
