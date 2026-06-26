CREATE TABLE IF NOT EXISTS tilex_memoire (
  id BIGSERIAL PRIMARY KEY,
  role TEXT NOT NULL,
  contenu TEXT NOT NULL,
  session_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_memoire_session ON tilex_memoire(session_id);

CREATE TABLE IF NOT EXISTS tilex_faits (
  id BIGSERIAL PRIMARY KEY,
  cle TEXT UNIQUE NOT NULL,
  valeur TEXT NOT NULL,
  contexte TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- zip_historique already exists from migration 0028, skip if present
CREATE TABLE IF NOT EXISTS zip_historique (
  id BIGSERIAL PRIMARY KEY,
  nom_projet TEXT NOT NULL,
  fichiers JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE tilex_memoire ENABLE ROW LEVEL SECURITY;
ALTER TABLE tilex_faits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users full access memoire"
  ON tilex_memoire FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users full access faits"
  ON tilex_faits FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
