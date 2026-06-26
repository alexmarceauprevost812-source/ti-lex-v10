CREATE TABLE IF NOT EXISTS public.security_logs (
  id                UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id           UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  session_id        TEXT,
  violation_type    TEXT        NOT NULL,
  violation_category TEXT       NOT NULL,
  severity          TEXT        NOT NULL DEFAULT 'medium',
  original_input    TEXT,
  trigger_pattern   TEXT,
  blocked_at        TIMESTAMPTZ DEFAULT NOW(),
  ip_address        TEXT,
  user_agent        TEXT
);

CREATE INDEX idx_security_logs_user_id ON public.security_logs(user_id);
CREATE INDEX idx_security_logs_blocked_at ON public.security_logs(blocked_at DESC);
CREATE INDEX idx_security_logs_violation_type ON public.security_logs(violation_type);

ALTER TABLE public.security_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read security logs"
  ON public.security_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

CREATE POLICY "Service role can insert logs"
  ON public.security_logs
  FOR INSERT
  WITH CHECK (true);
