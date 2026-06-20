-- Table pour sauvegarder les analyses INDAR par agent
CREATE TABLE IF NOT EXISTS indar_analyses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL,
  analyse TEXT NOT NULL,
  scan_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, agent_id)
);

ALTER TABLE indar_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_own_indar_analyses" ON indar_analyses
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
