-- ti-lex v10 — Table agents + Agent Marceau avatar
-- Produit du Quebec

-- 1. Create agents table
CREATE TABLE IF NOT EXISTS public.agents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  avatar_url TEXT,
  color_accent TEXT DEFAULT '#ff7f27',
  is_active BOOLEAN DEFAULT true,
  owner_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Enable RLS
ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;

-- 3. Public read for active agents
CREATE POLICY "agents_public_read"
  ON public.agents FOR SELECT
  USING (is_active = true);

-- 4. Insert Agent Marceau with avatar
INSERT INTO public.agents (name, slug, description, avatar_url, color_accent, is_active)
VALUES (
  'Marceau',
  'agent-marceau',
  'Agent IA de Marceau — Dialogue multi-agents 4 phases. Produit du Quebec.',
  'https://rnuripmfozlxenryxhdc.supabase.co/storage/v1/object/public/agents-avatars/marceau-avatar.png',
  '#ff7f27',
  true
)
ON CONFLICT (slug) DO UPDATE
  SET avatar_url = EXCLUDED.avatar_url,
      description = EXCLUDED.description,
      updated_at = NOW();
