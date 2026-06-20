ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS agent_name TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_conversations_agent
  ON public.conversations (user_id, agent_name, updated_at DESC);
