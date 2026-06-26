-- Migration: user_adaptive_profiles table for Adaptive Chat Engine
-- Already applied to production via Supabase MCP

CREATE TABLE IF NOT EXISTS public.user_adaptive_profiles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_name TEXT NOT NULL DEFAULT 'ti-lex-AL',
  profile_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, agent_name)
);

ALTER TABLE public.user_adaptive_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own profiles"
  ON public.user_adaptive_profiles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own profiles"
  ON public.user_adaptive_profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own profiles"
  ON public.user_adaptive_profiles FOR UPDATE
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_uap_user_agent
  ON public.user_adaptive_profiles(user_id, agent_name);

CREATE INDEX IF NOT EXISTS idx_uap_profile_data
  ON public.user_adaptive_profiles USING gin(profile_data);

CREATE OR REPLACE FUNCTION update_uap_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_uap_updated_at
  BEFORE UPDATE ON public.user_adaptive_profiles
  FOR EACH ROW EXECUTE FUNCTION update_uap_updated_at();
