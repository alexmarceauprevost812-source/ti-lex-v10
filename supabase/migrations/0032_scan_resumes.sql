CREATE TABLE IF NOT EXISTS scan_resumes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  resume JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE scan_resumes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_own_resumes" ON scan_resumes
  FOR ALL USING (auth.uid() = user_id);
