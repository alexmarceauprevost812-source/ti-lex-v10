-- =====================================================
-- TI-LEX-AL : Agent Central Autonome — Sessions + logs
-- =====================================================

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS project_context   JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS pending_files     JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS last_commit_sha   TEXT;

CREATE INDEX IF NOT EXISTS idx_conv_project
  ON public.conversations((project_context IS NOT NULL), user_id, updated_at DESC);

-- =====================================================
-- Log des actions AL (audit trail)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.al_actions_log (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  conv_id      UUID,
  action_type  TEXT NOT NULL,
  action_input JSONB DEFAULT '{}',
  action_result JSONB DEFAULT '{}',
  duration_ms  INTEGER,
  status       TEXT DEFAULT 'success',
  error_detail TEXT,
  created_at   TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.al_actions_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_own_logs" ON public.al_actions_log
  FOR ALL USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_al_actions_user
  ON public.al_actions_log(user_id, created_at DESC);
