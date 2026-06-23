-- tilex_memoire: historique des messages par session
CREATE TABLE IF NOT EXISTS public.tilex_memoire (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  contenu TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tilex_memoire_session ON public.tilex_memoire(session_id);
CREATE INDEX IF NOT EXISTS idx_tilex_memoire_user ON public.tilex_memoire(user_id);

ALTER TABLE public.tilex_memoire ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own memoire"
  ON public.tilex_memoire FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- tilex_faits: faits persistants (clé-valeur) par utilisateur
CREATE TABLE IF NOT EXISTS public.tilex_faits (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  cle TEXT NOT NULL,
  valeur TEXT NOT NULL,
  contexte TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, cle)
);

CREATE INDEX IF NOT EXISTS idx_tilex_faits_user ON public.tilex_faits(user_id);

ALTER TABLE public.tilex_faits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own faits"
  ON public.tilex_faits FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
